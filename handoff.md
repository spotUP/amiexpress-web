# Handoff

## Current State (2025-12-10)
- Slowmo MCI (~SMO/~SMC) matches express.e: streams ~60fps with 256-byte cap; positive speeds 1-5 mirror AmiExpress, web-only negatives (-1..-3) are slower; state resets after each screen. `Screens/BBSTITLE.txt` uses `~SMO-3|`.
- Modem emulation exists but is **disabled for screen rendering** to avoid ANSI corruption; session defaults modem off (`modemBps=0`, `modemEmulationEnabled=false`). W menu option 17 stores baud choice list (0=off/max, 1200..56k plus HST labels); login applies saved baud if >0. Doors are excluded from modem throttling.
- W command now clears pagination/pause/shortcuts before showing the menu and echoes input for option/modem-speed prompts; should behave like express.e lineInput (ref express.e:25820-25940).
- Added `baud` column to SQLite (amiexpress.db) and wired repo mapping/insert/migration; W modem speed no longer crashes when saving.
- Re-enabled modem emulation on screen output using session.modemBps/baud with escape-safe tokenization; throttles at ~bps/10 bytes/sec when user enables it (still off by default). Slowmo frames now cap to modem speed only if the modem link is slower; otherwise slowmo pacing is left untouched.
- Config app build now succeeds locally after adding missing `socket.io-client` dependency used by `OperatorChatPage`.
- Connection banner (welcome/reg info with “Web port by Spot/Up Rough”) now persists: we stopped clearing before AWAITSCREEN so the banner shows before the await screen/telefront run.
- Operator chat path fixed: sockets now use same-origin (or VITE_SOCKET_URL), sysop emits correct events, and rooms are joined so page/accept/message fan-out works (`web/backend/src/handlers/operator-chat.handler.ts`, `web/config-app/src/pages/OperatorChatPage.tsx`).
- Render deploy failure was due to CRLF in `docker-entrypoint.sh` causing “no such file or directory”; converted to LF so entrypoint executes in container.
- Sysop availability now defaults to AVAILABLE and is set on connect/disconnect for secLevel >=100 sockets, so paging works without manual status toggles (`web/backend/src/database/operator-chat.repository.ts`, operator chat handler).
- Computer type creation fixed: config.service now imports the Zod schemas (ComputerTypeSchema, etc.) instead of referencing undefined exports, eliminating “ComputerTypeSchema is not defined” at runtime.
- Deployment/health API now uses proper auth middleware (`authenticateToken(db), requireSysop()`) so admin Deployment & Health page should load.
- Session log terminal view now strips destructive ANSI control codes but keeps color, so content should display instead of clearing.

## Recent Work
- Fixed Render build break: `web/config-app` now declares `socket.io-client` (^4.8.1); `npm run build` passes locally.
- Cleared lingering pagination, menuPause, queued screen commands when entering W; ensured cmdShortcuts off.
- Added input echo/backspace for W option select and modem speed input to avoid “hotkey mode” feel.
- MCP server still broken; reading local `Documentation/7-Reference Sources/AmiExpress-Sources/express.e` instead.
- Connection banner being cleared before await screen fixed by removing AWAITSCREEN from the clear-on-display list in `web/backend/src/handlers/screen.handler.ts`.
- Operator chat fixes: admin socket connects to same origin (not localhost), listens to `operator:message`/`operator:typing-status`, sends `operator:send-message`, and backend now joins both user/sysop sockets to page/user rooms so room-targeted emits deliver.

## Next Steps
1) If modem emulation is needed again, re-enable throttle in `screen.handler.ts` with escape-aware chunking so ANSI/slowmo aren’t split.  
2) Re-test W menu in a live session: numbers should echo, no `(Pause)...` interception, option 17 visible and saves.  
3) Keep BBSTITLE slowmo at -3 unless the user requests retuning.  
4) Let Render redeploy with new config-app dependency; watch for any remaining Vite externals warnings.
5) Verify connection banner shows before AWAITSCREEN now that the clear-before-await flag is removed.  
6) Test O (page sysop) end-to-end: admin /admin/operator-chat should receive `operator:page`, accept joins room, and messages flow both ways.  
7) Redeploy to confirm entrypoint now runs (CRLF -> LF fix).
8) Re-test operator chat paging locally: with sysop logged into admin, page should arrive and chatting should work now that availability defaults to available and sockets join rooms on connect.
