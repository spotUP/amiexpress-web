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
`start-servers.sh` has an intermittent unexplained mid-run failure (a
`line 874: syntax error` that tears down a just-started server — `bash -n`
finds nothing, cause unknown); `npm run dev:doors` sidesteps it and is what
actually got used all of 2026-08-24.

## Current state (2026-08-24, latest session)

Full detail: `thoughts/shared/handoffs/2026-08-24_owner-curation-oom-webhook-fixes.md`

**ARKANOID overhaul is DONE and user-confirmed** (parallel session, same
day): flicker (SDK ScreenBuffer cell-diffing), physics (substepped +
penetration-resolved + crossed-face reflection, 14 CI tests), pointer-lock
mouse (with frozen-coords and menu-click fixes), Zabutom XM tracker music
(TrackerEngine gain-routing + init-race SDK fixes, worklet serving route,
CSP prep), auto-submitted highscores -> DOOR_SCORE webhooks, and the live
hybrid-manifest bug (RPC handlers never registered in prod). Everything
through `9b7f04c13` is pushed+deployed+live-verified; `58c68d362` ..
`80a21ef76` are LOCAL-ONLY - push, deploy, verify live SHA, then sync the
live Doors/ volume:
`docker exec amiexpress-bbs sh -c 'cp -r /app/default-data/Doors/arkanoid /app/data/bbs/Doors/'`
Full detail: `thoughts/shared/handoffs/2026-08-24_arkanoid-overhaul.md`

**UNCOMMITTED work exists right now** — do this FIRST in a fresh session:
`web/backend/src/handlers/command.handler.ts` (DISPLAY_CONF_BULL ordering
fix), `web/backend/src/utils/menu.util.ts` (scrollable menu windowing),
`Doors/arkanoid/client.ts` + rebuilt `dist/client.bundle.js` (double-submit
fix). Commit, push, deploy, verify live SHA. Live is currently `3cb5d5f3b`,
older than these fixes.

**DoorRepo C door — owner-mode curation plan, 3 of 5 tasks done.**
`docs/superpowers/plans/2026-08-24-doorrepo-owner-curation.md`, ledger at
`.superpowers/sdd/2026-08-24-doorrepo-owner-curation/progress.md` (not
deleted — plan incomplete). Tasks 3 (`http_request()`), 4 (`json_lite`,
opus-reviewed security-focused), 1 (`owner_auth.c`, opus-reviewed
credential-focused) are all done — reviewed, fix rounds closed, re-reviewed.
Task 5+6 (the `O`-key UI: submissions queue, field-edit menu) is next —
**must land in NEW files**, `doorrepo.c` is already 5533 lines against this
project's 2000-line cap. Then final whole-branch review, then Task 8 (a
live pass — needs the user to provide a real admin test account on
`amiexpress-doorserver` first; pause and ask before touching that).

**Live OOM incident, root-caused and fixed.** `bbs.uprough.net` was
crash-looping. Real cause: `login-post.service.ts`'s fire-and-forget
`runLoginBatches()` had no per-node guard — a fast reconnect to the same
node re-fired it while the previous (detached, outlives its socket) run was
still in flight, piling up duplicate `QuickNew` 68K emulator processes
(5 counted live, ~2GB RSS, 2 confirmed kernel OOM kills). Fixed: per-nodeId
`Set` guard in `batch-scheduler.ts`, tested (RED/GREEN, isolated from this
checkout's real batch files via `jest.spyOn(config, 'getConfig')` — an
env-var override does NOT work, `ConfigManager` caches once). Also applied
live infra mitigations (not in any repo): 4GB swapfile, `docker update
--memory 3g --memory-swap 5g amiexpress-bbs`, an `oom-log-mirror.service`
systemd unit mirroring kernel OOM lines into the BBS data volume's log dir.

**WEBHOOK command — 4 real bugs found+fixed live-testing with the user**,
plus an arrow-key-picker UX upgrade for type/triggers (was free-text typing
against an invisible list). Full bug-chain story (useful if anything
regresses) is in the dated handoff above — short version: no per-keystroke
line buffering existed for this flow, then a buffered-vs-unbuffered emit
race broke line breaks, then `DISPLAY_CONF_BULL` subState reuse collided
with the real login-flow's generic display advancer. All fixed, all in the
uncommitted diff above.

**Arkanoid double-webhook-fire, found+fixed.** `client.ts` had two
independent paths (Enter key, mouse click) both calling `saveHighscore()`
for the same screen with no dedup guard — one highscore, two Discord posts.
Fixed with a `highscoreSaved` flag, `dist/` rebuilt. Uncommitted (see above).

**Patrik/`uhcsearch` TSV index — already live, not this session's work,
confirmed working.** `http://doors.uprough.net/api/door-repo/index.tsv`,
plain HTTP, no redirect, art-filtered descriptions. Nothing to build here.

**A live Discord webhook URL was pasted into chat by the user** while
reporting a bug — flagged immediately, user said they'd regenerate it in
Discord's channel settings. If you find an old-looking webhook row in the
`webhooks` table, don't assume it's still valid.

## Next

1. Commit/push/deploy the uncommitted fixes above (see "UNCOMMITTED work").
2. Resume owner-curation plan at Task 5+6 (UI), new files only.
3. Final whole-branch review (opus) for owner-curation once 5+6 land.
4. Task 8 (live pass) — needs a real admin test account, ask the user first.
5. Older, lower-priority open items carried from earlier sessions (door
   server phase2/ARexx/LOCATION-picker work — all separately merged/live
   already, see `thoughts/shared/handoffs/` for that history if needed):
   - DOORMAN's `resolveDoorRepoMode` `owner` branch is vestigial, worth
     retiring.
   - LOCATION-picker still picks the wrong program for deeply-nested
     archives (`1OO-WALL.LHA` repro documented in prior handoffs).
   - Doorserver dedup check may not distinguish rejected from approved
     submissions (not investigated).
   - `Doors/door-manager/app.ts` is at the pre-commit hook's exact
     2000-line cap — needs a real split before its next edit.

Older sessions: `thoughts/shared/handoffs/`.
