# Handoff - 2026-02-05

## Latest Session: TypeScript Door "no default export" Fix

### Problem
TypeScript doors failed with: `Invalid TypeScript door: Must export ServerDoor instance as default export (no default export)`

### Root Cause Analysis
The Dockerfile copied `/app/sdk/dist` but **not** `/app/sdk/package.json`. When Node.js resolved the SDK symlink:
1. Symlink: `node_modules/@amiexpress/bbs-door-sdk` → `/app/sdk`
2. Node tried to read `/app/sdk/package.json` → **MISSING**
3. Fell back to looking for `/app/sdk/index.js` → **MISSING** (only `dist/` exists)
4. Module resolution failed → `doorModule.default` was `undefined`

### Fixes Applied
| Commit | Description |
|--------|-------------|
| ba0e98cb2 | **Dockerfile**: Copy `sdk/package.json` alongside `sdk/dist` |
| d506f7780 | **docker-entrypoint.sh**: Create SDK symlinks for TS doors at startup |
| e59b6e25b | Path symlinks `/app/Doors` → `$BBS_DATA_DIR/Doors` |
| 21cf3f0d5 | Added .info config file copying |
| 87d19f920 | Added `FORCE_REINIT_ROMS=1` for AROS ROM files |

### Module Resolution Chain (Now Fixed)
```
door imports SDK →
  node_modules/@amiexpress/bbs-door-sdk (symlink) →
  /app/sdk →
  reads package.json → main: "./dist/index.js" →
  /app/sdk/dist/index.js ✓ →
  exports ServerDoor ✓
```

### Deployment Instructions
1. Trigger manual deploy on Render (autoDeploy is off)
2. Check logs for:
   - `[Entrypoint] SDK symlinks created for N TypeScript doors`
   - `[Entrypoint] Configuration file status:` - should show [OK]
3. After success, set in Render dashboard:
   - `FORCE_REINIT_CONFIG=0`
   - `FORCE_REINIT_ROMS=0`

### Status
All fixes committed and pushed to main. Ready for deploy.
