# Handoff

## Current State
Server stopped. All changes committed (dadc11076). Server needs restart.

### Additional fixes after b5198887c (this sub-session)
- Login: "not used on this BBS" msg format, "Too Many Errors" no color
- C command: commentToSYSOP() separator box + To: + Subject prompt (express.e:8779-8783)
- InValid Password! — plain text (was AnsiUtil.errorLine)
- 'Not enough daily byte allowance' — remove trailing period (express.e:19854)
- N files listing: remove extra pressKeyPrompt; menuPause=true
- new-user: 'City, State: ' (was 'Group Affiliation'), 'Phone Number: ' (was +skip text)

## This session (2026-04-28) — comprehensive .e source audit + gap fill

### Scope
Full audit of ALL TypeScript handler files against express.e, MiscFuncs.e, axobjects.e,
axconsts.e, zmodem.e, tooltypes.e, qwk.e. 138 deviations found across 8 parallel audit tracks.
Research reports in `thoughts/shared/research/audit-track-*.md` and `audit-master.md`.

### Major fixes this session

**Data corruption (binary structs)**:
- MailStats: field order swapped + size 12→18 bytes (axobjects.e)
- ConferenceFileManager: CONFBASE_SIZE 64→74 (axobjects.e)
- UserStructures.ts: missing pad byte after phoneNumber, SIZE 230→232
- QWK: msgNum as 7-char ASCII (not binary LE); confNum at bytes 123-124; added CONTROL.DAT

**Security / auth**:
- Locked account (`accountLocked`) now checked at login — was bypassed entirely
- `secStatus <= 1` LOCKOUT0/LOCKOUT1 screens now shown
- `forcePwdReset` / PASSWORD_EXPIRY_DAYS flow added (full 3-attempt dialog)
- STEALTH_MODE / SYSTEM_PASSWORD gate added to pre-login flow
- New-user name validation: retries all failure cases (blank/short/duplicate/banned)
- `checkIfNameAllowed` + `checkForAst` (banned names, wildcards) added
- `slotNumber=0` (deleted account) now rejected at login
- ANSI prompt: removed PETSCII option (not in express.e)

**Core loop**:
- SYSCMD only attempted when `allowSyscmd=true` (not on every user keystroke)
- Time-limit enforcement: `checkTimeUsed()` called at every menu redisplay
- Carrier-drop gate: `socket.connected` check before menu display
- `RESULT_NOT_ALLOWED` → DISPLAY_MENU with menuPause=true (was DISPLAY_CONF_BULL false)
- "No such command!!  Use '?' for command list." — correct express.e string

**Conference system**:
- joinConference ACS forward-walk loop added (was instant failure)
- Mail scan stub connected (TODO replaced with real checkMailConfScan call)
- `saveMsgPointers` called after every scan and before J conference switch
- Auto-rejoin now uses `auto=false` (was true — showed spurious "Auto-ReJoined" text)
- MAILSCAN_PROMPT "N" now gates both mail AND file scan phases
- confScan iterates all msgBases per conference (was only first)
- Partial upload check phase added to confScan (express.e:28117-28147)
- `getInverse()` relative conference numbering (+N/-N) added to J command
- `createNodeUserFiles` guarded: only on interactive joins, not auto-rejoin or scan
- `lowestNotDel` clamp applied after pointer validation (express.e:5037-5038)

**Display / MCI / screen files**:
- `formatLongDateTime`: now `"Mon 07-Jan-26 14:32:00"` (was missing day-of-week, 4-digit year)
- `~CT`/`~OD`/`~OT`: now use session logon time (was current time/date)
- `~LG`/`~ON`: now use `session.nodeId` (was hardcoded `'1'`)
- `~NS`: now sets nonStopText flag (was no-op)
- `~SU`/`~SD`: auto-scaling b/kb/mb/gb (was always `/1024 + 'K'`)
- `~LC`: now formatted with `formatLongDateTime` (was raw DB string)
- `~CL`: now filters by `checkConfAccess` (was unfiltered)
- `~CD`: now 2-column numbered list (was single conf name)
- `displayFile` MCI guard: MCI only if first line starts with `~`
- Missing SCREEN_DIR_MAP entries added (NONEWATBAUD, NOT_TIME, MAILSCAN, etc.)
- SCREENS_REQUIRE_CLEAR: added BBSTITLE, LOGOFF, JOIN, JOINED
- Early ESC[2J clear now fires BEFORE MCI processing (was inside `else if (!inlineEmitted)`)
- `~SR_` handler: now emits ESC[2J before displayScreen (fixes Fairlight animation)
- Leading form feed (0x0C) in screen files: now converted to ESC[2J (xterm.js was treating as newline)

**File system**:
- Download ratio display: branches on ratioType (was always "Infinite bytes")
- Post-download efficiency: calculated from actual CPS vs baud (was hardcoded 100%)
- G=Goodbye after download: now runs `pGoodbye()` 10-second countdown (express.e:13751)
- File listing: `, Area: <name>` suffix removed
- Zippy search: uses real maxDirs (was hardcoded 20)
- Zippy search: `getDirSpan` directory range prompt added
- `fileStatus`: "KBytes" vs "Bytes" now toggles on CREDITBYKB tooltype
- Upload filename >12 chars: inline rejection with correct error string
- Post-upload: "File Uploading Complete...", stats line, "Time increased by N mins."

**Command-level fixes**:
- B command: bulletin path now per-conference `confScreenDir/Bulletins/` (was global)
- H command: removed spurious CLS (express.e has none)
- M command: "Ansi Color On/Off" plain text (was green ANSI + spurious pressKey)
- RL command: removed extra "Are you sure?" confirm (express.e relogons immediately)
- CF command: FORCE_NEWSCAN/NO_NEWSCAN shown as F/D flags
- W command: computer/screen type selection as numbered list (was free-text)
- Z command: getDirSpan prompt before search string
- Page sysop: `pagesAllowed=0` redirects to commentToSYSOP flow with exact strings
- MENU_PROMPT tooltype: now used for per-conference menu prompt (through parseMciCodes)
- Shortcut handler: now runs parseMciCodes on translated value (enables ~CC_/~XC_ shortcuts)

**Message system**:
- Reply (R): header box + pre-filled To/Subject flow (express.e:9874)
- Forward (F): subject pre-fills from original; delete-original shows `(y/N)?`
- K (Keep): recv=0 written to disk + lowestNotDel fallback
- U command: added to message reader (account edit from mail)
- H key: word-highlight toggle in chooseTranslator
- confScan `recv=0` filter: already-read private mail excluded from scan listing
- confScan multi-msgBase iteration: all msgBases scanned (was only first)

**AquaScan / door output**:
- `conf_base.scan_flags DEFAULT` fixed 12→0 (was triggering AquaScan on every login)
- `getUserScanFlags()` fallback 12→0 (was re-introducing bug via CF command)
- `checkFileConfScan()`: DB FILE_SCAN_MASK path removed; only SHOW_NEW_FILES tooltype triggers scan
- Migration: resets ALL non-zero scan_flags to 0 on startup
- QuickNew stdout contamination: `console-to-stderr.ts` loaded as first import in run-amiga-door.ts
- Removed all initialization `console.log` from config.ts, UserFileManager.ts, CallersLogManager.ts

**WEB_: tags added** to all untagged intentional deviations (sysop shell stubs, VER web info, W modem/font options, 500ms debounce, bcrypt, ~CR wait, ~w delay).

### xim/io.ts modular split
Done (commit 0fa31073a). io.ts: 1980→1657 lines. New: io-hotkey-tokens.ts, io-ansi-util.ts, io-file-display.ts.

## Open priorities
1. **messaging.handler.ts** approaching 1600 lines — monitor, split if needed
2. **screen.handler.ts** at 3220 lines (exempted) — future refactor candidate

## Known WEB_ deviations (intentional)
- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files (WEB_: tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login disabled (uses QuickNew instead of AquaScan); set SHOW_NEW_FILES in .info to re-enable per conference

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **conf_base scan_flags**: DEFAULT now 0. Migration resets any non-zero rows on startup.
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires (a) from SCREENS_REQUIRE_CLEAR before all processing, (b) from leading 0x0C in screen files, (c) before ~SR_ art files. If a screen still bleeds, check if it has a leading form feed.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit may resurface.
