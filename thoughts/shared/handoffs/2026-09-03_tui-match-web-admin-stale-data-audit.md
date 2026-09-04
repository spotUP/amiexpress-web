# Session Handoff: TUI to Match Web Config App Admin UI 1:1

**Date:** 2026-09-03
**Status:** In progress - structural match done, data flow is STALE
**Branch:** feat/installed-door-link
**Author's mandate:** "Make the TUI match the web UI as close to 1:1 as we can" + "if the tui has something good that the web ui doesn't port it to the web ui" + "make the best of both"

---

## TL;DR

I matched the TUI's sidebar structure and page labels to the web config-app's nav-config.ts, but **the actual data flow is still the TUI's old design**. The web refactor changed endpoints, data shapes, auth flow, and added 40+ new API methods that the TUI does not have. Most TUI pages will 404 or render wrong on the new backend. The match I just did is structural cosplay - sidebar labels without working data.

This handoff documents everything needed to do the real fix in a future session.

---

## What I Did This Session

### 1. TUI registry rewrite (`dev/console/src/pages/registry.ts`)
- Categories now match the web: `Live`, `People`, `Content`, `System`, `Diagnostics` (was `Live`, `Users`, `Content`, `Files`, `System`, `Comms`)
- Page IDs renamed to match the web's nav-config.ts:
  - `dashboard` → `overview`
  - `callers` → `activity` (expanded to include uploads + downloads)
  - `op-chat` → `operator-chat`
  - `confs` → `conferences` (workspace: conferences + file areas)
  - `system-config` → `configuration` (kept `system-config` as the page, wrapped)
  - `info-files` + `batch-editor` → `config-files` (workspace with tabs)
  - `computers` + `screen-types` + `languages` + `protocols` + `file-checkers` → `lookup-tables` (workspace with tabs)
  - `health` + `deployment` → `health` (workspace with tabs)
  - `sessions` → `session-logs`
  - Added: `statistics` (new TUI page)
- Removed: `amixnet`, `op-chat-settings`, `system` (legacy), `system-status` (read-only), `drives`, `file-checkers` as separate pages
- Added `CATEGORY_COLLAPSED` map for Diagnostics (matches web's `collapsedByDefault: true`)
- `DEFAULT_PAGE` changed to `overview`

### 2. New TUI page components created
- `ActivityPage.tsx` - replaces `CallersTab.tsx`, adds uploads + downloads tabs
- `StatisticsPage.tsx` - new page, all-time + today stats
- `ConfigurationPage.tsx` - wrapper around `SystemConfigPage` (renamed id)
- `ConfigFilesPage.tsx` - tab workspace for InfoFilesPage + BatchEditorPage
- `LookupTablesPage.tsx` - tab workspace for 5 small lists
- `HealthDeploymentPage.tsx` - tab workspace for HealthCheckPage + DeploymentPage
- `ConferencesPage.tsx` - tab workspace for ConfsTab + DrivesPage

### 3. Deleted TUI files (no longer referenced)
- `SystemTab.tsx` (legacy)
- `OpChatSettingsPage.tsx`
- `AmiXnetPage.tsx`
- `CallersTab.tsx` (replaced by ActivityPage)
- `SystemStatusPage.tsx` (read-only - Configuration is the editable version)

### 4. Login cursor fix (`dev/console/src/components/LoginPrompt.tsx`)
The "cursor moves up when typing first character" bug is fixed by:
- Using a fixed-width input field (always 30 chars wide, padded with spaces)
- Blinking underscore cursor (`_`) that toggles every 500ms
- No more layout shift because the field is always the same width

### 5. Sidebar hover effects (`dev/console/src/components/Sidebar.tsx`)
- Updated to use new `useHover` hook
- Hovered page highlighted in cyan (same as active)
- Categories are now collapsible (click category header to expand/collapse)
- Diagnostics category starts collapsed (matches web)
- Active page shown with inverse (highlighted background)
- `▼` / `▶` indicators on category headers

### 6. Mouse hook upgrade (`dev/console/src/hooks/useMouse.ts`)
- Now enables `1002h` (motion-while-pressed) in addition to `1000h` (button events)
- Added `useHover` hook for tracking mouse position
- Maintains backward compatibility with `useMouse` / `MouseClick`

### 7. API client additions (`dev/console/src/api/client.ts`)
- Added `getLastUploads(limit)` - GET `/api/stats/last-uploads`
- Added `getLastDownloads(limit)` - GET `/api/stats/last-downloads`
- Added `uploadArchive(filePath)` - POST `/api/import/upload` (multipart file upload)

---

## What's STALE and Broken

### Critical: API method count gap
- **Web client:** 126 methods
- **TUI client:** 84 methods
- **Missing in TUI:** ~42 methods

### Missing TUI API methods (web has, TUI does not)
Authentication & session:
- `me()` - validate token, get current user
- `logout()` - clear session

Node configuration (this is a separate web tab in the NodesWorkspace):
- `getNodeConfigs()` - list all node configs
- `getNodeConfig(nodeNumber)` - get one
- `createNodeConfig(config)` - create
- `updateNodeConfig(nodeNumber, updates)` - update
- `deleteNodeConfig(nodeNumber)` - delete

Conference configuration:
- `getConferenceConfigs()` - list all
- `getConferenceConfig(confNumber)` - get one
- `createConferenceConfig(config)` - create
- `updateConferenceConfig(confNumber, updates)` - update
- `deleteConferenceConfig(confNumber)` - delete

Door CRUD (the TUI's `getDoors()` doesn't match the web's `getDoors()`):
- `getDoor(id)` - get one door
- `createDoor(door)` - create
- `updateDoor(id, updates)` - update
- `deleteDoor(command)` - delete (by command name)
- `uploadDoorArchive(file)` - upload file
- `installDoorArchive(archive)` - install uploaded archive

ACS (Access Control System) - the web has a major `Security` page using these:
- `getAcsLevels()` - list levels
- `getAcsLevelFlags(level)` - get flags for a level
- `saveAcsLevelFlags(level, flags)` - save flags
- `createAcsLevel(level, copyFrom?)` - create level
- `getSecurityAccessForLevel(level)` - list access rows
- `createSecurityAccess(access)` - create row
- `updateSecurityAccess(id, updates)` - update row
- `deleteSecurityAccess(id)` - delete row

Lookup tables (single-entity gets):
- `getScreenType(id)`
- `getFileChecker(id)`
- `getDrive(id)`
- `getFileCheckerErrors(checkerId)` - file checker errors
- `createFileCheckerError(checkerId, error)`
- `deleteFileCheckerError(id)`

Users:
- `getUser(id)` - get one
- `createUser(user)` - create

Audit log:
- `getAuditLog(tableName?, recordId?, limit?)` - with record id filter

SSH/SMTP/Logs:
- `getSSHKeyInfo()` - SSH key info
- `generateSSHKey(keySize, overwrite)` - generate
- `deleteSSHKey()` - delete
- `testSmtp()` - test SMTP
- `getLogs(type, lines, search, doorLog)` - logs with search
- `getDoorLogFiles()` - list door log files
- `clearLogs(type, doorLog?)` - clear logs

Batches:
- `getBatches()` - list
- `getBatch(name)` - get content
- `saveBatch(name, content)` - save
- `validateBatch(name, content)` - validate

Sessions:
- `getSessionLogRaw(sessionId)` - raw log
- `saveSessionLog(sessionId)` - save
- `getSessionStats()` - stats

Info file editor:
- `getInfoFile(relativePath)` - get
- `updateInfoFile(relativePath, tooltypes)` - update
- `toggleTooltypeComment(relativePath, key)` - toggle comment

Global wall:
- `getGlobalWallConfig()` - get config
- `updateGlobalWallConfig(config)` - update config

Operator chat config:
- `updateOperatorChatConfig(config)` - update (TUI only has get)

### Stale TUI API methods (TUI has, web does not or different shape)
- `reloadDoors()` - web uses different reload mechanism
- `startNode()` / `exitNode()` / `reserveNode()` / `sysopLoginNode()` / `setQuietMode()` - these are TUI's old Nodes control methods
- `kickNode()` / `chatNode()` - same
- `fixConference()` - web doesn't have this
- `getConferenceHealth()` - web doesn't have this
- TUI's `updateUser()` has different signature than web's
- TUI's `getDoors()` returns different shape than web's `getDoors()`

### Data shape gaps (types)
The web has proper TypeScript types in `web/config-app/src/types/` that the TUI does not have. The TUI's `types.ts` is missing:
- `User` with proper security level
- `Door` with full schema (door_name, door_command, door_type, door_path, min_security_level, enabled, etc.)
- `Conference` with file paths
- `NodeConfig`
- `AcsLevel`, `AcsLevelFlag`
- `SecurityAccess`
- `FileCheckerError`
- `OperatorChatConfig`
- `GlobalWallConfig`
- `InfoFileTooltype`
- `SessionLog`
- `Batch`
- `BBSEvent`, `BBSEventType` for real-time

### Real-time updates
- Web has `web/config-app/src/realtime/RealtimeProvider.tsx` that streams BBS events via websocket
- TUI has no equivalent - Activity page polls every 15-30s, would need real-time events to match web

### Auth flow
- Web has `AuthContext` with proper 401 handling (apiClient.onUnauthorized())
- TUI has no AuthContext, no 401 handling - token is set by login, but expired sessions won't redirect to login

### File uploads
- Web has `uploadFile()` helper for multipart uploads (used by DoorsPage for door install)
- TUI has `uploadArchive()` for `/api/import/upload` but doesn't use it for doors

---

## What's IN the Web UI (good)

Web config-app lives at `web/config-app/` (separate from the original `web/frontend/`).
- Built with Vite, served at `/admin/` by backend
- React Router for navigation
- TanStack Query for data fetching (with cache, refetch, etc.)
- Custom auth context with 401 handling
- Real-time websocket provider
- TabbedWorkspace pattern for grouping related pages
- Lucide React icons for sidebar
- Tailwind CSS for styling

The web's nav-config.ts is the source of truth for the sidebar structure. The TUI's registry.ts should mirror it.

---

## The Real Fix Plan (10-16 hours of work)

### Phase 1: Endpoint parity (2-3 hours)
1. Port the 40+ missing API methods from web/config-app/src/api/client.ts to dev/console/src/api/client.ts
2. Match the web's return shapes (the web returns `{ success, data, message }` consistently)
3. Add 401 handling via useEffect hook listening to fetch errors

### Phase 2: Type parity (1-2 hours)
1. Copy/adapt web/config-app/src/types/index.ts to dev/console/src/api/types.ts
2. Add types for: User, Door, Conference, NodeConfig, AcsLevel, SecurityAccess, FileCheckerError, InfoFileTooltype, etc.
3. Make every TUI component use the new types

### Phase 3: Page-by-page audit (4-8 hours)
For each TUI page, compare to the web counterpart and fix:
- **Overview** (DashboardTab) - the web's OverviewPage uses real-time data
- **Activity** (ActivityPage) - needs real-time events
- **Nodes** (NodesTab) - split into Live + Configuration tabs
- **Operator Chat** (OperatorChatPage) - check chat works
- **Users** (UsersTab) - audit data shape, fix create/update/delete
- **Security** (SecurityPage) - the web uses ACS levels, major rewrite
- **Conferences** (ConferencesPage) - workspace with file areas
- **Doors** (DoorsTab) - audit CRUD
- **Door Install** (DoorInstallPage) - check the multipart upload works
- **Global Wall** (GlobalWallPage) - check the API calls match
- **Configuration** (ConfigurationPage) - check it actually saves
- **Config Files** (ConfigFilesPage) - check info file editor works
- **Lookup Tables** (LookupTablesPage) - 5 tabs, audit each
- **Health and Deployment** (HealthDeploymentPage) - workspace
- **Statistics** (StatisticsPage) - audit data shape
- **System Logs** (LogsTab) - check search works
- **Session Logs** (SessionLogsPage) - check raw log fetch works
- **Audit Log** (AuditLogPage) - check filters work
- **Import and Export** (ImportExportPage) - check the 5-step wizard works

### Phase 4: Real-time updates (2-3 hours)
1. Port the websocket realtime provider from web/config-app/src/realtime/
2. Use it in ActivityPage and OverviewPage
3. Add live event stream

### Phase 5: Auth context (1 hour)
1. Add AuthContext equivalent for TUI
2. Handle 401 by clearing token and returning to login

---

## Files Changed This Session (uncommitted)

```
M  dev/console/src/App.tsx                            (page map updated, unused imports removed)
M  dev/console/src/api/client.ts                       (added uploadArchive, getLastUploads, getLastDownloads)
M  dev/console/src/components/LoginPrompt.tsx          (fixed cursor with fixed-width field)
M  dev/console/src/components/Sidebar.tsx              (hover support, collapsible categories)
M  dev/console/src/hooks/useMouse.ts                   (added useHover, 1002h mode)
M  dev/console/src/pages/registry.ts                   (rewrote to match web nav-config)
A  dev/console/src/components/tabs/ActivityPage.tsx
A  dev/console/src/components/tabs/ConferencesPage.tsx
A  dev/console/src/components/tabs/ConfigFilesPage.tsx
A  dev/console/src/components/tabs/ConfigurationPage.tsx
A  dev/console/src/components/tabs/HealthDeploymentPage.tsx
A  dev/console/src/components/tabs/LookupTablesPage.tsx
A  dev/console/src/components/tabs/StatisticsPage.tsx
D  dev/console/src/components/tabs/AmiXnetPage.tsx
D  dev/console/src/components/tabs/CallersTab.tsx
D  dev/console/src/components/tabs/OpChatSettingsPage.tsx
D  dev/console/src/components/tabs/SystemStatusPage.tsx
D  dev/console/src/components/tabs/SystemTab.tsx
A  thoughts/shared/plans/2026-09-03-tui-match-web-config-app.md
A  thoughts/shared/research/2026-09-03-tui-audit-stale-data.md
```

---

## Build Status

- `cd dev/console && npx tsc --noEmit` - PASSES
- `cd dev/console && npm run build` - PASSES

Other modified files in git status that are unrelated to this work:
- Bulletins/bull*.txt (runtime state)
- Node*/CallersLog (runtime state)
- USER.DATA (runtime state)
- Conf.DB (runtime state)
- Doors/grandmaster/ui/* (separate work)
- web/backend/tests/doors/compact-40/grandmaster.test.ts (separate work)

---

## Critical References

- **Web config-app entry:** `web/config-app/src/App.tsx`
- **Web nav config (source of truth for sidebar):** `web/config-app/src/components/AppShell/nav-config.ts`
- **Web API client:** `web/config-app/src/api/client.ts` (126 methods)
- **Web types:** `web/config-app/src/types/index.ts`
- **Web workspaces (how merged pages work):** `web/config-app/src/pages/workspaces.tsx`
- **TUI registry (now mirrors web nav):** `dev/console/src/pages/registry.ts`
- **TUI API client (84 methods, missing many):** `dev/console/src/api/client.ts`
- **TUI types (incomplete):** `dev/console/src/api/types.ts`
- **TUI page map:** `dev/console/src/App.tsx` (`PAGE_COMPONENTS`)
- **Audit research doc:** `thoughts/shared/research/2026-09-03-tui-audit-stale-data.md`
- **Plan doc:** `thoughts/shared/plans/2026-09-03-tui-match-web-config-app.md`

---

## When Resuming

1. Read `thoughts/shared/research/2026-09-03-tui-audit-stale-data.md` first - it has the full gap list
2. Read `web/config-app/src/api/client.ts` to see what methods the web has that the TUI is missing
3. Read `web/config-app/src/types/index.ts` to see what types the TUI is missing
4. Don't waste time on what was already done (sidebar match, login cursor, hover effects)
5. Start with Phase 1 (endpoint parity) - port the missing methods
6. Then Phase 2 (types) - copy the type definitions
7. Then Phase 3 (page audit) - fix each TUI page
8. Phases 4-5 are nice-to-haves, not required for "1:1" parity

---

## What "1:1" Should Mean Here

The user said "make the tui match the web ui 1:1 it could probably use the same endpoints etc, exactly the same but text based".

A truly 1:1 TUI:
- Same page list (DONE)
- Same endpoints called (NOT DONE - 42 missing methods)
- Same data shapes (NOT DONE - many types missing)
- Same auth flow (NOT DONE - no 401 handling)
- Same real-time updates (NOT DONE - no websocket)
- Same CRUD operations (NOT DONE - mostly broken)

What I did so far is just step 1 (page list). The remaining 4 are a much bigger job.

---

## One More Thing: Other Things the User Said

- Login cursor moves up when typing first character - FIXED (LoginPrompt.tsx)
- Same for password field - FIXED (LoginPrompt.tsx, same field)
- Sidebar needs hover effects - DONE (Sidebar.tsx, useHover)
- "It would be cool if it was styled the same way as our blessed ui themes as well with animated slashes and colors etc" - NOT DONE. The blessed theme files are in `sdk/src/engines/ui/blessed-lite.ts`. Would need to port the colors, box-drawing characters, and animated elements to the TUI.

---

## Uncommitted State

The work in this session is uncommitted. The user asked for a handoff instead of a commit. Don't commit without asking.

The registry changes look scary (renames, deletions) but the actual TUI was already partially stale before this session, so rolling back wouldn't recover the old data flow - the old data flow was the problem.

Best path: keep the registry changes, do the real data audit per the plan, fix the actual data flow.
