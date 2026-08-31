---
date: 2026-08-31
topic: "Super Qix and Frogger shipped; two plans ready to execute"
tags: [super-qix, frogger, doors, handoff, plans]
status: final
---

# Handoff: Super Qix, Frogger, and two plans waiting

## Where things are

Everything below is **on `main` and deployed**. Both doors' `dist/` are built
and committed. The user's checkout at `/Users/spot/Code/amiexpress-web` is on
`feat/installed-door-link` with `main` merged in and contains everything.

- **Super Qix**: 116 tests. FAQ-complete (74 done, 9 exempt, 0 open) plus the
  live fixes below.
- **Frogger**: 110 tests. FAQ-complete (46 done, 5 exempt, 0 open).

## What to do next

Two plans, written with the user this session. Neither has been started.

1. `thoughts/shared/plans/2026-08-31-super-qix-quix-gaps.md` - 30 items,
   closing the gaps against the QUIX reference clone. Decisions already taken
   with the user; no open questions in the plan.
2. `thoughts/shared/plans/2026-08-31-arcade-doors-to-grandmaster-level.md` -
   bringing the ten arcade doors up to Grandmaster's level of UI, SDK use and
   features. Explicitly **not** gameplay mechanics.

Supporting research:
`thoughts/shared/research/2026-08-31_quix-reference-comparison.md`.

Follow `~/.claude/REACHABILITY_PROTOCOL.md`: show the FULL checklist before
starting, tick it in the open, report the running count, and execute 100%.

## Critical references

| What | Where |
|------|-------|
| Super Qix ledger | `Doors/super-qix/CHECKLIST.md` |
| Frogger ledger | `Doors/frogger/CHECKLIST.md` |
| Super Qix FAQ | `/Users/spot/Desktop/FAQ_Qix.txt` |
| Frogger FAQ | `/Users/spot/Desktop/FAQ_Frogger.txt` |
| QUIX reference | `codeberg.org/SirWumpus/quix` @ `1e1d40dbeb`, cloned to the session scratchpad |
| Frogger ANSI reference | `/Users/spot/Downloads/Frogger (small).ans` by Philippe Majerus |

## Learnings - the ones that cost time

**`blessed.box()` returns a Panel, and Panel injects `{type:'line', fg:'blue'}`
whenever `border` is absent.** This bit three times in one session, in three
places: the game area (two columns stolen, so full-width rows wrapped and every
second line went black), the one-row HUD (the border WAS the whole box, so the
score line never drew), and the menu box (sized 54 for a 61-column title, so the
letters sheared). Always pass `border: undefined` explicitly, and `wrap: false`
on anything laid out by hand. `Doors/*/tests/layout.test.ts` pins it, including
a test that fails if the SDK ever stops injecting borders.

**Amiga ANSI art is Latin-1, not CP437.** Eleven of Super Qix's sixteen
backgrounds declare an Amiga font in their SAUCE record (Topaz, mOsOul,
MicroKnight, P0T-NOoDLE), and decoding those as CP437 turns every accented
letter into box-drawing - a skull drawn in slashed Os renders as a yellow
lattice. `sdk/engines/ui/ansi-editor/core/cp437.ts` now picks the decoder from
SAUCE's font name. Also: do not trust SAUCE's `fileSize` - a zero there means
loading nothing at all.

**Doors write into `dist/`, which every deploy replaces.** Arkanoid was fixed
for this; `Doors/super-qix/server.ts:12` still has it. Use the `getDoorRoot()`
pattern from `Doors/arkanoid/server.ts:36`.

**Save RPCs cap names at three characters.** A coin-op ritual that stops a BBS
handle being recorded. Frogger now takes `ctx.session.user.username`;
`Doors/super-qix/server.ts:63` still caps at 3.

**Five files are committed with CRLF against a `.gitattributes` demanding LF**
(`web/backend/tsconfig.build.json`, four under `web/config-app/`). They were
renormalised this session, but the pattern recurs: git reports them modified in
every fresh checkout, which blocks `rebase` and `merge`. When main has moved,
`git checkout --detach origin/main` then `cherry-pick` - checkout and
cherry-pick tolerate the dirt, rebase does not.

**Never `git stash` in this repo** - the phantom files make `stash pop`
unresolvable.

**Build door `dist/` in a worktree and the bundle records the worktree's path.**
Restore `dist/client.bundle.js` from `origin/main` before committing a
cherry-pick, unless the client actually changed.

## Learnings - about the testing

Seven revert-checks this session **passed**, and every one exposed a test that
proved nothing:

- A log-riding test anchored on the log's `(` end - but the frog is drawn over
  the log and covers that end, so the frames where the frog had drifted were
  exactly the frames the test skipped.
- A "sinking turtle is still footing" test set the *derived* flag by hand, so
  it never exercised the derivation it was testing.
- A "the bank is textured" test was satisfied by the frog standing on the bank.
- A Time Meter test counted colour TAGS, which count runs, not cells.
- A bonus-spawn test could not tell two code paths apart because both produced
  the same shape of answer.
- A finished-line test cleared the Gremlin, so its claim took the whole board
  and finished the level - hiding the thing under test.
- A title-indent test counted leading spaces on a title painted entirely in
  background colour, where every character is a space.

**Reverting the fix and watching the named test fail is not optional.** It found
a real hole seven times in one day.

## Learnings - about the games

**Measure the pacing, do not port it.** The arcade's fuse lights after 500ms;
people TAP arrow keys at roughly 660ms apart, so an ordinary draw died 30 times
out of 30 before retuning. The same applies to QUIX's `(10 - quixnum) * 30`
tick - the plan deliberately does not adopt it.

**Repeated deaths in consecutive frames.** Neither door had a grace period, so
the enemy that killed you was still touching you the next frame: measured at
three lives in three frames. Both now have one, and Super Qix blinks the marker
while it lasts.

**A fractional position and a rounded sprite disagree.** The frog rides a log at
the log's fractional x, and a hop that kept the fraction was judged against a
position half a cell from where the frog was drawn - so a frog visibly over a
home died for missing it. Hops snap to whole cells now.

## Recent changes, newest first

- Frogger: title shear fixed; hops land on whole cells; frog takes the
  complement of its ground; logo moved to the top of the screen; clock moved
  into the status line; footer removed.
- Super Qix: one death costs one life; letters fly over the field and can be
  caught by enclosing them; panels sit over the picture; Enter skips the
  hand-over; finished lines stay drawn.
- SDK: Amiga/Latin-1 ANSI decoding; SAUCE fileSize fallback.

## Other notes

- `handoff.md` at the repo root is at 8,872 bytes against a 10 KB cap. Another
  session is editing it; take main's side on conflicts, it is their document.
- Untracked leftovers from an earlier work-loss are parked in the session
  scratchpad under `pre-merge-untracked/`, `pre-merge-2/`, `pre-merge-3/`. All
  were identical to main or superseded by it.
- `/tmp/frogger-work` and `/tmp/qix-work` are worktrees from this session.
  `qix-work` holds unrelated dirt that is not mine; both can go once the
  branches are confirmed merged.
