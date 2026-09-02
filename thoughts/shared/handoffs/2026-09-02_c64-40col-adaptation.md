---
date: 2026-09-02
topic: C64 40-column adaptation (the whole board at forty columns)
tags: [c64, petscii, 40-col, doors, screens, tables, handoff]
status: implemented
---

# The board at forty columns

## Task(s)

Plan: `thoughts/shared/plans/2026-09-02-c64-40col-implementation.md`.
Ledger (every commit and every review finding): `.superpowers/sdd/2026-09-02-c64-40col/progress.md`.

All eight tasks are implemented and reviewed. The non-negotiables the sysop set
were (a) a caller who cannot render 80 columns is never dropped into an
80-column door, and (b) an 80-column caller's bytes do not change - both hold,
and (b) is pinned by literal byte tests on every surface, not by inspection.

| Task | What | Commit(s) |
|---|---|---|
| 1 | MIN_COLUMNS gate, default-closed at 80, `[40]` list marker, uppercase refusal notice | `159aa4cf5`, `c8f8ce233` |
| 2 | SDK 80-column render baseline (glyphs AND attributes) before any layout work | `cfd46a67e`, `e9156858a` |
| 3 | XXS=40 breakpoint tier, compact profile, geometry-driven responsive default; door width from one source | `dc4985329`, `d86fae95e`, `b237aacf8` |
| 4 | Viewers take the session width; the C64 command prompt drops the BBS name and leaves the cursor column | `714ca2c89`, `6b21aca41`, `1a84ed8df` |
| 5 | Sixteen table surfaces get a 40-column layout: files, WHO, messages, node status, protocol menu, conference lists, doors list | `84485dd20`, `386ee1bf8`, `2655ccb26`, `2fbcfcd2a`, `84ac446c9`, `4709e560e` |
| 6 | Six built-in doors adapted at 40: theme-picker, doors-menu, bug-tracker, DOORMAN, ami-stripper, phreakwars | `b5f99df67`, `de588f1d6`, `21d792b28`, `f49443df2`, `c8dd10373`, `f7bdae01d`, `84d81dfa7`, `6a75f1698`, `102b11c8d`, `6d23d7ce1`, `97a1ac1b5`, `b07bc8b24`, `11419ba24` |
| 7 | PETSCII text-screen reflow with the ANSI-art skip token; menus always reflow | `4d9020d9a`, `8f79723ac` |
| 8 | Wipe effects off for a PETSCII session; `BBSApi.write` through the session wrap; the 40-column sweep | `0471e7af7`, `2d65b923b`, `c2bad9de8` |

Nothing is pushed. The whole run lands as ONE push: Task 1 is a blanket
default-closed gate, so pushing it without Tasks 3/6 would take DOORMAN and the
rest away from a C64 caller.

## Critical references

- The choke: `web/backend/src/utils/wrap-for-session.util.ts` - `wrapForSession`
  (the BBS's prose) and `wrapDoorTextForSession` (a door's own prose). Both are
  identity for a non-PETSCII session at any width, identity at >=80, and
  identity for anything that positions the cursor (`positionsCursorAbsolutely`,
  `web/backend/src/utils/ascii-art.util.ts`).
- Widths: `sessionColumns()` / `resolveDoorMinColumns()` /
  `doorOpensForC64()` in `web/backend/src/utils/door-min-columns.util.ts`;
  `doorScreenWidth()` in `web/backend/src/amiga-emulation/xim/screen-width.util.ts`
  is the single door-width authority.
- Narrow table primitives: `web/backend/src/utils/table-format.util.ts`
  (`NARROW_WIDTH` 40, `NARROW_PROMPT_WIDTH` 39, `isNarrow`, `narrowClip`,
  `narrowField`, `narrowRule`, `narrowFileLines`, `narrowMailRow`).
- Screens: `petsciiTextScreenPlan()` in
  `web/backend/src/utils/ansi-art-detect.util.ts`; wired at
  `web/backend/src/handlers/screen.handler.ts` (art gate ~:1996, reflow ~:2262,
  wipe gate ~:2061).
- The SDK tier: `getCompactProfile()` /
  `sdk/engines/ui/blessed/core/responsive-constants.ts`; the 80-column golden is
  `sdk/tests/unit/forty-col-baseline.test.ts`.
- The sweep: `web/backend/tests/forty-col-sweep.test.ts`.

## The width ruling (why 40 and 39)

A CRLF-terminated ROW may use all forty columns: the PETSCII transducer latches
pendingWrap on the fortieth glyph and `newline()` consumes the latch
(`sdk/petscii/ansi-to-petscii.ts:108, :259-303`). A trailing PROMPT, which no
CRLF follows and on which the cursor rests, stops at 39 - otherwise the caller's
first keystroke lands on the next row.

## Learnings

- **The door is the wrong level.** Task 6 fixed phreakwars and ami-stripper row
  by row; Task 8 moved the rule into `BBSApi.write` so a door written next month
  is covered without knowing a C64 exists. The per-door work still earns its
  keep for LAYOUT (what column to drop), never for wrapping.
- **Effects-off beats effect-fitting.** The wipe animation, DOORMAN's masthead
  rail, the glitch and typewriter runners: at 40 columns they do not run. Every
  attempt to re-size an effect costs rows a C64 does not have.
- **`petsciiMode === true` is the only gate.** Gating on `screenWidth` alone was
  wrong and was caught early: `socket-handlers.ts` sets `screenWidth` from real
  xterm dimensions for EVERY web socket, so a phone in portrait would have been
  reflowed. Non-C64 platforms pay nothing for C64 support.
- **Default-closed for doors.** An absent MIN_COLUMNS means 80, for every door
  type. The permissive-absent design in the strategy plan would have opened all
  55 needs-80 doors to a C64 (and repeats the tooltype-default trap: a boolean
  tooltype cannot default to true).
- **A menu is never art.** Task 7's first art detector skipped MENU.TXT and
  MENU250 - the C64 got no menu at all. Menus always reflow, whatever they score.

## Known limits (deliberate, not defects)

1. **The telnet door family is deferred**: `telnet`, `bbslink`, `bbslinkwall`,
   `telnet-front`. They pipe a REMOTE 80-column session or remote art; there is
   nothing local to lay out. They stay gated (a C64 caller is refused with the
   notice).
2. **`BBSApi.write`/`writeLine` are wrapped; the door PROMPT paths are not**
   (`prompt()`, `getStr()` at `web/backend/src/doors/BBSApi.ts` ~:349, ~:398,
   ~:613). A prompt is short by convention and wrapping one moves the cursor off
   the input row. If a door ever ships a prompt past 40, wrap it at that call
   site, not in the choke.
3. **`writePetscii` / `writePetsciiLine` / `writeAuto` are untouched.** Those are
   raw PETSCII bytes - art - and the "never squeeze art" rule applies.
4. **80-column TABLE screens get the skip token**, not a reflow (bull1, bull11).
   Phase 3's `adaptRows` ladder could route them later.
5. **The art gate reads the RAW, pre-MCI content**; the reflow runs on the
   expanded text. An MCI code that introduces cursor motion makes the reflow a
   no-op for that screen - it goes out unwrapped rather than smeared, the safe
   direction. No screen on this board does it today.
6. **MCI codes inside `.seq` files still print literally** on a C64 (a `.SEQ`
   goes out raw over `petscii-bytes`). The sysop asked for this on 2026-09-02;
   it needs its own task (substitute on the byte stream, transduce the
   substituted VALUE in the active charset bank, leave the art bytes alone) and
   an express.e check first.
7. ~~**`reloadDoors` does not call `getAmigaDoorManager().refreshCache()`**~~ -
   CLOSED in the 2026-09-02 fix wave. `reloadDoors` refreshes the installed
   cache before re-registering, so a tooltype edit takes effect without a
   restart, as `CONFIGURATION.md` promises.
8. **The AmigaGuide viewer width parameter was withdrawn** (Task 4 review): it
   had zero call sites. That file is byte-identical to pre-plan.
9. **Operator chat keeps its 79-column positioned UI** - out of scope by
   decision, it paints rather than prints.
10. **The Sysop addition "frame the 80x25 terminal" is not done.** Plan
    `2026-09-02-c64-40col-implementation.md:1901-1904`: centre the terminal in
    the viewport and lift the page background off black via a design token.
    No commit in the run. Owner: the frontend/theme session (it is
    `web/frontend` + design tokens, not backend width work).
11. **The Sysop addition "SSH and telnet parity audit" is not done.** Plan
    `:1905-1906`, explicitly queued last: confirm a PETSCII caller arriving
    over SSH and over telnet gets the same 40-column treatment the web `P`
    session gets. No commit in the run. Owner: unassigned.
12. **`livechat` is auto-launched without being marked 40-ok.** `index.ts:1348`
    (web chat SSO) and `:1402` (chat-only mode) enter the livechat door
    directly, BEFORE the DOORS list and therefore before the `MIN_COLUMNS`
    gate. A PETSCII caller reaching the board through either of those paths
    gets an 80-column door. Neither path is how a C64 connects today, so this
    is recorded rather than fixed; marking `livechat` would require adapting
    it first (it branches on `breakpoint === 'small'` only,
    `Doors/livechat/server.ts:1266`).

## Verification (2026-09-02, this tree)

| Suite | Result |
|---|---|
| `sdk`: `npm run build` | clean |
| `sdk`: `npm test` | 85 suites / 1260 tests / 6 snapshots, all pass |
| `web/backend`: `npx tsc --noEmit` | clean |
| `web/backend`: full jest | 497 of 499 suites, 7395 passed, 9 failed, 10 skipped |
| `packages/terminal`: `npm run build` | clean |
| `web/frontend`: `npm run build:check` (tsc + vite) | clean |
| `web/frontend`: `npm test` (vitest) | 258 passed, 1 failed |

The failures, all foreign, re-run one at a time to separate flakes from reds:

- **Real, foreign:** `tests/doors/card-lobby-typechecks.test.ts` - card-lobby's
  `index.ts` is 2001 lines against a 2000-line ceiling (owner: the card-lobby
  session; its `dist` was staged in the shared index during this run).
- **Real, foreign:** `tests/services/bbs-config-round-trip.test.ts` -
  "saves anyway when the icon cannot be rewritten" expects
  `infoFileWritten === false` and gets `true` (owner: the bbsConfig/admin
  session).
- **Real, foreign:** `web/frontend .../rip-corpus-coverage.test.ts` - the RIP
  corpus walk exceeds vitest's 5s timeout (owner: the RIP/RIPtermJS session).
- **Load flakes, green on re-run:** `message-scan-parity`, `config-routes`,
  `delete-door-registration`, `door-admin-rescan`, `log-retention` (five
  10-second timeouts and one 50ms timing assert, on a machine running three
  suites at once).

## The sysop's manual C64 walk

Nobody may check these off but the sysop. Run it twice - once down the real
telnet path, once in the browser - and once more at 80 columns as the
no-change check.

Before starting: the backend must be running the code above
(`./dev/scripts/start-servers.sh --bbs-only`; a restart drops every connected
session, so announce it).

### A. Web P-session (browser, `localhost:8080`)

1. Open the board in the browser. At the graphics prompt answer **P**.
   EXPECT: the canvas switches to a 40x25 C64 screen, black ground, PetMe64
   font. Nothing ANSI, no overlay.
2. Log in with a normal account.
   EXPECT: every prompt fits the screen; no line wraps mid-word; no escape
   sequences printed as text.
3. The main menu appears.
   EXPECT: it is REFLOWED, not skipped and not smeared - every row inside 40
   columns, no `~WX` printed, and **no wipe animation at all** (the menu paints
   in one go; that is the fix, not a bug).
4. Press **B** and read a bulletin.
   EXPECT: a text bulletin reflows to 40 columns with every word intact. An
   ANSI-art bulletin shows `[80-COLUMN ANSI SCREEN - SKIPPED]` instead of
   smeared art.
5. Look at an art screen that has a `.seq` variant if the board has one
   (`Screens/*.seq`).
   EXPECT: the `.seq` is sent raw and looks like C64 art. Where there is no
   `.seq`, the skip token above - never smeared CP437.
6. Press the doors command to list doors.
   EXPECT: the list fits 40 columns; adapted doors carry ` [40]`; doors that
   reach 40 through the C64 adapter carry ` [C64]`; nothing carries both.
7. Launch **DOORMAN**.
   EXPECT: one column, not two side-by-side panels; a one-row header and
   footer; no frames; the `////////` masthead rail is STILL (it does not
   animate at 40); no stray glyphs mid-row.
8. Launch **THEME** (the theme picker).
   EXPECT: theme names only - no blurb column - inside 40 columns; the picker
   works and the choice sticks.
9. Launch a gated 80-column door (e.g. **GMASTER**).
   EXPECT: `THIS DOOR NEEDS AN 80 COLUMN SCREEN` and straight back to the
   menu. No blank screen, no half-drawn board.
10. Run the file listing (**F**).
    EXPECT: two-line rows - name and size on one row, description under it -
    nothing past column 40, nothing clipped away.
11. Read a message (**R**).
    EXPECT: the header as stacked `Field  : value` lines, one per row; the body
    wrapped at 40.
12. Run **WHO**.
    EXPECT: username and status only (the Real Name column is gone), and a rule
    of 39 dashes.
13. Look at the command prompt itself.
    EXPECT: no BBS name, no the word "Menu" - e.g.
    `[2:Amiga Demo Scene Chat!] (120 mins): ` - and it stops one column short
    of the right edge, so your first keystroke stays on the same row.
14. If the sysop has marked WHO/S/WHAT `C64_ADAPT` in their `.info`
    (Phase 3's Task 8 owns those marks -
    `.superpowers/sdd/2026-09-02-c64-door-adapter-p3/progress.md`), launch one.
    EXPECT: the 68K door's 80-column screen arrives adapted to 40 columns,
    header intact, at most 25 rows.
15. Log off (**G**).
    EXPECT: a clean logoff, `Logoff.seq` where the board has one.

### B. Real C64 path (SyncTERM in C64 mode, CGTerm, or a real machine on telnet)

16. Connect by telnet. At the connect screen press **DEL**.
    EXPECT: PETSCII mode engages by itself (the DEL probe), 40x25.
17. Repeat steps 2-15 above. Everything should read the same; this path is the
    one that proves the autodetect and the telnet emitter agree with the web
    canvas.

### C. The 80-column no-change check (any normal ANSI terminal)

18. Log in at 80 columns and run **F**, **WHO**, **R**, the doors list, a
    bulletin with a wipe (`~WX`), and one blessed door.
    EXPECT: identical to before this plan landed - the wipe still animates, the
    tables keep their wide columns, the prompt still carries the BBS name.

## Next steps

1. **The push.** Land Tasks 1-8 as one push (see the landing rules in
   `thoughts/BOARD.md`: cherry-pick onto a fresh `origin/main` worktree, never
   merge this branch).
2. The sysop's walk above, all three parts.
3. The open items in "Known limits": MCI in `.seq` (6) is the one with real
   user impact left; (7) is closed. The two Sysop additions (10, 11) and the
   livechat auto-launch (12) are the newly recorded ones.
4. Phase 3's remaining `.info` marks for WHO/S/WHAT.
