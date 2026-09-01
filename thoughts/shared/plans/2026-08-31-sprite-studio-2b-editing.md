---
date: 2026-08-31
topic: "Plan 2b of 3: the sprite studio's editing modes"
tags: [sprite-editor, asset-studio, cell-art, halfblock, plan]
status: final
spec: thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md
---

# Sprite Studio 2b — Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPRITED edits: frame operations, cell and pixel painting, saving
sprites back to their doors, and `.ans` art editing.

**Architecture:** Three pure layers under a thin UI, the 2a shape
continued: `halfblock.ts` in cell-art (pixel grids ⇄ half-block cells),
`serializeSprite` (the parse inverse), a pure `EditDoc` document model
(every edit operation testable without a terminal), and one new edit
screen in the studio app that binds keys to the model. Art mode opens the
full ANSI editor engine on `Doors/<door>/art/`.

**Tech Stack:** TypeScript strict, cell-art, sdk blessed widgets +
ansi-editor engine (art mode only), tsx test runner. No new dependencies.

**Spec:** phase 3, second half, of
`thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md`.

**Recorded deviations from the spec, with reasons:**
- The spec says the sprite canvas reuses the ansi-editor engine's "canvas,
  tools and pickers". The engine's canvas and pickers are hard-coupled to
  its document-editor state (`showColorPicker(editorScreen, state,
  viewport, statusBar)`); embedding them drags the whole editing screen
  along. A 5x2 frame wants a 16-swatch palette strip and directly typed
  characters instead. The ENGINE is still reused where it fits: art mode
  opens it whole. If the user wants the real pickers later, they bolt onto
  the same key slots.
- Undo inside the sprite editor is deferred: the document is tiny, saves
  are explicit, and ESC-without-save discards. Stated here so it is a
  decision, not an accident.

## Global Constraints

- Repo root `/Users/spot/Code/amiexpress-web`; stage by name; new files
  LF; no emoji; trailers on every commit:
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF
- NEVER push. NEVER restart the backend (controller's job).
- SDK edits: `cd sdk && npx tsc --noEmit -p tsconfig.json`, then
  `npm run build:cjs && npm run build:esm`, then grep the new symbol in
  `sdk/dist/**`. Nothing rebuilds dist for you.
- Studio: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json`
  and `npm test` (tsx runner; register new files in tests/run-tests.ts).
- SDK jest: `cd sdk && npx jest tests/unit/<file>.test.ts`.
- The pre-commit hook rebuilds door dist — let it.
- Every behavior ships a RED-verified test. For source-shape tests, RED by
  DELETING code, never by commenting it out (regexes match comments — a
  weakness demonstrated twice already).
- The blessed door lifecycle rules apply to any new screen: keys via the
  screen, widgets `keys: false`; anything that starts a timer clears it in
  its teardown.

---

### Task 1: `halfblock.ts` — pixel grids ⇄ half-block cells

**Files:**
- Create: `sdk/engines/graphics/cell-art/halfblock.ts`
- Modify: `sdk/engines/graphics/cell-art/index.ts` (re-export)
- Test: `sdk/tests/unit/cell-art-halfblock.test.ts`

**Interfaces:**
- Consumes: `Cell`, `CellRow`, `CellBuffer` from `./cells`.
- Produces (Tasks 3, 4 rely on these):
  - `type PixelGrid = Array<Array<number | null>>` — colours 0-15, null
    transparent; height is always even (2 pixels per cell row)
  - `compilePixels(pixels: PixelGrid): CellBuffer` — pairs of pixel rows
    become one cell row of `▀`/`▄`/`█`/null
  - `decompilePixels(frame: CellBuffer): PixelGrid | null` — null when any
    cell is not a pure half-block form (then the frame is edited in cell
    mode only)

- [ ] **Step 1: Write the failing test**

`sdk/tests/unit/cell-art-halfblock.test.ts`:

```typescript
/**
 * The half-block codec: how sprite pixels become terminal cells.
 *
 * This is the exact encoding the Pengo art was authored in, extracted from
 * the throwaway generator into the engine so the studio's pixel mode edits
 * the same thing the generator wrote. The invariant worth pinning is the
 * ROUND TRIP: compile(decompile(f)) must reproduce a half-block frame
 * exactly, or the studio corrupts art just by opening and saving it.
 */

import { Cell, CellBuffer } from '../../engines/graphics/cell-art/cells';
import {
  PixelGrid,
  compilePixels,
  decompilePixels,
} from '../../engines/graphics/cell-art/halfblock';

describe('compilePixels', () => {
  it('encodes the four pixel-pair cases', () => {
    const pixels: PixelGrid = [
      [9,    null, 9,  null],
      [null, 9,    9,  null],
    ];
    const [row] = compilePixels(pixels);
    expect(row[0]).toEqual({ char: '▀', fg: 9, bg: 0 });   // top only
    expect(row[1]).toEqual({ char: '▄', fg: 9, bg: 0 });   // bottom only
    expect(row[2]).toEqual({ char: '█', fg: 9, bg: 9 });   // both, same
    expect(row[3]).toBeNull();                              // neither
  });

  it('encodes split colours as upper-half over background', () => {
    const [row] = compilePixels([[9], [11]]);
    expect(row[0]).toEqual({ char: '▀', fg: 9, bg: 11 });
  });

  it('rejects an odd pixel-row count - half a cell row cannot exist', () => {
    expect(() => compilePixels([[9]])).toThrow(/even/);
  });
});

describe('decompilePixels', () => {
  it('round-trips every compiled form', () => {
    const pixels: PixelGrid = [
      [9, null, 3,    9],
      [11, 9,   null, 9],
    ];
    const frame = compilePixels(pixels);
    expect(decompilePixels(frame)).toEqual(pixels);
    expect(compilePixels(decompilePixels(frame)!)).toEqual(frame);
  });

  it('returns null for a frame that is not pure half-blocks', () => {
    const frame: CellBuffer = [[{ char: 'A', fg: 7, bg: 0 } as Cell]];
    expect(decompilePixels(frame)).toBeNull();
  });

  it('round-trips the shipped Pengo art, which was authored this way', () => {
    // Read one real frame through the real loader - the studio will.
    const { loadSpriteSheet } = require('../../engines/graphics/cell-art/load');
    const path = require('path');
    const sheet = loadSpriteSheet(
      path.join(__dirname, '..', '..', '..', 'Doors', 'pengo', 'sprites')
    );
    const frame = sheet['pengo'].animations['walk-right'].frames[0];
    const pixels = decompilePixels(frame);
    expect(pixels).not.toBeNull();
    expect(compilePixels(pixels!)).toEqual(frame);
  });
});
```

- [ ] **Step 2: Run to verify it fails** —
  `cd sdk && npx jest tests/unit/cell-art-halfblock.test.ts` → module not
  found.

- [ ] **Step 3: Implement**

`sdk/engines/graphics/cell-art/halfblock.ts`:

```typescript
/**
 * Half-block pixels: two vertical pixels per character cell via the block
 * glyphs. The encoding the Pengo sprites were authored in, promoted from
 * the one-off generator into the engine so the studio's pixel mode edits
 * exactly what renders.
 *
 * The contract that matters is the ROUND TRIP: decompilePixels is the
 * exact inverse of compilePixels for everything compilePixels can emit.
 * A frame containing anything else (letters, shades, arrows) decompiles
 * to null and is edited cell-by-cell instead - lossy conversion is how an
 * editor corrupts art just by opening it, so there is none.
 */

import { Cell, CellBuffer, CellRow } from './cells';

/** Colours 0-15, or null for a transparent pixel. Height is always even. */
export type PixelGrid = Array<Array<number | null>>;

/** Two pixel rows -> one cell row: ▀ top, ▄ bottom, █ both, null neither. */
export function compilePixels(pixels: PixelGrid): CellBuffer {
  if (pixels.length % 2 !== 0) {
    throw new Error(`pixel grid needs an even row count, got ${pixels.length}`);
  }
  const out: CellBuffer = [];
  for (let y = 0; y < pixels.length; y += 2) {
    const top = pixels[y];
    const bottom = pixels[y + 1];
    const row: CellRow = [];
    for (let x = 0; x < top.length; x++) {
      const t = top[x];
      const b = bottom[x] ?? null;
      if (t === null && b === null) row.push(null);
      else if (t !== null && b === null) row.push({ char: '▀', fg: t, bg: 0 });
      else if (t === null && b !== null) row.push({ char: '▄', fg: b, bg: 0 });
      else if (t === b) row.push({ char: '█', fg: t as number, bg: t as number });
      else row.push({ char: '▀', fg: t as number, bg: b as number });
    }
    out.push(row);
  }
  return out;
}

/**
 * The inverse - or null when the frame is not pure half-blocks.
 *
 * The ▀-with-bg-0 ambiguity is resolved the way compilePixels writes it:
 * bg 0 under ▀ means TRANSPARENT lower pixel, not black. Black-on-black
 * art therefore uses █ with fg 0, which the compiler emits for t === b.
 */
export function decompilePixels(frame: CellBuffer): PixelGrid | null {
  const top: Array<number | null> = [];
  const bottom: Array<number | null> = [];
  const out: PixelGrid = [];

  for (const row of frame) {
    top.length = 0;
    bottom.length = 0;
    for (const cell of row) {
      if (cell === null) { top.push(null); bottom.push(null); continue; }
      const { char, fg, bg } = cell as Cell;
      if (char === '█' && fg === bg) { top.push(fg); bottom.push(fg); continue; }
      if (char === '▀' && bg === 0) { top.push(fg); bottom.push(null); continue; }
      if (char === '▄' && bg === 0) { top.push(null); bottom.push(fg); continue; }
      if (char === '▀') { top.push(fg); bottom.push(bg); continue; }
      return null; // anything else is cell-mode-only art
    }
    out.push([...top], [...bottom]);
  }
  return out;
}
```

Re-export from `sdk/engines/graphics/cell-art/index.ts`:

```typescript
export { compilePixels, decompilePixels } from './halfblock';
export type { PixelGrid } from './halfblock';
```

- [ ] **Step 4: Test green, typecheck, build both dists, verify the
  symbol in `sdk/dist/engines/graphics/cell-art/halfblock.js`.**

- [ ] **Step 5: Commit**

```bash
git add sdk/engines/graphics/cell-art/halfblock.ts \
  sdk/engines/graphics/cell-art/index.ts sdk/tests/unit/cell-art-halfblock.test.ts
git commit -m "feat(cell-art): the half-block pixel codec, round-trip exact"
```

---

### Task 2: serialization and the write side of assets

**Files:**
- Modify: `sdk/engines/graphics/cell-art/sprite.ts` (add `serializeSprite`)
- Modify: `sdk/engines/graphics/cell-art/index.ts` (re-export)
- Modify: `Doors/sprite-editor/assets.ts` (writeSprite, art listing/rw)
- Test: `sdk/tests/unit/cell-art-sprite.test.ts` (extend)
- Test: `Doors/sprite-editor/tests/assets.test.ts` (extend)

**Interfaces:**
- Produces:
  - `serializeSprite(sprite: Sprite): string` — pretty JSON; the exact
    inverse of `parseSprite`, validated before returning
  - `writeSprite(door: string, file: string, sprite: Sprite): void` —
    guarded path, atomic write (tmp + rename)
  - `listArt(door: string): string[]` — `*.ans` files, sorted
  - `readArt(door: string, file: string): Buffer`
  - `writeArt(door: string, file: string, data: Buffer): void` — guarded,
    atomic

- [ ] **Step 1: Failing tests**

Append to `sdk/tests/unit/cell-art-sprite.test.ts`:

```typescript
describe('serializeSprite', () => {
  it('is the exact inverse of parseSprite', () => {
    const original = parseSprite(rawSprite());
    const reparsed = parseSprite(JSON.parse(serializeSprite(original)));
    expect(reparsed).toEqual(original);
  });

  it('refuses to serialize a sprite that would not load back', () => {
    const broken = parseSprite(rawSprite());
    (broken.animations.blink.frames[0][0][0] as any).fg = 99;
    expect(() => serializeSprite(broken)).toThrow(/fg/);
  });
});
```

(Add `serializeSprite` to the file's import.)

Append to `Doors/sprite-editor/tests/assets.test.ts`:

```typescript
export async function writeSpriteRoundTripsThroughDisk(): Promise<void> {
  const scratchDoor = 'sprite-editor'; // our own door: safe scratch space
  const sprite = readSprite('pengo', 'egg.sprite.json');
  const renamed = { ...sprite, name: 'scratch-egg' };

  writeSprite(scratchDoor, 'scratch-egg.sprite.json', renamed);
  try {
    const back = readSprite(scratchDoor, 'scratch-egg.sprite.json');
    assert.deepStrictEqual(back, renamed, 'what was written is what loads');
  } finally {
    fs.unlinkSync(resolveAssetPath(scratchDoor, 'sprites', 'scratch-egg.sprite.json'));
  }
}

export async function writesAreGuardedLikeReads(): Promise<void> {
  const sprite = readSprite('pengo', 'egg.sprite.json');
  assert.throws(
    () => writeSprite('..', 'x.sprite.json', sprite), /outside/,
    'a write outside the fence is the worst version of the traversal bug'
  );
  assert.throws(
    () => writeSprite('pengo', '../../evil.sprite.json', sprite), /outside/
  );
}

export async function artListingsAndWritesAreGuarded(): Promise<void> {
  assert.throws(() => writeArt('..', 'x.ans', Buffer.from('x')), /outside/);
  const arts = listArt('pengo'); // no art/ directory yet - empty, not a throw
  assert.deepStrictEqual(arts, []);
}
```

(Extend the test file's imports: `writeSprite`, `writeArt`, `listArt`,
`resolveAssetPath` — the last is already imported — plus `import * as fs
from 'fs';`.)

- [ ] **Step 2: Run both suites, watch the new cases fail.**

- [ ] **Step 3: Implement**

In `sdk/engines/graphics/cell-art/sprite.ts`, after `parseSprite`:

```typescript
/**
 * A sprite as its on-disk JSON - the exact inverse of parseSprite.
 *
 * Validates by round-tripping through parseSprite BEFORE returning, so a
 * corrupted in-memory document throws here rather than writing a file
 * that fails the next door load.
 */
export function serializeSprite(sprite: Sprite): string {
  const raw = {
    name: sprite.name,
    cellW: sprite.cellW,
    cellH: sprite.cellH,
    animations: Object.fromEntries(
      Object.entries(sprite.animations).map(([name, anim]) => [name, {
        ticksPerFrame: anim.ticksPerFrame,
        loop: anim.loop,
        frames: anim.frames.map(frame =>
          frame.map(row =>
            row.map(cell => (cell ? [cell.char, cell.fg, cell.bg] : null)))),
      }])
    ),
  };
  parseSprite(raw, `${sprite.name} (serializing)`); // throws before disk
  return JSON.stringify(raw, null, 1) + '\n';
}
```

In `Doors/sprite-editor/assets.ts`, after `readSprite`:

```typescript
/** Write one sheet: guarded path, validated content, atomic replace. */
export function writeSprite(door: string, file: string, sprite: Sprite): void {
  const path = resolveAssetPath(door, 'sprites', file);
  const json = serializeSprite(sprite); // throws before any disk touch
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, path); // atomic on the same filesystem
}

/** `*.ans` files in a door's art/ directory, sorted; [] when none. */
export function listArt(door: string): string[] {
  try {
    const dir = resolveAssetPath(door, 'art', '.');
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.ans')).sort();
  } catch {
    return []; // no art/ directory is a normal state, not an error
  }
}

export function readArt(door: string, file: string): Buffer {
  return fs.readFileSync(resolveAssetPath(door, 'art', file));
}

export function writeArt(door: string, file: string, data: Buffer): void {
  const path = resolveAssetPath(door, 'art', file);
  fs.mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, path);
}
```

(`serializeSprite` joins the cell-art import in assets.ts; `dirname` joins
the path import; `writeArt`'s mkdir creates `art/` on first save. NOTE the
listArt try/catch: `resolveAssetPath(door, 'art', '.')` throws for a
traversal door name — that guard test expects `writeArt('..')` to throw,
and it does, because writeArt has no catch.)

Wait — that makes `listArt('..')` return `[]` instead of throwing. That is
the correct behavior split: LISTING a door that has no art (or is garbage)
shows empty; WRITING anywhere outside the fence throws. The tests above
encode exactly that split.

- [ ] **Step 4: Both suites green; sdk builds (cjs+esm); symbol grep;
  studio typecheck.**

- [ ] **Step 5: Commit**

```bash
git add sdk/engines/graphics/cell-art/sprite.ts sdk/engines/graphics/cell-art/index.ts \
  sdk/tests/unit/cell-art-sprite.test.ts \
  Doors/sprite-editor/assets.ts Doors/sprite-editor/tests/assets.test.ts
git commit -m "feat(sprite-editor): serialization and the guarded write side"
```

---

### Task 3: the EditDoc — every edit as a pure, tested operation

**Files:**
- Create: `Doors/sprite-editor/edit-doc.ts`
- Test: `Doors/sprite-editor/tests/edit-doc.test.ts` (register)

**Interfaces:**
- Consumes: `Sprite`, `SpriteAnimation`, `Cell`, `CellBuffer`,
  `compilePixels`, `decompilePixels` from cell-art.
- Produces (Task 4 binds these exactly):

```typescript
export interface EditDoc {
  sprite: Sprite;            // the working copy, structurally cloned
  animation: string;         // selected animation name
  frame: number;             // selected frame index
  dirty: boolean;
}
export function openDoc(sprite: Sprite): EditDoc;
export function currentFrame(doc: EditDoc): CellBuffer;
export function selectAnimation(doc: EditDoc, name: string): EditDoc;   // throws on unknown
export function selectFrame(doc: EditDoc, index: number): EditDoc;      // clamped
export function addFrame(doc: EditDoc, mode: 'blank' | 'duplicate'): EditDoc;
export function deleteFrame(doc: EditDoc): EditDoc;                     // refuses the last frame
export function moveFrame(doc: EditDoc, delta: -1 | 1): EditDoc;        // clamped swap
export function setCell(doc: EditDoc, row: number, col: number, cell: Cell | null): EditDoc;
export function setPixel(doc: EditDoc, py: number, px: number, colour: number | null): EditDoc; // throws when frame not decompilable
export function frameIsPixelEditable(doc: EditDoc): boolean;
export function setTicksPerFrame(doc: EditDoc, delta: number): EditDoc; // clamped to >= 1
export function toggleLoop(doc: EditDoc): EditDoc;
export function addAnimation(doc: EditDoc, name: string): EditDoc;      // one blank frame; throws on dup/empty/bad name
export function deleteAnimation(doc: EditDoc): EditDoc;                 // refuses the last animation
export function toSprite(doc: EditDoc): Sprite;                         // what save writes
```

All operations return NEW docs with `dirty: true` (selection-only moves
keep `dirty` as-is and return the SAME doc when nothing changed — the 2a
identity rule). Structural cloning on open so editing never mutates the
browser's cached sprite.

- [ ] **Step 1: Failing tests.** `Doors/sprite-editor/tests/edit-doc.test.ts`:

```typescript
/**
 * The sprite document: every edit the studio can make, as a pure op.
 *
 * The UI binds keys to these and paints the result; anything the artist
 * can do is assertable here, including the refusals - deleting the last
 * frame or last animation is refused rather than leaving a sprite the
 * loader would reject on the next door start.
 */

import assert from 'assert';
import { readSprite } from '../assets';
import {
  openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setCell, setPixel, frameIsPixelEditable,
  setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite,
} from '../edit-doc';
import { parseSprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const pengo = () => openDoc(readSprite('pengo', 'pengo.sprite.json'));

export async function openingClonesAndSelectsTheFirstAnimation(): Promise<void> {
  const source = readSprite('pengo', 'pengo.sprite.json');
  const doc = openDoc(source);
  assert.strictEqual(doc.dirty, false);
  assert.ok(doc.sprite.animations[doc.animation], 'a real animation is selected');
  setCell(doc, 0, 0, { char: '#', fg: 7, bg: 0 });
  assert.strictEqual(
    source.animations[doc.animation].frames[0][0][0] === doc.sprite.animations[doc.animation].frames[0][0][0],
    false,
    'editing the doc must never reach the browser cache - open clones'
  );
}

export async function frameOperationsBehave(): Promise<void> {
  let doc = pengo();
  doc = selectAnimation(doc, 'death');
  const frames = () => doc.sprite.animations['death'].frames.length;
  const before = frames();

  doc = addFrame(doc, 'duplicate');
  assert.strictEqual(frames(), before + 1);
  assert.strictEqual(doc.frame, before, 'the new frame is selected');
  assert.deepStrictEqual(
    currentFrame(doc), doc.sprite.animations['death'].frames[before - 1],
    'a duplicate equals its source'
  );

  doc = moveFrame(doc, -1);
  assert.strictEqual(doc.frame, before - 1, 'moved back one slot');

  doc = deleteFrame(doc);
  assert.strictEqual(frames(), before);
  assert.ok(doc.dirty);
}

export async function theLastFrameAndLastAnimationAreProtected(): Promise<void> {
  let doc = openDoc(readSprite('pengo', 'diamond.sprite.json'));
  // diamond has one animation (sparkle) with three frames
  doc = deleteFrame(doc); doc = deleteFrame(doc);
  assert.throws(() => deleteFrame(doc), /last frame/);
  assert.throws(() => deleteAnimation(doc), /last animation/);
}

export async function cellAndPixelEditsLand(): Promise<void> {
  let doc = pengo();
  doc = setCell(doc, 0, 0, { char: '*', fg: 11, bg: 0 });
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '*', fg: 11, bg: 0 });
  doc = setCell(doc, 0, 0, null);
  assert.strictEqual(currentFrame(doc)[0][0], null);

  assert.ok(frameIsPixelEditable(doc), 'pengo art is half-block');
  doc = setPixel(doc, 0, 0, 9);
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '▀', fg: 9, bg: 0 });
  doc = setPixel(doc, 1, 0, 11);
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '▀', fg: 9, bg: 11 });
}

export async function pixelEditingRefusesNonHalfblockFrames(): Promise<void> {
  let doc = pengo();
  doc = setCell(doc, 0, 2, { char: 'A', fg: 7, bg: 0 });
  assert.strictEqual(frameIsPixelEditable(doc), false);
  assert.throws(() => setPixel(doc, 0, 0, 9), /pixel/);
}

export async function timingAndAnimationOpsBehave(): Promise<void> {
  let doc = pengo();
  const tpf = () => doc.sprite.animations[doc.animation].ticksPerFrame;
  const t0 = tpf();
  doc = setTicksPerFrame(doc, +2);
  assert.strictEqual(tpf(), t0 + 2);
  doc = setTicksPerFrame(doc, -99);
  assert.strictEqual(tpf(), 1, 'clamped at one tick per frame');

  const loop0 = doc.sprite.animations[doc.animation].loop;
  doc = toggleLoop(doc);
  assert.strictEqual(doc.sprite.animations[doc.animation].loop, !loop0);

  doc = addAnimation(doc, 'spin');
  assert.strictEqual(doc.animation, 'spin');
  assert.strictEqual(doc.sprite.animations['spin'].frames.length, 1);
  assert.throws(() => addAnimation(doc, 'spin'), /exists/);
  assert.throws(() => addAnimation(doc, ''), /name/);

  doc = deleteAnimation(doc);
  assert.ok(!doc.sprite.animations['spin']);
}

export async function whatSaveWritesIsLoadable(): Promise<void> {
  let doc = pengo();
  doc = setPixel(doc, 0, 0, 9);
  doc = addFrame(doc, 'duplicate');
  const sprite = toSprite(doc);
  // The strongest possible check: the loader's own validator accepts it.
  const reparsed = parseSprite(JSON.parse(JSON.stringify({
    name: sprite.name, cellW: sprite.cellW, cellH: sprite.cellH,
    animations: Object.fromEntries(Object.entries(sprite.animations).map(
      ([n, a]) => [n, { ticksPerFrame: a.ticksPerFrame, loop: a.loop,
        frames: a.frames.map(f => f.map(r => r.map(c => c ? [c.char, c.fg, c.bg] : null))) }]
    )),
  })), 'roundtrip');
  assert.strictEqual(reparsed.name, sprite.name);
}

export async function selectionMovesKeepIdentityWhenClamped(): Promise<void> {
  const doc = pengo();
  assert.strictEqual(selectFrame(doc, -5), doc, 'clamped select is identity');
  assert.strictEqual(doc.dirty, false, 'and selection never dirties');
}
```

- [ ] **Step 2: register `'./edit-doc.test'`, run, watch it fail.**

- [ ] **Step 3: Implement `Doors/sprite-editor/edit-doc.ts`**

```typescript
/**
 * The sprite document: the studio's every edit as a pure operation.
 *
 * Same discipline as the 2a browser model - the UI binds keys to these
 * functions and paints the result, so the whole editing feature is
 * assertable without a terminal. Operations return new docs (dirty), a
 * clamped selection returns the SAME doc (the identity rule the repaint
 * skip relies on), and the refusals protect the loader's invariants: a
 * sprite always keeps at least one animation with at least one frame.
 */

import {
  Cell, CellBuffer, Sprite,
  compilePixels, decompilePixels,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

export interface EditDoc {
  sprite: Sprite;
  animation: string;
  frame: number;
  dirty: boolean;
}

const cloneSprite = (sprite: Sprite): Sprite =>
  JSON.parse(JSON.stringify(sprite)) as Sprite;

const blankFrame = (sprite: Sprite): CellBuffer =>
  Array.from({ length: sprite.cellH }, () =>
    Array.from({ length: sprite.cellW }, () => null));

function withFrames(doc: EditDoc, frames: CellBuffer[], frame: number): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  sprite.animations[doc.animation].frames = frames;
  return { ...doc, sprite, frame, dirty: true };
}

export function openDoc(sprite: Sprite): EditDoc {
  const clone = cloneSprite(sprite);
  return {
    sprite: clone,
    animation: Object.keys(clone.animations).sort()[0],
    frame: 0,
    dirty: false,
  };
}

export function currentFrame(doc: EditDoc): CellBuffer {
  return doc.sprite.animations[doc.animation].frames[doc.frame];
}

export function selectAnimation(doc: EditDoc, name: string): EditDoc {
  if (!doc.sprite.animations[name]) {
    throw new Error(`no animation '${name}'`);
  }
  if (name === doc.animation) return doc;
  return { ...doc, animation: name, frame: 0 };
}

export function selectFrame(doc: EditDoc, index: number): EditDoc {
  const count = doc.sprite.animations[doc.animation].frames.length;
  const frame = Math.max(0, Math.min(count - 1, index));
  if (frame === doc.frame) return doc;
  return { ...doc, frame };
}

export function addFrame(doc: EditDoc, mode: 'blank' | 'duplicate'): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  const source = mode === 'duplicate'
    ? JSON.parse(JSON.stringify(frames[doc.frame]))
    : blankFrame(doc.sprite);
  frames.splice(doc.frame + 1, 0, source);
  return withFrames(doc, frames, doc.frame + 1);
}

export function deleteFrame(doc: EditDoc): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  if (frames.length <= 1) {
    throw new Error('cannot delete the last frame - the loader rejects an empty animation');
  }
  frames.splice(doc.frame, 1);
  return withFrames(doc, frames, Math.min(doc.frame, frames.length - 1));
}

export function moveFrame(doc: EditDoc, delta: -1 | 1): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  const to = doc.frame + delta;
  if (to < 0 || to >= frames.length) return doc;
  [frames[doc.frame], frames[to]] = [frames[to], frames[doc.frame]];
  return withFrames(doc, frames, to);
}

export function setCell(doc: EditDoc, row: number, col: number, cell: Cell | null): EditDoc {
  const frames = doc.sprite.animations[doc.animation].frames
    .map(f => f.map(r => [...r]));
  frames[doc.frame][row][col] = cell ? { ...cell } : null;
  return withFrames(doc, frames, doc.frame);
}

export function frameIsPixelEditable(doc: EditDoc): boolean {
  return decompilePixels(currentFrame(doc)) !== null;
}

export function setPixel(doc: EditDoc, py: number, px: number, colour: number | null): EditDoc {
  const pixels = decompilePixels(currentFrame(doc));
  if (!pixels) {
    throw new Error('frame is not pixel-editable - it holds non-half-block art');
  }
  pixels[py][px] = colour;
  const compiled = compilePixels(pixels);
  const frames = doc.sprite.animations[doc.animation].frames
    .map((f, i) => (i === doc.frame ? compiled : f));
  return withFrames(doc, frames, doc.frame);
}

export function setTicksPerFrame(doc: EditDoc, delta: number): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  const anim = sprite.animations[doc.animation];
  anim.ticksPerFrame = Math.max(1, anim.ticksPerFrame + delta);
  return { ...doc, sprite, dirty: true };
}

export function toggleLoop(doc: EditDoc): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  const anim = sprite.animations[doc.animation];
  anim.loop = !anim.loop;
  return { ...doc, sprite, dirty: true };
}

export function addAnimation(doc: EditDoc, name: string): EditDoc {
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    throw new Error('animation name must be lowercase letters, digits and dashes');
  }
  if (doc.sprite.animations[name]) {
    throw new Error(`animation '${name}' already exists`);
  }
  const sprite = cloneSprite(doc.sprite);
  sprite.animations[name] = { ticksPerFrame: 4, loop: true, frames: [blankFrame(sprite)] };
  return { ...doc, sprite, animation: name, frame: 0, dirty: true };
}

export function deleteAnimation(doc: EditDoc): EditDoc {
  const names = Object.keys(doc.sprite.animations);
  if (names.length <= 1) {
    throw new Error('cannot delete the last animation - a sprite needs one');
  }
  const sprite = cloneSprite(doc.sprite);
  delete sprite.animations[doc.animation];
  const next = Object.keys(sprite.animations).sort()[0];
  return { ...doc, sprite, animation: next, frame: 0, dirty: true };
}

export function toSprite(doc: EditDoc): Sprite {
  return cloneSprite(doc.sprite);
}
```

- [ ] **Step 4: Suite green; typecheck; RED-verify one refusal by
  deleting the `frames.length <= 1` guard (expect
  `theLastFrameAndLastAnimationAreProtected` to fail), restore.**

- [ ] **Step 5: Commit**

```bash
git add Doors/sprite-editor/edit-doc.ts Doors/sprite-editor/tests/edit-doc.test.ts \
  Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the sprite document - every edit pure and refused safely"
```

---

### Task 4: the edit screen

**Files:**
- Create: `Doors/sprite-editor/edit-screen.ts`
- Modify: `Doors/sprite-editor/app.ts` (E opens the editor; return path)
- Test: `Doors/sprite-editor/tests/edit-screen-shape.test.ts` (register)

**Interfaces:**
- Consumes: EditDoc ops (Task 3), `writeSprite` (Task 2), `previewLines`
  (2a), `bufferToTags`, `PALETTE`.
- Produces: `class EditScreen { constructor(screen, door: string, file: string, sprite: Sprite, onExit: () => void); destroy(): void }`
  — self-contained: builds its widgets on the shared blessed screen, binds
  its keys via a screen-key group it removes on destroy, runs its own
  playback timer, and calls `onExit` after teardown.

Layout (percentage-based like the browser):

```
+------------------------------+------------------------------+
| CANVAS (left 55%)            | PREVIEW (playing, scale 2)   |
|  the frame, scale 2, with a  |------------------------------|
|  cursor; pixel mode splits   | FRAMES  [1] 2  3  4          |
|  cells into halves           | anim: walk-right  4tpf loop  |
|                              | palette strip 0..15  fg/bg   |
+------------------------------+------------------------------+
| status: mode, position, dirty marker, key help              |
+-------------------------------------------------------------+
```

Keys (all through the screen; documented in the status line):

```
arrows        move cursor (cell mode: cells; pixel mode: pixels)
tab           toggle cell/pixel mode (pixel only when frameIsPixelEditable)
space         paint (current char+fg+bg / current colour)
del/backspace clear cell / clear pixel
any printable set the cell's char with current colours (cell mode)
g             cycle the glyph palette: ▀ ▄ █ ▌ ▐ ░ ▒ ▓ • ► ◄ ▲ ▼
f / F         next / previous foreground colour (palette strip highlights)
b / B         next / previous background colour
, / .         previous / next frame     n new blank   c clone   x delete
< / >         move frame left / right
a             next animation            + add animation (typed name, enter/esc)
t / T         ticksPerFrame - / +       l toggle loop
s             save (writeSprite; dirty cleared; status flash "saved")
escape        back to browser (if dirty: press escape AGAIN within 3s to
              discard - the status line says so; s saves first)
```

- [ ] **Step 1: the shape test** —
`Doors/sprite-editor/tests/edit-screen-shape.test.ts`:

```typescript
/**
 * The edit screen binds the tested document model - it does not
 * reimplement it - and honours the door-lifecycle rules.
 *
 * Source-shape checks with COMMENTS STRIPPED first: the naive version of
 * these greps matched commented-out code twice this session.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', 'edit-screen.ts'), 'utf8');
/** The source with line and block comments removed. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

export async function theScreenUsesTheDocumentModel(): Promise<void> {
  for (const op of ['openDoc', 'addFrame', 'deleteFrame', 'moveFrame',
                    'setCell', 'setPixel', 'setTicksPerFrame', 'toggleLoop',
                    'addAnimation', 'toSprite']) {
    assert.ok(code.includes(op), `edit-screen must use ${op} from edit-doc`);
  }
}

export async function savesGoThroughTheGuardedWriter(): Promise<void> {
  assert.ok(code.includes('writeSprite('), 'saving must use the guarded writer');
}

export async function teardownClearsItsTimerAndKeys(): Promise<void> {
  assert.ok(/clearInterval\(this\.playback/.test(code),
    'the playback interval must die with the screen');
  assert.ok(/unkey\(|removeKey|offKey|\.removeListener\(/.test(code) ||
            /keyHandlers/.test(code),
    'screen-level key bindings must be removed on destroy - the browser\'s ' +
    'keys come back when the editor leaves');
}

export async function escapeIsGuardedWhenDirty(): Promise<void> {
  assert.ok(/dirty/.test(code) && /escape/i.test(code),
    'a dirty document must not be silently discarded by one keypress');
}
```

- [ ] **Step 2: register, run, fail.**

- [ ] **Step 3: Implement `edit-screen.ts`** — the full file:

```typescript
/**
 * The edit screen: keys in, document ops through edit-doc, pixels out.
 *
 * Owns nothing clever: every mutation is an edit-doc call (tested there),
 * every save is writeSprite (guarded there), and the canvas paint is
 * bufferToTags over the current frame with a cursor overlay. The screen
 * object install/removes its OWN key handlers so the browser's come back
 * untouched - the same discipline as the door lifecycle rules.
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  Cell, Sprite, PALETTE, bufferToTags,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import {
  EditDoc, openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setCell, setPixel, frameIsPixelEditable,
  setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite,
} from './edit-doc';
import { writeSprite } from './assets';
import { previewLines } from './preview';

const GLYPHS = ['▀', '▄', '█', '▌', '▐', '░', '▒', '▓', '•', '►', '◄', '▲', '▼'];
const PLAYBACK_MS = 100;
const DISCARD_WINDOW_MS = 3000;

export class EditScreen {
  private screen: any;
  private door: string;
  private file: string;
  private onExit: () => void;

  private doc: EditDoc;
  private mode: 'cell' | 'pixel' = 'cell';
  private cursorRow = 0;   // cell coords in cell mode, pixel coords in pixel mode
  private cursorCol = 0;
  private fg = 11;
  private bg = 0;
  private glyph = 0;
  private tick = 0;
  private playback: ReturnType<typeof setInterval> | null = null;
  private statusFlash = '';
  private discardArmedAt = 0;
  private naming: string | null = null; // non-null while typing a new animation name

  private canvasBox: any = null;
  private previewBox: any = null;
  private framesBox: any = null;
  private paletteBox: any = null;
  private statusBar: any = null;
  private keyHandlers: Array<[string[], (...args: any[]) => void]> = [];

  constructor(screen: any, door: string, file: string, sprite: Sprite, onExit: () => void) {
    this.screen = screen;
    this.door = door;
    this.file = file;
    this.onExit = onExit;
    this.doc = openDoc(sprite);

    this.buildLayout();
    this.bindKeys();
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);
    this.paint();
  }

  private buildLayout(): void {
    this.canvasBox = blessed.box({
      parent: this.screen,
      top: 0, left: 0, width: '55%', height: '90%',
      label: ' Canvas ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'lightyellow' } },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: 0, left: '55%', width: '45%', height: '45%',
      label: ' Preview ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'green' } },
    });
    this.framesBox = blessed.box({
      parent: this.screen,
      top: '45%', left: '55%', width: '45%', height: '30%',
      label: ' Frames ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.paletteBox = blessed.box({
      parent: this.screen,
      top: '75%', left: '55%', width: '45%', height: '15%',
      label: ' Paint ',
      border: { type: 'line' }, tags: true,
      style: { border: { fg: 'cyan' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 1, tags: true,
    });
  }

  /** Bind one screen-key group, remembered so destroy can remove it. */
  private key(keys: string[], handler: (...args: any[]) => void): void {
    this.screen.key(keys, handler);
    this.keyHandlers.push([keys, handler]);
  }

  private bindKeys(): void {
    this.key(['up'], () => this.moveCursor(-1, 0));
    this.key(['down'], () => this.moveCursor(1, 0));
    this.key(['left'], () => this.moveCursor(0, -1));
    this.key(['right'], () => this.moveCursor(0, 1));
    this.key(['tab'], () => {
      if (this.mode === 'cell' && frameIsPixelEditable(this.doc)) {
        this.mode = 'pixel';
        this.cursorRow = Math.min(this.cursorRow * 2, this.doc.sprite.cellH * 2 - 1);
      } else {
        if (this.mode === 'pixel') this.cursorRow = Math.floor(this.cursorRow / 2);
        this.mode = 'cell';
      }
      this.paint();
    });
    this.key(['space'], () => {
      if (this.naming !== null) { this.typeName(' '); return; }
      this.apply(this.mode === 'pixel'
        ? setPixel(this.doc, this.cursorRow, this.cursorCol, this.fg)
        : setCell(this.doc, this.cursorRow, this.cursorCol,
            { char: GLYPHS[this.glyph], fg: this.fg, bg: this.bg }));
    });
    this.key(['delete', 'backspace'], () => {
      if (this.naming !== null) { this.naming = this.naming.slice(0, -1); this.paint(); return; }
      this.apply(this.mode === 'pixel'
        ? setPixel(this.doc, this.cursorRow, this.cursorCol, null)
        : setCell(this.doc, this.cursorRow, this.cursorCol, null));
    });

    this.key(['g'], () => { this.glyph = (this.glyph + 1) % GLYPHS.length; this.paint(); });
    this.key(['f'], () => { this.fg = (this.fg + 1) % 16; this.paint(); });
    this.key(['S-f'], () => { this.fg = (this.fg + 15) % 16; this.paint(); });
    this.key(['b'], () => { this.bg = (this.bg + 1) % 16; this.paint(); });
    this.key(['S-b'], () => { this.bg = (this.bg + 15) % 16; this.paint(); });

    this.key([','], () => this.apply(selectFrame(this.doc, this.doc.frame - 1)));
    this.key(['.'], () => this.apply(selectFrame(this.doc, this.doc.frame + 1)));
    this.key(['n'], () => this.tryOp(() => addFrame(this.doc, 'blank')));
    this.key(['c'], () => this.tryOp(() => addFrame(this.doc, 'duplicate')));
    this.key(['x'], () => this.tryOp(() => deleteFrame(this.doc)));
    this.key(['S-,'], () => this.apply(moveFrame(this.doc, -1)));
    this.key(['S-.'], () => this.apply(moveFrame(this.doc, 1)));

    this.key(['a'], () => {
      const names = Object.keys(this.doc.sprite.animations).sort();
      const next = names[(names.indexOf(this.doc.animation) + 1) % names.length];
      this.apply(selectAnimation(this.doc, next));
    });
    this.key(['+'], () => { this.naming = ''; this.paint(); });
    this.key(['t'], () => this.apply(setTicksPerFrame(this.doc, -1)));
    this.key(['S-t'], () => this.apply(setTicksPerFrame(this.doc, +1)));
    this.key(['l'], () => this.apply(toggleLoop(this.doc)));
    this.key(['S-x'], () => this.tryOp(() => deleteAnimation(this.doc)));

    this.key(['s'], () => this.save());
    this.key(['enter'], () => {
      if (this.naming !== null) {
        const name = this.naming;
        this.naming = null;
        this.tryOp(() => addAnimation(this.doc, name));
      }
    });
    this.key(['escape'], () => {
      if (this.naming !== null) { this.naming = null; this.paint(); return; }
      if (this.doc.dirty && Date.now() - this.discardArmedAt > DISCARD_WINDOW_MS) {
        this.discardArmedAt = Date.now();
        this.statusFlash = 'UNSAVED - escape again to discard, s to save';
        this.paint();
        return;
      }
      this.exit();
    });

    // Typed characters set the cell's char in cell mode, or extend the
    // animation name while naming. Screen keypress, filtered to printables.
    const onKeypress = (ch: string) => {
      if (!ch || ch.length !== 1 || ch < ' ' || ch === '\x7f') return;
      if (this.naming !== null) { this.typeName(ch); return; }
      if (this.mode !== 'cell') return;
      if ('gfbFB,.ncx<>a+tTlsS '.includes(ch)) return; // bound keys keep their meaning
      if (ch === '{' || ch === '}') return; // the two characters the format refuses
      this.apply(setCell(this.doc, this.cursorRow, this.cursorCol,
        { char: ch, fg: this.fg, bg: this.bg }));
    };
    this.screen.on('keypress', onKeypress);
    this.keyHandlers.push([['__keypress__'], onKeypress]);
  }

  private typeName(ch: string): void {
    if (this.naming === null) return;
    if (/[a-z0-9-]/.test(ch)) this.naming += ch;
    this.paint();
  }

  private moveCursor(dr: number, dc: number): void {
    const rows = this.mode === 'pixel' ? this.doc.sprite.cellH * 2 : this.doc.sprite.cellH;
    const cols = this.doc.sprite.cellW;
    this.cursorRow = Math.max(0, Math.min(rows - 1, this.cursorRow + dr));
    this.cursorCol = Math.max(0, Math.min(cols - 1, this.cursorCol + dc));
    this.paint();
  }

  private apply(next: EditDoc): void {
    if (next === this.doc) return;
    this.doc = next;
    this.paint();
  }

  private tryOp(op: () => EditDoc): void {
    try {
      this.apply(op());
    } catch (error) {
      this.statusFlash = String((error as Error).message);
      this.paint();
    }
  }

  private save(): void {
    try {
      writeSprite(this.door, this.file, toSprite(this.doc));
      this.doc = { ...this.doc, dirty: false };
      this.statusFlash = `saved ${this.file}`;
    } catch (error) {
      this.statusFlash = `SAVE FAILED: ${(error as Error).message}`;
    }
    this.paint();
  }

  /** The frame, scale 2, with the cursor cell/pixel inverted. */
  private paintCanvas(): void {
    const frame = currentFrame(this.doc);
    const rows: string[] = [];
    for (let r = 0; r < frame.length; r++) {
      let line = '';
      for (let c = 0; c < frame[r].length; c++) {
        const cell = frame[r][c] as Cell | null;
        const isCursor = this.mode === 'cell'
          ? (r === this.cursorRow && c === this.cursorCol)
          : (Math.floor(this.cursorRow / 2) === r && this.cursorCol === c);
        const char = cell ? cell.char : ' ';
        const fg = cell ? PALETTE[cell.fg] : 'gray';
        const bg = cell ? PALETTE[cell.bg] : 'black';
        const body = `${char}${char}`;
        line += isCursor
          ? `{${bg}-fg}{${fg}-bg}${body}{/}`   // inverted = the cursor
          : `{${fg}-fg}{${bg}-bg}${body}{/}`;
      }
      rows.push(line);
    }
    const modeLine = this.mode === 'pixel'
      ? `{lightgreen-fg}PIXEL{/} row ${this.cursorRow} col ${this.cursorCol}`
      : `{lightyellow-fg}CELL{/} row ${this.cursorRow} col ${this.cursorCol}`;
    this.canvasBox.setContent('\n ' + rows.join('\n ') + '\n\n ' + modeLine);
  }

  private paintPreview(): void {
    const anim = this.doc.sprite.animations[this.doc.animation];
    const lines = previewLines(this.doc.sprite, this.doc.animation, this.tick, 2);
    this.previewBox.setContent(
      '\n ' + lines.join('\n ') +
      `\n\n {gray-fg}${this.doc.animation} - ${anim.frames.length}f ` +
      `${anim.ticksPerFrame}tpf ${anim.loop ? 'loop' : 'hold'}{/}`
    );
    this.screen.render();
  }

  private paintFrames(): void {
    const anim = this.doc.sprite.animations[this.doc.animation];
    const strip = anim.frames
      .map((_, i) => (i === this.doc.frame ? `{blue-bg}{lightyellow-fg}[${i + 1}]{/}` : ` ${i + 1} `))
      .join(' ');
    const naming = this.naming !== null
      ? `\n new animation: {lightyellow-fg}${this.naming}{/}_ (enter/escape)`
      : '';
    this.framesBox.setContent(`\n ${strip}${naming}`);
  }

  private paintPalette(): void {
    const swatches = PALETTE
      .map((name, i) => {
        const marker = i === this.fg ? 'F' : i === this.bg ? 'B' : ' ';
        return `{${name}-bg}{${i === 0 ? 'white' : 'black'}-fg}${marker}{/}`;
      })
      .join('');
    this.paletteBox.setContent(
      `\n ${swatches}\n glyph: ${GLYPHS[this.glyph]}  ` +
      `fg {${PALETTE[this.fg]}-fg}${this.fg}{/}  bg {${PALETTE[this.bg]}-fg}${this.bg}{/}`
    );
  }

  private paint(): void {
    this.paintCanvas();
    this.paintFrames();
    this.paintPalette();
    const dirty = this.doc.dirty ? '{lightred-fg}*{/} ' : '';
    const flash = this.statusFlash ? `  {lightyellow-fg}${this.statusFlash}{/}` : '';
    this.statusFlash = '';
    this.statusBar.setContent(
      `${dirty}{white-fg}${this.doc.sprite.name}{/} ${this.doc.animation} ` +
      `f${this.doc.frame + 1}${flash}` +
      '  {gray-fg}SPACE paint  DEL clear  TAB mode  s save  ESC back{/}'
    );
    this.paintPreview();
  }

  private exit(): void {
    this.destroy();
    this.onExit();
  }

  destroy(): void {
    if (this.playback) {
      clearInterval(this.playback);
      this.playback = null;
    }
    for (const [keys, handler] of this.keyHandlers) {
      if (keys[0] === '__keypress__') this.screen.removeListener('keypress', handler);
      else this.screen.unkey(keys, handler);
    }
    this.keyHandlers = [];
    for (const widget of [this.canvasBox, this.previewBox, this.framesBox,
                          this.paletteBox, this.statusBar]) {
      widget?.destroy();
    }
    this.canvasBox = this.previewBox = this.framesBox = this.paletteBox = this.statusBar = null;
  }
}
```

- [ ] **Step 4: wire the browser.** In `app.ts`:
  - import `EditScreen` and `readSprite` is already imported;
  - add a field `private editScreen: EditScreen | null = null;`
  - bind in `bindKeys()`:

```typescript
    this.key = this.key; // no-op line REMOVE; real addition below
    this.screen.key(['e'], () => {
      const sel = selection(this.state);
      const sprite = this.currentSprite();
      if (!sel.door || !sel.sprite || !sprite || this.editScreen) return;
      // The browser sleeps while the editor owns the screen: its panes
      // hide and its playback pauses, so two timers never fight over
      // render() and the browser's keys are the EDITOR's problem to
      // avoid (it removes its own on destroy).
      if (this.playback) { clearInterval(this.playback); this.playback = null; }
      for (const w of [this.doorsList, this.spritesList, this.animationsList,
                       this.previewBox, this.statusBar]) w.hide();
      this.editScreen = new EditScreen(this.screen, sel.door, sel.sprite, sprite, () => {
        this.editScreen = null;
        for (const w of [this.doorsList, this.spritesList, this.animationsList,
                         this.previewBox, this.statusBar]) w.show();
        this.loaded = null; // the sprite may have been saved - reload it
        this.playback = setInterval(() => { this.tick++; this.paintPreview(); }, PLAYBACK_MS);
        this.refresh();
      });
    });
```

  (Place it with the other screen.key bindings; the literal first line
  above is an editing note, not code - do not include it.)
  - the browser's `q`/`escape` quit must NOT fire while the editor is
    open: guard the existing quit handler with `if (this.editScreen) return;`.
  - `destroy()` gains `this.editScreen?.destroy(); this.editScreen = null;`
    before the screen teardown.

- [ ] **Step 5: shape test green, full door suite green, typecheck,
  RED-verify `teardownClearsItsTimerAndKeys` by deleting the
  `clearInterval` line (restore after).**

- [ ] **Step 6: Commit**

```bash
git add Doors/sprite-editor/edit-screen.ts Doors/sprite-editor/app.ts \
  Doors/sprite-editor/tests/edit-screen-shape.test.ts Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the edit screen - frames, cells, pixels, save"
```

---

### Task 5: art mode

**Files:**
- Modify: `Doors/sprite-editor/app.ts` ('m' opens the door's art in the
  full ANSI editor engine)
- Test: `Doors/sprite-editor/tests/art-mode-shape.test.ts` (register)

**Interfaces:**
- Consumes: `listArt`, `readArt`, `writeArt` (Task 2); the ANSIEditor
  engine exactly as `Doors/ansi-editor/index.ts` hosts it (`ANSIEditor`
  from `@amiexpress/bbs-door-sdk/engines/ui/ansi-editor`, constructed with
  `parent/top/left/width/height/initialContent/showMenuBar/...` and an
  `onSave` callback — read that file's `openEditor` before writing this).

Behaviour: `m` on a selected door opens a small list of its `.ans` files
(plus a `[new file]` row that prompts for a name the same way `+` names an
animation). Enter opens the ANSIEditor full-screen on the file's content;
its save callback runs `writeArt(door, file, Buffer.from(content))`;
escape/quit destroys the editor widget and returns to the browser, panes
restored — the same sleep/wake contract as the edit screen, and the same
key-cleanup discipline. The ansi-editor door's black-screen fix applies:
nothing hides the browser until there is something to show.

Shape test pins: `listArt(`/`writeArt(` used; browser widgets
hidden/shown around the editor; the editor widget destroyed on exit; the
`m` handler guarded against double-open.

(Steps mirror Task 4: failing shape test → implement → suite green →
RED by deletion → commit `feat(sprite-editor): art mode - the door's .ans
files in the full ANSI editor`.)

---

### Task 6: sweep and the user's checklist

- [ ] Full builds: sdk (cjs+esm), studio door; suites: sdk jest full,
  studio `npm test`; report totals.
- [ ] Controller: backend restart; `Registered door: SPRITED` fresh.
- [ ] The user's checklist (do not check these yourself):
  - [ ] E on a pengo sprite opens the editor; the canvas shows the frame fat
  - [ ] painting pixels changes the PREVIEW as it plays
  - [ ] frame ops: new, clone, delete, reorder; t/T changes speed audibly in the preview
  - [ ] s saves; reopening the sprite shows the change; PENGO itself shows it after its next restart
  - [ ] ESC on a dirty sprite warns once, then discards
  - [ ] m opens an .ans in the full ANSI editor and saves into Doors/pengo/art/
  - [ ] browser still works after returning: keys, playback, quit

## Self-review (at writing time)

- Spec phase-3 second half covered: frame strip + playback (T4), per-anim
  ticksPerFrame (T3/T4), save/load `.sprite.json` (T2/T4), art mode (T5),
  door/sprite browsing already in 2a. Deviations (pickers, undo) recorded
  in the header with reasons.
- Types line up: EditDoc ops named identically in T3 definition, T4 use,
  and the shape test's list; `writeSprite(door, file, sprite)` arity
  consistent across T2/T4; `PixelGrid` colour-or-null convention matches
  setPixel's `colour: number | null`.
- Known simplifications, stated: animation RENAME is delete+recreate for
  now; the pixel cursor maps to cell row/2 when toggling modes; glyph
  typing excludes the studio's own bound keys (documented in the key list).
