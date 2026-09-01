---
date: 2026-09-02
topic: "The 80x25/responsive switch made to work end to end, the ANSI editor audited and fixed, grandmaster's battle royale rebuilt"
tags: [terminal-mode, sdk, ansi-editor, sprite-editor, grandmaster, livechat, keyboard, deploy, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the night Alt+Enter finally worked

One long session on `feat/installed-door-link`, in the MAIN checkout, shared
with other Claude sessions through `thoughts/BOARD.md`. Everything below is
on `origin/main` and deployed unless it says otherwise.

## The short version

The sysop tested continuously and reported about twenty defects. The through
line: **a responsive door needs four things to work, and this board had two
of them.** Ask the terminal to widen, follow the resize, put 80 columns back
- and, it turns out, be able to RECEIVE the key that asks. The last one was
broken in three separate places, each of which hid the next.

## What was actually wrong with Alt+Enter

Three bugs in series. Each fix revealed the one behind it, which is why this
took four rounds with the sysop:

1. **The browser never sent it.** xterm only ESC-prefixes an Option
   combination on macOS when `macOptionIsMeta` is set, and it is not - so
   Alt+Enter arrived as a bare Enter. In LiveChat that SENDS the message you
   are typing. Fixed in `packages/terminal/src/utils/key-overrides.ts`, a
   pure function because the component that owns the keyboard cannot be
   mounted in a test (canvas, socket, real xterm).
2. **The SDK parser could not name it.** Its escape-sequence regex accepted
   ESC + letter or digit ONLY, so ESC + CR was not a sequence at all: the
   buffer produced an Escape keypress and then an Enter keypress. And even
   when a sequence formed, `parseKey`'s meta branch named the raw second
   byte, so Alt+Enter was `M-` + a carriage return. Nothing binds that;
   doors bind `M-enter`. Alt+Tab and Alt+Backspace were equally unbindable.
   Alt+LETTER always worked, which is why this sat unnoticed since the
   parser was written - the ANSI editor's Alt+C and Alt+B were the only meta
   keys anything used.
3. **Game mode dropped the modifiers.** In game mode xterm is blocked and
   the terminal sends `key-down` events instead; that payload carried the
   key and its code and nothing else. A door in game mode received Alt+Enter
   as a bare Enter - which in GRANDMASTER's menu is "select", so the toggle
   "started the game".

Then a fourth, at the door level: **the keystroke did not stop at the
switch.** The screen runs registered key handlers and then hands the same
key to whatever has focus, so the toggle worked AND the focused list
accepted an item. The switch's handler returns `true` now.

## Doors that carry the switch

All start FIXED - "a door looks like the board it opened from until the
caller asks for more", which the sysop said twice (ansi-edit, SPRITED):

| door | notes |
|---|---|
| grandmaster | + a DISPLAY entry in Settings; menu footer names the key |
| sprite-editor | |
| ansi-editor | was THROWING ON START - see below |
| livechat | `start: chatOnly ? 'wide' : 'fixed'`; /chat is the whole window |
| bug-tracker, bbs-dashboard, doors-menu, theme-picker, scrollwars | rolled out last |

`card-lobby` is NOT among them and that is the pre-commit hook's call: its
`index.ts` is 2826 lines against the repo's 2000 ceiling, so the hook
refuses the ten-line change. It needs an extraction first, the same answer
DOORMAN got.

**The ANSI editor door was throwing on start** for every caller: the switch
was created inside the sysop-only BBS-files browser while the editor's menu
read `this.terminalMode!` at open. Its test asserted the SOURCE contained
`createTerminalModeSwitch({` and passed throughout the outage. Both editor
doors and LiveChat now have runtime tests that START them against a stubbed
session; LiveChat had no test runner at all before this.

## The ANSI editor audit (the sysop's list)

Driven, not read - every menu action was executed against a canvas:

- **Cursor over half-blocks.** It was an opaque red block with the BRUSH
  character in it, so the cell you were about to paint was the one you could
  not see. It now draws the cell's OWN glyph reversed (`invertTags` swaps
  `-fg`/`-bg` in the tag string, so a magnified half-block keeps its
  resolved halves). An empty cell has nothing to reverse and keeps the solid
  marker, or the cursor would vanish on a blank canvas.
- **Caret during playback.** `setCursorVisible()` on the widget; SPRITED
  hides it for the length of playback.
- **Sidebar toggle.** It pinned the canvas to the sidebar's edge (`left = 6`
  or `0`), which is what centring had replaced. It changes the ROOM now and
  the canvas re-centres in it.
- **SAUCE "does nothing".** It always opened - the dialog is in the screen
  buffer - but the click that opened it let the canvas steal focus back, so
  Tab/Enter/Escape never reached it. Every modal in the widget takes a focus
  TRAP now, through one helper, released by the existing
  `restoreFocusAfterDialog`.
- **"Most entries dead."** They were not dead, they were UNWIRED: File >
  Save As called a host callback SPRITED never supplied, and File > New
  called the widget's own `newDocument()`, which blanks the canvas and
  leaves the door's sprite open behind it. The File menu offers only what a
  host has wired (`onNew`, `onSaveAs`, `onResize`), and SPRITED wires all
  three.
- **Layers.** Every action had a real body and the whole menu was
  decoration: each layer owned a canvas, the ACTIVE one was what the tools
  painted, and the renderer drew that one alone. Nothing composited, so
  `visible` changed no pixel. `compositeCellAt()` answers one question - what
  is visible at (x, y) - down the stack.
- **No canvas resize.** `resizeCanvas()` on the widget (keeps the art that
  fits, resizes every layer, re-centres) and `resizeSprite()` in SPRITED's
  edit-doc, because cellW/cellH describe every frame of every animation and
  `setFrame` refuses anything else. New cells are HOLES, not black.

## Grandmaster

- **The versus layout is wired to the render path** (it had been a decision
  nobody could see): N boards from column 37, the grid in what is left, and
  `isBot` carried into `OpponentState` so humans get the boards first.
- **Battle royale is 99 players.** Two tables disagreed: `bot-lobby.ts`
  recommended five bots and had no callers, the lobby adapter's literal said
  two and ran. One table now - and the SDK lobby widget always passes a
  count from the mode's own config, so `botFillTarget: 99` had to be
  declared THERE as well. 98 bots cost 0.16 ms/frame, measured.
- **The field is a grid of playfields.** Boards fill columns AND rows; the
  bucket-bar minimaps are gone from the cascade at the sysop's request, and
  the standings sit under the player's own board. 27 playfields at 251x73.
- **The countdown no longer shuffles.** The tracker filled up as AI samples
  arrived, so the layout was recomputed nearly every frame; the field is
  seeded with empty boards before the first frame.
- **The menus centre themselves** and follow a resize.

## Learnings that cost something

- **A source pin proves a call exists, not that it runs.** The ANSI editor
  door was dead on start with a green test asserting the source mentions the
  call. Every door that got the switch after that has a test that STARTS it.
- **Never gate a push on grep.** `npm test | grep "^Tests:" && git push`
  pushed four red tests to main: the exit code belongs to grep, which
  succeeds because it FOUND the summary. Same shape as `| head` faking an
  EXIT 0 through SIGPIPE.
- **A file edited after staging commits as the STAGED version.** That is how
  the red tests got in - I dropped card-lobby from the guard's list after
  staging the file. `git status` says "staged" and nothing about the newer
  copy; `git diff HEAD -- <file>` is the check.
- **A merge can duplicate a test function silently.** Both sides appended
  `theWheelStepsTheZoomLadder` to the same file; no conflict, and the LAST
  definition wins in JS - main's copy pinned the pre-`wheelZoom` source. A
  clean-looking merge would have shipped a suite asserting code I had
  replaced.
- **Fixing the overwrite broke the zoom.** Stopping playback when the editor
  is rebuilt was right (the old timer painted into the new widget); ending
  the animation on a zoom step was not. Playback is carried across the
  rebuild now.
- **The cascade rejected itself** whenever boards and bars covered the whole
  field, because it required somebody left over for the list. Twelve
  opponents at 160 columns fell back to a single grid panel.
- **Driving a private method skips the guard the public path sets.**
  `program._handleData()` directly parses the same bytes three times over,
  because `_emitKey` re-emits 'data' and only the 'data' listener sets the
  re-entry flag. A test that reads emit counts from there measures its own
  harness. Feed `program.emit('data', ...)`.

## Live state

`origin/main` = `72ca438ad`. Container verified by hand at each deploy
(`docker exec amiexpress-bbs cat /app/.git-sha`, image age, and greps for
code only that batch has). The last verified container was `04fd865a4`;
`72ca438ad`'s deploy was in flight at handoff time - CHECK IT.

Suites: SDK 873, grandmaster 244, sprite-editor 91, ansi-editor 11,
livechat 6, frontend 206, backend + 36 new door-terminal-mode tests.

## Next steps

1. **Verify the `72ca438ad` container** if the deploy finished after this was
   written.
2. **Alt+Enter should also toggle BROWSER fullscreen.** The door half is
   done; the frontend half is `packages/terminal/src/components/BBSTerminal.tsx`.
3. **The Doors volume never deletes.** `docker-entrypoint.sh` syncs with
   `tar cf - | tar xf -`, so a file dropped from the image lives on the
   volume for ever. I removed eight orphans by hand from
   `/app/data/bbs/Doors/sprite-editor/dist`; the durable fix is to prune
   `Doors/<door>/dist/` for doors the IMAGE ships - never for doors DOORREPO
   installed at runtime, whose code exists only on the volume. Not written
   because that file carries another session's uncommitted manifest work.
4. **card-lobby needs an extraction** before it can have the switch.
5. **BBSTerminal registers two custom key handlers** and xterm keeps only the
   last, so the first (Shift+Arrow sequences, the copy/select-all path when
   mouse tracking is off, the Ctrl+Shift+M block) has never run. Merging them
   will make three features appear at once.
6. Older, still open: `Doors/door-manager/app.ts` near the size ceiling, six
   admin pages still on their own tables, `VITE_BYPASS_AUTH` in `App.tsx`,
   the audio stutter never confirmed.

## Other notes

- The landing recipe that works here: merge `feat/installed-door-link` into a
  worktree cut from fresh `origin/main`, resolve to the BRANCH side where the
  branch is newer, rebuild dist, verify, push. Only 5 conflicts this time
  (117 last time) because main had already absorbed most of the branch.
- A worktree's doors resolve `@amiexpress/bbs-door-sdk` through the MAIN
  tree's node_modules symlink, so they build against the wrong SDK and the
  pre-commit hook blocks the merge commit. Give the door its own
  `node_modules` with that one entry pointed at the worktree's `sdk`, and
  build the worktree SDK (cjs AND esm) first.
- card-lobby's `tone` dependency had never been installed in this checkout,
  so its committed client bundle was stale and the door could not be built
  here at all. Installed, rebuilt, committed.
