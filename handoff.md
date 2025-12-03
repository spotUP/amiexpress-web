# Handoff - Bulls XIM Door (2025-12-03 Session 31)

## CORRECTION - Bulls Binary is NOT Buggy

**Critical Learning**: Bulls binary is CORRECT - it works fine on real Amiga and in vamos.

## Previous Incorrect Approach (Session 30)

- Incorrectly diagnosed Bulls as having "buggy JSR instructions"
- Created patches to "fix" JSRs at 0x11ba and 0x11fe
- Committed these incorrect changes (906996dd)
- **This was WRONG** - the JSRs are correct, our emulator has a bug

## Correct Approach (Session 31)

1. **Reverted JSR patches** from DoorLoader.ts
2. **Added vamos/amitools reference to CLAUDE.md** - use these as ground truth for debugging
3. **Next**: Compare our emulator behavior to vamos to find the actual bug

## Bulls Status

- Bulls loads at CODE 0x1008
- Entry point: 0x1008
- Works correctly in vamos
- Crashes in our emulator at PC=0x0, iteration ~12,837
- Our emulator has a bug in how it loads or executes Bulls

## Next Steps

1. **Use vamos** to trace Bulls execution and compare to our emulator
2. **Fix emulator bug** - not Bulls binary
3. Check load addresses, relocations, JSR calculations in our emulator
4. Identify what our emulator does differently from vamos

## Files Changed (Session 31)

- `CLAUDE.md:570-595` - Added vamos/amitools debugging guidance
- `DoorLoader.ts:604-645` - Removed incorrect JSR patches
- `handoff.md` - This file (corrected understanding)

## Session Stats

Session 31 used 53K / 200K tokens (26.5%) - plenty of room for more work.
