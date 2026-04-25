# Handoff

## Current State
Door sweep complete — all hybrid SDK doors (livechat, card-lobby, arkanoid, galaga, frogger, bubble-bobble, etc.) now start and quit cleanly. Bug-tracker freezes fixed. GLC crash hardened. Plus: dos.library D0 propagation audit (5 LVOs fixed) and BBSApi game-mode delegation refactor. Server running locally. Detailed write-up in `thoughts/shared/handoffs/2026-04-25_door-sweep.md` and `thoughts/shared/research/2026-04-25_datestamp-d0-and-ctop.md`.

## D0 dispatcher audit + game-mode refactor (2026-04-25 evening)
- **dos.library `handleCall` discarded helper return values** — 5 LVOs whose helpers DO return a value were leaving `D0` with whatever the caller stashed there: DateStamp (-192), IoErr (-132), Input (-54), Output (-60), Seek (-66). IoErr is the most impactful — every door checks `D0` after Open/Lock/Read/Write. Fixed at the dispatch site; helpers unchanged. Audited the other four libraries (Exec/Icon/Intuition/AmiExpress) — pattern was unique to DosLibrary.
- **`BBSApi.enableGameMode()` only emitted the socket event** — didn't set `session.gameModeEnabled` / `currentDoorType`, didn't tear down `keyRepeatManager` on disable. Now delegates to canonical helpers extracted to `web/backend/src/services/game-mode.service.ts`. Hybrid-RPC manual emit at `door.handler.ts:1800` swapped for the helper too. SDK `BBSApi` interface declares the methods.
- Regression tests: `tests/amiga-emulation/datestamp-d0-return.test.ts`, `tests/amiga-emulation/dos-d0-propagation.test.ts`, `tests/doors/bbsapi-game-mode.test.ts`.

## Door sweep + hybrid rescue (2026-04-25)
- **`isHybridRPCOnly` misfired for every hybrid SDK door** — fallback branch matched any object default export, so `execute()` was skipped and every door exited immediately. Gated on `!isSDKDoor && !hasRunDoor`. Fixed livechat, card-lobby, all arcade games.
- **Arkanoid restart-on-quit** — RPC-only hybrid doors weren't enabling game mode, so terminal `onData` leaked every keypress (incl. Q-to-quit) as a BBS command. Emit `game-mode: true` before `waitForSessionEnd`.
- **GamepadInputManager null crash** — guarded `bbsSession.on(...)`; added `session: bbsSession` alias to DoorContext for old arcade door code (`ctx.session`).
- **0-byte binary crashed the server** — `DoorLoader.loadDoor()` passed empty Buffer to hunk parser → uncaught exception. Now throws cleanly.
- **DOORMAN delete didn't refresh registry** — `getDoors()` still returned deleted door. Now reload via `initializeDoors()` after success. Also fixed `commandName` detection (`pkg.doorMetadata.command` not `pkg.bbsCommand`).
- **CHECKUP SQL crash** — `upload_date` → `uploaddate` typo.
- **XIM doors with missing binary** (ARCL→bbslink, etc.) — redirect to TypeScript door at parent directory.
- **Dev bundle endpoint** ignored pre-built `dist/client.bundle.js` and ran esbuild → failed on absolute paths. Now serves pre-built when present.
- **Ghost borders on 19 TS doors** — `clearRegion + alloc` sweep.
- **Bug-tracker dialog freeze** — `showSelector`/`showTextInput`/`showMessage` didn't restore focus. Save `screen.focused`, restore in cleanup.
- **GLC crash hardening** — `res.on('error')` handler + settled flag.
- **NeoShowcase audit** — image demo, color art, viewport demo, LCD width, donut height, picture content, ASCII video matrix rain, list wheel throttle.

## Open / deferred (per backlog memory)
- **CTOP** — confirmed: 68K binary writes garbage date (`0x04006920`) to fresh `Conftop.Data`, then rejects on next read. Inside Conftop020.x; disassembly out of scope.
- **CS (AquaScan)** — "Couldn't load area icon!!" — needs real BBS-context icon.library trace (test harness shows different earlier failure).
- **ED (5D-Edit)** — needs interactive audit with user.
- **DEL (MgzListMan)** — original AmigaOS binary missing.
- **GA (GetAnswer)** — NOT broken, prompts for input by design. Closed.
- **`Doors/livechat/server.ts`** still 2360 lines, over the 2000-line hook.

## Gotchas
- **tsx ESM/CJS split cache**: never use dynamic `await import()` for a module that already has a static import.
- **`.info` files contain high-bit bytes**: edit via `sed`/python/git only.
- **`SKIP_SIZE_CHECK=1`** required for several commits — `Doors/neo-blessed-showcase/app.ts` and `door.handler.ts` are over the limit (pre-existing).
- **Hybrid RPC-only doors** (server.ts exports rpcHandlers only, not the door) need explicit `socket.emit('game-mode', true)` to prevent terminal input from being forwarded to BBS command processor.

## Debugging
- Backend log: `logs/backend.log`. 68K door logs: `logs/door-68k-{name}-*.-N{n}.log`.
- Test harness: `npx tsx web/backend/src/scripts/run-amiga-door.ts <door> <node> [args] --doortype XIM`.
- **User manages servers manually** — never run `start/kill-servers.sh` unprompted.

## Deployment
Push to `main` → GitHub Actions → `docker compose up -d --build` on Hetzner. Web: https://bbs.uprough.net. Telnet: `telnet 89.167.21.154 2323`.

## Suggested next session
- Capture full BBS-context icon.library trace for AquaScan (CS) to diagnose "Couldn't load area icon".
- ED audit with user — user said "almost works."
- Investigate CTOP DateStamp() return path — `D0 = pointer to DateStamp` may be misread as the date itself.
- Split `livechat/server.ts` into `features/`.
