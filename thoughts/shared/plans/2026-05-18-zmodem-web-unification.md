---
date: 2026-05-18
topic: zmodem-web-unification
tags: [zmodem, upload, web, lrzsz, refactor]
status: draft
---

# ZMODEM web unification — kill `/api/upload`

## Goal

Route web RZ upload + Z download through the same lrzsz pipeline already used by telnet/SSH, so every transport exercises the canonical BBS upload flow (DIZ extraction, dup check, sysop rules, FILES.BBS append, runPostUpload, runPostDownload). Eliminate the parallel HTTP `/api/upload` path that bypasses the BBS pipeline (causes today's bug: web uploads land as `0001NNNN.png` in DIR5 with no description prompt, missing from FR listings).

## Pre-existing state (verified 2026-05-18)

- Frontend Sentry already wired: `packages/terminal/src/components/BBSTerminal.tsx:414`. `requireZmodem`, `beginZmodem(direction, paths)`, Sentry consume on `transfer-raw:data`, ZRQINIT send on upload arm — all present.
- `transfer-raw:init` socket event already fires `beginZmodem(payload.direction, payload.paths)` on the client (`BBSTerminal.tsx:1286`).
- `transfer-raw:data` → `zmodemSentry.current.consume(view)` (`BBSTerminal.tsx:1290`).
- Server `transfer-raw:start` handler installs `transferRawSend = (buf) => socket.emit('transfer-raw:data', buf)` if missing (`socket-handlers.ts:864`).
- Server `transfer-raw:data` handler pipes to `transferRawSink || serialInputHook` (`socket-handlers.ts:870`).
- lrzsz available locally (`/opt/homebrew/bin/{sz,rz}`) and on Hetzner via apt.
- IAC double-escape removal (`b1e0b8f9b`) + ANSI cooking fixes shipped — the historical "browser Sentry + server lrzsz both speak ZMODEM" interop bug should now be resolved per handoff hypothesis.

## What was missing before this work

1. Web branch in `transfer-misc-commands.handler.ts:141-178` shows the file picker and routes to HTTP `/api/upload` instead of spawning lrzsz.
2. Web download / Z command branches in `user-commands.handler.ts:115-161` and `:265-318` gate the lrzsz path on `transport.type !== 'web'` and fall through to the JS `ZmodemTransferManager`.
3. No handshake between server lrzsz spawn and browser Sentry arm — the lrzsz child writes ZMODEM bytes immediately on spawn; if the Sentry isn't armed, those bytes get fed into the xterm display path and the transfer dies.

## Phase 1 — web RZ upload through lrzsz (THIS SESSION)

**File:** `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts`

- Delete the `if (transportType === 'web') { …show-file-upload… return; }` block (lines 141-178).
- Wrap `spawnLrzszForUpload()` so that for web transport, it first emits `socket.emit('transfer-raw:init', {direction:'upload', paths:[playpen]})`, awaits one of: client `transfer-raw:start` event OR 1500 ms timeout, then calls `lrzManager.start()`.
- IAC negotiation block at lines 363-366 stays gated on `transportType === 'telnet'`.

Bytes flow:
```
rz stdout → LrzszTransferManager.transport.send (sender)
         → session.transferRawSend
         → socket.emit('transfer-raw:data', buf)
         → BBSTerminal transfer-raw:data handler
         → zmodemSentry.consume(view)

zmodemSentry sender → socket.emit('transfer-raw:data', octets)
         → server transfer-raw:data handler
         → transferRawSink
         → lrzManager.handleInput(buf)
         → rz stdin
```

## Phase 2 — web Z download / Z command upload through lrzsz

**File:** `web/backend/src/handlers/commands/user-commands.handler.ts`

- `startZmodemUpload` (around line 115): drop the `transport.type !== 'web'` guard; always use lrzsz when `isLrzszAvailable()`. Same handshake as Phase 1 before `lrzManager.start()`.
- `startZmodemDownload` (around line 265): same.
- The JS-fallback `ZmodemTransferManager` paths stay as dead code for the moment (in case lrzsz is unavailable on a deploy target). Remove once Phase 3 verifies.

## Phase 3 — verification (THIS SESSION)

- `cd web/backend && npx tsc --noEmit`
- `cd packages/terminal && npx tsc --noEmit`
- `./dev/scripts/start-servers.sh --bbs-only`
- Manual smoke (user-driven, browser): login as sysop → RZ → expect browser ZMODEM dialog → select small file → upload → BBS prompts for description → file appears in conference DIR and `FR` listing.

## Phase 4 — cleanup (NEXT SESSION)

Once Phase 3 is live-verified:
- Delete `processFileUpload` and the `file-upload`, `file-upload-ready`, `file-uploaded` socket events from `file-socket-handlers.ts` (~280 lines).
- Delete `/api/upload` and `/api/upload/door` routes from `routes-setup.ts`.
- Delete `show-file-upload` emitter sites + the `<input type=file>` shadow picker on the frontend.
- Update CLAUDE.md / memory if needed.

## Risks + rollback

- **If browser Sentry doesn't survive interop with server lrzsz** (the historical bug): symptom is "Unhandled header: ZRINIT" in browser console + lrzsz timeout in backend log. Rollback = revert Phase 1+2 commits; HTTP /api/upload still present until Phase 4.
- **If lrzsz isn't installed on a deploy target**: detected at runtime via `isLrzszAvailable()`. Phase 1+2 should keep the JS-`ZmodemTransferManager` fallback for web (don't delete it yet) so a missing lrzsz binary on prod degrades gracefully.
- **No automated regression test for end-to-end browser↔lrzsz transfer** yet — smoke test only. Owed for Phase 4. Memory `feedback_add_regression_tests` notes this debt.

## Success criteria

- [ ] Web user runs RZ, browser ZMODEM dialog appears, file upload completes, description prompt fires, file ends up in FILES.BBS + DIR file + visible to `FR`.
- [ ] Web user `F`lags a file, runs `D`, browser file save dialog appears, file downloads correctly.
- [ ] Telnet/SSH transfer path unchanged (lrzsz still works, IAC BINARY still negotiated).
- [ ] Both typecheck commands clean.
- [ ] No new `[ZMODEM]` errors in backend log on web transfer.
