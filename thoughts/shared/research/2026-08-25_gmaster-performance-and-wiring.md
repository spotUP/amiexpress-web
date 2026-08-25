---
date: 2026-08-25
topic: Grandmaster door — performance (input/game/network lag) and stubbed-feature audit
tags: [grandmaster, performance, latency, netcode, audit, blessed, sdk]
status: final
---

# Grandmaster: performance + wiring research

Four parallel read-only audits (input path, game/render loop, netcode, stub sweep),
2026-08-25. Every claim below carries file:line evidence in the agent transcripts;
the key references are inlined.

## Part 1 — Latency: where the lag actually comes from

### Input lag (single player and networked, identical path)

The game renders SERVER-side; the browser is a dumb ANSI terminal. Path:
browser keydown → xterm onData → socket.io `command` → backend
`session.doorInputHandler` (in-process door) → blessed `program.emit('data')`
→ keypress → `input/handler.ts` → `engine.move()`. The engine call happens in
the same tick the socket message arrives — the transport is NOT the problem.

The real input-lag sources, ranked:

1. **DAS/ARR is dead; held keys ride OS auto-repeat.** Designed:
   `DAS_DELAY: 133`, `ARR_RATE: 10` (`input/config.ts:117-121`). Blessed has no
   key-release, so "held" is simulated with `KEY_RELEASE_TIMEOUT = 100` ms
   (`input/handler.ts:43`) — shorter than the OS initial repeat delay
   (~250–500 ms), so the press expires before repeat starts, and each repeated
   keypress resets `dasTimer = 0` (`handler.ts:94,101`). Effective feel:
   ~500 ms delay / ~30 ms rate — 3–4x the designed sluggishness, and it varies
   per player's OS settings. The frontend already ships real key-down/key-up
   events with its own 400/30 repeat (`BBSTerminal.tsx:1056-1146`) and the
   backend forwards them (`socket-handlers.ts:489-538`) — Grandmaster opts out
   with `enableGameMode: false` (`app.ts:188`).
2. **RENDER_FPS = 20** (`game-screen.ts:38-39`): +0–50 ms (avg 25) between an
   input-driven engine change and the player seeing it.
3. **`ACTION_DEBOUNCE = 100` ms** (`handler.ts:50`) silently drops rotations
   faster than 10 Hz — fast double-taps lose the second input.
4. ~9 synchronous log writes per keystroke across the path
   (`socket-handlers.ts:554-556,738`; hex dump via `debug: true` at
   `app.ts:192` → `blessed-helpers.ts:1063-1066`; `handler.ts:78,82`). Same
   stdout back-pressure class as the DOORMAN freeze.
5. Production socket transports are `['polling','websocket']`
   (`BBSTerminal.tsx:1179`) — early-session keystrokes ride long-polling until
   the upgrade completes.
6. Bare ESC pays a 100 ms disambiguation timer (`program.ts:1601-1625`) —
   Escape only, not gameplay keys.

### Game lag (frame cost — single player)

Game logic is noise (<5%). The budget goes to rendering:

1. **The SDK diff renderer is disabled for web play.** `Screen._doRender()`
   force-marks the whole screen dirty (`screen.ts:923`) and cell-invalidates
   `lastBuffer` (`:940-948`) unless `_slowConnectionMode` — which only modem
   emulation enables (`blessed-helpers.ts:1020-1024`). Result: every render
   diffs to "all 1920 cells changed" and ships the full 80x24 frame,
   10–40 KB ANSI per frame, 0.2–0.8 MB/s. Plus ~6-8k array allocations per
   render and a full `_rebuildMouseIndex()` walk (`screen.ts:982`).
2. **Change detection is defeated**: `getBoardHash()` includes `shineTimer`
   which increments every 16 ms tick (`game-screen.ts:750-754,1080`), and the
   `sectionTime !== 0` check (`:729`) is always true — so the "only render on
   change" gate renders every pass, forever, even idle.
3. **Versus screen has no render gate at all**: `render()` runs on every 16 ms
   tick unconditionally (`versus-screen.ts:492-493`) — 60 full renders/s vs
   single player's 20.
4. Board string rebuild calls `getPlacementEffects()` and
   `getAnimationsByType('backToBackGlow')` PER CELL — 200x/frame
   (`game-screen.ts:1327-1350`); `connectedBlocks` re-hashes the whole board
   to a string per repaint (`connected-blocks.ts:222-229`).
5. **AI GC pressure**: per think, `evaluateBestPlacement` = ~80 placements x
   `cloneBoard` (240 fresh objects) + full-board scans ≈ 19k allocations
   (`bot-player.ts:100-254`, `board.ts:313-319`); 3 bots at difficulty 10 ≈
   1.1M allocs/s on the same event loop as rendering.
6. `console.log` on every piece lock (`core/game.ts:828,831,976`).
7. Client side re-runs overlay/sfx/RIP regexes over every ANSI frame
   (`BBSTerminal.tsx:1684-1795`).

### Network lag (human vs human)

Both doors run in the SAME backend process; the broker relay is
`process.nextTick` + a JSON deep-clone (<1 ms). Only two real network legs
exist (each browser↔server). The measured budget for "A's piece locks → B
sees it": ~70–160 ms LAN. Dominant, in order:

1. **10 Hz send gate** — `now % 100 < deltaTime` (`versus-screen.ts:467-469`):
   mean +50 ms, worst +100 ms, phase-jittery.
2. **The falling piece is never sent** — `GameUpdate` carries locked cells
   only (`network-manager.ts:409-427`), so the opponent's piece-in-flight is
   invisible until lock (the CPU-battle path already has `pieceCells` overlay
   support in the renderer; the network path never populates it).
3. Payload is ~10 KB JSON (240 Cell objects) where ~0.5 KB (row strings /
   bitfield) would do — this is what makes a higher tick rate expensive
   (`lobby-broker.ts:684-691` deep-clones per recipient).
4. B repaints on its own next 16 ms tick, not on receipt: mean +8 ms.
5. Prediction/rollback/interpolation (`network/prediction.ts`, `rollback.ts`,
   `sync.ts`, ~1000 lines): **dead scaffolding, zero callers** — and correctly
   so; with an authoritative-local in-process relay there is no round trip to
   hide. Do not activate; delete or leave documented.

### Ranked optimization plan (perf — NOT yet implemented)

1. Enable true differential rendering for door screens (the diff path exists;
   stop force-dirtying the full screen per render; keep `forceFullRedraw()`
   for screen transitions). Biggest single win: ~1920 cells → the few that
   changed, per frame.
2. Fix change-detection defeaters (shineTimer out of board hash; sectionTime
   check on a timer) and give versus-screen the same 20 fps gate + hash.
3. Render immediately on input-driven engine changes (or raise RENDER_FPS once
   diffing makes frames cheap) — kills the 0–50 ms input→pixel wait.
4. Real DAS/ARR: use the existing key-down/key-up channel (enableGameMode
   path) or stop resetting dasTimer on repeats + raise KEY_RELEASE_TIMEOUT;
   drop ACTION_DEBOUNCE to ~33 ms; remove per-keystroke logging; websocket
   first in production transports.
5. Netcode: event-driven sends (move/rotate/lock) with compact board encoding
   (~0.5 KB), include the falling piece in updates, repaint opponent on
   receipt. Broker is in-process — 30–60 Hz is affordable once payload is thin.
6. AI: scratch-board eval (no cloneBoard per placement), single-pass column
   metrics, stagger bot think ticks; delete per-lock console.logs.

## Part 2 — Stub audit: what is advertised but not wired

Root cause in one sentence: N independent GameEngines + a complete,
internally-correct AttackManager — and the ROUTER (deliver "attack sent" from
one engine to another: locally for bots, via broker for network) was never
written. Everything competitive dead-ends at that missing layer.

Full findings table in the audit transcript; the confirmed-dead headliners:

| # | Feature | The one missing link |
|---|---------|----------------------|
| 1 | Human attacks reach opponents | `onAttackSentCallback` handler plays a SFX only (`versus-screen.ts:357`); in CPU battle it isn't even registered (`network` null gate `:149-151`) |
| 2 | AI can attack / receive garbage | AI engines built WITHOUT AttackManager (`versus-ai.ts:70`, 4th ctor arg omitted) |
| 3 | Networked attacks received | `sendAttack()` zero callers; `onAttack()` zero subscribers; `receiveAttack()` zero callers repo-wide (`network-manager.ts:432,454,201-203`) |
| 4/5 | Lobby settings (Garbage, Start Level, Rule Set, Sudden Death) | versus lobby `result.settings` never read (`app.ts:831-851`); engine has no ruleset/sudden-death inputs at all |
| 6 | Winning a CPU battle | `versusAI.allDead()` zero callers; loop ends only on the human's gameover (`versus-screen.ts:496-500`) — the player can only lose |
| 7 | Networked win detection | `sendUpdate` never carries alive/gameover; survivor never learns opponent topped out |
| 11 | Lobby chat between humans | adapter `sendChat` local-echo only; no broker emit, no incoming forward |
| 16 | TetriNET sudden-death setting | key mismatch: editor writes `delayBeforeSuddenDeath`, reader wants `suddenDeathDelay` (`app.ts:1071-1078` vs `:1137`) |
| — | Latent | `AttackManager.cancelledLines` cumulative for the whole game (`attack-system.ts:200,257` — `resetCancelled()` never called) |

Bigger items deferred (real feature work, not wiring): internal TetriNET
multiplayer (#8 — lobby humans are dropped, game is always local-vs-AI),
TetriNET specials vs local AI (#9/#10), leaderboard display paths (#12/#13,
#19), 2v2 teams (#14 — a label, zero team logic), replay playback (#18 —
replays are write-only), dead netcode scaffolding (#17).

Verified WORKING (don't touch): Zone mode, Dig mode, Shirase rising garbage,
Ultra timer, training, attract, voice plumbing, score submit + anti-cheat,
external TetriNET protocol incl. specials/garbage/winlist.

## Implementation status (updated end of session)

Part 2 wiring - DONE (commit d3c7d6b6a): attack router for CPU + network,
per-AI AttackManagers, network attack receive, win detection + overlay,
alive:false death notices, lobby startLevel/garbage applied, dead Rule Set /
Sudden Death removed from the versus lobby, broker lobby chat, TetriNET
sudden-death key mismatch, cancelGarbage cumulative-counter bug. Plus the
door's first test harness (`npm test`).

Part 1 perf - DONE in two rounds (c15b3ead4, c163f0a0a):
1. Differential rendering is now the SDK default (idle frame 2460 -> 0
   bytes; one-char change -> 18 bytes). Full redraws still forced on first
   render / resize / destroy / forceFullRedraw(); escape hatch via
   setDifferentialRendering(false).
2. Render-gate defeaters fixed (shineTimer out of the board hash,
   sectionTime on a 250 ms timer); versus screen gated to 20 fps instead of
   60 unconditional renders/s.
3. Real DAS/ARR via BBSApi onKeyDown/onKeyUp; keypress path kept as a
   fallback with its dasTimer-reset bug fixed; ACTION_DEBOUNCE 100 -> 33 ms;
   render-on-input with an 8 ms floor.
4. Netcode: 20 Hz sends, falling piece included in updates, opponent
   repaints on receipt.
5. AI evaluation on a reused Uint8Array scratch grid: 0.424 -> 0.11 ms per
   think (73% faster), single-pass metrics, ZERO behavioural change
   (differential test: 0 mismatches across 14,400 states).
6. Lazy mouse index; per-keystroke backend stdout writes removed;
   websocket-first production transports.

FOUND WHILE DOING THIS - the most serious bug of the session:
`core/board.ts clearLines()` spliced completed rows by their original
indices in ascending order, so every double/triple/tetris removed the WRONG
rows - leaving a completed row on the board and destroying an untouched
partial row. Fixed (descending splice) with 4 RED-verified regression tests.
It was caught only because the rewritten AI evaluator disagreed with the
original on 264 of 14,400 states, always by an exact multiple of the holes
weight.

Still deferred (measured as not currently dominant):
- Board payload compaction (~10 KB JSON -> ~0.5 KB). Do this before raising
  the network tick rate further.
- Hoisting getPlacementEffects() / getAnimationsByType() out of the 200-cell
  loop in game-screen renderBoard.
- Client-side ANSI regex passes per chunk (far cheaper now that diff
  rendering shrank the chunks).
- Prediction/rollback/interpolation scaffolding: still dead, and still
  correct to leave dead (authoritative-local, in-process relay - there is no
  round trip to hide). Candidate for deletion.
