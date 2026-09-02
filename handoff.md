# Handoff

## START HERE (2026-09-02)

`thoughts/shared/handoffs/2026-09-02_the-doors-that-could-not-run-and-the-widgets-they-built-themselves.md`
is that session's full record.

**GRANDMASTER's layout fixes LANDED** (`0595d0507`), from a worktree off
`origin/main`; the shared tree still holds another session's loose
grandmaster work. Backgrounds no longer outline the terminal, and the
leaderboard measures from the screen and re-renders on resize. Two
regression tests, each proven to fail on the old code.

**A deploy failing in under 20s is the host's `git fetch`**, not your
commit - anonymous HTTPS ref listing breaks under a burst of pushes.
Retried since `c41c9aacf`.

**Every defect reported that day lived in something a door built for itself
while the SDK already shipped the widget.** What to convert next:
`thoughts/shared/research/2026-09-02_doors-that-hand-roll-sdk-widgets.md`.

Three doors could not start at all - whip, Gwall, prompt-complete - because
only ONE door is compiled during the image build. Two gates stop it now:
`docker/verify-door-entries.sh` (fails the image build) and
`tests/doors/door-dist-is-shipped.test.ts`. The deploy also backs up door
data, WAL files included, because a `.db` alone is an empty header.

## Earlier on 2026-09-02

`..._the-key-handler-the-volume-that-never-deleted-and-card-lobbys-nocheck.md`
and `..._the-size-switch-the-editors-and-a-real-battle-royale.md` in
`thoughts/shared/handoffs/`. The facts still worth carrying in the head:

**xterm keeps ONE custom key handler** - it assigns, it does not append.
Every rule lives in `classifyKey()`
(`packages/terminal/src/utils/key-overrides.ts`). **Alt+Enter fullscreens
the browser too**, on the KEY.

**The Doors volume deletes** - `prune_image_door_dists()` in
`docker-entrypoint.sh`, whitelisted by extension because frogger and
super-qix keep high scores inside `dist/`. Dry-run any delete path first.

**`// @ts-nocheck` is a bug report** - one line hid six calls to methods
that do not exist in CARD LOBBY. Ten doors carry the size switch, all
starting FIXED; the archive lists them.

**A source pin proves a call exists, not that it runs.**

## READ THIS FIRST

**Door rendering:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`.
Backend line-wrapping corrupted every door painting at absolute cursor
positions; fixed by `positionsCursorAbsolutely()`
(`web/backend/src/utils/ascii-art.util.ts`) - a door that moves the cursor is
PAINTING and has no lines to wrap.

**Bytes are milliseconds in a 68K door** - ~45ms per 198-byte XIM message,
measured. Do not send a colour already set, or pad rows on a cleared screen.

**Debug a door's rendering by CAPTURING it** - `XIM_DEBUG=1
XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`, never by guessing; the handoff carries
the method and the log-parsing trap that fakes a reproduction. The other
09-01 handoffs (settings admin, sysop list/SMTP, activity feed) sit beside
it.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one. Eight reports in one
day were all this. Before believing any config change works, check the store
the CONSUMER reads: `db.authenticateUser` reads the users table, express.e and
the signup prompt read the .info files.
**A door must never resolve its files from `process.cwd()` or bare
`__dirname`** - use `resolveDoorRoot(__dirname)` and `resolveBbsRoot(__dirname)`.
Two tests fail on the pattern (`tests/doors/doors-do-not-use-cwd.test.ts`,
`tests/no-hardcoded-home-paths.test.ts`).
**Doors, deletes, DOORREPO:**
`thoughts/shared/handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md`
and the two behind it.

**A door is its REGISTRATION** - five live reports in one day were the `.info`
left behind or another door's taken away. Before any delete/install/list path,
read `web/backend/src/doors/door-registration-paths.ts` and its case table,
`examples/doorrepo-c/tests/delete-rule-cases.txt`. The same rules exist in C
(`examples/doorrepo-c/flow.c`) for real Amiga boards. **Fix one side, fix the
other** - the shared table fails until you do.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo: `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`,
key `~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`, backend on 3001.

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

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it -
two agents in one door pull each other's work into a commit, so use separate
worktrees. A worktree also needs each door's `node_modules` symlinked, or a
suite importing that door fails to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill). A
crunched door needs MORE emulator memory, and the 500 KB door region refuses
some of them.

## Next

**START HERE:** `thoughts/shared/handoffs/2026-09-02_screen-manager-conference-paths-and-the-editor.md`
is the state - the screen file manager, conference directories, and phase 2 of
the editor, with what each cost.

**Phase 2 is DONE - the SDK's ANSI editor runs in the admin.** Record:
`thoughts/shared/handoffs/2026-09-02_browser-ansi-editor-phase-2-complete.md`.
Nothing about a drawing tool was written twice: the canvas, the ten tools, undo
and the CP437/SAUCE codec are the DOOR'S, imported from
`sdk/engines/ui/ansi-editor` SOURCE; the browser adds a renderer and input and
nothing else. Colour there is SGR minus 30 - red is 1, not the EGA palette's 4.

**Conferences + screen resolution (LOCATION.n / SCREENS tooltype, the deploy
re-seeding bug, what is LIVE):** all in the START HERE handoff above.

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff (5,865
lookups here). `dev/scripts/provision-node-screens.ts` gives a node screens and
is NOT in the image, so it must be copied into the container to run there.

Also open:

1. **Yours:** nobody has driven the screen manager, the browser ANSI editor,
   or DOORREPO's `T`/`H`/`ENTER`/uninstall by hand. `Doors/emp_tools` is the
   interesting DOORREPO case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests, never a
   drive against the LIVE board.
3. **The release ships THIS board.** `Dockerfile:262-300` copies our `Screens`,
   `Conf1`-`Conf14` and `Node0`-`Node40` into `/app/default-data`. Needs its
   own spec.
4. `Conf<N>.Stats` is still keyed by NUMBER, deliberately - a position, like
   conferenceAccess. First place to look if conference stats read wrong after
   the sysop's deletes.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON
   PURPOSE: the cheap version broke re-sort, and its test caught it.
6. Audio stutter: one cause fixed, never confirmed.
7. **Drive Setup, from the sysop (2026-09-02):** the admin's drive section is
   suspected of doing very little - find out what `Drives.info` actually
   reaches - and the wanted feature is online storage: S3 buckets and the
   like, offered as a place a board's files can live.
8. **Drive CARD LOBBY by hand** - the four gamepad paths, the end of an UNO
   game, and deleting a table have never worked at all.

The PETSCII overhaul's edits to `screen.handler.ts` (.seq branches) landed
2026-09-02 - no more hold-off needed there.

**Survey every TypeScript door for hand-rolled widgets.** CARD LOBBY used SDK
widgets but hand-rolled what the SDK already provides - it computed panel
geometry instead of using a layout, built an opaque black Box instead of
`Overlay`, made bars from plain boxes, and wrote its own text window whose
escape keys never fired. EVERY defect reported on 2026-09-02 lived in a
hand-rolled part. The SDK ships `overlay`, `layout`, `status-bar`,
`menu-bar`, `confirm-modal`, `doc-modal`, `prompt`, `search-modal`, `panel`,
`fkey-bar` - check each door against that list.

**The Doors/GWall vs Doors/Gwall duplicate blocks rebases.** Git tracks two
different blobs at `Doors/GWall/dist/index.js` and `Doors/Gwall/dist/index.js`
- one file on a case-insensitive disk - so one of them always reads as
modified and `git rebase` refuses to start in any worktree. Needs a decision
on which name survives; `Commands/BBSCmd/GWALL.info` points at
`DOORS:GWall/GWall`, and the lowercase path is the one with a package.json.

## Gotchas

- **A green API is not a green disk**, and a symbol-free binary is not one
  that was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`
  and `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Never `git stash` here** - the CRLF phantom files block `stash pop`
  permanently. Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible
  until `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
