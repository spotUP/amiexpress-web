# Handoff - 2026-01-01

## Current State
- Fixed LiveChat Command Picker:
    - Made it full-width and responsive.
    - Corrected the "ghost preview" vertical alignment: moved `ghostText` down one row to align with the input field content (`bottom: STATUS_HEIGHT + 1`).
- Fixed BBS prompt redraw issue: Removed redundant `displayMainMenu()` call in `command.handler.ts`.
- Fixed LiveChat quit issue: `cleanup()` now handles socket listener removal and guarded `room:leave`.
- Fixed SDK dialog transparency: Standardized opaque backgrounds for modals.
- Fixed LiveChat Format Picker layout: Refactored to `Panel` and implemented `makeModalResponsive`.
- AquaScan 68020 version: Fixed by enabling 68020 CPU model in MOIRA.

## Recent Work
- Modified `Doors/livechat/app.ts` to fix ghost text positioning.
- Rebuilt LiveChat door.

## Next Steps
1. Verify ghost text alignment in the command picker.
2. Resume AquaScan N/S/U debugging.
