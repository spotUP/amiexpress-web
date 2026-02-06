# Handoff - 2026-02-06

## Session Summary

### Hetzner Deployment
Migrated from Render.com to Hetzner VPS (CX22, 4GB RAM, 2GB RAM plan):
- Server IP: 89.167.21.154
- Auto-deploy via GitHub Actions on push to main
- Docker Compose setup with persistent volume

### Fixes Applied (All Permanent)
1. **68K doors Enter key** - Stopped CR->LF conversion in `xim/io.ts` (express.e expects CR)
2. **New user questionnaire crash** - Fixed race condition in `new-user.handler.ts`
3. **Native module install** - Entrypoint now runs `npm install` for doors with better-sqlite3
4. **Removed ~CC_wall/gwall/ANNLOGON** - Cleaned problematic MCI codes from screens
5. **Database schema** - Removed old sysop script from entrypoint
6. **Health check timeouts** - Fixed in previous session
7. **Grandmaster better-sqlite3** - Pinned to ^10.1.0 (Node 18 compatible, was ^12.5.0 requiring Node 20+)
8. **Entrypoint native check** - Now checks for actual .node binary, not just directory; does clean install

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
- Verify gmaster works (user should test: run GMASTER command in BBS)
- SSH up-arrow history (terminal issue, not server)

