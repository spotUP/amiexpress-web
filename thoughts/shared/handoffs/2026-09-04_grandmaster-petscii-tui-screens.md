---
date: 2026-09-04
topic: Grandmaster PETSCII, admin roles, operator chat, screen revisions, mailscan fix
tags: [grandmaster, petscii, admin, chat, screens, mailscan, deployments]
status: final
---

# Session Handoff: Grandmaster PETSCII + Admin Overhaul + Operator Chat — 2026-09-04

## TL;DR
Six arcs across two days:

1. **Grandmaster** — PETSCII 40-col compact GameScreen layout, fixed TETRIS ATTACK animation speed, mail scan loop, MSG_READER_NAV single-char
2. **TUI Console** — screen management (browse, preview, delete, repair), theme tokens on all remaining hardcoded-color pages
3. **Admin access control** — remember-me checkbox, access level gating, admin roles page, sprite manager page
4. **Operator Chat** — AI bot typing/commit ANSI fix, sysop take-over, notification permissions, classic/terminal mode fixes, typing speed/typo/think-time sliders
5. **Screen Revisions** — snapshot-on-write with 10-revision history, preview and restore from the detail panel
6. **Mailscan** — same-messages-appear-new-every-login bug, repair-headers endpoint, dual-storage resync

---

## WHAT WAS DONE

### 1. Grandmaster — GameScreen 40-col compact layout
- **Added `isCompactWidth` import** from SDK responsive-constants (`game-screen.ts`)
- **`setupUI()`** early-return branch: board box expands to `screenWidth - 2` at left:1, all side panels set to `null` (`nextBox`, `holdBox`, `gradeBox`, `statsBox`, `sectionBox`, `zoneBox`)
- **`render()`** — guarded all side-panel updates behind null checks
- **`renderZone()`** — early return when `zoneBox` is null
- **Shake offset** — uses compact left position (1 vs 2)
- **Rainbow borders + cleanup** — already safe via optional chaining

### 2. Grandmaster — TETRIS ATTACK + menu fixes
- Stack: added `cancelKeyboardSwap` field, `requestMouseSwap(row, col)` method
- Controls: checks `cancelKeyboardSwap` to prevent keyboard undoing mouse click
- PanelsScreen: mouse click handler
- Animation speed: FLASH 44→20, FACE 20→10, POP 9→4 (all ms)
- Menu compact layout: all 19 items at every width, compact boot with rainbow animation
- Sprite files: replaced Unicode with PETSCII-safe ASCII chars

### 3. TUI Console — theme tokens migration
Six files migrated from hardcoded color strings to `T.*` theme tokens:
- `HelpOverlay.tsx` — `cyan`→`T.accent`/`T.chrome`, `yellow`→`T.warn`
- `RestartDialog.tsx` — `cyan`→`T.accent`, `green`→`T.ok`, `yellow`→`T.warn`
- `ConfirmDialog.tsx` — `yellow`→`T.warn`, `green`→`T.ok`, `red`→`T.alert`, `white`→`T.ink`
- `SystemTab.tsx` — `cyan`→`T.accent`, `yellow`→`T.warn`, `green`→`T.ok`, `white`→`T.ink`, `gray`→`T.dim`
- `CallersTab.tsx` — `cyan`→`T.accent`, `yellow`→`T.warn`, `red`→`T.alert`, `white`→`T.ink`
- `AmiXnetPage.tsx` — `cyan`→`T.accent`, `yellow`→`T.warn`, `red`→`T.alert`, `green`→`T.ok`, `white`→`T.ink`

### 4. Font + modem speed cookies
- **`session-cookie.ts`** — read/write font & modem speed to cookies (365-day expiry, SameSite=Lax)
- **`session-font.ts`** — `readCachedFont()` falls back to cookie when localStorage unavailable; `writeCachedFont()` writes both stores
- **`BBSTerminal.tsx`** — modem speed read from cookie before socket connects; persisted on every `modem-speed` event

### 5. Admin access control & remember-me
**Backend:**
- **`requireLevel(minLevel)` middleware** — reusable guard, `auth.middleware.ts:72-88`
- Login relaxed from `secLevel >= 255` to `>= 10` (`auth.handler.ts:65`)
- `/auth/me` — only requires authentication, no longer sysop
- `/api/screens` — `requireLevel(100)` instead of sysop
- All other admin routes stay at `requireSysop()`
- `rememberMe` parameter — 30-day refresh token vs 7-day default

**Frontend:**
- Login page: remember-me checkbox, redirect by secLevel (sysop→system, editor→screens)
- `SysopRoute` guard — wraps sysop-only routes, checks live perms
- Sidebar filtered by `navItemsForLevel(secLevel, perms)` — ANSI artists see only Overview + Screens
- `login()` returns user object for post-login navigation

### 6. Admin Roles page
- **`backend/src/handlers/admin/admin-permissions.handler.ts`** — JSON file in `config/AdminPerissions.json`
- GET/PUT `/api/admin-permissions` — syop-only, returns perms + section list
- **Frontend `AdminRolesPage.tsx`** — table of all 18 admin sections, each with inline-edit minimum SL
- Sidebar filter uses live perms from AuthContext
- Sysop Route checks live perm for current route path

### 7. Sprite Manager page
- **`SprteManaerandler.ts`** — listDoors, listSrites, readSrite, wrieSrite, deleeteSrite
- Path resolution guards (same containment model as `sprite-editor/asets.ts`)
- Frontend: door sidebar, sprite table with JSON preview, upload, download, delee

### 8. Operator Chat — bot fixes
**ANSI rendering (critical):**
- **`sendBotMessageWithTyping`** — typing preview on line 23, commit to scroll region (line 22)
- Each character: save cursor → clear line 23 → draw preview → restore cursor
- Typo characters on line 23 with backspace correction
- Commit: clear preview, `\x1b[22;1H`, write full message block, restore cursor to line 24

**`sendChatMessage` ANSI fix:**
- Was writing to line 23 (typing preview area) — never scrolled
- Now: save cursor, position at `\x1b[22;1H`, write block, restore cursor

### 9. Operator Chat — sysop take-over
- `acceptPage` now allows real sysop to take over bot-controlled page (status ACCEPTED, sysopId=bot)
- `isBotControlled` cleared, `botBusy` stopped, message history reset
- `operator:get-active-chats` socket event, `operator:bot-activated` event
- Frontend: "Take Over" button in bot-handled chats section

### 10. Operator Chat — notification permissions
- `Notification.requestPermission()` called on socket connect (user-gesture), not silently in no-gesture useEffect
- Fixed Notification API checks to avoid undefined errors

### 11. Operator Chat — classic/terminal mode, keystroke fixes
- Classic mode is now the default
- Keystroke transmission in classic mode: onChange sends added chars, onKeyDown sends Backspace/Enter
- Local echo to prevent interleaving (bot response arriving before echo)
- Dedup filter for local-echo vs server-echo (both modes)
- Enter key echo now positions in scroll region, not clobbering input line
- `[AI]` badge next to GrumpyBot messages

### 12. Operator Chat — typing speed sliders
Backend:
- `botTypingSpeed` (5-200ms/char), `botTypoProbability` (0-0.5), `botThinkTime` (0-5000ms) added to OperatorChatConfig and DB schema
- `simulateNaturalTyping()` accepts optional options
- `AIProviderConfig` extended with bot typing behaviour

Frontend:
- Three range sliders in Operator Chat Settings

### 13. Screen Revisions
Backend `screen-revisions.ts`:
- `saveRevision(relPath)` — snapshots file to `Screens/.Revisions/<safeName>/<ts>_<hash>.bin` before overwrite
- 10 revisions kept per file, auto-prune oldest, skip duplicate (same hash as latest)
- `listRevisions()`, `readRevision()`, `restoreRevision()`
- `writeToTargets()` now calls `saveRevision()` before every write

API routes (in `screens-routes.ts`):
- `GET /api/screens/revisions?path=` — list with timestamps
- `GET /api/screens/revision?path=&file=` — view as base64
- `POST /api/screens/restore` — restore, snapshoting current first

Frontend:
- `ScreenRevisionsPanel` — collapsible list with timestamp, size, inline ANSI preview, restore button
- "Revisions" button in file detail panel

### 14. Mailscan fix — same messages appearing new on every login
**Bug 1 — `advanceConferenceScan` never updated `session.lastNewReadConf`:**
- The login scan path updated the scan pointer in the DB but left `session.lastNewReadConf` at its stale value
- When user left conference, `confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf` wrote the stale 0 back
- Fix: `session.lastNewReadConf = lastScanned` after both `updateScanPointer` calls

**Bug 2 — `validatePointers` reset to 0 instead of `lowestKey`:**
- When `pointer > highMsgNum` after message packing, express.e clamps to `lowestKey`
- Web backend reset to 0, making ALL messages appear new
- Fix: clamp at `mailStat.lowestKey`

**Bug 3 — Session overwrites DB on conference exit:**
- `< >` navigation calls `saveMsgPointers()` which writes `session.lastNewReadConf` to DB
- If pointer was advanced by scan but session not updated, the old value wins
- Fix above (#1) prevents this

### 15. Message repair endpoint
- `POST /api/config/messages/repair-headers?conf=N`
- Iterates all message bases, reads DB messages, writes any missing body files, rebuilds HeaderFile + MailStats
- `MessageIndexManager.rebuildHeaders()` — public method for this

### 16. Deployment fixes
- **Entrypoint crash**: `set -e` before `exec "$@"` caused container exit 1 after entrypoint
  - Fixed by removing `set -e` before exec (two rounds: missing Protocols.info/batch2.info warnings, then the `write /dev/stdout: broken pipe` issue)
- **Volume not mounted**: `docker run` without volume created empty container
  - Fixed by using `docker compose up -d --build` from `/app/amiexpress/`
- **Health check timeout**: increased from 60s to 120s for slow builds

### 17. Chat bot crashes and hang fixes
- **Bot intro message infinite loop**: `getGrumpyBotIntroMessage` called `sendChatMessage` which triggers bot, which calls intro message → infinite recursion
  - Fix: bot intro message written directly via `ansi-output`, not through `sendChatMessage`
- **Flickering commit**: bot typing preview writes char-by-char to line 23, then commit block overwrites. Both use `\x1b7`/`\x1b8` so cursor is preserved.
- **Cursor position bot commit**: committed message was written at cursor position (line 24), clobbering user input. Fixed to write at `\x1b[22;1H`.
- **Bot message duplicate**: `sendBotMessageWithTyping` emitted `operator:message` but `addChatMessage` also triggered it → duplicate in admin UI
  - Fix: dedup filter on senderHandle+content
- **User message after bot response**: user message written via `sendChatMessage` which emits ANSI to line 23 (clobbers preview). Fixed by writing to scroll region at line 22.

## Critical file locations

| what | where |
|------|-------|
| GameScreen compact layout | `Doors/grandmaster/ui/game-screen.ts` |
| Font cookie persistence | `packages/terminal/src/utils/session-font.ts` |
| Modem speed cookie | `packages/terminal/src/utils/session-cookie.ts` |
| Admin permissions handler | `web/backend/src/handlers/admin/admin-permissions.handler.ts` |
| Admin roles page | `web/config-app/src/pages/AdminRolesPage.tsx` |
| Sprite manager handler | `web/backend/src/handlers/admin/sprite-manager.handler.ts` |
| Sprite manager page | `web/config-app/src/pages/SpriteManagerPage.tsx` |
| requireLevel middleware | `web/backend/src/middleware/auth.middleware.ts:72` |
| Bot ANSI rendering | `web/backend/src/handlers/operator-chat.handler.ts:795` (sendBotMessageWithTyping) |
| Human chat ANSI | `web/backend/src/handlers/operator-chat.handler.ts:1093` (sendChatMessage ANSI block) |
| Chat settings sliders | `web/config-app/src/pages/OperatorChatSettingsPage.tsx` |
| Screen revisions module | `web/backend/src/screens/screen-revisions.ts` |
| Screen revisions panel | `web/config-app/src/pages/ScreenRevisionsPanel.tsx` |
| Mail scan pointer sync | `web/backend/src/handlers/message/message-scan.handler.ts:751,768` |
| validatePointers fix | `web/backend/src/utils/message-pointers.util.ts:306,312` |
| rebuildHeaders | `web/backend/src/services/MessageIndexManager.ts:334` |
| Repair endpoint | `web/backend/src/api/config-routes.ts:2407` |
| Theme tokens migration | `dev/console/src/components/*.tsx` (6 files) |

## OPEN ITEMS

(none)

## Gotchas added this session

- **A deploy without the volume mount loses all data.** Always use `docker compose up -d` from `/app/amiexpress/`, never bare `docker run`.
- **`set -e` kills the container if ANY entrypoint step fails.** The last `exec "$@"` line must not be guarded by it — removed.
- **`session.lastNewReadConf` is NOT automatically synced to `lastScanned`.** Every place that updates the DB pointer must also update the session, or the session's stale value will overwrite the DB on the next `saveMsgPointers()` call.
- **Bot ANSI must write to scroll region, not line 23.** Typing preview is line 23. Committed text goes to line 22 so `\r\n` scrolls properly within the scroll region.

## Live

`https://bbs.uprough.net`, commit `a08933fa4` deployed and healthy.