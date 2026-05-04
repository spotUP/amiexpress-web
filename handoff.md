# Handoff

## Current state — 2026-05-04

Two work packages closed today; both archived to
`thoughts/shared/handoffs/2026-05-04_message-audit-and-bug-sweep.md`.

- **Message function 1:1 audit** — 16 rounds (commits `2247cf0ed` →
  `de5a516a8`). 26+ express.e deviations closed across enterMSG /
  replyToMSG / replyPrompt / displayMessage / listMSGs / mail-scan /
  move / delete / EXTSEND / captureRealAndInternetNames. The recurring
  bug was using raw `session.user.username` instead of `confMailName`
  for "is this my mail?" checks — broke REALNAME / INTERNETNAME confs
  silently. 17 new regression tests; 74/74 passing.
- **Bug-queue sweep** — D-command flagged files, expert-mode post-E
  redraw, operator-page cancel disconnect, upload transport-error
  disconnect, DOORMAN mouse-flood freeze.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

## Open priorities

- **#78** AREXX native rexxsyslib via 68K emulator (alternative to the
  TS interpreter). Multi-day architectural project; only worth
  picking up if you need full real-AREXX semantics for classic
  scripts the TS interpreter handles partially (e.g.
  `Doors/SCEPTIC/F!-REQUEST/request.rexx` hangs on user input).
- **Stray uncommitted diff** — `src/handlers/door.handler.ts` and
  `src/server/auth-socket-handlers.ts` show modifications, plus
  untracked `src/utils/aquascan-slot.util.ts`. Not from the audit; diff
  before bundling into something unrelated.

## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- `2` (callers log): shows DB entries not per-node files
- ZOOM auto-selects ZIP; no LHA binary available
- GDPR gate on new user
- File scan at login gated on `SHOW_NEW_FILES` tooltype
- `lowestNotDel` recomputed from headers (express.e just bumps `+1`)
- EH preserves 'p' (censored) status (express.e forces 'P')
- ZModem batch upload from `Msg. Options X` replaced by F file-attach

## Gotchas

- **Amiga = BE**: CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **Message storage**: body at `<conf>/MsgBase/<id>` (no extension, raw
  body, `\n` not `\r\n`). HeaderFile + MailStats are the source of
  truth. Don't write to `Conf*/Messages/` — dead path.
- **`mailStat.highMsgNum`** stores the *next* id; total = `highMsgNum-1`.
- **`confMailName`, NOT `session.user.username`** for every "is this my
  mail?" check across the message subsystem. Use
  `getConfMailName(session)` or session-less
  `getConfMailNameFor(user, confId, msgBaseId)` for multi-conf
  iteration.
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
- **Expert mode after E**: `displayMainMenu` has a separate
  `bypassDebounce` flag; use it (not `forceMenuDisplay=true`) when you
  just want to guarantee the prompt renders.
- **Uploads go via HTTP**, not the websocket. BBSTerminal POSTs to
  `/api/upload` (multer) then emits `file-upload-ready` with metadata.
  `tests/server/upload-buffer-size.test.ts` guards both the buffer cap
  and the absence of `Array.from(new Uint8Array(...))` in the frontend.
- **Mouse-move events are throttled** at the socket boundary (60Hz per
  session, drag/hover have independent clocks). `mouse-up` and
  `mouse-click` are intentionally NOT throttled.
- **`SKIP_DB_INIT=1`** disables the test-DB setup
  (`tests/setup.ts:14-16`). Suites that need the test DB
  (`message-pointers`, `message-scan-parity`, `message-repository`)
  will fail with "Test database not initialized" — run them WITHOUT
  the env var.
