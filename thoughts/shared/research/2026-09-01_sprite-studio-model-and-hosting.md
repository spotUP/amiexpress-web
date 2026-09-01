---
date: 2026-09-01
topic: sprite-studio sprite data model, EditDoc, persistence, edit-screen features, ANSIEditor hosting pattern, bindings/menu architecture, test harnesses
tags: [sprite-editor, cell-art, ansi-editor, blessed, sdk, research]
status: final
---

# SPRITED sprite-studio: model and hosting (research)

Scope: the sprite-side data/document model, persistence, the current
hand-rolled edit screen's feature set, how `Doors/sprite-editor/art-screen.ts`
hosts the SDK's `ANSIEditor` widget today, the binding/menu/panel
infrastructure the door is built on, and the test harnesses that exercise all
of it. The ANSIEditor widget's own internals are covered by a separate
research pass — not duplicated here.

## 1. The sprite data model (`sdk/engines/graphics/cell-art/`)

### Cell type and value ranges

`sdk/engines/graphics/cell-art/cells.ts:14-19`:

```ts
export interface Cell {
  char: string;
  /** ANSI colour 0-15. */
  fg: number;
  bg: number;
}
```

- `char`: a single-character string. `{` and `}` are forbidden (they would
  corrupt blessed tag markup) — enforced in `parseCell`
  (`sdk/engines/graphics/cell-art/sprite.ts:52-54`).
- `fg`, `bg`: integers 0-15 (ANSI colour index), validated in `parseCell`
  (`sprite.ts:55-60`).
- `CellRow = Array<Cell | null>`, `CellBuffer = CellRow[]`
  (`cells.ts:22-23`).
- `PALETTE` (`cells.ts:26-31`): the 16 ANSI colour names in order
  (`black, red, green, yellow, blue, magenta, cyan, white, gray, lightred,
  lightgreen, lightyellow, lightblue, lightmagenta, lightcyan,
  lightwhite`) — the same space the ANSI editor's canvas uses, per the
  module doc comment (`cells.ts:5-8`).

### Transparency representation

**`null` is the transparent cell** — not a special `Cell` value, not an
alpha field. Doc comment, `cells.ts:21`:

```ts
/** null is TRANSPARENT: compositing skips it, rendering paints fallback. */
```

- `blitCells` (`cells.ts:60-77`) skips `null` cells in `src` entirely when
  compositing onto `dest` (`cells.ts:72`: `if (cell === null) continue;`) —
  this is the mechanism that lets a sprite frame have transparent pixels
  that don't overwrite the terrain/background already blitted underneath.
- `rowToTags` (`cells.ts:85-103`) substitutes a `fallback` cell (default
  `{ char: ' ', fg: 7, bg: 0 }`, `cells.ts:33`) wherever it encounters
  `null` when rendering to a blessed tag string — rendering always needs a
  concrete glyph/colour, compositing does not.
- In the half-block pixel codec, a `PixelGrid` cell can independently be
  `null` (transparent) or `0` (opaque black) — see decompilePixels notes
  below; these are NOT the same value, and the codec is explicitly built to
  keep them distinct through a round trip.

### `.sprite.json` schema

Top-level keys of a `Sprite` (`sprite.ts:26-32`):

```ts
export interface Sprite {
  name: string;
  cellW: number;   // frame width in characters — every frame of every animation matches
  cellH: number;   // frame height in characters
  animations: Record<string, SpriteAnimation>;
}
```

`SpriteAnimation` keys (`sprite.ts:18-24`):

```ts
export interface SpriteAnimation {
  ticksPerFrame: number;   // game ticks each frame is held for
  loop: boolean;           // loop, or hold the last frame (death, shatter)
  frames: CellBuffer[];
}
```

On disk (`sprite.ts:6-9` doc comment): each frame is `cellH` rows of
`cellW` entries, an entry being `[char, fg, bg]` or `null`.

### `parseSprite` / `serializeSprite` — what's validated and refused

`parseSprite(raw, source)` (`sprite.ts:65-105`), all failures throw via
`fail(source, message)` which prefixes every message with `sprite
${source}:` (`sprite.ts:37-39`):

- Root must be a non-null object (`sprite.ts:67`).
- `name` must be a non-empty string (`sprite.ts:68`).
- `cellW`/`cellH` must be integers `>= 1` (`sprite.ts:69-70`).
- `animations` must be a non-empty object — **a sprite needs at least one
  animation** (`sprite.ts:71-74`).
- Per animation: `frames` must be a non-empty array — an animation with
  zero frames is refused (`sprite.ts:78-80`).
- Per frame: must have exactly `cellH` rows (`sprite.ts:84-86`); each row
  must have exactly `cellW` cells (`sprite.ts:88-89`) — dimension mismatch
  anywhere fails the whole sprite, named down to `animation X frame Y row Z
  cell W`.
- Per cell (`parseCell`, `sprite.ts:41-62`): `null` is accepted as-is
  (transparent); otherwise must be a 3-element array `[char, fg, bg]`
  (`sprite.ts:45-47`); `char` must be a string of length 1
  (`sprite.ts:49-51`); `char` must not be `{` or `}` (`sprite.ts:52-54`,
  "would corrupt tag markup"); `fg`/`bg` must be integers in `[0, 15]`
  (`sprite.ts:55-60`).
- `ticksPerFrame`: if not a positive integer, silently defaults to `1`
  (not a throw — `sprite.ts:97-98`).
- `loop`: defaults to `true` unless explicitly `false`
  (`rawAnim.loop !== false`, `sprite.ts:99`).

`serializeSprite(sprite)` (`sprite.ts:114-131`): builds the raw JSON shape,
then **round-trips it through `parseSprite` before returning**
(`sprite.ts:129`, comment: "throws before disk") — a corrupted in-memory
document throws at serialize time rather than writing a file that fails the
next door load. Output is `JSON.stringify(raw, null, 1) + '\n'`
(`sprite.ts:130`).

Other exports: `frameAt(anim, tick)` (`sprite.ts:134-140`) — pure function
of the game tick (never wall clock), `Math.floor(tick / max(1,
ticksPerFrame))` indexed modulo frame count if looping, else clamped to the
last frame if not. `blitSprite(dest, sprite, animation, tick, gridX,
gridY)` (`sprite.ts:149-165`) throws if the named animation doesn't exist,
naming the sprite and listing valid animation names in the error.

`loadSpriteSheet(dir)` (`load.ts:11-27`) — the only file in cell-art that
touches `fs`; loads every `*.sprite.json` in a directory via `parseSprite`,
keyed by `sprite.name`; throws `sprite directory not found: ${dir}` if the
dir read fails.

### Half-block pixel codec (`halfblock.ts`)

`PixelGrid = Array<Array<number | null>>` — colours 0-15 or `null`
(transparent), height always even (`halfblock.ts:17`).

**`compilePixels(pixels)`** (`halfblock.ts:20-47`): two pixel rows → one
cell row. Throws if `pixels.length % 2 !== 0` (`halfblock.ts:21-23`). For
each (top, bottom) pixel pair:

| top | bottom | cell |
|---|---|---|
| null | null | `null` (fully transparent) |
| colour | null | `{ char: '▀', fg: top, bg: 0 }` |
| null | colour | `{ char: '▄', fg: bottom, bg: 0 }` |
| c | c (equal, non-null) | `{ char: '█', fg: c, bg: c }` |
| top | `0` (black, not the transparent-bottom case) | `{ char: '▄', fg: 0, bg: top }` |
| top | bottom (both non-null, unequal) | `{ char: '▀', fg: top, bg: bottom }` |

The `bottom === 0` special case (`halfblock.ts:41`) is the load-bearing
one: a **black bottom pixel** must not collide with a **transparent**
bottom pixel — both would otherwise encode as `{▀, fg: top, bg: 0}`. The
codec instead flips to the lower-half glyph with swapped fg/bg roles
(`▄` with `fg: 0, bg: top`), which paints identically to the eye (top half
shows `top`'s colour, bottom half shows black) but decompiles distinctly
from the transparent case. Doc comment calls this out explicitly
(`halfblock.ts:36-40`): "Review-caught before the pixel editor could
silently drop painted black on every save/reload."

**`decompilePixels(frame)`** (`halfblock.ts:57-78`): the exact inverse, or
`null` if the frame is not pure half-block art (anything else — letters,
shades, arrows — decompiles to `null` and must be edited cell-by-cell
instead; `halfblock.ts:9-12` doc comment: "lossy conversion is how an
editor corrupts art just by opening it, so there is none"). Per cell:
`null` → `(null, null)`; `█` with `fg === bg` → `(fg, fg)`; `▀` with `bg
=== 0` → `(fg, null)` (transparent bottom); `▄` with `bg === 0` → `(null,
fg)` (transparent top); `▀` otherwise → `(fg, bg)`; `▄` otherwise → `(bg,
fg)` (swapped-roles black-under-colour case); anything else (any other
char/fg/bg combination) → returns `null` for the whole frame
(`halfblock.ts:73`).

`sdk/engines/graphics/cell-art/index.ts` re-exports the full public
surface: `PALETTE, createBuffer, blitCells, rowToTags, bufferToTags` from
cells; `parseSprite, serializeSprite, frameAt, blitSprite` + `Sprite,
SpriteAnimation` types from sprite; `loadSpriteSheet` from load;
`compilePixels, decompilePixels` + `PixelGrid` type from halfblock.

## 2. The document model (`Doors/sprite-editor/edit-doc.ts`)

```ts
export interface EditDoc {
  sprite: Sprite;
  animation: string;   // current animation name
  frame: number;        // current frame index within that animation
  dirty: boolean;
}
```
(`edit-doc.ts:17-22`)

Module doc comment (`edit-doc.ts:1-10`): "the UI binds keys to these
functions and paints the result, so the whole editing feature is
assertable without a terminal." Operations return **new docs (dirty)**; a
clamped/no-op selection returns the **SAME doc reference** ("the identity
rule the repaint skip relies on" — callers like `apply()` in
`edit-screen.ts:433` check `next === this.doc` to skip repainting).

Every mutating op deep-clones the sprite via `cloneSprite`
(`JSON.parse(JSON.stringify(sprite))`, `edit-doc.ts:24-25`) so the previous
`EditDoc.sprite` is never mutated in place.

Full op list:

| Op | Signature | Identity/refusal behaviour |
|---|---|---|
| `openDoc` | `(sprite: Sprite) => EditDoc` | clones sprite; picks `Object.keys(animations).sort()[0]` as current animation, frame 0, `dirty: false` (`edit-doc.ts:37-45`) |
| `currentFrame` | `(doc) => CellBuffer` | pure read, no clone (`edit-doc.ts:47-49`) |
| `selectAnimation` | `(doc, name) => EditDoc` | throws `no animation '${name}'` if missing (`edit-doc.ts:52-54`); returns SAME doc if `name === doc.animation` (`edit-doc.ts:55`); else resets `frame: 0` |
| `selectFrame` | `(doc, index) => EditDoc` | clamps index to `[0, count-1]`; returns SAME doc if clamped result equals current frame (`edit-doc.ts:59-64`) |
| `addFrame` | `(doc, mode: 'blank' \| 'duplicate') => EditDoc` | inserts after current frame; `duplicate` deep-clones the current frame via JSON round-trip, `blank` builds an all-`null` frame sized `cellW x cellH` (`edit-doc.ts:66-73`) |
| `deleteFrame` | `(doc) => EditDoc` | **throws** `'cannot delete the last frame - the loader rejects an empty animation'` if only 1 frame remains (`edit-doc.ts:77-79`); new current frame is `min(doc.frame, frames.length-1)` |
| `moveFrame` | `(doc, delta: -1\|1) => EditDoc` | swaps with adjacent frame; returns SAME doc (no-op) if the move would go out of bounds (`edit-doc.ts:86-87`) |
| `setCell` | `(doc, row, col, cell: Cell\|null) => EditDoc` | writes into the current frame only; always marks dirty (no identity short-circuit even for a no-op write) |
| `frameIsPixelEditable` | `(doc) => boolean` | `decompilePixels(currentFrame(doc)) !== null` (`edit-doc.ts:99-101`) |
| `setPixel` | `(doc, py, px, colour: number\|null) => EditDoc` | **throws** `'frame is not pixel-editable - it holds non-half-block art'` if `decompilePixels` returns null (`edit-doc.ts:103-107`); otherwise writes into the pixel grid and recompiles just the current frame |
| `floodFill` | `(doc, row, col, colour: number\|null) => EditDoc` | 4-connected flood fill in **pixel space**; same not-pixel-editable throw as `setPixel`; also throws (via array index access) if `(row,col)` is out of grid bounds (`pixels[row][col]` at `edit-doc.ts:132`); returns SAME doc if the target pixel already equals `colour` — explicit identity-rule doc comment at `edit-doc.ts:122-126` |
| `setTicksPerFrame` | `(doc, delta: number) => EditDoc` | `Math.max(1, ticksPerFrame + delta)` — floor of 1, never throws, always dirty |
| `toggleLoop` | `(doc) => EditDoc` | flips `loop` on current animation, always dirty |
| `addAnimation` | `(doc, name) => EditDoc` | **throws** if `name` fails `/^[a-z0-9-]+$/` (`edit-doc.ts:171-173`); **throws** if an animation with that name already exists (`edit-doc.ts:174-176`); new animation gets `{ticksPerFrame: 4, loop: true, frames: [blankFrame]}` and becomes current, frame reset to 0 |
| `deleteAnimation` | `(doc) => EditDoc` | **throws** `'cannot delete the last animation - a sprite needs one'` if only 1 animation remains (`edit-doc.ts:184-186`); switches to `Object.keys(animations).sort()[0]` of what's left, frame 0 |
| `toSprite` | `(doc) => Sprite` | deep clone for handoff to `writeSprite` |

Dirty state: set `true` by every op that changes `sprite` content
(`withFrames` at `edit-doc.ts:31-35` always sets `dirty: true`;
`setTicksPerFrame`/`toggleLoop`/`addAnimation`/`deleteAnimation` each set
it inline). Cleared only by the caller after a successful save
(`edit-screen.ts:461`: `this.doc = { ...this.doc, dirty: false }`) — nothing
in `edit-doc.ts` itself clears it.

## 3. Persistence (`Doors/sprite-editor/assets.ts`)

`DOORS_ROOT` (`assets.ts:24-33`): found by walking up from `__dirname`
until a directory literally named `Doors` is found; throws if it walks off
the filesystem root without finding one.

`resolveAssetPath(door, kind: 'sprites' | 'art', file)`
(`assets.ts:36-55`) — "the only door to the filesystem." Resolves `base =
resolve(DOORS_ROOT, door, kind)` and `target = resolve(base, file)`, then
checks **containment first, before any shortcut**: `base` itself must
start with `DOORS_ROOT + sep` (guards a `door` argument like `..` from
escaping `Doors/`) — doc comment at `assets.ts:43-49` cites a specific
review-caught bug where checking the `target === base` shortcut before
this containment check let `resolveAssetPath('..', 'sprites', '.')` list
outside `Doors/`. If `target === base` it's returned as the directory
itself (for listing); otherwise `target` must start with `base + sep`, or
it throws `asset path outside ${door}/${kind}: ${file}`.

Sprite functions:
- `listDoorsWithSprites()` (`assets.ts:58-71`): every subdirectory of
  `Doors/` that has a `sprites/` dir containing at least one
  `*.sprite.json`, sorted.
- `listSprites(door)` (`assets.ts:74-77`): `*.sprite.json` filenames in
  `Doors/<door>/sprites/`, sorted.
- `readSprite(door, file)` (`assets.ts:80-83`): reads, `JSON.parse`s, and
  runs through `parseSprite(json, file)` — a bad file throws named by
  filename.
- `writeSprite(door, file, sprite)` (`assets.ts:86-92`): `serializeSprite`
  first (throws before any disk touch), then writes to a
  `${path}.tmp-${process.pid}` sibling and `fs.renameSync`s it over the
  real path — atomic replace on the same filesystem.

Art functions:
- `listArt(door)` (`assets.ts:95-102`): `*.ans` files (case-insensitive
  extension match) in `Doors/<door>/art/`, sorted; returns `[]` if the
  `art/` directory doesn't exist (not an error — "a normal state").
- `readArt(door, file)` (`assets.ts:104-106`): raw `Buffer` read, no
  parsing.
- `writeArt(door, file, data: Buffer)` (`assets.ts:108-114`): same
  tmp-file + atomic-rename pattern as `writeSprite`, plus `fs.mkdirSync(...,
  {recursive: true})` on the parent dir first (sprites/ is assumed to
  exist already; art/ is created on demand).

Directories involved: `Doors/<door>/sprites/*.sprite.json` and
`Doors/<door>/art/*.ans`, both gated through the same
`resolveAssetPath` guard, both funnels for every path the UI can reach.

## 4. Current editor's sprite-specific feature checklist (`edit-screen.ts`)

Everything below lives in `Doors/sprite-editor/edit-screen.ts` unless noted;
line numbers point at `edit-screen.ts` unless another file is named. This is
the surface a new ANSIEditor-hosted editing screen would have to
reconstruct.

- **Frame strip** — a one-row horizontal strip of frame index tokens
  (`[3]` for the active frame, ` 4 ` for others), built by `frameTokens()`
  (`edit-screen.ts:639-642`), painted by `paintFrames()`
  (`edit-screen.ts:644-649`) into `this.framesBox` (a `DockablePanel`
  content box, `LAYOUT.edit.frames` rect — `layout.ts:52`). Click-to-select
  via `handleFramesClick` (`edit-screen.ts:601-613`), which hit-tests the
  click's local column against `tokenAtColumn(frameTokens(), localX)`
  (`token-strip.ts`) and calls the exact same `selectFrame` op the `,`/`.`
  keys use — no second selection code path.

- **Live preview + playback timing** — `this.previewPanel`/`previewBox`
  (`LAYOUT.edit.preview`, `layout.ts:51`). A `setInterval` at
  `PLAYBACK_MS = 100` (`edit-screen.ts:32`) increments `this.tick` and
  calls `paintPreview()` every 100ms regardless of what else is happening
  (`edit-screen.ts:91-94`), independent of the editing tick displayed on
  the canvas. `paintPreview()` (`edit-screen.ts:621-630`) calls
  `previewLines(sprite, animation, tick, scale=2)` from `preview.ts`
  (`preview.ts:14-36`) — a pure function: looks up `frameAt(anim, tick)`
  (game-tick semantics, not wall-clock) and renders each cell doubled
  horizontally (scale 2, "half-block art reads as fat pixels" —
  `preview.ts:7`) via `rowToTags`. Playback interval is cleared in
  `destroy()` (`edit-screen.ts:679-682`).

- **Animation selection/creation/deletion** — `a` cycles to the next
  animation name alphabetically (`edit-screen.ts:271-276`, calls
  `selectAnimation`); `+` opens `promptText` for a new name then calls
  `addAnimation` (`edit-screen.ts:277-282`, refusal message surfaces via
  `tryOp`'s `statusFlash`); `S-x` opens `confirm(...)` then
  `deleteAnimation` (`edit-screen.ts:289-293`).

- **`ticksPerFrame` controls** — `t` / `S-t` call `setTicksPerFrame(doc,
  -1)` / `(doc, +1)` (`edit-screen.ts:283-286`); floor of 1 enforced in
  edit-doc.ts, not here.

- **Loop toggle** — `l` calls `toggleLoop` (`edit-screen.ts:287-288`).

- **Cell vs pixel mode** — `Tab` toggles `this.mode` between `'cell'` and
  `'pixel'` (`edit-screen.ts:231-241`). Entering pixel mode is gated by
  `frameIsPixelEditable(doc)` — if the frame is not pure half-block art the
  toggle is refused silently (mode stays `'cell'`). Cursor row is rescaled
  on the way in (`cursorRow * 2`, clamped to `cellH*2 - 1`) and back out
  (`Math.floor(cursorRow / 2)`). `apply()` (`edit-screen.ts:433-447`) is
  the single funnel that re-checks pixel-editability on every doc change
  (frame/animation switch, add/delete) and forces the mode back to `'cell'`
  if the newly-current frame isn't half-block-pure — the doc comment there
  explains why: left unchecked, `space` would call `setPixel` on a
  non-half-block frame and edit-doc.ts would throw out of the key handler.

- **Cursor model** — `cursorRow`/`cursorCol` are in **cell coordinates**
  in cell mode, **pixel coordinates** (`cellH * 2` rows) in pixel mode
  (`edit-screen.ts:51-52` field comment). `moveCursor(dr, dc)`
  (`edit-screen.ts:425-431`) clamps to `[0, rows-1] x [0, cellW-1]` where
  `rows` depends on mode. `applyToolAt` (`edit-screen.ts:549-577`) computes
  a `pixelRow` from a clicked cell row that **preserves which pixel half
  (top/bottom)** the cursor was already on — a mouse click has cell
  resolution, not half-cell, so only keyboard up/down can pick the half
  (doc comment `edit-screen.ts:544-548`).

- **Canvas rendering + hit-testing** — `paintCanvas()`
  (`edit-screen.ts:470-513`) renders the current frame at
  `CELL_CHAR_WIDTH = 2` (`edit-screen.ts:41`, exported so render and
  hit-test share one literal) chars per cell, cursor cell/pixel shown
  inverted (fg/bg swapped). `canvasHitTest(data)`
  (`edit-screen.ts:528-538`) maps an absolute mouse (x,y) back to a
  (row,col) using the live `canvasBox._getCoords()` and the same
  `CELL_CHAR_WIDTH` divisor. Click (`handleCanvasClick`,
  `edit-screen.ts:579-589`) and drag (`handleCanvasDrag`,
  `edit-screen.ts:592-599`, paint/erase tools only) both route through
  `applyToolAt`.

- **Paint tools** — `paint`/`erase`/`pick`/`fill` (`p`/`e`/`k`/`u`,
  `edit-screen.ts:346-353`), tracked in `this.tool`, dispatched inside
  `applyToolAt` (`edit-screen.ts:560-576`): `paint` calls `setPixel` or
  `setCell` depending on mode; `erase` the same with a `null`/`null`
  write; `fill` always calls `floodFill` in pixel space regardless of
  `this.mode` (defaults to the top half when invoked from cell mode); `pick`
  reads a colour into `this.fg` without touching the doc.

- **Glyph/fg/bg selection for the paint tool** — `g` cycles a fixed
  `GLYPHS` array (`▀▄█▌▐░▒▓•►◄▲▼`, `edit-screen.ts:31`); `f`/`S-f` cycle
  fg 0-15; `b`/`S-b` cycle bg 0-15 (`edit-screen.ts:243-252`).

- **Typed-character cell painting** — a raw `screen.on('keypress', ...)`
  listener (`edit-screen.ts:412-420`, NOT a `StudioBinding` table entry)
  writes any single printable, non-bound character into the cell under the
  cursor via `setCell`, only in cell mode, filtered against
  `bindingSet.excludedGlyphKeys` (every key any binding is bound to) and
  against `{`/`}` (forbidden by the format).

- **Toolbar** — `createToolbar` from `toolbar.ts`, mounted in
  `this.toolbarPanel` (`LAYOUT.edit.toolbar`); mirrors `this.tool`/`this.fg`
  as `ToolbarState`, refreshed every `paint()` call
  (`edit-screen.ts:659-661`) so a keyboard-driven tool/colour change can
  never desync from the toolbar's own highlight. (Toolbar internals are
  out of this document's scope — see `toolbar.ts`/`toolbar.test.ts`
  directly.)

- **Save and dirty-exit flow** — `s` calls `save()`
  (`edit-screen.ts:458-467`): `writeSprite(door, file, toSprite(doc))`
  inside a try/catch, clears `dirty` and sets `statusFlash` to
  `saved ${file}` on success, or `SAVE FAILED: ${message}` on failure (the
  document is NOT marked clean on failure). Exit (`escape` or `C-q`,
  binding `file.closeEditor`, `edit-screen.ts:309-315`): if not dirty, exits
  immediately; if dirty, opens a `confirm(...)` dialog ("Discard unsaved
  changes?") and only exits if confirmed — an unconfirmed dialog leaves the
  document untouched and open.

- **Status bar** — one line combining a dirty marker (`{lightred-fg}*{/}`),
  sprite name, animation name, `f${frame+1}`, an optional one-shot
  `statusFlash` message (cleared every `paint()`), and a static hotkey hint
  string (`edit-screen.ts:662-669`).

- **Help** — `F1` sets `statusFlash` to a one-line hotkey cheat-sheet
  (`edit-screen.ts:360-364`).

- **Reset Layout** — menu-only binding (`view.resetLayout`, empty `keys:
  []`, `edit-screen.ts:369-375`) that restores all four panels
  (canvas/preview/frames/toolbar) to their `LAYOUT.edit` rects and
  un-minimizes/un-docks them via `resetPanelLayout` (`panels.ts:123-132`).

## 5. Hosting ANSIEditor today (`art-screen.ts` vs `ansi-editor/index.ts`)

### `art-screen.ts` — `ArtSession`

Construction/lifecycle (module doc comment `art-screen.ts:1-13`): two
phases, not one screen — a small centred `blessed.list` picker first
(`showList()`, `art-screen.ts:129-157`), then the editor takes the whole
screen (`openEditor()`, `art-screen.ts:180-220`). `screen.key()` handlers
are **global** (fire regardless of focus), so the list's own keys are fully
**unbound** (`this.unbindKeys()`) before the editor's internal bindings take
over (`art-screen.ts:181`) — leaving both live would race Enter/Escape
between list and editor.

Constructing the widget (`art-screen.ts:187-217`):

```ts
this.editor = new ANSIEditor({
  parent: this.screen,
  top: 0, left: 0, width: '100%', height: '100%',
  title: `Art: ${this.door}/${file}`,
  initialContent: content,
  initialMode: 'draw',
  showLineNumbers: false,
  showMenuBar: true,
  showToolbar: true,
  showSidebar: true,
  showStatusBar: true,
  onSave: async (text: string) => { ... writeArt(...) ... },
  onExit: () => { this.exit(); },
});
this.editor.focus();
this.screen.render();
```

- **Full-screen** (`top:0, left:0, width/height:'100%'`), all four chrome
  panes on (`showMenuBar/showToolbar/showSidebar/showStatusBar: true`),
  `initialMode: 'draw'`.
- **`onSave`** (`art-screen.ts:198-212`): writes via `Buffer.from(text,
  'latin1')` — explicit comment that this must be byte-preserving because
  the widget moves cell chars 1:1 through the string with no CP437/UTF-8
  re-encoding of its own; `parseANSIToCanvas`/`canvasToANSI` copy
  `cell.char` verbatim. Returns `true`/`false`; `console.error`s and
  returns `false` on write failure — no `statusFlash`-style surfacing back
  to the user visible in this file (the widget presumably shows its own
  save-failed UI).
- **`onExit`** (`art-screen.ts:214-216`): calls `this.exit()`, which calls
  `this.destroy()` then `this.onExit()` (the `ArtSession` constructor's own
  callback — chains back to `StudioApp`).

**Own menu bar teardown**: the *picker's* menu bar (`this.menuBar`, built
from `buildListBindings()`/`buildBindingSet`) is explicitly **destroyed**,
not merely hidden, in `openEditor()` (`art-screen.ts:184-185`) — doc
comment (`art-screen.ts:165-179`) explains why: the `ANSIEditor` is opened
with its own `showMenuBar: true`, this `ArtSession` never returns to the
list phase once the editor is open, and a destroyed element is fully
detached from the screen tree so it can never intercept a mouse hit-test
either — proven against a real `Screen` in
`art-screen.test.ts`'s `thePickerMenuBarDoesNotOutliveTheListPhase`.

**Destroy** (`art-screen.ts:227-241`): `unbindKeys()`, destroy+null the
list box (idempotent if already gone), destroy+null the picker's menu bar
(idempotent — already done by `openEditor` in the normal flow, but the
"cancel from the list phase without ever opening the editor" path reaches
`destroy()` with it still alive), destroy+null `this.editor`.

**Return to the browser**: `ArtSession`'s `onExit` callback (passed in by
its constructor's caller, `app.ts`) — not read directly in this file, but
the chain is `ANSIEditor.onExit → this.exit() → this.destroy() +
this.onExit()`.

### `ansi-editor/index.ts` — the other worked example

A full standalone door (`ANSIEditorDoor`), not embedded inside a sibling
studio. Key differences from `art-screen.ts`:

- **Storage backend differs by mode**: user files go through
  `ctx.storage.{keys,load,save,delete}` under an `ansi:` key prefix
  (`index.ts:14, 81-126`) — a database-backed per-user store, not
  filesystem paths. A separate **sysop-only BBS-file browsing mode**
  (`isSysop()` gated on `accessLevel >= 255`, `index.ts:135-137`) reads/
  writes real BBS screen directories (`Screens`, `Bulletins`,
  `Conf01/Screens`, etc. — `BBS_SCREEN_DIRS`, `index.ts:20-27`) via
  `ctx.bbs.{listFiles,readFile,writeFile}`, entirely disjoint from
  `sprite-editor/assets.ts`'s `Doors/<door>/art/` filesystem convention.
- **Screen construction is manual and lower-level**: `createScreen(bbs,
  {...})` from `utils/blessed-helpers` plus explicit `program.write`
  escape sequences to clear the terminal and `screen.alloc()`
  (`index.ts:350-358`) — `art-screen.ts` never touches `screen.program`
  directly or calls `createScreen` itself (it receives an already-live
  `screen` from its constructor, built upstream by `app.ts`/`StudioApp`).
  `DoorInputManager` is constructed directly with `enableGrabKeys: false`
  called out as CRITICAL in a comment (`index.ts:360-367`) — `art-screen.ts`
  has no equivalent input-manager wiring of its own (that lives in whatever
  hosts the whole `StudioApp`/`screen`, outside this file).
- **No `StudioBinding`/`bindings.ts` table at all**: every dialog
  (`fileList`, `dirList`, `promptFilename`, `confirmDialog`, `showMessage`,
  `showHelp`/`DocModal`) wires its own raw `.key([...])` calls ad hoc
  (e.g. `index.ts:243-252, 310-338, 431-466, 708-711`) — no shared
  dialog-open guard flag, no derived menu, no dialogs.ts-style
  `promptText`/`confirm` helpers. `sprite-editor` centralizes all of that;
  `ansi-editor` predates/bypasses it entirely.
- **`onSave`/`onSaveAs`/`onOpen`/`onOpenBBS` callback surface is richer**:
  `art-screen.ts`'s `ArtSession` wires only `onSave` and `onExit` on the
  `ANSIEditor`. `ansi-editor/index.ts` additionally wires `onSaveAs`
  (`index.ts:565-571`, prompts for a filename and always saves to user
  storage, resetting BBS mode) and `onOpenBBS`
  (`index.ts:578-581`, sysop-only, opens the BBS directory browser) —
  showing the widget's constructor accepts a broader set of file-menu
  callbacks than `art-screen.ts` currently exercises.
- **Editor recreated per open, not reused**: `openEditor(initialContent)`
  (`index.ts:508-591`) destroys any existing `this.editor` first
  (`index.ts:510-512`) and constructs a fresh `ANSIEditor` every time a
  file is opened/switched — same pattern as `art-screen.ts`'s single
  `openEditor` call (which only ever runs once per `ArtSession`, since
  there's no "open another file" path once inside the editor phase).
- **Same `latin1` byte-preservation discipline** on save
  (`saveFile`/`saveBBSFile`), though not called out with the same explicit
  comment `art-screen.ts` carries.
- **Exit path**: `onExit: () => { this.cleanup(); }` — `cleanup()`
  (`index.ts:837-854`) disables the input manager, destroys the screen if
  not already destroyed, resolves the `start()` promise, and calls
  `ctx.close()` — a full door-exit, not a "return to a sibling screen"
  the way `art-screen.ts`'s `ArtSession.exit()` hands control back to
  `StudioApp`.

Both share: `top:0, left:0, width:'100%', height:'100%'`, `initialMode:
'draw'`, `showLineNumbers: false`, all four chrome panes on, and `onSave`
returning a boolean success flag with a `try/catch` around the actual
write.

## 6. Binding/menu/panel architecture

### `bindings.ts` — `StudioBinding`/`BindingSet`

```ts
export interface StudioBinding {
  id: string;          // stable id, e.g. 'frame.new'
  keys: string[];       // blessed key names, e.g. ['n']
  hotkeyHint: string;   // shown in menu label, e.g. 'n' or 'S-x'
  menu: string;         // top-level menu label, e.g. 'Frame'
  label: string;        // menu item label, e.g. 'New Frame'
  handler: () => void;
}
```
(`bindings.ts:29-36`) `keys: []` is legal and means "menu-only" (e.g.
`view.resetLayout`).

`buildBindingSet(bindings, isBlocked = () => false)` (`bindings.ts:88-140`):

- Rejects duplicate `id`s across the table (throws).
- Wraps every `binding.handler` **once**, in exactly one place, with `if
  (isBlocked()) return; binding.handler();` (`bindings.ts:105-111`) — the
  returned `bindings` array (`guardedBindings`) is what both `screen.key()`
  registration (in each screen's `bindKeys()`) and `menuItems()` read, so
  keyboard dispatch and a `DropdownMenu` item's mouse-click `action` share
  the literal same guarded function reference. Module doc comment
  (`bindings.ts:11-27`) frames this as the fix for a recurring bug class:
  a dialog opens (`dialogs.ts` sets `screen.dialogOpen = true`) but some
  OTHER input path — a new keyboard op, canvas click/drag, or a menu item's
  mouse click — doesn't consult the flag and mutates the document mid-dialog;
  four separate review-caught instances of this are cited.
- Derives `excludedGlyphKeys: Set<string>` — every single-printable-char key
  any binding is bound to, via `glyphForKey(key)` (`bindings.ts:68-77`):
  `'space'` → `' '`; `'S-x'` → shifted symbol (uppercase, or the explicit
  `SHIFTED_SYMBOL` map for `,`/`.` → `<`/`>`, since Shift+comma is not
  comma's "uppercase" — `bindings.ts:53-56`); a bare single character → itself;
  anything else (arrows, tab, enter, delete, F-keys, `C-q`...) → `null`
  (contributes nothing). This set is what `edit-screen.ts`'s raw keypress
  listener consults to avoid re-typing a bound letter into the cell.
- `menuItems()` (`bindings.ts:121-137`): groups `guardedBindings` by
  `binding.menu` in first-seen order, each item labelled `"${label}
  (${hotkeyHint})"` when a hint exists, else just `label`; `action` is the
  same guarded handler.

### `menu.ts`

Thin wrapper: `createStudioMenuBar(screen, items: MenuBarItem[])` just
constructs `new MenuBar({ screen, items })` from the SDK
(`menu.ts:14-16`). No handler indirection — `BindingSet.menuItems()`
already shapes items with hotkey hints baked into labels.

### `panels.ts` — `DockablePanel` wrapping

`makePanel(screen, { key, title, rect })` (`panels.ts:41-60`): every studio
content pane (canvas/preview/frames/toolbar in edit mode; doors/sprites/
animations/preview in browse mode) becomes a `DockablePanel` with
`useTitleBar: true, draggable: true, resizable: true, allowMinimize: true,
topConstraint: MENU_HEIGHT, bottomConstraint: 1, persistenceKey: 'sprited:'
+ key, fitContent: false`. Doc comment notes persistence
(`DockablePanel.saveState/loadState`) silently no-ops because this door's
`screen` (built via `createScreen`) never sets a `screen.storage` — drag/
resize/dock/minimize work in-session but don't survive reload; documented
as an accepted degradation (`panels.ts:18-26`).

`panelContentRect(rect)` (`panels.ts:83-90`): the integer rect a pane's
content child must use *inside* its panel — `top: 1` (skips the title
bar's own row 0, which paints over row 0 of any content sharing it — a
review-caught bug, `panels.ts:69-81`), `left: 0`, `width: rect.width - 2`,
`height: rect.height - 3` (border on both sides + title bar row).

`resetPanelLayout(panel, rect)` (`panels.ts:123-132`): two sequential
`setState()` calls, not one — first `{minimized: false}` alone (un-hides
children, safe no-op if not minimized), then `{position: 'float', x, y,
width, height}` with no `minimized` key so the maximize()-restores-saved-
geometry branch never runs and clobbers the just-applied `LAYOUT` rect. Doc
comment traces the exact `dockable-panel.ts` line numbers this depends on.

### `layout.ts` — `LAYOUT` rects

All-integer geometry, explicitly replacing percent-string layout after a
review-caught rounding bug (percent strings resolved independently per
pane could disagree at some terminal heights on a shared boundary — full
arithmetic in the module doc comment, `layout.ts:1-24`). `Rect = {top,
left, width, height}` (`layout.ts:26-31`). `STATUS_ROW = 24`
(`layout.ts:34`).

`LAYOUT.edit` (`layout.ts:49-55`): `canvas: rect(1, 0, 44, 19)`; right
column shares the same 19 content rows top-to-bottom: `preview: rect(1,
44, 36, 8)`, `frames: rect(9, 44, 36, 6)`, `toolbar: rect(15, 44, 36, 5)`
(each top = previous top + previous height, never re-derived from a
percent); `status: rect(STATUS_ROW, 0, 80, 1)`.

`LAYOUT.browser` (`layout.ts:61-67`): `doors: rect(1, 0, 20, 19)`,
`sprites: rect(1, 20, 20, 9)`, `animations: rect(10, 20, 20, 10)`,
`preview: rect(1, 40, 40, 19)`, `status: rect(STATUS_ROW, 0, 80, 1)`.

### `dialogs.ts` — `promptText`/`confirm`

`promptText(screen, title, initial='')` (`dialogs.ts:82-120`): sets
`screen.dialogOpen = true` before constructing a centred `Box` + `Textbox`;
resolves the **trimmed** submitted value on Enter (empty/whitespace-only
submit is refused — dialog stays open, `dialogs.ts:111`), or `null` on ESC
(`Textbox`'s own `'cancel'` event); does **not** filter which characters
can be typed (downstream validation — e.g. `addAnimation`'s name-pattern
check — is each caller's job); clears `screen.dialogOpen` and destroys the
widgets in `finish()`.

`confirm(screen, message)` (`dialogs.ts:134-173`): sets `screen.dialogOpen
= true`, builds an SDK `ConfirmModal` with `confirmColor: 'red',
cancelColor: 'green'` (dangerous choice red, safe way out green — matches
the convention used elsewhere for destructive confirms); resolves `true`
on Confirm, `false` on Cancel or ESC; `finish()` calls `modal.hide()`
**before** `modal.destroy()` (not destroy alone) because `ConfirmModal` is
built `trapFocus: true` and only `Element.hide()` (not `destroy()`) releases
that trap while the widget isn't yet marked destroyed — a review-caught
ordering bug, explained in detail at `dialogs.ts:138-153`.

`screen.dialogOpen` is the single flag every keyboard handler (via
`bindings.ts`'s `isBlocked` wrap), every mouse handler (`edit-screen.ts`'s
`handleCanvasClick`/`handleCanvasDrag`/`handleFramesClick` each check it
directly), and the raw keypress-typing listener consult, and it is armed/
disarmed **only** inside these two functions — module doc comment
(`dialogs.ts:1-59`) is an extended postmortem of four separate leaks (2b
keyboard ops, 2c canvas click, 2c canvas drag, 2c menu-item mouse click)
that each happened because a new input path forgot to consult it, and
frames centralizing the *check* (not just the *set*) inside
`buildBindingSet`'s wrap as the actual fix for future consumers.

## 7. Test architecture (`Doors/sprite-editor/tests/`)

Runner: `run-tests.ts` (`tests/run-tests.ts`) — no framework; a hardcoded
`TEST_MODULES` array of 16 modules is imported, every exported `async
function` in each is invoked as a test (name = function name), pass/fail
tallied, non-zero exit on any failure. Run via `npm test` (tsx). Test
modules must add themselves to this array to run (`run-tests.ts:10`) — a
new test file that isn't added here silently never executes.

Three harness patterns recur across the suite:

1. **Source-shape tests** (e.g. `edit-screen-shape.test.ts`,
   `art-mode-shape.test.ts`, `art-screen.test.ts`'s
   `theNamingSubmitHandlerUsesTheCollisionCheck`): read the real `.ts`
   source with comments stripped (`raw.replace(/\/\*[\s\S]*?\*\//g,
   '').replace(/\/\/[^\n]*/g, '')`, applied per-file, e.g.
   `edit-screen-shape.test.ts:14-15`) and assert on substring/regex
   presence — e.g. "edit-screen must use `addFrame` from edit-doc",
   "saving must use the guarded writer" (`writeSprite(`). Comment-stripping
   is explicitly called out as necessary because a naive grep matched
   commented-out code twice in this project's history.

2. **Fake-screen behavior tests** (e.g. `edit-screen-behavior.test.ts`,
   most of `menu-coverage.test.ts`): a hand-rolled `makeFakeScreen()`
   object (duplicated per test file by convention, not shared/imported —
   noted explicitly in `menu-coverage.test.ts:56-60`) implements just
   enough of the real `Screen` API for REAL SDK widgets (`blessed.box`,
   `DockablePanel`, `Textbox`, `ConfirmModal`) to construct and tear down
   without throwing: `width/height`, `children[]`, `append`/`remove`,
   `render`/`clearRegion`/`invalidateMouseIndex` (no-ops), `key`/`unkey`
   backed by a tracked `_keyBindings` array, `on`/`removeListener` for
   `'keypress'`, `setFocused`/`getFocused`, and `trapFocus`/
   `releaseFocusTrap`/`isFocusTrapped`/`getFocusTrap` for `ConfirmModal`'s
   focus trap. Real `EditScreen`/`ArtSession` instances are constructed
   against this fake screen and real keystrokes are replayed against the
   registered handlers to exercise modal-state bugs that a source-shape
   grep can't see (per `edit-screen-behavior.test.ts:1-15` doc comment).

3. **Real-`Screen` construction tests** — a smaller number of tests (13 in
   `edit-screen-behavior.test.ts`, at least one in `art-screen.test.ts`,
   e.g. `thePickerMenuBarDoesNotOutliveTheListPhase` at
   `art-screen.test.ts:124`) construct the SDK's actual `Screen` class
   (`new Screen({ title, width: 80, height: 25 })`) instead of the fake,
   for cases where the fake's approximation isn't sufficient proof (e.g.
   proving a destroyed menu bar is truly unreachable by a real mouse
   hit-test).

4. **Runtime menu-coverage audit** (`menu-coverage.test.ts`) — the
   generalized fix for "nothing should be hidden behind only hotkeys":
   compares every key actually registered via the fake screen's tracked
   `_keyBindings` against every key the screen's own `bindingSet.bindings`
   table declares, for all three screens (`EditScreen`, `ArtSession`,
   `StudioApp`). Two assertions per screen: (a) every keyed binding
   (non-empty `keys`) has a non-empty `menu`+`label`
   (`everyEditScreenKeyedBindingHasAMenuEntry`,
   `everyArtSessionKeyedBindingHasAMenuEntry`,
   `everyStudioAppKeyedBindingHasAMenuEntry`); (b) the registered-key set and
   the table's key set are exactly equal in both directions — no key
   registered outside the table (`extra`), and no table key that failed to
   register (`missing`) — via
   `{editScreen,artSession,studioApp}RegistersNoScreenKeysOutsideItsBindingTable`.
   Documented exceptions this check cannot see and doesn't try to
   (`menu-coverage.test.ts:26-45`): the raw cell-typing `screen.on('keypress',
   ...)` listener (not a `screen.key()` binding, needs no menu item any
   more than a text field does), and every SDK dialog widget's own internal
   `Element.key()` bindings (a completely separate map from
   `Screen.key()`'s, keyed only when the widget itself is focused).

### What would constrain or need rewriting if `edit-screen.ts` were replaced

- `edit-screen-shape.test.ts` and `edit-screen-behavior.test.ts` both
  import from `../edit-screen` directly (`EditScreen`, and
  `CELL_CHAR_WIDTH` specifically in the behavior file) — any replacement
  screen that isn't literally named/shaped `EditScreen` with the same
  exported `CELL_CHAR_WIDTH` constant breaks these files outright, not
  just their assertions.
- `edit-screen-shape.test.ts`'s `theScreenUsesTheDocumentModel` greps the
  new screen's source for literal op-name substrings
  (`openDoc, addFrame, deleteFrame, moveFrame, setCell, setPixel,
  setTicksPerFrame, toggleLoop, addAnimation, toSprite, floodFill`) — a
  rebuild that still calls these same `edit-doc.ts` ops would keep passing
  as long as the calls appear literally in the new file (or whichever file
  the test is repointed at).
- `menu-coverage.test.ts`'s `everyEditScreenKeyedBindingHasAMenuEntry` /
  `editScreenRegistersNoScreenKeysOutsideItsBindingTable` construct a real
  `EditScreen` (via `new EditScreen(screen, door, file, fixtureSprite(),
  onExit)`) and read `(edit as any).bindingSet.bindings` — any replacement
  must still expose a `bindingSet` built via `buildBindingSet` with the
  same shape for this test to keep functioning without a rewrite.
- `panels-behavior.test.ts`/`panels-shape.test.ts` and
  `dialogs-shape.test.ts` test `panels.ts`/`dialogs.ts` independently of
  `edit-screen.ts` (each keeps its own fake-screen copy per the stated
  per-file convention) — these would be reusable as-is by a new screen that
  keeps using `makePanel`/`panelContentRect`/`resetPanelLayout` and
  `promptText`/`confirm`.
- `bindings.test.ts` and `layout.test.ts` test `bindings.ts`/`layout.ts` in
  isolation from any screen — unaffected by an edit-screen rebuild as long
  as the new screen still consumes `LAYOUT.edit` and
  `buildBindingSet`/`StudioBinding`.
- `edit-doc.test.ts` tests `edit-doc.ts` purely (no screen/blessed
  involvement at all) — entirely unaffected by any change to how the
  editing surface is hosted, since it only exercises the document ops
  directly.
