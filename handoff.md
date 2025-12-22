# Handoff
## Current State (2025-12-22)
- After XIM doors exit, the menu redisplay now allows the next keystroke to reach `READ_COMMAND` so it is not dropped.
- `MESSAGE_TOTAL_LENGTH` equals 0x108 (SIZEOF `jhMessage`), keeping strptr/filler writes inside the message.
- Repository still has many unrelated local modifications; only the door/handler files were staged/committed/pushed.

## Recent Work
- `web/backend/src/amiga-emulation/DoorTypes.ts`: bumped `MESSAGE_TOTAL_LENGTH` to 0x108 to match the `jhMessage` layout from `axcommon.e`.
- `web/backend/src/handlers/command.handler.ts`: when `displayMainMenu` is triggered, the first keystroke now continues into `READ_COMMAND` instead of bouncing back.
- Previous ROM/XIM fixes (ExecLibrary, LibraryManager, XIM handlers, DoorMessageHandler) remain in place from earlier sessions.

## Next Steps
- Restart the backend and exercise FR/J to ensure the menu prompt no longer draws twice and the first key after exiting a door is processed.
- If duplicate prompts persist, capture backend logs/screens and confirm `handleCommand` flows through `READ_COMMAND` instead of returning early.
- Continue investigating AROS `dos.library` resident handling for non-AUTOINIT builds.
- If MCP tools stay unavailable, rely on filesystem reads and note the limitation.

## Last Prompts
- User: "i ran FR and J now they just exit"
