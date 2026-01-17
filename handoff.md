# Handoff - 2026-01-17

## Current Issue
JoinCnf door (J command without params) gets stuck at "(Pause)...Space To Resume:" after user selects a conference. Pressing space doesn't continue.

## Fixes Applied This Session

### 1. msgBaseRJoin Storage (1:1 express.e fix)
- **Problem**: Stored database ID instead of relative number (1-indexed)
- **express.e**: Line 5136 `loggedOnUser.msgBaseRJoin:=msgBaseNum`
- **Fixed**: `conference.handler.ts:119-130`, `command.handler.ts:623-630`

### 2. RETURNCOMMAND Stub Implemented
- **Problem**: `DoorMessageHandler.ts:988-997` was a TODO stub
- **Fixed**: Now stores command in `bbsSession.returnCommand`

### 3. Pause Clobbering Fix
- **Problem**: `executeAmigaDoor` called `displayMainMenu` which cleared `paginatedScreen`
- **Fixed**: `door.handler.ts:2452-2460` - skips if pause active

### 4. Debug Logging Added
- `/tmp/bbs-debug.log` traces RETURNCOMMAND, doPause, paginatedScreen

### 5. Stale JS Cleanup
- Deleted 254 .js + 852 .d.ts/.map files (compiled output in source dirs)
- Added `dev/scripts/clean-stale-js.sh` - auto-runs on server start
- Updated `.gitignore` for SDK/Doors compiled output

## To Debug Next
1. User tries J command, selects conference, presses space
2. Check `/tmp/bbs-debug.log` for:
   - `RETURNCOMMAND captured: "j X"` - door sent command
   - `doPause: CALLED` - BBS set up pause
   - `paginatedScreen=true` - pause not clobbered
3. If no RETURNCOMMAND: XIM protocol issue
4. If no doPause: processCommand flow issue

## Key Files
- `door.handler.ts:2376-2460` - RETURNCOMMAND capture/execution
- `command.handler.ts:615-654` - AUTO_REJOIN flow
- `conference.handler.ts:98-203` - joinConference
- `DoorMessageHandler.ts:988-1000` - RETURNCOMMAND handler

## Server
Running with fixes. Restart to apply: `./dev/scripts/start-servers.sh`
