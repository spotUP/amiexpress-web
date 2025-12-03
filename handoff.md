# Handoff - 68K Door Emulation Fixed (Session 33)

## Status: All 68K XIM Doors Working

Bulls and all tested XIM doors now exit cleanly. Two bugs were fixed:

### Bug 1: Buffer Zeroing Overlapped Function Pointers
- `setupBullsExecution()` zeroed 200 bytes at A4+0x510, overlapping function pointers at A4+0x5bc
- **Fix**: Reduced to 172 bytes (DoorLoader.ts:601-608)

### Bug 2: Stack Placed Inside DATA Region (Fixed Session 33)
- Stack was hardcoded at 0x6e74, but startup code zeros memory up to ~0xc8f0
- Our exit trap at stack top was zeroed, causing RTS to jump to PC=0x0
- **Fix**: Place stack dynamically AFTER DATA segment like vamos does (DoorLoader.ts:114-119)
- Vamos reference: `vamos -l proc:info` shows stack placed after all segments

## Key Changes

**DoorLoader.ts:114-119**:
```typescript
const dataEnd = dataSegment ? dataSegment.address + dataSegment.data.length : 0x10000;
this.stackBaseAddr = ((dataEnd + 32) + 7) & ~7;
```

## Test Results

- Bulls: 18826 iterations, exit code 0 (was crashing at ~5200)
- who: 838 iterations, exit code 20
- GetAnswer: 555 iterations, exit code 20

## Key Files

- `web/backend/src/amiga-emulation/DoorLoader.ts` - Stack and buffer fixes
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` - Execution loop
