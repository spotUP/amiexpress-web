# Handoff
## Current State (2025-12-22)
- Door exits now emit a manual menu display that records the resulting read state, and `advanceDisplayFlow` skips any redisplay within a short window so the prompt only appears once and the first keystroke goes into `READ_COMMAND`.
- Session objects carry the target `LoggedOnSubState` and timestamp of the most recent manual menu render, giving the display flow enough context to avoid redundant prompts after TypeScript/Amiga doors.
- Local workspace still contains the pre-existing `User.data`, `User.keys`, and `user.misc` edits; those are being committed alongside the new handler changes per the latest request.

## Recent Work
- `web/backend/src/index.ts`: extended `BBSSession` with `skipNextDisplayFlowMenuState` and `manualMenuDisplayTimestamp` so the manual menu display can communicate its post-menu state to the display flow.
- `web/backend/src/handlers/command-handler/menu.ts`: after rendering the menu/prompt, capture the new read-mode substate and timestamp; this feeds the display-flow skip logic.
- `web/backend/src/handlers/command.handler.ts`: introduced a short skip window plus conditional logic in `advanceDisplayFlow` so it short-circuits the `DISPLAY_MENU` branch when a recent manual render already ran.

## Next Steps
- Re-run FR/J (and optionally `Doors/arkanoid2`) to confirm the menu prompt only prints once and the first key after the door exit reaches `READ_COMMAND`; inspect `logs/backend.log` around `[DISPLAY FLOW] advance state=display_menu` for confirmation.
- If duplicate prompts persist, capture the backend log snippet and verify the skip window is firing; extend the window if the repetition occurs outside the current threshold.
- Ensure the repository is clean after the commit/push so the newly tracked binaries and handler changes have been recorded.

## Last Prompts
- User: "commit ALL local changes in logical chunks and push"
