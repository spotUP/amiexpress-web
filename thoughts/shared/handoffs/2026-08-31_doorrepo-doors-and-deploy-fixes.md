---
date: 2026-08-31
topic: DOORREPO phases B/C, the emulator memory map, and a day of door/deploy defects found on the live board
tags: [handoff, doorrepo-c, doorman, door-admin, emulator, deploy, doorserver]
status: final
---

# Session handoff, 2026-08-31

Read with `handoff.md` (short current state) and
`thoughts/shared/handoffs/2026-08-31_session-handoff.md` (the session before
this one, whose "bisect the C regression" instruction this session proved
wrong).

Everything below is **merged to `main` and deployed** unless it says otherwise.
The one outstanding action needs the sysop to run a command; see Next Steps 0.

## What this session did

Started on DOORREPO parity phases B and C. Most of the day went instead to
defects found by the sysop testing on the live board, each of which turned out
to be a class rather than an instance.

### The C door was never broken

The previous handoff said to bisect eleven days of C commits because a binary
built from current source exited FAIL. There was nothing to bisect.

`HunkLoader` packs a door's segments from `0x2000` upward and knows nothing
about what sits above: ExecBase `0x80000`, the library stubs, the AllocMem heap
`0x100000`, ENV `0x120000`, ReadArgs `0x140000`. DoorRepo's caches had grown its
BSS to 436 KB, putting its segments at `0x085d04` - past the LVO jump table at
`0x7fcf4`. HUNK_BSS is zeroed at load, so the door blanked 126 exec vectors
before executing anything.

    20 Aug build   BSS 0x599f4  segments end 0x06e8fc  VERIFICATION: all 356 OK
    current build  BSS 0x6a7fc  segments end 0x085d04  VERIFICATION: 126 FAILED

The emulator **detected this and carried on** - `CRITICAL: 126 library trap(s)
missing ILLEGAL instruction!` was in the log the whole time.

- `c0f510dd9` `memory-map.ts` owns the addresses; `assertDoorSegmentsFit`
  refuses the load before `HunkLoader.load` writes a byte.
- `e3c1c6e16` DIZ cache 32->8, FILES 4->2, DOC 2->1.

**Headroom is now ~46 KB** after the two new screens. The guard fails loudly, so
the next door to cross the line says so instead of dying.

### fib_FileName was a BCPL string

Found while checking whether a C89 door can enumerate a directory. It can:
`express.e` calls `ExNext` in 36 places. The NDK declares
`TEXT fib_FileName[108]`, null terminated; `Examine`, `ExNext` and `ExamineFH`
all wrote it BCPL-style with a leading length byte. Correct Amiga code read a
control character in front of every filename, **under this emulator only**.

`547218f12`. The pre-existing FIB tests asserted offsets against local
constants and never touched the emulator, which is why nothing caught it.

### door-admin API, phases B and C

- `1d6693f15` reads: `installed`, `installed/:cmd/files`, `file?p=`, `info`
- `5dc45dd87` writes: `rescan`, `PUT info`, streaming `DELETE`
- `4d2e92927` `buildDoorList` extracted from `BBSApi` so three callers share
  one precedence rule

Routes are nested under `/installed/` because `:cmd` is `[A-Za-z0-9]{1,12}`,
which matches the literal string `installed`. The spec's table was updated.

**Security verified on live**: traversal `403` with no content, absolute path
`403`, no token `401`.

**`enabled` deliberately became `rescan`.** Enable/disable already exists in the
C door - `ACCESS=255` + `DRACCESS`, `flow.h:618`, marked "do not redesign" - and
has to, because a real AmiExpress board has no API. Do not add a server-side
`enabled`.

### Five defects the sysop found, each a class

1. **`ACCESS=0` hid every door DoorRepo installed** (`d5f088468`).
   `express.e:4703` is `IF access=0 THEN RETURN TRUE`, and that TRUE is
   RESULT_NOT_ALLOWED. A door for everyone must carry **no ACCESS tooltype**.
   `ACCESS=255` is unaffected and still means sysop-only.
2. **A deploy resurrected deleted doors** (`811bc7cd9`). `sync_tracked` read
   "absent from the volume" as "never placed yet". The manifest already
   distinguishes them.
3. **Uninstall left orphan registrations** (`ba35360d8`). A door is not always
   registered under its own name - 5D-LogOff is registered as `G` - so deleting
   the door left `G.info` shadowing the internal goodbye command and **logging
   off was impossible**.
4. **The door list was three caches deep** (`f30629674`). The delete path
   refreshed `amigaDoorManager`'s scan, which `initializeDoors` does not read,
   and nothing invalidated `commandCache`. `invalidateBbsCommandFreshness()`
   existed for exactly this and **had no caller anywhere**.
5. **`L` froze for 30 seconds** (`2277ae4bc`). See below.

### A 68K door cannot call the BBS it runs inside

The emulator runs IN the backend's Node process. A door blocking in
`WaitSelect` starves the event loop that would produce the reply:

    send data: GET /api/door-admin/installed
    WaitSelect(nfds=1, timeout=30000ms)
    WaitSelect returning 0        <- timed out
    Received 21470 bytes          <- the reply, 30s late

Requests to the **remote** catalog are unaffected - another machine produces
those. The BBS now writes `Doors/DoorRepo/DoorRepo.doors` beside the launch
token, same moment, same encoding, same `DOORS|` body the route returns.

**`report_install_to_bbs` has the same defect and has never worked on this
board.** Installs through DOORREPO are not recorded in `door_installs`.

### doorserver: one classifier

`4409f53` in `/Users/spot/Code/amiexpress-doorserver`. The admin strip-preview
classified live; `GET /files` served `is_junk` stored at index time. The sysop
saw one answer and the door another on the same archive.

`classify.ts` fingerprints the archive's size/mtime, the seed rule files, the
learned patterns and the keep-list, re-runs the same `analyzeArchive` when that
moves, and writes the result back - healing `junk_count` and bumping
`indexed_at`, which is what moves the catalog revision so caches refetch.

Verified live on `-D-CALC.LHA`: `FILES|11|2` -> `FILES|7|0`. The archive had
been stripped outside the tracked path and the catalog still described the
pre-strip file.

### DOORMAN: ENTER runs the door

`4ce772d9f`. `bbs.executeCommand()` queues while `inDoorManager` is set and the
BBS runs it after the door exits - two 68K doors cannot share a node.

`app.ts` hit the repo's 2000-line ceiling. Three things came out rather than
bypassing the check: `run-door.ts`, `installed-footer.ts`, and a `shutdown()`
shared by Q and ENTER.

## Critical references

- Emulator memory map: `web/backend/src/amiga-emulation/memory-map.ts`
- Door list, one source: `web/backend/src/doors/door-list.ts`
- Registry reload, all three caches: `web/backend/src/doors/reload-door-registry.ts`
- Path containment: `web/backend/src/doors/door-path-guard.ts`
- Snapshot for the C door: `web/backend/src/doors/door-list-snapshot.ts`
- Orphan scan: `amigaDoorManager.findRegistrationsPointingInto()`
- Deploy file rules: `docker-entrypoint.sh` `sync_tracked()`
- Classifier: `amiexpress-doorserver/src/classify.ts`
- Spec: `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`
- Plans: `thoughts/shared/plans/2026-08-31-doorrepo-phase-{b,c}.md`

## Learnings

- **The emulator logs corruption and continues.** `VERIFICATION: n FAILED`
  and `CRITICAL: n library trap(s) missing` are real failures presented as
  noise. Two sessions read past them.
- **Give the door probe 20 s.** Less kills the harness before it boots and
  reports an empty run that looks exactly like a dead door.
- **A green API is not a green disk.** I compared an API's md5 against the same
  API's md5 and concluded a strip had not run. The archive on disk had been
  stripped for months; only the catalog was stale.
- **A door is not always registered under its own name**, and registrations
  live in `Conf<N>Cmd` and `Node0Cmd` as well as `BBSCmd`.
- **A failed deploy leaves the board DOWN.** The script stops the container,
  builds, then starts. On 2026-08-31 the Docker daemon dropped its socket
  mid-build and the BBS stayed down until noticed.
- **Symlink `node_modules` into any worktree** (root, `web/backend`,
  `Doors/door-manager`, `sdk`, **`Doors/grandmaster`**) or the pre-commit door
  build fails. The grandmaster one is missing from the older note.
- **Anchor splices on definitions, not prototypes.** A `python` index splice
  matched `board_loop_ansi`'s forward declaration and deleted `g_board`,
  `board_add_line` and `board_load`. Three offset-based edits misfired today;
  prefer the edit tools.

## Next steps, in order

### 0. BLOCKED ON THE SYSOP - prune 277 orphaned registrations

**258 of 354 `BBSCmd` registrations, 277 across the whole `Commands` tree,
point at files that do not exist.** Aftermath of the 30 August incident that
wiped `Doors/`. Every one answers with an error instead of falling through -
that is what `BR`, `BV`, `BADD` and `BROADCAST` are.

Scanner is already on the container at `/tmp/prune-orphans.js`, dry-run
verified. The agent is blocked by the harness classifier from running bulk file
moves on production; the sysop must run:

    ssh -i ~/.ssh/hetzner_deploy -p 22 root@89.167.21.154 \
      'docker exec amiexpress-bbs sh -c "cp /tmp/prune-dryrun.txt /app/data/bbs/Commands/.orphan-prune-audit.txt; node /tmp/prune-orphans.js --apply > /tmp/prune-applied.txt 2>&1; tail -3 /tmp/prune-applied.txt; cp /tmp/prune-applied.txt /app/data/bbs/Commands/.orphan-prune-applied.txt"'

Renames to `.orphaned`, never deletes. Audit written to the volume. Six of them
are `SysCmd` event hooks (`annlogon`, `PWFAIL`, `quick`, `ANSI`, `EXAMINE`,
`XPR`) - if logon or password-fail behaves differently afterwards, restore those
first.

### 1. Registry guard: a dead registration should not enter the menu

Skip a command whose resolved LOCATION does not exist when `initializeDoors`
builds the registry. Fixes the `BR`/`BV`/`G` class permanently rather than by
cleanup, and would have prevented the logoff breakage outright. Log what was
skipped so a sysop can see it. `door.handler.ts:4120` is where the registry is
assembled; `resolveDoorDirectory` in `door-list.ts` already resolves the path.

### 2. A failed deploy must not leave the board down

`docker-entrypoint.sh` / the deploy workflow stop the container before building.
Build first, swap after. Cost this session one unplanned outage.

### 3. `report_install_to_bbs` has never worked

Same in-process HTTP limitation as `L`. The door must not call the BBS
synchronously. Either the door writes a file the BBS picks up on exit, or the
BBS records the install itself when it sees the door's index change. Until then
`door_installs` stays empty for DOORREPO installs.

### 4. DOORMAN writes `ACCESS=0` too

`buildDoorInfoContent()` in `Doors/door-manager/` has the same hardcoded `0`
fixed in the C door by `d5f088468`. Every door installed through DOORMAN is
hidden in the doors listing.

### 5. doorserver: stale size and digests

`classify.ts` heals the file list and `junk_count` but not `archive_size`,
`md5` or `sha256`. An archive changed outside the tracked path keeps its old
digest, and the door prints "the catalog digest is probably stale" on download,
falling back to SHA-256. Extend `freshArchiveFiles` to re-stat and re-digest
with `getArchiveChecksums`, and set `ads_stripped` when nothing is left to
strip.

### 6. `7hE-EdGE` matches no strip pattern

One "Learn as junk" in the admin UI fixes it for every archive; the door now
sees learned patterns because of `4409f53`.

### 7. Phases D and E

The remaining DOORREPO screens (metadata/DIZ panel, `.info` editor, delete log)
and retiring DOORMAN. `L` and `F` exist. Watch the ~46 KB of BSS headroom.

## Untested on live

- `PUT /installed/:cmd/info` - the only route that writes a real `.info`
- streaming `DELETE`
- deleting a door end to end, and confirming it survives a deploy
- DOORMAN's ENTER (in `4ce772d9f`, deploying at time of writing)

## Other notes

- Live: `https://bbs.uprough.net`, door server `https://doors.uprough.net`.
  Host `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, port 22.
  `BBS_DATA_DIR=/app/data/bbs`. Backend listens on **3001**, not 3000.
- The board has real users in `/chat`. Every deploy disconnects them; this
  session pushed a dozen times.
- `Commands/` legitimately contains `0.info`, `1.info`, `<.info`, `>.info` -
  numeric and symbol command names are not corruption.
- A peer session's stash sits in the shared repo:
  `stash@{1}: WIP on fix/admin-audit-remediation`. Left untouched.
- Peer worktrees hold ~3 GB under `/tmp` (`admin-remediation-wt`, `qix-work`,
  `frogger-work`). The local disk hit `ENOSPC` mid-test-run this session.
