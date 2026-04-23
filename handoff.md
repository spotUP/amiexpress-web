# Handoff

## Recent Work
Fixed critical production deployment issues on Hetzner VPS (89.167.21.154).

### Root Causes Fixed
1. **ESM module instance bug**: `await import('./door.handler')` creates separate ESM instances from `require()`, so getDoors()/initializeDoors() returned empty state. Fixed 6 locations across BBSApi.ts, config-routes.ts, command.handler.ts, command-execution.handler.ts - all changed to `require()`.

2. **Production .ts loading**: Door loader preferred .ts source over compiled .js. In Docker (NODE_ENV=production), .ts can't execute. Fixed: .ts preference only in dev mode; fallbacks use .js in production.

3. **Hybrid door bundles**: Grandmaster (hybrid door) had client.entry/server.entry pointing to .ts source. Fixed: door-api-routes.ts serves pre-built dist/client.bundle.js; door.handler.ts resolves .ts -> dist/*.js for server entry.

4. **Command priority**: runCommand() called internal handler on cache miss, short-circuiting BBSCMD (door) lookup. Fixed to return RESULT_FAILURE.

5. **Case sensitivity**: Amiga `Doors:` normalized to `doors/` (lowercase) but Linux needs `Doors/`. Fixed in amiga-command-parser.util.ts.

6. **Docker entrypoint**: BusyBox cp + set -e killed entrypoint. Fixed with || true. Added always-sync of code dirs on startup.

### Deployment
- Push to main -> SSH to 89.167.21.154 -> `docker rm -f amiexpress-bbs; docker compose up -d --build`
- `docker compose down` has container name conflicts; use `docker rm -f` instead
- 121 doors registered, all TS doors working including grandmaster

### Remaining
- Gwall and glc-viewer: package.json main points to dist/index.js but compiled output is root index.js
- TetriNET menu focus loss, connect screen layout
- RTW/dRE!WAll 68K rendering offset issues
- Grandmaster app.ts needs refactoring (2345 lines)
