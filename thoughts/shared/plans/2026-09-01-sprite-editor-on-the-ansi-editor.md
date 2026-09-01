---
date: 2026-09-01
topic: "The sprite studio's edit screen rebuilt on the SDK ANSIEditor widget"
tags: [sprite-editor, sprited, ansi-editor, sdk, cell-art, plan]
status: implemented
---

# Sprite Editor on the ANSIEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Doors/sprite-editor`'s edit screen paints through the SDK's `ANSIEditor` widget instead of its own hand-written painter, so the BBS has ONE cell-editing implementation.

**Architecture:** The widget is already able to host this — plan 3 (merged, `a2aa1af0d`) gave it canvas dimensions derived from the canvas, a real `Cell.transparent`, working undo, and `getCoreCanvas()`/`setCoreCanvas()` whose own doc comment names "the sprite editor's frame-swap use case this method exists for". Two capabilities are still missing and are built here first: an integer canvas ZOOM (a 5x2 sprite at one character per cell is unusable), and a transparency-preserving bridge between cell-art's `CellBuffer` (`Cell | null`) and the editor's `Cell[][]` (`transparent?: boolean`). Then the door adopts it: the widget owns the canvas, its pixels, its tools, its palette, its undo and its canvas mouse; the door keeps what the widget has no concept of — frames, animations, the playback preview, and saving a `.sprite` file.

**Tech Stack:** TypeScript, SDK blessed engine, jest (`sdk/tests/unit/`), the door's own tsx test runner (`Doors/sprite-editor/tests/run-tests.ts`).

**Spec:** `thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md` — "The ask, as it accumulated", item 3: *"The editor should fork the ANSI editor the BBS already has"*, and its reuse table: *"the studio door is a fork of its door wrapper reusing this engine wholesale"*. Studio 2b recorded a deviation from that line (the engine's pickers were coupled to its editor state); plan 3 removed the reason, and this plan closes the deviation. Companion research, binding for Tasks 1-3: `thoughts/shared/research/2026-09-01_ansi-editor-internals.md` and `thoughts/shared/research/2026-09-01_sprite-studio-model-and-hosting.md`.

## Global Constraints

- Repo root `/Users/spot/Code/amiexpress-web`. All paths relative to it.
- Stage files BY NAME. Never `git add -A` / `git add .`. Commit locally; **never push**.
- **Never** run `kill-servers.sh` / `start-servers.sh` — the controller restarts the backend.
- New files LF. No emoji anywhere, including commit messages and terminal output. ASCII tokens only (`[OK]`, `[ERROR]`).
- Commit trailers, both lines, verbatim:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF
  ```
- SDK checks after any `sdk/` edit: `cd sdk && npx tsc --noEmit -p tsconfig.json`, then `npx jest`, then `npm run build:cjs && npm run build:esm`, then grep the new symbol in `sdk/dist/**`. Nothing rebuilds dist for you. `sdk/dist` is gitignored — do NOT commit it.
- Door checks after any `Doors/sprite-editor` edit: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test`. Register every new test file in `tests/run-tests.ts`.
- Every behavior ships a RED-verified test. RED by DELETING the code under test, never by commenting it out (a regex pin matches its own comment).
- The pre-commit hook rebuilds a door's `dist/`. Let it. `sdk/engines/ui/blessed/widgets/ansi-editor.ts` is on the hook's exemption list as of this session — no `SKIP_SIZE_CHECK=1` needed for it.
- Other sessions' dirt in `git status` is normal (`sdk/engines/network/**`, `sdk/engines/ui/theme/chrome.ts`). Do not touch files outside your task's list.
- Art mode (`Doors/sprite-editor/art-screen.ts`) already hosts the widget and must keep behaving exactly as it does today. Every widget change here is opt-in via a defaulted option — prove it per task, don't assert it.

## File Structure (end state)

| file | responsibility |
|---|---|
| `sdk/engines/ui/blessed/widgets/ansi-editor.ts` | gains `cellScaleX`/`cellScaleY`; one shared canvas-render helper; scaled hit-test and cursor |
| `sdk/engines/graphics/cell-art/editor-canvas.ts` | NEW. `frameToCanvas` / `canvasToFrame` — the only place that converts between `Cell | null` transparency and `transparent: true` |
| `sdk/engines/graphics/cell-art/index.ts` | re-exports the two bridge functions |
| `Doors/sprite-editor/edit-screen.ts` | hosts the widget; owns frames, animations, preview, save. Loses ~250 lines of painter, hit-test, tools and palette state |
| `Doors/sprite-editor/toolbar.ts` | DELETED — the widget's sidebar replaces it |
| `Doors/sprite-editor/edit-doc.ts` | keeps frame/animation ops and `setCell`; loses `setPixel`, `floodFill`, `frameIsPixelEditable` |
| `Doors/sprite-editor/bindings.ts` | unchanged mechanism; the table it is given shrinks |

**Recorded deviations from the spec, with reasons:**
- **Pixel-space flood fill is dropped.** `edit-doc.floodFill` fills in half-block PIXEL space; the widget's fill tool fills in CELL space. Keeping both would put two mutators on one canvas, and the door's would bypass the widget's undo timeline — the exact class of bug plan 3 existed to remove. The widget's fill wins; half-block painting stays available through its half-block brush (Alt+H).
- **The door's single-letter hotkeys are dropped.** In draw mode the widget consumes every printable character (they type onto the canvas), so `n`/`c`/`x`/`a`/`t`/`l`/`s` cannot survive. Frame and animation ops move to the menu bar, with four Ctrl hotkeys kept for the frequent ones. This follows the user's own 2c directive ("the whole sprited app need to be menu driven"), and the 2c runtime audit already forbids a key without a menu entry.

---

### Task 1: Integer canvas zoom in the ANSIEditor

**Files:**
- Modify: `sdk/engines/ui/blessed/widgets/ansi-editor.ts`
- Test: `sdk/tests/unit/ansi-editor-zoom.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (Task 4 relies on these):
```ts
// ANSIEditorOptions gains:
cellScaleX?: number;  // horizontal characters per canvas cell. Default: 1.
cellScaleY?: number;  // vertical rows per canvas cell. Default: 1.
// ANSIEditor gains public:
getCellScale(): { x: number; y: number };
```
- Internally, two private getters are the ONLY source of scale, mirroring how `canvasW`/`canvasH` became the only source of dimensions in plan 3:
```ts
private get scaleX(): number { return this.optCellScaleX; }
private get scaleY(): number { return this.optCellScaleY; }
```

- [ ] **Step 1: Write the failing test**

Create `sdk/tests/unit/ansi-editor-zoom.test.ts`:

```ts
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

/**
 * Zoom is presentation only: getCoreCanvas() must return the same 5x2 grid
 * whatever the scale, while the rendered content grows by exactly the
 * scale factors and a click maps back through them.
 */
describe('ANSIEditor canvas zoom', () => {
  const make = (scale: number) => new ANSIEditor({
    canvasWidth: 5, canvasHeight: 2,
    cellScaleX: scale, cellScaleY: scale,
    initialMode: 'draw',
  });

  it('defaults to one character per cell', () => {
    const editor = new ANSIEditor({ canvasWidth: 5, canvasHeight: 2, initialMode: 'draw' });
    expect(editor.getCellScale()).toEqual({ x: 1, y: 1 });
  });

  it('reports the scale it was given', () => {
    expect(make(4).getCellScale()).toEqual({ x: 4, y: 4 });
  });

  it('does not change the canvas the host reads back', () => {
    const editor = make(4);
    const canvas = editor.getCoreCanvas();
    expect(canvas).not.toBeNull();
    expect(canvas!.length).toBe(2);
    expect(canvas![0].length).toBe(5);
  });

  it('renders each cell scaleX characters wide and scaleY rows tall', () => {
    const editor = make(3);
    const content = (editor as any).buildCanvasContent(
      (x: number, y: number) => ({ char: String(x), fg: 7, bg: 0 })
    ) as string;
    const rows = content.split('\n');
    expect(rows.length).toBe(2 * 3);           // 2 cells tall, 3 rows each
    expect(rows[0]).toBe(rows[1]);             // the three rows of cell-row 0 are identical
    expect(rows[0]).toBe(rows[2]);
    // cell (0,0) contributes its char three times in a row
    expect(rows[0].includes('000')).toBe(true);
  });

  it('maps a click through the scale to a cell', () => {
    const editor = make(4);
    // column 9 of the rendered canvas is inside cell column 2 (8..11)
    expect((editor as any).screenToCanvasX(9)).toBe(2);
    expect((editor as any).screenToCanvasY(5)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd sdk && npx jest tests/unit/ansi-editor-zoom.test.ts`
Expected: FAIL — `editor.getCellScale is not a function`.

- [ ] **Step 3: Add the options, the getters and the accessor**

In `sdk/engines/ui/blessed/widgets/ansi-editor.ts`, extend `ANSIEditorOptions` (after `canvasHeight`, around line 54):

```ts
  // Presentation-only magnification. A cell is drawn cellScaleX characters
  // wide and cellScaleY rows tall; getCoreCanvas() is unaffected, so a host
  // editing a 5x2 sprite reads back a 5x2 grid however large it is drawn.
  // Default 1/1 - existing hosts (Doors/ansi-editor, art mode) render
  // exactly as they do today.
  cellScaleX?: number;
  cellScaleY?: number;
```

Beside the existing `optCanvasWidth`/`optCanvasHeight` fields (around line 249), add:

```ts
  private optCellScaleX: number;
  private optCellScaleY: number;
```

In the constructor, beside where `optCanvasWidth` is assigned:

```ts
    this.optCellScaleX = Math.max(1, Math.floor(options.cellScaleX ?? 1));
    this.optCellScaleY = Math.max(1, Math.floor(options.cellScaleY ?? 1));
```

Beside the `canvasW`/`canvasH` getters (around line 277):

```ts
  private get scaleX(): number { return this.optCellScaleX; }
  private get scaleY(): number { return this.optCellScaleY; }
```

Beside `getCanvasSize()` (line 281):

```ts
  getCellScale(): { x: number; y: number } {
    return { x: this.scaleX, y: this.scaleY };
  }
```

- [ ] **Step 4: Extract the one canvas-render helper**

Both render loops build content the same way, one `cellToDisplayTag` per cell plus a newline per row — `syncCoreCanvasToDisplay()` (around line 3459) and `renderSelectionPreview()` (around line 3363). Replace both bodies with calls to a single helper so the scale can never be applied in one place and not the other:

```ts
  /**
   * The one place a canvas becomes blessed content. Each cell is emitted
   * scaleX times across and the whole row scaleY times down, so zoom is a
   * pure repeat of what one character per cell already produced - there is
   * no second, "scaled" rendering path that could disagree with the plain
   * one. `cellAt` lets a caller substitute cells it wants drawn instead of
   * the canvas's own (the marching-ants selection overlay does exactly
   * this) without duplicating the loop.
   */
  private buildCanvasContent(cellAt: (x: number, y: number) => Cell): string {
    const rows: string[] = [];
    for (let y = 0; y < this.canvasH; y++) {
      let row = '';
      for (let x = 0; x < this.canvasW; x++) {
        row += this.cellToDisplayTag(cellAt(x, y)).repeat(this.scaleX);
      }
      for (let n = 0; n < this.scaleY; n++) rows.push(row);
    }
    return rows.join('\n');
  }
```

`syncCoreCanvasToDisplay()` becomes:

```ts
  private syncCoreCanvasToDisplay(): void {
    if (!this.cellCanvas) return;
    this.drawCanvas.setContent(this.buildCanvasContent(
      (x, y) => this.cellCanvas![y]?.[x] || { char: ' ', fg: 7, bg: 0 }
    ));
    if (this.drawCursor) {
      this.drawCursor.setFront();
    }
  }
```

`renderSelectionPreview()` keeps its `minX`/`maxX`/`minY`/`maxY`/`marchCell` computation and replaces only its own nested loop and `setContent` with:

```ts
    this.drawCanvas.setContent(this.buildCanvasContent((x, y) => {
      const isEdge = x >= minX && x <= maxX && y >= minY && y <= maxY &&
        (y === minY || y === maxY || x === minX || x === maxX);
      const useMarch = isEdge && (x + y) % 2 === 0;
      return useMarch ? marchCell : (this.cellCanvas![y]?.[x] || { char: ' ', fg: 7, bg: 0 });
    }));
```

- [ ] **Step 5: Scale the hit-test and the cursor**

Add the two mapping helpers next to `clampCol`/`clampLine`:

```ts
  /** Rendered column -> canvas column. The inverse of buildCanvasContent's repeat. */
  private screenToCanvasX(x: number): number { return this.clampCol(Math.floor(x / this.scaleX)); }
  private screenToCanvasY(y: number): number { return this.clampLine(Math.floor(y / this.scaleY)); }
```

In BOTH `drawCanvas` mouse handlers (`'click'` around line 2288 and `'mouse'` around line 2320), replace

```ts
      this.cursor.col = this.clampCol(x);
      this.cursor.line = this.clampLine(y);
```

with

```ts
      this.cursor.col = this.screenToCanvasX(x);
      this.cursor.line = this.screenToCanvasY(y);
```

In `updateDrawCursor()` (line 2793), the overlay must land on the cell's first rendered character and cover the whole magnified cell:

```ts
    this.drawCursor.top = canvasTop + this.cursor.line * this.scaleY;
    this.drawCursor.left = canvasLeft + this.cursor.col * this.scaleX;
    this.drawCursor.width = this.scaleX;
    this.drawCursor.height = this.scaleY;
    this.drawCursor.setContent(this.currentChar.repeat(this.scaleX));
```

- [ ] **Step 6: Run the new test and the whole suite**

Run: `cd sdk && npx jest tests/unit/ansi-editor-zoom.test.ts`
Expected: PASS (5 tests).

Run: `cd sdk && npx jest`
Expected: PASS — 744 existing + 5. Any failure in `ansi-editor-*.test.ts` means the default-1 path changed behavior; fix it rather than updating the assertion.

- [ ] **Step 7: RED-verify the scale actually drives the render**

Temporarily DELETE `.repeat(this.scaleX)` from `buildCanvasContent`. Run the zoom test: the "renders each cell scaleX characters wide" case MUST fail. Restore it.

- [ ] **Step 8: Typecheck, build, verify dist**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json
npm run build:cjs && npm run build:esm
grep -c getCellScale dist/engines/ui/blessed/widgets/ansi-editor.js   # non-zero
```

- [ ] **Step 9: Commit**

```bash
git add sdk/engines/ui/blessed/widgets/ansi-editor.ts sdk/tests/unit/ansi-editor-zoom.test.ts
git commit -m "feat(sdk/ansi-editor): a cell can be drawn larger than one character"
```

---

### Task 2: The sprite-frame / editor-canvas bridge

**Files:**
- Create: `sdk/engines/graphics/cell-art/editor-canvas.ts`
- Modify: `sdk/engines/graphics/cell-art/index.ts`
- Test: `sdk/tests/unit/cell-art-editor-canvas.test.ts` (new)

**Interfaces:**
- Consumes: `Cell`/`CellBuffer` from `cell-art/cells.ts`; the editor's `Cell` type (type-only import) from `sdk/engines/ui/ansi-editor/types.ts`.
- Produces (Task 4 relies on these exact names):
```ts
export function frameToCanvas(frame: CellBuffer): EditorCell[][];
export function canvasToFrame(canvas: EditorCell[][]): CellBuffer;
```

- [ ] **Step 1: Write the failing test**

Create `sdk/tests/unit/cell-art-editor-canvas.test.ts`:

```ts
import { frameToCanvas, canvasToFrame } from '../../engines/graphics/cell-art/editor-canvas';
import type { CellBuffer } from '../../engines/graphics/cell-art/cells';

describe('cell-art <-> ANSIEditor canvas bridge', () => {
  it('carries a transparent hole across as an editor transparent cell', () => {
    const frame: CellBuffer = [[null, { char: 'A', fg: 3, bg: 1 }]];
    const canvas = frameToCanvas(frame);
    expect(canvas[0][0].transparent).toBe(true);
    expect(canvas[0][1]).toEqual({ char: 'A', fg: 3, bg: 1 });
  });

  it('brings a transparent editor cell back as null', () => {
    const canvas = [[
      { char: ' ', fg: 7, bg: 0, transparent: true },
      { char: 'A', fg: 3, bg: 1 },
    ]];
    expect(canvasToFrame(canvas)).toEqual([[null, { char: 'A', fg: 3, bg: 1 }]]);
  });

  it('round-trips a half-block frame unchanged, black bottom included', () => {
    // compilePixels' black-bottom encoding: a BLACK lower pixel under a
    // coloured upper one is the lower glyph with swapped roles. It must
    // survive the trip or painted black silently becomes transparent.
    const frame: CellBuffer = [[
      { char: '▄', fg: 0, bg: 4 },
      { char: '▀', fg: 2, bg: 0 },
      { char: '█', fg: 5, bg: 5 },
      null,
    ]];
    expect(canvasToFrame(frameToCanvas(frame))).toEqual(frame);
  });

  it('drops the editor-only blink attribute rather than smuggling it into a sprite', () => {
    const canvas = [[{ char: 'A', fg: 3, bg: 1, blink: true }]];
    expect(canvasToFrame(canvas)).toEqual([[{ char: 'A', fg: 3, bg: 1 }]]);
  });

  it('gives every row its own cells - no shared references', () => {
    const canvas = frameToCanvas([[null, null]]);
    canvas[0][0].char = 'X';
    expect(canvas[0][1].char).toBe(' ');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd sdk && npx jest tests/unit/cell-art-editor-canvas.test.ts`
Expected: FAIL — cannot find module `editor-canvas`.

- [ ] **Step 3: Write the bridge**

Create `sdk/engines/graphics/cell-art/editor-canvas.ts`:

```ts
/**
 * The one conversion between a sprite frame and an ANSIEditor canvas.
 *
 * Two transparency models meet here and nowhere else: cell-art says a hole
 * is `null` (compositing skips it), the editor says a hole is a cell with
 * `transparent: true` (it has no nullable slot - every position holds a
 * Cell). ANSI text cannot carry either, which is why the editor's own type
 * comment forbids wiring transparency into its ANSI codec and points hosts
 * at getCoreCanvas()/setCoreCanvas() instead. This module is that path.
 *
 * The import of the editor's Cell is TYPE-ONLY: cell-art gains no runtime
 * dependency on the blessed UI engine, so a game importing sprites does not
 * drag an editor into its bundle.
 */

import type { Cell as EditorCell } from '../../ui/ansi-editor/types';
import type { Cell, CellBuffer } from './cells';

/** What the editor shows where a sprite has a hole. */
const TRANSPARENT: Omit<EditorCell, 'transparent'> = { char: ' ', fg: 7, bg: 0 };

export function frameToCanvas(frame: CellBuffer): EditorCell[][] {
  return frame.map(row => row.map(cell => (
    cell === null
      ? { ...TRANSPARENT, transparent: true }
      : { char: cell.char, fg: cell.fg, bg: cell.bg }
  )));
}

export function canvasToFrame(canvas: EditorCell[][]): CellBuffer {
  return canvas.map(row => row.map(cell => (
    cell.transparent
      ? null
      // Rebuilt field by field, not spread: an editor cell may carry
      // `blink`, which a sprite has no concept of and the .sprite writer
      // would refuse. A spread would smuggle it into the saved file.
      : { char: cell.char, fg: cell.fg, bg: cell.bg } as Cell
  )));
}
```

- [ ] **Step 4: Export from the barrel**

In `sdk/engines/graphics/cell-art/index.ts`, beside the other re-exports:

```ts
export { frameToCanvas, canvasToFrame } from './editor-canvas';
```

- [ ] **Step 5: Run the test**

Run: `cd sdk && npx jest tests/unit/cell-art-editor-canvas.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: RED-verify the blink guard**

Temporarily change `canvasToFrame`'s non-transparent branch to `{ ...cell }`. The blink test MUST fail. Restore it.

- [ ] **Step 7: Typecheck, build, commit**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json && npx jest
npm run build:cjs && npm run build:esm
grep -c frameToCanvas dist/engines/graphics/cell-art/editor-canvas.js   # non-zero
cd /Users/spot/Code/amiexpress-web
git add sdk/engines/graphics/cell-art/editor-canvas.ts sdk/engines/graphics/cell-art/index.ts sdk/tests/unit/cell-art-editor-canvas.test.ts
git commit -m "feat(sdk/cell-art): one bridge between a sprite frame and an editor canvas"
```

---

### Task 3: Prove the widget's half-block output is a legal sprite frame

This task MEASURES before Task 4 relies on it. The studio's pixel mode is
being replaced by the widget's half-block brush; `decompilePixels` accepts
only five cell shapes and returns `null` for anything else, which would
silently demote a frame to "cell art". Find out now, in a test, not later
in a bug report.

**Files:**
- Test: `sdk/tests/unit/ansi-editor-halfblock-sprite-compat.test.ts` (new)
- Modify (ONLY if the test proves it necessary): `sdk/engines/graphics/cell-art/halfblock.ts`

**Interfaces:**
- Consumes: `frameToCanvas`/`canvasToFrame` (Task 2); `getCoreCanvas` (existing).
- Produces: the recorded compatibility fact that Task 4's half-block claim rests on.

- [ ] **Step 1: Write the characterization test**

Create `sdk/tests/unit/ansi-editor-halfblock-sprite-compat.test.ts`:

```ts
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import { canvasToFrame } from '../../engines/graphics/cell-art/editor-canvas';
import { decompilePixels } from '../../engines/graphics/cell-art/halfblock';

/**
 * The widget's half-block brush paints the same three glyphs the sprite
 * codec emits. If a frame the widget produced cannot be decompiled, the
 * studio's pixel editing is gone the moment it adopts the widget - so this
 * asserts the contract rather than trusting that both sides "use half
 * blocks".
 */
describe('ANSIEditor half-block output is a decompilable sprite frame', () => {
  const paint = (sub: 0 | 1, fg: number) => {
    const editor = new ANSIEditor({
      canvasWidth: 2, canvasHeight: 1, initialMode: 'draw',
      transparentBackground: true,
    });
    (editor as any).switchBrushMode('half-block');
    (editor as any).halfBlockSubY = sub;
    (editor as any).currentFg = fg;
    (editor as any).cursor = { line: 0, col: 0 };
    (editor as any).drawAtCursor(false);
    return canvasToFrame(editor.getCoreCanvas()!);
  };

  it('an upper-half stroke decompiles to a top pixel only', () => {
    const pixels = decompilePixels(paint(0, 4));
    expect(pixels).not.toBeNull();
    expect(pixels![0][0]).toBe(4);
    expect(pixels![1][0]).toBeNull();
  });

  it('a lower-half stroke decompiles to a bottom pixel only', () => {
    const pixels = decompilePixels(paint(1, 4));
    expect(pixels).not.toBeNull();
    expect(pixels![0][0]).toBeNull();
    expect(pixels![1][0]).toBe(4);
  });

  it('leaves untouched cells transparent, not black', () => {
    const pixels = decompilePixels(paint(0, 4));
    expect(pixels![0][1]).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and record what actually happens**

Run: `cd sdk && npx jest tests/unit/ansi-editor-halfblock-sprite-compat.test.ts`

Three outcomes, and the response to each:
- **All pass** — the contract holds. Write one line in the task report saying so, change no source, go to Step 4.
- **`decompilePixels` returns null** — read which glyph/fg/bg combination the widget produced (`console.log(editor.getCoreCanvas())` inside the test while diagnosing) and compare against the five accepted shapes at `halfblock.ts:78-83`. The fix belongs in `halfblock.ts` ONLY if the widget's shape is a legitimate half-block encoding the codec fails to accept; if the widget instead paints something that is not half-block art at all, the fix belongs in the widget. Record which, with the observed cells, before editing.
- **The private-field pokes throw** (a renamed field) — re-grep the widget for the current names (`switchBrushMode`, `halfBlockSubY`, `currentFg`, `drawAtCursor` were verified present at plan time) and fix the test. That is a test bug, not a product finding.

- [ ] **Step 3: If a fix was needed, RED-verify it**

Delete the accepting branch you added, confirm the test fails, restore it.

- [ ] **Step 4: Full suite, then commit**

```bash
cd sdk && npx jest
cd /Users/spot/Code/amiexpress-web
git add sdk/tests/unit/ansi-editor-halfblock-sprite-compat.test.ts
# plus sdk/engines/graphics/cell-art/halfblock.ts if Step 2 required it
git commit -m "test(sdk): the ANSI editor's half-block strokes are decompilable sprite pixels"
```

---

### Task 4: The edit screen hosts the widget

**Files:**
- Modify: `Doors/sprite-editor/edit-screen.ts`
- Test: `Doors/sprite-editor/tests/edit-screen-hosting.test.ts` (new), registered in `Doors/sprite-editor/tests/run-tests.ts`

**Interfaces:**
- Consumes: `frameToCanvas`/`canvasToFrame` (Task 2); `cellScaleX`/`cellScaleY`, `getCoreCanvas`, `setCoreCanvas`, `isModified` (Task 1 + existing widget).
- Produces (Tasks 5-6 rely on these):
```ts
// EditScreen gains, private:
private editor: any;                  // the ANSIEditor instance
private commitCanvasToDoc(): void;    // widget canvas -> this.doc (call BEFORE any frame/animation change and before save)
private loadFrameIntoEditor(): void;  // this.doc's current frame -> widget canvas
```

- [ ] **Step 1: Write the failing test**

Create `Doors/sprite-editor/tests/edit-screen-hosting.test.ts`. Follow the existing harness in `tests/edit-screen-behavior.test.ts` for the fake screen; the new assertions:

```ts
// 1. The canvas panel's child is an ANSIEditor, not a hand-painted box.
//    A source pin is not enough here (see feedback_regex_pin_cannot_prove_
//    runtime): assert on the constructed object.
const screen = makeFakeScreen();
const edit = new EditScreen(screen, 'pengo', 'penguin.sprite', sprite, () => {});
expect(typeof (edit as any).editor.getCoreCanvas).toBe('function');
expect((edit as any).editor.getCanvasSize()).toEqual({ width: sprite.cellW, height: sprite.cellH });

// 2. The frame reaches the widget.
const canvas = (edit as any).editor.getCoreCanvas();
expect(canvas[0][0].transparent).toBe(true);            // the blank fixture frame is holes

// 3. A widget-side edit reaches the document on commit.
canvas[0][0] = { char: 'A', fg: 3, bg: 1 };
(edit as any).commitCanvasToDoc();
expect(currentFrame((edit as any).doc)[0][0]).toEqual({ char: 'A', fg: 3, bg: 1 });
expect((edit as any).doc.dirty).toBe(true);

// 4. Changing frame commits the old one first - the defect this whole
//    hosting model would otherwise introduce: paint, press next-frame,
//    lose the strokes.
(edit as any).editor.getCoreCanvas()[0][1] = { char: 'B', fg: 2, bg: 0 };
(edit as any).nextFrame();
expect(currentFrame({ ...(edit as any).doc, frame: 0 })[0][1]).toEqual({ char: 'B', fg: 2, bg: 0 });

// 5. And the NEW frame is what the widget now shows.
expect((edit as any).editor.getCoreCanvas()[0][1].transparent).toBe(true);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Doors/sprite-editor && npm test`
Expected: FAIL — `(edit as any).editor` is undefined.

- [ ] **Step 3: Construct the widget in the canvas panel**

In `edit-screen.ts`, replace the `canvasBox` construction inside `buildLayout()` with the widget. Imports at the top:

```ts
import blessed, { ANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  Cell, Sprite, PALETTE, frameToCanvas, canvasToFrame,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
```

```ts
    this.canvasPanel = makePanel(this.screen, { key: 'canvas', title: ' Canvas ', rect: canvas });
    const canvasContent = panelContentRect(canvas);
    // The widget's own sidebar is 6 columns; the canvas gets what is left.
    // A 5-wide sprite at scale 4 is 20 columns inside a 44-column panel, so
    // the scale is chosen to fit rather than fixed: an artist editing a
    // 16-wide sprite gets a smaller magnification instead of a clipped one.
    const drawableW = canvasContent.width - CANVAS_SIDEBAR_COLS;
    const scale = Math.max(1, Math.min(
      Math.floor(drawableW / sprite.cellW),
      Math.floor(canvasContent.height / sprite.cellH),
    ));
    this.editor = new ANSIEditor({
      parent: this.canvasPanel,
      top: canvasContent.top, left: canvasContent.left,
      width: canvasContent.width, height: canvasContent.height,
      initialMode: 'draw',
      canvasWidth: this.doc.sprite.cellW,
      canvasHeight: this.doc.sprite.cellH,
      cellScaleX: scale, cellScaleY: scale,
      transparentBackground: true,   // an erased sprite cell is a HOLE, not black
      showSidebar: true,             // colours and tools - what toolbar.ts used to be
      showToolbar: true,             // the F-key character sets
      showMenuBar: false,            // the studio's own menu bar owns the top row
      showStatusBar: false,          // the studio's own status bar owns the last row
      showLineNumbers: false,
      onSave: async () => { this.save(); return true; },
      onExit: () => { void this.closeEditor(); },
    });
    this.loadFrameIntoEditor();
```

Add the constant beside `CELL_CHAR_WIDTH`'s old declaration:

```ts
// The ANSIEditor's own left sidebar width (ansi-editor.ts's `sidebarWidth`
// when showSidebar is on). Read here to size the magnification against the
// space the canvas actually gets, not the panel's full width.
const CANVAS_SIDEBAR_COLS = 6;
```

- [ ] **Step 4: Write the two transfer methods**

```ts
  /**
   * The widget's canvas is the live document while the editor is open;
   * this is the ONLY place its content re-enters the sprite. Call it
   * before anything that changes which frame is current, and before a
   * save - otherwise the strokes since the last transfer are on screen
   * and nowhere else.
   */
  private commitCanvasToDoc(): void {
    const canvas = this.editor?.getCoreCanvas();
    if (!canvas) return;
    const frame = canvasToFrame(canvas);
    const frames = this.doc.sprite.animations[this.doc.animation].frames
      .map((f, i) => (i === this.doc.frame ? frame : f));
    const sprite = JSON.parse(JSON.stringify(this.doc.sprite)) as Sprite;
    sprite.animations[this.doc.animation].frames = frames;
    this.doc = { ...this.doc, sprite, dirty: true };
  }

  /** The current frame becomes the widget's canvas - a new undo timeline. */
  private loadFrameIntoEditor(): void {
    this.editor?.setCoreCanvas(frameToCanvas(currentFrame(this.doc)));
  }
```

- [ ] **Step 5: Route every frame/animation op through them**

`apply()` is the single funnel every document op already passes through, so
the transfer belongs there rather than at each call site. Replace it with:

```ts
  private apply(next: EditDoc): void {
    if (next === this.doc) return;
    this.doc = next;
    this.loadFrameIntoEditor();
    this.paint();
  }
```

and give every op that CHANGES the current frame a commit first. Add:

```ts
  /** Commit what is on the canvas, then run a document op. */
  private applyAfterCommit(op: (doc: EditDoc) => EditDoc): void {
    this.commitCanvasToDoc();
    this.apply(op(this.doc));
  }

  private nextFrame(): void { this.applyAfterCommit(d => selectFrame(d, d.frame + 1)); }
  private prevFrame(): void { this.applyAfterCommit(d => selectFrame(d, d.frame - 1)); }
```

Every binding in `buildOpBindings()` that took `this.apply(selectFrame(...))`,
`this.apply(selectAnimation(...))`, `this.apply(moveFrame(...))` or
`this.tryOp(() => addFrame(...))` / `deleteFrame` / `addAnimation` /
`deleteAnimation` becomes the `applyAfterCommit` / commit-then-`tryOp` form.
`tryOp` gains the same treatment:

```ts
  private tryOp(op: () => EditDoc): void {
    this.commitCanvasToDoc();
    try {
      this.apply(op());
    } catch (error) {
      this.statusFlash = String((error as Error).message);
      this.paint();
    }
  }
```

- [ ] **Step 6: Save through the same path**

```ts
  private save(): void {
    this.commitCanvasToDoc();
    try {
      writeSprite(this.door, this.file, toSprite(this.doc));
      this.doc = { ...this.doc, dirty: false };
      this.statusFlash = `saved ${this.file}`;
    } catch (error) {
      this.statusFlash = `SAVE FAILED: ${(error as Error).message}`;
    }
    this.paint();
  }
```

And the dirty check on close must account for strokes the widget holds:

```ts
  private async closeEditor(): Promise<void> {
    if (this.screen.dialogOpen) return;
    // The widget's own modified flag covers strokes made since the last
    // commit - doc.dirty alone would say "clean" with unsaved paint on
    // screen.
    if (!this.doc.dirty && !this.editor?.isModified()) { this.exit(); return; }
    const discard = await confirm(this.screen, 'Discard unsaved changes?');
    if (discard) this.exit();
  }
```

The `file.closeEditor` binding's handler becomes `() => this.closeEditor()`.

- [ ] **Step 7: Destroy it with the rest**

In `destroy()`, before the panel loop:

```ts
    this.editor?.destroy();
    this.editor = null;
```

- [ ] **Step 8: Run the tests**

Run: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: PASS, including the five new hosting assertions. Existing
`edit-screen-behavior.test.ts` cases that assert on `canvasBox` content or
`screen.children[N]` indices WILL fail — those are the painter's tests and
are removed in Task 5, not repaired here. Note which fail; do not delete
them yet.

- [ ] **Step 9: Commit**

```bash
git add Doors/sprite-editor/edit-screen.ts Doors/sprite-editor/tests/edit-screen-hosting.test.ts Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the edit screen paints through the ANSI editor"
```

---

### Task 5: Delete the door's painter, toolbar and pixel ops

**Files:**
- Modify: `Doors/sprite-editor/edit-screen.ts`
- Delete: `Doors/sprite-editor/toolbar.ts`
- Modify: `Doors/sprite-editor/edit-doc.ts`
- Modify: `Doors/sprite-editor/tests/edit-screen-behavior.test.ts`, `Doors/sprite-editor/tests/edit-doc.test.ts`, `Doors/sprite-editor/tests/run-tests.ts`

**Interfaces:**
- Consumes: everything Task 4 produced.
- Produces: a `edit-screen.ts` with no canvas rendering, no hit-test, no tool state; `edit-doc.ts` exporting `openDoc, currentFrame, selectAnimation, selectFrame, addFrame, deleteFrame, moveFrame, setCell, setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite` and nothing else.

- [ ] **Step 1: Delete from `edit-screen.ts`**

Remove, in full: `GLYPHS`, `CELL_CHAR_WIDTH`, `paintCanvas()`, `canvasHitTest()`, `applyToolAt()`, `handleCanvasClick()`, `handleCanvasDrag()`, the `canvasBox` field, the `toolbar`/`toolbarState` fields and their construction, the `fg`/`bg`/`glyph`/`tool`/`mode`/`cursorRow`/`cursorCol` fields, `moveCursor()`, and the raw `'keypress'` cell-typing listener with its `excludedGlyphKeys` filter (the widget types onto its own canvas now).

`wireMouse()` keeps only the frames strip:

```ts
  private wireMouse(): void {
    this.framesBox.on('click', (data: any) => this.handleFramesClick(data));
  }
```

`paint()` loses its canvas and toolbar halves:

```ts
  private paint(): void {
    this.paintFrames();
    const dirty = (this.doc.dirty || this.editor?.isModified()) ? `{${T.alert}-fg}*{/} ` : '';
    const flash = this.statusFlash ? `  {${T.accent}-fg}${this.statusFlash}{/}` : '';
    this.statusFlash = '';
    this.statusBar.setContent(
      `${dirty}{${T.ink}-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
      `f${this.doc.frame + 1}${flash}` +
      `  {${T.dim}-fg}C-p/C-f frame  C-e animation  C-s save  ESC back{/}`
    );
    this.paintPreview();
  }
```

- [ ] **Step 2: Delete `toolbar.ts` and its test**

```bash
git rm Doors/sprite-editor/toolbar.ts Doors/sprite-editor/tests/toolbar.test.ts
```

Remove its line from `tests/run-tests.ts`.

- [ ] **Step 3: Delete the pixel ops from `edit-doc.ts`**

Remove `setPixel`, `floodFill`, `frameIsPixelEditable` and the now-unused
`compilePixels`/`decompilePixels` import. Delete their cases from
`tests/edit-doc.test.ts`. The recorded deviation at the head of this plan is
the justification — quote it in the commit body.

- [ ] **Step 4: Repair the painter's tests**

In `tests/edit-screen-behavior.test.ts`, delete the cases that assert on
canvas content, cell-width, mouse hit-testing, tool selection, palette
state, glyph typing or the `screen.children[N]` index of `canvasBox`. Keep
every case about frames, animations, dialogs, the menu bar, the dirty flag
and teardown. Where a kept case referenced `canvasBox`, retarget it at
`(edit as any).editor`.

- [ ] **Step 5: Run everything**

Run: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: PASS. Report the new total against 183.

- [ ] **Step 6: Commit**

```bash
git add -u Doors/sprite-editor
git commit -m "refactor(sprite-editor): the door stops painting cells itself"
```

---

### Task 6: Menus and hotkeys reconciled with the widget

**Files:**
- Modify: `Doors/sprite-editor/edit-screen.ts`
- Test: `Doors/sprite-editor/tests/edit-screen-bindings.test.ts` (new or extend the existing menu-coverage test)

**Interfaces:**
- Consumes: `buildBindingSet`, `BindingSet`, `StudioBinding` from `bindings.ts` (unchanged); `createStudioMenuBar` from `menu.ts` (unchanged).
- Produces: a binding table whose keys are all NON-PRINTABLE, so none of them can be swallowed by, or steal from, the widget's typing.

- [ ] **Step 1: Write the failing test**

```ts
// Every studio hotkey must be non-printable: in draw mode the widget types
// any printable character onto the canvas, so a single-letter binding
// would both fire the op AND paint the letter. This is the invariant that
// replaces 2c's glyph-exclusion set.
it('binds no printable character', () => {
  const edit = new EditScreen(screen, 'pengo', 'penguin.sprite', sprite, () => {});
  for (const binding of (edit as any).bindingSet.bindings) {
    for (const key of binding.keys) {
      expect(key.length === 1 && key >= ' ').toBe(false);
    }
  }
});

// And every op is still reachable without a keyboard at all.
it('gives every binding a menu entry', () => {
  const edit = new EditScreen(screen, 'pengo', 'penguin.sprite', sprite, () => {});
  const labels = (edit as any).bindingSet.menuItems().flatMap((m: any) => m.items.map((i: any) => i.label));
  for (const binding of (edit as any).bindingSet.bindings) {
    expect(labels).toContain(binding.label);
  }
});

// The four kept hotkeys must not collide with what the widget consumes in
// draw mode (C-s save, C-m mode, C-z undo, C-y redo, C-h half-block sub-row).
it('avoids the widget\'s own control keys', () => {
  const edit = new EditScreen(screen, 'pengo', 'penguin.sprite', sprite, () => {});
  const taken = new Set(['C-s', 'C-m', 'C-z', 'C-y', 'C-h']);
  for (const binding of (edit as any).bindingSet.bindings) {
    for (const key of binding.keys) expect(taken.has(key)).toBe(false);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Doors/sprite-editor && npm test`
Expected: FAIL — the table still carries `n`, `c`, `x`, `a`, `t`, `l`, `s`, `p`, `e`, `k`, `u`, `g`, `f`, `b`, `,`, `.`, `+`.

- [ ] **Step 3: Re-home the table**

`buildOpBindings()` becomes exactly this set. Four Ctrl hotkeys for the
frequent ops; everything else menu-only (`keys: []`, which `bindings.ts`
already supports — `anEmptyKeysBindingIsMenuOnly`). Cursor movement, glyph,
foreground, background, the four tools and the cell/pixel toggle are GONE:
they are the widget's, reachable on its sidebar and its own keys.

```ts
      { id: 'frame.prev', keys: ['C-p'], hotkeyHint: 'C-p', menu: 'Frame', label: 'Previous Frame',
        handler: () => this.prevFrame() },
      { id: 'frame.next', keys: ['C-f'], hotkeyHint: 'C-f', menu: 'Frame', label: 'Next Frame',
        handler: () => this.nextFrame() },
      { id: 'frame.new', keys: [], hotkeyHint: '', menu: 'Frame', label: 'New Frame',
        handler: () => this.tryOp(() => addFrame(this.doc, 'blank')) },
      { id: 'frame.duplicate', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Duplicate Frame',
        handler: () => this.tryOp(() => addFrame(this.doc, 'duplicate')) },
      { id: 'frame.delete', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Delete Frame',
        handler: async () => {
          if (await confirm(this.screen, 'Delete this frame?')) this.tryOp(() => deleteFrame(this.doc));
        } },
      { id: 'frame.moveEarlier', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Earlier',
        handler: () => this.applyAfterCommit(d => moveFrame(d, -1)) },
      { id: 'frame.moveLater', keys: [], hotkeyHint: '', menu: 'Frame', label: 'Move Frame Later',
        handler: () => this.applyAfterCommit(d => moveFrame(d, 1)) },

      { id: 'animation.next', keys: ['C-e'], hotkeyHint: 'C-e', menu: 'Animation', label: 'Next Animation',
        handler: () => {
          const names = Object.keys(this.doc.sprite.animations).sort();
          const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
          this.applyAfterCommit(d => selectAnimation(d, next));
        } },
      { id: 'animation.new', keys: [], hotkeyHint: '', menu: 'Animation', label: 'New Animation',
        handler: async () => {
          const name = await promptText(this.screen, 'New animation name');
          if (name === null) return;
          this.tryOp(() => addAnimation(this.doc, name));
        } },
      { id: 'animation.slower', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Slower',
        handler: () => this.applyAfterCommit(d => setTicksPerFrame(d, -1)) },
      { id: 'animation.faster', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Faster',
        handler: () => this.applyAfterCommit(d => setTicksPerFrame(d, +1)) },
      { id: 'animation.toggleLoop', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Toggle Loop',
        handler: () => this.applyAfterCommit(d => toggleLoop(d)) },
      { id: 'animation.delete', keys: [], hotkeyHint: '', menu: 'Animation', label: 'Delete Animation',
        handler: async () => {
          const message = `Delete animation "${this.doc.animation}"?`;
          if (await confirm(this.screen, message)) this.tryOp(() => deleteAnimation(this.doc));
        } },

      { id: 'file.save', keys: [], hotkeyHint: 'C-s', menu: 'File', label: 'Save',
        handler: () => this.save() },
      { id: 'file.closeEditor', keys: ['C-q'], hotkeyHint: 'esc/C-q', menu: 'File', label: 'Close Editor',
        handler: () => { void this.closeEditor(); } },

      { id: 'studio.help', keys: [], hotkeyHint: 'F1', menu: 'Help', label: 'Keyboard Shortcuts',
        handler: () => {
          this.statusFlash = 'C-p/C-f frame  C-e animation  C-s save  ESC back  - drawing keys are the editor\'s own';
          this.paint();
        } },

      { id: 'view.resetLayout', keys: [], hotkeyHint: '', menu: 'View', label: 'Reset Layout',
        handler: () => {
          resetPanelLayout(this.canvasPanel, LAYOUT.edit.canvas);
          resetPanelLayout(this.previewPanel, LAYOUT.edit.preview);
          resetPanelLayout(this.framesPanel, LAYOUT.edit.frames);
        } },
```

Three notes the implementer must not "tidy away":
- `file.save`'s `keys` is EMPTY with a `C-s` hint: the widget already binds
  Ctrl+S and calls the studio's `onSave`. Binding it here too would run the
  save twice.
- `escape` is likewise absent: the widget binds ESC and calls `onExit`,
  which Task 4 wired to `closeEditor()`. `C-q` stays as the second route.
- `LAYOUT.edit.toolbar` and its panel are gone with `toolbar.ts`; the
  reset list is three panels now. Leave the rect in `layout.ts` unused or
  delete it — either is fine, but say which in the report.

- [ ] **Step 4: Run the tests**

Run: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: PASS, including the three new binding invariants.

- [ ] **Step 5: RED-verify the printable-key guard**

Temporarily add `{ id: 'x.test', keys: ['z'], hotkeyHint: 'z', menu: 'File', label: 'Temp' }`
to the table. The "binds no printable character" case MUST fail. Remove it.

- [ ] **Step 6: Commit**

```bash
git add Doors/sprite-editor/edit-screen.ts Doors/sprite-editor/tests/edit-screen-bindings.test.ts Doors/sprite-editor/tests/run-tests.ts
git commit -m "refactor(sprite-editor): the studio keeps frames and animations, the editor keeps the keyboard"
```

---

### Task 7: Sweep

**Files:**
- Modify: `handoff.md`, `thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md` (this file's `status:` → `implemented`)

- [ ] **Step 1: Full builds and suites, with totals reported**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json && npx jest
npm run build:cjs && npm run build:esm
cd ../Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test
cd ../.. && npm run typecheck:tests
```

Report: SDK total against 744 + Tasks 1-3's additions; door total against 183 minus the painter's cases.

- [ ] **Step 2: Verify dist carries the new code**

```bash
grep -c getCellScale sdk/dist/engines/ui/blessed/widgets/ansi-editor.js
grep -c frameToCanvas sdk/dist/engines/graphics/cell-art/editor-canvas.js
ls -l Doors/sprite-editor/dist/edit-screen.js
```

All non-zero; the door's `dist/edit-screen.js` mtime after the source's.

- [ ] **Step 3: Grep for orphans**

```bash
grep -rn "toolbar" Doors/sprite-editor --include=*.ts | grep -v node_modules | grep -v dist
grep -rn "setPixel\|floodFill\|frameIsPixelEditable\|CELL_CHAR_WIDTH" Doors/sprite-editor --include=*.ts | grep -v node_modules | grep -v dist
```

Both empty apart from `LAYOUT.edit.toolbar` if Task 6 chose to keep the rect.

- [ ] **Step 4: Update `handoff.md`**

Replace the ANSIEditor paragraph's "WAITING ON THE USER" line with the new
state: the studio now hosts the widget, one editor implementation remains,
and the manual checklist below is what is outstanding. Keep the file under
10 KB.

- [ ] **Step 5: The user's checklist (do NOT tick these yourself)**

  - [ ] SPRITED opens a sprite and the canvas is the ANSI editor - sidebar with colours and tools on its left
  - [ ] the sprite is magnified, not one character per cell
  - [ ] click and drag paint; the sidebar's tools and colours work; Ctrl+Z undoes a stroke
  - [ ] Alt+H half-block mode paints half cells and the result survives a save and reload
  - [ ] erasing leaves a transparent hole (a dim guide glyph), not a black square
  - [ ] C-p / C-f change frame and the strokes on the previous frame are kept
  - [ ] the Frame and Animation menus still do everything they did, by mouse
  - [ ] Ctrl+S saves once (not twice), ESC on a dirty sprite asks once
  - [ ] the preview keeps animating while editing
  - [ ] art mode (from the browser) is unchanged
  - [ ] `Doors/ansi-editor` - the standalone ANSI editor door - is unchanged

- [ ] **Step 6: Commit**

```bash
git add handoff.md thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md
git commit -m "docs: the sprite studio hosts the ANSI editor"
```

## Self-review (at writing time)

- **Spec coverage.** The design doc's item 3 ("the editor should fork the ANSI editor the BBS already has") is what Tasks 4-6 deliver; its reuse table's "reusing this engine wholesale" is why Task 5 deletes rather than wraps. 2b's recorded deviation is answered at the head of this plan with the two capabilities that removed its reason (Tasks 1-2). The user's 2c directives survive: menu-driven (Task 6 makes menus the primary surface), windows (the dockable panels are untouched), toolbars for colours and tools (Task 4 turns on the widget's own sidebar, which is what 2c's `toolbar.ts` was a second copy of).
- **Type consistency.** `frameToCanvas`/`canvasToFrame` are named identically in Tasks 2, 3 and 4. `commitCanvasToDoc`/`loadFrameIntoEditor`/`applyAfterCommit`/`nextFrame`/`prevFrame` are declared in Task 4 and consumed by name in Tasks 5-6. `getCellScale`/`cellScaleX`/`cellScaleY` are declared in Task 1 and consumed in Task 4. `buildCanvasContent` and `screenToCanvasX`/`screenToCanvasY` are Task 1-internal and are asserted on by Task 1's test only.
- **Known risks, stated in-task rather than discovered late.** Half-block compatibility is MEASURED in Task 3 before Task 4 depends on it, with all three outcomes and their responses written down. The double-save and double-ESC traps (widget and door both binding them) are called out in Task 6 Step 3. The "paint, change frame, lose the strokes" defect is the reason `commitCanvasToDoc` exists and is asserted in Task 4's test 4.
- **YAGNI.** No new tools, no zoom UI (the scale is derived from the panel), no attempt to give the studio's frame ops a place in the widget's own undo timeline - `setCoreCanvas` deliberately starts a new one per frame, and that is documented, not worked around.


---

## Execution record (2026-09-01)

Executed inline, same session as writing. Seven planned tasks landed as five
commits; every deviation from the plan is below, with why.

| commit | what |
|---|---|
| `0f101e133` | Task 1 - `cellScaleX`/`cellScaleY`, one `buildCanvasContent`, scaled hit-test and cursor |
| `88c5b59e2` | Task 2 - `frameToCanvas`/`canvasToFrame` |
| `c2f3a5cd8` | Task 3 - the half-block measurement |
| `7329c1eb0` | Tasks 4+5+6 - the door hosts the widget, painter deleted, keys re-homed |
| (sweep) | Task 7 |

**Deviations, and why:**

- **Tasks 4, 5 and 6 became one commit.** They touch the same functions in
  the same file: Task 4 replaces `canvasBox` with the widget, which makes
  Task 5's `paintCanvas` reference a null box, and Task 6's re-homing is
  what stops the widget swallowing the door's letter hotkeys. Split as
  written, the tree would be broken between commits.
- **`setCell` became `setFrame`.** The plan kept `setCell`; with the widget
  owning painting it had no caller left outside tests, and
  `commitCanvasToDoc` was mutating `this.doc.sprite` inline - against
  edit-doc's own "every mutation is an edit-doc call" discipline. One pure
  whole-frame op replaces both, and it carries the frame-size invariant the
  sprite format requires.
- **The magnification is derived, not fixed.** `canvasScale(sprite, w, h)`
  fits the sprite to the pane minus the widget's 6-column sidebar, so a
  16-wide sprite gets a smaller scale rather than a clipped one.
- **`cellToDisplayTag` gained a `repeat` argument.** Repeating the whole
  tagged run per cell (as the plan's snippet did) triples the content
  string and emits scaleX colour switches per cell; repeating the character
  inside one pair of tags is the same pixels for a third of the bytes.
- **The Paint pane's rows went to Frames.** `LAYOUT.edit.toolbar` is gone
  rather than left as a blank rect; `frames` grew from 6 rows to 11 and the
  right column still sums to the canvas height.
- **`loadFrameIntoEditor` clears `editor.modified`.** Found by a failing
  test, not predicted: `setCoreCanvas` marks the widget modified, so a
  freshly opened sprite read as dirty and ESC always asked to discard.
- **Nine keystroke-redelivery tests were deleted, not retargeted.** They
  asserted a dialog survives the physical key that opened it; those ops are
  menu-only now, so there is no triggering keystroke. The one surviving
  key-to-dialog path (C-q on a dirty document) keeps that coverage.

**Task 3's verdict:** the contract holds - the widget's half-block strokes
decompile to sprite pixels, both sub-rows, stacking, and untouched cells
stay transparent. The first probe reported total failure because it called
`drawAtCursor()`, which is the TEXT brush; half-block strokes dispatch from
the mouse handler into `drawHalfBlock()`. Recorded while there: **half-block
painting is reachable from the mouse only** - `handleDrawKey` has no
half-block stroke, so a keyboard-only artist gets full blocks in half-block
mode. Pre-existing, out of scope, on the manual checklist.

**Totals:** SDK 765 -> 776 tests. Door 146 -> 152 (painter cases deleted,
hosting and binding suites added). Both typechecks clean, both builds
green, `dist/toolbar.js` removed by hand (tsc leaves orphaned outputs).
