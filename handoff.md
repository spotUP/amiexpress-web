# Handoff - 2026-01-17

## Current Issue
Resolved critical CORS issue causing 502 errors. Reverted accidental modern GUI additions.

## Fixes Applied This Session

### 1. CORS 502 Fix (Critical)
- **Problem**: `crossorigin` assets blocked by CORS returned 500, causing 502 Bad Gateway.
- **Fix**: `web/backend/src/server/app.ts` - Return 403 on CORS error, log warning with origin.
- **Fix**: `web/backend/src/server/app.ts` - Fixed global error handler to respect `err.statusCode`.
- **Impact**: Cross-origin assets now load correctly or fail with 403, preventing 502s.

### 2. msgBaseRJoin Storage (1:1 express.e fix)
- **Problem**: Stored database ID instead of relative number (1-indexed).
- **Fixed**: `conference.handler.ts:119-130`, `command.handler.ts:623-630`.

### 3. RETURNCOMMAND Stub Implemented
- **Problem**: `DoorMessageHandler.ts:988-997` was a TODO stub.
- **Fixed**: Now stores command in `bbsSession.returnCommand`.

### 4. Pause Clobbering Fix
- **Problem**: `executeAmigaDoor` called `displayMainMenu` which cleared `paginatedScreen`.
- **Fixed**: `door.handler.ts:2452-2460` - skips if pause active.

### 5. Stale JS Cleanup
- Deleted 254 .js + 852 .d.ts/.map files (compiled output in source dirs).
- Added `dev/scripts/clean-stale-js.sh` - auto-runs on server start.

## Next Steps
1. Verify live site no longer shows 502 errors.
2. Continue debugging J command flow (from previous session).

## Key Files
- `web/backend/src/server/app.ts` - CORS and Error Handling.
- `web/backend/src/config.ts` - CORS configuration.