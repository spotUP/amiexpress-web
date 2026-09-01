# Handoff

## SPRITED now hosts the ANSI editor (2026-09-01)

Plan and full execution record:
`thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md`.
The studio's own painter, its toolbar and its pixel ops are gone; the SDK
widget owns the canvas, full-screen, and the door keeps frames, animations
and saving. **Open `e` from the browser, not Enter.** The widget types every
printable character onto the canvas, so the studio's hotkeys are Ctrl-only
(C-p/C-f frame, C-e animation, C-q close) and everything else is menu-driven.
**Never had a human pass:** the manual checklist in that plan's Task 7, and
half-block painting is mouse-only (handleDrawKey has no half-block stroke -
pre-existing, out of scope, measured).

## Arcade doors, the ANSIEditor convergence, and a camera (2026-09-01)

Landed on main in the merge below; the full record is
`thoughts/shared/handoffs/2026-09-01_arcade-doors-ansi-editor-and-the-camera.md`.
Frogger's sprite pass, Pengo on the arcade grid with the camera, sprite
flipping, and studio plans 2b + 2c.

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
files at all today. 891 files, 85 distinct contents: express.e resolves each
screen type from ONE directory with NO fallback, so the duplicates are
correct, and `SCREENS` (a per-node/per-conference tooltype) is its own answer
to sharing. **1:1 in the read path, better in the write path.** Also logs a
live DEVIATION - this port invents a `Screens (Fallback)` express.e does not
have. Scoping, read off the E sources:
`thoughts/shared/research/2026-09-01_screen-file-manager.md`.

**`feat/door-themes` is superseded**, verified with git rather than memory
on 2026-09-01: its non-theme changes are byte-identical to main and its
theme lines are the draft that today's theme work replaced. Deleting it
is the sysop's call - git still counts it unmerged.

**NEXT JOB, everything is in place for it: remove the invented screen
fallback.** `screen.handler.ts` searches `Screens (Fallback)`,
`Node<N> (Fallback)` and `Node<N>/Screens/` - none of which express.e has.
Every screen that leaned on them has been moved to where express.e reads it
(AWAITSCREEN, BBSTITLE, SCREEN_BULL, and the logon100/logon variants), so the
removal is now safe. What is left under `Node<N>/Screens/` and nowhere else is
`node_bull.txt` (placeholder, nothing reads the name), `callers.txt` (not a
screen) and `reqtools`. Remove it, redeploy, then RE-RUN the measurement.
Full record and the method:
`thoughts/shared/handoffs/2026-09-01_activity-feed-screen-parity-and-the-live-board.md`.

**Measure screens with the extensions the loader accepts, case-insensitively,
and confirm with the board's own log** - `docker logs amiexpress-bbs | grep
loadScreenFile` prints the locations tried and the file it settled on. Three
of my measurements were wrong today: a truncating `head -6`, a glob that
counted `BBSTITLE.SEQ`, and a case-sensitive `[ -e ]` on an Amiga volume.
`.SEQ` is this project's C64 PETSCII - it does not render right yet (known,
deferred), and resolution is not the problem.

Also open:
Nothing queued by the user. Open:

1. **Yours:** nobody has driven DOORREPO's `T` (config), `H` (history),
   `ENTER` (run) or an uninstall in a shared directory by hand.
   `Doors/emp_tools` holds two doors and is the interesting case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` are untested live.
3. `Doors/door-manager/app.ts` is ~1940 lines against the 2000 ceiling; the
   next feature there needs an extraction first.
4. Six admin pages still render their own tables instead of
   `components/ui/DataTable`. Node Configuration deliberately stays on the
   old `DataGrid`.
5. `VITE_BYPASS_AUTH` in `App.tsx` should go now that a sysop account exists.
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
