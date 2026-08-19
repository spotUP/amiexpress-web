# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-19_doorrepo-speed-and-install-fixes.md`
(then `..._d-calc-download-investigation.md` for the open bug).

**TWO COMMITS ARE LOCAL AND UNPUSHED:** `7ace19931` (door: ad-file names +
atomic `.info` write) and `b58ac0544` (BBS: BBSCmd freshness stamp covers the
files, not just the directory). Both fix the reported "installed door not
recognised until reconnect". Live runs `327c5e18d`.

**Before pushing:** the host is at **90% disk (3.7 GB)** and a docker build
there caused two outages today. `docker builder prune -f` first (reclaimed
3.4 GB earlier), check `uptime`, then push once.

## DoorRepo is usable now - and why it was not

It was the **modem-speed emulator**, not the door and not the CPU. Same
binary: ~7 ms per 198-byte `JH_SM` with no modem emulator in the path,
**~200 ms** on a session at 56000 bps. A redraw is 11-80 of those. 68K
execution was **5 ms** against `trapMs=335` (`DOOR_PROFILE=1`).

Fixed by making pacing **opt-in**: `THROTTLE=YES` in a door's `.info` keeps
the modem look (Conftop's visuals need it), everything else runs full speed.
Plus a pane debounce - list rows paint in **33-50 ms**, the detail pane waits
240 ms of quiet.

## Standing traps

- **The standalone harness lies.** `drive-door.js` / `Scripts/run-amiga-door.ts`
  have no modem emulator, no real socket, and deliver arrows as single bytes.
  Three bugs hid behind it today. **Test doors on the local BBS**
  (`DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh --bbs-only`, :3001).
- **The door binary is read at door LAUNCH.** Swapping
  `Doors/DoorRepo/doorrepo.amiga` does nothing for a session already inside
  it - `Q` out and re-enter.
- **Profile before optimising.** `DOOR_PROFILE=1` prints
  `iters/traps/batchMs/trapMs/yieldMs` per second. Three rounds of mitigation
  went by before anyone ran it. Beware windows containing an idle door -
  they are dominated by waiting.
- **A regression test must be run against the OLD code.** Two tests here
  passed against the very behaviour they were meant to condemn (both faked a
  directory mtime that no real edit changes).
- **`JH_FetchKey` consumes input; `GETKEY` (500) does not** - use GETKEY for
  "is the user still typing".
- **Never gate a whole frame on pending input** - anything that keeps the
  queue non-empty starves the display and reads as a hang.
- **Deploys DO refresh `Doors/` for committed doors** but never the live
  catalog DB (volume-mounted; needs an ATTACH staging merge, never a SQL text
  dump - `doc_raw` carries control bytes).
- **Edit/Write destroys high-bit bytes** - use cp/python/sed for binaries,
  corpus.json and anything Latin-1.
- `grep` here is **ugrep**: use `LC_ALL=C grep -a` on emulator logs and Amiga
  headers.

## Next

1. **Push the two commits** (after pruning disk), then confirm on live that
   installing a door makes it usable without reconnecting.
2. **Catch the download corruption.** `-D-CALC.LHA` gave the same wrong digest
   twice; `-J-LCV30.LHA` gave TWO DIFFERENT wrong digests - a race, not a
   fixed transformation. `KeepFailedDownloads=yes` is live and committed, so
   the next failure keeps `<name>.bad`; diff it against curl's bytes.
3. **Check for a duplicate `Cross-Origin-Resource-Policy` header** on live
   (Express sends `cross-origin`; Caddy may still add `same-origin`, and the
   Caddyfile is not in the repo). A duplicate breaks Phantasm's fetch.
4. **Rebuild and send Phantasm's archive** -
   `examples/doorrepo-c/package-for-amiga.sh`; the current one predates
   everything after `b2783ae2f`.
5. **DOORMAN parity** - full gap list in the resume doc. Keystone: DoorRepo
   has no installed-doors list; a `dirscan_amiga.c`/`dirscan_native.c` shim
   unblocks seven features at once.

## Environment quickref

`SKIP_SDK_PREPARE=1 npm install --ignore-scripts`. Backend suite
`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .
--ci` (5193 pass; `config-routes` and `info-editor-routes` fail pre-existing,
load-flaky). Type-check `cd web/backend && npx tsc --noEmit`. C suites
`make -C examples/doorrepo-c test`, plus `native`, `amiga`, `probe-native`,
`probe-amiga`. Byte capture: `BSDSOCKET_TEE_DIR=<dir>`. Door profiling:
`DOOR_PROFILE=1`. Overclock override: `DOOR_OVERCLOCK=<n>` (default 100x, opt
in per door via `OVERCLOCK=` in its `.info`). Live host `root@89.167.21.154`,
container `amiexpress-bbs`.

Older sessions: `thoughts/shared/handoffs/`.
