---
date: 2026-05-18
topic: sqlite-disk-parity-audit
tags: [doors, sqlite, user-data, audit, ports]
status: in-progress
---

# SQLite ↔ disk parity audit — users table

Initial pass. Methodology: grep every `db.updateUser` and
`db.run UPDATE users` call site; flag any that doesn't have a
nearby `userFileManager.updateUserDataFile` call.

## Properly-paired (already sync to disk) — no action needed

- `web/backend/src/server/file-socket-handlers.ts:1141-1154` —
  download stats: paired with `userFileManager.updateUserDataFile`
  immediately after the DB write.
- `web/backend/src/server/socket-handlers.ts:1157` — `userFileManager.updateUserDataFile` site (verified)
- `web/backend/src/server/auth-socket-handlers.ts:522` — login user sync
- `web/backend/src/database/user-repository.ts:264` — repository-level sync after update
- `web/backend/src/handlers/file/download.handler.ts:856` — download handler sync
- `web/backend/src/server/file-socket-handlers.ts:625, 1036, 1143` — upload paths sync

## UNPAIRED — write to DB only, 68K doors see stale disk

Each of these writes to SQLite without writing the corresponding binary
record. 68K doors that read these fields from user.data/user.keys/user.misc
will see stale data:

### 1. `preference-socket-handlers.ts:43` — `fontPreference`
Web-only field, no Amiga equivalent. **SKIP** — leave SQLite-only.

### 2. `regenerate-user-files.ts:29` — `slotNumber`
Inside the regen script itself, which writes disk just before. **SAFE.**

### 3. `preference-chat-commands.handler.ts:70` — `ansi` toggle
`ansi` lives in the Amiga user struct (line ~73 of UserFileManager:
`lineLength: number; // CHAR`... actually scanning, there's no field
called `ansi` in the binary struct — possibly mapped to one of the
other CHAR fields). Needs verification + sync if Amiga has it.

### 4. `preference-chat-commands.handler.ts:109` — `expert` toggle
Amiga user struct DOES have `expert: number; // CHAR (1 byte)` at
`UserFileManager.ts:58`. **NEEDS SYNC.** Add updateUserDataFile call.

### 5. `olm.handler.ts:389` — `blockOLM` (Quiet mode toggle)
Amiga user struct has equivalent at one of the CHAR fields. **NEEDS SYNC.**

### 6. `batch-download.handler.ts:286` — batch download user stats
Likely already syncs nearby; **needs deeper look** (the audit script
only checked 30 lines forward).

### 7. `account.handler.ts:399` — `secLevel` change (sysop edits user)
Amiga user struct has `secStatus` (= secLevel). **NEEDS SYNC** —
critical because XIM doors filter access by secLevel.

### 8. `account.handler.ts:482` — `expert` + `ansi`
Both have Amiga equivalents. **NEEDS SYNC.**

### 9. `auth.handler.ts:69` — login user record update
Updates `lastCallerDate` / `timeUsed`. Amiga `user.data` has both
(`timeLastOn`, `timeUsed`). **NEEDS SYNC** — most-recent stats matter.

### 10. `gdpr.handler.ts:273` — GDPR erasure
Wipes user. Should also wipe binary record. **NEEDS SYNC** —
compliance issue if disk record retains data after DB deletion.

## Other state classes (not yet audited)

| Table / state | DB writes | Disk equivalent | Audit status |
|---|---|---|---|
| `messages` | `db.createMessage` (4 sites) | per-conf MSGS files | TODO |
| `file_entries` | `db.createFileEntry` / `db.updateFileEntry` | FILES.BBS + DIRn | PARTIALLY DONE — upload path pairs DIRn write, but `db.updateFileEntry` (download count) doesn't write disk because the DIR format doesn't track per-file download counts. Acceptable. |
| `conferences` | `db.updateConference` | ConfConfig.info | TODO |
| `caller_activity` / callersLog | varies | CallersLog disk | TODO |
| File flags | varies | Flag.x.N | TODO |
| Message pointers | varies | user-N.last | TODO |
| OLMs | varies | OLMs disk | TODO |
| Chat rooms / sessions | many | (web-only, no Amiga) | SKIP |
| Webhooks | varies | (web-only) | SKIP |
| Votes | varies | VoteStats / Vote.info | TODO |

## Strategic recommendation

**Centralize the sync.** Add a hook to `db.updateUser()` (and the few
direct `db.run('UPDATE users ...')` sites) that ALWAYS calls
`userFileManager.updateUserDataFile()` after the SQL commit. The
fields are known and finite — UserFileManager already serializes them
all into the 232-byte record.

Same shape for messages and other state classes once `db.create*()` /
`db.update*()` have a paired disk-write helper.

This eliminates the entire bug class instead of patching each call
site.

## Re-run the audit

```
cd /Users/spot/Code/amiexpress-web
for f in $(grep -rln "db\\.run.*UPDATE users\\|db\\.updateUser\\b" web/backend/src --include="*.ts" | grep -v test); do
  while IFS=: read line _; do
    near=$(awk -v target="$line" 'NR>=target-3 && NR<=target+30' "$f" | grep -c "updateUserDataFile\\|userFileManager")
    [ "$near" = "0" ] && echo "UNPAIRED: $f:$line"
  done < <(grep -n "db\\.run.*UPDATE users\\|db\\.updateUser\\b" "$f")
done
```
