---
date: 2026-09-03
topic: card lobby polish, in-door themes, 68K host detection, bundle weight, C SDK phase 0, mission editor
tags: [card-lobby, grandmaster, sdk, themes, 68k, ci]
status: implemented
---

# Nine things landed, and three of my own claims that were wrong

All on main and live at `fde28d8de`.

| Commit | What |
|---|---|
| `483eb3972` | CARD LOBBY card style panel: stays open, the whole engine option surface |
| `5ab30b66f` | Theme menus inside doors, SDK live re-tint, eight duplicate resolvers folded into one |
| `c29c1025d` | CARD LOBBY chat |
| `3060a04d9` | 68K host detection: AE_HOST / AE_CAPS |
| `02348bc2a` | Door browser bundles stop carrying the widget set |
| `d4262ebe0` | Amiga C SDK phase 0 |
| `18f038625` | GRANDMASTER mission editor |
| `823eeff36` | GRANDMASTER menu keys |
| `fde28d8de` | CI installs the doors it type-checks (main was red) |

## The class of bug worth carrying forward: a list that has to be edited

Three of today's nine were the same shape - two parallel things that must
agree, kept in agreement by hand:

- **GRANDMASTER's menu.** `q`/ESC emitted row 15 and F1 row 14. Right at
  sixteen rows; the menu has eighteen, so `q` opened HIGH SCORES and F1
  opened SETTINGS. Nothing errored. Fixed by looking a row up BY NAME
  (`MENU_SELECTIONS` at module scope); the test pins the ALIGNMENT of the two
  lists, not the lookup, because alignment is what broke.
- **CI's door installs.** A hardcoded list of doors to `npm install`,
  hand-patched twice before, out of date a third time the day ncurses-pong
  and phreakwars arrived - main red with TS2307 against two innocent doors.
  Now derived from what `web/backend` actually references.
- **The card style panel**, in a smaller way: settings the engine offered and
  the door did not, drifting apart silently.

Ask of any pair like this: what makes them agree, and what fails if they stop?

## Three claims of mine that were wrong, and how they were caught

1. **"Nine unimplemented item ids"** (from my own earlier backlog note). It is
   four - X-RAY, COLOR, DARK, TRANSFORM - and each already carries a written
   exemption in `core/items.ts`: their behaviour in HeborisCE is dead code,
   nothing live reads what they set, and the engine never draws them. Caught
   by reading the file instead of the note.
2. **The C SDK plan's link rule** (`-ffunction-sections` + `--gc-sections`).
   vbcc has neither, and neither the host `ar` nor llvm's `emar` can write an
   archive vlink reads. What works is that an Amiga hunk library is the
   CONCATENATION of hunk objects and vlink pulls a unit only when a symbol is
   referenced. Numbers in `sdk/c/README.md`; the plan is corrected in place.
3. **My first bundle-weight test.** It bundled SDK SOURCE in a fixture and
   passed with and without the fix - a door resolves the PACKAGE, and it is
   dist-esm's compiled shapes that defeat DCE without `sideEffects`. Replaced
   by a guard that reads the committed `dist/client.bundle.js` files.

The pattern: a test that does not reproduce the real resolution path is not a
test. Prove RED before believing any of them.

## What each piece is, in one line

- **Card style panel** (`Doors/card-lobby/managers/CardStyleDialog.ts`) - stays
  open, LEFT/RIGHT cycles, live preview. The List reads LEFT/RIGHT as
  page-up/page-down, so handlers must return `true` or the highlight jumps.
- **Live themes** (`sdk/engines/ui/theme/live.ts`, `.../widgets/theme-menu.ts`)
  - a theme is captured at widget-build time in TWO carriers: style objects
  and blessed tags already inside `setContent`. `retintTree` rewrites both, so
  no door has to repaint itself. Ambiguous colours resolve by the counts
  `tokens.ts` measured (blue is a bar 20 times, white is body text 44).
- **Lobby chat** (`Doors/card-lobby/lib/chat.ts`, `managers/ChatManager.ts`) -
  rides the shared `LobbyState` the refresh timer already re-reads. CHAT is
  stacked under ACTIVITY, full column width: at 120x30 that column is 35 wide
  and a sideways split leaves 15 usable characters.
- **Host detection** (`web/backend/src/amiga-emulation/utils/host-vars.ts`,
  `sdk/c/include/ae_host.h`, `Documentation/4-Door-Developers/HOST_DETECTION.md`)
  - absence of `AE_HOST` is the load-bearing case: it is what classic
  AmiExpress looks like, so no AE_ file is written when nobody described the
  caller. `AE_CAP_PETSCII` means draw for 40 columns, NOT emit PETSCII.
- **Bundle weight** - `"sideEffects": false` in `sdk/package.json`. 15.1 MB of
  door bundles to 10.8. What remains in the arcade doors is Tone.js.
- **C SDK phase 0** (`sdk/c/`) - `make test` needs no Amiga toolchain;
  `make amiga` and `make measure` need vbcc. A small door costs 5,048 bytes.
- **Mission editor** (`Doors/grandmaster/ui/mission-editor.ts`) - sysops press
  E on the MISSIONS list. Sysop packs go to `Doors/grandmaster/data/missions/`
  because assets/ is the checkout and the Doors volume sync only ever adds.
  Every save goes through `parseMissionPack`.

## Telnet door input: fixed, and confirmed

The sysop confirmed on a live telnet session (2026-09-03, `01c572259`) that
door input works. Three separate causes, found and fixed in that order:

1. the game-mode gate dropped the character path for callers with no browser
   (`deliversKeyEvents`);
2. a hybrid door's client half started for callers with no browser at all,
   registering a 'command' listener that swallowed every key
   (`hasBrowserClient`);
3. telnet's dispatcher returned at the FIRST 'command' listener, so a door
   whose prompt listener was still registered never reached its own handler.

Only the third is subtle, and it is the same shape as the day's other two
bugs: web and telnet each had their own copy of the routing, and the copies
disagreed. They ask one function now
(`web/backend/src/services/door-input-routing.ts`), which returns EVERY
destination rather than the first - because delivering to both a prompt and
the running door is what socket.io already did on web.

## Open

- **`ui/menu.ts`**: the tetris-attack branch carries a duplicate menu fix
  inside a commit that also lands its unfinished mode. They were asked on the
  board to drop their hunk when they rebase.
- **`Conf.DB`** shows modified in both my worktrees and is not my work; a
  handoff on main records a Conf.DB discard incident today, so I left it and
  kept the worktrees (`scratchpad/gm-brief`, `scratchpad/land-2`).
- **Telnet input is confirmed; the rest is not.** Worth a look: the card style
  panel, `T` chat across two nodes, View > Theme in LiveChat and the three
  editor doors, and sound in pengo/frogger plus the showcase mic demo after
  the bundle trim.
