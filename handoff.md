# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-23_door-server-split-phase1.md`
(the door repository is now a standalone service, built and deployed; nothing
is cut over yet), then
`thoughts/shared/handoffs/2026-08-23_doorrepo-reload-signal-and-rexx-picker.md`
(then `2026-08-20_doorrepo-archiver-extraction.md`,
`2026-08-19_doorrepo-speed-and-install-fixes.md`, then
`2026-08-19_d-calc-download-investigation.md` for the open download bug).

**THREE COMMITS ARE NOT PUSHED**: `5273075ed`, `614631462`, `05f82761d`.
They are held deliberately until an install has been seen to run on the
local BBS. Live is `daa68714f` (verified in the container, not assumed - the
handoff previously said `c2ff0b260`, one commit behind); a deploy runs on
every push to main, so
after pushing CHECK IT (`docker exec amiexpress-bbs cat /app/.git-sha`, and
the image's build time, because a green workflow has lied before).

**NOT YET CONFIRMED END TO END.** Files now land (`Doors/BULLV/`, `Doors/ACC/`
appeared), but no installed door has been seen to START. The remaining test:
install through DOORREPO and type its command WITHOUT reconnecting. Retest
target is `ACC-V103.LHA`, which should now write `TYPE=AIM` +
`LOCATION=Doors:ACC/Account/AccEd.Rexx`. The local door binary is already
rebuilt (`Doors/DoorRepo/doorrepo.amiga`, md5 `81c9cadce3346e6be522f16a6ee69f3a`)
and the binary is read at door LAUNCH, so `Q` out and re-enter first.

## Why a door could be "installed" and still not run

FIVE separate causes, all now fixed, found in this order. Each one hid the
next, which is why this took three sessions:

1. `.info` written with `fopen()` - published empty, filled in after
   (`7ace19931`).
2. The BBSCmd freshness stamp watched only the directory's mtime, which does
   not change when a file is filled in or edited (`b58ac0544`).
3. **The archive was never unpacked at all** (`4f94befdc`, `c2ff0b260`). The
   door shelled out with C `system()`, and inside the 68K emulator that
   reaches NOTHING - it returns 0, the success value, with no dos.library
   call. Doors now call `Execute()`; `Execute()` unpacks LHA using the
   backend's own reader; and an install that extracted nothing is refused
   instead of reported OK.
4. **The watcher's reload signal was swallowed by the startup guard**
   (`5273075ed`). `invalidateBbsCommandFreshness()` announced "reload now"
   by setting the stamp to `null` - and `null` is exactly what
   `revalidateBbsCommandsIfChanged()` reads as "first call, this is the
   startup baseline, do not reload". A forced reload was therefore always
   skipped, which is why the command still said "No such command!!" until
   the BBS was restarted. Now a separate `bbscmdForcedStale` flag carries
   the signal. Two existing tests had encoded the bug as correct and were
   rewritten.
5. **The picker could not find the door's program** (`614631462`,
   `05f82761d`). `ACC-V103.LHA` ships no executable at all - only
   `AccEd.Rexx`. The picker fell through to the command name and wrote an
   impossible LOCATION, so the BBS said "Door executable not found.". Rule 3
   now picks the largest `.rexx` when no binary exists, and such a door is
   written as **`TYPE=AIM`**, not XIM: express.e runs AIM through
   `REXXDOOR <node> <cmd>` (express.e:4272-4276) while XIM executes the
   LOCATION file directly (express.e:4278), which a `.rexx` cannot do on a
   real node. The override only applies when the catalog type is empty or
   XIM.

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

## Next

0. **The door server is LIVE and PUBLIC** at `https://doors.uprough.net/api/door-repo/`
   (`github.com/spotUP/amiexpress-doorserver`), serving the real 3300-door
   catalog byte-identically to this BBS - verified from outside the host:
   `list.txt` md5 matches, `x-archive-md5` matches the downloaded bytes, the
   Latin-1 archive name resolves. Caddy vhost added 2026-08-23 (backup:
   `/etc/caddy/Caddyfile.bak-doorserver-20260823-154935`), no `header`
   directives in it. Still open: the new repo has no
   `HETZNER_HOST`/`HETZNER_SSH_KEY` secrets, so its deploy workflow fails red
   on every push. Phase 2 (the BBS proxying to it) has not started.

1. **Install a door and run it without reconnecting** - then push
   `5273075ed`, `614631462`, `05f82761d`. The one open verification. If
   extraction fails the door now says so and installs nothing, which is
   itself the useful outcome.
2. **The LOCATION picker's judgement.** Finding *a* program is fixed;
   picking the RIGHT one is not. `5D!DP002.LHA` was given
   `LOCATION=.../HiScore`, which for a doorpack is almost certainly wrong.
   Files land for real now, so this is finally visible.
3. **Catch the download corruption.** `-D-CALC.LHA` gave the same wrong
   digest twice; `-J-LCV30.LHA` gave TWO DIFFERENT ones - a race, not a
   fixed transformation. `KeepFailedDownloads=yes` is live and committed, so
   the next failure keeps `<name>.bad`; diff it against curl's bytes.
4. **Send Phantasm the archive** - rebuilt and ready at
   `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`.
5. **DOORMAN parity** - gap list in the 2026-08-19 resume doc. Keystone:
   DoorRepo has no installed-doors list; a `dirscan_amiga.c` /
   `dirscan_native.c` shim unblocks seven features at once.

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
