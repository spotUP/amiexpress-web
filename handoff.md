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

## Current state (2026-08-26, latest session)

**Next task: implement the LiveChat stubs.** Full brief, with every file and
what is actually in it, is in
`thoughts/shared/handoffs/2026-08-26_livechat-stubs-implementation.md`.
The living list is `thoughts/shared/plans/2026-08-26-livechat-todo.md`.

Voice and video now work end to end in LiveChat, and all of it is live
(verify with `docker exec amiexpress-bbs cat /app/.git-sha`).

What was wrong and is now fixed:

- **Voice channels had never worked.** A door cannot reach a server handler
  by emitting on its socket - that direction is server to client - so
  `voice:join-channel` was delivered to the browser and the backend logged
  zero joins in its whole history. Now routed through `door.handler.ts` like
  `room:join`.
- **Peer audio had never been audible.** MediaRecorder fragments cannot be
  decoded standalone. Replaced with PCM (16 kHz Int16), which also made the
  WebMediaPlayer exhaustion crash structurally impossible. `/mic` selects
  the input device - the system default can be a loopback like BlackHole.
- **Video: 21 KB a frame at 2.3 fps, now under 2 KB.** Cells plus a
  RUN/SKIP delta codec, keyframes every 30 frames, viewer-chosen render
  mode, ANSI dithering, box-filtered downscaling for BBS-sized tiles.
- **Live outage**: mouse motion was forwarded and logged per event with no
  server-side throttle, which blocked the event loop while the container
  still reported itself up. Throttled to 40ms in
  `web/backend/src/doors/input-motion-throttle.ts`.
- **Deploy**: sync by tar, a `.sync-complete` marker so verification waits
  for the entrypoint rather than for `/health`, and a check that ignores the
  door `.ts` sources the entrypoint deliberately deletes.

Two fixes are UNVERIFIED by the user and should be checked first:

1. the audio jitter buffer (the "stuttery robot" report predates it)
2. the mouse-motion throttle, which may have made panel hover worse

Gotchas earned this session:

- `packages/terminal` compiles the SDK sources under its own stricter
  tsconfig and gates the Docker build. Three other typechecks can be green
  while the deploy fails. Typecheck it before pushing anything under `sdk/`.
- The entrypoint deletes door `.ts` from the volume after syncing, because
  production runs `dist/`.
- Eleven backend processes were found running at once, only one bound to the
  port. Zombie-verify.

