---
date: 2026-05-18
topic: overclock-bench, in-process corpus tester, WSS endpoint, ZMODEM-web unification
tags: [overclock, corpus, integration-tests, websocket, zmodem, batch-doors, multitop, system-commands]
status: draft
---

# Session handoff — 2026-05-18

Long session covering five major workstreams. Several **shipped + deployed**, one is **mid-flight (mtop verification)**, one is **planned but not started (ZMODEM web unify)**.

---

## TL;DR

| Workstream | Status | Live? |
|---|---|---|
| Door overclock benchmark (324 doors) | DONE — 294 safe at 100000x | report-overclock.json on disk |
| Batch-door OVERCLOCK= plumbing + heavy-door 5000x floor | SHIPPED | yes, last good deploy |
| 68K MultiTop (mtop) verification on live | **STILL TIMING OUT** — root cause not yet identified | partially |
| In-process integration corpus runner | v0.1 SHIPPED, working with WHO smoke test | local only |
| --capture-all sweep + populate helper | tools shipped, capture **paused at ~200/324** | local |
| WSS terminal endpoint at /ws/terminal | SHIPPED | yes (after push) |
| BBSCmd restored from sanctuary | SHIPPED | will sync on next deploy via entrypoint Commands sync |
| LOGOFF syscommand.util crash | SHIPPED fix | yes (after push) |
| ZMODEM web unification (kill /api/upload) | **PLANNED only — see "Next session" below** | no |

---

## Critical context

**Live BBS** at `https://bbs.uprough.net/` is healthy. Deploy script swallows errors per memory `feedback_verify_live_deploy_freshness` — always verify container age + /health after a workflow goes green.

**Local BBS** is running at `http://localhost:3001/` (PID 9111 → restarted multiple times this session, may need fresh start). `./dev/scripts/start-servers.sh --bbs-only` per memory `feedback_start_servers_bbs_only`.

**User account on local** is `spot` with `seclevel=10`. `sysop` is 255. The `gl` (ACCESS=100) and `gwall` (ACCESS=50) commands correctly deny `spot`; only sysop can run them. Either log in as sysop or `sqlite3 data/amiexpress.db "UPDATE users SET seclevel=255 WHERE username='spot';"` for future testing.

---

## 1. Door overclock benchmark — DONE

**Script**: `dev/scripts/bench-overclock.ts` (committed `e667ac96c`).

Runs top-down per door across factors `[100000, 25000, 5000, 1000, 500, 100]`, concurrency 3, takes ~25-30 min for full corpus.

**Results** (in `report-overclock.json` at repo root):

| max-safe factor | doors |
|---|---|
| 100000x | 294 |
| 25000x | 4 (`5d_logoff`, `5d_usr11_5d_user`, `tfa_bpxc_ganuaan`, `vty_cm11_meter`) |
| fail-all-factors | 25 (pre-existing corpus issues, **not** overclock-sensitive — they fail at 100x too) |
| missing binary | 1 |

**Takeaway**: we can safely raise `DoorLifecycleManager`'s 100x default to ~25000x globally with no regression. Not done yet — pending a code-side override map populated from this report, or per-door OVERCLOCK= tooltype updates.

---

## 2. Batch-door OVERCLOCK plumbing — SHIPPED, but verification incomplete

**Commits**: `88237dc20` (heavy-door floor + .info OVERCLOCK forwarding), `17d274140` (mtop timeout 30s→300s), `ef3c50e9b` (debug logging — uncommitted at time of writing, now in `ef3c50e9b`).

**What it does**:
- `runAmigaDoorViaRunner` now reads OVERCLOCK= from `<doorPath>.info` and forwards via `DOOR_OVERCLOCK` env on the runner subprocess.
- `mtop`/`multitop` get a 5000x floor + 300s timeout via the `HEAVY_BATCH_OVERRIDES` map.
- New: logs `[BatchScheduler] spawn env DOOR_OVERCLOCK=<value>` for diagnostic.
- New: runner subprocess stderr is now piped to parent stderr as `[runner:<name>] ...` so we can see the `[DoorLifecycleManager] Overclocking: N x` confirmation.

**Open issue**: mtop **STILL TIMES OUT** at 300s on local. Multiple runs observed in `logs/backend.log`:
```
[BatchScheduler] Running door mtop as type SIM (overclock=5000x)
[BatchScheduler] Door mtop was killed due to timeout
```

Local manual smoke test of the **same binary, same args, same assigns shape** completed in ~5s exit 0. So the door itself works. Something about the batch invocation path is different.

**Next step**: BBS hasn't been restarted since the stderr-pipe commit landed. Once it is, the next logoff will emit `[runner:mtop] [DoorLifecycleManager] 🚀 Overclocking: 5000x` (or fail to) so we can see if the env is actually propagating. Hypotheses:
- npx wrapper strips DOOR_OVERCLOCK env? Unlikely, npx inherits.
- The runner spawns yet another subprocess? Possible — check run-amiga-door.ts spawn chain.
- mtop genuinely needs more than 300s even at 5000x because of real-world user.data size? Live `/app/data/bbs/user.data` could be much larger than local.

---

## 3. In-process integration corpus runner — v0.1 SHIPPED, capture paused

**Script**: `web/backend/src/scripts/corpus-integration-runner.ts` (committed `b82443768` + `023117a37`).

Drives every door through the **real** `executeDoor()` entry point with a MockSocket + minimal LOGGEDON BBSSession. Same code path as a live session.

**What works**:
- WHO door smoke test: pass in ~3.7s with 36KB captured output.
- `--capture-all` mode iterates every corpus entry.
- `--only <id[,id...]>` for targeted testing.
- Concurrency up to 4 verified (independent nodeId per worker).
- Schema added to corpus.json:
  ```json
  "integration": {
    "timeoutMs": 15000,
    "inputs": [{"delayMs": 500, "data": "\r"}],
    "assertions": {
      "mustContain": ["banner text"],
      "mustNotContain": ["TRAP", "PANIC", "Guru"],
      "expectedSubState": "DISPLAY_MENU"
    }
  }
  ```

**Populator**: `dev/scripts/door-corpus/populate-integration.ts` auto-picks 2 signature lines from captured goldens (longest non-blank line + first containing door name) + adds default `mustNotContain: ["TRAP","PANIC","Guru","Software failure"]`.

**Paused**: `--capture-all` was killed at ~200/324 to free CPU when user wanted to test mtop locally. Resume with:
```
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --capture-all --concurrency 4
```
Captures land at `dev/scripts/door-corpus/goldens/<id>/integration.txt`.

Then:
```
npx tsx dev/scripts/door-corpus/populate-integration.ts
```
Populates corpus.json integration: blocks from captures.

Then:
```
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 4
```
Runs assertions across all populated entries.

**Why this matters more than the existing harness**: the isolated harness misses every integration-level bug (today's EventEmitter wrapper regression, GLC alias gap, subState clobber, post-door cleanup). The in-process runner exercises the full `executeDoor → DoorManager → launchAmigaDoor → drop files → post-cleanup → BBSEventEmitter` chain.

---

## 4. WSS terminal endpoint — SHIPPED

**Files**: `web/backend/src/server/ws-terminal-server.ts` (new) + `web/backend/src/index.ts` wiring (committed `c907468b2`).

**Usage**:
- Local: `wscat -c ws://localhost:3001/ws/terminal`
- Prod (after deploy): `wss://bbs.uprough.net/ws/terminal`

Mounts on the existing HTTP server. WSTerminalConnection mimics TelnetConnection's surface so `setupTelnetSSHHandler` consumes it unchanged. Raw UTF-8 bytes both ways. No Socket.IO handshake, no IAC, no MIME upload. Real third-party gateway / embed integration story.

Doesn't replace anything — Socket.IO at `/socket.io/` still serves the React UI exactly as before.

**Not yet tested end-to-end** — wired up, typechecks clean, BBS started successfully with `[WS-Terminal] Endpoint ready at /ws/terminal` in the log. Need a smoke test with wscat and verify login flow works.

---

## 5. BBSCmd restoration — SHIPPED

**Commit**: just landed (after `c907468b2` push). Mirrors `/Users/spot/Downloads/testbbs/bbs_sanctuary/Commands/BBSCmd/` (79 files) into local `Commands/BBSCmd/` so the BBS scanner can register `gl`, `gwall`, `CONFTOP`, and ~76 others.

The earlier `a0ffe7131` revert nuked the dir; sanctuary's curated set is the minimum needed for the canonical door layout.

**`U.info` disabled locally** (renamed → `U.info.disabled-ulgoff`) to match the prod entrypoint orphan-cleanup — the slow UL-Logoff wrapper door causes a 7s startup delay on `U` press; internal upload handler is preferred.

---

## 6. LOGOFF syscommand.util crash — SHIPPED

**Commit**: `2185c4ff9`. `system-commands.handler.ts` was requiring `'../../utils/syscommand.util'` which doesn't exist; every logoff threw:
```
[LOGOFF] Error processing LOGOFF sys-commands:
  Error: Cannot find module '../../utils/syscommand.util'
```
Both call sites now use `runSysCommand` from `command-execution.handler.ts`.

---

## NEXT SESSION — ZMODEM web unification (PLAN ONLY, NOT IMPLEMENTED)

**User-approved scope** for the next session. Recommended to do first thing.

### Why
Current upload/download has three parallel paths that drift:
- Telnet/SSH: real lrzsz ZMODEM (works correctly, exercises full BBS upload flow incl. description prompt, conf, sysop rules, dup check, runPostUpload).
- Web: separate `/api/upload` HTTP multipart route — bypasses BBS pipeline → that's why today's test upload landed as `00013359.png` in DIR5 with no description prompt and didn't surface in FR.
- SSH: see telnet.

### What's already in place
- Frontend Zmodem.Sentry **fully wired** in `packages/terminal/src/components/BBSTerminal.tsx:414` (zmodem.js 0.1.10).
- Backend `transfer-raw:start` / `transfer-raw:data` / `transfer-raw:end` / `transfer-raw:cancel` socket bridge in `web/backend/src/server/socket-handlers.ts:857-899`.
- `session.transferRawSend` already routes lrzsz output via `socket.emit('transfer-raw:data', buf)` for web sessions.

### What's missing — the actual scope
1. **Server emits `zmodem-start`** from `handleZmodemUploadCommand` / `startZmodemDownload` BEFORE spawning lrzsz, so the browser arms its Sentry. Currently the Sentry is only armed when the CLIENT initiates `armZmodem` — but for the unified flow the server initiates.
2. **Remove the `webUploadMode` branch** in `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts:141-178` — collapse to a single lrzsz path.
3. **Frontend listens for `zmodem-start`**, calls existing `armZmodem(direction)` from `BBSTerminal.tsx`.
4. **Verify byte path** for both directions:
   - Upload: browser Sentry → `socket.emit('transfer-raw:data')` → server `socket.on('transfer-raw:data')` → sink → lrzsz `rz` stdin.
   - Download: lrzsz `sz` stdout → `session.transferRawSend` → `socket.emit('transfer-raw:data')` → browser Sentry → file save.
5. **Delete** `processFileUpload` and `/api/upload` route + ~280 lines of `file-socket-handlers.ts`.
6. **Test matrix**: small file, medium, large, batch upload, MuffinTerm-style download (verify CRC patches from `lrzsz-transfer.service.ts` still apply on web wire), abort mid-transfer.

### Historical context (read this before starting)
Per the comment at `transfer-misc-commands.handler.ts:132-140`:
> "Doing real ZMODEM here would mean running zmodem.js in the BBS and a second zmodem.js Sentry in the browser — that crashes (browser saw 'Unhandled header: ZRINIT/ZRQINIT' because its Sentry was in receive mode while server emitted bytes it didn't expect)."

That was a real bug at the time, **likely fixed** by today's IAC double-escape removal (`b1e0b8f9b`) and ANSI cooking fixes. Worth re-attempting now that the byte path is clean.

### Files to touch (estimate)
| File | Change |
|---|---|
| `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` | Remove web branch (138-178), unify to lrzsz path |
| `web/backend/src/handlers/commands/user-commands.handler.ts` | Same shape for download |
| `web/backend/src/services/lrzsz-transfer.service.ts` | Emit `zmodem-start` event before spawn |
| `web/backend/src/server/file-socket-handlers.ts` | Delete `processFileUpload` (~280 lines) |
| `web/backend/src/server/routes-setup.ts` | Remove `/api/upload` route |
| `packages/terminal/src/components/BBSTerminal.tsx` | Wire `socket.on('zmodem-start')` → `armZmodem(direction)` |

---

## OTHER ONGOING / TODO

### Add regression tests for everything shipped today (per memory)
Memory `feedback_add_regression_tests` says every change needs a failing-on-regression test. Today we shipped multiple fixes without tests:
- LOGOFF syscommand.util (assert LOGOFF dispatch doesn't throw)
- BBSCmd dir scan finds `gl`/`gwall`/`CONFTOP`
- Heavy-door overclock floor for mtop
- mtop 300s timeout

### Mobile keyboard bugs (per memory `project_mobile_keyboard`)
Carry forward.

### Door bug backlog (per memory `project_door_bug_backlog`)
Per memory: "backlog empty as of 2026-05-05". Today added new entries that should be tracked:
- mtop times out at 300s/5000x — root cause unknown
- 25 doors fail at every overclock factor (pre-existing corpus brokenness)
- 4 doors cap at 25000x — sensitivity reason unknown

### BatchScheduler other timing-out doors
Logs showed ByteKillHandler and QuickNew also timing out at 30s. Same fix: per-door OVERCLOCK= in their .info OR add to `HEAVY_BATCH_OVERRIDES` map. Pending decision.

### Multi-instance emulator heat (per memory `feedback_avoid_parallel_emulator_heat`)
The corpus capture-all at concurrency 4 was on the edge — user had to ask me to stop it to test locally. Cap reaffirmed: 1 sustained, 2-3 brief. Bench tools should default to 1, allow opt-in higher.

### Bench tool default concurrency
`bench-overclock.ts --concurrency` defaults to 3. Reconsider after the integration runner replaces some of its use.

---

## Critical references

| Path | Why |
|---|---|
| `report-overclock.json` (repo root) | Per-door max-safe overclock factor results |
| `dev/scripts/bench-overclock.ts` | Bench script (re-runnable) |
| `web/backend/src/scripts/corpus-integration-runner.ts` | In-process integration tester |
| `dev/scripts/door-corpus/populate-integration.ts` | Goldens → corpus.json populator |
| `web/backend/src/server/ws-terminal-server.ts` | WSS endpoint |
| `web/backend/src/services/batch-scheduler.ts:780-815` | Overclock plumbing + diagnostic logging |
| `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts:130-178` | The web upload branch to remove for ZMODEM unify |
| `packages/terminal/src/components/BBSTerminal.tsx:140-450` | Existing Sentry wiring to extend |
| `web/backend/src/server/socket-handlers.ts:857-899` | transfer-raw socket bridge already in place |
| `/Users/spot/Downloads/testbbs/bbs_sanctuary/` | Reference BBS — has working canonical BBSCmd layout |
| `thoughts/shared/handoffs/2026-05-18_zmodem-muffinterm-upload-unification.md` | Prior session's ZMODEM work history |

---

## What's actively running at session end

- BBS local: `start-servers.sh --bbs-only` (PID 9111 if still alive; may be dead from later restarts).
- Capture-all bench: **killed** during session.
- Bench-overclock: completed.
- No persistent background processes that need explicit cleanup.

Monitors all stopped before commit chunks. Logs at `/tmp/bbs-start.log` and `logs/backend.log` may be useful for diagnosing the mtop timeout in the next session.
