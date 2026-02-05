# Handoff - 2026-02-06

## Current Issue: Server Crashing on Render

The BBS server was crashing periodically on Render.com, causing 502 Bad Gateway errors.

### Root Cause Identified
The 68K emulator batch execution blocks Node.js event loop via C++ N-API. If batches take too long, health checks timeout (30s default) and Render restarts the container.

### Fixes Applied This Session
| Commit | Description |
|--------|-------------|
| e45183ec0 | Health check fix: /health endpoint, smaller batches (2000), faster yields (5ms), SIGTERM logging |
| fc93f25da | Add deploy.sh script |
| 611617947 | Ignore unrecognized terminal escape sequences |
| 34100cb17 | Convert web terminal key codes to Amiga codes |

### Key Changes (e45183ec0)
1. **healthCheckPath: /health** - Fast JSON response instead of full SPA at /
2. **Batch size: 5000 -> 2000** - Less event loop blocking
3. **Yield interval: 10ms -> 5ms** - More responsive to health checks
4. **SIGTERM handler** - Logs when Render kills container (helps diagnose future issues)

### Deploy Instructions
```bash
git push origin main
```
Then trigger deploy in Render dashboard.

### Post-Deployment
After stable deployment, set in Render dashboard:
- `FORCE_REINIT_DOORS=0`
- `FORCE_REINIT_CONFIG=0`
- `FORCE_REINIT_ROMS=0`

### What to Watch For
- `[HEARTBEAT]` logs should appear every 60s
- `[SHUTDOWN] SIGTERM received` indicates Render killed process
- `[MEMORY WARNING]` indicates approaching 512MB limit
- If crashes continue: may need even smaller batch size or Render plan upgrade
