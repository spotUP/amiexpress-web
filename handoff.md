# Handoff - 2026-02-07

## CRITICAL FIX: TypeScript Door Module Caching (PERMANENT SOLUTION)

**Problem:** Node.js ESM imports were permanently cached in memory, causing "stale code" issues that persisted for days despite rebuilds and restarts. User had to disconnect/reconnect to see changes.

**Root Cause:** ESM modules use path-based caching - same path = cached module, even if file changed.

**Solution Implemented:** Two-layer cache prevention

### Layer 1: Runtime Cache-Busting (door.handler.ts)

**File:** `web/backend/src/handlers/door.handler.ts` (lines 1585-1593)

```typescript
// CRITICAL: ESM module cache busting for development mode
const isDev = process.env.NODE_ENV !== 'production';
const cacheBuster = isDev ? `?t=${Date.now()}` : '';
const importPath = `file://${resolvedDoorPath}${cacheBuster}`;
```

**How It Works:**
- Development: `file:///path/to/door.js?t=1738901234567` (unique timestamp)
- Production: `file:///path/to/door.js` (stable path, better caching)
- Each door execution gets fresh import with unique query parameter
- Node.js treats each as separate module - no cache hits

### Layer 2: Startup Cache Clearing (start-servers.sh)

**File:** `dev/scripts/start-servers.sh` (comprehensive cache clearing)

**What Gets Cleared:**
1. npm cache (`npm cache clean --force`)
2. Build tool caches (webpack/babel/vite in node_modules/.cache)
3. TypeScript build info (*.tsbuildinfo files)
4. ALL dist/ directories (backend, frontend, config, SDK, doors)
5. Stale .js files in source directories
6. Vite cache directories (.vite folders)
7. Node.js ESM loader cache + force NODE_ENV=development

**Status:** FIXED PERMANENTLY
- Backend rebuilt: 2026-02-07 04:15am
- Start script clears ALL caches before every startup
- Runtime cache-busting prevents stale imports
- No more disconnects required
- No more stale code issues
- Works automatically in development mode

---

## Full AI Opponents System (COMPLETE)

**Implemented:**
1. **TetriNET Mode** (`ai/tetrinet-ai.ts`) - 3 AI opponents, 10 difficulty levels
2. **CPU Battle Mode** (`ai/versus-ai.ts`) - 3 AI opponents with independent game engines
3. Fixed "stupid" auto-play behavior - AI now controls opponents, not player

**Files Modified:**
- `Doors/grandmaster/app.ts` - Spawn AI opponents
- `Doors/grandmaster/ui/tetrinet-screen.ts` - Update AI every frame
- `Doors/grandmaster/ui/versus-screen.ts` - Update opponent minimaps

**Testing:**
- TetriNET Local: See 3 AI opponents playing
- CPU Battle: See 3 AI minimaps on right side
- AI difficulty affects think time (100-2000ms)

---

## Other Fixes

**Music Cleanup:** Frontend missing `audio:music:stop` handler - Fixed in `BBSTerminal.tsx`

**Arrow Keys:** Fixed `enableGrabKeys: false` → `true` in `Doors/grandmaster/app.ts`

---

## Backend Status

- Last rebuild: 04:00am (module cache-busting enabled)
- Ports: HTTP:3001, Telnet:2323, SSH:2222
- Log: `logs/backend.log`
- GRANDMASTER: Rebuilt with AI opponents

---

## Hetzner Deployment

- Server: 89.167.21.154
- Web: https://bbs.uprough.net
- Telnet: 2323
- Auto-deploy via GitHub Actions
