---
date: 2026-09-02
topic: PETSCII full-canvas sessions
tags: [petscii, c64, terminal, handoff]
status: implemented
---

# PETSCII full-canvas sessions

## Task(s)

The sysop's requirement was one line - "do it properly": a caller who answers `P` at the
graphics prompt, or dials in from a real C64, must get EVERYTHING as PETSCII on a simulated
40x25 C64 display, not an ANSI screen with a PETSCII overlay bolted on.

All eleven tasks of `thoughts/shared/plans/2026-09-02-petscii-full-canvas.md` are implemented
and reviewed:

| Task | What | Commit(s) | On `main`? |
|---|---|---|---|
| 1 | PETSCII core moves into the SDK | `ea2cb7622` | yes |
| 2 | `AnsiToPetsciiTransducer` | `a28de585a` | yes |
| 3 | Transducer erase/clear/save-restore + Unicode graphics table | `726c1ae0d` | yes |
| 4 | `convertUnicodePuaToPetscii` delegates to the transducer | `9811787a6` | yes |
| 5 | Real C64 telnet callers get transduced ANSI | `2ae54b0fb`, `04735097d` | yes |
| 6 | One PETSCII keyboard input map (cursor + F-keys) | `bcdf36cb8` | yes |
| 7 | Surface reducer + pure login key machine | `f2f2ef3a5` | yes |
| 8 | The canvas IS the surface; overlay + font gate retired | `5a2cf0397`, `8a537b218` | pending |
| 10 | 40-column word wrap at the `emitText` choke | `279e41fd2`, `cdbe824eb`, `7fae01d55` | pending |
| - | A C64 terminal is black, not BASIC blue | `5802c7496` | pending |
| 11 | CCGMS `$02` background/border convention | `4156e5575`, `82bc15bc5` | pending |
| - | The focused canvas loses the browser's blue focus ring | `dcfd6a4b8` | pending |
| 9 | This document, ARCHITECTURE.md, plan cross-references | this commit | pending |

Tasks 1-7 went to `main` as `cde1bd199` and are live (deployed inside `f5d5fcd1f`). The
predecessor `.seq` security-lookup fix `639fde5cd` is the commit that made PETSCII sessions
resolve `BBSTITLE.SEQ` at all.

## Critical References

- Plan: `thoughts/shared/plans/2026-09-02-petscii-full-canvas.md` (self-review at the end names
  every semantic trap and every resolved spec conflict).
- Reference: `thoughts/shared/research/2026-09-01_true-petscii-reference.md` section 3 - the
  palette, the terminal-vs-BASIC default correction, and the CCGMS `$02`/`$0E` convention.
- `sdk/petscii/ansi-to-petscii.ts` - the ONE ANSI parser. `transduce()` / `observe()` /
  `flush()`; the KERNAL oracle (`PetsciiMachine`) inside it decides every cursor byte.
- `sdk/petscii/petscii-machine.ts` - KERNAL 40x25 screen-code + colour-RAM emulator; the
  `background`/`border` pair; power-on is black/black.
- `sdk/petscii/petscii-input.ts` - `petsciiInputToAscii`, one table for canvas keys and real
  C64 keyboards.
- `web/backend/src/server/connection-emitter.ts` - one transducer per telnet/SSH session
  (`petsciiTransducerFor` - deleted 2026-09-02 in `68caab151`; the session's ONE model now
  comes from `petsciiTerminalModelFor` in `web/backend/src/utils/petscii-session-model.ts`),
  plus `flushPendingPetscii` called from `connection.on('data')` in
  `web/backend/src/index.ts` (the correct flush boundary - see Learnings).
- `packages/terminal/src/components/BBSTerminal.tsx` - `ensurePetsciiSession()`, `writeTerm()`
  (the single seam every write must pass through), `startPetsciiDrain()` (baud pacing,
  bypassed while a door owns the terminal).
- `packages/terminal/src/utils/login-key-machine.ts` - the pure login key machine shared by
  physical keys, the on-screen keyboard and the canvas.
- `packages/terminal/src/petscii/surface-state.ts` - which surface a session is on;
  `keymap.ts` - browser `KeyboardEvent` -> PETSCII bytes.
- `web/backend/src/utils/wrap-for-session.util.ts` - the 40-column wrap, gated on
  `session.petsciiMode`.
- `web/backend/src/handlers/command.handler.ts:1052` `completeRealC64Connect`, `:1409` and
  `:1451` (TTYPE and DEL-probe autodetect), `:1510` (the `PETSCII: SIMULATING C64 DISPLAY
  (40X25)` line, web-only by construction).

## Recent Changes

- **Task 1** - `petscii-machine.ts`, `c64-palette.ts`, `screen-codes.ts` moved to `sdk/petscii/`
  and are exported as `@amiexpress/bbs-door-sdk/petscii`; the backend palette became a
  re-export, killing the twin-palette duplication; every importer updated.
- **Task 2** - `AnsiToPetsciiTransducer`: ANSI text in, PETSCII bytes out, every cursor byte
  computed against an internal `PetsciiMachine` rather than a second cursor model. SGR
  (16/256/truecolor, bold, reverse), CUP/CUU/CUD/CUF/CUB, case swap, bank-ensure.
- **Task 3** - ED/EL, `ESC c`, save/restore, alternate screen, OSC/DCS strings dropped safely
  (capped, dropped on CR/LF), deferred wrap (`pendingWrap`) so an exactly-40-char line plus
  CRLF does not eat a blank row, and the Unicode graphics table (35 exact, 28 documented
  substitutions).
- **Task 4** - the legacy `convertUnicodePuaToPetscii` now delegates to the transducer: one
  ANSI parser in the codebase, 243 lines of the second one deleted.
- **Task 5** - telnet/SSH callers get a per-session transducer in `connection-emitter.ts`;
  `needsCharsetPrelude` retired (the oracle decides when `$0E` is needed); the DEL-probe
  promotion path resyncs the oracle with `ESC[2J ESC[H` so it never starts blind.
- **Task 6** - one input map: arrows, Home, Insert/Delete and F1-F8 from a real C64 keyboard
  and from the canvas reach blessed's `parseKey` and `DoorInputManager`. Unshifted letters are
  lowercase (text bank), shifted `$C1-$DA` are uppercase.
- **Task 7** - `petsciiSurfaceReducer` plus a pure `processLoginKey`, so keys, the on-screen
  keyboard and the canvas share one login path (the on-screen keyboard gained new-user `R`/`C`).
- **Task 8** - `BBSTerminal` hides (never destroys) xterm for a PETSCII session and routes every
  write through `writeTerm` -> transducer -> paced queue -> `PetsciiMachine` -> canvas. Overlay
  hybrid and font gate deleted with their tests. `petscii-output` can no longer flip an ANSI
  session onto the canvas. Doors bypass pacing. The on-screen keyboard shows for a handheld
  canvas session in any orientation.
- **Task 10** - `wrapForSession` at the `emitText` choke: prose breaks at word boundaries for a
  40-column caller and is IDENTITY for everything else (non-PETSCII session, width >= 80,
  door-owned terminal, or a payload that positions the cursor - art is never squeezed).
- **Black default** - `PetsciiMachine` powers on black/black and the backend converters stopped
  emitting a blue background: a C64 *terminal* is black; BASIC blue was the wrong context.
- **Task 11** - the CCGMS convention: `$02 <colour>` sets background AND border, `$0E` blacks
  both, the transducer commits a screen background at a full clear only (`$93` then
  `$02 <colour>`), re-asserts the pen afterwards for clients that do not implement `$02`, and
  the backend PETSCII->ANSI converters honour `$02`/`$0E` in the reverse direction.
- **Focus ring** - `outline: none` on the canvas; the C64 border is the machine's, not Chrome's.

## Learnings

- **Four semantic traps, each kept as a test.** RETURN from a non-final linked row is not "go
  to the next row" (`PetsciiMachine.newline()` walks to `logicalLineEndRow`); printing at
  (39,24) scrolls, so the clamp test asserts a cursor position, not a glyph; `observe()` never
  resets the pen (raw `.seq` bytes teach the oracle position and charset, not colour policy);
  `flush()` emits one `$9D` per column of walk-back, so calling it on every message would
  bleed bytes and split escapes.
- **The core lives in the SDK because of `rootDir`.** `web/backend/tsconfig.json` sets
  `rootDir: ./src`, so backend runtime code cannot import `packages/terminal/src/...` (TS6059)
  - only backend *tests* can, and tests are not the product. Both consumers already depend on
  `@amiexpress/bbs-door-sdk` (`file:../../sdk`), so `sdk/petscii/` is the only home that serves
  the telnet emitter and the browser canvas from one copy.
- **Backend jest maps the specifier to SDK SOURCE.**
  `web/backend/dev-scripts/jest.config.ts` has
  `'^@amiexpress/bbs-door-sdk/petscii$': '<rootDir>/../../sdk/petscii/index.ts'`, so RED/GREEN
  cycles need no `npm run build` in `sdk/`. CI builds the SDK before backend tests. Product
  code still resolves through the package `exports` map to `sdk/dist`, which is why the
  Docker backend stage had to be taught to copy `sdk/dist` (`a683a23ad`) - a deep SDK import
  from backend *source* was new with Task 1 and broke the image build.
- **The flush boundary is the arrival of input, not the end of a message.** `transduce()` holds
  a trailing bare CR until it knows whether an LF completes it; flushing per `ansi-output`
  splits CRLF into two line moves, and `flush()` discards a partial escape sequence, so a
  chunk split mid-`ESC[33m` would print `[33m` as text. `flushPendingPetscii` therefore runs at
  the top of `connection.on('data')` (server) and before `processLoginKey` (client).
- **Gate the 40-column wrap on `petsciiMode`, never on width.** `socket-handlers.ts` sets
  `session.screenWidth` from real xterm dimensions for every web socket, so a width-only gate
  reflowed help and mail for anyone with a narrow browser window. Non-C64 platforms never pay
  for C64 support.
- **A C64 terminal is black.** The reference doc's "canonical power-on defaults" (blue on light
  blue) describe KERNAL BASIC, not CCGMS/Novaterm. Background and border are global, tied
  together, and only the CCGMS `$02`/`$0E` convention moves them; per-cell backgrounds do not
  exist in colour RAM and stay dropped.
- **`.seq` art teaches the oracle.** `petscii-bytes` are fed to the machine directly AND
  `observe()`d by the transducer, or the transducer's idea of the cursor and charset bank
  drifts from the screen the caller is actually looking at.

## Artifacts

- Plan: `thoughts/shared/plans/2026-09-02-petscii-full-canvas.md`
- SDD workspace: `.superpowers/sdd/2026-09-02-petscii-full-canvas/` (per-task briefs, reports,
  review diffs, `progress.md` ledger).
- Reference: `thoughts/shared/research/2026-09-01_true-petscii-reference.md`
- Tests: `sdk/tests/petscii/{petscii-machine,ansi-to-petscii,petscii-input,screen-codes,unicode-to-petscii}.test.ts`;
  `web/backend/tests/petscii/{login-key-machine,petscii-keymap,petscii-surface-state}.test.ts`;
  `web/backend/tests/utils/{petscii.util,petscii-unicode-map,wrap-for-session.util,emit-text-wrap}.test.ts`;
  `web/backend/tests/handlers/{c64-connect-probe,c64-detected-handler,petscii-bytes-transport}.test.ts`;
  `web/frontend/src/components/__tests__/petscii-canvas-focus-ring.test.tsx`.

## Next Steps

1. **Land the pending commits** (Task 8, Task 10, black default, Task 11, focus ring, this
   docs commit) by cherry-pick onto a fresh worktree of `origin/main`, then deploy and verify
   the live image age.
2. **The manual C64 walk below is the gate** - the sysop's browser verdict, both desktop and
   mobile, plus the SyncTERM `ScreenMode=C64` run. Record the verdict here.
3. **40-col plan** (`thoughts/shared/plans/2026-09-02-c64-40col-implementation.md`): Task 1
   (`MIN_COLUMNS` door gate), Task 3 (XXS=40 breakpoint tier), Tasks 5/6 (40-column table and
   menu layouts). Its Task 4 is superseded by Task 10 here except the view-file 79, AmigaGuide
   width and AREXX `BB_SCRWIDTH` (`services/arexx.service.ts:1924`) sites.
4. **C64 Door Adapter** (`thoughts/shared/plans/2026-09-02-c64-door-adapter.md`) - phases 3+
   were waiting on Tasks 5/8, which are now implemented. `sdk/petscii/frame/types.ts` still has
   `DEFAULT_BG = 6` (BASIC blue) on the adapter side; with `$02` real, an adapter that wants a
   coloured backdrop should emit `$02 <colour>` rather than assume one.
5. **`BBSApi.writePetsciiLine(Buffer)`** still converts to the PUA/xterm path instead of
   emitting raw bytes - the last legacy PETSCII output path.

## Other Notes

### Manual C64 walk (the sysop runs this; record the verdict here)

Prerequisites: `./dev/scripts/start-servers.sh --bbs-only`; the frontend `dist/` must be
rebuilt (`cd web/frontend && npm run build:check`) or the browser serves last night's bundle;
hard-reload the page.

**A. Web, desktop**

1. Open the board and press a key at the connect screen to reach the graphics prompt.
2. Answer `P` and press RETURN. EXPECT: the line `PETSCII: SIMULATING C64 DISPLAY (40X25)`.
3. EXPECT: the screen turns into the C64 canvas - **black screen, black border, no blue frame
   and no blue focus ring around it**, 40x25, PetMe64 glyphs.
4. EXPECT: `BBSTITLE.SEQ` paints onto the canvas, paced (not instant), with colours.
5. EXPECT: the system-password / `Username:` prompt lands ON THE CANVAS after the art (the
   charset flips to the text bank once, so the prompts read as mixed case, not all-caps).
6. Type a username. EXPECT: each character echoes on the canvas as you type. Then the password:
   EXPECT `*` per character.
7. EXPECT: bulletins and the main menu render on the canvas. An 80-column table showing only
   its left 40 columns is EXPECTED (that is the 40-col plan's work); prose (help, bulletins,
   mail bodies) must break at WORD boundaries, never mid-word.
8. Run `WHO` (or the who-is-online door). EXPECT: colours and cursor positioning land on the
   canvas - no stray `[33m`-style text, no ANSI escape text anywhere on screen.
9. Press `G` to log off. EXPECT: a clean goodbye, no exception in the browser console.
10. Reload the page and answer `A` (or just RETURN) at the graphics prompt. EXPECT: an ordinary
    80-column xterm screen - the canvas must NOT come back for an ANSI session.

**B. Web, mobile / handheld**

11. Repeat steps 1-9 on a phone or in a narrow handheld viewport, in BOTH portrait and
    landscape. EXPECT: the on-screen keyboard is available in either orientation, and keys
    typed on it echo on the canvas exactly like physical keys (that is the `injectInput` path).

**C. Real C64 / SyncTERM**

12. SyncTERM with `ScreenMode=C64`, or CCGMS on real hardware / VICE, telnet to the board's
    telnet port. EXPECT: no graphics prompt at all - the DEL probe (or TTYPE) classifies the
    caller and PETSCII starts immediately.
13. EXPECT: the title art, then the prompts, arrive as PETSCII with NO ANSI escape sequences.
14. Enter a door with a blessed list (for example the door menu). EXPECT: the cursor keys move
    the selection and RETURN picks it (Task 6's input map).
15. In chat, press F1. EXPECT: it exits chat.
16. NOTE for step 12-13 on SyncTERM specifically: SyncTERM's C64 mode starts on BASIC blue and
    ignores the CCGMS `$02` code, so the screen may stay blue where CCGMS shows black. The pen
    is re-asserted after every `$02`, so text colour must still be correct - report the
    background colour you see either way.

### Automated telnet evidence (already captured, 2026-09-02, dev backend on port 64128)

A raw socket connected, sent the single DEL byte `$14` that
`classifyFirstKeypress` uses to detect a C64, and captured every byte back (no browser
involved). Result:

- Before the probe: 1260 bytes, 58 `ESC` bytes - ordinary ANSI.
- After the probe: 1838 bytes, **zero `ESC` bytes**, 860 high-bit PETSCII bytes, two `$93`
  clears, reverse-video `$12`/`$92` pairs and PETSCII colour codes - the connect art in native
  PETSCII.
- Pressing RETURN twice then returned `Password:` and `Username:` as pure PETSCII (still zero
  `ESC` bytes), with exactly one `$0E` bank switch emitted by the transducer.

That verifies the server-side half of the walk (steps 12-13) mechanically. Steps 1-11, 14 and
15 still need the sysop's eyes.

### Verification sweep (2026-09-02, this commit)

- `cd sdk && npm run build` clean; `npm test` - **78 suites, 1142 tests, all passing**
  (including `tests/petscii/frame/corpus.test.ts`, which was red earlier in the day).
- `cd web/backend && npx tsc --noEmit` clean; `npx jest --config dev-scripts/jest.config.ts
  --rootDir . --testPathPattern="petscii"` - **13 suites, 177 tests, all passing**.
- `cd packages/terminal && npm run build` clean.
- `cd web/frontend && npm run build:check` clean (`dist/` refreshed); `npx vitest run
  src/components/__tests__/petscii-canvas-focus-ring.test.tsx` - 1/1 passing.
