---
date: 2026-09-02
topic: TRUE full-canvas PETSCII sessions (ANSI->PETSCII transducer + canvas-as-the-surface)
tags: [petscii, c64, terminal, transducer, canvas, telnet, doors]
status: draft
---

# PETSCII Full-Canvas Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a caller is a C64 (web `P` answer, or a real C64 over telnet), EVERYTHING the BBS emits - login prompt and echo, menus, prompts, command output, blessed doors - renders as PETSCII on the 40x25 C64 screen: the `PetsciiCanvas` for web, the raw byte stream for real hardware. No xterm underneath, no overlay hybrid.

**Architecture:** One stateful `AnsiToPetsciiTransducer` (ANSI/UTF-8/PUA text in, PETSCII bytes out) lives in the SDK as `@amiexpress/bbs-door-sdk/petscii` next to a MOVED `PetsciiMachine`, which the transducer embeds as its cursor/charset/reverse oracle so every emitted byte is computed against KERNAL-exact state. The backend telnet emitter runs one transducer per C64 session (replacing the strip-ANSI + case-swap path); the web terminal runs one per `P` session client-side and makes the canvas THE surface (xterm hidden, login state machine echoing onto the canvas). The overlay reducer is retired; the 40-col word-wrap choke point is pulled forward as the last task.

**Tech Stack:** TypeScript. SDK jest (`cd sdk && npm test`, ts-jest, tests in `sdk/tests/`). Backend jest (`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .`, swc). Frontend vitest+jsdom (`cd web/frontend && npm test`). React 18, canvas 2D, PetMe64 glyph atlas (already shipped). Node resolves `@amiexpress/bbs-door-sdk/*` through `node_modules/@amiexpress/bbs-door-sdk -> ../../sdk` (root and `packages/terminal`), package `exports` map -> `sdk/dist` (require) / `sdk/dist-esm` (import).

**Spec:** The sysop's requirement, verbatim intent: "Why are we doing a fake petscii mode, can't we do it properly?" - i.e. no `.seq`-art-over-xterm hybrid; the whole session is C64. Plus: `thoughts/shared/research/2026-09-01_true-petscii-reference.md` (C64 semantics; tables in sections 1-3 are normative), `thoughts/shared/plans/2026-09-01-true-petscii.md` (the shipped overhaul this plan builds on), `.superpowers/sdd/2026-09-01-true-petscii/progress.md` (rulings - the "overlay model" ruling for Critical 2 is the hybrid this plan REPLACES), `thoughts/shared/plans/2026-09-02-c64-40col-adaptation.md` Phase 3.2 (the bridge = this plan's transducer) and `2026-09-02-c64-40col-implementation.md` Task 4 (the wrap choke point = this plan's Task 10). Read all before starting.

## Global Constraints

- **THE NON-NEGOTIABLE: 80-column ANSI sessions are byte-for-byte unaffected.** Every new behavior is gated on `session.petsciiMode || session.terminalType === 'c64'` (backend) or the frontend surface being `'canvas'` (which only a PETSCII event can select). Proven by tests, not asserted: Task 5 pins the telnet emitter's non-PETSCII `ansi-output` branch byte-identical (strings and binary Buffers), Task 7 pins that no non-PETSCII event can flip the surface, Task 10 pins `wrapForSession` identity at width >= 80. These three tests stay green through every later task.
- **Shared working tree - 3 Claude sessions run here** (`thoughts/BOARD.md`). Post a claim for `sdk/petscii/**`, `sdk/tests/petscii/**`, `sdk/package.json`, `sdk/tsconfig*.json`, `packages/terminal/src/**`, `web/backend/src/utils/petscii.util.ts`, `web/backend/src/utils/c64-palette.ts`, `web/backend/src/server/{connection-emitter,c64-detected-handler}.ts`, `web/backend/src/index.ts` (session type + input path), `web/backend/tests/{petscii,handlers,server,utils}/petscii-*`, `web/backend/dev-scripts/jest.config.ts` BEFORE Task 1. Check Claims before touching `web/backend/src/handlers/**` (82 holds A-command/flags/download/logoff there; Task 5's four one-line `needsCharsetPrelude` deletions in `command.handler.ts`, `pre-login.ts`, `telnet-server.ts` are announced on the board first). Commit files BY NAME only (never `git add -A` / `git add .` / `git add -u`). Run `git diff --cached --stat` before EVERY commit and refuse if anything staged is outside your claim. NEVER `git stash` here (CRLF phantom files block `stash pop` permanently). One pusher at a time; commit locally, do not push until the sysop says "deploy". `git status` at plan time shows other sessions' dirt in `web/backend/src/handlers/command-handler/core.ts`, `web/backend/src/services/login-connect.service.ts` and their tests - do not touch, do not stage.
- **Type-check/build after every task, in dependency order:** `cd sdk && npm run build` (when `sdk/` was touched - it is ALWAYS touched from Task 1 on, and the backend/terminal/frontend all resolve `@amiexpress/bbs-door-sdk/petscii` through `sdk/dist` / `sdk/dist-esm`), then `cd web/backend && npx tsc --noEmit`, then `cd packages/terminal && npm run build`, then `cd web/frontend && npm run build:check && npm run build`.
- **Tests:** SDK `cd sdk && npm test` (glob `sdk/test/**/*.test.ts` + `sdk/tests/**/*.test.ts`). Backend `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir .` (glob: `roots: src+tests`, `**/?(*.)+(spec|test).ts` - every new backend test lands inside `web/backend/tests/`, so it IS in the CI glob). Frontend `cd web/frontend && npm test`.
- **Every behavior change ships a regression test, RED then GREEN:** write the failing test first, run it, see it fail with the expected message, implement, run to green. Before committing, temporarily revert the implementation, confirm the test fails, restore. Name tests after the user-visible symptom.
- **Door/SDK freshness:** after editing `sdk/` or `packages/terminal/`, run `.claude/skills/door-sdk-freshness/SKILL.md` before any "test it" claim. Port 3001 serves a BUILT frontend bundle: rebuild `sdk`, then `packages/terminal`, then `web/frontend`, restart the backend (clear `/var/folders/.../T/tsx-501/` if a change "does not apply"), hard-reload the browser.
- **No emojis anywhere.** BBS-visible output is ASCII tokens (`[OK]`, `[ERROR]`). Full English words in UI labels.
- **Never use Edit/Write on `.seq`, binary `.info`, or any high-bit file** (UTF-8 round-trip destroys bytes). Test fixtures build buffers in code with `Buffer.from([...])` / `Uint8Array.from([...])`.
- **C64 facts come from the reference doc** (`2026-09-01_true-petscii-reference.md` sections 1.1, 1.2, 2, 3) - do not improvise control codes, screen-code remaps or palette values. The `PetsciiMachine` is the executable form of those rules and is the test oracle for everything in this plan.
- Line numbers below are as of commit `8f54ed9d8`; each anchor also quotes the code - re-anchor by the quoted text if lines drifted.

## Architecture decisions (binding - each task argues from these)

1. **Shared module home is the SDK, not `packages/terminal`.** `web/backend/tsconfig.json` has `rootDir: ./src` + `include: src/**`, so backend RUNTIME code (the telnet emitter, Task 5) cannot import `packages/terminal/src/...` (TS6059) - only backend tests can, and tests are not the product. Both `web/backend` and `packages/terminal` already depend on `@amiexpress/bbs-door-sdk` (`file:../../sdk`, symlinked in `node_modules/@amiexpress/`), the SDK already exports pure browser-safe deep paths (`./engines/ui/theme` pattern, built to both `dist` and `dist-esm`), and `web/backend/src/handlers/admin/wizard.handler.ts:594` already does a static import from it. So: `sdk/petscii/` = `petscii-machine.ts` (MOVED, verbatim) + `c64-palette.ts` (MOVED; the backend twin becomes a re-export - the "twin palette" duplication dies) + `screen-codes.ts` + `ansi-to-petscii.ts` + `petscii-input.ts`, exported as `@amiexpress/bbs-door-sdk/petscii`. Backend jest maps that specifier to the SDK SOURCE (`moduleNameMapper`) so RED/GREEN cycles need no SDK rebuild; CI already builds the SDK before backend tests (`.github/workflows/backend-tests.yml`).
2. **The transducer embeds a `PetsciiMachine` as its oracle** ("feed-and-read the machine", no second cursor model). Every byte the transducer emits is also fed to its own machine; raw `petscii-bytes` that bypass it (`.seq` screens) are `observe()`d. Invariant, tested in Task 2: a fresh machine fed the transducer's output is state-identical to `transducer.machine`. Cursor moves are computed as deltas against that state, clamped to 40x25 (so CUD at the bottom row never scrolls and CUF at column 39 never wraps - the two places naive `$11`/`$1D` repetition corrupts the screen). Charset prelude is not a special case: "ensure bank 1 before printing text, ensure the PUA glyph's bank before printing it" against the oracle - the `needsCharsetPrelude` session flag is retired.
3. **Transduction runs server-side for telnet, client-side for web, SAME module.** Web login echo is client-generated (never reaches the server), so the browser needs a transducer regardless; a second server-side pass for web would be redundant and would also touch the socket.io emit wrapper shared by every 80-col web session. Telnet has exactly one choke point already (`buildConnectionEmitter`), keyed per session so `handleC64Detected`'s second emitter shares the same transducer state.
4. **xterm is HIDDEN (`display:none`) but kept mounted in canvas mode.** The RIP renderer, ZMODEM sentry, `ModemEmulator` and 54 status `term.write` sites hold the `Terminal` instance; unmounting would ripple through all of them. Hidden is enough: nothing in canvas mode reads xterm's screen. Every `term.write` site goes through one `writeTerm(text)` seam that routes to xterm (unchanged bytes) or transducer -> pace queue -> machine. The login state machine is extracted to a pure `processLoginKey` used by desktop keys, on-screen keyboard (`injectInput`) and the canvas alike; its echo goes through the same seam.
5. **`overlay-state.ts` is RETIRED** (deleted with its test), replaced by a two-state `surface-state.ts` (`'xterm' | 'canvas'`) whose only way into `'canvas'` is a PETSCII event. `font-gate.ts` is retired too: it existed to keep PetMe64 on an xterm that displayed PETSCII; xterm no longer displays PETSCII sessions. `key-bytes-to-command.ts` is retired in favor of the SDK's `petsciiInputToAscii`, which also serves the backend's real-C64 input path (cursor + function keys now translate to the ANSI sequences blessed's `parseKey` already understands).
6. **40-col wrap verdict:** the canvas mode is CORRECT without it - a 60-char line wraps onto a linked second row via KERNAL logical lines and RETURN lands on the row after (tested, Task 2, no corruption) - but prose breaks mid-word and every 80-col table is a 40-col keyhole. That is not what the sysop will accept as "properly", so the choke point ships in this plan as Task 10 (superseding 40-col plan Task 4 verbatim); table layouts, the XXS blessed tier and `MIN_COLUMNS` gating stay in the 40-col plan.

---

### Task 1: `sdk/petscii` - move `PetsciiMachine` + palette into the SDK as the shared PETSCII core

Pure move + wiring; no behavior change. After this task every consumer (terminal package, backend, tests) reaches the machine and palette through one path.

**Files:**
- Move (`git mv`): `packages/terminal/src/petscii/petscii-machine.ts` -> `sdk/petscii/petscii-machine.ts`; `packages/terminal/src/petscii/c64-palette.ts` -> `sdk/petscii/c64-palette.ts`; `web/backend/tests/petscii/petscii-machine.test.ts` -> `sdk/tests/petscii/petscii-machine.test.ts`
- Create: `sdk/petscii/screen-codes.ts`, `sdk/petscii/index.ts`
- Modify: `sdk/package.json` (exports), `sdk/tsconfig.json:19-30` (include), `sdk/tsconfig.client.json:11-30` (include), `web/backend/dev-scripts/jest.config.ts:27-29` (moduleNameMapper), `web/backend/src/utils/c64-palette.ts` (becomes a re-export), `packages/terminal/src/petscii/PetsciiCanvas.tsx:2-3`, `packages/terminal/src/components/BBSTerminal.tsx:17`, `packages/terminal/src/index.ts:37,40`
- Test: `sdk/tests/petscii/petscii-machine.test.ts` (moved), `sdk/tests/petscii/screen-codes.test.ts`

**Interfaces:**
- Produces (all exported from `@amiexpress/bbs-door-sdk/petscii`): `class PetsciiMachine` and `interface PetsciiMachineState` (unchanged API: `state`, `feed(bytes: Uint8Array | Buffer | number[]): void`, `reset(): void`, `onUpdate?: (fullRepaint: boolean) => void`); `C64_PALETTE_COLODORE`, `C64_PALETTE_PEPTO`, `PETSCII_COLOR_TO_VIC`, `vicToSgrForeground(vic, palette?)`, `vicToSgrBackground(vic, palette?)`; `printablePetsciiToScreenCode(p: number): number` (the machine's remap, domain `$20-$3F`, `$40-$7F`, `$A0-$FF`) and `screenCodeToPetscii(sc: number): number` (domain `0x00-0x7F`; out of domain returns `0x20`).
- Consumed by Tasks 2-9.

- [ ] **Step 1: Write the failing screen-code test**

Create `sdk/tests/petscii/screen-codes.test.ts`:

```ts
import { printablePetsciiToScreenCode, screenCodeToPetscii } from '../../petscii/screen-codes';

describe('PETSCII <-> screen code remap (reference doc section 2)', () => {
  it('maps the four printable quadrants and pi', () => {
    expect(printablePetsciiToScreenCode(0x20)).toBe(0x20);
    expect(printablePetsciiToScreenCode(0x41)).toBe(0x01); // unshifted A
    expect(printablePetsciiToScreenCode(0x60)).toBe(0x40);
    expect(printablePetsciiToScreenCode(0xA1)).toBe(0x61); // left half block
    expect(printablePetsciiToScreenCode(0xC1)).toBe(0x41); // shifted A
    expect(printablePetsciiToScreenCode(0xFF)).toBe(0x5E); // pi
  });
  it('screenCodeToPetscii is the inverse on the 0x00-0x7F glyph domain', () => {
    for (const sc of [0x00, 0x01, 0x1F, 0x20, 0x3F, 0x40, 0x5F, 0x60, 0x7F]) {
      expect(printablePetsciiToScreenCode(screenCodeToPetscii(sc))).toBe(sc);
    }
    expect(screenCodeToPetscii(0x81)).toBe(0x20); // reverse bit is the caller's job
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd sdk && npx jest tests/petscii/screen-codes.test.ts`
Expected: FAIL - `Cannot find module '../../petscii/screen-codes'`.

- [ ] **Step 3: Move the machine and palette, create screen-codes + barrel**

```bash
cd /Users/spot/Code/amiexpress-web
mkdir -p sdk/petscii sdk/tests/petscii
git mv packages/terminal/src/petscii/petscii-machine.ts sdk/petscii/petscii-machine.ts
git mv packages/terminal/src/petscii/c64-palette.ts sdk/petscii/c64-palette.ts
git mv web/backend/tests/petscii/petscii-machine.test.ts sdk/tests/petscii/petscii-machine.test.ts
```

Create `sdk/petscii/screen-codes.ts`:

```ts
/**
 * PETSCII <-> screen code remap (reference doc section 2, verified against
 * sta.c64.org/cbm64pettoscr.html). The VIC-II displays screen codes; the
 * byte stream carries PETSCII. Both directions live here so the machine,
 * the transducer and the backend's PUA renderer share one table.
 */

/** Printable PETSCII ($20-$3F, $40-$7F, $A0-$FF) -> screen code 0x00-0x7F. Callers filter control bytes first. */
export function printablePetsciiToScreenCode(p: number): number {
  if (p <= 0x3F) return p;
  if (p <= 0x5F) return p - 0x40;
  if (p <= 0x7F) return p - 0x20;
  if (p <= 0xBF) return p - 0x40;
  if (p <= 0xFE) return p - 0x80;
  return 0x5E; // $FF = pi
}

/** Screen code 0x00-0x7F -> PETSCII byte. Bit 7 (reverse) is a $12/$92 stream concern, never folded in here. */
export function screenCodeToPetscii(sc: number): number {
  if (sc <= 0x1F) return sc + 0x40;
  if (sc <= 0x3F) return sc;
  if (sc <= 0x5F) return sc + 0x80;
  if (sc <= 0x7F) return sc + 0x40;
  return 0x20;
}
```

In `sdk/petscii/petscii-machine.ts`: replace the private `function petsciiToScreenCode(p: number)` (lines 33-40) with `import { printablePetsciiToScreenCode } from './screen-codes';` and change the single call at line 95 to `printablePetsciiToScreenCode(b)`. Update the header comment path `thoughts/shared/research/...` (unchanged) and the import `from './c64-palette'` (unchanged - it moved alongside).

In `sdk/petscii/c64-palette.ts`: delete the line `* Twin of web/backend/src/utils/c64-palette.ts - keep values in sync.` and replace with `* The ONE copy: web/backend/src/utils/c64-palette.ts and packages/terminal re-export from here.`

Create `sdk/petscii/index.ts`:

```ts
/**
 * Shared PETSCII core (browser-safe, no Node imports): the KERNAL screen
 * machine, the VIC-II palette, screen-code remaps, the ANSI->PETSCII
 * transducer and the PETSCII-keyboard->ASCII input map. Consumed by
 * web/backend (telnet emitter), packages/terminal (canvas renderer) and
 * both test suites through `@amiexpress/bbs-door-sdk/petscii`.
 */
export { PetsciiMachine, type PetsciiMachineState } from './petscii-machine';
export {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from './c64-palette';
export { printablePetsciiToScreenCode, screenCodeToPetscii } from './screen-codes';
```

- [ ] **Step 4: Wire the package exports, tsconfig includes, jest mapper**

`sdk/package.json` - add after the `"./engines/ui/theme"` entry (line 72-77):

```json
    "./petscii": {
      "types": "./dist/petscii/index.d.ts",
      "import": "./dist-esm/petscii/index.js",
      "require": "./dist/petscii/index.js",
      "default": "./dist/petscii/index.js"
    },
```

`sdk/tsconfig.json` include (line 19-30): add `"petscii/**/*",` after `"index.ts",`.
`sdk/tsconfig.client.json` include (line 11-30): add `"petscii/**/*",` after `"core/**/*",` with the comment `// PETSCII core is pure and the terminal package's browser bundle imports it.`

`web/backend/dev-scripts/jest.config.ts` moduleNameMapper (lines 27-29) becomes:

```ts
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // The PETSCII core is imported by backend source through the package
    // exports map (sdk/dist). Tests resolve it to the SDK SOURCE instead so a
    // RED/GREEN cycle never depends on a stale sdk/dist build.
    '^@amiexpress/bbs-door-sdk/petscii$': '<rootDir>/../../sdk/petscii/index.ts',
  },
```

`web/backend/src/utils/c64-palette.ts` - replace the whole file with:

```ts
/**
 * VIC-II palette + PETSCII color byte map. The one copy lives in the SDK
 * (sdk/petscii/c64-palette.ts, exported as @amiexpress/bbs-door-sdk/petscii);
 * this module re-exports it so existing backend imports keep working.
 */
export {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from '@amiexpress/bbs-door-sdk/petscii';
```

`packages/terminal/src/petscii/PetsciiCanvas.tsx` lines 2-3 become:

```ts
import type { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { C64_PALETTE_COLODORE } from '@amiexpress/bbs-door-sdk/petscii';
```

`packages/terminal/src/components/BBSTerminal.tsx:17` becomes `import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';`.
`packages/terminal/src/index.ts:37` becomes `export { PetsciiMachine, type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';` and line 40 becomes `export { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from '@amiexpress/bbs-door-sdk/petscii';`.

`sdk/tests/petscii/petscii-machine.test.ts:1` becomes `import { PetsciiMachine } from '../../petscii/petscii-machine';`.

Run `grep -rn "packages/terminal/src/petscii/c64-palette\|packages/terminal/src/petscii/petscii-machine" web/backend/tests packages web/frontend/src` - every remaining hit is re-pointed to `@amiexpress/bbs-door-sdk/petscii` (backend tests) or the relative SDK path (SDK tests).

- [ ] **Step 5: Build the SDK, run both suites to green**

Run: `cd sdk && npm run build && npx jest tests/petscii` - Expected: screen-codes + machine tests PASS (the machine suite is the unchanged 12+ cases, now under ts-jest).
Run: `cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern=petscii` - Expected: PASS (palette re-export resolves via the mapper).
Run: `cd packages/terminal && npm run build && cd ../../web/frontend && npm run build:check` - Expected: clean (TypeScript resolves `@amiexpress/bbs-door-sdk/petscii` to `sdk/petscii/index.ts` through the symlink exactly as `/client` resolves today; vite resolves the `import` condition to `sdk/dist-esm/petscii/index.js`, which Step 5's SDK build produced). If vite reports the module missing, the `dist-esm` build did not include `petscii/**` - fix `tsconfig.client.json`, never alias.

- [ ] **Step 6: Commit**

```bash
git diff --cached --stat   # must list ONLY the files below
git add sdk/petscii/petscii-machine.ts sdk/petscii/c64-palette.ts sdk/petscii/screen-codes.ts sdk/petscii/index.ts \
  sdk/tests/petscii/petscii-machine.test.ts sdk/tests/petscii/screen-codes.test.ts \
  sdk/package.json sdk/tsconfig.json sdk/tsconfig.client.json \
  web/backend/dev-scripts/jest.config.ts web/backend/src/utils/c64-palette.ts \
  packages/terminal/src/petscii/PetsciiCanvas.tsx packages/terminal/src/components/BBSTerminal.tsx packages/terminal/src/index.ts
git commit -m "refactor(petscii): PetsciiMachine and the VIC palette move into the SDK as the one shared PETSCII core"
```

---

### Task 2: `AnsiToPetsciiTransducer` core - CSI parser, SGR, text, CR/LF, charset ensure, oracle lockstep

The transducer's spine. Cursor-position/erase/graphics/PUA arrive in Task 3; this task lands the parser skeleton, colors, reverse, text, newlines and the lockstep invariant every later test relies on.

**Files:**
- Create: `sdk/petscii/ansi-to-petscii.ts`, `sdk/petscii/unicode-to-petscii.ts` (empty table; Task 3 fills it)
- Modify: `sdk/petscii/index.ts` (export), `sdk/petscii/petscii-machine.ts:188-193` (the private `logicalLineEnd` becomes the public `logicalLineEndRow`)
- Test: `sdk/tests/petscii/ansi-to-petscii.test.ts`, `sdk/tests/petscii/petscii-machine.test.ts` (one accessor case)

**Interfaces:**
- Produces:
  - `class AnsiToPetsciiTransducer { constructor(opts?: { palette?: readonly string[] }); readonly machine: PetsciiMachine; transduce(text: string): Uint8Array; observe(bytes: Uint8Array | number[]): void; flush(): Uint8Array; reset(): void }`
  - `nearestVicForRgb(r: number, g: number, b: number, palette?: readonly string[]): number`
  - `vicColorToPetscii(vic: number): number`
  - `sgrColorToVic(code: number, bold: boolean): number | null` (30-37, 39, 90-97)
  - `xterm256ToRgb(n: number): [number, number, number]`
  - `PetsciiMachine.logicalLineEndRow(y: number): number` - last physical row of the logical line containing row y (public accessor over the existing private `logicalLineEnd`).
- Semantics fixed here: text prints in charset bank 1 (`$0E` emitted only when the oracle is not already in bank 1); ASCII a-z -> `$41-$5A`, A-Z -> `$C1-$DA`; `\r\n` and lone `\n` -> `$0D`, EXCEPT when the oracle says the cursor row is not the last row of its logical line (a previous print wrapped through column 39 and linked the row below - the KERNAL's RETURN would then land two rows down): then `moveTo(0, y+1)` deltas instead, which is what ANSI means; lone `\r` -> `$9D` x cursorX (column 0, SAME row - ANSI CR does not advance); `\b`/`0x7F` -> `$9D`; `\t` -> spaces to the next multiple of 8 (capped at column 39); other C0 dropped; SGR 0 -> reverse off + pen white(1); SGR 7/27 -> `$12`/`$92` (only when the oracle's reverse state differs); after the machine's RETURN cancels reverse, the next printable re-asserts `$12` if the ANSI stream still has SGR 7 latched; bg colors (40-47, 100-107, 48;x) DROPPED (C64 has no per-cell background; rendering them as reverse would invert every fg-on-panel span, unreadable); bold + 30-37 -> the 90-97 bright counterpart; `38;2;r;g;b` and `38;5;n` -> nearest VIC by squared RGB distance in the Colodore palette; unknown SGR dropped.

- [ ] **Step 1: Write the failing core tests**

Create `sdk/tests/petscii/ansi-to-petscii.test.ts`:

```ts
import { AnsiToPetsciiTransducer, nearestVicForRgb, sgrColorToVic } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

/** Run text through a fresh transducer and replay its output into a fresh machine (the display side). */
export function run(text: string) {
  const t = new AnsiToPetsciiTransducer();
  const out = Array.from(t.transduce(text));
  const display = new PetsciiMachine();
  display.feed(out);
  return { t, out, display };
}
export const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
export const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];
/** Screen code of an ASCII letter printed in charset bank 1. */
export const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);
export const scLower = (ch: string) => 0x01 + (ch.charCodeAt(0) - 0x61);

function sameState(a: PetsciiMachine, b: PetsciiMachine) {
  expect(Array.from(a.state.screen)).toEqual(Array.from(b.state.screen));
  expect(Array.from(a.state.colorRam)).toEqual(Array.from(b.state.colorRam));
  expect([a.state.cursorX, a.state.cursorY, a.state.charsetBank, a.state.reverse, a.state.pen])
    .toEqual([b.state.cursorX, b.state.cursorY, b.state.charsetBank, b.state.reverse, b.state.pen]);
}

describe('AnsiToPetsciiTransducer core', () => {
  it('oracle lockstep: a display machine fed the output is state-identical to the transducer machine', () => {
    const frames = [
      'Username: ', 'spot\r\n', '\x1b[1;32mWelcome\x1b[0m back\r\n',
      '\x1b[7mREV\x1b[27m plain\r\n', 'abc\rX', 'tab\there\r\n', '\x1b[31m' + 'w'.repeat(60) + '\r\nnext',
    ];
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    for (const f of frames) display.feed(t.transduce(f));
    sameState(t.machine, display);
  });

  it('login prompt: charset prelude once, case-swapped text, cursor after the prompt', () => {
    const { t, out, display } = run('Username: ');
    expect(out[0]).toBe(0x0E);
    expect(out.slice(1)).toEqual([0xD5, 0x53, 0x45, 0x52, 0x4E, 0x41, 0x4D, 0x45, 0x3A, 0x20]);
    expect(cell(display, 0, 0)).toBe(scUpper('U'));
    expect(cell(display, 1, 0)).toBe(scLower('s'));
    expect(display.state.cursorX).toBe(10);
    expect(Array.from(t.transduce('x'))).toEqual([0x58]); // no second prelude
  });

  it('CRLF is one RETURN, lone LF is one RETURN', () => {
    expect(run('a\r\nb').out).toEqual([0x0E, 0x41, 0x0D, 0x42]);
    expect(run('a\nb').out).toEqual([0x0E, 0x41, 0x0D, 0x42]);
  });

  it('lone CR returns to column 0 of the SAME row (the flag-pause overwrite idiom)', () => {
    const { display } = run('abc\rX');
    expect(cell(display, 0, 0)).toBe(scUpper('X'));
    expect(cell(display, 1, 0)).toBe(scLower('b'));
    expect(display.state.cursorY).toBe(0);
  });

  it('backspace-space-backspace erases the last typed character', () => {
    const { display } = run('ab\b \b');
    expect(cell(display, 0, 0)).toBe(scLower('a'));
    expect(cell(display, 1, 0)).toBe(0x20);
    expect(display.state.cursorX).toBe(1);
  });

  it('SGR foreground colors land in color RAM; bg and unknown SGR are dropped', () => {
    const { display } = run('\x1b[31mR\x1b[44;33mY\x1b[0mW');
    expect(color(display, 0, 0)).toBe(2);  // red
    expect(color(display, 1, 0)).toBe(7);  // yellow (bg 44 ignored)
    expect(color(display, 2, 0)).toBe(1);  // SGR 0 -> white
  });

  it('bold + basic color selects the bright VIC color; truecolor and 256-color snap to nearest', () => {
    expect(sgrColorToVic(31, true)).toBe(10);   // light red
    expect(sgrColorToVic(31, false)).toBe(2);
    expect(nearestVicForRgb(129, 51, 56)).toBe(2);   // exact Colodore red
    expect(nearestVicForRgb(90, 172, 80)).toBe(5);   // near Colodore green
    expect(color(run('\x1b[38;5;10mg').display, 0, 0)).toBe(13); // 256-color bright green -> light green
  });

  it('a color byte is only emitted when the pen actually changes', () => {
    const { out } = run('\x1b[31m\x1b[31mab');
    expect(out.filter((b) => b === 0x1C)).toHaveLength(1);
  });

  it('reverse survives RETURN: the KERNAL cancels it, the transducer re-asserts it for the next printable', () => {
    const { out, display } = run('\x1b[7mA\r\nB\x1b[27mC');
    expect(cell(display, 0, 0) & 0x80).toBe(0x80);
    expect(cell(display, 0, 1) & 0x80).toBe(0x80);
    expect(cell(display, 1, 1) & 0x80).toBe(0);
    expect(out.filter((b) => b === 0x12)).toHaveLength(2);
  });

  it('a 60-column line wraps onto a linked row and RETURN lands on the row after (no corruption)', () => {
    const { display } = run('w'.repeat(60) + '\r\nN');
    expect(cell(display, 19, 1)).toBe(scLower('w'));
    expect(cell(display, 0, 2)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(2);
  });

  it('escape split across chunks is held, never printed as garbage', () => {
    const t = new AnsiToPetsciiTransducer();
    const a = Array.from(t.transduce('x\x1b[3'));
    const b = Array.from(t.transduce('1mR'));
    expect(a).toEqual([0x0E, 0x58]);
    expect(b).toEqual([0x1C, 0xD2]);
  });

  it('CR at a chunk end is held until the next chunk decides CRLF vs lone CR; flush resolves it', () => {
    const t = new AnsiToPetsciiTransducer();
    expect(Array.from(t.transduce('ab\r'))).toEqual([0x0E, 0x41, 0x42]);
    expect(Array.from(t.transduce('\nc'))).toEqual([0x0D, 0x43]);
    t.transduce('x\r');                                   // cursor is now (2,1): 'c', 'x'
    expect(Array.from(t.flush())).toEqual([0x9D, 0x9D]);  // lone CR: back to column 0 of the same row
  });

  it('RETURN from the first row of a KERNAL-linked pair goes to the next physical row, as ANSI does', () => {
    // 60 chars wrap and link row 1 to row 0; cursor up onto row 0; a RETURN there would jump to row 2 on a C64.
    const { display, t } = run('w'.repeat(60) + '\x1b[Ax\r\nN');
    expect(t.machine.logicalLineEndRow(0)).toBe(1);
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(1);
  });

  it('observe() keeps the oracle in step with raw .seq bytes that bypassed the transducer', () => {
    const t = new AnsiToPetsciiTransducer();
    t.transduce('a');                 // bank 1, pen 14
    t.observe([0x8E, 0x1C]);          // the .seq switched to graphics bank and red
    expect(Array.from(t.transduce('b'))).toEqual([0x0E, 0x42]); // bank back to 1; the pen stays red until ANSI asks otherwise
    expect(t.machine.state.pen).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd sdk && npx jest tests/petscii/ansi-to-petscii.test.ts`
Expected: FAIL - `Cannot find module '../../petscii/ansi-to-petscii'`.

- [ ] **Step 3: Implement the transducer core**

Create `sdk/petscii/ansi-to-petscii.ts`:

```ts
/**
 * ANSI/UTF-8/PUA text stream -> PETSCII byte stream.
 *
 * Stateful and KERNAL-exact: every byte this class emits is also fed to its
 * own PetsciiMachine (`machine`), so cursor moves, color and reverse-video
 * bytes are computed against the state a real C64 (or the web canvas fed
 * the same bytes) is in - not against what the ANSI stream assumes. Raw
 * PETSCII that bypasses the transducer (.seq screens) must be `observe()`d
 * so the oracle stays in step.
 *
 * One instance per session. Backend: connection-emitter.ts keeps one on the
 * BBSSession for real C64 telnet callers. Frontend: BBSTerminal.tsx keeps
 * one per web 'P' session and feeds its output to the display machine.
 *
 * Reference: thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * sections 1.1 (control codes), 1.2-1.3 (KERNAL semantics), 3 (palette).
 */
import { PetsciiMachine } from './petscii-machine';
import { C64_PALETTE_COLODORE, PETSCII_COLOR_TO_VIC } from './c64-palette';
import { screenCodeToPetscii } from './screen-codes';
import { UNICODE_TO_PETSCII } from './unicode-to-petscii';

const COLS = 40;
const ROWS = 25;
const ESC = '\x1b';

export interface AnsiToPetsciiOptions {
  /** VIC-II palette used for truecolor/256-color nearest matching. Defaults to Colodore. */
  palette?: readonly string[];
}

/** VIC index -> PETSCII color control byte (inverse of PETSCII_COLOR_TO_VIC; every index has exactly one byte). */
const VIC_TO_PETSCII_COLOR: number[] = (() => {
  const table = new Array<number>(16).fill(0x05);
  for (const [byte, vic] of Object.entries(PETSCII_COLOR_TO_VIC)) table[vic] = Number(byte);
  return table;
})();

export function vicColorToPetscii(vic: number): number {
  return VIC_TO_PETSCII_COLOR[vic & 0x0F];
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Nearest VIC index by squared RGB distance; an exact palette match wins immediately. */
export function nearestVicForRgb(r: number, g: number, b: number, palette: readonly string[] = C64_PALETTE_COLODORE): number {
  let best = 0;
  let bestDist = Infinity;
  for (let vic = 0; vic < 16; vic++) {
    const [pr, pg, pb] = hexToRgb(palette[vic]);
    if (pr === r && pg === g && pb === b) return vic;
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestDist) { bestDist = d; best = vic; }
  }
  return best;
}

// SGR 30-37 -> VIC (dim), 90-97 -> VIC (bright). 33/93 both yellow (C64 has one), 37 -> light grey, 97 -> white.
const SGR_DIM: number[] = [0, 2, 5, 7, 6, 4, 3, 15];
const SGR_BRIGHT: number[] = [11, 10, 13, 7, 14, 4, 3, 1];

export function sgrColorToVic(code: number, bold: boolean): number | null {
  if (code === 39) return 1;
  if (code >= 30 && code <= 37) return (bold ? SGR_BRIGHT : SGR_DIM)[code - 30];
  if (code >= 90 && code <= 97) return SGR_BRIGHT[code - 90];
  return null;
}

/** xterm 256-color index -> RGB: 0-15 via the SGR tables' Colodore colors, 16-231 the 6x6x6 cube, 232-255 the grey ramp. */
export function xterm256ToRgb(n: number): [number, number, number] {
  if (n < 16) {
    const vic = n < 8 ? SGR_DIM[n] : SGR_BRIGHT[n - 8];
    return hexToRgb(C64_PALETTE_COLODORE[vic]);
  }
  if (n <= 231) {
    const i = n - 16;
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    return [v(Math.floor(i / 36)), v(Math.floor(i / 6) % 6), v(i % 6)];
  }
  const grey = 8 + 10 * (Math.min(n, 255) - 232);
  return [grey, grey, grey];
}

export class AnsiToPetsciiTransducer {
  readonly machine = new PetsciiMachine();
  private readonly palette: readonly string[];
  /** Incomplete escape sequence or trailing CR held until the next chunk. */
  private pending = '';
  private bold = false;
  /** What the ANSI stream asked for (SGR 7 latched); the oracle's `reverse` is what the C64 currently has. */
  private ansiReverse = false;
  private savedCursor: { x: number; y: number } | null = null;

  constructor(opts: AnsiToPetsciiOptions = {}) {
    this.palette = opts.palette ?? C64_PALETTE_COLODORE;
  }

  reset(): void {
    this.machine.reset();
    this.pending = '';
    this.bold = false;
    this.ansiReverse = false;
    this.savedCursor = null;
  }

  /** Raw PETSCII bytes that reached the terminal without passing through transduce(). */
  observe(bytes: Uint8Array | number[]): void {
    this.machine.feed(bytes);
  }

  /** Resolve anything held across chunks (a trailing CR becomes a lone CR; a partial escape is dropped). */
  flush(): Uint8Array {
    const out: number[] = [];
    if (this.pending === '\r') this.carriageOnly(out);
    this.pending = '';
    return Uint8Array.from(out);
  }

  transduce(text: string): Uint8Array {
    const out: number[] = [];
    const s = this.pending + text;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const code = s.codePointAt(i) as number;
      if (ch === ESC) {
        const consumed = this.escape(s, i, out);
        if (consumed === 0) { this.pending = s.slice(i); break; }
        i += consumed;
        continue;
      }
      if (ch === '\r') {
        if (i + 1 >= s.length) { this.pending = '\r'; break; }
        if (s[i + 1] === '\n') { this.newline(out); i += 2; continue; }
        this.carriageOnly(out);
        i++;
        continue;
      }
      if (ch === '\n') { this.newline(out); i++; continue; }
      if (code === 0x08 || code === 0x7F) { this.emit(out, 0x9D); i++; continue; }
      if (ch === '\t') {
        const x = this.machine.state.cursorX;
        const next = Math.min(COLS - 1, (Math.floor(x / 8) + 1) * 8);
        for (let k = x; k < next; k++) this.printByte(out, 0x20);
        i++;
        continue;
      }
      if (code < 0x20) { i++; continue; }
      if (code >= 0xE000 && code <= 0xE1FF) { this.printPua(out, code); i++; continue; }
      this.printChar(out, code);
      i += code > 0xFFFF ? 2 : 1;
    }
    return Uint8Array.from(out);
  }

  // ---- byte emission against the oracle -------------------------------

  private emit(out: number[], byte: number): void {
    out.push(byte);
    this.machine.feed([byte]);
  }

  private ensureBank(bank: 0 | 1, out: number[]): void {
    if (this.machine.state.charsetBank !== bank) this.emit(out, bank === 1 ? 0x0E : 0x8E);
  }

  private setReverse(on: boolean, out: number[]): void {
    if (this.machine.state.reverse !== on) this.emit(out, on ? 0x12 : 0x92);
  }

  private setPen(vic: number, out: number[]): void {
    if (this.machine.state.pen !== vic) this.emit(out, vicColorToPetscii(vic));
  }

  /** Print one PETSCII byte as text: bank 1, reverse re-asserted from the ANSI state (RETURN cancels it on the C64). */
  private printByte(out: number[], byte: number): void {
    this.ensureBank(1, out);
    this.setReverse(this.ansiReverse, out);
    this.emit(out, byte);
  }

  /**
   * ANSI newline = column 0 of the NEXT physical row (scrolling at the
   * bottom). The KERNAL's RETURN goes to the row after the END of the
   * logical line, so when the oracle says the cursor row is linked to the
   * row below (a print wrapped through column 39 earlier) a $0D would skip
   * a row; deltas are exact there. At the bottom row $0D is the only way
   * to scroll, and it is exact (the last row always ends its own line).
   */
  private newline(out: number[]): void {
    const st = this.machine.state;
    if (st.cursorY < ROWS - 1 && this.machine.logicalLineEndRow(st.cursorY) !== st.cursorY) {
      this.moveTo(0, st.cursorY + 1, out);
      return;
    }
    this.emit(out, 0x0D);
  }

  /** Lone CR: column 0 of the same row. $9D never crosses a row boundary here because x lefts from column x stop at 0. */
  private carriageOnly(out: number[]): void {
    const x = this.machine.state.cursorX;
    for (let k = 0; k < x; k++) this.emit(out, 0x9D);
  }

  private printChar(out: number[], code: number): void {
    if (code >= 0x61 && code <= 0x7A) return this.printByte(out, code - 0x20);   // a-z -> $41-$5A
    if (code >= 0x41 && code <= 0x5A) return this.printByte(out, code + 0x80);   // A-Z -> $C1-$DA
    if (code >= 0x20 && code <= 0x3F) return this.printByte(out, code);
    switch (code) {
      case 0x40: case 0x5B: case 0x5D: return this.printByte(out, code); // @ [ ]
      case 0x5C: return this.printByte(out, 0x2F);   // backslash: PETSCII has pound there -> '/'
      case 0x5E: return this.printByte(out, 0x5E);   // ^ -> up-arrow glyph
      case 0x5F: return this.printByte(out, 0xA4);   // _ -> lower one-eighth block (PETSCII underline)
      case 0x60: return this.printByte(out, 0x27);   // ` -> '
      case 0x7B: return this.printByte(out, 0x28);   // { -> (
      case 0x7D: return this.printByte(out, 0x29);   // } -> )
      case 0x7C: return this.printByte(out, 0xDD);   // | -> vertical bar graphic (same glyph in both banks)
      case 0x7E: return this.printByte(out, 0x2D);   // ~ -> -
    }
    const mapped = UNICODE_TO_PETSCII.get(String.fromCodePoint(code));
    if (mapped === undefined) return this.printByte(out, 0x3F);          // unsupported glyph -> '?'
    if (typeof mapped === 'number') return this.printByte(out, mapped);
    // Glyph only exists as the inverse of another PETSCII glyph.
    this.ensureBank(1, out);
    this.setReverse(true, out);
    this.emit(out, mapped.rvs);
    this.setReverse(this.ansiReverse, out);
  }

  /** PetMe64 PUA: U+E000-E0FF bank 0 / U+E100-E1FF bank 1 screen codes, bit 7 = reverse. */
  private printPua(out: number[], code: number): void {
    const bank: 0 | 1 = code >= 0xE100 ? 1 : 0;
    const sc = code & 0xFF;
    this.ensureBank(bank, out);
    this.setReverse((sc & 0x80) !== 0, out);
    this.emit(out, screenCodeToPetscii(sc & 0x7F));
  }

  // ---- escape sequences ------------------------------------------------

  /** Returns chars consumed, or 0 when the sequence is incomplete (caller holds the tail). */
  private escape(s: string, i: number, out: number[]): number {
    const next = s[i + 1];
    if (next === undefined) return 0;
    if (next === '[') {
      let j = i + 2;
      let params = '';
      while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3F) params += s[j++];
      if (j >= s.length) return 0;
      const final = s[j];
      this.csi(params, final, out);
      return j - i + 1;
    }
    if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      // OSC / DCS / APC / PM / SOS: swallow through BEL or ESC \ (hold if unterminated).
      for (let j = i + 2; j < s.length; j++) {
        if (s[j] === '\x07') return j - i + 1;
        if (s[j] === ESC && s[j + 1] === '\\') return j - i + 2;
        if (s[j] === ESC && s[j + 1] === undefined) return 0;
      }
      return 0;
    }
    if (next === '(' || next === ')' || next === '*' || next === '+') return s[i + 2] === undefined ? 0 : 3; // charset designation
    if (next === '7') { const st = this.machine.state; this.savedCursor = { x: st.cursorX, y: st.cursorY }; return 2; }
    if (next === '8') { if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return 2; }
    if (next === 'M') { const st = this.machine.state; this.moveTo(st.cursorX, Math.max(0, st.cursorY - 1), out); return 2; }
    if (next === 'c') { this.emit(out, 0x93); this.bold = false; this.ansiReverse = false; return 2; }
    return 2; // ESC =, ESC >, ESC D, ESC E, ...: no C64 equivalent, dropped
  }

  private csi(params: string, final: string, out: number[]): void {
    const isPrivate = params.startsWith('?');
    const nums = (isPrivate ? params.slice(1) : params).split(';').map((p) => (p === '' ? NaN : parseInt(p, 10)));
    const n = (idx: number, dflt: number) => (Number.isNaN(nums[idx]) || nums[idx] === undefined ? dflt : nums[idx]);
    const st = this.machine.state;
    if (isPrivate) {
      // ?25 cursor show/hide, ?1000-1006 mouse, ?7 wrap: no C64 equivalent. ?47/?1049 alternate screen:
      // blessed repaints a full frame on entry and the BBS repaints on exit - a clear is the honest translation.
      if ((n(0, 0) === 47 || n(0, 0) === 1049) && (final === 'h' || final === 'l')) this.clearKeepingCursor(out, 0, 0);
      return;
    }
    switch (final) {
      case 'm': return this.sgr(nums.map((v) => (Number.isNaN(v) ? 0 : v)), out);
      case 'A': return this.moveTo(st.cursorX, Math.max(0, st.cursorY - n(0, 1)), out);
      case 'B': return this.moveTo(st.cursorX, Math.min(ROWS - 1, st.cursorY + n(0, 1)), out);
      case 'C': return this.moveTo(Math.min(COLS - 1, st.cursorX + n(0, 1)), st.cursorY, out);
      case 'D': return this.moveTo(Math.max(0, st.cursorX - n(0, 1)), st.cursorY, out);
      case 'E': return this.moveTo(0, Math.min(ROWS - 1, st.cursorY + n(0, 1)), out);
      case 'F': return this.moveTo(0, Math.max(0, st.cursorY - n(0, 1)), out);
      case 'G': return this.moveTo(this.clampCol(n(0, 1) - 1), st.cursorY, out);
      case 'd': return this.moveTo(st.cursorX, this.clampRow(n(0, 1) - 1), out);
      case 'H': case 'f': return this.moveTo(this.clampCol(n(1, 1) - 1), this.clampRow(n(0, 1) - 1), out);
      case 'J': return this.eraseDisplay(n(0, 0), out);
      case 'K': return this.eraseLine(n(0, 0), out);
      case 'X': return this.eraseChars(n(0, 1), out);
      case 's': this.savedCursor = { x: st.cursorX, y: st.cursorY }; return;
      case 'u': if (this.savedCursor) this.moveTo(this.savedCursor.x, this.savedCursor.y, out); return;
      default: return; // L M @ P (insert/delete line/char), r (scroll region), n, t, h, l: dropped, documented
    }
  }

  private clampCol(x: number): number { return Math.max(0, Math.min(COLS - 1, x)); }
  private clampRow(y: number): number { return Math.max(0, Math.min(ROWS - 1, y)); }

  /**
   * Absolute positioning as deltas against the oracle. HOME ($13) when the
   * target is (0,0). Deltas never wrap or scroll: the target is inside
   * 40x25, so $1D stops before column 40, $11 stops before row 25, and $9D/$91
   * are only emitted when the cursor is right of / below the target.
   */
  private moveTo(x: number, y: number, out: number[]): void {
    const st = this.machine.state;
    if (x === 0 && y === 0) { if (st.cursorX !== 0 || st.cursorY !== 0) this.emit(out, 0x13); return; }
    while (st.cursorY < y) this.emit(out, 0x11);
    while (st.cursorY > y) this.emit(out, 0x91);
    while (st.cursorX < x) this.emit(out, 0x1D);
    while (st.cursorX > x) this.emit(out, 0x9D);
  }

  private sgr(codes: number[], out: number[]): void {
    if (codes.length === 0) codes = [0];
    let p = 0;
    while (p < codes.length) {
      const c = codes[p];
      if (c === 0) { this.bold = false; this.ansiReverse = false; this.setReverse(false, out); this.setPen(1, out); p++; continue; }
      if (c === 1) { this.bold = true; p++; continue; }
      if (c === 22) { this.bold = false; p++; continue; }
      if (c === 7) { this.ansiReverse = true; this.setReverse(true, out); p++; continue; }
      if (c === 27) { this.ansiReverse = false; this.setReverse(false, out); p++; continue; }
      if (c === 38 || c === 48) {
        const mode = codes[p + 1];
        let rgb: [number, number, number] | null = null;
        let step = 1;
        if (mode === 2 && p + 4 < codes.length) { rgb = [codes[p + 2], codes[p + 3], codes[p + 4]]; step = 5; }
        else if (mode === 5 && p + 2 < codes.length) { rgb = xterm256ToRgb(codes[p + 2]); step = 3; }
        if (c === 38 && rgb) this.setPen(nearestVicForRgb(rgb[0], rgb[1], rgb[2], this.palette), out);
        p += step;
        continue;
      }
      const vic = sgrColorToVic(c, this.bold);
      if (vic !== null) this.setPen(vic, out);
      p++; // 40-47, 49, 100-107 (bg), 2/3/4/5/24/25 ... : no C64 equivalent, dropped
    }
  }

  // ---- erase (Task 3 fills these in; stubs keep Task 2 compiling) --------
  private eraseDisplay(_mode: number, _out: number[]): void {}
  private eraseLine(_mode: number, _out: number[]): void {}
  private eraseChars(_count: number, _out: number[]): void {}
  private clearKeepingCursor(_out: number[], _x: number, _y: number): void {}
}
```

In `sdk/petscii/petscii-machine.ts` rename the private `logicalLineEnd(y)` (line 189) to a public `logicalLineEndRow(y: number): number` (same body, JSDoc kept) and update its three internal callers (`carriageReturn`, `deleteChar`, `insertChar`). Add to `sdk/tests/petscii/petscii-machine.test.ts`:

```ts
  it('logicalLineEndRow follows the link chain a wrapping print created', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(45).fill(0x41)); // 45 printables: row 1 is a continuation of row 0
    expect(m.logicalLineEndRow(0)).toBe(1);
    expect(m.logicalLineEndRow(1)).toBe(1);
    expect(m.logicalLineEndRow(5)).toBe(5);
  });
```

Create `sdk/petscii/unicode-to-petscii.ts` with just the export so Task 2 compiles (Task 3 fills the table):

```ts
/** Unicode glyph -> PETSCII byte (same glyph in both charset banks), or the inverse of another glyph. Filled in Task 3. */
export const UNICODE_TO_PETSCII: ReadonlyMap<string, number | { rvs: number }> = new Map();
```

Add to `sdk/petscii/index.ts`:

```ts
export {
  AnsiToPetsciiTransducer,
  type AnsiToPetsciiOptions,
  nearestVicForRgb,
  vicColorToPetscii,
  sgrColorToVic,
  xterm256ToRgb,
} from './ansi-to-petscii';
export { UNICODE_TO_PETSCII } from './unicode-to-petscii';
```

- [ ] **Step 4: Run to green**

Run: `cd sdk && npx jest tests/petscii/` - Expected: all 14 transducer cases + the machine accessor case PASS. Then `npm run build` - clean.

- [ ] **Step 5: RED proof and commit**

Temporarily change `printChar`'s a-z branch to `code` (no case swap), run the suite, confirm the login-prompt test fails, restore.

```bash
git diff --cached --stat
git add sdk/petscii/ansi-to-petscii.ts sdk/petscii/unicode-to-petscii.ts sdk/petscii/index.ts sdk/petscii/petscii-machine.ts \
  sdk/tests/petscii/ansi-to-petscii.test.ts sdk/tests/petscii/petscii-machine.test.ts
git commit -m "feat(petscii): AnsiToPetsciiTransducer - ANSI text to PETSCII bytes computed against a KERNAL oracle"
```

---

### Task 3: Transducer - erase, clear, save/restore, graphics table, substitutions

**Files:**
- Modify: `sdk/petscii/ansi-to-petscii.ts` (the four stubs), `sdk/petscii/unicode-to-petscii.ts`
- Test: `sdk/tests/petscii/ansi-to-petscii.test.ts` (extend), `sdk/tests/petscii/unicode-to-petscii.test.ts`

**Interfaces:**
- Consumes: Task 2's class; `PetsciiMachine`.
- Produces: the filled `UNICODE_TO_PETSCII` table; `ED`/`EL`/`ECH` semantics: erase prints plain spaces row by row (reverse off during the fill - the ANSI reverse latch is re-asserted by the next printable - pen unchanged), cursor restored afterwards by deltas. A fill through column 39 links the row below on the KERNAL; that is harmless because Task 2's `newline()` consults `logicalLineEndRow` and never issues a `$0D` from a non-final row. The bottom-right cell (39,24) is never written by an erase (printing there scrolls the KERNAL screen; nothing can have been printed there without scrolling either, so it is blank whenever it matters). `2J` -> `$93` then cursor restored to where it was (ANSI 2J does not home); `?1049h/l` -> the same clear.

- [ ] **Step 1: Write the failing tests**

Append to `sdk/tests/petscii/ansi-to-petscii.test.ts`:

```ts
describe('AnsiToPetsciiTransducer cursor, erase and graphics', () => {
  it('ESC[H is one HOME byte; ESC[r;cH is deltas from the oracle cursor', () => {
    expect(run('ab\x1b[H').out.slice(-1)).toEqual([0x13]);
    const { out, display } = run('\x1b[3;5H');
    expect(out).toEqual([0x11, 0x11, 0x1D, 0x1D, 0x1D, 0x1D]);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([4, 2]);
  });

  it('cursor down at the bottom row does not scroll; cursor right at column 39 does not wrap', () => {
    const { display } = run('\x1b[25;1Hbottom\x1b[5B');
    expect(display.state.cursorY).toBe(24);
    expect(cell(display, 0, 24)).toBe(scLower('b'));
    const right = run('\x1b[1;40H\x1b[3C').display;
    expect([right.state.cursorX, right.state.cursorY]).toEqual([39, 0]);
  });

  it('out-of-range positioning (80-col authored) clamps to 40x25', () => {
    const { display } = run('\x1b[30;70H');
    expect([display.state.cursorX, display.state.cursorY]).toEqual([39, 24]);
  });

  it('ESC[2J clears the screen and restores the cursor; ESC[2J ESC[H homes', () => {
    const { display } = run('\x1b[3;3Habc\x1b[2J');
    expect(cell(display, 2, 2)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([5, 2]);
    const homed = run('abc\x1b[2J\x1b[H').display;
    expect([homed.state.cursorX, homed.state.cursorY]).toEqual([0, 0]);
  });

  it('ESC[K erases to end of row without moving the cursor; reverse is not painted into the blanks but survives for the next printable', () => {
    const { display } = run('\x1b[7mhello world\x1b[6D\x1b[K');
    expect(cell(display, 4, 0) & 0x80).toBe(0x80);
    for (let x = 5; x < 40; x++) expect(cell(display, x, 0)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([5, 0]);
    expect(display.state.reverse).toBe(false);
    const next = run('\x1b[7mhello world\x1b[6D\x1b[KZ').display;
    expect(cell(next, 5, 0)).toBe(scUpper('Z') | 0x80);
  });

  it('ESC[K then CRLF lands on the very next row even though the fill linked it (the KERNAL RETURN trap)', () => {
    const { display } = run('abc\x1b[K\r\nN');
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(1);
  });

  it('ESC[J from the cursor erases to the end of screen but never the bottom-right cell', () => {
    const { display } = run('\x1b[25;40H\x1b[2;1Hxy\x1b[2;1H\x1b[J');
    expect(cell(display, 0, 1)).toBe(0x20);
    expect(cell(display, 1, 1)).toBe(0x20);
    expect(display.state.cursorY).toBe(1);
  });

  it('save/restore cursor (ESC[s ESC[u and ESC 7 ESC 8) returns to the saved cell', () => {
    const a = run('\x1b[4;6H\x1b[s\x1b[10;1Hx\x1b[uY').display;
    expect(cell(a, 5, 3)).toBe(scUpper('Y'));
    const b = run('\x1b[4;6H\x1b7\x1b[10;1Hx\x1b8Y').display;
    expect(cell(b, 5, 3)).toBe(scUpper('Y'));
  });

  it('OSC, DCS and private modes are swallowed; mouse-enable sequences never print', () => {
    expect(run('\x1b]9999;sfx;{"x":1}\x07a').out).toEqual([0x0E, 0x41]);
    expect(run('\x1b[?1000h\x1b[?25la').out).toEqual([0x0E, 0x41]);
  });

  it('box drawing renders as PETSCII line graphics identical in both charset banks', () => {
    const { display } = run('┌─┐\r\n│x│\r\n└─┘');
    expect(cell(display, 0, 0)).toBe(0x70); // top-left corner screen code
    expect(cell(display, 1, 0)).toBe(0x40); // horizontal
    expect(cell(display, 0, 1)).toBe(0x5D); // vertical
    expect(cell(display, 2, 2)).toBe(0x7D); // bottom-right corner
    expect(display.state.charsetBank).toBe(1);
  });

  it('a full block is a reverse space and reverse is restored afterwards', () => {
    const { display, out } = run('█a');
    expect(cell(display, 0, 0)).toBe(0xA0);
    expect(cell(display, 1, 0)).toBe(scLower('a'));
    expect(out).toContain(0x12);
    expect(out).toContain(0x92);
  });

  it('unsupported glyphs and ASCII without a PETSCII code are substituted, never dropped', () => {
    const { display } = run('é\\_|');
    expect(cell(display, 0, 0)).toBe(0x3F);       // e-acute -> ?
    expect(cell(display, 1, 0)).toBe(0x2F);       // backslash -> /
    expect(cell(display, 2, 0)).toBe(0x64);       // underscore -> lower eighth block
    expect(cell(display, 3, 0)).toBe(0x5D);       // pipe -> vertical bar
  });

  it('legacy PUA glyphs: reverse per glyph, bank per page', () => {
    expect(run(String.fromCodePoint(0xE081, 0xE001)).out).toEqual([0x12, 0x41, 0x92, 0x41]);
    expect(run(String.fromCodePoint(0xE141)).out[0]).toBe(0x0E);
    expect(run('\x1b[7m' + String.fromCodePoint(0xE001)).out).toEqual([0x12, 0x92, 0x41]);
  });
});
```

Create `sdk/tests/petscii/unicode-to-petscii.test.ts`:

```ts
import { UNICODE_TO_PETSCII } from '../../petscii/unicode-to-petscii';
import { printablePetsciiToScreenCode } from '../../petscii/screen-codes';

describe('UNICODE_TO_PETSCII', () => {
  it('every plain entry maps to a printable PETSCII byte whose screen code is bank-invariant ($A0-$BF, $C0, $DB, $DD, $BA)', () => {
    for (const [glyph, v] of UNICODE_TO_PETSCII) {
      const byte = typeof v === 'number' ? v : v.rvs;
      expect(byte).toBeGreaterThanOrEqual(0x20);
      expect(byte).toBeLessThanOrEqual(0xFF);
      expect(printablePetsciiToScreenCode(byte)).toBeLessThanOrEqual(0x7F);
      if (typeof v === 'number' && byte >= 0xC0 && byte <= 0xDF) {
        // letters live here in bank 1: only the three graphics shared by both banks are allowed
        expect([0xC0, 0xDB, 0xDD]).toContain(byte);
      }
      expect(glyph.length).toBeGreaterThan(0);
    }
  });
  it('pins the corner, line and half-block glyphs', () => {
    expect(UNICODE_TO_PETSCII.get('┌')).toBe(0xB0);
    expect(UNICODE_TO_PETSCII.get('┘')).toBe(0xBD);
    expect(UNICODE_TO_PETSCII.get('─')).toBe(0xC0);
    expect(UNICODE_TO_PETSCII.get('│')).toBe(0xDD);
    expect(UNICODE_TO_PETSCII.get('▌')).toBe(0xA1);
    expect(UNICODE_TO_PETSCII.get('▀')).toEqual({ rvs: 0xA2 });
    expect(UNICODE_TO_PETSCII.get('█')).toEqual({ rvs: 0x20 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd sdk && npx jest tests/petscii/` - Expected: the new cases FAIL (erase stubs do nothing; table empty -> `?` instead of corners).

- [ ] **Step 3: Implement**

Replace the four stubs at the end of `AnsiToPetsciiTransducer`:

```ts
  // ---- erase ------------------------------------------------------------

  /**
   * Blank columns x0..x1 of row r with plain spaces (the cursor ends up
   * wherever the last print left it; callers restore it). Printing through
   * column 39 makes the KERNAL wrap and link the row below into this
   * logical line - harmless, because newline() never issues a $0D from a
   * non-final row (Task 2). Cell (39,24) is never written: a print there
   * scrolls the whole screen, which ANSI erase never does.
   */
  private fillRow(r: number, x0: number, x1: number, out: number[]): void {
    const last = r === ROWS - 1 ? Math.min(x1, COLS - 2) : Math.min(x1, COLS - 1);
    if (last < x0) return;
    this.moveTo(x0, r, out);
    this.setReverse(false, out);
    for (let x = x0; x <= last; x++) this.emit(out, 0x20);
  }

  private withCursorRestored(out: number[], fill: () => void): void {
    const st = this.machine.state;
    const save = { x: st.cursorX, y: st.cursorY };
    fill();
    this.moveTo(save.x, save.y, out);
  }

  private eraseLine(mode: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    this.withCursorRestored(out, () => {
      if (mode === 1) this.fillRow(y, 0, x, out);
      else if (mode === 2) this.fillRow(y, 0, COLS - 1, out);
      else this.fillRow(y, x, COLS - 1, out);
    });
  }

  private eraseDisplay(mode: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    if (mode === 2 || mode === 3) return this.clearKeepingCursor(out, x, y);
    this.withCursorRestored(out, () => {
      if (mode === 1) {
        for (let r = 0; r < y; r++) this.fillRow(r, 0, COLS - 1, out);
        this.fillRow(y, 0, x, out);
      } else {
        this.fillRow(y, x, COLS - 1, out);
        for (let r = y + 1; r < ROWS; r++) this.fillRow(r, 0, COLS - 1, out);
      }
    });
  }

  /** ECH: blank `count` cells from the cursor, cursor unmoved. */
  private eraseChars(count: number, out: number[]): void {
    const { cursorX: x, cursorY: y } = this.machine.state;
    this.withCursorRestored(out, () => this.fillRow(y, x, x + count - 1, out));
  }

  /** $93 clears AND homes on the C64; ANSI 2J does not home, so the cursor goes back to (x,y) afterwards. */
  private clearKeepingCursor(out: number[], x: number, y: number): void {
    this.emit(out, 0x93);
    this.moveTo(x, y, out);
  }
```

Replace `sdk/petscii/unicode-to-petscii.ts`:

```ts
/**
 * Unicode (box drawing, block elements, the few symbols a BBS prints) ->
 * PETSCII byte. Only glyphs whose screen code renders the SAME in both
 * charset banks are mapped as plain bytes: screen codes $60-$7F (PETSCII
 * $A0-$BF), plus $40 (horizontal bar), $5B (cross) and $5D (vertical bar),
 * and the bank-1-only check mark ($BA) since text is always printed in bank
 * 1. Screen codes $41-$5A are letters in bank 1, so card suits, bullets,
 * rounded corners and diagonals (bank-0-only graphics) are substituted.
 * Glyphs PETSCII only has as the INVERSE of another glyph carry `{ rvs }`.
 * Screen-code sources: reference doc section 2 and the Unicode Consortium
 * C64IPRI/C64IALT tables transcribed in
 * web/backend/src/utils/petscii-unicode-map.ts.
 */
const R = (byte: number) => ({ rvs: byte });

export const UNICODE_TO_PETSCII: ReadonlyMap<string, number | { rvs: number }> = new Map<string, number | { rvs: number }>([
  // single-line box drawing
  ['─', 0xC0], ['│', 0xDD], ['┼', 0xDB],
  ['┌', 0xB0], ['┐', 0xAE], ['└', 0xAD], ['┘', 0xBD],
  ['├', 0xAB], ['┤', 0xB3], ['┬', 0xB2], ['┴', 0xB1],
  // heavy, double and rounded variants -> the single-line glyphs (PETSCII has no others in the text bank)
  ['━', 0xC0], ['┃', 0xDD],
  ['═', 0xC0], ['║', 0xDD], ['╬', 0xDB],
  ['╔', 0xB0], ['╗', 0xAE], ['╚', 0xAD], ['╝', 0xBD],
  ['╠', 0xAB], ['╣', 0xB3], ['╦', 0xB2], ['╩', 0xB1],
  ['╭', 0xB0], ['╮', 0xAE], ['╰', 0xAD], ['╯', 0xBD],
  // block elements (screen codes $61-$67, $6C, $7B, $7C, $7E, $7F)
  ['▌', 0xA1], ['▄', 0xA2], ['▔', 0xA3], ['▁', 0xA4],
  ['▏', 0xA5], ['▒', 0xA6], ['▕', 0xA7],
  ['▗', 0xAC], ['▖', 0xBB], ['▝', 0xBC], ['▘', 0xBE], ['▚', 0xBF],
  ['░', 0xA6], ['▓', 0xA6],
  // blocks PETSCII only has as the inverse of another glyph
  ['█', R(0x20)], ['▀', R(0xA2)], ['▐', R(0xA1)],
  ['▛', R(0xAC)], ['▜', R(0xBB)], ['▙', R(0xBC)], ['▟', R(0xBE)], ['▞', R(0xBF)],
  // symbols
  ['✓', 0xBA], ['£', 0x5C], ['↑', 0x5E], ['←', 0x5F],
  ['•', 0x2A], ['·', 0x2E], ['●', 0x2A],
  ['♠', 0x2A], ['♥', 0x2A], ['♦', 0x2A], ['♣', 0x2A],
  ['→', 0x3E], [' ', 0x20],
]);
```

- [ ] **Step 4: Run to green; build**

Run: `cd sdk && npx jest tests/petscii/ && npm run build` - Expected: PASS, clean.

- [ ] **Step 5: RED proof and commit**

Temporarily make `clearKeepingCursor` skip the `moveTo`, confirm the 2J test fails, restore. Then temporarily make Task 2's `newline()` always emit `$0D`, confirm the "ESC[K then CRLF" test fails on `cursorY` (2, not 1), restore.

```bash
git diff --cached --stat
git add sdk/petscii/ansi-to-petscii.ts sdk/petscii/unicode-to-petscii.ts sdk/tests/petscii/ansi-to-petscii.test.ts sdk/tests/petscii/unicode-to-petscii.test.ts
git commit -m "feat(petscii): transducer erase/clear/save-restore and the Unicode graphics table"
```

---

### Task 4: Backend `petscii.util.ts` - `convertUnicodePuaToPetscii` becomes the transducer (one parser)

Deletes the inline ANSI parser, `ansiColorToPetscii`, `VIC_TO_PETSCII_COLOR`, `vicColorToPetscii`, `hexToRgbTriplet`, `nearestVicForRgb` and the local `screenCodeToPetscii` from `petscii.util.ts`. Two legacy expectations change deliberately and are re-pinned through the oracle.

**Files:**
- Modify: `web/backend/src/utils/petscii.util.ts:154-194` (`screenCodeToPetscii` -> import), `:496-679` (parser + color helpers -> wrapper)
- Test: `web/backend/tests/utils/petscii.util.test.ts:575-640, 779-845`

**Interfaces:**
- Produces: `convertUnicodePuaToPetscii(data: string): Buffer` (same signature; one-shot: `transduce` + `flush` on a fresh transducer).
- Semantic changes (documented): (1) uppercase ASCII now case-swaps to `$C1-$DA` with a `$0E` prelude (the old `code < 128` pass-through printed uppercase ASCII as lowercase on a shifted C64 - the "writePetsciiLine asymmetry" limitation); (2) absolute positioning is deltas against the oracle, HOME only for (0,0).

- [ ] **Step 1: Re-pin the legacy tests through the oracle**

In `web/backend/tests/utils/petscii.util.test.ts` replace these four cases:

```ts
    it('should handle cursor movement ANSI codes', () => {
      // A(up) at row 0 is a no-op on both sides; B, C, D move exactly one cell each.
      const result = convertUnicodePuaToPetscii('\x1b[A\x1b[B\x1b[C\x1b[D');
      expect(Array.from(result)).toEqual([0x11, 0x1D, 0x9D]);
    });

    it('should handle home ANSI code', () => {
      const result = convertUnicodePuaToPetscii('ab\x1b[H');
      expect(result[result.length - 1]).toBe(0x13);
    });

    it('uppercase ASCII displays uppercase on a shifted-charset C64 (case swap + prelude)', () => {
      const result = convertUnicodePuaToPetscii('ABC');
      expect(Array.from(result)).toEqual([0x0E, 0xC1, 0xC2, 0xC3]);
    });
```

and in the `convertUnicodePuaToPetscii ANSI parser` block:

```ts
  it('converts absolute positioning to deltas from the current cursor', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[3;5H');
    expect(Array.from(bytes)).toEqual([0x11, 0x11, 0x1D, 0x1D, 0x1D, 0x1D]);
  });
```

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern=petscii.util` - Expected: exactly these four FAIL (old parser output), everything else green. After Step 2, any OTHER case in this file that fails is a real regression unless it pins one of the two documented semantic changes (HOME-prefixed positioning; uppercase pass-through) - re-pin those the same way, report anything else instead of editing it to green.

- [ ] **Step 2: Implement the wrapper**

In `web/backend/src/utils/petscii.util.ts`: add `import { AnsiToPetsciiTransducer, screenCodeToPetscii } from '@amiexpress/bbs-door-sdk/petscii';` after line 31. Delete the local `function screenCodeToPetscii` (lines 154-194) - the SDK one has the identical table. Replace `convertUnicodePuaToPetscii` and the helpers below it (lines 496-679: the function body, `ansiColorToPetscii`, `VIC_TO_PETSCII_COLOR`, `vicColorToPetscii`, `hexToRgbTriplet`, `nearestVicForRgb`) with:

```ts
/**
 * Convert a PetMe64-PUA / ANSI string to raw PETSCII bytes (one shot).
 *
 * Thin wrapper over the SDK's AnsiToPetsciiTransducer - the ONE ANSI parser
 * shared with the frontend canvas and the telnet emitter. Streaming callers
 * (connection-emitter.ts) keep a per-session instance instead so cursor,
 * charset and reverse state carry across chunks; this one-shot form is for
 * whole-string conversions and tests.
 */
export function convertUnicodePuaToPetscii(data: string): Buffer {
  const t = new AnsiToPetsciiTransducer();
  return Buffer.concat([Buffer.from(t.transduce(data)), Buffer.from(t.flush())]);
}
```

Remove the now-unused `C64_PALETTE_COLODORE` from the `./c64-palette` import at line 30 if nothing else in the file uses it (`grep -n C64_PALETTE_COLODORE web/backend/src/utils/petscii.util.ts`).

- [ ] **Step 3: Run to green**

Run: `cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern=petscii` - Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git diff --cached --stat
git add web/backend/src/utils/petscii.util.ts web/backend/tests/utils/petscii.util.test.ts
git commit -m "refactor(petscii): convertUnicodePuaToPetscii delegates to the SDK transducer - one ANSI parser"
```

---

### Task 5: Telnet emitter - one transducer per C64 session; `needsCharsetPrelude` retired; the 80-col byte-identity pin

**Files:**
- Modify: `web/backend/src/server/connection-emitter.ts:20-24, 48-116`, `web/backend/src/server/c64-detected-handler.ts:24, 43-45`, `web/backend/src/index.ts:384` (session field), `web/backend/src/handlers/command.handler.ts:1406, 1450`, `web/backend/src/handlers/command-handler/pre-login.ts:153-156`, `web/backend/src/server/telnet-server.ts:733-740` (delete the four `needsCharsetPrelude = true` one-liners and their comments)
- Test: `web/backend/tests/server/connection-emitter-petscii.test.ts` (new), `web/backend/tests/handlers/c64-detected-handler.test.ts` (extend)

**Interfaces:**
- Consumes: `AnsiToPetsciiTransducer` (Task 2/3).
- Produces: `BBSSession.petsciiTransducer?: AnsiToPetsciiTransducer` (lazily created, one per session, shared by every emitter built for that connection); emitter routing for `session.petsciiMode || session.terminalType === 'c64'`: `ansi-output` string -> `transduce`, Buffer -> raw; `petscii-output` -> `transduce` (PUA-aware; previously only `terminalType === 'c64'` got bytes - a telnet caller who answered `P` now does too); `petscii-bytes` -> `observe` + raw. The non-PETSCII branches are byte-for-byte unchanged.

- [ ] **Step 1: Write the failing tests**

Create `web/backend/tests/server/connection-emitter-petscii.test.ts`:

```ts
/**
 * Telnet emitter transduction (petscii-full-canvas plan, Task 5) and THE
 * NON-NEGOTIABLE: a non-PETSCII session's ansi-output path is byte-identical
 * to what it was before the transducer existed.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

function connectionWith(session: any) {
  const written: Buffer[] = [];
  const connection: any = {
    write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
    session,
    sessionId: 'emitter-test',
    on() {}, off() {}, close() {},
  };
  return { connection, written, all: () => Buffer.concat(written) };
}
const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);
const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];

describe('non-PETSCII sessions are byte-for-byte unaffected (THE NON-NEGOTIABLE)', () => {
  const payloads = [
    '\x1b[2J\x1b[H\x1b[1;32mHello\x1b[0m\r\n',
    'bare LF line\nnext',
    '\x1b[3;5HX\x1b[K',
    'Username: ',
  ];
  for (const terminalType of ['modern', 'unknown', undefined]) {
    it(`terminalType=${terminalType}: strings get only the legacy CRLF normalization, buffers pass untouched`, () => {
      const { connection, written, all } = connectionWith({ terminalType, petsciiMode: false });
      const emitter = buildConnectionEmitter(connection);
      for (const p of payloads) emitter.emit('ansi-output', p);
      expect(all().toString('utf-8')).toBe(payloads.map((p) => p.replace(/\r?\n/g, '\r\n')).join(''));
      const bin = Buffer.from([0x18, 0x42, 0x00, 0xFF, 0x0A]);
      emitter.emit('ansi-output', bin);
      expect(Buffer.compare(written[written.length - 1], bin)).toBe(0);
      expect(connection.session.petsciiTransducer).toBeUndefined();
    });
  }
});

describe('C64 sessions get transduced PETSCII with cursor and color intact', () => {
  it('a login walk renders on a C64 screen: welcome line, then the prompt on its own row, case-correct', () => {
    const { connection, all } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('ansi-output', '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
    emitter.emit('ansi-output', '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
    emitter.emit('ansi-output', 'Username: ');
    const m = new PetsciiMachine();
    m.feed(all());
    expect(cell(m, 3, 2)).toBe(scUpper('W'));
    expect(m.state.colorRam[2 * 40 + 3]).toBe(3);      // cyan
    expect(cell(m, 0, 6)).toBe(scUpper('U'));
    expect(m.state.cursorX).toBe(10);
    expect(m.state.cursorY).toBe(6);
    expect(m.state.charsetBank).toBe(1);
    const bytes = Array.from(all());
    expect(bytes.indexOf(0x0E)).toBeGreaterThan(-1);                 // charset prelude from the oracle, no session flag
    expect(bytes.indexOf(0x0E)).toBeLessThan(bytes.indexOf(0x2D));   // ...and before the first printable ('-')
  });

  it('a blessed-style positioned frame lands where the door put it (cursor survives, strip-ANSI is gone)', () => {
    const { connection, all } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('ansi-output', '\x1b[2J\x1b[5;3H\x1b[33mMENU\x1b[0m\x1b[7;3H┌─┐');
    const m = new PetsciiMachine();
    m.feed(all());
    expect(cell(m, 2, 4)).toBe(scUpper('M'));
    expect(m.state.colorRam[4 * 40 + 2]).toBe(7);
    expect(cell(m, 2, 6)).toBe(0x70);
  });

  it('state carries across chunks and emitters: one transducer per session', () => {
    const session: any = { terminalType: 'c64', petsciiMode: true };
    const { connection, all } = connectionWith(session);
    const a = buildConnectionEmitter(connection);
    const b = buildConnectionEmitter(connection);
    a.emit('ansi-output', '\x1b[31mred');
    b.emit('ansi-output', ' still red');
    const bytes = Array.from(all());
    expect(bytes.filter((x) => x === 0x1C)).toHaveLength(1);
    expect(bytes.filter((x) => x === 0x0E)).toHaveLength(1);
    expect(a.session).toBe(session);
  });

  it('petscii-bytes are forwarded raw AND observed, so the next text re-selects the text bank', () => {
    const { connection, written } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    const seq = Buffer.from([0x93, 0x8E, 0x1C, 0xA1, 0xB0]);
    emitter.emit('petscii-bytes', seq.toString('base64'));
    expect(Buffer.compare(written[0], seq)).toBe(0);
    emitter.emit('ansi-output', 'Hi');
    expect(Array.from(written[1])).toEqual([0x0E, 0xC8, 0x49]);
  });

  it('petscii-output (legacy PUA) is transduced for a telnet session that answered P', () => {
    const { connection, written } = connectionWith({ terminalType: 'modern', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('petscii-output', String.fromCodePoint(0xE081));
    expect(Array.from(written[0])).toEqual([0x12, 0x41]);
  });
});
```

Extend `web/backend/tests/handlers/c64-detected-handler.test.ts` with one case inside the existing describe (mocks already in place):

```ts
  it('the post-title "Username: " prompt goes through the emitter (case-correct, oracle-tracked), not a raw write', async () => {
    const written: Buffer[] = [];
    const connection: any = {
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
      session: { terminalType: 'c64', petsciiMode: true, tempData: {} },
      sessionId: 'c64-test', on() {}, off() {}, close() {},
    };
    await handleC64Detected(connection);
    const all = Buffer.concat(written);
    const tail = Array.from(all.subarray(all.length - 10));
    expect(tail).toEqual([0xD5, 0x53, 0x45, 0x52, 0x4E, 0x41, 0x4D, 0x45, 0x3A, 0x20]);
    expect(connection.session.petsciiTransducer).toBeDefined();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="connection-emitter-petscii|c64-detected"`
Expected: the non-negotiable block PASSES already (it pins current behavior - keep it that way); the C64 cases FAIL (strip-ANSI path: no cursor bytes, no `petsciiTransducer`, `Username` written by `convertAsciiToPetsciiOutput` without the shared state).

- [ ] **Step 3: Implement**

`web/backend/src/index.ts` - in the `BBSSession` interface after line 384 (`petsciiMode?: boolean; ...`):

```ts
  /** Per-session ANSI->PETSCII transducer for real C64 callers (connection-emitter.ts). Lazily created; shared by every emitter built for the connection so cursor/charset/reverse state never forks. */
  petsciiTransducer?: import("@amiexpress/bbs-door-sdk/petscii").AnsiToPetsciiTransducer;
```

`web/backend/src/server/connection-emitter.ts` - replace the import block (lines 20-24) with:

```ts
import { convertPetsciiToPetMe64 } from "../utils/petscii.util";
import { AnsiToPetsciiTransducer } from "@amiexpress/bbs-door-sdk/petscii";

function isPetsciiSession(session: any): boolean {
  return session?.terminalType === "c64" || !!session?.petsciiMode;
}

/** The session's one transducer (created on first use). Keyed on the session, not the emitter: handleC64Detected builds a second emitter for the same connection. */
function petsciiTransducerFor(session: any): AnsiToPetsciiTransducer {
  if (!session.petsciiTransducer) session.petsciiTransducer = new AnsiToPetsciiTransducer();
  return session.petsciiTransducer;
}
```

and replace the `emit:` member (lines 48-117) with:

```ts
    emit: (event: string, data: any) => {
      const session = connection.session;
      if (event === "ansi-output") {
        if (isPetsciiSession(session)) {
          // C64 caller: the ANSI stream (prompts, menus, blessed door frames)
          // becomes PETSCII with cursor positioning, colors and reverse video
          // computed against the session's KERNAL oracle. Binary payloads
          // (ZMODEM) pass untouched.
          if (typeof data === "string") {
            connection.write(Buffer.from(petsciiTransducerFor(session).transduce(data)));
          } else {
            connection.write(data);
          }
        } else {
          // Modern terminal or unknown - send as-is (ANSI codes),
          // but normalize bare LF to CRLF so raw TCP clients (nc,
          // some terminal apps without telnet NVT) don't stair-step
          // content across the screen. Proper telnet clients already
          // treat LF as "next row, column 0" via NVT; this is a no-op
          // for them. Only normalize strings - binary file transfer
          // buffers (e.g. ZModem) MUST pass through untouched.
          if (typeof data === "string") {
            connection.write(data.replace(/\r?\n/g, "\r\n"));
          } else {
            connection.write(data);
          }
        }
      } else if (event === "petscii-output") {
        if (isPetsciiSession(session)) {
          // Legacy PUA text: the transducer understands U+E000-E1FF glyphs
          // and keeps bank/reverse state in step with everything else.
          connection.write(Buffer.from(petsciiTransducerFor(session).transduce(String(data))));
        } else {
          connection.write(data);
        }
      } else if (event === "petscii-bytes") {
        // Raw-byte transport (Task 9 of the overhaul): `data` is base64 of
        // the exact .seq bytes the loader read off disk.
        const raw = Buffer.from(data as string, "base64");
        if (isPetsciiSession(session)) {
          // Forward untouched (TelnetConnection.write doubles IAC itself) and
          // let the oracle see what the screen now looks like.
          petsciiTransducerFor(session).observe(raw);
          connection.write(raw);
        } else {
          connection.write(convertPetsciiToPetMe64(raw));
        }
      }
    },
    /** Live view of the connection's session (emitText's wrap choke, Task 10, reads it). A getter: connection.session is assigned after this emitter is built. */
    get session() {
      return connection.session;
    },
```

`web/backend/src/server/c64-detected-handler.ts`: delete line 24 (`import { convertAsciiToPetsciiOutput } ...`) and replace lines 43-45 with:

```ts
  // Through the emitter, not connection.write: the session's transducer
  // must see this text so its cursor/charset oracle matches the screen.
  emitter.emit("ansi-output", "\r\n\r\n");
  emitter.emit("ansi-output", "Username: ");
```

Delete the four `(session as any).needsCharsetPrelude = true;` / `(connection.session as any).needsCharsetPrelude = true;` lines and their explanatory comments at `command.handler.ts:1401-1406`, `command.handler.ts:1450`, `pre-login.ts:153-156`, `telnet-server.ts:733-740`. `grep -rn needsCharsetPrelude web/backend/src` must return nothing afterwards.

- [ ] **Step 4: Run to green**

Run: `cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="petscii|c64|graphics-answer|login-connect|telnet"` - Expected: PASS (the `graphics-answer.test.ts` `P` case asserts `terminal-resize`, untouched). Then the full backend suite - Expected: green except the documented pre-existing `index.ts`-IIFE jest-worker crash.

- [ ] **Step 5: RED proof and commit**

Temporarily restore the old strip-regex line in the `ansi-output` C64 branch, confirm the login-walk test fails on `cursorY`, restore.

```bash
git diff --cached --stat
git add web/backend/src/server/connection-emitter.ts web/backend/src/server/c64-detected-handler.ts web/backend/src/index.ts \
  web/backend/src/handlers/command.handler.ts web/backend/src/handlers/command-handler/pre-login.ts web/backend/src/server/telnet-server.ts \
  web/backend/tests/server/connection-emitter-petscii.test.ts web/backend/tests/handlers/c64-detected-handler.test.ts
git commit -m "feat(petscii): real C64 callers get transduced ANSI - cursor, colors and doors survive; charset prelude comes from the oracle"
```

---

### Task 6: Shared PETSCII keyboard -> ASCII/ANSI input map (cursor + function keys reach doors)

**Files:**
- Create: `sdk/petscii/petscii-input.ts`
- Modify: `sdk/petscii/index.ts`, `web/backend/src/utils/petscii.util.ts:787-872` (`convertPetsciiInputToAscii` -> wrapper), `web/backend/src/index.ts:1178` (unchanged call, now reaches the SDK)
- Delete: `packages/terminal/src/petscii/key-bytes-to-command.ts`, `web/backend/tests/petscii/petscii-key-bytes-to-command.test.ts` (its cases move into the SDK test)
- Test: `sdk/tests/petscii/petscii-input.test.ts`

**Interfaces:**
- Produces: `petsciiInputToAscii(bytes: ArrayLike<number>): string` - `$0D`/`$8D` -> `\r`; `$0A` dropped; `$14`/`$7F` -> `\x7f`; `$20-$3F`, `$40`, `$5B-$5F` -> same; `$41-$5A` -> `a-z`; `$C1-$DA` -> `A-Z`; `$61-$7A` -> same (lowercase pass-through); `$91/$11/$1D/$9D` -> `\x1b[A`/`\x1b[B`/`\x1b[C`/`\x1b[D`; `$13` -> `\x1b[H`; `$94` -> `\x1b[2~`; F1-F8 (`$85 $89 $86 $8A $87 $8B $88 $8C`) -> `\x1bOP \x1bOQ \x1bOR \x1bOS \x1b[15~ \x1b[17~ \x1b[18~ \x1b[19~` (exactly the sequences `client-door-bridge.ts:69-90` and blessed `program.ts parseKey` decode); `$93` and every other control byte dropped.
- Note the case rule: on a real C64 the UNSHIFTED key sends `$41-$5A` and displays uppercase in bank 0, but the BBS runs the text bank where `$41-$5A` IS lowercase - so unshifted = lowercase ASCII, matching `keymap.ts` (`a-z -> $41-$5A`) and the old `convertPetsciiInputToAscii`'s `$C1-$DA -> a-z` was the INVERSE of what `keymap.ts` produces. `keymap.ts`/`key-bytes-to-command.ts` (web) and `convertPetsciiInputToAscii` (telnet) disagreed; the SDK function follows the web keymap (which is what SyncTERM's C64 mode also sends: `$C1-$DA` for shifted/uppercase letters).

- [ ] **Step 1: Write the failing tests**

Create `sdk/tests/petscii/petscii-input.test.ts`:

```ts
import { petsciiInputToAscii } from '../../petscii/petscii-input';

describe('petsciiInputToAscii', () => {
  it('letters: unshifted keys are lowercase, shifted keys are uppercase', () => {
    expect(petsciiInputToAscii([0x41, 0x42, 0xC3])).toBe('abC');
    expect(petsciiInputToAscii([0x61])).toBe('a');
  });
  it('RETURN, Shift+RETURN, DELETE, digits and punctuation', () => {
    expect(petsciiInputToAscii([0x0D, 0x8D, 0x14, 0x7F, 0x31, 0x21, 0x40, 0x5B, 0x5F])).toBe('\r\r\x7f\x7f1!@[_');
  });
  it('cursor keys become the ANSI arrow sequences blessed doors decode', () => {
    expect(petsciiInputToAscii([0x91])).toBe('\x1b[A');
    expect(petsciiInputToAscii([0x11])).toBe('\x1b[B');
    expect(petsciiInputToAscii([0x1D])).toBe('\x1b[C');
    expect(petsciiInputToAscii([0x9D])).toBe('\x1b[D');
    expect(petsciiInputToAscii([0x13])).toBe('\x1b[H');
    expect(petsciiInputToAscii([0x94])).toBe('\x1b[2~');
  });
  it('F1-F8 become the VT sequences client-door-bridge maps to F1-F8', () => {
    expect(petsciiInputToAscii([0x85, 0x89, 0x86, 0x8A])).toBe('\x1bOP\x1bOQ\x1bOR\x1bOS');
    expect(petsciiInputToAscii([0x87, 0x8B, 0x88, 0x8C])).toBe('\x1b[15~\x1b[17~\x1b[18~\x1b[19~');
  });
  it('LF, CLR and unknown control bytes are dropped', () => {
    expect(petsciiInputToAscii([0x0A, 0x93, 0x03, 0x05, 0x12])).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd sdk && npx jest tests/petscii/petscii-input.test.ts` - Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `sdk/petscii/petscii-input.ts`:

```ts
/**
 * PETSCII keyboard bytes -> the ASCII/ANSI input string the BBS command
 * path already understands. ONE table for both directions of arrival:
 * the web canvas (keymap.ts bytes, BBSTerminal.tsx) and real C64 telnet
 * callers (index.ts's connection 'data' hook). Escape sequences are the
 * ones blessed's program.ts parseKey and doors/client-door-bridge.ts decode.
 */
const CONTROL_KEYS: { [byte: number]: string } = {
  0x0D: '\r', 0x8D: '\r',
  0x14: '\x7f', 0x7F: '\x7f',
  0x91: '\x1b[A', 0x11: '\x1b[B', 0x1D: '\x1b[C', 0x9D: '\x1b[D',
  0x13: '\x1b[H', 0x94: '\x1b[2~',
  0x85: '\x1bOP', 0x89: '\x1bOQ', 0x86: '\x1bOR', 0x8A: '\x1bOS',
  0x87: '\x1b[15~', 0x8B: '\x1b[17~', 0x88: '\x1b[18~', 0x8C: '\x1b[19~',
};

export function petsciiInputToAscii(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const control = CONTROL_KEYS[b];
    if (control !== undefined) { out += control; continue; }
    if (b >= 0x41 && b <= 0x5A) { out += String.fromCharCode(b + 0x20); continue; } // unshifted -> a-z
    if (b >= 0xC1 && b <= 0xDA) { out += String.fromCharCode(b - 0x80); continue; } // shifted -> A-Z
    if ((b >= 0x20 && b <= 0x40) || (b >= 0x5B && b <= 0x5F) || (b >= 0x61 && b <= 0x7A)) { out += String.fromCharCode(b); continue; }
    // LF, CLR, colors, every other control/graphics byte: no input meaning.
  }
  return out;
}
```

Add `export { petsciiInputToAscii } from './petscii-input';` to `sdk/petscii/index.ts`.

In `web/backend/src/utils/petscii.util.ts` replace the body of `convertPetsciiInputToAscii` (lines 805-872) with:

```ts
export function convertPetsciiInputToAscii(data: Buffer): string {
  // One table for telnet C64 callers and the web canvas keymap: SDK petscii-input.ts.
  return petsciiInputToAscii(data);
}
```

and add `petsciiInputToAscii` to the `@amiexpress/bbs-door-sdk/petscii` import. Update `web/backend/tests/utils/petscii.util.test.ts`'s `convertPetsciiInputToAscii` cases: `0xC1-0xDA` now yields UPPERCASE and `0x41-0x5A` lowercase (the web keymap's convention); cursor bytes now yield ANSI sequences instead of being dropped.

Delete `packages/terminal/src/petscii/key-bytes-to-command.ts` and `web/backend/tests/petscii/petscii-key-bytes-to-command.test.ts` (`git rm`). `BBSTerminal.tsx:20` still imports it - replace with `import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';` and change the single use at `:3589` to `petsciiInputToAscii(bytes)` (Task 8 rewrites that block anyway).

- [ ] **Step 4: Run to green**

Run: `cd sdk && npx jest tests/petscii && npm run build && cd ../web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern=petscii && cd ../../packages/terminal && npm run build` - Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/petscii-input.ts sdk/petscii/index.ts sdk/tests/petscii/petscii-input.test.ts \
  web/backend/src/utils/petscii.util.ts web/backend/tests/utils/petscii.util.test.ts \
  packages/terminal/src/components/BBSTerminal.tsx
git rm packages/terminal/src/petscii/key-bytes-to-command.ts web/backend/tests/petscii/petscii-key-bytes-to-command.test.ts
git commit -m "feat(petscii): one PETSCII-keyboard input map - cursor and function keys reach doors from C64s and the canvas"
```

---

### Task 7: Frontend pure modules - `surface-state.ts` (replaces the overlay reducer) and `login-key-machine.ts` (the login state machine, extracted)

No `BBSTerminal.tsx` edits yet; Task 8 wires these in. Tests run in the backend jest process by the established precedent (`petscii-keymap.test.ts`, `petscii-overlay-state.test.ts` import `packages/terminal` pure modules by relative path).

**Files:**
- Create: `packages/terminal/src/petscii/surface-state.ts`, `packages/terminal/src/utils/login-key-machine.ts`
- Test: `web/backend/tests/petscii/petscii-surface-state.test.ts`, `web/backend/tests/petscii/login-key-machine.test.ts`

**Interfaces:**
- Produces:
  - `type PetsciiSurface = 'xterm' | 'canvas'`; `type PetsciiSurfaceEvent = { type: 'petscii-session-start' } | { type: 'session-reset' }`; `initialPetsciiSurface: PetsciiSurface = 'xterm'`; `petsciiSurfaceReducer(state, event): PetsciiSurface`.
  - `type LoginState = 'waiting' | 'username' | 'password' | 'new-user-prompt' | 'registering' | 'loggedin' | 'checking-username' | 'logging-in' | 'password-reset' | 'forced-pwd-change'`
  - `interface LoginKeyContext { state: { current: LoginState }; username: { current: string }; password: { current: string }; newUserPromptUsername: { current: string }; passwordResetInput: { current: string }; forcedPwdChangeInput: { current: string }; passwordMode: { current: boolean }; emit(event: string, payload?: unknown): void; echo(text: string): void; defer(fn: () => void): void; log?(msg: string): void }`
  - `processLoginKey(key: string, ctx: LoginKeyContext): boolean` - true when the key was consumed by the login state machine (including the `checking-username`/`logging-in` discard); false means "not a login key, send it to the server as command input". Behavior is the `term.onKey` handler's (BBSTerminal.tsx:2873-3009) verbatim, which is the richer of the two existing copies (the `injectInput` copy at 793-887 lacks the R/C handling for the new-user prompt).

- [ ] **Step 1: Write the failing tests**

Create `web/backend/tests/petscii/petscii-surface-state.test.ts`:

```ts
/**
 * THE NON-NEGOTIABLE on the web side: only a PETSCII event can turn the
 * canvas on. The reducer has no ansi-output/keypress/drain cases at all -
 * this pins that an unknown event leaves the xterm surface alone.
 */
import { petsciiSurfaceReducer, initialPetsciiSurface } from '../../../../packages/terminal/src/petscii/surface-state';

describe('petsciiSurfaceReducer', () => {
  it('starts on xterm', () => expect(initialPetsciiSurface).toBe('xterm'));
  it('a PETSCII session start selects the canvas and stays there', () => {
    const s = petsciiSurfaceReducer('xterm', { type: 'petscii-session-start' });
    expect(s).toBe('canvas');
    expect(petsciiSurfaceReducer(s, { type: 'petscii-session-start' })).toBe('canvas');
  });
  it('a session reset returns to xterm', () => {
    expect(petsciiSurfaceReducer('canvas', { type: 'session-reset' })).toBe('xterm');
  });
  it('nothing else moves the surface (ansi-output, keypress, drain are not events here)', () => {
    for (const type of ['ansi-output', 'keypress', 'drain-complete', 'bytes-arrived']) {
      expect(petsciiSurfaceReducer('xterm', { type } as any)).toBe('xterm');
    }
  });
});
```

Create `web/backend/tests/petscii/login-key-machine.test.ts`:

```ts
import { processLoginKey, type LoginKeyContext, type LoginState } from '../../../../packages/terminal/src/utils/login-key-machine';

function ctx(state: LoginState, overrides: Partial<LoginKeyContext> = {}) {
  const emitted: Array<[string, unknown]> = [];
  const echoed: string[] = [];
  const deferred: Array<() => void> = [];
  const c: LoginKeyContext = {
    state: { current: state },
    username: { current: '' }, password: { current: '' }, newUserPromptUsername: { current: '' },
    passwordResetInput: { current: '' }, forcedPwdChangeInput: { current: '' },
    passwordMode: { current: false },
    emit: (e, p) => emitted.push([e, p]),
    echo: (t) => echoed.push(t),
    defer: (fn) => deferred.push(fn),
    ...overrides,
  };
  return { c, emitted, echoed, deferred, runDeferred: () => deferred.splice(0).forEach((f) => f()) };
}

describe('processLoginKey', () => {
  it('username entry echoes each character and submits check-username on Enter', () => {
    const { c, emitted, echoed } = ctx('username');
    expect(processLoginKey('s', c)).toBe(true);
    expect(processLoginKey('p', c)).toBe(true);
    expect(echoed).toEqual(['s', 'p']);
    expect(processLoginKey('\r', c)).toBe(true);
    expect(emitted).toEqual([['check-username', { username: 'sp' }]]);
    expect(c.state.current).toBe('checking-username');
    expect(echoed[2]).toBe('\r\n');
  });
  it('backspace erases with the \\b \\b idiom and never underflows', () => {
    const { c, echoed } = ctx('username');
    processLoginKey('a', c);
    processLoginKey('\x7f', c);
    processLoginKey('\x7f', c);
    expect(c.username.current).toBe('');
    expect(echoed).toEqual(['a', '\b \b']);
  });
  it('password entry masks with * unless passwordMode says otherwise, and logs in on Enter', () => {
    const { c, emitted, echoed } = ctx('password');
    c.username.current = 'sp';
    processLoginKey('x', c);
    expect(echoed).toEqual(['*']);
    processLoginKey('\r', c);
    expect(emitted).toEqual([['login', { username: 'sp', password: 'x' }]]);
    expect(c.state.current).toBe('logging-in');
  });
  it('keys are swallowed while the BBS is checking or logging in', () => {
    const { c, emitted, echoed } = ctx('checking-username');
    expect(processLoginKey('a', c)).toBe(true);
    expect(emitted).toEqual([]);
    expect(echoed).toEqual([]);
  });
  it('new-user prompt: R retries as username, C continues as new user, Enter sends empty', () => {
    const r = ctx('new-user-prompt');
    r.c.newUserPromptUsername.current = 'newbie';
    processLoginKey('r', r.c);
    expect(r.emitted).toEqual([['new-user-response', { response: 'R', username: 'newbie' }]]);
    r.runDeferred();
    expect(r.c.state.current).toBe('username');
    const k = ctx('new-user-prompt');
    processLoginKey('C', k.c);
    k.runDeferred();
    expect(k.c.state.current).toBe('registering');
  });
  it('is not a login key once logged in (returns false, touches nothing)', () => {
    const { c, emitted, echoed } = ctx('loggedin');
    expect(processLoginKey('x', c)).toBe(false);
    expect(emitted).toEqual([]);
    expect(echoed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="surface-state|login-key-machine"` - Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `packages/terminal/src/petscii/surface-state.ts`:

```ts
/**
 * Which surface owns the session: xterm (ANSI, 80 columns) or the PETSCII
 * canvas (a simulated C64, 40x25). Replaces the overlay reducer of the
 * 2026-09-01 overhaul (the canvas used to be a transient picture over a
 * still-live xterm; it is now THE surface for the whole session).
 *
 * Only a PETSCII event can select the canvas. There is deliberately no
 * 'ansi-output' or 'keypress' event: text arriving, keys pressed, screens
 * draining never move the surface - an 80-column session can never end up
 * on the canvas by accident, and a 'P' session never falls back to xterm
 * until a fresh session starts.
 */
export type PetsciiSurface = 'xterm' | 'canvas';

export type PetsciiSurfaceEvent =
  /** A PETSCII session is starting: 40x25 terminal-resize, petscii-bytes or petscii-output arrived. */
  | { type: 'petscii-session-start' }
  /** A genuinely fresh session begins on this mounted component (token login, restore failed, reconnect failed). */
  | { type: 'session-reset' };

export const initialPetsciiSurface: PetsciiSurface = 'xterm';

export function petsciiSurfaceReducer(state: PetsciiSurface, event: PetsciiSurfaceEvent): PetsciiSurface {
  switch (event.type) {
    case 'petscii-session-start': return 'canvas';
    case 'session-reset': return 'xterm';
    default: return state;
  }
}
```

Create `packages/terminal/src/utils/login-key-machine.ts`:

```ts
/**
 * The web login state machine, as a pure function.
 *
 * Extracted from BBSTerminal.tsx's term.onKey handler (and its duplicate in
 * the injectInput imperative method) so that desktop keys, the on-screen
 * keyboard and the PETSCII canvas all drive ONE implementation, and so the
 * echo goes through a surface-agnostic `echo` (xterm write, or transducer ->
 * canvas) instead of a hard-wired term.write.
 *
 * Returns true when the key belonged to the login flow (consumed, possibly
 * swallowed); false means "not a login key" and the caller sends it to the
 * server as ordinary command input.
 */
export type LoginState =
  | 'waiting' | 'username' | 'password' | 'new-user-prompt' | 'registering'
  | 'loggedin' | 'checking-username' | 'logging-in' | 'password-reset' | 'forced-pwd-change';

export interface LoginKeyContext {
  state: { current: LoginState };
  username: { current: string };
  password: { current: string };
  newUserPromptUsername: { current: string };
  passwordResetInput: { current: string };
  forcedPwdChangeInput: { current: string };
  passwordMode: { current: boolean };
  emit(event: string, payload?: unknown): void;
  echo(text: string): void;
  /** Runs fn after the current keystroke's other listeners (setTimeout 0 in the component). */
  defer(fn: () => void): void;
  log?(message: string): void;
}

const isEnter = (k: string) => k === '\r' || k === '\n';
const isBackspace = (k: string) => k === '\x7f' || k === '\b';
const isPrintable = (k: string) => k.length === 1 && k >= ' ';

function lineField(key: string, field: { current: string }, ctx: LoginKeyContext, mask: boolean): 'submit' | 'handled' {
  if (isEnter(key)) return 'submit';
  if (isBackspace(key)) {
    if (field.current.length > 0) { field.current = field.current.slice(0, -1); ctx.echo('\b \b'); }
    return 'handled';
  }
  if (isPrintable(key)) { field.current += key; ctx.echo(mask ? '*' : key); }
  return 'handled';
}

export function processLoginKey(key: string, ctx: LoginKeyContext): boolean {
  const s = ctx.state.current;

  if (s === 'checking-username' || s === 'logging-in') return true; // BBS is busy: swallow

  if (s === 'username') {
    if (lineField(key, ctx.username, ctx, false) === 'submit') {
      ctx.log?.('Username entered: ' + ctx.username.current);
      ctx.emit('check-username', { username: ctx.username.current });
      ctx.state.current = 'checking-username';
      ctx.echo('\r\n');
    }
    return true;
  }

  if (s === 'password') {
    if (lineField(key, ctx.password, ctx, !ctx.passwordMode.current) === 'submit') {
      ctx.log?.('Password entered, sending login');
      ctx.emit('login', { username: ctx.username.current, password: ctx.password.current });
      ctx.state.current = 'logging-in';
      ctx.echo('\r\n');
    }
    return true;
  }

  if (s === 'password-reset') { // express.e:29152-29213
    if (lineField(key, ctx.passwordResetInput, ctx, ctx.passwordMode.current) === 'submit') {
      ctx.emit('password-reset-input', { input: ctx.passwordResetInput.current });
      ctx.echo('\r\n');
      ctx.passwordResetInput.current = '';
    }
    return true;
  }

  if (s === 'forced-pwd-change') { // express.e:29785-29845 - always masked
    if (lineField(key, ctx.forcedPwdChangeInput, ctx, true) === 'submit') {
      ctx.emit('forced-pwd-change-input', { input: ctx.forcedPwdChangeInput.current });
      ctx.echo('\r\n');
      ctx.forcedPwdChangeInput.current = '';
    }
    return true;
  }

  if (s === 'new-user-prompt') {
    const promptUser = ctx.newUserPromptUsername.current || ctx.username.current || '';
    const send = (response: string) => ctx.emit('new-user-response', { response, username: promptUser });
    if (isEnter(key)) {
      ctx.echo('\r\n');
      send('');
      ctx.defer(() => { ctx.state.current = 'registering'; });
      return true;
    }
    const lower = key.toLowerCase();
    if (lower === 'c') {
      ctx.echo('C'); // express.e:6845 lineInput echoes the char; the backend adds the newline with the next prompt
      send('C');
      ctx.defer(() => { ctx.state.current = 'registering'; });
    } else if (lower === 'r') {
      ctx.echo('R');
      send('R');
      ctx.defer(() => { ctx.state.current = 'username'; });
      ctx.username.current = '';
      ctx.password.current = '';
    } else {
      ctx.echo('\r\n\x1b[33mPress R to retry or C to continue as a new user\x1b[0m\r\n');
    }
    return true;
  }

  return false; // waiting / registering / loggedin: not a login key
}
```

Note the one intentional divergence from `term.onKey`: in state `'waiting'` and `'registering'` the old handler fell through to nothing (and `term.onData` then sent the key as a command); `processLoginKey` returns false there, which is the same outcome once Task 8 sends unconsumed keys as commands.

- [ ] **Step 4: Run to green**

Run: `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="surface-state|login-key-machine"` - Expected: PASS. `cd packages/terminal && npm run build` - clean.

- [ ] **Step 5: Commit**

```bash
git diff --cached --stat
git add packages/terminal/src/petscii/surface-state.ts packages/terminal/src/utils/login-key-machine.ts \
  web/backend/tests/petscii/petscii-surface-state.test.ts web/backend/tests/petscii/login-key-machine.test.ts
git commit -m "feat(terminal): surface reducer and a pure login key machine - one login path for keys, on-screen keyboard and canvas"
```

---

### Task 8: `BBSTerminal.tsx` - the canvas is THE surface for a PETSCII session

The big wiring task. Everything below is inside the socket/terminal `useEffect` (starts near line 900, `const term = new Terminal(...)`) unless stated. Work top to bottom; the file must build after every sub-step (`cd packages/terminal && npm run build`).

**Files:**
- Modify: `packages/terminal/src/components/BBSTerminal.tsx` (imports 17-21; refs 233-347; `useImperativeHandle` 764-887; effect body 963, 1027-1044, 2042-2047, 2179-2187, 2190-2222, 2237-2288, 2309-2317, 2463-2464, 2807-2870, 2873-3046; effect 3143-3156; `handleClick` 3159; render 3477-3600), `packages/terminal/src/petscii/PetsciiCanvas.tsx` (forwardRef handle + `focusOnMount`), `packages/terminal/src/index.ts:38` (export the handle type)
- Delete: `packages/terminal/src/petscii/overlay-state.ts`, `packages/terminal/src/petscii/font-gate.ts`, `web/backend/tests/petscii/petscii-overlay-state.test.ts`, `web/backend/tests/petscii/petscii-font-gate.test.ts`
- Test: manual (xterm + canvas do not run under jsdom; the logic is pinned by Tasks 2, 3, 6, 7) plus the Task 9 walk script.

**Interfaces:**
- Consumes: `AnsiToPetsciiTransducer`, `PetsciiMachine`, `petsciiInputToAscii` (SDK); `petsciiSurfaceReducer`, `processLoginKey` (Task 7).
- Produces: `PetsciiCanvasHandle { focus(): void }`, `PetsciiCanvasProps.focusOnMount?: boolean`.

- [ ] **Step 1: PetsciiCanvas gets an imperative focus handle**

In `packages/terminal/src/petscii/PetsciiCanvas.tsx`: change the import to `import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';`, add to the props interface:

```ts
  /** Focus the canvas as soon as it mounts (the full-canvas session makes it the keyboard surface). */
  focusOnMount?: boolean;
```

add before the component:

```ts
export interface PetsciiCanvasHandle {
  focus(): void;
}
```

change the component declaration to `export const PetsciiCanvas = forwardRef<PetsciiCanvasHandle, PetsciiCanvasProps>(({ machine, palette = C64_PALETTE_COLODORE, scale: maxScale = 4, onData, focusable = false, focusOnMount = false }, ref) => {`, add after `const canvasRef = ...`:

```ts
  useImperativeHandle(ref, () => ({ focus: () => canvasRef.current?.focus() }), []);
  useEffect(() => {
    if (focusOnMount) canvasRef.current?.focus();
  }, [focusOnMount]);
```

close with `});` and `PetsciiCanvas.displayName = 'PetsciiCanvas';`. Rewrite the `focusable` JSDoc (lines 21-33) to: `Whether the canvas takes keyboard focus (tabIndex 0). BBSTerminal passes true for a full-canvas PETSCII session, where the canvas owns keyboard input via onData.` In `packages/terminal/src/index.ts:38` export `type PetsciiCanvasHandle` alongside `PetsciiCanvasProps`.

- [ ] **Step 2: Imports and component-level state**

Lines 17-21 become:

```ts
import { PetsciiMachine, AnsiToPetsciiTransducer, petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';
import { PetsciiCanvas, type PetsciiCanvasHandle } from '../petscii/PetsciiCanvas';
import { petsciiSurfaceReducer, initialPetsciiSurface, type PetsciiSurface } from '../petscii/surface-state';
import { processLoginKey, type LoginKeyContext } from '../utils/login-key-machine';
```

Replace lines 233-265 (the `petsciiSessionActiveRef` comment block + `clearPetsciiSession`) and lines 276-331 (`petsciiMachineRef`, overlay reducer, `petsciiFrameSize`, `petsciiFrameRect` + its effect) with:

```ts
  // Full-canvas PETSCII session (petscii-full-canvas plan, Task 8). The
  // surface is either xterm (ANSI) or the PetsciiCanvas (a simulated C64):
  // every byte for a 'P' session goes transducer -> pace queue -> machine ->
  // canvas, including the login echo. Only a PETSCII event selects the
  // canvas (surface-state.ts); a fresh session on this mounted component
  // resets to xterm via clearPetsciiSession (token login, restore failed,
  // reconnect failed - 'session-restored' is a continuation and keeps it).
  const [surface, dispatchSurface] = useReducer(petsciiSurfaceReducer, initialPetsciiSurface);
  const surfaceRef = useRef<PetsciiSurface>(initialPetsciiSurface);
  const petsciiMachineRef = useRef<PetsciiMachine | null>(null);
  const petsciiTransducerRef = useRef<AnsiToPetsciiTransducer | null>(null);
  const petsciiCanvasRef = useRef<PetsciiCanvasHandle | null>(null);
  const petsciiBpsRef = useRef<number>(0);
  const petsciiFeedQueue = useRef<number[]>([]);
  const petsciiDrainActiveRef = useRef<boolean>(false);
  const clearPetsciiSession = useCallback(() => {
    surfaceRef.current = 'xterm';
    petsciiMachineRef.current = null;
    petsciiTransducerRef.current = null;
    petsciiFeedQueue.current.length = 0;
    dispatchSurface({ type: 'session-reset' });
  }, []);
  // Published by the init effect so injectInput (imperative handle) and the
  // canvas (JSX) drive the SAME login/command path as physical keys.
  const processInputKeyRef = useRef<(key: string) => void>(() => {});
  const focusSurfaceRef = useRef<() => void>(() => {});
  const fitTerminalRef = useRef<() => void>(() => {});
```

Keep `flushPetsciiQueue` (lines 342-347) as is. Delete lines 233-265's old declarations entirely (no `petsciiSessionActiveRef` remains: `grep -n petsciiSessionActiveRef` must be empty after this task).

- [ ] **Step 3: The pace queue, `enqueuePetscii`, `ensurePetsciiSession`, `writeTerm` - defined right after `modemEmulatorRef.current = new ModemEmulator(term);` (line 963)**

Move the `startPetsciiDrain` block (lines 2237-2264) up to here, minus its final `dispatchPetsciiOverlay({ type: 'drain-complete' });` line, then add:

```ts
    const enqueuePetscii = (bytes: Uint8Array | number[]) => {
      for (const b of bytes) petsciiFeedQueue.current.push(b);
      startPetsciiDrain();
    };
    // Canvas mode starts here and only here. The transducer and the display
    // machine both start from power-on state and see the same byte sequence
    // (transducer output + observed raw bytes), so they stay in lockstep.
    const ensurePetsciiSession = () => {
      if (!petsciiMachineRef.current) petsciiMachineRef.current = new PetsciiMachine();
      if (!petsciiTransducerRef.current) petsciiTransducerRef.current = new AnsiToPetsciiTransducer();
      if (surfaceRef.current !== 'canvas') {
        surfaceRef.current = 'canvas';
        dispatchSurface({ type: 'petscii-session-start' });
      }
    };
    // ONE seam for every direct xterm write in this effect: identical bytes
    // to xterm when it is the surface; transduced onto the canvas otherwise.
    const writeTerm = (text: string) => {
      if (surfaceRef.current === 'canvas') {
        enqueuePetscii(petsciiTransducerRef.current!.transduce(text));
        return;
      }
      term.write(text);
    };
    const focusSurface = () => {
      if (surfaceRef.current === 'canvas') petsciiCanvasRef.current?.focus();
      else term.focus();
    };
    focusSurfaceRef.current = focusSurface;
```

Then run `grep -n "term.write(" packages/terminal/src/components/BBSTerminal.tsx` and replace EVERY `term.write(` with `writeTerm(` except the two mouse-tracking toggles at lines 966-969 (`\x1b[?1000l...` - xterm control sequences with no canvas meaning). Expected count after: 2 remaining `term.write(`.

- [ ] **Step 4: `fitTerminal` guard (line 1027)**

First line of `fitTerminal`'s body: `if (surfaceRef.current === 'canvas') return; // xterm is display:none; fit() on a hidden element measures nothing`. After the function definition add `fitTerminalRef.current = fitTerminal;` (the ref is declared in Step 2).

- [ ] **Step 5: Output handlers**

`ansi-output` (line 2042): delete `dispatchPetsciiOverlay({ type: 'ansi-output' });` and its comment (2043-2047). At the tail (lines 2179-2187) replace:

```ts
      // Use modem emulator for client-side speed throttling
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(output);
      } else {
        term.write(output);
      }
      term.refresh(0, term.rows - 1);
```

with:

```ts
      if (surfaceRef.current === 'canvas') {
        // Simulated C64: the whole session renders on the canvas. The pace
        // queue (petsciiBpsRef, same 'modem-speed' as ModemEmulator) keeps
        // the baud feel; xterm stays hidden.
        enqueuePetscii(petsciiTransducerRef.current!.transduce(output));
        return;
      }
      // Use modem emulator for client-side speed throttling
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(output);
      } else {
        term.write(output);
      }
      term.refresh(0, term.rows - 1);
```

(The RIP `textBefore` write at line 2116 already went through `writeTerm` in Step 3.)

Replace lines 2190-2222 (`petsciiFontReady`, `ensurePetsciiTerminal`, the `petscii-output` handler) with:

```ts
    // Legacy PUA text (command.handler's C64 prompts, BBSApi.writePetsciiLine).
    // A PETSCII session by definition: the transducer decodes U+E000-E1FF.
    socket.on('petscii-output', (data: string) => {
      ensurePetsciiSession();
      enqueuePetscii(petsciiTransducerRef.current!.transduce(data));
    });
```

Replace the `petscii-bytes` handler (lines 2266-2288, the drain block having moved in Step 3) with:

```ts
    // Raw .seq bytes (screen.handler emitPetsciiScreen, BBSApi.writePetscii(Buffer)).
    socket.on('petscii-bytes', (b64: string) => {
      ensurePetsciiSession();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      petsciiTransducerRef.current!.observe(bytes); // the oracle must see what the screen now shows
      enqueuePetscii(bytes);
    });
```

`terminal-resize` (lines 2309-2317) becomes:

```ts
    socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
      console.log('[Terminal] Resize request:', size.cols, 'x', size.rows);
      if (size.cols === 40 && size.rows === 25) {
        // The 'P' answer (pre-login.ts applyGraphicsAnswer): the session is a
        // C64 from here on. xterm is not resized - it stays 80x24, hidden,
        // ready for the next non-PETSCII session on this component.
        ensurePetsciiSession();
        return;
      }
      term.resize(size.cols, size.rows);
    });
```

`login-success` (line 2464): `term.focus();` -> `focusSurface();`. `session-restored` (2482): `term.focus();` -> `focusSurface();`.

`set-font` / `font-preference` (2807-2870): delete the `resolveTerminalFontFamily` usage - both handlers become the plain form:

```ts
      term.options.fontFamily = requestedFontFamily;
      term.options.fontSize = size;
      term.options.lineHeight = requestedLineHeight;
      normalFont.current = requestedFontFamily;
```

and the Bug F comments go (`grep -n "Bug F"` empty afterwards). xterm no longer shows a PETSCII session, so nothing needs to keep PetMe64 on it.

- [ ] **Step 6: Input - one path**

Replace the whole `term.onKey(...)` handler (lines 2873-3009) and `term.onData(...)` (3011-3046) with:

```ts
    // Login state machine context (utils/login-key-machine.ts). The echo
    // goes through writeTerm, so a 'P' session sees its own typing on the
    // canvas; passwords are masked exactly as before.
    const loginCtx: LoginKeyContext = {
      state: loginState,
      username, password, newUserPromptUsername, passwordResetInput, forcedPwdChangeInput, passwordMode,
      emit: (event, payload) => { socket.emit(event, payload); },
      echo: writeTerm,
      defer: (fn) => { setTimeout(fn, 0); },
      log: (m) => console.log('[Login] ' + m),
    };
    const isLoginBusy = () =>
      loginState.current === 'username' || loginState.current === 'password' ||
      loginState.current === 'new-user-prompt' || loginState.current === 'checking-username' ||
      loginState.current === 'logging-in' || loginState.current === 'password-reset' ||
      loginState.current === 'forced-pwd-change';
    // Post-login input to the server (was the tail of term.onData).
    const sendInput = (data: string) => {
      if (!socket.connected) { console.error('[Terminal] Socket not connected, cannot send data'); return; }
      if (gameMode.current) return; // keydown/keyup are sent separately in game mode
      if (data === '\x03' && doorActive.current) {
        console.log('[BBSTerminal] Ctrl+C pressed while door active - sending door:terminate');
        writeTerm('\r\n\x1b[33m[Aborting door...]\x1b[0m\r\n');
        socket.emit('door:terminate');
        return;
      }
      socket.emit('command', data);
    };
    // The one input path for the on-screen keyboard and the canvas: login
    // machine first, otherwise server. (xterm's own two callbacks below keep
    // their split because onData also delivers pastes that never hit onKey.)
    processInputKeyRef.current = (key: string) => {
      flushPetsciiQueue();
      if (processLoginKey(key, loginCtx)) return;
      sendInput(key);
    };

    term.onKey(({ key }) => {
      if (!socket.connected) { console.error('[Terminal] Socket not connected, cannot send key'); return; }
      processLoginKey(key, loginCtx);
    });

    term.onData((data: string) => {
      flushPetsciiQueue();
      if (isLoginBusy()) return; // handled (or swallowed) by onKey above
      sendInput(data);
    });
```

In `useImperativeHandle` (line 764): `focus: () => { focusSurfaceRef.current(); }`, and replace the whole `injectInput` body (lines 773-887) with:

```ts
    injectInput: (data: string) => {
      // On-screen/mobile keyboard. Same path as physical keys and the canvas.
      processInputKeyRef.current(data);
    },
```

Delete the `dispatchPetsciiOverlay({ type: 'keypress' })` call and comment that used to open `injectInput` (Bug I) - it no longer exists after the replacement. Delete the window-keydown dismiss effect (lines 3143-3156).

- [ ] **Step 7: Render**

Replace the `terminalRef` div's style additions and the overlay block (lines 3477-3600) so the wrapper reads:

```tsx
      <div
        style={{
          position: 'relative',
          width: '100%',
          ...(terminalMode === 'fixed' ? { maxWidth: '960px' } : { height: '100%' }),
        }}
      >
      <div
        ref={terminalRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mouseButtonDown.current = false; }}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none',
          width: '100%',
          ...(terminalMode === 'fixed' ? {} : { height: '100%' }),
          // A 'P' session is a C64: the canvas below is the surface and xterm
          // is hidden (kept mounted - RIP, ZMODEM and the modem emulator hold
          // the instance). Nothing reads xterm's screen while hidden.
          ...(surface === 'canvas' ? { display: 'none' } : {}),
        }}
      />
      {surface === 'canvas' && petsciiMachineRef.current && (
        <div
          style={{
            width: '100%',
            // 352x232 = one bordered C64 screen (PetsciiCanvas UNIT_W/UNIT_H).
            ...(terminalMode === 'fixed' ? { aspectRatio: '352 / 232' } : { height: '100%' }),
            backgroundColor: '#000',
          }}
        >
          <PetsciiCanvas
            ref={petsciiCanvasRef}
            machine={petsciiMachineRef.current}
            focusable
            focusOnMount
            onData={(bytes) => {
              // keymap.ts bytes -> the same ASCII/ANSI the server reads from
              // xterm, via the SDK's shared PETSCII input map (cursor and
              // function keys included), then the one input path.
              const text = petsciiInputToAscii(bytes);
              if (text) processInputKeyRef.current(text);
            }}
          />
        </div>
      )}
```

Add after `handleClick` (line 3159) an effect that restores xterm when a fresh session resets the surface:

```ts
  useEffect(() => {
    if (surface === 'xterm') {
      fitTerminalRef.current();
      terminalInstance.current?.focus();
    }
  }, [surface]);
```

- [ ] **Step 8: Retire the hybrid modules**

```bash
git rm packages/terminal/src/petscii/overlay-state.ts packages/terminal/src/petscii/font-gate.ts \
  web/backend/tests/petscii/petscii-overlay-state.test.ts web/backend/tests/petscii/petscii-font-gate.test.ts
```

`grep -rn "overlay-state\|font-gate\|resolveTerminalFontFamily\|petsciiOverlay\|dispatchPetsciiOverlay\|petsciiFrame\|ensurePetsciiTerminal\|key-bytes-to-command" packages web/backend/src web/backend/tests web/frontend/src` must be empty.

- [ ] **Step 9: Build everything, run every suite, freshness**

Run in order: `cd sdk && npm run build`; `cd packages/terminal && npm run build`; `cd web/frontend && npm run build:check && npm run build && npm test`; `cd web/backend && npx tsc --noEmit && npx jest --config dev-scripts/jest.config.ts --rootDir .`; `cd sdk && npm test`. Expected: all clean/green (the frontend's 225 tests do not touch BBSTerminal's PETSCII path; the deleted overlay/font-gate tests were the only ones). Then the door-sdk-freshness protocol (restart backend, hard reload) and the manual walk in Task 9 Step 3 - the sysop's browser verdict is the gate for this task.

- [ ] **Step 10: Commit**

```bash
git diff --cached --stat
git add packages/terminal/src/components/BBSTerminal.tsx packages/terminal/src/petscii/PetsciiCanvas.tsx packages/terminal/src/index.ts
git commit -m "feat(terminal): a P session is a C64 - the canvas is the surface, login echo and every byte render as PETSCII"
```

---

### Task 9: Docs, handoff, verification sweep, manual C64 walk

**Files:**
- Modify: `Documentation/3-Developers/ARCHITECTURE.md:5-9` (PETSCII paragraphs), `handoff.md` (currently 10,187 bytes - OVER the 10 KB cap: move the "PETSCII overhaul shipped" section's detail into `thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md` and leave a 6-line summary), `thoughts/shared/plans/2026-09-02-c64-40col-implementation.md:766` (mark Task 4 "executed by petscii-full-canvas Task 10") and `:27-38` (remove the "ANSI->PETSCII door bridge" and "cursor-key/F-key" out-of-scope bullets - shipped here)
- Create: `thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md`

- [ ] **Step 1: ARCHITECTURE.md**

Replace line 5's frontend sentence from `**PetsciiCanvas**` onward with:

```
**PetsciiCanvas** (`packages/terminal/src/petscii/PetsciiCanvas.tsx`) is THE surface for a PETSCII session (web `P` answer): `BBSTerminal.tsx` hides xterm and routes every `ansi-output`/`petscii-output` string through one `AnsiToPetsciiTransducer` (SDK, `@amiexpress/bbs-door-sdk/petscii`) into a baud-paced queue feeding a `PetsciiMachine` (KERNAL-accurate 40x25 screen-code + color-RAM emulator, also in the SDK); `petscii-bytes` (raw `.seq`) are fed directly and `observe()`d by the transducer so its cursor/charset oracle stays in step. Login echo goes through the same seam (`utils/login-key-machine.ts`), and canvas keys reach the server through the SDK's `petsciiInputToAscii`.
```

Replace line 6's backend PETSCII sentence with: `PETSCII conversion: the SDK owns the core (`sdk/petscii/`: machine, palette, screen codes, transducer, input map); `web/backend/src/utils/petscii.util.ts` keeps the PUA renderer and thin wrappers; `web/backend/src/utils/petscii-unicode-map.ts` the screen-code -> Unicode fallback. Real C64 telnet callers get one transducer per session in `server/connection-emitter.ts` - prompts, menus and blessed door frames arrive as PETSCII with cursor, colors and reverse video intact; IAC doubling stays in the telnet transport.`

Replace line 9 with: `**Known PETSCII limitations** (by design): C64 has no per-cell background - ANSI bg colors are dropped; card suits, bullets, rounded corners and diagonals are bank-0-only glyphs and are substituted in the text bank; 80-column positioned UIs are clamped to 40x25 (the 40-col plan's MIN_COLUMNS gate and table layouts address which doors should reach a C64 at all); Ctrl chords are not sent from the canvas; PETSCII screens bypass MCI codes and ~SP.`

- [ ] **Step 2: Handoff + 40-col plan cross-references**

Create `thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md` with frontmatter `date: 2026-09-02`, `topic: PETSCII full-canvas sessions`, `tags: [petscii, c64, terminal, handoff]`, `status: implemented`, and these sections, each filled from the commits of Tasks 1-8 (`git log --oneline` subjects + the file lists in this plan): `## Task(s)` (the sysop's requirement, one line; which of Tasks 1-10 landed, with hashes); `## Critical References` (this plan; `sdk/petscii/ansi-to-petscii.ts`; `web/backend/src/server/connection-emitter.ts`; `packages/terminal/src/components/BBSTerminal.tsx` `ensurePetsciiSession`/`writeTerm`; `packages/terminal/src/utils/login-key-machine.ts`); `## Recent Changes` (one line per task); `## Learnings` (the four semantic traps from this plan's self-review, the `rootDir` reason the core lives in the SDK, the jest `moduleNameMapper` to SDK source); `## Artifacts` (plan path, test file paths); `## Next Steps` (Task 10 if not yet landed; 40-col plan Tasks 1/3/5/6; SyncTERM verdict if outstanding); `## Other Notes` (the manual walk results verbatim from Step 3).

Replace `handoff.md`'s `## PETSCII overhaul shipped (2026-09-02)` section body with exactly these lines (the detail moved to the archive above), then confirm `wc -c handoff.md` < 10240:

```
## PETSCII (2026-09-02)
Full-canvas sessions: a web `P` answer or a real C64 gets EVERYTHING as PETSCII -
one `AnsiToPetsciiTransducer` (`sdk/petscii/`, KERNAL oracle inside) feeds the
canvas client-side and the telnet emitter server-side. Overlay hybrid retired.
Detail + walk results: thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md.
Open: 40-col tables/compact tier/MIN_COLUMNS (2026-09-02-c64-40col-implementation.md).
```

In `thoughts/shared/plans/2026-09-02-c64-40col-implementation.md`: under `### Task 4:` (line 766) insert `> SUPERSEDED: executed as Task 10 of thoughts/shared/plans/2026-09-02-petscii-full-canvas.md (wrap util + emitText choke). Only the view-file / AREXX / AmigaGuide width sites (Step 9 there) remain to do here.`; in the out-of-scope list (lines 27-38) delete the `ANSI->PETSCII door bridge` and `C64 cursor-key/F-key door input translation` bullets and add `- Both shipped by the petscii-full-canvas plan (transducer Tasks 2-5; input map Task 6).`

- [ ] **Step 3: Manual C64 walk (the sysop runs it; record the verdict in the handoff)**

Web, desktop: open the board, answer `P` at the graphics prompt. Expect: `PETSCII: SIMULATING C64 DISPLAY (40X25)` on the canvas, then BBSTITLE.SEQ paced onto it; the `-= Welcome =-` lines and `Username:` prompt ON THE CANVAS below/after the art (charset flips to text bank once); typing echoes on the canvas; password shows `*`; bulletins/menu render on the canvas (40-col keyhole for 80-col tables is EXPECTED until the 40-col plan; prose wraps at word boundaries once Task 10 is in); run `WHO` (or the who-is-online door): colors + positioning land on the canvas; `G` logoff. Reload: a fresh session answering `A` is plain xterm again (surface reset).
Web, mobile: same walk with the on-screen keyboard (`injectInput` path).
SyncTERM, `ScreenMode=C64`, telnet port: same walk; verify cursor keys move a blessed list (Task 6) and F1 exits chat.

- [ ] **Step 4: Commit**

```bash
git diff --cached --stat
git add Documentation/3-Developers/ARCHITECTURE.md handoff.md thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md thoughts/shared/plans/2026-09-02-c64-40col-implementation.md
git commit -m "docs(petscii): full-canvas sessions - architecture, handoff, 40-col plan cross-references"
```

---

### Task 10: 40-column word-wrap choke point (pulled forward from the 40-col plan, Task 4)

Prose (help text, mail bodies, bulletins, oneliners, AREXX door output) breaks mid-word on the canvas without this. Verbatim from `2026-09-02-c64-40col-implementation.md:766-1060` except: `sessionColumns` (that plan's Task 1, not landed) is replaced by an inline `session.screenWidth` read that Task 1 later swaps in; the view-file/AREXX/AmigaGuide width sites stay in the 40-col plan.

**Files:**
- Create: `web/backend/src/utils/wrap-for-session.util.ts`
- Modify: `web/backend/src/utils/ansi-buffer.util.ts:194-201` (`emitText`)
- Test: `web/backend/tests/utils/wrap-for-session.util.test.ts`, `web/backend/tests/utils/emit-text-wrap.test.ts`

**Interfaces:**
- Produces: `printableLength(line: string): number`; `wrapLineToWidth(line: string, width: number): string[]`; `wrapForSession(text: string, session: { screenWidth?: number; petsciiMode?: boolean } | undefined): string` - identity when width >= 80, when a door owns the terminal (`doorOwnsTerminal`, exists), or when the payload contains cursor-motion/positioning/clear sequences.
- Consumes: the emitter `session` getter from Task 5.

- [ ] **Step 1: Write the failing wrap-unit tests**

Create `web/backend/tests/utils/wrap-for-session.util.test.ts`:

```ts
import { printableLength, wrapLineToWidth, wrapForSession } from '../../src/utils/wrap-for-session.util';

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
    for (const l of out) expect(l).not.toMatch(/\x1b\[[0-9;]*$/);
  });
  it('hard-breaks a word longer than the width', () => {
    const out = wrapLineToWidth('A'.repeat(90), 40);
    expect(out.length).toBe(3);
    expect(printableLength(out[0])).toBe(40);
  });
});

describe('wrapForSession', () => {
  const c64 = { screenWidth: 40, petsciiMode: true };
  it('is identity at 80 columns, for no session, and for a missing width', () => {
    const text = 'x'.repeat(120);
    expect(wrapForSession(text, { screenWidth: 80 })).toBe(text);
    expect(wrapForSession(text, {})).toBe(text);
    expect(wrapForSession(text, undefined)).toBe(text);
  });
  it('wraps a 40-column session at word boundaries with CRLF', () => {
    const out = wrapForSession('word '.repeat(20).trim(), c64);
    for (const l of out.split('\r\n')) expect(printableLength(l)).toBeLessThanOrEqual(40);
    expect(out).not.toMatch(/[^\r]\n/);
  });
  it('passes positioned or cleared payloads through untouched (never squeeze art)', () => {
    const positioned = '\x1b[5;10H' + 'x'.repeat(70);
    const cleared = '\x1b[2J' + 'y'.repeat(70);
    expect(wrapForSession(positioned, c64)).toBe(positioned);
    expect(wrapForSession(cleared, c64)).toBe(cleared);
  });
  it('is identity while a door owns the terminal', () => {
    const text = 'z'.repeat(70);
    expect(wrapForSession(text, { ...c64, doorInputHandler: () => {} } as any)).toBe(text);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`--testPathPattern=wrap-for-session`; module missing).

- [ ] **Step 3: Implement the wrap util**

Create `web/backend/src/utils/wrap-for-session.util.ts`:

```ts
/**
 * Session-width word wrap (pulled into the petscii-full-canvas plan as
 * Task 10 from the C64/40-col plan's Task 4).
 *
 * The one choke point for prose reflow. Guards keep it provably inert
 * where it must be:
 *  - width >= 80: IDENTITY (80-col output byte-for-byte unchanged).
 *  - door-owned session: IDENTITY (doors paint their own screens).
 *  - payload with cursor motion/positioning/clear: IDENTITY (positioned
 *    UI and ANSI art are never rewrapped - "never squeeze art").
 */
import { doorOwnsTerminal } from './door-owns-terminal';

const ANSI_TOKEN_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** Motion, absolute positioning, clears, save/restore: art or full-screen UI. */
const CURSOR_CONTROL_RE = /\x1b\[[0-9;]*[ABCDHJKsu]/;

/** Width the session was told it has; 80 when unknown. The 40-col plan's Task 1 replaces this with sessionColumns(). */
function sessionWidth(session: { screenWidth?: number }): number {
  return session.screenWidth && session.screenWidth > 0 ? session.screenWidth : 80;
}

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
  const flush = () => { out.push(current); current = ''; currentLen = 0; };

  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('\x1b')) { current += token; continue; }
    for (const piece of token.split(/(\s+)/)) {
      if (!piece) continue;
      if (currentLen + piece.length <= width) { current += piece; currentLen += piece.length; continue; }
      if (/^\s+$/.test(piece)) { flush(); continue; }
      if (piece.length > width) {
        let rest = piece;
        while (rest.length > 0) {
          const room = width - currentLen;
          if (room <= 0) { flush(); continue; }
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
  const width = sessionWidth(session);
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

- [ ] **Step 5: Write the failing emitText choke tests**

Create `web/backend/tests/utils/emit-text-wrap.test.ts`:

```ts
import { emitText } from '../../src/utils/ansi-buffer.util';

function makeSocket(session?: any) {
  const emitted: string[] = [];
  const socket: any = {
    id: `wrap-test-${Math.random()}`,
    session,
    emitted,
    emit(event: string, data: string) { if (event === 'ansi-output') emitted.push(data); return true; },
    on() { return socket; },
  };
  return socket;
}

describe('emitText session-width choke', () => {
  it('wraps prose to 40 for a C64 session', () => {
    const socket = makeSocket({ screenWidth: 40, petsciiMode: true });
    emitText(socket, 'word '.repeat(20).trim() + '\r\n', true);
    for (const line of socket.emitted.join('').split('\r\n')) {
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

- [ ] **Step 6: Run, verify FAIL** (the 40-col case emits the unwrapped 100-char line today).

- [ ] **Step 7: Implement the choke**

In `web/backend/src/utils/ansi-buffer.util.ts` add `import { wrapForSession } from './wrap-for-session.util';` at the top and replace `emitText` (lines 194-201):

```ts
export function emitText(socket: Socket, text: string, immediate: boolean = false): void {
  // Session-width choke point. Web sockets carry the session
  // (index.ts:787); telnet/SSH emitters expose it via a getter
  // (connection-emitter.ts, Task 5). wrapForSession is identity at >=80
  // columns, for door-owned sessions, and for positioned/art payloads.
  const session = (socket as any).session;
  const buffer = getAnsiBuffer(socket);
  buffer.append(wrapForSession(text, session));

  if (immediate) {
    buffer.flushImmediate();
  }
}
```

- [ ] **Step 8: Run choke tests to green; run the FULL backend suite** - a full-suite pass IS the 80-column no-change proof for every existing `emitText` caller. RED proof: revert only the `emitText` body, confirm the 40-col choke test fails, restore. Build check: `npx tsc --noEmit`.

- [ ] **Step 9: Commit**

```bash
git diff --cached --stat
git add web/backend/src/utils/wrap-for-session.util.ts web/backend/src/utils/ansi-buffer.util.ts \
  web/backend/tests/utils/wrap-for-session.util.test.ts web/backend/tests/utils/emit-text-wrap.test.ts
git commit -m "feat(petscii): session-width word wrap at the emitText choke - 40-column prose breaks at words, 80 columns untouched"
```

---

## Doors on the canvas / real C64 (architecture point 5 - what this plan delivers, what it does not)

- **Works after Task 5/8:** any blessed door's ANSI frame (cursor positioning, SGR colors incl. truecolor theme tokens, box drawing, reverse video) renders on the canvas and on real hardware; door input from the canvas keymap and from a real C64 keyboard reaches `DoorInputManager`/blessed `parseKey` including arrows, Home, Insert and F1-F8 (Task 6). Line-oriented doors (telnet-front, oneliner-style, AREXX through `emitText`) read correctly, word-wrapped after Task 10. Mouse-enable sequences and cursor hide/show are swallowed (no mouse on a C64).
- **Needs the 40-col plan's compact tier (Task 3/6 there):** every blessed layout authored for 80 columns is clamped to 40x25 - right-hand panels land on column 39, wide tables overprint. Correct but not usable; that is layout work, not transduction.
- **Stays gated:** `MIN_COLUMNS` (40-col plan Task 1, default-closed 80) decides which doors a C64 session may launch at all. Until it lands, a C64 caller who launches an 80-col door sees the clamped rendering rather than the `THIS DOOR NEEDS AN 80 COLUMN SCREEN` notice. 68K doors: blanket-gated there; their CON: output would also transduce, but the ruling stands.
- **Dropped by the transducer, documented:** insert/delete line/char (`L M @ P`), scroll regions (`r`), DSR, per-cell backgrounds, Ctrl chords from the canvas.

## Self-review

**Coverage vs the six architecture points:** (1) transducer - Tasks 2-4 (parser extracted to the SDK, one copy; SGR incl. truecolor/256/bold; bg policy = drop, argued; cursor model = the machine itself; ED/EL; CR/LF; case-swap + bank-ensure replacing the prelude flag; graphics table; substitutions; overflow = KERNAL wrap, tested). (2) full-canvas session - Task 7/8 (surface reducer; xterm hidden not unmounted, argued; login via `processLoginKey` with echo through `writeTerm`; overlay retired; font-gate retired; `clearPetsciiSession` semantics kept). (3) backend - Task 5 (telnet server-side, web client-side, same module; per-session instance; `handleC64Detected` through the emitter). (4) 40-col - decision 6 + Task 10. (5) doors - Task 6 + the section above. (6) verification - oracle tests (Tasks 2/3), login walk through the real emitter (Task 5), non-negotiable pins (Tasks 5, 7, 10), manual walk (Task 9).

**Placeholder scan:** no TBD/TODO/"similar to"; every code step carries the code. Task 9 Step 2's handoff content is a documentation artifact whose text is the executor's summary of Tasks 1-8 (frontmatter fields named).

**Semantic traps caught while tracing the tests against the machine (kept as tests):** RETURN from a non-final linked row (`newline()`), printing at (39,24) scrolls (`fillRow` cap, clamp test asserts cursor not a glyph), `observe()` never resets the pen, `flush()` emits one `$9D` per column.

**Type consistency:** `AnsiToPetsciiTransducer.transduce(text: string): Uint8Array` / `observe(bytes: Uint8Array | number[])` / `flush(): Uint8Array` used identically in Tasks 4, 5, 8; `petsciiInputToAscii(bytes: ArrayLike<number>): string` in Tasks 6, 8; `processLoginKey(key: string, ctx: LoginKeyContext): boolean` in Tasks 7, 8; `PetsciiCanvasHandle.focus()` in Task 8; `petsciiSurfaceReducer` events `'petscii-session-start' | 'session-reset'` in Tasks 7, 8; the emitter `session` getter defined in Task 5 and consumed in Task 10; `screenCodeToPetscii` defined in Task 1, consumed in Tasks 2, 4; `PetsciiMachine.logicalLineEndRow` defined in Task 2, consumed by `newline()` (Task 2) and pinned by the Task 3 CRLF-after-EL test.

**Spec conflicts resolved (reported to the caller):** transducer location (prompt: `packages/terminal/src/petscii/`; plan: `sdk/petscii/` - backend `rootDir` makes the prompt's location unusable by the runtime emitter it also asks for); legacy `convertUnicodePuaToPetscii` expectations for HOME-prefixed positioning and uppercase pass-through (changed deliberately, re-pinned through the oracle); `convertPetsciiInputToAscii`'s inverted letter case (unified on the web keymap's convention).
