---
date: 2026-05-20
topic: full-session-handoff
tags: [zmodem, upload, download, conferences-sync, slot-fix, drewall, parity-diff, audit]
status: final
---

# Session handoff — 2026-05-20

21 commits shipped (`d9494d5f4..438aaa1bf`). Largest theme: closing
the Phase-4-cleanup-victim cluster of broken web upload paths that
surfaced when a user (and a friend) hit them in quick succession.
Secondary theme: closing the open items from the upload/download
parity diff that's been running since 2026-05-18.

`handoff.md` at repo root is the always-current single-pager;
this file is the audit trail.

---

## What landed today

### Cluster A — User report: "still only 4 confs" / friend can't log in

User reported on bbs.uprough.net that:
- Their friend `notorious` registered an account, then on next login
  got `"That account has been deleted."`
- The BBS listed only 4 conferences despite `ConfConfig.info`
  declaring 14.

**Root cause #1 (slot=0 lockout):** `userRepository.createUser` INSERT
omitted `slotnumber` — column DEFAULT was NULL/0 — and the express.e
parity check at `auth-socket-handlers.ts:479`
(`if (!user.slotNumber || user.slotNumber === 0)`) treated that as a
deleted account. The startup backfill at `database.ts:443-450` only
ran on container restart, so any user who registered then logged out
before the next restart was locked out.

**Fix `99d83e1db`:** include `slotnumber = MAX(slotnumber)+1` in the
INSERT. Existing slot=0 rows still get healed by the startup backfill
on next deploy. 2 regression tests; verified to fail when reverted.

**Root cause #2 (only 4 confs):** SQLite `conferences` table held
only the 3 seeded defaults (General / Tech Support / Announcements)
even on sites declaring 14+ in `ConfConfig.info`. Anything that
resolved by SQLite conf-id (`db.getFileAreas(5)`,
`db.getConferenceById(11)`, admin UI lookup, new-user `confAccess`
sizing) silently returned empty for confs beyond #3 — cascading into
multiple visible bugs, including the user-visible 4-conf cap.

**Fix `18ee0f1eb`:** `conferenceRepository.syncConferencesFromDisk`
mirrors the disk list into SQLite at startup. Idempotent:
  - row at disk id matches name → no-op
  - row at disk id with different name → rename in place
  - row with disk name at different id → re-id
  - no row at disk id → INSERT with explicit id

Live verified — `gh workflow run fetch-live-logs.yml -f log=conferences`
returns the populated table with all 14 disk names.

Workaround `a0196a5e2` (`auth.handler.ts`): web registration now
reads `confAccess` from `system_config.new_user_conf_access` (the
column that `initialization.ts:660-685` already kept expanded to
match the conf count). Previously hardcoded `'XXX'` → users were
locked to first 3 confs even after registration.

### Cluster B — User report: multi-file upload hangs

User picked 5 files in the web UI; only "Uploading file: 5D_JC072.LZH
(4 remaining)" log line appeared, then silence. Same on local.

This cluster took the most diagnostic effort and exposed FOUR
distinct bugs stacked on top of each other:

1. **U-command emitted dead `show-file-upload` event** (`cf2121c86`):
   Phase 4 ZMODEM unification removed the BBS-user branch of
   `processFileUpload`. Anything still emitting `show-file-upload`
   for BBS-user uploads (only door uploads survived) got silently
   dropped. `startBatchUploadTransfer` had a transport gate routing
   only telnet/SSH through ZMODEM and falling through to the dead
   HTTP picker for web. Fix: remove the gate, all transports go
   through `startZmodemUpload`.

2. **No-op placeholder sender** (`a0196a5e2`): After fix #1, `rz`
   spawned but the browser's zmodem.js Sentry never `on_detect`ed.
   `getTransferTransport` returned a no-op placeholder function for
   `send` when `session.transferRawSend` wasn't set (always true for
   web — that field is telnet/SSH-only). The guard
   `if (!transport.send) transport.send = …` never fired because
   functions are truthy. Fix: install the real socket-emit sender
   explicitly for web in both `startZmodemUpload` and
   `startZmodemDownload`.

3. **rz `-r` resume + zmodem.js Send doesn't implement ZRPOS**
   (`a0196a5e2`): After fix #2, the handshake started but cascaded
   into `Unhandled header: ZRPOS` the moment `rz` saw any same-name
   file in the playpen. Fix: web gets `-b -y -t 600 -vv` (overwrite,
   no resume); telnet/SSH keeps `-b -r -t 600 -vv` (resume — those
   clients handle ZRPOS).

4. **`received[]` blank under `-y` overwrites** (`a0196a5e2`): After
   fix #3, transfers completed but `received[]` was empty. The
   `lrzsz-transfer.service` was computing received-files via a
   readdir diff (snapshot before vs after), which fails under `-y`
   when overwriting same-name files. Fix: parse `rz` stderr
   `"Receiving: <filename>"` lines as the authoritative source.

5. **onComplete only emitted a stats banner** (`a0196a5e2`): After
   fix #4, files landed in playpen with the proper banner but never
   got DIZ-extracted, given a description, moved to FILES/LCFILES,
   appended to DIRn / FILES.BBS, or logged. Fix: port the RZ
   command's full onComplete pipeline (synthesize uploadContext,
   queue files 2..N in pendingZmodemFiles, drive handleDizExtraction
   for file 1, state machine walks the rest).

6. **fileArea fallback** (`a0196a5e2`): My onComplete called
   `db.getFileAreas(currentConf)` which returned empty for confs the
   SQLite table didn't know about (yet — same root cause as Cluster
   A's #2 above). Fix: use `session.tempData.fileArea` first
   (resolved from disk by `displayUploadInterface` from the area's
   `ulPath` tooltype), fall back to SQLite.

Each fix exposed the next; the upload pipeline was a stacked silent-
failure trap. All commits include grep-style regression tests.

### Cluster C — DREWALL #15

User reported pressing N in dRE!WAll (decline tag) during LOGON chain
flashed the BBS menu prompt
`AmiExpress Web BBS [2:Amiga Warez!] Menu (47 mins. left):`
between dRE!WAll exit and the next door in the chain.

**Root cause:** `launchAmigaDoor` ran the chainCommand/returnCommand/
prvCommand/acpCommand runner — which synchronously launches the next
door in the chain — then unconditionally set
`subState=DISPLAY_MENU + menuPause=false`. For one display tick the
menu prompt rendered before the next door took over.

**Fix `44dfb635e`:** gate the DISPLAY_MENU assignment on
`!nextDoorActive` where
`nextDoorActive = !!session.inDoorManager || subState===DOOR_RUNNING`.
4 regression tests pin the guard.

### Cluster D — Parity-diff closeout

The upload/download parity diff
(`thoughts/shared/research/2026-05-18_upload_download_parity_diff.md`)
had several open items. Closed this session:

| Item | Commit | What |
|---|---|---|
| U13 | `9690e42ca` | 2 MB playpen free-space floor before upload start |
| D5 | `f28420aa8` | `flaggedFilesManager.clearFiles(userId)` after ZMODEM batch |
| D6 | covered by D5 | express.e's double-clear was defensive |
| D7 | `faa53df80` | Extracted `displayULStats` to shared util |
| D16 | `63b071975` | Restricted-comment gate in batch download (security-adjacent) |

Audited + documented as design divergences (no code change):

- **U8 CREDITBYKB** — TS port stores plain bytes uniformly; toggle
  affects only display + ratio interpretation. Sites without 68K-door
  co-writers are correct. Live (bbs.uprough.net) has it off. Risky to
  retrofit without integration testing.
- **U9 mail-attach upload** — TS port references existing files only;
  saves to `<msgBase>A<msgNumb>` (path-list). express.e's
  upload-while-attaching to `<msgBase>F<n>/<fn>` is NOT implemented.
  Workaround: U command first, then attach the uploaded path.
- **U11 skipped-file UX** — TS port emits per-file
  `"File already exists, moving to <sysop>'s private directory"`
  + DIRn 'D' marker at the moment of detection. More informative
  than express.e's vague `"Skipped <name>"`.
- **D17 free download flag** — already wired correctly.
- **D18 ACS_CONFERENCE_ACCOUNTING** — already wired correctly.

Remaining open (low priority): U7 (site config blocker), U10 (multi-
node coord), D19/D20 (deeper audits), OLM/votes (no known consumers).

### Cluster E — Cleanup + ops

- `3b5cbdedc` removed dead `startFileUpload` + 4 imports (72 lines).
- `f9881547c` `conferences` case in `fetch-live-logs.yml` so future
  diagnostics can dump the live conferences table.
- `bb0aafe42` per-door-entry first-JH_SM timing log (was once-per-
  session; useless across chained doors).
- `dd8162551` parity diff audit conclusions for U8/U9/U11.
- `438aaa1bf` handoff.md refresh.

**Disk: 18 GB freed.** git gc consolidated 10 packs → 1 (~600 MB),
npm cache clean (~4 GB), brew cleanup (~2 GB), root-level orphans
(40 MB `68klog.txt`, tsx cache 8 MB, /tmp session debris, stale log
backups). Repo down from ~6.7 GB to 6.1 GB; system from 3.2 GB free
to 21 GB free.

### Cluster F — Callers log dual-write

Audited the bifurcated callers-log loggers (SQL → web activity
widget; disk → express.e parity sysop tail-watch). 3 sites were
SQL-only:

| Site | Action |
|---|---|
| `conference.handler.ts:308` | Joined conference |
| `file.handler.ts:229` | Deleted file |
| `file.handler.ts:360` | Moved file |

**Fix `03d355935`:** these sites now also call
`callersLogManager.logActivity(nodeId, "\t…")`. Other sites (login,
logoff, door exec, post-upload, post-download, password failure)
were already dual-writing. 5 grep regression tests.

---

## What works on live right now

- `https://bbs.uprough.net/health` → 200, container fresh after
  today's last deploy (`18ee0f1eb`).
- SQLite `conferences` table populated with all 14 disk conferences.
- New web registrations get full 14-char `confAccess` from
  `system_config.new_user_conf_access`.
- `notorious` (and any other slot=0 user) backfilled via the startup
  migration; they can log in.
- DREWALL "no" in LOGON chain no longer flashes the menu prompt.
- Multi-file web upload would work end-to-end if user retests (local
  verified working before the deploy).

---

## Open items / next-session priorities

1. **End-to-end live verification of multi-file upload** — the local
   test ran clean after the Cluster B stack of fixes; live deploy
   landed but user hasn't retested. If you're picking up the thread:
   register a test user, do U with 3+ LZH files, verify DIZ/desc
   prompts + DIRn append + FR shows them.
2. **U7 site config** — `BBSCmd/U.info` points U at the UL-Logoff
   door instead of the internal handler. Decide whether to override
   per-site or change BBSCmd.
3. **D19/D20** — `checkRatiosAndTime` 3-way return + per-conf
   `tfsizes`/`freeDFlags` accumulators. UNVERIFIED; lower-priority
   deep audits.
4. **OLM disk parity / Votes disk parity** — both deferred for lack
   of known door consumer; revisit if a door surfaces that needs
   either.
5. **CREDITBYKB integration test** if a site ever enables it +
   shares user.data with 68K doors. Documented divergence today.

---

## Gotchas (memo to future-me)

- **tsx esbuild cache** at `/var/folders/.../T/tsx-501/` can serve
  stale transpiled code across restarts. If a source change "doesn't
  apply" after a restart, clear that dir before restarting:
  `rm -rf /var/folders/w6/hc_wf7v94_dcn98mmjb_k9fh0000gn/T/tsx-501/`.
  Cost me ~30 min of confusion in the upload debug today.

- **Binary `conferenceAccess` 10-CHAR ceiling** still applies — 68K
  doors that read user.data only see confs 1-10. Web BBS handlers
  use the SQLite confAccess (full 14 chars today). Mixed environments
  diverge.

- **macOS APFS case-insensitive vs Linux container case-sensitive**
  for user.data / User.data already mitigated by amigafs.resolvePath
  fallback; mention only because it almost re-bit us during disk
  cleanup.

- **`/api/upload` endpoint** is still wired but the BBS-user branch
  of `processFileUpload` is dead post-Phase-4. The endpoint serves
  only door archive uploads (`pendingDoorUpload`) and DoorManager
  admin uploads (`inDoorManager`). DON'T re-introduce
  `show-file-upload` emit paths for BBS-user uploads or you'll
  repeat today's silent-drop bug.

- **Two flag managers** in the codebase: `session.flagManager`
  (FileFlagManager, per-session, used by web batch) and
  `flaggedFilesManager` (FlaggedFilesManager singleton, used by
  telnet/SSH direct-D-with-flagged). Both need clearing on
  successful download. Did both today.

- **`db.getFileAreas(confId)` was returning empty for disk-only
  confs** until 2026-05-20. After the conference sync deploy this
  should work — but if anything else is paranoid about SQLite-only
  conf state, the fallback `session.tempData.fileArea` (set by
  `displayUploadInterface` from disk) is the safety net.

---

## Resume entry points

```bash
# Live state snapshot
curl -sS https://bbs.uprough.net/health
gh workflow run fetch-live-logs.yml -f log=conferences

# Live backend log grep
gh workflow run fetch-live-logs.yml -f log=backend -f tail=2000 -f grep='ERROR|spawn'
gh run view <id> --log | grep 'out:'

# DREWALL trace (if #15 ever returns)
DREWALL_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only

# Corpus assertions
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 1

# Force-clean local restart (clears tsx cache)
ps aux | grep -E "tsx.*backend|start-servers" | grep -v grep | awk '{print $2}' | xargs -I{} kill {} 2>/dev/null
rm -rf /var/folders/w6/hc_wf7v94_dcn98mmjb_k9fh0000gn/T/tsx-501/
nohup env LRZSZ_DEBUG=1 ./dev/scripts/start-servers.sh --bbs-only > /tmp/start-servers.log 2>&1 < /dev/null &
disown

# Type-check
cd web/backend && npx tsc --noEmit

# Test sweep (the 30+ regression tests touched today)
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . \
  tests/database/conference-repository.test.ts \
  tests/database/user-repository.test.ts \
  tests/services/message-pointer-file-manager.test.ts \
  tests/integration/message-pointer-disk-sync.test.ts \
  tests/upload-web-zmodem-routing.test.ts \
  tests/upload-web-sender-installed.test.ts \
  tests/upload-disk-space-floor.test.ts \
  tests/upload-completion-banner.test.ts \
  tests/door-chain-menu-leak.test.ts \
  tests/callers-log-dual-write.test.ts \
  tests/batch-download-restricted.test.ts \
  tests/download-clear-flagged-after-batch.test.ts
```
