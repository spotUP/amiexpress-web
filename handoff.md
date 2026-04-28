# Handoff

## Current State
Server stopped. All changes committed (3dbcb53e8). Server needs restart to pick up fixes.

## This session (2026-04-28) — deep message audit

### Message reader/editor — comprehensive audit pass (25+ fixes)
All critical deviations from express.e fixed in messaging.handler.ts and message-entry.handler.ts.

**Header display (displaySingleMessage)**:
- Date: `formatLongDateTime()` format, padEnd(30) column alignment
- ANSI colors: `[32mField[33m: [0mvalue` pattern
- Recv'd: ALL→N/A, EALL→No (express.e:8922 only 'ALL' gets N/A)
- Screen clear: respects USER_SCRNCLR flag; if unset → just `\r\n`

**Navigation**:
- Nav prompt: `( N+MAX )` / `( QUIT )` — express.e:12010
- Number jump: type message number → jump directly
- `-` backward navigation with noMoreMinus message
- `noMorePlus`: "The last message in this conference is N" at end of messages
- `K`: backs up scan pointer, advances to next message (not exits reader)
- Invalid/not-yours: nav prompt only, no message re-render

**Read start**: from `lastMsgReadConf+1` (express.e:11984), shows "No new messages." if empty

**listMSGs** (L command):
- "Starting message [N]: " prompt (express.e:8831)
- Columnar format: Msg/Type/From/Subject with correct widths

**replyToMSG** (R command):
- Header box + informational "To: fromName" + Subject prompt pre-filled (no "Re:" prefix)
- Blank subject → back to reader (express.e:9890 RESULT_SUCCESS)

**forwardMSG** (F command):
- Subject pre-fills from original message
- "Delete original message (y/N)?" format (was missing yesNo prompt)
- F prompt: raw `[32m` → proper `\x1b[32m` escapes

**enterMSG** (E command):
- E with param pre-fills To: and skips To: prompt (express.e:10762-10774)
- Delete output: "Message N deleted..." (express.e:11936)
- Delete check: allows if author (fromName) OR recipient

**editHeader** (EH command):
- Private prompt: shows `(y/N)?`, yesNo(2) single-char, skipped for ALL/EALL

**Non-stop mode**: same header format as regular displaySingleMessage

**confScan (searchNewMail)**:
- `mscan=false`: conf skipped silently (no "No mail today!"), no header shown
- `mscan=true`: header + scan as before; `[0m` reset after dashes
- `handleMessageSubjectInput` made async (was fire-and-forget IIFE)

**Quote separator**: uses `formatLongDateTime()` not `toLocaleString()`

### Other fixes made by other agents this session
- auth: accountLocked/secStatus lockout, forcePwdReset, STEALTH_MODE/SYSTEM_PASSWORD gate
- QWK: msgNum 7-char ASCII, CONTROL.DAT
- conference: ACS fallback loop, auto=false on rejoin
- loop: enforce time limit and carrier-drop check
- commands: SYSCMD allowSyscmd check, WHO WEB_ tag, MENU_PROMPT, etc.
- MCI: formatLongDateTime, ~CT/~OD, node numbers, ~NS flag
- bulletin: per-conf path, H no CLS
- upload+scan: reject filenames >12 chars, skip already-recv'd private mail

### CONFTOP stuck-door fix (8c273d70a)
Post-shutdown forced-exit timer in main execution loop. 2s after JH_SHUTDOWN. Working.

## Open priorities
1. **xim/io.ts** — at 2000 line limit, needs modular split (pre-commit hook warnings)
2. **messaging.handler.ts** — at ~1500 lines, approaching limit

## Known WEB_ deviations (intentional)
- Line-mode vs char-mode (no word-wrap, cursor positioning)
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- WEB_ press-key prompt after save
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **conf_base**: 45 rows were zeroed. On first login, confScan sets high-watermarks.
- **User.data rebuilt**: 2-slot BE file.
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit.
- **ctop.data** must exist per conference for Conftop-II (Conf1/, Conf2/, Conf12/ only).
