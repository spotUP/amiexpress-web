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
- **Upload "transport error" disconnect** (`1bdef6d27`). socket.io's
  `maxHttpBufferSize` was 1MB, but BBSTerminal sends file uploads as
  `Array.from(new Uint8Array(buf))` which JSON-inflates each byte ~3x.
  Anything over ~330KB blew the buffer mid-upload and dropped the user
  to the login screen. Bumped to 64MB so a max-size 10MB upload fits
  with headroom. Long-term: switch to multipart POST against the
  already-wired `/api/upload` (multer) endpoint and shrink the buffer.

### Commits today

```
1bdef6d27 fix(upload): bump socket.io maxHttpBufferSize to fit JSON-encoded uploads
732163e2f test(operator-chat): regression guard for cancel-page repository resolution
1c5b18227 fix(messages): expert mode no longer redraws full menu after E command
b493b6802 fix(download): D command picks up flagged files; restore Conf14 screens
```

## 2026-05-03 — Maintenance pass (yesterday)

- **DOORSMENU root cause** = stack-above-BSS overlap + missing Allocate
  (`0049d687f` + `ce742d5ce`).
- **amiga-text-decode util**: shared SAUCE/iCE/encoding pipeline,
  preserves high-bit bytes (`26b131485`, `28cabd824`, `1a1278dda`).
- **Conftop double-banner**: form-feed → ESC[2J for in-protocol clears
  + DOS stdout silently discarded for XIM doors (`8abcb6082`,
  `b014ec0cd`).
- **Operator chat 1:1 audit**: per-Enter response, no fake typing delay
  (`63539d80c`).
- **Dead code purge**: `fileEntries` cache, `displayFileAreaContents`
  chain, `AmigaDosEnvironment.ts` (`fa1f1d2e7`, `fa1a27b94`,
  `db6a8618b`).
- **SIG_LI (XIM 912)** + info-editor `_fallback` write error
  (`35779aa8b`, `5c6b122c9`).

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

## Open priorities

1. **doorman "Cannot read directory"** — needs a path that triggers it.
2. **AquaScan false new-mail count** — `N` / `NSU` reports unread
   messages that aren't really there. Needs a sysop running the door
   + MCP traces (compare `AquaScan.Date.N` vs `msgBase` lastRead).
3. **13 divergent door icons vs Sanctuary reference** — 11 are
   `OVERCLOCK=100` only (keep). 2 substantive: `ByteKiller`
   (NUKER/SPY_LIST) and `Request` (path differences). Installation-
   specific, your call.
4. **Upload via multipart, not socket.io** — frontend already gets
   `uploadUrl: '/api/upload'`; switching to a multipart POST lets us
   shrink `maxHttpBufferSize` back down and avoids the 3x JSON
   inflation. Backend endpoint already exists.

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
- **Upload buffer**: `maxHttpBufferSize` must stay >= 3 × `maxFileSize`
  while frontend uploads via socket.io as JSON arrays
  (`tests/server/upload-buffer-size.test.ts` enforces this).
