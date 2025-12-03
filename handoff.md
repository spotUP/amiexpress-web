# Handoff - Bulls XIM Door (2025-12-03 Session 31)

## CORRECTION - Bulls Binary is NOT Buggy

**Critical Learning**: Bulls binary is CORRECT - it works fine on real Amiga and in vamos.

## Session 31 Progress

1. **Reverted incorrect JSR patches** from DoorLoader.ts
2. **Added vamos/amitools reference to CLAUDE.md** - use these as ground truth
3. **Investigated actual crash cause** - traced Bulls execution

## Current Finding - Library Return Handling

Bulls crashes after AllocMem() returns. Investigation shows:

- AllocMem return address (0x1128) is correctly read from stack
- PC is correctly set to 0x1128 after AllocMem returns
- Instruction at 0x1128: `adda.w 0x168, a7` (adjust stack)
- Next instruction at 0x112c: `rts` (return from function)

**Problem**: After AllocMem returns to 0x1128, PC somehow jumps back to 0xff3a
(AllocMem vector) at iteration 12779, then crashes at PC=0x0.

## Next Steps

1. **Trace stack state** after AllocMem - what's on stack when RTS at 0x112c executes?
2. **Compare with vamos** - how does vamos handle this execution flow?
3. **Check RTS handling** - is MOIRA correctly popping return address from stack?
4. **Verify SP updates** - track SP through adda.w instruction

## Files Changed (Session 31)

- `CLAUDE.md:570-595` - Added vamos/amitools debugging guidance
- `DoorLoader.ts:604-645` - Removed incorrect JSR patches
- `handoff.md` - This file

## Session Stats

Session 31 used 77K / 200K tokens (38.5%) - good progress, room for more work.
