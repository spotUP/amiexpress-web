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

**31 commits queued on `main`, NOTHING PUSHED.** Confirm before pushing.

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

1. **TetriNET parity** — the next big task; see the plan doc above. Same
   missing-router disease Grandmaster had; the engine's
   `applyIncomingSpecial`/`addGarbage` are called only by the external
   server path, never locally.
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
