---
date: 2026-08-31
topic: "Close the gaps between Doors/super-qix and the QUIX reference"
tags: [super-qix, doors, plan, qix]
status: draft
---

# Closing the QUIX gaps in Super Qix

Research: `thoughts/shared/research/2026-08-31_quix-reference-comparison.md`.
Reference: `https://codeberg.org/SirWumpus/quix` @ `1e1d40dbeb`.

Decisions taken with the user, 2026-08-31:

1. **Crossing your own line refuses the move** rather than killing.
2. **Adopt the Gremlin count as a difficulty axis, capped at 4**, and scale the
   fill score by it. Do NOT scale tick speed - our pacing is tuned for a BBS.
3. **Pay for captured Gremlins**, against the FAQ, because it rewards the
   trapping play the FAQ itself calls the most spectacular in the game.
4. **All three door conveniences**: help lists the bindings, a redraw key, and
   key remapping.

Two defects were found while reading our own source and are folded in: high
scores are written into `dist/` (lost on every deploy), and the save RPC
rejects any name longer than three characters, so a BBS handle cannot be
recorded.

## How to execute this

Follow `~/.claude/REACHABILITY_PROTOCOL.md` and the project rules:

- Show the FULL checklist below before starting, and tick it in the open,
  reporting the running count each time.
- Every behaviour change gets a test that FAILS before the change and passes
  after. Verify the RED by reverting the change and watching the named test
  fail - not by assuming.
- A plan is executed 100%. Partial execution is a failed plan: report
  "n of 30, m open", never "done".
- Work in a worktree, not the shared checkout (see the handoff for why).
- After each phase: `npx tsc --noEmit`, `npx tsx tests/run-tests.ts`,
  `npm run build`. Then pause for the user's manual check.

Baseline at the time of writing: **116 tests passing**.

---

## Phase 1 - Your own line stops you, it does not kill you

**Files**: `game/qix-engine.ts`, `game/constants.ts`, `tests/drawing.test.ts`

`handleDirection` currently ends a life for walking into your own trail:

```ts
} else if (nextCell === 'stix') {
  // Can't cross own stix - die!
  this.handleDeath();
  return;
}
```

Replace with a refusal that also lights the Fuse, which is how the reference
punishes being stuck (`qmoves.c:226-230` refuses; `qmoves.c:214-219` lights):

```ts
} else if (nextCell === 'stix') {
  // FAQ 2.1: "You are not allowed to cross your own line, which can result
  // in painting yourself into a corner if you're not careful." Not allowed
  // means refused - and painting yourself into a corner is only worth
  // warning about if it does not kill you outright. The corner is dangerous
  // because the Fuse is coming.
  //
  // Trying to cross also LIGHTS the fuse, so a player wedged against their
  // own line is on the clock rather than merely stuck.
  this.lightFuse();
  return;
}
```

Add `lightFuse()` beside the existing fuse handling, and call it from the
stall path too so both routes share one implementation.

**Checklist**

| ID | Item |
|----|------|
| Q-1a | Walking into your own line refuses the move and costs no life |
| Q-1b | A refused crossing lights the Fuse |
| Q-1c | Backtracking one cell still works and still does not reset the stall timer |
| Q-1d | The Fuse still kills when it reaches the marker |

**Verification**: `theMarkerCannotCrossItsOwnLine`, `aRefusedCrossingLightsTheFuse`
fail before the change.

---

## Phase 2 - More Gremlins, and a fill worth more because of them

**Files**: `game/constants.ts`, `game/drawing.ts`, `tests/enemies.test.ts`,
`tests/drawing.test.ts`

The reference does `quixnum++` per screen to 10 and scales the fill by it. We
cap at 4 and add one every four levels, so a 16-level lap ends at the cap:

```ts
/** How many Gremlins a level starts with (QUIX scales its whole game by this). */
export const MAX_GREMLINS = 4;
export const GREMLIN_ADDED_EVERY = 4;

export function gremlinsForLevel(level: number): number {
  return Math.min(MAX_GREMLINS, 1 + Math.floor((level - 1) / GREMLIN_ADDED_EVERY));
}
```

`getLevelConfig` sets `config.qixCount = gremlinsForLevel(level)`. The level
table's own `qixCount: 1` entries become the floor rather than the value.

Fill score scales with how many Gremlins are on the board when the claim lands
(`qarea.c:192`), in `completeStix`:

```ts
// QUIX pays (area/2) * quixnum: a fill is worth more when there is more to
// dodge. The count is taken when the claim lands, so a Gremlin captured by
// this very claim still counts towards it.
const gremlins = Math.max(1, d.qixList.length);
const points = Math.floor(claimResult.percent * DRAW_BASE_POINTS * d.scoreMultiplier * gremlins);
```

Tick speed is deliberately NOT scaled: `udelay((10 - quixnum) * 30)` is an
1980s terminal's idea of pacing, and ours is already tuned for a BBS
(`FUSE_START_DELAY` and the enemy speeds were measured against ~660ms between
keypresses).

**Checklist**

| ID | Item |
|----|------|
| Q-2a | Level 1 starts with one Gremlin |
| Q-2b | A Gremlin is added every fourth level |
| Q-2c | The count never exceeds MAX_GREMLINS |
| Q-2d | The same claim scores more with more Gremlins on the board |
| Q-2e | Tick speed does NOT change with the count (recorded as a departure) |

---

## Phase 3 - Capturing a Gremlin pays

**Files**: `game/types.ts`, `game/constants.ts`, `game/drawing.ts`,
`game/qix-engine.ts`, `tests/level-outro.test.ts`

`claimAreaWithoutQix` already removes Gremlins sealed into claimed ground
(`drawing.ts:214-220`). It drops them silently; count them instead.

- `SuperQixData` gains `gremlinsCaptured: number`, reset in `initLevel`.
- `claimAreaWithoutQix` returns the count it removed; `completeStix` adds it to
  `d.gremlinsCaptured`.
- `CAPTURE_POINTS = 250` (the reference's figure, `quix.c:299`).
- `startLevelOutro` adds `captureBonus = d.gremlinsCaptured * CAPTURE_POINTS` to
  the score and to the outro record.
- `outroPanel`'s bonus phase gains a `CAPTURE` row beside AREA and WORD, drawn
  only when there is something to show.

**Checklist**

| ID | Item |
|----|------|
| Q-3a | Sealing a Gremlin into a claim counts as a capture |
| Q-3b | A Gremlin left outside the claim does not |
| Q-3c | The level-end tally pays CAPTURE_POINTS for each |
| Q-3d | The BONUS panel shows a CAPTURE row when there were captures |
| Q-3e | ...and omits it when there were none |
| Q-3f | The count resets between levels |

---

## Phase 4 - A ceiling on lives

**Files**: `game/constants.ts`, `game/qix-engine.ts`, `game/powerups.ts`,
`tests/levels-and-skill.test.ts`

`MAXMEN` 8 in the reference. We award lives from three places - the 98% extra
life (`qix-engine.ts:349`), the skill thresholds (`qix-engine.ts:1155`) and the
1-UP power-up (`powerups.ts:455`). Add:

```ts
/** The most lives the marker can hold at once (QUIX's MAXMEN). */
export const MAX_LIVES = 8;

/** Award a life, up to the ceiling. */
export function grantLife(d: SuperQixData): void {
  if (d.lives < MAX_LIVES) d.lives++;
}
```

and route all three through it.

**Checklist**

| ID | Item |
|----|------|
| Q-4a | Lives stop at MAX_LIVES however they are earned |
| Q-4b | All three award sites go through one function |

---

## Phase 5 - The door's conveniences

**Files**: `index.ts`, `server.ts`, `game/types.ts`, `tests/controls.test.ts`
(new)

### 5a Help lists the bindings

`showHelp()` is prose. List every key, as `quix.c:308-335` does, generated from
the live key map so it cannot drift.

### 5b Redraw

`Ctrl-D` repaints: `engine?.render()` plus `screen.render()`. Useful over a
flaky BBS line, which is exactly why the reference has it.

### 5c Key remapping

- `SuperQixData` gains `keyMap: { up: string; down: string; left: string; right: string }`,
  defaulting to the arrow keys.
- A `Keys` row in the menu opens a remap screen that reads one key per
  direction, in the reference's order.
- `handleDirection` dispatch consults `keyMap` as well as the arrows, so the
  arrows never stop working.
- Persisted per BBS user through a new RPC pair, `getSettings` / `saveSettings`,
  stored beside the high scores.

### 5d and 5e - the two defects found on the way

- **High scores are written into `dist/`.** `server.ts:12` is
  `path.join(__dirname, 'highscores.json')`, and `__dirname` is the built
  `dist/` directory, which every deploy replaces. Copy Arkanoid's `getDoorRoot()`
  (`Doors/arkanoid/server.ts:36`) and write beside the door's source instead.
  The same root is where settings go.
- **The save RPC rejects any name longer than three characters**
  (`server.ts:63`), so a BBS handle cannot be recorded - the same fault Frogger
  had. Raise the cap and take the username from the session.

**Checklist**

| ID | Item |
|----|------|
| Q-5a | Help lists every binding, generated from the live map |
| Q-5b | Ctrl-D repaints the board |
| Q-5c | A remapped key moves the marker |
| Q-5d | The arrow keys keep working after a remap |
| Q-5e | A remap survives leaving and re-entering the door |
| Q-5f | High scores are written outside `dist/` and survive a deploy |
| Q-5g | A full BBS handle can be recorded as a high score |
| Q-5h | The high score name is taken from the session, not typed |

---

## Phase 6 - The ledger

**Files**: `Doors/super-qix/CHECKLIST.md`

Add a QUIX section listing Q-1a..Q-5h with their outcomes, and record the three
deliberate departures:

| Departure | Reason |
|-----------|--------|
| Tick speed is not scaled by the Gremlin count | The reference's `(10 - quixnum) * 30` is an 1980s terminal's pacing; ours was measured against BBS keypress timing |
| Captures pay, though FAQ 2.2 says they do not | Agreed with the user: it rewards the trapping play the FAQ calls the most spectacular in the game |
| The filled side is chosen by area, not by Gremlin counts | FAQ 2.1 and 2.2 settle this the other way, and ours follows the FAQ |

| ID | Item |
|----|------|
| Q-6a | CHECKLIST.md carries the QUIX section and the three departures |

---

## Verification

**Automated**, from `Doors/super-qix`:

```
npx tsc --noEmit
npx tsx tests/run-tests.ts        # 116 before this plan; expect ~145 after
npm run build
```

Plus the door/SDK freshness protocol before telling the user to test:
`.claude/skills/door-sdk-freshness/SKILL.md`.

**Manual** - for the user, not to be ticked by the implementer:

1. Draw into your own line: the marker stops, the fuse lights, no life lost.
2. Reach level 5: two Gremlins. Level 9: three. Level 13: four. No more.
3. Seal a Gremlin into a claim: the level-end panel shows a CAPTURE row.
4. Collect past eight lives: the count stops at eight.
5. `?` lists every key; Ctrl-D repaints; remap a key, leave the door, come back.
6. Post a high score: it is your BBS handle, and it survives a deploy.

## Success criteria

- All 30 checklist items ticked, or explicitly reported open with a reason.
- Every behaviour change has a test that was seen to fail before the change.
- The suite is green and `tsc` is clean.
- `CHECKLIST.md` reflects reality.
