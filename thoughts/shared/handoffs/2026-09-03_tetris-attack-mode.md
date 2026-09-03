---
date: 2026-09-03
topic: TETRIS ATTACK (Panel de Pon) mode for the GRANDMASTER door
tags: [grandmaster, tetris-attack, panel-attack, port, netplay, petscii]
status: implemented
---

# TETRIS ATTACK in GRANDMASTER

Seven modes, an engine ported 1:1 from `panel-attack/panel-game`, proved
against that project's own fixtures rather than asserted.

## Where the work is

Worktree `scratchpad/ta-wt`, branch `feat/tetris-attack`, cut from `origin/main`.
31 commits, none pushed. Landing is by cherry-pick onto a fresh worktree of
`origin/main`, never by merging this branch.

## What is done

| Area | State | What proves it |
|---|---|---|
| Engine | done | Two of panel-attack's replays play frame-exact (402/37/3) |
| PRNG | done | Their published seed strings, bit for bit |
| Endless, Time Attack | done | Score, leaderboard, high scores |
| Vs CPU | done | panel-pop's AI, ported whole |
| Challenge | done | 68 attack scripts, health model |
| Puzzle | done | **234 of 235 shipped solutions solve**, plus X/Y undo |
| Stage Clear | done | 30 stages + 2 Bowser fights; bot clears stage 1-1 in the test |
| Vs Player | done | Lockstep session; boards compared panel for panel |
| Replays | done | ReplayV3 written and read; round trip compared board for board |
| 40 columns | done | KERNAL oracle: the glyphs are on the glass, no `?` |
| Manual | done | A test reads it back and fails if it misquotes the engine |

Door suite 644 pass / 0 fail. `tests/doors/compact-40` 104 pass. `tsc` clean in
the door and in `web/backend`; `typecheck:tests` clean.

## What the oracles caught

Things no amount of reading the source would have found:

- **The cursor starts at (7, 3)**, not the origin. Recorded solutions are
  relative to it. 3 of 71 move puzzles solved before; 71 after.
- **Puzzles are modern level 10.** One level either side and dozens fail on
  frame timing; classic presets cannot run a clear puzzle at all.
- **Versus modes crashed on the first cleared garbage.** Vs CPU, Challenge and
  both Bowser fights were on a classic level, which has no `GARBAGE_HOVER`.
  Endless never notices; versus notices the first time the player does the
  thing versus is about. Found by the netplay session, which was the first
  thing to play two boards long enough for anyone to clear a slab.
- **`hasMatchableGarbage` must scan only rows 1..height** and skip `matched`.
  Clear puzzles went 7/80 to 80/80.
- **A boss's stage number** was taken from the count of boards before it,
  giving SPECIAL the same number - and seed, and speed - as 4-1.
- **The clear line sat AT the starting height** in round 1, so stage 1-1
  reported itself cleared on frame one.
- **Blessed tags were clipped mid-tag** in both HUDs: a 14-column slice of
  `{yellow-fg}POINT...` is `{yellow-fg}POI`, which paints nothing and leaves
  the tag open for the rest of the screen. Latent because every test measured
  printable width.
- **The mode's four list dialogs were 56 columns wide** on a door marked for 40.
- **The PETSCII table has `{rvs: N}` entries**; reading only plain numbers
  reports every block glyph as undrawable, including Challenge's danger bar.

## Deliberate divergences

- **The SNES "chainless chain" is not reproduced.** A match above still-popping
  panels is credited as a chain on the cartridge; panel-attack has no such
  rule, and every oracle proving this port comes from panel-attack. Adding it
  would falsify two replays and 234 puzzle solutions to gain one trick. Tested
  in the negative, and disclosed in the manual under its own heading.
- **Stage Clear's 30 board layouts are generated**, from a per-stage seed. They
  are not published in any source - not panel-attack, not panel-pop, not a
  FAQ; they are in the ROM. The rule is the original's; the boards are not.
- **`novice_chains#3`** is the one puzzle whose recorded solution does not
  solve it here. Named in the test rather than hidden, so a change that fixes
  it - or breaks the other 234 - says so.

## Gotchas for the next session

- **`npm run test:doors` fails one arkanoid test in this worktree** and it is
  not caused by this branch. `ta-wt/node_modules` is a symlink to the shared
  tree's, so `@amiexpress/bbs-door-sdk` resolves to the SHARED tree's `sdk/`,
  and that tree is checked out on a branch whose SDK has no `./settings`
  export. Nothing here touches arkanoid or the SDK.
- `Doors/grandmaster/node_modules/@amiexpress/bbs-door-sdk` in this worktree is
  repointed at the worktree's own `sdk/`, which is why the door suite runs.
- The pre-commit hook rebuilds the whole door `dist/` from disk, so only one
  agent may work in `Doors/grandmaster/` at a time.

## Not done

- **A two-session walk of VS PLAYER.** The lockstep session is tested in
  process against a loopback transport, but nobody has played a panel game
  against another caller through the real broker.
- The manual walk generally: 80-column web, 132-column telnet, a `P` PETSCII
  session and a real C64. Sysop's to tick, not mine.

## Files

Engine `Doors/grandmaster/core/panels/` (21 files), AI `ai/panel-ai.ts`,
netplay `network/panel-{transport,broker-transport,netplay-session}.ts`,
screens `ui/panels-{screen,versus-screen}.ts` and `ui/panels/`, data in
`puzzles/`, `attack-patterns/` and `sprites/`, tests in `tests/panels/` (17
files) and `web/backend/tests/doors/compact-40/tetris-attack.test.ts`.

The reusable playbook for doing this again - Dr. Mario is the next one - is
`.claude/skills/port-game-engine/SKILL.md`.
