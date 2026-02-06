# Handoff - 2026-02-06

## Session Summary

### Hetzner Deployment
Migrated from Render.com to Hetzner VPS (CX22, 4GB RAM, €3.79/mo):
- Server IP: 89.167.21.154
- Auto-deploy via GitHub Actions on push to main
- Docker Compose setup with persistent volume

### Fixes Applied
1. Removed `~CC_wall`, `~CC_gwall` from logon screens (OOM fix)
2. Removed `~CC_ANNLOGON` from LOGON.TXT (command doesn't exist)
3. Fixed database schema issue (old sysop script creating wrong schema)
4. Added window-click focus for terminal
5. Fixed new user registration crash - `createAccount()` was deleting `session.newUserData` before questionnaire persistence could use it

### Access
- Web: https://bbs.uprough.net (SSL via Caddy)
- Web direct: http://89.167.21.154:3001
- Telnet: telnet 89.167.21.154 2323

### Server Commands
```bash
ssh root@89.167.21.154
cd /app/amiexpress
docker compose logs -f        # View logs
docker compose restart        # Restart
./deploy/status.sh            # Health check
```
