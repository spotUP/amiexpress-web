# Handoff - 2026-02-05

## Current Session: DI Container Fallback Fix

### Problem Fixed

AUTO_REJOIN flow was failing with:
```
Error: Attempted to resolve unregistered dependency token: "Symbol(MessageBases)"
    at getMessageBases (dependency-injection.ts:41)
    at advanceDisplayFlow (command.handler.ts:669)
```

This caused the display to loop back to CONF_BULL repeatedly, showing "last callers" (bull6.txt) multiple times.

### Solution Applied

Added try/catch fallbacks to DI getters that return empty arrays when tokens aren't registered:

**File:** `web/backend/src/handlers/command-handler/dependency-injection.ts`
- `getMessageBases()` - now returns `[]` on error
- `getConferences()` - now returns `[]` on error
- `getFileAreas()` - now returns `[]` on error
- `getDoors()` - now returns `[]` on error

**Commit:** `78b7e5358`

### Deployment Status

- Code pushed to GitHub
- Deploy hook expired - manual deploy needed from Render dashboard
- `FORCE_REINIT_SCREENS=0` in render.yaml (set in previous session)

### Previous Session Fixes (Still Applied)

1. **Screen fallback duplicate display** - NODE_BULL no longer falls back to global Screens/BULL.TXT
2. **68K ROM path** - Added ROM_DIR env var to KickstartRom.ts search paths

### Post-Deploy Verification

Check on bbs.uprough.net:
1. No duplicate "last callers" displays
2. 68K doors execute properly
3. No AUTO_REJOIN errors in logs
