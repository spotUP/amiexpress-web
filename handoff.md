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
repo and deploy: `/Users/spot/Code/amiexpress-doorserver`). Host
`root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, port 22.
`BBS_DATA_DIR=/app/data/bbs` - not `/app`, a bare skeleton. Backend on 3001.

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
