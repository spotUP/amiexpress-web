---
date: 2026-08-24
topic: DoorRepo owner-curation plan (3/5 tasks), live OOM incident + fix, WEBHOOK UI bugs, arkanoid double-submit
tags: [doorrepo-c, owner-curation, oom, webhook, arkanoid, batch-scheduler, sdd]
status: in-progress
---

# Session handoff — 2026-08-24

## Task(s)

1. **DoorRepo C door — owner-mode curation plan** (SDD pipeline, third of three sibling plans; siblings `L`=installed-list and `M`=access-editor are both already complete/merged from earlier this session). Plan: `docs/superpowers/plans/2026-08-24-doorrepo-owner-curation.md`. Ledger: `.superpowers/sdd/2026-08-24-doorrepo-owner-curation/progress.md` (still present, NOT yet deleted — plan is incomplete).
2. **Live production incident**: `bbs.uprough.net` down/unresponsive. Root-caused to real kernel OOM kills (not a webhook bug, despite the coincidental timing with WEBHOOK testing). Fixed at both the app level (real bug: duplicate door-emulator spawns on reconnect) and the infra level (swap, memory limit, log persistence).
3. **WEBHOOK terminal command**: found and fixed a chain of 4 real, independent bugs while live-testing with the user (see Learnings). Also added a UX feature (arrow-key pickers) the user asked for mid-session.
4. **Arkanoid door**: found and fixed a double-webhook-fire bug (client-side double-submit, unrelated to the WEBHOOK command itself).
5. Confirmed (not built by this session) that the `doorserver` TSV index feature for Patrik/`uhcsearch` is already live and working — `http://doors.uprough.net/api/door-repo/index.tsv`, plain HTTP, no redirect.

## Critical References

- Owner-curation plan: `docs/superpowers/plans/2026-08-24-doorrepo-owner-curation.md`
- Owner-curation ledger (full rulings/findings/fix-round history): `.superpowers/sdd/2026-08-24-doorrepo-owner-curation/progress.md`
- OOM guard: `web/backend/src/services/batch-scheduler.ts` — `runLoginBatches()`, module-level `activeLoginBatchNodes` Set
- OOM regression test: `web/backend/tests/services/batch-scheduler.test.ts` — `describe('runLoginBatches — per-node reentrancy guard')`
- WEBHOOK flow: `web/backend/src/handlers/commands/webhook-commands.handler.ts` (whole file effectively rewritten today), routing in `web/backend/src/handlers/command.handler.ts` (search `webhookAdd`, `webhookAddTypeSelect`, `webhookAddTriggersSelect`, `returnToWebhookMenu`)
- Menu windowing: `web/backend/src/utils/menu.util.ts` — `MenuState.maxVisible`
- Arkanoid fix: `Doors/arkanoid/client.ts` — `highscoreSaved` flag; **remember to `npm run build` in `Doors/arkanoid/` after any further edit, dist/ is what runs**
- Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22** (not the `:31337` entry in `known_hosts` — that port refuses `exec`, only 22 works)
- Deploy verification: `docker exec amiexpress-bbs cat /app/.git-sha` — always check after a push, green CI is not proof

## Recent Changes (commits, chronological)

All on `main`, pushed and deployed unless noted. **A peer Claude Code session was actively committing to this SAME repo throughout** (TrackerEngine, arkanoid highscore broadcast, a door-registration-timeout fix, a terminal text-selection fix) — several of the SHAs below are interleaved with commits not from this session.

- `44f1cc3dd`..`00d88170d` — `.info`/access-editor plan (M key), earlier this session, fully merged before this handoff's scope starts.
- `8e5b94f4a`/`536609045` — `http_request()` generalization (owner-curation Task 3), reviewed, fix round closed.
- `b84c115db`/`4c22e48b1`/`81ea9f05e` — `json_lite` narrow JSON extractor (owner-curation Task 4), reviewed on opus (security-focused), fix round closed all 3 findings, 3 minor doc-accuracy fixes applied directly by controller.
- `213b6447d`/`5ad74d7ec` — `owner_auth.c`/`.h` (owner-curation Task 1), reviewed on opus (credential-handling focus), fix round closed all 4 findings (sink-reset-on-retry, sprintf bound, stub-server hang, fail-closed test coverage).
- `55982e7a0` — fix: WEBHOOK's "Show Triggers" list was missing `door_score` (silent gap, not a crash).
- `c635890a0` — fix: ADD WEBHOOK read input per-keystroke instead of per-line (first, INCOMPLETE fix — only changed subState, didn't add real buffering).
- `7c7504bbf` — **fix: OOM root cause.** `runLoginBatches()` reentrancy guard.
- `1ca8f1c6d` — feat: arrow-key pickers for webhook type/triggers + the REAL per-keystroke buffering fix (raw `socket.emit`, matching this flow's own unbuffered convention, not the buffered `emitText()` that raced against it).
- **Uncommitted as of this handoff** (see `git status`):
  - `web/backend/src/handlers/command.handler.ts` — moved `returnToWebhookMenu`/`returnToWebhookActionMenu` checks to run BEFORE `isDisplayFlowState()`, fixing a real bug: pressing "any key" at a WEBHOOK info screen was falling through into the normal post-login bulletin/conference-join sequence.
  - `web/backend/src/utils/menu.util.ts` — added `MenuState.maxVisible` (scrollable window with "N more above/below" markers); `webhook-commands.handler.ts`'s trigger picker (20 rows) now uses `maxVisible: 12`.
  - `Doors/arkanoid/client.ts` + rebuilt `Doors/arkanoid/dist/client.bundle.js` — `highscoreSaved` guard flag, fixes a real double-submit (Enter key AND mouse click both call `saveHighscore()` for the same "enter name" screen, no guard existed) that fired one Discord post twice for one highscore.
  - `d86694d59` (local, unpushed, **not this session's work** — a peer session's terminal text-selection fix, left as-is, don't touch).

Live deploy SHA at last check: `3cb5d5f3b` (before the uncommitted arkanoid/webhook/menu fixes above — those still need a commit + push + deploy in the next session).

## Learnings

- **The WEBHOOK bug chain, in the order actually found** (useful if anything regresses): (1) `addWebhookPrompt()` set `subState = READ_COMMAND` instead of `FILE_DIR_SELECT` — every keystroke was treated as a complete line. (2) Switching to `FILE_DIR_SELECT` alone did NOT fix it — **no client-side line buffering exists anywhere in this BBS** (`socket-handlers.ts:766-784` forwards every keystroke as its own event); only states with their OWN explicit accumulate-until-Enter logic (`READ_COMMAND`, `GDPR_BACKFILL`) work for multi-char input. Had to add that logic explicitly to the `webhookAdd` dispatch in `command.handler.ts`. (3) Step-transition prompts landed on the same terminal row as the previous line — `webhook-commands.handler.ts` uses raw unbuffered `socket.emit('ansi-output', ...)` throughout, but the per-keystroke echo used the BUFFERED `emitText()` (16ms/60fps batching) — the unbuffered next-prompt text could arrive before the buffered echo flushed. Fixed by making the echo unbuffered too, matching this flow's own convention. (4) `DISPLAY_CONF_BULL` is reused by WEBHOOK's "Press any key to continue" AND is a real, unconditionally-checked login-flow state (`isDisplayFlowState()`) — the generic display-flow advancer ran BEFORE the webhook-specific `returnToWebhookMenu` check, swallowing the keypress and kicking off the normal login bulletin sequence. Fixed by reordering. **Lesson for next time a screen reuses a subState for a generic "press any key" prompt: check the ENTIRE file for other unconditional handlers of that subState, not just the one you're adding — `grep -n "SubStateName"` across the whole `command.handler.ts`, not just near where you're editing.**
- **The dev environment's own zombie-process problem was largely self-inflicted this session**: I used ad-hoc `npm run dev &` / `pkill -f ...` instead of the project's own canonical `./dev/scripts/start-servers.sh` / `kill-servers.sh` / `npm run dev:doors`, and repeatedly created duplicate backend processes fighting over ports 3001/64128/31337. **RULES.md already documents the fix**: use the canonical scripts, and run the "Zombie verification" command after stopping (`ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep`, expect empty) before starting again. Even the door watcher's OWN restart cycle left zombies once (EADDRINUSE crash loop) — always zombie-verify after ANY stop, including an automatic one.
- **`start-servers.sh` has an intermittent, unexplained failure**: mid-run it sometimes prints `line 874: i: command not found` / `line 875: syntax error near unexpected token 'done'` and tears down a server it just started successfully. `bash -n` on the file reports no syntax error, and no `for i` loop exists anywhere in the script — root cause not found. Workaround used all session: `npm run dev:doors` (skips the frontend-build orchestration where this seems to originate) instead of the full `start-servers.sh`. Worth a dedicated investigation later, but not blocking.
- **`start-servers.sh`'s `MAX_WAIT` was already bumped from 60s to 240s by someone (uncommitted when this session started, still uncommitted)** — a real, correct, already-diagnosed fix (backend registers ~100 doors before opening port 3001, which alone can exceed 60s on a warm cache). Don't revert it. Should get committed at some point (not this session's work to claim credit for).
- **`config.getConfig()` cannot be isolated via env-var override in a test** — `ConfigManager` reads its config once and returns the same cached object on every `getConfig()` call; a `beforeEach` env var change never takes effect. Use `jest.spyOn(config, 'getConfig').mockReturnValue(...)` instead. Cost real time this session (watched a jest run spawn a real 68K `mtop` door emulator before figuring this out).
- **A live Discord webhook URL got pasted into this chat by the user** (while reporting a bug) — flagged immediately, user said they'd regenerate it. If a fresh session sees an old Discord webhook URL anywhere in `webhooks` table with a name/context suggesting it might be that one, don't trust it's still valid without asking.
- **The OOM root cause, precisely**: `login-post.service.ts:217` fires `runLoginBatches(session.nodeId)` fire-and-forget (`.catch()`, never awaited by the caller) on every login. The spawned child processes (`batch-scheduler.ts`'s `runProgram()`, `detached: true`) outlive the socket that triggered them. A fast reconnect to the SAME node number re-fires `runLoginBatches` for that node while the previous, now-orphaned run might still be in flight — no guard existed. Live evidence: 5 duplicate `QuickNew` (new-user batch scan) 68K emulator processes accumulated within a 20-second window across 3 nodes, ~2GB combined RSS, directly causing 2 real kernel OOM kills (`dmesg`, wall-clock-confirmed against the actual container restarts). Fix: per-nodeId `Set` guard in `runLoginBatches()`, skip-and-log instead of double-spawning. Regression test proves it (`Promise.all([runLoginBatches(N), runLoginBatches(N)])` → exactly one warning logged, not zero, not two).

## Artifacts

- Owner-curation plan: `docs/superpowers/plans/2026-08-24-doorrepo-owner-curation.md`
- Owner-curation SDD ledger (NOT deleted, plan incomplete): `.superpowers/sdd/2026-08-24-doorrepo-owner-curation/progress.md`
- Federation/NETLINK/NETWALL brainstorm plan (explicitly NOT approved for implementation, save for later, user's own words: "we asked to brainstorm not implement"): `/Users/spot/.claude/plans/cryptic-whistling-prism.md`

## Next Steps (ordered)

1. **Commit + push + deploy the 3 uncommitted fixes** (`command.handler.ts` DISPLAY_CONF_BULL reorder, `menu.util.ts` windowing, `Doors/arkanoid/client.ts` + rebuilt dist) — do this FIRST in the next session, before anything else, since the live site is running an older SHA than what's been tested. Verify live SHA after (`docker exec amiexpress-bbs cat /app/.git-sha`).
2. **Resume owner-curation plan at Task 5/6** (UI: `O`-key entry, submissions queue screen, field-edit menu, new `ui_line_prompt()` helper — per the plan's pre-flight ruling, ALL new UI code must land in NEW files, `doorrepo.c` is already 5533 lines against a 2000-line project cap). Dispatch order already established: 3→4→1 done, 5+6 next, then final whole-branch review (opus), then Task 8 (live pass — **needs the user to provide/confirm a real test admin account on `amiexpress-doorserver`**, will need to pause and ask before touching production credentials).
3. **Check whether the `docker update --memory 3g` limit on `amiexpress-bbs` is still appropriate** — it was sized against a single observed 2.26GB spike; if the OOM guard fix (step 1) fully eliminates the duplicate-spawn class, this ceiling may never be tested again for a while. Not urgent, just worth remembering it's there and why (see `git log` — no, this was a live `docker update`, not a commit; it's not persisted anywhere in code, only in the running container's cgroup config, and would need to be reapplied if the container is ever fully recreated rather than restarted).
4. **`oom-log-mirror.service`** (systemd unit on the live host, mirrors kernel OOM-kill lines into `/var/lib/docker/volumes/amiexpress-bbs-data/_data/logs/oom-events.log`) is running and enabled (`systemctl enable`), survives reboot. Not tracked in any repo — host-only config, know it's there if debugging a future incident.
5. Consider investigating `start-servers.sh`'s intermittent syntax-error/teardown bug (see Learnings) — low priority, workaround (`npm run dev:doors`) is solid.
6. Patrik/`uhcsearch` index: confirmed live and working, nothing to build. If Patrik reports parsing issues, the two open questions from the (stale) `/Users/spot/Desktop/door-repo-index-for-patrik.md` doc are still genuinely open: exact size-padding format, and whether descriptions need pre-truncating.

## Other Notes

- User is doing hands-on live testing throughout — expect bug reports to keep surfacing as real, not hypothetical; the pattern this whole session was "test → real bug found → root-cause fix → rebuild/restart → retest," not speculative fixes.
- A peer Claude Code session (or several) is/are actively working in this SAME repo checkout concurrently. Always `git fetch`/check `git log --oneline origin/main..HEAD` and `HEAD..origin/main` before assuming the working tree's history is entirely this session's own doing, and before pushing — a push here can carry someone else's uncommitted-until-now work along with it (as happened today, twice).
