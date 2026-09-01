# Handoff

## SPRITED and the arcade doors (2026-09-01) - LANDED

`thoughts/shared/handoffs/2026-09-01_sprite-studio-fork-and-the-responsive-switch.md`
and `..._arcade-doors-ansi-editor-and-the-camera.md` are the records.

SPRITED is a FORK of `Doors/ansi-editor/index.ts`, not a host of it: one
full-screen editor, Deluxe Paint shaped, with Frame/Sprite/Zoom/Animation
contributed into the editor's own bar via the SDK's `extraMenus`. It opens
with the requester. Hotkeys are all non-printable, because the editor types
printables onto the canvas.

**Responsive is THREE things** and shipping one does nothing: ask the terminal
to widen (`bbs.enableWideMode()`), follow the resize, restore 80 columns on
exit. `sdk/utils/terminal-mode.ts` does all three.

WAITING ON THE USER: SPRITED's manual checklist, which has never been run.

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

**START HERE:** `thoughts/shared/handoffs/2026-09-02_screen-manager-conference-paths-and-the-editor.md`
is the state - the screen file manager, conference directories, and phase 2 of
the editor, with what each cost.

**A directory is never derivable from a number on this board.** A node's screen
directory is its `SCREENS` tooltype (ACP.e:2666-2673); a conference's is
`LOCATION.n` in ConfConfig.info (express.e:31849). Renumbering moves the
entries and leaves the directories alone, so `Conf<n>` built from a number
reads the DELETED conference. Two live outages this session were that mistake.
Use `web/backend/src/conferences/conference-paths.ts` and
`web/backend/src/screens/screen-resolution.ts`.

**LIVE and verified through the loader inside the container:** the invented
screen fallback is gone; 41 nodes keep their own screens and 215 read
`Screens/Node/` by tooltype; every conference path reads LOCATION.n, doors
included (BB_CONFLOCAL, MSGBASE_LOC); the admin has a Screen Files page and
conference file-area paths that follow the conference.

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff. 5,865
lookups here. `dev/scripts/provision-node-screens.ts` gives a node screens; it
is NOT in the deployed image (`dev/` is not copied), so it has to be put into
the container to run there.

**Phase 2, the ANSI editor in the browser, is 2 of 6 tasks in.** Plan:
`docs/superpowers/plans/2026-09-02-screen-manager-phase-2-browser-ansi-editor.md`.
The SDK core is aliased into the admin bundle from SOURCE, and the base64/CP437
bridge is done. Colour there is SGR minus 30 - red is 1, not the palette's 4.

**HOLD OFF on `web/backend/src/handlers/screen.handler.ts`** until session 82
posts done: their PETSCII Task 9 edits the .seq branches.

Also open:

1. **Yours:** nobody has driven the screen manager, or DOORREPO's `T`/`H`/
   `ENTER`/uninstall, by hand. `Doors/emp_tools` is the interesting case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests; what has
   never happened is a drive against the LIVE board.
3. **The release ships THIS board.** `Dockerfile:262-300` copies our `Screens`,
   `Conf1`-`Conf14` and `Node0`-`Node40` into `/app/default-data`. Needs its
   own spec.
4. `Conf<N>.Stats` is still keyed by NUMBER, deliberately - a position, like
   conferenceAccess. First place to look if conference stats read wrong after
   the sysop's deletes.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON
   PURPOSE: the cheap version broke re-sort and its own test caught it.
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
