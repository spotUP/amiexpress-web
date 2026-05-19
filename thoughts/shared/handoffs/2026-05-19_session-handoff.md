---
date: 2026-05-19
topic: full-session-handoff
tags: [zmodem, doors, joincnf, aquascan, overclock, corpus, sqlite-disk-parity, ops]
status: final
---

# Session handoff — 2026-05-18 evening → 2026-05-19 early-AM

30 commits shipped on top of `56389a447` (session-start point). Major
shipped: ZMODEM web unification + telnet/SSH ZMODEM hardening, doors
cluster (overclock, JoinCnf, splash, case-sensitivity, slot regen),
corpus capture, ops tooling for live logs + live admin ops, 32+
regression tests, two doc/research files for handoff and audit.

Stopping points for the new session are spelled out below. Read `## Resume
entry points` first to pick a thread.

---

## TL;DR — what works on live right now

- **Web ZMODEM upload** end-to-end (RZ → file picker → DIZ check →
  description prompt → DIR placement → FR visibility) verified by the
  user.
- **Telnet ZMODEM upload + download** working again (post a regression
  I introduced + fixed mid-session).
- **JPEG / binary downloads** no longer corrupt — hex-header matcher
  validates the full 21-byte shape now.
- **Most 68K doors** working again after reverting the 25000x default
  overclock that broke variants outside the corpus.
- **`J` runs JoinCnf** (door registration was disabled via `!LOCATION`
  in J.info).
- **JoinCnf splash** no longer shows the equality-pagination "press
  RETURN" overlay.
- **JoinCnf finds users** — live `user.data` regenerated from SQLite so
  every web-registered user has a binary record at their slot.
- **FR + `Q`** quits the listing instead of hanging in re-prompt.
- **mtop** runs at 5000x via `HEAVY_BATCH_OVERRIDES` floor + verified
  env propagation.

Live `/health` 200, container fresh as of `bf6b4b5f9`.

---

## Open items (resume here)

### #15 — DREWALL leaks main menu prompt AFTER door exit
**Status:** pending; user clarified the leak is AFTER exit, not
before/during. Code path at `web/backend/src/handlers/door.handler.ts:1519-1522`
sets `subState = DISPLAY_MENU; menuPause = false` after every door —
that's the correct default. The bug is either:
1. dre!wall's own final "press RETURN" pause overlaps the BBS-side
   menu redisplay (so user sees both)
2. RETURNCOMMAND tooltype expected but `wall.info` doesn't have one,
   so default returns to menu
3. Async race where the door's last emit and the menu prompt interleave

**Repro plan:**
```
DREWALL_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only
# Then run `wall` from the BBS terminal; capture wire bytes
```
Look at the DT_NAME / XIM message log around the door's exit step.
Identify whether the menu prompt bytes appear BEFORE the door's own
final write completes.

### #19 — DEEP AUDIT: SQLite-only state 68K doors need on disk
**Status:** first-pass audit committed in
`thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md`.
Eight unpaired `db.updateUser` sites identified. Pattern: SQLite gets
written, no `userFileManager.updateUserDataFile` follow-up.

**Highest-impact unpaired sites:**
- `handlers/user/account.handler.ts:399` — sysop changes user `secLevel`
- `handlers/user/account.handler.ts:482` — `expert` + `ansi` flags
- `handlers/user/auth.handler.ts:69` — login user record update
- `handlers/transfer/olm.handler.ts:389` — `blockOLM` (Quiet mode)
- `handlers/chat/preference-chat-commands.handler.ts:109` — `expert` toggle
- `handlers/user/gdpr.handler.ts:273` — GDPR erasure (compliance!)

**Strategic recommendation:** centralize sync via a hook on
`db.updateUser()` rather than patching each call site. The fields are
finite and UserFileManager already serializes them.

**Other state classes not yet audited:**
- Messages (`db.createMessage` 4 sites) → per-conf MSGS files
- Conferences (`db.updateConference`) → ConfConfig.info
- caller_activity / callersLog → CallersLog disk
- Votes → VoteStats / Vote.info
- File flags → Flag.x.N
- Message pointers → user-N.last
- OLMs → OLMs disk

Re-run audit command in the doc.

---

## What shipped this session

### ZMODEM web unification (commits c67e50385 → d34222b07)

Routes web RZ/Z/D through the same lrzsz pipeline telnet/SSH use.
Same pipeline = same DIZ/description/DIR/FR/FILES.BBS behavior across
transports.

| Commit | What |
|---|---|
| `c67e50385` | Wire web RZ/Z/D through lrzsz, deferred-pick handshake, multi-file ZMODEM queue, Phase 4 dead-HTTP-upload removal sketch |
| `1a5c51076` | Phase 4 deletion of `socket.on('file-upload'/'file-uploaded')` + `processFileUpload` legacy branches |
| `4d812b722` | Gate per-byte diag logs (`[onAny]` server / `[ZMODEM] sender/consume`) behind `LRZSZ_DEBUG` and `window.__ZMODEM_DEBUG__` |
| `9bb0b8b3d` | **REGRESSION FIX**: ZRINIT-suppression web-only — was breaking telnet (`Waiting for OK to send`) |
| `afbd8ad64` | `Q` quits flagPause/checkForPause (FR listing) |
| `9163fc483` | **JPEG corruption**: require XON tail before patching `\r\x8a` |
| `d34222b07` | **Harden**: full 21-byte hex-header shape validation before patching |

**Regression tests:** 32 tests in 4 files:
- `web/backend/tests/zmodem-web-unify.test.ts` (16 grep-style)
- `web/backend/tests/lrzsz-transport-pipeline.test.ts` (13 behavior, extracted `processStdoutChunk` to a private method for testability)
- `web/backend/tests/diz-extraction-flow.test.ts` (5 real-ZIP)
- `web/backend/tests/flag-pause-q-quit.test.ts` (5)

### Doors cluster (a80b6fbbe → 95bb91568)

| Commit | What |
|---|---|
| `a80b6fbbe` | Bumped DoorLifecycleManager default 100x → 25000x + ByteKillHandler/QuickNew to HEAVY_BATCH_OVERRIDES + processBatchFile walks pendingZmodemFiles queue |
| `889312df6` | **REVERT** 25000x → 100x — broke many 68K doors variants not in the corpus (AquaScan/AquaScan.000 vs corpus's DC_X107I_AquaScan/AquaScan) |
| `b923ac94f` | Enable JoinCnf door for J — `J.info` shipped from sanctuary with `!LOCATION` (disabled). Byte-patched to ` LOCATION` (parser .trim drops the space) and case-corrected `joincnf` → `Joincnf` |
| `95bb91568` | Always return 9999 for JH_REGISTER lineLen — JoinCnf equality-cmp paginator fires on any non-zero linesPerScreen match |
| `ebc6c2e88` | Lowercase `user.data` so JoinCnf reads what UserFileManager writes |
| `8687d17cc` | Case-insensitive fallback so legacy capital `User.data` volumes still work |
| `b06f156eb` | Same lowercase + fallback for `user.keys` and `user.misc` |

### Corpus (5400db306, d612b59dc)

- 324 corpus doors captured by overnight `--capture-all` sweep
- `populate-integration.ts` auto-wrote assertions for 320 (4 skipped =
  the broken-at-every-factor ones)
- Categorization of the 25 broken doors in
  `thoughts/shared/research/2026-05-18_corpus-broken-doors.md`

### Ops tooling (038ae60f2 → 67eb43f3d)

`.github/workflows/fetch-live-logs.yml` — manual-dispatch workflow for
live admin/log ops via the existing `HETZNER_HOST` SSH secret. Targets:

| Target | Use |
|---|---|
| `backend` / `preview` / `xim` | Tail named log with optional `-f grep='regex'` |
| `all-recent` | List logs dir + tail backend |
| `doors` | Find AquaScan binary + list Doors dir |
| `confs` | Dump ConfConfig.info from all candidate paths |
| `userdata` | DB + binary user.data sizes + md5 + confaccess hex |
| `userdump` | Per-slot name + confaccess for first 21 slots; "spot" name search in capital User.data |
| `joincfg` | Dump joincnf.cfg |
| `regenerate-users` | One-shot: backup user.data*, run regenerate-user-files.ts |

Output streams into the workflow log; read with:
```
gh workflow run fetch-live-logs.yml -f log=<target> [-f tail=N] [-f grep='regex']
gh run view <id> --log | grep 'out:'
```

### `regenerate-users` ran on live tonight

`web/backend/src/scripts/regenerate-user-files.ts` ran inside the live
container with backups taken first. Outcome:
- spot → slot 22 (was DB slot 2; script renumbers to match DB row order)
- sysop → slot 24 (was DB slot 1)
- All web-registered users now have a binary record at their slot
- Backups at `*.before-regen-20260519T001829.bak`

**Confaccess limit:** AmiExpress 3.x binary format reserves only
**10 bytes** for `conferenceAccess` per user. DB stores up to 25
chars. The regen truncates: SQLite `XXXXXXXXXXXXXXXXXXXXXXXXX` (25 X's)
→ binary `XXXXXXXXXX` (10 X's). So users will see at most 10 confs in
JoinCnf — that's a format ceiling we don't fight tonight; needs
extension or alternate access mechanism if the BBS wants > 10 confs
visible per user.

---

## Risk tracker — things I touched that could regress

- `processStdoutChunk` refactor in `lrzsz-transfer.service.ts` — was
  inline in stdout `data` handler, now a private method. Behavior tests
  pin the byte-level effect but the spawn path may surface edge cases.
- Default overclock revert means doors that benefit from 25000x speedup
  now run at 100x; user can opt in per-door via OVERCLOCK= in .info.
- `Commands/BBSCmd/J.info` byte-patched: if you ever rebuild the BBSCmd
  layout from sanctuary, the `!LOCATION` will come back. Memo to keep
  this patch sticky.
- `userDataPath` / `userKeysPath` / `userMiscPath` in
  `web/backend/src/amiga-emulation/xim/system-commands.ts` now use
  amigafs case-insensitive fallback. Local macOS works; Linux container
  matched too.
- The 25 broken-corpus doors get an `--only <id,id,...>` re-run path in
  the broken-doors research doc if/when emulator gets new syscall
  support.

---

## Quick state pointers

| Path | Why |
|---|---|
| `thoughts/shared/handoffs/2026-05-18_eod_full-session.md` | Earlier today's handoff (now superseded by this one but still useful for narrative) |
| `thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md` | Audit findings (#19 entry point) |
| `thoughts/shared/research/2026-05-18_corpus-broken-doors.md` | 25 broken doors categorized |
| `thoughts/shared/plans/2026-05-18-zmodem-web-unification.md` | Original plan from start of session |
| `.github/workflows/fetch-live-logs.yml` | Live log + admin ops dispatcher |
| `report-overclock.json` | 324-door per-factor bench results |
| `web/backend/src/services/lrzsz-transfer.service.ts` | All ZMODEM transport fixes |
| `web/backend/src/services/info-file-parser.ts:74` | Where `!` prefix skips tooltypes |
| `web/backend/src/amiga-emulation/xim/system-commands.ts:1257` | `userDataPath()` — lowercase + case-insensitive fallback |
| `web/backend/src/amiga-emulation/xim/system-commands.ts:108` | JH_REGISTER lineLen (always 9999 for logged-on) |
| `web/backend/src/services/UserFileManager.ts:1035` | `updateUserDataFile()` — the disk-sync entry point |
| `web/backend/src/scripts/regenerate-user-files.ts` | One-shot SQLite → binary user.data regen |
| `Commands/BBSCmd/J.info` | Now-active JoinCnf registration |
| `dev/scripts/edit-info.ts` | CLI .info reader (binary writer is TODO) |

---

## Resume entry points

### Pick up #19 audit (highest ROI for stopping future cascades)

```
# Re-run the audit script to refresh findings
cd /Users/spot/Code/amiexpress-web
for f in $(grep -rln "db\\.run.*UPDATE users\\|db\\.updateUser\\b" web/backend/src --include="*.ts" | grep -v test); do
  while IFS=: read line _; do
    near=$(awk -v target="$line" 'NR>=target-3 && NR<=target+30' "$f" | grep -c "updateUserDataFile\\|userFileManager")
    [ "$near" = "0" ] && echo "UNPAIRED: $f:$line"
  done < <(grep -n "db\\.run.*UPDATE users\\|db\\.updateUser\\b" "$f")
done

# Then either fix each unpaired site OR centralize via a hook in db.updateUser()
```

### Pick up #15 DREWALL menu leak

```
# Restart local BBS with DREWALL trace + door overclock debug logs
cd /Users/spot/Code/amiexpress-web
DREWALL_TRACE=1 LRZSZ_DEBUG=1 ./dev/scripts/start-servers.sh --bbs-only
# Open browser, log in, run `wall`. Capture the wire bytes after the
# door's last visible output. Compare against telnet behavior.
```

### Investigate the 10-conf binary limit (if user wants > 10 visible)

`UserFileManager.ts:45` — `conferenceAccess: string; // [10] CHAR`.
Format change requires:
- Extend record size (236 → larger) — breaks Amiga compat
- OR add a second binary file with extended access (e.g., `userExtAccess.data`)
- OR detect-and-extend on regen

Most pragmatic: write a sister file `user.confext` with 32-byte
access flags, read it in tandem with user.data when the XIM door asks
for confaccess.

### Resume corpus assertion validation

```
# We already captured + populated. Validate now:
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 1
```
Look for assertion failures; each is a regression candidate.

### Bench tool default (already lowered to 1)

```
cd /Users/spot/Code/amiexpress-web
npx tsx dev/scripts/bench-overclock.ts --only <suspect-id>
```

---

## What's actively running at session end

- Local BBS (`start-servers.sh --bbs-only`): up at `http://localhost:3001/`
  (last restart picked up J.info changes + lowercase user.data fix)
- Corpus capture-all: completed earlier, exited.
- No persistent background processes that need explicit cleanup.

---

## Memory updates for next session

Worth saving to memory:
- "Amiga `.info` tooltype prefixes: `!` and `(...)` mark a tooltype as
  disabled. `%` is a NewIcons length-prefix byte — should be stripped,
  not treated as disable."
- "AmiExpress binary user.data `conferenceAccess` field is 10 CHAR — a
  hard ceiling on how many conferences a single user can have access
  to via XIM doors. Database holds up to 25; binary truncates."
- "When a 68K XIM door appears 'empty' or 'denied' on live but works
  locally, suspect: (1) user record absent from binary user.data
  (run regenerate-users workflow), (2) case-sensitivity on Linux
  container, (3) overclock factor mismatch from non-corpus binary."
- "GitHub Actions `appleboy/ssh-action` can run arbitrary commands on
  the live VPS — `.github/workflows/fetch-live-logs.yml` is the manual-
  dispatch flow that reuses the same `HETZNER_HOST`/`HETZNER_SSH_KEY`
  secrets the deploy uses."
