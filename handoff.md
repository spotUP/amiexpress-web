# Handoff

## Current State (2026-01-09)

### AquaScan/FR Door - FIX APPLIED (testing)

**Root Cause Found**: Stuck loop detection was killing door after 5 repeated jumps to FindToolType (0xcffd0). Door was reading multiple tooltypes (normal behavior) but loop detector thought it was stuck.

**Fix Applied** (`DoorLifecycleManager.ts`):
- Added library trap address exception to stuck loop detection
- Jumps to 0x7ff00-0x80000 (exec), 0xaff00-0xb0000 (dos), 0xcff00-0xd0000 (icon), 0xeff00-0xf0000 (utility) now excluded
- Counter resets when library trap is hit (normal behavior)

**Also Fixed**:
1. `XIMProtocol.ts`: Unknown commands return 1 (was 0)
2. `DoorMessageHandler.ts`: BB_MAINLINE/EXPRESS_VERSION per express.e

**Test**: Run FR command - door should now complete library calls and produce output.

---

## Previous State (Still Valid)

### Neo-Blessed SDK - STABLE
All 31 TypeScript doors build.

### 68K XIM/SIM Doors - WORKING
- cli_DefaultStack fixed (longwords not bytes)
- pr_CLI behavior: XIM=0, SIM=0x28000, CLI_REQUIRED=YES overrides
