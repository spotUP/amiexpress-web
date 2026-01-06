# Handoff
## Current State (2026-01-06)
- Fixed missing door runner script path: `web/backend/src/scripts/run-amiga-door.ts` added so batch scheduler no longer crashes with ERR_MODULE_NOT_FOUND.
- Batch login now completes (sysop login seen in backend log), but automated telnet still isn't hitting main menu reliably.
- Attempted standalone `npx tsx web/backend/src/scripts/run-amiga-door.ts` for JoinCnf; it stalled polling AEDoorPort (no messages), so it’s not yet a good replacement for BBS run.
- J still crashes after BB_CONFNUM reply; backend shows PC jumping out of code region and A4=0, A5=0x100038, stack has 0x2002ec.

## Recent Work
- Added `web/backend/src/scripts/run-amiga-door.ts` (TSX runner) and updated it to pass node id as first door arg.
- Restarted backend with PC probe env and attempted to automate telnet login; log shows sysop login on node 7 but no menu prompt capture yet.
- Read `Documentation/4-Door-Developers/archive/AEDoor_LIBRARY_NOTES.md` and `Documentation/7-Reference Sources/disasm/aedoor_library_disasm.asm` for AEDoor A4 usage.
- Added logging when A4 becomes zero in `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts` (should fire near crash).

## Notes
- BatchScheduler error fixed (missing `run-amiga-door.ts` under `web/backend/src/scripts`).
- Standalone runner still sees no AEDoorPort messages, so use BBS run for JoinCnf traces.

## Next Steps
- Run J from BBS with `DOOR_PC_PROBE_RANGES=0x200240-0x200280` to capture AEDoor A4/D0 context.
- Confirm JoinCnf crash path after BB_CONFNUM using backend log (PC jump out of code region / stack corruption).
- If needed, add more targeted PC probes or watchpoint logging for AEDoor init sequence.

## Last Prompts
- “proceed”
