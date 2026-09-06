---
date: 2026-09-06
topic: "80-column PETSCII (C128 / VDC) for the web terminal"
tags: [petscii, c128, vdc, 80-column, transducer, canvas, screen-width]
status: draft
---

# 80-column PETSCII for the web terminal

## What this is, and what it is not

A fourth screen: **80x25 PETSCII, C128 VDC style**, served to the board's own
web terminal. The caller answers for it at the graphics prompt and gets
Commodore glyphs at 80 columns on the canvas we already ship.

It is **not** a caller-facing mode for real C128 terminal programs. That is a
different, larger thing, and
`thoughts/shared/research/2026-09-06_c128-80-column-petscii.md` argues against
it on four grounds. Three of those four are about serving *other people's
clients* and do not apply here:

| Research objection | Does it apply to the web terminal? |
|---|---|
| Fourth screen: CGA palette, C128 font, four divergent control bytes | **Yes.** Palette and font are real work; the control bytes are ours to not emit. |
| Per-door tax, ~33% forever | **Mostly no.** At 80 columns a door draws its EXISTING 80-column layout. No door is adapted, no door is re-marked, nothing new is proven per door. |
| Clients disagree, so no single oracle | **No.** We are the only client. Our canvas is the oracle. |
| Zero observed C128 callers | **No.** The audience is our own web callers, who all have this terminal. |

So the honest cost here is the first row plus the geometry split - not the
whole fourth-screen tax. The telnet port for real C128 callers
(`TELNET_PETSCII80_PORT`) is explicitly **out of scope**; the geometry split
this plan lands is the thing that would make it cheap later.

## The decision that shapes everything

`petsciiMode` is one boolean doing two jobs: *send PETSCII bytes* and *the
screen is 40x25*. **87 call sites** reference it. The split is the first phase
and the rest of the plan depends on it.

The split is **additive, not a rename**: `petsciiMode` keeps meaning "PETSCII
bytes", and a new `session.petsciiColumns: 40 | 80` (absent = 40) carries the
geometry. Renaming 87 sites buys nothing and risks everything; the two
functions that actually decide width read the new field.

## Where the 40 lives (measured, not assumed)

| Layer | State | Cost |
|---|---|---|
| `sdk/petscii/frame/**` | Already parameterised - `adapt.ts`, `frame-render.ts`, `cupTo` all take `cols`/`rows` with 40/25 as defaults; `ansi-screen.ts` defaults to 80 | Near zero. At `cols=80` the 80→40 fold becomes the identity |
| `sdk/petscii/ansi-to-petscii.ts` | `const COLS = 40; ROWS = 25` used in ~20 places | Mechanical |
| `sdk/petscii/petscii-machine.ts` | `COLS/ROWS/CELLS` constants, arrays in field initialisers, `cols: 40; rows: 25` as LITERAL TYPES, and KERNAL logical lines | Real. See Phase 2 |
| `web/backend/src/amiga-emulation/xim/screen-width.util.ts` | `:35` forces a PETSCII width back to 40; `:67` ignores reported height; `:110` refuses client geometry | The split |
| `packages/terminal/src/petscii/PetsciiCanvas.tsx` | `COLS = 40, ROWS = 25` module constants; canvas size, aspect box and paint loop derived from them | Mechanical, but every layout number moves |
| `packages/terminal/src/components/BBSTerminal.tsx:2295` | `if (size.cols === 40 && size.rows === 25)` IS the canvas-mount switch | Phase 3 |
| `packages/terminal/src/petscii/glyph-atlas.ts` | Indexed by screen code, font PetMe64 | Free for glyphs; a second font for C128 lowercase |

## Decisions taken (no open questions)

1. **The 80-column screen model is OURS, and named so.** `PetsciiMachine` stays
   at 40 and keeps modelling the C64 KERNAL. The 80-column model is a separate
   construction whose semantics we define, because the thing it describes is our
   canvas, not a C128. It is NOT called `PetsciiMachine80`, and it makes no
   claim about DesTerm or SyncTERM.
2. **Logical lines do not exist at 80.** The KERNAL rule that INSERT/DELETE
   operate on is "two 40-column rows are one 80-character line"
   (`petscii-machine.ts:345`). At 80 columns per row that rule has no meaning;
   a row is a line.
3. **The palette at 80 is CGA/RGBI**, per CTerm Table 19 - the VDC's own
   colours, which differ from VIC-II in four places (orange becomes dark
   purple if you get this wrong). A second nearest-match, not a widened one.
4. **`$02` is never emitted at 80.** Our background/border convention is a
   CCGMS *terminal* convention; on a C128 80-column screen `$02` is UNDERLINE
   ON. The canvas paints its own ground from the mode default (`$07`, light
   grey on black).
5. **The mode is chosen, never detected.** Nothing on the wire distinguishes a
   C128-at-80 from a C64-at-40. The graphics prompt gains `P8`.
6. **Art:** a 40-column `.seq` is not stretched or folded onto an 80-column
   screen. It is skipped with the same token an 80-column ANSI screen is
   skipped with for a C64 today. 80-column `.seq` art is a sysop commission,
   not this plan's work.
7. **`C64_ADAPT=40` doors open at 80.** 40 is a claim about the narrowest
   screen the door survives; a wider one satisfies it. `MIN_COLUMNS` is
   already a minimum and needs nothing.

## Phase 0 - Probe before code

One measurement, because two numbers in this plan are guesses until it runs:

- Does **PetMe128** exist as a web font we can ship, and do its glyphs land on
  the same screen-code order PetMe64 uses (`0xE000 + bank*0x100 + sc`,
  `glyph-atlas.ts:37`)? If the ordering matches, the atlas is a font-name
  parameter. If it does not, the atlas builder needs a second mapping and this
  phase says so before Phase 4 is estimated.
- Render one 80x25 buffer through the existing canvas with `COLS/ROWS` forced,
  and record the produced footprint - `UNIT_W`/`UNIT_H` and the fit - so Phase
  4 changes numbers that were measured rather than derived twice.

Output: a short note appended to the research doc. **No production code.**

## Phase 1 - Geometry becomes data

Files:
- `web/backend/src/index.ts` - `petsciiColumns?: 40 | 80` on the session, with
  the comment that says why it is separate from `petsciiMode`.
- `web/backend/src/amiga-emulation/xim/screen-width.util.ts`
  - `doorScreenWidth()`: a PETSCII session answers `session.petsciiColumns ?? C64_COLUMNS`, instead of forcing 40 (`:35`).
  - `doorScreenHeight()`: unchanged at 25 - both screens are 25 rows.
  - `applyClientReportedGeometry()` (`:110`): still refuses client geometry for a PETSCII session. The width is the MODE's, never the browser's. This is the rule that stopped a `P` answer from inheriting the xterm's 80, and it must survive.
- `web/backend/src/doors/BBSApi.ts:261` - height through `doorScreenHeight()` rather than a hardcoded 25, so there is one answer, not two.
- `web/backend/src/utils/door-min-columns.util.ts`
  - `sessionColumns()` - already routes through `doorScreenWidth`, so it follows for free; update the comment that says a PETSCII session is always 40.
  - `doorShowsC64Mark()` (`:262`) - `claim <= C64_COLUMNS` becomes "the claim is satisfied by this session's width", so the DOORS list does not lie to one of the two widths.
- `web/backend/src/server/c64-door-adapter.ts:254` - `Math.min(C64_COLUMNS, ...)` becomes the session's width; `const ROWS = 25` stays.

Tests to change from "40 is the answer" to "40 is this session's answer":
`web/backend/tests/xim/door-screen-width.test.ts:26,27,32`,
`tests/server/petscii-session-geometry.test.ts:72,74,110,147`,
`tests/doors/bbsapi-terminal-size.test.ts:43,49,138`.
Each keeps its 40 case and gains the 80 case beside it.

**Automated verification:** `npm test -- tests/xim tests/server tests/doors`
in `web/backend`; `npm run typecheck:tests`; the whole `compact-40` directory
and `forty-col-sweep` stay green untouched - they describe a 40-column session
and that session still answers 40.

**Red proof:** set `petsciiColumns = 80` on the fixture session in
`door-screen-width.test.ts` and the new expectation must fail before the
`:35` change lands.

## Phase 2 - The transducer at two widths

- `sdk/petscii/ansi-to-petscii.ts`: `COLS`/`ROWS` become instance fields set
  from a constructor option (default 40/25). ~20 sites, mechanical: TAB clamp
  (`:253`), bottom-right guard (`:329`, `:388`), pending-wrap correction
  (`:478`), CUU/CUD/CUF/CUB (`:617-620`), `clampCol`/`clampRow` (`:634-635`),
  `fillRow`/ED (`:704`, `:724-739`).
- The `$14/$94` bottom-right idiom is written around cell 39/24 and must be
  re-derived from the instance's own last cell, not from the constant.
- `$02` suppression: at 80 columns the full-clear path emits no `$02 <colour>`
  pair at all.
- Colour: a second table and a second nearest-match against CGA/RGBI, selected
  by the transducer's mode. The VIC-II path is untouched.
- `sdk/petscii/petscii-machine.ts` stays at 40. The 80-column model is a new
  file beside it, sharing the cell/colour-RAM shape but not the logical-line
  linking, and named for what it is.

**Automated verification:** `sdk` unit suites; every existing
`sdk/tests/petscii/**` file stays green with no edit - they construct the
default, which is still 40x25.

**Red proof:** construct the transducer at 80 and assert a CUP to column 79
lands; force the old constant back and it must clamp to 39.

## Phase 3 - The flip, and telling the browser

- `web/backend/src/handlers/command-handler/pre-login.ts:146` - the answer
  parse gains `P8`: `petsciiMode = true`, `petsciiColumns = 80`,
  `screenWidth = 80`, `screenHeight = 25`. Plain `P` is unchanged in every
  respect.
- `:163` currently emits `terminal-resize {cols:40, rows:25}`, and
  `BBSTerminal.tsx:2295` uses that literal to decide whether to mount the
  canvas at all. **The mode signal must stop being the geometry.** A new
  `petscii-mode` event carries `{ cols, rows, palette }`; the browser mounts
  the canvas on THAT, and keeps the 40x25 literal as the legacy path so a
  mid-deploy session does not lose its screen.
- The new event needs a ruling in
  `web/backend/src/server/transport-event-rulings.ts` (`kind: "web-only"` -
  a byte transport has no canvas) and the census pins in
  `web/backend/tests/transport/transport-adapter.test.ts` move by one, the
  way `door:active-client` did on 2026-09-06.

**Automated verification:** `tests/transport/transport-adapter.test.ts`
(census), `tests/handlers/graphics-answer.test.ts` (the `P` emit is unchanged,
a new case for `P8`).

## Phase 4 - The canvas

`packages/terminal/src/petscii/PetsciiCanvas.tsx`: `COLS`/`ROWS` become props
fed by the `petscii-mode` event, defaulting to 40/25. `UNIT_W`/`UNIT_H`
(`:63-67`), the backing-store size (`:135-136`), the background fill (`:177`),
the paint loop (`:179-181`) and the cursor index (`:202`) all derive from the
props - which they already do arithmetically, so this is a parameterisation
rather than a rewrite. `BBSTerminal.tsx:3638`'s `352x232` comment moves with
it.

The atlas gains the font as a parameter (PetMe64 / PetMe128) and the tint
cache is keyed by it. The palette gains the CGA set beside
`C64_PALETTE_COLODORE`.

**Automated verification:** `web/frontend` vitest, including a new case in the
canvas suite that mounts at 80x25 and asserts the paint loop covers 2000
cells and the footprint matches Phase 0's measurement.

## Phase 5 - Doors, for free

At `cols = 80` the frame adapter's fold is the identity, so a 68K door paints
its native 80x25 and every `C64_ADAPT=40` door opens. A TypeScript door gets
`{width: 80, height: 25}` from `BBSApi` and draws its ordinary 80-column
layout - `isCompactWidth(80)` is false, so no compact path runs. Nothing is
adapted and nothing is re-marked.

**Automated verification:** the `compact-40` suite unchanged (40 still folds),
plus one new test driving a marked door at `petsciiColumns = 80` through the
real `executeDoor` and asserting no row exceeds 80 and no `ESC` reaches the
wire.

## Phase 6 - Content

`.seq` art stays 40-column. An 80-column PETSCII session skips it with the
existing token rather than folding or stretching it, and the sysop commissions
80-column `.seq` art if and when the mode earns it.

## Verification, whole-plan

```
cd web/backend && npm test && npm run typecheck:tests
cd sdk && npm test
cd web/frontend && npx vitest run
cd packages/terminal && npx tsc --noEmit
cd Doors/grandmaster && npm test
```

Manual walk, the sysop's to tick, not mine:
- a web `P` session is byte-identical to today's;
- a web `P8` session shows 80 columns of Commodore glyphs, correct colours,
  no underline anywhere;
- one door of each kind at `P8`: a TypeScript door, a marked 68K door;
- a real C64 over telnet still gets exactly 40x25.

## Risks

- **The 87 `petsciiMode` sites.** Phase 1 changes none of them, which is the
  point - but any one of them may hide its own 40. The sweep to find them is
  `grep -n "40" $(grep -rl petsciiMode web/backend/src)`, and it belongs in
  Phase 1, not after the canvas is already 80 wide.
- **Two widths, one transducer instance per session.** A session that changed
  width mid-flight would keep a stale model. The mode is chosen at the
  graphics prompt and never changes after, and `resetPetsciiModel(session)`
  already exists for the one place it does.
- **`PetMe128` may not be a shippable web font.** Phase 0 answers this before
  Phase 4 is scheduled; if it is not, 80-column mode ships on PetMe64 and the
  lowercase glyphs are wrong in a documented, visible way.
