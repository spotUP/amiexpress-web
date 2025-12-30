# Handoff - 2025-12-29

## Current State
- **68K Door Debugging**: AquaScan stuck in polling loop after BB_NONSTOPTEXT

## Problem
AquaScan (conference file scanner) gets stuck after successful JH_REGISTER/ENVSTAT/BB_NONSTOPTEXT sequence. Door continuously polls `GetMsg(AEDoorPort2=0xa0200)` returning "No messages" instead of outputting scan results.

## Fixed
- **strPtr in JH_REGISTER reply**: `system-commands.ts:92-99` now sets strPtr/filler1/filler2 to embedded string buffer before ReplyMsg. Phantasm confirmed doors dereference msg->strptr and hang if NULL.

## Key Findings
1. **Message flow is one-way**: All XIM messages are door->backend. No backend->door proactive messages.
2. **Door polls wrong port**: After BB_NONSTOPTEXT, door polls AEDoorPort (0xa0200) not its reply port (0xa0300)
3. **Express.e pattern**: BBS only receives via GetMsg and replies via ReplyMsg - never sends proactively
4. **xim:analyze findings**: "GetMsg infinite loop" (95%) and "No JH_INIT received" (95% - false positive?)
5. **DoorMessageHandler**: `sendStartupMessage()` disabled with comment "doors start the conversation"

## CPU Trace Pattern (post BB_NONSTOPTEXT)
```
[ExecLibrary][FindPort] "AEDoorPort2" -> 0xa0200
[ExecLibrary] >>> GetMsg(port=0xa0200)
[ExecLibrary]   No messages in port
(repeats indefinitely)
```

## Hypothesis
Door expects something after BB_NONSTOPTEXT that we're not providing. Possibilities:
1. Reply needs specific data field set (not just strPtr)
2. Door waits for proactive message we don't send
3. ENVSTAT reply data (currently "8") is wrong

## Next Steps
1. Check ENVSTAT reply - express.e line 3876 sets `nonStopDisplayFlag` from `msg.data`, verify our reply data
2. Compare with QuickNew door log (completed successfully in 0.1s) - what's different?
3. Check if AquaScan uses different polling pattern than other doors
4. Examine `BB_NONSTOPTEXT` handler in `system-commands.ts` - verify reply format

## Debug Commands
```bash
npm run xim:analyze -- N          # Analyze AquaScan session
npm run xim:view -- N             # View message flow
npm run xim:flow -- N             # Bidirectional flow diagram
ls -t logs/door-68k-* | head -3   # Recent door logs
```

## Key Files
- `web/backend/src/amiga-emulation/xim/system-commands.ts` - XIM command handlers
- `web/backend/src/amiga-emulation/xim/bbs-info.ts` - BB_* command handlers
- `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` - Message handling
- `logs/door-68k-AquaScan_020-*.log` - AquaScan session logs
