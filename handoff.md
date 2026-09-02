# Handoff

## START HERE: work finished but NOT committed (2026-09-02)

`.../handoffs/2026-09-02_the-doors-that-could-not-run-and-the-widgets-they-built-themselves.md`
is that session's record.

**GRANDMASTER's two layout fixes are written and uncommittable**, saved as
`thoughts/shared/patches/2026-09-02_grandmaster-layout.patch`: the menu's
full-screen background stops outlining the terminal, and the leaderboard
measures from the screen and re-renders on resize (it had NO resize handler).
Blocked - GRANDMASTER does not typecheck at HEAD (`endMatch`, `lockFlashChar`)
and the hook rebuilds the dist. Land when it compiles.

**Every defect that day was a door hand-rolling a widget the SDK ships** -
CARD LOBBY computed panel geometry, built an opaque Box instead of `Overlay`,
wrote its own text window whose escape keys never fired. Check every door
against `overlay`, `layout`, `status-bar`, `menu-bar`, `confirm-modal`,
`doc-modal`, `prompt`, `search-modal`, `panel`, `fkey-bar`:
`.../research/2026-09-02_doors-that-hand-roll-sdk-widgets.md`.

Only ONE door used to be compiled during the image build; two gates stop that
now (`docker/verify-door-entries.sh`, `tests/doors/door-dist-is-shipped.test.ts`),
and the deploy backs up door data, WAL files included.

## Earlier on 2026-09-02

`..._the-key-handler-the-volume-that-never-deleted-and-card-lobbys-nocheck.md`,
`..._the-size-switch-the-editors-and-a-real-battle-royale.md`. Carry:
**xterm keeps ONE custom key handler** - it assigns, it does not append; every
rule lives in `classifyKey()` (`packages/terminal/src/utils/key-overrides.ts`).
**Alt+Enter fullscreens the browser too**, on the KEY. **The Doors volume
deletes** - `prune_image_door_dists()` in `docker-entrypoint.sh`; dry-run any
delete path on the real volume. **`// @ts-nocheck` is a bug report** - one line
hid six missing methods in CARD LOBBY; the ten size-switch doors are fixed.

## READ THIS FIRST

**Door rendering:**
`.../handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`. Backend
line-wrapping corrupted every door painting at absolute cursor positions; fixed
by `positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`) -
a door that moves the cursor is PAINTING and has no lines to wrap.

**Bytes are milliseconds in a 68K door** - ~45ms per 198-byte XIM message,
measured. Never send a colour already set, or pad rows on a cleared screen.

**Debug a door's rendering by CAPTURING it** - `XIM_DEBUG=1 XIM_DEBUG_JSON=1
XIM_DEBUG_AMIGA=1`, never by guessing; that handoff carries the log-parsing
trap that fakes a reproduction.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, computer list, screen type,
door settings and a password each exist in SQLite AND on disk, and the BBS and
the admin do not always read the same one - eight reports in one day. Check the
store the CONSUMER reads: `db.authenticateUser` reads the users table,
express.e and signup read the .info files.
**A door must never resolve its files from `process.cwd()` or bare
`__dirname`** - use `resolveDoorRoot(__dirname)` and `resolveBbsRoot(__dirname)`.
Two tests fail on the pattern (`tests/doors/doors-do-not-use-cwd.test.ts`,
`tests/no-hardcoded-home-paths.test.ts`).
**Doors, deletes, DOORREPO:**
`.../handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md` and the two
behind it.

**A door is its REGISTRATION** - five live reports in one day were the `.info`
left behind or another door's taken away. Before any delete/install/list path,
read `web/backend/src/doors/door-registration-paths.ts` and its case table,
`examples/doorrepo-c/tests/delete-rule-cases.txt`. The same rules exist in C
(`examples/doorrepo-c/flow.c`). **Fix one side, fix the other** - the shared
table fails until you do.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`, key
`~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`. Backend on 3001.

Push to `main` auto-deploys; **then check it** -
`docker exec amiexpress-bbs cat /app/.git-sha`. Green CI has lied. A deploy that
builds but cannot serve rolls back by itself. Deploys disconnect /chat after a
60s countdown. Docs changes do not deploy.

**`main` moves under you** - other sessions push constantly. Cut a worktree
from fresh `origin/main`, cherry-pick, confirm ancestry before pushing and
before deleting. A worktree needs `Documentation/7-Reference Sources/NDK3.2R4`
symlinked in before it can build the Amiga door.

## Dev

`./dev/scripts/start-servers.sh --bbs-only` / `kill-servers.sh`, zombie-verify
after every stop. A change that "does not apply": clear the tsx cache,
`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

Run **`npm run typecheck:tests`**, not just `npm test` - jest uses swc and
strips types, so a file can be green under jest and fail the typecheck.

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it -
two agents in one door pull each other's work into a commit, so use separate
worktrees. A worktree also needs each door's `node_modules` symlinked, or a
suite importing that door fails to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill). A
crunched door needs MORE emulator memory: crunched DoorRepo (513 KB) is
refused by the 500 KB door region.

## Next

**START HERE:** `.../handoffs/2026-09-02_screen-manager-conference-paths-and-the-editor.md`
- screen file manager, conference directories, editor phase 2, and what each
cost.

**Phase 2 is DONE - the SDK's ANSI editor runs in the admin.** Record:
`.../handoffs/2026-09-02_browser-ansi-editor-phase-2-complete.md`. Nothing
written twice: canvas, ten tools, undo, CP437/SAUCE codec are the DOOR'S, from
`sdk/engines/ui/ansi-editor` SOURCE; the browser adds renderer and input.
Colour there is SGR minus 30 - red is 1, not EGA's 4.

**Conferences + screen resolution (LOCATION.n / SCREENS tooltype, the deploy
re-seeding bug, what is LIVE):** in the START HERE handoff above.

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff (5,865
lookups). `dev/scripts/provision-node-screens.ts` gives a node screens; NOT in
the image, so copy it in to run it there.

Also open:

1. **Yours:** nobody has driven the screen manager, the browser ANSI editor or
   DOORREPO's `T`/`H`/`ENTER`/uninstall by hand (`Doors/emp_tools`).
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests, never a
   drive on the LIVE board.
3. **The release ships THIS board** - `Dockerfile:262-300` copies our
   `Screens`, `Conf1`-`Conf14`, `Node0`-`Node40`. Needs a spec.
4. `Conf<N>.Stats` is keyed by NUMBER, deliberately - a position, like
   conferenceAccess. Look there first if conference stats read wrong.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON PURPOSE:
   the cheap version broke re-sort and its test caught it.
6. Audio stutter: one cause fixed, never confirmed.
7. **Drive Setup (sysop, 2026-09-02):** the admin's drive section is suspected
   of doing very little - find what `Drives.info` reaches. Wanted: online
   storage (S3 and the like) as a place a board's files can live.
8. **Drive CARD LOBBY by hand** - the four gamepad paths, the end of an UNO
   game and deleting a table have never worked at all.

**Doors/GWall vs Doors/Gwall blocks rebases.** Two tracked blobs,
`Doors/{GWall,Gwall}/dist/index.js`, are one file on a case-insensitive disk,
so one always reads as modified and `git rebase` refuses to start in any
worktree. Needs a decision on which name survives; `GWALL.info` points at
`DOORS:GWall/GWall`, and the lowercase path has the package.json.

## PETSCII + 40 columns (2026-09-02)

A web `P` answer or a real C64 gets EVERYTHING as PETSCII - one transducer
(`sdk/petscii/`, KERNAL oracle inside) feeds the canvas and telnet emitter.
Overlay retired; a C64 terminal is BLACK; only `$02 <colour>` moves
background/border. Detail: `.../handoffs/2026-09-02_petscii-full-canvas.md`.

**The board is adapted to 40 columns** (8 tasks, NOT pushed - lands as ONE
push; Task 1's gate is default-closed): MIN_COLUMNS gate with `[40]`/`[C64]`,
SDK XXS=40 tier, sixteen narrow tables, screen reflow with an `[80-COLUMN ANSI
SCREEN - SKIPPED]` token, six adapted doors, effects OFF (wipes, rail, glitch)
on PETSCII. Two chokes - `wrapForSession` (BBS prose) and
`wrapDoorTextForSession` (`BBSApi.write`) - both identity for any ANSI caller
at any width and for anything positioning the cursor. A row may use 40 columns,
a prompt 39; `web/backend/tests/forty-col-sweep.test.ts` sweeps every surface.
**Commits, limits, SYSOP'S C64 WALK:** `.../handoffs/2026-09-02_c64-40col-adaptation.md`.

**80-column 68K doors reach a C64 too** (Phase 3, NOT pushed): `WHO`, `S`,
`WHAT` carry `C64_ADAPT=40`, show `[C64]`, and each finished frame is reduced
to 40 columns (`>` marks a shortened column). ANSI bytes untouched. **Seam,
limits, Phase 4, C64 WALK:** `.../handoffs/2026-09-02_c64-door-adapter-phase3.md`.

## Gotchas

- **A green API is not a green disk**; a symbol-free binary is not one that
  was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`,
  `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Never `git stash` here** - CRLF phantom files block `stash pop` for ever.
  Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible until
  `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
