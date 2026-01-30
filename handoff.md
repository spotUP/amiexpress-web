# Handoff - 2026-01-30

## Current Session: MRC Investigation (Deferred)

### Status: Input Works But Complex Timing Issue

MRC door investigation revealed input IS working, but door has 30-second polling intervals.

**What Was Fixed:**
1. GETKEY/JH_CK (cmd 500) - now only peeks at inputQueue, doesn't consume
2. Fixed duplicate switch case bug: JH_CK matched before GETKEY (both = 500)
3. handleCheckKey() now matches express.e:3811-3813 behavior

**What Works:**
- Input queued correctly (XIMProtocol.queueInput → XIMIOHandler.inputQueue)
- GETKEY returns "1" when input available, "0" when not
- JH_HK consumes input and delivers to door
- MRC displays received characters

**Remaining Issue:**
- MRC polls GETKEY every ~30 seconds (network timeout in door)
- This is MRC's behavior, not our XIM bug
- Needs deeper investigation into MRC's network handling

**Debug Logging Added (can remove later):**
- XIMProtocol.queueInput
- XIMIOHandler.queueInput
- XIMIOHandler.handleCheckKey
- XIMIOHandler.handleFetchKey

### Doors to Test Next

- **ctop** - Conference top
- **nuke** - Bossnuke
- **TList** - T-List file lister
- **MRCSTAT1/mrcstat2** - MRC statistics

### Memory
- `server-restart-rules.md` - Claude should NEVER restart servers
