---
date: 2026-09-02
topic: C64 Door Adapter - Phase 3 (package export, ladder narrowing, emitter integration, gate hook, reachability)
tags: [petscii, c64, doors, 68k, xim, sdk, frame, adapter, emitter]
status: final
---

# C64 Door Adapter - Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use `- [ ]`. Show the full checklist before starting and report the
> running count after every task.

**Goal:** wire the Phase 1-2 frame pipeline into the live product. A PETSCII caller inside a 68K door sees
whole 40x25 frames reconstructed from the door's 80-column output; an ANSI caller's bytes do not move by one
byte; and a door the `MIN_COLUMNS` gate closes can be opened explicitly *because the adapter carries it*.

**Architecture:** the door's ANSI goes into a `FrameReconstructor` (80x25 cells) instead of to the wire. On
a frame boundary the grid is `adaptFrame`d to 40x25 and `renderDiff`ed into minimal ANSI, handed to the SAME
downstream that carries door output today - the telnet/SSH `AnsiToPetsciiTransducer` in
`connection-emitter.ts`, or the browser's transducer in `BBSTerminal`. Nothing on the canvas side changes.
The seam is the one `socket` object every 68K door emit passes through; the adapter patches its `emit` in
place for the door's lifetime, the way `ModemEmulator.install()` already does.

```
68K door --socket.emit('ansi-output', 80col ANSI)--> [C64DoorFrameAdapter]
   FrameReconstructor(80x25) --tick--> adaptFrame(40x25) --> renderDiff
   --> original socket.emit('ansi-output', 40col ANSI) --> AnsiToPetsciiTransducer --> PETSCII
```

**Tech Stack:** TypeScript strict. SDK jest (`cd sdk && npx jest tests/petscii`). Backend jest
(`cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . <path>`, swc -
no type-check; run `npx tsc --noEmit` separately).

**Spec:** `thoughts/shared/plans/2026-09-02-c64-door-adapter.md`. **Predecessor:**
`.../2026-09-02-c64-door-adapter-impl.md` (Phases 0-2, landed with `9523b434e`), handoff
`thoughts/shared/handoffs/2026-09-02_c64-door-adapter-phases-0-2.md`. **Sibling:** the 40-col plan's Task 1
(`MIN_COLUMNS` gate) HAS LANDED, with `c8f8ce233` folding one `Door.minColumns` at registration - read that
commit before Task 5.

---

## Rulings carried in (do not reopen)

1. **Frame tick = BOTH:** a quiet-gap tick (~30 ms, configurable) AND an input-wait flush as the hard
   boundary.
2. **The adapter arms AT DOOR ENTRY** for a PETSCII session - not on the first over-wide frame. ("Adapter
   arming + entry full paint"; the phrase "viewport switch" is retired, since the viewport RULE is Phase 5.)
   Concretely: the adapter is installed before the door's first byte, and its first render is a full paint
   (`renderDiff(null, ...)` = `ESC[2J ESC[H` + every non-blank cell), so entry resets the caller to a known
   40x25 screen.
3. **First three doors.** Cross-check 2026-09-02: **none of the eight captured corpus doors is installed** -
   `1cdddac24` deleted the binaries AND none of `AEHelp / SiX-Status / KdConfStats / ColorWall / who /
   RATIOREP / Super-Stats / Hststat` has a `Commands/BBSCmd/*.info`, so no caller can reach them;
   `cplistan` is not in this tree. The three below are installed `TYPE=XIM` list/text doors (binary present,
   `.info` present) with a captured golden under `dev/scripts/door-corpus/goldens/`:

   | Command | `.info` | Binary | Why |
   |---|---|---|---|
   | `WHO` | `Commands/BBSCmd/WHO.info` | `Doors/RTW/rtw` | Real Time Who v2.01: a 78-column bordered node table - the shape the `who`/`kd_confstats` fixtures pin, and the door the PETSCII manual walk already runs. |
   | `S` | `Commands/BBSCmd/S.info` | `Doors/ustats/stats` | uSEr StAtS v1.0: label-dots-value rows under centred banners - the shape `six_status`/`super_stats`/`hststat` pin; no config data, most rows under 80 so `crop` is verbatim. |
   | `WHAT` | `Commands/BBSCmd/WHAT.info` | `Doors/What/WHAT` | Transfer Activities v2.0: one static 78-column box table, deterministic on an idle board, no input beyond a final RETURN - the cheapest honest end-to-end demo. |

4. **`BB_SCRWIDTH` = 40, `lineWrap` = 80 - already true on the live path, so this is a PIN, not a change.**
   `launchAmigaDoor` (`door.handler.ts:665`) has NO callers: the live 68K path is
   `command-execution.handler.ts:512` -> `executeDoor` (`door.handler.ts:1635`) -> `executeAmigaDoor`
   (`:2497`), which passes the LIVE session as `bbsSession` (`:2907`). That session has no `lineWrap`
   field, so `XIMProtocol.ts:141`'s `?? 80` already gives the door 80, while
   `doorScreenWidth(this.config.bbsSession)` already answers `BB_SCRWIDTH = 40`. Both halves are what this
   plan wants and neither needs editing.
   - *Why 40 is right to tell the door.* A width-aware door that self-adapts gives a better 40-column
     screen than any mechanical reduction, and for it the ladder degrades to `crop`, which is verbatim.
   - *Why the wrap safety net must stay at 80.* `xim/line-wrap.util.ts:61-67` is a hard CHARACTER wrap with
     no word awareness: at 40 it would cut words in half before the reconstructor saw the row, and
     `reflowRow`'s word-aware `wrapLineToWidth` could never repair that. The ladder is what guarantees "no
     row wider than the screen".
   - `launchAmigaDoor:824`'s `lineWrap: doorScreenWidth(session, terminalWidth)` is dead code. Leave it;
     Task 4 pins that it is unreachable so a future caller cannot silently re-arm a 40-column hard wrap.

---

## Global constraints

- **The 80-column non-negotiable.** Every adapter behaviour is gated on `session.petsciiMode === true` - the
  same gate `doorScreenWidth`, `wrapForSession`, `sessionColumns` and `applyClientReportedGeometry` use, and
  the flag a real C64 gets too (`command.handler.ts:1450-1458` -> `applyGraphicsAnswer(...,'P')`).
  Byte-identity for ANSI sessions is pinned AT THE EMITTER by capturing the wire twice and comparing
  (Task 3 Step 6), never asserted in prose.
- **`looksLikeAsciiArt` / `positionsCursorAbsolutely` are FROZEN from Task 1 onward.** After the re-export
  they are the backend's detectors, live on the 80-column path (`xim/io.ts:1454`, `wrap-for-session.util.ts`,
  `dir-file.util.ts`). Task 2 changes `classifyRow` / `chooseRule` / the rule functions ONLY - those are
  SDK-ladder-only and run for no ANSI session, which is what keeps 80-column output byte-exact.
- **Shared working tree** (3 sessions). Claim in `thoughts/BOARD.md` before the first edit:
  `sdk/package.json` (map entries only), `sdk/petscii/frame/{types,classify,adapt}.ts`,
  `sdk/tests/petscii/frame/**`, `web/backend/src/server/c64-door-adapter.ts`,
  `web/backend/src/utils/{ascii-art.util.ts,door-c64-adapt.util.ts}`,
  `web/backend/src/handlers/door.handler.ts` (adapter install/uninstall + gate clause + marker only),
  `web/backend/src/amiga-emulation/cpu/MoiraEmulator.ts` (pause listener only),
  `web/backend/src/amiga-emulation/AmigaDoorSession.ts` (pause wiring + cleanup uninstall only),
  `web/backend/dev-scripts/jest.config.ts`, `web/backend/tests/{petscii-frame,doors}/**`. Commit BY FILE
  NAME; `git diff --cached --stat` before every commit; never `git stash`; no pushes.
- `sdk/package.json` is shared with the deploy work (`2721a31a8`, `a683a23ad`): touch only the two new map
  entries; re-run `web/backend/tests/dockerfile-copies-admin-sources.test.ts`.
- **Never Edit/Write a `.info` file** - binary. Tooltypes go through `web/backend/src/utils/info-file.util.ts`.
- **Fixtures are bytes.** Captures and goldens are read with `latin1`, never opened with Edit/Write.
- **RED then GREEN per behaviour.** Write the failing test, run it, record the failure text, implement.
  Before each commit revert the named implementation file once and confirm the new tests fail.
- After any `sdk/` edit run `.claude/skills/door-sdk-freshness/SKILL.md` before telling anyone to test.
- No emojis anywhere.

## What is already landed (verified 2026-09-02 at `37d27cc08` + `c8f8ce233`)

- `sdk/petscii/frame/**` + 198 frame tests + the 8-door capture corpus; `frame/index.ts` is the barrel and
  is NOT exported from the package. `dist/petscii/frame/` and `dist-esm/petscii/frame/` already build.
- Phase 0 width honesty (`xim/screen-width.util.ts`: `doorScreenWidth`, `applyClientReportedGeometry`).
- `MIN_COLUMNS`: `web/backend/src/utils/door-min-columns.util.ts`
  (`validColumns` / `declaredMinColumns` / `resolveDoorMinColumns` / `sessionColumns` /
  `DOOR_NEEDS_80_NOTICE`), the gate at the top of `executeDoor` (`door.handler.ts:1638-1659`, before
  `session.currentDoorName`), the `[40]` marker in `formatDoorLine` (`:1300`), and `c8f8ce233`'s
  `initializeDoors` fold onto `Door.minColumns` so the marker and the gate read ONE number off ONE object.
- Transport: `connection-emitter.ts` (`petsciiTransducerFor` - deleted 2026-09-02 in `68caab151`,
  now `petsciiTerminalModelFor` in `utils/petscii-session-model.ts`; `flushPendingPetscii` keeps its name),
  `server/c64-detected-handler.ts:36` (a SECOND `buildConnectionEmitter` object for the same connection),
  `BBSTerminal.tsx` (`writeTerm`, `enqueuePetscii`, `petsciiDoorActiveRef`, `startPetsciiDrain`).
- `ModemEmulator.install()` (`utils/modem-emulator.util.ts:263-305`) is the in-place `socket.emit` patch
  precedent; its constructor captures `socket.emit` into `_directEmit` at line 28-30.
- Every 68K door emit funnels through the injected socket: `xim/io.ts:128` `directEmit` IS
  `this.socket.emit(...)`; `AnsiBuffer` captures the same socket and emits at `ansi-buffer.util.ts:104`.
- `web/backend/tests/server/petscii-session-geometry.test.ts` already pins that a PETSCII session keeps
  40x25 when the client reports a size. Nothing here re-tests it.

---

### Task 1: `./petscii/frame` package export + the backend classifier stops being a second copy

**Files:** modify `sdk/package.json` (`typesVersions."*"` after the `"petscii"` entry at line 28; `exports`
after the `"./petscii"` block at 113-118) and `web/backend/dev-scripts/jest.config.ts:33`; rewrite
`web/backend/src/utils/ascii-art.util.ts` and `web/backend/tests/petscii-frame/classify-parity.test.ts`;
create `web/backend/tests/petscii-frame/frame-package-export.test.ts`.

- [ ] **Step 1: RED.** `frame-package-export.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { FrameReconstructor, adaptFrame, renderDiff, looksLikeAsciiArt } from '@amiexpress/bbs-door-sdk/petscii/frame';
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../sdk/package.json'), 'utf8'));

describe('@amiexpress/bbs-door-sdk/petscii/frame', () => {
  it('is declared in exports with the same shape as ./petscii', () => {
    expect(pkg.exports['./petscii/frame']).toEqual({
      types: './dist/petscii/frame/index.d.ts', import: './dist-esm/petscii/frame/index.js',
      require: './dist/petscii/frame/index.js', default: './dist/petscii/frame/index.js',
    });
  });
  it('is mirrored in typesVersions (moduleResolution:node walks the directory, not exports)', () => {
    expect(pkg.typesVersions['*']['petscii/frame']).toEqual(['dist/petscii/frame/index.d.ts']);
  });
  it('resolves and carries the whole pipeline', () => {
    for (const f of [FrameReconstructor, adaptFrame, renderDiff, looksLikeAsciiArt]) expect(typeof f).toBe('function');
  });
});
```

Expected RED: `Cannot find module '@amiexpress/bbs-door-sdk/petscii/frame'`.

- [ ] **Step 2: GREEN.** `sdk/package.json`, after `"petscii": ["dist/petscii/index.d.ts"],`:

```json
      "petscii/frame": ["dist/petscii/frame/index.d.ts"],
```

after the `"./petscii"` exports block:

```json
    "./petscii/frame": {
      "types": "./dist/petscii/frame/index.d.ts",
      "import": "./dist-esm/petscii/frame/index.js",
      "require": "./dist/petscii/frame/index.js",
      "default": "./dist/petscii/frame/index.js"
    },
```

`web/backend/dev-scripts/jest.config.ts` beside line 33 (both patterns anchored, so no shadowing):

```ts
    '^@amiexpress/bbs-door-sdk/petscii/frame$': '<rootDir>/../../sdk/petscii/frame/index.ts',
```

- [ ] **Step 3: RED - the re-export pin.** Replace `classify-parity.test.ts`. The two-copy parity table is
retired: identity becomes structural, so what is worth pinning is that the re-export is real, that no second
implementation crept back, and that the corpus still runs through it.

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as backend from '../../src/utils/ascii-art.util';
import * as sdk from '@amiexpress/bbs-door-sdk/petscii/frame';
const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;
const FIXTURES = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');

describe('ascii-art.util.ts re-exports the SDK classifier', () => {
  it('exports the SAME function objects, not copies', () => {
    expect(backend.looksLikeAsciiArt).toBe(sdk.looksLikeAsciiArt);
    expect(backend.positionsCursorAbsolutely).toBe(sdk.positionsCursorAbsolutely);
  });
  it('holds no second implementation', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/utils/ascii-art.util.ts'), 'utf8');
    expect(src).toContain("from '@amiexpress/bbs-door-sdk/petscii/frame'");
    expect(src).not.toMatch(/punctuationRatio|longSpaceRuns|artChars/);
  });
  it('still classifies every line of every captured door capture', () => {
    const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.ans') || f.endsWith('.txt'));
    expect(files.length).toBeGreaterThanOrEqual(8);
    let nonBlank = 0;
    for (const f of files) for (const l of fs.readFileSync(path.join(FIXTURES, f), 'latin1').replace(STRIP, '').split(/\r?\n|\r/)) {
      if (l.trim().length > 0) nonBlank++;
      expect(typeof backend.looksLikeAsciiArt(l)).toBe('boolean');
      expect(typeof backend.positionsCursorAbsolutely(l)).toBe('boolean');
    }
    expect(nonBlank).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 4: GREEN.** Replace the body of `ascii-art.util.ts` (keep the file: three product importers
plus a `jest.mock` target depend on the path):

```ts
/**
 * The board's "is this line art?" / "is this payload painting a screen?"
 * detectors. The implementation lives in the SDK (sdk/petscii/frame/classify.ts)
 * because the C64 door adapter's ladder classifies the SAME rows on the SAME
 * heuristic and cannot import web/backend. This was a verbatim second copy kept
 * equal by a parity test until the frame module gained a package export; as a
 * re-export the two can no longer drift.
 *
 * FROZEN: these two run on the 80-COLUMN path (xim/io.ts's line-wrap safety
 * net, wrapForSession, DIR listings). The C64 ladder's own routing lives in
 * classifyRow/chooseRule, which no ANSI session ever reaches - that split is
 * what lets the ladder change without moving one 80-column byte.
 */
export { looksLikeAsciiArt, positionsCursorAbsolutely } from '@amiexpress/bbs-door-sdk/petscii/frame';
```

- [ ] **Step 5: verify.** `cd sdk && npm run build`;
`cd web/backend && SKIP_DB_INIT=1 npx jest ... tests/petscii-frame tests/utils/ascii-art.util.test.ts tests/utils/dir-file.util.test.ts tests/utils/wrap-for-session.util.test.ts tests/xim/absolute-paint-is-never-wrapped.test.ts tests/dockerfile-copies-admin-sources.test.ts`;
`npx tsc --noEmit` (the real proof `typesVersions` works - tsc resolves through the package directory, not
jest's mapper). RED proof: delete the `typesVersions` line, re-run `tsc --noEmit`, expect TS2307, restore.

**Success criteria.** Automated: those suites green, `tsc --noEmit` clean, SDK build clean, Dockerfile guard
green. Manual: none.

---

### Task 2: the ladder stops doubling bordered and columnar rows

**The measured defect (2026-09-02, reproduced before writing this):** the three doors' goldens replayed
through `FrameReconstructor` + `adaptRows(frame, { cols: 40 })` expand a 25-row screen far past 25 rows, so
`adaptFrame`'s tail-paging scrolls the title and header away:

| golden | source rows (non-blank) | adapted rows today | why |
|---|---|---|---|
| `rtw` | 22 | **46** | `[U] - UPLOAD FILE(S)   [D] - ...` three-column rows and `\|...\|` rows classify `art`/`table`; `gutterRow`'s squeeze still exceeds 40, so both fall to `split` |
| `ustats` | 10 | **35** | same, plus centred banners that are 52 columns of `----->>>> ... <<<<-----` |
| `what` | 10 | **34** | every `\|...\|` bordered row is `art` (classify.ts `borderArt`, :92-95) -> `split` doubles it, including the pure rules `.----.` / `` `----' `` |

Command used (read-only, repeat it to reproduce): `cd sdk && npx tsx -e "<FrameReconstructor + adaptRows over
dev/scripts/door-corpus/goldens/<id>/integration.txt read as latin1>"`.

**The fix, at the right level.** `looksLikeAsciiArt` is frozen (Task 1). Everything below is
`sdk/petscii/frame/{classify,adapt}.ts` only, which no ANSI session reaches, so 80-column output is
byte-exact by construction. Two new rules go into the ladder ahead of `split`:

- **`deindent` (lossless).** If dropping the row's leading blanks makes it fit, shift it left. Only blanks
  are lost. This is what saves centred banners.
- **`narrow` (lossy, one row, column-preserving).** For a row with COLUMN STRUCTURE - `>= 2` cells whose
  `ch === '|'`, or `>= 2` interior runs of two-or-more blanks - split into column parts, drop the outer
  border parts, trim each part, then shrink the widest part by one column at a time until
  `sum(widths) + (parts - 1) <= cols`. A part that lost cells ends in the truncation mark `>` (a plain
  PETSCII glyph, unlike an ellipsis). If any part would fall below two columns, `narrow` declines and the
  row falls through to `reflow`/`split` as today.
- **`isRule` widens `crop`.** A row whose every non-blank cell is non-alphanumeric and not reverse is a
  HORIZONTAL RULE (`.-----.`, `` `-----' ``, `|__|__|`, `|--v--v--|`). Truncating a rule to 40 columns
  still leaves a rule, so it is croppable. `isCroppable`'s existing one-repeated-glyph test cannot see this
  because a rule mixes `-` with its corners.

Ladder order becomes: `crop` (incl. rules) -> `deindent` -> `narrow` -> `reflow` -> `split`.

**Invariants.** `crop`/`gutter`/`reflow`/`split` keep the exact invariants the corpus already pins -
`narrow` is a NEW rule name precisely so `gutter`'s "preserves the cell multiset" stays literally true.
`narrow`'s own invariants, pinned in `adapt.test.ts`: exactly one output row; the number and ORDER of
columns is preserved; each output column's text is a PREFIX of its source column's trimmed text; a shortened
column ends in `>`; the first column is never dropped.

**Files:** `sdk/petscii/frame/classify.ts` (add `isRuleRow`, `columnParts`, `hasColumnStructure`;
`classifyRow` gains `'bordered'`), `sdk/petscii/frame/adapt.ts` (`deindentRow`, `narrowRow`, `AdaptRule`,
`chooseRule`, `applyRule`), `sdk/tests/petscii/frame/adapt.test.ts`, `sdk/tests/petscii/frame/corpus.test.ts`,
new fixtures + `manifest.json`.

- [ ] **Step 1: add the three goldens as fixtures.** Copy with the shell only (never an editor):
`cp dev/scripts/door-corpus/goldens/{rtw,ustats,what}/integration.txt sdk/tests/petscii/frame/fixtures/<id>.txt`.
Add a manifest entry per fixture with `source` (the golden path), `bytes`, `sha256`, `encoding: "latin1"`,
`notes`, and `containsBbsMenu: true` for `rtw`/`ustats` (their captures continue past the door into the BBS
menu and prompt - `what` is door output only). `corpus.test.ts` already asserts byte count and hash for
`.ans` fixtures; extend the loader to read `.txt` fixtures as `latin1` and hash them the same way.

- [ ] **Step 2: RED - the acceptance gate.** Add to `corpus.test.ts`:

```ts
/**
 * The ladder must not scroll a door's own header off its screen. Measured
 * before the fix: rtw 46, ustats 35, what 34 adapted rows for a 25-row frame,
 * so adaptFrame's tail-paging (which keeps the LAST 25) dropped the title.
 * The pinned numbers below are exact so a regression is loud; the single row
 * of expansion left in rtw/ustats is the BBS's own post-door prompt line
 * ("AmiExpress Web BBS [0:General] Menu (...)", 53 columns of prose) reflowing
 * to two rows, which is correct behaviour and is not door output at all -
 * hence containsBbsMenu in the manifest.
 */
const EXPECTED_ROWS: Record<string, number> = { what: 25, rtw: 26, ustats: 26 };

describe.each(Object.keys(EXPECTED_ROWS))('%s adapts without losing its header', (id) => {
  const frame = lastFrameOf(id);
  it('adapts to the pinned row count', () => {
    expect(adaptRows(frame, { cols: 40 }).rows.length).toBe(EXPECTED_ROWS[id]);
  });
  it('keeps the first non-blank source row first whenever the frame fits', () => {
    const rows = adaptRows(frame, { cols: 40 }).rows;
    if (rows.length > 25) return;                 // arithmetically impossible; the count pin covers it
    const firstSrc = frame.cells.findIndex((r) => contentWidth(r) > 0);
    expect(rows.findIndex((r) => r.cells.some((c) => !isBlank(c)))).toBe(
      rows.findIndex((r) => r.source === firstSrc));
  });
  it('every adapted row is exactly 40 cells', () => {
    for (const r of adaptRows(frame, { cols: 40 }).rows) expect(r.cells.length).toBe(40);
  });
});
```

Expected RED: `Expected: 25, Received: 34` (what), `26 / 46` (rtw), `26 / 35` (ustats).

- [ ] **Step 3: implement `classify.ts` additions** (do NOT touch `looksLikeAsciiArt`):

```ts
/** A horizontal rule: every non-blank cell is non-alphanumeric and not reverse. Truncating one still leaves a rule. */
export function isRuleRow(cells: ReadonlyArray<Readonly<Cell>>): boolean {
  let any = false;
  for (let x = 0; x < contentWidth(cells); x++) {
    const c = cells[x];
    if (isBlank(c)) continue;
    any = true;
    if (c.rvs || /[A-Za-z0-9]/.test(c.ch)) return false;
  }
  return any;
}

/**
 * The row's columns: split on '|' cells when there are two or more, else on
 * interior runs of two-or-more blanks. Leading indent is not a column break.
 * Empty parts (the outer border of a '|...|' row) are dropped.
 */
export function columnParts(cells: ReadonlyArray<Readonly<Cell>>): Array<ReadonlyArray<Readonly<Cell>>> { /* ... */ }

/** Two or more columns: a row narrowRow can shrink instead of splitting. */
export function hasColumnStructure(cells: ReadonlyArray<Readonly<Cell>>): boolean {
  return columnParts(cells).length >= 2;
}
```

`classifyRow` gains `'bordered'` (returned when `hasColumnStructure` and the row carries alphanumeric
content) ahead of the `art` test, so the ladder can see structure the art heuristic hides. `RowClass`
becomes `'blank' | 'bordered' | 'art' | 'table' | 'prose'`; every existing `classifyRow` case in
`classify.test.ts` that a bordered row would now reclassify is updated RED-first and its old expectation
recorded in the commit message.

- [ ] **Step 4: implement `adapt.ts`.** `AdaptRule` gains `'deindent' | 'narrow'`.

```ts
/** Lossless: drop leading blanks when the row then fits. Only blanks are lost. */
export function deindentRow(cells: Row, cols: number): RuleResult { /* map: x -> {row:0, x: clampCol(cols, x - lead)} */ }

/**
 * One row, columns preserved, content truncated with '>'.
 *
 * A bordered or gutter-columned row is a TABLE, and splitting a table in half
 * puts its right-hand columns on a row of their own with no header - which is
 * how a 25-row door screen became 34-46 rows and lost its title to tail-paging.
 * Narrowing keeps every column in place and pays for it in characters, which is
 * the trade a 40-column screen exists to make. Declines (returns null) when a
 * column would fall below two cells; the caller then falls through to
 * reflow/split exactly as before.
 */
export function narrowRow(cells: Row, cols: number): RuleResult | null { /* ... */ }
```

`chooseRule`: `isCroppable(cells, cols) || isRuleRow(cells)` -> `crop`; else fits-after-deindent ->
`deindent`; else `hasColumnStructure` and `narrowRow` does not decline -> `narrow`; else the existing
`art -> split` / `table -> gutter` / `prose -> reflow`. `applyRule` routes the two new rules and falls back
to `splitRow` when `narrowRow` declines. Region pins accept `'deindent'` and `'narrow'` like any other rule.

- [ ] **Step 5: GREEN + the old invariants.** `cd sdk && npx jest tests/petscii/frame` - the new gate green
AND every Phase 2 invariant still green over the eight original fixtures (crop verbatim, gutter/split
multiset, reflow character stream and word list, the independently computed cursor). Add `narrow`'s five
invariants to `adapt.test.ts` and extend the corpus's per-rule invariant switch to cover `deindent`
(character stream unchanged) and `narrow` (prefix per column, `>` on a shortened column).

- [ ] **Step 6: mutation proof.** Each must turn the suite red, source restored byte-identically after:
(a) `narrowRow` shrinking the NARROWEST column instead of the widest; (b) `narrowRow` dropping a column
instead of declining; (c) `isRuleRow` returning true for a row containing a digit; (d) `deindentRow`
dropping a non-blank cell.

**Success criteria.** Automated: `what` 34 -> **25**, `rtw` 46 -> **26**, `ustats` 35 -> **26** rows, header
first wherever the frame fits, every row exactly 40 cells, all Phase 2 invariants green, four mutations red.
Manual: none (Task 8's walk reads the result).

---

### Task 3: the emitter integration - one adapter on the door's socket

**Files:** create `web/backend/src/server/c64-door-adapter.ts`; modify `sdk/petscii/frame/types.ts:31-36`,
`sdk/tests/petscii/frame/{ansi-screen,ansi-screen-erase-sgr}.test.ts` (six assertions),
`web/backend/src/amiga-emulation/cpu/MoiraEmulator.ts:266-270`,
`web/backend/src/amiga-emulation/AmigaDoorSession.ts:333` and `removeSocketHandlers()` (:1244),
`web/backend/src/handlers/door.handler.ts` (`executeDoor` :1636 defensive uninstall; `executeAmigaDoor`
:2955-3016 install/uninstall). Tests: `web/backend/tests/petscii-frame/c64-door-adapter.test.ts`,
`.../c64-door-adapter-identity.test.ts`, and the runtime install case in
`web/backend/tests/doors/door-min-columns-gate.test.ts`.

#### 3a - the `$02` background model

`types.ts:32` says `DEFAULT_BG = 6` (BASIC blue). That predates the CCGMS work: a C64 *terminal* is black,
`PetsciiMachine` powers on black/black, and background/border move only through `$02 <colour>` / `$0E`.
Change it to `0`: the frame model's default then agrees with the machine's power-on, and a door emitting
`ESC[40m` stops producing `bg 0 != 6` on every cell, which `sameCell` counted as a difference and
`renderDiff` repainted for nothing. `renderDiff` still never emits a background byte
(`frame-render.ts:10-19`).

- [ ] **Step 1: RED.** Change the six SDK assertions (`bg: 6` -> `bg: 0`, `toBe(6)` -> `toBe(0)`) first;
`cd sdk && npx jest tests/petscii/frame` -> 6 failures `Expected: 0, Received: 6`.
- [ ] **Step 2: GREEN.** `export const DEFAULT_BG = 0;` with a comment saying a C64 terminal is black, the
C64 has no per-cell background, and a coloured backdrop is a `$02 <colour>` decision that belongs to the
transducer/machine and to Phase 4 packs. `cd sdk && npx jest tests/petscii` green.

#### 3b - the adapter

- [ ] **Step 3: RED - the unit test** (`c64-door-adapter.test.ts`, fake socket + fake timers, no emulator).
Cases: (1) holds output until the quiet gap then emits ONE frame containing `\x1b[2J\x1b[H`, the text, and
no CUP beyond 25x40; (2) four writes 5 ms apart coalesce into exactly one `ansi-output`; (3) 40 writes 10 ms
apart still produce output (the cap fired without a gap); (4) a tick with no new output emits nothing;
(5) `flush()` is idempotent; (6) a non-`ansi-output` event passes through, flushing first, order preserved;
(7) a `Buffer` payload passes through untouched and the next frame is a full repaint; (8) `petscii-bytes`
passes through and drops the baseline; (9) uninstall flushes, restores `emit`, leaves
`jest.getTimerCount() === 0`; (10) no install for a non-PETSCII session and `emit` untouched;
(11) installing twice returns the same adapter; (12) an adapter installed through ONE emitter object is
found through a SECOND emitter built for the same session (`c64-detected-handler.ts:36`); (13) the guard in
Task 6.

```ts
function fakeSocket(session: any) {
  const out: Array<[string, any]> = [];
  const socket: any = { id: 's1', session, emit: (ev: string, d: any) => { out.push([ev, d]); return true; } };
  return { socket, out, ansi: () => out.filter(([e]) => e === 'ansi-output').map(([, d]) => d).join('') };
}
const c64 = () => ({ petsciiMode: true, screenWidth: 40 });

it('is found through a second emitter object built for the same session', () => {
  const session = c64();
  const a = fakeSocket(session), b = fakeSocket(session);
  const adapter = installC64DoorAdapter(a.socket, session);
  expect(c64AdapterFor(b.socket)).toBe(adapter);       // keyed by session, not object identity
  uninstallC64DoorAdapter(b.socket);
  expect(a.socket.emit).not.toBe(b.socket.emit);       // restored onto the socket that was patched
  expect(c64AdapterFor(a.socket)).toBeNull();
});

it('uninstall flushes the last frame and restores the original emit', () => {
  const f = fakeSocket(c64());
  const original = f.socket.emit;
  installC64DoorAdapter(f.socket, f.socket.session);
  f.socket.emit('ansi-output', 'goodbye');
  uninstallC64DoorAdapter(f.socket);
  expect(f.ansi()).toContain('goodbye');
  expect(f.socket.emit).toBe(original);
  expect(jest.getTimerCount()).toBe(0);
});
```

- [ ] **Step 4: implement** `web/backend/src/server/c64-door-adapter.ts`:

```ts
/**
 * The C64 door adapter's transport seam (Phase 3 of the strategy plan).
 *
 * A 68K door paints an 80-column screen; a PETSCII caller has 40x25. Rather
 * than rewrite the byte stream, this replays the door's ANSI onto a virtual
 * 80x25 grid (FrameReconstructor), reduces each finished FRAME with the rule
 * ladder (adaptFrame), and emits the minimal ANSI that repaints it (renderDiff)
 * - which the existing downstream carries unchanged: connection-emitter.ts's
 * AnsiToPetsciiTransducer for telnet/SSH, or the browser's transducer in
 * BBSTerminal. The canvas side needs no change.
 *
 * WHERE IT SITS. Every 68K door emit goes through the ONE socket handed to
 * `new AmigaDoorSession(socket, ...)`: xim/io.ts's `directEmit` IS
 * `this.socket.emit(...)` (io.ts:128) and AnsiBuffer captures the same socket
 * (ansi-buffer.util.ts:104). So the seam is that socket's `emit`, patched IN
 * PLACE for the door's lifetime - same technique and marker discipline as
 * ModemEmulator.install() (modem-emulator.util.ts:263-305). In place, not a
 * wrapper object, because socket IDENTITY is load-bearing: AnsiBuffer keys off
 * socket.id and AmigaDoorSession registers door:input listeners on it.
 *
 * KEYED BY SESSION, not by object. A telnet connection can carry more than one
 * emitter object for the same session (c64-detected-handler.ts:36 builds a
 * second buildConnectionEmitter for the same connection), so the adapter is
 * stored on the session and remembers WHICH socket object it patched; lookup
 * from any emitter for that session finds it, and uninstall restores the emit
 * onto the object that was actually patched.
 *
 * _directEmit. ModemEmulator captures socket.emit in its CONSTRUCTOR
 * (modem-emulator.util.ts:28-30) and AmigaDoorSession.suspendModemThrottle can
 * construct one mid-door, so install() seeds `socket._directEmit` with the
 * PRE-adapter emit if it is unset. Consumers of _directEmit (screen wipes,
 * slowmo per-frame chunks) therefore BYPASS the adapter by design: they are
 * timing-critical single-byte paths whose whole point is skipping queues, and a
 * bypassed chunk simply reaches the transducer unadapted, which is the same
 * thing that happens today.
 *
 * FRAME BOUNDARIES (sysop ruling, both): a quiet gap of C64_ADAPT_TICK_MS since
 * the last write; a cap of C64_ADAPT_MAX_FRAME_MS; an explicit flush() when the
 * emulator stops (MoiraEmulator.pause -> AmigaDoorSession); and teardown.
 * flush() is idempotent and silent when nothing was written since the last one.
 *
 * NOT INSTALLED for a non-PETSCII session: install() returns null and `emit` is
 * not replaced, so 80-column output is byte-for-byte what it was. Non-string
 * payloads (ZMODEM buffers) and every non-'ansi-output' event pass through
 * untouched after the pending frame is flushed, so wire ordering holds. Raw
 * PETSCII ('petscii-bytes'/'petscii-output' - the .seq-first security screen a
 * 68K door can trigger) repaints the caller's screen outside this model, so the
 * diff baseline is dropped and the next frame is a full paint.
 */
import { FrameReconstructor, adaptFrame, renderDiff, type Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';
import { doorScreenWidth, C64_COLUMNS } from '../amiga-emulation/xim/screen-width.util';

export const C64_ADAPT_TICK_MS = 30;
export const C64_ADAPT_MAX_FRAME_MS = 250;
const SOURCE_COLS = 80;
const ROWS = 25;
const MARK = '_c64DoorAdapter';

export interface AdapterSession { petsciiMode?: boolean; screenWidth?: number; }
export interface C64AdapterOptions { tickMs?: number; maxFrameMs?: number; }

/** The ONE predicate for "this session's 68K door output goes through the adapter". */
export function c64AdapterDrives(session: AdapterSession | null | undefined): boolean {
  return session?.petsciiMode === true;
}

/** Where the adapter is stored: the session when the socket has one, else the socket. */
function holderOf(socket: any): any { return (socket && socket.session) || socket; }

export class C64DoorFrameAdapter {
  private readonly screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  private prev: Frame | null = null;
  private timer: NodeJS.Timeout | null = null;
  private capTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  /** The object whose emit was patched, and the emit to put back. */
  target: any = null;
  original: ((event: string, ...args: any[]) => any) | null = null;

  constructor(
    private readonly downstream: (event: string, ...args: any[]) => any,
    private readonly cols: number,
    private readonly tickMs: number,
    private readonly maxFrameMs: number,
  ) {}

  write(text: string): void {
    this.screen.write(text);
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.tickMs);
    if (!this.capTimer) this.capTimer = setTimeout(() => this.flush(), this.maxFrameMs);
  }

  flush(): void {
    this.clearTimers();
    if (!this.dirty) return;          // renderDiff always ends in SGR-reset + CUP, so an
    this.dirty = false;               // "empty" diff is not an empty string: never emit one
    const next = adaptFrame(this.screen.snapshot(), { cols: this.cols, rows: ROWS });
    const ansi = renderDiff(this.prev, next, this.cols, ROWS);
    this.prev = next;
    this.downstream('ansi-output', ansi);
  }

  dropBaseline(): void { this.prev = null; }
  dispose(): void { this.flush(); this.clearTimers(); }

  private clearTimers(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.capTimer) { clearTimeout(this.capTimer); this.capTimer = null; }
  }
}

export function c64AdapterFor(socket: any): C64DoorFrameAdapter | null {
  const holder = holderOf(socket);
  return (holder && holder[MARK]) || null;
}

export function installC64DoorAdapter(
  socket: any, session: AdapterSession | null | undefined, opts: C64AdapterOptions = {},
): C64DoorFrameAdapter | null {
  if (!socket) return null;
  const holder = holderOf(socket);
  if (holder[MARK]) return holder[MARK];
  if (!c64AdapterDrives(session)) return null;           // the 80-column non-negotiable
  const cols = Math.min(C64_COLUMNS, doorScreenWidth(session, C64_COLUMNS));
  const original = socket.emit.bind(socket);
  // A ModemEmulator constructed mid-door would otherwise capture the ADAPTER as
  // its _directEmit and route bypass traffic back into the reconstructor.
  if (!socket._directEmit) socket._directEmit = original;
  const adapter = new C64DoorFrameAdapter(
    original, cols, opts.tickMs ?? C64_ADAPT_TICK_MS, opts.maxFrameMs ?? C64_ADAPT_MAX_FRAME_MS);
  adapter.target = socket;
  adapter.original = socket.emit;
  holder[MARK] = adapter;
  socket.emit = (event: string, ...args: any[]) => {
    if (event === 'ansi-output' && typeof args[0] === 'string') { adapter.write(args[0]); return true; }
    adapter.flush();                                     // keep wire ordering
    if (event === 'petscii-bytes' || event === 'petscii-output' || Buffer.isBuffer(args[0])) adapter.dropBaseline();
    return original(event, ...args);
  };
  return adapter;
}

export function uninstallC64DoorAdapter(socket: any): void {
  const holder = holderOf(socket);
  const adapter: C64DoorFrameAdapter | undefined = holder && holder[MARK];
  if (!adapter) return;
  adapter.dispose();
  if (adapter.target && adapter.original) adapter.target.emit = adapter.original;
  delete holder[MARK];
}
```

- [ ] **Step 5: GREEN.** `SKIP_DB_INIT=1 npx jest ... tests/petscii-frame/c64-door-adapter.test.ts`.

- [ ] **Step 6: RED then GREEN - the ANSI byte-identity pin** (`c64-door-adapter-identity.test.ts`): run the
same door output through the REAL `buildConnectionEmitter` twice, with the install attempted and not, and
compare buffers. Three cases: identical for an ANSI session; the 80-column art still verbatim in those
bytes; DIFFERENT for a PETSCII session (otherwise the pin passes vacuously).

- [ ] **Step 7: the stop-boundary flush.** `MoiraEmulator.ts`, replacing `pause` (:266-270):

```ts
  private pauseListener: (() => void) | null = null;

  /**
   * Notified whenever the CPU STOPS - which is not only an input wait: Exec/DOS
   * waits, DreamDoor and FIM handlers all pause too (fourteen call sites). That
   * is fine and deliberate for the C64 adapter: whatever the door has painted
   * when it stops running is a complete frame, and flushing more often than
   * strictly necessary only makes the next diff smaller. One listener, set by
   * AmigaDoorSession; harmless when unset.
   */
  onPause(listener: (() => void) | null): void { this.pauseListener = listener; }

  pause(resumeCallback?: () => void): void {
    this.paused = true;
    this.resumeCallback = resumeCallback || null;
console.log("[MoiraEmulator] Emulator PAUSED (waiting for async input)");
    if (this.pauseListener) { try { this.pauseListener(); } catch { /* a frame flush must never kill the door */ } }
  }
```

`AmigaDoorSession.ts` after `this.emulator = new MoiraEmulator(memSize);` (:333):

```ts
      // Frame boundary for a C64 caller whenever the CPU stops. NOTE the limit:
      // C64_ADAPT_MAX_FRAME_MS is a setTimeout, so it can only fire when the JS
      // loop yields - it cannot preempt a synchronous 68K batch inside
      // executeUntilTrap (MoiraEmulator.ts:619, a tight C++ loop of up to
      // maxIterations instructions). A door that paints for a whole batch shows
      // its frame when the batch ends, not 250 ms in. The fake-timer unit test
      // does NOT cover that; only the live walk does.
      this.emulator.onPause(() => c64AdapterFor(this.socket)?.flush());
```

and in `removeSocketHandlers()` (:1244), after the listener removals, `uninstallC64DoorAdapter(this.socket);`
so a disconnect or `door:terminate` teardown cannot leave the emit patched.

- [ ] **Step 8: install at the LIVE launch site.** `door.handler.ts`:
  - `executeDoor` (:1636), first statement, defensively: `uninstallC64DoorAdapter(socket);` - an adapter can
    never survive one door into the next or into the menu.
  - `executeAmigaDoor` (:2497): install immediately before the `emitText(socket, '\r\n')` at :2959 (so the
    adapter's first render is the entry full paint), and wrap the start:

```ts
    installC64DoorAdapter(socket, session);        // adapter arming + entry full paint
    ...
    try {
      await amigaSession.start();
    } finally {
      // emitText buffers (ansi-buffer.util.ts, 16 ms timer); a buffered chunk
      // flushing AFTER the restore would reach the wire as raw 80-column ANSI
      // in the middle of a 40-column screen.
      getAnsiBuffer(socket).flushImmediate();
      uninstallC64DoorAdapter(socket);
    }
```

  - `launchAmigaDoor` (:665) is NOT touched: it has no callers (verified 2026-09-02 - the only reference
    outside its own body is a comment in `scripts/corpus-integration-runner.ts:552`).
  - `executeNativeDoor` (:3418) is the legacy `isAmigaBinary` fallback with no `bbsSession`; left alone and
    recorded in the handoff.

- [ ] **Step 9: the RUNTIME install test** (not a source pin). In
`web/backend/tests/doors/door-min-columns-gate.test.ts`, reusing its `executeDoor` scaffolding, mock
`AmigaDoorSession` so `start()` emits captured fixture ANSI on the socket it was constructed with:

```ts
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    constructor(private socket: any) {}
    async start() {
      const raw = fs.readFileSync(path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures/what.txt'), 'latin1');
      for (let i = 0; i < raw.length; i += 64) this.socket.emit('ansi-output', raw.slice(i, i + 64));
      await new Promise((r) => setTimeout(r, C64_ADAPT_TICK_MS * 3));   // let the quiet-gap tick fire
    }
    getExitState() { return {}; }
  },
}));

it('a c64 session entering a C64_ADAPT door is served 40-column frames, and the adapter is gone afterwards', async () => {
  const socket = makeSocket();
  await executeDoor(socket as any, c64Session(), testDoor({ type: 'XIM' as any, toolTypes: { C64_ADAPT: '40' } }));
  const out = allOutput(socket);
  expect(out).toContain('\x1b[2J\x1b[H');
  for (const m of out.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
    expect(Number(m[1])).toBeLessThanOrEqual(25);
    expect(Number(m[2])).toBeLessThanOrEqual(40);
  }
  expect(out).not.toContain('-'.repeat(70));            // no 80-column row reached the caller
  expect(c64AdapterFor(socket)).toBeNull();             // uninstalled on the way out
});
it('an 80-column session entering the same door sees the door 80-column bytes untouched', async () => {
  const socket = makeSocket();
  await executeDoor(socket as any, eightyColSession(), testDoor({ type: 'XIM' as any, toolTypes: { C64_ADAPT: '40' } }));
  expect(allOutput(socket)).toContain('-'.repeat(70));
});
```

Real timers here (the tick must actually fire); `dispose()` clearing both timers is proven by Task 3's
case 9, so the suite cannot hang on a live handle.

- [ ] **Step 10: verify.** `cd sdk && npx jest tests/petscii && npm run build`;
`cd web/backend && SKIP_DB_INIT=1 npx jest ... tests/petscii-frame tests/doors tests/xim tests/handlers/petscii-bytes-transport.test.ts`;
`npx tsc --noEmit`; then the FULL `npm test` - the 80-column no-change proof for every existing door test.
RED proof: loosen the install gate to `session?.petsciiMode !== false`, re-run the identity test, expect the
first two cases red, restore.

**Success criteria.** Automated: 13 adapter cases + 3 identity cases + 2 runtime `executeDoor` cases green;
full backend suite green; SDK green after `DEFAULT_BG`; `tsc --noEmit` clean. Manual: none here.

---

### Task 4: width consistency - pins only

Ruling 4 is already true on the live path, so this task adds NO production change. It exists so a future
edit cannot silently re-arm a 40-column hard character wrap.

**Files:** `web/backend/tests/xim/petscii-door-linewrap.test.ts` (extend),
`web/backend/tests/xim/dead-launch-path.test.ts` (new, source pin).

- [ ] **Step 1.** Add to `petscii-door-linewrap.test.ts`:

```ts
/**
 * The live 68K path (command-execution.handler.ts:512 -> executeDoor ->
 * executeAmigaDoor) passes the LIVE session as bbsSession (door.handler.ts:2907).
 * It carries no lineWrap, so XIMProtocol.ts:141's `?? 80` leaves the io.ts
 * safety net at 80 - which is what the adapter needs, because wrapLine
 * (line-wrap.util.ts:61-67) is a hard CHARACTER wrap with no word awareness and
 * at 40 would cut words in half before the reconstructor ever saw the row.
 * BB_SCRWIDTH still answers 40, so a width-aware door still self-adapts.
 */
it('a PETSCII door on the live path wraps at 80, so words survive to the ladder', () => {
  const { handler, emits } = buildHandler(80);
  serialOutput(handler, PROSE);
  expect(emits.join('').replace(/\r?\n$/, '').replace(STRIP, '')).toBe(PROSE);
});
it('BB_SCRWIDTH still answers 40 for a PETSCII session', () => {
  expect(doorScreenWidth({ petsciiMode: true, screenWidth: 40 })).toBe(40);
});
it('a live-path bbsSession carries no lineWrap, so the XIM default of 80 applies', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/handlers/door.handler.ts'), 'utf8');
  const block = src.slice(src.indexOf('async function executeAmigaDoor'), src.indexOf('async function executeMciDoor'));
  expect(block).toContain('bbsSession: session');
  expect(block).not.toContain('lineWrap:');
});
```

- [ ] **Step 2.** `dead-launch-path.test.ts`: assert `launchAmigaDoor` is referenced nowhere in
`web/backend/src` outside its own declaration and log lines, so if anyone wires it up they must revisit its
`lineWrap: doorScreenWidth(session, terminalWidth)` (a 40-column hard wrap) and this plan's ruling 4.

- [ ] **Step 3.** Geometry is NOT re-tested here: `web/backend/tests/server/petscii-session-geometry.test.ts`
already pins that a PETSCII session keeps 40x25 when the client reports a size.

**Success criteria.** Automated: `tests/xim` green in full; `tsc --noEmit` clean. Manual: none.

---

### Task 5: the gate hook - "adapter-capable opens a gated door"

The `MIN_COLUMNS` gate has landed. Read `c8f8ce233` first: `initializeDoors` folds one `Door.minColumns` at
registration, `validColumns` is the strict shared parser, `sessionColumns` is 40 for PETSCII and
`max(80, reported)` otherwise, and the gate runs before `session.currentDoorName`.

**The tooltype.** `MIN_COLUMNS=40` means "this door already fits 40" - false for an unmodified 80-column 68K
binary, so reusing it would put a lie in the registry. The adapter's claim gets its own name:
**`C64_ADAPT=<columns>`** - "usable at N columns THROUGH the adapter" - numeric, parsed with the SAME
`validColumns`, absent meaning unclassified and therefore closed.

**The only production source that reaches the gate** is `toolTypes['C64_ADAPT']`: a BBSCmd command is
launched by `command-execution.handler.ts:487-515`, which builds its `Door` object from `CommandDefinition`
and passes `toolTypes` straight through. There is therefore no registry step in this task - `DoorInfo` is
not consulted on that path. (A `DoorInfo.c64Adapt` field would be DOORS-menu display only and is deferred.)

**Files:** create `web/backend/src/utils/door-c64-adapt.util.ts`; modify `door.handler.ts` (the gate clause
at :1653 and the marker in `formatDoorLine` at :1327-1329); tests
`web/backend/tests/doors/door-c64-adapt.test.ts` + cases in `door-min-columns-gate.test.ts`.

- [ ] **Step 1: RED - the resolver.** `door-c64-adapt.test.ts`: default-closed (`null` for absent, and for
`MIN_COLUMNS` alone); reads `toolTypes.C64_ADAPT` and `doorInfo.toolTypes.C64_ADAPT`; `'yes'`, `'-1'` and
`'40abc'` are all `null` (shared `validColumns`); `adapterCanOpen` true for a marked `XIM/DD/AMI/SIM/FIM`
door on a PETSCII session at a width it claims, false for an unmarked door, false for a non-PETSCII session,
false for `TS/AREXX/MCI/WEB`, false when the door claims 64 and the caller has 40.

- [ ] **Step 2: implement.** `resolveDoorAdaptColumns(door)` =
`validColumns(door.c64Adapt) ?? validColumns(door.toolTypes?.['C64_ADAPT']) ?? validColumns(door.doorInfo?.toolTypes?.['C64_ADAPT'])`;
`adapterCanOpen(session, door, have)` =
`c64AdapterDrives(session) && ADAPTED_DOOR_TYPES.has(String(door.type).toUpperCase()) && cols !== null && have >= cols`
with `ADAPTED_DOOR_TYPES = new Set(['XIM','DD','AMI','SIM','FIM'])`.

- [ ] **Step 3: RED - the gate.** Add to `door-min-columns-gate.test.ts`: `C64_ADAPT=40` opens a gated
`XIM` door for a c64 session (`createAllDropFiles` called, no notice); it does NOT open the UNROUTED type;
an 80-column session is unaffected.

- [ ] **Step 4: implement - ONE gate, one extra clause.** Do not add a second `if`. In `executeDoor`:

```ts
  const have = sessionColumns(session);
  const need = resolveDoorMinColumns(door as any);
  // The C64 door adapter is the way a gated 68K door may still open: it
  // reconstructs the door's 80-column frames and reduces them to the caller's
  // 40 (server/c64-door-adapter.ts). The gate is unchanged and still
  // default-closed - this is one extra clause on the SAME condition, not a
  // second gate, so there is exactly one place a door can be refused.
  if (have < need && !adapterCanOpen(session, door as any, have)) {
    emitPrompt(socket, DOOR_NEEDS_80_NOTICE);
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }
```

- [ ] **Step 5: the door-list marker**, aligned with `c8f8ce233`'s one-resolver rule (both markers read the
resolved value off the same `Door` object the gate will judge):

```ts
  // 40-ok doors carry [40]; doors that reach 40 only THROUGH the adapter carry
  // [C64]. Different promises, and a sysop reading the list needs to know which
  // one a door is making. Both live inside the same 30-char budget, so the row
  // never widens (c8f8ce233).
  const mark = resolveDoorMinColumns(door) <= 40 ? ' [40]' : (resolveDoorAdaptColumns(door) !== null ? ' [C64]' : '');
  const name = padString(`${door.name}${mark}`, 30);
```

Extend the existing `formatDoorLine` test with a `[C64]` case and a "never both" case.

- [ ] **Step 6: mark the three doors (sysop go-ahead required).** `.info` files are binary - never open one
with an editor:
`cd web/backend && npx tsx -e "const {updateTooltype}=require('./src/utils/info-file.util'); for (const c of ['WHO','S','WHAT']) updateTooltype(\`../../Commands/BBSCmd/\${c}.info\`, 'C64_ADAPT', '40');"`
then `reloadDoors()`. Verify by reading back through `readTooltypeMap`, not by eye.

**Success criteria.** Automated: `door-c64-adapt.test.ts` + the new gate cases green; every landed
`MIN_COLUMNS` case still green unchanged; `tsc --noEmit` clean. Manual: a C64 session's door list shows
`WHO`, `S`, `WHAT` with `[C64]` and nothing else; an unmarked door still prints the notice.

---

### Task 6: the BBSTerminal seam - prove nothing changes, with a trace

No production change is expected in `packages/terminal`.

**Trace (web 'P' session, verified by reading 2026-09-02):** `executeAmigaDoor` installs the adapter and
`executeDoor`'s caller emits `door-active true` -> `BBSTerminal.tsx:2486-2493` sets
`petsciiDoorActiveRef.current = true`, so `startPetsciiDrain` (:848-853) empties the pace queue in one go
(door frames are never baud-paced) -> the door writes; `xim/io.ts:128 directEmit` -> the patched
`socket.emit('ansi-output', ...)` -> the adapter's `FrameReconstructor`; nothing leaves the backend -> a
frame boundary fires; `renderDiff` produces 40x25 ANSI; the adapter calls the ORIGINAL
`socket.emit('ansi-output', ansi)` -> `BBSTerminal.tsx:2127-2139`, `surfaceRef.current === 'canvas'` ->
`enqueuePetscii(transducer.transduce(output))` -> `PetsciiMachine` -> canvas.

**Why no gap exists:** the payload is ordinary ANSI, which this handler has carried since full-canvas
Task 8 - the adapter changes its SHAPE (<= 40x25), not its KIND. `renderDiff` clamps every CUP into 40x25
(`cupTo`, `frame-render.ts:30-34`) and never paints (39,24), so the transducer's clamps and `fillRow` cap
are never reached. Every frame ENDS with `ESC[0m` + a complete CUP, so the transducer holds nothing between
frames: the hazards `flushPendingPetscii` exists for (a held bare CR, a split escape) cannot arise from
adapter output. Telnet/SSH is the same one layer down (`connection-emitter.ts:97-107`).

- [ ] **Step 1: the guard test** (case 13 of `c64-door-adapter.test.ts`): every emitted payload is a string
on `'ansi-output'`, matches `/\x1b\[\d+;\d+H$/` (a complete CUP, nothing held), never ends in a bare `\r`,
and contains no CUP beyond row 25 / column 40.
- [ ] **Step 2: pin the no-change.** `git status --short packages/terminal` must be empty at the end of
Phase 3; record it in the handoff. A gap found by the manual walk gets its own task, not a smuggled edit.

**Success criteria.** Automated: the guard case green; `git diff --stat packages/terminal` empty. Manual:
step 8 of the full-canvas walk shows no stray escape text.

---

### Task 7: end-to-end reachability - captured doors, the real emitter, the KERNAL oracle

**Files:** create `web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`.

- [ ] **Step 1: RED then GREEN.** Fixtures: the eight `.ans` captures and the three `.txt` goldens from
Task 2, all read as `latin1`. Timers: REAL, with `dispose()` proven to clear both handles (Task 3 case 9),
and an explicit `flush()` every eight chunks standing in for the tick.

```ts
const DIR = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');
const FIXTURES = fs.readdirSync(DIR).filter((f) => /\.(ans|txt)$/.test(f));
const CHUNK = 64;

function run(fixture: string, session: any, useAdapter: boolean) {
  const raw = fs.readFileSync(path.join(DIR, fixture), 'latin1');
  const written: Buffer[] = [];
  const connection: any = { sessionId: 'e2e', session,
    write: (b: any) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'latin1')),
    on() {}, off() {}, close() {} };
  const emitter = buildConnectionEmitter(connection);
  if (useAdapter) installC64DoorAdapter(emitter, session, { tickMs: 100000, maxFrameMs: 100000 });
  for (let i = 0; i < raw.length; i += CHUNK) {
    emitter.emit('ansi-output', raw.slice(i, i + CHUNK));
    if (useAdapter && i % (CHUNK * 8) === 0) c64AdapterFor(emitter)!.flush();
  }
  if (useAdapter) uninstallC64DoorAdapter(emitter);
  return { bytes: Buffer.concat(written), raw };
}
```

Three cases per fixture: (1) a PETSCII caller ends on a 40x25 screen the oracle can show - `bytes` contains
no `0x1b`, `PetsciiMachine.state.screen.length === 1000`, cursor inside 40x25; (2) nothing the ladder
produced is lost - every non-blank row of `adaptRows(...).rows.slice(-25)` appears on the machine's screen
(`adaptFrame` shows the LAST 25 adapted rows: overflow scrolls up like a terminal, the documented Phase 2
tail-paging, which after Task 2 is at most one row on `rtw`/`ustats`); (3) the same fixture for an ANSI
session is byte-for-byte what it is with no adapter at all. Screen text is derived from `state.screen` the
way `frame-render-roundtrip.test.ts` does it - do NOT add a method to `PetsciiMachine` for a test.

- [ ] **Step 2: mutation proof** (record the output). Each must go red and be restored byte-identically:
(a) `renderDiff(this.prev, ...)` -> `renderDiff(null, ...)` must fail Task 3's coalescing case (if it does
not, that case is too weak); (b) `adaptFrame(..., { cols: this.cols })` -> `{ cols: 80 }` must fail cases 1
and 2; (c) dropping the `dirty` guard must fail Task 3's "a tick with no new output emits nothing";
(d) loosening the install gate must fail the identity cases and case 3 here.

**Success criteria.** Automated: 3 cases x 11 fixtures green; four mutations red; all of
`tests/petscii-frame` green. Manual: none.

---

### Task 8: freshness, handoff, docs

- [ ] **Step 1: freshness.** `sdk/` was edited: run `.claude/skills/door-sdk-freshness/SKILL.md` end to end
(`cd sdk && npm run build`, restart the backend, confirm the process picked up the new `dist/`). Nobody is
told "test it" first.
- [ ] **Step 2: full sweep, recorded verbatim in the handoff.** `cd sdk && npm run build && npm test`;
`cd web/backend && npx tsc --noEmit && npm test`; `cd packages/terminal && npm run build`;
`git status --short packages/terminal` (empty).
- [ ] **Step 3: the manual C64 walk** (the sysop runs it; expectations written against the Task 2
measurement, not against hope):
  1. Web, answer `P`. The door list shows `WHO`, `S`, `WHAT` with `[C64]`; nothing else has it.
  2. Enter `WHO`. EXPECT: the screen clears at entry, then the node table on a 40-column screen with its
     COLUMNS STILL SIDE BY SIDE - `Nd`, name, location, action - each column shortened and any column that
     lost characters ending in `>`. The header row is the top row (it is no longer scrolled away). The
     bordered rules render as 40-column rules. Nothing past column 39. RETURN exits.
  3. Enter `S`. EXPECT: the `NaME/HaNDlE........: sysop` rows verbatim (they already fit); the centred
     `----->>>> YoUr USeR StAtS <<<<-----` banners shifted flush left, on ONE row each, not split over two;
     the two closing credit lines word-wrapped over two rows each (they are prose, 52 columns after
     de-indent).
  4. Enter `WHAT`. EXPECT: the whole box on one 25-row screen - the `.----.` top rule, the title row
     truncated with a trailing `>`, the six column headers side by side (roughly
     `Nd Usernam> Status/> File(s) Filesize CPS`), `- NO TRANSFER ACTIVITIES -`, and the two totals rows.
     No row is doubled.
  5. Enter any UNMARKED 68K door. EXPECT: `THIS DOOR NEEDS AN 80 COLUMN SCREEN`, back at the menu.
  6. Reload, answer `A`, enter the SAME doors. EXPECT: the ordinary 80-column screens, unchanged.
  7. SyncTERM `ScreenMode=C64` / a real C64 over telnet: repeat 2-5.
  8. Inside `WHO`, hold RETURN. EXPECT: the prompt appears without your having to type (the stop-boundary
     flush). A door that paints inside one long CPU batch may show its frame at the END of the batch rather
     than 250 ms in - report it if a screen feels like it arrives late in one lump.
- [ ] **Step 4: handoff** `thoughts/shared/handoffs/2026-09-02_c64-door-adapter-phase3.md`: the seam and why
it is a session-keyed in-place socket patch; `_directEmit` bypass by design; `launchAmigaDoor` being dead
and `executeAmigaDoor` being the live path; the measured before/after ladder numbers; the `narrow` rule's
lossy contract and its `>` mark; `executeNativeDoor` left out; the three marked doors; the corpus doors
being unreachable; and the deferred list below.
- [ ] **Step 5:** update the "Known PETSCII limitations" paragraph in
`Documentation/3-Developers/ARCHITECTURE.md`: "80-column positioned UIs are clamped to 40x25" becomes
"reduced by the door adapter for 68K doors marked `C64_ADAPT` (columns narrowed with `>` truncation marks),
clamped otherwise".

---

## Out of scope - Phase 4+ and the hooks they need

| Deferred | Hook, already present or named here |
|---|---|
| Pack override (ladder rule 1): fingerprints, `.seq` / 40-col ANSI substitution | `AdaptOptions.regions` already selects a rule per source-row range and now accepts `deindent`/`narrow`. Add `regions` to `C64AdapterOptions` and read `C64_PACK` where Task 5 reads `C64_ADAPT`. |
| Viewport rule (6) + pan keys | The adapter owns the whole 80x25 frame, so a pan is a render-time column offset on `adaptFrame`. Pan keys must be intercepted before the door sees them: the door input handler set at door launch, upstream of `routeAmigaDoorInput`. |
| Per-column pinning of which column `narrow` shrinks first | `narrowRow` shrinks the widest column; a pack will name a priority order. The rule already takes its widths from one place, so this is a parameter, not a rewrite. |
| `dev/scripts/c64-pack.ts` (capture / fingerprint / verify) | `web/backend/src/scripts/run-amiga-door.ts` (run with `cwd: web/backend` - there is no root `tsconfig.json`) and the manifest shape in `sdk/tests/petscii/frame/fixtures/manifest.json`. |
| `DoorInfo.c64Adapt` for the DOORS menu | Display only: the launch path builds its `Door` from `CommandDefinition.toolTypes`, so the gate never reads `DoorInfo` there. |
| AREXX and TypeScript/blessed doors | Not on this seam - they never construct an `AmigaDoorSession`. Blessed doors get NATIVE 40-column layouts from the 40-col plan (Tasks 3, 5, 6). AREXX `BB_SCRWIDTH` was fixed separately (`823825f39`). |
| `executeNativeDoor` (`door.handler.ts:3418`) | The legacy `isAmigaBinary` fallback: no `bbsSession`, no `petsciiMode`, no gate. Add the same install/uninstall pair if a door is ever found to reach a caller through it. |
| A coloured screen background for an adapted door | `renderDiff` never emits a background by design. Phase 4 packs emit `$02 <colour>` through the transducer's CCGMS path. |

---

## Self-review - what a reviewer would push back on

1. **"Patching `socket.emit` is fragile."** It is the established pattern (`ModemEmulator.install`), and a
   wrapper object would break socket identity, which `AnsiBuffer` (keyed on `socket.id`) and
   `AmigaDoorSession`'s `door:input` listeners depend on. Install/uninstall is symmetric, session-keyed,
   idempotent, in a `finally`, repeated in `removeSocketHandlers()`, and defensively cleared at the top of
   `executeDoor`.
2. **"A leaked adapter kills the terminal."** It does not: a leaked adapter still flushes on its timers and
   still passes non-`ansi-output` events through, so the failure mode is "the BBS menu is reduced to 40
   columns" - visible, not silent. Four uninstall points make a leak unlikely.
3. **"The cap cannot fire during a 68K batch."** True and stated at the wiring site: `setTimeout` needs the
   JS loop to yield, and `executeUntilTrap` (MoiraEmulator.ts:619) is a tight C++ loop. The stop-boundary
   flush covers the case that matters (the door blocking); the fake-timer test does not cover it and says so.
4. **"`narrow` is lossy."** Deliberately, and it is a NEW rule name so `gutter`'s multiset invariant stays
   literally true. Its five invariants (one row, column count and order, prefix per column, `>` on a
   shortened column, first column never dropped) are pinned, and the alternative it replaces - splitting a
   table so its right-hand columns land on a header-less row, then scrolling the title away - loses more.
5. **"`DEFAULT_BG = 0` is a silent change."** It touches nothing on the wire, aligns the frame model with
   `PetsciiMachine`'s power-on, and the six assertions encoding the old value change RED-first.
6. **"'Nothing is lost' is too strong."** Scoped in Task 7 case 2 to the last 25 adapted rows, which after
   Task 2 is the whole frame for `what` and all but one row for `rtw`/`ustats` - and that one row is the
   BBS's own post-door prompt reflowing, not door output.
7. **"The parity test was deleted."** Replaced by structural identity, a no-second-implementation source
   check, and the same corpus coverage - plus the new FROZEN note, since those two functions now serve the
   80-column path from the SDK.
8. **"Task 5 forks the gate."** One extra clause on the single existing `if`, importing the landed
   `resolveDoorMinColumns` / `sessionColumns` unchanged; the marker reads the same resolved object
   `c8f8ce233` established.
9. **"The three doors are not the corpus doors."** They cannot be - the corpus binaries were deleted and
   none has a `Commands/BBSCmd/*.info`. The three chosen doors are installed, reachable, and their captures
   are now corpus fixtures in their own right.
