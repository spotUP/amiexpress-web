# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-19_doorrepo-speed-and-install-fixes.md`
(then `..._d-calc-download-investigation.md` for the open bug).

**Everything is pushed and live.** Live runs `9c6903303` (verified: image
built 21:11 on 2026-08-19, container started 21:13, `Doors/DoorRepo/
doorrepo.amiga` md5 `e8bf8b5652e4f072b09e4a5a76e16a3e` = local build). The two
install fixes - ad-file names + atomic `.info` write (`7ace19931`) and the
BBSCmd freshness stamp over the `.info` FILES (`b58ac0544`) - are live but
**not yet confirmed by a real session**: install a door and use it WITHOUT
reconnecting. That is the one open verification.

**Disk is at 90% / 3.7 GB again** - the deploy refilled what the pre-push
prune reclaimed. `docker builder prune -f` before the next deploy.

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

1. **Confirm the install fix on live** (only open item from the push). Log in
   as sysop, `DOORREPO`, install a door, then type its command name WITHOUT
   reconnecting - it must run. Also check `[S]trip` now NAMES the ad files.
2. **Catch the download corruption.** `-D-CALC.LHA` gave the same wrong digest
   twice; `-J-LCV30.LHA` gave TWO DIFFERENT wrong digests - a race, not a
   fixed transformation. `KeepFailedDownloads=yes` is live and committed, so
   the next failure keeps `<name>.bad`; diff it against curl's bytes.
3. **DOORMAN parity** - full gap list in the resume doc. Keystone: DoorRepo
   has no installed-doors list; a `dirscan_amiga.c`/`dirscan_native.c` shim
   unblocks seven features at once.
4. Optional, found while verifying CORS: `HEAD /api/door-repo/archive/<name>`
   404s although the preflight advertises `GET, HEAD, OPTIONS`
   (`door-repo.routes.ts:379` returns early on any non-GET), and `Range` is
   advertised as an allowed request header but ignored (full `200`, never
   `206`). Neither breaks a plain browser GET.

## Done 2026-08-19 late

- **Duplicate `Cross-Origin-Resource-Policy` fixed at the source.** It was
  **Caddy**, not Express: `/etc/caddy/Caddyfile` set the header itself on
  lines 2 and 56, and Caddy's non-deferred `header` writes at request time
  while `reverse_proxy` then copies the upstream header in - so both survived
  (`cross-origin` + `same-origin` on the site root, `cross-origin` twice on
  the API). Express's `doorRepoCors`
  (`web/backend/src/server/door-repo-cors.ts:70`, mounted `app.ts:90`) already
  sets it per path, so both Caddy lines were deleted and Express is now the
  single source. Backup: `/etc/caddy/Caddyfile.bak-corp-dupe-20260819`.
  Verified live: site root `same-origin`, `/api/door-repo/*` `cross-origin`
  over HTTPS **and** plain HTTP, preflight 204 with the full allow set, a real
  archive GET carrying `x-archive-md5`/`sha256`. **The Caddyfile is not in the
  repo** - it lives only on the host.
- **Phantasm's archive rebuilt** with `package-for-amiga.sh` (57 files; tests
  pass before packing, extracted source rebuilt and re-tested, binary digest
  round-tripped, matches the live md5). Ready to send.

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
