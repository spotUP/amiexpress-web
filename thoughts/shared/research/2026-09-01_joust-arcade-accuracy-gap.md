---
date: 2026-09-01
topic: Joust door gameplay accuracy vs. 1982 Williams arcade original
tags: [joust, arcade-doors, research, gameplay-accuracy, faq-comparison]
status: final
---

# Joust door vs. arcade Joust — gameplay accuracy gap analysis

Reference: `/Users/spot/Desktop/FAQ_Joust.txt` (Kevin Butler / War Doc, v1.01, 357 lines).
Subject: `/Users/spot/Code/amiexpress-web/Doors/joust/` (12 TS files outside
`node_modules`/`dist`, ~1722 lines per the existing shell-parity plan's line count).

This document is descriptive only: what the FAQ states, what the door does today
(`file:line`), and a classification. No fixes or priorities are proposed.

An existing plan, `thoughts/shared/plans/2026-08-31-arcade-doors-to-grandmaster-level.md`,
covers Joust's shell (borders, joypad input, SFX) and explicitly leaves "game rules... as
they are." This document is the gameplay gap survey that plan doesn't attempt.

---

## 1. How the door is built

**Files** (all under `Doors/joust/`, non-test, non-generated):

- `index.ts` (642 lines) — door entry point: blessed screen/box setup, menu, HUD,
  game-over/name-entry/pause/wave-complete screens, input routing, the `setInterval`
  game loop (`GAME_TICK_MS` = 50ms, `index.ts:278-287`).
- `game/joust-game.ts` (733 lines) — the `JoustGame` class: all simulation (physics,
  AI, collisions, egg lifecycle, pterodactyl, rendering to a text buffer).
- `game/constants.ts` (130 lines) — tunables: physics constants, `SCORES`, timing,
  `STANDARD_PLATFORMS`, `LAVA_PITS`, `WAVE_CONFIGS[6]` + `getWaveConfig()` extrapolation.
- `game/types.ts` (120 lines) — `Player`, `Enemy`, `Egg`, `Pterodactyl`, `Platform`,
  `JoustData` etc.
- `game/sprites.ts` (123 lines) — glyph/colour table and `Cell`-based paint functions.
- `game/initial-data.ts` (68 lines) — `createInitialGameData()`, shared by the door and
  by tests so tests don't have to construct a blessed `Screen`.
- `server.ts` (41 lines) — RPC handlers for highscore persistence (flat JSON file).
- `client.ts` (93 lines) — client-side door registration; wires the shared arcade SFX
  channel (`installArcadeSfx`), does not run simulation.
- `tests/` — `layout.test.ts` (blessed ghost-border/wrap regression), `sprites.test.ts`
  (glyph-is-not-a-blessed-brace regression), `sfx.test.ts`, `run-tests.ts` (a hand-rolled
  runner, not a jest suite).

**Game loop / state model:** One `JoustData` object (`game/types.ts:93-118`) is the
entire mutable state, mutated in place by `JoustGame.update()` on a 50ms `setInterval`
(`index.ts:278-287`) while `data.state === 'playing'`. `update()` runs
`updatePlayer → updateEnemies → updateEggs → updatePterodactyl → checkCollisions`,
then checks for wave-clear (`joust-game.ts:163-194`). Player input arrives via two
paths: discrete key events for flap/menu (`index.ts:348-390`, `handleFlap()` at
`joust-game.ts:640`), and a per-tick poll of currently-held direction keys
(`pollHeldDirections()`, `index.ts:423-430`) that calls `game.handleDirection()` through
`DoorInputManager`'s held-key tracking rather than reacting to the character stream.

**Entity representation:** Plain objects with float `x`/`y` in a coordinate space of
`GAME_WIDTH=78 × GAME_HEIGHT=20` character cells (`game/constants.ts:9-10`) — i.e. one
game unit is one terminal character cell, with no sub-cell interpolation stored between
frames (positions are floats, but `render()` floors them to a cell with `Math.floor`,
`joust-game.ts:677-678`). There is exactly one `Player`, an `Enemy[]`, an `Egg[]`, and a
single (non-array) `Pterodactyl` object (`game/types.ts:93-105`) — the data model has no
slot for a second pterodactyl or a second player.

**Rendering approach:** `JoustGame.render()` (`joust-game.ts:664-733`) builds a
`GAME_HEIGHT × GAME_WIDTH` grid of `Cell { ch, fg, bg }` (`game/sprites.ts:23-27`), paints
platforms/lava/eggs/enemies/pterodactyl/player into it by flooring their float
coordinates to cells, then serializes each cell to a blessed tag string (`{fg-bg}{fg-fg}ch{/}`,
`sprites.ts:119-123`) and joins rows with `\n` into one content string handed to a
blessed `box.setContent()` (`index.ts:264-266`). This is a **hand-rolled renderer local
to Joust** — it does **not** use the cell-art sprite engine at `sdk/engines/graphics/cell-art/`
(`cells.ts`, `halfblock.ts`, `sprite.ts`, `load.ts`, `index.ts`) that Pengo uses; there is
no import of `@amiexpress/bbs-door-sdk/engines/graphics/cell-art` anywhere in
`Doors/joust/`. Sprites are single ASCII glyphs on a solid background colour block
(`GLYPHS`/`COLORS`, `sprites.ts:46-70`), not multi-cell bitmap art. A later plan that
wants Joust to draw like Pengo (multi-cell sprites, frame-based animation via the shared
engine) is starting from zero adoption of that engine, not extending partial use.

**Dead/unused constants worth flagging for a future plan:** `EGG_HATCH_BASE`,
`EGG_FALL_TIME`, `PTERODACTYL_WARNING`, `WAVE_COMPLETE_DELAY` are exported from
`constants.ts` and imported into `joust-game.ts`'s import list (`joust-game.ts:36-37`)
but never actually referenced in any logic — the real hatch/pterodactyl timings come
from `WaveConfig.eggHatchTime` / `WaveConfig.pterodactylTimer` instead
(`constants.ts:96-103`). `SCORES.teamBonus` (`constants.ts:37`) is likewise defined and
never read anywhere.

---

## 2. Gap table

Legend: **MATCHES** / **DIFFERS** (give both numbers/behaviors) / **ABSENT** (FAQ rule,
no door equivalent at all) / **N/A-TERMINAL** (medium genuinely cannot do this).

| # | FAQ fact (section) | Door behavior (`file:line`) | Classification |
|---|---|---|---|
| 1 | "One 2 way joystick that controls your man's movements left and right." (6.1) | `handleDirection('left'\|'right')` only adjusts `vx`; no vertical joystick axis exists (`joust-game.ts:650-662`) | MATCHES |
| 2 | "One button that flaps your ostrich's wings." (6.1) | `handleFlap()` applies one fixed impulse per press (`joust-game.ts:640-648`, `FLAP_POWER=-0.8`, `constants.ts:17`) | MATCHES |
| 3 | Playing field has enemy riders, a pterodactyl, and **a lava troll** that grabs you near the lava (6.2, diagram row "LAVA TROLL") | No troll entity exists in `game/types.ts` or `game/joust-game.ts` (repo-wide grep for "troll" across all door `.ts` files returns zero hits). Only a `LavaPit` (`types.ts:65-68`) that instantly kills on contact (`joust-game.ts:253-259`, `336-346`, `406-416`) | ABSENT |
| 4 | Knocking an enemy off (generic): 500 points (6.3) | `SCORES.bounder = 500` used as the fallback (`joust-game.ts:606`, `constants.ts:31`) | MATCHES (as the base/fallback case) |
| 5 | Bounder (Red Enemy): 500 points (6.3) | `SCORES.bounder = 500` (`constants.ts:31`) | MATCHES |
| 6 | Hunter (Silver/Gray Enemy): 750 points (6.3) | `SCORES.hunter = 750` (`constants.ts:32`) | MATCHES |
| 7 | Shadow Lord (Blue Enemy): **1000** points (6.3) | `SCORES.shadowLord = 1500` (`constants.ts:33`) | DIFFERS — FAQ 1000 vs. door 1500 |
| 8 | "Getting killed: 50 points" (6.3) | `killPlayer()` decrements lives and pushes a `death` cue but never touches `data.score` (`joust-game.ts:624-638`) | ABSENT |
| 9 | Pterodactyl: 1000 points (6.3) | `SCORES.pterodactyl = 1000`, awarded in `checkCollisions()` (`constants.ts:34`, `joust-game.ts:594`) | MATCHES |
| 10 | "Not getting killed during a Survival Wave: 3000 points" — conditional on a Survival Wave and on the player never being knocked off during it (6.3, 6.4) | `SCORES.survivalBonus = 3000` is awarded **every** wave clear unconditionally (`joust-game.ts:185-190`), whether or not the player died and respawned mid-wave, and there is no "Survival Wave" wave type at all (see #16) | DIFFERS — door pays this out on every wave, not a distinct survival-wave-only, no-death-required bonus |
| 11 | "(Two player only) Not knocking each other off his mount: 3000 points" (6.3) | `SCORES.teamBonus = 1000` is defined (`constants.ts:37`) but never referenced anywhere in `joust-game.ts` or `index.ts` (repo-wide grep confirms zero uses); there is only one `Player` in `JoustData` (`types.ts:93-105`) | ABSENT |
| 12 | Egg points progress 250 → 500 → 750 → 1000, "and every egg thereafter," resetting on death or next wave (6.3) | `checkCollisions()` always adds flat `SCORES.egg = 250` per egg collected, no counter, no reset logic (`joust-game.ts:576-580`, `constants.ts:35`) | DIFFERS — door is flat 250 always; no progression, nothing to reset |
| 13 | "You start with three ostriches" (6.3) | `STARTING_LIVES = 5` (`constants.ts:13`), consumed in `createInitialGameData()` (`initial-data.ts:22`) | DIFFERS — FAQ 3 lives vs. door 5 |
| 14 | "…and get a free one every 20,000 points." (6.3) | No extra-life-at-score-threshold logic anywhere (grep across all door `.ts` files for `20000`/`extraLife`/`bonusLife`/`freeLife` returns only an unrelated `20000` in a default-highscore fixture, `constants.ts:127`) | ABSENT |
| 15 | Egg Wave: "instead of enemy riders, you are presented with 12 eggs distributed among the different platforms," hatching after a time into riders; occurs every fifth wave (6.4) | Every wave (`initWave()`, `joust-game.ts:73-132`) spawns live flying `Enemy` objects directly per `WaveConfig.bounders/hunters/shadowLords` (`constants.ts:96-103`); eggs only ever appear as the by-product of defeating an enemy (`defeatEnemy()`, `joust-game.ts:604-622`). There is no wave-type flag, no pre-placed-egg spawn path, no "every 5th wave" scheduling (grep for `eggWave`/`waveType`/`isEggWave` returns nothing) | ABSENT |
| 16 | Survival Wave: a wave with no reward mechanic other than not dying, "every 4-6 waves" (6.4) | No wave-type distinction exists at all (`WaveConfig` has no survival flag, `types.ts:84-91`); see #10 | ABSENT |
| 17 | Pterodactyl waves occur "every 4-6 waves," starting with one and "progressively" reaching up to **four** simultaneously (6.4) | `data.pterodactyl` is a single non-array object (`types.ts:70-75`, `types.ts:102`); `updatePterodactyl()` spawns it purely when `waveTimer > config.pterodactylTimer` (a stall timeout, `joust-game.ts:461-468`), not on a wave-number schedule. There is structurally no way for more than one pterodactyl to exist at once | ABSENT (multi-pterodactyl); DIFFERS (trigger is a timeout, not scheduled waves — see #18/#22) |
| 18 | "Pterodactyls also show up if you take too long on a wave. These can't be killed using the platform method. The only way is either in the air or to lose a man." (7) — implying this stall-triggered pterodactyl is a *distinct, harder* case from the scheduled wave 8/12/18-style pterodactyl | The door's **only** pterodactyl trigger is exactly this stall timeout (`joust-game.ts:461-468`, `WaveConfig.pterodactylTimer` ranges 600→200 ticks = 30s→10s at `GAME_TICK_MS=50`, `constants.ts:97-102`); there is no separate scheduled/"platform-killable" variant to contrast it with | DIFFERS — the door implements only the FAQ's stall-case trigger, generalized to be the sole trigger, with no distinct scheduled pterodactyl wave |
| 19 | Pterodactyl kill requires **facing** it — "you must be facing the pterodactyl in order to kill it," lance aligned with its mouth (7) | `checkCollisions()` decides the outcome purely by height: `if (player.y < ptero.y - 1)` the player kills it, else it kills the player (`joust-game.ts:590-599`); `player.direction` is never read in this check | DIFFERS — door's rule is a height check (same rule as enemy jousting); FAQ's rule is a facing/alignment check |
| 20 | Pterodactyl AI: flies across the screen on a path a stationed player can intercept from platform one or platform two ("wait for the pterodactyl," 7) | `updatePterodactyl()` actively homes: `vx = dx>0 ? 0.6 : -0.6` and `vy = dy*0.05` toward the live player position every frame (`joust-game.ts:472-483`), not a fixed cross-screen path | DIFFERS — door pterodactyl is a homing entity; FAQ describes a directional flight path that rewards ambush-from-platform play |
| 21 | Multiple pterodactyls "usually come from opposite sides," and dispatching one turns you to face the next (7) | Cannot occur — see #17 (single, non-array `Pterodactyl`) | ABSENT |
| 22 | "First 20 Waves" schedule, e.g.: wave 3 "bridge burns out"; wave 4 "Hunters appear. Lava Troll appears."; wave 6 "Platform five disappears"; wave 7 "Platforms four and six disappear. Survival Wave."; wave 9 "Platform one disappears"; wave 10 "Egg Wave, all platforms restored"; wave 16 "Shadow Lords appear"; "After wave 22, it's all Shadow Lords" (6.4) | `initWave()` resets `data.platforms = [...STANDARD_PLATFORMS]` identically on **every** wave (`joust-game.ts:128`) — platforms never disappear or restore per-wave. Enemy-type unlocks instead follow `WAVE_CONFIGS[6]` indexed by wave number (`constants.ts:96-103`): hunters first appear at index 2 = **wave 3** (FAQ: wave 4), shadow lords first appear at index 4 = **wave 5** (FAQ: wave 16); beyond wave 6, `getWaveConfig()` scales `bounders`/`hunters`/`shadowLords`/`enemySpeed` continuously (`constants.ts:105-120`) and never converges to shadow-lords-only | DIFFERS (enemy-tier wave numbers, and no "all shadow lords after 22" endgame) + ABSENT (platform collapse/restore per wave entirely) |
| 23 | "These progressions will continue until you hit wave 255. After that, the waves roll back over to wave 1." (6.4) | `getWaveConfig()` has no upper bound or rollover; `data.wave` increments indefinitely via `nextWave()` (`index.ts:317-325`) and difficulty keeps scaling past any wave number | ABSENT |
| 24 | "The name of the game is height. Whoever is the higher rider during a joust is the winner." (7) | `checkCollisions()`: `heightDiff = enemy.y - player.y`; player wins if `heightDiff > LANCE_HEIGHT_ADVANTAGE` (0.5 cells), enemy wins if `< -0.5` (`joust-game.ts:547-567`, `constants.ts:26`) | MATCHES |
| 25 | "If you and an enemy collide on the same level, the impact will knock you both backwards a little and turn you both around." (7) | On a near-level collision (`|heightDiff| ≤ LANCE_HEIGHT_ADVANTAGE`) both entities get `vx = -vx*1.5, vy = -1` (`joust-game.ts:558-566`) — a knockback is applied, but neither `player.direction` nor `enemy.direction` is reassigned in this branch | DIFFERS — knockback exists; the "turn around" (facing flip) described by the FAQ does not happen, so the FAQ's stated follow-on danger ("the first one turns you around and the second knocks you off," 7) cannot occur as described |
| 26 | Flap gives variable thrust — "how fast or slow you flap the wings determines speed and maneuverability... glide around and only flap for altitude" (7) | Each flap call adds one fixed `FLAP_POWER` impulse (`constants.ts:17`, `joust-game.ts:645`) against constant `GRAVITY=0.15`/tick, with horizontal drag/friction as separate axes (`constants.ts:16,21-22`) — a standard discrete-impulse-vs-gravity flight model, matching the *qualitative* shape of arcade Joust's flap-and-glide feel, but the FAQ gives no exact numbers to check the tuning against | MATCHES (qualitative model); tuning itself is unverifiable against this FAQ (see Open Questions) |
| 27 | "After you hit an enemy rider, they become an egg. After a few seconds, the egg will hatch to the next hardest enemy rider. …a Bounder becomes a Hunter; a Hunter becomes a Shadow Lord. After that, it will always be a Shadow Lord." (7) | `defeatEnemy()` creates the egg with `enemyType: enemy.type` — the **same** type as the enemy just defeated (`joust-game.ts:609-618`); `hatchEgg()` spawns `egg.enemyType` unchanged (`joust-game.ts:448-454`). No escalation table exists anywhere (grep for "escalat"/"upgrade"/"harder"/"nextType" across the door returns nothing) | DIFFERS — door recycles the same enemy type; FAQ requires hatching into the next-harder type |
| 28 | "Some players leave one egg and then hover over it. When the enemy buzzard comes to pick up the rider, you knock him off the saddle again." — eggs sit landed, collectible, and can also complete their hatch into a mounted enemy if left alone (7) | Eggs do have `falling → landed → hatching → hatched` states (`types.ts:14`, `joust-game.ts:386-434`) and can be collected for points at any point before they finish hatching (`joust-game.ts:571-581`); the general shape (an egg sits, then becomes a rideable enemy if untouched) is present | MATCHES (state machine shape); the escalation content of the hatch is wrong per #27 |
| 29 | Respawn: "he will appear at the entrance point all shimmery. If you let the sequence go, it will take up to five seconds for your rider to appear. During that time, he is immune to all attacks." (7) | `RESPAWN_TIME = 60` ticks × `GAME_TICK_MS = 50ms` = 3.0s until respawn (`constants.ts:41`, `constants.ts:11`), then `INVINCIBLE_TIME = 90` ticks = 4.5s of post-respawn invincibility, rendered as a blink (`joust-game.ts:214-216`, `716`) | DIFFERS — 3.0s fixed respawn delay vs. FAQ's "up to five seconds"; invincibility (4.5s) is present as a concept but is a separate, longer window than the respawn delay itself, whereas the FAQ describes the delay itself as the immune window |
| 30 | "Your rider will enter at the point there is the least amount of enemies. This is usually the very bottom platform. Keep in mind, the enemies also enter at these points." (7) | Player always respawns at the same fixed `x: 10, y: 16` (`joust-game.ts:205-206`, matching the initial spawn at `joust-game.ts:78-79` and `initial-data.ts:26-27`) — no dynamic "least-enemies" entry-point selection. Enemies spawn from a fixed 5-point list, cycled by `enemyIdCounter % spawnPoints.length` (`joust-game.ts:135-143`) — deterministic round-robin, not enemy-density-based either | DIFFERS (player: fixed point vs. dynamic least-enemies selection) / DIFFERS (enemies: round-robin vs. density-based) |
| 31 | "The game does reach a point where there are so many enemy riders running around, they are constantly bumping into one another. This… creates a wall." (7) | Enemy-vs-enemy collision is never checked — `checkCollisions()` only evaluates player-vs-enemy, player-vs-egg, player-vs-pterodactyl (`joust-game.ts:535-602`); enemies can freely overlap each other | ABSENT — no enemy-enemy collision/jousting exists, so this emergent "wall" cannot occur |
| 32 | "The above tips are as valid for the two-player game as they are for the one-player game." — implies a genuine simultaneous two-player mode exists (7) | `JoustData` has one `player: Player`, not a collection (`types.ts:93-105`); no second input stream, no co-op session handling anywhere in `index.ts`/`server.ts` | ABSENT |

---

## 3. Medium limits vs. unimplemented

The playfield is an 80×25 blessed text grid (`SCREEN_WIDTH/HEIGHT`, `constants.ts:7-8`;
game area `GAME_WIDTH×GAME_HEIGHT = 78×20`, `constants.ts:9-10`), one glyph per cell,
positions floored to a cell at render time (`joust-game.ts:677-678`). That draws a real
boundary around what "faithful" can mean here:

**Genuine medium limits (not defects):**
- **Sub-pixel flight arcs.** The arcade renders a bird on a smooth analog trajectory;
  a character grid cannot show fractional-cell position, only which cell an entity
  currently occupies. The door already stores float `x`/`y` internally and only floors
  for display (`joust-game.ts:676-681`) — that's the correct approach for this medium;
  there's no finer-grained "fix" available within blessed's cell model.
- **Pixel-precise lance-vs-mouth alignment.** The FAQ's pterodactyl-kill rule (#19) asks
  for facing + vertical lance alignment at pixel precision the arcade sprite art
  supports. A character-cell approximation of "facing" (compare `player.direction` to
  the sign of `ptero.x - player.x`, i.e., is the pterodactyl in front of the player)
  is achievable; pixel-exact mouth alignment is not, and isn't what a terminal medium
  should attempt. The height-only check the door has today (#19) is not this
  approximation, though — it doesn't reference facing at all, so a facing-aware
  approximation remains open ground, not something already covered by the medium
  limit.
- **Continuous joystick-driven acceleration curves.** The arcade cabinet's 2-way stick
  and the door's arrow keys are input-equivalent; any perceptible "feel" difference in
  acceleration is a tuning question (constants in `constants.ts:16-23`), not a medium
  limit — the door already models continuous float velocity, not stepped movement.
- **60 enemies-deep visual crowding at endgame** (wave 255 rollover, "it's all Shadow
  Lords") is representable on an 80×25 grid in principle (glyphs can still be placed
  densely); nothing about the medium prevents implementing wave 255 rollover or an
  all-shadow-lords endgame. Not a medium limit — see #22/#23 above (ABSENT).

**Not medium limits — genuinely unimplemented despite being fully representable in a
character grid:**
- Egg-type escalation (#27) — a lookup table (`bounder → hunter → shadowLord → shadowLord`),
  no rendering concerns at all.
- Egg-point progression (#12) — a counter and a score table, no rendering concerns.
- Wave-conditional bonuses / distinct Survival and Egg wave types (#10, #15, #16) —
  pure state-machine/scheduling work.
- Platform collapse/restoration per wave (#22) — the `Platform[]` array already supports
  arbitrary subsets; `STANDARD_PLATFORMS` is simply reset unchanged every wave
  (`joust-game.ts:128`). Nothing about a text grid prevents removing an element from
  that array on a schedule.
- The lava troll (#3) as a grab-and-struggle mechanic — this is exactly the kind of
  timed, escapable hazard the door already implements elsewhere (respawn invincibility
  is a timed state flag); a "grabbed" boolean plus a struggle-to-escape counter is
  architecturally the same shape as work already in the codebase, not a rendering
  problem.
- Multiple simultaneous pterodactyls (#17, #21) — `data.pterodactyl` would need to
  become an array; this is a data-model choice, not a display limitation (the door
  already renders an arbitrary-length `Enemy[]` this way).
- Direction flip on level-collision bounce (#25) — a one-line assignment; the `direction`
  field already exists and already drives which glyph is drawn.
- Extra life at 20,000 points (#14), starting lives count (#13), Shadow Lord score value
  (#7), death score (#8) — all pure data/logic, no display dimension at all.
- Dynamic "least-enemies" spawn point selection for player and enemies (#30) — requires
  counting enemies near each of the existing fixed spawn points, a computation over data
  the door already has (`data.enemies`, the spawn point list at `joust-game.ts:135-141`).
- Two-player mode (#11, #32) — a genuinely large feature (second input stream, session
  co-op, second `Player` in the data model, screen real estate for a second HUD line),
  but not something a terminal/BBS medium rules out: this codebase already runs
  networked multi-client sessions elsewhere (e.g. Grandmaster's networked chess). Its
  absence here is a scope/effort question, not a medium constraint.

---

## 4. Open questions the FAQ does not settle

- **Exact platform-collapse schedule beyond wave 20.** The FAQ gives a concrete,
  wave-by-wave platform-collapse pattern only for waves 1–20 (6.4) and explicitly says
  "the platforms don't follow a pattern as to when they disappear" thereafter — so
  there's no FAQ-sourced rule for what should happen structurally past wave 20 (or past
  the door's current `WAVE_CONFIGS.length = 6` before extrapolation kicks in,
  `constants.ts:96-103`, `105-120`). A plan would need to either invent a
  post-20 policy or ask the user for one.
- **Exact hatch timing.** The FAQ says only "after a few seconds" for egg hatching (7);
  it gives no seconds value to check the door's `WaveConfig.eggHatchTime` (200→80 ticks,
  i.e. 10.0s→4.0s at `GAME_TICK_MS=50`, `constants.ts:96-103`) against. Whether the
  door's current range counts as "a few seconds" or not is a judgment call the FAQ
  doesn't make for you.
- **Exact respawn delay.** "Up to five seconds" (7) is stated as a maximum you can choose
  to let elapse, implying the player can act sooner (see below) — not a fixed timer.
  The door's `RESPAWN_TIME=60` ticks (3.0s, `constants.ts:41`) is a fixed, non-skippable
  delay; the FAQ doesn't specify whether/how a player can shorten it in the original, so
  a plan can't derive an exact target number from this document alone.
- **What "let the sequence go" implies about a *skippable* respawn.** The wording ("If
  you let the sequence go, it will take up to five seconds") suggests the arcade
  original may let a player shorten the respawn wait by moving/flapping. The FAQ doesn't
  describe the mechanism, so this is a genuine unknown, not just an unimplemented number.
- **The "12 eggs" figure for Egg Waves** (6.4, "you are presented with 12 eggs
  distributed among the different platforms") — is this a fixed constant across all Egg
  Waves regardless of wave number/difficulty, or does the FAQ author mean "12" as a
  typical/example count? The FAQ states it flatly with no caveat, but offers no
  corroborating detail (e.g., does it scale with wave number the way `WAVE_CONFIGS`
  scales bounder/hunter/shadowLord counts today) — a plan would need to decide whether
  12 is exact-and-fixed or treat it as approximate.
- **Survival Wave frequency: "every 4-6 waves"** (6.4) is stated as a range, not a fixed
  interval or a rule for exactly which waves. The worked 20-wave example (6.4) shows
  Survival Waves at 2, 7, 11, 17 — gaps of 5, 4, 6 — consistent with the stated range but
  not reducible to a single formula; a plan would need to pick a concrete scheduling
  rule (e.g., randomized within the range, vs. some other deterministic pattern) since
  the FAQ doesn't commit to one.
- **Pterodactyl-wave frequency: "every 4-6 waves," "starts with one and progressively
  moves up to four"** (6.4) — same shape of ambiguity: the worked example shows
  pterodactyl waves at 8, 12, 18 (gaps of 4, 6) with the FAQ's own note that "the
  progression occurs roughly along the line" — not an exact rule, and no wave number is
  given for when the count reaches two/three/four pterodactyls beyond "wave 18: two
  Pterodactyls" in the example.
- **"After wave 22, it's all Shadow Lords."** (6.4) — stated as a flat fact with no
  detail on whether Bounders/Hunters can still spawn from eggs hatched before wave 22
  and carried into it, or whether *every* spawn source (including egg hatches) becomes
  Shadow-Lord-only. Ambiguous enough that a plan should treat it as a policy decision,
  not a derivable number.
- **Wave 255 rollover behavior.** The FAQ states the wave counter rolls back to wave 1
  after 255 (6.4) but says nothing about whether difficulty/score-multiplier state
  resets with it, or just the displayed wave number and platform/enemy schedule. Given
  how large a wave count 255 is to reach, and how little the FAQ specifies about it, a
  plan may reasonably treat this as low-priority/out-of-scope rather than something to
  resolve from this source.
- **Lava troll's precise grab/escape mechanics.** The FAQ says "if you do happen to get
  grabbed, flap rapidly to escape" (7) and "it is also easy to hit enemies immobilized by
  the troll" (7), but gives no numbers for grab range, escape flap-count/rate, how long
  an immobilized enemy stays grabbed, or whether the troll can grab eggs/enemies
  indefinitely. A plan would need to either source these from the arcade ROM/other
  references or treat them as design choices, not FAQ-derived facts.
- **"Bridge burns out" at wave 3** (6.4) — the FAQ names the event but not which
  platform(s) constitute "the bridge" in this door's `STANDARD_PLATFORMS` layout, nor
  whether it's permanent for the rest of the game or specific to wave 3 only (contrast
  with, e.g., wave 10's "all platforms restored").
