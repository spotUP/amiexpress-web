# Handoff

## Current State (2026-01-08)

### Neo-Blessed SDK - STABLE

**READ FIRST**: `Documentation/6-Progress/BLESSED_SDK_LIVECHAT_HANDOFF.md` for complete details.

**All 31 TypeScript doors build successfully.**

---

## 68K Door State (2026-01-08)

### XIM Protocol - FULLY WORKING

**Status**: All tested XIM doors work correctly.

### SIM Door cli_DefaultStack - FIXED

**Bug**: SIM batch doors (ByteKillHandler, etc.) failed with exit code 20 without printing output.

**Root Cause**: cli_DefaultStack (CLI struct offset 0x34) was set in bytes but SAS/C startup expects it in longwords. Startup does `lsl.l #2` to convert longwords to bytes, causing overflow.

**Fix** (DoorLoader.ts line 405): Changed `writeCli32(0x34, this.stackSizeBytes)` to `writeCli32(0x34, this.stackSizeBytes >> 2)`.

**pr_CLI Behavior by Door Type:**
- **XIM doors**: pr_CLI=0 by default (BBS mode), CLI_REQUIRED=YES sets it
- **SIM doors**: pr_CLI always set to 0x28000 (CLI structure at 0xa0000) by DoorLoader

#### Test Results
- ByteKillHandler: pr_CLI=0x28000, prints banner, uses TIM/DoorControl protocol
- WHO (XIM): pr_CLI=0, exits code 0
- AquaScan (XIM): pr_CLI=0x28000 (CLI_REQUIRED=YES), completes normally

#### Test Commands
```bash
# SIM batch door
npx tsx web/backend/src/scripts/run-amiga-door.ts doors/bytekiller/Bytekillhandler 1 --doortype SIM

# XIM door
npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/who/who 1
```

---

## Previous Issues (All Resolved)

### Dynamic Task Allocation - RESOLVED
- Synthetic relocation in HunkLoader.ts for joincnf
- Dynamic task allocation via allocateDoorTask()
- pr_CLI handling based on door type and CLI_REQUIRED tooltype

### AquaScan Exit Code 10 - RESOLVED
- Root cause: Door checks pr_CLI at startup, exits if NULL
- Fix: CLI_REQUIRED=YES tooltype sets pr_CLI to valid pointer
