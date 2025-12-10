# Handoff

## Current State (2025-12-10)

### Session 31: Bulls XIM Door Working

**Bulls Door Status: WORKING**
- Bulls XIM door successfully produces output:
  - `$VER: Bulls 2.2  [/X DOOR]  (07-01-94) - (c)1994: EMPiRE/MYSTiC`
  - `Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx`
- Exits cleanly with return code 0
- All library traps firing correctly (AllocMem, FindTask, OpenLibrary, etc.)

**Debugging Session Findings:**
1. **Address Mapping**: radare2 file addr + 0xFE4 = memory addr (CODE loads at 0x1008, file offset 0x24)
2. **Bulls execution flow**: Entry 0x1008 -> BSS clear loop (~12768 iters) -> library init -> XIM output -> exit
3. All AllocMem calls succeeding with valid addresses (0x100000+)
4. Previous session fixes (signal reset, door type detection) are working

**RTW Door** (still to investigate):
- RTW exits with code 20 after only 754 iterations WITHOUT calling FindPort
- vamos shows RTW DOES call FindPort, then AllocSignal, then "Couldn't create reply port"
- Key difference: RTW never reaches FindPort call in our emulator
- Root cause TBD

## Key Files
- Bulls binary: `doors/EmP_Tools/Bulls` (21828 bytes, 2 segments: CODE at 0x1008, DATA at 0x5c08)
- RTW binary: `doors/RTW/RTW` (20964 bytes, 4 segments)
- XIM handler: `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`
- Door lifecycle: `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`

## Metrics
- handoff.md: 1.5KB (under 5KB limit)
- TypeScript errors: 0
