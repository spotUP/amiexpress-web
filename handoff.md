# Handoff - 68K Door Emulation Complete (Session 34)

## Status: All 68K Doors Working

All tested 68K doors exit cleanly after fixes in Sessions 32-34.

## Bugs Fixed

### Bug 1: Buffer Zeroing Overlapped Pointers (Session 32)
- Fix: Reduced zeroing from 200 to 172 bytes (DoorLoader.ts:601-608)

### Bug 2: Stack Inside DATA Region (Session 33)
- Fix: Place stack AFTER DATA segment like vamos (DoorLoader.ts:114-119)

### Bug 3: CODE-Only Programs (Session 34)
- mtop/QuickNew are CODE-only (no DATA segment), causing fallback to wrong address
- Fix: Place stack after CODE segment when no DATA (DoorLoader.ts:116-117)

### Bug 4: SP Corruption False Positive (Session 34)
- Programs like mtop allocate own stack via AllocMem (starts at 0x100000)
- SP threshold was 0x100000, triggering false corruption detection
- Fix: Increased threshold to 0x800000 (DoorLifecycleManager.ts:1154)

## Test Results (All Pass)

| Door | Iterations | Exit |
|------|------------|------|
| who | 838 | 20 |
| GetAnswer | 555 | 20 |
| ByteKiller | 4014 | 0 |
| Bulls | 18826 | 0 |
| 5D-Edit | 23043 | 0 |
| mtop | 947 | 0 |
| QuickNew | 73 | 0 |

## Key Files

- `web/backend/src/amiga-emulation/DoorLoader.ts` - Stack placement
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` - SP threshold
- `dev/scripts/validate-door-against-vamos.sh` - Validation script
