# Handoff

## PETSCII overhaul shipped (2026-09-02)

True C64 support, not xterm-with-a-C64-font: `PetsciiMachine` +
`PetsciiCanvas` (`packages/terminal/src/petscii/`), a KERNAL-accurate 40x25
screen-code/color-RAM emulator fed raw bytes over the new `petscii-bytes`
socket event; xterm hides (not destroyed) while it's active. Backend:
screen-code conversion, reverse video, VIC-II truecolor palettes
(`c64-palette.ts`), a real-C64 output path (`petscii.util.ts`). Detection
ladder, strongest first: `TELNET_PETSCII_PORT` dedicated port (C64 from byte
one) > TTYPE > DEL-probe on first keypress (`$14`/`$C1`-`$DA` vs ASCII, at
connect and at the graphics prompt) > NAWS 40x25 (hint only). Docs:
`ARCHITECTURE.md`, `CONFIGURATION.md` section 5, closure table in
`thoughts/shared/research/2026-09-01_petscii-audit.md`.
**Not done - sysop follow-up:** `TELNET_PETSCII_PORT` has no compose port
mapping or `ufw` rule yet, unreachable from outside the container. **Known
gaps, by design:** `writePetsciiLine(Buffer)` still uses the old PUA/xterm
path; real-C64 cursor/F-keys are dropped by the input converter; canvas
needs a click to focus; PETSCII screens bypass MCI/`~SP`.

## Alt+Enter, the volume that deletes, CARD LOBBY (2026-09-02, late)

`thoughts/shared/handoffs/2026-09-02_the-key-handler-the-volume-that-never-deleted-and-card-lobbys-nocheck.md`
is the record; all three are verified in the live container.

**xterm keeps ONE custom key handler** - `attachCustomKeyEventHandler`
assigns, it does not append - and BBSTerminal registered two, so Shift+Arrow,
copy/select-all with mouse reporting off and the Ctrl+Shift+M block had never
run. One handler now, rules in `classifyKey()`
(`packages/terminal/src/utils/key-overrides.ts`). **Alt+Enter also fullscreens
the browser**, on the KEY because `requestFullscreen` needs a user gesture;
in game mode it toggles the window and sends NO bytes, or the door toggles
twice per press.

**The Doors volume deletes** - `prune_image_door_dists()` in
`docker-entrypoint.sh` mirrors image door `dist/`: only doors the IMAGE ships
(a DOORREPO door exists on the volume alone), only inside `dist/`, only
compiled output whitelisted by extension, never against an empty image dist.
**That whitelist exists because a dry run against the live volume found
frogger's and super-qix's `highscores.json` inside `dist/`.** Dry-run any
delete path against the real volume before shipping it.

**CARD LOBBY's `// @ts-nocheck` hid six crash paths** - gamepad X/Y/A/START at
an UNO table, the R key, the end of every UNO game, deleting a table. Fixed;
dead SDK browser mode (192 lines, reachable only from itself) removed; four
managers extracted; 1923 lines, tsc clean, size switch in.
`tests/doors/card-lobby-typechecks.test.ts` fails if the suppression returns.
**NOBODY HAS DRIVEN THOSE SIX PATHS.**

## The size switch, the editors, the battle royale (2026-09-02)

`thoughts/shared/handoffs/2026-09-02_the-size-switch-the-editors-and-a-real-battle-royale.md`
- the ANSI editor audit and grandmaster's 99-player battle royale.

**Responsive is FOUR things**: ask the terminal to widen, follow the resize,
put 80 columns back (`sdk/utils/terminal-mode.ts`), and be able to RECEIVE
the key that asks. Doors with the switch, all starting FIXED: grandmaster
(also Settings > DISPLAY), sprite-editor, ansi-editor, livechat (wide only on
/chat), bug-tracker, bbs-dashboard, doors-menu, theme-picker, scrollwars,
card-lobby.

**A source pin proves a call exists, not that it runs.** The ANSI editor door
threw on start for every caller while a test asserted its source mentions
`createTerminalModeSwitch`. Doors that got it later have tests that START
them.

## READ THIS FIRST

**Door rendering:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`.
Backend line-wrapping corrupted doors painting at absolute cursor positions;
fixed by `positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`).
Debug rendering by CAPTURING real traffic (`XIM_DEBUG=1 XIM_DEBUG_JSON=1
XIM_DEBUG_AMIGA=1`), never by guessing. Earlier 09-01 handoffs (settings
admin, sysop list/SMTP, activity feed) and 08-31 (delete rules/DOORREPO) sit
behind it.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk;
check the store the CONSUMER reads (`db.authenticateUser` reads the users
table, express.e and the signup prompt read the .info files).
**A door must never resolve its own files from `process.cwd()` or bare
`__dirname`** - use `resolveDoorRoot(__dirname)`/`resolveBbsRoot(__dirname)`.
Tests: `tests/doors/doors-do-not-use-cwd.test.ts`,
`tests/no-hardcoded-home-paths.test.ts`.

**A door is its REGISTRATION.** The `.info` file is the source of truth for
delete/install/list; read `web/backend/src/doors/door-registration-paths.ts`
and its case table `examples/doorrepo-c/tests/delete-rule-cases.txt` (the
same rules exist in C, `examples/doorrepo-c/flow.c`, for DOORREPO on real
Amiga boards). **Fix one side, fix the other.**

**DOORMAN is kept.** The parity spec's phase E is withdrawn; do not delete
`Doors/door-manager`.

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

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it -
two agents in one door pull each other's half-finished work into a commit, so
use separate worktrees. A worktree also needs each door's `node_modules`
symlinked, or a suite importing that door fails to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill). A
crunched door needs MORE emulator memory: crunched DoorRepo (513 KB) is
refused by the 500 KB door region.

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

**LIVE, verified through the loader in the container:** no invented screen
fallback; 41 nodes keep their own screens and 215 read `Screens/Node/` by
tooltype; every conference path reads LOCATION.n, doors included
(BB_CONFLOCAL, MSGBASE_LOC).

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff.
`dev/scripts/provision-node-screens.ts` gives a node screens and is NOT in the
deployed image (`dev/` is not copied).

**Phase 2, the ANSI editor in the browser, is 2 of 6 tasks in.** Plan:
`docs/superpowers/plans/2026-09-02-screen-manager-phase-2-browser-ansi-editor.md`.
SDK core aliased into the admin bundle from SOURCE, base64/CP437 bridge done.
Colour there is SGR minus 30 - red is 1, not the palette's 4.

The PETSCII overhaul's edits to `screen.handler.ts` (.seq branches) landed
2026-09-02 - no more hold-off needed there.

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
7. **Survey every TypeScript door for hand-rolled widgets.** CARD LOBBY used
   SDK widgets but hand-rolled what the SDK already provides - it computed
   panel geometry instead of using the layout widget, built an opaque black
   box instead of `Overlay`, and made bars from plain boxes. EVERY defect
   reported on 2026-09-02 lived in a hand-rolled part: panels that never
   moved, dialogs that could not be closed, modals on a black screen, stray
   white borders. The SDK ships `overlay`, `layout`, `status-bar`,
   `menu-bar`, `confirm-modal`, `doc-modal`, `prompt`, `search-modal`,
   `panel`, `fkey-bar`. Check each door against that list.
8. **Drive CARD LOBBY by hand** - the four gamepad paths, the end of an UNO
   game, and deleting a table have never worked at all.

## Gotchas

- **A green API is not a green disk**, and a symbol-free binary is not one
  that was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`
  and `CRITICAL: n trap(s) missing` are real failures shown as noise.
- **Never `git stash` here** - the CRLF phantom files block `stash pop`
  permanently. Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible
  until `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
