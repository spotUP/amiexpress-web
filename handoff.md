# Handoff

## 2026-05-18 — Overclock bench + in-process corpus tester + WSS endpoint

**Full archive**: `thoughts/shared/handoffs/2026-05-18_overclock_corpus_wss_zmodem.md`

### Shipped today
- **Door overclock bench** (`dev/scripts/bench-overclock.ts`). Swept all 324 corpus doors — **294 safe at 100000x**, 4 cap at 25000x, 25 pre-existing failures. Results in `report-overclock.json`.
- **Batch-door overclock plumbing**: `runAmigaDoorViaRunner` reads `.info` `OVERCLOCK=` + applies 5000x floor for mtop/multitop; runner stderr now piped to parent log with `[runner:<name>]` prefix.
- **In-process integration corpus runner v0.1** (`web/backend/src/scripts/corpus-integration-runner.ts`). Drives doors through real `executeDoor()` + mock socket + minimal session. WHO smoke test passes. `--capture-all` mode + `populate-integration.ts` helper for auto-generating assertions.
- **WSS terminal endpoint** at `/ws/terminal` (`web/backend/src/server/ws-terminal-server.ts`). Mounts on existing HTTP server; same `setupTelnetSSHHandler` pipeline.
- **BBSCmd restored** from sanctuary reference BBS (79 .info files). `gl`/`gwall`/`CONFTOP` etc now register.
- **LOGOFF syscommand.util crash fix**: `runSysCommand` rebind in `system-commands.handler.ts`.

### In flight, not finished
- **mtop verification**: still timing out at 300s/5000x. Diagnostic logging just shipped — next BBS restart + logoff will reveal whether `DOOR_OVERCLOCK` env propagates through npx→tsx→runner. Grep `logs/backend.log` for `[runner:mtop] [DoorLifecycleManager] 🚀 Overclocking: ...`.
- **Capture-all corpus sweep**: paused at ~200/324 doors. Resume:
  ```
  cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --capture-all --concurrency 4
  npx tsx dev/scripts/door-corpus/populate-integration.ts
  ```
- **WSS endpoint**: shipped, not smoke-tested. Try `wscat -c ws://localhost:3001/ws/terminal`.

### Next session — user-approved scope
**ZMODEM web unification**: kill `/api/upload` HTTP route, route web through telnet/SSH lrzsz path. Frontend Sentry already wired (`packages/terminal/src/components/BBSTerminal.tsx:414`); backend `transfer-raw:*` bridge already at `socket-handlers.ts:857`. Needs: server emits `zmodem-start` event before spawning lrzsz, frontend arms Sentry on that event, web branch in `transfer-misc-commands.handler.ts:141-178` deleted, `~280` lines of `file-socket-handlers.ts` removed. Full plan + file pointers in archive.

### Other open items
- **25 corpus-broken doors** + 4 capped-at-25000x — uninvestigated, listed in archive.
- **ByteKillHandler / QuickNew** timing out in batch too — same fix shape as mtop.
- **Regression tests owed** for every fix shipped today (memory `feedback_add_regression_tests`).
- **Raise DoorLifecycleManager default** from 100x → 25000x (bench data supports it).
- **Local user `spot` is seclevel=10**: `gl`/`gwall` correctly deny him. Log in as `sysop` (255) for high-access tests, or bump spot.

### Quick state pointers
- Local: `./dev/scripts/start-servers.sh --bbs-only`. Log: `logs/backend.log`.
- Live: `https://bbs.uprough.net/`. Deploy gates per `feedback_verify_live_deploy_freshness`.
- Reference BBS: `/Users/spot/Downloads/testbbs/bbs_sanctuary/`.

---

## 2026-05-17 — Live/local divergence audit + structural fixes

After months of live behaving differently from localhost in ways that
were always written off as one-offs, a deep audit found two genuine
root causes and a class of stale-volume issues. All three fixed,
verified live, regression-tested.

### Root causes found + fixed

1. **ACS path mismatch on prod (`d1320d624`).** `initializeSecurity`
   computed `bbsRoot` as `path.resolve(cwd, '..', '..')` when `BBS_ROOT`
   was unset. On localhost cwd is `web/backend`, so `../..` lands at the
   project root with `Access/` present. In the container cwd is
   `/app/web/backend`, so `../..` lands at `/app` — which has no
   `Access/`; the BBS data is at `/app/data/bbs/Access/`.
   **Fix:** fall back to `BBS_DATA_DIR` before cwd-relative.

2. **Case-sensitive screen variant ordering (`faa210e66`).** The
   loader scanned `BBSTITLE.TXT` (uppercase) before `BBSTITLE.txt`
   (lowercase). macOS APFS hid this; prod Linux exposed it. **Fix:**
   reorder all variant lists to prefer lowercase.

3. **FRONTEND syscmd not invoked on telnet/SSH (`91272c522`).** Web
   ran it; telnet/SSH skipped it. **Fix:** `setupTelnetSSHHandler`
   stashes the emitter on the connection; both transport servers
   await `runSysCommand(emitter, session, 'FRONTEND', '')` before
   the graphics prompt.

### Volume hot-fixes applied live + tiered sync policy (`629dc1cdf`)
- `Access/ACS.255.info`, `Conf.DB`, `Screens/BBSTITLE.TXT` repaired.
- `docker-entrypoint.sh` split into IMAGE-OWNED (hash-compared) vs
  VOLUME-OWNED (init-once) to prevent future drift.

### Other UX fixes
- LF→CRLF normalize on telnet/SSH emitter (`81c317766`).
- Standing SSH/restart authorization for Claude (`87b8ea3fa`).

### Regression tests (`d91680017`)
- `tests/utils/acs.util.test.ts` — bbsRoot resolution chain.
- `tests/handlers/screen-loader-case.test.ts` — variant ordering.

### Prior sessions archived
- `thoughts/shared/handoffs/2026-05-16_door-bug-batch.md`
- `thoughts/shared/handoffs/2026-05-16_mastermind-deep-dive.md`
- `thoughts/shared/handoffs/2026-05-18_zmodem-muffinterm-upload-unification.md`
