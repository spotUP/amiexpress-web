# Handoff
## Current State (2025-12-22)
- After doors like FR/J exit, menu redraw now allows the next key to be handled immediately instead of dropping the first keystroke.
- `MESSAGE_TOTAL_LENGTH` matches the 0x108 SIZEOF `jhMessage`, so strptr/filler3 writes stay within bounds.
- MCP resources still unavailable via `list_mcp_resources` (returned empty).

- `web/backend/src/amiga-emulation/DoorTypes.ts`: set `MESSAGE_TOTAL_LENGTH` to 0x108 (SIZEOF jhMessage) so `strptr`/`filler3` are in-bounds.
- `web/backend/src/handlers/command.handler.ts`: when transitioning from `DISPLAY_MENU` to `READ_COMMAND`, the keystroke no longer returns early, so the character isn't swallowed by the redisplay.
- ROM resident scanning + InitResident handling in `web/backend/src/amiga-emulation/api/ExecLibrary.ts`; OpenLibrary checks ROM residents; forced-return on ROM init Alert.
- Library path/priority tweaks in `web/backend/src/amiga-emulation/LibraryManager.ts` and `web/backend/src/amiga-emulation/loader/LibraryLoader.ts`.
- XIM/AEDoor message flow fixes and DT_*/BB_* string buffer setup in `web/backend/src/amiga-emulation/xim/*.ts` and `web/backend/src/amiga-emulation/XIMProtocol.ts`.
- Door INIT/STAT message buffers distinct in `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`.

- Restart backend and re-run FR/J in the UI to confirm the menu prompt no longer redraws and that the first keystroke after the door is not swallowed.
- If extra prompts persist, capture the BBS logs/screens and compare to `handleCommand`’s flow to see whether `displayMainMenu` is still called twice.
- Confirm AROS ROM resident handling for non-AUTOINIT `dos.library`; decide on InitResident path.
- If MCP tools remain unavailable, rely on filesystem reads and note in changes.

## Last Prompts
- User: "i ran FR and J now they just exit"
