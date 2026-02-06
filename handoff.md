# Handoff - 2026-02-06

## Session Summary

### Hetzner Deployment
Running on Hetzner VPS (CX22, 2 vCPU, 4GB RAM):
- Server IP: 89.167.21.154
- Auto-deploy via GitHub Actions on push to main
- Docker Compose setup with persistent volume
- **Node 20.20.0** (upgraded from Node 18)

### Fixes Applied (All Permanent)
1. **68K doors Enter key** - Stopped CR->LF conversion in `xim/io.ts` (express.e expects CR)
2. **New user questionnaire crash** - Fixed race condition in `new-user.handler.ts`
3. **Native module install** - Entrypoint checks for actual .node binary, does clean install
4. **Removed ~CC_wall/gwall/ANNLOGON** - Cleaned problematic MCI codes from screens
5. **Database schema** - Removed old sysop script from entrypoint
6. **Health check timeouts** - Fixed in previous session
7. **Node 20 upgrade** - All Docker stages now use node:20-alpine
8. **Memory warning** - Configurable via MEMORY_LIMIT_MB (default 3072MB for 4GB servers)
9. **Removed Render.com references** - Updated .env.example, index.ts, deleted old backup files
10. **Attract mode game_over fix** - Added GameScreen.stop() to properly stop demo game

### Access
- Web: https://bbs.uprough.net (SSL via Caddy)
- Telnet: telnet 89.167.21.154 2323

### Server Commands
```bash
ssh root@89.167.21.154
cd /app/amiexpress
docker compose logs -f        # View logs
docker compose restart        # Restart
FORCE_REINIT_DOORS=1 docker compose up -d --build  # Re-copy all doors
```

### Pending
- Verify lobby layout fix works (user should test: run GMASTER, enter TetriNet lobby)
- Note: multiplayer-lobby.ts exceeds 2000 line limit (2126 lines), needs future refactoring

