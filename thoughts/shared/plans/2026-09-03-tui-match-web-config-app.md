# TUI to Match Web Config App Admin UI 1:1

## Status: IN PROGRESS

## Problem
The TUI admin (`dev/console`) has a different structure than the web admin UI (`web/config-app`):
- TUI uses different categories (Live/Users/Content/Files/System/Comms)
- TUI has many individual pages that web has grouped into workspaces
- Page names differ (e.g., `dashboard` vs `overview`, `op-chat` vs `operator-chat`)
- TUI login has cursor issues
- TUI sidebar has no hover effects

## Goal
Make the TUI's structure match the web admin UI's structure 1:1, as defined in `web/config-app/src/components/AppShell/nav-config.ts`.

## TUI Registry Changes

### Old Structure
- Live: dashboard, nodes, callers, logs, op-chat
- Users: users, security, audit, sessions
- Content: confs, doors, door-install, global-wall
- Files: drives, file-checkers, import-export
- System: system-config, system-status, health, deployment, languages, protocols, computers, screen-types, system
- Comms: amixnet, op-chat-settings, batch-editor, info-files

### New Structure (matching web)
- **Live:**
  - `overview` (was `dashboard`)
  - `activity` (was `callers` - now includes uploads/downloads)
  - `nodes`
  - `operator-chat` (was `op-chat`)
- **People:**
  - `users`
  - `security` (was `access-levels`)
- **Content:**
  - `conferences` (was `confs`)
  - `doors`
  - `global-wall`
- **System:**
  - `configuration` (was `system-config`)
  - `config-files` (was `info-files` + `batch-editor`)
  - `lookup-tables` (was `computers` + `screen-types` + `languages` + `protocols` + `file-checkers`)
  - `health` (combines health + deployment)
- **Diagnostics:**
  - `statistics` (new in TUI)
  - `logs`
  - `session-logs` (was `sessions`)
  - `audit`
  - `import-export`

### Removed
- `amixnet` - not in web
- `op-chat-settings` - folded into `operator-chat` workspace in web
- `deployment` - folded into `health` workspace in web
- `system` (legacy) - was a separate legacy page, no longer needed
- `system-status` - was a read-only version, but web's `/admin/system` is the editable Configuration

## Port Good TUI Things to Web
- `door-install` (separate page) - web has it inside DoorsPage, could be made separate

## TUI Fixes
- Login cursor: blinking underscore instead of block character, avoid layout shift
- Sidebar hover: track mouse position, highlight on hover
- Style with blessed theme: cyan/cyan colors, box drawing characters
