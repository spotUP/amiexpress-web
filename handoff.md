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

### TetriNET — parity items 1, 3, 4 done; item 2 is a decision

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
- Door suite: **40 tests, 0 failures** (was 24). 12 of the 16 new tests were
  RED-verified against the pre-fix code.
- **Open decision:** internal (broker) TetriNET multiplayer. Today every
  lobby result starts a local game vs 3 bots with no network, so humans who
  joined the lobby are not in the match. Needs a yes/no before building.

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

1. **Internal TetriNET multiplayer** — the last parity item, and a decision
   rather than a bug: should a lobby of BBS users play each other over the
   in-process broker, or does TetriNET stay local-vs-AI plus external
   servers? Everything else in the plan doc is done.
2. `https://releases.uprough.net/` TLS failure. Diagnosed: DNS points at the
   BBS host but `/etc/caddy/Caddyfile` has **no site block for it** and
   nothing on the host references the name — Caddy's port-80 catch-all
   redirects to HTTPS, then has no cert for that SNI. Needs a decision on
   what should serve it. Being assigned elsewhere.
3. Backend test suite has **3 pre-existing failures** unrelated to this work
   (`better-sqlite3` native bindings under jest, door-repo-proxy,
   info-editor-routes). They currently mask real regressions there.
4. Deferred perf (measured as not dominant): network payload compaction
   (~10 KB JSON → ~0.5 KB), hoisting per-cell effect calls in renderBoard.

Older sessions: `thoughts/shared/handoffs/`.
