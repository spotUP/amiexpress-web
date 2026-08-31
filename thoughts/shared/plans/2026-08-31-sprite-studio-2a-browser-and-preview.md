---
date: 2026-08-31
topic: "Plan 2a of 3: the sprite studio door - browser and live preview"
tags: [sprite-editor, asset-studio, cell-art, sdk, plan]
status: final
spec: thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md
---

# Sprite Studio 2a — Browser + Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working SPRITED door: browse every door's sprite sheets and
watch any animation play live, in a responsive layout.

**Architecture:** A server-side blessed door (like ansi-editor, whose
wrapper is the pattern), split into a guarded filesystem module, a pure
browser-selection model, a pure preview renderer on cell-art, and a thin
UI that binds them. Editing (frame ops, pixel painting, saving) is plan
2b; this plan ships the door people can open today.

**Tech Stack:** TypeScript strict, sdk blessed widgets + createScreen
(responsive), cell-art engine, tsx test runner. No new dependencies.

**Spec:** `thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md`
phase 3 (first half). The phase's gate — the ansi-edit black-screen fix —
landed as commit 34056d29f with a regression test; the gate is CLEARED.

## Global Constraints

- Repo root `/Users/spot/Code/amiexpress-web`; stage by name only; new
  files LF; no emoji; commit trailers:
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF
- NEVER push (deploy freeze). NEVER restart the backend (controller's job).
- Door tests: `cd Doors/sprite-editor && npm test` (tsx runner, plain async
  functions + node assert, registered in tests/run-tests.ts).
- Typecheck: `npx tsc --noEmit -p tsconfig.json` in the door after every
  task.
- The pre-commit hook rebuilds and stages the door's dist/ — let it.
- The sdk is consumed via `file:../../sdk` (run `SKIP_SDK_PREPARE=1 npm
  install` once in the new door; sdk/dist is already built).
- Every behavior ships a test that fails on the reverted change (RED step
  included below — do not skip).

---

### Task 1: door scaffold + guarded asset access

**Files:**
- Create: `Doors/sprite-editor/package.json`
- Create: `Doors/sprite-editor/tsconfig.json`
- Create: `Doors/sprite-editor/assets.ts`
- Create: `Doors/sprite-editor/index.ts` (minimal bootstrap; UI in Task 3)
- Create: `Doors/sprite-editor/tests/assets.test.ts`
- Create: `Doors/sprite-editor/tests/run-tests.ts`

**Interfaces:**
- Consumes: `parseSprite`, `Sprite` from
  `@amiexpress/bbs-door-sdk/engines/graphics/cell-art`.
- Produces (Tasks 3-4 rely on these exact signatures):
  - `DOORS_ROOT: string`
  - `listDoorsWithSprites(): string[]` — sorted door directory names that
    contain at least one `sprites/*.sprite.json`
  - `listSprites(door: string): string[]` — sorted `*.sprite.json`
    filenames in that door
  - `readSprite(door: string, file: string): Sprite` — parsed and
    validated; throws on traversal, missing file, or malformed sprite
  - `resolveAssetPath(door: string, kind: 'sprites' | 'art', file: string): string`
    — throws on any path that resolves outside `Doors/<door>/<kind>/`

- [ ] **Step 1: Write the failing test**

`Doors/sprite-editor/tests/assets.test.ts`:

```typescript
/**
 * The studio's filesystem access, guarded.
 *
 * The door-delete incident rule applies verbatim: a recursive path needs a
 * RESOLVED-path guard, not a trusted string. Every read the UI can trigger
 * funnels through resolveAssetPath, and these tests are the proof that a
 * hostile or buggy selection cannot leave Doors/<door>/<kind>/.
 */

import assert from 'assert';
import { join } from 'path';
import {
  DOORS_ROOT,
  listDoorsWithSprites,
  listSprites,
  readSprite,
  resolveAssetPath,
} from '../assets';

export async function doorsRootIsTheDoorsDirectory(): Promise<void> {
  assert.ok(DOORS_ROOT.endsWith('/Doors') || DOORS_ROOT.endsWith('\\Doors'),
    `DOORS_ROOT resolves to ${DOORS_ROOT}`);
}

export async function pengoIsListedBecauseItShipsSprites(): Promise<void> {
  const doors = listDoorsWithSprites();
  assert.ok(doors.includes('pengo'), `got: ${doors.join(', ')}`);
  // Sorted, so the browser list is stable between visits.
  assert.deepStrictEqual(doors, [...doors].sort());
}

export async function pengoSpritesAreListed(): Promise<void> {
  const files = listSprites('pengo');
  assert.ok(files.includes('pengo.sprite.json'), `got: ${files.join(', ')}`);
  assert.ok(files.every(f => f.endsWith('.sprite.json')));
}

export async function aRealSpriteLoadsValidated(): Promise<void> {
  const sprite = readSprite('pengo', 'pengo.sprite.json');
  assert.strictEqual(sprite.name, 'pengo');
  assert.ok(sprite.animations['walk-right'], 'validated through parseSprite');
}

export async function traversalIsRefusedAtEveryArgument(): Promise<void> {
  // Each of these resolves outside Doors/<door>/sprites/ and must throw.
  const attacks: Array<[string, string]> = [
    ['../web', 'x.sprite.json'],
    ['pengo', '../../pengo/highscores.json'],
    ['pengo', '../sprites/pengo.sprite.json'],
    ['/etc', 'passwd'],
    ['pengo', '/etc/passwd'],
  ];
  for (const [door, file] of attacks) {
    assert.throws(
      () => resolveAssetPath(door, 'sprites', file),
      /outside/,
      `not refused: door=${door} file=${file}`
    );
  }
}

export async function theGuardIsResolvedPathsNotStrings(): Promise<void> {
  // A name that CONTAINS the right prefix but escapes anyway - the exact
  // shape a startsWith-on-strings guard misses.
  assert.throws(
    () => resolveAssetPath('pengo', 'sprites', '..%2F..%2Fsecrets'.replace(/%2F/g, '/')),
    /outside/
  );
  // And the honest case still passes.
  const ok = resolveAssetPath('pengo', 'sprites', 'pengo.sprite.json');
  assert.strictEqual(ok, join(DOORS_ROOT, 'pengo', 'sprites', 'pengo.sprite.json'));
}
```

`Doors/sprite-editor/tests/run-tests.ts` — copy
`Doors/ansi-editor/tests/run-tests.ts` verbatim, with
`const TEST_MODULES = ['./assets.test'];`.

- [ ] **Step 2: Scaffold the package, install, watch the test fail**

`Doors/sprite-editor/package.json`:

```json
{
  "name": "sprite-editor",
  "version": "1.0.0",
  "description": "Sprite studio - browse, preview and (2b) edit door sprite sheets",
  "main": "dist/index.js",
  "bbsCommand": "SPRITED",
  "doorType": "TS",
  "runtime": "server",
  "doorPattern": "runDoor",
  "accessLevel": 255,
  "scripts": {
    "build": "tsc",
    "dev": "tsx --watch index.ts",
    "start": "node dist/index.js",
    "test": "tsx tests/run-tests.ts"
  },
  "author": "AmiExpress BBS",
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../../sdk"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.2.2",
    "tsx": "^4.0.0"
  }
}
```

`Doors/sprite-editor/tsconfig.json` — copy `Doors/ansi-editor/tsconfig.json`
verbatim.

Run: `cd Doors/sprite-editor && SKIP_SDK_PREPARE=1 npm install && npm test`
Expected: FAIL — `../assets` not found.

- [ ] **Step 3: Implement `assets.ts`**

```typescript
/**
 * The studio's window onto every door's assets - guarded.
 *
 * The rule is the door-delete incident's, verbatim: a resolved-path guard,
 * not a trusted string. Every path the UI can reach funnels through
 * resolveAssetPath, which resolves first and compares after, so no
 * combination of dots, slashes or absolute paths escapes
 * Doors/<door>/<kind>/.
 *
 * Server-side fs on purpose: this door is server-side blessed (like the
 * ANSI editor it forks), so it reads the same disk the doors run from.
 * No RPC, no copies, no drift.
 */

import * as fs from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
import { Sprite, parseSprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

/**
 * Doors/, found by walking up from wherever this file runs - which is
 * Doors/sprite-editor under tsx and Doors/sprite-editor/dist in
 * production, the same split the Pengo sprite loading handles.
 */
export const DOORS_ROOT = (() => {
  let dir = __dirname;
  while (basename(dir) !== 'Doors' && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  if (basename(dir) !== 'Doors') {
    throw new Error(`sprite-editor cannot find Doors/ above ${__dirname}`);
  }
  return dir;
})();

/** Resolve one asset path, or throw. The only door to the filesystem. */
export function resolveAssetPath(
  door: string,
  kind: 'sprites' | 'art',
  file: string
): string {
  const base = resolve(DOORS_ROOT, door, kind);
  const target = resolve(base, file);
  // Resolve FIRST, compare AFTER - and the base itself must still be
  // inside Doors/, or a door name of "../web" moves the fence.
  if (!base.startsWith(DOORS_ROOT + sep) || !target.startsWith(base + sep)) {
    throw new Error(`asset path outside ${door}/${kind}: ${file}`);
  }
  return target;
}

/** Door directories that ship at least one sprite sheet, sorted. */
export function listDoorsWithSprites(): string[] {
  return fs.readdirSync(DOORS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => {
      try {
        return fs.readdirSync(join(DOORS_ROOT, name, 'sprites'))
          .some(f => f.endsWith('.sprite.json'));
      } catch {
        return false; // no sprites/ directory - not a sprite door
      }
    })
    .sort();
}

/** Sprite sheet filenames in one door, sorted. */
export function listSprites(door: string): string[] {
  const dir = resolveAssetPath(door, 'sprites', '.');
  return fs.readdirSync(dir).filter(f => f.endsWith('.sprite.json')).sort();
}

/** One sheet, parsed and validated - a bad file throws with its name. */
export function readSprite(door: string, file: string): Sprite {
  const path = resolveAssetPath(door, 'sprites', file);
  return parseSprite(JSON.parse(fs.readFileSync(path, 'utf8')), file);
}
```

Note one subtlety the test pins: `resolveAssetPath(door, 'sprites', '.')`
resolves to the base itself, which fails `startsWith(base + sep)`. Make the
directory case explicit — in `resolveAssetPath`, before the check:

```typescript
  if (target === base) return base; // the directory itself, for listing
```

- [ ] **Step 4: Minimal `index.ts` bootstrap** (the UI arrives in Task 3;
      this keeps the door loadable from day one)

```typescript
/**
 * Sprite Studio - browse and preview every door's sprite sheets.
 *
 * Fork lineage: the ANSI editor door's wrapper (Doors/ansi-editor) is the
 * pattern for hosting a full-screen blessed app in a door; the black-screen
 * fix (34056d29f) landed there first so this fork starts clean. Editing
 * modes are plan 2b; this door ships browsing and live playback.
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { StudioApp } from './app';

const door = new Door({
  name: 'Sprite Studio',
  version: '0.1.0',
  description: 'Browse and preview door sprite sheets',
  author: 'AmiExpress BBS',
});

let app: StudioApp | null = null;

door.onStart(async (ctx: DoorContext) => {
  app = new StudioApp(ctx);
  await app.start();
});

door.onClose(async () => {
  app?.destroy();
  app = null;
});

export default door;
```

And a placeholder `Doors/sprite-editor/app.ts` that Task 3 replaces —
minimal but real, so the door runs end to end from this commit:

```typescript
/** The studio application. Task 3 replaces this shell with the real UI. */
import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export class StudioApp {
  private ctx: DoorContext;
  private screen: any = null;
  private inputManager: any = null;

  constructor(ctx: DoorContext) {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.screen = createScreen((this.ctx as any).bbs, {
      title: 'Sprite Studio',
      responsive: true,
    });
    this.inputManager = new DoorInputManager(this.ctx as any, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
      enableMouse: true,
    });
    this.screen.key(['q', 'escape', 'C-c'], () => {
      this.destroy();
      void this.ctx.close();
    });
    this.screen.render();
  }

  destroy(): void {
    if (this.inputManager) { this.inputManager.disable(); this.inputManager = null; }
    if (this.screen) { this.screen.destroy(); this.screen = null; }
  }
}
```

- [ ] **Step 5: Test, typecheck, commit**

Run: `npm test` (expect all assets tests PASS) and
`npx tsc --noEmit -p tsconfig.json` (clean).

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/sprite-editor/package.json Doors/sprite-editor/tsconfig.json \
  Doors/sprite-editor/assets.ts Doors/sprite-editor/index.ts Doors/sprite-editor/app.ts \
  Doors/sprite-editor/tests/assets.test.ts Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the studio door scaffold and guarded asset access"
```

---

### Task 2: the browser model (pure) and the preview renderer (pure)

**Files:**
- Create: `Doors/sprite-editor/browser-model.ts`
- Create: `Doors/sprite-editor/preview.ts`
- Test: `Doors/sprite-editor/tests/browser-model.test.ts`
- Test: `Doors/sprite-editor/tests/preview.test.ts`
- Modify: `Doors/sprite-editor/tests/run-tests.ts` (register both)

**Interfaces:**
- Consumes: Task 1's `listDoorsWithSprites`, `listSprites`, `readSprite`;
  cell-art's `Sprite`, `frameAt`, `bufferToTags`, `rowToTags`.
- Produces (Task 3 binds these exactly):
  - `interface BrowserState { doors: string[]; doorIndex: number; sprites: string[]; spriteIndex: number; animations: string[]; animationIndex: number; pane: 'doors' | 'sprites' | 'animations' }`
  - `initialState(): BrowserState`
  - `moveSelection(state: BrowserState, delta: number): BrowserState`
  - `cyclePane(state: BrowserState, delta: 1 | -1): BrowserState`
  - `selection(state: BrowserState): { door: string | null; sprite: string | null; animation: string | null }`
  - `previewLines(sprite: Sprite, animation: string, tick: number, scale: 1 | 2): string[]`
    — blessed-tag lines of the current frame; scale 2 doubles every cell
    horizontally (fat pixels)

- [ ] **Step 1: Write the failing tests**

`Doors/sprite-editor/tests/browser-model.test.ts`:

```typescript
/**
 * The browser's selection state, pure.
 *
 * The UI binds keys to these functions and paints from the result. Every
 * transition is assertable here, so the door's tests do not need a
 * terminal - the lesson every arcade door's suite already applies.
 */

import assert from 'assert';
import {
  initialState, moveSelection, cyclePane, selection,
} from '../browser-model';

export async function theRealDoorsPopulateTheFirstPane(): Promise<void> {
  const s = initialState();
  assert.ok(s.doors.includes('pengo'));
  assert.strictEqual(s.pane, 'doors');
  // A door is selected from the start, and its dependent panes are filled.
  assert.ok(s.sprites.length > 0, 'the selected door has its sprites listed');
  assert.ok(s.animations.length > 0, 'and the selected sprite its animations');
}

export async function movingClampsAndRefillsDependentPanes(): Promise<void> {
  let s = initialState();
  s = moveSelection(s, -1);
  assert.strictEqual(s.doorIndex, 0, 'no wrap above the top');
  const before = selection(s);
  s = moveSelection(s, s.doors.length + 50);
  assert.strictEqual(s.doorIndex, s.doors.length - 1, 'clamped at the end');
  const after = selection(s);
  if (before.door !== after.door) {
    assert.ok(s.spriteIndex === 0 && s.animationIndex === 0,
      'a new door resets the dependent selections');
  }
}

export async function panesCycleBothWays(): Promise<void> {
  let s = initialState();
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'sprites');
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'animations');
  s = cyclePane(s, 1);
  assert.strictEqual(s.pane, 'doors', 'wraps forward');
  s = cyclePane(s, -1);
  assert.strictEqual(s.pane, 'animations', 'wraps backward');
}

export async function selectionNamesWhatTheUiShouldLoad(): Promise<void> {
  const s = initialState();
  const sel = selection(s);
  assert.strictEqual(sel.door, s.doors[0]);
  assert.ok(sel.sprite && sel.sprite.endsWith('.sprite.json'));
  assert.ok(sel.animation && sel.animation.length > 0);
}
```

`Doors/sprite-editor/tests/preview.test.ts`:

```typescript
/**
 * The preview renderer, pure in (sprite, animation, tick, scale).
 *
 * The playback timer just advances the tick; whether the picture MOVES is
 * assertable right here, with Pengo's real shipped sprites as the fixture
 * - so a sprite edit that breaks playback fails this suite, not the eye.
 */

import assert from 'assert';
import { readSprite } from '../assets';
import { previewLines } from '../preview';

export async function thePreviewIsTheFrameAtTheTick(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const lines = previewLines(pengo, 'walk-right', 0, 1);
  assert.strictEqual(lines.length, pengo.cellH);
  assert.ok(lines[0].includes('-fg}'), 'tagged output, ready for a blessed box');
}

export async function playbackMovesBetweenTicks(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const t0 = previewLines(pengo, 'walk-right', 0, 1).join('\n');
  const t3 = previewLines(pengo, 'walk-right', 3, 1).join('\n');
  assert.notStrictEqual(t0, t3, 'the walk cycle must move in the preview');
}

export async function scaleTwoDoublesEveryCell(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const thin = previewLines(pengo, 'walk-right', 0, 1);
  const fat = previewLines(pengo, 'walk-right', 0, 2);
  const visible = (line: string) => line.replace(/\{[^}]*\}/g, '').length;
  assert.strictEqual(visible(fat[0]), visible(thin[0]) * 2);
}

export async function anUnknownAnimationThrowsLikeTheEngineDoes(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  assert.throws(() => previewLines(pengo, 'moonwalk', 0, 1), /moonwalk/);
}
```

- [ ] **Step 2: Run to verify both fail** (modules not found), after
      registering `'./browser-model.test'` and `'./preview.test'` in
      `TEST_MODULES`.

- [ ] **Step 3: Implement `browser-model.ts`**

```typescript
/**
 * The browser's selection state. Pure: the UI binds keys to these and
 * paints from the result; every transition lives in the test suite.
 */

import { listDoorsWithSprites, listSprites, readSprite } from './assets';

export interface BrowserState {
  doors: string[];
  doorIndex: number;
  sprites: string[];
  spriteIndex: number;
  animations: string[];
  animationIndex: number;
  pane: 'doors' | 'sprites' | 'animations';
}

const PANES: BrowserState['pane'][] = ['doors', 'sprites', 'animations'];

function clamp(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/** The dependent panes, refilled for the current door/sprite selection. */
function refill(state: BrowserState): BrowserState {
  const door = state.doors[state.doorIndex] ?? null;
  const sprites = door ? listSprites(door) : [];
  const spriteIndex = clamp(state.spriteIndex, sprites.length);
  const file = sprites[spriteIndex] ?? null;
  let animations: string[] = [];
  if (door && file) {
    try {
      animations = Object.keys(readSprite(door, file).animations).sort();
    } catch {
      animations = []; // a malformed sheet lists empty rather than crashing
    }
  }
  return {
    ...state,
    sprites,
    spriteIndex,
    animations,
    animationIndex: clamp(state.animationIndex, animations.length),
  };
}

export function initialState(): BrowserState {
  return refill({
    doors: listDoorsWithSprites(),
    doorIndex: 0,
    sprites: [],
    spriteIndex: 0,
    animations: [],
    animationIndex: 0,
    pane: 'doors',
  });
}

/** Move within the focused pane; clamped, and dependents reset + refill. */
export function moveSelection(state: BrowserState, delta: number): BrowserState {
  if (state.pane === 'doors') {
    const doorIndex = clamp(state.doorIndex + delta, state.doors.length);
    if (doorIndex === state.doorIndex) return state;
    return refill({ ...state, doorIndex, spriteIndex: 0, animationIndex: 0 });
  }
  if (state.pane === 'sprites') {
    const spriteIndex = clamp(state.spriteIndex + delta, state.sprites.length);
    if (spriteIndex === state.spriteIndex) return state;
    return refill({ ...state, spriteIndex, animationIndex: 0 });
  }
  return {
    ...state,
    animationIndex: clamp(state.animationIndex + delta, state.animations.length),
  };
}

/** Tab / Shift-Tab between panes, wrapping both ways. */
export function cyclePane(state: BrowserState, delta: 1 | -1): BrowserState {
  const at = PANES.indexOf(state.pane);
  return { ...state, pane: PANES[(at + delta + PANES.length) % PANES.length] };
}

/** What the UI should be showing for this state. */
export function selection(state: BrowserState): {
  door: string | null; sprite: string | null; animation: string | null;
} {
  return {
    door: state.doors[state.doorIndex] ?? null,
    sprite: state.sprites[state.spriteIndex] ?? null,
    animation: state.animations[state.animationIndex] ?? null,
  };
}
```

- [ ] **Step 4: Implement `preview.ts`**

```typescript
/**
 * The live preview: one frame of one animation as blessed-tag lines.
 *
 * Pure in (sprite, animation, tick, scale). The playback loop upstairs
 * only advances the tick; everything visible is decided - and tested -
 * here. Scale 2 doubles each cell horizontally: half-block art reads as
 * fat pixels, the way a sprite editor should show it.
 */

import {
  Sprite, frameAt, rowToTags, Cell, CellRow,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

export function previewLines(
  sprite: Sprite,
  animation: string,
  tick: number,
  scale: 1 | 2
): string[] {
  const anim = sprite.animations[animation];
  if (!anim) {
    throw new Error(
      `sprite ${sprite.name} has no animation '${animation}' ` +
      `(has: ${Object.keys(sprite.animations).join(', ')})`
    );
  }
  const frame = frameAt(anim, tick);
  return frame.map(row => {
    const out: CellRow = [];
    for (const cell of row) {
      out.push(cell ? { ...(cell as Cell) } : null);
      if (scale === 2) out.push(cell ? { ...(cell as Cell) } : null);
    }
    return rowToTags(out);
  });
}
```

- [ ] **Step 5: Run tests (PASS), typecheck, commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/sprite-editor/browser-model.ts Doors/sprite-editor/preview.ts \
  Doors/sprite-editor/tests/browser-model.test.ts Doors/sprite-editor/tests/preview.test.ts \
  Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the pure browser model and preview renderer"
```

---

### Task 3: the studio UI

**Files:**
- Modify: `Doors/sprite-editor/app.ts` (replace the Task 1 shell entirely)
- Test: `Doors/sprite-editor/tests/app-shape.test.ts` (register it)

**Interfaces:**
- Consumes: everything Tasks 1-2 produced, by the exact names above.
- Produces: the running door. No later task consumes app internals.

- [ ] **Step 1: Write the failing test**

`Doors/sprite-editor/tests/app-shape.test.ts`:

```typescript
/**
 * The app binds the pure model - it does not reimplement it.
 *
 * A source-shape check, deliberately: the UI cannot run without a
 * terminal, but the two faults worth guarding are (1) the app growing its
 * own selection logic beside the tested model, and (2) the playback timer
 * surviving destroy() - the leak class that made LiveChat's video flip
 * between two modes. Both are visible in the source.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = readFileSync(join(__dirname, '..', 'app.ts'), 'utf8');

export async function theAppUsesTheTestedModel(): Promise<void> {
  for (const name of ['initialState', 'moveSelection', 'cyclePane', 'selection']) {
    assert.ok(app.includes(name), `app.ts should call ${name} from browser-model`);
  }
  assert.ok(app.includes('previewLines'), 'and render through previewLines');
}

export async function destroyStopsThePlaybackTimer(): Promise<void> {
  assert.ok(/clearInterval\(this\.playback/.test(app),
    'destroy() must clear the playback interval - a door is unloaded by ' +
    'removing its script, which stops nothing it started');
}

export async function theLayoutIsPercentageBased(): Promise<void> {
  // Responsive like livechat: the panes flex with the terminal, so a
  // resize event re-flows rather than clipping.
  const percents = (app.match(/width: '\d+%'/g) || []).length +
                   (app.match(/height: '\d+%'/g) || []).length;
  assert.ok(percents >= 3, `expected percentage-sized panes, found ${percents}`);
}
```

- [ ] **Step 2: Run it to verify it fails**, then replace `app.ts`:

```typescript
/**
 * Sprite Studio - the browser + preview UI.
 *
 * Layout (percentage-based, reflowing on the backend's screen:resize the
 * way livechat does):
 *
 *   +----------------+----------------+--------------------------------+
 *   | DOORS 25%      | SPRITES 25%    | PREVIEW (rest)                 |
 *   |                +----------------+  the selected animation,       |
 *   |                | ANIMATIONS     |  playing at its own speed,     |
 *   |                |                |  fat pixels (scale 2)          |
 *   +----------------+----------------+--------------------------------+
 *   | status: door/sprite/animation | TAB panes  ARROWS move  Q quit   |
 *   +-------------------------------------------------------------------+
 *
 * All selection logic lives in browser-model (tested); all pixels live in
 * preview (tested). This file is glue and stays that way.
 */

import type { DoorContext } from '@amiexpress/bbs-door-sdk/core/types';
import { createScreen, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  BrowserState, initialState, moveSelection, cyclePane, selection,
} from './browser-model';
import { previewLines } from './preview';
import { readSprite } from './assets';
import type { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

/** Preview frame advance, in ms - matches the arcade doors' tick feel. */
const PLAYBACK_MS = 100;

export class StudioApp {
  private ctx: DoorContext;
  private screen: any = null;
  private inputManager: any = null;
  private state: BrowserState = null as any;

  private doorsList: any = null;
  private spritesList: any = null;
  private animationsList: any = null;
  private previewBox: any = null;
  private statusBar: any = null;

  private playback: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  /** The loaded sheet for the current selection, cached per selection. */
  private loaded: { key: string; sprite: Sprite } | null = null;

  constructor(ctx: DoorContext) {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    this.screen = createScreen((this.ctx as any).bbs, {
      title: 'Sprite Studio',
      responsive: true,
    });
    this.screen.program.write('\x1b[2J');
    this.screen.program.write('\x1b[H');
    this.inputManager = new DoorInputManager(this.ctx as any, this.screen, {
      enableGameMode: false,
      enableGrabKeys: false,
      enableMouse: true,
    });

    this.state = initialState();
    this.buildLayout();
    this.bindKeys();
    this.refresh();

    // The playback loop only advances the tick; previewLines owns what a
    // tick looks like, and the tests own previewLines.
    this.playback = setInterval(() => {
      this.tick++;
      this.paintPreview();
    }, PLAYBACK_MS);
  }

  private buildLayout(): void {
    this.doorsList = blessed.list({
      parent: this.screen,
      top: 0, left: 0, width: '25%', height: '90%',
      label: ' Doors ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.spritesList = blessed.list({
      parent: this.screen,
      top: 0, left: '25%', width: '25%', height: '45%',
      label: ' Sprites ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.animationsList = blessed.list({
      parent: this.screen,
      top: '45%', left: '25%', width: '25%', height: '45%',
      label: ' Animations ',
      border: { type: 'line' },
      tags: true, keys: false, mouse: false,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'lightyellow', bold: true },
        item: { fg: 'white' },
      },
    });
    this.previewBox = blessed.box({
      parent: this.screen,
      top: 0, left: '50%', width: '50%', height: '90%',
      label: ' Preview ',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'green' } },
    });
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
    });
  }

  private bindKeys(): void {
    // The screen drives everything; the widgets' own keys stay off, the
    // way every arcade door learned to (a widget's keys:true never fires
    // when input is routed by the door).
    this.screen.key(['up', 'k'], () => this.apply(moveSelection(this.state, -1)));
    this.screen.key(['down', 'j'], () => this.apply(moveSelection(this.state, 1)));
    this.screen.key(['pageup'], () => this.apply(moveSelection(this.state, -10)));
    this.screen.key(['pagedown'], () => this.apply(moveSelection(this.state, 10)));
    this.screen.key(['tab', 'right'], () => this.apply(cyclePane(this.state, 1)));
    this.screen.key(['S-tab', 'left'], () => this.apply(cyclePane(this.state, -1)));
    this.screen.key(['q', 'escape', 'C-c'], () => {
      this.destroy();
      void this.ctx.close();
    });
  }

  private apply(next: BrowserState): void {
    if (next === this.state) return;
    this.state = next;
    this.tick = 0; // a new selection starts its animation from the top
    this.refresh();
  }

  /** The current sheet, loaded once per (door, sprite) selection. */
  private currentSprite(): Sprite | null {
    const sel = selection(this.state);
    if (!sel.door || !sel.sprite) return null;
    const key = `${sel.door}/${sel.sprite}`;
    if (this.loaded?.key !== key) {
      try {
        this.loaded = { key, sprite: readSprite(sel.door, sel.sprite) };
      } catch {
        this.loaded = null; // a malformed sheet previews as empty
      }
    }
    return this.loaded?.sprite ?? null;
  }

  private refresh(): void {
    const focus = (list: any, on: boolean) => {
      list.style.border.fg = on ? 'lightyellow' : 'cyan';
    };
    this.doorsList.setItems(this.state.doors);
    this.doorsList.select(this.state.doorIndex);
    this.spritesList.setItems(this.state.sprites);
    this.spritesList.select(this.state.spriteIndex);
    this.animationsList.setItems(this.state.animations);
    this.animationsList.select(this.state.animationIndex);
    focus(this.doorsList, this.state.pane === 'doors');
    focus(this.spritesList, this.state.pane === 'sprites');
    focus(this.animationsList, this.state.pane === 'animations');

    const sel = selection(this.state);
    this.statusBar.setContent(
      `{lightyellow-fg}${sel.door ?? '-'}{/} / ` +
      `{white-fg}${sel.sprite ?? '-'}{/} / ` +
      `{lightcyan-fg}${sel.animation ?? '-'}{/}` +
      '{|}{gray-fg}TAB panes  ARROWS move  Q quit{/}'
    );
    this.paintPreview();
  }

  private paintPreview(): void {
    const sel = selection(this.state);
    const sprite = this.currentSprite();
    if (!sprite || !sel.animation) {
      this.previewBox.setContent('{gray-fg}nothing to preview{/}');
      this.screen.render();
      return;
    }
    const anim = sprite.animations[sel.animation];
    const lines = previewLines(sprite, sel.animation, this.tick, 2);
    const inner = Math.max(1, (this.previewBox.width as number) - 2);
    const pad = ' '.repeat(Math.max(0, Math.floor((inner - sprite.cellW * 2) / 2)));
    const meta =
      `{gray-fg}${sprite.name} · ${sel.animation} · ` +
      `${anim.frames.length} frame(s) · ${anim.ticksPerFrame} tpf · ` +
      `${anim.loop ? 'loop' : 'hold'}{/}`;
    this.previewBox.setContent(
      '\n' + lines.map(l => pad + l).join('\n') + '\n\n ' + meta
    );
    this.screen.render();
  }

  destroy(): void {
    if (this.playback) {
      clearInterval(this.playback);
      this.playback = null;
    }
    if (this.inputManager) { this.inputManager.disable(); this.inputManager = null; }
    if (this.screen) {
      this.screen.removeAllListeners();
      this.screen.destroy();
      this.screen = null;
    }
  }
}
```

- [ ] **Step 3: Tests + typecheck** — `npm test` all green,
      `npx tsc --noEmit` clean.

- [ ] **Step 4: RED check** — comment out the `clearInterval` line in
      `destroy()`, expect `destroyStopsThePlaybackTimer` to FAIL; restore,
      green again. Record the evidence in your report.

- [ ] **Step 5: Commit**

```bash
cd /Users/spot/Code/amiexpress-web
git add Doors/sprite-editor/app.ts Doors/sprite-editor/tests/app-shape.test.ts \
  Doors/sprite-editor/tests/run-tests.ts
git commit -m "feat(sprite-editor): the three-pane browser with live fat-pixel playback"
```

---

### Task 4: full sweep + wrap

**Files:** none new.

- [ ] **Step 1:** `cd Doors/sprite-editor && npm run build` — clean; the
      pre-commit hook already staged dist with Task 3's commit, confirm
      `git status --porcelain Doors/sprite-editor` is clean (or commit any
      dist remainder as `chore(sprite-editor): dist`).
- [ ] **Step 2:** `npm test` full suite green; report totals.
- [ ] **Step 3 (controller, not you):** backend restart; `Registered
      door: SPRITED` in the log.
- [ ] **Step 4 (the user's checklist — do not check these yourself):**
  - [ ] SPRITED opens for a sysop account (accessLevel 255 gates it)
  - [ ] pengo appears in Doors; its six sprites list; animations list
  - [ ] the preview plays — the walk cycle visibly waddles, at fat-pixel scale
  - [ ] TAB cycles panes, arrows move, selections cascade
  - [ ] resizing the browser window reflows the panes (responsive path)
  - [ ] Q exits cleanly back to the BBS

## Self-review (at writing time)

- Spec phase-3 first half covered: fork-base bug fixed (34056d29f, before
  this plan), responsive shell, browse `Doors/*/sprites`, playback preview.
  Deliberately NOT here (plan 2b): editing, frame ops, pixel painting,
  saving, art mode, the ansi-editor engine itself. The door ships useful
  without them.
- Types line up: `BrowserState`/`selection` names match between Task 2
  definitions and Task 3 use; `previewLines(sprite, animation, tick, scale)`
  arity consistent; `readSprite(door, file)` consistent with Task 1.
- `moveSelection` name collides with the arcade menu's export only in
  prose — different modules, no shared import site.
- Playback timer leak is guarded by test; the `.` listing subtlety in
  `resolveAssetPath` is stated with its fix inline.
