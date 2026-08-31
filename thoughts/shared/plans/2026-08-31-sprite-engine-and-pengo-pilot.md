---
date: 2026-08-31
topic: "Plan 1 of 3: cell-art sprite engine and the Pengo pilot"
tags: [sprites, animation, cell-art, pengo, sdk, plan]
status: final
spec: thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md
---

# Sprite Engine + Pengo Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure cell-art sprite engine in the SDK, and Pengo rebuilt on it:
75×20 board, 5×2-cell animated sprites, full terminal.

**Architecture:** `sdk/engines/graphics/cell-art/` holds a numeric-colour
`Cell` model, a `CellBuffer` compositor, a JSON sprite format with
tick-driven animation, and one function that turns buffer rows into blessed
tags. Pengo's drawing layer is replaced by a pure `buildBoard(data, sheet,
tick)`; game logic keeps its cell grid untouched except for three constants
and two small animation-state fields.

**Tech Stack:** TypeScript (strict), jest + ts-jest (SDK), tsx test runner
(door), blessed tags, no new dependencies.

**Spec:** `thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md`
— plans 2 (asset studio, gated on the ansi-edit black-screen fix) and 3
(theming + 9-slice + DOORMAN) are written when their phases start.

## Global Constraints

- Repo root: `/Users/spot/Code/amiexpress-web`. All paths relative to it.
- Never `git add -A` / `git add .` — stage files by name.
- Line endings: new files LF. Every listed Pengo file is LF today; do not
  convert endings on files you touch. If an edit tool mangles a file with
  high-bit chars, use python with `newline=''` (repo memory: Edit/Write can
  destroy 0xA1-style bytes; the sprite JSONs contain block glyphs — write
  them with the Write tool once, verify with `grep -c "▀"` after).
- No emoji anywhere. BBS text uses ASCII tokens.
- SDK edits: after changing `sdk/`, run `cd sdk && npx tsc --noEmit -p
  tsconfig.json`, then `npm run build:cjs && npm run build:esm`, then grep
  the rebuilt `sdk/dist/**` for the new symbol. Nothing rebuilds dist for
  you (door-sdk-freshness skill; it burned a whole session once).
- New client-importable SDK module ⇒ add it to BOTH `sdk/package.json`
  `exports` and `sdk/tsconfig.client.json` `include` (the arcade module
  shipped broken without the latter).
- Door edits: `cd Doors/pengo && npx tsc --noEmit -p tsconfig.json` and
  `npm test` after each task; `npm run build` before the final commit (the
  pre-commit hook also rebuilds dist and stages it — let it).
- Every new behavior ships a test that fails on the reverted change. Tasks
  below include the RED step; do not skip it.
- Commit locally; do NOT push. Pushing auto-deploys the live board and the
  user says when.
- SDK jest: `cd sdk && npx jest tests/unit/<file>.test.ts`. Pengo runner:
  `cd Doors/pengo && npm test` (plain functions + node assert via tsx; a
  test fails by throwing; register new files in `tests/run-tests.ts`).
- Backend restart for manual verification (only in Task 7):
  `/Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh`, verify no
  survivors, `rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`, then
  `/Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only
  --quick` in background, wait for `[READY]` in `logs/backend.log`.

---

### Task 1: `cells.ts` — Cell, CellBuffer, blit, tags

**Files:**
- Create: `sdk/engines/graphics/cell-art/cells.ts`
- Test: `sdk/tests/unit/cell-art-cells.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free).
- Produces (used by Tasks 2, 3, 6):
  - `interface Cell { char: string; fg: number; bg: number }`
  - `type CellRow = Array<Cell | null>` ; `type CellBuffer = CellRow[]`
  - `const PALETTE: readonly string[]` (16 blessed colour names, index 0-15)
  - `createBuffer(width: number, height: number, fill?: Cell | null): CellBuffer`
  - `blitCells(dest: CellBuffer, src: CellBuffer, x: number, y: number): void`
  - `rowToTags(row: CellRow, fallback?: Cell): string`
  - `bufferToTags(buffer: CellBuffer, fallback?: Cell): string[]`

- [ ] **Step 1: Write the failing test**

`sdk/tests/unit/cell-art-cells.test.ts`:

```typescript
/**
 * The cell-art foundation: a buffer of coloured cells and the one function
 * that turns a row of them into blessed tags.
 *
 * Two behaviours carry the whole system and are pinned hard:
 * - null is TRANSPARENT: blitting never erases what is underneath it, and
 *   rendering paints the fallback, so sprites sit on terrain;
 * - tag output GROUPS runs of one colour, because a tag pair per cell for
 *   a 75-column row is 150 tags per line, 20 lines per tick.
 */

import {
  Cell,
  CellBuffer,
  PALETTE,
  createBuffer,
  blitCells,
  rowToTags,
  bufferToTags,
} from '../../engines/graphics/cell-art/cells';

const red = (char: string): Cell => ({ char, fg: 9, bg: 0 });

describe('the palette', () => {
  it('names all sixteen colours in ANSI order', () => {
    expect(PALETTE).toHaveLength(16);
    expect(PALETTE[0]).toBe('black');
    expect(PALETTE[4]).toBe('blue');
    expect(PALETTE[7]).toBe('white');
    expect(PALETTE[8]).toBe('gray');
    expect(PALETTE[11]).toBe('lightyellow');
    expect(PALETTE[15]).toBe('lightwhite');
  });
});

describe('createBuffer', () => {
  it('makes width x height of the fill', () => {
    const b = createBuffer(3, 2);
    expect(b).toHaveLength(2);
    expect(b[0]).toHaveLength(3);
    expect(b[0][0]).toBeNull();
  });

  it('clones the fill cell so rows do not share one object', () => {
    const b = createBuffer(2, 2, { char: '.', fg: 7, bg: 0 });
    (b[0][0] as Cell).char = 'X';
    expect((b[1][1] as Cell).char).toBe('.');
  });
});

describe('blitCells', () => {
  it('copies cells at the offset', () => {
    const dest = createBuffer(4, 3);
    blitCells(dest, [[red('A'), red('B')]], 1, 2);
    expect((dest[2][1] as Cell).char).toBe('A');
    expect((dest[2][2] as Cell).char).toBe('B');
  });

  it('treats null as transparent: what is underneath survives', () => {
    const dest = createBuffer(2, 1, { char: '#', fg: 7, bg: 4 });
    blitCells(dest, [[null, red('X')]], 0, 0);
    expect((dest[0][0] as Cell).char).toBe('#');
    expect((dest[0][1] as Cell).char).toBe('X');
  });

  it('clips at the edges instead of throwing', () => {
    const dest = createBuffer(2, 2);
    expect(() => blitCells(dest, [[red('A'), red('B')]], 1, 1)).not.toThrow();
    expect((dest[1][1] as Cell).char).toBe('A');
  });
});

describe('rowToTags', () => {
  it('paints a cell in its own colours', () => {
    expect(rowToTags([{ char: 'A', fg: 9, bg: 4 }]))
      .toBe('{lightred-fg}{blue-bg}A{/}');
  });

  it('groups a run of one colour under one tag pair', () => {
    const row = [red('A'), red('B'), { char: 'C', fg: 2, bg: 0 }];
    expect(rowToTags(row))
      .toBe('{lightred-fg}{black-bg}AB{/}{green-fg}{black-bg}C{/}');
  });

  it('renders null as the fallback cell', () => {
    expect(rowToTags([null, red('X')], { char: '.', fg: 8, bg: 0 }))
      .toBe('{gray-fg}{black-bg}.{/}{lightred-fg}{black-bg}X{/}');
  });

  it('defaults the fallback to a space on black', () => {
    expect(rowToTags([null])).toBe('{white-fg}{black-bg} {/}');
  });
});

describe('bufferToTags', () => {
  it('renders one string per row', () => {
    const b = createBuffer(2, 2, { char: '#', fg: 7, bg: 0 });
    const lines = bufferToTags(b);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('{white-fg}{black-bg}##{/}');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd sdk && npx jest tests/unit/cell-art-cells.test.ts`
Expected: FAIL — cannot find module `../../engines/graphics/cell-art/cells`.

- [ ] **Step 3: Implement**

`sdk/engines/graphics/cell-art/cells.ts`:

```typescript
/**
 * Cell art: the shared model under sprites (and, in plan 3, 9-slice
 * borders and themes).
 *
 * A Cell is one terminal character with numeric ANSI colours 0-15 - the
 * same space the ANSI editor's canvas uses, so the studio door later edits
 * exactly what this renders. Colour NAMES exist in one place only: the
 * PALETTE lookup inside rowToTags. Everything above it is numbers.
 *
 * Pure and dependency-free on purpose: no blessed, no fs, so it runs in
 * unit tests and in browser bundles without dragging either along.
 */

export interface Cell {
  char: string;
  /** ANSI colour 0-15. */
  fg: number;
  bg: number;
}

/** null is TRANSPARENT: compositing skips it, rendering paints fallback. */
export type CellRow = Array<Cell | null>;
export type CellBuffer = CellRow[];

/** The sixteen ANSI colours, in ANSI order, as blessed knows them. */
export const PALETTE: readonly string[] = [
  'black', 'red', 'green', 'yellow',
  'blue', 'magenta', 'cyan', 'white',
  'gray', 'lightred', 'lightgreen', 'lightyellow',
  'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
];

const DEFAULT_FALLBACK: Cell = { char: ' ', fg: 7, bg: 0 };

/** A fresh buffer. The fill is cloned per cell - rows must not share one. */
export function createBuffer(
  width: number,
  height: number,
  fill: Cell | null = null
): CellBuffer {
  const buffer: CellBuffer = [];
  for (let y = 0; y < height; y++) {
    const row: CellRow = [];
    for (let x = 0; x < width; x++) {
      row.push(fill ? { ...fill } : null);
    }
    buffer.push(row);
  }
  return buffer;
}

/**
 * Composite src onto dest at (x, y).
 *
 * null cells in src are transparent - the whole reason a sprite can stand
 * on terrain without carrying the terrain in its own frames. Out-of-range
 * cells are clipped, not thrown: a sprite half off the board is a caller
 * bug worth surviving, not crashing a live door over.
 */
export function blitCells(
  dest: CellBuffer,
  src: CellBuffer,
  x: number,
  y: number
): void {
  for (let sy = 0; sy < src.length; sy++) {
    const destRow = dest[y + sy];
    if (!destRow) continue;
    const srcRow = src[sy];
    for (let sx = 0; sx < srcRow.length; sx++) {
      const cell = srcRow[sx];
      if (cell === null) continue;
      if (x + sx < 0 || x + sx >= destRow.length) continue;
      destRow[x + sx] = { ...cell };
    }
  }
}

/**
 * One row as a blessed tag string.
 *
 * Runs of one (fg, bg) pair share one tag pair. Without this a 75-column
 * row is 150 tags, twenty times per tick - the grouping is not cosmetic.
 */
export function rowToTags(row: CellRow, fallback: Cell = DEFAULT_FALLBACK): string {
  let out = '';
  let runFg = -1;
  let runBg = -1;

  for (const raw of row) {
    const cell = raw ?? fallback;
    if (cell.fg !== runFg || cell.bg !== runBg) {
      if (runFg !== -1) out += '{/}';
      out += `{${PALETTE[cell.fg]}-fg}{${PALETTE[cell.bg]}-bg}`;
      runFg = cell.fg;
      runBg = cell.bg;
    }
    out += cell.char;
  }

  if (runFg !== -1) out += '{/}';
  return out;
}

/** Every row, ready to join('\n') into a blessed box. */
export function bufferToTags(buffer: CellBuffer, fallback: Cell = DEFAULT_FALLBACK): string[] {
  return buffer.map(row => rowToTags(row, fallback));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sdk && npx jest tests/unit/cell-art-cells.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json
cd /Users/spot/Code/amiexpress-web
git add sdk/engines/graphics/cell-art/cells.ts sdk/tests/unit/cell-art-cells.test.ts
git commit -m "feat(cell-art): the cell model, compositor and tag renderer"
```

---

### Task 2: `sprite.ts` — format, parsing, animation timing, blitting

**Files:**
- Create: `sdk/engines/graphics/cell-art/sprite.ts`
- Test: `sdk/tests/unit/cell-art-sprite.test.ts`

**Interfaces:**
- Consumes (Task 1): `Cell`, `CellBuffer`, `blitCells` from `./cells`.
- Produces (used by Tasks 3, 4, 6):
  - `interface SpriteAnimation { ticksPerFrame: number; loop: boolean; frames: CellBuffer[] }`
  - `interface Sprite { name: string; cellW: number; cellH: number; animations: Record<string, SpriteAnimation> }`
  - `parseSprite(raw: unknown, source?: string): Sprite` — throws `Error`
    with sprite/animation/frame named on any invalid input
  - `frameAt(anim: SpriteAnimation, tick: number): CellBuffer`
  - `blitSprite(dest: CellBuffer, sprite: Sprite, animation: string, tick: number, gridX: number, gridY: number): void`
    — grid coordinates; pixel offset is `gridX * cellW, gridY * cellH`;
    throws on an unknown animation name

- [ ] **Step 1: Write the failing test**

`sdk/tests/unit/cell-art-sprite.test.ts`:

```typescript
/**
 * The sprite format and its clock.
 *
 * parseSprite is the loud gate: a malformed sprite must fail the DOOR LOAD
 * with the sprite, animation and frame named - not the first draw,
 * quietly. frameAt is pure in the game tick, which is what makes every
 * animation assertable without a terminal.
 */

import { createBuffer, Cell } from '../../engines/graphics/cell-art/cells';
import {
  parseSprite,
  frameAt,
  blitSprite,
  SpriteAnimation,
} from '../../engines/graphics/cell-art/sprite';

/** A minimal valid sprite JSON: 2x1 cells, one two-frame animation. */
function rawSprite(): any {
  return {
    name: 'dot',
    cellW: 2,
    cellH: 1,
    animations: {
      blink: {
        ticksPerFrame: 3,
        loop: true,
        frames: [
          [[['*', 11, 0], null]],
          [[[' ', 11, 0], ['*', 11, 0]]],
        ],
      },
    },
  };
}

describe('parseSprite', () => {
  it('round-trips a valid sprite', () => {
    const s = parseSprite(rawSprite());
    expect(s.name).toBe('dot');
    expect(s.animations.blink.frames).toHaveLength(2);
    expect((s.animations.blink.frames[0][0][0] as Cell).char).toBe('*');
    expect(s.animations.blink.frames[0][0][1]).toBeNull();
  });

  it('names the offending frame when dimensions are wrong', () => {
    const raw = rawSprite();
    raw.animations.blink.frames[1] = [[['*', 11, 0]]]; // 1 wide, not 2
    expect(() => parseSprite(raw, 'dot.sprite.json'))
      .toThrow(/dot\.sprite\.json.*blink.*frame 1/);
  });

  it('rejects colours outside 0-15', () => {
    const raw = rawSprite();
    raw.animations.blink.frames[0][0][0] = ['*', 16, 0];
    expect(() => parseSprite(raw)).toThrow(/fg/);
  });

  it('rejects tag-delimiter characters, which would corrupt the markup', () => {
    // The joust buzzards were drawn as { and } and emitted straight into
    // tagged markup. The format refuses the two characters outright.
    const raw = rawSprite();
    raw.animations.blink.frames[0][0][0] = ['{', 11, 0];
    expect(() => parseSprite(raw)).toThrow(/character/);
  });

  it('rejects a sprite with no animations', () => {
    const raw = rawSprite();
    raw.animations = {};
    expect(() => parseSprite(raw)).toThrow(/animation/);
  });
});

describe('frameAt', () => {
  const anim = (over: Partial<SpriteAnimation> = {}): SpriteAnimation => ({
    ticksPerFrame: 3,
    loop: true,
    frames: [createBuffer(1, 1), createBuffer(1, 1), createBuffer(1, 1)],
    ...over,
  });

  it('holds each frame for ticksPerFrame ticks', () => {
    const a = anim();
    expect(frameAt(a, 0)).toBe(a.frames[0]);
    expect(frameAt(a, 2)).toBe(a.frames[0]);
    expect(frameAt(a, 3)).toBe(a.frames[1]);
  });

  it('loops when asked to', () => {
    const a = anim();
    expect(frameAt(a, 9)).toBe(a.frames[0]);
  });

  it('holds the last frame when not looping - a death stays dead', () => {
    const a = anim({ loop: false });
    expect(frameAt(a, 900)).toBe(a.frames[2]);
  });

  it('survives ticksPerFrame 0 by treating it as 1', () => {
    const a = anim({ ticksPerFrame: 0 });
    expect(frameAt(a, 1)).toBe(a.frames[1]);
  });
});

describe('blitSprite', () => {
  it('places the current frame at the grid cell', () => {
    const s = parseSprite(rawSprite());
    const board = createBuffer(6, 2);
    blitSprite(board, s, 'blink', 0, 2, 1);
    expect((board[1][4] as Cell).char).toBe('*');
    expect(board[1][5]).toBeNull(); // transparent cell left the board alone
  });

  it('throws on an unknown animation name - a typo is a bug, not silence', () => {
    const s = parseSprite(rawSprite());
    expect(() => blitSprite(createBuffer(2, 1), s, 'blnk', 0, 0, 0))
      .toThrow(/blnk/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd sdk && npx jest tests/unit/cell-art-sprite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`sdk/engines/graphics/cell-art/sprite.ts`:

```typescript
/**
 * The sprite format: named animations of fixed-size cell frames, clocked
 * by the game's own tick.
 *
 * JSON on disk (`<name>.sprite.json`): each frame is cellH rows of cellW
 * entries, an entry being `[char, fg, bg]` or null for transparency.
 * parseSprite validates everything up front so a malformed sprite fails
 * the door LOAD with a message naming sprite, animation and frame - a
 * sprite that fails at first draw instead fails in front of a player.
 *
 * frameAt is a pure function of the tick (the door's frameCount, never the
 * wall clock), the same rule the game clocks follow: deterministic, and
 * therefore assertable.
 */

import { Cell, CellBuffer, CellRow, blitCells } from './cells';

export interface SpriteAnimation {
  /** Game ticks each frame is held for. */
  ticksPerFrame: number;
  /** Loop, or hold the last frame (death, shatter). */
  loop: boolean;
  frames: CellBuffer[];
}

export interface Sprite {
  name: string;
  /** Frame size, in characters. Every frame of every animation matches. */
  cellW: number;
  cellH: number;
  animations: Record<string, SpriteAnimation>;
}

/** The two blessed tag delimiters; a cell carrying one corrupts the row. */
const FORBIDDEN_CHARS = new Set(['{', '}']);

function fail(source: string, message: string): never {
  throw new Error(`sprite ${source}: ${message}`);
}

function parseCell(
  raw: unknown, source: string, where: string
): Cell | null {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 3) {
    fail(source, `${where}: a cell is [char, fg, bg] or null`);
  }
  const [char, fg, bg] = raw as [unknown, unknown, unknown];
  if (typeof char !== 'string' || char.length !== 1) {
    fail(source, `${where}: char must be a single character`);
  }
  if (FORBIDDEN_CHARS.has(char)) {
    fail(source, `${where}: the character '${char}' would corrupt tag markup`);
  }
  if (typeof fg !== 'number' || fg < 0 || fg > 15 || !Number.isInteger(fg)) {
    fail(source, `${where}: fg must be an integer colour 0-15`);
  }
  if (typeof bg !== 'number' || bg < 0 || bg > 15 || !Number.isInteger(bg)) {
    fail(source, `${where}: bg must be an integer colour 0-15`);
  }
  return { char, fg, bg };
}

/** Parse and validate one sprite. `source` names it in every error. */
export function parseSprite(raw: unknown, source = 'sprite'): Sprite {
  const s = raw as any;
  if (!s || typeof s !== 'object') fail(source, 'not an object');
  if (typeof s.name !== 'string' || !s.name) fail(source, 'missing name');
  if (!Number.isInteger(s.cellW) || s.cellW < 1) fail(source, 'bad cellW');
  if (!Number.isInteger(s.cellH) || s.cellH < 1) fail(source, 'bad cellH');
  if (!s.animations || typeof s.animations !== 'object' ||
      Object.keys(s.animations).length === 0) {
    fail(source, 'a sprite needs at least one animation');
  }

  const animations: Record<string, SpriteAnimation> = {};
  for (const [animName, rawAnim] of Object.entries<any>(s.animations)) {
    if (!rawAnim || !Array.isArray(rawAnim.frames) || rawAnim.frames.length === 0) {
      fail(source, `animation ${animName} has no frames`);
    }
    const frames: CellBuffer[] = rawAnim.frames.map(
      (rawFrame: unknown, frameIndex: number) => {
        const where = `animation ${animName} frame ${frameIndex}`;
        if (!Array.isArray(rawFrame) || rawFrame.length !== s.cellH) {
          fail(source, `${where}: expected ${s.cellH} rows`);
        }
        return (rawFrame as unknown[]).map((rawRow, rowIndex): CellRow => {
          if (!Array.isArray(rawRow) || rawRow.length !== s.cellW) {
            fail(source, `${where}: row ${rowIndex} is not ${s.cellW} cells`);
          }
          return rawRow.map((rawCell, cellIndex) =>
            parseCell(rawCell, source, `${where} row ${rowIndex} cell ${cellIndex}`));
        });
      }
    );
    animations[animName] = {
      ticksPerFrame: Number.isInteger(rawAnim.ticksPerFrame) && rawAnim.ticksPerFrame > 0
        ? rawAnim.ticksPerFrame : 1,
      loop: rawAnim.loop !== false,
      frames,
    };
  }

  return { name: s.name, cellW: s.cellW, cellH: s.cellH, animations };
}

/** Which frame is showing at game tick N. Pure. */
export function frameAt(anim: SpriteAnimation, tick: number): CellBuffer {
  const step = Math.max(1, anim.ticksPerFrame);
  const index = Math.floor(Math.max(0, tick) / step);
  return anim.loop
    ? anim.frames[index % anim.frames.length]
    : anim.frames[Math.min(index, anim.frames.length - 1)];
}

/**
 * Composite a sprite's current frame at a GRID position (the board is
 * gridW x gridH cells of cellW x cellH characters each).
 *
 * An unknown animation name throws: it is a typo in door code, and the
 * door's own render tests exercise every state, so it surfaces there.
 */
export function blitSprite(
  dest: CellBuffer,
  sprite: Sprite,
  animation: string,
  tick: number,
  gridX: number,
  gridY: number
): void {
  const anim = sprite.animations[animation];
  if (!anim) {
    throw new Error(
      `sprite ${sprite.name} has no animation '${animation}' ` +
      `(has: ${Object.keys(sprite.animations).join(', ')})`
    );
  }
  blitCells(dest, frameAt(anim, tick), gridX * sprite.cellW, gridY * sprite.cellH);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd sdk && npx jest tests/unit/cell-art-sprite.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json
cd /Users/spot/Code/amiexpress-web
git add sdk/engines/graphics/cell-art/sprite.ts sdk/tests/unit/cell-art-sprite.test.ts
git commit -m "feat(cell-art): sprite format, validation, tick clock and blit"
```

---

### Task 3: loader, module index, package export, builds

**Files:**
- Create: `sdk/engines/graphics/cell-art/load.ts`
- Create: `sdk/engines/graphics/cell-art/index.ts`
- Modify: `sdk/package.json` (exports map, after the
  `"./engines/graphics/motion-trail"` entry)
- Modify: `sdk/tsconfig.client.json` (include list)
- Test: `sdk/tests/unit/cell-art-load.test.ts`

**Interfaces:**
- Consumes (Task 2): `parseSprite`, `Sprite`.
- Produces (used by Tasks 4, 6):
  - `loadSpriteSheet(dir: string): Record<string, Sprite>` — reads every
    `*.sprite.json` in `dir`, keyed by each sprite's `name`; throws if the
    directory is missing or any file fails `parseSprite`.
  - Package import path: `@amiexpress/bbs-door-sdk/engines/graphics/cell-art`
    re-exporting everything from `cells`, `sprite`, `load`.

- [ ] **Step 1: Write the failing test**

`sdk/tests/unit/cell-art-load.test.ts`:

```typescript
/**
 * The sheet loader: a door points it at its sprites/ directory once at
 * start, and a malformed file fails the LOAD, loudly and named.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSpriteSheet } from '../../engines/graphics/cell-art/load';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cell-art-'));
}

const VALID = {
  name: 'dot',
  cellW: 1,
  cellH: 1,
  animations: { idle: { ticksPerFrame: 1, loop: true, frames: [[[['*', 11, 0]]]] } },
};

describe('loadSpriteSheet', () => {
  it('loads every *.sprite.json, keyed by sprite name', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'dot.sprite.json'), JSON.stringify(VALID));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

    const sheet = loadSpriteSheet(dir);
    expect(Object.keys(sheet)).toEqual(['dot']);
    expect(sheet.dot.cellW).toBe(1);
  });

  it('names the file when one is malformed', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'bad.sprite.json'),
      JSON.stringify({ ...VALID, cellW: 0 }));
    expect(() => loadSpriteSheet(dir)).toThrow(/bad\.sprite\.json/);
  });

  it('throws on a missing directory rather than returning an empty sheet', () => {
    // An empty sheet renders a blank board and LOOKS like a render bug;
    // a missing directory is a packaging bug and must say so.
    expect(() => loadSpriteSheet('/nonexistent/sprites')).toThrow(/sprites/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd sdk && npx jest tests/unit/cell-art-load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement loader and index**

`sdk/engines/graphics/cell-art/load.ts`:

```typescript
/**
 * Sheet loading. The only file in cell-art that touches fs, kept apart so
 * a browser bundle can import the model and renderer without it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Sprite, parseSprite } from './sprite';

/** Load every `*.sprite.json` in a directory, keyed by sprite name. */
export function loadSpriteSheet(dir: string): Record<string, Sprite> {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new Error(`sprite directory not found: ${dir}`);
  }

  const sheet: Record<string, Sprite> = {};
  for (const entry of entries) {
    if (!entry.endsWith('.sprite.json')) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
    const sprite = parseSprite(raw, entry);
    sheet[sprite.name] = sprite;
  }
  return sheet;
}
```

`sdk/engines/graphics/cell-art/index.ts`:

```typescript
/**
 * Cell art: coloured character cells, sprites animated on the game tick,
 * and the tag renderer that puts them on a blessed screen.
 *
 * The shared foundation for the arcade sprite work; plan 3 adds 9-slice
 * borders on the same Cell. See
 * thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md
 */

export {
  PALETTE,
  createBuffer,
  blitCells,
  rowToTags,
  bufferToTags,
} from './cells';
export type { Cell, CellRow, CellBuffer } from './cells';

export { parseSprite, frameAt, blitSprite } from './sprite';
export type { Sprite, SpriteAnimation } from './sprite';

export { loadSpriteSheet } from './load';
```

- [ ] **Step 4: Wire the package**

In `sdk/package.json`, after the `"./engines/graphics/motion-trail"` block:

```json
    "./engines/graphics/cell-art": {
      "types": "./dist/engines/graphics/cell-art/index.d.ts",
      "import": "./dist-esm/engines/graphics/cell-art/index.js",
      "require": "./dist/engines/graphics/cell-art/index.js",
      "default": "./dist/engines/graphics/cell-art/index.js"
    },
```

In `sdk/tsconfig.client.json`, extend `include`:

```json
    "engines/ui/arcade/**/*",
    // cell-art is pure and a client bundle may draw sprites; without this
    // the "import" condition points at a dist-esm path that never exists
    // (the exact fault the arcade module shipped with).
    "engines/graphics/cell-art/**/*"
```

Note: `load.ts` imports fs; door client bundles esbuild with
`--external:fs`, so the import stays external in the browser. Doors'
browser code must import from `cells`/`sprite` re-exports only — the
loader is server-side.

- [ ] **Step 5: Test, build, verify the build**

```bash
cd sdk && npx tsc --noEmit -p tsconfig.json
npx jest tests/unit/cell-art-load.test.ts     # expect PASS
npm run build:cjs && npm run build:esm
ls dist/engines/graphics/cell-art/index.js dist-esm/engines/graphics/cell-art/index.js
grep -c "loadSpriteSheet" dist/engines/graphics/cell-art/load.js
```

Expected: both files exist; grep >= 1.

- [ ] **Step 6: Commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add sdk/engines/graphics/cell-art/load.ts sdk/engines/graphics/cell-art/index.ts \
  sdk/tests/unit/cell-art-load.test.ts sdk/package.json sdk/tsconfig.client.json
git commit -m "feat(cell-art): sheet loader and the package export"
```

---

### Task 4: Pengo's sprite assets

**Files:**
- Create: `Doors/pengo/sprites/pengo.sprite.json`
- Create: `Doors/pengo/sprites/sno-bee.sprite.json`
- Create: `Doors/pengo/sprites/ice.sprite.json`
- Create: `Doors/pengo/sprites/diamond.sprite.json`
- Create: `Doors/pengo/sprites/wall.sprite.json`
- Create: `Doors/pengo/sprites/egg.sprite.json`
- Test: `Doors/pengo/tests/sprites-assets.test.ts` (+ register in
  `Doors/pengo/tests/run-tests.ts`)

**Interfaces:**
- Consumes (Task 3): `loadSpriteSheet` via
  `@amiexpress/bbs-door-sdk/engines/graphics/cell-art`.
- Produces (relied on by Task 6, exact names): sheet keys `pengo`,
  `sno-bee`, `ice`, `diamond`, `wall`, `egg`; animations —
  - `pengo`: `walk-up`, `walk-down`, `walk-left`, `walk-right`, `push`,
    `death` (death `loop:false`)
  - `sno-bee`: `crawl`, `stunned`, `hatching`
  - `ice`: `idle`, `sliding`
  - `diamond`: `sparkle`
  - `wall`: `idle`, `shake`
  - `egg`: `idle`
  - All `cellW: 5, cellH: 2`.

This is STARTER art — readable, not beautiful; the asset studio (plan 2)
exists to improve it. Characters are CP437-safe block/arrow glyphs already
used by other doors. Colours are numeric (11 = lightyellow body, 9 =
lightred, 3 = yellow, 14 = lightcyan, 12 = lightblue, 13 = lightmagenta,
15 = lightwhite, 4 = blue, 8 = gray).

- [ ] **Step 1: Write the failing test**

`Doors/pengo/tests/sprites-assets.test.ts`:

```typescript
/**
 * The shipped sprite sheet is complete and valid.
 *
 * The renderer (game/render.ts) asks for these sprites and animations BY
 * NAME; a missing one throws mid-game. This test walks the exact set the
 * renderer uses, so a renamed animation fails here, not in front of a
 * player.
 */

import assert from 'assert';
import { join } from 'path';
import { loadSpriteSheet } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const REQUIRED: Record<string, string[]> = {
  'pengo': ['walk-up', 'walk-down', 'walk-left', 'walk-right', 'push', 'death'],
  'sno-bee': ['crawl', 'stunned', 'hatching'],
  'ice': ['idle', 'sliding'],
  'diamond': ['sparkle'],
  'wall': ['idle', 'shake'],
  'egg': ['idle'],
};

export async function everySpriteAndAnimationTheRendererNamesExists(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

  for (const [name, animations] of Object.entries(REQUIRED)) {
    assert.ok(sheet[name], `sprite '${name}' is missing from sprites/`);
    for (const anim of animations) {
      assert.ok(
        sheet[name].animations[anim],
        `sprite '${name}' is missing animation '${anim}'`
      );
    }
  }
}

export async function everySpriteIsOneBoardCell(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));
  for (const sprite of Object.values(sheet)) {
    assert.strictEqual(sprite.cellW, 5, `${sprite.name} is not 5 wide`);
    assert.strictEqual(sprite.cellH, 2, `${sprite.name} is not 2 tall`);
  }
}

export async function deathHoldsItsLastFrame(): Promise<void> {
  const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));
  assert.strictEqual(sheet['pengo'].animations['death'].loop, false,
    'a looping death animation resurrects the penguin visually');
}
```

Register `'./sprites-assets.test'` in `Doors/pengo/tests/run-tests.ts`'s
`TEST_MODULES` list.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Doors/pengo && npm test`
Expected: the three new tests FAIL — sprite directory not found.

- [ ] **Step 3: Write the six sprite files**

`Doors/pengo/sprites/pengo.sprite.json` (walk animations tick on the game
loop; feet alternate; the beak arrow shows facing):

```json
{
  "name": "pengo",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "walk-right": {
      "ticksPerFrame": 3, "loop": true,
      "frames": [
        [[null, ["▄",11,0], ["█",11,0], ["►",3,0], null],
         [null, ["▐",9,0], ["▀",11,0], ["▌",9,0], null]],
        [[null, ["▄",11,0], ["█",11,0], ["►",3,0], null],
         [null, ["▌",9,0], ["▀",11,0], ["▐",9,0], null]]
      ]
    },
    "walk-left": {
      "ticksPerFrame": 3, "loop": true,
      "frames": [
        [[null, ["◄",3,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▐",9,0], ["▀",11,0], ["▌",9,0], null]],
        [[null, ["◄",3,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▌",9,0], ["▀",11,0], ["▐",9,0], null]]
      ]
    },
    "walk-up": {
      "ticksPerFrame": 3, "loop": true,
      "frames": [
        [[null, ["▄",11,0], ["▲",3,0], ["▄",11,0], null],
         [null, ["▐",9,0], ["▀",11,0], ["▌",9,0], null]],
        [[null, ["▄",11,0], ["▲",3,0], ["▄",11,0], null],
         [null, ["▌",9,0], ["▀",11,0], ["▐",9,0], null]]
      ]
    },
    "walk-down": {
      "ticksPerFrame": 3, "loop": true,
      "frames": [
        [[null, ["▄",11,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▐",9,0], ["▼",3,0], ["▌",9,0], null]],
        [[null, ["▄",11,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▌",9,0], ["▼",3,0], ["▐",9,0], null]]
      ]
    },
    "push": {
      "ticksPerFrame": 2, "loop": true,
      "frames": [
        [[["▄",11,0], ["█",11,0], ["█",11,0], ["►",3,0], null],
         [["▐",9,0], ["▀",11,0], ["▀",11,0], ["▌",9,0], null]],
        [[null, ["█",11,0], ["█",11,0], ["►",3,0], ["─",7,0]],
         [null, ["▐",9,0], ["▀",11,0], ["▌",9,0], null]]
      ]
    },
    "death": {
      "ticksPerFrame": 6, "loop": false,
      "frames": [
        [[null, null, null, null, null],
         [null, ["▄",11,0], ["█",11,0], ["▄",11,0], null]],
        [[null, null, null, null, null],
         [null, ["░",11,0], ["▒",11,0], ["░",11,0], null]],
        [[null, null, null, null, null],
         [null, null, ["░",8,0], null, null]]
      ]
    }
  }
}
```

`Doors/pengo/sprites/sno-bee.sprite.json`:

```json
{
  "name": "sno-bee",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "crawl": {
      "ticksPerFrame": 4, "loop": true,
      "frames": [
        [[null, ["▄",9,0], ["▀",9,0], ["▄",9,0], null],
         [["▐",9,0], ["•",15,0], ["▄",9,0], ["•",15,0], ["▌",9,0]]],
        [[null, ["▀",9,0], ["▄",9,0], ["▀",9,0], null],
         [["▌",9,0], ["•",15,0], ["▄",9,0], ["•",15,0], ["▐",9,0]]]
      ]
    },
    "stunned": {
      "ticksPerFrame": 5, "loop": true,
      "frames": [
        [[null, ["▄",3,0], ["▀",3,0], ["▄",3,0], null],
         [null, ["*",15,0], ["▄",3,0], ["*",15,0], null]],
        [[null, ["▄",3,0], ["▀",3,0], ["▄",3,0], null],
         [null, ["+",15,0], ["▄",3,0], ["+",15,0], null]]
      ]
    },
    "hatching": {
      "ticksPerFrame": 4, "loop": true,
      "frames": [
        [[null, ["▄",13,0], ["▄",13,0], null, null],
         [null, ["▀",9,0], ["▀",13,0], null, null]],
        [[null, ["▄",9,0], ["▄",13,0], null, null],
         [null, ["▀",9,0], ["▀",9,0], null, null]]
      ]
    }
  }
}
```

`Doors/pengo/sprites/ice.sprite.json` (bg 14 keeps the pale block reading
as today; shimmer is the ▒/▓ swap):

```json
{
  "name": "ice",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "idle": {
      "ticksPerFrame": 8, "loop": true,
      "frames": [
        [[["▓",15,14], ["▒",15,14], ["▓",15,14], ["▒",15,14], ["▓",15,14]],
         [["▒",15,14], ["▓",15,14], ["▒",15,14], ["▓",15,14], ["▒",15,14]]],
        [[["▒",15,14], ["▓",15,14], ["▒",15,14], ["▓",15,14], ["▒",15,14]],
         [["▓",15,14], ["▒",15,14], ["▓",15,14], ["▒",15,14], ["▓",15,14]]]
      ]
    },
    "sliding": {
      "ticksPerFrame": 1, "loop": true,
      "frames": [
        [[["░",15,14], ["░",15,14], ["░",15,14], ["░",15,14], ["░",15,14]],
         [["░",15,14], ["░",15,14], ["░",15,14], ["░",15,14], ["░",15,14]]]
      ]
    }
  }
}
```

`Doors/pengo/sprites/diamond.sprite.json`:

```json
{
  "name": "diamond",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "sparkle": {
      "ticksPerFrame": 6, "loop": true,
      "frames": [
        [[null, ["▄",11,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▀",11,0], ["█",11,0], ["▀",11,0], null]],
        [[null, ["▄",11,0], ["█",15,0], ["▄",11,0], null],
         [null, ["▀",11,0], ["█",11,0], ["▀",11,0], null]],
        [[null, ["▄",15,0], ["█",11,0], ["▄",11,0], null],
         [null, ["▀",11,0], ["█",11,0], ["▀",15,0], null]]
      ]
    }
  }
}
```

`Doors/pengo/sprites/wall.sprite.json`:

```json
{
  "name": "wall",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "idle": {
      "ticksPerFrame": 1, "loop": true,
      "frames": [
        [[["▒",12,4], ["░",12,4], ["▒",12,4], ["░",12,4], ["▒",12,4]],
         [["░",12,4], ["▒",12,4], ["░",12,4], ["▒",12,4], ["░",12,4]]]
      ]
    },
    "shake": {
      "ticksPerFrame": 2, "loop": true,
      "frames": [
        [[["░",12,4], ["▒",12,4], ["░",12,4], ["▒",12,4], ["░",12,4]],
         [["▒",12,4], ["░",12,4], ["▒",12,4], ["░",12,4], ["▒",12,4]]],
        [[["▒",15,4], ["░",12,4], ["▒",15,4], ["░",12,4], ["▒",15,4]],
         [["░",12,4], ["▒",15,4], ["░",12,4], ["▒",15,4], ["░",12,4]]]
      ]
    }
  }
}
```

`Doors/pengo/sprites/egg.sprite.json`:

```json
{
  "name": "egg",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "idle": {
      "ticksPerFrame": 8, "loop": true,
      "frames": [
        [[null, ["▄",13,0], ["▄",13,0], null, null],
         [null, ["▀",13,0], ["▀",13,0], null, null]],
        [[null, ["▄",5,0], ["▄",5,0], null, null],
         [null, ["▀",5,0], ["▀",5,0], null, null]]
      ]
    }
  }
}
```

After writing each file: `grep -c "▀\|▄\|█" Doors/pengo/sprites/<file>` —
must be non-zero (verifies the block glyphs survived the write; repo
memory says high-bit bytes have been destroyed by editing tools before).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Doors/pengo && npm test`
Expected: `sprites-assets` tests PASS (other suites unchanged).

- [ ] **Step 5: Commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/pengo/sprites/pengo.sprite.json Doors/pengo/sprites/sno-bee.sprite.json \
  Doors/pengo/sprites/ice.sprite.json Doors/pengo/sprites/diamond.sprite.json \
  Doors/pengo/sprites/wall.sprite.json Doors/pengo/sprites/egg.sprite.json \
  Doors/pengo/tests/sprites-assets.test.ts Doors/pengo/tests/run-tests.ts
git commit -m "feat(pengo): the starter sprite sheet, six sprites at 5x2"
```

---

### Task 5: Pengo geometry and animation state

**Files:**
- Modify: `Doors/pengo/game/constants.ts` (GRID_HEIGHT, cell size, ice counts)
- Modify: `Doors/pengo/game/types.ts` (PengoData gains two fields)
- Modify: `Doors/pengo/game/pengo-game.ts` (`pushBlock`, `shakeWall` record
  their moment)
- Modify: `Doors/pengo/index.ts` (board box size, HUD line, 1-row footer)
- Test: `Doors/pengo/tests/layout.test.ts` (new file; register in
  `run-tests.ts`)

**Interfaces:**
- Produces (used by Task 6):
  - constants: `GRID_WIDTH = 15` (unchanged), `GRID_HEIGHT = 10`,
    `CELL_W = 5`, `CELL_H = 2`, `BOARD_COLS = GRID_WIDTH * CELL_W` (75),
    `BOARD_ROWS = GRID_HEIGHT * CELL_H` (20). The old `CELL_WIDTH = 2` in
    `game/sprites.ts` dies in Task 6.
  - `PengoData.lastSlide?: { x: number; y: number; tick: number }`
  - `PengoData.wallShake?: { tick: number }`

- [ ] **Step 1: Write the failing layout test**

`Doors/pengo/tests/layout.test.ts`:

```typescript
/**
 * The board fills the terminal.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. The whole point of the sprite work is a 75x20 board;
 * these are the numbers that hold it, measured from the door's constants
 * so a drive-by constant change fails here first.
 *
 * The row budget: HUD 1 (row 0) + board 20 (rows 1-20) + hint 1 (row 23).
 * Anything taller than 20 board rows overflows the way Frogger's menu box
 * climbed onto its HUD.
 */

import assert from 'assert';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GRID_WIDTH, GRID_HEIGHT,
  CELL_W, CELL_H, BOARD_COLS, BOARD_ROWS, getLevelConfig,
} from '../game/constants';

export async function theBoardFillsTheScreenWidth(): Promise<void> {
  assert.strictEqual(BOARD_COLS, GRID_WIDTH * CELL_W);
  assert.ok(BOARD_COLS <= SCREEN_WIDTH, `${BOARD_COLS} columns on an ${SCREEN_WIDTH}-column screen`);
  assert.ok(BOARD_COLS >= SCREEN_WIDTH - 6, `${BOARD_COLS} columns is not "the full terminal"`);
}

export async function theBoardFitsTheRowBudget(): Promise<void> {
  assert.strictEqual(BOARD_ROWS, GRID_HEIGHT * CELL_H);
  assert.ok(1 + BOARD_ROWS + 1 <= SCREEN_HEIGHT,
    `HUD + ${BOARD_ROWS} board rows + hint do not fit ${SCREEN_HEIGHT} rows`);
}

export async function theLevelStillFitsItsBoard(): Promise<void> {
  // 60 ice blocks was 42% of the old 13x11 interior. The interior is now
  // 13x8 = 104 cells; the counts scale to keep the density, or level one
  // is a solid wall of ice.
  for (let level = 1; level <= 8; level++) {
    const config = getLevelConfig(level);
    const interior = (GRID_WIDTH - 2) * (GRID_HEIGHT - 2);
    const occupied = config.iceBlocks + 3 /* diamonds */ + config.enemies + config.eggs + 1;
    assert.ok(occupied < interior * 0.7,
      `level ${level}: ${occupied} things in ${interior} interior cells`);
  }
}
```

Register `'./layout.test'` in `TEST_MODULES`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Doors/pengo && npm test`
Expected: FAIL — `CELL_W` not exported (and after adding constants
naively, the density test fails until the ice counts scale).

- [ ] **Step 3: Change the constants**

In `Doors/pengo/game/constants.ts` replace `export const GRID_HEIGHT = 13;`
with:

```typescript
export const GRID_HEIGHT = 10;

/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters, so the 15x10 maze is a 75x20 board - the full terminal, with
 * the HUD above and the hint below.
 *
 * GRID_HEIGHT dropped from 13 to 10 to buy the second sprite row: 13 cells
 * x 2 rows was 26 rows on a 24-row screen. Approved in the design doc.
 */
export const CELL_W = 5;
export const CELL_H = 2;
export const BOARD_COLS = GRID_WIDTH * CELL_W;
export const BOARD_ROWS = GRID_HEIGHT * CELL_H;
```

And scale `LEVEL_CONFIGS` ice for the 104-cell interior (keeps the old
42-46% density):

```typescript
export const LEVEL_CONFIGS: LevelConfig[] = [
  { enemies: 3, eggs: 0, iceBlocks: 44, enemySpeed: 10, timeLimit: 180 },
  { enemies: 4, eggs: 1, iceBlocks: 40, enemySpeed: 9, timeLimit: 160 },
  { enemies: 4, eggs: 2, iceBlocks: 37, enemySpeed: 8, timeLimit: 150 },
  { enemies: 5, eggs: 2, iceBlocks: 33, enemySpeed: 7, timeLimit: 140 },
  { enemies: 5, eggs: 3, iceBlocks: 29, enemySpeed: 6, timeLimit: 120 },
];
```

- [ ] **Step 4: Record the two animation moments**

In `Doors/pengo/game/types.ts`, add to `PengoData` (after the
`diamondsAligned` field):

```typescript
  /**
   * The block push that just happened, for the renderer: the destination
   * cell plays its 'sliding' animation briefly. Rendering state, not
   * gameplay - nothing reads it back.
   */
  lastSlide?: { x: number; y: number; tick: number };
  /** Likewise for a wall shake: the frame the walls started rattling. */
  wallShake?: { tick: number };
```

In `Doors/pengo/game/pengo-game.ts`:

In `pushBlock`, immediately after the existing `this.cues.push('dash');`
line, add nothing yet — the destination is only known at the end. After
the `if (!crushedEnemy) { ... }` block (before `this.checkDiamondAlignment();`):

```typescript
    // Where the block came to rest, for the renderer's slide flash.
    this.data.lastSlide = { x: slideX, y: slideY, tick: this.data.frameCount };
```

In `shakeWall`, after the `this.cues.push(stunned ? 'hit' : 'boop');` line:

```typescript
    this.data.wallShake = { tick: this.data.frameCount };
```

- [ ] **Step 5: Resize the screen layout**

In `Doors/pengo/index.ts`:

- Import the new constants: extend the existing `./game/constants` import
  with `CELL_W, CELL_H, BOARD_COLS, BOARD_ROWS` (CELL_W/CELL_H are used by
  Task 6's render call sites; importing now keeps one diff).
- `gameArea` box: `width: GRID_WIDTH * 2` → `width: BOARD_COLS`,
  `height: GRID_HEIGHT + 2` → `height: BOARD_ROWS`.
- `footerBox`: replace the 3-row bordered box with a single borderless row
  (the border was two of its three rows):

```typescript
  footerBox = new Box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content:
      "{gray-fg}Arrow Keys: Move | Space: Push Block | P: Pause | Q: Quit{/}",
  });
```

- `formatHUD` gains the time and enemy count (they lived under the board;
  the board owns all 20 rows now):

```typescript
function formatHUD(): string {
  const scoreStr = gameData.score.toString().padStart(8, "0");
  const livesStr = "*".repeat(Math.max(0, gameData.lives));
  const timeColor = gameData.timeRemaining <= 30 ? "red" : "yellow";
  const enemies = gameData.enemies.filter(e => e.state !== "dead").length;
  return (
    `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${gameData.level}{/}  ` +
    `{red-fg}LIVES: ${livesStr}{/}  {${timeColor}-fg}TIME: ${gameData.timeRemaining}{/}  ` +
    `{white-fg}ENEMIES: ${enemies}{/}`
  );
}
```

(Worst case fits: 8-digit score + 2-digit level + 8 lives + 3-digit time +
1-digit enemies is 76 visible columns.)

- [ ] **Step 6: Run the suite**

Run: `cd Doors/pengo && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: layout tests PASS. `sfx` and `menu` suites still PASS (their
coordinates all sit inside 15×10). The board looks broken on screen at
this commit — the old renderer still draws 2-wide cells — which is why
Tasks 5 and 6 land in one push to the backend, but commit separately.

- [ ] **Step 7: Commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/pengo/game/constants.ts Doors/pengo/game/types.ts \
  Doors/pengo/game/pengo-game.ts Doors/pengo/index.ts \
  Doors/pengo/tests/layout.test.ts Doors/pengo/tests/run-tests.ts
git commit -m "feat(pengo): 15x10 maze at 5x2 cells - the geometry for sprites"
```

---

### Task 6: the sprite renderer, and the glyph module's funeral

**Files:**
- Create: `Doors/pengo/game/render.ts`
- Modify: `Doors/pengo/game/pengo-game.ts` (render() delegates; sprite
  imports removed)
- Modify: `Doors/pengo/index.ts` (loads the sheet, passes it in)
- Delete: `Doors/pengo/game/sprites.ts`
- Delete: `Doors/pengo/tests/sprites.test.ts` (tested the glyph module)
- Test: `Doors/pengo/tests/render.test.ts` (register in `run-tests.ts`;
  deregister `./sprites.test`)

**Interfaces:**
- Consumes: Task 3's package export; Task 4's animation names; Task 5's
  constants and `lastSlide`/`wallShake`.
- Produces:
  - `buildBoard(data: PengoData, sheet: Record<string, Sprite>, tick: number): CellBuffer`
    (75×20, pure)
  - `PengoGame` constructor takes a third argument:
    `new PengoGame(data, onRender, sheet)` — `sheet` is
    `Record<string, Sprite>`; `render()` emits
    `bufferToTags(buildBoard(...)).join('\n')`.

- [ ] **Step 1: Write the failing test**

`Doors/pengo/tests/render.test.ts`:

```typescript
/**
 * The sprite renderer.
 *
 * buildBoard is pure in (data, sheet, tick), so everything the player sees
 * is assertable: where the penguin is drawn, that a stunned Sno-Bee looks
 * stunned, that death animates and then holds. The four glyph-collision
 * bugs of 2026-08-31 (galaga's '.', donkey-kong's 'H', zoo-keeper's '@',
 * joust's '{') were all "the buffer cannot say what this is" bugs; a Cell
 * carries its own colours, so none of them can come back.
 */

import assert from 'assert';
import { join } from 'path';
import {
  loadSpriteSheet, Cell, CellBuffer,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { buildBoard } from '../game/render';
import { createInitialGameData } from '../game/initial-data';
import { PengoGame } from '../game/pengo-game';
import { PengoData } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, CELL_W, CELL_H, BOARD_COLS, BOARD_ROWS,
} from '../game/constants';

const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

/** A board the test controls completely (same shape as the sfx suite's). */
function emptyBoard(): { game: PengoGame; data: PengoData } {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display */ }, sheet);
  game.initLevel();
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const edge = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1;
      data.grid[y][x] = edge ? 'wall' : 'empty';
    }
  }
  data.enemies = [];
  data.eggs = [];
  data.state = 'playing';
  data.pengo = {
    x: 4, y: 4, direction: 'right',
    isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
  };
  return { game, data };
}

/** The characters drawn inside one grid cell, as a string. */
function cellChars(board: CellBuffer, gridX: number, gridY: number): string {
  let out = '';
  for (let r = 0; r < CELL_H; r++) {
    for (let c = 0; c < CELL_W; c++) {
      const cell = board[gridY * CELL_H + r][gridX * CELL_W + c];
      out += cell ? (cell as Cell).char : ' ';
    }
  }
  return out;
}

export async function theBoardIsExactlyTheScreenItClaims(): Promise<void> {
  const { data } = emptyBoard();
  const board = buildBoard(data, sheet, 0);
  assert.strictEqual(board.length, BOARD_ROWS);
  assert.strictEqual(board[0].length, BOARD_COLS);
}

export async function thePenguinIsDrawnWhereItStands(): Promise<void> {
  const { data } = emptyBoard();
  const board = buildBoard(data, sheet, 0);
  assert.ok(cellChars(board, 4, 4).trim().length > 0, 'the penguin cell has ink');
  assert.ok(cellChars(board, 5, 5).trim().length === 0, 'an empty floor cell has none');
}

export async function facingIsVisible(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.direction = 'right';
  const right = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.direction = 'left';
  const left = cellChars(buildBoard(data, sheet, 0), 4, 4);
  assert.notStrictEqual(right, left, 'facing must be visible in the sprite');
}

export async function walkingAnimates(): Promise<void> {
  const { data } = emptyBoard();
  const t0 = cellChars(buildBoard(data, sheet, 0), 4, 4);
  const t3 = cellChars(buildBoard(data, sheet, 3), 4, 4);
  assert.notStrictEqual(t0, t3, 'the walk cycle must move between ticks');
}

export async function aStunnedSnoBeeLooksStunned(): Promise<void> {
  const { data } = emptyBoard();
  data.enemies = [{
    id: 1, x: 6, y: 6, direction: 'left', state: 'walking',
    stunTimer: 0, hatchTimer: 0, moveTimer: 0,
  }];
  const walking = buildBoard(data, sheet, 0);
  data.enemies[0].state = 'stunned';
  const stunned = buildBoard(data, sheet, 0);

  const cellOf = (b: CellBuffer) => {
    const cell = b[6 * CELL_H][6 * CELL_W + 1] as Cell;
    return cell ? cell.fg : -1;
  };
  assert.notStrictEqual(cellOf(walking), cellOf(stunned),
    'a stunned Sno-Bee must not be drawn in the threat colour');
}

export async function deathAnimatesAndThenHolds(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.isDead = true;
  data.pengo.deathFrame = 0;
  const start = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.deathFrame = 18;
  const late = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.deathFrame = 40;
  const held = cellChars(buildBoard(data, sheet, 0), 4, 4);

  assert.notStrictEqual(start, late, 'death is an animation, not a pose');
  assert.strictEqual(late, held, 'and it holds the last frame');
}

export async function aFreshSlidePlaysTheSlideFlash(): Promise<void> {
  const { data } = emptyBoard();
  data.grid[3][7] = 'ice';
  const calm = cellChars(buildBoard(data, sheet, 100), 7, 3);
  data.lastSlide = { x: 7, y: 3, tick: 100 };
  const flash = cellChars(buildBoard(data, sheet, 102), 7, 3);
  const after = cellChars(buildBoard(data, sheet, 160), 7, 3);

  assert.notStrictEqual(calm, flash, 'a just-pushed block flashes');
  assert.strictEqual(after, calm, 'and calms back down');
}

export async function renderEmitsTagsNotGlyphPairs(): Promise<void> {
  const { game } = emptyBoard();
  let content = '';
  const g = new PengoGame(
    (game as any).data, (c: string) => { content = c; }, sheet
  );
  g.render();
  const rows = content.split('\n');
  assert.strictEqual(rows.length, BOARD_ROWS, 'render emits exactly the board');
  assert.ok(rows[0].includes('-fg}'), 'rows are tagged');
}
```

Update `TEST_MODULES` in `run-tests.ts`: remove `'./sprites.test'`, add
`'./render.test'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Doors/pengo && npm test`
Expected: FAIL — `../game/render` not found; PengoGame takes 2 args.

- [ ] **Step 3: Write the renderer**

`Doors/pengo/game/render.ts`:

```typescript
/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * Layer order is meaning: terrain first, then eggs, then Sno-Bees, then
 * the penguin - the player is never hidden by scenery. Everything the
 * previous glyph renderer decided by matching characters in a string is
 * decided here by which sprite was blitted, which is why the "colour
 * chosen after drawing" class of bug cannot recur.
 */

import {
  CellBuffer, Sprite, createBuffer, blitSprite,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { PengoData } from './types';
import {
  GRID_WIDTH, GRID_HEIGHT, BOARD_COLS, BOARD_ROWS,
} from './constants';

/** How long a pushed block keeps its slide flash, in ticks. */
const SLIDE_FLASH_TICKS = 5;
/** How long the walls rattle after a shake. */
const WALL_SHAKE_TICKS = 6;
/** An egg this close to hatching cracks visibly. */
const HATCH_WARNING = 30;

export function buildBoard(
  data: PengoData,
  sheet: Record<string, Sprite>,
  tick: number
): CellBuffer {
  const board = createBuffer(BOARD_COLS, BOARD_ROWS);

  const sliding = (x: number, y: number): boolean =>
    !!data.lastSlide && data.lastSlide.x === x && data.lastSlide.y === y &&
    tick - data.lastSlide.tick <= SLIDE_FLASH_TICKS;
  const wallsShaking =
    !!data.wallShake && tick - data.wallShake.tick <= WALL_SHAKE_TICKS;

  // Terrain
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      switch (data.grid[y]?.[x]) {
        case 'wall':
          blitSprite(board, sheet['wall'], wallsShaking ? 'shake' : 'idle', tick, x, y);
          break;
        case 'ice':
          blitSprite(board, sheet['ice'], sliding(x, y) ? 'sliding' : 'idle', tick, x, y);
          break;
        case 'diamond':
          blitSprite(board, sheet['diamond'], 'sparkle', tick, x, y);
          break;
        // 'empty': transparent floor; the fallback paints it black.
      }
    }
  }

  // Eggs
  for (const egg of data.eggs) {
    const anim = egg.hatchTimer <= HATCH_WARNING ? 'hatching' : 'idle';
    const sprite = anim === 'hatching' ? sheet['sno-bee'] : sheet['egg'];
    blitSprite(board, sprite, anim === 'hatching' ? 'hatching' : 'idle', tick, egg.x, egg.y);
  }

  // Sno-Bees
  for (const enemy of data.enemies) {
    if (enemy.state === 'dead') continue;
    blitSprite(board, sheet['sno-bee'],
      enemy.state === 'stunned' ? 'stunned' : 'crawl', tick, enemy.x, enemy.y);
  }

  // The penguin, last and on top.
  const p = data.pengo;
  if (p.isDead) {
    blitSprite(board, sheet['pengo'], 'death', p.deathFrame, p.x, p.y);
  } else if (p.isPushing) {
    blitSprite(board, sheet['pengo'], 'push', p.pushFrame, p.x, p.y);
  } else {
    blitSprite(board, sheet['pengo'], `walk-${p.direction}`, tick, p.x, p.y);
  }

  return board;
}
```

- [ ] **Step 4: Rewire PengoGame and the door**

In `Doors/pengo/game/pengo-game.ts`:

- Remove the `./sprites` import block entirely.
- Add:

```typescript
import { Sprite, bufferToTags } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { buildBoard } from './render';
```

- Constructor gains the sheet:

```typescript
  private sheet: Record<string, Sprite>;

  constructor(
    data: PengoData,
    onRender: (content: string) => void,
    sheet: Record<string, Sprite>
  ) {
    this.data = data;
    this.renderCallback = onRender;
    this.sheet = sheet;
  }
```

- Replace the whole body of `render()` (the loop building `lines` and the
  TIME/ENEMIES footer — the HUD owns those now) with:

```typescript
  render(): void {
    const board = buildBoard(this.data, this.sheet, this.data.frameCount);
    this.renderCallback(bufferToTags(board).join('\n'));
  }
```

In `Doors/pengo/index.ts`:

- Add near the other imports:

```typescript
import { loadSpriteSheet } from "@amiexpress/bbs-door-sdk/engines/graphics/cell-art";
import { join } from "path";
```

- At module scope: `const spriteSheet = loadSpriteSheet(join(__dirname, "sprites"));`
  — note `__dirname` is `dist/` at runtime, so the build must carry the
  sheet: add to `Doors/pengo/package.json` scripts:
  `"build": "tsc && npm run bundle:client && npm run copy-sprites"`, plus
  `"copy-sprites": "mkdir -p dist/sprites && cp sprites/*.sprite.json dist/sprites/"`.
  (Same pattern as the SDK's own copy-assets step.)
- The single `new PengoGame(gameData, ...)` call site (index.ts:240) gains
  the third argument `spriteSheet`.

Delete `Doors/pengo/game/sprites.ts` and `Doors/pengo/tests/sprites.test.ts`:

```bash
git rm Doors/pengo/game/sprites.ts Doors/pengo/tests/sprites.test.ts
```

- [ ] **Step 5: Run everything, then the RED check**

Run: `cd Doors/pengo && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: all suites PASS (sfx, menu, layout, sprites-assets, render).

RED check (required): temporarily swap the `stunned` branch in
`render.ts` to `'crawl'`, run `npm test`, expect
`aStunnedSnoBeeLooksStunned` to FAIL; restore, expect green.

- [ ] **Step 6: Commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/pengo/game/render.ts Doors/pengo/game/pengo-game.ts \
  Doors/pengo/index.ts Doors/pengo/package.json \
  Doors/pengo/tests/render.test.ts Doors/pengo/tests/run-tests.ts
git rm -q --cached Doors/pengo/game/sprites.ts Doors/pengo/tests/sprites.test.ts 2>/dev/null || true
git commit -m "feat(pengo): the board is drawn from animated cell-art sprites"
```

(The pre-commit hook rebuilds and stages `dist/` — including the copied
sprite JSONs — itself.)

---

### Task 7: freshness, live check, wrap-up

**Files:** none new. This task is verification and bookkeeping.

- [ ] **Step 1: Full builds, in dependency order**

```bash
cd /Users/spot/Code/amiexpress-web/sdk && npm run build:cjs && npm run build:esm
cd ../Doors/pengo && npm run build
ls dist/sprites/pengo.sprite.json   # the sheet travelled into dist
```

- [ ] **Step 2: Restart the backend (door-sdk-freshness, section A)**

```bash
/Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
ps aux | grep -E "(start-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep  # expect nothing
rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
/Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only --quick  # background
```

Wait for `[READY] AmiExpress BBS is ready for connections!` in
`logs/backend.log` and confirm `Registered door: PENGO` is timestamped
after the restart.

- [ ] **Step 3: Run every affected suite once, final**

```bash
cd /Users/spot/Code/amiexpress-web/sdk && npx jest
cd ../Doors/pengo && npm test
```

Expected: SDK fully green (including the three new cell-art suites);
Pengo fully green.

- [ ] **Step 4: Manual verification (the user does this — do not check
      these boxes yourself)**

- [ ] PENGO opens; the board spans nearly the whole terminal (75×20).
- [ ] The penguin visibly walks (feet alternate) and faces its direction.
- [ ] Ice shimmers; diamonds sparkle; a pushed block flashes as it lands.
- [ ] A wall push rattles the walls; a stunned Sno-Bee turns yellow.
- [ ] Death plays its collapse and the game continues correctly after.
- [ ] Sound effects still fire (nothing in this plan touched the channel).
- [ ] Menu, high scores, help, pause all render inside the new layout.

- [ ] **Step 5: Do not push**

Work stays local until the user says deploy. If the session ends here,
write the handoff per repo convention and note that Tasks 1-6 are
committed locally on top of `<current origin/main>`, cherry-pick-ready.

---

## Self-review (done at writing time)

- Spec coverage: phase 1 (Tasks 1-3), phase 2 (Tasks 4-7). Spec's loader
  validation, tick-purity, transparency, z-order, tag output, geometry,
  starter sprites, glyph-module deletion: each has a named task above.
  Phases 3-6 are plans 2 and 3, per the scope rule.
- Types: `Record<string, Sprite>` is the sheet everywhere; `blitSprite`
  takes grid coordinates in both Task 2's definition and Task 6's use;
  constructor arity change is applied at the one call site (index.ts:240
  is the only `new PengoGame(` in the door — verified against source).
- Known intentional roughness: the starter art is starter art. The studio
  door (plan 2) is the fix for that, not more JSON polishing here.
