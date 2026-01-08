# Handoff

## Current State (2026-01-08)

### Neo-Blessed SDK - STABLE

**READ FIRST**: `Documentation/6-Progress/BLESSED_SDK_LIVECHAT_HANDOFF.md` for complete details.

**All 31 TypeScript doors build successfully.**

---

## 68K XIM State (2026-01-08)

### XIM Protocol - FULLY WORKING

**Status**: All tested XIM doors work correctly.

#### Fixes Applied
- INIT/STAT sent to pr_MsgPort (task port), not AEDoorPort1
- Added CLI_REQUIRED tooltype for doors needing pr_CLI set
- WHO door: pr_CLI=0 (BBS mode), exits with code 0
- AquaScan door: pr_CLI=non-zero (CLI_REQUIRED=YES), completes normally

#### Key Discoveries

**Port Architecture:**
- **AEDoorPort1** = BBS port where DOOR sends messages TO BBS
- **pr_MsgPort** = Task port where BBS sends startup messages TO DOOR

**pr_CLI Behavior:**
- Some doors (WHO) expect pr_CLI=0 for BBS mode detection
- Some doors (AquaScan) check pr_CLI and exit with code 10 if NULL
- Solution: CLI_REQUIRED=YES tooltype sets pr_CLI for doors that need it

#### Test Results
- WHO: pr_CLI=0, exits code 0, 1828 iterations
- AquaScan: pr_CLI=0x38000 (CLI_REQUIRED=YES), JH_SHUTDOWN, completes normally

#### Test Commands
```bash
# WHO (works with default pr_CLI=0)
npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/who/who 1

# AquaScan (needs CLI_REQUIRED=YES)
npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/AquaScan/AquaScan.000 1 --tooltypes '{"CLI_REQUIRED":"YES"}'
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
