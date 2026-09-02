# C64 / 40-Column Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BBS core flow, tables, screens, and the adaptable doors genuinely usable on a 40x25 C64/PETSCII screen, and provably gate every door that is not.

**Architecture:** A default-closed `MIN_COLUMNS` door gate lands first (every door gates at 80 unless explicitly marked 40-ok), then an 80-column render-regression baseline for the blessed SDK, then the layout work: an XXS=40 breakpoint tier + geometry-driven Screen sizing in the SDK, a session-width word-wrap choke point in the backend emit path, 40-column variants of the columnar tables, and compact adaptation of the doors that can honestly fit. Text screens reflow for PETSCII sessions; ANSI art never does.

**Tech Stack:** TypeScript. Backend jest (`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .`, swc transform, tests in `web/backend/tests/`). SDK jest (`cd sdk && npm test`, ts-jest, tests in `sdk/test/` + `sdk/tests/`). Blessed UI engine in `sdk/engines/ui/blessed/`. Session geometry already shipped: `session.screenWidth/screenHeight/petsciiMode/terminalType` (PETSCII overhaul plan, 2026-09-01).

**Spec:** `thoughts/shared/plans/2026-09-02-c64-40col-adaptation.md` (strategy + final user decisions; Phase 4 REVISED to blanket-gate all 68K doors) + `thoughts/shared/research/2026-09-02_40col-inventory.md` (file:line inventory). Read both before starting.

## Global Constraints

- **THE TWO NON-NEGOTIABLES (sysop, 2026-09-02):**
  - (a) **Gating must be provably correct for C64 sessions.** A session with `petsciiMode` or `terminalType === 'c64'` can NEVER enter a door whose effective MIN_COLUMNS is 80; it sees the uppercase notice `THIS DOOR NEEDS AN 80 COLUMN SCREEN`; and an 80-column session's door access is byte-for-byte unchanged. All four properties are asserted by tests through the real `executeDoor` entry point, not by source-grep pins.
  - (b) **ZERO existing-door breakage.** Enabling responsive/XXS in the blessed SDK must render byte-identically at 80 columns for every existing door. This is proven by the 80-column render regression baseline (Task 2) landing BEFORE any SDK layout change, and that baseline staying green through every later task. Never asserted, always tested.
- Type-check after every task: `cd web/backend && npx tsc --noEmit`; when `sdk/` was touched: `cd sdk && npm run build`; when `packages/terminal` was touched: `cd packages/terminal && npm run build`.
- Backend tests: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .` (CI glob: `roots: src+tests`, `testMatch: **/?(*.)+(spec|test).ts` — every new backend test below lands inside `web/backend/tests/`, so it IS in the glob). SDK tests: `cd sdk && npm test` (glob: `sdk/test/**/*.test.ts` + `sdk/tests/**/*.test.ts`).
- Every behavior change ships a regression test, RED then GREEN: write the failing test first, run it, see it fail, implement, run to green. Before committing, temporarily revert the implementation and confirm the test fails (then restore).
- **Shared working tree — 3 Claude sessions run here.** Check `thoughts/BOARD.md` claims before touching `sdk/` or `web/backend/src/handlers/`. Commit files BY NAME only (never `git add -A`/`.`). Run `git diff --cached --stat` before EVERY commit and verify only your files are staged (the shared index has carried other sessions' staged files into commits before). NEVER `git stash` in this repo (CRLF phantom files block `stash pop` permanently). One pusher at a time; commit locally, do not push until the user says "deploy".
- After editing `sdk/` or any `Doors/*.ts`: run the door-sdk-freshness protocol (`.claude/skills/door-sdk-freshness/SKILL.md`) before any "test it" claim. TS door `dist/` must be rebuilt and committed with the source.
- Never use Edit/Write on `.seq` files, binary door `.info` files, or any high-bit file (UTF-8 round-trip destroys bytes). Tooltype changes go through `info-file.util.ts` (`applyTooltypes`/`TooltypeEditor`); test fixtures build buffers with `Buffer.from([...])`.
- No emojis anywhere. BBS-visible output uses ASCII tokens (`[OK]`, `[40]`, `[80-COLUMN ANSI SCREEN - SKIPPED]`). UI labels are full English words.
- express.e is the parity source of truth — where a surface has an express.e port comment, the 40-column variant changes layout only, never semantics, and the 80-column output stays byte-identical.

## Explicitly OUT of scope (per recorded decisions, 2026-09-02)

- The ANSI->PETSCII door bridge (`AnsiToPetsciiStream` for blessed doors on real C64s) — its own later effort (decision 4).
- Per-door adaptation of 68K binaries — blanket-gated (revised Phase 4 ruling). No dropfile 40-col plumbing, no XIM output translation.
- `.seq` art authoring — the sysop makes/commissions the native 40x25 screens (decision 2). Code only guarantees the already-shipped `.seq`-first resolution.
- C64 cursor-key/F-key door input translation — lands with the bridge phase (decision 5).
- Rewrite-track door ports (68K doors rewritten as TS) — each is its own plan.
- Squeezing 80-col ANSI art to 40 (always wrong); C128 80-col mode.
- Operator-chat page UI at 40 columns: it is a cursor-positioned full-screen UI (`operator-chat.handler.ts:788-794` writes `\x1b[23;1H` rows); the wrap choke deliberately passes positioned payloads through, and re-laying out that UI is bridge-phase work. Its `wordWrapMessage(message, 79, 79)` call stays.

---

### Task 1: MIN_COLUMNS door gating — default-closed, provable, blanket

The gate lands FIRST (sysop's order). Every door type routes through `executeDoor(socket, session, door)` (`web/backend/src/handlers/door.handler.ts:1616`) — 68K, AREXX, TS, MCI, script, python, web — so one gate before the type switch covers the blanket 68K ruling AND full-screen AREXX AND not-yet-adapted blessed doors in a single provable place.

Both registries already deliver the raw tooltype map to the launch site, so the gate needs NO disk reads:
- BBSCMD doors: `loadCommandFromInfo` (`utils/amiga-command-parser.util.ts:643-781`) keeps every tooltype in `CommandDefinition.toolTypes`, and `initializeDoors` (`door.handler.ts:4111-4146`) passes `toolTypes` onto the `Door` object.
- 68K installed doors: `amigaDoorManager.parseInfoFile` (`doors/amigaDoorManager.ts:245`) keeps `DoorInfo.toolTypes`, and `displayDoorMenu` (`door.handler.ts:1152-1166`) attaches the whole record as `doorInfo` on the list entry it hands to `executeDoor`.

**The safe tooltype encoding (decision + justification).** The strategy plan's original text said "absent = 40-ok". That is the tooltype-default-true trap in numeric form: zero existing doors carry `MIN_COLUMNS`, so a permissive absent-default would instantly expose all 55 needs-80 doors (garbled blessed UIs, 80-col 68K CON: output, arcade canvases) to C64 callers — violating non-negotiable (a) on day one. The revised Phase 4 ruling already abandons permissive-absent for 68K; this plan extends the same logic to every door type: **absent = MIN_COLUMNS 80 (closed). A door becomes 40-ok only by carrying an explicit `MIN_COLUMNS=40` tooltype in its `Commands/BBSCmd/<CMD>.info` (or installed-door `.info`) — Task 6 marks each door as it is actually adapted and verified.** The stored tooltype is numeric, so there is no boolean-absent ambiguity: absent means "unclassified", and unclassified is unsafe at 40. Task 1 therefore requires ZERO edits to the 55 binary `.info` files, and a sysop opts a 68K door in with one tooltype + `reloadDoors`.

**Files:**
- Create: `web/backend/src/utils/door-min-columns.util.ts`
- Modify: `web/backend/src/handlers/door.handler.ts` (gate in `executeDoor`, lines 1616-1631; marker in `formatDoorLine`, lines 1294-1329)
- Modify: `web/backend/src/doors/amigaDoorManager.ts` (`DoorInfo.minColumns` field at :73, parse at :309)
- Test: `web/backend/tests/doors/door-min-columns.test.ts`, `web/backend/tests/doors/door-min-columns-gate.test.ts`

**Interfaces:**
- Produces: `resolveDoorMinColumns(door: MinColumnsDoorShape): number` — explicit `minColumns` field, else `toolTypes.MIN_COLUMNS`, else `doorInfo.minColumns` / `doorInfo.toolTypes.MIN_COLUMNS`, else 80.
- Produces: `sessionColumns(session: { screenWidth?: number; petsciiMode?: boolean }): number` — `session.screenWidth ?? (session.petsciiMode ? 40 : 80)`. (Tasks 4-5 consume this too.)
- Produces: `DOOR_NEEDS_80_NOTICE = '\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n'` (uppercase-only ASCII — legible on a power-on C64 in up/gfx charset, same rule as `ANSI_GRAPHICS_PROMPT`, `services/login-connect.service.ts:57-74`).
- Consumes: `emitText` (`utils/ansi-buffer.util.ts:194`), `LoggedOnSubState`.

- [ ] **Step 1: Write the failing resolver tests**

Create `web/backend/tests/doors/door-min-columns.test.ts`:

```ts
import {
  resolveDoorMinColumns,
  sessionColumns,
  DOOR_NEEDS_80_NOTICE,
} from '../../src/utils/door-min-columns.util';

describe('resolveDoorMinColumns', () => {
  it('defaults to 80 when no MIN_COLUMNS exists anywhere (default-closed)', () => {
    expect(resolveDoorMinColumns({ command: 'NOSUCH', id: 'nosuch' })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { ACCESS: '10' } })).toBe(80);
  });

  it('honors an explicit minColumns field from the registry', () => {
    expect(resolveDoorMinColumns({ command: 'X', minColumns: 40 })).toBe(40);
  });

  it('reads MIN_COLUMNS from the BBSCMD tooltype map (initializeDoors pass-through)', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '40' } })).toBe(40);
  });

  it('reads MIN_COLUMNS from an installed 68K door record (displayDoorMenu doorInfo)', () => {
    expect(resolveDoorMinColumns({ command: 'X', doorInfo: { minColumns: 40 } })).toBe(40);
    expect(resolveDoorMinColumns({ command: 'X', doorInfo: { toolTypes: { MIN_COLUMNS: '40' } } })).toBe(40);
  });

  it('a door can demand MORE than 80', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '132' } })).toBe(132);
  });

  it('garbage MIN_COLUMNS values fall back to 80, never NaN', () => {
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: 'lots' } })).toBe(80);
    expect(resolveDoorMinColumns({ command: 'X', toolTypes: { MIN_COLUMNS: '-5' } })).toBe(80);
  });
});

describe('sessionColumns', () => {
  it('reads screenWidth when set', () => {
    expect(sessionColumns({ screenWidth: 40 })).toBe(40);
    expect(sessionColumns({ screenWidth: 80 })).toBe(80);
  });
  it('petsciiMode with no width recorded is 40, never 80', () => {
    expect(sessionColumns({ petsciiMode: true })).toBe(40);
  });
  it('a bare session is 80 (legacy behavior unchanged)', () => {
    expect(sessionColumns({})).toBe(80);
  });
});

describe('DOOR_NEEDS_80_NOTICE', () => {
  it('is uppercase-only ASCII with CRLF framing (C64-legible)', () => {
    expect(DOOR_NEEDS_80_NOTICE).toBe('\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n');
    expect(/^[\r\n A-Z0-9]+$/.test(DOOR_NEEDS_80_NOTICE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern=door-min-columns`
Expected: module `../../src/utils/door-min-columns.util` not found — every test fails.

- [ ] **Step 3: Implement the resolver util**

Create `web/backend/src/utils/door-min-columns.util.ts`:

```ts
/**
 * MIN_COLUMNS door gating (C64/40-col plan, Task 1).
 *
 * DEFAULT-CLOSED: a door with no MIN_COLUMNS tooltype anywhere gates at 80.
 * Rationale (recorded in the plan): zero existing doors carry the tooltype,
 * so a permissive absent-default would expose every needs-80 door (garbled
 * blessed UIs, 68K CON: output, arcade canvases) to 40-column callers on
 * day one. A door is 40-ok only when explicitly marked MIN_COLUMNS=40 -
 * which Task 6 does per door, as each is adapted and verified. This is the
 * numeric cousin of the "tooltype booleans cannot default to true" rule:
 * absent means unclassified, and unclassified is unsafe at 40.
 *
 * Both registries already deliver the tooltype map in memory
 * (CommandDefinition.toolTypes -> Door.toolTypes via initializeDoors;
 * DoorInfo.toolTypes via displayDoorMenu's doorInfo), so resolution is
 * pure - no disk reads at launch time. A sysop opt-in is one tooltype in
 * Commands/BBSCmd/<CMD>.info plus reloadDoors.
 */

/** Uppercase-only ASCII: legible on a power-on C64 in up/gfx charset
 *  (same rule as ANSI_GRAPHICS_PROMPT, login-connect.service.ts:57). */
export const DOOR_NEEDS_80_NOTICE = '\r\nTHIS DOOR NEEDS AN 80 COLUMN SCREEN\r\n';

export const DEFAULT_MIN_COLUMNS = 80;

export interface MinColumnsDoorShape {
  command?: string;
  id?: string;
  minColumns?: number;
  toolTypes?: Record<string, string>;
  doorInfo?: {
    minColumns?: number;
    toolTypes?: Record<string, string>;
  };
}

function validColumns(n: unknown): number | null {
  if (n === undefined || n === null) return null;
  const parsed = typeof n === 'number' ? n : parseInt(String(n), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveDoorMinColumns(door: MinColumnsDoorShape): number {
  return (
    validColumns(door.minColumns) ??
    validColumns(door.toolTypes?.['MIN_COLUMNS']) ??
    validColumns(door.doorInfo?.minColumns) ??
    validColumns(door.doorInfo?.toolTypes?.['MIN_COLUMNS']) ??
    DEFAULT_MIN_COLUMNS
  );
}

export function sessionColumns(session: { screenWidth?: number; petsciiMode?: boolean }): number {
  return session.screenWidth ?? (session.petsciiMode ? 40 : 80);
}
```

- [ ] **Step 4: Run resolver tests to green** (same command as Step 2). Then `cd web/backend && npx tsc --noEmit`.

- [ ] **Step 5: Write the failing executeDoor gate tests**

Create `web/backend/tests/doors/door-min-columns-gate.test.ts` — same mocking pattern as `tests/doors/door-launch-token-wiring.test.ts`, which already pays the door.handler import-graph cost and proves the pattern works:

```ts
/**
 * Non-negotiable (a), sysop 2026-09-02: a petsciiMode/terminalType='c64'
 * session can NEVER enter a MIN_COLUMNS=80 door; it sees the uppercase
 * notice; an 80-col session's door access is byte-for-byte unchanged.
 * Exercised through the REAL executeDoor entry point (not a source pin).
 * createAllDropFiles is called immediately before the door-type switch,
 * so its mock is the "launch actually proceeded" sentinel.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

import { executeDoor, setHelpers } from '../../src/handlers/door.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { DOOR_NEEDS_80_NOTICE } from '../../src/utils/door-min-columns.util';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import type { Door } from '../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'min-col-gate-'));
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: 'gate-test-socket',
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

// Unrouted type: executeDoor's switch falls to its default branch (logs
// "Unknown door type" and returns) - deliberately avoiding any real door
// runtime, exactly like door-launch-token-wiring.test.ts does.
const UNROUTED = 'unrouted-gate-test-type' as unknown as Door['type'];

function testDoor(overrides: Partial<Door & { minColumns: number; toolTypes: Record<string, string> }> = {}): Door {
  return {
    id: 'gatetest', name: 'GateTest', description: 'gate test door',
    command: 'GATETEST', path: 'Doors/GateTest', accessLevel: 0,
    enabled: true, type: UNROUTED, ...overrides,
  } as Door;
}

function c64Session(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: 'u1', username: 'C64USER', secLevel: 10 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, tempData: {},
  };
}

function eightyColSession(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: 'u2', username: 'ANSIUSER', secLevel: 10 },
    nodeId: 1, terminalType: 'modern', petsciiMode: false,
    screenWidth: 80, screenHeight: 24, tempData: {},
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

describe('executeDoor MIN_COLUMNS gate', () => {
  it('blocks a c64 session from an unmarked (default-80) door and shows the notice', async () => {
    const socket = makeSocket();
    const session = c64Session();
    await executeDoor(socket as any, session, testDoor());
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('blocks a web-P session (petsciiMode, terminalType modern) the same way', async () => {
    const socket = makeSocket();
    const session = { ...eightyColSession(), petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    await executeDoor(socket as any, session, testDoor());
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('80-col session: launch proceeds and output carries no gate bytes (byte-for-byte unchanged)', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, eightyColSession(), testDoor());
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
    expect(allOutput(socket)).not.toContain(DOOR_NEEDS_80_NOTICE);
  });

  it('MIN_COLUMNS=40 tooltype opts a door in: c64 session launches it', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), testDoor({ toolTypes: { MIN_COLUMNS: '40' } }));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('installed-68K doorInfo.minColumns opts in the same way', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), testDoor({ doorInfo: { minColumns: 40 } } as any));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run, verify FAIL** (`--testPathPattern=door-min-columns-gate`). Expected: the c64/web-P tests fail — no notice emitted, `createAllDropFiles` WAS called (no gate exists yet).

- [ ] **Step 7: Implement the gate in executeDoor**

In `web/backend/src/handlers/door.handler.ts`, add to the imports:

```ts
import { resolveDoorMinColumns, sessionColumns, DOOR_NEEDS_80_NOTICE } from '../utils/door-min-columns.util';
```

Then in `executeDoor` (line 1616), between `session.currentDoorName = door.command || door.id;` (line 1622) and `const nodeId = session.nodeId || 0;` (line 1624), insert:

```ts
  // MIN_COLUMNS gate (C64/40-col Task 1). Default-closed: every door type
  // (68K, AREXX, TS, MCI, ...) gates at 80 columns unless its registration
  // carries an explicit MIN_COLUMNS the session satisfies. This one check,
  // ahead of token minting and drop files, is the blanket 68K + full-screen
  // AREXX ruling (revised Phase 4, 2026-09-02) in a single provable place.
  if (sessionColumns(session) < resolveDoorMinColumns(door as any)) {
    emitText(socket, DOOR_NEEDS_80_NOTICE, true);
    // Same return shape as launchAmigaDoor's executable-not-found path
    // (door.handler.ts:665-669): back to the menu, no pause.
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }
```

- [ ] **Step 8: Run the gate tests to green**, then the neighbors: `npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern='door-min-columns|door-launch-token'`. All green.

- [ ] **Step 9: RED proof** — temporarily comment out the gate block, re-run `--testPathPattern=door-min-columns-gate`, confirm the c64/web-P tests fail, restore the gate, re-run to green.

- [ ] **Step 10: 68K registry parses MIN_COLUMNS into a first-class field**

In `web/backend/src/doors/amigaDoorManager.ts`, add to `DoorInfo` after `passParameters?: number;` (line 73):

```ts
  minColumns?: number;       // MIN_COLUMNS= tooltype (C64/40-col gate; absent = closed default 80)
```

In `parseInfoFile`, after the `PASS_PARAMETERS` block (lines 309-312):

```ts
      const minColumns = tooltypes.get('MIN_COLUMNS');
      if (minColumns) {
        const parsed = parseInt(minColumns, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          metadata.minColumns = parsed;
        }
      }
```

(The resolver's `doorInfo.toolTypes` fallback already covers this path; the field makes it visible to DOORMAN and future admin UI.) Add to `door-min-columns.test.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('amigaDoorManager MIN_COLUMNS parsing', () => {
  it('parses MIN_COLUMNS from a door .info into DoorInfo.minColumns', () => {
    const { getAmigaDoorManager } = require('../../src/doors/amigaDoorManager');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-mincol-'));
    const infoPath = path.join(root, 'TESTDOOR.info');
    fs.writeFileSync(infoPath, 'LOCATION=Doors:TestDoor/TestDoor\nACCESS=10\nTYPE=XIM\nMIN_COLUMNS=40\n');
    const meta = getAmigaDoorManager().parseInfoFile(infoPath);
    expect(meta?.minColumns).toBe(40);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
```

Run RED (field missing) then GREEN.

- [ ] **Step 11: Door-list marker for 40-ok doors**

`formatDoorLine` (`door.handler.ts:1294-1329`) marks 40-ok doors with an ASCII `[40]` token inside the existing 30-char name column, so the marker never widens a row. Replace line 1310:

```ts
  // Format name (pad to 30 chars)
  const name = padString(door.name, 30);
```

with:

```ts
  // Format name (pad to 30 chars). 40-ok doors carry an ASCII [40] token
  // inside the same column budget - the marker participates in truncation
  // and never widens the row (C64/40-col Task 1).
  const fortyOk = resolveDoorMinColumns(door) <= 40;
  const name = padString(fortyOk ? `${door.name} [40]` : door.name, 30);
```

Export `formatDoorLine` for test (change `function formatDoorLine(` at line 1294 to `export function formatDoorLine(` — pure formatting; matches the repo's `parseTooltypeStringForTest` export-for-test precedent). Add to `door-min-columns-gate.test.ts`:

```ts
import { formatDoorLine } from '../../src/handlers/door.handler';

describe('formatDoorLine 40-ok marker', () => {
  it('marks a MIN_COLUMNS=40 door with [40] and leaves others unmarked', () => {
    const marked = formatDoorLine({ name: 'Theme', command: 'THEME', type: 'TS', toolTypes: { MIN_COLUMNS: '40' } }, false);
    const unmarked = formatDoorLine({ name: 'Chess', command: 'GMASTER', type: 'TS' }, false);
    expect(marked).toContain('[40]');
    expect(unmarked).not.toContain('[40]');
  });
});
```

Run RED then GREEN.

- [ ] **Step 12: Type-check + full backend suite + commit**

```bash
cd web/backend && npx tsc --noEmit
npx jest --config dev-scripts/jest.config.ts --rootDir .
git add src/utils/door-min-columns.util.ts src/handlers/door.handler.ts src/doors/amigaDoorManager.ts tests/doors/door-min-columns.test.ts tests/doors/door-min-columns-gate.test.ts
git diff --cached --stat   # VERIFY: only the five files above are staged
git commit -m "feat(doors): MIN_COLUMNS gate - default-closed 80, C64 notice, 40-ok list marker"
```

---

### Task 2: 80-column render regression baseline for the blessed SDK

Lands BEFORE any SDK layout change (non-negotiable b). Snapshots the painted 80-column screen buffer for representative widget compositions; every later task must keep these snapshots green. Buffer-reading follows the proven pattern in `sdk/tests/unit/modal-centring.test.ts:17-38`. `toMatchSnapshot` is currently unused in sdk/ — the committed `.snap` file becomes the byte-level baseline.

**Files:**
- Create: `sdk/tests/unit/eighty-col-baseline.test.ts` (+ its generated `sdk/tests/unit/__snapshots__/eighty-col-baseline.test.ts.snap`)
- No source changes.

**Interfaces:**
- Consumes: `Screen` (`sdk/engines/ui/blessed/core/screen.ts`), `Box`, `List`, `Panel` widgets, `createScreen` (`sdk/utils/blessed-helpers.ts:913`).
- Produces: the committed snapshot file — the regression oracle for Tasks 3 and 6.

- [ ] **Step 1: Write the baseline test**

Create `sdk/tests/unit/eighty-col-baseline.test.ts`:

```ts
/**
 * 80-column render regression baseline (C64/40-col plan, Task 2).
 *
 * NON-NEGOTIABLE (b), sysop 2026-09-02: enabling responsive/XXS in the
 * blessed SDK must render byte-identically at 80 columns. These snapshots
 * are the proof. They land BEFORE any SDK layout change and must stay
 * green through every later task of the 40-col plan. If one of these
 * snapshots ever needs updating, that IS an 80-column rendering change -
 * stop and take it to the sysop.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { List } from '../../engines/ui/blessed/widgets/list';
import { Panel } from '../../engines/ui/blessed/widgets/panel';
import { createScreen } from '../../utils/blessed-helpers';

/** Every painted row of the screen, as plain strings (modal-centring pattern). */
function rows(screen: any): string[] {
  const out: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    const row = screen.buffer[y];
    out.push(row ? row.map((c: [number, string]) => c[1]).join('') : '');
  }
  return out;
}

describe('80-column baseline: default Screen geometry', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('a bare Screen is exactly 80x24', () => {
    screen = new Screen({ title: 'baseline' } as any);
    expect(screen.getDimensions()).toEqual({ width: 80, height: 24 });
  });

  it('createScreen against an 80x25 BBS stays 80x25 (non-responsive path)', () => {
    const written: string[] = [];
    const bbs: any = {
      write: (t: string) => written.push(t),
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 25 }),
    };
    screen = createScreen(bbs, { title: 'baseline' });
    expect(screen.getDimensions()).toEqual({ width: 80, height: 25 });
    // Non-responsive: setDimensions must pin width back to 80 even when
    // asked for less (screen.ts:540) - the legacy contract.
    screen.setDimensions(23, 60);
    expect(screen.getDimensions().width).toBe(80);
  });
});

describe('80-column baseline: painted buffers', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('masthead + footer + list/detail panel layout (doorman-shaped)', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3, tags: true, focusable: false } as any);
    new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, focusable: false } as any);
    const listPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6', focusable: false } as any);
    new List({
      parent: listPanel, top: 1, left: 1, width: '100%-2', height: '100%-2',
      keys: true, mouse: false, scrollable: true, tags: true,
      items: ['Alpha Door', 'Beta Door', 'Gamma Door', 'Delta Door'],
    } as any);
    new Box({
      parent: screen, top: 3, left: '35%', width: '65%', height: '100%-6',
      border: { type: 'line' }, tags: true, content: 'Detail panel content, eighty columns wide.',
    } as any);
    screen.render();
    expect(rows(screen)).toMatchSnapshot();
  });

  it('centered bordered modal (modal-centring-shaped)', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    new Box({
      parent: screen, top: 'center', left: 'center', width: 50, height: 10,
      border: { type: 'line' }, align: 'center', valign: 'middle', tags: true,
      content: 'Are you sure you want to continue?',
    } as any);
    screen.render();
    expect(rows(screen)).toMatchSnapshot();
  });

  it('full-width list with selection', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    const list = new List({
      parent: screen, top: 0, left: 0, width: '100%', height: '100%',
      keys: true, mouse: false, tags: true,
      items: Array.from({ length: 10 }, (_, i) => `Item number ${i + 1} with some descriptive text`),
    } as any);
    (list as any).select(3);
    screen.render();
    expect(rows(screen)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run** `cd sdk && npm test -- --testPathPattern=eighty-col-baseline`. Expected: PASS on first run and the `.snap` file is written (a baseline has no RED phase of its own — see Step 3 for its bite-proof).

- [ ] **Step 3: Prove the baseline bites** — temporarily change `sdk/engines/ui/blessed/core/screen.ts:107` from `const bbsWidth = options.responsive ? (options.width || 80) : 80;` to `... : 79;`, re-run the suite, confirm the geometry test AND at least one snapshot FAIL, revert the change, re-run to green. This is the task's RED proof: the harness detects an 80-column rendering change.

- [ ] **Step 4: Commit**

```bash
cd sdk && npm run build && npm test
git add tests/unit/eighty-col-baseline.test.ts tests/unit/__snapshots__/eighty-col-baseline.test.ts.snap
git diff --cached --stat   # VERIFY: only these two files
git commit -m "test(sdk): 80-column render regression baseline before any 40-col layout work"
```

---

### Task 3: Blessed SDK XXS=40 tier + geometry-driven responsive default

Adds the missing 40-column breakpoint tier and makes `createScreen` honor session geometry for every non-80 terminal. Decision 1 ("responsive on by default") is implemented at the `createScreen` seam, NOT by flipping the `Screen` constructor's `responsive` default: the constructor's non-responsive branch has different HEIGHT semantics (`contentLines + 2`, screen.ts:108-110 and 541-544), so flipping it would change every existing 80-col door — exactly what non-negotiable (b) forbids. At the seam, `width === 80` keeps the legacy fixed pipeline byte-for-byte (Task 2 baseline proves it), and any other width gets true responsive geometry.

**Files:**
- Modify: `sdk/engines/ui/blessed/core/responsive-constants.ts` (XXS constant, breakpoint fn, dialog width, compact profile)
- Modify: `sdk/utils/blessed-helpers.ts:925-926` (responsive trigger)
- Test: `sdk/tests/unit/xxs-breakpoint.test.ts`
- Regression oracle: Task 2 baseline must stay green.

**Interfaces:**
- Produces: `BREAKPOINT_XXS = 41`; `BreakpointName` gains `'xxs'`; `getBreakpointName(40) === 'xxs'`; `calculateDialogWidth(w)` returns `w - 2` below XXS; `getCompactProfile(width: number): CompactProfile` with `CompactProfile = { borders: boolean; singleColumn: boolean; collapseChrome: boolean; gap: number; padding: number }` — the single source of the 40-col layout rules that Task 6's doors consume.
- Produces: `createScreen(bbs, opts)` yields a Screen whose dimensions equal `bbs.getTerminalSize()` whenever width is not 80.
- Consumes: Task 2 snapshots (must not change).

- [ ] **Step 1: Write failing tests**

Create `sdk/tests/unit/xxs-breakpoint.test.ts`:

```ts
import {
  BREAKPOINT_XXS,
  getBreakpointName,
  calculateDialogWidth,
  getCompactProfile,
} from '../../engines/ui/blessed/core/responsive-constants';
import { createScreen } from '../../utils/blessed-helpers';

describe('XXS breakpoint tier (40-column C64/PETSCII)', () => {
  it('40 columns classifies as xxs; 41-49 stays xs', () => {
    expect(BREAKPOINT_XXS).toBe(41);
    expect(getBreakpointName(40)).toBe('xxs');
    expect(getBreakpointName(41)).toBe('xs');
    expect(getBreakpointName(49)).toBe('xs');
    expect(getBreakpointName(80)).toBe('medium');
  });

  it('dialogs at 40 columns fit with one column of margin each side', () => {
    expect(calculateDialogWidth(40)).toBe(38);
  });

  it('compact profile: borderless, single-column, collapsed chrome at 40; untouched at 80', () => {
    expect(getCompactProfile(40)).toEqual({
      borders: false, singleColumn: true, collapseChrome: true, gap: 0, padding: 0,
    });
    expect(getCompactProfile(80)).toEqual({
      borders: true, singleColumn: false, collapseChrome: false, gap: 1, padding: 1,
    });
  });
});

describe('createScreen honors non-80 session geometry', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('a 40x25 PETSCII session gets a 40x25 screen', () => {
    const bbs: any = {
      write: () => undefined,
      connectionType: 'web',
      getTerminalSize: () => ({ width: 40, height: 25 }),
    };
    screen = createScreen(bbs, { title: 'xxs' });
    expect(screen.getDimensions()).toEqual({ width: 40, height: 25 });
  });

  it('an explicit caller responsive:false still wins (options spread last)', () => {
    const bbs: any = {
      write: () => undefined,
      connectionType: 'web',
      getTerminalSize: () => ({ width: 40, height: 25 }),
    };
    screen = createScreen(bbs, { title: 'xxs', responsive: false } as any);
    expect(screen.getDimensions().width).toBe(80);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`cd sdk && npm test -- --testPathPattern=xxs-breakpoint`). Expected: `BREAKPOINT_XXS`/`getCompactProfile` do not exist; the 40x25 test gets `{ width: 80, height: 24 }` (responsive not triggered below 80 today, blessed-helpers.ts:926).

- [ ] **Step 3: Implement responsive-constants.ts**

In `sdk/engines/ui/blessed/core/responsive-constants.ts`, above `BREAKPOINT_XS` (line 26):

```ts
/** Extra-extra small - 40-column C64/PETSCII screens */
export const BREAKPOINT_XXS = 41;
```

Change line 38 to:

```ts
export type BreakpointName = 'xxs' | 'xs' | 'small' | 'medium' | 'large';
```

Add `xxs: BREAKPOINT_XXS,` as the first entry of `BREAKPOINTS` (line 41). In `getBreakpointName` (line 119), add as the first line of the body:

```ts
  if (width < BREAKPOINT_XXS) return 'xxs';
```

In `calculateDialogWidth` (line 153), add as the first lines of the body:

```ts
  if (screenWidth < BREAKPOINT_XXS) {
    // 40-col: nearly full width, borderless margins (compact profile)
    return Math.max(MIN_DIALOG_WIDTH, screenWidth - 2);
  }
```

Append at the end of the file:

```ts
// ============================================================================
// Compact (XXS / 40-column) profile
// ============================================================================

/**
 * Layout rules for a 40-column screen, in one place (single source of
 * truth - Task 6 doors consume this instead of inventing their own
 * width checks). Borders cost 2 of 40 columns, so XXS is borderless;
 * masthead/footer collapse to one line; wide tables become single-column.
 */
export interface CompactProfile {
  borders: boolean;
  singleColumn: boolean;
  collapseChrome: boolean;
  gap: number;
  padding: number;
}

export function getCompactProfile(width: number): CompactProfile {
  const xxs = width < BREAKPOINT_XXS;
  return {
    borders: !xxs,
    singleColumn: xxs,
    collapseChrome: xxs,
    gap: xxs ? MOBILE_GAP : DEFAULT_GAP,
    padding: xxs ? MOBILE_PADDING : DEFAULT_PADDING,
  };
}
```

- [ ] **Step 4: Implement the createScreen trigger**

In `sdk/utils/blessed-helpers.ts`, replace lines 925-926:

```ts
  // Enable responsive mode if terminal is wider than 80 or options.responsive is true
  const responsive = options?.responsive || termSize.width > 80;
```

with:

```ts
  // Responsive whenever the session terminal is NOT the classic 80 wide:
  // wider (fullscreen browser) OR narrower (40-col C64/PETSCII, XXS tier).
  // At exactly 80 the legacy fixed pipeline is untouched byte-for-byte -
  // proven by sdk/tests/unit/eighty-col-baseline.test.ts (Task 2).
  // Callers can still force either way; `...options` spreads last.
  const responsive = options?.responsive ?? (termSize.width !== 80 || undefined);
```

(`?? (cond || undefined)` keeps an explicit `responsive: false` from a caller in force, because `false ?? x` is `false` — the second new test pins this.)

- [ ] **Step 5: Run to green, then the FULL sdk suite including the Task 2 baseline**

```bash
cd sdk && npm test -- --testPathPattern=xxs-breakpoint
npm test    # eighty-col-baseline snapshots MUST be untouched
```

- [ ] **Step 6: RED proof** — revert the blessed-helpers change only, confirm the 40x25 test fails again, restore, re-run green.

- [ ] **Step 7: Build + freshness + commit**

```bash
cd sdk && npm run build && npx tsc --noEmit --project tsconfig.json
# door-sdk-freshness protocol (.claude/skills/door-sdk-freshness/SKILL.md) before any live testing
git add engines/ui/blessed/core/responsive-constants.ts utils/blessed-helpers.ts tests/unit/xxs-breakpoint.test.ts
git diff --cached --stat   # VERIFY: only these three files
git commit -m "feat(sdk): XXS=40 breakpoint tier, compact profile, geometry-driven responsive default"
```

---

### Task 4: Core BBS word-wrap choke point + width parameterization

One session-width wrap at the `emitText` seam covers the prose surfaces (help text, mail bodies, bulletins, oneliners, AREXX door output) in one move, with hard guards that keep 80-column output and positioned/art payloads byte-identical. Plus the specific literal-width sites the inventory flagged: the file viewer's 79, AmigaGuide's width param, and AREXX's `BB_SCRWIDTH`. Vertical pagination is already session-driven (`flagPause` clamp, `screenHeight=25` C64 sites — inventory section 4) and needs no change; the remaining `23/24` literals are new-user defaults, correct as constants.

Session access at the seam: web sockets already carry the session (`(socket as any).session`, set at `index.ts:786,793,833`); telnet/SSH emitters get a one-line `session` getter.

**Files:**
- Create: `web/backend/src/utils/wrap-for-session.util.ts`
- Modify: `web/backend/src/utils/ansi-buffer.util.ts:194-201` (`emitText`)
- Modify: `web/backend/src/server/connection-emitter.ts` (session getter on the emitter object)
- Modify: `web/backend/src/handlers/content/view-file.handler.ts:197-254` (79 -> session width)
- Modify: `web/backend/src/services/arexx.service.ts:1924-1925` (`BB_SCRWIDTH`/`BB_SCRHEIGHT`)
- Modify: the `AmigaGuideViewer` construction site(s): run `grep -rn "new AmigaGuideViewer" web/backend/src` and pass `sessionColumns(session)` as the existing `width` constructor parameter (the class already takes it, default 80 — `amigaguide/AmigaGuideViewer.ts:20,55,77`).
- Test: `web/backend/tests/utils/wrap-for-session.util.test.ts`, `web/backend/tests/utils/emit-text-wrap.test.ts`, extend `web/backend/tests/` view-file coverage.

**Interfaces:**
- Produces:
  - `printableLength(line: string): number` — length ignoring ANSI escape sequences.
  - `wrapLineToWidth(line: string, width: number): string[]` — ANSI-aware word wrap; escapes are zero-width and never split; over-long words hard-break.
  - `wrapForSession(text: string, session: { screenWidth?: number; petsciiMode?: boolean } | undefined): string` — identity when width >= 80, when a door owns the terminal, or when the payload contains cursor-motion/positioning/clear sequences.
- Consumes: `sessionColumns` (Task 1), `doorOwnsTerminal` (`utils/door-owns-terminal.ts`).
- `emitText(socket, text, immediate)` signature unchanged — every existing caller inherits the behavior.

- [ ] **Step 1: Write failing wrap-unit tests**

Create `web/backend/tests/utils/wrap-for-session.util.test.ts`:

```ts
import {
  printableLength,
  wrapLineToWidth,
  wrapForSession,
} from '../../src/utils/wrap-for-session.util';

describe('printableLength', () => {
  it('ignores ANSI escapes', () => {
    expect(printableLength('\x1b[32mHello\x1b[0m')).toBe(5);
    expect(printableLength('plain')).toBe(5);
  });
});

describe('wrapLineToWidth', () => {
  it('leaves short lines alone', () => {
    expect(wrapLineToWidth('short line', 40)).toEqual(['short line']);
  });

  it('wraps at word boundaries, never past width', () => {
    const out = wrapLineToWidth('the quick brown fox jumps over the lazy dog again and again', 20);
    for (const l of out) expect(printableLength(l)).toBeLessThanOrEqual(20);
    expect(out.join(' ').replace(/\s+/g, ' ')).toBe('the quick brown fox jumps over the lazy dog again and again');
  });

  it('keeps ANSI color spans intact across the wrap', () => {
    const out = wrapLineToWidth('\x1b[33m' + 'word '.repeat(12).trim() + '\x1b[0m', 20);
    for (const l of out) expect(printableLength(l)).toBeLessThanOrEqual(20);
    expect(out.join('')).toContain('\x1b[33m');
    expect(out.join('')).toContain('\x1b[0m');
    for (const l of out) expect(l).not.toMatch(/\x1b\[[0-9;]*$/); // no split escape
  });

  it('hard-breaks a word longer than the width', () => {
    const out = wrapLineToWidth('A'.repeat(90), 40);
    expect(out.length).toBe(3);
    expect(printableLength(out[0])).toBe(40);
  });
});

describe('wrapForSession', () => {
  const c64 = { screenWidth: 40, petsciiMode: true };

  it('is IDENTITY for 80-column sessions (byte-for-byte)', () => {
    const text = 'x'.repeat(200) + '\r\n' + '\x1b[31m' + 'y'.repeat(100);
    expect(wrapForSession(text, { screenWidth: 80 })).toBe(text);
    expect(wrapForSession(text, {})).toBe(text);
    expect(wrapForSession(text, undefined as any)).toBe(text);
  });

  it('wraps every long line to 40 for a C64 session', () => {
    const out = wrapForSession('word '.repeat(20).trim(), c64);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
  });

  it('passes positioned/full-screen payloads through untouched (art guard)', () => {
    const positioned = '\x1b[3;5H' + 'x'.repeat(100);
    const cleared = '\x1b[2J' + 'x'.repeat(100);
    expect(wrapForSession(positioned, c64)).toBe(positioned);
    expect(wrapForSession(cleared, c64)).toBe(cleared);
  });

  it('passes door-owned sessions through untouched', () => {
    const doorSession = { ...c64, clientDoorActive: true };
    const text = 'x'.repeat(100);
    expect(wrapForSession(text, doorSession as any)).toBe(text);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`--testPathPattern=wrap-for-session`; module missing).

- [ ] **Step 3: Implement the wrap util**

Create `web/backend/src/utils/wrap-for-session.util.ts`:

```ts
/**
 * Session-width word wrap (C64/40-col plan, Task 4).
 *
 * The one choke point for prose reflow. Guards keep it provably inert
 * where it must be:
 *  - width >= 80: IDENTITY (80-col output byte-for-byte unchanged).
 *  - door-owned session: IDENTITY (doors paint their own screens).
 *  - payload with cursor motion/positioning/clear: IDENTITY (positioned
 *    UI and ANSI art are never rewrapped - "never squeeze art").
 */
import { doorOwnsTerminal } from './door-owns-terminal';
import { sessionColumns } from './door-min-columns.util';

const ANSI_TOKEN_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** Motion, absolute positioning, clears, save/restore: art or full-screen UI. */
const CURSOR_CONTROL_RE = /\x1b\[[0-9;]*[ABCDHJKsu]/;

export function printableLength(line: string): number {
  return line.replace(ANSI_TOKEN_RE, '').length;
}

/**
 * Word-wrap one logical line (no line breaks inside) to `width` printable
 * columns. ANSI escapes count as zero width and are never split; SGR state
 * carries across the produced lines the way a terminal carries it.
 */
export function wrapLineToWidth(line: string, width: number): string[] {
  if (printableLength(line) <= width) return [line];

  const tokens = line.split(/(\x1b\[[0-9;?]*[A-Za-z])/);
  const out: string[] = [];
  let current = '';
  let currentLen = 0;
  const flush = () => {
    out.push(current);
    current = '';
    currentLen = 0;
  };

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('\x1b')) {
      current += token; // zero printable width
      continue;
    }
    for (const piece of token.split(/(\s+)/)) {
      if (!piece) continue;
      if (currentLen + piece.length <= width) {
        current += piece;
        currentLen += piece.length;
        continue;
      }
      if (/^\s+$/.test(piece)) {
        // Break at whitespace; the break replaces the spaces.
        flush();
        continue;
      }
      if (piece.length > width) {
        // Hard-break an over-long word.
        let rest = piece;
        while (rest.length > 0) {
          const room = width - currentLen;
          if (room <= 0) {
            flush();
            continue;
          }
          current += rest.slice(0, room);
          currentLen += Math.min(room, rest.length);
          rest = rest.slice(room);
          if (rest.length > 0) flush();
        }
        continue;
      }
      flush();
      current = piece;
      currentLen = piece.length;
    }
  }
  if (current.length > 0 || out.length === 0) out.push(current);
  return out;
}

export function wrapForSession(
  text: string,
  session: { screenWidth?: number; petsciiMode?: boolean } | undefined
): string {
  if (!session) return text;
  const width = sessionColumns(session);
  if (width >= 80) return text;                       // 80-col: byte-identical
  if (doorOwnsTerminal(session as any)) return text;  // door paints the screen
  if (CURSOR_CONTROL_RE.test(text)) return text;      // positioned UI / art
  return text
    .split(/\r\n|\n/)
    .map((l) => wrapLineToWidth(l, width).join('\r\n'))
    .join('\r\n');
}
```

- [ ] **Step 4: Run wrap tests to green.**

- [ ] **Step 5: Write failing emitText choke tests**

Create `web/backend/tests/utils/emit-text-wrap.test.ts`:

```ts
import { emitText } from '../../src/utils/ansi-buffer.util';

function makeSocket(session?: any) {
  const emitted: string[] = [];
  const socket: any = {
    id: `wrap-test-${Math.random()}`,
    session,
    emitted,
    emit(event: string, data: string) {
      if (event === 'ansi-output') emitted.push(data);
      return true;
    },
    on() { return socket; },  // AnsiBuffer registers a disconnect handler
  };
  return socket;
}

describe('emitText session-width choke', () => {
  it('wraps prose to 40 for a C64 session', () => {
    const socket = makeSocket({ screenWidth: 40, petsciiMode: true });
    emitText(socket, 'word '.repeat(20).trim() + '\r\n', true);
    const out = socket.emitted.join('');
    for (const line of out.split('\r\n')) {
      expect(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
    }
  });

  it('is byte-for-byte identity for an 80-column session', () => {
    const text = '\x1b[32m' + 'x'.repeat(120) + '\x1b[0m\r\n';
    const socket = makeSocket({ screenWidth: 80 });
    emitText(socket, text, true);
    expect(socket.emitted.join('')).toBe(text);
  });

  it('is identity when the socket carries no session (pre-login, tests)', () => {
    const text = 'y'.repeat(120);
    const socket = makeSocket(undefined);
    emitText(socket, text, true);
    expect(socket.emitted.join('')).toBe(text);
  });
});
```

- [ ] **Step 6: Run, verify FAIL** (the 40-col test emits the unwrapped 100-char line today).

- [ ] **Step 7: Implement the choke + emitter session getter**

In `web/backend/src/utils/ansi-buffer.util.ts`, add the import at the top:

```ts
import { wrapForSession } from './wrap-for-session.util';
```

and replace `emitText` (lines 194-201):

```ts
export function emitText(socket: Socket, text: string, immediate: boolean = false): void {
  // Session-width choke point (C64/40-col Task 4). Web sockets carry the
  // session (index.ts:786); telnet/SSH emitters expose it via a getter
  // (connection-emitter.ts). wrapForSession is identity at >=80 columns,
  // for door-owned sessions, and for positioned/art payloads.
  const session = (socket as any).session;
  const buffer = getAnsiBuffer(socket);
  buffer.append(wrapForSession(text, session));

  if (immediate) {
    buffer.flushImmediate();
  }
}
```

In `web/backend/src/server/connection-emitter.ts`, inside the `emitter` object literal (after `id: connection.sessionId,` at line 118):

```ts
    // Live view of the connection's session, for emitText's wrap choke
    // (Task 4). A getter, not a copy: connection.session is assigned after
    // this emitter is built.
    get session() {
      return connection.session;
    },
```

- [ ] **Step 8: Run choke tests to green; run the FULL backend suite** — a full-suite pass here IS the 80-column no-change proof for every existing emitText caller (any output-pinning test that broke would mean the guards leak). Then RED proof: revert only the `emitText` body, confirm the 40-col choke test fails, restore.

- [ ] **Step 9: File viewer + AREXX width sites**

`web/backend/src/handlers/content/view-file.handler.ts` — in `displayFile` (line ~197), compute the wrap width once and thread it:

```ts
      const wrapWidth = Math.max(20, sessionColumns(session) - 1); // 79 at 80 cols - express.e:20492 parity
      for (const line of lines) {
        await this.displayLineWithWrapping(socket, line, wrapWidth);
```

and change `displayLineWithWrapping` (lines 227-254) to take the width:

```ts
  private static async displayLineWithWrapping(
    socket: Socket,
    line: string,
    wrapWidth: number
  ): Promise<void> {
    // If line has CR or fits, display as-is - express.e:20494-20495
    if (line.includes('\r') || line.length <= wrapWidth) {
      socket.emit('ansi-output', line + '\r\n');
      return;
    }

    // Wrap long lines at wrapWidth characters - express.e:20497-20514
    let remaining = line;
    while (remaining.length > 0) {
      if (remaining.length > wrapWidth) {
        const chunk = remaining.substring(0, wrapWidth);
        socket.emit('ansi-output', chunk);
        remaining = remaining.substring(wrapWidth);

        if (remaining.length > 0) {
          socket.emit('ansi-output', '\r\n');
        }
      } else {
        socket.emit('ansi-output', remaining);
        remaining = '';
      }
    }
    socket.emit('ansi-output', '\r\n');
  }
```

Add the import `import { sessionColumns } from '../../utils/door-min-columns.util';`. Note the 80-col guard: at `screenWidth 80`, `wrapWidth` is 79 and `line.length <= 79` reproduces the old `line.length < 80` — byte-identical. Regression test (`web/backend/tests/handlers/view-file-width.test.ts`): if `displayLineWithWrapping` is private, export a test seam (`export const displayLineWithWrappingForTest = ...` following the `parseTooltypeStringForTest` precedent) and assert: a 100-char line at width 79 produces exactly the chunks `[0..79) + '\r\n' + [79..100) + '\r\n'` (current behavior, pinned), and at width 39 no emitted chunk exceeds 39 chars.

`web/backend/src/services/arexx.service.ts:1924-1925` — replace:

```ts
      case 520: return String((user as any)?.linesPerScreen ?? 80);                    // BB_SCRWIDTH — terminal width
      case 521: return String((user as any)?.linesPerScreen ?? 24);                    // BB_SCRHEIGHT (height tracking on user struct)
```

with:

```ts
      case 520: return String(session?.screenWidth ?? 80);                             // BB_SCRWIDTH — live session terminal width (40 for C64)
      case 521: return String(session?.screenHeight ?? (user as any)?.linesPerScreen ?? 24); // BB_SCRHEIGHT — live session height first
```

(`session` is in scope — line 1918 reads `session?.taskPtr`.) Add a test to the existing AREXX variable coverage (or a new `web/backend/tests/arexx-scrwidth.test.ts` if none directly covers the getVar switch — it must call the same exported entry the AREXX engine uses, with a session `{ screenWidth: 40, screenHeight: 25 }`, and assert `'40'`/`'25'`; RED first against the current `linesPerScreen ?? 80` behavior).

AmigaGuide: `grep -rn "new AmigaGuideViewer" web/backend/src`, pass `sessionColumns(session)` for the width constructor argument at each site (the class already accepts it; default 80 keeps non-session callers unchanged).

- [ ] **Step 10: Type-check + full suite + commit**

```bash
cd web/backend && npx tsc --noEmit
npx jest --config dev-scripts/jest.config.ts --rootDir .
git add src/utils/wrap-for-session.util.ts src/utils/ansi-buffer.util.ts src/server/connection-emitter.ts src/handlers/content/view-file.handler.ts src/services/arexx.service.ts tests/utils/wrap-for-session.util.test.ts tests/utils/emit-text-wrap.test.ts tests/handlers/view-file-width.test.ts tests/arexx-scrwidth.test.ts
# plus the AmigaGuide caller file(s) found by the grep, by name
git diff --cached --stat   # VERIFY: only your files
git commit -m "feat(core): session-width wrap choke at emitText, file viewer + AREXX width from session"
```

---

### Task 5: 40-column table layouts

The 16 NEEDS-40-LAYOUT surfaces, in four batches. Design rule (resolves single-source-of-truth vs byte-identity): **each surface keeps its existing 80-column literal untouched** (that is the byte-identity guarantee) **and branches on `isNarrow(session)` to shared narrow-format helpers** — the helpers module is the single source of the 40-column conventions (two-line file rows, single-column pickers, stacked label:value headers). Where a surface's row-building is inline in a handler, extract it into an exported pure builder so the test drives real code (repo precedent: `applyPostDoorMenuAction` was extracted for exactly this reason).

Every batch follows the same cycle: RED tests on the builders (40-col: no line over 40 printable columns; 80-col: byte-identical literal pin copied from current source), implement, GREEN, revert-proof, commit.

**Files:**
- Create: `web/backend/src/utils/table-format.util.ts`
- Modify (5a): `web/backend/src/handlers/file/file.handler.ts:432-440` (search results), `:629-646` (new files) — `:1032-1039` is dead code (`areaFiles` hardcoded `[]`, marked DEPRECATED at :1021): leave it.
- Modify (5b): `web/backend/src/handlers/chat/chat-commands.handler.ts:137-220` (WHO + chat picker), `web/backend/src/handlers/user/account.handler.ts:108-145` (user list), `web/backend/src/handlers/chat/room-commands.handler.ts:314-350` (room members)
- Modify (5c): `web/backend/src/handlers/commands/info-commands.handler.ts:648-661` (protocol menu), `web/backend/src/handlers/screen.handler.ts:503-585` (`~CL.`/`~CD.`/`~ML.`/`~MD.` MCI lists)
- Modify (5d): `web/backend/src/handlers/message/message-scan.handler.ts:509-528,732-756`, `web/backend/src/handlers/message/messaging.handler.ts:316-346,464-478,1160-1180`, `web/backend/src/handlers/message/message-commands.handler.ts:395-410`, `web/backend/src/handlers/user/new-user.handler.ts:858-875`, `web/backend/src/handlers/file/file-status.handler.ts:154-181`, `web/backend/src/handlers/door.handler.ts:1236,1284` (doors-list chrome width)
- Test: `web/backend/tests/utils/table-format.util.test.ts`, `web/backend/tests/handlers/narrow-tables.test.ts`

**Interfaces:**
- Produces (`table-format.util.ts`):
  - `isNarrow(session: { screenWidth?: number; petsciiMode?: boolean }): boolean` — `sessionColumns(session) < 80`.
  - `narrowFileLines(row: { filename: string; sizeKB: number | string; description?: string }): string[]` — the classic C64 two-line convention.
  - `narrowField(label: string, value: string): string` — `LABEL  : value` clipped to 40.
  - `narrowRule(): string` — `'-'.repeat(39)`.
- Consumes: `sessionColumns` (Task 1), `wrapLineToWidth`/`printableLength` (Task 4).

- [ ] **Step 1 (5a): failing tests for the helpers + file listings**

Create `web/backend/tests/utils/table-format.util.test.ts`:

```ts
import { isNarrow, narrowFileLines, narrowField, narrowRule } from '../../src/utils/table-format.util';
import { printableLength } from '../../src/utils/wrap-for-session.util';

describe('isNarrow', () => {
  it('40-col and petscii sessions are narrow; 80 is not', () => {
    expect(isNarrow({ screenWidth: 40 })).toBe(true);
    expect(isNarrow({ petsciiMode: true })).toBe(true);
    expect(isNarrow({ screenWidth: 80 })).toBe(false);
    expect(isNarrow({})).toBe(false);
  });
});

describe('narrowFileLines (C64 two-line convention)', () => {
  it('line 1: filename + size within 40; line 2+: wrapped description', () => {
    const lines = narrowFileLines({
      filename: 'ALKYS241.LHA',
      sizeKB: 88,
      description: 'A long description of this fine Amiga release that will not fit on one forty column line',
    });
    expect(lines[0]).toBe('ALKYS241.LHA          88K');
    for (const l of lines) expect(printableLength(l)).toBeLessThanOrEqual(40);
    expect(lines.length).toBeGreaterThan(2);
  });

  it('clips an over-long filename instead of overflowing', () => {
    const lines = narrowFileLines({ filename: 'X'.repeat(30) + '.LHA', sizeKB: 5 });
    expect(printableLength(lines[0])).toBeLessThanOrEqual(40);
  });
});

describe('narrowField / narrowRule', () => {
  it('field lines and rules stay inside 40 columns', () => {
    expect(narrowField('Subject', 'S'.repeat(60)).length).toBeLessThanOrEqual(40);
    expect(narrowField('Date', '01-Jan-26 12:34')).toBe('Date   : 01-Jan-26 12:34');
    expect(narrowRule()).toBe('-'.repeat(39));
  });
});
```

Create `web/backend/tests/handlers/narrow-tables.test.ts` with the first surface — the file-search rows (extracted builder):

```ts
import { buildFileSearchLines } from '../../src/handlers/file/file.handler';
import { printableLength } from '../../src/utils/wrap-for-session.util';

const file = {
  filename: 'ALKYS241.LHA', size: 90112, uploaddate: Date.UTC(2025, 11, 10),
  uploader: 'SPOT', description: 'Fine Amiga release with a longish description text',
  fileid_diz: null, areaname: 'AMIGA/DEMOS',
};

describe('file search listing', () => {
  it('80-col: byte-identical to the historical format', () => {
    const lines = buildFileSearchLines({ screenWidth: 80 } as any, file as any);
    // Pin of the exact current format string (file.handler.ts:437-439)
    expect(lines[0]).toMatch(/^ALKYS241\.LHA {3} {2}88K /);
    expect(lines[0].startsWith(file.filename.padEnd(15) + String(88).padStart(5) + 'K ')).toBe(true);
  });

  it('40-col: two-line convention, nothing over 40 printable columns', () => {
    const lines = buildFileSearchLines({ screenWidth: 40, petsciiMode: true } as any, file as any);
    for (const l of lines) expect(printableLength(l)).toBeLessThanOrEqual(40);
    expect(lines[0]).toContain('ALKYS241.LHA');
    expect(lines.join('\n')).toContain('Fine Amiga release');
  });
});
```

- [ ] **Step 2 (5a): run, verify FAIL** (`--testPathPattern='table-format|narrow-tables'`; module and builder missing).

- [ ] **Step 3 (5a): implement helpers + file listings**

Create `web/backend/src/utils/table-format.util.ts`:

```ts
/**
 * 40-column table conventions (C64/40-col plan, Task 5).
 *
 * Single source of truth for the NARROW layouts only. The 80-column
 * formats stay as the literal strings in each handler - they are pinned
 * byte-for-byte by tests and by express.e parity, and rebuilding them
 * through a shared formatter would risk changing them. The narrow layer
 * is new, so it is shared from day one.
 */
import { sessionColumns } from './door-min-columns.util';
import { wrapLineToWidth } from './wrap-for-session.util';

export const NARROW_WIDTH = 40;

export function isNarrow(session: { screenWidth?: number; petsciiMode?: boolean }): boolean {
  return sessionColumns(session) < 80;
}

/**
 * Classic C64 dir convention: two stacked lines per file.
 *   FILENAME.EXT          88K
 *    description wrapped to 40...
 */
export function narrowFileLines(row: {
  filename: string;
  sizeKB: number | string;
  description?: string;
}): string[] {
  const size = `${String(row.sizeKB).padStart(5)}K`;         // 6 cols
  const name = row.filename.substring(0, 33).padEnd(34);      // 34 cols
  const lines = [`${name}${size}`];
  if (row.description) {
    lines.push(...wrapLineToWidth(` ${row.description}`, NARROW_WIDTH - 1).map((l) => ` ${l.trimStart()}`));
  }
  return lines;
}

/** `Label  : value`, clipped to the narrow width. */
export function narrowField(label: string, value: string): string {
  return `${label.padEnd(7)}: ${value}`.substring(0, NARROW_WIDTH);
}

export function narrowRule(): string {
  return '-'.repeat(NARROW_WIDTH - 1);
}
```

In `web/backend/src/handlers/file/file.handler.ts`, extract and branch the search listing. Add imports (`isNarrow`, `narrowFileLines` from `../../utils/table-format.util`), then above `handleFileSearch` add:

```ts
/**
 * One search-result entry as display lines (C64/40-col Task 5a).
 * 80-col: the historical single-line format, byte-identical.
 * <80: the C64 two-line convention from table-format.util.
 */
export function buildFileSearchLines(session: any, file: any): string[] {
  const sizeKB = Math.ceil(file.size / 1024);
  const description = file.fileid_diz || file.description;
  if (!isNarrow(session)) {
    const dateStr = formatLongDate(new Date(file.uploaddate));
    return [
      `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}`,
      `  ${description}`,
      `  Area: ${file.areaname}`,
    ];
  }
  return [
    ...narrowFileLines({ filename: file.filename, sizeKB, description }),
    ` Area: ${String(file.areaname).substring(0, 33)}`,
  ];
}
```

and replace the loop body at lines 432-440 with:

```ts
    matchingFiles.forEach((file: any) => {
      for (const line of buildFileSearchLines(session, file)) {
        emitText(socket, `${line}\r\n`);
      }
      emitText(socket, '\r\n');
    });
```

Apply the same pattern to the new-files listing (`displayNewFilesFromDatabase`, lines 629-646): extract `buildNewFileLines(session, file): string[]` returning the current colorized 80-col strings verbatim (`\x1b[32m${file.filename.padEnd(20)}\x1b[0m \x1b[36m${String(sizeKB).padStart(6)}KB\x1b[0m \x1b[33m${uploadDate.padEnd(10)}\x1b[0m \x1b[37m${file.uploader}\x1b[0m` + optional `  \x1b[37m${desc}\x1b[0m`) in the wide branch and `narrowFileLines(...)` (with `\x1b[32m` on the name line, `\x1b[37m` on description lines) in the narrow branch; call it from the loop via the existing `emitLine(text, 1)` per line. Pin both branches in `narrow-tables.test.ts` the same way as the search builder.

- [ ] **Step 4 (5a): green + commit**

```bash
cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern='table-format|narrow-tables'
git add src/utils/table-format.util.ts src/handlers/file/file.handler.ts tests/utils/table-format.util.test.ts tests/handlers/narrow-tables.test.ts
git diff --cached --stat
git commit -m "feat(files): 40-col two-line file listings behind isNarrow, shared narrow-table helpers"
```

- [ ] **Step 5 (5b): WHO / user list / room members**

Same extract-and-branch pattern; add the builders and their tests to `narrow-tables.test.ts` FIRST (RED), asserting 40-col max width and the 80-col literal pins below, then implement:

`chat-commands.handler.ts` — extract `buildWhoRow(sess: { username: string; realname?: string }, statusText: string, narrow: boolean): string`:

```ts
export function buildWhoRow(user: { username: string; realname?: string }, statusText: string, narrow: boolean): string {
  if (!narrow) {
    // Historical row (chat-commands.handler.ts:205-217), byte-identical
    return user.username.padEnd(16, ' ').substring(0, 16) + '  '
      + (user.realname || 'Unknown').padEnd(23, ' ').substring(0, 23) + '  ' + statusText;
  }
  // 40-col: drop the realname column. Full English status words still fit:
  // 16 + 2 + "Not Available"(13) = 31.
  return user.username.padEnd(16, ' ').substring(0, 16) + '  ' + statusText;
}
```

In `showOnlineUsers` (lines 188-220): the `═`.repeat(63) banners and the header/underline rows become `isNarrow(session)` branches — narrow header `'Username          Status\r\n' + '================  =============\r\n'`, banner `'═'.repeat(39)`; wide branch keeps the exact current strings. `renderChatUserList` (lines 137-183) is an arrow-key picker the C64 cannot drive today (cursor keys are bridge-phase); give it the same row/banner treatment so it degrades legibly, selected row inverse unchanged.

`account.handler.ts` `displayUserList` (lines 108-145): branch header/separator/rows —

```ts
    if (isNarrow(session)) {
      socket.emit('ansi-output', '\x1b[32mUsername         Lvl  Last Login\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[36m' + '='.repeat(39) + '\x1b[0m\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[32mUsername'.padEnd(16) + 'Real Name'.padEnd(20) + 'Location'.padEnd(15) + 'Level  Last Login\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[36m' + '='.repeat(75) + '\x1b[0m\r\n');
    }
```

and per-user rows: narrow = `user.username.padEnd(16).substring(0,16) + ' ' + user.secLevel.toString().padStart(3) + '  ' + lastLogin` plus a second line `'  ' + (user.location || '').substring(0,37)`; wide = the exact current concatenation (lines 128-134).

`room-commands.handler.ts` `whoInRoom` (lines 314-350): narrow rows `member.username.padEnd(16).substring(0,16) + status.trimEnd()` (no joined-at column), rule `'─'.repeat(39)`; wide unchanged. Extract `buildRoomMemberRow(member, status, joinedAt, narrow)`.

Green, revert-proof, then:

```bash
git add src/handlers/chat/chat-commands.handler.ts src/handlers/user/account.handler.ts src/handlers/chat/room-commands.handler.ts tests/handlers/narrow-tables.test.ts
git diff --cached --stat
git commit -m "feat(who): 40-col WHO, user list and room member rows"
```

- [ ] **Step 6 (5c): protocol menu + conference/message-base lists**

`info-commands.handler.ts:648-661` — extract `buildProtocolMenuLines(narrow: boolean): string[]`; wide branch returns the seven current literal lines byte-identically; narrow branch:

```ts
  return [
    'Select Transfer Protocol:',
    '',
    '[1] ZMODEM (recommended)',
    '[2] YMODEM (Batch)',
    '[3] XMODEM-1K',
    '[4] XMODEM-CRC',
    '[5] XMODEM (legacy)',
    '[6] Punter (Commodore 64/128)',
    '[7] WebSocket (browser)',
    '',
    'Select (1-7) or <CR>=Cancel: ',
  ];
```

(Full English words; the 80-col descriptions move off the line rather than being abbreviated.)

`screen.handler.ts` MCI lists — `parseMciCodes` has `session` in scope; branch each code on `isNarrow(session)`:
- `~CL.` (lines 507-516): narrow row `` `  \x1b[32m${String(num).padStart(3)}\x1b[33m) \x1b[35m${conferences[i].name.substring(0, 32)}\x1b[0m\r\n` `` (drop the 21-space centering indent, clip the name; colors kept); wide row unchanged.
- `~CD.` (lines 519-535): narrow = single column, one `[nnn] name` per line (`   \x1b[34m[\x1b[0m${String(num).padStart(3, '0')}\x1b[34m] \x1b[0m${confName.substring(0, 30)}\r\n`), no `% 2` pairing; wide unchanged.
- `~ML.` (538-566) narrow like `~CL.`; `~MD.` (569-585) narrow like `~CD.`.

Tests: `parseMciCodes` is exported — drive it directly in `narrow-tables.test.ts` with a stub session (`{ screenWidth: 40, petsciiMode: true, user: ..., currentConf: 1 }`) and injected conferences (use the module's `setConferences`-style injection the handler already uses — check the top of screen.handler.ts for the setter and call it in the test), asserting every produced line ≤ 40 printable and the 80-col output equal to the current strings (pin one row of each code verbatim).

```bash
git add src/handlers/commands/info-commands.handler.ts src/handlers/screen.handler.ts tests/handlers/narrow-tables.test.ts
git diff --cached --stat
git commit -m "feat(screens): 40-col protocol menu and ~CL/~CD/~ML/~MD conference lists"
```

- [ ] **Step 7 (5d): message tables, node status, new-user picker, file status, doors-list chrome**

Message scan rows (`message-scan.handler.ts:515-527` and `742-755` — two identical row loops) — extract ONE `buildMailScanRow(m: { isPrivate: boolean; from: string; subject: string; msgNum: number }, narrow: boolean): string[]`:

```ts
export function buildMailScanRow(
  m: { isPrivate: boolean; from: string; subject: string; msgNum: number },
  narrow: boolean
): string[] {
  const status = m.isPrivate ? 'Private' : 'Public ';
  const num = String(m.msgNum).padStart(6, '0');
  if (!narrow) {
    const from = (m.from || '').substring(0, 29).padEnd(29);
    const subj = (m.subject || '').substring(0, 21).padEnd(21);
    return [`${status}  ${from}  ${subj}  \x1b[0m${num}`];
  }
  // 40-col: number+type line, then from, then subject - nothing clipped away.
  return [
    `${num} ${status}`,
    `  ${(m.from || '').substring(0, 37)}`,
    `  ${(m.subject || '').substring(0, 37)}`,
  ];
}
```

Both call sites keep their differing header emissions (the `\x1b[0m` vs `\x1b[0m\r\n` difference at :513/:739 is express.e parity — untouched) but emit a narrow header `'\x1b[32mMsg    Type\x1b[0m'` + `'\x1b[33m' + '-'.repeat(39)` when narrow. Same treatment for the msg-list table in `messaging.handler.ts:1160-1180` (reuse `buildMailScanRow` — it is the same row shape with the number leading; keep the wide literal exactly as :1176-1179).

Message-read header (`messaging.handler.ts:316-346` and the nonstop copy `:464-478`): branch on `isNarrow(session)` — narrow emits one field per line via `narrowField` (Date, Number, To, Recv'd, From, Status, Subject), wide keeps the exact padded-30 pairs.

Node status (`message-commands.handler.ts:395-410`): extract `buildNodeStatusRow(nodeId, handle, location, action, chatStr, narrow)`; narrow: two lines, no box-drawing — `` `${nodeStr} ${handle.padEnd(19).slice(0, 19)}` `` and `` `   ${action.padEnd(19).slice(0, 19)}` ``; narrow footer `'-'.repeat(39)`; wide keeps the `|`-boxed literals.

New-user computer picker (`new-user.handler.ts:863-874`): branch — narrow emits one choice per line `` `${String(i + 1).padStart(2, ' ')}> ${choices[i].substring(0, 36)}\r\n` ``; wide keeps the express.e two-column loop verbatim.

File status (`file-status.handler.ts:154-181`): narrow per-conference stacked block:

```ts
        socket.emit('ansi-output', `\x1b[${color}m${confDisplay}${indicator}\x1b[0m\r\n`);
        socket.emit('ansi-output', ` UL ${uploadsDisplay} ${uploadBytesDisplay.trim().padStart(14)}\r\n`);
        socket.emit('ansi-output', ` DL ${downloadsDisplay} ${downloadBytesDisplay.trim().padStart(14)}\r\n`);
        socket.emit('ansi-output', ` Avail ${bytesAvailDisplay.trim()}  ${secLibrary > 0 ? `${ratio}:1` : 'DSBLD'}\r\n`);
```

wide branch untouched.

Doors-list chrome (`door.handler.ts`): line 1236 `padString(' DOOR GAMES & UTILITIES ', 80)` → `padString(' DOOR GAMES & UTILITIES ', sessionColumns(session))`; line 1284 `'-'.repeat(80)` → `'-'.repeat(sessionColumns(session))`. `formatDoorLine` itself gains a `narrow` parameter (default false; `showDoorsList` passes `sessionColumns(session) < 80`): narrow layout `` ` \x1b[33m[${type}]\x1b[0m ${padString(command, 10)} ${padString(door.name, 30)}` `` truncated so `printableLength <= 40` — drop the size column; wide output byte-identical (the Task 1 marker test extends to pin this).

All builders RED-first in `narrow-tables.test.ts` (≤40 printable at narrow; byte-identical literal pins at wide), implement, GREEN, revert-proof:

```bash
git add src/handlers/message/message-scan.handler.ts src/handlers/message/messaging.handler.ts src/handlers/message/message-commands.handler.ts src/handlers/user/new-user.handler.ts src/handlers/file/file-status.handler.ts src/handlers/door.handler.ts tests/handlers/narrow-tables.test.ts
git diff --cached --stat
git commit -m "feat(tables): 40-col message tables, node status, new-user picker, file status, doors list"
```

- [ ] **Step 8: full backend suite + type-check** (`npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir .`) — all green, including Task 1 gate tests and Task 4 choke tests.

---

### Task 6: Compact-possible door adaptation

Order per decision 1: list/text doors first (doors-menu, bug-tracker), then door-manager + theme-picker, then the plain line-oriented TS doors. **Inventory correction (verified against source):** `rip-browser` was classed "plain line-oriented / compact-possible" but is actually a blessed door with a hardcoded 80x24 raw `blessed.screen` (`Doors/rip-browser/app.ts:44-56`) — it stays gated at 80 and drops out of this task. The compact set is therefore: doors-menu, bug-tracker, door-manager, theme-picker (blessed) + ami-stripper, telnet, telnet-front, bbslink, bbslinkwall, phreakwars (plain).

Uniform mechanism for the blessed four (all rules come from Task 3's `getCompactProfile`, no per-door width math):
1. The Screen comes from `createScreen(bbs, ...)` so Task 3's geometry trigger applies (door-manager violates this today — `new Screen({...})` at `Doors/door-manager/app.ts:1934` with no geometry).
2. Layout code reads `const compact = getCompactProfile(screen.width);` and applies: `compact.borders === false` → no `border` option on panels; `compact.collapseChrome` → masthead/footer 1 row, title only; `compact.singleColumn` → side-by-side percentage panels become stacked full-width, list rows drop secondary columns.
3. Verified by a 40x25 buffer test (backend jest CAN import door modules — precedent `web/backend/tests/handlers/door-mode-cmd.test.ts` requires `Doors/livechat/...`): every painted row ≤ 40 cells wide with visible content, list items present.
4. Only after its test is green is the door marked 40-ok with `MIN_COLUMNS=40`.

- [ ] **Step 1: theme-picker (fully worked example)**

`Doors/theme-picker/app.ts` — the layout is already screen-relative (masthead width `screen.width - 1` at :82, list height from `screen.height` at :98/:116). Two compact changes in `createApp` (:31):

Add import `import { getCompactProfile } from '@amiexpress/bbs-door-sdk';` (re-export `getCompactProfile` from the SDK barrel if `responsive-constants` is not already exported — check `sdk/engines/ui/blessed/index.ts` and add `export { getCompactProfile, BREAKPOINT_XXS } from './core/responsive-constants';` if missing, then rebuild sdk). After `const screen = createScreen(bbs, { title: 'Theme' });` (line 44):

```ts
  const compact = getCompactProfile((screen as any).width || 80);
```

Replace the list items builder (lines 108-113):

```ts
    items: themes.map(t => {
      const active = bbs?.getActiveThemeId ? bbs.getActiveThemeId() : 'classic';
      const mark = t.id === active ? s.accent('[*]') : s.dim('[ ]');
      // 40-col: name only - the blurb column cannot fit (compact profile).
      return compact.singleColumn
        ? `${mark} ${s.ink(t.name.substring(0, 34))}`
        : `${mark} ${s.ink(t.name.padEnd(16))} ${s.dim(t.blurb)}`;
    }),
```

(match the actual `active`/`mark` lines at :109-112 — keep them verbatim, only the return branches change) and clip the hint box content (line 130) when compact: `` compact.collapseChrome ? `  ${s.dim('Applies on next door draw.')}` : `  ${s.dim('A theme applies the next time a door draws.')}` ``.

Test `web/backend/tests/doors/compact-40/theme-picker.test.ts` (RED first — today createScreen gives this door 80 even for a 40-col bbs is already fixed by Task 3, so the RED assertion is on the blurb overflow):

```ts
// @ts-nocheck
/** theme-picker at 40x25: every painted row fits (C64/40-col Task 6). */
describe('theme-picker compact layout', () => {
  it('renders inside 40 columns for a 40x25 session', async () => {
    const { createApp } = require('../../../../Doors/theme-picker/app');
    const written: string[] = [];
    const bbs = {
      write: (t) => written.push(t),
      connectionType: 'web',
      getTerminalSize: () => ({ width: 40, height: 25 }),
      listThemes: () => [
        { id: 'classic', name: 'Classic', blurb: 'The original AmiExpress look and feel' },
        { id: 'dark', name: 'Dark', blurb: 'Low-light theme with muted accents' },
      ],
      getTheme: undefined, getActiveThemeId: () => 'classic',
      on: () => undefined,
    };
    // createApp resolves when the door exits; we only need the first paint.
    const run = createApp({ bbs, user: { secLevel: 10 } });
    await new Promise((r) => setTimeout(r, 50));
    const out = written.join('');
    // No painted line may position or pad past column 40: assert no CUP
    // column parameter over 40 and no run of >40 printable chars between
    // line breaks after stripping escapes.
    for (const m of out.matchAll(/\x1b\[\d+;(\d+)H/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(40);
    }
    void run; // door stays waiting for input; test process exits via jest teardown
  });
});
```

(If `createApp` holding the process open trips jest, follow the grandmaster test pattern instead: construct the screen + list directly with the same items builder — extract the items builder into an exported `buildThemeItems(themes, active, s, compact)` and assert on its strings: RED = blurb line over 40 printable, GREEN = clipped. Prefer the extraction; it is the same pattern as Task 5.)

Then rebuild dist (freshness protocol) and mark 40-ok:

```bash
cd /Users/spot/Code/amiexpress-web/web/backend && npx tsx -e "
const path = require('path');
const { applyTooltypes } = require('./src/utils/info-file.util');
applyTooltypes(path.resolve(__dirname, '../../Commands/BBSCmd/THEME.info'), [['MIN_COLUMNS','40']]);
console.log('THEME.info marked MIN_COLUMNS=40');
"
```

Commit: `Doors/theme-picker/app.ts`, `Doors/theme-picker/dist/*` (rebuilt), the sdk barrel export if added, `web/backend/tests/doors/compact-40/theme-picker.test.ts`, `Commands/BBSCmd/THEME.info` — subject `feat(theme-picker): 40-column compact layout, marked 40-ok`.

- [ ] **Step 2: doors-menu**

`Doors/doors-menu/app.ts` (createScreen at :211). Read the file, then apply the mechanism: `getCompactProfile(screen.width)`; masthead/footer to 1 row when `collapseChrome`; the door list rows drop description/size columns when `singleColumn` (command + name only, ≤ 38 printable); dialogs already size via `calculateDialogWidth` if they use SDK dialogs — otherwise clamp to `screen.width - 2`. Extract the row builder as `buildDoorRow(door, compact)` (exported), RED-test it in `web/backend/tests/doors/compact-40/doors-menu.test.ts` (40-col rows ≤ 40 printable; 80-col rows byte-identical to current output — pin one row before editing), implement, GREEN, rebuild dist, mark `Commands/BBSCmd/DOORS.info` with the same `applyTooltypes` one-liner, commit (`feat(doors-menu): 40-column compact rows, marked 40-ok`).

- [ ] **Step 3: bug-tracker**

`Doors/bug-tracker/app.ts` (createScreen at :93 — already geometry-driven after Task 3). Read the layout; apply the mechanism to its masthead/panels/list exactly as Step 2 (extract row/label builders, `getCompactProfile`, borderless + stacked panels at xxs). RED/GREEN via `web/backend/tests/doors/compact-40/bug-tracker.test.ts` on the extracted builders. Rebuild dist, mark `Commands/BBSCmd/BUGS.info`, commit (`feat(bug-tracker): 40-column compact layout, marked 40-ok`).

- [ ] **Step 4: door-manager (DOORMAN — kept forever, never delete)**

`Doors/door-manager/app.ts:1934-1935` — replace the raw Screen with geometry-aware construction:

```ts
  const termSize = (bbs as any).getTerminalSize?.() || { width: 80, height: 25 };
  const screen = new Screen({ smartCSR: true, fullUnicode: true, title: 'DOORMAN v2',
    width: termSize.width, height: termSize.height,
    responsive: termSize.width !== 80,
    output: (data: string) => bbs.write(data) } as any);
```

`DoormanLayout` (same file, :175-259): add `const compact = getCompactProfile((screen as any).width || 80);` in the constructor; when `compact.singleColumn`, the `35%`/`65%` side-by-side panels become stacked (`listPanel: top: 3, width: '100%', height: '50%-3'`; `infoPanel: top: '50%', left: 0, width: '100%', height: '50%-3'`), header/footer height 3 → 1 (`collapseChrome`), and panel `border` styles dropped when `!compact.borders`. Export `DoormanLayout` for test (precedent noted in Task 1 Step 11). RED/GREEN in `web/backend/tests/doors/compact-40/doorman-layout.test.ts`: construct a `Screen({ width: 40, height: 25, responsive: true })`, build `DoormanLayout`, assert `layout.listPanel.width`-resolved coords span ≤ 40 and the two panels do not overlap side-by-side (use `_getCoords()` as in `sdk/tests/unit/modal-centring.test.ts:33`). Rebuild dist, mark `Commands/BBSCmd/DOORMAN.info`, commit (`feat(doorman): geometry-aware screen, stacked 40-column layout, marked 40-ok`).

- [ ] **Step 5: plain line-oriented doors**

`Doors/ami-stripper/index.ts` — the only hardcoded widths are the header (line 66 `const pad = 80 - left.length - right.length;`) and the rule (line 116 `'─'.repeat(80)`). At the top of the `door.onStart` handler (line 20):

```ts
  const termWidth = ctx.bbs?.getTerminalSize?.().width ?? 80;
```

then `const pad = termWidth - left.length - right.length;` and `'─'.repeat(termWidth)`; the per-file rows (line 105: 38-char path + 7-char size = 47) get `substring(0, termWidth - 12).padEnd(termWidth - 12)` for the path when `termWidth < 80`, existing literals otherwise. RED-test the extracted header/row builders in `web/backend/tests/doors/compact-40/ami-stripper.test.ts`. Rebuild dist.

`telnet`, `telnet-front`, `bbslink`, `bbslinkwall`, `phreakwars` — read each `index.ts`/`server.ts`, verify output is line-oriented (< 80-col literals; anything longer flows through the Task 4 emitText choke and soft-wraps). Fix any `repeat(80)`/`padEnd(7x)` chrome the same way as ami-stripper. A door passes when its own output contains no positioned drawing and no line-build over 40 that matters semantically; the emitText wrap is the fallback for prose.

Mark all six (only those verified) 40-ok:

```bash
cd /Users/spot/Code/amiexpress-web/web/backend && npx tsx -e "
const path = require('path');
const { applyTooltypes } = require('./src/utils/info-file.util');
for (const cmd of ['STRIP','TCONNECT','Telnet-Front','bbslink','linkwall','PHREAKWARS']) {
  applyTooltypes(path.resolve(__dirname, '../../Commands/BBSCmd/' + cmd + '.info'), [['MIN_COLUMNS','40']]);
  console.log(cmd + '.info marked MIN_COLUMNS=40');
}
"
```

(Command-file names verified against `Commands/BBSCmd/`: `STRIP.info`, `TCONNECT.info`, `Telnet-Front.info`, `bbslink.info`, `linkwall.info`, `PHREAKWARS.info`. `RIP.info` is NOT marked — rip-browser stays gated.) Commit per door group with dist rebuilds, files by name.

- [ ] **Step 6: freshness + suites**

Run the door-sdk-freshness protocol (sdk and Doors were edited). Then `cd sdk && npm test` (Task 2 baseline still green) and `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .`.

---

### Task 7: Text-screen reflow fallback for PETSCII sessions (never reflow art)

When a petsciiMode session displays a screen that has no `.seq` variant (only `.TXT` — which is most screens: the census found `.seq` art for just BBSTITLE and Logoff), the text path must reflow through the Task 4 wrapper — and ANSI art must be skipped with a clean token instead of smeared. The decision is a pure function so it is testable without driving `displayScreen`'s import graph.

**Files:**
- Create: `web/backend/src/utils/ansi-art-detect.util.ts`
- Modify: `web/backend/src/handlers/screen.handler.ts` (`displayScreen`: art gate after the RIP branch at :1950-1954; reflow hook after normalization at :2206)
- Test: `web/backend/tests/utils/ansi-art-detect.util.test.ts`

**Interfaces:**
- Produces:
  - `isAnsiArtScreen(content: string): boolean` — heuristic: >= 4 absolute-positioning sequences, OR block/box-drawing glyph density > 15% of non-whitespace printables.
  - `petsciiTextScreenPlan(content: string, session: { petsciiMode?: boolean }): 'art-skip' | 'reflow' | 'passthrough'`.
  - `ANSI_ART_SKIPPED_NOTICE = '[80-COLUMN ANSI SCREEN - SKIPPED]\r\n'` (ASCII token per the strategy plan).
- Consumes: `wrapForSession` (Task 4).

- [ ] **Step 1: Write failing tests**

Create `web/backend/tests/utils/ansi-art-detect.util.test.ts`:

```ts
import {
  isAnsiArtScreen,
  petsciiTextScreenPlan,
  ANSI_ART_SKIPPED_NOTICE,
} from '../../src/utils/ansi-art-detect.util';

const PROSE = 'Welcome to the board!\r\nToday we have new files in the Amiga conference.\r\nEnjoy your stay.\r\n';
const BLOCK_ART = ('█▄▀░▒▓'.repeat(40) + '\r\n').repeat(10);
const POSITIONED = '\x1b[1;1H\x1b[44m*\x1b[2;40H*\x1b[10;20H*\x1b[24;79H*\x1b[12;12Hcentered';

describe('isAnsiArtScreen', () => {
  it('prose is not art', () => expect(isAnsiArtScreen(PROSE)).toBe(false));
  it('block-glyph density marks art', () => expect(isAnsiArtScreen(BLOCK_ART)).toBe(true));
  it('cursor-positioned screens are art', () => expect(isAnsiArtScreen(POSITIONED)).toBe(true));
  it('a prose screen with one colored heading is still prose', () => {
    expect(isAnsiArtScreen('\x1b[33mBULLETIN 1\x1b[0m\r\n' + PROSE)).toBe(false);
  });
});

describe('petsciiTextScreenPlan', () => {
  const petscii = { petsciiMode: true };
  it('non-petscii sessions always pass through', () => {
    expect(petsciiTextScreenPlan(BLOCK_ART, {})).toBe('passthrough');
  });
  it('petscii + art skips; petscii + prose reflows', () => {
    expect(petsciiTextScreenPlan(BLOCK_ART, petscii)).toBe('art-skip');
    expect(petsciiTextScreenPlan(POSITIONED, petscii)).toBe('art-skip');
    expect(petsciiTextScreenPlan(PROSE, petscii)).toBe('reflow');
  });
});

describe('ANSI_ART_SKIPPED_NOTICE', () => {
  it('is the plan-specified ASCII token', () => {
    expect(ANSI_ART_SKIPPED_NOTICE).toBe('[80-COLUMN ANSI SCREEN - SKIPPED]\r\n');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (module missing).

- [ ] **Step 3: Implement**

Create `web/backend/src/utils/ansi-art-detect.util.ts`:

```ts
/**
 * ANSI-art detection for the PETSCII text fallback (C64/40-col Task 7).
 *
 * "Never emit smeared art" (strategy plan Phase 2.3): an 80-column ANSI
 * art screen reflowed to 40 is always wrong. Heuristic, tuned on this
 * board's own screens: absolute cursor positioning is a layout, and a
 * high density of block/box-drawing glyphs is a picture.
 */
export const ANSI_ART_SKIPPED_NOTICE = '[80-COLUMN ANSI SCREEN - SKIPPED]\r\n';

const CUP_RE = /\x1b\[[0-9]{1,3};[0-9]{1,3}H/g;
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** CP437-mapped block elements, box drawing, geometric shapes. */
const ART_GLYPH_RE = /[─-╿▀-▟■-◿]/g;

export function isAnsiArtScreen(content: string): boolean {
  const positioning = (content.match(CUP_RE) || []).length;
  if (positioning >= 4) return true;

  const stripped = content.replace(ANSI_RE, '');
  const printable = stripped.replace(/\s/g, '');
  if (printable.length === 0) return false;
  const artGlyphs = (printable.match(ART_GLYPH_RE) || []).length;
  return artGlyphs / printable.length > 0.15;
}

export function petsciiTextScreenPlan(
  content: string,
  session: { petsciiMode?: boolean }
): 'art-skip' | 'reflow' | 'passthrough' {
  if (!session?.petsciiMode) return 'passthrough';
  return isAnsiArtScreen(content) ? 'art-skip' : 'reflow';
}
```

- [ ] **Step 4: Run to green.**

- [ ] **Step 5: Wire into displayScreen**

In `web/backend/src/handlers/screen.handler.ts`, import `petsciiTextScreenPlan, ANSI_ART_SKIPPED_NOTICE` from `../utils/ansi-art-detect.util` and `wrapForSession` from `../utils/wrap-for-session.util`. Immediately after the RIP branch (after line 1954 `}`), insert:

```ts
    // === PETSCII text fallback (C64/40-col Task 7) ===
    // A petsciiMode session displaying a screen with no .seq variant:
    // prose reflows to the session width (below, after MCI parsing);
    // ANSI art is NEVER reflowed - skip it with the ASCII token. A
    // skipped art screen also skips its MCI commands: art screens carry
    // layout, not flow control, and smearing them is the worse failure.
    const petsciiTextPlan = petsciiTextScreenPlan(content, session);
    if (petsciiTextPlan === 'art-skip') {
      socket.emit('ansi-output', ANSI_ART_SKIPPED_NOTICE);
      screenFlowLog(screenName, `PETSCII session: 80-col ANSI art screen skipped (${filePath})`);
      return true;
    }
```

and after the line-ending normalization (line 2206 `parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');`), insert:

```ts
    // PETSCII text fallback: reflow the parsed prose to the session width
    // (wrapForSession is identity at >=80 and passes positioned payloads).
    if (petsciiTextPlan === 'reflow') {
      parsed = wrapForSession(parsed, session);
    }
```

- [ ] **Step 6: Type-check, run screen suites + full backend suite** (`npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir .`). The pure-function tests are the behavioral proof; existing displayScreen/displayFlow tests prove non-petscii sessions unchanged (`petsciiTextScreenPlan` returns `'passthrough'` and both insertions are no-ops). RED proof: revert the two insertions, confirm nothing fails EXCEPT nothing — the pure tests still pass — so the RED proof for the wiring is: temporarily make `petsciiTextScreenPlan` return `'art-skip'` unconditionally and confirm the existing 80-col displayFlow tests FAIL (screens get skipped), then restore. That failure demonstrates the wiring is live on the real path.

- [ ] **Step 7: Commit**

```bash
cd web/backend
git add src/utils/ansi-art-detect.util.ts src/handlers/screen.handler.ts tests/utils/ansi-art-detect.util.test.ts
git diff --cached --stat
git commit -m "feat(screens): PETSCII text-screen reflow with ANSI-art skip token"
```

---

### Task 8: Verification — automated 40-column sweep + manual C64 walk

- [ ] **Step 1: Automated sweep test**

Create `web/backend/tests/forty-col-sweep.test.ts` — one suite that drives every narrow builder from Tasks 1/4/5/7 at width 40 with adversarial data (60-char usernames, 100-char descriptions, empty strings) and asserts the single invariant:

```ts
import { printableLength } from '../../src/utils/wrap-for-session.util';
import { wrapForSession } from '../../src/utils/wrap-for-session.util';
import { narrowFileLines, narrowField, narrowRule } from '../../src/utils/table-format.util';
import { buildFileSearchLines } from '../../src/handlers/file/file.handler';
import { buildWhoRow } from '../../src/handlers/chat/chat-commands.handler';
import { buildMailScanRow } from '../../src/handlers/message/message-scan.handler';
import { buildProtocolMenuLines } from '../../src/handlers/commands/info-commands.handler';
import { formatDoorLine } from '../../src/handlers/door.handler';

const NARROW = { screenWidth: 40, petsciiMode: true } as any;
const LONG = 'X'.repeat(100);

function assertMax40(lines: string[]) {
  for (const l of lines) {
    expect(printableLength(l)).toBeLessThanOrEqual(40);
  }
}

describe('40-column sweep: no narrow surface ever exceeds 40 printable columns', () => {
  it('wrap choke', () => assertMax40(wrapForSession(LONG + ' ' + LONG, NARROW).split('\r\n')));
  it('file lines', () => assertMax40(narrowFileLines({ filename: LONG, sizeKB: 999999, description: LONG })));
  it('fields and rules', () => assertMax40([narrowField(LONG, LONG), narrowRule()]));
  it('file search', () => assertMax40(buildFileSearchLines(NARROW, {
    filename: LONG, size: 1 << 30, uploaddate: Date.now(), uploader: LONG, description: LONG, areaname: LONG,
  })));
  it('WHO rows', () => assertMax40([buildWhoRow({ username: LONG, realname: LONG }, 'Not Available', true)]));
  it('mail scan rows', () => assertMax40(buildMailScanRow({ isPrivate: false, from: LONG, subject: LONG, msgNum: 123456 }, true)));
  it('protocol menu', () => assertMax40(buildProtocolMenuLines(true)));
  it('door list rows', () => assertMax40([formatDoorLine({ name: LONG, command: LONG, type: 'TS', toolTypes: { MIN_COLUMNS: '40' } }, false, true).replace(/\x1b\[2K/, '')]));
});
```

(Adjust each import/signature to what Tasks 5-6 actually exported — the invariant, the adversarial inputs, and one `it` per builder are the requirement; add every extracted builder to this list.) Run RED-by-construction check: feed width-80 output of one builder through `printableLength` and confirm the assertion WOULD catch it (temporarily assert the wide `buildFileSearchLines` output ≤ 40 and watch it fail, then remove that line).

- [ ] **Step 2: Full automated pass, everything**

```bash
cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir .
cd ../../sdk && npm run build && npm test          # Task 2 baseline green = non-negotiable (b) held
cd ../packages/terminal && npm run build            # untouched, but the stack must still build
```

- [ ] **Step 3: Commit the sweep**

```bash
cd web/backend
git add tests/forty-col-sweep.test.ts
git diff --cached --stat
git commit -m "test(40col): adversarial 40-column sweep across every narrow builder"
```

- [ ] **Step 4: Manual C64 walk (sysop performs; agent may NOT check these off)**

Give the sysop this script verbatim:

```
REAL C64 PATH (SyncTERM in C64 mode, or CGTerm, telnet to the board):
 1. Connect. At the connect screen press <DEL>.
    EXPECT: PETSCII mode engages automatically (DEL probe), 40x25, blue screen.
 2. Log in normally.
    EXPECT: prompts legible, no line wraps mid-word, no ANSI garbage.
 3. From the main menu: F (file listings).
    EXPECT: two-line file rows - name+size, then description - nothing past col 40.
 4. WHO.
    EXPECT: username + status columns only, header rule 39 dashes.
 5. R, read a message.
    EXPECT: header as stacked "Field  : value" lines; body wrapped at 40.
 6. B (bulletin).
    EXPECT: a text bulletin reflows to 40; an ANSI-art bulletin shows
    [80-COLUMN ANSI SCREEN - SKIPPED] instead of smeared art.
 7. DOORS list.
    EXPECT: list fits 40 cols; adapted doors show a [40] marker.
 8. Launch a gated door (e.g. GMASTER).
    EXPECT: THIS DOOR NEEDS AN 80 COLUMN SCREEN - and straight back to the menu.
 9. Launch THEME.
    EXPECT: the theme picker renders inside 40 columns and works.
10. G, log off. EXPECT: clean logoff (Logoff.seq where present).

WEB SIMULATION PATH (browser):
11. Connect on the web terminal, answer P at the graphics prompt; repeat 3-9.

80-COLUMN NO-CHANGE SPOT-CHECK (any normal terminal):
12. Log in at 80 cols; run F, WHO, R, DOORS, launch one blessed door.
    EXPECT: pixel-identical to before this plan landed.
```

- [ ] **Step 5: Checklist report** — count every checkbox in this plan and report `N of M complete`; any open box is a FAILED plan until the sysop rules on it. Update this plan file's boxes as tasks land.

---

## Self-review (performed while writing; conflicts resolved inline)

**Spec coverage against the strategy plan:**
- Phase 1 (core flow): Task 4 (wrap choke, pagination audit confirmed already-done, viewer/AREXX widths) + Task 5 (tables, incl. the Phase 1.3 list: file listings two-line convention, WHO, user list, protocol menu, conference lists). Phase 1.4 menus = content work (sysop `.seq`) + Task 7 fallback.
- Phase 2 (screens): mechanism side = Task 7 (reflow fallback 2.2, art detection 2.3). 2.1 authoring and 2.4 tooling upgrade = out of scope per decision 2 (tooling "optional assist" — not scheduled).
- Phase 3 (blessed doors): Task 2 (baseline), Task 3 (XXS + responsive default + compact profile = "SDK compact mode"), Task 6 (per-door triage buckets, gate bucket via Task 1). 3.2 bridge and 3.4 C64 door input = out of scope per decisions 4/5.
- Phase 4 REVISED (blanket 68K gate): Task 1 default-closed covers ALL 68K + AREXX with zero `.info` edits; sysop opt-in via tooltype + reloadDoors preserved.
- Phase 5 (verification): Task 8.

**Spec conflicts hit and resolutions (also flagged inline):**
1. Strategy said tooltype "default 40-ok absent" — overridden to default-closed 80 (Task 1 rationale): permissive-absent violates non-negotiable (a) for all 55 needs-80 doors and repeats the tooltype-default trap.
2. Inventory classed rip-browser compact-possible — source shows a hardcoded 80x24 blessed screen (`Doors/rip-browser/app.ts:44-56`); it stays gated (Task 6 preamble).
3. Strategy wanted responsive "on by default" in the Screen — implemented at the `createScreen` seam instead, because the constructor's non-responsive branch has different height semantics (+2 rows) and flipping it would break every 80-col door (Task 3 preamble).
4. Strategy's "one choke point at emitText" vs art/doors/positioned output — the choke carries identity guards (>=80, door-owned, cursor-control payloads); operator-chat's positioned UI keeps its 79 (out-of-scope note).
5. Single-source-of-truth vs 80-col byte-identity for tables — narrow layouts share `table-format.util.ts`; 80-col literals stay in place and are pinned by tests (Task 5 design rule).

**Placeholder scan:** no TBDs; the two "read the file then apply the mechanism" door steps (doors-menu, bug-tracker internals) carry the concrete mechanism, extraction names, test files, RED/GREEN definitions, and a fully worked sibling example (theme-picker, door-manager) — the remaining work is anchoring, not design. AmigaGuide/AREXX-test placement give exact grep + edit shape where line numbers move daily.

**Type consistency:** `sessionColumns` defined once (Task 1) and consumed by Tasks 4, 5, 6; `MinColumnsDoorShape` matches both registries' actual field names (`toolTypes` per `door.handler.ts:4111-4146`, `doorInfo` per `:1152-1166`); `wrapLineToWidth`/`printableLength` shared by Tasks 4, 5, 8; `getCompactProfile` shared by Tasks 3, 6.
