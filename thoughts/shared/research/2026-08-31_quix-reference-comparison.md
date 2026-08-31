---
date: 2026-08-31
topic: "SirWumpus/quix compared with Doors/super-qix"
tags: [super-qix, doors, research, qix]
status: final
---

# The QUIX reference, and what our clone does not have

## What the reference is

`https://codeberg.org/SirWumpus/quix` at `1e1d40dbeb7f6702fc7e596b007b2951938831d5`.

About 35 KB of C: `quix.c` (main loop, screens, scoring), `qmoves.c` (player,
Sparx, Fuse, Qix movement), `qarea.c` (the fill), `qio.c` / `qputs.c` /
`win_getch.c` (terminal I/O), `defs.h` (all the tuning constants).

Lineage matters for reading it: UNIX V7 C, ported to CP/M in 1983-84, then to
the Atari ST in 1988. It is **Qix (1981)**, not **Super Qix (1987)**. Our door
is Super Qix, built from `FAQ_Qix.txt` and complete against it - 74 items, 9
exempt, 0 open (`Doors/super-qix/CHECKLIST.md`).

So the two are cousins, not the same game. The reference has no letters, no
power-ups, no revealed picture, no Skull releases on a timer, no word to spell.
What it does have is the 1981 arcade's shape, and several mechanics our door
either lacks or implements differently.

## The reference's game, mechanic by mechanic

Line references are to the reference repository at the commit above.

### Qixes multiply, and everything scales with them

`clearboard()` does `quixnum++` on every new screen (`quix.c:179`), so screen 1
has one Qix, screen 2 has two, up to `MAXQUIX` 10. Three things scale off that
count:

- **Fill score**: `score += (area/2) * quixnum` (`qarea.c:192`).
- **End-of-level area bonus**: `(percent - 75) * 500 * quixnum` (`quix.c:289`).
- **Game speed**: `udelay((10 - quixnum) * 30)` (`quix.c:381`) - the whole
  loop runs faster as Qixes accumulate. At 10 Qixes the delay is zero.

### Capturing a Qix

Sealing a Qix inside the area you fill "captures" it: `fill_area()` marks
`q->cought` for any Qix standing on `SOLID` after the fill (`qarea.c:315-320`),
and the level-end screen pays 250 points each (`quix.c:294-300`). The README
calls this out as an addition over the original: "it is now possible to gain
points for capturing a QIX by cutting it off from the others."

### Which side of the line gets filled

`scan_screen(FALSE, FALSE)` counts Qixes on each side of the new line
(`qarea.c:182-190`) and returns a sentinel:

- no Qix inside -> `0`
- no Qix outside -> `maxarea`
- inside exceeds outside by more than 3 -> `maxarea`
- outside exceeds inside by more than 3 -> `0`
- otherwise the actual area

`fill_area()` then compares that against `area_left / 2` to choose which of the
two boundary reconstructions to use. In effect: fill the side with fewer Qixes,
but when the counts are close, fall back to area.

### Crossing your own line is refused, not fatal

`moveplayer()`: `if (nextb == LINE || nextb == SOLID) { player.direction = STILL;
return ALIVE; }` (`qmoves.c:226-230`). Walking into your own trail simply stops
you. The punishment for getting stuck is the Fuse, not instant death.

### The Fuse

Lit when the player is off the border, not already lit, and the trail is longer
than two cells (`qmoves.c:214-219`). It starts at `line_max` - the far end of
the trail - and walks toward the player one cell per tick, converting each cell
it leaves back to `LINE` and drawing itself as `*` (`qmoves.c:331-342`). Reaching
the player is death.

### The Qix's movement

`movequix()` (`qmoves.c:382-438`), two steps per tick (`QUIX_SPEED 2`):

- a `d_time` countdown; when it expires, a new random direction and a new
  random countdown up to 20 ticks
- `if (rand() % NASTYNUM)` - so **one time in six** it ignores its heading and
  moves along `sgn(player - quix)`, straight at the player
- eight directions, including diagonals
- a trail of `QUIXLEN` 8 positions
- hitting `BORDER` or `PLAYER` rotates the direction by one instead of
  reflecting it
- **hitting `LINE` - the player's incomplete trail - is death for the player**

### The Sparx

Exactly two, forever (`MAXSPARX 2`), starting at fixed points `(3,1)` and
`(xmax-2,1)` and walking the boundary in opposite directions (`quix.c:174-178`).
They never multiply. They kill only when `last_killed > 10` (`qmoves.c:312`,
`qmoves.c:322`) - a grace period of ten ticks after a death.

After a fill, a Sparx that no longer stands on the boundary is teleported to
just ahead of or behind the player, depending on its direction
(`qarea.c:286-298`).

### Lives

`INITMEN` 5, `MAXMEN` 8. `add_life()` (`quix.c:263-272`) awards a life each time
the score passes `BONUS_MAN * bonus_men` and is called both after a fill and at
the level-end screen. Lives are drawn as `@` glyphs along the top row.

### Presentation

A title banner in block letters with SPACE to start and `?` for help
(`quix.c:62-107`); a help screen listing every key (`quix.c:308-335`); key
remapping on `^R` (`qmoves.c:73-102`); redraw on `^D`; a level-end bonus screen
that shows the arithmetic; and "Are you so utterly mad as to have another game?
(y/n)" at the end (`quix.c:392`).

Score is stored as a tenth of what is displayed, and `unsigned` - the README
lists score rollover as an unfixed bug.

## What our door already has that the reference does not

Everything Super Qix added in 1987, and then some: the revealed background
picture, letters and the level word, the five power-ups, the Skull release
timer, the level table with per-level enemy pacing, the skill levels, the
attract-mode sequence, the rejoin multiplier, and a test suite of 116.

## The gaps

Checked against the current door, not assumed.

| # | Gap | Where ours stands | Reference |
|---|-----|-------------------|-----------|
| G1 | Crossing your own line kills you | `qix-engine.ts:883` - `handleDeath()` | Refused: the move is ignored |
| G2 | One Gremlin per level | `LEVEL_CONFIGS` has `qixCount: 1` throughout | `quixnum++` per screen, to 10 |
| G3 | No score scaling by Gremlin count | `percent * DRAW_BASE_POINTS * multiplier` | `(area/2) * quixnum` |
| G4 | No capture bonus | A trapped Gremlin vanishes, unpaid | 250 each, tallied at level end |
| G5 | No lives cap | `d.lives++` in three places, unbounded | `MAXMEN` 8 |
| G6 | Fuse lights only on standing still | `stopTimer > FUSE_START_DELAY` | Also on trying to cross the trail |
| G7 | No key remapping | Fixed arrows | `^R` redefines all four |
| G8 | No redraw key | - | `^D` |
| G9 | Help does not list the keys | `showHelp()` is prose | Lists every binding |
| G10 | Game speed does not scale with the board | Fixed tick | `(10 - quixnum) * 30` |
| G11 | Fill side chosen by area | Largest region holding a Gremlin | Gremlin counts with a +/-3 margin |

G1 is the interesting one. Our door kills; the reference refuses the move; and
the Super Qix FAQ says "You are not allowed to cross your own line, which can
result in painting yourself into a corner if you're not careful". "Not allowed"
reads as refused, and painting yourself into a corner is only a hazard worth
mentioning if it does not kill you outright - the corner is dangerous because
the Fuse is coming, which is exactly the reference's design. So this is likely a
defect in ours against our own source document, not merely a difference from the
reference.

G11 is a difference our FAQ settles the other way (FAQ 2.1: the area containing
the Gremlin is Outside; FAQ 2.2: with a divided Gremlin, Outside is the larger
area). Ours matches the FAQ and should stay.

## Open questions for the plan

1. G1: refuse the move rather than kill?
2. G2/G3/G10: adopt the Gremlin count as a difficulty axis, against a FAQ that
   says Super Qix "usually" has one that "sometimes divides"?
3. G4: pay for captures, against a FAQ that says it does not?
4. G7/G8/G9: door conveniences - worth the surface area?
