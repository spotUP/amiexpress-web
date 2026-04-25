# Handoff

## Current State
Three commits shipped today: dos.library D0 propagation audit (5 LVOs), BBSApi game-mode delegation refactor, live-site livechat fix (`door-preloader` SDK package import). All pushed to `main` → Hetzner. Server running locally. Detailed write-up: `thoughts/shared/handoffs/2026-04-25_d0-audit-and-prod-fix.md`.

## This session (2026-04-25 evening)
- **dos.library `handleCall` discarded helper return D0** for 5 LVOs: DateStamp(-192), IoErr(-132), Input(-54), Output(-60), Seek(-66). IoErr was the most damaging — every door checks `D0` after Open/Lock/Read/Write. Fixed at the dispatch site. Commit `ace9e2451`.
- **BBSApi.enableGameMode/disableGameMode were stubs** — only emitted the socket event, didn't update `session.gameModeEnabled` / `currentDoorType`, didn't tear down `keyRepeatManager`. Extracted canonical helpers to `web/backend/src/services/game-mode.service.ts`; BBSApi + `door.handler.ts:1800` hybrid-RPC path now both delegate. Commit `42082b096`.
- **Prod livechat crash** — `door.handler.ts:1634` used source-relative `'../../../../sdk/utils/door-preloader'` that doesn't exist in Docker (only `sdk/dist` is shipped). Switched to `@amiexpress/bbs-door-sdk/utils/door-preloader` + added the subpath to `sdk/package.json` exports. Commit `a26f1951f`.
- Tests added: `tests/amiga-emulation/datestamp-d0-return.test.ts`, `tests/amiga-emulation/dos-d0-propagation.test.ts`, `tests/doors/bbsapi-game-mode.test.ts`.

## Priority for next session
1. **Fix `DoorManager.ts:777`** — references `dev/scripts/install-sdk-doors.ts` which isn't shipped to Docker. Only triggered by sysop "rebuild door" admin flow — not user-facing, but will fail on the live site. Recommend inlining the install logic (precedent: `BBSApi.ts:1346` reload pattern). Won't crash livechat or any normal door run.
2. **CS (AquaScan)** — DT_CONFACCESS protocol mismatch. Our handler matches express.e:3778 (returns 10-char access flags), but AquaScan uses that string as a NAME for `BBS:ACCESS/AREA.<name>.info` icon lookup (real ACCESS dir has Sysop/Elite/Lamer/Disabled). Either door misuses cmd 146 or there's a different XIM cmd we should answer. Live trace at `logs/backend.log:7605`.
3. **CTOP** — silently exits post-IoErr-fix instead of erroring loudly. The `0x04006920` header IS NOT garbage — it matches SanctuaryBBS reference files (`0x040068ec`, `0x0400629d`); high 16 bits is fixed `0x0400` format marker, low 16 bits is days-since-1978 in the 2047–2051 range ("never reset"). Recommend reimplementing as TS door rather than disassembling Conftop v2.3 (closed source by Bobo/Mystic).
4. **`Doors/livechat/server.ts`** still 2590 lines — single `createApp()` with 37 inner functions sharing closure state. Existing `MODULARIZATION_PHASE2_PROGRESS.md` in livechat dir shows this is a paused incremental effort. Needs UI validation per extraction.

## Other open items
- **ED (5D-Edit)** — needs interactive audit with user
- **DEL (MgzListMan)** — original AmigaOS binary missing
- **GA (GetAnswer)** — NOT broken, prompts for input by design

## Gotchas
- **DosLibrary has TWO LVO dispatchers** — `handleCall` (used by `AmigaDosEnvironment.handleSyscall`) and the vector-table in `dos-vectors.ts` (used by `LibraryTraps`). Any D0-touching fix must update both — handleCall has the bug pattern.
- **Production ships only `sdk/dist/`**, never `sdk/utils/` or other source dirs. SDK requires from backend MUST go through the package import (`@amiexpress/bbs-door-sdk/...`) and the package's exports map. Audit pattern: `require\('\.\.\/.+sdk\/'`.
- **`0x04006XXX` is a real format marker**, not garbage — cross-reference SanctuaryBBS captures FIRST when something looks like garbage data.
- **Pre-commit hook EXEMPTS oversize files** (DosLibrary, door.handler etc.) — no `SKIP_SIZE_CHECK=1` needed for those.
- **`.info` files contain high-bit bytes**: edit via `sed`/python/git only.
- **Hybrid RPC-only doors** must enable game mode before `waitForSessionEnd` — now handled centrally via the helper.

## Debugging
- Backend log: `logs/backend.log`. 68K door logs: `logs/door-68k-{name}-*.-N{n}.log`.
- Test harness: `npx tsx web/backend/src/scripts/run-amiga-door.ts <door> <node> [args] --doortype XIM`.
- **User manages servers manually** — never run `start/kill-servers.sh` unprompted.

## Deployment
Push to `main` → GitHub Actions → `docker compose up -d --build` on Hetzner. Web: https://bbs.uprough.net. Telnet: `telnet 89.167.21.154 2323`.
