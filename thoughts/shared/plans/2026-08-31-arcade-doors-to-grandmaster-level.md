---
date: 2026-08-31
topic: "Bring the nine arcade doors up to Grandmaster's level: UI, SDK, features"
tags: [doors, arcade, sdk, ui, plan]
status: draft
---

# The nine arcade doors, brought up to Grandmaster's level

Scope, as set by the user: **not gameplay mechanics.** The shell around the
game - UI, SDK use, joypad, settings, persistence, presentation. Each game's
rules stay as they are.

## Where things actually stand

Measured 2026-08-31, walking every `.ts` outside `node_modules` and `dist`.
Bubble Bobble was in this table until the user abandoned it, along with
Tic-Tac-Toe and Fire Emblem; these are the nine that remain:

| Door | lines | joypad | held keys | audio | attract | settings | manual | scores | tests |
|------|------:|--------|-----------|-------|---------|----------|--------|--------|-------|
| arkanoid | 2239 | yes | **no** | yes | **no** | **no** | yes | yes | **no** |
| donkey-kong | 1984 | **no** | yes | yes | **no** | **no** | yes | yes | **no** |
| frogger | 5674 | yes | yes | yes | yes | yes | yes | yes | yes |
| galaga | 1975 | yes | yes | yes | **no** | yes | yes | yes | **no** |
| joust | 1722 | **no** | yes | yes | **no** | **no** | yes | yes | **no** |
| pengo | 1446 | **no** | yes | yes | **no** | **no** | yes | yes | **no** |
| pipe-dream | 1498 | **no** | yes | yes | **no** | **no** | yes | yes | **no** |
| super-qix | 9523 | **no** | yes | yes | **no** | yes | yes | yes | yes |
| zoo-keeper | 3563 | **no** | yes | yes | **no** | **no** | yes | yes | **no** |
| _grandmaster_ | _38706_ | _yes_ | _yes_ | _yes_ | _yes_ | _yes_ | _yes_ | _yes_ | _yes_ |

So: **six of the nine have no joypad**, **eight have no attract mode**, six
have no settings, and **seven have no tests at all**.

Grandmaster's polish lives in `Doors/grandmaster/ui/` - 1117 lines of attract
screen, 1121 of settings, 443 of manual, 397 of menu, 320 of leaderboard, 159
of input hints - plus `input/config.ts` and per-user settings written to
`data/settings-<username>.json`.

Almost none of that is Tetris-specific. It is an arcade door shell that
happens to have Tetris behind it.

## The shape of the work

**Extract the shell into the SDK, then adopt it nine times.** Not "copy
Grandmaster's files into each door" - that is nine copies of 3,500 lines to
maintain. The SDK already carries the input half (`sdk/utils/
door-input-manager.ts`, `gamepad-input-manager.ts`, `gamepad-action-mapper.ts`);
the screens half is what is missing.

New: `sdk/engines/ui/arcade/`.

Each door then keeps only what is genuinely its own: its board, its rules, its
sprites, and a small manifest saying what its menu rows, help text, settings
and hint labels are.

---

## Phase 1 - Extract the arcade shell into the SDK

**New files under `sdk/engines/ui/arcade/`**, each generalised from the
Grandmaster original named beside it:

| Module | From | What it becomes |
|--------|------|-----------------|
| `menu.ts` | `ui/menu.ts` | A list menu: rows, selection, a value column for settings-style rows, and the block-title + strip layout Frogger now uses |
| `manual.ts` | `ui/manual.ts` | A pager: pages of text, a key legend built from the live bindings |
| `leaderboard.ts` | `ui/leaderboard-screen.ts` | A score table: columns declared by the door |
| `attract.ts` | `ui/attract-screen.ts` | The state machine only - boot, panels, optional demo, credits - with the panels supplied by the door |
| `input-hints.ts` | `ui/input-hints.ts` | Already generic: bindings plus device in, hint text out |
| `settings.ts` | `app.ts:401-470` | Per-user settings: load, save, defaults, `data/settings-<username>.json` beside the door's source |
| `door-paths.ts` | `Doors/arkanoid/server.ts:36` | `getDoorRoot()`, so nothing writes into `dist/` |

**Checklist**

| ID | Item |
|----|------|
| A-1a | `sdk/engines/ui/arcade/` exists with the seven modules above |
| A-1b | Every module has unit tests in `sdk/tests/unit/` |
| A-1c | No module imports anything Tetris-specific |
| A-1d | `sdk` typechecks and `npm run build:cjs && npm run build:esm` succeed |
| A-1e | Grandmaster is refactored onto the extracted modules and still passes its own tests |

A-1e matters: if the extraction cannot carry Grandmaster itself, it is the
wrong abstraction, and better to find that out at the source than after nine
adoptions.

---

## Phase 2 - Input parity

Six doors have no joypad; Arkanoid drives movement from its own client loop
rather than `DoorInputManager`.

Per door: wire `GamepadInputManager`, map its buttons to that door's actions
through `GamepadActionMapper`, and add the hint bar so the on-screen prompts
say what the player is actually holding.

**Checklist** (one row per door, so nothing is silently skipped)

| ID | Item |
|----|------|
| A-2a | donkey-kong: joypad moves and fires |
| A-2b | joust: joypad |
| A-2c | pengo: joypad |
| A-2d | pipe-dream: joypad |
| A-2e | super-qix: joypad |
| A-2f | zoo-keeper: joypad |
| A-2g | arkanoid: held-key movement through `DoorInputManager` |
| A-2h | All nine show a hint bar built from live bindings, not a hardcoded string |
| A-2i | Every door's hint bar switches wording when a joypad is in use |

---

## Phase 3 - Persistence and identity

**Two defects found while reading, both already confirmed:**

- `Doors/super-qix/server.ts:12` writes `highscores.json` into `__dirname`,
  which is `dist/` - replaced by every deploy, so scores are lost. Arkanoid was
  fixed for exactly this; the rest were never checked.
- `Doors/super-qix/server.ts:63` rejects any name longer than three characters,
  so a BBS handle cannot be recorded. Frogger had the same fault and was fixed
  by taking `ctx.session.user.username`.

**Checklist**

| ID | Item |
|----|------|
| A-3a | Every door's persistence path audited; none writes inside `dist/` |
| A-3b | Every door records the BBS username, not three typed initials |
| A-3c | No door's save RPC caps the name below a real handle's length |
| A-3d | Per-user settings load and save through the shared module |
| A-3e | A settings file written by an older build still loads (defaults fill gaps) |

---

## Phase 4 - The attract mode

Eight of the nine go straight to a menu. Frogger's sequence - title, point table,
score ranking, invitation, demo - is the model, and its panels are already
built from the door's own scoring constants rather than restated.

Demo play needs something to drive the game, which is close to gameplay and
out of scope here. So: **the shell supports an optional demo hook, and a door
without one cycles panels only.** Frogger keeps its demo; the others get panels
now and a demo later if wanted.

**Checklist**

| ID | Item |
|----|------|
| A-4a | The shell cycles panels, wraps, and leaves on any key |
| A-4b | A door with no demo hook cycles panels without one |
| A-4c | Each of the nine declares its panels: title, how to play, scoring, high scores |
| A-4d | Frogger's existing demo runs through the shared shell |
| A-4e | The attract loop stops when the door closes (no orphaned interval) |

---

## Phase 5 - Presentation parity

Frogger and Super Qix have had a lot of attention this session and between them
have found faults every other door still has:

- `blessed.box()` returns a Panel that **injects a border unless `border:
  undefined` is passed**, which silently steals two columns and wraps
  full-width content onto every second line. Both doors hit it; the others
  have never been checked.
- A one-row HUD with an injected border has no content row at all.
- Non-ASCII glyphs do not survive `fullUnicode: false`.

**Checklist**

| ID | Item |
|----|------|
| A-5a | Every door audited for the Panel border trap; layout test per door |
| A-5b | No door draws non-ASCII through blessed |
| A-5c | Every door's board fills the screen width with no wrapping |
| A-5d | Every door has a game-over screen (Frogger and Super Qix both lacked one) |
| A-5e | Every door's panels sit over the board rather than on a black band |
| A-5f | Dialogs dismiss on Enter as well as by waiting |

---

## Phase 6 - Tests and the ledger

Seven of the nine have no tests. The pattern is settled: a dependency-free
runner (`tests/run-tests.ts`), plain exported async functions, `npm test`.

**Checklist**

| ID | Item |
|----|------|
| A-6a | Every door has `tests/run-tests.ts` wired to `npm test` |
| A-6b | Every door has a layout test covering the Panel trap |
| A-6c | Every door has a smoke test that starts a game and runs 100 ticks |
| A-6d | Every door has an input test: a bound key and a joypad button both move |
| A-6e | `npm run door:ci` runs them all |
| A-6f | Each door carries a CHECKLIST.md recording what it has and what it lacks |

---

## Order, and why

1. **Phase 1** first: everything else adopts it, and refactoring Grandmaster
   onto it proves the abstraction before ten doors depend on it.
2. **Phase 3** next: it is two known defects and the smallest change.
3. **Phase 2**, then **5**, then **4**: input, then the faults that make a door
   look broken, then the thing players see first.
4. **Phase 6** alongside each of the above, not saved for the end.

A door at a time within each phase, committed per door, so a failure is one
door's problem.

## Verification

Automated, per door: `npx tsc --noEmit`, `npm test`, `npm run build`. Repo-wide:
`npm run door:ci`, and the SDK's `npx jest` for Phase 1.

Manual, for the user: pick up a joypad and play each of the nine; leave each
sitting to see the attract mode; set a score and check it survives a deploy.

## Success criteria

- The table at the top has no "no" left in it.
- No door writes inside `dist/`.
- Grandmaster runs on the extracted shell.
- Every door has tests wired into CI.
