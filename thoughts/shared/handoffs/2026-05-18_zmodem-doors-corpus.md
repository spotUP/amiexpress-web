---
date: 2026-05-18
topic: zmodem-web-unification, door-overclock-tuning, corpus-sweep, live-bugs
tags: [zmodem, doors, overclock, corpus, joincnf, aquascan]
status: draft
---

# Session handoff — 2026-05-18 (long evening)

Continuation of the morning's ZMODEM/doors work. Shipped 17 commits to
`main`, all deployed to Hetzner. Live BBS healthy throughout.

## Headline shipped

### ZMODEM web unification
**Commits**: `c67e50385`, `9bb0b8b3d`, `9163fc483`, `d34222b07`, `4d812b722`
**Effect**: Web RZ/Z/D commands route through lrzsz (canonical Forsberg/Ohse)
instead of the parallel HTTP `/api/upload` path. Same pipeline telnet/SSH
use — DIZ extraction, description prompt, FILES.BBS append, runPostUpload.

Bug crop fixed along the way:
- chunk-split at `**\x18B` boundaries so the browser zmodem.js Sentry
  sees ONE initial header per `consume()` (zsentry.js detection prereq).
- `patchZrinitFlags` loops to patch every ZRINIT occurrence in a chunk.
- ZRINIT-suppression only on `transport.type === 'web'` (telnet/SSH
  clients NEED the post-ZRQINIT ZRINIT — earlier fix regressed telnet
  upload to "Waiting for OK to send").
- `normalizeHexHeaderTrailers` requires full 21-byte hex-header shape
  (marker + 14 ASCII-hex + `\r\x8a\x11` trailer) before patching the
  `\x8a` byte. Old code matched any `\r\x8a` pair — corrupted JPEG
  payload with random `0x0d 0x8a` bytes → "Bad Block CRC" + garbage
  count + abort. False-positive surface now zero.
- MuffinTerm ZCRCE→ZCRCW rewrite skipped for `transport.type === 'web'`
  — zmodem.js already emits spec-compliant ZCRCW.
- Frontend defers `beginZmodem` on upload — pops the OS file picker
  BEFORE the Sentry arms (and before the backend spawns rz). Eliminates
  the ZACK→ZFILE race where rz timed out waiting for ZFILE during the
  user's file-pick latency.
- Deferred rz spawn server-side (no 1500ms fallback) — only spawn on
  client `transfer-raw:start` ack. 120 s safety cleanup if user
  abandons picker.

### Phase 4 cleanup
**Commit**: `1a5c51076`
**Effect**: Deleted dead `socket.on('file-upload', ...)` (legacy
socket-body JSON byte-array upload) and `socket.on('file-uploaded', ...)`
(no current emitter). Trimmed `processFileUpload` to only its
`pendingDoorUpload` branch (TypeScript-doors `requestArchiveUpload()`
is the sole remaining caller). `/api/upload` route stays — still needed
for BBSApi door archive uploads via `file-upload-ready`. Net diff
-194/+53 = 141 lines.

### Door overclock — bumped and reverted
**Initial**: `a80b6fbbe` — DoorLifecycleManager default 100x → 25000x.
**Revert**: `889312df6` — back to 100x.

Bench data (`report-overclock.json`) showed 294/324 corpus doors safe at
100000x — but live deploys binary variants NOT in the corpus (e.g.
`Doors/AquaScan/AquaScan.000` vs corpus `DC_X107I_AquaScan/AquaScan`).
User reported many 68K doors broken on live; reverting fixed it.

Speedups remain available per-door via `OVERCLOCK=N` in .info tooltype
(or `HEAVY_BATCH_OVERRIDES` map in batch-scheduler.ts for batch doors).
mtop / multitop / ByteKillHandler / QuickNew keep their 5000x floor.

### J / JoinCnf door enabled
**Commit**: `b923ac94f`
**Effect**: `Commands/BBSCmd/J.info` shipped from sanctuary with
`!LOCATION=Doors:emp_tools/joincnf` — the `!` prefix is the Amiga .info
"disabled tooltype" marker. info-file-parser.ts:74 correctly skips it,
which meant no door registered for J and the BBS fell through to the
internal `handleJoinConferenceCommand`. User wanted the actual door.

Byte-level patches to the binary .info:
- byte 1179: `!` → ` ` (space; parser `.trim()` drops leading whitespace)
- bytes 1195+: `joincnf` → `Joincnf` (case-correct, defensive even
  though `amigafs.resolvePath` walks case-insensitively).

### Q-quit at FR / file-listing pause
**Commit**: `afbd8ad64`
**Effect**: `flagPause` / `checkForPause` map `Q` to the same
"stop listing" behavior as `N`. Express.e's prompt didn't have Q but
every modern BBS terminal user expects it. Earlier path fell through
to "invalid input → re-prompt forever".

### Diag log gating
**Commit**: `4d812b722`
**Effect**: `[onAny]` (backend) gated on `LRZSZ_DEBUG`. Frontend
`[ZMODEM] sender NB → server`, `[ZMODEM] consume NB`, `[ZMODEM]
to_terminal bytes` gated on `window.__ZMODEM_DEBUG__ = true`. Critical
warnings stay unconditional.

### Operational tooling
**Commit**: `038ae60f2`, `a32a0c2cf`, `7e4102f23`, `5af000d07`
**Effect**: `.github/workflows/fetch-live-logs.yml` — manual-dispatch
workflow that SSHes to Hetzner, probes `/app/logs` vs
`/app/web/backend/logs` vs `/app/data/logs`, tails the requested log
or `docker logs` if the file is empty, runs an optional `-E` grep
filter. Usage:
```
gh workflow run fetch-live-logs.yml -f log=backend -f tail=2000 -f grep='ERROR|spawn'
```
Output streams to the workflow log; read with `gh run view <id> --log`.

### Door corpus
**Commits**: `5400db306` (research doc), `d612b59dc` (assertions +
goldens)
**Effect**: `bench-overclock.ts` default concurrency 3→1 (per memory
feedback_avoid_parallel_emulator_heat). Documented 25 broken-at-every-
factor doors in `thoughts/shared/research/2026-05-18_corpus-broken-doors.md`.
Capture-all sweep completed (324 doors), `populate-integration.ts`
auto-wrote integration assertions for 320 of them in corpus.json.

### Regression tests
**Commit**: `bd301e494`, plus follow-ups
**Effect**: 32 tests across four files:
- `zmodem-web-unify.test.ts` (16) — grep-style routing/wiring pins
- `lrzsz-transport-pipeline.test.ts` (13) — behavior tests of
  processStdoutChunk (extracted to private method for testability)
- `diz-extraction-flow.test.ts` (5) — real ZIP DIZ extraction
- `flag-pause-q-quit.test.ts` (5) — Q-quit at pause prompts

## Live state at session end

- `https://bbs.uprough.net/health` → 200 OK
- Latest commit `d612b59dc` deployed at ~23:09 UTC
- Container restarts clean

## Still open

| # | Task | Status |
|---|---|---|
| 7 | Verify mtop overclock plumbing on live | Needs sysop SSH/login — can't be done remotely |
| 15 | DREWALL menu prompt leaks before its own UI | Needs tighter repro; code path looks correct |
| 16 | AquaScan not running on live (FR) | Likely fixed by overclock revert; awaiting user retest |

## Other observations worth chasing

- `Commands/BBSCmd/wall.info` LOCATION points to dRE!WAll — that's the
  door the user said "menu prompt leaks through". Reproduce locally
  with `DREWALL_TRACE=1` env to see XIM message sequence around exit.
- Audit found `Commands/BBSCmd/GWALL.info` LOCATION points to
  `Doors/GWall/GWall` — directory exists as `Doors/Gwall/` but no
  binary inside, only `gwall.cfg`. Either the GWall binary needs
  installing or the .info needs disabling.
- bbslink-based commands (arcl, assn, bbsc, dark, lord, mega, netr,
  etc. — ~30 commands) all point to `Doors/bbslink/bbslink` which is
  not installed locally (only `bbslink.cfg` + `.info` in the dir). If
  the user wants these, the bbslink binary needs to be added.
- Pre-existing uncommitted state from session start (Bulletins/*.txt,
  Commands/BBSCmd/ deletions, .serena/project.yml,
  web/backend/src/amiga-emulation/xim/io.ts) — untouched by today's
  work; user should triage separately.

## Quick state pointers

| Path | Why |
|---|---|
| `.github/workflows/fetch-live-logs.yml` | Manual-dispatch live log fetcher |
| `report-overclock.json` | 324-door per-factor bench results |
| `thoughts/shared/research/2026-05-18_corpus-broken-doors.md` | Categorized analysis of 25 broken doors |
| `thoughts/shared/plans/2026-05-18-zmodem-web-unification.md` | Phase 1-4 plan written at session start |
| `web/backend/src/services/lrzsz-transfer.service.ts` | All the ZMODEM transport fixes |
| `web/backend/src/services/info-file-parser.ts:74` | Where `!` prefix skips tooltypes |
| `web/backend/tests/lrzsz-transport-pipeline.test.ts` | Behavior tests + extracted processStdoutChunk |
| `Commands/BBSCmd/J.info` | Now-active JoinCnf registration |
| `dev/scripts/edit-info.ts` | CLI .info reader; binary writer is a TODO |

## Background processes at session end

- Local BBS dev server (`start-servers.sh --bbs-only`): up at
  `http://localhost:3001`. Was running throughout session, may need
  a `--clean` restart before next major work.
- Corpus capture-all sweep: completed and exited.
