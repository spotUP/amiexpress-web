---
date: 2026-09-02
topic: C64 Door Adapter - Phases 0-2 (width honesty, FrameReconstructor, FrameDiffRenderer, rule ladder 2-5)
tags: [petscii, c64, doors, 68k, xim, sdk, frame, adapter]
status: draft
---

# C64 Door Adapter - Phases 0-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Show the full checklist before starting and report the running count after every task.

**Goal:** Land the three pure building blocks of the C64 door adapter - an 80xN ANSI frame reconstructor, a 40x25 frame diff renderer proven through the `AnsiToPetsciiTransducer` + `PetsciiMachine` oracle, and the mechanical rule ladder (crop, gutter, reflow, split) with per-region pinning and a committed corpus of captured 68K door frames - plus the 20-line width-honesty fix (`BB_SCRWIDTH`, `lineWrap`) that helps C64 callers today.

**Architecture:** Door output is reconstructed on a virtual 80x25 cell grid (`FrameReconstructor`), each frame is transformed 80->40 by an ordered rule ladder applied per row/region (`adaptFrame`), and the 40x25 result is diff-rendered to minimal ANSI (`renderDiff`) that the existing transducer turns into PETSCII bytes. Phases 1-2 are SDK-only pure TypeScript in `sdk/petscii/frame/` beside the PETSCII core they build on; nothing is wired into the emitter yet. Phase 0 is a backend-only change: 68K doors that ask how wide the screen is get the session's width on PETSCII sessions and 80 everywhere else.

**Tech Stack:** TypeScript strict. SDK jest (`cd sdk && npm test`, ts-jest, tests in `sdk/tests/petscii/frame/`). Backend jest (`cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . <path>`, swc). Capture harness `web/backend/src/scripts/run-amiga-door.ts` driven with scripted stdin (format `<delayMs> <bytes>`, escapes `\r \n \t \xNN \\`).

**Spec:** `thoughts/shared/plans/2026-09-02-c64-door-adapter.md` (strategy: architecture, rule ladder, pack format, phases, limits). Controller ruling on its decision 2: the frame tick is BOTH a quiet-gap tick (~30 ms, configurable) AND an input-wait flush as the hard boundary - that tick lives in Phase 3 (emitter integration) and is out of this plan; Phases 1-2 expose `snapshot()` so any tick policy can call it. Decisions 1 and 3 are out of scope.

**Out of this plan (Phases 3-6 of the strategy):** pack override (rule 1, fingerprints, `.seq` substitution), viewport rule (6) and pan keys, emitter integration (`connection-emitter.ts`, BBSTerminal seam, tick/flush), `dev/scripts/c64-pack.ts` tooling, `C64_PACK` / `MIN_COLUMNS` tooltypes, door-list 40-ok marks, the `sdk/package.json` `./petscii/frame` export (nothing outside the SDK consumes the frame module before Phase 3), and the AREXX `BB_SCRWIDTH` at `web/backend/src/services/arexx.service.ts:1924` (owned by the 40-col plan's Task 4).

## Global Constraints

- **SDK-only for Phases 1-2.** All new code lives in `sdk/petscii/frame/` and is pure TypeScript: zero DOM, zero Node imports (`fs`, `path`, `Buffer`, `process` are forbidden in `sdk/petscii/frame/**`; tests may use `fs`). Tests live in `sdk/tests/petscii/frame/`. Imports from the PETSCII core are relative (`../petscii-machine`, `../ansi-to-petscii`, `../c64-palette`, `../screen-codes`, `../unicode-to-petscii`). `sdk/petscii/index.ts` and `sdk/package.json` are NOT edited (claimed by the full-canvas run); the frame barrel is `sdk/petscii/frame/index.ts`.
- **Verification commands.** SDK: `cd sdk && npm run build && npx jest tests/petscii` (5 suites / 73 tests green at HEAD a93f8083 before this plan; the full `npm test` is the pre-commit gate). Backend (Phase 0 only): `cd web/backend && npx tsc --noEmit` plus the targeted jest files named in Task 1, then the full `cd web/backend && npm test` before the Phase 0 commit.
- **The 80-column non-negotiable.** Every adapter behaviour is gated on `petsciiMode`. Phase 0 pins `BB_SCRWIDTH === 80` for every non-PETSCII session (whatever its terminal width) and leaves `lineWrap` for non-PETSCII sessions exactly as it is today. Phases 1-2 change no runtime path at all.
- **Shared working tree.** Three sessions share this checkout. Before the first edit append a claim to `thoughts/BOARD.md` (Log entry, `HH:MM <name> - CLAIMING: sdk/petscii/frame/**, sdk/tests/petscii/frame/**, web/backend/src/amiga-emulation/xim/{bbs-info.ts,screen-width.util.ts,types.ts}, web/backend/src/amiga-emulation/session/DoorMessageHandler.ts (BB_SCRWIDTH case only), web/backend/src/handlers/door.handler.ts (launchAmigaDoor bbsSession literal only), web/backend/tests/xim/**, web/backend/tests/petscii-frame/**`). Commit by file name, never `git add -A`/`-u`. Run `git diff --cached --stat` before every commit and refuse if anything staged is outside the claim. Never `git stash` in this repo. No pushes; the sysop says "deploy".
- **Do not touch** `packages/terminal/src/components/BBSTerminal.tsx`, `docs/`, root `handoff.md`, `web/backend/src/utils/{wrap-for-session.util.ts,ansi-buffer.util.ts}`, `web/backend/src/server/connection-emitter.ts`, `sdk/petscii/*.ts` (the non-frame core files).
- **Scratch output** only under the session scratchpad (`/private/tmp/claude-501/-Users-spot-Code-amiexpress-web/<session>/scratchpad`), never `/tmp`. Capture logs and intermediate files go there; fixtures go to `sdk/tests/petscii/frame/fixtures/`.
- **Fixtures are bytes.** Captured `.ans` files may contain high-bit Amiga Latin-1 output re-encoded as UTF-8 by the harness; never open them with the Edit/Write tools (they destroy high-bit bytes) - shell redirection only, verify with `wc -c` and `grep -c`.
- **No emojis** anywhere - code, comments, tests, commit messages, BOARD entries.
- **RED then GREEN per behaviour.** Every step below writes the failing test first, runs it and records the failure text, then implements. Before each commit revert the implementation once and confirm the new tests fail (the plan names the file to revert).
- **Emulator etiquette** for Task 7 captures: one `run-amiga-door.ts` at a time, never two in parallel; stdout to a file by redirection (never a pipe into `head`).
- **After any `sdk/` edit** run `.claude/skills/door-sdk-freshness/SKILL.md` before telling anyone to test anything (Task 7 last step).

## Shared types (binding across every task)

```ts
// sdk/petscii/frame/types.ts - defined in Task 2, consumed unchanged by Tasks 3-7
export interface Cell { ch: string; fg: number; bg: number; bold: boolean; rvs: boolean; }
export interface Cursor { x: number; y: number; }
export interface Frame {
  readonly cols: number;
  readonly rows: number;
  readonly cells: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>;
  readonly cursor: Readonly<Cursor>;
}
```

`fg`/`bg` are VIC-II indices 0-15, the space `sgrColorToVic` / `nearestVicForRgb` resolve into. Default `fg` = 1 (white, the transducer's SGR 0 / 39), default `bg` = 6 (the C64's fixed blue). `ch` is one printable code point; blank = `' '` with `rvs === false`.

---

### Task 1: Phase 0 - width honesty: `BB_SCRWIDTH` and `lineWrap` answer the session's width on PETSCII sessions

**What exists (verified 2026-09-02 at a93f8083):**
- `web/backend/src/amiga-emulation/xim/bbs-info.ts:372-375` hardcodes the answer:
  ```ts
        case XIMCommand.BB_SCRWIDTH:
          value = 80;
  debugLog('  BB_SCRWIDTH: 80');
          break;
  ```
  This IS the live path: `XIMProtocol.ts:1130-1134` dispatches `BB_SCRWIDTH/BB_SCRHEIGHT/BB_SCRLEFT/BB_SCRTOP` to `this.bbsInfoHandler.handleScreenDimensions(msg)`.
- `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:2066-2070` is the fallback copy:
  ```ts
        case XIMCommand.BB_SCRWIDTH:
          // express.e:3865-3866: Screen width (80 columns standard)
  debugLog(`[DoorMessageHandler]   BB_SCRWIDTH: 80`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 80);
          break;
  ```
- `lineWrap` is set ONCE, at door launch, `web/backend/src/handlers/door.handler.ts:824` (`lineWrap: terminalWidth,`) inside the `bbsSession: { ... }` literal at 811-828, where `terminalWidth` (700-705) is `pickPositiveNumber(session.tempData?.termWidth, session.screenWidth, session.user?.lineLength) ?? 80`. `XIMProtocol.ts:141` copies it into `state.lineWrap` (`const wrapWidth = this.bbsSession?.lineWrap ?? 80;`), and `xim/io.ts:1457` wraps non-art, non-positioned lines with `wrapLine(line, this.state.lineWrap)`.
- The session fields: `web/backend/src/index.ts:384` `petsciiMode?: boolean`, `:389` `screenWidth?: number` (set by `terminal-type` at index.ts:1249-1251 and NAWS at 1264-1274; 40 for a C64). `socket-handlers.ts:232` writes `session.tempData.termWidth = cols` from the web client's terminal-size event, which is why a PETSCII session can still carry `termWidth = 80` from before the `P` answer - `terminalWidth` alone is not a safe PETSCII width.
- `BBSSessionData` (`xim/types.ts:331`) has `lineWrap?: number` at 349 but NO `petsciiMode` / `screenWidth`; the launch literal at door.handler.ts:811 does not pass them. Consequence today: `DoorMessageHandler.ts:2996` (`this.config.bbsSession?.petsciiMode || false`, the `.seq`-first security-screen lookup for 68K doors) always sees `false`. Passing the field fixes that as a side effect; it is pinned by the test in Step 5.

**Files:**
- Create: `web/backend/src/amiga-emulation/xim/screen-width.util.ts`
- Modify: `web/backend/src/amiga-emulation/xim/types.ts:349` (add two fields after `lineWrap?: number;`)
- Modify: `web/backend/src/amiga-emulation/xim/bbs-info.ts:24` (import) and `:372-375`
- Modify: `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:10` (import) and `:2066-2070`
- Modify: `web/backend/src/handlers/door.handler.ts:13` (import) and `:824`
- Modify: `web/backend/tests/amiga-emulation/helpers/mem-stub.ts` (add 16-bit + readString)
- Test: `web/backend/tests/xim/door-screen-width.test.ts`, `web/backend/tests/xim/bb-scrwidth-answers-session-width.test.ts`, `web/backend/tests/xim/petscii-door-linewrap.test.ts`, `web/backend/tests/xim/door-launch-passes-petscii-session.test.ts`

**Interfaces:**
- Produces: `doorScreenWidth(session: ScreenWidthSource | null | undefined, fallback?: number): number` with `ScreenWidthSource = { petsciiMode?: boolean; screenWidth?: number }`; constants `C64_COLUMNS = 40`, `DEFAULT_DOOR_COLUMNS = 80`.
- Consumes: `BBSSessionData` (extended), `XIMBBSInfoHandler.handleScreenDimensions`, `XIMIOHandler.handleSerialOutput` (unchanged), `XIMMessageParser`.

- [ ] **Step 0: Claim.** Append the BOARD Log entry from Global Constraints. Confirm `git status --short web/backend/src/amiga-emulation web/backend/src/handlers/door.handler.ts` shows no dirt from another session in these files.

- [ ] **Step 1: Write the failing unit test for the one width function**

Create `web/backend/tests/xim/door-screen-width.test.ts`:

```ts
/**
 * The ONE answer to "how wide is this caller's screen?" for 68K doors.
 * BB_SCRWIDTH (bbs-info.ts, DoorMessageHandler.ts) and the launch-time
 * lineWrap (door.handler.ts) both read it, so a width-aware door and the
 * wrapLine() safety net can never disagree.
 */
import { doorScreenWidth, C64_COLUMNS, DEFAULT_DOOR_COLUMNS } from '../../src/amiga-emulation/xim/screen-width.util';

describe('doorScreenWidth', () => {
  it('answers 80 for every non-PETSCII session, whatever the terminal is (byte-identical to before)', () => {
    expect(doorScreenWidth({ petsciiMode: false, screenWidth: 40 })).toBe(80);
    expect(doorScreenWidth({ screenWidth: 132 })).toBe(80);
    expect(doorScreenWidth({})).toBe(80);
    expect(doorScreenWidth(undefined)).toBe(80);
    expect(doorScreenWidth(null)).toBe(80);
    expect(DEFAULT_DOOR_COLUMNS).toBe(80);
  });

  it('answers the session width for a PETSCII session', () => {
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 40 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 64 })).toBe(64);
  });

  it('answers 40 for a PETSCII session whose width is missing, zero or not narrower than 80', () => {
    expect(doorScreenWidth({ petsciiMode: true })).toBe(C64_COLUMNS);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 0 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 80 })).toBe(40);
  });

  it('uses the caller-supplied fallback only for non-PETSCII sessions (lineWrap keeps wide terminals wide)', () => {
    expect(doorScreenWidth({ screenWidth: 132 }, 132)).toBe(132);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 80 }, 132)).toBe(40);
  });
});
```

- [ ] **Step 2: RED.** `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/xim/door-screen-width.test.ts` -> expected failure: `Cannot find module '../../src/amiga-emulation/xim/screen-width.util'`.

- [ ] **Step 3: Implement the util**

Create `web/backend/src/amiga-emulation/xim/screen-width.util.ts`:

```ts
/**
 * The ONE answer to "how wide is this caller's screen?" for 68K doors.
 *
 * Read by BB_SCRWIDTH (xim/bbs-info.ts handleScreenDimensions - the live
 * dispatch, XIMProtocol.ts:1130 - and the DoorMessageHandler fallback copy)
 * and by the launch-time `lineWrap` in door.handler.ts launchAmigaDoor, so a
 * width-aware door and the wrapLine() safety net can never disagree.
 *
 * PETSCII session: the session's width (40 for every C64; set by
 * terminal-type / NAWS in index.ts), or 40 when the field is missing, zero,
 * or not narrower than 80 (a web 'P' session can still carry the 80 its
 * xterm reported before the caller answered P).
 *
 * Anything else: `fallback` - 80 for BB_SCRWIDTH, which is what every door
 * has been told since day one, byte-for-byte; the resolved terminal width
 * for lineWrap, so wide ANSI terminals keep wrapping where they did.
 */
export const C64_COLUMNS = 40;
export const DEFAULT_DOOR_COLUMNS = 80;

export interface ScreenWidthSource {
  petsciiMode?: boolean;
  screenWidth?: number;
}

export function doorScreenWidth(
  session: ScreenWidthSource | null | undefined,
  fallback: number = DEFAULT_DOOR_COLUMNS,
): number {
  if (!session || session.petsciiMode !== true) return fallback;
  const width = session.screenWidth;
  return typeof width === 'number' && width > 0 && width < DEFAULT_DOOR_COLUMNS ? width : C64_COLUMNS;
}
```

- [ ] **Step 4: GREEN** (same command as Step 2; 4 tests pass).

- [ ] **Step 5: Write the failing handler tests (live path, wrap path, launch literal, fallback copy)**

First extend the shared stub so `XIMMessageParser` can run against it. In `web/backend/tests/amiga-emulation/helpers/mem-stub.ts` add inside `class MemStub` after `writeMemory32`:

```ts
  readMemory16(a: number) { return ((this.readMemory(a) << 8) | this.readMemory(a + 1)) & 0xffff; }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >>> 8); this.writeMemory(a + 1, v); }
  readString(a: number, maxLength: number) {
    let out = '';
    for (let i = 0; i < maxLength; i++) { const b = this.readMemory(a + i); if (b === 0) break; out += String.fromCharCode(b); }
    return out;
  }
```

Create `web/backend/tests/xim/bb-scrwidth-answers-session-width.test.ts`:

```ts
/**
 * BB_SCRWIDTH (express.e:3865-3866 msg.data:=screen.width) through the LIVE
 * handler: XIMProtocol.ts:1130-1134 dispatches it to
 * XIMBBSInfoHandler.handleScreenDimensions. A C64 caller is told 40 (the
 * session width); every ANSI caller is told 80 exactly as before.
 */
import { XIMBBSInfoHandler } from '../../src/amiga-emulation/xim/bbs-info';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMCommand, BBSSessionData, XIMState } from '../../src/amiga-emulation/xim/types';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { MemStub } from '../amiga-emulation/helpers/mem-stub';

function build(bbsSession: BBSSessionData) {
  const emulator = new MemStub() as any;
  const messageParser = new XIMMessageParser(emulator);
  const msgAddr = 0x1000;
  emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_TOTAL_LENGTH);
  const state = { registered: true, lineWrap: 80, pauseLines: 24 } as unknown as XIMState;
  const execLibrary = { replyMsg: jest.fn(), putMsg: jest.fn() } as any;
  const socket = { emit: jest.fn() } as any;
  const handler = new XIMBBSInfoHandler(emulator, execLibrary, socket, messageParser, bbsSession, state);
  const ask = (command: number) => {
    handler.handleScreenDimensions({ msgAddr, command, data: 0, replyPort: 0xdead0000, messageLength: DoorConstants.MESSAGE_TOTAL_LENGTH, string: '' } as any);
    return emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
  };
  return { ask, execLibrary };
}

describe('BB_SCRWIDTH answers the session width', () => {
  it('tells a PETSCII session it has 40 columns', () => {
    expect(build({ nodeId: 1, petsciiMode: true, screenWidth: 40 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(40);
  });

  it('tells a PETSCII session with no width recorded 40 columns', () => {
    expect(build({ nodeId: 1, petsciiMode: true }).ask(XIMCommand.BB_SCRWIDTH)).toBe(40);
  });

  it('tells every ANSI session 80 columns - even a 40-wide one that is not PETSCII', () => {
    expect(build({ nodeId: 1 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
    expect(build({ nodeId: 1, petsciiMode: false, screenWidth: 40 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
    expect(build({ nodeId: 1, screenWidth: 132 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
  });

  it('leaves BB_SCRLEFT / BB_SCRTOP at 0 and still replies to the door', () => {
    const b = build({ nodeId: 1, petsciiMode: true, screenWidth: 40 });
    expect(b.ask(XIMCommand.BB_SCRLEFT)).toBe(0);
    expect(b.ask(XIMCommand.BB_SCRTOP)).toBe(0);
    expect(b.execLibrary.replyMsg).toHaveBeenCalled();
  });
});
```

Create `web/backend/tests/xim/petscii-door-linewrap.test.ts` (pins that the existing wrapLine path honours the width the util produces; harness copied from `tests/amiga-emulation/jh-sf-sync-fastpath.test.ts`):

```ts
/**
 * A 68K door's plain text line wraps at 40 on a PETSCII session through the
 * EXISTING xim/io.ts wrapLine path (io.ts:1457) once state.lineWrap carries
 * doorScreenWidth(); an ANSI session's line is emitted byte-identical.
 */
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { doorScreenWidth } from '../../src/amiga-emulation/xim/screen-width.util';

const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;

function buildHandler(lineWrap: number) {
  const emits: string[] = [];
  const socket: any = { emit: (ev: string, payload: string) => { if (ev === 'ansi-output') emits.push(payload); return true; } };
  const emulator: any = { pause: () => {}, resume: () => {}, readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {} };
  const execLibrary: any = { replyMsg: () => {}, putMsg: () => {} };
  const messageParser: any = { writeCommand: () => {}, writeMessageString: () => {}, writeData: () => {}, getCommandName: () => 'JH_SO' };
  const state: any = {
    registered: true, shuttingDown: false, nonStopText: false, autoPauseEnabled: false, lineCount: 0,
    lineWrap, pauseLines: 24, language: '', confAccess: '', carrierDropped: false, rawArrow: false,
    transfering: false, doorSilent: false,
  };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, { user: { secLevel: 100 } } as any);
  (handler as any).getMessageString = (m: any) => m.string || '';
  return { handler, emits };
}

const PROSE = 'the quick brown fox jumps over the lazy dog and keeps on running past the fence';

function serialOutput(handler: XIMIOHandler, text: string) {
  handler.handleSerialOutput({ msgAddr: 0xdead0000, command: XIMCommand.JH_SO, data: 1, replyPort: 0, string: text } as any);
}

describe('68K door text on a PETSCII session', () => {
  it('wraps a prose line at 40 columns and loses no characters', () => {
    const { handler, emits } = buildHandler(doorScreenWidth({ petsciiMode: true, screenWidth: 40 }, 80));
    serialOutput(handler, PROSE);
    const segments = emits.join('').split(/\r?\n/).filter((s) => s.length > 0).map((s) => s.replace(STRIP, ''));
    expect(segments.length).toBe(2);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(40);
    expect(segments.join('')).toBe(PROSE);
  });

  it('emits an ANSI session line byte-identical, one segment, whatever the caller width', () => {
    const { handler, emits } = buildHandler(doorScreenWidth({ petsciiMode: false, screenWidth: 40 }, 80));
    serialOutput(handler, PROSE);
    expect(emits.join('').replace(/\r?\n$/, '')).toBe(PROSE);
  });
});
```

Create `web/backend/tests/xim/door-launch-passes-petscii-session.test.ts` (the launch literal and the fallback copy are inside a 3000-line handler and a 4000-line class that cannot be constructed in a unit test; these are source pins, labelled as such, and the runtime proof for the answer itself is the bbs-info test above):

```ts
/**
 * SOURCE PINS (not runtime proofs - launchAmigaDoor and DoorMessageHandler
 * are not unit-constructible). They hold the two edit sites that feed the
 * runtime-tested doorScreenWidth() answer:
 *  - door.handler.ts launchAmigaDoor passes petsciiMode + screenWidth into
 *    the 68K bbsSession and derives lineWrap through doorScreenWidth().
 *  - DoorMessageHandler's fallback BB_SCRWIDTH no longer writes a literal 80.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../src', p), 'utf8');

describe('door launch hands the 68K session its PETSCII width', () => {
  it('launchAmigaDoor derives lineWrap from doorScreenWidth and passes petsciiMode + screenWidth', () => {
    const src = read('handlers/door.handler.ts');
    const literal = src.slice(src.indexOf('const amigaSession = new AmigaDoorSession(socket, {'), src.indexOf('[launchAmigaDoor] bbsSession.currentConference='));
    expect(literal).toContain('lineWrap: doorScreenWidth(session, terminalWidth),');
    expect(literal).toContain('petsciiMode: session.petsciiMode === true,');
    expect(literal).toContain('screenWidth: session.screenWidth,');
    expect(literal).not.toContain('lineWrap: terminalWidth,');
  });

  it('DoorMessageHandler fallback BB_SCRWIDTH answers through doorScreenWidth, never a literal 80', () => {
    const src = read('amiga-emulation/session/DoorMessageHandler.ts');
    const start = src.indexOf('case XIMCommand.BB_SCRWIDTH:');
    const block = src.slice(start, src.indexOf('case XIMCommand.BB_SCRHEIGHT:', start));
    expect(block).toContain('doorScreenWidth(this.config.bbsSession)');
    expect(block).not.toContain('MESSAGE_DATA_OFFSET, 80)');
  });
});
```

- [ ] **Step 6: RED.** `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/xim/bb-scrwidth-answers-session-width.test.ts tests/xim/petscii-door-linewrap.test.ts tests/xim/door-launch-passes-petscii-session.test.ts` -> expected: bb-scrwidth: `Expected: 40, Received: 80` (two tests) and a TypeScript-level complaint is NOT expected (swc does not type-check; `petsciiMode` on `BBSSessionData` fails only under `tsc`); linewrap: the PETSCII case passes already (io.ts already wraps at `state.lineWrap`) - this file is a pin, record that; door-launch: both source pins fail.

- [ ] **Step 7: Implement**

`web/backend/src/amiga-emulation/xim/types.ts` - after line 349 `  lineWrap?: number;` insert:

```ts
  petsciiMode?: boolean;  // C64 caller: BB_SCRWIDTH and lineWrap answer with screenWidth (xim/screen-width.util.ts)
  screenWidth?: number;   // Session terminal width (index.ts BBSSession.screenWidth); 40 for a C64
```

`web/backend/src/amiga-emulation/xim/bbs-info.ts` - after line 24 `import { debugLog } from '../../utils/debug-log';` add:

```ts
import { doorScreenWidth } from './screen-width.util';
```

and replace lines 372-375 with:

```ts
      case XIMCommand.BB_SCRWIDTH:
        // express.e:3865-3866: msg.data:=screen.width. 80 for every ANSI
        // caller (byte-identical to before); the session width for a C64.
        value = doorScreenWidth(this.bbsSession);
debugLog(`  BB_SCRWIDTH: ${value}`);
        break;
```

`web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` - after line 10 `import { DoorConfig, DoorConstants, AEDoorCommand } from "../DoorTypes.js";` add:

```ts
import { doorScreenWidth } from "../xim/screen-width.util";
```

and replace lines 2066-2070 with:

```ts
      case XIMCommand.BB_SCRWIDTH:
        // express.e:3865-3866: msg.data:=screen.width - the same answer as xim/bbs-info.ts
        {
          const screenWidth = doorScreenWidth(this.config.bbsSession);
debugLog(`[DoorMessageHandler]   BB_SCRWIDTH: ${screenWidth}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, screenWidth);
        }
        break;
```

`web/backend/src/handlers/door.handler.ts` - after line 13 `import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';` add:

```ts
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';
```

and replace line 824 `        lineWrap: terminalWidth,` with:

```ts
        // PETSCII callers wrap at their own width (40) whatever tempData.termWidth
        // still says from before the P answer; everyone else keeps terminalWidth.
        lineWrap: doorScreenWidth(session, terminalWidth),
        petsciiMode: session.petsciiMode === true,
        screenWidth: session.screenWidth,
```

- [ ] **Step 8: GREEN + type-check + full suite.** Re-run the Step 6 command (all green), then `cd web/backend && npx tsc --noEmit` (clean), then `cd web/backend && npm test` - a full-suite pass is the 80-column no-change proof for every existing `BB_SCRWIDTH` / `lineWrap` consumer. RED proof: `git checkout -- web/backend/src/amiga-emulation/xim/bbs-info.ts` temporarily, re-run the bb-scrwidth test (two failures), restore with `git checkout` of the edited version from the scratchpad copy you saved first (`cp` the file to the scratchpad before reverting).

- [ ] **Step 9: Commit**

```bash
git diff --cached --stat   # must be empty or only your files
git add web/backend/src/amiga-emulation/xim/screen-width.util.ts \
  web/backend/src/amiga-emulation/xim/types.ts \
  web/backend/src/amiga-emulation/xim/bbs-info.ts \
  web/backend/src/amiga-emulation/session/DoorMessageHandler.ts \
  web/backend/src/handlers/door.handler.ts \
  web/backend/tests/amiga-emulation/helpers/mem-stub.ts \
  web/backend/tests/xim/door-screen-width.test.ts \
  web/backend/tests/xim/bb-scrwidth-answers-session-width.test.ts \
  web/backend/tests/xim/petscii-door-linewrap.test.ts \
  web/backend/tests/xim/door-launch-passes-petscii-session.test.ts
git diff --cached --stat
git commit -m "feat(xim): BB_SCRWIDTH and lineWrap answer the session width for PETSCII callers - ANSI callers byte-identical at 80"
```

---

### Task 2: Phase 1 - frame types and `FrameReconstructor` core (grid, cursor motion, text, CR/LF/BS/TAB, deferred wrap, scroll)

**Files:**
- Create: `sdk/petscii/frame/types.ts`, `sdk/petscii/frame/ansi-screen.ts`
- Test: `sdk/tests/petscii/frame/ansi-screen.test.ts`

**Interfaces:**
- Produces: `types.ts` - `Cell`, `Cursor`, `Frame`, `DEFAULT_FG = 1`, `DEFAULT_BG = 6`, `blankCell(): Cell`, `cloneCell(c): Cell`, `sameCell(a, b): boolean`, `isBlank(c): boolean`, `padRow(cells: Cell[], cols: number): Cell[]`, `makeFrame(cols, rows, cells?: Cell[][], cursor?: Cursor): Frame`, `textToFrame(lines: string[], cols = 80, rows = 25): Frame`, `frameText(frame: Frame): string[]`.
- Produces: `ansi-screen.ts` - `class FrameReconstructor { constructor(opts?: { cols?: number; rows?: number; palette?: readonly string[] }); readonly cols; readonly rows; write(text: string): void; snapshot(): Frame; dirtyRows(): number[]; reset(): void; get cursor(): Cursor }`.
- Consumes: `sgrColorToVic`, `nearestVicForRgb`, `xterm256ToRgb` from `../ansi-to-petscii` (all already exported at ansi-to-petscii.ts:60-98 - no export change needed); `C64_PALETTE_COLODORE` from `../c64-palette`.

- [ ] **Step 1: Write the failing core tests**

Create `sdk/tests/petscii/frame/ansi-screen.test.ts`:

```ts
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { Frame } from '../../../petscii/frame/types';

const text = (f: Frame, y: number) => f.cells[y].map((c) => c.ch).join('').replace(/ +$/, '');
const at = (f: Frame, x: number, y: number) => f.cells[y][x];
function run(...chunks: string[]) {
  const r = new FrameReconstructor();
  for (const c of chunks) r.write(c);
  return { r, f: r.snapshot() };
}

describe('FrameReconstructor geometry', () => {
  it('is 80x25 by default, blank, cursor home, white on blue', () => {
    const { f } = run('');
    expect([f.cols, f.rows]).toEqual([80, 25]);
    expect(f.cells.length).toBe(25);
    expect(f.cells.every((row) => row.length === 80)).toBe(true);
    expect(f.cursor).toEqual({ x: 0, y: 0 });
    expect(at(f, 0, 0)).toEqual({ ch: ' ', fg: 1, bg: 6, bold: false, rvs: false });
  });

  it('takes a configurable size', () => {
    const r = new FrameReconstructor({ cols: 40, rows: 25 });
    r.write('x'.repeat(41));
    const f = r.snapshot();
    expect(text(f, 0)).toBe('x'.repeat(40));
    expect(text(f, 1)).toBe('x');
  });
});

describe('FrameReconstructor text and line control', () => {
  it('prints text and advances the cursor', () => {
    const { f } = run('Hello');
    expect(text(f, 0)).toBe('Hello');
    expect(f.cursor).toEqual({ x: 5, y: 0 });
  });

  it('CRLF, lone LF and lone CR: LF is column 0 of the next row (Amiga CON: and the transducer agree), CR overwrites in place', () => {
    expect(text(run('a\r\nb').f, 1)).toBe('b');
    expect(text(run('a\nb').f, 1)).toBe('b');
    const { f } = run('abc\rX');
    expect(text(f, 0)).toBe('Xbc');
    expect(f.cursor).toEqual({ x: 1, y: 0 });
  });

  it('backspace moves left without erasing; tab goes to the next 8-column stop and stops at column 79', () => {
    const { f } = run('ab\bX');
    expect(text(f, 0)).toBe('aX');
    expect(run('abc\tZ').f.cursor).toEqual({ x: 9, y: 0 });
    const { f: g } = run('\x1b[78G\t\tQ');
    expect(at(g, 79, 0).ch).toBe('Q');
  });

  it('ignores other control bytes and DEL', () => {
    const { f } = run('a\x07\x00\x7fb');
    expect(text(f, 0)).toBe('ab');
  });
});

describe('FrameReconstructor deferred wrap (xterm semantics, not the KERNAL)', () => {
  it('printing into column 79 holds the cursor there; the NEXT printable lands at column 0 of the row below', () => {
    const { r } = run('a'.repeat(80));
    expect(r.cursor).toEqual({ x: 79, y: 0 });
    r.write('b');
    const f = r.snapshot();
    expect(at(f, 0, 1).ch).toBe('b');
    expect(f.cursor).toEqual({ x: 1, y: 1 });
  });

  it('a newline while the wrap is pending does not eat a blank row (80-wide lines)', () => {
    const { f } = run('a'.repeat(80) + '\r\n' + 'X');
    expect(at(f, 0, 1).ch).toBe('X');
    expect(text(f, 2)).toBe('');
  });

  it('a 100-character line wraps onto the next row', () => {
    const { f } = run('c'.repeat(100));
    expect(text(f, 0)).toBe('c'.repeat(80));
    expect(text(f, 1)).toBe('c'.repeat(20));
    expect(f.cursor).toEqual({ x: 20, y: 1 });
  });

  it('any cursor movement settles the pending wrap', () => {
    const { r } = run('a'.repeat(80));
    r.write('\x1b[DZ');
    const f = r.snapshot();
    expect(at(f, 78, 0).ch).toBe('Z');
    expect(at(f, 0, 1).ch).toBe(' ');
  });
});

describe('FrameReconstructor scrolling', () => {
  it('scrolls when a newline leaves the bottom row; the top row is lost', () => {
    const lines = Array.from({ length: 26 }, (_, i) => `L${i}`);
    const { f } = run(lines.join('\r\n'));
    expect(text(f, 0)).toBe('L1');
    expect(text(f, 23)).toBe('L24');
    expect(text(f, 24)).toBe('L25');
    expect(f.cursor).toEqual({ x: 3, y: 24 });
  });

  it('a wrap on the bottom row scrolls too', () => {
    const { f } = run('\x1b[25;1H' + 'w'.repeat(81));
    expect(text(f, 23)).toBe('w'.repeat(80));
    expect(text(f, 24)).toBe('w');
  });
});

describe('FrameReconstructor cursor addressing', () => {
  it('CUP / HVP are 1-based and clamp to the grid', () => {
    expect(run('\x1b[5;10H').f.cursor).toEqual({ x: 9, y: 4 });
    expect(run('\x1b[5;10f').f.cursor).toEqual({ x: 9, y: 4 });
    expect(run('\x1b[100;200H').f.cursor).toEqual({ x: 79, y: 24 });
    expect(run('\x1b[H').f.cursor).toEqual({ x: 0, y: 0 });
    expect(run('\x1b[;5H').f.cursor).toEqual({ x: 4, y: 0 });
  });

  it('CUU/CUD/CUF/CUB default to 1 and clamp; CHA and VPA set one axis', () => {
    expect(run('\x1b[10;10H\x1b[3A').f.cursor).toEqual({ x: 9, y: 6 });
    expect(run('\x1b[A').f.cursor).toEqual({ x: 0, y: 0 });
    expect(run('\x1b[30B').f.cursor).toEqual({ x: 0, y: 24 });
    expect(run('\x1b[5C').f.cursor).toEqual({ x: 5, y: 0 });
    expect(run('\x1b[200C').f.cursor).toEqual({ x: 79, y: 0 });
    expect(run('\x1b[5C\x1b[2D').f.cursor).toEqual({ x: 3, y: 0 });
    expect(run('\x1b[12G').f.cursor).toEqual({ x: 11, y: 0 });
    expect(run('\x1b[7d').f.cursor).toEqual({ x: 0, y: 6 });
  });

  it('CNL / CPL move to column 0 of another row', () => {
    expect(run('abc\x1b[2E').f.cursor).toEqual({ x: 0, y: 2 });
    expect(run('\x1b[5;5H\x1b[F').f.cursor).toEqual({ x: 0, y: 3 });
  });

  it('holds a partial escape across writes', () => {
    const { f } = run('\x1b[', '5;5HX');
    expect(at(f, 4, 4).ch).toBe('X');
  });
});

describe('FrameReconstructor snapshots', () => {
  it('snapshot is an immutable copy: later writes do not change it', () => {
    const r = new FrameReconstructor();
    r.write('one');
    const first = r.snapshot();
    r.write('\rtwo');
    expect(text(first, 0)).toBe('one');
    expect(text(r.snapshot(), 0)).toBe('two');
  });

  it('dirtyRows reports rows touched since the last snapshot; a scroll dirties every row', () => {
    const r = new FrameReconstructor();
    r.write('\x1b[4;1Hx');
    expect(r.dirtyRows()).toEqual([3]);
    r.snapshot();
    expect(r.dirtyRows()).toEqual([]);
    r.write('\x1b[25;1H\n');
    expect(r.dirtyRows().length).toBe(25);
  });

  it('reset returns to the power-on frame', () => {
    const r = new FrameReconstructor();
    r.write('\x1b[3;3Hzz');
    r.reset();
    expect(text(r.snapshot(), 2)).toBe('');
    expect(r.cursor).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: RED.** `cd sdk && npx jest tests/petscii/frame/ansi-screen.test.ts` -> `Cannot find module '../../../petscii/frame/ansi-screen'`.

- [ ] **Step 3: Implement the types**

Create `sdk/petscii/frame/types.ts`:

```ts
/**
 * The frame model shared by the reconstructor (ANSI -> 80xN grid), the
 * adapter (80 -> 40 columns) and the diff renderer (40x25 grid -> ANSI for
 * AnsiToPetsciiTransducer). Colours are VIC-II indices 0-15 - the same space
 * the transducer resolves SGR into (sgrColorToVic / nearestVicForRgb) - so a
 * cell's `fg` survives the whole pipeline unchanged.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
export interface Cell {
  /** One printable code point as a string (' ' for blank). Never a control character. */
  ch: string;
  /** Foreground, VIC index 0-15. SGR 0 / 39 resolve to 1 (white), as in the transducer. */
  fg: number;
  /** Background, VIC index 0-15. Recorded so nothing is lost; the C64 has one fixed background (6) and the renderer never emits it. */
  bg: number;
  bold: boolean;
  rvs: boolean;
}

export interface Cursor { x: number; y: number; }

export interface Frame {
  readonly cols: number;
  readonly rows: number;
  /** rows x cols, row-major; every row has exactly `cols` cells. */
  readonly cells: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>;
  readonly cursor: Readonly<Cursor>;
}

export const DEFAULT_FG = 1;
export const DEFAULT_BG = 6;

export function blankCell(): Cell {
  return { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
}

export function cloneCell(c: Readonly<Cell>): Cell {
  return { ch: c.ch, fg: c.fg, bg: c.bg, bold: c.bold, rvs: c.rvs };
}

export function sameCell(a: Readonly<Cell>, b: Readonly<Cell>): boolean {
  return a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.rvs === b.rvs;
}

/** A cell that paints nothing: a plain space that is not reverse video. */
export function isBlank(c: Readonly<Cell>): boolean {
  return c.ch === ' ' && !c.rvs;
}

/** Copy of `cells` cut or padded with blanks to exactly `cols` entries. */
export function padRow(cells: ReadonlyArray<Readonly<Cell>>, cols: number): Cell[] {
  const out = cells.slice(0, cols).map(cloneCell);
  while (out.length < cols) out.push(blankCell());
  return out;
}

export function makeFrame(cols: number, rows: number, cells?: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>, cursor: Cursor = { x: 0, y: 0 }): Frame {
  const grid: Cell[][] = [];
  for (let y = 0; y < rows; y++) grid.push(padRow(cells?.[y] ?? [], cols));
  return { cols, rows, cells: grid, cursor: { x: cursor.x, y: cursor.y } };
}

/** Plain text rows -> frame with default attributes (a fixture helper shared by the tests and the adapter corpus). */
export function textToFrame(lines: ReadonlyArray<string>, cols = 80, rows = 25): Frame {
  const cells = lines.map((line) => Array.from(line).map((ch) => ({ ...blankCell(), ch })));
  return makeFrame(cols, rows, cells);
}

/** Rows as strings with trailing blanks trimmed (debugging and assertions). */
export function frameText(frame: Frame): string[] {
  return frame.cells.map((row) => row.map((c) => c.ch).join('').replace(/ +$/, ''));
}
```

- [ ] **Step 4: Implement the reconstructor (core; erase/SGR/strings are finished in Task 3 but the dispatch skeleton is written here so Task 3 only fills methods)**

Create `sdk/petscii/frame/ansi-screen.ts`:

```ts
/**
 * FrameReconstructor: an ANSI/VT byte stream (what a 68K or blessed door
 * emits for an 80-column terminal) replayed onto a virtual cell grid.
 *
 * This is the ANSI side of the C64 door adapter, so the terminal it models
 * is xterm, not the KERNAL: deferred wrap (printing into the last column
 * holds the cursor there until the next printable), 8-column tab stops,
 * ED/EL/ECH that never move the cursor, alternate screen = clear. The one
 * deliberate Amiga-ism: a lone LF is a newline to column 0 (CON: and the
 * transducer both treat it so, and doors send it meaning that).
 *
 * Parser structure mirrors AnsiToPetsciiTransducer.escape()/csi() so the
 * two stay reviewable side by side: partial escapes are held across
 * write() calls, string sequences (OSC/DCS/APC/PM/SOS) are swallowed with
 * the same 256-byte runaway cap, unknown finals are dropped.
 *
 * Colours resolve into VIC indices at SGR time with the transducer's own
 * tables, so a frame diff-rendered back through the transducer reproduces
 * exactly the colours the transducer would have chosen from the raw stream.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { nearestVicForRgb, sgrColorToVic, xterm256ToRgb } from '../ansi-to-petscii';
import { C64_PALETTE_COLODORE } from '../c64-palette';
import { Cell, Cursor, Frame, DEFAULT_BG, DEFAULT_FG, blankCell, cloneCell } from './types';

const ESC = '\x1b';
/** Same cap as the transducer: a string sequence that lost its terminator is dropped, not held for ever. */
const STRING_SEQUENCE_MAX = 256;

export interface FrameReconstructorOptions {
  cols?: number;
  rows?: number;
  /** VIC-II palette used for truecolor/256-color nearest matching. Defaults to Colodore, like the transducer. */
  palette?: readonly string[];
}

interface Attrs { fg: number; bg: number; bold: boolean; rvs: boolean; }

export class FrameReconstructor {
  readonly cols: number;
  readonly rows: number;
  private readonly palette: readonly string[];
  private grid: Cell[][] = [];
  private x = 0;
  private y = 0;
  private pendingWrap = false;
  private attrs: Attrs = { fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
  private saved: Cursor | null = null;
  private pending = '';
  private dirty = new Set<number>();

  constructor(opts: FrameReconstructorOptions = {}) {
    this.cols = opts.cols ?? 80;
    this.rows = opts.rows ?? 25;
    this.palette = opts.palette ?? C64_PALETTE_COLODORE;
    this.reset();
  }

  get cursor(): Cursor { return { x: this.x, y: this.y }; }

  reset(): void {
    this.grid = [];
    for (let y = 0; y < this.rows; y++) this.grid.push(this.blankRow());
    this.x = 0;
    this.y = 0;
    this.pendingWrap = false;
    this.attrs = { fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
    this.saved = null;
    this.pending = '';
    this.dirty = new Set<number>();
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  /** Immutable copy of the grid and cursor. Clears the dirty set. */
  snapshot(): Frame {
    const cells = this.grid.map((row) => row.map(cloneCell));
    this.dirty.clear();
    return { cols: this.cols, rows: this.rows, cells, cursor: { x: this.x, y: this.y } };
  }

  /** Rows written since the last snapshot(), ascending. */
  dirtyRows(): number[] {
    return Array.from(this.dirty).sort((a, b) => a - b);
  }

  write(text: string): void {
    const s = this.pending + text;
    this.pending = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      const code = s.codePointAt(i) as number;
      if (ch === ESC) {
        const consumed = this.escape(s, i);
        if (consumed === 0) { this.pending = s.slice(i); break; }
        i += consumed;
        continue;
      }
      if (ch === '\r') { this.x = 0; this.pendingWrap = false; i++; continue; }
      if (ch === '\n') { this.newline(); i++; continue; }
      if (code === 0x08) { if (this.x > 0) this.x--; this.pendingWrap = false; i++; continue; }
      if (ch === '\t') { this.pendingWrap = false; this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8); i++; continue; }
      if (code < 0x20 || code === 0x7F) { i++; continue; }
      this.put(String.fromCodePoint(code));
      i += code > 0xFFFF ? 2 : 1;
    }
  }

  // ---- grid ------------------------------------------------------------

  private blankRow(): Cell[] {
    const row: Cell[] = [];
    for (let x = 0; x < this.cols; x++) row.push(blankCell());
    return row;
  }

  private put(ch: string): void {
    if (this.pendingWrap) { this.pendingWrap = false; this.x = 0; this.index(); }
    const cell = this.grid[this.y][this.x];
    cell.ch = ch;
    cell.fg = this.attrs.fg;
    cell.bg = this.attrs.bg;
    cell.bold = this.attrs.bold;
    cell.rvs = this.attrs.rvs;
    this.dirty.add(this.y);
    if (this.x === this.cols - 1) this.pendingWrap = true;
    else this.x++;
  }

  /** Column 0 of the next row, scrolling at the bottom. A pending wrap already reached that row: only the column moves. */
  private newline(): void {
    this.x = 0;
    if (this.pendingWrap) { this.pendingWrap = false; this.index(); return; }
    this.index();
  }

  /** Down one row (column unchanged), scrolling at the bottom - ESC D. */
  private index(): void {
    if (this.y >= this.rows - 1) this.scrollUp();
    else this.y++;
  }

  private scrollUp(): void {
    this.grid.shift();
    this.grid.push(this.blankRow());
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  private scrollDown(): void {
    this.grid.pop();
    this.grid.unshift(this.blankRow());
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  private moveTo(x: number, y: number): void {
    this.pendingWrap = false;
    this.x = Math.max(0, Math.min(this.cols - 1, x));
    this.y = Math.max(0, Math.min(this.rows - 1, y));
  }

  /** Blank columns x0..x1 of row r with default cells; the cursor is not moved (ANSI erase never moves it). */
  private fillRow(r: number, x0: number, x1: number): void {
    const last = Math.min(x1, this.cols - 1);
    for (let x = Math.max(0, x0); x <= last; x++) this.grid[r][x] = blankCell();
    if (last >= x0) this.dirty.add(r);
  }

  private clear(): void {
    for (let y = 0; y < this.rows; y++) this.grid[y] = this.blankRow();
    for (let y = 0; y < this.rows; y++) this.dirty.add(y);
  }

  // ---- escape sequences ------------------------------------------------

  /** Returns chars consumed, or 0 when the sequence is incomplete (caller holds the tail). */
  private escape(s: string, i: number): number {
    const next = s[i + 1];
    if (next === undefined) return 0;
    if (next === '[') {
      let j = i + 2;
      let params = '';
      while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3F) params += s[j++];
      if (j >= s.length) return 0;
      this.csi(params, s[j]);
      return j - i + 1;
    }
    if (next === ']' || next === 'P' || next === '_' || next === '^' || next === 'X') {
      for (let j = i + 2; j < s.length; j++) {
        if (s[j] === '\x07') return j - i + 1;
        if (s[j] === ESC && s[j + 1] === '\\') return j - i + 2;
        if (s[j] === ESC && s[j + 1] === undefined) break;
        if (s[j] === '\r' || s[j] === '\n') return j - i;
      }
      return s.length - i > STRING_SEQUENCE_MAX ? s.length - i : 0;
    }
    if (next === '(' || next === ')' || next === '*' || next === '+') return s[i + 2] === undefined ? 0 : 3;
    if (next === '7') { this.saved = { x: this.x, y: this.y }; return 2; }
    if (next === '8') { if (this.saved) this.moveTo(this.saved.x, this.saved.y); return 2; }
    if (next === 'M') { this.pendingWrap = false; if (this.y > 0) this.y--; else this.scrollDown(); return 2; }
    if (next === 'D') { this.pendingWrap = false; this.index(); return 2; }
    if (next === 'E') { this.newline(); return 2; }
    if (next === 'c') { this.reset(); return 2; }
    return 2; // ESC =, ESC >, ...: nothing to model
  }

  private csi(params: string, final: string): void {
    const isPrivate = params.startsWith('?');
    const nums = (isPrivate ? params.slice(1) : params).split(';').map((p) => (p === '' ? NaN : parseInt(p, 10)));
    const n = (idx: number, dflt: number) => (Number.isNaN(nums[idx]) || nums[idx] === undefined ? dflt : nums[idx]);
    if (isPrivate) {
      // ?47 / ?1049 alternate screen: blessed repaints a full frame on entry and the BBS repaints
      // on exit - a clear + home is the honest model (same call the transducer makes).
      if ((n(0, 0) === 47 || n(0, 0) === 1049) && (final === 'h' || final === 'l')) { this.clear(); this.moveTo(0, 0); }
      return; // ?25 cursor visibility, ?7 autowrap, ?1000-1006 mouse: not modelled
    }
    switch (final) {
      case 'm': return this.sgr(nums.map((v) => (Number.isNaN(v) ? 0 : v)));
      case 'A': return this.moveTo(this.x, this.y - n(0, 1));
      case 'B': return this.moveTo(this.x, this.y + n(0, 1));
      case 'C': return this.moveTo(this.x + n(0, 1), this.y);
      case 'D': return this.moveTo(this.x - n(0, 1), this.y);
      case 'E': return this.moveTo(0, this.y + n(0, 1));
      case 'F': return this.moveTo(0, this.y - n(0, 1));
      case 'G': return this.moveTo(n(0, 1) - 1, this.y);
      case 'd': return this.moveTo(this.x, n(0, 1) - 1);
      case 'H': case 'f': return this.moveTo(n(1, 1) - 1, n(0, 1) - 1);
      case 'J': return this.eraseDisplay(n(0, 0));
      case 'K': return this.eraseLine(n(0, 0));
      case 'X': return this.eraseChars(n(0, 1));
      case 's': this.saved = { x: this.x, y: this.y }; return;
      case 'u': if (this.saved) this.moveTo(this.saved.x, this.saved.y); return;
      default: return; // L M @ P (insert/delete), r (scroll region), S T, n, t, h, l: dropped, as in the transducer
    }
  }

  // Task 3 fills these in; the skeleton keeps Task 2's tests honest about dispatch.
  private sgr(codes: number[]): void { void codes; }
  private eraseDisplay(mode: number): void { void mode; }
  private eraseLine(mode: number): void { void mode; }
  private eraseChars(count: number): void { void count; }
}
```

- [ ] **Step 5: GREEN.** `cd sdk && npx jest tests/petscii/frame/ansi-screen.test.ts` (all pass). Then `cd sdk && npx tsc --noEmit -p tsconfig.json` clean (the `void` stubs keep `noUnusedParameters` quiet if it is ever enabled; they are replaced in Task 3).

- [ ] **Step 6: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/frame/types.ts sdk/petscii/frame/ansi-screen.ts sdk/tests/petscii/frame/ansi-screen.test.ts
git diff --cached --stat
git commit -m "feat(petscii): FrameReconstructor - an 80x25 cell grid replayed from a door's ANSI stream with xterm deferred wrap"
```

---

### Task 3: Phase 1 - `FrameReconstructor` erase, SGR colour resolution, save/restore, alternate screen, string sequences

**Files:**
- Modify: `sdk/petscii/frame/ansi-screen.ts` (replace the four Task 2 stubs; add nothing else)
- Test: `sdk/tests/petscii/frame/ansi-screen-erase-sgr.test.ts`

**Interfaces:** unchanged from Task 2. Consumes `AnsiToPetsciiTransducer` + `PetsciiMachine` in the test only, to pin that SGR resolves into the same VIC index the transducer picks.

- [ ] **Step 1: Write the failing tests**

Create `sdk/tests/petscii/frame/ansi-screen-erase-sgr.test.ts`:

```ts
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { Frame } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';

const text = (f: Frame, y: number) => f.cells[y].map((c) => c.ch).join('').replace(/ +$/, '');
const at = (f: Frame, x: number, y: number) => f.cells[y][x];
function run(...chunks: string[]) {
  const r = new FrameReconstructor();
  for (const c of chunks) r.write(c);
  return { r, f: r.snapshot() };
}
/** Fill 3 rows with letters and park the cursor mid-screen. */
const PAINTED = '\x1b[1;1H' + 'a'.repeat(80) + '\x1b[2;1H' + 'b'.repeat(80) + '\x1b[3;1H' + 'c'.repeat(80) + '\x1b[2;41H';

describe('FrameReconstructor erase (cursor never moves)', () => {
  it('ED 0 clears from the cursor to the end of the screen', () => {
    const { f } = run(PAINTED + '\x1b[J');
    expect(text(f, 0)).toBe('a'.repeat(80));
    expect(text(f, 1)).toBe('b'.repeat(40));
    expect(text(f, 2)).toBe('');
    expect(f.cursor).toEqual({ x: 40, y: 1 });
  });

  it('ED 1 clears from the top through the cursor', () => {
    const { f } = run(PAINTED + '\x1b[1J');
    expect(text(f, 0)).toBe('');
    expect(text(f, 1)).toBe(' '.repeat(41) + 'b'.repeat(39));
    expect(text(f, 2)).toBe('c'.repeat(80));
  });

  it('ED 2 and ED 3 clear everything and keep the cursor where it was', () => {
    for (const seq of ['\x1b[2J', '\x1b[3J']) {
      const { f } = run(PAINTED + seq);
      expect(f.cells.every((row) => row.every((c) => c.ch === ' '))).toBe(true);
      expect(f.cursor).toEqual({ x: 40, y: 1 });
    }
  });

  it('EL 0/1/2 clear to end, from start, whole row', () => {
    expect(text(run(PAINTED + '\x1b[K').f, 1)).toBe('b'.repeat(40));
    expect(text(run(PAINTED + '\x1b[1K').f, 1)).toBe(' '.repeat(41) + 'b'.repeat(39));
    expect(text(run(PAINTED + '\x1b[2K').f, 1)).toBe('');
  });

  it('ECH blanks n cells from the cursor', () => {
    const { f } = run(PAINTED + '\x1b[5X');
    expect(text(f, 1)).toBe('b'.repeat(40) + ' '.repeat(5) + 'b'.repeat(35));
    expect(f.cursor).toEqual({ x: 40, y: 1 });
  });

  it('erase settles a pending wrap: the next printable lands in the erased last column, not on the next row', () => {
    const { r } = run('a'.repeat(80) + '\x1b[K');
    r.write('Z');
    const f = r.snapshot();
    expect(text(f, 0)).toBe('a'.repeat(79) + 'Z');
    expect(at(f, 0, 1).ch).toBe(' ');
  });
});

describe('FrameReconstructor SGR resolves into the VIC index space', () => {
  it('basic colours, bold-before-colour brightens, bold-after-colour does not (resolved at set time, like the transducer)', () => {
    expect(at(run('\x1b[31mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[1;31mX').f, 0, 0).fg).toBe(10);
    expect(at(run('\x1b[31;1mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[91mX').f, 0, 0).fg).toBe(10);
    expect(at(run('\x1b[31m\x1b[39mX').f, 0, 0).fg).toBe(1);
    expect(at(run('\x1b[1;31mX').f, 0, 0).bold).toBe(true);
    expect(at(run('\x1b[1;22;31mX').f, 0, 0).fg).toBe(2);
  });

  it('256-colour and truecolor snap to the nearest Colodore entry', () => {
    expect(at(run('\x1b[38;5;10mX').f, 0, 0).fg).toBe(13);
    expect(at(run('\x1b[38;2;129;51;56mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[48;2;0;0;0mX').f, 0, 0).bg).toBe(0);
  });

  it('backgrounds are consumed into bg and never leak into fg; 49 restores blue', () => {
    const c = at(run('\x1b[44;33mX').f, 0, 0);
    expect(c.bg).toBe(6);
    expect(c.fg).toBe(7);
    expect(at(run('\x1b[41m\x1b[49mX').f, 0, 0).bg).toBe(6);
  });

  it('reverse video is a cell attribute; SGR 0 clears everything', () => {
    const { f } = run('\x1b[7mR\x1b[27mN\x1b[1;31;7mB\x1b[0mP');
    expect(at(f, 0, 0).rvs).toBe(true);
    expect(at(f, 1, 0).rvs).toBe(false);
    expect(at(f, 2, 0)).toMatchObject({ rvs: true, bold: true, fg: 10 });
    expect(at(f, 3, 0)).toEqual({ ch: 'P', fg: 1, bg: 6, bold: false, rvs: false });
  });

  it('a truncated extended colour ends the SGR without treating its tail as a reset', () => {
    expect(at(run('\x1b[31m\x1b[38;2;255;0mX').f, 0, 0).fg).toBe(2);
  });

  it('picks the SAME VIC index the transducer picks for every SGR it understands', () => {
    const sgrs = ['\x1b[30m', '\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m', '\x1b[37m',
      '\x1b[1;30m', '\x1b[1;31m', '\x1b[1;32m', '\x1b[1;33m', '\x1b[1;34m', '\x1b[1;35m', '\x1b[1;36m', '\x1b[1;37m',
      '\x1b[90m', '\x1b[97m', '\x1b[39m', '\x1b[0m', '\x1b[38;5;208m', '\x1b[38;5;244m', '\x1b[38;2;10;200;10m', '\x1b[44;33m'];
    for (const sgr of sgrs) {
      const frame = run(sgr + 'X').f;
      const t = new AnsiToPetsciiTransducer();
      t.transduce(sgr + 'X');
      expect({ sgr, fg: at(frame, 0, 0).fg }).toEqual({ sgr, fg: t.machine.state.colorRam[0] });
    }
  });
});

describe('FrameReconstructor save/restore, alternate screen, strings', () => {
  it('ESC 7 / ESC 8 and CSI s / u save and restore the cursor', () => {
    expect(run('\x1b[5;5H\x1b7\x1b[10;10H\x1b8').f.cursor).toEqual({ x: 4, y: 4 });
    expect(run('\x1b[5;5H\x1b[s\x1b[10;10H\x1b[u').f.cursor).toEqual({ x: 4, y: 4 });
    expect(run('\x1b[3;3H\x1b8').f.cursor).toEqual({ x: 2, y: 2 });
  });

  it('?1049h / ?47l clear the screen and home the cursor', () => {
    for (const seq of ['\x1b[?1049h', '\x1b[?47l', '\x1b[?1049l']) {
      const { f } = run(PAINTED + seq);
      expect(text(f, 0)).toBe('');
      expect(f.cursor).toEqual({ x: 0, y: 0 });
    }
  });

  it('RIS resets the grid and attributes', () => {
    const { f } = run('\x1b[31m' + PAINTED + '\x1bcX');
    expect(text(f, 1)).toBe('');
    expect(at(f, 0, 0)).toEqual({ ch: 'X', fg: 1, bg: 6, bold: false, rvs: false });
  });

  it('OSC / DCS are swallowed through BEL or ST, held across chunks, dropped at the 256-byte cap', () => {
    expect(text(run('\x1b]0;title\x07X').f, 0)).toBe('X');
    expect(text(run('\x1bPq#0\x1b\\Y').f, 0)).toBe('Y');
    expect(text(run('\x1b]0;ti', 'tle\x07Z').f, 0)).toBe('Z');
    const { r } = run('\x1b]' + 'a'.repeat(300));
    r.write('W');
    expect(text(r.snapshot(), 0)).toBe('W');
  });

  it('an unterminated string that hits a newline lets the newline through', () => {
    const { f } = run('\x1b]lost\r\nnext');
    expect(text(f, 1)).toBe('next');
  });

  it('ESC M at the top scrolls the screen down; ESC D indexes; ESC E is a newline', () => {
    const { f } = run('top\x1bMX');
    expect(text(f, 1)).toBe('top');
    expect(at(f, 3, 0).ch).toBe('X');
    expect(run('ab\x1bD').f.cursor).toEqual({ x: 2, y: 1 });
    expect(run('ab\x1bE').f.cursor).toEqual({ x: 0, y: 1 });
  });
});
```

- [ ] **Step 2: RED.** `cd sdk && npx jest tests/petscii/frame/ansi-screen-erase-sgr.test.ts` -> erase tests fail (`Expected: "bbbb...", Received: "bbbb...bbbb"` - nothing erased), SGR tests fail (`fg` stays 1), the transducer-parity test fails on `\x1b[31m`.

- [ ] **Step 3: Implement** - in `sdk/petscii/frame/ansi-screen.ts` replace the four stub lines (`private sgr ... void codes; }` through `private eraseChars ... void count; }`) with:

```ts
  private sgr(codes: number[]): void {
    let p = 0;
    while (p < codes.length) {
      const c = codes[p];
      if (c === 0) { this.attrs = { fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false }; p++; continue; }
      if (c === 1) { this.attrs.bold = true; p++; continue; }
      if (c === 22) { this.attrs.bold = false; p++; continue; }
      if (c === 7) { this.attrs.rvs = true; p++; continue; }
      if (c === 27) { this.attrs.rvs = false; p++; continue; }
      if (c === 38 || c === 48) {
        const mode = codes[p + 1];
        let rgb: [number, number, number] | null = null;
        if (mode === 2 && p + 4 < codes.length) rgb = [codes[p + 2], codes[p + 3], codes[p + 4]];
        else if (mode === 5 && p + 2 < codes.length) rgb = xterm256ToRgb(codes[p + 2], this.palette);
        // Truncated extended colour: the rest of this SGR belongs to it (transducer rule).
        if (!rgb) break;
        const vic = nearestVicForRgb(rgb[0], rgb[1], rgb[2], this.palette);
        if (c === 38) this.attrs.fg = vic; else this.attrs.bg = vic;
        p += mode === 2 ? 5 : 3;
        continue;
      }
      if (c === 49) { this.attrs.bg = DEFAULT_BG; p++; continue; }
      if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) {
        const vic = sgrColorToVic(c - 10, this.attrs.bold);
        if (vic !== null) this.attrs.bg = vic;
        p++;
        continue;
      }
      const vic = sgrColorToVic(c, this.attrs.bold);
      if (vic !== null) this.attrs.fg = vic;
      p++; // 2/3/4/5/24/25 ...: nothing to model
    }
  }

  /** ED: 0 = cursor to end of screen, 1 = top through cursor, 2/3 = everything. Cursor stays. */
  private eraseDisplay(mode: number): void {
    this.pendingWrap = false;
    if (mode === 2 || mode === 3) return this.clear();
    if (mode === 1) {
      for (let r = 0; r < this.y; r++) this.fillRow(r, 0, this.cols - 1);
      this.fillRow(this.y, 0, this.x);
      return;
    }
    this.fillRow(this.y, this.x, this.cols - 1);
    for (let r = this.y + 1; r < this.rows; r++) this.fillRow(r, 0, this.cols - 1);
  }

  /** EL: 0 = cursor to end of row, 1 = start through cursor, 2 = whole row. */
  private eraseLine(mode: number): void {
    this.pendingWrap = false;
    if (mode === 1) this.fillRow(this.y, 0, this.x);
    else if (mode === 2) this.fillRow(this.y, 0, this.cols - 1);
    else this.fillRow(this.y, this.x, this.cols - 1);
  }

  /** ECH: blank `count` cells from the cursor. */
  private eraseChars(count: number): void {
    this.pendingWrap = false;
    this.fillRow(this.y, this.x, this.x + Math.max(1, count) - 1);
  }
```

- [ ] **Step 4: GREEN.** `cd sdk && npx jest tests/petscii/frame` (both files green). RED proof for the commit: temporarily restore the four stubs (`git stash` is forbidden - copy the file to the scratchpad, `git checkout -- sdk/petscii/frame/ansi-screen.ts`, run, then copy back), confirm the new file fails, restore.

- [ ] **Step 5: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/frame/ansi-screen.ts sdk/tests/petscii/frame/ansi-screen-erase-sgr.test.ts
git diff --cached --stat
git commit -m "feat(petscii): FrameReconstructor erase, SGR into VIC indices, save/restore, alternate screen and string sequences"
```

---

### Task 4: Phase 1b - `FrameDiffRenderer` and the oracle round trip

**Files:**
- Create: `sdk/petscii/frame/frame-render.ts`
- Test: `sdk/tests/petscii/frame/frame-render.test.ts`, `sdk/tests/petscii/frame/frame-render-roundtrip.test.ts`

**Interfaces:**
- Produces: `renderDiff(prev: Frame | null, next: Frame, cols = 40, rows = 25, palette: readonly string[] = C64_PALETTE_COLODORE): string`; `renderFrame(frame: Frame, cols = 40, rows = 25, palette?): string` (= `renderDiff(null, frame, ...)`); `cupTo(cursor: Cursor): string`.
- Consumes: `vicToSgrForeground` from `../c64-palette` (exists, c64-palette.ts:36); `Frame`, `isBlank`, `sameCell` from `./types`. Test consumes `AnsiToPetsciiTransducer`, `PetsciiMachine`, `UNICODE_TO_PETSCII`, `printablePetsciiToScreenCode`.

**Design (binding):**
- Output is ANSI shaped for the transducer: `CSI row;col H` + per-run SGR (`27m`/`7m` then `38;2;r;g;b` from the VIC palette entry, so `nearestVicForRgb` returns the same index) + the run's characters. Bold and bg are never emitted (the target has neither).
- First frame (`prev === null` or a size change) = `ESC[2J ESC[H` + every non-blank cell. Diff frame = only cells where `sameCell(prev, next)` is false, including cells that became blank (painted as a space).
- The bottom-right cell (`cols-1, rows-1`) is never painted: printing there scrolls the KERNAL screen (the transducer's `fillRow` has the same cap). The adapter must not put content there; the renderer guarantees it.
- Every render ends with `ESC[0m` + CUP to `next.cursor` (clamped), so prompts sit where the door left them.

- [ ] **Step 1: Write the failing renderer tests**

Create `sdk/tests/petscii/frame/frame-render.test.ts`:

```ts
import { renderDiff, renderFrame, cupTo } from '../../../petscii/frame/frame-render';
import { textToFrame, makeFrame, Frame, Cell } from '../../../petscii/frame/types';

const STRIP = /\x1b\[[0-9;]*[A-Za-z]/g;
const RED = '\x1b[38;2;129;51;56m'; // Colodore VIC 2

function withCell(f: Frame, x: number, y: number, patch: Partial<Cell>): Frame {
  const cells = f.cells.map((row) => row.map((c) => ({ ...c })));
  Object.assign(cells[y][x], patch);
  return makeFrame(f.cols, f.rows, cells, f.cursor);
}

describe('renderFrame (first paint)', () => {
  it('clears, homes, paints only non-blank cells, ends with SGR 0 and the cursor', () => {
    const f = makeFrame(40, 25, textToFrame(['hi', '', '  x'], 40, 25).cells, { x: 3, y: 2 });
    const out = renderFrame(f);
    expect(out.startsWith('\x1b[2J\x1b[H')).toBe(true);
    expect(out.replace(STRIP, '')).toBe('hi' + 'x');
    expect(out.endsWith('\x1b[0m' + cupTo({ x: 3, y: 2 }))).toBe(true);
    expect(out).toContain('\x1b[3;3H\x1b[27m\x1b[38;2;255;255;255mx');   // CUP, reverse off, Colodore white, the glyph
  });

  it('paints a reverse-video space (it is visible) and colours with truecolor from the VIC palette', () => {
    let f = textToFrame(['ab'], 40, 25);
    f = withCell(f, 0, 0, { fg: 2 });
    f = withCell(f, 5, 0, { rvs: true });
    const out = renderFrame(f);
    expect(out).toContain('\x1b[7m');
    expect(out).toContain(RED + 'a');
    expect(out.replace(STRIP, '')).toBe('ab ');
  });

  it('never paints the bottom-right cell', () => {
    const f = withCell(textToFrame([], 40, 25), 39, 24, { ch: 'Q' });
    expect(renderFrame(f).replace(STRIP, '')).toBe('');
  });

  it('refuses a frame that is not the target size', () => {
    expect(() => renderFrame(textToFrame(['x'], 80, 25))).toThrow(RangeError);
  });
});

describe('renderDiff', () => {
  it('an unchanged frame renders only the reset and the cursor', () => {
    const f = textToFrame(['same'], 40, 25);
    expect(renderDiff(f, f)).toBe('\x1b[0m' + cupTo({ x: 0, y: 0 }));
  });

  it('paints only changed cells, addressing each run once, and blanks cells that were erased', () => {
    const a = textToFrame(['hello world'], 40, 25);
    const b = textToFrame(['hello there'], 40, 25);
    const out = renderDiff(a, b);
    expect(out.replace(STRIP, '')).toBe('there');
    expect(out).toContain('\x1b[1;7H');
    const c = textToFrame(['hello'], 40, 25);
    expect(renderDiff(b, c).replace(STRIP, '')).toBe(' '.repeat(5));   // 't','h','e','r','e' -> blanks; the space at column 5 was already a space
  });

  it('a colour-only change is a change', () => {
    const a = textToFrame(['x'], 40, 25);
    const b = withCell(a, 0, 0, { fg: 2 });
    expect(renderDiff(a, b)).toContain(RED + 'x');
  });

  it('a size change falls back to a full paint', () => {
    const a = textToFrame(['x'], 40, 24);
    const b = textToFrame(['x'], 40, 25);
    expect(renderDiff(a, b).startsWith('\x1b[2J')).toBe(true);
  });

  it('cupTo is 1-based and clamps into 40x25', () => {
    expect(cupTo({ x: 0, y: 0 })).toBe('\x1b[1;1H');
    expect(cupTo({ x: 99, y: 99 })).toBe('\x1b[25;40H');
  });
});
```

- [ ] **Step 2: RED.** `cd sdk && npx jest tests/petscii/frame/frame-render.test.ts` -> `Cannot find module '../../../petscii/frame/frame-render'`.

- [ ] **Step 3: Implement**

Create `sdk/petscii/frame/frame-render.ts`:

```ts
/**
 * FrameDiffRenderer: a 40x25 target frame -> the minimal ANSI that makes
 * AnsiToPetsciiTransducer paint it. Cursor-address each run of changed
 * cells, set colour/reverse only when they change inside the run, print
 * the characters. The transducer dedups every colour/reverse byte against
 * its KERNAL oracle, so repeating an SGR at the start of a run costs
 * nothing on the wire while keeping every run self-contained.
 *
 * First frame (no previous, or a size change): clear + home + every
 * non-blank cell. Bold and background are never emitted - the C64 has
 * neither; foreground goes out as truecolor from the VIC palette entry so
 * nearestVicForRgb() lands on the same index (the round-trip test pins it).
 *
 * The bottom-right cell is never painted: a print there scrolls the KERNAL
 * screen (the transducer's fillRow has the same cap). Every render ends
 * with SGR 0 and a CUP to the frame's cursor.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { C64_PALETTE_COLODORE, vicToSgrForeground } from '../c64-palette';
import { Cell, Cursor, Frame, isBlank, sameCell } from './types';

const TARGET_COLS = 40;
const TARGET_ROWS = 25;

export function cupTo(cursor: Readonly<Cursor>, cols = TARGET_COLS, rows = TARGET_ROWS): string {
  const x = Math.max(0, Math.min(cols - 1, cursor.x));
  const y = Math.max(0, Math.min(rows - 1, cursor.y));
  return `\x1b[${y + 1};${x + 1}H`;
}

function sgrFor(c: Readonly<Cell>, palette: readonly string[]): string {
  return (c.rvs ? '\x1b[7m' : '\x1b[27m') + vicToSgrForeground(c.fg, palette);
}

export function renderDiff(
  prev: Frame | null,
  next: Frame,
  cols = TARGET_COLS,
  rows = TARGET_ROWS,
  palette: readonly string[] = C64_PALETTE_COLODORE,
): string {
  if (next.cols !== cols || next.rows !== rows) {
    throw new RangeError(`renderDiff: frame is ${next.cols}x${next.rows}, target is ${cols}x${rows}`);
  }
  const full = prev === null || prev.cols !== cols || prev.rows !== rows;
  const needsPaint = (x: number, y: number): boolean => {
    const c = next.cells[y][x];
    return full ? !isBlank(c) : !sameCell((prev as Frame).cells[y][x], c);
  };
  let out = full ? '\x1b[2J\x1b[H' : '';
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (x === cols - 1 && y === rows - 1) break;   // the cell that scrolls the C64
      if (!needsPaint(x, y)) { x++; continue; }
      const start = x;
      let run = '';
      let state: { fg: number; rvs: boolean } | null = null;
      while (x < cols && needsPaint(x, y) && !(x === cols - 1 && y === rows - 1)) {
        const c = next.cells[y][x];
        if (!state || state.fg !== c.fg || state.rvs !== c.rvs) { run += sgrFor(c, palette); state = { fg: c.fg, rvs: c.rvs }; }
        run += c.ch;
        x++;
      }
      out += `\x1b[${y + 1};${start + 1}H` + run;
    }
  }
  return out + '\x1b[0m' + cupTo(next.cursor, cols, rows);
}

export function renderFrame(frame: Frame, cols = TARGET_COLS, rows = TARGET_ROWS, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  return renderDiff(null, frame, cols, rows, palette);
}
```

- [ ] **Step 4: GREEN** for `frame-render.test.ts`.

- [ ] **Step 5: Write the failing oracle round-trip test** (this proves the whole target pipeline: frame -> ANSI -> transducer -> machine equals the frame)

Create `sdk/tests/petscii/frame/frame-render-roundtrip.test.ts`:

```ts
/**
 * The pipeline the adapter feeds: Frame -> renderDiff -> AnsiToPetsciiTransducer
 * -> PetsciiMachine. The machine's screen codes and colour RAM must equal the
 * frame's cells - for the first paint and for every diff after it.
 */
import { renderDiff } from '../../../petscii/frame/frame-render';
import { textToFrame, makeFrame, Frame, Cell, blankCell } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../../petscii/petscii-machine';
import { UNICODE_TO_PETSCII } from '../../../petscii/unicode-to-petscii';
import { printablePetsciiToScreenCode } from '../../../petscii/screen-codes';

/** Screen code (bank 1, no reverse bit) the transducer prints for `ch`, or null when it substitutes. */
function expectedScreenCode(ch: string): number | null {
  const code = ch.codePointAt(0) as number;
  if (code >= 0x61 && code <= 0x7A) return 0x01 + (code - 0x61);
  if (code >= 0x41 && code <= 0x5A) return 0x41 + (code - 0x41);
  if ((code >= 0x20 && code <= 0x3F) || code === 0x40 || code === 0x5B || code === 0x5D) return printablePetsciiToScreenCode(code);
  const mapped = UNICODE_TO_PETSCII.get(ch);
  return typeof mapped === 'number' ? printablePetsciiToScreenCode(mapped) : null;
}

function assertMachineShowsFrame(m: PetsciiMachine, f: Frame) {
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 40; x++) {
      if (x === 39 && y === 24) continue;
      const c = f.cells[y][x];
      const idx = y * 40 + x;
      const sc = expectedScreenCode(c.ch);
      expect(sc).not.toBeNull();
      expect({ x, y, sc: m.state.screen[idx] }).toEqual({ x, y, sc: (sc as number) | (c.rvs ? 0x80 : 0) });
      if (c.ch !== ' ' || c.rvs) expect({ x, y, fg: m.state.colorRam[idx] }).toEqual({ x, y, fg: c.fg });
    }
  }
  expect([m.state.cursorX, m.state.cursorY]).toEqual([f.cursor.x, f.cursor.y]);
}

function colourful(): Frame {
  const boxed = (s: string) => '│' + s.padEnd(38) + '│';
  const lines = [
    'Menu of the day: [A]bout [B]ulletins [Q]',
    '┌' + '─'.repeat(38) + '┐',
    boxed(' handle  calls  ratio   last on'),
    boxed(' Sysop   1234   1:3     Thu 02-Sep-26'),
    '└' + '─'.repeat(38) + '┘',
    'the quick brown fox jumps over the lazy',
    '',
    'Press RETURN:',
  ];
  const cells: Cell[][] = lines.map((line, y) => Array.from(line).map((ch, x) => ({
    ...blankCell(), ch, fg: (x + y) % 16, rvs: y === 3 && x > 0 && x < 39, bold: y === 0,
  })));
  return makeFrame(40, 25, cells, { x: 13, y: 7 });
}

describe('frame -> ANSI -> transducer -> machine', () => {
  it('first paint reproduces every cell, colour and reverse bit, and parks the cursor', () => {
    const f = colourful();
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, f)));
    assertMachineShowsFrame(m, f);
  });

  it('a diff after the first paint brings the machine to the new frame with the same transducer', () => {
    const a = colourful();
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, a)));
    const cells = a.cells.map((row) => row.map((c) => ({ ...c })));
    cells[3][9] = { ...blankCell(), ch: '9', fg: 7, rvs: true };
    for (let x = 0; x < 40; x++) cells[5][x] = blankCell();
    Array.from('Bye').forEach((ch, x) => { cells[7][x] = { ...blankCell(), ch, fg: 5 }; });
    for (let x = 3; x < 13; x++) cells[7][x] = blankCell();
    const b = makeFrame(40, 25, cells, { x: 3, y: 7 });
    m.feed(t.transduce(renderDiff(a, b)));
    assertMachineShowsFrame(m, b);
  });

  it('an identical frame sends no printable byte', () => {
    const f = colourful();
    const t = new AnsiToPetsciiTransducer();
    t.transduce(renderDiff(null, f));
    const bytes = Array.from(t.transduce(renderDiff(f, f)));
    // PETSCII printables are $20-$7F and $A0-$FF; everything else is a control byte (colour, reverse, cursor, HOME).
    expect(bytes.filter((b) => (b >= 0x20 && b < 0x80) || b >= 0xA0)).toEqual([]);
  });

  it('content at (39,24) never scrolls the machine', () => {
    const f = textToFrame(['top', ...Array(23).fill(''), ' '.repeat(39) + 'Q'], 40, 25);
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, f)));
    expect(m.state.screen[0]).toBe(expectedScreenCode('t'));
    expect(m.state.screen[24 * 40 + 39]).toBe(0x20);
  });
});
```

- [ ] **Step 6: RED then GREEN.** Run `cd sdk && npx jest tests/petscii/frame/frame-render-roundtrip.test.ts`. Expected on a correct Task 3+4: green on the first run. If a cell mismatches, the failing `{x, y, sc}` names it - fix the renderer or the reconstructor, never the assertion. (The most likely trap: forgetting that the transducer's `moveTo` clears its `pendingWrap` only on explicit moves - every run is CUP-addressed, so it cannot fire; if it does, the CUP is missing.)

- [ ] **Step 7: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/frame/frame-render.ts sdk/tests/petscii/frame/frame-render.test.ts sdk/tests/petscii/frame/frame-render-roundtrip.test.ts
git diff --cached --stat
git commit -m "feat(petscii): FrameDiffRenderer - minimal ANSI for the transducer, proven cell-for-cell through the KERNAL oracle"
```

---

### Task 5: Phase 2 - row classification in the SDK (`classify.ts`), pinned equal to the backend heuristics

**Decision (wrap/classify home):** the backend cannot be imported from the SDK, and the SDK's `./petscii` package export is claimed by the full-canvas run, so the backend cannot import the frame module yet either. The heuristics are PORTED verbatim into `sdk/petscii/frame/classify.ts` (same function names, same regexes), and a backend test pins the two copies equal over a shared string table plus every fixture line (extended in Task 7). When Phase 3 adds the `./petscii/frame` export, `web/backend/src/utils/ascii-art.util.ts` becomes a re-export and the parity test collapses to one import - that switch is Phase 3 work, recorded in the handoff.

**Files:**
- Create: `sdk/petscii/frame/classify.ts`
- Test: `sdk/tests/petscii/frame/classify.test.ts`, `web/backend/tests/petscii-frame/classify-parity.test.ts`

**Interfaces:**
- Produces: `positionsCursorAbsolutely(line: string): boolean`, `looksLikeAsciiArt(line: string): boolean` (verbatim ports), `rowText(cells: ReadonlyArray<Readonly<Cell>>): string` (chars joined, trailing blanks trimmed), `contentWidth(cells): number` (1 + index of the last non-blank cell, 0 for a blank row), `hasTabularGutters(text: string): boolean` (2+ runs of >= 2 spaces inside the trimmed text), `RowClass = 'blank' | 'art' | 'table' | 'prose'`, `classifyRow(cells): RowClass`.
- Consumes: `Cell`, `isBlank` from `./types`.

- [ ] **Step 1: Write the failing SDK tests**

Create `sdk/tests/petscii/frame/classify.test.ts`:

```ts
import { looksLikeAsciiArt, positionsCursorAbsolutely, hasTabularGutters, classifyRow, contentWidth, rowText } from '../../../petscii/frame/classify';
import { textToFrame } from '../../../petscii/frame/types';

const row = (s: string) => textToFrame([s], 80, 1).cells[0];

describe('looksLikeAsciiArt (port of web/backend/src/utils/ascii-art.util.ts)', () => {
  it('whitespace, pure symbols, deep indent and heavy punctuation are art', () => {
    expect(looksLikeAsciiArt('')).toBe(true);
    expect(looksLikeAsciiArt('   ')).toBe(true);
    expect(looksLikeAsciiArt('---')).toBe(true);
    expect(looksLikeAsciiArt('+-+-+')).toBe(true);
    expect(looksLikeAsciiArt(' '.repeat(33) + 'text')).toBe(true);
    expect(looksLikeAsciiArt('    -|-')).toBe(true);
    expect(looksLikeAsciiArt('.------------------------------------..--------------------------------------.')).toBe(true);
    expect(looksLikeAsciiArt('|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|')).toBe(true);
  });

  it('ordinary prose and help rows are not art', () => {
    expect(looksLikeAsciiArt('Below are the available AmiExpress commands with brief descriptions.')).toBe(false);
    expect(looksLikeAsciiArt('Enter command you want HELP with [press <RETURN> to quit]->')).toBe(false);
    expect(looksLikeAsciiArt('files   browse a door\'s own files on disk')).toBe(false);
  });
});

describe('positionsCursorAbsolutely (port)', () => {
  it('matches CUP/HVP/CUU-CUB/CHA/VPA/CNL/CPL and bare home, not SGR', () => {
    expect(positionsCursorAbsolutely('\x1b[9;3Hfiles')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[5;1f-')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[3AX')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[HX')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[0;37;40mplain')).toBe(false);
    expect(positionsCursorAbsolutely('')).toBe(false);
  });
});

describe('hasTabularGutters', () => {
  it('needs two runs of two or more spaces inside the text', () => {
    expect(hasTabularGutters('?   - Show the current conf menu  B   - Bulletins')).toBe(true);
    expect(hasTabularGutters('| Handle: Sysop                      || Location: Local Console              |')).toBe(true);
    expect(hasTabularGutters('one  gap only')).toBe(false);
    expect(hasTabularGutters('   leading and trailing spaces do not count   ')).toBe(false);
  });
});

describe('classifyRow', () => {
  it('blank / art / table / prose', () => {
    expect(classifyRow(row(''))).toBe('blank');
    expect(classifyRow(row('==============================================================================='))).toBe('art');
    expect(classifyRow(row('Sysop            Local Console              1234 calls   ratio 1:3'))).toBe('table');
    expect(classifyRow(row('?   - Show the current conf menu  B   - Bulletins'))).toBe('table');
    expect(classifyRow(row('Below are the available AmiExpress commands with brief descriptions.'))).toBe('prose');
  });

  it('the ported heuristics call most colon-labelled stat rows ART (indent >= 4 with 2 symbols, or 2 long gaps with 3 symbols) - so they split, not gutter; a pack pins better', () => {
    expect(classifyRow(row('      uSeR nAME: Sysop                  dOWNLoADeD tODaY: 0 bYTeS'))).toBe('art');
    expect(classifyRow(row('  ND#/Calls    User/PhoneNumber                Location/Action'))).toBe('art');
  });

  it('a reverse-video space is content, not blank', () => {
    const cells = row('');
    (cells[3] as any).rvs = true;
    expect(classifyRow(cells)).not.toBe('blank');
    expect(contentWidth(cells)).toBe(4);
  });

  it('rowText and contentWidth trim trailing blanks only', () => {
    expect(rowText(row('  ab  '))).toBe('  ab');
    expect(contentWidth(row('  ab  '))).toBe(4);
    expect(contentWidth(row(''))).toBe(0);
  });
});
```

- [ ] **Step 2: RED.** `cd sdk && npx jest tests/petscii/frame/classify.test.ts` -> module missing.

- [ ] **Step 3: Implement**

Create `sdk/petscii/frame/classify.ts`:

```ts
/**
 * Row classification for the C64 adapter's rule ladder.
 *
 * `looksLikeAsciiArt` and `positionsCursorAbsolutely` are VERBATIM ports of
 * web/backend/src/utils/ascii-art.util.ts (the backend cannot be imported
 * from the SDK). web/backend/tests/petscii-frame/classify-parity.test.ts
 * pins the two copies equal; when the frame module gains a package export
 * (Phase 3) the backend file becomes a re-export of this one.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { Cell, isBlank } from './types';

export type RowClass = 'blank' | 'art' | 'table' | 'prose';

/** CUP/HVP, cursor up/down/forward/back, column and line positioning, bare home. SGR deliberately not matched. */
export function positionsCursorAbsolutely(line: string): boolean {
  return /\x1b\[[0-9;]*[HfABCDGdEF]/.test(line);
}

export function looksLikeAsciiArt(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const letters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const digits = (trimmed.match(/[0-9]/g) || []).length;
  const nonAlphanumeric = trimmed.length - letters - digits;
  const punctuationRatio = nonAlphanumeric / trimmed.length;
  const symbolMatch = trimmed.match(/[:\-_/\\|=+*~`@#%^&\[\]\(\)<>]/g);
  const symbolCount = symbolMatch ? symbolMatch.length : 0;
  const leadingIndent = line.match(/^\s+/)?.[0].length || 0;

  if (leadingIndent >= 33) {
    return true;
  }

  if (letters + digits === 0 && nonAlphanumeric > 0) {
    return true;
  }

  if (punctuationRatio >= 0.6 && trimmed.length >= 4) {
    return true;
  }

  if (symbolCount >= 3 && (letters + digits) / trimmed.length < 0.4) {
    return true;
  }

  if (leadingIndent >= 4 && symbolCount >= 2) {
    return true;
  }

  const longSpaceRuns = (line.match(/\s{4,}/g) || []).length;
  if (longSpaceRuns >= 2 && symbolCount >= 3) {
    return true;
  }

  const artChars = (line.match(/[|_\/\\\-()]/g) || []).length;
  if (artChars >= 8 && letters + digits < trimmed.length * 0.8) {
    return true;
  }

  const borderArt = /^[|:][\s\S]*[:|]$/.test(trimmed);
  if (borderArt && symbolCount >= 2) {
    return true;
  }

  const borderedLine =
    trimmed.length >= 20 &&
    trimmed.startsWith('|') &&
    trimmed.endsWith('|') &&
    trimmed.split('|').length >= 3 &&
    symbolCount >= 4;
  if (borderedLine) {
    return true;
  }

  return false;
}

/** Characters of a row, trailing blanks trimmed. A reverse-video space is content and is kept. */
export function rowText(cells: ReadonlyArray<Readonly<Cell>>): string {
  return cells.slice(0, contentWidth(cells)).map((c) => c.ch).join('');
}

/** 1 + index of the last non-blank cell; 0 for an empty row. */
export function contentWidth(cells: ReadonlyArray<Readonly<Cell>>): number {
  for (let x = cells.length - 1; x >= 0; x--) if (!isBlank(cells[x])) return x + 1;
  return 0;
}

/** Two or more runs of two-plus spaces INSIDE the text: columns separated by gutters. */
export function hasTabularGutters(text: string): boolean {
  return (text.trim().match(/ {2,}/g) || []).length >= 2;
}

export function classifyRow(cells: ReadonlyArray<Readonly<Cell>>): RowClass {
  if (contentWidth(cells) === 0) return 'blank';
  const text = rowText(cells);
  if (looksLikeAsciiArt(text)) return 'art';
  if (hasTabularGutters(text)) return 'table';
  return 'prose';
}
```

- [ ] **Step 4: GREEN** for `classify.test.ts`.

- [ ] **Step 5: Write the backend parity pin (fails until the SDK file exists; extended with fixture lines in Task 7)**

Create `web/backend/tests/petscii-frame/classify-parity.test.ts`:

```ts
/**
 * The SDK's frame classifier (sdk/petscii/frame/classify.ts) is a verbatim
 * port of ascii-art.util.ts. Until Phase 3 gives the frame module a package
 * export and the backend re-exports it, this pin is what keeps the two
 * copies identical. The SDK source is imported directly, the same way
 * dev-scripts/jest.config.ts maps @amiexpress/bbs-door-sdk/petscii.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as backend from '../../src/utils/ascii-art.util';
import * as sdk from '../../../../sdk/petscii/frame/classify';

const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;
const FIXTURES = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');

const TABLE: string[] = [
  '', '   ', '\t\t', '---', '===', '+-+-+', '_____', '~~~~~',
  ' '.repeat(33) + 'text', ' '.repeat(32) + 'regular text here', '    -|-', '      ***',
  'Welcome to the BBS, please enter your name:',
  'Below are the available AmiExpress commands with brief descriptions.',
  '?   - Show the current conf menu  B   - Bulletins',
  '.------------------------------------..--------------------------------------.',
  '| Handle: Sysop                      || Location: Local Console              |',
  '|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|',
  '      uSeR nAME: Sysop                  dOWNLoADeD tODaY: 0 bYTeS',
  '  ND#/Calls    User/PhoneNumber                Location/Action',
  '-============================================================================-',
  'files   browse a door\'s own files on disk',
  '\x1b[9;3Hfiles       browse', '\x1b[0;37;40mplain coloured text', '\x1b[1;33mBOLD YELLOW\x1b[0m',
];

function fixtureLines(): string[] {
  if (!fs.existsSync(FIXTURES)) return [];
  return fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.ans')).flatMap((f) =>
    fs.readFileSync(path.join(FIXTURES, f), 'utf8').replace(STRIP, '').split(/\r?\n|\r/));
}

describe('SDK classify.ts equals ascii-art.util.ts', () => {
  const lines = [...TABLE, ...fixtureLines()];
  it('looksLikeAsciiArt agrees on every line', () => {
    for (const l of lines) expect({ l, art: sdk.looksLikeAsciiArt(l) }).toEqual({ l, art: backend.looksLikeAsciiArt(l) });
  });
  it('positionsCursorAbsolutely agrees on every line', () => {
    for (const l of lines) expect({ l, pos: sdk.positionsCursorAbsolutely(l) }).toEqual({ l, pos: backend.positionsCursorAbsolutely(l) });
  });
  it('covers real door output once fixtures exist (Task 7)', () => {
    expect(fixtureLines().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: RED then partial GREEN.** `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/petscii-frame/classify-parity.test.ts` -> the two agreement tests pass, `covers real door output` fails (no fixtures yet - expected; Task 7 turns it green). Also `cd web/backend && npx tsc --noEmit` must stay clean (tests are outside the build tsconfig; `npm run typecheck:tests` covers them).

- [ ] **Step 7: Commit** (the parity test is committed with its one known-red case documented in the message; Task 7 closes it in the same branch)

```bash
git diff --cached --stat
git add sdk/petscii/frame/classify.ts sdk/tests/petscii/frame/classify.test.ts web/backend/tests/petscii-frame/classify-parity.test.ts
git diff --cached --stat
git commit -m "feat(petscii): row classifier for the C64 rule ladder - verbatim port of the backend art/positioning heuristics, pinned equal"
```

---

### Task 6: Phase 2 - the rule ladder (`adapt.ts`): crop, gutter, reflow, split, per-region pins, overflow paging, cursor mapping

**Decisions (binding):**
- **Rule order per row** (`chooseRule`): fits in 40 -> `crop` (no-op); right half blank or one repeated non-alphanumeric glyph -> `crop`; art -> `split`; table -> `gutter` (falls through to `split` when still wide); prose -> `reflow`. Pinned regions override with `crop | gutter | reflow | split`; `auto` = `chooseRule`.
- **Split** = two plain halves (`cells[0..39]`, `cells[40..79]`), trailing all-blank halves dropped. NO continuation glyph at column 39 (spec deviation, see the header's conflicts): a glyph either displaces cell 39 onto a third row or drops a character, and both break the invariants the corpus pins (every row <= 40, split rows keep every cell). A pack-level marker is Phase 4's call.
- **Gutter** collapses every run of 2+ blank cells (indent included) to one; a row that still exceeds 40 is split. Non-blank multiset preserved.
- **Reflow** word-wraps cells (attributes travel with their cell), keeps the leading indent on the first row only, hard-breaks a word longer than 40. Its line breaks are pinned to the same sentences the full-canvas Task 10 tests use (`wrapLineToWidth`), so the two wrappers agree without a cross-import; a backend cross-check test is Phase 3 work once `wrap-for-session.util.ts` has landed.
- **Overflow policy**: `adaptRows` returns every adapted row (count may exceed 25); `adaptFrame` shows the LAST 25 - overflow pushes the frame up, exactly as a terminal scrolls, so the prompt row a door just drew is always on screen. The cursor follows its source row's mapping; a cursor whose row scrolled off the top clamps to row 0.
- **Cursor mapping**: each rule returns `map(x)` for every source column 0..79 -> `{ row offset, x }`; blanks beyond the content map to the end of the last produced row.

**Files:**
- Create: `sdk/petscii/frame/adapt.ts`
- Test: `sdk/tests/petscii/frame/adapt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AdaptRule = 'crop' | 'gutter' | 'reflow' | 'split';
  export type RegionRule = AdaptRule | 'auto';
  export interface RegionPin { rows: [number, number]; rule: RegionRule; }   // inclusive source rows
  export interface AdaptOptions { cols?: number; rows?: number; regions?: RegionPin[]; }
  export interface AdaptedRow { cells: Cell[]; source: number; rule: AdaptRule; }
  export interface AdaptResult { rows: AdaptedRow[]; cursor: Cursor; }      // cursor.y indexes rows[]
  export interface RuleCursor { row: number; x: number; }                    // row = OFFSET into THIS rule's rows, not a screen row
  export interface RuleResult { rows: Cell[][]; applied: AdaptRule; map: (x: number) => RuleCursor; }
  export function isCroppable(cells, cols): boolean
  export function chooseRule(cells, cols): AdaptRule
  export function cropRow(cells, cols): RuleResult
  export function gutterRow(cells, cols): RuleResult
  export function reflowRow(cells, cols): RuleResult
  export function splitRow(cells, cols): RuleResult
  export function applyRule(rule: AdaptRule, cells, cols): RuleResult
  export function adaptRows(src: Frame, opts?: AdaptOptions): AdaptResult
  export function adaptFrame(src: Frame, opts?: AdaptOptions): Frame
  ```
- Consumes: `classifyRow`, `contentWidth` from `./classify`; `Cell`, `Cursor`, `Frame`, `cloneCell`, `isBlank`, `padRow`, `makeFrame` from `./types`.

- [ ] **Step 1: Write the failing tests**

Create `sdk/tests/petscii/frame/adapt.test.ts`:

```ts
import { adaptFrame, adaptRows, chooseRule, cropRow, gutterRow, reflowRow, splitRow, isCroppable } from '../../../petscii/frame/adapt';
import { textToFrame, makeFrame, frameText, Cell } from '../../../petscii/frame/types';
import { contentWidth } from '../../../petscii/frame/classify';

const row = (s: string) => textToFrame([s], 80, 1).cells[0];
const str = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('').replace(/ +$/, '');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const multiset = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).filter((ch) => ch !== ' ').sort();

const PROSE = 'the quick brown fox jumps over the lazy dog again and again';
/** Classifies as 'table' (indent < 4, one symbol, three gutters); collapses to exactly 40 characters. */
const TABLE = 'Sysop            Local Console              1234 calls   ratio 1:3';
const TABLE_COLLAPSED = 'Sysop Local Console 1234 calls ratio 1:3';
const WIDE_TABLE = '| Handle: Sysop                      || Location: Local Console              |';
const ART = '|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|';
const RULE = '='.repeat(78);

describe('chooseRule', () => {
  it('fits -> crop; blank right half -> crop; repeated border -> crop; art -> split; table -> gutter; prose -> reflow', () => {
    expect(chooseRule(row('short'), 40)).toBe('crop');
    expect(chooseRule(row('x'.repeat(40)), 40)).toBe('crop');
    expect(chooseRule(row(RULE), 40)).toBe('crop');
    expect(chooseRule(row(ART), 40)).toBe('split');
    expect(chooseRule(row(TABLE), 40)).toBe('gutter');
    expect(chooseRule(row(PROSE), 40)).toBe('reflow');
  });

  it('isCroppable: right half must be blank or one repeated non-alphanumeric glyph', () => {
    expect(isCroppable(row('a'.repeat(41)), 40)).toBe(false);
    expect(isCroppable(row('title ' + '-'.repeat(74)), 40)).toBe(true);
    expect(isCroppable(row('x'.repeat(39) + ' ' + '-'.repeat(39) + '='), 40)).toBe(false);
  });
});

describe('cropRow', () => {
  it('keeps columns 0-39 and maps the cursor into them', () => {
    const r = cropRow(row(RULE), 40);
    expect(r.rows.length).toBe(1);
    expect(str(r.rows[0])).toBe('='.repeat(40));
    expect(r.map(5)).toEqual({ row: 0, x: 5 });
    expect(r.map(70)).toEqual({ row: 0, x: 39 });
    expect(r.applied).toBe('crop');
  });
});

describe('gutterRow', () => {
  it('collapses gutters to one space and keeps every non-space character', () => {
    const src = row(TABLE);
    const r = gutterRow(src, 40);
    expect(r.rows.length).toBe(1);
    expect(str(r.rows[0])).toBe(TABLE_COLLAPSED);
    expect(multiset(r.rows[0])).toEqual(multiset(src));
    expect(r.applied).toBe('gutter');
  });

  it('splits a row that is still wide after compression and reports split', () => {
    const src = row(WIDE_TABLE + ' extra words to keep it over forty columns wide');
    const r = gutterRow(src, 40);
    expect(r.rows.length).toBeGreaterThan(1);
    for (const out of r.rows) expect(contentWidth(out)).toBeLessThanOrEqual(40);
    expect(r.rows.flatMap(multiset).sort()).toEqual(multiset(src));
    expect(r.applied).toBe('split');
  });

  it('maps a cursor inside a collapsed gutter to the surviving space', () => {
    const r = gutterRow(row('ab      cd'), 40);
    expect(r.map(0)).toEqual({ row: 0, x: 0 });
    expect(r.map(4)).toEqual({ row: 0, x: 2 });
    expect(r.map(8)).toEqual({ row: 0, x: 3 });
  });
});

describe('reflowRow (same breaks as wrapLineToWidth in the full-canvas Task 10 tests)', () => {
  it('wraps at word boundaries, never past the width, keeping word order', () => {
    const r = reflowRow(row(PROSE), 20);
    expect(r.rows.map(str)).toEqual(['the quick brown fox', 'jumps over the lazy', 'dog again and again']);
    expect(words(r.rows.map(str).join(' '))).toEqual(words(PROSE));
    expect(r.applied).toBe('reflow');
  });

  it('hard-breaks a word longer than the width', () => {
    const r = reflowRow(row('A'.repeat(90)), 40);
    expect(r.rows.length).toBe(3);
    expect(str(r.rows[0])).toBe('A'.repeat(40));
    expect(str(r.rows[2])).toBe('A'.repeat(10));
  });

  it('keeps the leading indent on the first row only and carries cell colours with their characters', () => {
    const src = row('    ' + PROSE);
    for (let x = 0; x < 80; x++) (src[x] as Cell).fg = x % 16;
    const r = reflowRow(src, 30);
    expect(str(r.rows[0]).startsWith('    the')).toBe(true);
    expect(str(r.rows[1]).startsWith(' ')).toBe(false);
    const first = r.rows[0][4];
    expect(first).toMatchObject({ ch: 't', fg: 4 });
  });

  it('maps the cursor to the wrapped position', () => {
    const r = reflowRow(row(PROSE), 20);
    expect(r.map(0)).toEqual({ row: 0, x: 0 });
    expect(r.map(20)).toEqual({ row: 1, x: 0 });
    expect(r.map(79)).toEqual({ row: 2, x: 19 });
  });

  it('a short row is a single row', () => {
    expect(reflowRow(row('short'), 40).rows.map(str)).toEqual(['short']);
  });
});

describe('splitRow', () => {
  it('yields plain halves, keeps every cell, drops an all-blank second half', () => {
    const r = splitRow(row(ART), 40);
    expect(r.rows.length).toBe(2);
    expect(r.rows.map(str)).toEqual([ART.slice(0, 40).replace(/ +$/, ''), ART.slice(40).replace(/ +$/, '')]);
    expect(r.rows.flatMap(multiset).sort()).toEqual(multiset(row(ART)));
    expect(splitRow(row('x'.repeat(40)), 40).rows.length).toBe(1);
    expect(r.map(45)).toEqual({ row: 1, x: 5 });
    expect(r.applied).toBe('split');
  });
});

describe('adaptRows / adaptFrame', () => {
  const src = textToFrame([RULE, PROSE, TABLE, ART, '', 'Press RETURN:'], 80, 25);

  it('every adapted row fits, rules are recorded per source row, blanks stay blank', () => {
    const { rows } = adaptRows(src);
    for (const r of rows) { expect(r.cells.length).toBe(40); expect(contentWidth(r.cells)).toBeLessThanOrEqual(40); }
    expect(rows.filter((r) => r.source === 0).map((r) => r.rule)).toEqual(['crop']);
    expect(rows.filter((r) => r.source === 1).map((r) => r.rule)).toEqual(['reflow', 'reflow']);
    expect(rows.filter((r) => r.source === 3).map((r) => r.rule)).toEqual(['split', 'split']);
    expect(rows.filter((r) => r.source === 4).length).toBe(1);
  });

  it('region pins override the automatic rule', () => {
    const { rows } = adaptRows(src, { regions: [{ rows: [1, 1], rule: 'crop' }, { rows: [3, 3], rule: 'gutter' }] });
    expect(rows.filter((r) => r.source === 1).map((r) => r.rule)).toEqual(['crop']);
    expect(str(rows.find((r) => r.source === 1)!.cells)).toBe(PROSE.slice(0, 40).replace(/ +$/, ''));
    expect(rows.filter((r) => r.source === 3).every((r) => r.rule === 'split' || r.rule === 'gutter')).toBe(true);
  });

  it('the cursor follows its source row into adapted coordinates', () => {
    const f = makeFrame(80, 25, src.cells, { x: 13, y: 5 });
    const { rows, cursor } = adaptRows(f);
    const promptRow = rows.findIndex((r) => r.source === 5);
    expect(cursor).toEqual({ x: 13, y: promptRow });
  });

  it('adaptFrame pages the LAST 25 rows when splits and reflow overflow, and the cursor stays on its row', () => {
    const lines = Array.from({ length: 24 }, (_, i) => `${i} ` + PROSE);
    lines.push('prompt>');
    const f = makeFrame(80, 25, textToFrame(lines, 80, 25).cells, { x: 7, y: 24 });
    const out = adaptFrame(f);
    expect([out.cols, out.rows]).toEqual([40, 25]);
    expect(frameText(out)[24]).toBe('prompt>');
    expect(out.cursor).toEqual({ x: 7, y: 24 });
    expect(frameText(out)[0]).not.toBe('0 the quick brown fox jumps over the');
  });

  it('adaptFrame of a frame that already fits is the identity on text and cursor', () => {
    const f = makeFrame(80, 25, textToFrame(['fits', 'also fits'], 80, 25).cells, { x: 2, y: 1 });
    const out = adaptFrame(f);
    expect(frameText(out).slice(0, 2)).toEqual(['fits', 'also fits']);
    expect(out.cursor).toEqual({ x: 2, y: 1 });
  });

  it('never produces content at the bottom-right cell that the renderer would have to skip silently', () => {
    const f = textToFrame([...Array(24).fill(''), 'x'.repeat(40)], 80, 25);
    const out = adaptFrame(f);
    expect(out.cells[24][39].ch).toBe('x');   // the ADAPTER keeps it; renderDiff is what refuses to paint it - documented, not hidden
  });
});
```

- [ ] **Step 2: RED.** `cd sdk && npx jest tests/petscii/frame/adapt.test.ts` -> module missing.

- [ ] **Step 3: Implement**

Create `sdk/petscii/frame/adapt.ts`:

```ts
/**
 * The C64 adapter's mechanical rule ladder (strategy rules 2-5): one
 * 80-column frame row in, one or more 40-column rows out.
 *
 *   crop    columns 0..39 (right half blank or one repeated border glyph)
 *   gutter  runs of 2+ spaces collapse to one; still wide -> split
 *   reflow  word wrap, attributes travel with their cell
 *   split   plain halves, blank second half dropped
 *
 * Rule 1 (pack override) and rule 6 (viewport) are Phases 4-5. A pinned
 * region names the rule for a span of source rows; 'auto' classifies.
 *
 * Output invariant: every row has exactly `cols` cells. The row COUNT may
 * grow; adaptFrame shows the last `rows` of them - overflow pushes the frame
 * up like a terminal scroll, so the prompt a door just drew stays visible.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { classifyRow, contentWidth } from './classify';
import { Cell, Cursor, Frame, cloneCell, isBlank, makeFrame, padRow } from './types';

export type AdaptRule = 'crop' | 'gutter' | 'reflow' | 'split';
export type RegionRule = AdaptRule | 'auto';

export interface RegionPin {
  /** Inclusive source row range. */
  rows: [number, number];
  rule: RegionRule;
}

export interface AdaptOptions {
  cols?: number;
  rows?: number;
  regions?: RegionPin[];
}

export interface AdaptedRow {
  cells: Cell[];
  source: number;
  rule: AdaptRule;
}

export interface AdaptResult {
  rows: AdaptedRow[];
  /** cursor.y indexes `rows`. */
  cursor: Cursor;
}

export interface RuleResult {
  rows: Cell[][];
  applied: AdaptRule;
  /** Source column -> { row offset within `rows`, x }. Total over 0..cells.length-1. */
  map: (x: number) => Cursor;
}

type Row = ReadonlyArray<Readonly<Cell>>;

const clampIndex = (cells: Row, x: number) => Math.max(0, Math.min(cells.length - 1, x));

/** Fits, or the right half is blank, or every non-blank cell of the right half is one repeated non-alphanumeric glyph (a border extension such as a rule of '='). */
export function isCroppable(cells: Row, cols: number): boolean {
  if (contentWidth(cells) <= cols) return true;
  const glyphs = cells.slice(cols).filter((c) => !isBlank(c));
  if (glyphs.length === 0) return true;
  const glyph = glyphs[0].ch;
  if (/[A-Za-z0-9]/.test(glyph)) return false;
  return glyphs.every((c) => c.ch === glyph && !c.rvs);
}

export function chooseRule(cells: Row, cols: number): AdaptRule {
  if (isCroppable(cells, cols)) return 'crop';
  switch (classifyRow(cells)) {
    case 'art': return 'split';
    case 'table': return 'gutter';
    default: return 'reflow';
  }
}

export function cropRow(cells: Row, cols: number): RuleResult {
  return {
    rows: [padRow(cells, cols)],
    applied: 'crop',
    map: (x) => ({ row: 0, x: Math.max(0, Math.min(cols - 1, x)) }),
  };
}

export function splitRow(cells: Row, cols: number): RuleResult {
  const rows: Cell[][] = [];
  for (let start = 0; start < cells.length; start += cols) rows.push(padRow(cells.slice(start, start + cols), cols));
  while (rows.length > 1 && rows[rows.length - 1].every(isBlank)) rows.pop();
  return {
    rows,
    applied: 'split',
    map: (x) => {
      const i = clampIndex(cells, x);
      return { row: Math.min(rows.length - 1, Math.floor(i / cols)), x: i % cols };
    },
  };
}

export function gutterRow(cells: Row, cols: number): RuleResult {
  const width = contentWidth(cells);
  const out: Cell[] = [];
  const colMap: number[] = new Array(cells.length);
  let i = 0;
  while (i < width) {
    if (isBlank(cells[i])) {
      const start = i;
      while (i < width && isBlank(cells[i])) i++;
      out.push(cloneCell(cells[start]));
      for (let k = start; k < i; k++) colMap[k] = out.length - 1;
      continue;
    }
    out.push(cloneCell(cells[i]));
    colMap[i] = out.length - 1;
    i++;
  }
  for (let k = width; k < cells.length; k++) colMap[k] = out.length + (k - width);
  if (out.length <= cols) {
    return {
      rows: [padRow(out, cols)],
      applied: 'gutter',
      map: (x) => ({ row: 0, x: Math.min(cols - 1, colMap[clampIndex(cells, x)]) }),
    };
  }
  const split = splitRow(out, cols);
  return { rows: split.rows, applied: 'split', map: (x) => split.map(colMap[clampIndex(cells, x)]) };
}

export function reflowRow(cells: Row, cols: number): RuleResult {
  const width = contentWidth(cells);
  const rows: Cell[][] = [];
  const where: Cursor[] = new Array(cells.length);
  let line: Cell[] = [];
  const flush = () => { rows.push(line); line = []; };
  const push = (k: number) => { line.push(cloneCell(cells[k])); where[k] = { row: rows.length, x: line.length - 1 }; };

  let i = 0;
  while (i < width && isBlank(cells[i])) push(i++);          // leading indent stays on the first row
  while (i < width) {
    if (isBlank(cells[i])) {
      const start = i;
      while (i < width && isBlank(cells[i])) i++;
      let j = i;
      while (j < width && !isBlank(cells[j])) j++;
      const gap = i - start;
      const word = j - i;
      if (line.length + gap + word <= cols) {
        for (let k = start; k < i; k++) push(k);
      } else {
        for (let k = start; k < i; k++) where[k] = { row: rows.length, x: Math.min(cols - 1, line.length) };
        flush();
      }
      continue;
    }
    let j = i;
    while (j < width && !isBlank(cells[j])) j++;
    if (line.length > 0 && line.length + (j - i) > cols) flush();
    for (let k = i; k < j; k++) {
      if (line.length === cols) flush();                        // a word longer than the row hard-breaks
      push(k);
    }
    i = j;
  }
  if (line.length > 0 || rows.length === 0) flush();
  const lastRow = rows.length - 1;
  const lastLen = rows[lastRow].length;
  for (let k = width; k < cells.length; k++) where[k] = { row: lastRow, x: Math.min(cols - 1, lastLen + (k - width)) };
  return {
    rows: rows.map((r) => padRow(r, cols)),
    applied: 'reflow',
    map: (x) => where[clampIndex(cells, x)],
  };
}

export function applyRule(rule: AdaptRule, cells: Row, cols: number): RuleResult {
  switch (rule) {
    case 'crop': return cropRow(cells, cols);
    case 'gutter': return gutterRow(cells, cols);
    case 'reflow': return reflowRow(cells, cols);
    case 'split': return splitRow(cells, cols);
  }
}

function ruleFor(y: number, cells: Row, cols: number, regions: RegionPin[] | undefined): AdaptRule {
  const pin = regions?.find((r) => y >= r.rows[0] && y <= r.rows[1]);
  if (!pin || pin.rule === 'auto') return chooseRule(cells, cols);
  return pin.rule;
}

export function adaptRows(src: Frame, opts: AdaptOptions = {}): AdaptResult {
  const cols = opts.cols ?? 40;
  const rows: AdaptedRow[] = [];
  let cursor: Cursor = { x: 0, y: 0 };
  for (let y = 0; y < src.rows; y++) {
    const cells = src.cells[y];
    const result = applyRule(ruleFor(y, cells, cols, opts.regions), cells, cols);
    const first = rows.length;
    for (const r of result.rows) rows.push({ cells: r, source: y, rule: result.applied });
    if (y === src.cursor.y) {
      const m = result.map(src.cursor.x);
      cursor = { x: m.x, y: first + m.row };
    }
  }
  return { rows, cursor };
}

export function adaptFrame(src: Frame, opts: AdaptOptions = {}): Frame {
  const cols = opts.cols ?? 40;
  const rows = opts.rows ?? 25;
  const adapted = adaptRows(src, { ...opts, cols });
  const offset = Math.max(0, adapted.rows.length - rows);   // overflow pushes the frame up
  const visible = adapted.rows.slice(offset).map((r) => r.cells);
  return makeFrame(cols, rows, visible, {
    x: Math.max(0, Math.min(cols - 1, adapted.cursor.x)),
    y: Math.max(0, Math.min(rows - 1, adapted.cursor.y - offset)),
  });
}
```

- [ ] **Step 4: GREEN.** `cd sdk && npx jest tests/petscii/frame/adapt.test.ts`. If `gutterRow` on `TABLE` disagrees with the expected string, print `str(r.rows[0])` and check the expectation against the algorithm's definition (indent collapses to ONE space; the expected string in the test is the collapsed text cut at 40) - fix the test text only if it contradicts the stated rule, never the rule to match a typo.

- [ ] **Step 5: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/frame/adapt.ts sdk/tests/petscii/frame/adapt.test.ts
git diff --cached --stat
git commit -m "feat(petscii): the 80-to-40 rule ladder - crop, gutter, reflow, split with region pins and scroll-up overflow"
```

---

### Task 7: Phase 2 - captured 68K frame corpus, corpus invariants, frame barrel, freshness, handoff

**Fixtures (8 doors, all already deterministic corpus entries with goldens; `cplistan` is not installed under `Doors/` and not in `corpus.json` - see conflicts):**

| id | binary | command | shape it exercises | stdin script (`<delayMs> <bytes>`) |
|---|---|---|---|---|
| aehelp | Doors/AEHelp/AEHelp | HELP | 2-column help table, prose header, prompt | `8000 \r` |
| six_status | Doors/SiX-Status/Status | STATS | boxed stats art, CR-only overwrites, colour | `1000 \r` / `3000 q\r` / `5000 \r` |
| kd_confstats | Doors/KdConfStats/ConfStats | (none) | 82-wide bordered two-column table | `1500 \r` / `4000 \r` / `8000 q\r` |
| color_wall | Doors/ColorWall/ColorWall | CW | art header + wall prose | `2500 \r` |
| who | Doors/who/who | WHO | banner, column headers, 80-wide rule | `6000 \r` / `9000 \r` |
| ratiorep | Doors/RATIOREP/RATIOREP | RR | two-column stats, underscore rule | `1500 g\r` / `3500 y\r` / `6000 \r` |
| super_stats | Doors/Super-Stats/Super-Stats | STATS | 80-col stats frame with art rails | `1000 \r` / `3000 q\r` / `5000 \r` |
| hststat | Doors/Hststat/Hststat | (none) | 89-wide header with high-bit glyphs, numbered menu | `2500 \r` / `5000 \r` |

Optional ninth once the others are in: `turbolister` (Doors/TurboLister/TurboLister.Xim, command TURBOLISTER.XIM, script `1000 \r` / `3000 q\r` / `5000 \r`) - a real lister, but its corpus entry is "needs capture + triage" (no golden). Include it only if the capture renders more than a banner; otherwise leave it out and note it.

**Files:**
- Create: `sdk/tests/petscii/frame/fixtures/manifest.json`, `sdk/tests/petscii/frame/fixtures/<id>.ans` (x8), `sdk/petscii/frame/index.ts`
- Test: `sdk/tests/petscii/frame/corpus.test.ts`; extends (by existing) `web/backend/tests/petscii-frame/classify-parity.test.ts`
- Create: `thoughts/shared/handoffs/2026-09-02_c64-door-adapter-phases-0-2.md`

**Interfaces:**
- Produces: `sdk/petscii/frame/index.ts` re-exporting everything from `./types`, `./ansi-screen`, `./frame-render`, `./classify`, `./adapt` (no `sdk/petscii/index.ts` or `package.json` change).
- Manifest shape: `{ "<id>": { "binary": string, "command": string | null, "script": string[], "notes": string } }`.

- [ ] **Step 1: Capture the fixtures (one emulator at a time, from the repo root, stdout redirected)**

```bash
cd /Users/spot/Code/amiexpress-web
S=<the session scratchpad directory named in the system prompt, written literally>
mkdir -p sdk/tests/petscii/frame/fixtures "$S/captures"
H=web/backend/src/scripts/run-amiga-door.ts
cap() { id=$1; bin=$2; cmd=$3; shift 3; printf '%s\n' "$@" | npx tsx $H "$PWD/$bin" 1 --doortype XIM ${cmd:+--command $cmd} --timeout 25 > "$S/captures/$id.ans" 2> "$S/captures/$id.log"; echo "$id exit=$? bytes=$(wc -c < "$S/captures/$id.ans") esc=$(grep -c $'\x1b\[' "$S/captures/$id.ans")"; }
cap aehelp        Doors/AEHelp/AEHelp             HELP  '8000 \r'
cap six_status    Doors/SiX-Status/Status         STATS '1000 \r' '3000 q\r' '5000 \r'
cap kd_confstats  Doors/KdConfStats/ConfStats     ''    '1500 \r' '4000 \r' '8000 q\r'
cap color_wall    Doors/ColorWall/ColorWall       CW    '2500 \r'
cap who           Doors/who/who                   WHO   '6000 \r' '9000 \r'
cap ratiorep      Doors/RATIOREP/RATIOREP         RR    '1500 g\r' '3500 y\r' '6000 \r'
cap super_stats   Doors/Super-Stats/Super-Stats   STATS '1000 \r' '3000 q\r' '5000 \r'
cap hststat       Doors/Hststat/Hststat           ''    '2500 \r' '5000 \r'
```

`--timeout` is the door session limit in seconds (AmigaDoorSession.ts:189 default 300). The `\r` in the scripts is the two characters backslash-r, which `run-amiga-door.ts decodeEscapes` turns into CR. Verify bytes, not your parse: every capture must have `bytes > 150` and `esc > 0` (the corpus goldens are ANSI-stripped; fixtures must NOT be - a capture with `esc=0` means the door emitted no colour, acceptable only for `hststat`/`who` if their goldens also show none; otherwise re-run). Compare `sed 's/\x1b\[[0-9;?]*[A-Za-z]//g' "$S/captures/<id>.ans" | head -20` with `dev/scripts/door-corpus/goldens/<id>/output.txt` - same text modulo the HH:MM time mask. Then copy by shell only: `cp "$S/captures/"*.ans sdk/tests/petscii/frame/fixtures/`.

- [ ] **Step 2: Write the manifest**

Create `sdk/tests/petscii/frame/fixtures/manifest.json`:

```json
{
  "aehelp":       { "binary": "Doors/AEHelp/AEHelp",           "command": "HELP",  "script": ["8000 \\r"],                               "notes": "help index: 2-column table, prose header, line-input prompt" },
  "six_status":   { "binary": "Doors/SiX-Status/Status",       "command": "STATS", "script": ["1000 \\r", "3000 q\\r", "5000 \\r"],        "notes": "boxed stats art with CR-only overwrites and colour" },
  "kd_confstats": { "binary": "Doors/KdConfStats/ConfStats",   "command": null,    "script": ["1500 \\r", "4000 \\r", "8000 q\\r"],        "notes": "82-wide bordered two-column table" },
  "color_wall":   { "binary": "Doors/ColorWall/ColorWall",     "command": "CW",    "script": ["2500 \\r"],                               "notes": "art header, graffiti wall prose" },
  "who":          { "binary": "Doors/who/who",                 "command": "WHO",   "script": ["6000 \\r", "9000 \\r"],                    "notes": "banner, column headers, 80-wide rule" },
  "ratiorep":     { "binary": "Doors/RATIOREP/RATIOREP",       "command": "RR",    "script": ["1500 g\\r", "3500 y\\r", "6000 \\r"],       "notes": "two-column stats, underscore rule" },
  "super_stats":  { "binary": "Doors/Super-Stats/Super-Stats", "command": "STATS", "script": ["1000 \\r", "3000 q\\r", "5000 \\r"],        "notes": "80-column stats frame with art rails" },
  "hststat":      { "binary": "Doors/Hststat/Hststat",         "command": null,    "script": ["2500 \\r", "5000 \\r"],                    "notes": "89-wide header with high-bit glyphs, numbered menu" }
}
```

- [ ] **Step 3: Write the failing corpus test**

Create `sdk/tests/petscii/frame/corpus.test.ts`:

```ts
/**
 * Captured 68K door output (fixtures/*.ans, raw ANSI from run-amiga-door.ts;
 * manifest.json says how each was produced) driven through the whole
 * Phase 1-2 pipeline. Asserts the strategy's Phase 2 invariants per fixture:
 * every adapted row <= 40 cells; crop/gutter lose no non-space character;
 * reflow keeps word order; split keeps every cell; the 40x25 result renders
 * through the transducer onto the KERNAL oracle with the cursor in place.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { adaptRows, adaptFrame, isCroppable } from '../../../petscii/frame/adapt';
import { renderDiff } from '../../../petscii/frame/frame-render';
import { contentWidth } from '../../../petscii/frame/classify';
import { Cell, Frame } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../../petscii/petscii-machine';

const DIR = path.join(__dirname, 'fixtures');
const manifest: Record<string, { binary: string; command: string | null; script: string[]; notes: string }> =
  JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

const multiset = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).filter((ch) => ch !== ' ').sort();
const words = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('').trim().split(/\s+/).filter(Boolean);

/** Every distinct 80x25 frame the stream passes through: one per CR/LF-terminated write, plus the final state. */
function framesOf(ansi: string): Frame[] {
  const r = new FrameReconstructor();
  const frames: Frame[] = [];
  for (const chunk of ansi.split(/(?<=\n)/)) { r.write(chunk); frames.push(r.snapshot()); }
  return frames;
}

for (const [id, entry] of Object.entries(manifest)) {
  describe(`fixture ${id} (${entry.binary})`, () => {
    const ansi = fs.readFileSync(path.join(DIR, `${id}.ans`), 'utf8');
    const frames = framesOf(ansi);
    const last = frames[frames.length - 1];

    it('is a real capture: raw ANSI with content', () => {
      expect(ansi.length).toBeGreaterThan(150);
      expect(last.cells.some((row) => row.some((c) => c.ch !== ' '))).toBe(true);
      expect(last.cells.every((row) => row.every((c) => c.ch.codePointAt(0)! >= 0x20))).toBe(true);
    });

    it('every adapted row of every frame fits in 40 columns', () => {
      for (const f of frames) for (const r of adaptRows(f).rows) {
        expect(r.cells.length).toBe(40);
        expect({ source: r.source, rule: r.rule, fits: contentWidth(r.cells) <= 40 }).toEqual({ source: r.source, rule: r.rule, fits: true });
      }
    });

    it('crop and gutter rows lose no non-space character; split rows keep every cell; reflow keeps word order', () => {
      const { rows } = adaptRows(last);
      for (let y = 0; y < last.rows; y++) {
        const src = last.cells[y];
        const out = rows.filter((r) => r.source === y);
        const joined = out.flatMap((r) => r.cells);
        const rule = out[0].rule;
        if (rule === 'crop') {
          if (src.slice(40).every((c) => c.ch === ' ')) expect(multiset(joined)).toEqual(multiset(src));
          else expect(isCroppable(src, 40)).toBe(true);           // a border extension was cut, by rule
        } else if (rule === 'gutter' || rule === 'split') {
          expect({ y, rule, chars: multiset(joined) }).toEqual({ y, rule, chars: multiset(src) });
        } else {
          expect({ y, words: words(joined) }).toEqual({ y, words: words(src) });
        }
      }
    });

    it('renders through the transducer onto the oracle with the cursor where the frame put it', () => {
      const t = new AnsiToPetsciiTransducer();
      const m = new PetsciiMachine();
      let prev: Frame | null = null;
      for (const f of frames) { const a = adaptFrame(f); m.feed(t.transduce(renderDiff(prev, a))); prev = a; }
      const final = adaptFrame(last);
      expect([m.state.cursorX, m.state.cursorY]).toEqual([final.cursor.x, final.cursor.y]);
    });
  });
}
```

- [ ] **Step 4: RED then GREEN.** `cd sdk && npx jest tests/petscii/frame/corpus.test.ts`. Expected first run: green if Tasks 2-6 are correct; any red names the fixture, row and rule. Triage rule: a failure in "fits in 40" or "loses no character" is a bug in `adapt.ts` (fix it there, add the failing row as a unit case in `adapt.test.ts`); a failure in "renders ... cursor" is a bug in `frame-render.ts` or `ansi-screen.ts`. Never edit a fixture to pass. Then `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/petscii-frame/classify-parity.test.ts` - the fixture-coverage case is green now, and the parity over every fixture line must hold.

- [ ] **Step 5: The frame barrel**

Create `sdk/petscii/frame/index.ts`:

```ts
/**
 * C64 door adapter frame pipeline (strategy plan 2026-09-02-c64-door-adapter):
 * FrameReconstructor (ANSI -> 80x25 cells) -> adaptFrame (80 -> 40 columns)
 * -> renderDiff (40x25 cells -> ANSI for AnsiToPetsciiTransducer).
 * Pure TypeScript. Package export and emitter wiring arrive with Phase 3.
 */
export * from './types';
export { FrameReconstructor, type FrameReconstructorOptions } from './ansi-screen';
export { renderDiff, renderFrame, cupTo } from './frame-render';
export * from './classify';
export * from './adapt';
```

- [ ] **Step 6: Build + full SDK suite + freshness.** `cd sdk && npm run build && npm test` (whole SDK green; `dist/petscii/frame/*.js` and `dist-esm/petscii/frame/*.js` exist). Then follow `.claude/skills/door-sdk-freshness/SKILL.md` (a running backend does not consume the frame module yet, but the skill is the rule after any `sdk/` edit; record its result).

- [ ] **Step 7: Handoff**

Create `thoughts/shared/handoffs/2026-09-02_c64-door-adapter-phases-0-2.md` with frontmatter (`date`, `topic: C64 door adapter Phases 0-2 landed`, `tags: [petscii, c64, doors, sdk]`, `status: final`) and sections: Task(s) (Phases 0-2 of the strategy; which commits), Critical References (`sdk/petscii/frame/*.ts`, `web/backend/src/amiga-emulation/xim/screen-width.util.ts`, the strategy plan, this plan), Recent Changes (one line per commit hash + subject), Learnings (the deferred-wrap/newline trap; the (39,24) cell; gutter-then-split reporting; split has no continuation glyph and why; fixtures are UTF-8 re-encodings of Amiga Latin-1 - shell only), Artifacts (fixtures + manifest, the parity test), Next Steps (Phase 3 in order: `./petscii/frame` package export; backend `ascii-art.util.ts` re-export + collapse the parity test; wrap cross-check against `wrap-for-session.util.ts` once Task 10 lands; emitter integration with the quiet-gap + input-wait tick; AREXX `BB_SCRWIDTH` in the 40-col plan), Other Notes (the optional `turbolister` fixture; `cplistan` absent).

- [ ] **Step 8: Commit**

```bash
git diff --cached --stat
git add sdk/petscii/frame/index.ts sdk/tests/petscii/frame/corpus.test.ts \
  sdk/tests/petscii/frame/fixtures/manifest.json \
  sdk/tests/petscii/frame/fixtures/aehelp.ans sdk/tests/petscii/frame/fixtures/six_status.ans \
  sdk/tests/petscii/frame/fixtures/kd_confstats.ans sdk/tests/petscii/frame/fixtures/color_wall.ans \
  sdk/tests/petscii/frame/fixtures/who.ans sdk/tests/petscii/frame/fixtures/ratiorep.ans \
  sdk/tests/petscii/frame/fixtures/super_stats.ans sdk/tests/petscii/frame/fixtures/hststat.ans \
  thoughts/shared/handoffs/2026-09-02_c64-door-adapter-phases-0-2.md
git diff --cached --stat
git commit -m "test(petscii): captured 68K door corpus drives the frame pipeline - every row fits 40, nothing lost by crop or gutter"
```

Then post `HH:MM <name> - LANDED Phases 0-2 of the C64 door adapter (<hashes>); claims on sdk/petscii/frame/**, sdk/tests/petscii/frame/**, xim/{bbs-info,screen-width.util,types}.ts, DoorMessageHandler BB_SCRWIDTH, door.handler launch literal, web/backend/tests/{xim,petscii-frame}/** released` to `thoughts/BOARD.md`.

---

## Self-review

**Coverage vs Phases 0-2 of the strategy:**
- Phase 0 width honesty: `BB_SCRWIDTH` live path (Task 1 Step 7, bbs-info.ts) + fallback copy (DoorMessageHandler) + `lineWrap` at its one set site (door.handler.ts:824) through one function; `BBSSessionData` carries `petsciiMode`/`screenWidth`; tests: util (4), live handler (4 incl. 80 for a 40-wide non-PETSCII session), wrap path pin, source pins. 80-col identity: full backend suite + explicit non-PETSCII cases.
- Phase 1 FrameReconstructor: CUP/CUU/CUD/CUF/CUB/CHA/VPA/HVP/CNL/CPL, ED/EL/ECH, SGR 30-37/90-97/bold/39/49/38;5/38;2/48;x/7/27/0/1/22, CR/LF/BS/TAB, deferred wrap incl. the 80-wide-line newline trap, scroll, save/restore (ESC 7/8, CSI s/u), ?1049/?47 clear, OSC/DCS with the transducer's cap rule, `snapshot()` immutability, `dirtyRows()`; configurable N and cols. SGR colour space pinned equal to the transducer (Task 3 parity test over 24 SGRs) - `nearestVicForRgb`/`sgrColorToVic` are already exported, so no edit to the claimed `ansi-to-petscii.ts`.
- Phase 1b FrameDiffRenderer: first paint = clear + non-blank cells; diff = changed cells only, CUP + SGR + runs; oracle round trip cell-for-cell (screen code, reverse bit, colour RAM, cursor) for first paint and a subsequent diff; the (39,24) scroll trap pinned.
- Phase 2 rule ladder rules 2-5 with per-region pins, `'auto'` classification from the ported heuristics (art -> crop-if-blank-right else split; table -> gutter then split; prose -> reflow), invariants (rows <= 40, multiset for crop/gutter, cells for split, word order for reflow), overflow policy (last 25 rows, cursor follows), corpus of 8 captured frames with exact harness invocations, backend parity pin over fixture lines.

**Placeholder scan:** no TBD/TODO/"similar to"; every step carries its code; every test is complete. The only conditional item is the optional `turbolister` ninth fixture, stated as optional with its exact invocation.

**Type consistency:** `Cell {ch, fg, bg, bold, rvs}` / `Cursor` / `Frame {cols, rows, cells, cursor}` defined once in Task 2 `types.ts` and imported by Tasks 3-7; `FrameReconstructor.snapshot(): Frame`, `.dirtyRows(): number[]`, `.cursor: Cursor` (Task 2) consumed in Tasks 3, 7; `renderDiff(prev: Frame | null, next: Frame, cols = 40, rows = 25, palette?)` (Task 4) consumed in Task 7; `classifyRow`/`contentWidth` (Task 5) consumed in Task 6 and 7; `adaptRows(): AdaptResult {rows: AdaptedRow[], cursor}` and `adaptFrame(): Frame` (Task 6) consumed in Task 7; `doorScreenWidth(session, fallback?)` (Task 1) consumed by three backend sites and three tests; `RuleResult.applied` reports `'split'` when gutter fell through (Task 6 test + Task 7 triage use it).

**Spec conflicts and resolutions (reported to the caller):**
1. **`cplistan` fixture** - not installed under `Doors/` and absent from `corpus.json`; replaced by eight deterministic corpus doors with goldens (aehelp, six_status, kd_confstats, color_wall, who, ratiorep, super_stats, hststat); `turbolister` (a real lister, no golden) offered as an optional ninth.
2. **Split continuation glyph at column 39** (strategy rule 5) - omitted: it either displaces cell 39 onto a third row or drops a character, breaking the "<= 40 cells" and "split keeps every cell" invariants the corpus pins. Halves are plain; a marker is a pack option for Phase 4.
3. **Wrap function home** - Task 10's `wrap-for-session.util.ts` has NOT landed (file absent at a93f8083) and the SDK cannot import the backend; the cell-based `reflowRow` lives in the SDK and is pinned to the same sentences/breaks Task 10's tests use. The backend cross-check (`wrapLineToWidth` vs `reflowRow` on shared inputs) is Phase 3 work, named in the handoff.
4. **Classification heuristics** - ported verbatim (not moved) because `sdk/petscii/index.ts` and `sdk/package.json` are under the full-canvas run's claim; equality is pinned by a backend test that imports the SDK source the way the backend jest config already does; the re-export switch is Phase 3.
5. **`lineWrap` for non-PETSCII sessions** - the strategy says "set to 40 for PETSCII sessions"; it says nothing about wide ANSI terminals, which today wrap at their real width (`terminalWidth`). Kept: `doorScreenWidth(session, terminalWidth)` forces 40 only for PETSCII and leaves every other session exactly as it was. `BB_SCRWIDTH` stays a hard 80 for non-PETSCII sessions per the prompt.
6. **Lone LF** in the reconstructor is column 0 of the next row (Amiga CON: and the transducer's reading), not xterm's bare index - the reconstructor's job is to see what the transducer would have shown; documented in the class header and pinned by a test.
**Known limits carried into Phases 3-4 (pack authors read this first):**
- **A region pin selects a RULE, not a screen position.** `RegionPin.rows` names source rows only so the ladder can be told "these rows are a table, gutter them"; it cannot say "keep these rows on screen", "put them at row 0", or "never scroll them". The pin also applies unconditionally - a pinned `gutter` collapses the double spaces of a row that already fitted.
- **`adaptFrame`'s tail-paging is the only positional policy there is.** When the adapted rows exceed the viewport the frame is pushed UP and the LAST `rows` survive, so the prompt a door just drew stays visible. The corollary is blunt: a pack that pins a logo at rows [0,5] has pinned the first thing scroll-up throws away. Anything that must stay on screen is a Phase 4 pack substitution (replace the 80-column art with 40-column art so the frame never overflows) or the Phase 5 viewport rule - not a region pin.
- **Rule 1 (pack override) and rule 6 (viewport/pan) are not in this plan.** `adapt.ts` exposes no hook for either beyond `AdaptOptions`; adding one is Phase 4's design call.
- Conflict 3 above is now half-resolved: `web/backend/src/utils/wrap-for-session.util.ts` HAS landed and re-exports the SDK's `wrapLineToWidth`, and `reflowRow` calls that same export rather than reimplementing it, so the Phase 3 "cross-check" is an identity check, not a parity port.

7. **Golden files are not fixtures** - `dev/scripts/door-corpus/goldens/*/output.txt` are ANSI-stripped by default (`run.ts --keep-ansi` off); the plan captures raw ANSI directly with the harness.
