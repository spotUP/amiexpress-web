# Handoff

## READ THIS FIRST in a fresh session

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`.
Both LIVE. Push to either repo's `main` auto-deploys; after pushing, CHECK IT
(`docker exec <container> cat /app/.git-sha` — green CI has lied before).
Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22**
(not the `:31337` known_hosts entry, that port refuses exec).

**A peer Claude Code session works in this SAME repo checkout concurrently.**
`git fetch` and check `git log --oneline origin/main..HEAD` /
`HEAD..origin/main` before assuming history is your own doing, before
pushing (a push can carry someone else's finished-but-uncommitted work
along with it — happened twice on 2026-08-24), and before deleting/force-
touching anything.

**Dev environment**: use `./dev/scripts/start-servers.sh` / `kill-servers.sh`
/ `npm run dev:doors` — NOT ad-hoc `npm run dev &` + `pkill`. After any stop
(including an automatic watcher restart), zombie-verify:
`ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep`
(expect empty) before starting again, or you'll get EADDRINUSE crash loops.
`start-servers.sh` has an intermittent mid-run failure that force-kills the
backend it just started ("Backend crashed with code null"); it hit twice on
2026-08-25. Workaround that works: run the backend DIRECTLY, from the REPO
ROOT (data paths are relative — launching from `web/backend/` gives
`ENOENT: data/bbs/node1.user.tmp` on login):
```
BBS_DATA_DIR="/Users/spot/Code/amiexpress-web" NODE_ENV=development \
  npx tsx web/backend/src/index.ts
```
Also: a `cd` persisting into a later shell command silently skipped a
kill-servers run and left four backends stacked. Always zombie-verify.

## Current state (2026-08-25, latest session)

The 31 queued commits are PUSHED (live BBS auto-deploys — verify the
container's `.git-sha`). TetriNET parity work sits on top of them.

### TetriNET — parity plan fully executed (items 1-5)

Plan + execution log:
`thoughts/shared/handoffs/2026-08-25_tetrinet-parity-plan.md`

- **Specials and garbage now route between local players.** Both halves of
  the exchange existed; the router did not. `setupAttackRouting()` in
  `ui/tetrinet-screen.ts` resolves a target id to an engine and calls
  `applyIncomingSpecial()` / `addGarbage(n, 'classic')`. Classic garbage
  broadcasts to every other living player. Networked games are excluded —
  the server fans out there, so local routing would double every hit.
- Same pass, same disease: Clear Line applied nothing (self-only specials
  were popped and dropped), Switch Fields bailed with 'Switch requires two
  boards', bots could only target the human once every other bot was dead,
  `allDead()` had zero callers so a local game could only be LOST, and a
  TetriNET game recorded no score at all.
- Lobby: the three settings the editor showed and the game discarded (Lines
  for Special, Specials Added, Inventory Size) now reach the engine via
  `optionsFromLobbySettings()`; the Winlist tab is seeded from the door's
  own TetriNET high scores.
- **Internal multiplayer now exists.** The TetriNET lobby adapter was
  loopback-only (`emitNetwork('tetrinet:*')` never leaves the process), so
  two users each sat in a private lobby. It now extends `BrokerLobbyAdapter`
  — extracted from `ui/lobby-screen.ts` so versus and TetriNET share one
  implementation — and a match with more than one human runs through
  `startTetriNetNetworkGame()` over `TetriNetBrokerTransport` (fields,
  specials, classic garbage). Bots are simulated by the HOST only and
  published as ordinary participants.
- **Broker trap:** `BrokerClient.isProtocolEvent` forwards only
  `lobby:/game:/match:/state:/input:` events; anything else is silently
  local. TetriNET packets are `game:tnet_*`.
- Door suite: **49 tests, 0 failures** (was 24), including 9 that run two
  real broker nodes against each other.

### Grandmaster door — large session, all fixes live locally

Full audit + perf research:
`thoughts/shared/research/2026-08-25_gmaster-performance-and-wiring.md`
TetriNET build plan (next session's main task):
`thoughts/shared/handoffs/2026-08-25_tetrinet-parity-plan.md`

Headline fixes, each with RED-verified regression tests (door suite: 24
tests, `cd Doors/grandmaster && npm test` — the door's FIRST test harness,
added this session):

- **Multi-line clears deleted the WRONG rows.** `clearLines()` spliced by
  original indices ascending, so each splice shifted the rest; a double
  removed rows 20 and 22. Every double/triple/tetris left a completed row on
  the board and destroyed a partial one. Found by differential-testing a
  rewritten AI evaluator against the original (264/14,400 disagreements,
  always a multiple of the holes weight — the AI was right).
- **The whole attack/garbage system was unrouted.** Complete AttackManager,
  zero callers: `receiveAttack()` and `sendAttack()` had none, AI engines
  had no AttackManager at all, so "No incoming attack" was permanent.
  Routed for CPU + network. Win detection added (`allDead()` also had zero
  callers — a CPU battle could only be LOST).
- **Play continued above the visible playfield.** Board is 24 rows, only 20
  are drawn; the only game-over was block-out, so the stack grew through 4
  invisible rows. Added lock-out.
- **Perf:** differential rendering is now the SDK default (idle frame
  2460 → 0 bytes), real DAS/ARR via key-down/key-up (was OS auto-repeat,
  ~3-4x sluggish), render-on-input, AI eval 73% faster with zero behaviour
  change, per-keystroke backend stdout writes removed, websocket-first
  transports.
- **Browser tabs shared one login** — token was written to localStorage on
  every login. Cross-tab sharing is now gated on the existing
  `bbs_auto_login_enabled` preference; tabs are independent by default.
- `valign` was accepted everywhere and implemented nowhere; dialogs now
  centre both ways.

### Known-open

1. **TetriNET internal multiplayer wants live testing** — the plan is fully
   implemented and covered by two-node broker tests, but two humans on two
   BBS nodes have not played a real match yet.
2. `https://releases.uprough.net/` TLS failure. Diagnosed: DNS points at the
   BBS host but `/etc/caddy/Caddyfile` has **no site block for it** and
   nothing on the host references the name — Caddy's port-80 catch-all
   redirects to HTTPS, then has no cert for that SNI. Needs a decision on
   what should serve it. Being assigned elsewhere.
3. Backend test suite is **red in CI on every commit**, unrelated to this
   work: `tests/amiga-emulation/execute-lha-extract.test.ts` and
   `tests/doors/arkanoid-score-webhook.test.ts`, 9 tests, identical on
   `e8217958f` and on 2026-08-24 runs. (An earlier note named a different
   trio - better-sqlite3 / door-repo-proxy / info-editor-routes - which is
   no longer what fails.) They mask real regressions there.
4. Deferred perf (measured as not dominant): network payload compaction
   (~10 KB JSON → ~0.5 KB), hoisting per-cell effect calls in renderBoard.

Older sessions: `thoughts/shared/handoffs/`.
