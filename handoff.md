# Handoff - Bulls XIM Door (2025-12-03 Session 31)

## MAJOR FINDING - Prefetch Queue Bug

**Root Cause Identified**: Library function returns don't call `refillPrefetch()` after setting PC!

##Summary Session 31 discovered that when library functions return by setting PC to return address,
the MOIRA prefetch queue contains stale instructions from the library vector address.

## The Bug

In LibraryTraps.ts, after calling library functions like AllocMem(), we:
1. Read return address from stack
2. Set PC to return address: `this.emulator.setRegister(16, returnAddr)`
3. **BUG**: Don't call `this.emulator.refillPrefetch()`!

Without refillPrefetch(), MOIRA's Instruction Register (IRD) has wrong opcodes.

## Fix Applied

Added `this.emulator.refillPrefetch()` after every `setRegister(16, ...)` call in LibraryTraps.ts:
- Line 1656: Supervisor() function
- Line 2805: Unimplemented exec function RTS
- Line 2827: Unimplemented DOS function RTS
- Line 3078: Normal library return (main fix)
- Line 3262: AEDoor library return

## Current Status

Fix applied but Bulls still crashes. refillPrefetch() IS being called, but IRD still shows
wrong opcode (0x4cdf instead of 0xdefc). Need to investigate:
- Is refillPrefetch() working in WASM MOIRA module?
- Is memory at 0x1128 actually corrupted?

## Files Changed

- `LibraryTraps.ts` - Added refillPrefetch() calls (5 locations)
- `MoiraEmulator.ts:426` - Added logging to refillPrefetch()

## Next Steps

1. Check if memory at 0x1128 is corrupted
2. Verify refillPrefetch() in WASM module works correctly
3. May need to rebuild MOIRA WASM with refillPrefetch() support

## Session Stats

Session 31: 102K / 200K tokens (51%) - excellent progress on root cause analysis!
