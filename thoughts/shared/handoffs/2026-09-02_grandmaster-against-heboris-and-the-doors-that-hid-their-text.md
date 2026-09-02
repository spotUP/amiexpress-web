---
date: 2026-09-02
topic: "GRANDMASTER rebuilt against HeborisCE, and the one-row box that hid text in six doors"
tags: [grandmaster, heboris, tgm, card-lobby, doors, sdk, agents, handoff]
status: final
session: amiexpress-web-7a
---

# GRANDMASTER against HeborisCE, and the doors that hid their own text

Two threads ran through this session. The first was a rule: **a one-row box
with a border has no interior**, which had been silently eating text in six
doors. The second was GRANDMASTER measured against its actual reference,
which turned out to be in the repo all along.

## The state of things

`origin/main` is at `129f2a378`. GRANDMASTER's suite is **318 passed, 0
failed** (it was 249 at the start of the day). The live board was verified at
each deploy by `docker exec amiexpress-bbs cat /app/.git-sha`, never by a
green workflow alone.

## 1. The one-row box

`createBox` and `blessed.box` both build a `Panel`, and Panel draws a line
border whenever the caller passes no `border` key
(`sdk/engines/ui/blessed/widgets/panel.ts:53`). A box one row high has no
interior once the frame takes its top and bottom rows, so its content never
renders.

Four reports in one morning were this one rule; grepping the class found two
more nobody had noticed. Twenty-eight instances existed across nine doors.
Thirteen are fixed; the remaining fifteen are pinned per file by
`oneRowBoxesDoNotCarryAFrame` in `dev/tests/door-regressions.test.ts`, which
fails if any count changes in either direction.

Still carrying them: bug-tracker (3), rip-browser (1), grandmaster (3).

## 2. CARD LOBBY

Everything the sysop reported in one testing session, each traced to a cause:

- **Invisible-but-clickable dialog buttons.** `Question` lays its buttons in a
  ONE-row container, but `Button` is `touchFriendly` by default and
  `enforceMinTouchHeight` silently promotes anything under three rows to
  three. Two three-row buttons in a one-row box are clipped to nothing while
  their own coordinates still hit-test. Fixed with `inline: true`.
- **"cannot restore undefined" on deal.** UNO and poker share
  `table.hand.snapshot`; twelve call sites checked the game type before
  picking an engine and two did not. The guard now lives INSIDE
  `loadTableHand`, where a thirteenth caller cannot forget it.
- **The table view ignoring the screen.** `applyViewMode` wrote
  `tableWindow.options.left/.width`. **A widget renders from its live
  properties** - `options` seeds it at construction and is never read again.
  One line, five symptoms: black left third, wrapped text, a seven-card hand
  with none of it visible, and a scrollbar with room to spare.
- Plus: the hand laid out ACROSS the panel (11 rows of content into 8), the
  table view reclaiming the hidden log's rows, `StatusBar` clipping to its
  row, the UNO card drawn by the SDK's card engine in ANSI colour rather than
  hand-rolled ASCII, `UI_THEME.rail` (the missing `//////` chrome), and six
  non-ASCII glyphs replaced with ASCII tokens.

AI players were never missing: `syncBotsForTable()` fills every empty seat
automatically. The sysop saw no bots because the dialog blocked table
creation.

## 3. GRANDMASTER against the reference

**The reference is HeborisCE**, at `Documentation/7-Reference Sources/HeborisCE-1.1.0`
(a second copy sits at `HeborisCE-main/`). It is NOT TetriNET - that is a
different lineage which happens to also live in this door, and reading it for
TGM questions was a mistake the sysop had to correct. Full audit with
citations: `thoughts/shared/research/2026-09-02_grandmaster-vs-heboris-gaps.md`.

Landed this session:

- `d7be37076` **The Master timing curve started in the wrong place.** Heboris
  holds ARE 26 / line-clear 40 / lock 28 / DAS 15 until level 500
  (`speed.c:86-89`); the door opened on the level-500 values from
  `speed.c:98-116` and then tightened further too early. DEATH was checked
  against the DOOM tables and was already correct - left alone.
- `dc5b16fcd` **Torikan** - the qualifying cutoff (`init.c:174`, 420*60 for
  Master; DOOM banded by rotation rule). Note the word is 足切り / とりカン in
  the source; searching for "torikan" in romaji finds nothing.
- `1bdb3cbac` + `670b48355` **Six rotation systems** - TI-ARS, ACE-ARS,
  TI-WORLD, ACE-SRS, DS-WORLD, SRS-X. The shape tables and 90-degree kick
  offsets ARE shared between TI-ARS/ACE-ARS and across the WORLD family, but
  the systems are not interchangeable: `world.c:425-426` exempts DS-WORLD
  from kick limits (infinite spin) and `world.c:440` makes SRS-X lock
  instantly on down. Both implemented.
- `129f2a378` **The item system.** Items ride the whole locking piece
  (`gamestart.c:16230`), selection is a gauge past `item_interval = 20`
  (`:834`) with a weighted draw and five-deep history (`:6997-7064`), and a
  HARD block cancels its row's clear. 13 of the 19 TGM items implemented.

Earlier the same day: `0595d0507` (leaderboard measures from the screen),
`b6270eac4` (80 columns draws a board AND the standings - the list minimum was
22 columns where 80 can only spare 21), `d3b3b3927` (battle royale repaints
only boards that changed: 14.04 ms -> 1.63 ms per frame at 200x60 with 32
opponents).

## Learnings

- **A widget renders from its live properties.** Written down once already
  after CARD LOBBY; it recurred in a different call site. `options` is a
  seed, not state.
- **Heboris bands rotation rules by difficulty** (`init.c:178-180`), which
  turned the torikan agent's honest guess into a citation once the real
  systems existed. Exhaustiveness checking in TypeScript is what surfaced it.
- **`git commit` with no pathspec takes the whole shared index.** It swept
  three of another session's staged files into a commit here. Commit by path,
  always, and note that `-F -` reads the MESSAGE from stdin.
- **A pathspec commit does not include the pre-commit hook's dist rebuild**
  when the hook runs after git has snapshotted the tree. Check.
- **The deploy has `concurrency: deploy-hetzner`** - a push within minutes of
  another CANCELS the earlier run (learned from another session). A deploy
  that dies in 11-20 seconds is something else entirely: the host's anonymous
  HTTPS `git fetch` breaking and falling back to a credential prompt with no
  tty. `c41c9aacf` retries it.
- **Local Docker was the disk problem**, not worktrees: 5.8 GB of build cache
  and 3.0 GB of images with zero active containers. The BBS runs on Hetzner,
  so local images here are always stale. `docker system df` shows it.

## Working with agents on one door

Four agents built the GRANDMASTER features. What made it work:

- **Sparse worktrees, 141 MB each**, prepared by hand with node_modules
  symlinked and `sdk` pre-built (`npm run build`, not just `build:cjs` - the
  door's client bundle needs the ESM output). The agent tool's own
  `isolation: worktree` makes a 625 MB full checkout.
- **Briefs that name the reference file:line** and say "if the reference
  contradicts me, the reference wins". Two agents corrected the brief - one
  found items ride a piece rather than a cell, another found the reference
  gates behaviour on `rots` per system.
- **Never take the report at face value.** One agent concluded six rotation
  systems were "provably identical"; the reference gates real gameplay on
  each. Sent back with citations, it verified all five, implemented two, and
  declined two more that needed a design decision.
- **They collide in three places**: `tests/run-tests.ts` (every agent appends
  its module), `core/types.ts` and `core/game.ts`. A conflict once split a doc
  comment mid-block and the naive resolution was a syntax error - TypeScript
  caught it.

## Next steps, in order

1. **DEVIL / DOOM / GOD difficulty curves.** Heboris has full timing tables
   (`speed.c:215-260` for DEVIL). The door has none of these modes.
2. **MISSION mode** (`src/script/mission.c`) and **PRACTICE mode**
   (`src/script/practice.c`).
3. **CEMENT, HIDDEN (blocks vanish), versus WIN TYPE / WINLINE.**
4. **The remaining 6 TGM items** - ROLLROLL, DEATH, X-RAY, COLOR, DARK,
   TRANSFORM. Note X-RAY/COLOR/DARK hang off `getFieldBlock(opt=1)`, which is
   never called with that argument anywhere in the reference; they may be
   dead in Heboris itself. Items 32-39 and the DS-only set are also open.
5. **Two design calls deferred by an agent rather than guessed:**
   ACE-SRS/DS-WORLD's soft-drop constant (`world.c:405`) versus this door's
   configurable `softDropSpeed`, and ACE-ARS's up-key instant lock
   (`ars.c:331,361`) which needs an input action this door does not have.
6. **A discrepancy found and left alone:** `manual.ts` tells the player Death
   Mode is "20G from the START", but its gravity column stays at 1.0 until
   level 500. Either the manual or the curve is wrong.
7. **The fifteen remaining one-row boxes** - bug-tracker, rip-browser,
   grandmaster. The test names the file and the count.
8. **Never driven by hand:** CARD LOBBY's gamepad paths and end-of-UNO-game;
   the new GRANDMASTER items and rotation systems have tests but nobody has
   played them.

## Other notes

- Landing here is by cherry-pick onto a fresh worktree of `origin/main`;
  never merge `feat/installed-door-link`. See [[project-landing-by-cherry-pick]].
- `thoughts/BOARD.md` (gitignored) is the cross-session channel. Two peer
  sessions answered disk questions within minutes when messaged directly.
- GWALL was confirmed working by the sysop this session.
