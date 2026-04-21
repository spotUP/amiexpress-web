# Handoff — 2026-04-21 (night)

## Just shipped

- **Docker image rebuilt and redeployed** on bbs.uprough.net
  - Rewrote .dockerignore (was blocking batch files, scripts, C/, S/,
    System/, express binary, and many more BBS files)
  - Added ALL missing dirs to Dockerfile: C, Devs, L, S, Scripts, System,
    AmiXnet, RIPgraphics, Partdownload, Access, Languages, Protocols,
    FCheck, Storage, SysopStats, Zoom, HELP, Utils
  - Added batch files, acp.dat, express binary, root .info files
  - Fixed Node screen auto-repair in docker-entrypoint.sh
  - Committed 6 untracked source files needed for build (DebugRegistry,
    SymbolResolver, OutputTap, debug-mcp routes, etc.)
  - Committed all uncommitted backend/SDK/door source changes
  - Created deploy/sync-to-server.sh for gitignored files
  - Fixed bbsConfig.info permissions (was root-owned, now bbsuser)

## Live server state

- Container healthy, bbsConfig.info loading correctly
- Image rebuilt 2026-04-21 ~21:15 UTC (was 2+ months old)
- All config dirs populated, batch files present

## Carried forward

- OLM row 00 phantom (blocked by info-editor.ts corruption)
- WarOLM cursor offset (\r\n normalization blast radius)
- SysInfo waitForReply blocking
- Input lag profiling
- J door (emp_tools/joincnf) not verified working yet

## Live server

- Hetzner VPS: root@89.167.21.154, container `amiexpress-bbs`
- Sync script: `./deploy/sync-to-server.sh [--force]`
- Rebuild: `ssh root@89.167.21.154 "cd /app/amiexpress && git pull && docker compose up -d --build"`
