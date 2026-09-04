# TUI to Web Config App Audit

## Current State
The TUI sidebar structure now matches the web config-app, but the data flow is stale.

The web refactor changed:
- Auth flow (now uses AuthContext with proper 401 handling)
- API client (811 lines, 126 methods, with proper retry logic, auth error handling)
- Real-time events (websockets for live data)
- Many new endpoints (operator chat, global wall, ACS levels, file checker errors, etc.)
- Data shapes (many entities gained `createdAt`, `updatedAt`, `getOne`/`getAll` patterns)

The TUI is still using its 84-method client that pre-dates the web refactor.

## API Methods Gap (web has, TUI does not)

### Web-only methods that the TUI should have:
- `me()` - validate token, get current user
- `logout()` - clear session
- `getNodeConfigs()` / `getNodeConfig(n)` / `createNodeConfig()` / `updateNodeConfig()` / `deleteNodeConfig()` - node configuration CRUD (the web has this as a separate "Configuration" tab in the NodesWorkspace)
- `getConferenceConfigs()` / `getConferenceConfig(n)` / `createConferenceConfig()` / `updateConferenceConfig()` / `deleteConferenceConfig()` - conference config CRUD
- `getDoor(id)` / `createDoor()` / `updateDoor()` / `deleteDoor()` / `uploadDoorArchive()` - full door CRUD + upload
- `installDoorArchive(archive)` - install uploaded archive
- `getAcsLevels()` / `getAcsLevelFlags(level)` / `saveAcsLevelFlags()` / `createAcsLevel()` - ACS (Access Control System) management
- `getSecurityAccessForLevel()` / `createSecurityAccess()` / `updateSecurityAccess()` / `deleteSecurityAccess()` - security access CRUD
- `getScreenType(id)` / `getFileChecker(id)` / `getDrive(id)` - single-entity gets
- `getFileCheckerErrors()` / `createFileCheckerError()` / `deleteFileCheckerError()` - file checker errors
- `getUser(id)` / `createUser()` - single user get, user create
- `getAuditLog(tableName?, recordId?, limit?)` - audit with record id filter
- `getSSHKeyInfo()` / `generateSSHKey()` / `deleteSSHKey()` - SSH key management
- `testSmtp()` - test SMTP config
- `getLogs(type, lines, search, doorLog)` - logs with search
- `getDoorLogFiles()` / `clearLogs()` - log management
- `getBatches()` / `getBatch()` / `saveBatch()` / `validateBatch()` - batch editor
- `getSessionLogRaw()` / `saveSessionLog()` / `getSessionStats()` - session log
- `getInfoFile()` / `updateInfoFile()` / `toggleTooltypeComment()` - info file editing
- `getOperatorChatConfig()` / `updateOperatorChatConfig()` - op chat config
- `getGlobalWallComments()` / `updateGlobalWallComment()` / `deleteGlobalWallComment()` / `getGlobalWallConfig()` / `updateGlobalWallConfig()` - global wall

### TUI-only methods (the web doesn't have them):
- `reloadDoors()` - the web uses different reload mechanism
- `startNode()` / `exitNode()` / `reserveNode()` / `sysopLoginNode()` / `setQuietMode()` - these are TUI's old Nodes control methods (the web has `getNodes()` differently)
- `kickNode()` / `chatNode()` - same
- `fixConference()` - the web doesn't have this specific endpoint
- `getConferenceHealth()` - the web doesn't have this
- The TUI's `updateUser()` is a different signature than the web's

## Data Shape Gaps

The web has proper TypeScript types in `web/config-app/src/types/` that the TUI doesn't have. The TUI's `types.ts` is missing:
- `User` with proper security level
- `Door` with full schema (door_name, door_command, door_type, etc.)
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
- Real-time event types (`BBSEvent`, `BBSEventType`)

## TUI Pages That Don't Actually Work

Most TUI pages still use the old API client and would 404 on the backend. Even pages I "matched" to web pages (like StatisticsPage, ActivityPage) are using stale TUI data shapes.

## Real-time Updates

The web has a real-time socket (`realtime/RealtimeProvider.tsx`) that streams BBS events. The TUI has nothing similar. Activity page on the web updates in real-time; the TUI polls every 15-30s.

## Plan for Real Fix

This is a multi-day task, not a single fix. The minimum viable path:

### Phase 1: Endpoint parity (2-3 hours)
- Port the missing 40+ API methods from the web client to the TUI client
- Match the web's return shapes (the web returns `{ success, data, message }` consistently)

### Phase 2: Type parity (1-2 hours)
- Copy/adapt the web's types to the TUI's types.ts
- Make every TUI component use the new types

### Phase 3: Page-by-page (4-8 hours)
- Audit each TUI page against its web counterpart
- Fix data flow, fix broken operations
- Add missing features (e.g. ACS levels management is a major web page with no TUI equivalent)

### Phase 4: Real-time (2-3 hours)
- Port the websocket realtime provider
- Update Activity page to use real-time events

Total: 10-16 hours of focused work.

## Recommendation
The sidebar match was the easy part. The hard part - making the data actually flow correctly - is a separate project. I should:
1. Acknowledge the data is stale
2. Pick the highest-value pages to fix (probably Statistics, Activity, Configuration, Doors, Users - the ones that show real numbers)
3. Fix those, not pretend everything is done
