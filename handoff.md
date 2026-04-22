# Handoff - AmiExpress-Web

## Last Session (Apr 22, 2026)

### What we did
1. Fixed ~12 Grandmaster tetris bugs (hold key, pause menu, settings, UI layout, etc.)
2. Fixed SDK DocModal background color mismatch
3. Fixed critical deployment issues on Hetzner live site:
   - Entrypoint crash loop: BusyBox cp + set -e = instant death. Added || true.
   - Case sensitivity: doors: -> doors/ broke on Linux. Fixed to Doors/.
   - File permissions: rsync from macOS set UID 501, container runs as 1001.
   - Auto-sync: Doors/Commands/Screens/Libs/C now sync from image on every startup.
   - Previously only first-init copied these dirs, so deploys never updated them.

### Live Site
- SSH: ssh root@89.167.21.154
- Web: http://89.167.21.154:3001
- Deploy: push to main -> GitHub Actions -> git pull + docker compose up --build
- Volume: /var/lib/docker/volumes/amiexpress-bbs-data/_data/bbs/

### Remaining
- TetriNET menu focus loss in Grandmaster
- RTW/dRE!WAll 68K rendering offset issues
- app.ts (2345 lines) needs refactoring
- SSH server needs host key generation on live
