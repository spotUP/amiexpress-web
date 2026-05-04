# Handoff

## 2026-05-04 — Bug-queue sweep: download/upload/expert-mode/operator-chat

### Today

- **D command flagged files** (`b493b6802`). F-command and JH_FLAGFILE
  both push to `session.flaggedFiles` with shape `{filename, confNum}`,
  but the D command read from `session.tempData?.flaggedFiles` and
  keyed off `f.fileName` (camelCase) — flags from the file-listing UI
  never reached the download set. Also stopped the loud "Screen not
  found: DOWNLOAD" sysop alert (express.e treats it as optional) by
  passing `silent=true`. Restored `Conf14/{Menu,downloadmsg,uploadmsg}.txt`
  from the SanctuaryBBS reference.
- **Expert mode (X) post-E redraw** (`1c5b18227`). `saveMessage` called
  `displayMainMenu(forceMenuDisplay=true)`, which bypassed the expert
  check (line 60) — so X-toggled users still got the full ANSI menu
  redrawn after sending a message. Split the flag into
  `forceMenuDisplay` (still overrides expert, used by `?`) and
  `bypassDebounce` (skips the 500ms guard but respects expert).
  saveMessage now uses `(false, true)`.
- **Operator-page cancel** (`91c18baf1` already shipped; tested today
  and locked in by `732163e2f`). The OPERATOR_CHAT_WAITING handler
  resolved the repository via tsyringe — `OperatorChatRepository` isn't
  `@injectable()`, so every cancel attempt threw "TypeInfo not known"
  and the user was disconnected. Routes through
  `db.getOperatorChatRepository()` like every other caller, plus a
  fallback that emits "Aborted!" if the DB isn't available so the user
  is never permanently stuck. Source-level regression test included.
- **Upload "transport error" disconnect** (`1bdef6d27`, `4c2699110`).
  socket.io's `maxHttpBufferSize` was 1MB, but BBSTerminal sent file
  uploads as `Array.from(new Uint8Array(buf))` which JSON-inflates each
  byte ~3x. Anything over ~330KB blew the buffer mid-upload and dropped
  the user to the login screen. First commit bumped the buffer to 64MB;
  follow-up migrated the uploader to multipart POST against the
  already-wired `/api/upload` (multer) endpoint and shrank the buffer
  to 4MB. Binary now never touches the websocket — the frontend POSTs
  the file, then emits a small `file-upload-ready` event with metadata
  only.
- **DOORMAN freeze under heavy mouse activity** (`b2fa20371` bundled
  this in with an aquascan fix). Browsers fire mousemove at 60Hz+;
  BBSTerminal forwarded every one over the socket and the SDK's
  `screen.handleMouseEvent` walked the whole element tree per event,
  saturating the event loop until socket.io's ping timeout fired and
  the user got bounced to login. Throttled `mouse-drag` and `mouse-hover`
  to 60Hz per session at the socket boundary (16ms minimum between
  forwards); `mouse-up` and `mouse-click` are NOT throttled. Also
  gated the 3-per-event console.log spam in `Program._handleData`
  behind `SDK_LOG_MOUSE=1`.

### Commits today

```
4c2699110 feat(upload): migrate BBSTerminal uploader to multipart HTTP, shrink buffer
1bdef6d27 fix(upload): bump socket.io maxHttpBufferSize to fit JSON-encoded uploads
732163e2f test(operator-chat): regression guard for cancel-page repository resolution
1c5b18227 fix(messages): expert mode no longer redraws full menu after E command
b493b6802 fix(download): D command picks up flagged files; restore Conf14 screens
```

## 2026-05-03 (yesterday) — see git log for detail

DOORSMENU root cause (`0049d687f`+`ce742d5ce`), amiga-text-decode util
(`26b131485` series), Conftop double-banner (`8abcb6082`+`b014ec0cd`),
operator chat 1:1 audit (`63539d80c`), dead-code purge of fileEntries /
displayFileAreaContents / AmigaDosEnvironment, SIG_LI + info-editor
fallback writes.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

## Open priorities

1. **doorman "Cannot read directory"** — needs a path that triggers it.

### Recently closed

- AquaScan "00:00:00" — DT_TIMELASTON cTime conversion + UserData
  slot seed on websocket login (`c8e7c2ff7`, `b2fa20371`, `883b1545f`).
- Multipart upload migration — already complete (BBSTerminal does
  fetch + FormData against `/api/upload`, maxHttpBufferSize is 4MB).
  Handoff item was stale.
- 13 / 14 divergent door icons aligned with Sanctuary baseline
  (`e9942b38d`): AquaScan, ByteKiller, NTR-LASTCALLERS, Request
  restored from reference; 10 OVERCLOCK-only files kept as-is.

## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` vs `replyPrompt`'s `(currentMsg)` — minor
- `2` (callers log): shows DB entries not per-node files (WEB_ tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login gated on `SHOW_NEW_FILES` tooltype
- MAILSCAN_ALL in confScan: ALL always included; conf flag deferred

## Gotchas

- **Amiga = BE**: CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **Message storage**: body at `<conf>/MsgBase/<id>` (no extension, raw
  body, `\n` not `\r\n`). HeaderFile + MailStats are the source of
  truth. Don't write to `Conf*/Messages/` — dead path.
- **`mailStat.highMsgNum`** stores the *next* id; total = `highMsgNum-1`.
- **`~SP` in screens**: `displayScreen` handles pause + segment-resume.
  Callers must NOT also call `doPause()`.
- **`relConfNum`** drives the menu prompt and conftop, not `currentConf`.
- **Screen clearing fires from**: SCREENS_REQUIRE_CLEAR, leading 0x0C,
  `~f` MCI, `~SR_` art files.
- **`_fallback` .info files**: `writeInfoFile` throws on these now —
  re-create the .info via Workbench/IconEdit.
- **High-bit bytes**: route ALL screen/bulletin reads through
  `readAmigaTextFileWithTransforms`. `fs.readFileSync(path, 'utf8')` and
  `fileCache.readString(path, 'utf8')` silently corrupt 0xB7/0xA9/0xAE.
- **Expert mode after E**: `displayMainMenu` now has a separate
  `bypassDebounce` flag; use it (not `forceMenuDisplay=true`) when you
  just want to guarantee the prompt renders.
- **Uploads go via HTTP, not the websocket**. BBSTerminal POSTs to
  `/api/upload` (multer) then emits `file-upload-ready` with metadata.
  Don't re-introduce JSON-encoded binary on the socket —
  `tests/server/upload-buffer-size.test.ts` guards both the buffer cap
  (1MB ≤ x ≤ 16MB) and the absence of `Array.from(new Uint8Array(...))`
  in the frontend.
- **Mouse-move events are throttled at the socket boundary** (60Hz per
  session, drag/hover have independent clocks). Don't bypass it for
  hover/drag — the saturation that throttle prevents was the cause of
  the DOORMAN freeze. mouse-up and mouse-click are intentionally NOT
  throttled (discrete events doors must always see).
