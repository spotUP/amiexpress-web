# Handoff - 2026-02-05

## Latest Session: TypeScript Door SDK Symlink Fix

### Problem
TypeScript doors failed with "Invalid TypeScript door: Must export ServerDoor instance as default export" error on Render deployment.

### Root Cause
- `.dockerignore` excludes `Doors/**/node_modules` from Docker build
- TypeScript doors need `@amiexpress/bbs-door-sdk` in their node_modules
- Without it, import succeeds but SDK classes aren't available
- Validation for `execute()` and `getConfig()` methods fails

### Fix Applied (commit d506f7780)
1. **docker-entrypoint.sh**: Added SDK symlink creation for TypeScript doors
   - Scans `$BBS_DATA_DIR/Doors/` for directories with `package.json`
   - Creates `node_modules/@amiexpress/bbs-door-sdk` symlink pointing to `/app/sdk`
   - Logs count of symlinks created

2. **door.handler.ts**: Added diagnostic logging
   - Logs doorModule keys and method types
   - Shows specific reason for validation failures

### Previous Fixes (already deployed)
| Commit | Fix |
|--------|-----|
| e59b6e25b | Path symlinks `/app/Doors` -> `$BBS_DATA_DIR/Doors` |
| 21cf3f0d5 | Added .info config file copying to Dockerfile and entrypoint |
| 87d19f920 | Added `FORCE_REINIT_ROMS=1` for AROS ROM files |
| c1e4dae9e | Fixed `_displayScreen is not a function` TypeError |

### Deployment Instructions
1. Trigger manual deploy on Render (autoDeploy is off)
2. Check logs for:
   - `[Entrypoint] SDK symlinks created for N TypeScript doors`
   - `[Entrypoint] Configuration file status:` - should show [OK]
   - `[Entrypoint] Final ROM status:` - should show [OK]
3. After success, set in Render dashboard:
   - `FORCE_REINIT_CONFIG=0`
   - `FORCE_REINIT_ROMS=0`

### Status
All fixes committed and pushed to main. Ready for deploy.
