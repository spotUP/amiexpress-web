# Handoff

## Current State (2025-12-10)
- Screen flow: ~CC commands run (GL+GWALL), 68K GWALL removed; path resolution uses `BBSPaths.resolveAmigaPath`; QuickNew fallback text added to avoid blank login pause.
- Doors: TS GWALL/GLC viewer/telnet-front/spaceshoot now type-check with new tsconfigs/typeRoots; Arkanoid2 highscores path fixed. Remaining TS errors: `doors/ansi-editor` (context shape/modals), `doors/bbslinkwall` (extends missing ../../tsconfig.json + `bbsSession` global), `doors/fireemblem` (missing tactical engine/core modules), `doors/rpg|rpgadv|mario|tictactoe` (missing SDK dep/pathing).
- Slowmo MCI matches express.e; modem throttling off for screens by default; W menu clears pause/shortcuts and stores baud (DB column added).
- Operator chat/path fixes and connection banner persist; config-app build passes (`socket.io-client` added); deploy entrypoint CRLF issue fixed.

## Recent Work
- Added tsconfigs/typeRoots for doors without them; telnet-front/Gwall/glc-viewer/spaceshoot now pass `tsc --noEmit`.
- Wired ANSI Editor display context with `getSelectionBounds`/`runDoor`; added QuickNew fallback text; updated screen handler to use AmigaFS resolver for absolute paths.

## Next Steps
1) If modem emulation is needed again, re-enable throttle in `screen.handler.ts` with escape-aware chunking so ANSI/slowmo aren’t split.  
2) Re-test W menu in a live session: numbers should echo, no `(Pause)...` interception, option 17 visible and saves.  
3) Keep BBSTITLE slowmo at -3 unless the user requests retuning.  
4) Let Render redeploy with new config-app dependency; watch for any remaining Vite externals warnings.
5) Verify connection banner shows before AWAITSCREEN now that the clear-before-await flag is removed.  
6) Test O (page sysop) end-to-end: admin /admin/operator-chat should receive `operator:page`, accept joins room, and messages flow both ways.  
7) Redeploy to confirm entrypoint now runs (CRLF -> LF fix).
8) Re-test operator chat paging locally: with sysop logged into admin, page should arrive and chatting should work now that availability defaults to available and sockets join rooms on connect.
