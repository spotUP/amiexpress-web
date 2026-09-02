---
date: 2026-09-02
topic: "GRANDMASTER measured against HeborisCE - speed, difficulty and the missing item system"
tags: [grandmaster, heboris, tgm, reference, audit]
status: final
---

# GRANDMASTER against its reference

The reference is **HeborisCE 1.1.0**, in this repo at
`Documentation/7-Reference Sources/HeborisCE-1.1.0` (a second copy sits at
`HeborisCE-main/`). Not TetriNET - that is a different lineage which happens
to also live in this door, and reading it for TGM questions is a mistake I
made before the sysop corrected it.

Every claim below cites the reference or the door. Where I did not verify
something, it says so.

## 1. Speed and difficulty: the curve starts in the wrong place

**Verified.** Heboris' Master mode initial timings, `src/game/speed.c:86-89`:

```
wait1_master_half = 26   // lock -> next piece   (ARE)
wait2_master_half = 40   // line clear delay
wait3_master_half = 28   // landing -> lock      (lock delay)
waitt_master_half = 15   // horizontal charge    (DAS)
```

Those hold until level 500. From 500 the tables at `speed.c:98-116` take
over, indexed every 50 levels:

```
wait1 (ARE)         25  25  25  25  19  19  14  14  14  14   8 ...
wait2 (line clear)  29  29  19  19   9   9   6   6   6   6   6 ...
wait3 (lock delay)  28  28  28  28  28  28  28  28  18  18  16 ...
waitt (DAS)         10  10  10  10  10  10  10  10   9   9   9 ...
```

GRANDMASTER's `core/gravity.ts` opens its Master curve with:

```
{ level: 0, gravity: 4/60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 }
```

**Those are the level-500 numbers.** The door starts the game on the timings
Heboris reaches after five hundred levels:

| | Heboris @ level 0 | GRANDMASTER @ level 0 |
|---|---|---|
| ARE | 26 | 25 |
| line clear | **40** | **29** |
| DAS | **15** | **10** |
| lock delay | 28 | 28 |

The line-clear delay and DAS are the two that change how the game FEELS - a
third off the clear pause and a third off the charge time, from the first
piece. And because the door's own curve then tightens further (`are: 14,
arelinelock: 6` at level 500, which Heboris does not reach until 800), the
whole difficulty ramp is shifted early.

The door's file says "Based on TGM3 timing data from HeborisCE speed.c",
which is the right source - the numbers were taken from the wrong end of it.

**Gravity units are right.** Heboris counts `1200 = 20G` (`speed.c:355`), so
one G is 60 units, which is exactly the `4/60` form the door uses. The
per-level gravity VALUES were not compared - I did not locate Heboris' master
gravity array, only its timing tables. That comparison is still open.

## 2. The item system: 39 items, none of them in this door

**Verified.** `src/game/gamestart.c:3289` sets `item_num = 39`, and
`gamestart.c:3292-3296` names them:

```
 1 MIRROR      2 ROLLROLL   3 DEATH      4 X-RAY     5 COLOR
 6 ROTATELOCK  7 HIDENEXT   8 MAGNET     9 TIMESTOP 10 HOLDLOCK
11 <->REV     12 BOOST     13 FEVER     14 ^vREV    15 REMOTE CON
16 DARK       17 ^DEL      18 vDEL      19 DELEVEN  20 TRANSFORM
21 LASER      22 NEGA      23 SHOTGUN   24 EXCHG    25 HARD
26 SHUFFLE    27 RANDOM    28 FREEFALL  29 <-MOV    30 ->MOV
31 180deg     32 16t       33 REFLECT   34 DOUBLE   35 ALLCLEAR
36 MISS       37 COPYFLD   38 FAKENEXT  39 []
```

40 SPOTLIGHT, 41 SPINFIELD and 42 PRESSFIELD are named but past `item_num`.

Selection, `gamestart.c:6997-7064`: a weighted draw over `item_pro[]` with a
five-deep history that forbids repeats, and four presets -

- **ALL** - any of the 39
- **FEW** - 1-5
- **DS** - 6, 7, 12, 13, 18, 26
- **TGM** - 1-5, 16-25, 28-31 (nineteen items - the TGM set proper)

**Items run in versus.** `gamestart.c:7085` gates the item effect timers on
`(gameMode[player] == 4) || (item_mode[player])`, and mode 4 is versus. This
is the gap the sysop reported: "there are no visible pickups in gmasters vs
modes".

GRANDMASTER has no item system at all in its TGM modes - no item cell on the
board, no selection, no effects. (Its TetriNET mode has TetriNET's own nine
specials, which is a different game.)

## 2b. Heboris has no battle royale, and its items know it

**Verified.** Heboris is one or two players and nothing else: `maxPlay` is 0
or 1, and the per-player state in `src/game/gamestart.h` is 308 arrays of
`[2]`. `heboris.txt:120` describes VERSUS MODE as "a mode where two people
compete". There is no field of eight, let alone ninety-nine.

**Most items act on their holder.** Of the 94 references to the opponent
(`1 - player`) in `gamestart.c`, not one is in an item or effect context -
MIRROR, DARK, X-RAY, DELEVEN and the rest rewrite the field of whoever
collected them. The opponent interaction in versus is the garbage/upline
system (`gamestart.c:7960-7985`), which is separate from items.

**The two that need a second field resolve it as a duel.** The field-exchange
item, `gamestart.c:14358-14365`:

```c
enemy = 1 - player;      // decide the target
if (gameMode[player] != 4)
    enemy = player;      // outside versus, the target is yourself
```

`1 - player` is the whole targeting rule, and it only means anything with
exactly two players. Outside versus the item still resolves - against
yourself - so it is never left without a target.

**What that means for GRANDMASTER's royale.** There is no reference for
pickups in a field of 8-64; that mode is this door's own invention (its
original spec, `Documentation/archive/2025-12/GRANDMASTER_TETRIS_PROMPT.md`,
describes a battle royale Heboris never had). The reference settles the
mechanic - collect on a line clear, effect applies to the holder - and leaves
exactly one decision open: who the handful of two-field items point at. The
door already answers that question for garbage attacks (the attack system
targets random or the leader), so the consistent answer is to route those
items through the same target selection rather than invent a second one.

## 3. What GRANDMASTER already has

Checked in `Doors/grandmaster/core`, `ui` and `app.ts`:

- **IRS and IHS** (`core/irs-ihs.ts`) - initial rotation and hold, the TGM feel
- **20G** (`core/gravity.ts`)
- **Section times and medals** (`core/medals.ts`)
- **Credit roll / M-roll** (`core/types.ts`, `core/game.ts`)
- **BIG mode** (`core/pieces.ts`)
- **Grade system** (`core/types.ts`, `core/high-scores.ts`)
- **ARE, DAS, ARR, lock delay** as configurable timings
- **Replay recording** (`core/game.ts` finalizeRecording)

It also has modes Heboris does not: SPRINT 40L, ULTRA 2MIN, DIG, ZONE,
TETRINET, and a battle royale.

## 4. Gaps, in the order they change the game

1. **The timing curve** (section 1). One table, verifiable against the
   reference line by line, and it changes every mode.
2. **Item mode** (section 2). The TGM preset - nineteen items - is the
   honest first target; ALL 39 is the completionist one.
3. **Torikan** - TGM2's time cutoffs (qualify by 500/999 or the game ends).
   Absent from the door entirely; searched for `torikan` and every spelling.
4. **DEVIL / DOOM / GOD difficulties** - Heboris has full timing tables for
   each (`speed.c:215-260` for DEVIL).
5. **Rotation systems** - the door has ARS; Heboris ships ACE-ARS, ACE-ARS2,
   ACE-SRS, TI-ARS, TI-WORLD, DS-WORLD, DS-RANDOM, SRS-X and a ROT.RELAY
   mode that changes system mid-game.
6. **MISSION mode** (`src/script/mission.c`) and **PRACTICE mode**
   (`src/script/practice.c`).
7. **CEMENT**, **HIDDEN** (blocks vanish), versus **WIN TYPE** / **WINLINE**
   options.

## Not verified

- Per-level gravity values against Heboris' own table (units confirmed, the
  numbers not compared).
- Whether the door's DEATH curve has the same early-shift as Master.
- Grade thresholds and the grading rules against `src/script/grade.c`.
