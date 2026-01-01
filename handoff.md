# Handoff - 2026-01-01

## Current State
- **Operator Chat Parity:** Refactored chat to match `AmiExpress-Sources/express.e` strictly.
    - **Layout:** Linear scrolling (lines 1-23) with fixed input/button line (24).
    - **Logic:** Implemented "Double Enter" convention. Bot waits for human signal.
    - **AI:** Bot is faster, concise, and tagged with `[AI]`/`[RB]`.
- **AquaScan / N S U Fixed:**
    - **Scanning:** `confScan` loop now correctly joins each conference (silent join) to sync environment/node files before running the door.
    - **Timezone:** Fixed `DateStamp`/`Examine` in `dos.library` to use UTC consistently, preventing "0 files found" due to local/UTC mismatch.
    - **Environment:** Implemented `ENVSTAT` XIM command.
- **QuickNew Fixed:**
    - **Redirection:** Implemented `SelectInput`/`SelectOutput` and fixed `Output()` to return redirected file handles. `QuickNew` now correctly writes to `screens:quicknew.txt`.
    - **Output Analysis:** The "Date/Time swap" in QuickNew output is an internal quirk of the door's display logic, likely using the Time buffer for the Date label. `DateToStr` emulation is correct.
- **Configuration Comparison:**
    - `n.info`: Local version has `ARGS=NEWSCAN`, Sanctuary reference does not. However, `AmigaDoorSession` ignores `ARGS` for XIM doors (matching `express.e`), so this is benign.
    - `Node0.info`: Both Local and Sanctuary reference lack `EXEC_QUICKNEW` tooltype. To enable QuickNew at login, users must add `EXEC_QUICKNEW` to `Node0.info`.

## Recent Work
- Modified `web/backend/src/handlers/operator-chat.handler.ts` for linear layout.
- Modified `web/backend/src/handlers/message/message-scan.handler.ts` to fix the scan loop.
- Modified `web/backend/src/amiga-emulation/api/DosLibrary.ts` to fix Timezone and IO Redirection.
- Modified `web/backend/src/amiga-emulation/api/library-vectors/dos-vectors.ts` to add `SelectInput`/`SelectOutput`.
- Modified `web/backend/src/amiga-emulation/xim/bbs-info.ts` to implement `ENVSTAT`.

## Next Steps
1. **Restart Server:** Essential to apply the core emulation changes (`DosLibrary.ts` updates).
2. **Verify N S U:** Run the `N` command. It should now find files if they exist (timestamps are now consistent).
3. **Verify QuickNew:** Check `screens:quicknew.txt` content.
4. **Login Flow:** If QuickNew is desired at login, add `EXEC_QUICKNEW` to `Node0.info`.
