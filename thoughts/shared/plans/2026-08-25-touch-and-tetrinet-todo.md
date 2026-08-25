---
date: 2026-08-25
topic: Outstanding work - touch controls, TetriNET polish, and open bugs
tags: [mobile, touch, tetrinet, livechat, grandmaster, todo]
status: implemented
---

# Open work, 2026-08-25

Everything below is committed locally but **not pushed** - pushing auto-deploys
the live BBS, and the user deploys when the batch is finished.

## 1. Gesture-only controls for GMASTER  (user request, spec is theirs)

An iOS Tetris the user rates highly is controlled entirely by thumb, with no
on-screen buttons. They want that as an option: **let the player hide the
touch controls and play on gestures alone.**

The scheme, exactly as specified:

| Gesture | Action |
|---|---|
| Drag thumb left / right | Piece follows the thumb, 1:1 and continuously - not stepwise |
| Drag thumb down | Piece follows downwards, one row per cell - this IS the soft drop |
| Swipe down (fast) | Hard drop |
| Tap | Rotate clockwise - ONE direction only, which is enough |
| Swipe up | Hold |

Notes for whoever builds it:
- "Follows perfectly" is the whole point. Track the thumb against cell width
  and move the piece by the number of columns crossed, rather than firing a
  key per gesture. The existing pad sends key-down/key-up; this needs a
  position-tracking path closer to the Arkanoid trackpad.
- There is no soft-drop BUTTON; dragging down is the soft drop and tracks
  the thumb exactly as the sideways drag does.
- Rotate counter-clockwise and the second rotation button are not needed.
- It is a MODE, not a replacement: the button pad stays for players who
  prefer it. A toggle belongs wherever the player's other preferences live.

## 2. SDK-wide touch gestures for menus  (designed, not built)

Every door and the BBS itself are List-driven: arrows plus Enter. A gesture
layer in `packages/terminal` gives all of them touch navigation with no door
changes, switched on the `game-mode` signal that already exists:

- game mode OFF: swipe up/down -> ArrowUp/ArrowDown, swipe left/right ->
  ArrowLeft/ArrowRight, tap -> Enter, plus a thin bar with Back (Escape) and
  a Keyboard toggle (text entry still needs the real keyboard).
- game mode ON: the per-door pad or trackpad.

Three details decide whether it feels right: discrete steps (one swipe past a
~24px threshold = one key, repeating every further ~24px) rather than
momentum; a tap only counts if the finger barely moved; and it lives in the
terminal package, not in each door.

## 3. Pointer suppression is applied to every client door  (cause known)

`web/backend/src/handlers/door.handler.ts:4091` emits `game-mode: true` for
EVERY client door, and yesterday's `d86694d59` hides the cursor, sets
`pointer-events: none` on the xterm layer and disables text selection
whenever game mode is on. LiveChat is a client door, so it lost its mouse.

The flag means "a client door is running" but is being used as "this is a
real-time game". Drive the suppression from the door's own declaration (a
manifest flag) instead, and clear it when a door loads so a stale state
cannot leak into the next one.

## 4. LiveChat draws two layouts on top of each other  (cause NOT known)

Reported with screenshots, in both the standalone `/chat` page and the
in-BBS door, so it is the door or the SDK rather than the page wrapper.

**A tidy hypothesis was disproven - do not retry it.** The theory was that
differential rendering skips the cells a moved panel vacates. Measured: a
20x5 panel moving from row 0 to row 10 already writes 252 bytes AND
repositions to row 1. Forcing a full redraw on geometry change (via
`Element._invalidateCoords`) cost 2336 bytes for the same move and fixed
nothing. The finding is recorded in that method as a comment.

Next suspect, untested: LiveChat switches to a carousel below a width
breakpoint (`enterMobileMode` / `exitMobileMode` in `Doors/livechat/server.ts`
around the `responsiveLayout.onResize` handler). The overlap looks like a
half-applied switch. It should be testable headlessly - drive the layout
across the breakpoint and assert no two panels claim the same cells.

## 5. TetriNET: black band across the middle of the playfield

Reported as "as if a line was cleared". A separate artefact from the
unpainted last row on a 25-row terminal, which is fixed (`b67a9ef05`).
Prime suspect: the effect overlay, which now fires on every incoming
special (`showIncomingWarning` / `showImmunityBlocked` from the router).

## 6. Motion blur stutters in the GMASTER main modes

The shared blur path is FASTER than the inline code it replaced (measured:
0.029 ms vs 0.041 ms per frame with a full 76-cell streak) and the main
screen already renders at 20 fps with an 8 ms floor on input, so the cause
is not the code that changed. Needs an instrumented run - per-frame render
time and emitted byte count around a hard drop - rather than another guess.

## 6b. iOS: the address bar covers the top of the screen

Screenshot from an iPhone: Safari's floating address bar sits over the first
two terminal rows, so the top of every screen is unreadable.

The mobile fit pads for `env(safe-area-inset-left/right)` but not the top,
and it sizes against the layout viewport rather than the VISIBLE one. On iOS
the URL bar is browser chrome that overlaps a `100vh` page; sizing to
`100dvh` / `visualViewport.height` and padding `env(safe-area-inset-top)` is
what keeps rows out from under it. The refit already listens to
`visualViewport.resize` - it just needs to use that height as the budget.

Worth checking at the same time: the keyboard takes the lower half in that
screenshot, so the terminal's usable height is roughly a third of the phone.
Whatever the fit uses as its height budget has to subtract both.

## 7. Smaller items

- **No ESLint config anywhere above `web/frontend`**, so `npm run lint`
  cannot run there at all, while RULES.md requires zero lint warnings.
- **The pre-commit hook does not rebuild every door's `dist/`.** It rebuilt
  Grandmaster but not Arkanoid, so a source-only commit shipped a stale
  bundle - caught by hand, could easily be missed.
- **Mobile fit leaves ~4% of the width** on a dpr-3 phone: cells are whole
  device pixels and xterm left-aligns the grid. Closable by centring it.
- **The game pad only appears in portrait**, matching the existing keyboard
  gate, but games are often played in landscape.
- **Backend tests are red in CI on every commit** (`execute-lha-extract`,
  `arkanoid-score-webhook`) because better-sqlite3's bindings are missing in
  that environment. They mask real regressions in the score-webhook path.

## 8. Arkanoid audio: balance and space reverb  (requested 2026-08-25)

Two parts, both in `Doors/arkanoid` + the SDK AudioEngine:

- **The sound effects are much louder than the music.** Needs a real mix
  balance, not a blanket volume cut: find where effects and the tracker
  module are each gained (`playSound` vs the TrackerEngine output) and put
  them on separate buses with a sane ratio, so raising the music does not
  drown the hits.
- **"Hall reverb and stuff so it sounds like it echoes in outer space - very
  wet and nice."** A convolution or algorithmic reverb on the EFFECTS bus
  only; the tracker music should stay dry or it turns to mush. Worth
  checking whether the SDK AudioEngine already has an effects chain to hang
  this on before building one - `sdk/engines/audio/` has both the
  AudioEngine and TrackerEngine.

Note the paddle/ball motion blur and half-cell movement landed in
`d0601046c`; the audio work is independent of it.

## 9. LiveChat still hides the mouse pointer  (reported again 2026-08-25)

LiveChat is an application, not a game, so the pointer must show. The
manifest-driven fix (`capturePointer`, `BBSTerminal.tsx` around the
`applyPointerCapture` helper) is in the shipped bundle and LiveChat does NOT
declare `capturePointer`, and the backend log confirms it sends
`capturePointer: false` - yet the pointer is still hidden. Every code path
that writes `cursor: none` was read and only one exists, so the next step is
NOT another guess: get the computed style from the live page

```js
const x = document.querySelector('.xterm'), t = x?.parentElement;
console.log(JSON.stringify(t?.style.cursor), getComputedStyle(t).cursor,
            getComputedStyle(x).pointerEvents);
```

and find which element actually carries it.

## 10. The help screen does not close on Escape  (separate from the menus)

Confirmed by the reporter as its own bug: menus opened with the MOUSE do
close on Escape. `DocModal` binds its close keys on `_contentArea` and on
itself and focuses `_contentArea` in `display()` - so the question is
whether something takes focus back after the modal opens. The dropdown's
focus-restore was one such thief and is now guarded; check whether anything
else (the door's ~31 `inputBox.focus()` calls) does the same.

## 11. Joypad: only D-pad RIGHT binds, and it binds as "RS-Y+"

Follow-up to the hat-switch work. The reporter's device dump:

```
8BitDo NES30 Pro   Vendor: 2dc8  Product: 9001
MAPPING: n/a       buttons B0..B14 (15, so no standard D-pad at 12-15)
AXIS 0: 0.00392   AXIS 1: -0.00392  AXIS 2: 0        AXIS 3: -1.00000
AXIS 4: -1.00000  AXIS 5..8: 0                       AXIS 9: 3.28571
```

- AXIS 9 = 3.28571 is the CENTRED hat value, so the hat exists and is axis 9.
- AXIS 3 and AXIS 4 rest at -1.00000 and "light up when I press dpad
  left/right" - so this pad ALSO reports the D-pad through those axes.
- "RS-Y+" means the binder named axis 3 as the right stick Y. On a pad with
  no standard mapping those names are fiction; the binder should show the
  raw axis number for non-standard pads rather than a stick name.

Open question needing one more observation: the exact values of AXIS 3 and
AXIS 4 while each direction is HELD (left, right, up, down). That decides
whether the D-pad is two -1..+1 axes or the axis 9 hat, and it cannot be
guessed - the hat decoder already had to be narrowed to the last two axes
because AXIS 4 resting at -1 decoded as a permanent D-pad UP.

## 12. Joypad: is the pad in the right MODE?

The reporter notes the NES30 Pro shows solid green LEDs. These pads have
several pairing/HID modes (a start-up key combination selects them) and only
some present as a standard-mapping gamepad to a browser. `MAPPING: n/a`
above confirms this one does not. Worth documenting which mode to use, and
what the LED pattern means, before writing more code around the raw layout -
switching the pad to an XInput-style mode may make buttons 12-15 appear and
remove the need for hat decoding entirely on this device.

## 13. TetriNET does not clear lines correctly  (reported 2026-08-25)

Line clearing in the TetriNET engine is wrong. Note the main modes had a
line-clear bug of exactly this family before - clearLines() spliced rows by
their ORIGINAL indices in ascending order, so each splice shifted the rest
and the next splice removed the wrong row (fixed in core/board.ts, covered
by tests/board-clear.test.ts). TetriNET has its OWN board in
core/tetrinet/tetrinet-board.ts; check whether it repeats that mistake, and
give it the same regression test if so.

## 14. GMASTER versus: garbage setting produces no garbage at start

With garbage lines enabled in the versus mode settings, the boards start
empty. Either the setting is not read when the match board is built, or it
means something else (garbage sent on line clears rather than pre-filled
rows) - in which case the LABEL is wrong and should say so. Establish which
before changing behaviour.

## 15. GMASTER modal text is not centred on either axis

Still off after the valign work. The text inside modal dialogs should be
centred horizontally and vertically; check what the modal widget does with
`align`/`valign` for multi-line content, and whether the door passes them.

---

## Status, end of 2026-08-25

Fixed and committed (local only - nothing pushed, so nothing deployed):

| # | Item | Commit |
|---|---|---|
| 1 | Gesture-only controls for GMASTER | `6634af256` + guards in `1a2e8d5be` |
| 3 | Pointer suppression on every client door | `e95b9f44d`, completed by the unload fix in `9e76b061b` |
| 4 | LiveChat drawing two layouts | `138ea19fe` |
| 5 | TetriNET black band | `b67a9ef05` |
| 6 | Motion blur stutter | `17ede42bd` - a repaint gate, not the blur's cost |
| 6b | iOS address bar over the top rows | `d57465a48` |
| 8 | Arkanoid audio balance + space reverb | `9ebcc3db2` |
| 9 | LiveChat mouse pointer | `9e76b061b` |
| 10 | Help screen not closing on Escape | `9e76b061b` |
| 11 | Joypad axes and binding labels | `9e76b061b` |
| 13 | TetriNET line clearing | `812b29931` |
| 14 | Versus garbage - not a bug, the label was | `812b29931` |
| 15 | Modal text centring | `1ac1fd8de` |
| 7 | ESLint config, pre-commit door rebuild | `ab9d577b1` |

Still open:

- **Item 2 - SDK-wide touch gestures for MENUS.** Partly done: pad-style
  doors get menu gestures through `bbs:input-mode` (`1a2e8d5be`). What is
  not done is the generic layer for EVERY door and the BBS itself, where
  swipe would drive the List widgets with no per-door work.
- **Item 12 - which mode the 8BitDo pad should be in.** Needs the pad in
  hand: `MAPPING: n/a` says the current mode is not standard, and an
  XInput-style mode may remove the need for hat decoding entirely.
- **Item 7 leftovers**: ~4% unfilled width on a dpr-3 phone, the game pad
  being portrait-only, and the two backend suites that are red in CI for
  missing better-sqlite3 bindings (`execute-lha-extract`,
  `arkanoid-score-webhook`) - both fail identically with every change of
  this session stashed, so they are environmental rather than regressions.

## 16. A TetriNET piece painted over LiveChat  (needs a reproduction)

Screenshot 2026-08-25: after running TetriNET and then LiveChat, a magenta
block from the game appeared over the LiveChat UI while tabbing.

What has been ruled out by reading the code:

- Grandmaster DOES destroy its Screen on exit (`app.ts`, end of the run
  method), and `Screen.destroy()` clears its pending render timer - so a
  dead door cannot paint.
- LiveChat's Screen writes `ESC[2J` on its FIRST render (`_doRender`, the
  `_hasRendered` branch), so anything left on the terminal is wiped when the
  door starts.

Those two together say the artifact should be impossible, which means one of
them is not happening in practice. The cheap next step is to log every write
to the socket with the door name attached for one session and see who wrote
those cells - guessing further is not worth it without that.

## 17. Arkanoid sound effects are now too quiet  (regression, 2026-08-26)

My doing, and a one-line-ish fix. Two changes stack up against the dry
signal:

- `sfxVolume` went 0.8 -> 0.45 -> 0.35 while chasing the music balance
  (`Doors/arkanoid/client.ts`, the AudioEngine constructor).
- The effects bus now runs through a reverb at `wet: 0.6` and an echo at
  `wet: 0.4`. Wet mix REPLACES dry: at 0.6 wet only 40% of the hit's direct
  sound survives, and the echo takes another bite before it.

So the fix is not simply "turn sfx up": raise `sfxVolume` back toward 0.6-0.7
AND drop the reverb wet to ~0.35-0.4 so the transient still cuts through,
keeping the tail long for the space. The music is on its own context at 0.95
(see item 8) and is not affected by any of this.

## 18. Brick highlight should sweep row by row, top to bottom

Currently `updateShineEffect()` (`Doors/arkanoid/client.ts`) walks
`this.data.bricks` in ARRAY order and stamps `shineFrame = delay` with
`delay += 2` per brick - so the sweep follows however the level generator
happened to push bricks, not the screen. It should advance by ROW: every
brick in a row lights together, then the next row down, so it reads as a
band travelling down the wall.

Sort by `brick.y` (or bucket bricks per row once at level init) and derive
the delay from the row index rather than the array index.

## 19. Sync the visuals to the music  (feature request)

"Arkanoid seems like the perfect game to highlight blocks to notes and
stuff." The pieces for this already exist:

- `TrackerEngine` exposes a `PlaybackPosition` ({ position, order, pattern,
  row }) and emits a `progress` event as the module plays
  (`sdk/engines/audio/tracker-engine.ts`).
- The brick shine is already a per-brick frame counter, so it can be driven
  by anything.

The obvious first version: on each `progress` row tick, light the brick row
that corresponds to the pattern row (or pulse the whole wall on rows where
the module hits a note in a chosen channel). Worth checking whether the
progress event fires per ROW or only per pattern - per row is what makes
this feel musical, and if chiptune3 only reports patterns, the row can be
interpolated from the module's speed/BPM.

Beyond bricks: the paddle glow, the ball trail brightness and the background
border colour are all cheap things to pulse in time.

## 20. LiveChat video: every second frame is broken in some render modes

Reported 2026-08-26 (and earlier with a screenshot showing garbage in the
top-left corner): in the video chat, alternate frames render wrong. Not all
render modes - "most".

Where to look, in order:

- `Doors/livechat/client.ts` holds the encoders (`renderAscii`,
  `renderHalfblock`, `renderBraille`). Their per-row VISIBLE width must
  match the tile exactly: TetriNET had a bug of precisely this shape where
  special blocks were 3 columns against everyone else's 2, and every row
  carrying one shifted sideways (fixed in `194b92941`). A row that is one
  column wide too many wraps and pushes every following row along, which
  looks like "every second frame" when the content alternates.
- The alternation itself suggests the frame is being written while the
  previous one is still being consumed, or that the encoder reuses a buffer
  across frames.
- `halfblock` packs two source pixels per character and `braille` eight, so
  the capture canvas is sized per mode (`pixelsPerChar`). A mode whose
  canvas height is not an exact multiple of its packing will read past the
  last row on alternate frames.

A width/row-count assertion over each encoder, like
`Doors/grandmaster/tests/tetrinet-cell-width.test.ts`, would catch this
without a camera.

## 21. TetriNET specials: confirm the keys work

Reported as "I have an inventory of items but Tab or numbers do nothing".
The wiring IS present end to end - `input/config.ts` maps 1-6, 0, Tab and
Backspace, `keyToAction` returns `use_special_N` / `use_special_self` /
`use_special_random` / `discard_special`, and `tetrinet-screen.ts` binds all
of them - but the reporter was on a stale local build at the time.

Note the behaviour is correct-but-quiet with no opponents: 1-6 beep an error
when the slot is empty, and Tab returns silently when there is nobody to
target. Only 0 (self) and Backspace (discard) do anything visible in a solo
game. If it still fails with opponents present, start at
`useSpecialOnSlot()` and `fireSpecial()`.

Worth fixing regardless: the panel hint still reads "TAB: Next 1-5: Select",
which describes a select-then-fire model the code no longer uses - the
number key fires immediately.
