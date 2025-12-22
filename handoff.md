# Handoff
## Current State (2025-12-22)
- `ExecLibrary.openLibraryHybrid()` now searches Kickstart/AROS residents before disk-loaded natives so `InitResident` fires for non-AUTOINIT modules exactly like the original AmiExpress flow.
- `ClientDoorBridge.endSession()` cleans up `inDoorManager`/`doorInputHandler` and sets `subState=DISPLAY_MENU`, allowing hybrid doors (e.g., Arkanoid2) to return to the menu instead of hanging on the “Thanks for playing” screen.
- `npx tsc --noEmit` still fails with the longstanding `src/doors/amigaDoorManager.ts` issues (string/Buffer and nullable assignment warnings) that predate these changes.

## Recent Work
- Reordered native library opening so Kickstart residents gate `InitResident`, logging when a non-AUTOINIT trap is queued while preserving stub fallbacks for missing binaries.
- Taught `ClientDoorBridge` to reset `subState`, drop the bridge input handler, and keep the menu pause flag in sync so hybrid client doors like Arkanoid2 drop back to the main menu after printing their exit banner.
- Verified `npx tsc --noEmit` (still stops on the existing `amigaDoorManager.ts` complaints).

## Next Steps
- Re-run FR/J (and Arkanoid2 since it was previously blocked) to sanity-check that the INIT/STAT handshake is delivered and the front-end returns to the menu (watch `logs/backend.log` plus the door-specific logs for any lingering `GetMsg` spins or missing `door:status` events).
- Address the pre-existing `amigaDoorManager.ts` type errors if a clean `npx tsc --noEmit` becomes a gate for release validation.

## Last Prompts
- User: “you need to fix the root cause not do workarounds”
- User: “are we using the real amiga kickstart and load libraries directly from the kickstart now? this is the root cause of the issues, doors stopped working since we did that change”
