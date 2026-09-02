# True PETSCII Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every defect in the current PETSCII path (Tier 1) and add a true C64-accurate canvas renderer with raw-byte transport and real-C64 telnet autodetection (Tier 2).

**Architecture:** Tier 1 repairs the existing PETSCII→PUA→xterm.js pipeline (font loading, converter correctness, palette, real-C64 reverse path, detection). Tier 2 adds a KERNAL-accurate `PetsciiMachine` state machine + `PetsciiCanvas` React renderer in `packages/terminal`, switches web transport to raw PETSCII bytes (`petscii-bytes` event, base64), and sends the same raw bytes to real C64 telnet callers.

**Tech Stack:** TypeScript, jest (`web/backend`, config `dev-scripts/jest.config.ts`), vitest+jsdom (`web/frontend`), xterm.js 5.5, React 18, canvas 2D, Pet Me 64 TTF (verified: full U+E000–E1FF, screen-code order, bank 0 at E0xx / bank 1 at E1xx, reverse at +0x80).

**Spec:** `thoughts/shared/research/2026-09-01_petscii-audit.md` (flaws A1–G3) + `thoughts/shared/research/2026-09-01_true-petscii-reference.md` (verified PETSCII tables, palettes, KERNAL semantics). Read both before starting.

## Global Constraints

- Type-check after every change: `cd web/backend && npx tsc --noEmit` (backend), `cd web/frontend && npm run build:check` (frontend), `cd packages/terminal && npm run build` (terminal package).
- Backend tests: `cd web/backend && npm test`. Frontend tests: `cd web/frontend && npm test`.
- Every fix ships with a regression test that fails before / passes after (temporarily revert fix to prove failure before committing).
- No emojis anywhere. BBS-visible strings: ASCII tokens only.
- After editing `packages/terminal` or `sdk/`, run the door-sdk-freshness protocol (`.claude/skills/door-sdk-freshness/SKILL.md`) before telling anyone to test. Frontend is a BUILT bundle: rebuild `packages/terminal` then `web/frontend` before browser testing.
- Never use Edit/Write on `.seq` files or other high-bit binary files (UTF-8 round-trip destroys bytes). Test fixtures: build buffers in code with `Buffer.from([...])`.
- Commit per task, files added by name, no `git add -A`. One pusher at a time per `thoughts/BOARD.md`; commit locally, do not push until user says "deploy".
- C64 facts come from the reference doc — do not improvise codes or palette values.

## Shared constants (used by many tasks)

VIC-II palettes (reference doc §3):

```ts
// Colodore (default)
export const C64_PALETTE_COLODORE: readonly string[] = [
  '#000000', '#FFFFFF', '#813338', '#75CEC8', '#8E3C97', '#56AC4D', '#2E2C9B', '#EDF171',
  '#8E5029', '#553800', '#C46C71', '#4A4A4A', '#7B7B7B', '#A9FF9F', '#706DEB', '#B2B2B2',
];
// Pepto (classic VICE)
export const C64_PALETTE_PEPTO: readonly string[] = [
  '#000000', '#FFFFFF', '#68372B', '#70A4B2', '#6F3D86', '#588D43', '#352879', '#B8C76F',
  '#6F4F25', '#433900', '#9A6759', '#444444', '#6C6C6C', '#9AD284', '#6C5EB5', '#959595',
];
// PETSCII color control byte -> VIC color index
export const PETSCII_COLOR_TO_VIC: { [key: number]: number } = {
  0x90: 0, 0x05: 1, 0x1C: 2, 0x9F: 3, 0x9C: 4, 0x1E: 5, 0x1F: 6, 0x9E: 7,
  0x81: 8, 0x95: 9, 0x96: 10, 0x97: 11, 0x98: 12, 0x99: 13, 0x9A: 14, 0x9B: 15,
};
```

C64 power-on defaults: pen = 14 (light blue), background = 6 (blue), border = 14.

---

### Task 1: Converter correctness — control-code no-ops, RVS semantics, RETURN cancels RVS

Fixes audit A4, A5, B4.

**Files:**
- Modify: `web/backend/src/utils/petscii.util.ts:231-310` (`convertPetsciiByteForPetMe64`), `:319-452` (`convertPetsciiByte`)
- Test: `web/backend/tests/utils/petscii.util.test.ts` (extend existing suite)

**Interfaces:**
- Produces: unchanged public signatures. New behavior contract: unhandled control bytes → `''`; `0x12`/`0x92` set state only (no SGR); `0x0D` resets `state.reverseVideo`; printable path in PetMe64 converter computes `screenCode | (reverseVideo ? 0x80 : 0)` so the font's dedicated reverse glyphs (U+E080+) are used.

- [ ] **Step 1: Write failing tests**

Add to `web/backend/tests/utils/petscii.util.test.ts` inside `describe('convertPetsciiToPetMe64')`:

```ts
it('ignores unhandled control codes instead of emitting reverse glyphs', () => {
  // $0A, $0F, $10, $80, $8F are no-ops on a C64
  const out = convertPetsciiToPetMe64(Buffer.from([0x0A, 0x0F, 0x10, 0x80, 0x8F, 0x41]));
  // Only 'A' (screen code 0x01 -> U+E001) plus color/reset framing may appear
  expect(out).toContain(String.fromCodePoint(0xE001));
  for (const cp of [0xE08A, 0xE08F, 0xE090, 0xE0C0, 0xE0CF]) {
    expect(out).not.toContain(String.fromCodePoint(cp));
  }
});

it('renders reverse video via +0x80 screen codes, not SGR 7', () => {
  // RVS on, 'A', RVS off, 'A'
  const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x92, 0x41]));
  expect(out).toContain(String.fromCodePoint(0xE081)); // reverse A = screen code 0x01 | 0x80
  expect(out).toContain(String.fromCodePoint(0xE001)); // normal A
  expect(out).not.toContain('\x1b[7m');
});

it('RETURN cancels reverse video (KERNAL $0D behavior)', () => {
  // RVS on, 'A', RETURN, 'A' -> second A must NOT be reverse
  const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x0D, 0x41]));
  const afterReturn = out.slice(out.indexOf('\r\n') + 2);
  expect(afterReturn).toContain(String.fromCodePoint(0xE001));
  expect(afterReturn).not.toContain(String.fromCodePoint(0xE081));
});

it('Shift+RETURN ($8D) does NOT cancel reverse video', () => {
  const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x8D, 0x41]));
  const afterReturn = out.slice(out.indexOf('\r\n') + 2);
  expect(afterReturn).toContain(String.fromCodePoint(0xE081));
});
```

- [ ] **Step 2: Run tests, verify all four FAIL**

Run: `cd web/backend && npm test -- --testPathPattern=petscii.util`
Expected: the four new tests fail (reverse glyphs from control fallthrough, SGR 7 present, RVS bleeding past RETURN).

- [ ] **Step 3: Implement in `convertPetsciiByteForPetMe64`**

Replace the REVERSE VIDEO, LINE BREAKS, IGNORED CONTROL CODES, and PRINTABLE sections with:

```ts
  // REVERSE VIDEO - state only; rendering uses the font's reverse glyph bank (+0x80)
  if (byte === 0x12) { state.reverseVideo = true;  return ''; }
  if (byte === 0x92) { state.reverseVideo = false; return ''; }

  // LINE BREAKS - KERNAL: RETURN ($0D) cancels reverse mode; Shift+RETURN ($8D) does not
  if (byte === 0x0D) { state.reverseVideo = false; return '\r\n'; }
  if (byte === 0x8D) { return '\r\n'; }

  // ALL remaining control bytes are no-ops on a C64 (audit A5): never let them
  // fall through to the printable path, where petsciiToScreenCode() would turn
  // them into reverse glyphs.
  if (byte < 0x20 || (byte >= 0x80 && byte <= 0x9F)) return '';

  // PRINTABLE - screen code, reverse via bit 7 (matches C64 screen RAM exactly)
  const screenCode = petsciiToScreenCode(byte) | (state.reverseVideo ? 0x80 : 0);
  const baseCodePoint = state.shiftMode ? 0xE100 : 0xE000;
  return String.fromCodePoint(baseCodePoint + screenCode);
```

Keep the color / charset / cursor / clear / delete / insert cases above these lines; delete the now-dead `0x00/0x03/0x08/0x09/0x83/F-key` individual cases (covered by the blanket control guard). Apply the same RVS-on-RETURN reset and blanket control guard to `convertPetsciiByte` (the ANSI fallback keeps SGR 7/27 since generic terminals have no reverse glyph bank — but `0x0D` must emit `\x1b[27m\r\n` when `state.reverseVideo` was true, then reset it).

- [ ] **Step 4: Run tests, verify PASS; run full petscii suite for regressions**

Run: `cd web/backend && npm test -- --testPathPattern=petscii.util`
Expected: all pass. Some existing tests assert `\x1b[7m` in PetMe64 output — update those to the new reverse-glyph contract (the behavior change is the point of the task).

- [ ] **Step 5: Type-check + commit**

```bash
cd web/backend && npx tsc --noEmit
git add src/utils/petscii.util.ts tests/utils/petscii.util.test.ts
git commit -m "fix(petscii): control codes are no-ops, reverse uses glyph bank, RETURN cancels RVS"
```

---

### Task 2: True C64 palette (truecolor SGR) + C64 default screen state

Fixes audit C1, C2.

**Files:**
- Create: `web/backend/src/utils/c64-palette.ts`
- Modify: `web/backend/src/utils/petscii.util.ts:74-112` (`PETSCII_COLORS`, `createPetsciiState`), `:466-503` (converter prologues)
- Test: `web/backend/tests/utils/petscii.util.test.ts`

**Interfaces:**
- Produces: `c64-palette.ts` exports `C64_PALETTE_COLODORE: readonly string[]`, `C64_PALETTE_PEPTO: readonly string[]`, `PETSCII_COLOR_TO_VIC: { [key: number]: number }`, `vicToSgrForeground(vic: number, palette?: readonly string[]): string`, `vicToSgrBackground(vic: number, palette?: readonly string[]): string` (both return `\x1b[38;2;R;G;Bm` / `\x1b[48;2;R;G;Bm`). Tier 2 tasks 6–7 consume the same palette arrays.

- [ ] **Step 1: Write failing tests**

```ts
import { C64_PALETTE_COLODORE, PETSCII_COLOR_TO_VIC, vicToSgrForeground } from '../../src/utils/c64-palette';

describe('c64-palette', () => {
  it('maps all 16 PETSCII color codes to distinct VIC indices', () => {
    const indices = Object.values(PETSCII_COLOR_TO_VIC);
    expect(indices.sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
  });
  it('emits truecolor SGR from Colodore values', () => {
    expect(vicToSgrForeground(2)).toBe('\x1b[38;2;129;51;56m'); // #813338 red
    expect(vicToSgrForeground(8)).toBe('\x1b[38;2;142;80;41m'); // #8E5029 orange, distinct from yellow
  });
});

describe('convertPetsciiToPetMe64 palette', () => {
  it('orange and brown are no longer both yellow', () => {
    const orange = convertPetsciiToPetMe64(Buffer.from([0x81, 0x41]));
    const brown  = convertPetsciiToPetMe64(Buffer.from([0x95, 0x41]));
    expect(orange).toContain('\x1b[38;2;142;80;41m');
    expect(brown).toContain('\x1b[38;2;85;56;0m');
  });
  it('starts in C64 power-on state: light blue pen on blue background', () => {
    const out = convertPetsciiToPetMe64(Buffer.from([0x41]));
    expect(out.startsWith('\x1b[38;2;112;109;235m\x1b[48;2;46;44;155m')).toBe(true);
  });
  it('clear screen repaints the blue background', () => {
    const out = convertPetsciiToPetMe64(Buffer.from([0x93]));
    // bg SGR must be active before ESC[2J so xterm fills with blue
    expect(out.indexOf('\x1b[48;2;46;44;155m')).toBeLessThan(out.indexOf('\x1b[2J'));
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`npm test -- --testPathPattern=petscii`)

- [ ] **Step 3: Implement**

Create `web/backend/src/utils/c64-palette.ts` with the palette constants from "Shared constants" above plus:

```ts
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
export function vicToSgrForeground(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  const [r, g, b] = hexToRgb(palette[vic & 0x0F]);
  return `\x1b[38;2;${r};${g};${b}m`;
}
export function vicToSgrBackground(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  const [r, g, b] = hexToRgb(palette[vic & 0x0F]);
  return `\x1b[48;2;${r};${g};${b}m`;
}
```

In `petscii.util.ts`: delete `PETSCII_COLORS`; color handling becomes `if (byte in PETSCII_COLOR_TO_VIC) { state.currentColor = vicToSgrForeground(PETSCII_COLOR_TO_VIC[byte]); return state.currentColor; }`. `createPetsciiState()` initial color = `vicToSgrForeground(14)`. Both `convertPetsciiToPetMe64` and `convertPetsciiToAnsi` prologues become `let output = vicToSgrForeground(14) + vicToSgrBackground(6);`. The `0x93` case returns `vicToSgrBackground(6) + '\x1b[2J\x1b[H'`. Keep `ansiColorToPetscii` (Task 4 rewrites the PUA→PETSCII direction; it must also learn the truecolor sequences: match `38;2;R;G;B` back to the nearest VIC index by exact palette match first, else nearest-RGB).

- [ ] **Step 4: Run tests, fix existing assertions that expected `\x1b[97m` white prologue, verify PASS**

- [ ] **Step 5: Type-check + commit**

```bash
cd web/backend && npx tsc --noEmit
git add src/utils/c64-palette.ts src/utils/petscii.util.ts tests/utils/petscii.util.test.ts
git commit -m "feat(petscii): true VIC-II palette (Colodore/Pepto), C64 power-on colors"
```

---

### Task 3: Streaming converter state (persists across chunks)

Fixes audit B2.

**Files:**
- Modify: `web/backend/src/utils/petscii.util.ts` (add class), `web/backend/src/doors/BBSApi.ts:256-277` (use per-session converter)
- Test: `web/backend/tests/utils/petscii.util.test.ts`

**Interfaces:**
- Produces: `export class PetsciiStreamConverter { convert(buffer: Buffer): string; reset(): void }` — same conversion as `convertPetsciiToPetMe64` but state (color, charset, RVS) persists between `convert()` calls and no per-call `SGR 0` suffix / color prologue after the first call. `convertPetsciiToPetMe64` stays as the one-shot wrapper (`new PetsciiStreamConverter().convertScreen(buffer)` where `convertScreen` = prologue + convert + `\x1b[0m`).

- [ ] **Step 1: Write failing test**

```ts
import { PetsciiStreamConverter } from '../../src/utils/petscii.util';

describe('PetsciiStreamConverter', () => {
  it('keeps charset, color and reverse state across chunks', () => {
    const c = new PetsciiStreamConverter();
    c.convert(Buffer.from([0x0E, 0x1C, 0x12])); // shifted charset, red, RVS on
    const out = c.convert(Buffer.from([0x41]));  // 'a' in shifted mode
    expect(out).toContain(String.fromCodePoint(0xE181)); // bank 1 (0xE100) + screen code 0x01 + reverse 0x80
  });
  it('one-shot wrapper still resets per call', () => {
    convertPetsciiToPetMe64(Buffer.from([0x12]));
    const out = convertPetsciiToPetMe64(Buffer.from([0x41]));
    expect(out).toContain(String.fromCodePoint(0xE001)); // fresh state, no reverse
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (class doesn't exist)

- [ ] **Step 3: Implement**

```ts
export class PetsciiStreamConverter {
  private state = createPetsciiState();
  convert(buffer: Buffer): string {
    let out = '';
    for (let i = 0; i < buffer.length; i++) out += convertPetsciiByteForPetMe64(buffer[i], this.state);
    return out;
  }
  convertScreen(buffer: Buffer): string {
    this.reset();
    return vicToSgrForeground(14) + vicToSgrBackground(6) + this.convert(buffer) + '\x1b[0m';
  }
  reset(): void { this.state = createPetsciiState(); }
}
export function convertPetsciiToPetMe64(buffer: Buffer): string {
  return new PetsciiStreamConverter().convertScreen(buffer);
}
```

In `BBSApi.writePetscii`/`writePetsciiLine` (`BBSApi.ts:256-277`): lazily create `this.petsciiConverter = this.petsciiConverter ?? new PetsciiStreamConverter()` and use `this.petsciiConverter.convert(data)` for Buffer input (streaming — doors emit many chunks), keeping `convertPetsciiToPetMe64` only where a full screen is intended.

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Type-check + commit**

```bash
cd web/backend && npx tsc --noEmit
git add src/utils/petscii.util.ts src/doors/BBSApi.ts tests/utils/petscii.util.test.ts
git commit -m "feat(petscii): streaming converter with persistent state for door output"
```

---

### Task 4: Real-C64 output path — reverse video + ANSI parser fixes + charset prelude

Fixes audit E1, E2, E3, E4.

**Files:**
- Modify: `web/backend/src/utils/petscii.util.ts:186-214` (`screenCodeToPetscii`), `:559-579` (`convertAnsiToPetscii`), `:603-706` (`convertUnicodePuaToPetscii`, `ansiColorToPetscii`), `:747-803` (`convertAsciiToPetsciiOutput`)
- Modify: `web/backend/src/handlers/command-handler/pre-login.ts:54-79` (send `0x0E` charset prelude on real-C64 detection)
- Test: `web/backend/tests/utils/petscii.util.test.ts`

**Interfaces:**
- Produces: `screenCodeToPetscii(screenCode: number): number` now defined for 0x00–0x7F only (callers mask bit 7 and manage RVS); `convertUnicodePuaToPetscii` handles reverse glyphs, multi-param SGR, counted cursor moves, `ESC[r;cH`; `convertAsciiToPetsciiOutput(text: string, opts?: { charsetPrelude?: boolean })`.

- [ ] **Step 1: Write failing tests**

```ts
describe('convertUnicodePuaToPetscii reverse video', () => {
  it('emits $12/$92 around reverse glyphs instead of control-byte garbage', () => {
    // U+E081 = reverse A (bank 0). Old code emitted screenCodeToPetscii(0x81) = 0x01 (a control byte!)
    const bytes = convertUnicodePuaToPetscii(String.fromCodePoint(0xE081, 0xE001));
    expect(Array.from(bytes)).toEqual([0x12, 0x41, 0x92, 0x41]);
  });
});
describe('convertUnicodePuaToPetscii ANSI parser', () => {
  it('splits multi-param SGR', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[0;7m' + String.fromCodePoint(0xE001));
    expect(Array.from(bytes)).toContain(0x12);
  });
  it('repeats counted cursor moves', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[5C');
    expect(Array.from(bytes)).toEqual([0x1D, 0x1D, 0x1D, 0x1D, 0x1D]);
  });
  it('converts absolute positioning to home + moves', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[3;5H');
    expect(Array.from(bytes)).toEqual([0x13, 0x11, 0x11, 0x1D, 0x1D, 0x1D, 0x1D]);
  });
});
describe('convertAsciiToPetsciiOutput charset prelude', () => {
  it('prepends $0E so a power-on C64 shows mixed case correctly', () => {
    const bytes = convertAsciiToPetsciiOutput('Hi', { charsetPrelude: true });
    expect(Array.from(bytes)).toEqual([0x0E, 0xC8, 0x49]); // 0x0E, 'H'->0xC8, 'i'->0x49
  });
});
describe('convertAnsiToPetscii case handling', () => {
  it('case-swaps so a .seq file displays correct case in shifted mode', () => {
    const bytes = convertAnsiToPetscii('Ab');
    // prelude 0x0E, 'A' -> 0xC1 (shifted uppercase), 'b' -> 0x42 (shifted lowercase)
    expect(Array.from(bytes)).toEqual([0x0E, 0xC1, 0x42]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

`screenCodeToPetscii`: delete the `$80-$9F -> -$80` branch and the `$C0-$DF` branch; document the 0x00–0x7F domain; keep $00–$1F→+$40, $20–$3F→same, $40–$5F→+$80, $60–$7F→+$40, else 0x20.

`convertUnicodePuaToPetscii` PUA branch (both banks):

```ts
    if (code >= 0xE000 && code <= 0xE1FF) {
      const wantShift = code >= 0xE100;
      if (wantShift !== currentShiftMode) {
        bytes.push(wantShift ? 0x0E : 0x8E);
        currentShiftMode = wantShift;
      }
      const screenCode = code & 0xFF;
      const wantReverse = (screenCode & 0x80) !== 0;
      if (wantReverse !== currentReverse) {
        bytes.push(wantReverse ? 0x12 : 0x92);
        currentReverse = wantReverse;
      }
      bytes.push(screenCodeToPetscii(screenCode & 0x7F));
    }
```

(`let currentReverse = false;` alongside `currentShiftMode`.) ANSI branch: parse params with `ansiCode.split(';')`; for `m` run each param through `ansiColorToPetscii` (extend it: a param list starting `38;2;R;G;B` maps to the VIC index whose palette entry matches exactly, else nearest by squared RGB distance — import `C64_PALETTE_COLODORE`); for `A/B/C/D` push the move byte `parseInt(ansiCode || '1', 10)` times; for `H` with `r;c` push `0x13`, then `r-1` × `0x11`, then `c-1` × `0x1D`.

`convertAsciiToPetsciiOutput(text, opts)`: unchanged mapping, but when `opts?.charsetPrelude` push `0x0E` first. `convertAnsiToPetscii` becomes: `Buffer.concat([Buffer.from([0x0E]), convertAsciiToPetsciiOutput(text)])` minus the double-prelude (implement as `convertAsciiToPetsciiOutput(text, { charsetPrelude: true })` and delete the old broken body).

`pre-login.ts:56` (real-C64 branch): after setting `session.petsciiMode`, add `socket.emit('petscii-bytes-raw', Buffer.from([0x0E]));` — no. Simpler and available today: the `ansi-output` C64 branch in `index.ts:1107` calls `convertAsciiToPetsciiOutput(strippedData)`; give the session a one-shot flag: in `pre-login.ts` set `(session as any).needsCharsetPrelude = true;`, and in `index.ts:1107` pass `{ charsetPrelude: (connection.session as any).needsCharsetPrelude }` then clear the flag after the first write. Add the same flag set in `applyGraphicsAnswer` `hasP` branch for telnet sessions.

- [ ] **Step 4: Run tests + existing `convertUnicodePuaToPetscii`/`convertAnsiToPetscii` suites, update stale assertions, verify PASS**

- [ ] **Step 5: Type-check + commit**

```bash
cd web/backend && npx tsc --noEmit
git add src/utils/petscii.util.ts src/handlers/command-handler/pre-login.ts src/index.ts tests/utils/petscii.util.test.ts
git commit -m "fix(petscii): real-C64 path - reverse video bytes, ANSI parser, charset prelude"
```

---

### Task 5: Frontend — load the font, invalidate the atlas, enforce 40 cols, route through modem emulator

Fixes audit A1, A2, A3, B3 — the screenshot bugs.

**Files:**
- Modify: `packages/terminal/src/components/BBSTerminal.tsx:267-294` (preload list), `:2036-2078` (`petscii-output` + `terminal-resize` handlers)
- Test: manual verification (no vitest coverage for BBSTerminal exists; xterm+canvas do not run under jsdom). Automated coverage for the conversion side already exists in Tasks 1–4.

**Interfaces:**
- Consumes: `petscii-output` payload from Tasks 1–3 (PUA string with truecolor SGR).
- Produces: none new.

- [ ] **Step 1: Add PetMe64 to the preload list**

`BBSTerminal.tsx:269` — append to the `fonts` array:

```ts
      { family: 'PetMe64', url: '/fonts/PetMe64.ttf' },
```

- [ ] **Step 2: Rewrite the `petscii-output` handler with font-ready gating + atlas clear + 40-col enforcement + modem routing**

Replace `BBSTerminal.tsx:2036-2049` with:

```ts
    // PETSCII output handler. The font MUST be loaded before xterm rasterizes
    // PUA glyphs - a canvas renderer never triggers CSS @font-face loading, and
    // xterm caches rasterized tofu in its texture atlas (audit A1/A2).
    let petsciiFontReady: Promise<unknown> | null = null;
    const ensurePetsciiTerminal = async () => {
      petsciiFontReady = petsciiFontReady ?? document.fonts.load('16px PetMe64');
      await petsciiFontReady;
      const currentFont = term.options.fontFamily;
      if (!currentFont?.includes('PetMe64')) {
        normalFont.current = currentFont || 'TopazPlus_a1200, "Courier New", monospace';
        term.options.fontFamily = 'PetMe64, "Courier New", monospace';
        (term as any).clearTextureAtlas?.(); // drop any cached fallback glyphs
      }
      if (term.cols !== 40 || term.rows !== 25) {
        term.resize(40, 25); // PETSCII art is authored for 40x25 (audit A3)
      }
    };
    socket.on('petscii-output', (data: string) => {
      void ensurePetsciiTerminal().then(() => {
        // Same pacing queue as ANSI output - keeps ordering and lets art
        // draw at modem speed instead of jumping the ANSI queue (audit B3).
        if (modemEmulatorRef.current) {
          modemEmulatorRef.current.write(data);
        } else {
          term.write(data);
        }
        term.refresh(0, term.rows - 1);
      });
    });
```

- [ ] **Step 3: Fix the `terminal-resize` handler the same way**

In `BBSTerminal.tsx:2066-2078`, replace the body of the `if (size.cols === 40 && size.rows === 25)` branch with `void ensurePetsciiTerminal();` (declare `ensurePetsciiTerminal` above both handlers).

- [ ] **Step 4: Rebuild + type-check**

```bash
cd packages/terminal && npm run build
cd ../../web/frontend && npm run build:check && npm run build
```

- [ ] **Step 5: Manual verification (report, do not check off yourself)**

Follow `.claude/skills/door-sdk-freshness/SKILL.md`. Then user test script: connect to the web BBS, answer `P` at the graphics prompt; BBSTITLE.SEQ must render C64 glyphs (no "?" tofu), 40 columns wide, no reverse-video bars bleeding across lines, orange/brown distinct.

- [ ] **Step 6: Commit**

```bash
git add packages/terminal/src/components/BBSTerminal.tsx
git commit -m "fix(terminal): preload PetMe64, clear glyph atlas, enforce 40x25, pace PETSCII output"
```

---

### Task 6: Telnet autodetection of real C64s (+ XTERM misdetection fix)

Fixes audit F1, F2, F3. Requirement from the user: real C64s must be autodetected when they call via telnet. Reliable passive detection does not exist (reference §5); the implemented design is layered: (1) TTYPE fast path (exists), (2) the connect-screen keypress doubles as a DEL-probe — PETSCII DEL is $14, ASCII sends $08/$7F — the classic Image BBS mechanism, no question asked, (3) NAWS 40×25 only as a hint when TTYPE is absent. Dedicated port lands in Task 11.

**Files:**
- Modify: `web/backend/src/server/telnet-server.ts:293-321` (`isAmiga`), `web/backend/src/handlers/command-handler/pre-login.ts:42-91` (DISPLAY_CONNECT), `web/backend/src/index.ts:1229-1245` (raw-byte classification hook)
- Create: `web/backend/src/utils/c64-detect.util.ts`
- Test: `web/backend/tests/utils/c64-detect.util.test.ts`, extend `web/backend/tests/handlers/graphics-answer.test.ts` sibling patterns

**Interfaces:**
- Produces: `classifyFirstKeypress(raw: Buffer): 'petscii' | 'ascii' | 'ambiguous'` — pure function; `$14` or any byte in `0xC1–0xDA` → `'petscii'`; `$08`/`$7F` or ASCII lowercase → `'ascii'`; else `'ambiguous'`.
- Consumes: raw `Buffer` from `connection.on('data')` in `index.ts:1218` BEFORE `convertPetsciiInputToAscii` runs.

- [ ] **Step 1: Write failing tests**

```ts
import { classifyFirstKeypress } from '../../src/utils/c64-detect.util';

describe('classifyFirstKeypress', () => {
  it('PETSCII DEL ($14) identifies a C64', () =>
    expect(classifyFirstKeypress(Buffer.from([0x14]))).toBe('petscii'));
  it('shifted PETSCII letters ($C1-$DA) identify a C64', () =>
    expect(classifyFirstKeypress(Buffer.from([0xC1]))).toBe('petscii'));
  it('ASCII BS/DEL identifies an ASCII terminal', () => {
    expect(classifyFirstKeypress(Buffer.from([0x08]))).toBe('ascii');
    expect(classifyFirstKeypress(Buffer.from([0x7F]))).toBe('ascii');
  });
  it('ASCII lowercase identifies an ASCII terminal', () =>
    expect(classifyFirstKeypress(Buffer.from([0x61]))).toBe('ascii'));
  it('RETURN is ambiguous (same byte in both encodings)', () =>
    expect(classifyFirstKeypress(Buffer.from([0x0D]))).toBe('ambiguous'));
});
```

And a telnet-server regression for F3 (new file `web/backend/tests/server/terminal-type-detect.test.ts` — extract the classification block into an exported pure function first):

```ts
import { classifyTerminalType } from '../../src/server/telnet-server';

describe('classifyTerminalType', () => {
  it('XTERM is unicode-capable (regression: substring TERM matched isAmiga)', () => {
    expect(classifyTerminalType('XTERM-256COLOR').unicodeCapable).toBe(true);
  });
  it('bare TERM (Amiga Term) is not unicode-capable', () => {
    expect(classifyTerminalType('TERM').unicodeCapable).toBe(false);
  });
  it('C64 TTYPEs are C64', () => {
    expect(classifyTerminalType('CGTERM-C64').isC64).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (functions don't exist)

- [ ] **Step 3: Implement**

`c64-detect.util.ts`:

```ts
export type FirstKeyClass = 'petscii' | 'ascii' | 'ambiguous';

/**
 * Classify a caller's first keypress bytes. PETSCII DEL is $14 while ASCII
 * terminals send BS $08 or DEL $7F; C64 shifted letters arrive as $C1-$DA
 * while ASCII lowercase is $61-$7A. Reference doc section 5.2.
 */
export function classifyFirstKeypress(raw: Buffer): FirstKeyClass {
  for (const byte of raw) {
    if (byte === 0x14 || (byte >= 0xC1 && byte <= 0xDA)) return 'petscii';
    if (byte === 0x08 || byte === 0x7F || (byte >= 0x61 && byte <= 0x7A)) return 'ascii';
  }
  return 'ambiguous';
}
```

`telnet-server.ts`: extract lines 288–334 into an exported pure `classifyTerminalType(terminalTypeString: string): { isC64: boolean; isAmiga: boolean; unicodeCapable: boolean }` and fix `isAmiga`:

```ts
  const isAmiga = terminalTypeString.startsWith('AMIGA') ||
                  terminalTypeString === 'TERM' ||          // bare "TERM" = Amiga Term; must not match XTERM
                  terminalTypeString.includes('NCOMM') ||
                  terminalTypeString.includes('JRCOMM') ||
                  terminalTypeString.includes('VT52') ||
                  terminalTypeString === 'UNKNOWN';
```

`index.ts` `connection.on('data')` (before the input conversion at :1232): when `connection.session?.state === BBSState.AWAIT && connection.session.subState === LoggedOnSubState.DISPLAY_CONNECT && connection.session.terminalType === 'unknown'`, call `classifyFirstKeypress(data)`; on `'petscii'` set `connection.session.terminalType = 'c64'` before the existing conversion branch runs (the pre-login handler's real-C64 branch at `pre-login.ts:54` then fires on this very keypress). On `'ascii'`/`'ambiguous'` leave as-is (ANSI prompt path).

`pre-login.ts`: make the connect screen invite the probing key for telnet callers. In the code that displays the connect screen prompt (grep for the DISPLAY_CONNECT emit site; it lives in the AWAIT display flow of `core.ts:292-339`), use uppercase-only ASCII — it renders correctly on a power-on C64 (PETSCII $41–$5A displays as uppercase in up/gfx mode): `PRESS <DEL> OR <RETURN> TO CONTINUE`. DEL-pressers get instantly classified; RETURN-pressers stay ambiguous and fall through to the graphics prompt, which is correct.

- [ ] **Step 4: Run tests, verify PASS; run full backend suite** (`npm test`)

- [ ] **Step 5: Type-check + commit**

```bash
cd web/backend && npx tsc --noEmit
git add src/utils/c64-detect.util.ts src/server/telnet-server.ts src/index.ts src/handlers/command-handler/pre-login.ts src/handlers/command-handler/core.ts tests/utils/c64-detect.util.test.ts tests/server/terminal-type-detect.test.ts
git commit -m "feat(telnet): autodetect real C64s via DEL-probe first keypress; fix XTERM/TERM misclassification"
```

---

### Task 7: PetsciiMachine — KERNAL-accurate screen state machine (Tier 2 core)

Implements reference §1.2–1.3, §2: screen-code matrix, color RAM, global charset, logical lines, destructive DEL/INS, scroll.

**Files:**
- Create: `packages/terminal/src/petscii/petscii-machine.ts`, `packages/terminal/src/petscii/c64-palette.ts` (same constants as Task 2 — frontend package cannot import backend; duplication pinned by tests asserting equality is impossible cross-package, so keep values verbatim from "Shared constants" and note the twin in a comment on both files)
- Test: `web/backend/tests/petscii/petscii-machine.test.ts` (jest can transform the package source via relative import; the machine is pure TS with zero DOM/React imports)

**Interfaces:**
- Produces:

```ts
export interface PetsciiMachineState {
  cols: 40; rows: 25;
  screen: Uint8Array;    // 1000 screen codes (bit 7 = reverse)
  colorRam: Uint8Array;  // 1000 VIC color indices
  cursorX: number; cursorY: number;
  charsetBank: 0 | 1;    // 0 = uppercase/graphics (power-on), 1 = lowercase/uppercase
  reverse: boolean;
  pen: number;           // VIC index, power-on 14
  background: number;    // VIC index, fixed 6 (no PETSCII code changes it)
  border: number;        // VIC index, fixed 14
}
export class PetsciiMachine {
  readonly state: PetsciiMachineState;
  feed(bytes: Uint8Array | Buffer | number[]): void;  // apply PETSCII stream
  reset(): void;                                       // power-on state, clear screen
  onUpdate?: (fullRepaint: boolean) => void;           // fullRepaint=true on charset flip / clear / scroll
}
```

- Consumes: `PETSCII_COLOR_TO_VIC` from `./c64-palette`.

- [ ] **Step 1: Write the failing test suite** — this is the fidelity contract; write it completely first:

```ts
import { PetsciiMachine } from '../../../packages/terminal/src/petscii/petscii-machine';

const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];

describe('PetsciiMachine', () => {
  it('powers on: up/gfx charset, pen light blue, blue bg, clear screen', () => {
    const m = new PetsciiMachine();
    expect(m.state.charsetBank).toBe(0);
    expect(m.state.pen).toBe(14);
    expect(m.state.background).toBe(6);
    expect(cell(m, 0, 0)).toBe(0x20);
  });

  it('prints a letter as its screen code with current pen in color RAM', () => {
    const m = new PetsciiMachine();
    m.feed([0x1C, 0x41]); // red, 'A'
    expect(cell(m, 0, 0)).toBe(0x01);
    expect(color(m, 0, 0)).toBe(2);
    expect(m.state.cursorX).toBe(1);
  });

  it('charset flip is GLOBAL: existing cells keep screen codes, repaint fires', () => {
    const m = new PetsciiMachine();
    let repaints = 0;
    m.onUpdate = (full) => { if (full) repaints++; };
    m.feed([0x41, 0x0E]); // 'A', switch to lowercase bank
    expect(cell(m, 0, 0)).toBe(0x01);   // screen code unchanged
    expect(m.state.charsetBank).toBe(1); // glyph resolution changes at render time
    expect(repaints).toBeGreaterThan(0);
  });

  it('reverse video sets bit 7 of the screen code; RETURN cancels it', () => {
    const m = new PetsciiMachine();
    m.feed([0x12, 0x41, 0x0D, 0x41]);
    expect(cell(m, 0, 0)).toBe(0x81);
    expect(cell(m, 0, 1)).toBe(0x01);
  });

  it('wraps at column 40 onto a linked continuation row', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(41).fill(0x41));
    expect(cell(m, 0, 1)).toBe(0x01);
    expect(m.state.cursorX).toBe(1);
    expect(m.state.cursorY).toBe(1);
  });

  it('DELETE is destructive: pulls the rest of the logical line left', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x42, 0x43, 0x9D, 0x9D, 0x14]); // ABC, left x2 (cursor at B), DEL
    // KERNAL DEL at position 1 removes the char left of cursor... C64 DEL deletes
    // the character UNDER the cursor after moving back: result is 'BC' shifted:
    expect(cell(m, 0, 0)).toBe(0x02); // 'B'
    expect(cell(m, 1, 0)).toBe(0x03); // 'C'
    expect(cell(m, 2, 0)).toBe(0x20);
  });

  it('INSERT pushes the rest of the logical line right', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x42, 0x13, 0x94]); // AB, home, insert
    expect(cell(m, 0, 0)).toBe(0x20);
    expect(cell(m, 1, 0)).toBe(0x01);
    expect(cell(m, 2, 0)).toBe(0x02);
  });

  it('cursor-down at the bottom row scrolls the screen and color RAM', () => {
    const m = new PetsciiMachine();
    m.feed([0x1C, 0x41]);              // red 'A' at (0,0)
    m.feed(new Array(25).fill(0x11));  // down x24 reaches row 24; the 25th scrolls
    expect(cell(m, 0, 0)).toBe(0x20);  // row 0 now holds what was row 1 (blank) - 'A' scrolled off the top
    expect(m.state.cursorY).toBe(24);  // cursor stays on the bottom row
  });

  it('HOME homes without clearing; CLR clears and homes', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x13]);
    expect(cell(m, 0, 0)).toBe(0x01);
    expect(m.state.cursorX).toBe(0);
    m.feed([0x93]);
    expect(cell(m, 0, 0)).toBe(0x20);
  });

  it('cursor-left at column 0 moves to the end of the previous row', () => {
    const m = new PetsciiMachine();
    m.feed([0x11, 0x9D]); // down, left
    expect(m.state.cursorY).toBe(0);
    expect(m.state.cursorX).toBe(39);
  });

  it('pi ($FF) prints as screen code $5E', () => {
    const m = new PetsciiMachine();
    m.feed([0xFF]);
    expect(cell(m, 0, 0)).toBe(0x5E);
  });

  it('unhandled control codes are no-ops', () => {
    const m = new PetsciiMachine();
    m.feed([0x0A, 0x0F, 0x80, 0x8F]);
    expect(m.state.cursorX).toBe(0);
    expect(cell(m, 0, 0)).toBe(0x20);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** (`cd web/backend && npm test -- --testPathPattern=petscii-machine`; module missing)

- [ ] **Step 3: Implement `petscii-machine.ts`**

Core structure (implement fully — the rules are all in the reference doc §1.2, §2):

```ts
import { PETSCII_COLOR_TO_VIC } from './c64-palette';

const COLS = 40, ROWS = 25, CELLS = COLS * ROWS;

function petsciiToScreenCode(p: number): number {
  if (p <= 0x3F) return p;               // caller guarantees p >= 0x20 here
  if (p <= 0x5F) return p - 0x40;
  if (p <= 0x7F) return p - 0x20;
  if (p <= 0xBF) return p - 0x40;        // caller guarantees p >= 0xA0 here
  if (p <= 0xFE) return p - 0x80;
  return 0x5E;                            // $FF = pi
}

export class PetsciiMachine {
  readonly state: PetsciiMachineState = {
    cols: COLS, rows: ROWS,
    screen: new Uint8Array(CELLS).fill(0x20),
    colorRam: new Uint8Array(CELLS).fill(14),
    cursorX: 0, cursorY: 0, charsetBank: 0, reverse: false,
    pen: 14, background: 6, border: 14,
  };
  /** rowLinked[y] = true when row y is the continuation of row y-1 (logical 80-char line) */
  private rowLinked: boolean[] = new Array(ROWS).fill(false);
  onUpdate?: (fullRepaint: boolean) => void;

  feed(bytes: Uint8Array | Buffer | number[]): void {
    let full = false;
    for (const byte of bytes) full = this.apply(byte) || full;
    this.onUpdate?.(full);
  }

  private apply(b: number): boolean {
    const s = this.state;
    if (b in PETSCII_COLOR_TO_VIC) { s.pen = PETSCII_COLOR_TO_VIC[b]; return false; }
    switch (b) {
      case 0x0E: if (s.charsetBank !== 1) { s.charsetBank = 1; return true; } return false;
      case 0x8E: if (s.charsetBank !== 0) { s.charsetBank = 0; return true; } return false;
      case 0x12: s.reverse = true; return false;
      case 0x92: s.reverse = false; return false;
      case 0x0D: s.reverse = false; this.carriageReturn(); return false;
      case 0x8D: this.carriageReturn(); return false;
      case 0x11: return this.cursorDown();
      case 0x91: if (s.cursorY > 0) s.cursorY--; return false;
      case 0x1D: return this.cursorRight();
      case 0x9D: this.cursorLeft(); return false;
      case 0x13: s.cursorX = 0; s.cursorY = 0; return false;
      case 0x93: this.clear(); return true;
      case 0x14: this.deleteChar(); return false;
      case 0x94: this.insertChar(); return false;
    }
    if (b < 0x20 || (b >= 0x80 && b <= 0x9F)) return false; // all other controls: no-op
    // printable
    const sc = petsciiToScreenCode(b) | (s.reverse ? 0x80 : 0);
    const idx = s.cursorY * COLS + s.cursorX;
    s.screen[idx] = sc;
    s.colorRam[idx] = s.pen;
    return this.cursorRight(/*fromPrint*/ true);
  }
  // carriageReturn(): cursorX=0; advance below the last linked continuation row of the
  //   current logical line; scroll if past the bottom; clear link flags passed over.
  // cursorRight(fromPrint): x++; at COLS wrap to x=0,y+1, set rowLinked[y+1] when
  //   fromPrint (KERNAL links only on printing wrap), scroll at bottom (returns true).
  // cursorLeft(): x--; at -1 move to (COLS-1, y-1) unless at (0,0).
  // cursorDown(): y++; scroll at bottom (returns true).
  // clear(): fill screen 0x20, colorRam = pen, home, clear links.
  // scroll(): shift screen+colorRam up one row, clear bottom row (0x20/pen), shift rowLinked.
  // logicalLineEnd(y): last row of the logical line containing y (follow rowLinked).
  // deleteChar(): move cursor left one position (respecting wrap), then shift the
  //   remainder of the LOGICAL line (through linked rows) left one cell into the
  //   cursor position, filling the final cell with 0x20/pen.
  // insertChar(): shift the logical line's cells right one from the cursor to the
  //   logical end (dropping the last), write 0x20 at the cursor.
}
```

Write each helper out in full — no stubs. Keep the class free of DOM imports.

- [ ] **Step 4: Run tests until green** (`npm test -- --testPathPattern=petscii-machine`)

- [ ] **Step 5: Build the package + commit**

```bash
cd packages/terminal && npm run build
cd ../../web/backend && npx tsc --noEmit
git add ../../packages/terminal/src/petscii/petscii-machine.ts ../../packages/terminal/src/petscii/c64-palette.ts tests/petscii/petscii-machine.test.ts
git commit -m "feat(petscii): KERNAL-accurate PetsciiMachine state machine with logical lines"
```

---

### Task 8: PetsciiCanvas — glyph-atlas canvas renderer with baud pacing and keyboard input

**Files:**
- Create: `packages/terminal/src/petscii/PetsciiCanvas.tsx`, `packages/terminal/src/petscii/glyph-atlas.ts`, `packages/terminal/src/petscii/keymap.ts`
- Modify: `packages/terminal/src/index.ts` (exports)
- Test: `web/backend/tests/petscii/petscii-keymap.test.ts` (keymap is pure); canvas/atlas verified manually (jsdom has no 2D context)

**Interfaces:**
- Produces:

```ts
// keymap.ts
export function keyEventToPetscii(key: string, shiftKey: boolean): number[] | null;
// glyph-atlas.ts
export async function buildGlyphAtlas(pxSize: number): Promise<HTMLCanvasElement>;
// atlas layout: 512 glyphs per white-master row: bank0 sc 0-255 then bank1 sc 0-255,
// drawn from PUA (0xE000 + bank*0x100 + screenCode) with `${pxSize}px PetMe64`.
// PetsciiCanvas.tsx
export interface PetsciiCanvasProps {
  machine: PetsciiMachine;
  palette?: readonly string[];       // default C64_PALETTE_COLODORE
  scale?: number;                    // integer, default 2 (320x200 -> 640x400 + border)
  onData?: (bytes: number[]) => void; // keyboard input as PETSCII bytes
}
export const PetsciiCanvas: React.FC<PetsciiCanvasProps>;
```

- Consumes: `PetsciiMachine` (Task 7), palettes.

- [ ] **Step 1: Write failing keymap tests**

```ts
import { keyEventToPetscii } from '../../../packages/terminal/src/petscii/keymap';

describe('keyEventToPetscii', () => {
  it('Enter -> $0D', () => expect(keyEventToPetscii('Enter', false)).toEqual([0x0D]));
  it('Backspace -> PETSCII DEL $14', () => expect(keyEventToPetscii('Backspace', false)).toEqual([0x14]));
  it('arrows -> $11/$91/$1D/$9D', () => {
    expect(keyEventToPetscii('ArrowDown', false)).toEqual([0x11]);
    expect(keyEventToPetscii('ArrowUp', false)).toEqual([0x91]);
    expect(keyEventToPetscii('ArrowRight', false)).toEqual([0x1D]);
    expect(keyEventToPetscii('ArrowLeft', false)).toEqual([0x9D]);
  });
  it('Home / Shift+Home -> $13 / $93', () => {
    expect(keyEventToPetscii('Home', false)).toEqual([0x13]);
    expect(keyEventToPetscii('Home', true)).toEqual([0x93]);
  });
  it('letters are case-swapped (ASCII a -> PETSCII $41)', () => {
    expect(keyEventToPetscii('a', false)).toEqual([0x41]);
    expect(keyEventToPetscii('A', true)).toEqual([0xC1]);
  });
  it('F1 -> $85', () => expect(keyEventToPetscii('F1', false)).toEqual([0x85]));
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

`keymap.ts`: table for named keys (`Enter` 0x0D, `Backspace`/`Delete` 0x14, arrows, `Home` 0x13/0x93 with shift, `F1`–`F8` 0x85,0x89,0x86,0x8A,0x87,0x8B,0x88,0x8C in the C64 order F1,F2..; use the reference: $85 F1, $86 F3, $87 F5, $88 F7, $89 F2, $8A F4, $8B F6, $8C F8 — map browser F1→0x85, F2→0x89, F3→0x86, F4→0x8A, F5→0x87, F6→0x8B, F7→0x88, F8→0x8C). Single printable chars: lowercase `a-z` → `code - 0x20` (0x41–0x5A); uppercase `A-Z` → `code + 0x80` (0xC1–0xDA); `0x20–0x3F` and `@[\]^_` pass through; anything else → `null`.

`glyph-atlas.ts`: `await document.fonts.load(pxSize + 'px PetMe64')`; create canvas `512 * pxSize` × `pxSize`; `ctx.font = pxSize + 'px PetMe64'; ctx.textBaseline = 'top'; ctx.fillStyle = '#FFFFFF';`; for bank 0..1, sc 0..255: `ctx.fillText(String.fromCodePoint(0xE000 + bank * 0x100 + sc), (bank * 256 + sc) * pxSize, 0)`. White master; per-cell tinting at render time via a small per-color cache: `tint(color)` draws the master into an offscreen canvas and applies `globalCompositeOperation = 'source-in'` fill — build lazily, 16 entries max.

`PetsciiCanvas.tsx`: canvas sized `(40 * 8 * scale + 2 * border)` × `(25 * 8 * scale + 2 * border)` with `border = 16 * scale`; `image-rendering: pixelated`; `ctx.imageSmoothingEnabled = false`. Render on `machine.onUpdate`: fill border color, fill screen rect with `palette[machine.state.background]`, then for each cell `drawImage` the tinted glyph `(8*pxSize source → 8*scale dest)` using `colorRam[idx]`. Draw a block cursor (inverted cell) on an interval. `tabIndex={0}` + `onKeyDown`: `const bytes = keyEventToPetscii(e.key, e.shiftKey); if (bytes) { e.preventDefault(); onData?.(bytes); }`. Baud pacing lives in the feeder (Task 9), not here — the canvas just renders machine state.

Export from `packages/terminal/src/index.ts`:

```ts
export { PetsciiMachine, type PetsciiMachineState } from './petscii/petscii-machine';
export { PetsciiCanvas, type PetsciiCanvasProps } from './petscii/PetsciiCanvas';
export { keyEventToPetscii } from './petscii/keymap';
export { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from './petscii/c64-palette';
```

- [ ] **Step 4: Run keymap tests (PASS) + build package**

```bash
cd web/backend && npm test -- --testPathPattern=petscii-keymap
cd ../../packages/terminal && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add packages/terminal/src/petscii packages/terminal/src/index.ts web/backend/tests/petscii/petscii-keymap.test.ts
git commit -m "feat(petscii): canvas renderer with glyph atlas, C64 keymap, border and palette"
```

---

### Task 9: Raw-byte transport — `petscii-bytes` event end-to-end

Replaces the PUA round-trip for petsciiMode sessions: server sends raw PETSCII bytes; web renders via PetsciiMachine+PetsciiCanvas; real C64 telnet callers get the identical bytes (IAC doubling already handled by `TelnetConnection.write`, `telnet-server.ts:433`).

**Files:**
- Modify: `web/backend/src/handlers/screen.handler.ts:1620-1740` (return raw buffer), `~:1977` (emit path), `web/backend/src/index.ts:1126-1137` (telnet emitter branch), `web/backend/src/doors/BBSApi.ts:256-277` (`writePetscii`)
- Modify: `packages/terminal/src/components/BBSTerminal.tsx` (mount PetsciiCanvas on petscii session, feed bytes with baud pacing)
- Test: `web/backend/tests/handlers/petscii-bytes-transport.test.ts`

**Interfaces:**
- Produces: socket event `petscii-bytes` with payload `string` (base64 of raw PETSCII bytes). `loadScreenFile` result gains `petsciiBuffer?: Buffer` (set when `isPetscii`; `content` keeps the PUA conversion as legacy fallback).
- Consumes: `PetsciiMachine`, `PetsciiCanvas`, `keyEventToPetscii` (Tasks 7–8); `ModemEmulator` pacing model (`packages/terminal/src/utils/modem-emulator.ts:74-87` — 10 bits/byte).

- [ ] **Step 1: Write failing backend transport tests**

```ts
// Session/socket mock conventions follow tests/handlers/graphics-answer.test.ts
// (SKIP_DB_INIT, emit-spy socket, session field names matter).
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

describe('petscii raw byte transport', () => {
  // Fixture: raw PETSCII with control + reverse + high-bit graphics bytes.
  // Built in code, never via Edit/Write on a .seq (UTF-8 destroys high-bit bytes).
  const fixture = Buffer.from([0x93, 0x1C, 0x12, 0xA1, 0xB0, 0x92, 0x0D, 0xC1, 0xFF]);

  it('loadScreenFile returns the exact .seq bytes as petsciiBuffer (no conversion)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-seq-'));
    const seqPath = path.join(dir, 'BBSTITLE.SEQ');
    fs.writeFileSync(seqPath, fixture);
    // call the .seq branch through its exported seam (loadScreenFile or the
    // extracted readPetsciiScreen helper this task introduces) with a session
    // { petsciiMode: true } pointed at dir
    const result = await loadScreenFileForTest(dir, 'BBSTITLE', { petsciiMode: true });
    expect(result.isPetscii).toBe(true);
    expect(Buffer.compare(result.petsciiBuffer!, fixture)).toBe(0); // byte-identical
  });

  it('display path emits petscii-bytes whose base64 decodes to the buffer', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const socket = { emit: (event: string, data: any) => emitted.push({ event, data }) };
    await emitPetsciiScreen(socket as any, { petsciiMode: true } as any, {
      content: '', isPetscii: true, isRip: false, filePath: 'x.seq', petsciiBuffer: fixture,
    });
    const evt = emitted.find((e) => e.event === 'petscii-bytes');
    expect(evt).toBeDefined();
    expect(Buffer.compare(Buffer.from(evt!.data, 'base64'), fixture)).toBe(0);
  });

  it('telnet emitter writes raw PETSCII bytes for terminalType c64', () => {
    const written: Buffer[] = [];
    const connection = { write: (b: Buffer | string) => written.push(Buffer.from(b)), session: { terminalType: 'c64' } };
    const emitter = buildConnectionEmitter(connection as any); // extract from index.ts:1095 as an exported factory
    emitter.emit('petscii-bytes', fixture.toString('base64'));
    expect(Buffer.compare(written[0], fixture)).toBe(0);
  });
});
```

To make these testable, Step 3 must export seams: `emitPetsciiScreen(socket, session, result)` (the emit branch extracted from `screen.handler.ts:~1977`) and `buildConnectionEmitter(connection)` (the emitter object literal extracted from `index.ts:1095-1172` — same object, now returned by an exported factory so the test can construct it). `loadScreenFileForTest` = the existing `loadScreenFile` invoked with an injected search dir, following how existing screen tests point at fixture dirs.

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Backend implementation**

`screen.handler.ts`: at each of the `.seq` conversion sites (`:1621-1626`, `:1652-1661`, `:1696-1700`, plus the `bbstitle.seq` fallback `:1793-1799`), also carry the raw buffer: `return { content, isPetscii: true, isRip: false, filePath, petsciiBuffer };`. At the display/emit site (`:1977` area): when `result.isPetscii && result.petsciiBuffer`, skip the MCI pipeline entirely (binary content — MCI parsing of raw PETSCII is meaningless and dangerous) and emit `socket.emit('petscii-bytes', result.petsciiBuffer.toString('base64'))`, then handle pause/flow exactly as the current petscii-output branch does. Keep the `petscii-output` PUA emit as a fallback when `petsciiBuffer` is absent (legacy string callers).

`index.ts` emitter (after the `petscii-output` branch at `:1126`):

```ts
      } else if (event === "petscii-bytes") {
        const raw = Buffer.from(data as string, 'base64');
        if (connection.session?.terminalType === "c64" || connection.session?.petsciiMode) {
          connection.write(raw); // TelnetConnection.write doubles IAC ($FF = pi) per RFC 854
        } else {
          connection.write(convertPetsciiToPetMe64(raw)); // non-PETSCII terminal got PETSCII content: degrade via converter
        }
      }
```

`BBSApi.writePetscii(Buffer)`: emit `this.socket.emit('petscii-bytes', data.toString('base64'))` instead of converting; string input keeps the legacy `petscii-output` emit.

- [ ] **Step 4: Frontend implementation**

In `BBSTerminal.tsx`: add refs `petsciiMachineRef`, `petsciiActive` state, and a paced feeder:

```ts
    socket.on('petscii-bytes', (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (!petsciiMachineRef.current) {
        petsciiMachineRef.current = new PetsciiMachine();
        setPetsciiActive(true); // swaps the xterm div for <PetsciiCanvas machine=.../>
      }
      petsciiFeedQueue.current.push(...bytes);
      startPetsciiDrain(); // setInterval drain at bps/10 bytes per tick; bps from the
                           // same modem-speed socket event ModemEmulator uses; bps=0
                           // -> MAX_SOFT_CAP_BPS equivalent (23040 bytes/s)
    });
```

`PetsciiCanvas` mounts with `onData={(bytes) => socket.emit('input', String.fromCharCode(...convertForServer(bytes)))}` — for now forward printable ASCII equivalents the server input path already understands (`convertPetsciiInputToAscii` handles PETSCII on telnet; the web input path expects ASCII, so map with the inverse of `keyEventToPetscii` for letters and send `\r`/`\x7f` for 0x0D/0x14; cursor/F-key bytes are dropped until the server input path accepts them). When `petsciiActive`, the ANSI `output` handler still writes to xterm (hidden) — acceptable; mode transitions back on `ansi-output` after logoff are out of scope for this task and handled by full reload.

- [ ] **Step 5: Run backend tests (PASS), full suite, builds**

```bash
cd web/backend && npm test && npx tsc --noEmit
cd ../../packages/terminal && npm run build
cd ../web/frontend && npm run build:check && npm run build
```

- [ ] **Step 6: Manual verification (user checks; door-sdk-freshness first)**

Web: answer `P` → BBSTITLE.SEQ renders in the canvas — pixel C64 glyphs, blue background, light-blue border, art draws progressively at modem speed. Telnet: `telnet localhost <port>` with SyncTERM in C64 mode → raw PETSCII arrives, art correct including reverse video.

- [ ] **Step 7: Commit**

```bash
git add web/backend/src/handlers/screen.handler.ts web/backend/src/index.ts web/backend/src/doors/BBSApi.ts web/backend/tests/handlers/petscii-bytes-transport.test.ts packages/terminal/src/components/BBSTerminal.tsx
git commit -m "feat(petscii): raw byte transport end-to-end - canvas for web, raw PETSCII for real C64s"
```

---

### Task 10: Dedicated PETSCII telnet port

Synchronet convention (reference §5): a port whose connections are PETSCII from byte one — the strongest autodetect for real C64s (their WiFi modems negotiate nothing).

**Files:**
- Modify: `web/backend/src/server/telnet-server.ts` (accept `petsciiDefault` option; second listener), `web/backend/src/index.ts` (start second listener from env), `docker-entrypoint.sh` + `.github/workflows/deploy-hetzner.yml` (expose port; follow the existing telnet port's pattern)
- Test: `web/backend/tests/server/petscii-port.test.ts`

**Interfaces:**
- Produces: env `TELNET_PETSCII_PORT` (default unset = disabled; suggested 6464). Sessions on that port start with `terminalType: 'c64'`, `petsciiMode: true`, `screenWidth: 40`, `screenHeight: 25`, and skip TTYPE-based reclassification.

- [ ] **Step 1: Write failing test** — instantiate the telnet server with `petsciiDefault: true` (follow the construction pattern the existing telnet-server tests or `index.ts` use), simulate a connection, assert the emitted session-init carries `isC64: true`/width 40 without any TTYPE negotiation.

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement** — `TelnetServer` constructor option `petsciiDefault?: boolean`; when set, on connection immediately emit the same `terminal-type` event shape as `handleTerminalType` (`telnet-server.ts:327-334`) with `{ terminalType: 'PETSCII-PORT', isC64: true, isAmiga: false, unicodeCapable: false, width: 40, height: 25 }` and suppress later TTYPE downgrades. In `index.ts`, when `process.env.TELNET_PETSCII_PORT` is set, start a second `TelnetServer` on it with the flag; both feed the same connection handler.

- [ ] **Step 4: Run tests (PASS) + type-check**

- [ ] **Step 5: Commit**

```bash
git add src/server/telnet-server.ts src/index.ts tests/server/petscii-port.test.ts ../../docker-entrypoint.sh ../../.github/workflows/deploy-hetzner.yml
git commit -m "feat(telnet): dedicated PETSCII port (TELNET_PETSCII_PORT) - connections are C64 from byte one"
```

---

### Task 11: ANSI-fallback fidelity — Unicode 13 legacy-computing graphics map

Fixes audit D1–D3 (the `convertPetsciiToAnsi` path for terminals without the font — telnet ANSI callers hitting PETSCII-only content).

**Files:**
- Create: `web/backend/src/utils/petscii-unicode-map.ts`
- Modify: `web/backend/src/utils/petscii.util.ts:401-448`
- Test: `web/backend/tests/utils/petscii-unicode-map.test.ts`

**Interfaces:**
- Produces: `export const SCREENCODE_TO_UNICODE: [string[], string[]]` — two 128-entry arrays (bank 0 up/gfx, bank 1 lo/up) mapping screen codes $00–$7F to the best standard-Unicode character (letters/digits direct; graphics from U+2500 Box Drawing, U+2580 Block Elements, U+25xx Geometric Shapes, U+1FBxx Symbols for Legacy Computing). Reverse (bit 7) renders via SGR 7 in this path.

- [ ] **Step 1: Write failing spot-check tests** (full-table verification is the table itself; test the anchors)

```ts
import { SCREENCODE_TO_UNICODE } from '../../src/utils/petscii-unicode-map';

describe('SCREENCODE_TO_UNICODE', () => {
  it('has two complete 128-entry banks', () => {
    expect(SCREENCODE_TO_UNICODE[0]).toHaveLength(128);
    expect(SCREENCODE_TO_UNICODE[1]).toHaveLength(128);
    for (const bank of SCREENCODE_TO_UNICODE) for (const e of bank) expect(e.length).toBeGreaterThan(0);
  });
  it('anchors: letters, pi, blocks', () => {
    expect(SCREENCODE_TO_UNICODE[0][0x01]).toBe('A');
    expect(SCREENCODE_TO_UNICODE[1][0x01]).toBe('a');
    expect(SCREENCODE_TO_UNICODE[0][0x5E]).toBe('π');  // pi
    expect(SCREENCODE_TO_UNICODE[0][0x60]).toBe(' ');  // shift-space
    expect(SCREENCODE_TO_UNICODE[0][0x66]).toBe('▒');  // medium shade (checkerboard)
    expect(SCREENCODE_TO_UNICODE[0][0x40]).toBe('─');  // horizontal bar
    expect(SCREENCODE_TO_UNICODE[0][0x5D]).toBe('│');  // vertical bar
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Build the table** — transcribe from the pagetable charset reference (https://www.pagetable.com/c64ref/charset/, screen-code view) glyph by glyph; where no exact Unicode exists use the U+1FBxx sextant/mosaic from the Unicode 13 chart (reference doc §4.3). Replace `convertPetsciiByte`'s invented `graphicsMap` / block-guess branches (`petscii.util.ts:401-448`) with: `screenCode = petsciiToScreenCode(byte)`, `return SCREENCODE_TO_UNICODE[state.shiftMode ? 1 : 0][screenCode & 0x7F]` (SGR 7 wrap when bit 7 set). This is 256 deliberate entries — budget the time; do not approximate ranges wholesale.

- [ ] **Step 4: Run tests (PASS) + full petscii suite**

- [ ] **Step 5: Commit**

```bash
git add src/utils/petscii-unicode-map.ts src/utils/petscii.util.ts tests/utils/petscii-unicode-map.test.ts
git commit -m "feat(petscii): accurate screen-code to Unicode map (U+25xx + U+1FBxx legacy computing)"
```

---

### Task 12: Wrap-up — docs, handoff, verification sweep

**Files:**
- Modify: `Documentation/3-Developers/ARCHITECTURE.md` (PETSCII section: canvas renderer, raw-byte transport, detection layers), `Documentation/2-Sysops/CONFIGURATION.md` (TELNET_PETSCII_PORT), `handoff.md`
- No new code.

- [ ] **Step 1: Full verification sweep**

```bash
cd web/backend && npx tsc --noEmit && npm test
cd ../../packages/terminal && npm run build
cd ../web/frontend && npm run build:check && npm test && npm run build
```
All green. Then re-run the audit checklist (`2026-09-01_petscii-audit.md` flaws A1–G3) and record per-flaw status (fixed in task N / deferred+why) at the bottom of the audit doc.

- [ ] **Step 2: Docs** — ARCHITECTURE.md: replace "xterm.js renders ANSI/PetSCII" with the two-renderer description; CONFIGURATION.md: document the PETSCII port and the DEL-probe behavior for sysops.

- [ ] **Step 3: Update `handoff.md`** (≤10 KB) with current state.

- [ ] **Step 4: Commit**

```bash
git add Documentation/3-Developers/ARCHITECTURE.md Documentation/2-Sysops/CONFIGURATION.md handoff.md thoughts/shared/research/2026-09-01_petscii-audit.md
git commit -m "docs(petscii): architecture, sysop config, audit closure status"
```

---

## Deliberate scope exemptions (declared, not silent)

- **Quote mode / insert-count emulation** (client-side keyboard quirks): output renderer does not need them; documented in PetsciiMachine header.
- **Web keyboard graphics entry** (C= key combos for graphic chars in the browser): out of scope; keymap covers text, movement, F-keys.
- **Mode exit back to ANSI after a PETSCII session** (canvas → xterm swap-back mid-session): page reload path; noted in Task 9.
- **80-column PETSCII (C128)**: not implemented; dedicated-port design leaves room (second port, cols=80 machine param is the only change).
- **MCI codes inside .seq screens**: raw path bypasses MCI by design (binary content).

## Audit-flaw → task map (self-review, spec coverage)

A1,A2,A3→T5 · A4,A5→T1 · B1→T7-T9 · B2→T3 · B3→T5,T9 · B4→T1 · C1,C2→T2,T7,T8 · D1,D2,D3→T11 · E1,E2→T4 · E3,E4→T4 · F1,F2→T6,T10 · F3→T6 · F4→T9(step1 telnet test) · G1→partial (keymap exists; server acceptance of cursor/F-key bytes deferred, noted in T9) · G2→exempt · G3→unchanged (extension detection retained; acceptable, documented).
