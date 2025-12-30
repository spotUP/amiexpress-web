# Handoff - 2025-12-31

## Current State
- Fix in progress: DOORS TypeScript door now queues and runs commands after door exit.
- Fix in progress: XIM prompt output now uses ANSI conversion path to avoid raw `[32m` sequences in AEHELP prompt.
- Open issue (from prior handoff): AquaScan 68K door stuck polling after BB_NONSTOPTEXT; see prior notes in `web/backend/src/amiga-emulation/xim/system-commands.ts` and logs.
- Livechat format picker now uses `position.*` updates instead of `left/top` setters; needs verification in UI.

## Recent Work
- User prompts: "summarize recent commits, read agents.md and claude.md and all recent markdown files"; "doors command can't start any doors"; "fix AEHELP ANSI prompt output"; "livechat door throws error when selecting text in the input prompt".
- Added `BBSApi.executeCommand()` to queue commands when in a door and execute via `handleCommand` otherwise (`web/backend/src/doors/BBSApi.ts`).
- Added `pendingDoorCommands` to `BBSSession` (`web/backend/src/index.ts`).
- Process queued commands after TypeScript door exit before menu display (`web/backend/src/handlers/door.handler.ts`).
- Route XIM JH_PM/JH_HK prompt output through `emitText` for ANSI conversion (`web/backend/src/amiga-emulation/xim/io.ts`).
- Updated livechat format picker positioning to use `position.*` fields and clear right/bottom (`Doors/livechat/ui/format-picker.ts`).

## Next Steps
- Verify DOORS door can launch another door (e.g., CHAT) and does not return to menu prematurely.
- Verify AEHELP prompt shows colored text (no raw `[32m`).
- If returning to AquaScan issue: run `npm run xim:analyze -- N` and verify BB_NONSTOPTEXT reply data per prior notes.
