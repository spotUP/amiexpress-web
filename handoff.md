# Handoff - 2026-02-05

## Latest Session: TypeScript Door Deployment Fixes

### Problems Fixed
1. **SDK package.json missing** - Node.js couldn't resolve SDK module
2. **Old door versions on persistent disk** - Doors still used legacy `runDoor` pattern
3. **rip-browser door** - Still used old `runDoor` export pattern

### Root Causes
| Issue | Cause | Fix |
|-------|-------|-----|
| "no default export" | SDK package.json not copied to Docker image | Dockerfile: Copy sdk/package.json |
| "doorModule keys: runDoor" | Persistent disk had old door versions | Added FORCE_REINIT_DOORS env var |
| rip-browser outdated | Source file used old export pattern | Updated to ServerDoor pattern |

### Fixes Applied
| Commit | Description |
|--------|-------------|
| 1b1b8cf6d | Add legacy runDoor fallback + FORCE_REINIT_DOORS + fix rip-browser |
| ba0e98cb2 | Copy SDK package.json for module resolution |
| d506f7780 | Create SDK symlinks for TS doors at startup |
| e59b6e25b | Path symlinks /app/Doors -> $BBS_DATA_DIR/Doors |

### Door Audit Results
All TypeScript doors now use modern `export default door` pattern:
- ansi-editor, bbs-dashboard, bbslinkwall, fire-emblem-v2, glc-viewer
- Gwall, phreakwars, telnet-front, telnet, whip, rip-browser

### Deployment Instructions
1. Trigger manual deploy on Render
2. Check logs for:
   - `FORCE_REINIT_DOORS=1 - Re-copying all Doors...`
   - `SDK symlinks created for N TypeScript doors`
3. After success, set in Render dashboard:
   - `FORCE_REINIT_DOORS=0`
   - `FORCE_REINIT_CONFIG=0`
   - `FORCE_REINIT_ROMS=0`

### Status
All fixes committed and pushed. Ready for deploy.
