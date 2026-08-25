---
date: 2026-08-25
topic: TetriNET mode — bring it up to Grandmaster parity (build plan + execution log)
tags: [grandmaster, tetrinet, handoff, wiring, multiplayer]
status: implemented
---

# TetriNET parity — handoff

User mandate: *"get tetrinet up to gmaster level it's lacking."*

Everything below was verified by reading the code on 2026-08-25 (not from
memory). Line numbers are from the working tree at commit `7c301ff78`.

## TL;DR for whoever picks this up

TetriNET has the **same disease Grandmaster had**, and the cure is already
written and merged for Grandmaster — copy that shape.

The engine is complete on BOTH sides: it can send (`useSpecial`,
`onLinesAdded`) and it can receive (`applyIncomingSpecial`, `addGarbage`).
The **router that connects one engine to another was never written for local
play**. Both receive-side methods are called from exactly one place — the
EXTERNAL TetriNET server path (`app.ts:2164`, `app.ts:2169`) — and from
nowhere else. So against local AI, specials and garbage go nowhere.

Grandmaster had precisely this hole (attacks dead-ended in a sound-effect
callback, AI engines had no AttackManager). It was fixed in commit
`d3c7d6b6a` by adding `setupAttackRouting()` in `versus-screen.ts`. **Read
that commit first** — it is the template for TetriNET item 2 below.

## Already fixed this session (do NOT redo)

| Fix | Commit |
|---|---|
| `removeBots` missing from the TetriNET lobby adapter (lobby refused ALL bot management: guard is `!isHost \|\| !fillWithBots \|\| !removeBots`), and `fillWithBots` used the old `(difficulty)` signature instead of `(count, difficulty)` | `9205a796d` |
| Sudden-death overlay drew a default `createBox` border on the board's LAST interior row and was never hidden — hid a playable row for the whole match ("pieces land one row below the bottom border"). Now borderless, hidden until armed, moved to row 0 above the board | `7c301ff78` |
| TetriNET had NO input sounds (move/rotate/hard-drop/hold silent) | `ac694b250` |
| Sudden-death setting read the wrong key (`suddenDeathDelay` vs the editor's `delayBeforeSuddenDeath`) so the edited value was always discarded | `d3c7d6b6a` |

Door test harness exists now: `cd Doors/grandmaster && npm test`
(dependency-free tsx runner, `tests/run-tests.ts`). **24 tests currently
passing**, including `tetrinet-bots.test.ts` and `tetrinet-layout.test.ts`.
Add to it — every fix below should ship a RED-verified test.

## Parity gaps closed after the plan (same day)

The plan's five items were not the whole distance to Grandmaster parity. A
feature-by-feature comparison afterwards found three more, all now closed:

- **A TetriNET game reported no score anywhere.** High score table, BBS
  score server, livechat feed and the door_score Discord webhook are all fed
  from a `GameResult`, and none of the three TetriNET paths built one -
  `submitScore()` was gated on `this.gameEngine`, the TGM engine. Meanwhile
  `broadcastScore()` had carried a `'tetrinet' -> 'TetriNET'` label branch
  the whole time that nothing could reach, and `state.currentMode` was never
  set to `'tetrinet'`. TetriNET was the only game on the board whose scores
  never appeared in Discord. `buildTetriNetResult()`
  (`core/tetrinet/score-report.ts`) is now the single mapping, and all three
  paths - local vs AI, BBS-internal multiplayer, external server - funnel
  through `reportTetriNetScore()`. The networked path also broadcasts the
  match result.
- **No voice chat in the TetriNET lobby** while the versus lobby had it.
  `startVoice()`/`stopVoice()` are generic and room-based; the TetriNET
  lobby now joins one.
- **Dead `// TODO: Send garbage to target via network` block** left in
  `setupEngineCallbacks` after the router took the job over.

Deliberately NOT closed, with reasons:

- **Replay recording.** Only the TGM `GameEngine` records; the TetriNET
  engine has no recorder. That is a feature to build, not a wiring gap.
- **Prediction / rollback netcode.** Versus-only, and it exists for
  input-latency-sensitive 1v1 over a network. Internal TetriNET runs over an
  in-process broker on the same machine.

## Execution status (updated 2026-08-25, later session)

| Item | Status |
|---|---|
| 1. Specials + garbage route to local AI | **DONE** — router in `tetrinet-screen.ts` |
| 2. Internal multiplayer | **DONE** — broker lobby + in-match transport |
| 3. Three dropped lobby settings | **DONE** — `optionsFromLobbySettings()` |
| 4. Winlist never populates | **DONE** — local high scores seed it, and TetriNET games now record a score at all |
| 5. Opponent metadata stubs | **DONE** — remote players are keyed, named and carry real alive/immunity |

Door suite: **55 tests, 0 failures** (`cd Doors/grandmaster && npm test`), up
from 24. New files `tests/tetrinet-routing.test.ts` (11),
`tests/tetrinet-lobby.test.ts` (5) and `tests/tetrinet-netplay.test.ts` (9,
two real broker nodes); 21 of the 25 were RED-verified against the pre-fix
code (the other 4 are negative/default assertions that correctly pass
either way).

Fixed along the way, each found by the same "grep for a caller" pass:

- `useSpecial()` popped SELF-ONLY specials off the inventory and applied
  nothing — Clear Line ('C') was a slot that deleted itself.
- Switch Fields reached `applySpecialEffect` without the sender's board and
  bailed out with 'Switch requires two boards'. `applyIncomingSpecial()`
  now takes an optional `sourceBoard`.
- `pickTarget()` returned 'player' only when every OTHER bot was dead, so
  while any bot lived the human could not be attacked at all.
- `TetriNetAI.allDead()` had zero callers — a local TetriNET game could only
  ever be LOST. `checkVictory()` now ends the match as a win.
- A TetriNET game recorded no score whatsoever, so the mode's leaderboard
  and the lobby Winlist had no possible source of entries.

## The work, in build order

### 1. Specials + garbage must route to local AI  — DONE

**Status: FIXED.** `setupAttackRouting()` in `ui/tetrinet-screen.ts` resolves
a target id to a participant engine (`HUMAN_TARGET_ID` = `'player'`, shared
with the bots' `pickTarget()`), then calls `applyIncomingSpecial()` /
`addGarbage(n, 'classic')`. Classic garbage broadcasts to every other LIVING
player, matching the protocol's cs1/cs2/cs4. Networked games are excluded —
the server owns fan-out there, and routing locally too would double the hit.

Original diagnosis below.

**Status when written: CONFIRMED DEAD.** This is what makes local TetriNET not a game.

- Human uses a special: `tetrinet-screen.ts:210` `engine.onSpecialUsed(...)`
  plays a sound and animates. It never touches any AI engine.
- Human clears lines: `tetrinet-screen.ts:222` `engine.onLinesAdded(...)`
  plays a sound; the only outgoing path is guarded by `if (this.network)`
  and its body is the literal comment
  `// TODO: Send garbage to target via network` (`tetrinet-screen.ts:237`).
  In local play `this.network` is null anyway (see item 2).
- AI attacks: `ai/tetrinet-ai.ts:249` calls
  `opponent.engine.useSpecial(targetId)` — i.e. the bot uses the special on
  its OWN engine. `pickTarget()` (`:255-267`) admits it:
  `// This is a placeholder - real implementation would target human player`.

**The receive side already exists and works:**
- `tetrinet-engine.ts:493` `applyIncomingSpecial(special, senderId)`
- `tetrinet-engine.ts` `addGarbage(count, mode)` (used by sudden death at `:180`)

Both are called ONLY from the external-server path (`app.ts:2164`, `:2169`).

**Do:** add a router in `tetrinet-screen.ts` mirroring
`versus-screen.ts setupAttackRouting()`. Human `onSpecialUsed` → resolve the
selected target (`targetSelector.getSelectedTarget()`) → call that AI's
`engine.applyIncomingSpecial(...)`. Human `onLinesAdded` → classic-rules
garbage → target AI's `engine.addGarbage(n, 'classic')`. Give the AI
controller a callback so each bot's specials/garbage reach the human or
another bot. Gate the whole thing on the game's rule set the way Grandmaster
gates on the lobby's Garbage toggle.

**Watch out:** `useSpecial()` POPS the inventory before notifying, so the
router must read the special from the callback argument, not the inventory.

### 2. Internal multiplayer does not exist  — DONE

**Status: BUILT** (user chose broker multiplayer on 2026-08-25).

Three layers, each reusing what versus mode already had:

1. **Lobby.** `TetriNetLobbyAdapter` was loopback-only — it pushed actions
   through `emitNetwork('tetrinet:*')`, which never leaves the process, and
   listened for the same events coming back, so two BBS users each sat in
   their own private lobby (verified: with the old adapter, alice still sees
   only alice after bob joins her lobby id). It now EXTENDS
   `BrokerLobbyAdapter`, which was extracted out of `ui/lobby-screen.ts`
   into `network/broker-lobby-adapter.ts` so both lobbies share one
   implementation. TetriNET adds only slots, teams, options and the
   winlist. `createLobby` also takes a seat count now — every TetriNET
   lobby was capped at TWO players by the versus mode map.
2. **Transport.** `network/tetrinet-transport.ts` names the interface the
   screen talks to; the external-server adapter implements the field half,
   the new `TetriNetBrokerTransport` implements fields, specials and
   garbage over the broker.
3. **Match.** `app.ts startTetriNetNetworkGame()` runs when the lobby holds
   more than one human. Bots are simulated by the HOST only and published
   as ordinary participants, so no bot is ever driven twice and every node
   sees the same field for it.

**Trap worth remembering:** the broker client only forwards events whose
name starts with `lobby:`, `game:`, `match:`, `state:` or `input:`
(`BrokerClient.isProtocolEvent`). Anything else stays a local EventEmitter
event and is silently dropped — the first cut used `tetrinet:*` names and
nothing crossed. The packets are now `game:tnet_field`,
`game:tnet_special`, `game:tnet_garbage`, `game:tnet_lobby`.

Original diagnosis below.

**Status when written: CONFIRMED DEAD.**

`app.ts:1120` — every lobby result routes to
`startTetriNetGame(result.mode, result.settings)`, which at `:1147-1150`
builds a purely LOCAL game: `TetriNetAI().createOpponents(3, 5, ...)`, and
constructs `TetriNetScreen` at `:1153` **with no `network` property at all**.
Humans who joined the lobby are simply not in the resulting game.

Only the external TetriNET server path (`app.ts` ~2097) passes a network.

**Do:** decide first whether internal (broker) TetriNET multiplayer is
wanted, or whether TetriNET stays "local vs AI + external servers only". If
wanted, it needs the same broker plumbing Grandmaster now has — see
`network-manager.ts` (`sendAttack`/`onAttack`/`sendUpdate` with `alive`) and
the in-process `LobbyBroker`. This is the largest item; do item 1 first so
local play is good regardless.

### 3. Three lobby settings are silently dropped  — DONE

**Status: FIXED.** The mapping moved out of `app.ts` into
`optionsFromLobbySettings(rule, settings)` in `core/tetrinet/game-rules.ts`
(pure, so it is directly testable) and now carries all six editor keys.
Classic mode ignores the three specials knobs, since it has no specials.

**Status when written: CONFIRMED DEAD.** The settings editor (`app.ts:1047-1070`) offers
**Lines for Special**, **Specials Added** and **Inventory Size**, but the
mapping in `startTetriNetGame` (`app.ts:1135-1141`) copies only
`startingLevel`, `startingHeight`, `delayBeforeSuddenDeath`,
`suddenDeathTick`. The other three never reach `TetriNetGameOptions`.

**Do:** map them, or remove them from the editor. Precedent from this
session: the versus lobby's dead **Rule Set** and **Sudden Death** entries
were REMOVED rather than left advertising nothing (commit `d3c7d6b6a`) —
the engine had no inputs for them. Check `TetriNetGameOptions` first; if the
fields exist, wire them, since that is cheap.

### 4. Internal winlist never populates  — DONE

**Status: FIXED.** `TetriNetLobbyAdapter.setLocalWinlist()` seeds the tab,
app.ts fills it from `highScores.getTopScores('tetrinet', 10)`, and a
finished TetriNET game now writes a score (`mode: 'tetrinet'`, `completed`
set on a win) so the list actually grows.

Original diagnosis below.


`network/tetrinet-lobby-adapter.ts:145` listens for `'tetrinet:winlist'`,
which is only ever emitted by the external protocol parser
(`tetrinet-protocol.ts:1367` → `tetrinet-client.ts:523`). Nothing emits it
on the internal bus, so the lobby's Winlist tab is always empty in local
play. Either populate it from local results or hide the tab for local games.

### 5. Opponent metadata stubs  — DONE

Opponent `hasImmunity` is read from the effect manager instead of the
hardcoded `false`. The network listener used to write every remote player
into ONE board slot (`name: update.playerId // for now`, opponent index
hardcoded `0`); remote participants now land in a keyed map and the whole
strip is repainted from bots + remotes together, with real names, levels,
alive and immunity flags.

Original diagnosis below.


`ui/tetrinet-screen.ts:272-277`: opponent name is set to the playerId "for
now", `hasImmunity: false // TODO`, opponent index hardcoded `0`. Line
`:285` carries a `TODO: Phase 5` for join/leave/special/garbage events.
Mostly unreachable until item 2 lands, but fix alongside it.

## Critical references

- Template to copy: `Doors/grandmaster/ui/versus-screen.ts`
  `setupAttackRouting()` — routes attacks for BOTH CPU and network play.
- Engine send side: `core/tetrinet/tetrinet-engine.ts` `useSpecial()` (~:463-487),
  `onSpecialUsed` callbacks (`:100`, fired `:483`), `onLinesAdded` (`:101`, fired `:435`).
- Engine receive side: `applyIncomingSpecial` (`:493`), `addGarbage`.
- Screen callbacks to extend: `ui/tetrinet-screen.ts:208-245`.
- AI: `ai/tetrinet-ai.ts` `attack()` (~:245-250), `pickTarget()` (`:255`).
- Local game construction: `app.ts:1127-1161`.
- External path (working reference for what a wired game looks like):
  `app.ts:2097-2175`.
- Full audit of every stubbed feature in the door:
  `thoughts/shared/research/2026-08-25_gmaster-performance-and-wiring.md`.

## Learnings worth carrying over

- **The bug is almost never in the subsystem, it is in the wiring between
  two subsystems.** Grandmaster's attack system, garbage queue, board
  insertion and UI strip were all correct and complete; only the router was
  missing. TetriNET is the same picture. Check for a caller before assuming
  a feature is unimplemented.
- **`createBox()` draws a border by default.** It has now caused two
  separate visual bugs (the Grandmaster title box, the TetriNET sudden-death
  overlay). If a box should not have a frame, pass
  `border: { type: 'none' }` — note the string form `'none'` is not
  accepted by the type, only the object form.
- **Grep for zero-caller functions.** `removeBots`, `receiveAttack`,
  `sendAttack`, `allDead` and `isTopOut` were all fully implemented and
  never called. `grep -rn "name(" --include=*.ts | grep -v dist` finds these
  in seconds.
- **Verify by reading painted cells, not by eye.** The layout tests in
  `tests/tetrinet-layout.test.ts` render the real screen and assert on the
  screen buffer; that is how the double bottom border was caught.
- **Door freshness protocol is mandatory**
  (`.claude/skills/door-sdk-freshness/SKILL.md`): rebuild the door AND the
  SDK, then restart the backend, or you will test stale code.

## Dev environment notes (bit us twice today)

- `dev/scripts/start-servers.sh` intermittently force-kills its own
  just-started backend ("Backend crashed with code null"). Workaround in use:
  run the backend directly **from the repo root**, which matters because
  data paths are relative:
  ```
  BBS_DATA_DIR="/Users/spot/Code/amiexpress-web" NODE_ENV=development \
    npx tsx web/backend/src/index.ts
  ```
  Starting it from `web/backend/` instead produces
  `ENOENT: data/bbs/node1.user.tmp` on login.
- Always zombie-verify after `kill-servers.sh` before relaunching; a `cd`
  persisting into a later command silently skipped the kill once and left
  four backends stacked.

## Session state

- The 31 queued commits were PUSHED on 2026-08-25 (auto-deploys the live
  BBS); this session's TetriNET work is on top of them.
- Backend currently running from the repo root, serving the latest builds.
- Open, unrelated: `https://releases.uprough.net/` fails TLS. Diagnosed —
  DNS points at the BBS host (89.167.21.154) but `/etc/caddy/Caddyfile` has
  **no site block for it** (nothing on the host references the name, no
  matching container or web root), so Caddy's port-80 catch-all redirects to
  HTTPS and then has no certificate for that SNI. Needs a decision on what
  should serve it. User is assigning this elsewhere.
