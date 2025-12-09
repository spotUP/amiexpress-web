# Handoff

## Current State (2025-12-09)

### Session 30: RTW Door Early Exit Analysis + Bulls XIM Log

**RTW Door Investigation** (IN PROGRESS):
- RTW exits with code 20 after only 754 iterations WITHOUT calling FindPort
- vamos shows RTW DOES call FindPort (returns 0), then AllocSignal, then "Couldn't create reply port"
- Our emulator: RTW opens dos/intuition successfully, then exits immediately
- Library call sequence observed: StackSwap -> SetSignal -> OpenLibrary(dos) -> AllocMem -> Output -> Input -> Open -> AllocMem -> OpenLibrary(intuition) -> StackSwap -> Close -> FreeMem -> FreeMem -> CloseLibrary
- Key difference: RTW never reaches FindPort call in our emulator
- Root cause TBD: Something in RTW's early initialization loop fails, causing it to bail before XIM setup

**New Resource: Bulls XIM Log** (`Documentation/7-Reference Sources/bulls.log`):
- Real Amiga XIM protocol trace captured!
- Shows door initialization sequence:
  1. JH_REGISTER (1) with data=2 (node+1?)
  2. RAWARROW (501) data=0 - disable raw keyboard
  3. SV_NEWMSG (177) - set status "Bulls 2.2"
  4. DT_NAME (100) - get username, returns "REBEL"
  5. DT_LINELENGTH (122) - get screen height "29"
  6. BB_MAINLINE (131) - read command line "EB"
  7. EXPRESS_VERSION (152) - get version "v5.3"
  8. BB_CONFNUM (510) - get conference number
  9. BB_NONSTOPTEXT (525) - set nonstop mode
  10. JH_SM (4) - print text (ASCII art output)

**Next Steps:**
1. Test Bulls door in our emulator and compare XIM sequence
2. Fix XIM message handlers based on Bulls log data field meanings
3. Return to RTW once Bulls works (similar XIM protocol)

## Key Files
- RTW binary: `doors/RTW/RTW` (20964 bytes, 4 segments)
- Bulls log: `Documentation/7-Reference Sources/bulls.log`
- XIM handler: `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`
- Door lifecycle: `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`

## Metrics
- handoff.md: 1.8KB (under 5KB limit)
- TypeScript errors: 0
