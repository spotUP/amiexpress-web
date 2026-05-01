---
date: 2026-04-27
topic: ganja-wars-door-debug
tags: [dopewars, ganja-wars, door, wasm, debugging]
status: draft
---

# Ganja Wars Door Handoff

## Task
Debugging the Ganja Wars BBS door (TypeScript + WASM, dopewars C source compiled via Emscripten). Door is largely working but has two outstanding issues.

## Critical References
- Door: `Doors/dopewars/`
- WASM source: `Doors/dopewars/wasm-src/`
- Main app: `Doors/dopewars/src/app.ts`
- UI overlays: `Doors/dopewars/src/ui/actions.ts`
- Game server: `Doors/dopewars/src/server.ts`
- Spec: `docs/superpowers/specs/2026-04-27-dopewars-design.md`

## Recent Changes (This Session)
- Fixed key handler accumulation in overlays — added `bindKeys()` to SDK (`sdk/utils/blessed-helpers.ts`), all overlays now properly unregister keys on close
- Fixed `enableGameMode: false` (game mode was swallowing all keys via raw input routing)
- Fixed JSON escaping in `dw_fire_event` / `dw_fire_question` — prompts with special chars were silently dropped, leaving WASM state machine stuck in question state forever (mode='question', all keys blocked)
- Fixed YN^ protocol prefix stripping in question overlay
- Rewrote buy/sell/jet overlays with `createList` (arrow key navigation) + inline amount with [<]/[>]
- Removed vi:true from lists (was causing left/right to jump list selection)
- Added `screen.alloc()` before `screen.render()` in fullRender() to force full dirty-cache reset
- Removed unimplemented K/L/G/D/A from action bar (these are WASM event-driven, not standalone commands)
- Added debug logging: `[GANJA] fullRender ...` and `[GANJA] applyResult ...` in backend.log

## Outstanding Issues

### 1. Main UI not updating after jetting
**Symptom**: User jets to a new location, jet overlay closes, but header (location name/turn), market prices, inventory stay static.

**What we know**:
- `applyResult()` is called (should update `state` and `marketState`)
- `fullRender()` is called with `screen.alloc()` before render (forces full repaint)
- Debug logs `[GANJA]` added to `fullRender` and `applyResult` — check backend.log WHILE USER IS IN DOOR and jetting to see if these fire and what state they show
- If `applyResult` logs show `newLoc=X` (different from starting loc=0), the WASM move IS working
- If `fullRender` logs fire but screen doesn't update, the issue is in output routing

**Hypothesis to investigate**:
- The BBS may be sending continuous mouse move events through the `command` channel (seen in logs: `[<35;30;24M`). These reach `doorInputHandler` → `screen.program.emit('data', ...)`. With `enableMouse: false` on the blessed screen, it might not parse them correctly, potentially corrupting the input stream or causing unexpected screen redraws.
- Try: change `enableMouse: false` → `enableMouse: true` in `app.ts` DoorInputManager options. This lets blessed properly handle mouse events from the terminal.
- Check: if `fullRender()` is NOT being logged at all, the issue is that `server.jetTo` is throwing and `runAction` is catching/showing error in events panel (user might not notice it).

**Debug steps**:
1. Enter GANJA, jet somewhere, immediately check: `./dev/scripts/start-servers.sh` then MCP `tail_log backend.log q=GANJA`
2. Look for `[GANJA] applyResult` and `[GANJA] fullRender` entries
3. If no entries: `runAction` is not running at all (list.on('select') not firing) — investigate createList key handling
4. If entries show correct `newLoc`: output routing is broken — try `enableMouse: true`
5. If entries show wrong `newLoc=0`: WASM move not working — check `server.jetTo` → `wasm.movePlayer`

### 2. Question overlay may still be confusing
**Symptom**: When arriving at loan shark / bank location, question overlay appears. If user doesn't notice it (or presses wrong keys), mode stays 'question' and all main keys (B, S, J) return early.

**What we know**:
- JSON escaping fixed — question prompts should parse correctly now
- Prompt text strips YN^ prefix correctly
- Y/N/ESC are bound via `bindKeys` — should work

**If user gets "stuck"**: the question overlay is showing but keys aren't responding inside it. Check if `screen.program.emit('data', ...)` with mouse sequences is corrupting the input stream.

## Architecture Reminder

```
createList (in overlays) → keys fire on list element
screen.key([...]) → fires on screen regardless of focus
WASM callbacks → pendingEvents / pendingQuestions in server.ts
applyResult() → updates state, marketState, calls fullRender()
fullRender() → screen.alloc() + screen.render()
```

Input routing: BBS socket → `session.doorInputHandler` (set by `setupInputHandler`) → `screen.program.emit('data', data)` → blessed parses → fires `screen.key()` handlers

## Next Steps (Ordered)
1. Get user to enter GANJA and jet — check `[GANJA]` debug logs immediately
2. If rendering: try `enableMouse: true` in DoorInputManager
3. Remove debug console.logs from app.ts once issue is confirmed fixed
4. Test full game loop: jet → question → answer → market updates
5. Consider: glib-stub.h already moved to SDK (`sdk/utils/c-stubs/`) for future WASM doors

## Last User Prompts
- "the main ui is still not updating when i jet"
- "k, l, d doesnt work at all" (fixed: removed from action bar)
- "the active line jumps to the bottom when i press left/right" (fixed: removed vi:true)
- "write a handoff so we can start a new session"
