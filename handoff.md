# Handoff

## Alt+Enter works now, everywhere (2026-09-02)

Full record:
`thoughts/shared/handoffs/2026-09-02_the-size-switch-the-editors-and-a-real-battle-royale.md`

**Responsive is FOUR things.** Ask the terminal to widen, follow the resize,
put 80 columns back (`sdk/utils/terminal-mode.ts` does those three) - and be
able to RECEIVE the key that asks, which was broken in three places at once:
the browser never sent Alt+Enter (xterm does not ESC-prefix Option on macOS
unless macOptionIsMeta is set), the SDK parser could not name ESC+CR as
`M-enter`, and game mode dropped modifiers entirely. Alt+LETTER always
worked, which is why none of it was noticed.

Doors with the switch, all starting FIXED - a door looks like the board it
opened from until the caller asks: grandmaster (also in Settings > DISPLAY),
sprite-editor, ansi-editor, livechat (wide only on /chat), bug-tracker,
bbs-dashboard, doors-menu, theme-picker, scrollwars. **card-lobby cannot
have it** until someone extracts from its 2826-line index.ts - the hook
refuses.

**A source pin proves a call exists, not that it runs.** The ANSI editor
door threw on start for every caller while a test asserted its source
mentions `createTerminalModeSwitch`. Doors that got the switch after that
have tests that START them.

The ANSI editor audit is done: the cursor shows the cell under it reversed
(half-blocks stay visible), the caret hides during playback, the sidebar
toggle re-centres instead of pinning left, every modal takes a focus trap
(that is what "SAUCE does nothing" was), layers actually composite, the File
menu offers only what a host wired, and both the canvas and a sprite can be
resized after they are open.

GRANDMASTER's battle royale is 99 players and a grid of playfields with the
standings under your own board - no minimaps. 98 bots cost 0.16 ms/frame,
measured.

Next: Alt+Enter should also toggle BROWSER fullscreen; the Doors volume sync
never deletes (orphans removed by hand, root fix pending); BBSTerminal
registers two custom key handlers and xterm keeps only the last, so
Shift+Arrows and the copy path have never run.

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

1. **Alt+Enter should also toggle BROWSER fullscreen.** The door half is
   done; the frontend half is `packages/terminal/.../BBSTerminal.tsx`.
2. **The Doors volume never deletes** - `docker-entrypoint.sh` syncs with
   `tar | tar`, so a file dropped from the image lives on the volume for
   ever. Eight orphans removed by hand 2026-09-02. The fix is to prune
   `Doors/<door>/dist/` for doors the IMAGE ships, never for doors DOORREPO
   installed at runtime. Not written: that file carries another session's
   uncommitted work.
3. **BBSTerminal registers two custom key handlers** and xterm keeps only
   the last, so Shift+Arrow sequences, the copy/select-all path and the
   Ctrl+Shift+M block have never run. Merging them makes three features
   appear at once.
4. **card-lobby needs an extraction** (2826 lines) before it can take the
   size switch.

Older, still open:

5. **Yours:** nobody has driven DOORREPO's `T` (config), `H` (history),
   `ENTER` (run) or an uninstall in a shared directory by hand.
   `Doors/emp_tools` holds two doors and is the interesting case.
6. `PUT /installed/:cmd/info` and the streaming `DELETE` are untested live.
7. `Doors/door-manager/app.ts` is ~1940 lines against the 2000 ceiling; the
   next feature there needs an extraction first.
8. Six admin pages still render their own tables instead of
   `components/ui/DataTable`. Node Configuration deliberately stays on the
   old `DataGrid`.
9. `VITE_BYPASS_AUTH` in `App.tsx` should go now that a sysop account exists.
10. Audio stutter: one cause fixed, diagnostics live, never confirmed.

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
