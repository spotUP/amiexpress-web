---
date: 2026-04-25
topic: door-sweep-and-hybrid-fixes
tags: [doors, hybrid, sdk, blessed, 68k]
status: implemented
---

# Door sweep + hybrid door rescue (2026-04-25)

## Tasks
Audit and repair every TypeScript / hybrid / 68K door reported broken across two
working sessions. Started as "fix NeoShowcase" → expanded into a full door-sweep
after the user found cascading regressions (LiveChat, Card Lobby, Galaga,
Bubble-bobble, Arkanoid, Bug-tracker, GLC, etc. all not starting or crashing).

## Critical references

### Files modified (high-impact)
- `web/backend/src/handlers/door.handler.ts` — `executeTypeScriptDoor` SDK / hybrid /
  RPC-only routing logic. The decisive fix is `isHybridRPCOnly` (line ~1670+) which
  must NOT match SDK doors that happen to be hybrid.
- `sdk/utils/gamepad-input-manager.ts:48` — null-guard on `bbsSession.on(...)` so
  client-side games (arkanoid) and arcade `index.ts` files (passing `ctx.session`
  before our alias landed) don't crash on construction.
- `sdk/core/Door.ts:170` — added `session: bbsSession` alias in `createContext` so
  `ctx.session` works for old arcade door code.
- `sdk/core/types.ts:680` — added optional `session?: any` to `DoorContext` interface.
- `web/backend/src/amiga-emulation/DoorLoader.ts:142` — empty-binary guard before
  passing buffer to `hunkLoader.parse()`. 0-byte file → throw, not segfault.
- `web/backend/src/doors/door-api-routes.ts:54` — serve pre-built bundle in dev too.
- `web/backend/src/doors/amigaDoorManager.ts:1393` — DOORMAN delete: read
  `pkg.doorMetadata.command` not `pkg.bbsCommand`.
- `web/backend/src/doors/BBSApi.ts:1346` — call `initializeDoors()` after door delete
  so the in-memory `doors` array is reloaded.
- `web/backend/src/handlers/door.handler.ts:3384` — `getDoorSize` now resolves
  AmigaDOS assigns (`Doors:`, `BBS:`) before `path.join` so XIM doors don't show 0 B.
- `Doors/bug-tracker/app.ts:2161,2229,2328` — three dialog methods now save
  `screen.focused` before show and restore it on cleanup. Fixes the freeze + delays.
- `Doors/glc-viewer/index.ts:344-380` — added `res.on('error')` + settled flag so
  mid-download disconnects don't escape as uncaught exception → process crash.

### Reference docs / commits
- Memory: `~/.claude/projects/-Users-spot-Code-amiexpress-web/memory/project_door_bug_backlog.md`
- Prior handoff: `handoff.md`
- Key commits (in order): `97ed1e911`, `d5b9d0782`, `10c693dc1`, `d857b1588`,
  `2ecded665`, `bfbf4ba57`, `1d5b87ee3`, `62f9ed8ed`, `6eed13570`, `56729b58a`,
  `80ff02ae5`, `e0a851fe3`, `9938021ff`, `ae6bcc5d1`.

## Recent changes (this session)

### NeoShowcase audit (~9 fixes)
ANSI block image demo, color art rename, special widgets cleanup with viewport demo,
LCD width fix, donut height, picture demo content, ASCII video matrix rain, list
wheel throttle in SDK, ghost border fix via `clearRegion + alloc`.

### Door infrastructure (the big wins)
1. **`isHybridRPCOnly` was matching every hybrid SDK door** because the fallback
   branch was `typeof default === 'object' && default`. Every CoreDoor IS an object,
   so hybrid SDK doors (livechat, card-lobby, galaga, frogger, bubble-bobble,
   arkanoid, etc.) had `execute()` skipped and exited immediately. Gated the
   fallback on `!isSDKDoor && !hasRunDoor`.
2. **Hybrid RPC-only doors didn't `enableGameMode()`**, so the terminal's
   `onData` handler kept forwarding raw key events to the BBS command processor.
   Pressing Q to quit arkanoid simultaneously triggered shutdown AND a `'q'` BBS
   command — after `inDoorManager` cleanup, the BBS processed `'q'` and "restarted"
   the door. Fix: emit `socket.emit('game-mode', true)` immediately before
   `waitForSessionEnd`.
3. **GamepadInputManager crashed on construction** when bbsSession was null/undefined
   — guard the `.on('gamepad', ...)` call.
4. **`ctx.session` was undefined** — DoorContext only had `bbsSession`. Added
   `session: bbsSession` alias for old arcade door code.
5. **DEV bundle endpoint always ran esbuild** even when pre-built `dist/client.bundle.js`
   existed; esbuild failed on absolute SDK paths. Now serves pre-built bundle in
   all environments.
6. **0-byte binary crash** propagated past `AmigaDoorSession.start()`'s try-catch
   as an uncaught exception. `DoorLoader.loadDoor()` now throws a clean error
   immediately after reading.
7. **DOORMAN delete left in-memory door registry stale** — `getDoors()` still
   returned the deleted door. Now reloads via `initializeDoors()` after success.
8. **CHECKUP** SQL typo: `upload_date` → `uploaddate`.
9. **XIM doors with missing binary** (`ARCL`, etc. → `Doors:bbslink/bbslink`) now
   redirect to the TypeScript door at the parent directory, transparent to the user.
10. **All 19 TS doors** got the `clearRegion + alloc` ghost-border fix.
11. **Bug-tracker dialogs** weren't restoring focus → screen freeze + key delays.
12. **GLC viewer crash hardened** — response stream error handler.

### Post-session deferred-issue investigation
Confirmed via `web/backend/src/scripts/run-amiga-door.ts` test harness:
- **GA (GetAnswer)**: NOT a bug — door prompts "Enter handle/usernr >:" and waits.
- **CTOP**: writes garbage date (`0x04006920` = 67M+ days) into freshly created
  `Conftop.Data`. Subsequent reads reject "Reset date is out of range". Inside
  68K binary; out of scope.
- **CS (AquaScan)**: in test harness fails earlier with "Tooltype DOORUSE. missing!"
  because EXPRESS_VERSION reply doesn't carry the command. The user-reported
  "Couldn't load area icon!!" is a downstream error after that gate is cleared
  in real BBS context.

## Learnings / gotchas

1. **`isHybridRPCOnly` detection is fragile** — must distinguish "server module
   that exports rpcHandlers AND only rpcHandlers" from "server module that exports
   the actual SDK door object". Cleanest signal: `!isSDKDoor && !hasRunDoor`.

2. **Hybrid doors that don't go through `doorInstance.execute()` MUST
   manually emit `game-mode: true`** — otherwise terminal `onData` leaks every
   keypress to the BBS, and quit-key handling gets duplicated.

3. **`ctx.session` was never a real DoorContext field**, but enough old arcade
   doors used it that adding it as an alias is cheaper than fixing each door.

4. **DOOR.SYS / DORINFO drop files** are NOT the cause of any of these issues —
   our `executeAmigaDoor` and `executeTypeScriptDoor` both create them properly.

5. **The test harness `run-amiga-door.ts`** runs without full BBS state
   (no command params via EXPRESS_VERSION, no node assigns), so doors that
   depend on these fail differently than in production. Useful for confirming
   "binary doesn't crash" but not for "exact same error as user sees".

6. **`SKIP_SIZE_CHECK=1`** still required for every commit because
   `Doors/neo-blessed-showcase/app.ts` (3753 lines), `web/backend/src/handlers/door.handler.ts`,
   and a few others are over the 2000-line hook limit. Pre-existing oversize.

## Artifacts
- 14 commits this session — see `git log --oneline -20`.
- Memory updates:
  - `project_door_bug_backlog.md` — running list of door state.
- No PRs (committed direct to `main`).

## Next steps (ordered)

### Quick wins still on the table
1. **CTOP** — try wrapping `dos.library DateStamp()` calls to log inputs/outputs in
   detail and see why the binary writes `0x04006920`. Could be that we return
   the DateStamp pointer in D0 incorrectly, causing the binary to read register
   garbage as the date.
2. **CS (AquaScan)** "Couldn't load area icon!!" — get a real BBS-context trace
   (run via `start-servers.sh --debug` and capture `[icon.library]` GetDiskObject
   calls). Likely a `GetDiskObject("Conf{N}/Dir{X}")` resolving to a wrong path.
3. **ED (5D-Edit)** — needs interactive audit. User said "almost works."
4. **MgzListMan** — original AmigaOS binary missing. If the user can supply it,
   the door should "just work" via our XIM redirect or directly.

### Architectural follow-up
5. **Split `livechat/server.ts`** (2360 lines, over the 2000-line hook).
6. **Add `enableGameMode()` to BBSApi** so any future client-side door can call it
   explicitly, and consider auto-enabling for any door where `inDoorManager` is set
   without a `doorInputHandler`.
7. **Decide on the CTOP situation** — either disable the door (hide from menu),
   replace with a TS implementation, or fix the 68K date-write path.

## Other notes
- **Server is currently running** (started via `nohup ./dev/scripts/start-servers.sh
  --bbs-only`) on default ports.
- **User confirmed all the major fixes work** — checkup, doorman, livechat, card-lobby,
  galaga/frogger/etc., arkanoid (start + quit + no restart), bubble-bobble.
- **All `SKIP_SIZE_CHECK=1` bypasses were for pre-existing oversize files** — never
  for our own additions.
