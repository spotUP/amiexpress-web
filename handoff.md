# Handoff

## Current State
LiveChat /chat/ SSO + voice/video pipeline working end-to-end. Cross-tab BBS leak and livechat disconnect→BBS-prompt bugs fixed.

## Done This Session
- **Cross-tab BBS→chat leak fix** — `web/backend/src/server/session-manager.ts:250-266`. `setSession()` now skips `userSessions.set()` when `session.chatOnly === true`. Previously: opening /chat/ on tab B called `setSession(socketB, sessionB)` which overwrote `userSessions[userId]` from sessionA (BBS) to sessionB. After that, `getSessionBySocketId(socketA)` routed through `socketToUser[socketA] → userId → userSessions[userId] = sessionB`, causing BBS door output (AquaScan file listings, `Enter your Line:`, etc.) to be emitted to the chat tab's socket. Fix keeps BBS session as the primary user session; chat sessions are only reachable via socketId→nodeId→sessions map.
- **Livechat BBS-prompt-after-disconnect fix** — `web/backend/src/handlers/door.handler.ts:1864-1870, 1925-1929`. When the livechat door exited (including on socket disconnect), `executeTypeScriptDoor`'s post-cleanup called `displayMainMenu()` which emitted the BBS main menu. For chatOnly SSO sessions there is no BBS context to return to, so /chat/ ended up showing a BBS login prompt. Fix: skip `displayMainMenu()` in both normal-exit and error-exit branches when `session.chatOnly === true || session.tempData?.chatOnly === true`. Reconnect flow still works — new socket hits SSO path (`index.ts:1187-1223`) and relaunches livechat on a fresh nodeId.
- **Nested video-tile frames fix** — User reported tile wrapped in ~4 nested borders. Root cause:
  1. `Doors/livechat/features/video-grid.ts` — `blessed.box()` (Panel default) adds a blue line border around the whole grid → **removed** (`border: undefined`).
  2. `Doors/livechat/ui/video-tile.ts` — inner `new Video(...)` widget defaults to `{ type: 'line' }` border → **replaced** with `blessed.box({ border: undefined })`.
  3. Same file — placeholder content drew ASCII `┌─┐│└─┘` box characters inside the videoBox → **replaced** with plain centered "WAITING FOR VIDEO..." text.
  Result: only the tile's own outer `container` border remains (the one users expect).
- `tsc --noEmit` clean after both fixes.

## Earlier Session
- **SSO /chat/ login** — JWT auth middleware → executeDoor(livechat). `web/backend/src/index.ts:1187-1224`.
- **Duplicate SDK Door.ts bug** — TWO Door.ts files: `sdk/core/Door.ts` AND `sdk/src/core/Door.ts`. ServerDoor imports from `../src/core/Door`. src/ was missing `ctx.audio`/`ctx.video`. Added Audio/Video instantiation + type fields (`sdk/src/core/types.ts`). ALWAYS edit both if changing createContext.
- **SDK Audio/Video ack-hang** — `startStreaming`/`startStream` awaited ack that ClientDoor never calls. Changed to fire-and-forget. `sdk/media/Audio.ts`, `sdk/media/Video.ts`.
- **Video pipeline** — `Doors/livechat/client.ts` getUserMedia (320x240) → canvas → ASCII → `socket.emit('video:frame')` → server forwards via `sdk/client/index.ts` SERVER_FORWARD_EVENTS → `Video` SDK → `ui/video-tile.ts` blessed render.
- **Video ANSI parsing** — SDK blessed doesn't parse raw `\x1b[38;2;r;g;bm` in `setContent`. Only blessed tags work. Hardcoded `colored: false` in `features/voice-channel-ux.ts:534`.
- **Tile bg** — Forced `bg: 'black'` in `ui/video-tile.ts:103` (was hash-of-username magenta).
- **Hybrid door input routing** — `socket-handlers.ts:686-695` — when `clientDoorActive && inDoorManager && doorInputHandler`, route input to server handler.
- **Frontend auth** — `web/frontend/src/chat/ChatTerminal.tsx` reads authToken from localStorage, passes in socket auth.

## Not Fixed / Known Issues

### 1. Mouse codes at bottom of terminal — NON-ISSUE (don't chase)
User confirmed NOT reproducible. Browser correctly forwards SGR mouse codes via `socket.emit('command', data)`. DO NOT re-investigate unless user reports again.

## Key Files Touched
- `sdk/src/core/Door.ts` + `sdk/src/core/types.ts`
- `sdk/media/Audio.ts`, `sdk/media/Video.ts`, `sdk/client/index.ts`
- `Doors/livechat/client.ts`, `features/voice-channel-ux.ts`, `features/video-grid.ts`, `ui/video-tile.ts`
- `web/backend/src/index.ts` (SSO branch)
- `web/backend/src/server/session-manager.ts` (chatOnly userSessions guard)
- `web/backend/src/server/socket-handlers.ts` (hybrid input routing)
- `web/backend/src/handlers/door.handler.ts` (chatOnly menu suppression)
- `web/frontend/src/chat/ChatTerminal.tsx`

## Debugging Notes
- **Backend log:** `/Users/spot/Code/amiexpress-web/logs/backend.log`. Markers: `[sdk/Audio] Emitting`, `[sdk/Video] Emitting`, `[Voice DEBUG]`, `[DoorSocket] Intercepting`, `[ClientDoorBridge] Parsed key`, `[LIVECHAT CLEANUP]`.
- **User manages servers manually.** Do not run start-servers.sh / kill-servers.sh unless asked. Door watcher auto-rebuilds on dist/ change. Manual: `cd Doors/livechat && npm run build`.
- **SDK dist has parallel paths:** `sdk/dist/core/Door.js` AND `sdk/dist/src/core/Door.js`. ServerDoor uses `src/` version.

## Cleanup Needed
- 140+ uncommitted files (many build artifacts). Review .gitignore.

## Cleaned Up This Session
- Removed diagnostic console.logs: `[Voice DEBUG]` (3 sites in `Doors/livechat/features/voice-channel-ux.ts`), `[sdk/Audio] Emitting` (`sdk/media/Audio.ts`), `[sdk/Video] Emitting` (`sdk/media/Video.ts`).

## Deployment
Push to main → SSH 89.167.21.154 → `docker rm -f amiexpress-bbs; docker compose up -d --build`
