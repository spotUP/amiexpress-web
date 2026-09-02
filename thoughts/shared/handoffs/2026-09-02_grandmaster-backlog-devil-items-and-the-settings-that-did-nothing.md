---
date: 2026-09-02
topic: GRANDMASTER backlog - the Devil ladder, six items, and three settings that did nothing
tags: [grandmaster, heboris, doors, items, rotation-systems]
status: implemented
---

# GRANDMASTER: the backlog, and what was hiding in it

Ten commits, `92fd06e89..a6d2eb872` on `main`, all inside `Doors/grandmaster`
plus one line of `dev/tests/door-regressions.test.ts`. 318 -> 369 door tests.

## What the sysop reported, and what it turned out to be

**"i saw no items i tried grandmaster mode an vs play."** Items had ONE call
site, `VersusScreen.setupItemRouting`. HeborisCE's gate is
`gameMode[player] == 4 || item_mode[player]` (gamestart.c:6994) and the door
had implemented the first half only - so Master, Death, Marathon and Sprint
could not have items at any setting, and there was no setting. There is now
(`PlayerSettings.itemMode`), and an enemy-targeted item collected outside
versus used to be named on the HUD and then dropped: the engine handed it to a
callback nobody had registered. It applies to the collector now, which is the
reference's own fallback (gamestart.c:14358-14365).

**"death mode starts at 20 when i play."** The curve said gravity 1.0 until
level 500 and the door's own manual said 20G from the start. gamestart.c:6097
sets `sp[pl] = 1200` - the file's comment for 1200 is "20G" - BEFORE the
per-mode jump at 6112, and the Devil/DOOM arm (`ldvl:`, 6197-6250) sets only
the wait tables and never touches sp again. Beginner and Master do overwrite
it. The manual was right.

## The class that kept repeating: a setting nothing read

Three of them, all found by asking "who consumes this?" rather than by playing:

- **`sonic_drop`** existed in `KeyConfig` and `GameAction`, was classified by
  `keyToAction`, and had NO handler. The previous session recorded ACE-ARS's
  up-key lock as blocked on "inventing a key mapping"; the key already
  existed. It is bound (W, or Up in the WASD preset) and wired now.
- **`softDropSpeed`** had a settings row, a 1-40 range and a saved value. The
  input handler always used a fixed 50 ms, so every value played identically.
- **Item presets ALL / FEW / DS** drew from pools the engine could not honour.
  DS draws `{6,7,12,13,18,26}`, of which exactly one had an effect. Only the
  TGM preset was filtered. All four are filtered now, and a test draws two
  hundred items from each.

## What the reference actually says (and where the earlier reading was wrong)

- **ACE-ARS is not the only system that locks on the up key.** world.c:447 and
  478-517 are written `rots != 7`, so TI-WORLD, ACE-SRS and DS-WORLD lock too;
  SRS-X is the exception (world.c:519-540 drops and leaves the piece live).
  `core/up-key-lock.ts`.
- **ROLL ROLL is not the scroll subsystem.** `isrollroll` feeds the rotation
  input in every rotation module - `move = (BTN_B || rolling) - ...`
  (ars.c:78) - so the piece rotates by itself, every 30 frames (init.c:729),
  for four pieces (gamestart.c:7092).
- **DEATH BLOCK is BIG.** judgeBlock/setBlock hand the piece to
  judgeBigBlock/setBigBlock (gamestart.c:16156, 16192), which double every
  offset and fill 2x2. Doubling the SHAPE gives collision, ghost, lock and
  rendering for free - one code path, not two. Two pieces (gamestart.c:7097).
- **The Devil family has its own grade ladder**, dgname (gamestart.c:609): 1,
  S1..S13, M, GM, GOD, climbed as `grade = level/100` and capped at S13
  (9348-9349). The run ENDS at 1300 (11108-11122) and keeps GOD if it got
  there inside 19200 frames (5:20) for a CLASSIC rotation family or 21000
  (5:50) for a WORLD one. Death was being scored on the TGM3 Master ladder and
  never ended at all.
- **CEMENT does not exist in HeborisCE.** Grepping the whole tree finds it only
  in README.md and unrelated SDL code. The backlog line was speculative; there
  is nothing to port.

## What is left, and why

**MISSION mode is a project, not an afternoon.** HeborisCE's missions are
DATA: `loadMissionData(mission_file)` reads packs of `mission_type` /
`mission_norm` / `mission_time` / `mission_lv` / `mission_bgm` / `mission_end`
(mission.c:47-208), with 42 objective TYPES named in mission_info.c. Porting it
means a pack format, a runner, a HUD and a starter pack - and a decision about
whether the door ships an editor. It wants a plan first.

Nine item ids stay unimplemented (8, 9, 10, 13, 14, 15, 26, 27, 32-39) and are
now unreachable rather than silently inert. X-RAY (4), COLOR (5), DARK (16) and
TRANSFORM (20) stay out for the older reason: their only consumers in the
reference are dead code.

## Nobody has played any of it

Every commit here has tests that fail without its fix, and not one of these
features has been driven by hand: items outside versus, Death ending at 1300,
GOD, HIDDEN, the practice goals, the versus goals, BIG pieces, ROLL ROLL.
LIVE at `a6d2eb872`.
