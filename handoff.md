# Handoff

## SPRITED is a fork of the ANSI editor door (2026-09-01)

Full record:
`thoughts/shared/handoffs/2026-09-01_sprite-studio-fork-and-the-responsive-switch.md`

It was built twice the wrong way first - a studio that hosted the editor as
a widget, which read as two applications bolted together - before becoming
what the design doc always asked for: a fork of
`Doors/ansi-editor/index.ts`. ONE full-screen editor, Deluxe Paint shaped:
its own menu bar, its own sidebar, its own status line, requesters for
everything else. Frame / Sprite / Zoom / Animation are contributed into the
EDITOR's bar via the SDK's `extraMenus`. **It opens with the requester, not
a browser screen.**

Hotkeys are all non-printable, because the editor types printables onto the
canvas: `C-f`/`C-b` frame, `C-e` animation, `C-p` play, `C-o` onion skin,
`C-g` guide, `C-c`/`C-v` frame clipboard, `Alt+Enter` size, wheel zooms.

**Responsive is THREE things**, and shipping one of them does nothing: ask
the terminal to widen (`bbs.enableWideMode()` - BBSTerminal starts fixed at
80x25 and says so in its own source), follow the resize, restore 80 columns
on exit. `sdk/utils/terminal-mode.ts` does all three; doors supply what
re-layout means for them.

**8 commits are NOT on main**, two of them other sessions' - check the
`Claude-Session` trailer before landing. Next work, in order: wire
grandmaster's width-aware versus layout into its render path (the decision
is done and tested, the render path is not); floating toolbars in SPRITED
when wide; roll the size switch out to the other doors (six are 82's);
Alt+Enter to also toggle browser fullscreen; clean eight stale files off the
live volume; land and verify.

## Arcade doors and the camera (2026-09-01, earlier) - ALL LANDED

`thoughts/shared/handoffs/2026-09-01_arcade-doors-ansi-editor-and-the-camera.md`
is the record. Frogger's sprite pass, Pengo on the arcade's real grid with
the cell-art camera, sprite flipping, and the first ANSI editor convergence
are all on main and live as of `bd3ff7317`.

Pengo's two later fixes are live too: the wall ring stopped eating 3-15 ice
blocks a level (it sits OUTSIDE the arcade's 13x15 now), and a block in
flight is solid, so the penguin no longer rides the block he pushed into a
Sno-Bee.

## READ THIS FIRST

**Door rendering, the deploy that lies, the disk:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`
is the current state.

**The backend used to line-wrap screen paints.** Every door that paints at
absolute cursor positions was being corrupted whenever one 198-byte XIM
message ran past the wrap column - a newline pushed into the middle of a
paint, so the rest of the row started the row below. Fixed by
`positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`):
a door that moves the cursor is PAINTING and has no lines to wrap. If a
door still looks subtly wrong, check it against that.

**Bytes are milliseconds in a 68K door.** ~45ms of emulation per 198-byte
XIM message, measured. A screen paint's cost is its byte count. Do not send
a colour already set, and do not pad rows on a screen that was just cleared.

**Debugging a door's rendering: capture, do not guess.** Three wrong
conclusions in one session ended the moment the door's real traffic was
captured with `XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`. The method
is written down in that handoff, including the log-parsing trap that
manufactures a convincing fake reproduction.

**Start here for 2026-09-01:** the three handoffs of that date -
`..._door-settings-admin-and-the-two-store-class.md`,
`..._sysop-list-smtp-to-config-files.md`, and
`..._activity-feed-screen-parity-and-the-live-board.md` (latest).

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one. Eight reports in one
day were all this. Before believing any config change works, check the store
the CONSUMER reads: `db.authenticateUser` reads the users table, express.e and
the signup prompt read the .info files.
**A door must never resolve its own files from `process.cwd()` or bare
`__dirname`** - cwd on the board is `/app/web/backend` and `__dirname` is
`dist/` in production. Use `resolveDoorRoot(__dirname)` for the door's own
directory and `resolveBbsRoot(__dirname)` for the board. Two tests fail on the
pattern: `tests/doors/doors-do-not-use-cwd.test.ts` and
`tests/no-hardcoded-home-paths.test.ts`.
**Doors, deletes, DOORREPO:**
`thoughts/shared/handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md`
is the state behind it. Behind it: `..._doorrepo-doors-and-deploy-fixes.md`
(the morning), `..._session-handoff.md` (admin, finished and deployed).

**A door is its REGISTRATION.** Five live reports in one day were the same
defect: the `.info` left behind, or another door's `.info` taken away.
Before touching any delete/install/list path read
`web/backend/src/doors/door-registration-paths.ts` and the case table it is
pinned to, `examples/doorrepo-c/tests/delete-rule-cases.txt`. The same rules
exist in C (`examples/doorrepo-c/flow.c`) because DOORREPO runs on real
Amiga boards with no server to ask. **Fix one side, fix the other** - the
shared table fails until you do.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo: `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`,
key `~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`. Backend on 3001.

Push to `main` auto-deploys; **then check it** -
`docker exec amiexpress-bbs cat /app/.git-sha`. Green CI has lied. A deploy
that builds but cannot serve now rolls back to the previous image by itself.
Deploys disconnect /chat after a 60s countdown. Docs changes do not deploy.

**`main` moves under you** - other sessions push constantly. Cut a worktree
from fresh `origin/main`, cherry-pick, confirm ancestry before pushing and
before deleting anything. A worktree needs
`Documentation/7-Reference Sources/NDK3.2R4` symlinked in before it can build
the Amiga door.

## Dev

`./dev/scripts/start-servers.sh --bbs-only` / `kill-servers.sh`, and
zombie-verify after every stop. A change that "does not apply": clear the tsx
cache, `rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

Run **`npm run typecheck:tests`**, not just `npm test` - jest uses swc and
strips types, so a file can be green under jest and fail the typecheck.

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it;
two agents in one door pull each other's half-finished work into a commit.
Use separate worktrees.

**Door releases are Shrinkler-packed** - see the `shrinkler-door-releases`
skill. A crunched door needs MORE emulator memory, not less: crunched
DoorRepo (513 KB) is refused by the 500 KB door region, a smaller door is
fine.

## Next

**Activity overview: built** - commands, sentences, door categories, live node
state in words, and an On-the-board-now panel with idle time. Still
unreported: which message base, which file area. Additive now.

**QUEUED BY THE SYSOP: a screen file manager** - the admin cannot touch screen
files today. 891 files, 85 distinct: express.e reads each screen type from ONE
directory, so the duplicates are correct. Sharing is the `SCREENS` tooltype -
the node half works now, the conference half (express.e:5053) does not.
Scoping:
`thoughts/shared/research/2026-09-01_screen-file-manager.md`.

**`feat/door-themes` is superseded** (verified with git, 2026-09-01): its
non-theme changes are byte-identical to main, its theme lines are the draft
today's theme work replaced. Deleting it is the sysop's call.

**LIVE, container `7f42fe3cc`: the invented screen fallback is gone and the
`SCREENS` tooltype works.** A NODE screen comes from nodeScreenDir alone, and
nodeScreenDir is the node's `SCREENS` tooltype (ACP.e:2666-2673) before it is
`Node<N>/`. MAX_NODES stays 255: the live volume is provisioned - 41 nodes
keep their own screens, 215 point at `Screens/Node/`, seeded once. Node
Configuration has a Screens Directory field. Verified by driving the loader
inside the container: nodes 1/40 on their own directories, 41/90/100/200/255
on the shared set, every node screen at every level, no nulls. Record and
method: `thoughts/shared/handoffs/2026-09-01_screen-fallback-removed.md`.

`dev/scripts/provision-node-screens.ts` is how a node gets screens later (dry
by default). It is NOT in the deployed image - `dev/` is not copied - so it
has to be put into the container to run there.

**Measure screens with the board's own log** - `docker logs amiexpress-bbs |
grep loadScreenFile` prints the locations tried and the file chosen. A glob, a
`head -6` and a case-sensitive `[ -e ]` each lied about this.

Also open:

1. **Yours:** nobody has driven DOORREPO's `T` (config), `H` (history),
   `ENTER` (run) or an uninstall in a shared directory by hand.
   `Doors/emp_tools` holds two doors and is the interesting case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests; what has
   never happened is a drive against the LIVE board.
3. Admin tables: DONE. Every page is on `DataTable` except Node
   Configuration, which keeps `DataGrid` on purpose. The raw `<table>` this
   used to list was the config-app's GlobalWall page, REMOVED with its route
   and backend - only the redirect in `legacy-routes.ts` is left, and the
   merge of `feat/installed-door-link` did not bring it back.
4. Admin remediation 5.3 (memoising nine pages' columns) stays open ON
   PURPOSE: the cheap version broke re-sort and its own test caught it, and
   there is no measured render problem.
5. `Doors/door-manager/app.ts` is 1480 lines now (was 1971): DoormanLayout,
   DocView/StripView and the require.cache service getters moved out.
6. Audio stutter: one cause fixed, diagnostics live, never confirmed.

## Sysop's list (2026-09-01) - DONE, all six live and verified by sha

All six live and verified by sha. Full record:
`thoughts/shared/handoffs/2026-09-01_sysop-list-smtp-to-config-files.md`.
Two limits outlive the tasks: this board's file checkers name Amiga
binaries Linux cannot execute (uploads use the JavaScript checkers), and
nothing here 'runs' a transfer protocol - Protocols/*.info is admin-only
config. And a case bug cannot be caught on a Mac: HFS+ is
case-insensitive, so pin the spelling at the source.

## Gotchas

- **Read the mutation path; do not count.** Three false positives.
- **A green API is not a green disk**, and a symbol-free binary is not one
  that was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`
  and `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Give the door probe 20 s.** Less kills the harness before it boots.
- **Never `git stash` here** - the CRLF phantom files block `stash pop`
  permanently. Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible
  until `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
