# Handoff - Bulls XIM Door Fix (2025-12-03 Session 29)

## MAJOR BREAKTHROUGH - SetSignal Implemented, Self-Modifying Code Discovered

**SUCCESS**: Bulls successfully sends JH_INIT and JH_STAT messages!
**DISCOVERY**: Bulls has self-modifying code - instruction at PC=0x11ba changes from 0x2e08 to 0x4eba during execution
**CURRENT PROBLEM**: Bulls crashes with "PC in low memory (0x0)" after calling modified code

## Progress Summary

**What Works**:
1. Bulls passes CLI argument strcmp check ✓
2. Bulls calls CreateMsgPort and creates reply port at 0xa0400 ✓
3. Bulls sends JH_INIT message (0x100200) to AEDoorPort1 ✓
4. Bulls sends JH_STAT message (0x100304) to AEDoorPort1 ✓
5. BBS successfully replies to both messages ✓
6. SetSignal (LVO -306) now implemented in ExecLibrary ✓

**What's Broken**:
- Bulls crashes at PC=0x11ba with self-modified instruction 0x4eba (JSR)
- JSR targets 0x3ae0 (valid Bulls code), but PC immediately goes to 0x0
- Stack corruption suspected (SP changes from 0x8e2c to 0x8e24)

## Technical Details

**Bulls Memory Layout**:
- Code segment: 0x1000-0x4b3f (19,228 bytes)
- Data segment: 0x5c00-0x8b5f (27,876 bytes)
- Entry point: 0x1008
- A4 value: 0x5c08 (hardcoded in setupBullsExecution)

**Self-Modifying Code Evidence**:
- File offset 0x11ba contains: 0x2e08 (move.l a0, d7)
- Memory at 0x11ba contains: 0x4eba (JSR) when crash occurs
- Watchpoint shows write to 0x1250 (code segment)
- Bulls likely patches itself after XIM initialization

**Crash Details**:
- PC before: 0x11ba (instruction: 0x4eba = JSR with PC-relative offset)
- PC after: 0x3ae0 (target of JSR, valid Bulls code at +0x2924 offset)
- Then PC → 0x0 (stack corruption)
- SP: 0x8e2c → 0x8e24 (8 bytes pushed, but JSR only pushes 4)

## Recent Changes

**SetSignal Implementation** (`ExecLibrary.ts:857-863`, `1483-1510`):
- Added LVO -306 trap handler
- Implements signal examination and modification
- Bulls uses this to clear signals after processing messages
- Not yet reached before crash, but needed for message loop

## Key Files

- `web/backend/src/amiga-emulation/DoorLoader.ts:505-603` - Bulls setup
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts:857-863, 1483-1510` - SetSignal
- `Documentation/4-Door-Developers/Bulls_DISASM_NOTES.md` - Disassembly notes

## Next Investigation

1. **Track self-modifying code**: When does Bulls write 0x4eba to address 0x11ba?
2. **Why JSR crashes**: Is 0x3ae0 the correct target? Check if Bulls expects different offset
3. **Stack corruption**: Why does SP change by 8 bytes instead of 4? What pushes the extra data?
4. **Alternative approach**: Can we prevent Bulls from self-modifying, or patch the modified code correctly?

## Context Usage

At ~85K tokens of 200K budget (42.5% used) - still plenty of room to continue debugging.
