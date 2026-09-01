---
date: 2026-09-01
topic: Pengo door vs. two independent arcade-mechanics reference implementations, plus original level-data provenance
tags: [pengo, doors, arcade, research, sprite-engine, gap-analysis]
status: final
---

# Pengo: our door vs. two reference implementations, and where the original levels live

## Scope and method

Two independent, non-affiliated fan/student remakes of Sega's 1982 *Pengo* were
mined for **mechanics** (rules, numbers, state machines) — not code. Nothing
below is copied source; constants and short rule descriptions are quoted where
that's the only way to state a fact precisely.

- **Reference 1 — PenguBruh-Pengo** (`github.com/OCA99/PenguBruh-Pengo`,
  branch `master`). C++/SDL2, MIT + zlib licensed. A CITM Barcelona student
  project (four authors, per `TASKS.md`). Files read in full: `Enemy.h/.cpp`,
  `Block.h/.cpp`, `Block_Diamond.cpp`, `Block_Egg.h/.cpp`, `Block_Normal.cpp`,
  `ModuleBlocks.cpp`, `ModuleEnemies.h/.cpp`, `ModuleWalls.cpp`,
  `ModulePlayer.cpp`, `Score.cpp`, `SceneLevel.cpp`, `ScenePoints.cpp`,
  `Globals.h`, `SceneLevel1.cpp` (partial, for level-format confirmation),
  `README.md`, `TASKS.md`.
- **Reference 2 — cpp-pengo** (`github.com/Akadeax/cpp-pengo`, branch `main`).
  C++/SDL2 on a custom "Minigin" engine, **Unlicense** (public domain). Claims
  in its own README: *"all the gameplay features of the original Pengo,
  including all 16 original levels and 2 player co-op."* Files read in full:
  `Game/Block.h/.cpp`, `Game/GridManager.h/.cpp`, `Game/GameManager.h/.cpp`,
  `Game/SnobeeController.h/.cpp`, `Game/SnobeeChaseState.cpp/.h`,
  `Game/SnobeeStunState.cpp/.h`, `Game/PlayerController.cpp`,
  `Game/PlayerInteractState.cpp`, plus `Game/Data/Levels/1.json` and
  `16.json`, `LICENSE`, `README.md`.

Where the two disagree, both readings are given — no tie-break was attempted;
I found no primary documentation of the 1982 arcade original's exact numeric
constants to use as a tiebreaker, only these two clones' independent claims.

---

## 1. How our Pengo door is built

`Doors/pengo/` is a TypeScript door on the SDK's `cell-art` sprite engine
(`sdk/engines/graphics/cell-art`), driven by a single `blessed` `Screen`
created with `input: null` — all keyboard/mouse routing goes through
`DoorInputManager` (`Doors/pengo/index.ts:597-605`), not blessed's own key
handling.

- **Entry point**: `Doors/pengo/index.ts`. Wires the `CoreDoor` SDK, owns all
  mutable state at module scope (`gameData`, `screen`, `game`, `inputManager`,
  etc. — `index.ts:34-43`), and contains `handleInput()`, a single `switch
  (gameData.state)` that routes to per-state handlers
  (`index.ts:280-330`).
- **Game state**: `GameState` is a 9-member union — `menu | playing | dying |
  levelComplete | gameover | highscores | enterName | paused | help`
  (`game/types.ts:6-15`). Two of the nine (`dying`, `levelComplete`) are
  timed hand-overs the game loop itself drives (death via
  `pengo.isDead`/`deathFrame`; level transition via a `setTimeout` inside
  `PengoGame.update()`), and the input switch must no-op on both rather than
  route anywhere — this was fixed today (`index.ts:308-327`,
  `tests/state-routing.test.ts`) after a keypress during `levelComplete` fell
  through a destructive `default: showMenu()` and looked like "the game ends
  after level 1." The current `default` case is a compile-time
  exhaustiveness guard (`const _exhaustive: never = gameData.state`), not a
  runtime action.
- **Game engine**: `game/pengo-game.ts`, class `PengoGame`. Holds a
  `PengoData` (`game/types.ts:74-104`) — score, lives, level, timer, a
  `CellType[][]` grid, arrays of enemies/eggs, a `Pengo`. `update()` is
  called once per `GAME_TICK_MS` (100 ms, `game/constants.ts:33`) from a
  `setInterval` in `index.ts:256-266`. All gameplay math is per-tick/per-cell
  integer grid math — there is no sub-cell/pixel position anywhere in
  `PengoData`.
- **Board**: `game/render.ts`, function `buildBoard(data, sheet, tick)` — pure
  `(data, sheet, tick) -> CellBuffer`. Layers terrain, then eggs, then
  Sno-Bees, then Pengo, each via `blitSprite` against a loaded
  `Record<string, Sprite>` (`sdk/engines/graphics/cell-art`,
  `sprites/*.sprite.json` — six sheets: `pengo`, `sno-bee`, `ice`, `diamond`,
  `wall`, `egg`). Every maze cell is a 5×2 character block
  (`CELL_W=5, CELL_H=2`, `game/constants.ts:28-31`); the 16×11 grid fills an
  80×22 board, HUD above, hint line below (`game/constants.ts:18-27`).
- **Levels**: **entirely procedural, no level data of any kind.**
  `PengoGame.initLevel()` (`game/pengo-game.ts:50-132`) builds a blank walled
  16×11 grid, then scatters `config.iceBlocks` ice blocks, 3 diamonds, Pengo,
  `config.enemies` enemies, and `config.eggs` eggs at uniformly-random empty
  cells (`Math.random()`, `pengo-game.ts:69-70` etc. — same pattern repeats
  five times). `config` comes from `getLevelConfig(level)`
  (`game/constants.ts:53-73`): a 5-entry `LEVEL_CONFIGS` table (enemies 3→5,
  eggs 0→3, ice blocks 53→35, enemy speed 10→6 ticks/step, time limit
  180s→120s) with a scaling formula for level > 5. No maze shape, wall
  segment, or block position is ever authored — every playthrough of "level
  1" is a different random layout.
- **Sound**: `game.cues` (`SfxCues`, `sdk/engines/ui/arcade`) — the game
  engine only *names* what happened; `index.ts` drains `cues` into
  `ArcadeSfx` on every render and every tick (`index.ts:245-266`), so sound
  design is assertable without a socket.
- **Server/RPC**: `Doors/pengo/server.ts` — highscore load/save (flat JSON
  file) and `getMusicTrack`, answered from the pure `trackForState()`
  (`music-select.ts`) keyed by a module-level `currentState` the door pushes
  via `setMusicState()` on every state change.
- **Tests**: `Doors/pengo/tests/`, a dependency-free `assert`-based runner
  (`run-tests.ts`, executed via `tsx`). Seven suites, ~910 lines:
  `menu.test.ts` (menu widget parenting/centring, `input:null` routing),
  `sfx.test.ts` (cue names/distinctness, e.g. a wall-shake that stuns must
  sound different from one that doesn't), `music.test.ts` (pure state→track
  mapping + assets exist + client wiring by source-text assertion),
  `sprites-assets.test.ts` (every sprite/animation name the renderer asks
  for exists in the shipped sheets), `layout.test.ts` (board fills the
  terminal — regression for a board that was 30×13 instead of 80×24),
  `render.test.ts` (`buildBoard` is pure and drawn per-cell, not
  glyph-matched — regression for four earlier "buffer can't say what this
  is" bugs in other arcade doors), and `state-routing.test.ts` (the
  `dying`/`levelComplete` input no-op fix, read as source text since
  `index.ts` constructs a live `Door`/`Screen` at module scope and can't be
  imported into a test process). **No test drives actual gameplay
  mechanics** — nothing asserts crush scoring, stun timing, diamond
  alignment, egg hatching, or enemy AI; the suite covers wiring, sound,
  assets, and layout/state-routing regressions, not the arcade rules
  themselves.

---

## 2. Mechanics gap table

| # | Rule | Reference reading(s) | Our door | Class |
|---|------|----------------------|----------|-------|
| 1 | Enemy targeting/AI | **Ref1** (`Enemy.cpp:379-397`): picks a *random* target tile from a Gaussian centred on the player's grid position (σ=3 tiles), re-picked on arrival — not the player's exact cell. **Ref2** (`SnobeeChaseState.cpp:38-94`): picks a *uniformly random* cardinal direction every 0.4s (`m_MoveTime`); despite the class name, player position is never read — it is a pure random walk. | Deterministic greedy chase: every `enemySpeed` ticks, step toward whichever axis (`dx`/`dy`) has the larger absolute delta to Pengo's exact cell; falls back to a random legal direction only when blocked (`pengo-game.ts:386-422`). | DIFFERS (3-way — no two of the three agree) |
| 2 | Enemy move cadence | **Ref1**: continuous 0.8 px/frame at 60fps between tiles. **Ref2**: one grid step every fixed 0.4s. | One grid step every `enemySpeed` ticks (10→4 ticks, i.e. 1.0s→0.4s, scaled by level) of a 100ms tick (`constants.ts:33,53-73`). | NOT-APPLICABLE-IN-TERMINAL for the continuous case; our discrete cadence is a design choice, in the same range as ref2's at low levels |
| 3 | Wall-stun duration | **Ref1** (`Enemy.cpp:153-161`): stunned 3.0s total; visual "about to recover" swap at 1.5s. **Ref2** (`SnobeeStunState.h:24`): `STUN_TIME = 10.f`. | `STUN_DURATION = 50` ticks × 100ms = 5.0s, single phase, no recovery-warning swap (`constants.ts:49`, `pengo-game.ts:266-268`). | DIFFERS (3-way; no recovery-warning phase either) |
| 4 | Walking into a stunned enemy | **Ref1** (`Enemy.cpp:163-169`): a stunned *or still-spawning* enemy within 10px of the player is destroyed, awards 100pts, and advances the egg-hatch queue. **Ref2** (`SnobeeController.cpp:48-60`): a player touching a `vulnerable` (stunned) Sno-Bee kills it for the flat crush score (500). Both agree stun-then-touch is a kill. | Not implemented. `checkCollisions()` only ever kills Pengo on enemy contact; a `stunned` enemy is explicitly excluded from that check (`pengo-game.ts:451`) but there is no reverse branch. `tryMove()` also never checks enemy occupancy (`pengo-game.ts:180-191`), so Pengo can step through/onto any enemy's cell, stunned or not, with no consequence either way. | ABSENT |
| 5 | Block push/slide + crush scoring | **Ref1** (`Block.cpp:37-166`, `Enemy.cpp:547-590`): block slides cell-by-cell indefinitely, pushing every enemy it meets into a fast "being pushed" sub-state; each pushed enemy dies only when *it* hits a further obstacle. Score is a combo table keyed to how many enemies one continuous push caught: 1→400, 2→1600, 3→3200, 4+→6400 (`Block.cpp:209-234`). **Ref2** (`Block.cpp:21-49`, `SnobeeController.cpp:33-46`): block slides continuously (140px/s) until the next cell is occupied or off-grid; any Sno-Bee within ~1.5 tiles of *any* currently-moving block anywhere dies instantly for a flat 500pts — no combo. | `pushBlock()` scans the whole path in one synchronous `while` loop per keypress; `break`s at the **first** enemy found in the path (kills only that one — a second enemy further down the same corridor cannot be caught by the same push) or at the first obstruction; flat `SCORES.crushEnemy = 400` per crush, no combo (`pengo-game.ts:193-249`). | DIFFERS (3-way on both mechanism and scoring model) |
| 6 | Pushing a block with no room behind it | **Ref2** only (`PlayerInteractState.cpp:62-75`): if the cell *behind* the target block is also occupied/off-grid, the block is destroyed outright instead of staying put. **Ref1**: block simply sets `direction = Stopped`, no destroy (`Block.cpp:56-60` etc.). | Same as ref1 — `handlePush()`/`pushBlock()` only ever move or leave the block in place; there is no destroy-on-boxed-in path (`pengo-game.ts:162-249`). | DIFFERS (from ref2 only) |
| 7 | Which enemies a wall-shake stuns | **Ref1** (`Enemy.cpp:592-645`) and **Ref2** (`GameManager.cpp:53-72`) agree: only enemies literally touching the specific border row/column that was pushed against are stunned. | Same rule, same shape: per-direction check against the four border rows/columns (`pengo-game.ts:251-276`). | MATCHES |
| 8 | Egg → enemy hatching, data model | **Ref1**: eggs are pushable *blocks* in the terrain grid, placed at level start, that flash for 2s then look plain; a single shared hatch queue advances by one **on every enemy death** (touch-kill or crush), gated by a `waitToHatch` counter that a player can pre-load by shoving an egg block into an obstacle (forces immediate hatch); once triggered, a 2.0s delay then the enemy spawns on that egg's tile (`Block_Egg.cpp`, `ModuleBlocks.cpp:208-227`). **Ref2**: eggs are an "unhatched" block pool per level; up to `MAX_ENEMIES = 3` are alive at once, refilled from the pool both on every enemy death *and* on an independent repeating 3-second timer (`GameManager.cpp:39-51, 109-149, 233-263`). | Eggs are free-floating entities, not terrain — never stored in `data.grid`, un-pushable, un-blockable. Each egg gets an independent random countdown set once at spawn (`HATCH_TIME + Math.random()*100` = 10-20s) that ticks down every game tick regardless of kills or pushes; a 3s visual warning before it pops (`pengo-game.ts:112-126, 426-446`, `render.ts:57-62`). No cap on concurrent enemies (see #15). | DIFFERS (feature exists in all three, mechanism entirely different in each) |
| 9 | Diamond alignment bonus | **Ref1** (`Block_Diamond.cpp`): "2 together"/"3-in-a-row" only change the sprite animation and fire a "stars" particle effect + sfx; no score-add call found in any diamond code path read. **Ref2** (`GameManager.cpp:165-231`): requires **all 3** of the level's diamonds to form one exact straight line (span of exactly 2 tiles on one axis, 0 on the other); bonus tiered by whether the line touches the grid edge — 5000 (`DIAMOND_BLOCKS_COMBINE_POINTS_WALL`) if so, 10000 (`..._FREE`) if the line is fully interior; diamonds are then locked (`pushable = false`). | Fires as soon as **any 2** diamonds share a row or column anywhere on the board (independent per-row/per-column scan, third diamond irrelevant) — 1000 for exactly 2, 5000 for 3 (`SCORES.diamondAlign2/3`, `pengo-game.ts:278-306`). The score-add has **no "already scored" guard** — only the celebratory sound is deduped via `diamondsAligned`; the point total re-adds on *every subsequent push* that still finds ≥2 diamonds in a line, including pushes unrelated to the diamonds. Diamonds are never locked after alignment. | DIFFERS (3-way on trigger condition and value; our door additionally re-awards the score on every later push, which no reference does) |
| 10 | Level-clear time bonus | **Ref1**: `ScenePoints.cpp` displays elapsed game time and score but no numeric time→score conversion was found in the files read (not confirmed absent — `SceneIntermission.cpp` was not fetched). **Ref2** (`GameManager.cpp:248-258`): bonus only if the level clears within 60s of starting: `10000 * (60 - elapsed) / 60`; zero bonus past 60s. | Flat `SCORES.clearLevel = 500` plus `timeRemaining * SCORES.timeBonus(10)` — time *remaining*, not elapsed, uncapped, and always awarded no matter how slow (`pengo-game.ts:353-354`). | DIFFERS (vs ref2; unconfirmed vs ref1) |
| 11 | Score cap | **Ref1** (`Score.cpp:12-24`): hard-capped at 99999 (5-digit arcade display). **Ref2**: not confirmed (display code not read). | No cap anywhere in `PengoData`/`PengoGame`; HUD pads to 8 digits (`index.ts:89`). | DIFFERS / ABSENT (no cap logic exists) |
| 12 | Time-based mass enemy despawn ("2-minute" rule) | **Ref1** (`SceneLevel.cpp:34-42`): a per-level timer that advances only while `!player.hasDied && !enemies.enemyHasDied`; past 120.0s it calls `Suicide()` on every enemy. (`ModuleEnemies.cpp`'s own `HandleEnemiesSpawn/Despawn` calls are commented out and unused — the real despawn lives in `SceneLevel`, not there.) **Ref2**: no such mechanic found anywhere in the fetched sources — the only per-level clock (`m_LevelTime`) feeds solely the ≤60s clear-bonus (#10); the Sno-Bee only has `Chase`/`Stun` states, no despawn/give-up state exists in the state machine at all. | Not implemented. The level timer only ever kills Pengo on expiry (`killPengo()` at `pengo-game.ts:315-318`); it never touches enemies. | ABSENT (and the two references themselves disagree on whether this rule exists at all — see Open Questions) |
| 13 | "One enemy left" corner-suicide | **Ref1** only (`ModuleEnemies.cpp:167-194`, `Enemy.cpp:309-368`): when exactly 1 enemy and 0 eggs remain, wait 12.0s, then that enemy paths to the nearest wall, then nearest corner, then vanishes. **Ref2**: no equivalent state exists (only `Chase`/`Stun`). | Not implemented — level-complete requires literally 0 living enemies and 0 eggs (`pengo-game.ts:349-360`); there is no "let the last one go" path. | ABSENT |
| 14 | Enemies breaking blocks in their path | **Ref1** (`Enemy.cpp:399-537`, `ModuleBlocks.cpp:175-198`): enemies actively destroy a normal (non-diamond, non-egg, not-currently-moving) ice block blocking their route to the target tile. **Ref2** (`SnobeeChaseState.cpp:54-71`): same idea, but only a 50/50 coinflip per blocked direction — half the time it just tries a different direction instead. | Not implemented — `updateEnemies()` treats any non-`'empty'` cell as impassable and only ever falls back to a random *unblocked* direction; blocks are never destroyed by enemies (`pengo-game.ts:386-423`). | ABSENT |
| 15 | Concurrent-enemy population | **Ref1**: no cap found — each level's `SceneLevelN.cpp` calls `AddEnemy()` a fixed number of times directly (e.g. level 1: exactly 3, at hand-authored coordinates), eggs then add more on top as they hatch one-at-a-time. **Ref2** (`GameManager.h:45`, `.cpp:109-127`): hard cap of `MAX_ENEMIES = 3` alive at any moment, regardless of level; refilled from the unhatched pool as enemies die. | `LEVEL_CONFIGS` scales the *initial* simultaneous spawn count 3→5 (up to 8 past level 5, `constants.ts:53-73`), and eggs then add still more on top with no cap at all — our door is the only one of the three with an unbounded on-screen population. | DIFFERS |
| 16 | Player spawn/respawn position | **Ref1** (`ModulePlayer.cpp:82-84, 395-399`): fixed at grid (6,6) every life. **Ref2** (`PlayerController.cpp:25-34, 41-59`): fixed at grid (0,0) (top-left corner) every life. | Random empty cell at level start (`pengo-game.ts:88-104`); after death, a deterministic bottom-up scan for the first empty cell with no enemy within 2 tiles (`pengo-game.ts:467-492`) — a third, distinct model. | DIFFERS (3-way; not itself a defect, just a design difference) |

---

## 3. Medium limits vs. unbuilt features

The door already has animated, layered cell-art sprites (`sdk/engines/graphics/cell-art`,
`Doors/pengo/sprites/*.sprite.json`) — **animation is not a medium limit here**,
and none of the gaps above are excused by it.

**Genuine medium limits** (80×25 character grid, no sub-cell positioning —
these are properties of the terminal medium, not defects):
- Sub-tile/pixel movement and hitboxes. Both references move entities in
  fractional pixels within a 16px tile (`Enemy.cpp:262-292` in ref1; world-unit
  lerp in ref2's `SnobeeChaseState.cpp:88-93`) and hit-test by pixel distance
  (10-24px thresholds). A character grid has no sub-cell position; our door's
  whole-cell movement and grid-index collision checks are the correct
  adaptation, not a shortfall (gap-table rows #2's cadence figure is the only
  place this bleeds into a numeric comparison, and it's noted as
  not-applicable there).
- Pixel-precision proximity kill radii (ref2's 24px "near any moving block"
  and 10px "near a vulnerable enemy" checks) don't have a cell-grid
  equivalent narrower than "same cell" or "adjacent cell" — any port of rules
  #4/#5 has to pick a cell-based substitute, not replicate the pixel radius.

**Genuinely unbuilt, not a medium limit** (nothing about a character grid
prevents these — they are pure game-logic gaps):
- Rows #4, #8, #9's re-scoring, #12, #13, #14, #15's cap are all plain rule
  logic, independent of rendering resolution.
- Row #5's "one crush per push" limitation is a control-flow choice
  (`break` on first hit in `pengo-game.ts:217-227`) with nothing to do with
  the terminal — a cell-grid door can crush multiple enemies in one push,
  it just doesn't currently attempt to.

---

## 4. Original level layouts: where they live, format, and what a transcription needs

**Our door has zero level data of any kind.** Every "level" is generated at
runtime by uniformly-random cell placement in `PengoGame.initLevel()`
(`Doors/pengo/game/pengo-game.ts:50-132`); grepping the whole door for a
literal layout, level array, or JSON level file returns nothing — there is
no format to compare against, only a random-generation routine to replace or
supplement. A transcription task is not "convert format A to format B," it's
"add a fixed-layout code path that doesn't exist yet, alongside (or instead
of) the random one."

Both references DO ship 16 authored levels, in two different formats and with
different provenance claims:

### Reference 1 (PenguBruh-Pengo) — per-level C++ source, MIT+zlib

No data file. Each of `Pengo/Pengo/Source/SceneLevel1.cpp` … `SceneLevel16.cpp`
is a `Start()` method that issues one call per placed object:
```cpp
App->enemies->AddEnemy(1, 5);
App->blocks->AddBlock(Block_Type::EGG, 3, 14);
App->blocks->AddBlock(Block_Type::DIAMOND, 3, 11);
App->blocks->AddBlock(Block_Type::NORMAL, 1, 0);
```
(quoted lines from `SceneLevel1.cpp`, levels 1-16 follow the identical
pattern with different coordinates/counts). Coordinate space: `(x, y)` with
`x` a column 0-12, `y` a row 0-14, origin top-left — the same space
`Enemy.cpp`/`ModuleBlocks.cpp` use everywhere else in this codebase (see gap
table rows #1, #5). Block type is explicit per call (`NORMAL`/`EGG`/`DIAMOND`);
walls are not part of this list — they're a fixed 4-segment outer border
handled by `ModuleWalls`, outside the block system entirely. No claim in
`README.md` that these are literally the arcade-original 16; the game is
described as a recreation, and 16 levels exist, but provenance is implicit.
A transcription from this project means parsing 16 `.cpp` files' call
sequences, not a data-file format.

### Reference 2 (cpp-pengo) — JSON per level, public domain (Unlicense)

Data files: `Game/Data/Levels/1.json` … `16.json`. Format, confirmed from
`GridManager.h:41-43` and `GridManager.cpp:122-154`:

```json
{
  "blocks": [ 1, 5, 11, 14, 16, ... ],
  "unhatched": [ 21, 41, 49, 68, 73, 152 ],
  "diamond": [ 70, 102, 146 ]
}
```
(shortened; full `1.json` has 84 indices in `blocks`, `16.json` has 74).

- **Grid**: fixed `GRID_WIDTH = 13`, `GRID_HEIGHT = 15`
  (`GridManager.h:42-43`) for **all 16 levels** — same dimensions confirmed
  independently by reference 1's coordinate bounds (`x` 0-12, `y` 0-14).
- **Index**: flat, row-major, 0-based: `index = y * 13 + x`, `x ∈ [0,12]`,
  `y ∈ [0,14]` (`GridManager.cpp:83-90`, `IndexToGrid`; confirmed by
  `SpawnLevelFromJson`'s bounds assert `blockIdx < GRID_WIDTH * GRID_HEIGHT`
  at `GridManager.cpp:138`). Valid indices: 0-194. Origin is the grid's
  top-left cell; row 0 is the top row.
- **Legend**: `"blocks"` lists every cell that holds a pushable block,
  default type `normal`/ice (`Block::Type::normal`, `Block.h:12-14`).
  `"unhatched"` and `"diamond"` are **subsets of `"blocks"`** whose type gets
  overridden after spawning (`GridManager.cpp:142-153`) — an index appearing
  in `"diamond"` is a diamond block, not a diamond *plus* a separate ice
  block at that cell. There is no explicit wall or player-spawn symbol in
  the JSON — walls are the fixed outer border (implicit, not data), and
  player/enemy spawn points are hard-coded in engine code
  (`PlayerController.cpp:30`: player always at grid `{0,0}`), not read from
  the level file.
- **Counts don't strictly follow the header's constants**: `GridManager.h`
  declares `DIAMOND_BLOCK_COUNT = 3` and `UNHATCHED_BLOCK_COUNT = 6`, and
  `1.json` matches both (3 diamonds, 6 unhatched) — but `16.json` has only 4
  `"unhatched"` entries, not 6. Those header constants are not enforced by
  the loader (`SpawnLevelFromJson` reads whatever the array holds); treat
  them as a design target, not a hard per-file guarantee.
- **Provenance claim**: the project's own `README.md` states outright —
  *"all the gameplay features of the original Pengo, including all 16
  original levels."* This is the stronger of the two provenance claims found;
  no independent (non-clone) source was consulted to verify it.

A transcription from this project means reading 16 small JSON files directly
— trivial format, well-documented by the loader code, and the better source
per the coordinator's steer.

### Cross-check between the two

Both references independently converge on the same interior playfield size
— 13 columns × 15 rows (`x` 0-12, `y` 0-14) — despite being unrelated
codebases in different languages/engines. That agreement is the strongest
signal in this research that 13×15 is the actual arcade dimension, not an
artifact of either clone. Our door's grid is 16×11 (`constants.ts:15-16`),
which is neither dimension — a different aspect ratio and total cell count
entirely, chosen for the 5×2 cell-art sprite budget on an 80×24 terminal
(see architecture section above), not derived from either reference.

---

## 5. Open questions the references don't settle

1. **Does ref1's 2-minute despawn actually retrigger after the first kill?**
   `SceneLevel::Update()` gates its timer on `!enemies->enemyHasDied`
   (`SceneLevel.cpp:36`), but `enemyHasDied` is set `true` in
   `Enemy::destroy()` (`Enemy.cpp:652-655`) and no reset call was found in
   any file read. If it's never reset, the despawn timer effectively stops
   advancing forever after the very first enemy is crushed in a level —
   which would make the README's "2 minutes without losing a life or
   completing the round" description misleading. Files not fetched
   (`Application.cpp`, `ModulePlayer.cpp`'s `Reset()` in full context) might
   resolve this either way.
2. **Does ref2 implement the despawn/last-enemy-suicide rule at all?** Only
   `SnobeeChaseState` and `SnobeeStunState` exist in the whole `Game/`
   directory (confirmed by the file listing) — no despawn or "give up" state.
   Either the mechanic is genuinely absent from this clone, or it lives
   somewhere not obviously named (not found by file-name search).
3. **Ref1's diamond-alignment bonus**: no `AddScore` call was found anywhere
   in the diamond code path (`Block_Diamond.cpp` in full) — only a sound
   effect and a "stars" particle trigger. `SceneIntermission.cpp` (level
   transition scene) was not fetched and might award it instead of the
   diamond code itself; this is marked unconfirmed rather than "absent" in
   the gap table.
4. **Ref1's level-clear time bonus**: same caveat — `SceneIntermission.cpp`
   is the most likely home for a numeric time bonus and wasn't read.
5. **The arcade original's actual numbers.** Both references disagree on
   stun duration (3.0s vs 10.0s vs neither matching our 5.0s), crush
   scoring (escalating combo vs flat 500), diamond-bonus trigger/value, and
   enemy AI model (Gaussian-near-player vs pure random walk vs our
   deterministic greedy chase). No primary source (MAME driver source,
   arcade manual, or documented longplay analysis) was consulted in this
   pass — a plan that wants a single canonical number for any of these will
   need to either pick one reference, average/estimate, or go find that
   primary source, since the two clones do not agree and neither cites the
   original.
6. **What the "13×15 arcade-standard" grid implies for our 16×11 board.**
   Both references' independent agreement on 13×15 is strong circumstantial
   evidence for the arcade's real maze size; our door's 16×11 is a
   different shape entirely, sized for the terminal/sprite budget rather
   than derived from the original. Reconciling authored 13×15 level data
   with a 16×11 render grid (or resizing the render grid) is a question for
   whoever plans the transcription, not settled by this research.
7. **cpp-pengo's echo of our own state-machine bug class.** Not a rule
   disagreement, just a structural observation: ref1's player-death
   sequence (`ModulePlayer.cpp:104-151`) is driven by three hand-chained
   frame counters (`deadPause` to 100, then `deadPause2` to 45, then
   `deadPause3` to 75) that must fire in exact order with no player input
   accepted in between — the same *shape* of hand-over hazard as our
   `dying`/`levelComplete` states, just implemented with counters instead of
   a state-enum switch. Neither reference uses a single shared
   `GameState`-style switch the way `index.ts` does, so there's no direct
   analogue to compare our fixed bug against — only this structural echo.
