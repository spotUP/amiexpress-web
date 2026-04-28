# Handoff

## Current State
Server stopped. All changes committed (315c6a4ad). Server needs restart to pick up fixes.

## This session (2026-04-28) — continued

### Message reader/editor audit pass (315c6a4ad, cb952d0f3, 036a83211, e421376e8)
Deep 1:1 audit against express.e for all message functions. Fixed:

**messaging.handler.ts (displaySingleMessage)**:
- Date format: `toLocaleString()` → `formatLongDateTime()` ("07-Apr-2026 14:32:15")
- Column alignment: fields padded to 30 chars (`\l\s[30]`) — Date/To/From
- ANSI colors: `[32mField[33m: [0m` pattern (green field, yellow colon, reset value)
- Recv'd date also uses `formatLongDateTime()`

**Nav prompt format** (express.e:12010):
- Was `( currentMsgNum )` — now `( N+MAX )` e.g. `( 6+27 )` or `( QUIT )` at end
- `getMsgNavStr()` helper; short/full help prompts updated to same format

**listMSGs** (L command, express.e:8820-8878):
- Added `Starting message [N]: ` prompt (default = lowest msg number)
- Proper column header: `Msg / Type / From / Subject` with correct widths
- `MSG_LIST_START_INPUT` state + `handleMsgListStartInput` handler

**handleReadMessagesFullCommand**:
- Now starts from `lastMsgReadConf+1` (express.e:11984)
- "No new messages." instead of custom text when base empty

**replyToMSG** (R command, express.e:9874):
- Shows header box + informational "To: fromName" line (no To: input)
- Subject prompt pre-filled with original subject (no "Re: " prefix added)
- Blank subject returns to reader (not DISPLAY_MENU)
- Goes to POST_MESSAGE_SUBJECT so user can edit subject before Private prompt

**forwardMSG**:
- Subject prompt pre-fills with original message subject
- "Delete original message" now shows `(y/N)?` (was missing)

**searchNewMail (confScan)**:
- Added missing `[0m` reset after dashes line in message table header

### CONFTOP stuck-door fix (8c273d70a)
Post-shutdown forced-exit timer moved to main execution loop (DoorLifecycleManager.ts:902).
Fires for ALL door types including Path A (trap-sync) doors like CONFTOP.
2-second timeout after JH_SHUTDOWN → `terminate()`. Confirmed working.

### AquaScan auto-scan check
Verified NOT auto-scanning: `conf_base` table empty, `DEFAULT_SCAN_FLAGS=0`,
no SHOW_NEW_FILES in any conference .info. `checkFileConfScan` returns false.

## Open priorities
1. **xim/io.ts** — approaching 2000 line limit, needs modular split

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE (PC standards). Everything else Amiga = BE.
- **DateStamp fixed**: AquaScan time display and file area "new since" should now work correctly.
- **conf_base**: 45 rows were zeroed. On first login after restart, confScan will scan all conferences and set correct high-watermarks.
- **User.data rebuilt**: old 17793-slot garbage file replaced with clean 2-slot BE file.
- **Door file tracking** only applies to doors installed after `94c4fefb9`.
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit may resurface.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
- **confScan nav prompt**: uses `( N+MAX )` format (like readMSG). Express.e confScan uses `replyPrompt` which shows `( currentMsg )`. Minor deviation — behavior is correct, only number format differs.
