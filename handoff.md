# Handoff (condensed)

## Latest (2025-12-02 - Session 5)
### SIM DOOR PORT IMPLEMENTATION - Partial Progress
**Changes Made:**

✅ **Port Creation Fixed** (LibraryManager.ts:125-161):
- Detects door type from config (default: SIM per express.e:4681)
- Creates `DoorControl{nodeId}` for SIM/SUP/TIM/IIM doors
- Creates `AEDoorPort{nodeId}` for XIM doors
- Per express.e:4316-4320 specification

✅ **Port Lookup Fixed** (AEDoorLibrary.ts:583-602):
- `findBbsPort()` now tries both port types
- Priority: DoorControl{n} → AEDoorPort{n} → DoorControl → AEDoorPort
- Supports both XIM and SIM door library calls

**Test Results - WHO Door:**
- ✅ DoorControl1 port created at 0xa0000
- ✅ DoorControl (simple) created at 0xa0100
- ❌ Still jumps to ROM at 0xf00080 - "PC out of code region"

**Root Cause Analysis:**
SIM doors need MORE than just port names. The issue is likely:
1. Different execution model (express.e:4346-4350 - no BBS message loop)
2. Different library function behavior for SIM vs XIM
3. Possibly different message structure or protocol

**Files Modified:**
- web/backend/src/amiga-emulation/LibraryManager.ts - Port creation logic
- web/backend/src/amiga-emulation/api/AEDoorLibrary.ts - Port lookup logic

**Next Steps:**
1. Research why SIM doors jump to ROM after port creation
2. Investigate AEDoor.library function differences for SIM doors
3. May need different message handling or execution flow
4. Consider disassembling WHO door to understand expectations

**Status**: Port infrastructure ready, but SIM doors still crash. Need deeper investigation.

## Previous (2025-12-01 - Session 4)
### COMPREHENSIVE DOOR TESTING - XIM vs SIM Analysis
**Test Results Summary:**

✅ **XIM Doors - WORKING:**
1. **GA (GetAnswer)** - 8.2KB utility door ✅ PERFECT
   - JH_REGISTER, JH_SM, JH_PM, clean execution
   - Displays output, prompts for input, searches nodes
2. **5D-Edit** - 26KB file editor ✅ PERFECT
   - JH_REGISTER, SV_NEWMSG, DT_* queries, JH_WRITE
   - Displays "No files available in this conference!"
   - JH_SHUTDOWN - clean exit

❌ **SIM Doors - FAILING (AEDoor.library interface):**
3. **WHO** - 14KB user list ❌ FAILS
   - Jumps to ROM at 0xf00080
   - "PC out of code region" termination
4. **WHAT** - 15KB utility ❌ TIMEOUT
5. **SizeCheck** - 17KB file counter ❌ TIMEOUT
6. **RTW** - 20KB game ❌ TIMEOUT

❌ **Bulls** - 68K XIM door ❌ FAILS
   - Runs through init, FreeMem, CloseLibrary
   - PC goes to 0x0 (stack corruption)
   - "PC in low memory" termination

### Key Findings:
- **XIM Protocol**: ✅ Fully working for generic XIM doors!
  - Message registration (JH_REGISTER)
  - Output (JH_WRITE, JH_SM)
  - Input (JH_PM)
  - Data queries (DT_*, BB_*, SV_*)
  - Clean shutdown (JH_SHUTDOWN)
  - ReplyMsg implementation correct
- **SIM Doors**: ❌ AEDoor.library interface needs work
  - WHO/RTW/SizeCheck/WHAT all use AEDoor.library
  - Different initialization pattern than XIM
  - Generic emulator doesn't handle SIM doors yet
- **Bulls Issue**: Stack corruption during cleanup
  - Not a generic XIM issue (GA and 5D-Edit work)
  - Bulls-specific initialization problem

### Files Examined:
- web/backend/src/amiga-emulation/xim/io.ts (XIM I/O handlers)
- web/backend/src/amiga-emulation/xim/messages.ts (Message parsing)
- web/backend/src/amiga-emulation/xim/types.ts (XIM protocol types)
- web/backend/src/amiga-emulation/api/ExecLibrary.ts (replyMsg implementation)
- web/backend/src/amiga-emulation/session/DoorMessageHandler.ts (Message handling)

## Previous (2025-12-01 - Session 3)
### REMOVED: All Bulls-Specific Code
- **User request**: "ChatGPT added the Bulls-specific stuff, I never asked for any Bulls-specific code"
- **Action**: Completely removed all Bulls-specific code, kept only generic door emulation
- **Deleted**: BullsDoorHandler.ts (2,585 lines of Bulls-specific hacks)
- **Removed from**:
  - AmigaDoorSession.ts - import, field, instantiation, all references
  - DoorLifecycleManager.ts - import, field, constructor, 6 Bulls methods
  - DoorMessageHandler.ts - import, field, constructor, all Bulls checks
- **Preserved Generic Logic**:
  - `door-info.util.ts` - populateDoorInfoStructs() for ALL doors
  - DoorMessageHandler - sendStartupMessage() now generic for all XIM doors
  - INIT/STAT message sending is standard XIM protocol, not Bulls-specific
- **Build Status**: ✅ Zero TypeScript errors, fully generic emulator

### ENHANCED: 68K Door Logging (AmiExpress Format)
- **User request**: "Check that we log 68k doors properly, the amiexpress coder sent me this to show how he logs them"
- **Action**: Updated logging to match original AmiExpress express.e format exactly
- **New Format** (matches express.e):
  ```
  msg request: 1 (JH_REGISTER)
  data: 2
  string:
  ```
- **Features**:
  - Command number with name lookup from XIMCommand enum
  - Matches Bulls door log from real Amiga BBS
  - Clean format (no `[DoorMessageHandler]` prefix for message logs)
  - All 40+ XIM command names supported
- **File Modified**: web/backend/src/amiga-emulation/session/DoorMessageHandler.ts
  - Added `getCommandName()` helper function
  - Updated `handleDoorMessage()` logging format

## Previous (2025-12-01 - Session 2)
### FIXED: Bulls Interference with All Doors
- **Problem**: BullsDoorHandler.monitorPc() was seeding D0/D7 registers for ALL doors, not just Bulls
- **Root Cause**: DoorLifecycleManager.ts:745 called bullsHandler.monitorPc() without isBullsDoor() check
- **Fix Applied**: Added `&& this.bullsHandler.isBullsDoor()` checks at lines 745 and 504
- **Files Modified**:
  - web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts (2 locations)
- **Status**: ✅ RESOLVED - GA door now runs without Bulls interference

### GA Door Test Results (WITHOUT Bulls Interference)
- ✅ **Initialization succeeds**: Libraries opened, ports created, messages sent
- ✅ **No Bulls register seeding**: "Seeded D0/D7" messages gone
- ✅ **FindPort("AEDoorPort") succeeds**: Port found at 0xa0100
- ✅ **PutMsg() sends startup message**: Message queued successfully
- ❌ **Door enters infinite polling loop**: WaitPort() called 637 times
- ❌ **Never produces output or exits**: /tmp/ga.out remains empty
- **Failure mode**: Polling loop (NOT ROM jump like Bulls)

### Comparison: GA vs Bulls Failure Modes
**Bulls**: Jumps to ROM (0xf00080) after init error → suggests stack corruption
**GA**: Infinite WaitPort polling loop → suggests message/reply not arriving
**Pattern**: Different symptoms, may have different root causes

## Previous Session (2025-12-01 - Session 1)
- Prompt: "it's extremely important that we don't make this customized for the bulls door"
- User emphasized: Need GENERIC solution for ALL AmiExpress 68K doors (hundreds exist)
- Removed Bulls-specific PC forcing hack (lines 1394-1413 in BullsDoorHandler.ts)
- Identified root cause: **Stack corruption during door initialization**
- Bulls reaches PC=0x11ba with D0=0xffff (error), then RTS at 0x11cc returns to 0xf00080 (ROM) instead of 0x1ff000 (exit trap)

## Current Focus
- **Generic Issue**: Doors overwrite stack during initialization, corrupting return addresses
- DoorLoader sets up exit trap at 0x1ff000 with valid return addresses
- But doors jump to ROM (0xf00080) instead, indicating stack corruption
- Need to fix stack management generically for ALL doors, not just Bulls

## Test Door Priority (Simple → Complex)
**Simple doors for initial testing:**
1. **GA (GetAnswer)** - User recommended as "nice door to test with"
2. **ED (5D-Edit)** - 25.7 KB, file editor
3. **SIZE (Counting Files)** - 16.9 KB, file counter
4. **WHAT** - 15.1 KB, simple utility

**Complex doors for validation:**
5. **Bulls** - 68K XIM door, complex initialization
6. **WHO** - User list display
7. **RTW** - Game door

## Analysis of Bulls Natural Execution (Without Hacks)
Bulls execution flow WITHOUT forcing:
1. Starts at entry point, sets up A4 data segment base
2. Creates 5 message ports (CreateMsgPort called 5x)
3. Executes init loop at 0x1140-0x116e (natural D7 countdown)
4. Reaches PC=0x11ba (within string length function)
5. D0=0xffff (error code - initialization failed!)
6. Function returns via RTS at 0x11cc
7. **Jumps to ROM at 0xf00080 instead of exit trap at 0x1ff000**

## Stack Setup by DoorLoader
```
exitTrapAddress = 0x1ff000 (contains RTS instruction 0x4e75)

Stack frame (at stackTop):
  frameBase+0:    0x1ff000  // top-of-stack return
  frameBase-4:    0x1ff000  // stack return
  frameBase-24:   0x1ff000  // exit jump (RTS trap)

Initial SP: stackTop - 8 (0x8e6c for Bulls)
Stack base: 0x6e74, size: 8192 bytes
```

All return addresses point to exit trap, but Bulls returns to 0xf00080 (ROM).
**Hypothesis**: Stack corrupted during init, overwriting return addresses.

## Root Cause Analysis
1. **Messages ARE sent correctly** - JH_INIT and JH_STAT queued to ports
2. **Bulls never calls WaitPort** - crashes before reaching message handling
3. **D0=0xffff indicates error** - Bulls detected initialization failure
4. **Return address corrupted** - Should be 0x1ff000, actually 0xf00080

**Why D0=0xffff?** Likely causes:
- Expected data structure not populated (DoorInfo, NodeStatus, etc.)
- Port/library base pointers invalid
- CLI structure incomplete
- Missing messages (but we send them - Bulls just crashes first)

## Disassembly Context (Bulls @ 0x11ba)
```asm
0x11aa: movem.l d7/a5, -(a7)    ; Save registers to stack
0x11ae: movea.l a0, a5
0x11b0: movea.l a5, a0
0x11b2: tst.b (a0)+             ; String length loop
0x11b4: bne.b 0x11b2
0x11b6: subq.l #1, a0
0x11b8: suba.l a5, a0
0x11ba: move.l a0, d7           ; <-- Bulls is HERE
0x11bc: moveq #0xa, d0
0x11be: cmp.b -0x1(a5,d7.l), d0
0x11c2: bne.b 0x11c8
0x11c4: clr.b -0x1(a5,d7.l)
0x11c8: movem.l (a7)+, d7/a5    ; Restore registers from stack
0x11cc: rts                      ; RETURN - pops address from stack
                                 ; Should return to 0x1ff000
                                 ; Actually returns to 0xf00080 (ROM)
```

## Next Steps
1. **Confirm stack corruption hypothesis**:
   - Add instrumentation to log SP and stack contents at PC=0x11ba
   - Check what's actually on the stack when RTS executes
   - Verify if return address is 0xf00080 or something else

2. **Identify where stack gets corrupted**:
   - Trace Bulls execution from start to 0x11ba
   - Log all stack writes (SP modifications, PUSH operations)
   - Find which code overwrites the return addresses

3. **Implement generic fix**:
   - Protect stack return addresses from corruption
   - OR fix the code that's corrupting the stack
   - OR ensure return addresses are restored before RTS
   - Must work for ALL doors, not just Bulls

4. **Test with simple doors first**:
   - GA (GetAnswer) - simpler than Bulls
   - ED, SIZE, WHAT - even simpler utilities
   - If they work, validates generic solution
   - Then test complex doors: Bulls, WHO, RTW

## Key Insight from User
**"it's extremely important that we don't make this customized for the bulls door, it needs to be able to run all amiexpress 68k doors, there are hundreds"**

This means:
- NO Bulls-specific hacks or forcing logic
- Fix the UNDERLYING issue that affects all doors
- Test with MULTIPLE doors to ensure genericity
- Focus on standard Amiga/AmiExpress door patterns

## Tooling/Commands
- Build: `cd web/backend && npx tsc -p tsconfig.json`
- Test Bulls: `cd /Users/spot/Code/amiexpress-web && BBS_DATA_DIR=/Users/spot/Code/amiexpress-web AEDOOR_STDOUT=/tmp/bulls.out AEDOOR_ROM=kickstart node web/backend/dist/scripts/run-amiga-door.js Doors/emp_tools/Bulls 1`
- Test GA: Replace `Bulls` with path to GA door
- Disassemble: `r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0xADDR; pd NN" /path/to/door`
- Logs: `logs/door-68k.log`, `/tmp/bulls.out`
- References: `Documentation/4-Door-Developers/Bulls_DISASM_NOTES.md`, express.e via MCP

## Key Files Modified
- web/backend/src/amiga-emulation/session/BullsDoorHandler.ts (lines 1394-1413)
  * Disabled Bulls-specific PC forcing hack (commented out)
  * Now Bulls executes naturally to reveal the real generic issue
