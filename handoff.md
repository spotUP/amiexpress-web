# Handoff: CP Listan Door - RNG Still Not Working

## Achievement
First working native 68020 assembly door for AmiExpress-Web. Door compiles, runs, outputs text correctly.

## Problem
Random number generator always produces same result - door shows same string every time.

## What Works
- Door compiles with vasm (`vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68020`)
- Uses correct trapped AEDoor LVOs: CreateComm(-30), DeleteComm(-36), WriteStr(-84)
- 999 strings embedded with offset table (handles >32KB PC-relative limit)
- Header displays, door exits cleanly

## RNG Approaches Tried (All Failed)

| Approach | Why Failed |
|----------|------------|
| dos.library DateStamp() | Not working in emulator |
| Hardware regs ($DFF006, CIA) | Not emulated |
| ExecBase counters | Always same values |
| Memory write to 0x100 | Exception vector area, overwritten |
| Memory write to 0x400 | Written once at ExecLibrary init, not per-door |
| D3 register from DoorLoader | Still produces same output |

## Current Implementation

**DoorLoader.ts:294-296** sets D3:
```typescript
const randomSeed = (Date.now() & 0xFFFFFFFF) ^ ((Math.random() * 0xFFFFFFFF) >>> 0);
this.emulator.setRegister(3, randomSeed); // D3 = random seed
```

**cplistan.asm start** (current):
```asm
start:
        lea     data_start(pc),a4
        or.l    #1,d3                   ; D3 from DoorLoader
        move.l  d3,lfsr_state-data_start(a4)
        movem.l d0-d7/a0-a6,-(sp)
```

## Likely Root Cause
D3 is being reset between `setRegister(3, seed)` call and actual CPU execution at entry point 0x2008. Need to trace exact register state.

## Files
- `sdk/68k/doors/cplistan/cplistan.asm` - Source
- `Doors/CPLISTAN/cplistan` - Binary
- `Commands/BBSCmd/CP.info` - Command
- `web/backend/src/amiga-emulation/DoorLoader.ts` - Sets D3 at line 296

## Next Steps
1. Add debug logging to see D3 value at exact first instruction execution
2. Check if emulator.run() or refillPrefetch() resets registers
3. Alternative: Pass seed in argument string (guaranteed to reach door via A0)
4. Alternative: Use XIM protocol to query BBS for timestamp
