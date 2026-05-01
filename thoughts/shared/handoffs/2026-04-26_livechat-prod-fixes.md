---
date: 2026-04-26
topic: livechat prod fixes, SGR leak, deploy pipeline, /chat login, Latin-1, 30fps
tags: [livechat, prod, deploy, sdk, blessed, docker, ctop]
status: implemented
---

# LiveChat prod blitz + deploy pipeline hardening (2026-04-26)

## Sessions context

Started from `2026-04-25_d0-audit-and-prod-fix.md` backlog item 1 (DoorManager prod fix). Ended up fixing a cascade of live-site livechat issues reported by users in real-time.

## What was shipped

### DoorManager prod fix (backlog item 1)
- `web/backend/src/services/door-install.service.ts` (NEW) — in-process door registration replacing the dev-only `spawn` of `install-sdk-doors.ts`
- `web/backend/src/doors/DoorManager.ts:772-785` — replaced spawn block with `registerDoor({doorPath, bbsCommandsDir})` + `initializeDoors()` reload

### CTOP Conftop.Data (backlog item 3 partial)
- Deleted all tracked `Conf*/Conftop.Data` files (poisoned by pre-fix D0 bug)
- Added `Conf*/Conftop.Data` to `.gitignore` — it's a runtime file
- CTOP now recreates `Conftop.Data` on first run with correct DateStamp. `dupestart1` command confirmed working on live.

### Deploy pipeline hardening
- `.github/workflows/deploy-hetzner.yml` — added `set -euo pipefail` to SSH script + container freshness check (age > 600s = fail)
- `web/frontend/package.json` — vitest `^4.1.5` → `^3.2.4` (vitest@4 requires vite@6, project pins vite@5; npm ci was failing silently in Docker)

### SGR mouse leak (`[<35;X;Y;M` visible as text)
- `web/backend/src/server/socket-handlers.ts` — added regex guard before ANSI_PROMPT handler fall-through:
  ```ts
  if (/^\x1b\[<\d+;\d+;\d+[Mm]/.test(data)) return;
  ```

### Format/emoji picker (List.setItems stale cache)
- `sdk/engines/ui/blessed/widgets/list.ts` — `setItems()` now invalidates `_lines` cache before `_updateContent()`. Without this, `previousSelected === selected === 0` fast-path skipped full rebuild when switching categories.
- `sdk/engines/ui/blessed/widgets/category-picker.ts` — `scrollbar: false` on categoryList (freed 1 col), `categoryWidth: 14` (was 12, was clipping "Emotions"), click-outside bound to `mousedown` (screen never emits `click`)

### /chat login on live site
- `Doors/livechat/chat-only-login.ts` — replaced hardcoded `/Users/spot/...` dev path with `path.resolve(process.cwd(), 'src/database')`; removed SGR drop from `doorInputHandler` that was blocking mouse clicks to the modal

### Latin-1 chars (å ä ö ü etc.)
- `sdk/engines/ui/blessed/core/program.ts` — single-byte acceptance widened from `>= 32 && <= 126` to `>= 32 && !== 127 && !(>= 128 && <= 159)`. Drops C1 control codes, passes all Latin-1 printable chars.

### Typing-preview performance
- `Doors/livechat/server.ts` — throttle at 33ms (30fps), `_typingFingerprint()` hashes typingBuffers + message count + animation count; `_doRebuild()` skips setContent+render when fingerprint unchanged

### Command suggestion UX
- `Doors/livechat/server.ts` — `white-fg` on selected row (was overridden by inline `{cyan-fg}`), `inputBox.focus()` + `setImmediate` re-focus after suggestions open

### Emoji → ASCII
- `Doors/livechat/utils/emojis.ts` — all Unicode symbols converted to ASCII equivalents (★→*, ♥→<3, ⚡→/!\, kaomoji rewritten)

### Rate limit
- `web/backend/src/index.ts` — `MAX_CONNECTIONS_PER_IP` 5 → 30, added env-override hooks

## Key commits (in order)
```
(~15 commits from the session — see `git log --oneline` for full list)
fix(emu): skip async drain / JH_REGISTER / various emulator fixes (earlier today)
fix(chat): drop React login form, recover via blessed chat-only-login modal
fix(livechat): command-dropdown focus + selected-line color
fix(sdk/list): invalidate _lines cache in setItems so swapped items render
fix(sdk/category-picker): drop scrollbar from category list to fix wrap
fix(livechat): emoji-picker layout + click-outside-to-close
fix(livechat): convert emoji display strings to pure ASCII
fix(livechat/chat-only-login): unblock prod login (path + mouse focus)
fix(rate-limit): bump per-IP cap from 5 -> 30 conns/min
fix(emu): map JH_REGISTER linesPerScreen=0 to 9999 (avoid JoinCnf collapse)
fix(terminal): always keep BBS terminal focused on mobile and desktop
fix(chat): accept Latin-1 typing chars + throttle typing-preview rebuild
perf(livechat): bump typing-preview rate to 30fps + skip no-op rebuilds
fix(mobile): stop blur/focus loop, fix landscape keyboard, reliable touch events
```

## Files modified this session
- `web/backend/src/services/door-install.service.ts` (NEW)
- `web/backend/src/doors/DoorManager.ts:772-785`
- `web/backend/src/server/socket-handlers.ts` (SGR guard)
- `web/backend/src/index.ts` (rate limit)
- `sdk/engines/ui/blessed/core/program.ts` (Latin-1)
- `sdk/engines/ui/blessed/widgets/list.ts` (setItems cache)
- `sdk/engines/ui/blessed/widgets/category-picker.ts` (layout + close)
- `sdk/engines/ui/blessed/utils/animations/manager.ts` (getRendered public)
- `Doors/livechat/server.ts` (throttle, fingerprint, command focus, isGridVisible)
- `Doors/livechat/chat-only-login.ts` (path fix, SGR fix)
- `Doors/livechat/utils/emojis.ts` (ASCII conversion)
- `.github/workflows/deploy-hetzner.yml` (set -e + freshness check)
- `web/frontend/package.json` (vitest 3.2.4)
- `.gitignore` (Conftop.Data)

## Learnings / gotchas

1. **sdk/dist is gitignored; livechat dist is tracked.** SDK changes deploy via Docker `sdk-builder` stage. Livechat dist changes must be committed or the Docker `doors-builder` copy ships old code.

2. **screen never emits 'click' in neo-blessed** — only 'mousedown'. `click-outside-to-close` patterns must use 'mousedown'.

3. **List._updateContent fast-path skips rebuild** when `previousSelected === selected`. If `setItems()` doesn't clear `_lines`, the first render of newly-loaded items is skipped. Always set `this._lines = undefined` before calling `_updateContent()` in `setItems`.

4. **Deploy can appear green while Docker fails.** GitHub Actions SSH script had no `set -e`. docker build failures were swallowed; stale container ran for 21h with nobody noticing. Freshness check in deploy now prevents this.

5. **Latin-1 acceptance range** — include `>= 160 && <= 255` (Latin-1 printable) and drop `128-159` (C1 control). The condition `!(_sbCode >= 128 && _sbCode <= 159)` achieves this without extra branches.

## Backlog (carry forward)

1. **CS (AquaScan) DT_CONFACCESS** — expects area *name*, not conference flag string. Needs disassembly or source find.
2. **CTOP display** — silently exits post-fix; probably needs TS reimplementation reading CALLERS.LOG.
3. **livechat/server.ts modularization** — 2604 lines; read `MODULARIZATION_PHASE2_PROGRESS.md` before resuming.
4. **/chat rendering glitch** (blue bg + garbage chars) — reported once, possibly stale page cache; investigate if recurs.

## Next steps (ordered)

1. Verify live deploy freshness: `ssh root@89.167.21.154 "docker compose -f /app/amiexpress/docker-compose.yml ps && docker compose -f /app/amiexpress/docker-compose.yml images"`
2. Test Latin-1 and 30fps on live site (connect second browser, type å/ä/ö)
3. Pick backlog: AquaScan (research-heavy) or CTOP TS rewrite (bounded)
