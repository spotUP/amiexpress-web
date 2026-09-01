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

## Alt+Enter works now, everywhere (2026-09-02)

`thoughts/shared/handoffs/2026-09-02_the-size-switch-the-editors-and-a-real-battle-royale.md`
is the record, including the ANSI editor audit and grandmaster's rebuilt
battle royale (99 players, a grid of playfields, standings under your own
board; 98 bots cost 0.16 ms/frame, measured).

**Responsive is FOUR things.** Ask the terminal to widen, follow the resize,
put 80 columns back (`sdk/utils/terminal-mode.ts` does those three) - and be
able to RECEIVE the key that asks, which was broken in three places at once:
the browser never sent Alt+Enter (xterm does not ESC-prefix Option on macOS),
the SDK parser could not name ESC+CR as `M-enter`, and game mode dropped
modifiers. Alt+LETTER always worked, which is why none of it was noticed.

Doors with the switch, all starting FIXED: grandmaster (also Settings >
DISPLAY), sprite-editor, ansi-editor, livechat (wide only on /chat),
bug-tracker, bbs-dashboard, doors-menu, theme-picker, scrollwars. card-lobby
cannot have it until someone extracts from its 2826-line index.ts.

**A source pin proves a call exists, not that it runs.** The ANSI editor door
threw on start for every caller while a test asserted its source mentions
`createTerminalModeSwitch`. Doors that got the switch later have tests that
START them.

## READ THIS FIRST

**Door rendering, the deploy that lies, the disk:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`.
A door painting at absolute cursor positions was corrupted by backend
line-wrapping; fixed by `positionsCursorAbsolutely()`
(`web/backend/src/utils/ascii-art.util.ts`) - a door that moves the cursor is
PAINTING and has no lines to wrap. Debug door rendering by capturing real
traffic (`XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`), never by
guessing - three wrong conclusions in one session ended with one capture.
Earlier 2026-09-01 handoffs (settings admin/two-store class, sysop
list/SMTP, activity feed) and 2026-08-31 (door delete rules/DOORREPO parity)
are behind it if more history is needed.

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
7. **Alt+Enter should also toggle BROWSER fullscreen.** The door half is
   done; the frontend half is `packages/terminal/.../BBSTerminal.tsx`.
8. **The Doors volume never deletes** - the entrypoint syncs with
   `tar | tar`, so a file dropped from the image lives on the volume for
   ever (eight orphans removed by hand 2026-09-02). Prune
   `Doors/<door>/dist/` for doors the IMAGE ships, never for DOORREPO's.
9. **BBSTerminal registers two custom key handlers** and xterm keeps only
   the last, so Shift+Arrow sequences, the copy/select-all path and the
   Ctrl+Shift+M block have never run. Merging them makes three features
   appear at once.
10. **card-lobby needs an extraction** (2826 lines) before it can take the
   size switch.

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
