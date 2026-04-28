# Handoff

## Console v3 — full /admin/ parity (2026-04-29)

The TUI at dev/console/ now matches the web admin's feature surface.

Sidebar nav (~22 cols) groups all pages into Live / Users / Content / Files / System / Comms.

Phase summary
- Phase A: Sidebar restructure; pages registry as single source of truth
- Phase B: SystemConfig, HealthCheck, AuditLog, SessionLogs, OperatorChat (real-time socket.io)
- Phase C: Generic CrudList + 7 CRUD pages (Languages, Protocols, Computers, ScreenTypes, Drives, FileCheckers, Security)
- Phase D: DoorInstall (path-based), Import/Export, BatchEditor, GlobalWall
- Phase E: Deployment, InfoFiles, AmiXnet, OpChatSettings

How to run: `./dev/scripts/start-servers.sh` — tmux session amiexpress, window 2 = console
Build: `cd dev/console && npm run build`

## Current State
Console v3 Phase E complete. All four pages wired, API client updated, registry reflects full implementation.
- TO: field truncated to 30 chars (express.e lineInput limit, express.e:10779)
- WEB_ tag on MAILSCAN_ALL (ALL messages in confScan always included; conf Conf.DB gating deferred)
- 'Joining Conference' now appears after CONF_BULL doPause, not before (express.e:5056-5088)

## Console v2 (2026-04-28)
TUI sysop control center: full Ink-based dashboard with 8 tabs.

### What was built
- start-servers.sh: creates tmux session `amiexpress` (3 windows + 5 panes in window 0)
  when run in interactive terminal with tmux. Falls back to plain output otherwise.
- dev/console/: standalone Ink TUI package, 8-tab control center
  - Tab 1 Dashboard: ink-big-text "SYSOP" banner, animated stat cards (Live/Today/All Time),
                     24h call sparkline (Unicode block chars), recent callers ticker
  - Tab 2 Nodes: live poll every 3s, kick (k), chat (c)
  - Tab 3 Users: list+search, edit SL (e), ban (b), delete (d)
  - Tab 4 Confs: toggle enabled (t), health check (h), auto-fix (f), refresh (r)
  - Tab 5 Callers: last 50, auto-refresh 30s
  - Tab 6 Logs: backend/preview/68K door, switchable, auto-refresh 5s
  - Tab 7 Doors: list all, [R]eload all, refresh
  - Tab 8 System: per-node start/exit/reserve/sysop-login, [Q]uiet mode, system config view
  - Status strip: dev/console/dist/strip/strip.js — plain ANSI 3-line summary

### How to run
- `./dev/scripts/start-servers.sh` → creates tmux session automatically if tmux available
- `node dev/console/dist/src/index.js` → run console manually
- `node dev/console/dist/strip/strip.js` → run status strip manually

### Build
- `cd dev/console && npm run build`

### Tab keys
1=Dashboard 2=Nodes 3=Users 4=Confs 5=Callers 6=Logs 7=Doors 8=System

## Current State
Server stopped. All changes committed. Console integrated.

## Summary of Session Work

## Prior Sessions (archived)
Audit rounds 3-4 with 138 deviations fixed (binary struct corruption, security checks, core loop,
conference system, MCI/display, file system, messages). See `thoughts/shared/handoffs/` for detailed
audit reports and commits b5d55eaea→be7e2fbcf. Key: MailStats/UserStructures BE byte order (CLAUDE.md Rule 0),
scan_flags DEFAULT 12→0, confScan multi-msgBase, ACL forward-walk, time-limit checks.

## Open priorities
1. **messaging.handler.ts** approaching 1600 lines — monitor, split if needed
2. **screen.handler.ts** at 3220 lines (exempted) — future refactor candidate

## Known WEB_ deviations (intentional)
- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files (WEB_: tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login disabled (uses QuickNew instead of AquaScan); set SHOW_NEW_FILES in .info to re-enable per conference

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **conf_base scan_flags**: DEFAULT now 0. Migration resets any non-zero rows on startup.
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires (a) from SCREENS_REQUIRE_CLEAR before all processing, (b) from leading 0x0C in screen files, (c) before ~SR_ art files. If a screen still bleeds, check if it has a leading form feed.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit may resurface.
