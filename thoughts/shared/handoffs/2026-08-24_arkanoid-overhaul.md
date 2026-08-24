---
date: 2026-08-24
topic: Arkanoid overhaul - rendering, physics, mouse, tracker music, score webhooks
tags: [arkanoid, sdk, tracker-music, pointer-lock, screenbuffer, webhooks, hybrid-doors]
status: final
---

# Handoff: Arkanoid overhaul (2026-08-24 session)

User-confirmed DONE at session end: "ok it works i think arkanoid is done".

## What the session shipped (in dependency order)

### Rendering - flicker fix
- **`sdk/client/screen-buffer.ts`** (new): cell-diffing back buffer. flush()
  emits only changed cells, '' for unchanged frames. 15 tests
  (`sdk/test/screen-buffer.test.ts`).
- Arkanoid's Renderer delegates to it; all 20 `door.send(render())` sites
  became `paint()` which skips empty diffs. Measured before: 4669 B/frame at
  25-62 fps (117-288 KB/s) - xterm painted half-parsed frames = brick
  flicker. After: tens-to-hundreds of bytes per frame.

### Physics - three bugs, one module
- **`Doors/arkanoid/ball-physics.ts`** (new, pure): extracted from client.ts.
  Tests in `web/backend/tests/doors/arkanoid-ball-physics.test.ts` (14, in
  the backend CI glob; every fix fail-before-verified).
  1. **Tunneling**: endpoint sampling stepped up to 1.05 cells vs 1-cell
     bricks -> substepped movement (MAX_SUBSTEP 0.5), collide per substep.
     Also fixed balls falling through the 1-cell paddle window.
  2. **Penetration/machine-gun**: reflection left the ball embedded in the
     grid -> revert to pre-substep position (open space) before reflecting.
  3. **No-bounce-back**: nearest-edge side heuristic misclassified ~12% of
     bottom entries on 6x1 bricks as side hits -> reflection axis now chosen
     by which face the pre-substep position crossed; both axes on corner.

### Mouse - game-mode input stack (BBSTerminal.tsx)
- Game mode: no text selection (pointer-events none on .xterm layer +
  user-select none), CSS cursor hidden. Blessed TUI doors untouched (they
  are not game mode; they need xterm's native tracking).
- **Pointer lock** on first click: virtual pointer accumulates movementX/Y,
  clamped to the terminal rect; page-wide window mousemove fallback when
  unlocked (coords clamp into the grid). Esc releases; next click re-arms.
- Frozen-coordinate class: while locked, events carry clientX/Y frozen at
  the lock origin - mousedown, mouseup, AND wheel all substitute the
  virtual pointer (mouse-up was the "paddle wraps to right edge" bug: doors
  steer on every event type).
- Click emit moved ABOVE requestPointerLock and the request wrapped:
  a sync throw / promise rejection (Chrome refuses re-lock ~1.5s after Esc)
  used to swallow menu clicks entirely.

### Tracker music - Zabutom XM pack
- **SDK TrackerEngine now usable from client doors**: exported from
  `@amiexpress/bbs-door-sdk/client`; backend serves
  `/api/doors/:doorId/{chiptune3,libopenmpt}.worklet.js` from the SDK's
  chiptune3 package (AudioWorklet must load over HTTP; import.meta.url in
  the bundle resolves them as bundle siblings). Door bundles load with
  `script.type='module'` (import.meta is a SyntaxError in classic scripts).
  Route tests: `web/backend/tests/api/chiptune-worklet-route.test.ts`.
- **Two SDK bugs found on the way** (tests in
  `sdk/test/tracker-engine-init-race.test.ts`, 6):
  - play() before the worklet initialized was silently dropped by chiptune3
    -> engine queues the buffer, latest wins, flushes on 'initialized'.
  - a caller-supplied AudioContext means chiptune3 sets destination=false
    and NEVER routes audio -> engine connects player.gain to
    context.destination itself. (This was the "no music" silence.)
- **Arkanoid wiring**: `Doors/arkanoid/music-select.ts` (pure) maps state ->
  module; paint() syncs music every frame (deduped). menu+help=Zb-zfc2.xm,
  highscores=DECSYS4.xm, 11 level tracks cycle over 20 levels,
  gameover/victory silent. 13 XMs in `Doors/arkanoid/assets/`. Tests
  include an exact-case on-disk check of every referenced filename
  (`arkanoid-music-select.test.ts`).
- Door owns its AudioContext and resumes it (autoplay policy; login typing
  provides sticky activation). quit() sets a shutdown latch - the SDK still
  delivers input events after shutdown() and a stray hover used to
  resurrect the tracker (the "music keeps playing after exit" bug).
- **CSP prepared before report-only ever flips**: script-src +
  'wasm-unsafe-eval' (wasm only, JS eval still banned), worker-src
  'self' blob: (Tone.js clock worker). Header tests updated deliberately.

### Highscores + webhooks
- `saveHighscore` RPC emits `score_submitted` -> LiveChat + DOOR_SCORE
  webhooks (Discord/Slack), GrandMaster pattern, best-effort by test
  (`arkanoid-score-webhook.test.ts`, 5).
- Name entry REMOVED: BBS username (captured at connect) submits
  automatically at gameover/victory; player lands on the board.
  Double-submit guard resets at game start, swallows Enter+click races
  (this class double-fired a Discord webhook once, see 223d778da).
- **Live bug fixed**: hybrid-door manifest was probed at dirname(entry) -
  dist/ in production - so hybrid detection failed on live: red "Invalid
  TypeScript door: execute is undefined" flash + RPC handlers never
  registered (highscores silently dead on live). Now probed at door root
  (`web/backend/src/doors/door-manifest-path.ts`, 3 tests). Deployed and
  verified via live /health revision.

### Infra
- start-servers.sh backend wait 60s -> 240s (was force-killing a healthy
  backend mid door-registration).
- Hot-path logging gated: frontend mousemove (window.__MOUSE_DEBUG__),
  backend no-op doorInputHandler (DOOR_DEBUG=1), SDK ClientDoor per-input
  (window.__DOOR_INPUT_DEBUG__).

## State at handoff

- **Pushed + deployed + live-verified** (revision check via
  https://bbs.uprough.net/health): everything through `9b7f04c13`
  (tracker music). Deploys after that NOT pushed yet.
- **UNPUSHED local commits** (main, as of handoff):
  `58c68d362` (play queue + CSP), `60eaeb634` (gain routing + auto-submit),
  `1578d49ee` (pointer lock), `873c6c800` (frozen mouseup/wheel),
  `9ccb83545` (penetration), `81bf14187` (menu click), `80a21ef76`
  (crossed-face reflection + music latch), plus parallel-session SDK
  blessed commits (`971cc7072`, `379dbd7e3`).
- **Live Doors/ volume NOT synced**: deploys never update it. After the
  next push+deploy run on the host:
  `docker exec amiexpress-bbs sh -c 'cp -r /app/default-data/Doors/arkanoid /app/data/bbs/Doors/'`
  (brings new bundle, physics, music assets, score webhook wiring).
- A parallel session owns webhook-picker + blessed-widget work in the same
  tree; commit with explicit pathspecs, not `git add`-everything.

## Gotchas learned (worth keeping)

- chiptune3: caller-supplied AudioContext => destination=false, caller must
  route gain; commands before worklet init are silently dropped.
- Pointer lock freezes clientX/Y at the lock origin on EVERY event type;
  any handler reading event coordinates must substitute the virtual
  pointer. requestPointerLock can throw sync AND reject async.
- The SDK keeps emitting input events after ClientDoor.shutdown().
- esbuild bundles are format=esm: anything introducing import.meta needs
  script type=module in the loader.
- "frrrr many bricks removed fast" with MULTIPLE balls = the multi
  power-up, a feature. Physics is bounded (sim sweep: worst 14 bricks/s
  with perfect paddle tracking).

## Next (not arkanoid)

See root `handoff.md` (owner-curation plan is the active thread; its Next
list carries the older backlog).
