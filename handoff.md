# Handoff
## Current State (2025-12-22)
- Manual menu renders now set `skipNextDisplayFlowMenu` plus a target state so the display-flow loop immediately returns instead of redrawing the menu, keeping the first post-door keystroke in `READ_COMMAND`.
- New BBSSession metadata fields hold the skip flag and desired destination state for the next display flow tick, allowing the flow controller to know when the menu already ran.
- Workspace still keeps the pre-existing `User.data`, `User.keys`, and `user.misc` diffs, which are part of the committed snapshot alongside the handler adjustments.

## Recent Work
- `web/backend/src/index.ts`: swapped the timestamp-based fields for the boolean/target-state metadata used by the skip logic.
- `web/backend/src/handlers/command-handler/menu.ts`: mark the manual menu display and record the planned follow-up substate so `advanceDisplayFlow` can skip when it re-checks `DISPLAY_MENU`.
- `web/backend/src/handlers/command.handler.ts`: added the skip-path guard in `advanceDisplayFlow`, so the automatic flow honors the manual render instead of printing the prompt twice.

## Next Steps
- Re-run FR/J (and optionally `Doors/arkanoid2`) and inspect `logs/backend.log` near `[DISPLAY FLOW] advance state=display_menu` to confirm only one prompt is emitted and the first keystroke immediately enters `READ_COMMAND`.
- If duplicate prompts persist, capture the backend log snippet to confirm the skip flag is being set and cleared; adjust the hook as needed so the manual display effectively preempts the automatic flow.
- Keep the repo clean so the newly committed handler changes plus the tracked data files stay aligned with `main`.

## Last Prompts
- User: "you need to fix the root cause not do workarounds"
