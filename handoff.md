# Handoff

## Current State (2025-12-10)
- Slowmo MCI (~SMO/~SMC) matches express.e: streams ~60fps with 256-byte cap; positive speeds 1-5 mirror AmiExpress, web-only negatives (-1..-3) are slower; state resets after each screen. `Screens/BBSTITLE.txt` uses `~SMO-3|`.
- Modem emulation exists but is **disabled for screen rendering** to avoid ANSI corruption; session defaults modem off (`modemBps=0`, `modemEmulationEnabled=false`). W menu option 17 stores baud choice list (0=off/max, 1200..56k plus HST labels); login applies saved baud if >0. Doors are excluded from modem throttling.
- W command now clears pagination/pause/shortcuts before showing the menu and echoes input for option/modem-speed prompts; should behave like express.e lineInput (ref express.e:25820-25940).
- Added `baud` column to SQLite (amiexpress.db) and wired repo mapping/insert/migration; W modem speed no longer crashes when saving.
- Re-enabled modem emulation on screen output using session.modemBps/baud with escape-safe tokenization; throttles at ~bps/10 bytes/sec when user enables it (still off by default). Slowmo frames now cap to modem speed only if the modem link is slower; otherwise slowmo pacing is left untouched.

## Recent Work
- Cleared lingering pagination, menuPause, queued screen commands when entering W; ensured cmdShortcuts off.
- Added input echo/backspace for W option select and modem speed input to avoid “hotkey mode” feel.
- MCP server still broken; reading local `Documentation/7-Reference Sources/AmiExpress-Sources/express.e` instead.

## Next Steps
1) If modem emulation is needed again, re-enable throttle in `screen.handler.ts` with escape-aware chunking so ANSI/slowmo aren’t split.  
2) Re-test W menu in a live session: numbers should echo, no `(Pause)...` interception, option 17 visible and saves.  
3) Keep BBSTITLE slowmo at -3 unless the user requests retuning.  
