---
date: 2026-08-31
topic: "Session close: Super Qix and Frogger shipped, three doors abandoned, two plans ready"
tags: [super-qix, frogger, doors, arcade, handoff, plans]
status: final
supersedes: thoughts/shared/handoffs/2026-08-31_super-qix-frogger-and-two-plans.md
---

# Handoff: where everything stands, and what is left

Supersedes `2026-08-31_super-qix-frogger-and-two-plans.md`, written earlier the
same day and now out of date - three doors have been deleted since and the
arcade plan was recut from ten doors to nine.

## State

Everything below is **on `main`**. The user's checkout at
`/Users/spot/Code/amiexpress-web` is on `feat/installed-door-link` with `main`
merged in and contains all of it. Both doors' `dist/` are built and committed.

| | |
|---|---|
| Super Qix | 116 tests, FAQ-complete (74 done, 9 exempt, 0 open) |
| Frogger | 110 tests, FAQ-complete (46 done, 5 exempt, 0 open) |
| `dev/tests` | 3 of 3 |
| Doors in tree | 100 |

Last commits: `285be2bd2` (reference cleanup), `9f33e7618` (door removal),
`3c73ebe59` (the two plans and the previous handoff).

## Task 1 - Close the QUIX gaps in Super Qix

**Plan**: `thoughts/shared/plans/2026-08-31-super-qix-quix-gaps.md` - 30 items,
six phases, no open questions.
**Research**: `thoughts/shared/research/2026-08-31_quix-reference-comparison.md`.

Four decisions were taken with the user and are already in the plan: refuse the
own-line move rather than kill; adopt the Gremlin count as a difficulty axis
capped at four, scaling the fill score but NOT tick speed; pay for captured
Gremlins though FAQ 2.2 says otherwise; add all three door conveniences.

The most interesting item is **Q-1a**: we kill the player for touching their own
line, where both the QUIX reference and FAQ 2.1 refuse the move. That is a
defect against our own source document, not a difference of taste.

Two defects found while reading are folded in as Phase 3:
`Doors/super-qix/server.ts:12` writes high scores into `dist/`, which every
deploy replaces, and `server.ts:63` rejects any name longer than three
characters so a BBS handle cannot be recorded. Arkanoid and Frogger were both
fixed for exactly these; Super Qix never was.

## Task 2 - Bring the nine arcade doors up to Grandmaster's level

**Plan**: `thoughts/shared/plans/2026-08-31-arcade-doors-to-grandmaster-level.md`.

Scope is the shell, not gameplay: UI, SDK use, joypad, settings, persistence,
presentation. Measured, not assumed - **six of the nine have no joypad, eight
have no attract mode, seven have no tests at all.**

The approach is to extract Grandmaster's shell into `sdk/engines/ui/arcade/`
(menu, manual, leaderboard, attract state machine, input hints, per-user
settings, `getDoorRoot`) and adopt it nine times, rather than copy 3,500 lines
into each door. **Grandmaster gets refactored onto the extraction first**: if it
cannot carry Grandmaster, it is the wrong abstraction, and better to learn that
at the source than after nine adoptions.

## Task 3 - Two Grandmaster bugs, recorded and not investigated

Both in `thoughts/shared/todos/2026-08-30_queue-round-2.md`:

- **A lone bot should be full size, not a minimap** (line 150). In TetriNet mode
  the opponent's board is drawn as a minimap even when there is only one
  opponent, where there is room to draw it properly. Minimaps only from two.
- **"Watch a game" always reports no game running** (line 169), reproduced by
  the user with two browsers - playing in one, spectating from the other.
  `Doors/grandmaster/tests/spectator.test.ts` already covers the spectator path,
  so compare what it sets up against what the live lobby actually registers.

## Task 4 - Still open from earlier in the session

- **ANSI sprite and tile graphics for the arcade doors.** Frogger now has them
  (coloured lanes with character sprites, adapted from Philippe Majerus's ANSI);
  the rest still draw ASCII. This overlaps Phase 5 of the arcade plan.
- **An attract screen for Super Qix.** The user asked for the arcade's, with a
  blinking "press button" in place of "insert coin". Frogger's is the model, and
  Phase 4 of the arcade plan would give Super Qix one for free.

## Task 5 - The live BBS still has the deleted doors

Deploys do not update the `Doors/` volume, so the running container still
carries the three abandoned doors. **Not run - it touches the live board and is
the user's call:**

```
docker exec amiexpress-bbs rm -rf /app/Doors/tic-tac-toe \
  /app/Doors/bubble-bobble /app/Doors/fire-emblem-v2
docker exec amiexpress-bbs sh -c \
  'rm -f /app/Commands/BBSCmd/{ttt,TICTACTOE,BUBBLEBOBBLE,FIREEMBLEM,FIREEMBLEMV2}.info'
```

## Critical references

| What | Where |
|------|-------|
| Super Qix ledger | `Doors/super-qix/CHECKLIST.md` |
| Frogger ledger | `Doors/frogger/CHECKLIST.md` |
| Super Qix FAQ | `/Users/spot/Desktop/FAQ_Qix.txt` |
| Frogger FAQ | `/Users/spot/Desktop/FAQ_Frogger.txt` |
| QUIX reference | `codeberg.org/SirWumpus/quix` @ `1e1d40dbeb` |
| Frogger ANSI reference | `/Users/spot/Downloads/Frogger (small).ans`, Philippe Majerus |
| Door freshness protocol | `.claude/skills/door-sdk-freshness/SKILL.md` |

## Learnings - the ones that cost time

**`blessed.box()` returns a Panel, and Panel injects `{type:'line', fg:'blue'}`
whenever `border` is absent from the options.** This bit three times in one
session in three different places: the game area (two columns stolen, so
full-width rows wrapped and every second line went black), the one-row HUD (the
border WAS the whole box, so the score line never drew), and the menu box (sized
54 by eye for a 61-column title, so the letters sheared). Always pass
`border: undefined` explicitly, and `wrap: false` on anything laid out by hand.
`Doors/*/tests/layout.test.ts` pins it, including a test that fails if the SDK
ever stops injecting borders.

**Amiga ANSI art is Latin-1, not CP437.** Eleven of Super Qix's sixteen
backgrounds declare an Amiga font in SAUCE (Topaz, mOsOul, MicroKnight,
P0T-NOoDLE); decoding those as CP437 turns every accented letter into
box-drawing, so a skull drawn in slashed Os renders as a yellow lattice.
`sdk/engines/ui/ansi-editor/core/cp437.ts` now picks the decoder from SAUCE's
font name. Also: SAUCE's `fileSize` is often zero, and taking it literally loads
nothing at all.

**Doors write into `dist/`, which every deploy replaces.** Arkanoid was fixed;
Super Qix still has it. Copy `getDoorRoot()` from `Doors/arkanoid/server.ts:36`.

**Save RPCs cap names at three characters** - a coin-op ritual that stops a BBS
handle being recorded. Take `ctx.session.user.username` instead.

**Five files are committed with CRLF against a `.gitattributes` demanding LF.**
They were renormalised this session but the pattern recurs: git reports them
modified in every fresh checkout, which blocks `rebase` and `merge`. When main
has moved, `git checkout --detach origin/main` then `cherry-pick` - checkout and
cherry-pick tolerate the dirt, rebase does not. **Never `git stash` here**: the
phantom files make `stash pop` unresolvable.

**Building a door's `dist/` inside a worktree bakes the worktree's path into
`client.bundle.js`.** Restore that file from `origin/main` before committing a
cherry-pick, unless the client genuinely changed.

**`git commit` after `git rm` does not include your unstaged edits.** The door
removal commit staged the deletions but not the two files that referenced them,
so `dev/tests` went red - it walked a list that still named a deleted door.
Found only by running the suite after pushing. Run it after, not before.

## Learnings - about the testing

**Eight revert-checks this session passed**, and every one exposed a test that
proved nothing:

- A log-riding test anchored on the log's `(` end - but the frog is drawn over
  the log and covers that end, so the frames where it had drifted were exactly
  the frames the test skipped.
- A "sinking turtle is still footing" test set the *derived* flag by hand, so it
  never exercised the derivation under test.
- A "the bank is textured" test was satisfied by the frog standing on the bank.
- A Time Meter test counted colour TAGS, which count runs, not cells.
- A bonus-spawn test could not tell two code paths apart.
- A finished-line test cleared the Gremlin, so its claim took the whole board and
  finished the level, hiding the thing under test.
- A title-indent test counted leading spaces on a title painted entirely in
  background colour, where every character is a space.
- A demo-safety test survived with traffic checks disabled, because level 1 has
  three cars in forty cells.

**Reverting the fix and watching the named test fail is not optional.** It found
a real hole eight times in one day.

Two tests over-claimed and were corrected rather than the code: a frog cannot
get home from *any* fraction of a cell (at exactly half it is drawn on the next
cell and misses), and "the whole board is one colour" is false once the frog is
standing on it.

## Learnings - about the games

**Measure the pacing, do not port it.** The arcade's fuse lights after 500ms;
people TAP arrow keys about 660ms apart, so an ordinary draw died 30 times out of
30 before retuning. The QUIX plan deliberately does not adopt its
`(10 - quixnum) * 30` tick for the same reason.

**Repeated deaths in consecutive frames.** Neither door had a grace period, so
the enemy that killed you was still touching you the next frame: measured at
three lives in three frames, a tenth of a second. Both now have one.

**A fractional position and a rounded sprite disagree.** The frog rides a log at
the log's fractional x, and a hop that kept the fraction was judged against a
position half a cell from where the frog was drawn - so a frog visibly over a
home died for missing it. Hops snap to whole cells now.

**Unimplemented is not the same as unreachable.** Super Qix's letters were fully
implemented and had never once appeared: the spawn scan excluded the very row
that edge-hugging claims land on, and edge-hugging claims are almost every claim.

## Housekeeping

- `handoff.md` at the repo root is at 9,463 bytes against a 10 KB cap. Another
  session edits it; take main's side on conflicts, it is their document.
- Worktrees from this session: `/private/tmp/frogger-work` (detached, merged) and
  `/private/tmp/qix-work` (holds unrelated dirt that is not mine). Both can go
  once their branches are confirmed merged. Several other sessions' worktrees are
  also listed by `git worktree list`; leave those alone.
- Untracked leftovers moved aside during merges are in the session scratchpad
  under `pre-merge-untracked/`, `pre-merge-2/`, `pre-merge-3/`, `pre-merge-4/`.
  All were identical to main or superseded by it.
- `.vscode/launch.json` names Tic-Tac-Toe and Fire Emblem but points at
  `sdk/examples/...` paths that have never existed in this tree. It was stale
  before today and was deliberately left alone.
