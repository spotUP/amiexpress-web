# Handoff - 2026-02-06

## Session Summary

### 1. RAM Optimization (commit de8216f73)
Implemented memory optimization for Render.com's 512MB limit:
- Emulator memory: 16MB -> 4MB default (EMULATOR_MEMORY_MB)
- FileCache: 16MB -> 4MB default (FILE_CACHE_MB)
- AmigaFileCache: Unbounded -> 2MB with LRU eviction (AMIGA_FILE_CACHE_MB)
- Added cleanup() methods to ExecLibrary and DosLibrary

### 2. SDK node_modules Fix (commit 451879bc2)
Fixed "Cannot find module 'tone'" error:
- Dockerfile was only copying sdk/dist, not sdk/node_modules
- Added: `COPY --from=sdk-builder /app/sdk/node_modules ./sdk/node_modules`

### 3. Wall Door Auto-Execute Fix (commit 389d28315)
Removed ~CC_wall and ~CC_gwall from logon screens to prevent OOM:
- Screens/LOGON.TXT: removed ~CC_wall
- Screens/logon20.txt: removed ~CC_wall, ~CC_gwall
- logon20.txt_.txt: removed ~CC_wall, ~CC_gwall

Wall doors were auto-executing during logon, consuming memory before users could even interact.

## Current Deploy Status
- All commits pushed to main
- Render should auto-deploy or trigger manually

## If Doors Still Crash
Increase emulator memory in Render dashboard:
```
EMULATOR_MEMORY_MB=8
```

## What to Watch For
- `[AmigaDoorSession] Emulator memory: 4MB` confirms RAM optimization active
- `[HEARTBEAT]` logs show memory usage
- Wall doors no longer auto-execute on logon
- Users can manually run WALL command from menu if desired
