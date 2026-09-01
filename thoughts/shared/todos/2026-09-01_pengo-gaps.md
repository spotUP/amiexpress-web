---
date: 2026-09-01
topic: "Pengo: gaps the user hit in play, and the mechanics audit against two reference clones"
tags: [pengo, arcade, todo, references]
status: draft
---

# Pengo: what is missing

The user's verdict, 2026-09-01: our Pengo "is at proto state at most, it
lacks almost everything". Two specific asks captured here, plus what the
mechanics research found.

## User-reported, open

1. **Blocks cannot be destroyed.** "i cant destroy blocks in pengo either".
   In the arcade a penguin facing a block that cannot slide can break it,
   which is how you open a maze that has closed up on you. Our door has no
   destroy move at all: `pushBlock` slides or does nothing.
2. **The mechanics need verifying against the two reference clones.** "the
   game mechanics needs to be verified against the two reference pengos".
   The audit below is that verification; what remains is deciding, per row,
   which behaviour we adopt.

## Fixed already, 2026-09-01

- **Crushing a Sno-Bee was invisible and ate the block** (commit
  `770e4c348`). The enemy went straight to `dead` - skipped by the renderer,
  filtered out by the tick - so it vanished on the frame the block arrived.
  And the crush branch cleared both the origin and the resting cell, so the
  pushed block was deleted, though the comment beside it said the block
  stops at the enemy's position.
- **A keypress during the level-complete hand-over quit to the menu**
  (commit `38a4a4e8e`): the input switch handled 7 of 9 states with a
  destructive `default: showMenu()`.

## The audit

Full detail with `file:line`:
`thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md`

References, both permissively licensed:
- `https://github.com/Akadeax/cpp-pengo` - Unlicense (public domain), 16
  levels as row-major JSON, claims the arcade originals. The better source.
- `https://github.com/OCA99/PenguBruh-Pengo` - MIT + Zlib, 16 levels as C++
  call sequences.

**16 rows: 1 matches, 10 differ, 5 absent.** The four with the most
gameplay impact:

1. **The crush model.** Ours kills at most one Sno-Bee per push, flat 400.
   Both references chain-kill down the line - one with an escalating combo
   (400/1600/3200/6400), one flat 500 with a wider blast.
2. **Enemy AI.** Ours is a deterministic greedy chase. The references use a
   Gaussian-weighted target near the player, or a pure random walk. Ours is
   meaningfully harder than either, and than the arcade.
3. **Eggs.** Ours are untouchable floating entities on independent random
   timers. Both references model them as pushable terrain blocks, gated by
   kill-count or a refill pool.
4. **Diamond alignment re-scores.** Ours awards the bonus again on every
   later push, with no "already scored" guard - a scoring bug neither
   reference has.

Absent entirely: touch-killing a stunned enemy, the two-minute despawn, the
last enemy fleeing to a corner, enemies breaking blocks, a population cap.

## The level data, and the grid question

**We have no level data at all.** Every level is randomised at runtime.
Both references ship 16 authored levels and both use a **13x15** grid -
independent agreement, so that is very likely the arcade's real size. Ours
is **16x11**.

That is the decision a plan has to make first, because everything else
hangs off it: adopt 13x15 and transcribe the sixteen originals, or keep
16x11 and lose the authored layouts. 13x15 is taller than our board is
drawn, so it interacts with the cell-art geometry the way Frogger's did.

## Open questions the references do not settle

- Stun duration: 3s vs 10s across the two, ours is 5s.
- Whether the two-minute despawn and the level-clear time bonus actually
  fire in the first reference - the source was not fully readable.
- Whether the 16 layouts really are the arcade's, beyond one project's
  claim.

## How to apply

Brainstorm before planning. The grid question is the first fork and it is
the user's call; the crush model and the AI are the two that most change
how the game feels. Do not tie-break a disagreement between the two
references without a primary source - record both readings instead.
