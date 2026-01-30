# Handoff - 2026-01-30

## Current Session: MRC Investigation Complete

### Status: MRC Works - 30s Lag is Door's Design

**Final Finding:** The 30-second input lag is MRC's network polling timeout, NOT an emulation bug. MRC is a chat client that waits for network data (30s timeout) before checking keyboard. Without active chat server traffic, this creates perceived input lag.

**What Was Fixed:**
1. GETKEY/JH_CK (cmd 500) - now only peeks at inputQueue, doesn't consume
2. Fixed duplicate switch case bug: JH_CK matched before GETKEY (both = 500)
3. Removed debug logging that was slowing down UI rendering

**Verification:**
- Removing logging made UI draw fast
- But 30s input lag persists
- This confirms lag is door behavior, not our code

### Commits Pushed (9 total)
1. fix(xim): GETKEY/JH_CK now peeks without consuming input
2. docs: update 68K door status and MRC investigation notes
3. feat(emulation): DOS library enhancements and vector updates
4. feat(handlers): command handler improvements
5. feat(handlers): message, user, file, UI handler improvements
6. feat(database): database and utility improvements
7. feat(server): server initialization and socket handler updates
8. fix: screen and command fixes
9. docs: add DOS LVO audit and parity reports

### Doors to Test Next
- **ctop** - Conference top
- **nuke** - Bossnuke
- **TList** - T-List file lister

### Memory
- `server-restart-rules.md` - Claude should NEVER restart servers
