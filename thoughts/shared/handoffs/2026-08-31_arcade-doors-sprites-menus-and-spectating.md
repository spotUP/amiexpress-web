---
date: 2026-08-31
topic: "Arcade doors: QUIX gaps, ANSI sprites across nine doors, one shared menu, spectating"
tags: [super-qix, frogger, grandmaster, pengo, joust, galaga, donkey-kong, zoo-keeper, pipe-dream, arcade, sdk, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the arcade doors, a shared shell, and one bug that was not mine

Written at the end of a long session that started with one plan (close the
QUIX gaps in Super Qix) and turned into a sweep across every arcade door.

## Where everything ended up

All on `origin/main` and deployed. Suites:

| door | tests | door | tests |
|---|---|---|---|
| grandmaster | 174 | zoo-keeper | 19 |
| super-qix | 172 | pengo | 16 |
| frogger | 112 | joust / donkey-kong / galaga | 12 each |
| pipe-dream | 10 | puzzle-bobble | 2 |

Six doors had **no tests at all** this morning. They have 71 between them now.

## Task 1 - the QUIX gaps in Super Qix (done, 30 of 30)

Plan: `thoughts/shared/plans/2026-08-31-super-qix-quix-gaps.md`. Every item
verified by reverting the change and watching the named test fail.

Beyond the plan, four things were reported live and fixed:

- **The Gremlin was no threat.** An unnamed `0.1` in `updateQix` scaled every
  step, so it did 3.3 cells/sec against a marker doing 20 - it could not catch
  a moving player at ANY level, and the level table's 1.0 -> 2.5 ramp was
  cosmetic. Speed is `QIX_STEP_SCALE` now; the lever that actually mattered was
  the LEAN toward the marker (`QIX_BASE_PULL` 0.03 -> 0.15), which took the
  closest approach from 6.7 cells to about 2.
- **You could walk into the revealed picture.** `handleDirection` had an escape
  hatch letting a buried marker step onto any safe ground "until it is back on
  an edge" - which it never checked, so the permission never expired.
- **Enter did not dismiss the level panel.** `skipOutro` bailed before clearing
  `transitionTimer`, so for the last ~1.5s of every hand-over the key was dead.
  Found by tracing the live door: one keypress showed `outroRunning=false
  transitionTimer=43`.
- **Attract mode and music.** Two Zabutom XM tracks, in-game and elsewhere.
  Confirmed audible by the user.

## Task 2 - ANSI sprites, all nine arcade doors

One root cause everywhere: **colour was decided AFTER drawing, by matching the
glyph in the buffer**, so anything sharing a character was indistinguishable.
Four gameplay-visible bugs came out of it:

| door | bug |
|---|---|
| galaga | `'.'` was a star, an ENEMY BULLET and an explosion - all gray. Incoming fire was drawn as scenery. |
| donkey-kong | `playerClimb` and `ladder` are both `'H'`, ladder tested first - Mario vanished into the ladder while climbing |
| zoo-keeper | `zeke`/`zekeWithNet` both `'@'`; the zoo stage literally had `hasNet ? '@' : '@'`. Carrying the net was invisible. |
| joust | buzzards drawn `{` and `}` - blessed's own tag delimiters - emitted into tagged markup |

Zoo Keeper and Pengo also moved to **square cells** (2 chars per logical cell,
as Super Qix does). Joust, donkey-kong and galaga are still 1-char - see Next.

**Arkanoid needed nothing.** It already draws solid bricks with fg and bg via
raw ANSI escapes; an earlier claim that it needed work was wrong.

## Task 3 - one shared menu (`sdk/engines/ui/arcade`)

The menu had been written nine times, and **three separate hand-sweeps over
those copies each missed doors** - ghost borders, arrow keys, and the wrap fix.
So Arkanoid's menu was ported ONCE into the SDK and adopted by all nine.

Ported: centred rows, `> OPTION <` in bright yellow on blue, hint line,
wrapping selection. NOT ported: Arkanoid's brick strip - it is thematic to
Arkanoid and the user had already had it removed from Frogger as "a leftover".
`MenuOption.value` keeps Frogger's Lives and Super Qix's Skill rows working.

## Task 4 - GrandMaster spectating

- **Solo games are watchable.** `createLobby`/`startMatch` had two callers in
  the whole door: the versus lobby widget and the tests. So every solo mode
  published nothing and "Watch a game" was correctly empty. A solo game now
  registers a one-seat lobby (`network/solo-broadcast.ts`), best-effort so a
  dead broker never stops somebody playing.
- **Full-size watching, Tab to focus.** The played board is 22x22 with a border
  - 20x20 inside - at two chars per cell, so a full field is 22 columns. Three
  fit in 66 of 78. Width was never the constraint; height was, and Table talk
  dropped to one row to buy the 22 rows a field needs. Four or more: the
  focused one full, rest minimaps, TAB moves focus.
- **A lone bot is drawn full size** rather than as a minimap.

## The door-deletion bug - NOT this session's work

Reported as "many doors do not work". Root cause: `deleteAmigaDoor` treated
every registration returned by `findRegistrationsPointingInto` as an ALIAS of
the door being deleted and unlinked them all. `Doors/emp_tools` holds two
independent doors - Joincnf (J) and Bulls (B) - so deleting either took both
icons. Same for AVAIL, AVHBC, ADDBBS, 5DPAGER.

**Fixed and landed by `amiexpress-web-82` as `077f2ca7a`**, not by this
session. I verified it (32 tests) and confirmed it stands alone on main, but
committed nothing under `web/backend`. Three theories died first: a loose
prefix matcher (wrong - the matcher is segment-safe), delete-by-list-index
(wrong), and only then co-tenants.

Still owned by web-82 and in flight: ~163 dead registrations on the live
volume, `deleteAmigaDoor` only searching `Commands/BBSCmd` so a door registered
solely under `Conf<N>Cmd` cannot be deleted, and DOORMAN/DOORREPO parity.

## Learnings that cost time

**A sweep applied by hand will miss doors.** Three did, today, over the same
nine copies. That is the argument for `sdk/engines/ui/arcade`, not tidiness.

**`blessed.box()` is a Panel and injects a border when `border` is absent.**
It steals two columns and two rows, so a full-width row wraps and the
remainder paints black - "every second line is black". It hit six doors. On a
one-row HUD the injected border IS the whole box.

**A test can pass on the broken code.** `highScoresAreWrittenOutsideDist`
did: under tsx `__dirname` already IS the door root, so checking the resolved
path could not tell the fix from the bug. It needed a synthetic door tree.
Several tests here assert the glyph collision still EXISTS, because that is
what makes the fix necessary.

**Check WHERE the user is testing.** Four "no difference" reports in a row were
all correct: they were on the live site while the work sat unpushed on a local
branch. Ask before instrumenting harder.

**Restarting the backend truncates `logs/backend.log`.** Editing anything under
`Doors/` while somebody is testing restarts the backend and destroys the
evidence they just generated. It happened three times before I noticed.

**`npm test --`, never a bare `npx jest`** in `web/backend` - the bare form
misses the project config and dies on the first type annotation.

**Building a door's dist inside a worktree bakes the worktree path into
`client.bundle.js`.** Restore it from origin/main unless the client changed.

## Artifacts

- Plans: `thoughts/shared/plans/2026-08-31-super-qix-quix-gaps.md`,
  `2026-08-31-arcade-doors-to-grandmaster-level.md`
- New shared module: `sdk/engines/ui/arcade/{menu.ts,index.ts}`
- New per-door: `game/sprites.ts` in pengo, pipe-dream, joust, donkey-kong,
  galaga, zoo-keeper; `Doors/super-qix/game/attract.ts`, `music-select.ts`;
  `Doors/grandmaster/network/solo-broadcast.ts`
- Rescued worktree diffs: `~/worktree-rescue/2026-08-31_*.patch`

## Next steps, in order

1. **Sound effects** for every arcade door except GrandMaster and Arkanoid.
   Arkanoid drives its own from `client.ts` because its client IS the game;
   the others are server-side and need the state->client channel that Super
   Qix's `getMusicTrack` RPC already proved works. Shared module, not eight
   copies.
2. **Attract mode** for arkanoid, donkey-kong, galaga, joust, pengo,
   pipe-dream, zoo-keeper. Super Qix's `game/attract.ts` is the template.
3. **Square cells** for joust, donkey-kong and galaga - the last three still
   drawing 1-char cells. Halving a coordinate space needs care: it caught an
   escalator clamp in zoo-keeper that would have trapped Zeke off-screen.
4. **The arcade plan proper** - manual pager, leaderboard, per-user settings,
   joypad for six doors, into `sdk/engines/ui/arcade` alongside the menu.
5. **Remove three abandoned doors** from the live `Doors/` volume
   (tic-tac-toe, bubble-bobble, fire-emblem-v2). Touches the live board, so
   it is the user's call - commands are in the previous handoff.

## Other notes

- Worktrees: ~5 GB reclaimed; uncommitted diffs saved to `~/worktree-rescue/`
  before removal. Several sessions were creating worktrees faster than they
  were cleaned.
- `handoff.md` at the repo root was deliberately not touched - another session
  edits it, and this is the archive copy.
