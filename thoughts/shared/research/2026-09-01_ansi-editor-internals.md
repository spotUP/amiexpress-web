---
date: 2026-09-01
topic: ANSIEditor blessed widget internals — canvas model, bounding, undo, hosting contract
tags: [ansi-editor, blessed, sprite-editor, sprited, research, widgets]
status: final
---

# ANSIEditor widget internals

Subject: `sdk/engines/ui/blessed/widgets/ansi-editor.ts` (4196 lines), plus its
dependency `sdk/engines/ui/ansi-editor/core/canvas.ts` (Cell-based canvas
utility library) and `sdk/engines/ui/ansi-editor/types.ts` (shared types).

Two hosts currently instantiate this widget, both full-screen, both `initialMode: 'draw'`:
- `Doors/sprite-editor/art-screen.ts:187` (`ArtSession.openEditor`)
- `Doors/ansi-editor/index.ts:522` (`openEditor`)

Headline finding used throughout this document: **the widget's own drawing
code hardcodes 80×25 (and the literals 79/24) in roughly 20 separate places**
— cursor clamps, mouse clamps, preview-canvas allocation, paste bounds, row
insert/delete, flip, select-all, status bar text, and the canvas→display
sync loop. The reusable core library it imports (`ansi-editor/core/canvas.ts`)
is itself dimension-agnostic (`Cell[][].length` / `row.length`), but the
*widget* layer built on top of it does not read those dimensions anywhere —
it recomputes `80`/`25`/`79`/`24` as literals at each call site instead of
deriving them from `this.cellCanvas.length` / `this.cellCanvas[0].length`.

---

## 1. Canvas data model

Two parallel representations coexist in the widget, one per editor mode:

- **Text mode**: `private lines: string[] = []` (`ansi-editor.ts:176`) — plain
  string array, one entry per line, used only when `this.mode === 'text'`.
- **Draw mode**: `private cellCanvas: Cell[][] | null` (`ansi-editor.ts:186`)
  — a 2D array of `Cell` objects, `cellCanvas[y][x]`, always allocated at
  construction as `CoreCanvas.createCanvas(80, 25)` (`ansi-editor.ts:277`).

`Cell` type (`sdk/engines/ui/ansi-editor/types.ts:89-94`):
```ts
export interface Cell {
  char: string;
  fg: number;  // 0-15 (0-7 normal, 8-15 bright)
  bg: number;  // 0-15 (0-7 normal, 8-15 bright with iCE colors)
  blink?: boolean;  // Blink attribute (requires iCE colors)
}
```
Colours are plain numeric indices 0-15 into a fixed 16-entry blessed colour
name table repeated verbatim at five call sites in the widget (e.g.
`ansi-editor.ts:3463-3466`, `:3550-3553`, `:814-817`) — there is no shared
constant, the array `['black','red','green','yellow','blue','magenta','cyan','white','gray','lightred',...]` is copy-pasted each time. No colour names or RGB values anywhere in `Cell` itself.

There **is** a layer stack: `private layers: Layer[]` (`ansi-editor.ts:199`),
where `Layer` (`:115-122`) is `{ id, name, canvas: Cell[][], visible, locked, opacity }`.
`this.cellCanvas` always points at `this.layers[this.activeLayerIndex].canvas`
(kept in sync manually at every layer op — add/delete/merge/reorder). Layers
are composited with `composeLayers()` (`:1250-1270`), which also hardcodes
`width = 80; height = 25`.

A second, independent core-editor-state object exists
(`private coreState: CoreEditorState | null`, `:192`, from
`sdk/engines/ui/ansi-editor/core/editor-state.ts`) and is initialized with a
clone of the canvas at construction (`:306-307`) "for future use for advanced
tool handlers" (comment at `:305`) — **it is never read or written again
anywhere else in the file.** It is dead state as far as this widget's actual
draw/undo/save paths are concerned.

---

## 2. Bounding the editable area

**`maxLines` / `maxLineLength` only bound TEXT mode, never draw mode.**
Exhaustive grep for `this.maxLines` / `this.maxLineLength` (only 4 hits total):
- `ansi-editor.ts:266-267` — read from options into fields.
- `:282-283` — clamps `this.lines.length` when parsing `initialContent` in the constructor.
- `:2540` — `this.cursor.col = Math.max(0, Math.min(this.maxLineLength, this.cursor.col + dx))`, inside `moveCursor()`, which is the TEXT-mode cursor mover only (called from `handleTextKey`, `:2293-2336`).

Draw mode has **no equivalent option at all**. Instead, every draw-mode
bound is the literal pair `79`/`24` (inclusive) or `80`/`25` (exclusive),
hand-written at each site:
- Keyboard cursor moves: `ansi-editor.ts:2397-2419` (`Math.min(79, ...)`, `Math.min(24, ...)`).
- Mouse click/drag clamps: `:2168-2169`, `:2200-2201` ("Clamp to canvas bounds (80 columns, 25 rows)").
- Shape preview allocation: `initPreviewCanvas()` — `this.previewCanvas = CoreCanvas.createCanvas(80, 25)` (`:3031`).
- Preview line/box/ellipse/selection: bounds checked against `0..79`/`0..24` literally (`:3153`, `:3177-3180`, `:3202`, `:3209`, `:3222`, `:3235-3238`).
- Paste: `if (destY < 25 && destX < 80 ...)` (`:1419`).
- Row insert/delete: loops `for (let row = 24; row > y; row--)` / `row < 24` (`:1443`, `:1467`), new row always built `for (let x = 0; x < 80; x++)`.
- Select-all / default selection: `{ x1: 0, y1: 0, x2: 79, y2: 24 }` (`:1357`, `:1381`, `:1490`, `:1563`, `:1591`).
- `syncCoreCanvasToDisplay()` render loop: `for (let y = 0; y < 25; y++) for (let x = 0; x < 80; x++)` (`:3471-3472`).
- Status bar: canvas size is a **literal string** `` `{gray-fg}80x25{/}` `` (`:3557`), not derived from any actual dimension variable.

**There is no concept of a canvas smaller than the viewport, no margin, and
no "editable region" distinct from the full canvas.** The canvas *is* 80×25
everywhere the widget touches it. `CoreCanvas.floodFill`, `drawLine`,
`drawBox`, etc. (the reusable core-library functions in
`sdk/engines/ui/ansi-editor/core/canvas.ts`) are themselves dimension-agnostic
— they read `canvas.length` / `canvas[y].length` (e.g. `isInBounds` at
`canvas.ts:81-83`, `setCell` at `:50-59`) — so flood fill *would* naturally
stop at the edge of a genuinely smaller `Cell[][]` array. But the widget
never gives them one: `this.cellCanvas` is always the fixed 80×25 array, and
every widget-side bound check (cursor clamps, mouse clamps, preview
allocation) is a hardcoded `79`/`24`/`80`/`25`, not `this.cellCanvas.length`
or `.[0].length`. Swapping in a smaller `Cell[][]` via `setCoreCanvas()`
(see §3) would make `syncCoreCanvasToDisplay()` fall back to blank cells for
out-of-range indices (`this.cellCanvas[y]?.[x] || { char: ' ', fg: 7, bg: 0 }`,
`:3473`) rather than error, but the cursor could still be driven by keyboard/
mouse into cells `[y][x]` that don't exist in the smaller array — `CoreCanvas.setCell`
would then silently no-op (its own bounds check), so drawing there would be a
silent do-nothing, not a crash, but nothing in the widget prevents the user
from moving the cursor there or seeing visual feedback that they've left the
real canvas.

**Visually**, there is no distinct treatment of "unused area" because no
such concept exists — the full 80×25 rectangle is always painted (background
colour 0/black by default via `createCanvas`'s per-cell defaults, `canvas.ts:16-21`).

---

## 3. Programmatic content get/set

Public API surface of `ANSIEditor` is exactly six members (constructor plus
five methods — verified by grepping for non-`private` method signatures):

- `getContent(): string` (`ansi-editor.ts:4134-4145`) — mode-dependent: in
  draw mode returns `CoreCanvas.canvasToANSI(this.cellCanvas)`; in text mode
  returns `this.lines.join('\n')`.
- `setContent(content: string): void` (`:4174-4188`) — sets `this.lines`,
  resets cursor to `{0,0}`, **clears and reparses `this.cellCanvas` from the
  ANSI string** via `CoreCanvas.clearCanvas` + `CoreCanvas.parseANSIToCanvas`,
  calls `syncCoreCanvasToDisplay()`, resets `modified = false`, and calls
  `saveUndoState()` (pushes onto the **text-mode** undo stack — see §4).
- `getCoreCanvas(): Cell[][] | null` (`:4150-4152`) — returns
  `this.cellCanvas` directly (not a clone — callers get a live reference,
  can mutate it out-of-band).
- `setCoreCanvas(canvas: Cell[][]): void` (`:4157-4162`) — assigns
  `this.cellCanvas = canvas`, calls `syncCoreCanvasToDisplay()`, sets
  `modified = true`, calls `updateDisplay()`. **Does not touch the undo
  stack, does not clone the input, does not update `this.layers[activeIndex].canvas`**
  (so after `setCoreCanvas`, the active `Layer.canvas` reference in
  `this.layers` goes stale/out of sync with `this.cellCanvas` until some
  other layer op reassigns it).
- `isModified(): boolean` (`:4167-4169`) — returns the `modified` flag.

**This is exactly the pair a host needs to swap frame content without
destroying/recreating the widget** (`getCoreCanvas()` / `setCoreCanvas()`),
and it works without touching blessed's element tree — `setCoreCanvas` only
calls `syncCoreCanvasToDisplay()` (a `setContent()` on the existing `Canvas`
child widget) and `updateDisplay()`, not any create/destroy path.

Round-trip fidelity: `canvasToANSI` (`ansi-editor/core/canvas.ts:490-550`)
emits one SGR sequence per attribute change plus `cell.char` verbatim, ending
with `\x1b[0m`; `parseANSIToCanvas` (`:565-719`) parses SGR `m`, cursor
position `H`/`f`, relative moves `A`/`B`/`C`/`D`, erase `J`/`K`, `\n`, `\r`,
`\t`. It does **not** implement ANSI `s`/`u` (save/restore cursor — explicit
no-ops, `:669-675`). Because `getContent()`/`setContent()` round-trip through
this ANSI text encoding, a `getCoreCanvas()`/`setCoreCanvas()` round-trip
(Cell[][] direct, no ANSI serialization) is strictly higher-fidelity — no
escape-sequence optimization pass, no colour-transition-encoding, cells pass
through as objects.

---

## 4. Undo

**The undo/redo stack is text-mode only and never touches the draw-mode
canvas.** `private undoStack: string[] = []` / `redoStack: string[] = []`
(`:195-196`) store **snapshots of `this.lines.join('\n')`** (full-document
string snapshots, not commands/diffs). `saveUndoState()` (`:4102-4108`)
pushes `this.lines.join('\n')`, caps at 100 entries, clears redo stack.
`undo()`/`redo()` (`:4110-4129`) pop/push and reassign `this.lines =
....split('\n')` — **`this.cellCanvas` is never read or written by any of
these three methods.**

`saveUndoState()` is called from exactly **three** sites in the entire file:
constructor (`:292`), `newDocument()` (`:2021`), and `setContent()` (`:4186`).
**It is never called after any draw-mode operation** — not `drawAtCursor`,
`typeCharAtCursor`, `applyPreview` (line/box/ellipse commit), `floodFill`,
paste, flip, row insert/delete, or layer ops. None of those call sites touch
`undoStack`/`redoStack` at all.

Yet `Ctrl+Z`/`Ctrl+Y` (and the `U` key, `:2477-2480`) **are** wired in draw
mode too — `drawCanvas.on('keypress', ...)` (`:2095-2113`) calls the same
`this.undo()`/`this.redo()`. Since those methods only ever manipulate
`this.lines`, and draw-mode edits never push onto the stack, **pressing
Ctrl+Z while drawing has no effect on the canvas** (it can only unwind
whatever the *text*-mode `lines` array happened to look like from the last
`saveUndoState()` call — typically just the initial-content snapshot, since
nothing in draw mode ever pushes a new one). This is a real, load-bearing gap
in the current widget, not a design choice with a workaround elsewhere: the
imported core-library undo primitives (`undoDrawing`, `clearUndoStack` from
`sdk/engines/ui/ansi-editor/tools/drawing-tools.ts`, imported at
`ansi-editor.ts:42-43`) are **never called anywhere in the file** — dead
imports, alongside the also-unused `drawTool`, `lineTool`, `boxTool`,
`boxFillTool`, `ellipseTool`, `ellipseFillTool`, `fillTool`, `pickTool`,
`selectTool`, `getToolHandler` (all imported `:32-45`, none invoked — the
widget reimplements draw/line/box/ellipse/fill/pick/select logic inline
instead, see §5).

Consequence for a frame-swap design: `setCoreCanvas()` (§3) doesn't touch
the undo stack either, so calling it to switch frames **cannot corrupt or
pollute undo history in the sense of leaving stale entries** — there's no
mechanism connecting the two today. But it also means **there is no existing
undo facility to preserve or corrupt for draw-mode edits at all** — any
undo/redo for per-frame drawing would need to be built from scratch (the
widget's current `Ctrl+Z` binding is effectively inert in draw mode).

---

## 5. Modes and tools

`EditorMode = 'text' | 'draw'` (`:87`); toggled by `Ctrl+M`
(`toggleMode()`, `:2625-2647`), which just hides/shows the `viewport` (text)
vs. `drawCanvas` + `drawCursor` (draw) child widgets and moves focus — no
canvas reallocation, no data loss switching modes.

`DrawingTool` (`sdk/engines/ui/ansi-editor/types.ts:99-109`): `'draw' |
'line' | 'box' | 'box-fill' | 'ellipse' | 'ellipse-fill' | 'text' | 'fill' |
'pick' | 'select'`. All tool logic is implemented **inline in the widget**
(`handleToolClick()` switch, `:3339-3454`; shape preview switch,
`:3079-3131`) — the imported core `drawing-tools.ts` functions are dead
imports (see §4). Single-letter keyboard shortcuts while not in text tool
(`:2459-2468`): `t`=text, `d`=draw, `l`=line, `r`=box, `e`=ellipse, `f`=fill,
`p`=pick, `s`=select (note: no bare box-fill/ellipse-fill shortcut key —
those are reachable only via sidebar/menu). `u`=undo (`:2477-2480`, subject
to the caveat in §4). F1-F12 select a character from the active F-key
character set (`:2341-2355`); Shift+F-key cycles the set. Alt+C/Alt+B open
FG/BG colour pickers (`:2358-2368`); Alt+H toggles half-block brush mode
(`:2369-2377`); Ctrl+H / Tab (while in half-block mode) toggles the
upper/lower half-block sub-row (`:2381-2393`).

Shape tools (line/box/box-fill/ellipse/ellipse-fill/select) are two-click:
first click sets `drawStartPos` and allocates `previewCanvas`
(`initPreviewCanvas()`, always `80×25`, `:3029-3032`); mouse-move while
`isDrawing` repaints the preview (`updateShapePreview`, called from the
`drawCanvas.on('mouse', ...)` handler, `:2208-2210`); second click calls
`applyPreview()` (`:3308-3323`) which copies every non-empty preview cell
into `this.cellCanvas` in place. `fill` is a single click →
`CoreCanvas.floodFill(this.cellCanvas, x, y, cell)` (`:3422`, 4-connected,
stack-based — `ansi-editor/core/canvas.ts:305-341`). `pick` (`:3426-3436`)
reads fg/bg/char from the clicked cell into `currentFg`/`currentBg`/
`currentChar`. `select` (`:3438-3450`) sets `this.selection` bounds; copy/
cut/paste/move/flip operate on `this.selection` if set, else default to the
whole canvas (`{x1:0,y1:0,x2:79,y2:24}`, e.g. `:1357`, `:1381`).

Right mouse button draws with FG/BG swapped (`drawWithBackgroundColor()`,
`:2702-2721`; Moebius convention). Half-block brush mode
(`drawHalfBlock`/`drawHalfBlockWithBg`, `:2732`/`:2881`) packs 2 vertical
"pixels" per cell using `▀`/`▄`/`█`/space, tracked via `halfBlockSubY: 0 | 1`.

**Sidebar** (`createSidebar()`, `:791-900`, plus `createBrushModePanel()`):
fixed 6-column-wide `Box`, contains a 2×8 clickable colour-swatch grid
(LMB→fg, RMB→bg, `:819-843`), an FG/BG text indicator, an 8-row tool-button
panel (one clickable `Box` per `DrawingTool`, `:867-896`), and a brush-mode
panel below it. **Independently shown/hidden** via constructor option
`showSidebar` (default `true`, `:331`, `:350-352` in `createUI()`).

**F-key toolbar** (`createFkeyToolbar()`, `:662-`): one row showing 12
preview buttons for the active `FKEY_CHAR_SETS[fkeySetIndex]` entry
(8 predefined 12-character sets — block/shade, box-drawing singles/doubles/
mixed, arrows, math, card suits, Greek — `:68-85`). **Independently shown/
hidden** via `showToolbar` (default `true`, `:330`, `:344-347`).

`showMenuBar` (Moebius-style top menu: File/Edit/Selection/Colors/View/Help
dropdowns, `:329`, `:338-341`) and `showStatusBar` (`:332`) are likewise
independent boolean options, each only adding/removing its own row and
adjusting `topOffset`/`bottom` on `viewport` and `drawCanvas` — all four
(`showMenuBar`, `showToolbar`, `showSidebar`, `showStatusBar`) can be toggled
independently at construction time (`ANSIEditorOptions`, `:48-65`), and
`toggleUI()` (`hideUIHotkey`, default `f2`, `:2240-2291`) hides/shows all of
menu bar + F-key toolbar + sidebar + status bar together as one group (not
independently at runtime — only at construction).

---

## 6. Transparency

**No transparent/empty-cell concept exists in the `Cell` type or in
`createCanvas`.** Every cell is always `{ char, fg, bg, blink }` with `char`
defaulting to `' '` (space) and `bg` defaulting to `0` (black) —
`CoreCanvas.createCanvas` (`ansi-editor/core/canvas.ts:11-25`). There is no
`null`/`undefined` cell, no alpha channel, no "unset" sentinel.

The closest approximation is an **implicit, ad-hoc "background" convention**
used only by layer-compositing code, not by the `Cell` type itself:
`composeLayers()` (`:1250-1270`) and `mergeLayerDown()` (`:1196-1221`) both
test `cell.char !== ' ' || cell.bg !== 0` to decide whether a lower layer's
cell should show through — i.e. "space on black background" is treated as
"nothing here" for compositing purposes only. This convention is duplicated
verbatim at both call sites (`:1206`, `:1262`) rather than factored into a
shared `isCellEmpty`-style helper *in the widget* — though the core library
does have exactly that helper, `isCellEmpty()`
(`ansi-editor/core/canvas.ts:74-76`, same `char===' ' && fg===7 && bg===0 &&
!blink` test, extended to also require `fg===7`) — and the widget's own
compositing code does **not** call it, it reimplements a slightly different
(bg-only) version inline instead.

This convention is fragile for a sprite/game-cell use case: a deliberately
drawn black space (e.g. to occlude something below it in a lower layer) is
indistinguishable from "nothing drawn here," and a cell with a non-default
`fg` but space char and black `bg` (e.g. `{char:' ', fg:3, bg:0}`, produced
naturally by `eraseAtCursor()` which always resets to `fg:7,bg:0`, or by any
fg-only paint over a space) is treated inconsistently depending on which of
the two `isCellEmpty`-shaped checks is applied — the compositor's bg-only
check counts it as empty, the core library's `isCellEmpty` (which also
requires `fg===7`) would not.

---

## 7. Hosting contract

`ANSIEditorOptions` (`:48-65`) extends `ElementOptions` (positioning/sizing/
styling, inherited from `Box`) and adds: `title`, `initialContent`,
`initialMode`, `maxLines`, `maxLineLength`, `showLineNumbers`, `showToolbar`,
`showStatusBar`, `showMenuBar`, `showSidebar`, `onSave`, `onSaveAs`,
`onOpen`, `onOpenBBS`, `onExit`, `hideUIHotkey`.

Callbacks:
- `onSave?: (content: string) => Promise<boolean>` — invoked from `save()`
  (`:3617-3637`; content comes from `getContent()`, i.e. the ANSI-string
  serialization, not the raw `Cell[][]`). On `true`, sets `modified = false`.
- `onSaveAs?: () => Promise<void>`, `onOpen?: () => Promise<void>`,
  `onOpenBBS?: () => Promise<void>` — menu-driven file dialogs, host-owned,
  no content/result contract beyond the promise resolving.
- `onExit?: () => void` — called from the shared `handleExit` closure
  (`:2041-2053`) on Escape (both viewport and drawCanvas, plus the top-level
  widget itself), gated by `this.modalOpen` (no-op while a modal is open)
  and by `this.modified` (prompts a confirm dialog via `confirmExit()`
  before calling `onExitCallback()` if there are unsaved changes).

**No `onChange`/`onDirty`/`onCursorMove` callback and no custom event
emission** — grepped for `this.emit(` in the file: zero hits. The `modified`
boolean field (`:180`) is the only dirty-tracking mechanism, exposed via
`isModified()` (§3); a host that wants dirty notifications must poll
`isModified()` itself (e.g. on a timer, or after every input event it
forwards to the widget) — there is no push-based signal. `EditorEvents`
(`save`/`exit`/`change`/`cursorMove`/`selectionChange`) is *declared* in
`sdk/engines/ui/ansi-editor/types.ts:221-227` but that type is not imported
or used by `ansi-editor.ts` — it belongs to the separate, likely-legacy
`api/editor.ts` module in the core library, not to this widget.

---

## 8. Size and layout

`ANSIEditor extends Box` (`:148`) and takes whatever `top`/`left`/`width`/
`height`/`right`/`bottom` the host passes via `ElementOptions` — it does not
force full-screen itself. Both current hosts explicitly pass
`top: 0, left: 0, width: '100%', height: '100%'`
(`Doors/sprite-editor/art-screen.ts:189`, `Doors/ansi-editor/index.ts:523-526`),
i.e. **the full-screen assumption lives in the host, not the widget** — the
widget's own constructor and layout code (`createUI()`, `:326-`) never
reads `screen.width`/`screen.height` or assumes it owns the whole terminal.

Internally, `createUI()` lays out child regions purely in terms of its own
box (`top`/`left`/`right`/`bottom` relative sizing, e.g. `viewport`/
`drawCanvas` at `:355-389` use `right: 0, bottom: showStatusBar ? 1 : 0`),
so the widget as a whole is a normal blessed `Box` that could in principle
be placed and sized by a host like any other element (a smaller box, offset
from 0,0, etc.) — nothing in `createUI()` special-cases full-screen
placement.

**However**, this positioning flexibility does not extend to the *canvas
content area*: the `drawCanvas` child (`Canvas` widget, `:374-389`) is sized
to fill whatever space the parent box's `top`/`left`/`right`/`bottom` leave
after the menu bar / F-key toolbar / sidebar / status bar are subtracted —
but the **cell data painted into it is always exactly 80 columns × 25 rows**
regardless of how large or small that viewport actually is (§2). If the
widget's box is given fewer than 80 columns or 25 rows, the extra columns/
rows simply don't fit and blessed clips them; if given more, the surplus
area past column 80 / row 25 is just left as the `Canvas`'s own background
(nothing painted there by `syncCoreCanvasToDisplay()`, whose loop bounds are
the hardcoded `25`/`80`, `:3471-3472`). There is no "host places a frame
strip or preview pane around or over it" precedent in the codebase — both
existing hosts destroy their own surrounding UI before creating the editor
full-screen (`art-screen.ts:169-181` explicitly destroys its own menu bar
"before the editor phase begins" — see the block comment there) and the
editor's own menu bar / toolbar / sidebar occupy the areas a host might
otherwise want for a frame strip or preview pane; nothing prevents a host
from parenting other blessed elements as siblings positioned over/around a
non-full-screen `ANSIEditor` box, but no such usage exists today to confirm
z-order/focus behavior in practice.

---

## Summary of hard constants found

Grepped occurrences of the literals `80`, `25`, `79`, `24` used as
canvas-dimension bounds in `ansi-editor.ts` (non-exhaustive list of the
clearest cases, one per behavior):

| Behavior | Location |
|---|---|
| Initial/new-document canvas allocation | `:277`, `:2010` |
| Layer canvas allocation | `:1156` (`addLayer`) |
| Keyboard cursor clamp | `:2402`, `:2412`, `:2419` |
| Mouse click/drag clamp | `:2168-2169`, `:2200-2201` |
| Preview canvas allocation | `:3031` |
| Preview shape bounds (line/box/ellipse/select) | `:3153`, `:3177-3180`, `:3202`, `:3209`, `:3222`, `:3235-3238` |
| Paste bounds | `:1419` |
| Row insert/delete loop bounds | `:1443`, `:1449`, `:1467`, `:1473` |
| Default/select-all selection | `:1357`, `:1381`, `:1490`, `:1563`, `:1591` |
| Layer compose | `:1251-1252` |
| Canvas→display sync loop | `:3471-3472` |
| Status-bar size label (literal string, not derived) | `:3557` |
