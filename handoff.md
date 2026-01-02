# Handoff - 2026-01-02

## FIXES APPLIED

### Fix 1: Command Priority Order (CORRECTED)
**File:** command-execution.handler.ts:208-224
- Priority: EXTERNAL (SYSCMD/BBSCMD) → INTERNAL (fallback)
- express.e:28247-28256 - External commands checked first
- Internal commands only run if no external command found
- **FIXED AGAIN:** Was incorrectly checking INTERNAL first (broke J door)

### Fix 2: processBBSCommand Return Values (COMPLETE)
**File:** internal-commands.ts
- Changed function signature to return `Promise<number>`
- All matched commands return RESULT_SUCCESS (0)
- Default case returns RESULT_FAILURE (-1) for external door fallback
- Removed "Unknown command" output from default case (should be final handler only)
- Removed unconditional screen clear (was clearing for unrecognized commands)

### Fix 3: SQLite3 Date Binding Error (COMPLETE)
**File:** file.handler.ts:758-760
- Convert Date object to Unix timestamp before database query
- SQLite3 requires numbers/strings, not Date objects
- Fixed: `Math.floor(searchDate.getTime() / 1000)`

### Fix 4: 'S' Parameter Misinterpretation (COMPLETE)
**File:** file.handler.ts:668-720, 723-805
- 'S' means "use Since date" (lastLogin), NOT "silent mode" (express.e:27862)
- 'U' is directory range parameter, NOT "unattended mode"
- Removed incorrect silentMode logic that suppressed all output
- Now outputs "Scanning directory X..." for each area (express.e:27914,27928)
- Added newFilesPauseFlag to BBSSession (express.e:216,28100)

**Root Cause:** confScan calling AquaScan DOOR instead of internal `myNewFiles()`.
**Solution:** 'N' command now runs internal handler → outputs "Scanning..." messages (express.e:27831-27950).

### Fix 5: confScan Pause Logic (COMPLETE)
**Files:** flag-pause.util.ts, file.handler.ts:746-760, socket-handlers.ts:535-567
- Added `checkForPause()` function (express.e:5181-5196)
- After each "Scanning directory X..." line, call appropriate pause:
  - If `newFilesPauseFlag=TRUE` (confScan), call `checkForPause()`
  - Otherwise call `flagPause(1)` for manual N command
- Tracks `lineCount` and pauses every 23 lines (express.e:27934-27938)
- Added input handler for checkPauseHandler in socket-handlers.ts

**Why needed:** Without pauses, all 14 conferences scroll by instantly (too fast to read).

### Fix 6: Font Preference Persistence (COMPLETE)
**File:** user-repository.ts:190
- Added `fontPreference: user.fontpreference || 'TopazPlus_a1200'` to mapUserFromDb()
- Bug: Font was saved to DB but not loaded on login (missing from mapping)
- Now font preference persists across sessions

## Debug Logging (can remove after verified)

- `DoorLifecycleManager.ts:1419` - Log EVERY pollXIMMessages call
- `DoorLifecycleManager.ts:1493-1515` - Log every getMsg call and return value
- `ExecLibrary.ts:4838` - DEBUG logging for repliedMessages state

## Previous Fixes This Session

1. CreateComm JMP table offset (ExecLibrary.ts:2186,2306) - Changed 0x3f0 → 0x170
2. doorParams setting (door.handler.ts:2227-2231) - Set session.doorParams/commandParams
3. SQL error fix (user-repository.ts:202-206) - Filter lastLoginBeforeUpdate field
4. Stuck loop detection fix v1 (DoorLifecycleManager.ts:568-570) - Skip detection in Wait() loops (INCOMPLETE)
5. Stuck loop detection fix v2 (DoorLifecycleManager.ts:572) - Skip detection for ALL XIM doors (COMPLETE)
