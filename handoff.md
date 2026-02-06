# Handoff - 2026-02-06

## Session Summary

### 1. RAM Optimization (deployed to Render)
- Emulator memory: 16MB -> 4MB default (EMULATOR_MEMORY_MB)
- FileCache: 16MB -> 4MB default (FILE_CACHE_MB)
- AmigaFileCache: Unbounded -> 2MB with LRU eviction

### 2. Wall Door Auto-Execute Fix
Removed ~CC_wall and ~CC_gwall from logon screens to prevent OOM crashes.

### 3. Hetzner Deployment Setup (commit 3ddcca581)
Created deployment scripts for Hetzner VPS (CX22, €3.79/mo, 4GB RAM):
- `docker-compose.yml` - Updated for VPS deployment with named volumes
- `deploy/hetzner-setup.sh` - One-command initial setup
- `deploy/update.sh` - Pull and rebuild
- `deploy/status.sh` - Health check
- `deploy/README.md` - Full documentation

## Current Status
- User created Hetzner project "AmiExpress-Web"
- Deployment scripts ready, need to push to repo and deploy

## Next Steps
1. Push commits to GitHub
2. Create Hetzner CX22 server (Ubuntu 24.04)
3. SSH in and run setup script
4. Start BBS with docker compose

## Quick Deploy Commands
```bash
# On Hetzner VPS
ssh root@SERVER_IP
curl -fsSL https://raw.githubusercontent.com/USER/amiexpress-web/main/deploy/hetzner-setup.sh -o setup.sh
bash setup.sh
cd /app/amiexpress && docker compose up -d
```
