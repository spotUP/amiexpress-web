---
date: 2026-05-18
topic: sqlite-disk-parity-audit
tags: [doors, sqlite, user-data, audit, ports]
status: confdb-resolved
updated: 2026-05-19
---

# SQLite ↔ disk parity audit — users table

## RESOLUTION (2026-05-19 re-audit)

**Users table parity is already solved at the repository layer.**

`userRepository.updateUser()` at `web/backend/src/database/user-repository.ts:235-279`
includes a centralized post-write hook that re-reads the user and calls
`userFileManager.updateUserDataFile(user, slotNumber)` after every
SQL commit. This was added 2026-01-04 in `ad3f77d5d` (months before the
initial audit). The original audit missed it because its grep looked
~30 lines forward from each `db.updateUser` *call site*, not at the
repository method definition.

Every site that goes through `db.updateUser()` therefore syncs to disk
automatically. That covers all 36 "unpaired" sites flagged by the
re-run script — `info-commands.handler.ts` (22 hits), `account.handler.ts`,
`auth.handler.ts`, `gdpr.handler.ts`, `olm.handler.ts`, `preference-*`,
`arexx.service.ts`, etc.

### Raw `UPDATE users` SQL sites that bypass `db.updateUser()`

| Site | Field(s) | Amiga equivalent | Disk sync | Verdict |
|---|---|---|---|---|
| `database.ts:446` | `slotnumber` (backfill) | n/a — users without slot have no binary record | — | **SAFE to skip** |
| `initialization.ts:671` | `confaccess` (startup migration expanding past short strings) | binary `confyes1/2` (10 CHAR ceiling) | none | **LOW IMPACT** — one-shot at boot; only affects ≤10-conf installs; gets re-synced on next user-record write |
| `file-socket-handlers.ts:590, 602` | uploads/bytesupload/topuploadcps | binary user.keys | **paired at :625** | OK |
| `file-socket-handlers.ts:1025` | topdownloadcps | binary user.keys | **paired at :1036** | OK |
| `file-socket-handlers.ts:1120` | downloads/bytesdownload | binary user.keys | **paired at :1143** | OK |
| `chat-commands.handler.ts:247` | `availableForChat` | web-only | — | **SAFE** |

### Recommended follow-up

Only one real gap remains:
- `initialization.ts:671` — confaccess migration writes SQL only.
  Either (a) call `userFileManager.updateUserDataFile()` per-user in
  the migration transaction, or (b) trigger a bulk
  `regenerate-user-files.ts` after the migration completes. Low priority
  since the per-user record gets re-synced on next login or DB write.

## ORIGINAL AUDIT — kept for context

Initial pass. Methodology: grep every `db.updateUser` and
`db.run UPDATE users` call site; flag any that doesn't have a
nearby `userFileManager.updateUserDataFile` call.

(Findings below are SUPERSEDED by the 2026-05-19 resolution above. The
per-callsite "needs sync" verdicts were wrong — the repository-level
hook already covers them.)

### 1. `preference-socket-handlers.ts:43` — `fontPreference`
Web-only field, no Amiga equivalent. **SKIP** — leave SQLite-only.

### 2. `regenerate-user-files.ts:29` — `slotNumber`
Inside the regen script itself, which writes disk just before. **SAFE.**

### 3. `preference-chat-commands.handler.ts:70` — `ansi` toggle
Goes through `db.updateUser()` → repo-hook syncs. **OK.**

### 4. `preference-chat-commands.handler.ts:109` — `expert` toggle
Goes through `db.updateUser()` → repo-hook syncs. **OK.**

### 5. `olm.handler.ts:389` — `blockOLM`
Goes through `db.updateUser()` → repo-hook syncs. **OK.**

### 6-10
All go through `db.updateUser()` → repo-hook syncs. **OK.**

## Other state classes — 2026-05-19 pass

| Table / state | DB writes | Disk equivalent | Audit status |
|---|---|---|---|
| `messages` | `db.createMessage` (4 sites) + `updateMessage` + `deleteMessage` + `moveMessage` | per-conf MSGS files + HeaderFile + A&lt;N&gt; attachment lists | **SOLVED** — repo-level sync in `message-repository.ts`: create writes .msg+HeaderFile (or skips when caller already did, line 52), update re-writes both, delete tombstones header status='D' + unlinks .msg/A&lt;N&gt;, move acquires dest lock + writes dest + tombstones src. express.e parity comments throughout. |
| `file_entries` | `db.createFileEntry` / `db.updateFileEntry` | FILES.BBS + DIRn | PARTIALLY DONE — upload path pairs DIRn write, but `db.updateFileEntry` (download count) doesn't write disk because the DIR format doesn't track per-file download counts. Acceptable. |
| **Message pointers** | `updateReadPointer` / `updateScanPointer` in `message-pointers.util.ts:321/346` + `message-repository.ts:465` | `<conf>/Conf.DB` (74-byte confBase records indexed by slot-1, express.e:4855 saveConfDB) | **RESOLVED 2026-05-19** — `MessagePointerFileManager` (`web/backend/src/services/MessagePointerFileManager.ts`) does read-modify-write on the matching record, preserving other fields. Hooked into both updateReadPointer/updateScanPointer in `message-pointers.util.ts` and `message-repository.ts:465`. Best-effort sync (SQL is system of record). 8 regression tests in `tests/services/message-pointer-file-manager.test.ts` (struct size, round-trip, both pointer writes, field-preservation, slot validation). |
| `conferences` | `db.updateConference` | Conf.DB | **SOLVED** — `conference-repository.ts:153-193` pairs `conferenceFileManager.updateConferenceFile()` after SQL commit, slot derived from `getConferences()` index. |
| `caller_activity` / callersLog | `callersLog()` SQL only @ `database-helpers.ts:20` | BBS:Node{X}/CallersLog written by `callersLogManager.*` | **BIFURCATED BY DESIGN** — two independent loggers. Web UI's recent-activity widget reads SQLite; disk file is for express.e parity. Call sites have to invoke both (most do; spot-check shows door.handler, login-post, file ops do; conference.handler:308 calls SQL only, file.handler:229/360 SQL only). Action: standardize call sites to call both, OR introduce a single `logCallerActivity(...)` that writes both. |
| File flags | per-user `Partdownload/flagged{slot}` + dump file | same | **SOLVED** — `file-flag.util.ts` is disk-first (no SQLite). express.e parity via load/save. |
| OLMs | `sendOnlineMessage` / `markMessage*` in message-repository.ts:480+ | OLMs disk file (per-user) | **GAP, LOW PRIORITY** — SQLite-only. 68K doors that exchange OLMs via disk would not see web-sent OLMs and vice versa. Most doors don't touch OLM. Defer until a door needs it. |
| Chat rooms / sessions | many | (web-only, no Amiga) | SKIP |
| Webhooks | varies | (web-only) | SKIP |
| Votes | `vote_topics`/`vote_questions`/`vote_answers`/`vote_results` tables, SQL only @ `database-helpers.ts:518-617` | `<conf>/Vote/Vote{NN}.def` per topic (express.e:21028 showVoteStats) | **GAP, LOW PRIORITY** — votes used by express.e BBS core (V command) and are SQLite-only on web. No 68K doors known to read Vote*.def. Defer. |

### Concrete gap #1 — message pointers (ConfDB)

**express.e reference**:
- `saveConfDB(account, confNum, msgBase, addr, force)` — express.e:4855
- `loadConfDB(account, confNum, msgBase, addr, force)` — express.e:4819
- `getConfDbFileName(confNum, msgBaseNum, out)` — express.e:2102 → `<confLoc>/ConfDB` (or per-msgbase if multi-base, with `CONFDB_SHARED` tooltype override)
- File layout: array of `confBase` records, indexed by `(account-1) * SIZEOF confBase`. Fields include `confYM` (last-msg-read), `confRead` (last-new-scanned), `bytesDownload`/`bytesUpload`, `messagesPosted`, `newSinceDate`, ratio fields.

**Web reference**:
- `web/backend/src/utils/message-pointers.util.ts:321` `updateReadPointer()` — SQL only
- `web/backend/src/utils/message-pointers.util.ts:346` `updateScanPointer()` — SQL only
- `web/backend/src/database/message-repository.ts:465` `updateReadPointer()` (duplicate, also SQL only)

**Recommended fix**: write a `ConfDBFileManager` service that serializes a confBase struct, then add disk sync to both updateReadPointer / updateScanPointer (or to `db.updateUserConfBase()` if such a centralized point is added). Plus a migration helper to backfill ConfDB from the SQLite conf_base table.

## Strategic recommendation (validated)

The "centralize sync via a repository hook" pattern already exists for
the users table and works correctly. Apply the same pattern to the
remaining state classes:

- `messageRepository.create/updateMessage()` → pair with
  per-conference MSGS writer
- `conferenceRepository.updateConference()` → pair with ConfConfig.info writer
- etc.

This eliminates entire bug classes instead of patching each call site.

## Re-run the audit

```
cd /Users/spot/Code/amiexpress-web
# Note: this script reports false positives — see RESOLUTION above.
# Every "UNPAIRED" db.updateUser hit is actually paired via the
# repository hook at user-repository.ts:260-278.
for f in $(grep -rln "db\\.run.*UPDATE users\\|db\\.updateUser\\b" web/backend/src --include="*.ts" | grep -v test); do
  while IFS=: read line _; do
    near=$(awk -v target="$line" 'NR>=target-3 && NR<=target+30' "$f" | grep -c "updateUserDataFile\\|userFileManager")
    [ "$near" = "0" ] && echo "UNPAIRED: $f:$line"
  done < <(grep -n "db\\.run.*UPDATE users\\|db\\.updateUser\\b" "$f")
done

# More accurate: check raw UPDATE users SQL (bypasses the repo hook)
grep -rn "UPDATE users\\b" web/backend/src --include="*.ts" | grep -v test
```
