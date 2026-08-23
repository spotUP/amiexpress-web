---
date: 2026-08-23
topic: standing traps and environment quickref (moved out of handoff.md)
tags: [reference, traps, environment]
status: final
---

# Standing traps and environment quickref

Moved out of the root `handoff.md` on 2026-08-23: the project's own
`dev/scripts/check-handoff-size.sh` caps that file at 5 KB, and this is
reference material rather than current state. Nothing here is stale - it is
the same text, kept whole.

## Standing traps

- **`system()` is a no-op inside the emulator.** Any door that shells out
  believes it succeeded. `Execute()` answers only allowlisted commands
  (DATE, AVAIL, INFO, VERSION, SHOWCONFIG, COPY, DELETE, RENAME, LhA
  extraction) and returns DOSFALSE for everything else. **LZX installs
  refuse by design** - that extractor is async and a trap cannot await.
- **Check WHICH server is running before believing a test result.** A
  reported retest ran against a backend started three minutes before the fix
  was written, with no watch mode. `lsof -nP -iTCP:3001 -sTCP:LISTEN` plus
  `ps -o lstart -p <pid>`.
- **The standalone harness lies.** `drive-door.js` /
  `Scripts/run-amiga-door.ts` have no modem emulator, no real socket, and
  deliver arrows as single bytes. **Test doors on the local BBS**
  (`DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh --bbs-only`, :3001).
- **The door binary is read at door LAUNCH.** Swapping
  `Doors/DoorRepo/doorrepo.amiga` does nothing for a session already inside
  it - `Q` out and re-enter.
- **Pacing is opt-in for 68K doors.** `THROTTLE=YES` in a door's `.info`
  keeps the modem look; without it the door runs full speed. The modem
  emulator, not the CPU, was what made DoorRepo unusable (~200 ms per
  198-byte `JH_SM` at 56000 bps against ~7 ms without it).
- **Profile before optimising.** `DOOR_PROFILE=1` prints
  `iters/traps/batchMs/trapMs/yieldMs` per second.
- **A regression test must be run against the OLD code.** Two tests here
  once passed against the very behaviour they condemned.
- **`JH_FetchKey` consumes input; `GETKEY` (500) does not.**
- **Never gate a whole frame on pending input** - it starves the display and
  reads as a hang.
- **Deploys DO refresh `Doors/`** for committed doors (only `/app/data` is a
  volume) but never the live catalog DB - that needs an ATTACH staging
  merge, never a SQL text dump (`doc_raw` carries control bytes).
- **The live Caddyfile is not in the repo.** It lives at
  `/etc/caddy/Caddyfile` on the host and can duplicate headers Express
  already sets - that is what broke `Cross-Origin-Resource-Policy`.
- **Edit/Write destroys high-bit bytes** - use cp/python/sed for binaries,
  corpus.json and anything Latin-1.
- `grep` here is **ugrep**: use `LC_ALL=C grep -a` on emulator logs and
  Amiga headers.

## Environment quickref

`SKIP_SDK_PREPARE=1 npm install --ignore-scripts`. Backend suite
`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .
--ci` (5204 pass; `config-routes` and `info-editor-routes` fail
pre-existing, load-flaky). Type-check `cd web/backend && npx tsc --noEmit`.
C suites `make -C examples/doorrepo-c test`, plus `native`, `amiga`,
`amiga-stub`, `probe-native`, `probe-amiga`. Byte capture:
`BSDSOCKET_TEE_DIR=<dir>`. Door profiling: `DOOR_PROFILE=1`. Overclock
override: `DOOR_OVERCLOCK=<n>` (default 100x, opt in per door via
`OVERCLOCK=`). Live host `root@89.167.21.154`, container `amiexpress-bbs`;
prune with `docker builder prune -f` before deploying. **Disk is at 91%
(3.6 GB free, measured 2026-08-23)** - docker holds 11.9 GB of images
(11.3 GB reclaimable) and 6 GB of build cache (4 GB reclaimable), so prune
BOTH before any build.

Older sessions: `thoughts/shared/handoffs/`.
