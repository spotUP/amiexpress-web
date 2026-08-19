---
date: 2026-08-19
topic: DoorRepo made usable - modem-throttle root cause, pane debounce, install fixes, CORS; plus the still-open download corruption
tags: [handoff, doorrepo-c, door-repo, 68k, emulator, performance, modem-emulation, bbscmd, cors, deploy]
status: final
---

# Session handoff - 2026-08-19 (evening) - DoorRepo speed and install

Second handoff of the day. The earlier one
(`2026-08-19_d-calc-download-investigation.md`) covers the download
corruption hunt; this one covers everything after it.

**Two commits are LOCAL AND UNPUSHED**: `7ace19931`, `b58ac0544`. Live runs
`327c5e18d`. Read "Next steps" before pushing.

## HOW TO RESUME

1. `git log --oneline origin/main..HEAD` - the two unpushed commits.
2. Local BBS is the test bed now, NOT the standalone harness. See "The
   harness lies" below.
3. The open bug is still the download corruption; everything else here
   shipped or is ready to ship.

## The headline: it was the modem-speed emulator

DoorRepo's browser was unusable and **almost none of it was computation**.
Measured with the same door binary on both sides:

| path | per 198-byte `JH_SM` |
|---|---|
| standalone harness (no modem emulator) | ~7 ms |
| real BBS session at 56000 bps | **~200 ms** |

A redraw is 11-80 of those messages, so one cursor keypress cost 1-2 seconds.
`DOOR_PROFILE=1` during navigation: `batchMs=5` (68K execution) against
`trapMs=335`. The CPU core is Moira C++ at `-O3` in WASM with guest memory
inside WASM; it was never the problem, and an asm pass on the door's own hot
paths was measured at ~1.5% and rejected.

The cost is not baud arithmetic either: `sendThrottled()`
(`utils/modem-emulator.util.ts`) walks each payload in <=64-char slices and
`await sleep(5)` whenever the byte budget runs dry, so latency arrives in 5 ms
quanta.

**Fix**: pacing is opt-in for 68K doors (`83834ca46`). `THROTTLE=YES` in a
door's `.info` keeps the modem look - which exists for a real reason, the
comment names Conftop's clear/redraw rendering too fast to see. Everything
else runs full speed, the same choice TypeScript doors always had. The
restore path carries 6 tests: a door that exits leaving the BBS unthrottled
would silently change how the whole board renders.

## What else shipped (all pushed and live)

- **Pane debounce** (`9dfcd42fc`). The frame is two phases: chrome + the two
  changed list rows + footer always paint (cursor 150-670 ms -> **33-50 ms**);
  the detail pane waits 240 ms of quiet, sliced with `Delay()` and abandoned
  the moment another key arrives. Burst of five arrows = one fetch, one pane
  draw.
- **Full-width archive/doc views** (`4acf2d38b`) - the list is hidden while
  one is open, which costs nothing because the cursor keys already scrolled
  the pane rather than the list there.
- **Info-pane LRU** (`7dda9df31`), **32 KB body reads** (`9e49c5139`),
  **bulk `recv()` memory copy + gated payload logging** (`d130e1c61`). Cold
  start 12.9 s -> 5.3 s. These predate the throttle discovery but still
  matter: fewer bytes = fewer XIM round trips, which is the real currency.
- **`JH_FetchKey` fidelity fix** (`fd755ae03`) - it replied with a bare ESC
  where express.e answers via `readChar()`, i.e. the converted arrow code.
- **CORS on the door-repo API** (`4fd9c74e5`) for Phantasm.
- **Byte capture** `BSDSOCKET_TEE_DIR` (`a802ae3a9`), **head-less probe**
  `tools/probe_fetch.c` (`5e981da25`), **`KeepFailedDownloads`**
  (`e65603f0d`), **packaging script** (`997ae2e7d`).

## Unpushed, ready to go

- `7ace19931` **doorrepo-c**: the ad-strip prompt now NAMES the files (both
  prompts; `[S]trip` used to ask before it had even loaded the listing), and
  the install writes `<CMD>.info.new` + `rename()` instead of `fopen`.
- `b58ac0544` **bbs**: the BBSCmd freshness stamp now covers the `.info`
  FILES (count, newest mtime, total size), not just the directory's mtime.

Both fix the same reported bug from opposite ends: *a door installed while
the BBS ran was invisible until reconnect*. A directory's mtime changes when
a file is CREATED, not when it is later filled in - so `fopen()` published an
empty `.info`, a command typed in that window made the BBS reload, parse
nothing, and mark itself fresh, and the finished content never triggered
another reload. The reported timestamps show the window: directory 22:33:30,
contents 22:33:31.

The server-side half also fixes a second latent bug: **an `.info` edited in
place was never noticed**, so a door tightened to `ACCESS=255` would have
gone on admitting everyone until a restart.

## Learnings worth keeping

**The harness lies.** `drive-door.js` / `Scripts/run-amiga-door.ts` use a
mock socket: no modem emulator, no real socket path, and they deliver arrow
keys as single bytes. Three separate bugs hid behind that this session - the
RAWARROW one earlier, the debounce that shipped broken twice, and the
throttle itself, which I "proved" using harness numbers that could not
possibly contain it. **Test doors on the local BBS** (`start-servers.sh
--bbs-only`, port 3001, log in, type the command).

**Profile before optimising.** Three rounds of mitigation (caching,
coalescing, frame-skipping) went by before anyone ran `DOOR_PROFILE=1`, which
prints `iters/traps/batchMs/trapMs/yieldMs` per second and would have pointed
straight at the answer. Note the first reading is easy to misread: windows
that include an idle door are dominated by waiting, and `batchMs + trapMs +
yieldMs` does not sum to `total`.

**A test can pass against the code it condemns.** The existing "picks up an
EDITED .info" test bumped the directory's mtime by hand - which no real edit
does - so it passed on the broken stamp. My first replacement did the same
thing (baseline taken before pinning the directory, so the pin was the change
under test). Every regression test here was re-run against the OLD code to
confirm it fails. Do that.

**`JH_FetchKey` consumes input; `GETKEY` (500) does not.** For "is the user
still typing?", use GETKEY (`express.e:3811`). An earlier debounce used
FetchKey and ate every queued arrow before redrawing - five keys moved the
selection one row.

**Never gate the whole frame on pending input.** Anything that keeps the
queue non-empty then starves the display forever and reads as a hang. Gate
only the expensive part; the cheap part must always paint.

**The door binary is read at door LAUNCH.** Swapping
`Doors/DoorRepo/doorrepo.amiga` does nothing for a session already inside the
door - quit with Q and re-enter. This confused several test rounds.

**Deploys hurt this host.** Two outages today: a docker build saturated the
box (load 91, SSH refusing connections, site 502), and one deploy was killed
mid-build by SIGTERM, leaving an orphaned build that recreated the container
from the PRE-revert commit. Batch commits, deploy once, and check load/disk
first. `docker builder prune -f` reclaimed 3.4 GB.

## Open items

1. **The download corruption is still unexplained.** `-D-CALC.LHA` computed
   the same wrong digest twice; `-J-LCV30.LHA` computed TWO DIFFERENT wrong
   digests, which means a race rather than a fixed transformation. Neither
   reproduces off the live node. `KeepFailedDownloads=yes` is live AND
   committed (a deploy had silently wiped the container-only copy), so the
   next failure keeps `<name>.bad` - diff it against curl's bytes. Detail in
   the earlier handoff.
2. **Disk is back to 90% / 3.7 GB** after today's deploys. It was pruned to
   78% mid-session and refilled. Prune again before the next deploy.
3. **Duplicate `Cross-Origin-Resource-Policy`.** The live response carried
   both `cross-origin` and `same-origin`; only one comes from Express, so
   Caddy likely adds the other and the Caddyfile is not in the repo. A
   duplicate would still break Phantasm's fetch. Check once he tries.
4. **Phantasm's archive** (`thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`,
   also on the Desktop) predates everything after `b2783ae2f`. Rebuild with
   `examples/doorrepo-c/package-for-amiga.sh` before sending.
5. **Two pre-existing test failures**, unrelated and unchanged all day:
   `tests/api/config-routes.test.ts` and
   `tests/api/info-editor-routes.test.ts` (30 s timeouts, load-flaky, pass in
   isolation). 5193 pass.
6. **`Doors/door-manager/app.ts` is at the 2000-line ceiling.**

## DOORMAN parity - the gap list (research, not yet acted on)

A full survey was done. The keystone finding: **DoorRepo has no notion of an
installed-doors list.** Its only list is the repo catalog, and its only
evidence of "installed" is its own `DoorRepo.idx`, so a door installed by any
other means is invisible to it.

Missing vs DOORMAN: the installed-doors list itself (A1), enable/disable
(A3), delete any installed door (A4 - today's uninstall only removes what the
server's file listing names, and leaves the directory when anything else is
present), the `.info` tooltype editor (A5), the file explorer with
delete/rename/view (A6-A9), per-file strip selection with reasons (A11).

**A directory-scan platform shim (`dirscan_amiga.c` / `dirscan_native.c`,
using `Examine`/`ExNext`) unblocks seven of those at once** and is the only
structurally new piece. Recommended order: shim -> installed list -> `.info`
editor (highest value per line, probably subsumes enable/disable via
`ACCESS=`) -> real recursive uninstall -> file explorer.

Deliberately NOT worth doing: upload-from-browser (A13, no such channel in
XIM), repo delete/strip from the door (B11/B12, the API is GET-only and
DOORMAN hides these from consumers anyway), a SysOp gate in the door (`ACCESS=`
in its own `.info` is the AmiExpress-native mechanism).

## Verification state

- Backend jest: **5193 passed**, 2 pre-existing failures (item 5).
- C suites: 228 flow / 123 config / 48 http / 33 aedoor / 24 infocache, plus
  md5, sha256, guide, ansi, listtxt - all green, zero warnings from clang
  `-Wall -Wextra -pedantic` AND vbcc.
- `npx tsc --noEmit`: clean.
- Live verified after the last deploy: `.git-sha` = `327c5e18d` = HEAD at the
  time, door binary md5 matched the local build, site 200 in 0.18 s.
