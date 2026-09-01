---
date: 2026-09-01
topic: "SPRITED rebuilt as a fork of the ANSI editor door, the shared 80x25/responsive switch, and grandmaster's width-aware versus layout"
tags: [sprite-editor, ansi-editor, sdk, grandmaster, pengo, responsive, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the day SPRITED was built twice and then built right

One long session on `feat/installed-door-link`, in the MAIN checkout, shared
with two other Claude sessions (82 and a9) through `thoughts/BOARD.md`.

## The short version

SPRITED is now **a fork of `Doors/ansi-editor/index.ts`**, which is what the
design doc asked for on 2026-08-31 and what I did not build twice before
getting it right. Everything else follows from that.

Two failed shapes came first, and both were shipped and reported:

1. A studio that OWNED the screen and hosted the ANSI editor as a widget
   inside its `Canvas` panel - quarter screen, studio menu bar above the
   editor's own (which was switched off), three-pane file browser as the
   front door.
2. The same thing full-screen. Same two-chrome problem, bigger.

The sysop's verdict both times: it reads as two applications bolted
together. It did. The instruction had been in the design doc the whole time
("the editor should fork the ANSI editor the BBS already has"), and I quoted
it while building the opposite, because I let the existing 2b/2c machinery
decide the goal instead of the requirement.

## What is on origin/main

Everything through `7f42fe3cc`, including two landings of mine:

- `bd3ff7317` - the earlier merge (arcade doors, cell-art camera, the first
  editor convergence, Pengo's grid and collision fixes).
- `9fbc38b1e` - the fork, the animation half, and six SDK fixes.
- `95daf4485` - wheel zoom.

Live container verified at `9fbc38b1e` by hand
(`docker exec amiexpress-bbs head -c 9 /app/.git-sha`, plus greps for
`magnifiedCellTag` and `SpriteStudioDoor`). The later pushes have not been
container-verified.

## What is NOT on main (8 local commits)

```
7c2767342  grandmaster: humans get the boards, bots take the miniatures
7a5c0b12d  grandmaster: work out how many opponents FIT, instead of counting
9817c6ec1  batch-scheduler: the tsx door runner spawns from web/backend   <- NOT MINE
a572e9736  ansi-editor: the studio's door-side gains, backported
f17aa4845  sdk/ansi-editor: the wheel is heard by the editor, not the canvas
fae17bb45  sdk: one 80x25 / responsive switch, for every door with a layout
a6aa9b8a2  sprite-editor: the wheel zooms
298f57c33  test(rip): the README's fill gaps                              <- NOT MINE
```

Two of those belong to other sessions; check the `Claude-Session` trailer
before landing (mine is `session_014HgBVxWkPvLox7zP2jrcEF`).

## The shape SPRITED has now

One full-screen editor, Deluxe Paint shaped. Its own menu bar, its own
colour/tool sidebar, its own status line, and REQUESTERS for everything
else. No browser screen, no docked panes, no second menu bar.

- `Doors/sprite-editor/studio.ts` - the fork. Frame / Sprite / Zoom /
  Animation are contributed into the EDITOR's menu bar through the SDK's
  `extraMenus`.
- Kept unchanged from the old studio because they were always independent of
  the screen that wrapped them: `edit-doc.ts` (document ops), `assets.ts`,
  `preview.ts`, `dialogs.ts`, `door-theme.ts`, `browser-model.ts`.
- Deleted with the shell: `app.ts`, `edit-screen.ts`, `panels.ts`,
  `layout.ts`, `menu.ts`, `bindings.ts`, `token-strip.ts`, `art-screen.ts`.

Hotkeys, all non-printable because the editor types printables onto the
canvas: `C-f`/`C-b` frame, `C-e` animation, `C-p` play, `C-o` onion skin,
`C-g` transparency guide, `C-c`/`C-v` frame clipboard, `C-q` close,
`Alt+Enter` 80x25/responsive. Wheel zooms.

## The SDK work underneath (all on main)

Each of these came from a specific report, and the report is in the commit:

- `extraMenus` - a host can put menus in the editor's OWN bar. This is what
  made one application possible at all.
- `cellScaleX/Y` zoom, then **half-block-aware magnification**: repeating a
  `▀` four times down gives four rows of "upper half filled" - stripes. It
  resolves to solid halves instead. ("dotted artefacts" and a striped
  crocodile.)
- **The undo chunk flushes on release wherever the button is.** It used to
  flush AFTER a bounds check, so releasing outside the canvas left the chunk
  open and the next stroke joined the previous one's undo entry. ("undo
  behaves weird")
- **Half-cell cursor** in half-block mode at 2:1 and up. ("the red marker
  dont align with the blocks")
- **Canvas centring**, sized to the art rather than filling the region.
- **Transparency guide optional, default OFF.**
- **`canvas-wheel`** reported from the WIDGET, not the canvas - see the trap
  below.
- `setUnderlay()` - a ghost canvas under empty cells, never merged, never
  saved. Onion skin is built from it.
- `sdk/utils/terminal-mode.ts` - the shared 80x25/responsive switch.

## Learnings that cost something

- **I let existing code decide the goal.** 2b/2c had panels, menus, dialogs
  and a browser; hosting the widget preserved all of it and merging into one
  app meant deleting most of it. I chose the cheap shape and then described
  it as satisfying the directive. The correction only came from a screenshot.
- **Show the shape before building it.** Twice the sysop found the wrong
  design by running it, hours apart. A two-line sketch at plan time would
  have caught both in seconds.
- **Responsive is three things, not one.** Ask the TERMINAL to widen
  (`bbs.enableWideMode()`, because BBSTerminal starts fixed at 80x25 and says
  so in its own source), follow the resize, and restore 80 columns on exit. I
  shipped the widget half first and it did nothing; the log proved it - zero
  `[TERMINAL] Resize` lines all session.
- **Centring broke the wheel.** The canvas became only as big as the art, so
  a wheel turn over the surrounding space never reached it. The event was
  arriving the whole time. Follow the event, not the symptom.
- **My first diagnosis of the undo bug was wrong**: I read `drawHalfBlock` as
  pushing no undo state because grepping it for `snapshotUndoState` finds
  nothing. It calls `paintCell(..., chunked: true)`, which snapshots inside.
- **Test slices that end at a marker appearing EARLIER in the file read an
  empty string and pass on nothing.** That happened twice today. Take the
  next method boundary instead.
- **`tsc` does not delete outputs for deleted sources.** Stale `toolbar.js`,
  then eight more files, then the live volume still holding them.
- **The shared index is a hazard.** `git commit <path>` commits what is
  already staged for that path, including another session's staged
  deletions. 82's `77172d1fb` carried seven of my sprite-editor deletions
  that way. Board rule 7 now says to check `git diff --cached --stat` first.

## Open, in the order the sysop asked for

1. **Wire the versus layout into grandmaster's render path.** The decision
   is done and tested (`ui/versus-layout.ts`, 196 door tests); the render
   path still draws one opponent board at `left: 37`. Needs `isBot` carried
   into `OpponentState` (the lobby has it at `versus-screen.ts:1080`, the
   tracker does not), and N boards created and placed via `boardLeft(i)`.
   Risky half: `versus-screen.ts` is ~2000 lines of widgets and timers.
2. **Floating toolbars in SPRITED when wide** - playback, frame step, onion
   skin, zoom. Only in responsive mode, where there is room.
3. **Roll the terminal-mode switch out to the other doors.** Measured
   candidates: `bug-tracker` (31 percentage rules, 0 fixed) and
   `bbs-dashboard` (21/0) gain most; `ansi-editor` done; `doors-menu`,
   `card-lobby`, `theme-picker`, `scrollwars` partly. SIX of those are 82's
   claimed doors - board conversation, not a free edit.
4. **Alt+Enter should also toggle browser fullscreen.** Currently it only
   toggles the door's 80x25/responsive mode. The frontend half lives in
   `packages/terminal/src/components/BBSTerminal.tsx`.
5. **Clean the live volume.** `Doors/sprite-editor/dist/` on the container
   still holds `app.js`, `edit-screen.js`, `panels.js`, `layout.js`,
   `menu.js`, `bindings.js`, `token-strip.js`, `art-screen.js`. Git stopped
   tracking them; the deploy's `Doors/` sync does not delete. Inert
   (`index.js` imports only `./studio`) but dead code on a live board. The
   sysop approved removing them.
6. **Land the 8 local commits** and verify the container afterwards.

Not started, from earlier in the day: the frame strip (the sysop skipped it
deliberately), UIED, Joust.

## Other notes

- **Deploy verification is not optional here.** A green workflow has lied on
  this board before. Check `docker exec amiexpress-bbs cat /app/.git-sha`
  and grep for code only the new commit has.
- Frogger's `theGameOverPromptBlinks` fails only when the SDK suite runs
  concurrently - seven consecutive clean runs alone. Timing flake, same
  class as 82's `message-scan-parity`.
- Pengo got two real fixes earlier today, both live: the wall ring stopped
  eating 3-15 ice blocks per level (it now sits OUTSIDE the arcade's 13x15),
  and a block in flight is solid, so the penguin no longer rides the block
  he pushed into a Sno-Bee.
- Suite sizes at handoff: sdk 838, sprite-editor 47, ansi-editor 6,
  grandmaster 196, pengo 86, frogger 139, super-qix 182.
