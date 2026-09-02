# Handoff

## START HERE: the screen manager (2026-09-02, latest)

`..._2026-09-02_the-screen-manager-and-what-the-board-knows.md` is the record.
LIVE at `380f7b4af`.

**The manager kept reporting untruths of one shape: a check answering a
question nobody asked** - "read by nothing" meant "not the level-255 pick";
the health check read `/app` not `/app/data/bbs`; `xpr` vs `Xpr`, `doors/` vs
`Doors/`, `Conf1/Screens` by NUMBER where conference 1 is Conf2. **Check a
claim against the board before believing it.**

`/admin/screens` opens on a GALLERY of every screen and bulletin; a file says
what it IS ("CONF_BULL in Amiga Demoscene - level 20-29"), every fact from the
board or express.e via `dev/scripts/generate-screen-provenance.ts`.

**The ESC-byte repair HAS been used** (many of the 47 stripped `[0;1;31m`
files, 41 copies of one NODE_BULL.TXT); nobody has checked a repaired screen
on the board yet.

## GRANDMASTER against HeborisCE (2026-09-02)

`..._grandmaster-backlog-devil-items-and-the-settings-that-did-nothing.md` is
the record. **The reference is HeborisCE**, NOT TetriNET. 369 tests; backlog
clear but MISSION.

**THE CLASS TO CHECK FIRST HERE: a setting nothing reads.** Three in one pass:
`sonic_drop` handled by nothing (hence ACE-ARS's up-key lock "blocked on
inventing a key"), `softDropSpeed` with a row, a range and no consumer, item
pools drawing items the engine could not carry out. Ask who CONSUMES a knob.

Landed: Death 20G from level 0, ends 1300, climbs its dgname ladder to GOD; `itemMode` reaches every mode; DEATH BLOCK (BIG), ROLL ROLL,
ROTATE LOCK, HIDE NEXT, <->REV, BOOST; versus level/line goals; HIDDEN;
PRACTICE goals. **CEMENT is not in HeborisCE at all.** **MISSION is
data-driven** (`loadMissionData`, 42 objective types) - it needs a plan.

**TELNET TAKES NO INPUT in any game-mode door.** `enableGameMode()` drops the
character path (`socket-handlers.ts:722`) for browser-only `key-down`/`key-up`
(`:499-536`); options in that handoff. Telnet RENDERING fixed (`86200b3e5`):
solid blocks via reverse video instead of `#`.

## Doors and widgets (2026-09-02)

**A ONE-ROW BOX CANNOT HOLD TEXT.** createBox/blessed.box build a Panel that
borders when none is named; pass `border: undefined`. 16 fixed, 4 left
(bug-tracker, rip-browser), pinned by `oneRowBoxesDoNotCarryAFrame`.

**A deploy dying in under 20s is the host's `git fetch`**; one dying instantly
is `concurrency: deploy-hetzner` cancelling it for a newer push. **Every defect
that day was a door hand-rolling an SDK widget** -
`..._doors-that-hand-roll-sdk-widgets.md`.

xterm keeps ONE custom key handler (`classifyKey()`); the Doors volume deletes
via `prune_image_door_dists()`; `// @ts-nocheck` is a bug report; a source pin
proves a call exists, not that it runs.

## READ THIS FIRST

**Door rendering:**
`.../handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`. Backend
line-wrapping corrupted every door painting at absolute cursor positions; fixed
by `positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`) -
a door that moves the cursor is PAINTING and has no lines to wrap.

**Bytes are milliseconds in a 68K door** - ~45ms per 198-byte XIM message.
Never send a colour already set, or pad rows on a cleared screen.

**Debug a door's rendering by CAPTURING it** - `XIM_DEBUG=1 XIM_DEBUG_JSON=1
XIM_DEBUG_AMIGA=1`, never by guessing; that handoff has the method and the
log-parsing trap that fakes a repro.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one - eight reports in one
day. Check the store the CONSUMER reads: `db.authenticateUser` reads the users
table, express.e and signup read the .info files.
**A door must never resolve files from `process.cwd()` or bare `__dirname`** -
use `resolveDoorRoot(__dirname)`/`resolveBbsRoot(__dirname)`; two tests fail on
the pattern.

**A door is its REGISTRATION** - five live reports in one day were the `.info`
left behind or another door's taken away. Before any delete/install/list path,
read `web/backend/src/doors/door-registration-paths.ts` and its case table
(`examples/doorrepo-c/tests/delete-rule-cases.txt`); the same rules exist in C
(`examples/doorrepo-c/flow.c`). **Fix one side, fix the other.**

**DOORMAN is kept** - the parity spec's phase E is withdrawn; it is the
reference implementation. Never delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`, key
`~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`, backend on 3001.

Push to `main` auto-deploys; **then check it** - `docker exec amiexpress-bbs
cat /app/.git-sha`. Green CI has lied. A deploy that cannot serve rolls back;
deploys disconnect /chat after 60s; docs changes do not deploy.

**`main` moves under you** - cut a worktree from fresh `origin/main`, rebase
or cherry-pick, confirm ancestry before pushing and before deleting. Building
the Amiga door there needs `Documentation/7-Reference Sources/NDK3.2R4`
symlinked in.

## Dev

`./dev/scripts/start-servers.sh --bbs-only` / `kill-servers.sh`, zombie-verify
after every stop. A change that "does not apply": clear the tsx cache
(`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`).

Run **`npm run typecheck:tests`**, not just `npm test` - jest strips types; a
file can be green under jest and fail the typecheck.

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it;
two agents in one door pull each other's work into a commit: separate
worktrees. A worktree needs each door's `node_modules` (and, for a door whose
tests import the SDK, a BUILT `sdk/dist` and `dist-esm`), or the suite fails
to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill); a
crunched door needs MORE emulator memory and the 500 KB region refuses some.

## Next

**The editor is the DOOR'S** - canvas, tools, undo and the CP437/SAUCE codec
come from `sdk/engines/ui/ansi-editor` SOURCE. Colour is SGR minus 30 (red is
1, not EGA 4). **Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff.

Also open:

1. **Yours, and the biggest one:** LOOK at a repaired screen (above); then the
   editor round-trip (draw, Save, "this file only"). Also DOORREPO's
   `T`/`H`/`ENTER`/uninstall (`Doors/emp_tools` is the interesting case).
   **GRANDMASTER's whole new backlog is undriven too** - items outside versus,
   Death's 1300 ending and GOD, HIDDEN, the practice and versus goals, BIG
   pieces, ROLL ROLL.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` were never driven
   against the LIVE board.
3. **The release ships THIS board** - the Dockerfile copies our Screens,
   Conf1-14 and Node0-40 into `/app/default-data`. Needs a spec.
4. `Conf<N>.Stats` is keyed by NUMBER on purpose (a position, like
   conferenceAccess) - first suspect if stats read wrong after deletes.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON PURPOSE
   - the cheap version broke re-sort.
6. Audio stutter: one cause fixed, unconfirmed.
7. **Drive Setup (sysop, 2026-09-02):** the admin's drive section may do very
   little - find what `Drives.info` reaches. Wanted: online storage (S3 and
   the like) for a board's files.
8. **Drive CARD LOBBY by hand** - four gamepad paths, the end of an UNO game
   and deleting a table have never worked.

**Doors/GWall vs Doors/Gwall blocks rebases** - two tracked blobs, one file on
a case-insensitive disk; land by cherry-pick onto an origin/main worktree until
one name survives (`GWALL.info` points at `DOORS:GWall/GWall`; the lowercase
path has the package.json).

## PETSCII + 40 columns

A web `P` answer or a real C64 gets EVERYTHING as PETSCII - one transducer
(`sdk/petscii/`, KERNAL oracle inside) feeds canvas and telnet. C64 terminal is
BLACK; `$02 <colour>` sets background and border.
`.../handoffs/2026-09-02_petscii-full-canvas.md`.

**The board is adapted to 40 columns** (8 tasks, Task 1's gate default-closed):
MIN_COLUMNS gate with `[40]`/`[C64]`, SDK XXS=40 tier, sixteen narrow tables,
screen reflow, six adapted doors, effects OFF. `wrapForSession` and
`wrapDoorTextForSession` stay identity for ANSI and positioned output. Rows 40,
prompts 39; `tests/forty-col-sweep.test.ts` sweeps all. **80-column 68K doors
reach a C64 too** - `WHO`, `S`, `WHAT` carry `C64_ADAPT=40`, show `[C64]`, each
frame reduced to 40 (`>` marks a shortened row), ANSI bytes untouched.
**Commits, limits, SYSOP'S C64 WALK:** `.../handoffs/`
`2026-09-02_c64-40col-adaptation.md`, `..._c64-door-adapter-phase3.md`.

**FULL MCI runs inside a gated `.seq`** (first byte `~`): same pre-passes,
tokenizer, dispatch and sentinel walker as `.TXT`, rendered ONCE
(`petscii-screen.render.ts`) before the transports split; values clip to the
row. **Logoff on a C64 is DATA:** the 12 `Logoff.seq` say `~SR_` (1..99), only
three 80-col `Screens/logoff/00N.logoff.txt` exist; fix = `~3SR_` + a 40-col
`00N.logoff.seq`. WALK + minors: `.../handoffs/2026-09-02_mci-in-petscii-seq.md`;
sysops: `Documentation/2-Sysops/CONFIGURATION.md` section 5.

## Gotchas

- **A green API is not a green disk**; look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`,
  `CRITICAL: n library trap(s) missing` are real failures.
- **Never `git stash` here** - CRLF phantom files block `stash pop` for ever.
  Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF** - open with `newline=''`.
- **A door archive names its command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - build first.
- **A merged admin screen keeps a redirect** (`src/routes/legacy-routes.ts`).
