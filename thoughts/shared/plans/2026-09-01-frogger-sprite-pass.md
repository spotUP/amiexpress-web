# Frogger: animated cell-art sprites, the Pengo treatment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Frogger's presentation on the cell-art sprite engine, exactly as Pengo was: animated `.sprite.json` sprites, an arcade-accurate palette, a pure `buildBoard()` renderer, on a 16-column board of Pengo-sized 5x2 cells.

**Architecture:** Presentation-layer rebuild. Frogger's rules are already FAQ-complete (`Doors/frogger/CHECKLIST.md`: 51 items, 46 DONE, 5 EXEMPT, 0 OPEN) and must stay that way — this plan changes how the board is DRAWN and, unavoidably, the board's COLUMN COUNT, which the rules read from constants. The game's simulation, timers, scoring and 110 existing tests are the thing being protected, not rewritten.

**Tech Stack:** TypeScript, `sdk/engines/graphics/cell-art` (CellBuffer, Sprite, `createBuffer`, `blitSprite`), the door's existing blessed screen and test harness.

**Spec / references:**
- The user's directive of 2026-09-01: "turn frogger into a sprite based game with animations", "like how pengo is done with animated sprites".
- **The arcade sprite sheet** the user supplied (Frogger arcade, ripped by GaryCXJk, reripped by 125scratch). It must be saved into the repo at `Doors/frogger/reference/frogger-sprites.png` before Task 2 — the plan cannot proceed to art without the file on disk. It contains: frog states, both death animations (splat and drown), the attract-mode row, cars in several colours, trucks, three log lengths, the turtle dive frames, crocodile, snake, lady frog, fly, score popups, the FROGGER logo, and a full font in several colours.
- **The Gameduino tutorial**, already in project memory as this task's build reference: `frogger1.html` (sprite sheet + background prep), `frogger2.html` (lane y-coordinates 152/168/184/200/216 road and 56/72/88/104/120 river, per-lane speeds — trucks half speed, racecars double, long logs 1.25x, turtle 3-frame animation at `t/32%3`, 75px car spacing), `frogger3.html`.
- **Pengo** is the worked precedent for every structural question: `Doors/pengo/game/render.ts` (pure `buildBoard(data, sheet, tick)`), `Doors/pengo/sprites/*.sprite.json`, and how `Doors/pengo/index.ts` wires the buffer to the screen.

## Global Constraints

- Repo root: /Users/spot/Code/amiexpress-web. All paths relative to it.
- **Frogger's FAQ conformance must not regress.** `Doors/frogger/CHECKLIST.md` is the ledger; it stays at 0 OPEN. Any item this plan is forced to change status on gets an explicit line in the checklist and a note in the task report — silently breaking a DONE item is the worst outcome available here.
- **The 110 existing tests are the safety net.** They may need mechanical updates where they assert column numbers (40 -> 16) or rendered glyph strings; a test whose MEANING changes is a finding, not a chore. Never delete a test to make a change pass.
- Door checks: `cd Doors/frogger && npx tsc --noEmit -p tsconfig.json && npm test`.
- `Doors/*/dist` IS committed (a pre-commit hook rebuilds and stages it); `sdk/dist` is gitignored.
- Never `git add -A` — stage by name. Commit locally. NEVER push. NEVER run kill-servers/start-servers. No subagents of your own.
- New files LF. No emoji. ASCII tokens only in any status/log output.
- RED checks are by DELETING code, never commenting it out.
- Doors own the full 80x25 terminal (only the BBS proper is 80x23).
- Commit trailers, both lines, verbatim:
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF

## The geometry, decided

The user chose Pengo fidelity: **5 chars wide x 2 rows tall per cell**, the same cell as every Pengo sprite, so sprite work transfers directly.

That fixes the board:

| | |
|---|---|
| 16 columns x 5 chars | 80 columns |
| 5 road + median + 5 water = 11 animated lanes x 2 rows | 22 rows |
| start bank + home row, static scenery, 1 row each | 2 rows |
| **board total** | **24 rows** |
| status line | 1 row |
| **screen** | **25 rows** |

Consequences, all of which are this plan's work:
- `GRID_WIDTH` 40 -> 16. Every column-space value rescales: `HOME_POSITIONS` (today `[4,12,20,28,36]` in 40-space), `OBJECT_WIDTHS`, lane speeds (cells/sec must be re-derived so apparent speed is unchanged), and the frog's step size.
- The frog now hops in 16 columns rather than 40. The arcade's playfield is ~13-14 columns, so this is closer to the original, not a degradation — but it IS a gameplay change and the checklist must be re-walked for any item that depends on column granularity.
- Home positions must land on integer columns and stay evenly spaced. In 16-space the five homes cannot sit on the exact fifths they occupied in 40-space; Task 1 decides and documents the mapping, and `HOME_CENTRE_OFFSET` / `HOME_WIDTH` follow from it.

---

### Task 1: The 16-column board (rules only, no sprites yet)

**Files:**
- Modify: `Doors/frogger/game/constants.ts`, and every module that reads the rescaled constants (`game/frogger-game.ts`, `game/attract.ts` as needed)
- Test: the existing suite under `Doors/frogger/tests/` plus a new `tests/geometry.test.ts`

**Interfaces:**
- Produces (Tasks 2-4 consume these): `GRID_WIDTH = 16`, `CELL_WIDTH = 5`, `CELL_HEIGHT = 2`, a `LANE_ROWS` mapping from lane index to its top screen row (accounting for the 1-row banks), and rescaled `HOME_POSITIONS` / `OBJECT_WIDTHS` / lane speeds.

**Steps:**

- [ ] **1. Write the failing geometry tests first**: every lane's top row derived from `LANE_ROWS` is an integer; the lanes tile without overlap; the board occupies exactly rows 0-23 with the status line at 24; `HOME_POSITIONS` are integers within `0..GRID_WIDTH-1`, evenly spaced, and each home's centre column is reachable by the frog's step; `GRID_WIDTH * CELL_WIDTH === 80`.
- [ ] **2. Run; verify they fail.**
- [ ] **3. Rescale the constants.** Derive lane speeds so APPARENT speed (cells crossed per second on screen) is unchanged from today — show the arithmetic in the report; a lane that visibly speeds up or slows down is a regression the tests will not catch. Decide and document the home-column mapping.
- [ ] **4. Fix every consumer** the typecheck and suite surface. Where a test asserts a column number, update the number and NOT the assertion's meaning; where a test asserts a rendered string, leave it for Task 3 (it will be replaced wholesale) and note it.
- [ ] **5. Re-walk `CHECKLIST.md`** for items that depend on column granularity (home placement, "exact centre" landing, object widths). Update statuses ONLY where the behavior genuinely changed, with a written reason.
- [ ] **6. Suite green; RED by deletion of the `LANE_ROWS` derivation; commit** `refactor(frogger): a 16-column board of 5x2 cells`.

### Task 2: The sprite sheet

**Files:**
- Create: `Doors/frogger/sprites/*.sprite.json`, `Doors/frogger/reference/frogger-sprites.png` (the user's supplied sheet, committed as the reference)
- Test: `Doors/frogger/tests/sprites.test.ts` (new)

**Prerequisite:** the reference PNG must exist at that path. If it does not, STOP and report — do not invent the art.

**The inventory**, from the sheet and the game's own entity list:
- `frog`: `idle`, `hop-up`, `hop-down`, `hop-left`, `hop-right`, `death-splat` (road), `death-drown` (water), `home` (seated in a home)
- `car`: one sprite per arcade colour on the sheet, `idle` only (they do not animate)
- `truck`: `idle`
- `log`: `short`, `medium`, `long` — the sheet has three lengths
- `turtle`: `up`, `sinking`, `under` — the FAQ's three states, which the door already drives on timers (`TURTLE_SURFACE_DURATION`, `TURTLE_WARNING_MS`, `TURTLE_DIVE_DURATION`), so the animation frames map to existing state, not a new clock
- `crocodile`: `mouth-closed`, `mouth-open`
- `snake`, `otter`, `lady-frog`, `fly`: `idle` plus movement frames where the sheet provides them
- `home`: `empty`, `occupied`, `crocodile`

**Steps:**

- [ ] **1. Sample the palette from the reference PNG** and map each colour to the nearest of the cell-art engine's 16 indices. Record the mapping in the report — this is the step that makes the door look like the arcade rather than like a guess.
- [ ] **2. Write the failing test**: every sprite file parses through the engine's `parseSprite`; every sprite is exactly `cellW: 5, cellH: 2`; every animation named in the inventory above exists; the turtle has all three states; the frog has all four hop directions and both deaths.
- [ ] **3. Author the sprites** at 5x2 cells, half-block pixels, following `Doors/pengo/sprites/*.sprite.json` for format. Multi-cell entities (cars, trucks, logs) are authored as their full width — check how Pengo handles a multi-cell entity before inventing a convention.
- [ ] **4. Suite green; commit** `feat(frogger): arcade sprite sheet as cell-art sprites`.

### Task 3: The renderer

**Files:**
- Create: `Doors/frogger/game/render.ts`
- Modify: `Doors/frogger/game/frogger-game.ts` (its `render()` currently builds a string and calls `renderCallback`), `Doors/frogger/index.ts` (sheet loading and wiring)
- Test: `Doors/frogger/tests/render.test.ts` (new); existing tests that assert rendered strings

**Interfaces:**
- Consumes: Task 1's geometry, Task 2's sprites.
- Produces: `buildBoard(data: FroggerData, sheet: Record<string, Sprite>, tick: number): CellBuffer` — pure, exactly Pengo's shape.

**Steps:**

- [ ] **1. Read `Doors/pengo/game/render.ts` completely** before writing anything. Layer order is meaning there ("terrain first, then eggs, then Sno-Bees, then the penguin - the player is never hidden by scenery"); Frogger's equivalent order is: water/road surface, then logs and turtles, then vehicles, then predators, then the frog, then the homes' contents. State the order you chose and why.
- [ ] **2. Write the failing tests**: a frog on a log renders the frog, not the log; a turtle in `under` state renders as water with the frog still drawn on top (the frog drowns by rule, not by rendering); the board buffer is exactly 80x24; each lane's sprites land on that lane's rows.
- [ ] **3. Implement `buildBoard`.** Pure in (data, sheet, tick) — no socket, no clock of its own.
- [ ] **4. Wire it**: load the sheet at door start (Pengo's loader is the precedent), convert the buffer to blessed tags, and hand it to the existing render callback. Delete the string renderer and its glyph constants once nothing references them — a dead `FROG_GLYPH` left behind is exactly the kind of thing that gets "fixed" back into use later.
- [ ] **5. Update the string-asserting tests** from Task 1's list: they become buffer assertions with the SAME meaning. Any test whose meaning cannot be preserved is a finding to report, not a test to delete.
- [ ] **6. Suite green; RED by deletion of the frog's blit; commit** `feat(frogger): the board is drawn from sprites`.

### Task 4: Animation and polish

**Files:**
- Modify: `Doors/frogger/game/render.ts`, `Doors/frogger/game/frogger-game.ts` (frame counters only where an animation needs one)
- Test: `Doors/frogger/tests/animation.test.ts` (new)

**Steps:**

- [ ] **1. Write the failing tests**: the frog's hop animation advances with its move and returns to `idle`; a death animation plays its frames and holds on the last; the turtle's three states follow the existing timers (assert against the timer constants, not wall-clock); a car's sprite is stable across ticks (it does not animate).
- [ ] **2. Drive animations from state the game ALREADY has** wherever possible — the turtle timers, the frog's death type and death frame, the hop in progress. Add a counter only where none exists, and say which you added.
- [ ] **3. The score popups and the fly** from the sheet: render them if the game already models them; if it does not, note it and leave them out rather than inventing gameplay.
- [ ] **4. Suite green; commit** `feat(frogger): sprites animate`.

### Task 5: Sweep and the user's checklist

- [ ] `cd Doors/frogger && npx tsc --noEmit -p tsconfig.json && npm test` — report totals against the 110 baseline.
- [ ] Confirm `CHECKLIST.md` still reads 0 OPEN, and list every item whose status this plan changed, with reasons.
- [ ] Controller: restart the backend per `.claude/skills/door-sdk-freshness/SKILL.md`; verify a fresh `Registered door: FROGGER`.
- [ ] The user's manual checklist (do not check these yourself):
  - [ ] the board looks like arcade Frogger: colours, vehicles, water, homes
  - [ ] the frog animates as it hops, in all four directions
  - [ ] both deaths animate (run over on the road, drowned in the water)
  - [ ] turtles visibly sink and surface, and the frog drowns on a submerged one
  - [ ] the game still plays exactly as it did: timing, difficulty, scoring
  - [ ] a second pass on the sprite art against the reference sheet, if anything reads wrong

## Self-review (at writing time)

- The user's two decisions are honored: Pengo-fidelity 5x2 cells (geometry section), and tutorial-plus-screenshot art (Task 2 works from the supplied sheet, with the palette sampled rather than guessed).
- The FAQ-complete rules are protected by making the checklist a gate in Tasks 1 and 5 rather than an afterthought.
- Type consistency: `GRID_WIDTH`/`CELL_WIDTH`/`CELL_HEIGHT`/`LANE_ROWS` (T1) are consumed by T2's sprite dimensions and T3's `buildBoard`; `buildBoard`'s signature matches Pengo's precedent exactly.
- Known risk named in-task: lane-speed rescaling is arithmetic no test will catch if done wrong, so T1 step 3 requires the arithmetic in writing.
- YAGNI: no scrolling camera (the board fits), no new gameplay, no two-player, no attract-mode rework beyond what the renderer swap requires.
