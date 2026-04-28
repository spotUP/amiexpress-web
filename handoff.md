# Handoff

## Current State
Server stopped. All changes committed (88b20c7a2). Server needs restart.

## This session (2026-04-28) — second comprehensive .e source audit pass

### Scope
Full line-by-line audit of ALL express.e commands A-Z and mainloop against TypeScript port.
Fixed deviations in: VER, W, S, X, T, M, Q, G, GR, WHO, WHD, UP, S, CF, E, JM, Z, FM, N, F
Plus: permissionDenied (higherAccess), doPause prompts, More prompt, Logoff, scan messages.

### Fixes (commit range d3f5c7325..88b20c7a2)

**VER command (express.e:25688-25698)**:
- Removed headerBox, screen-clear, web-platform info, press-key — plain text only
- Format: `\r\nAmiExpress-Web 5.6.0 (date) Copyright ©...\r\n\r\nOriginal Version:...`

**W command (express.e:25712-26092)**:
- DISABLED format: `[34m[[0mN[34m][31m [DISABLED][0m` (was full-red via AnsiUtil)
- Option 10 display: check `userFlags&8` not `user.ansi`
- Password empty confirm = silent cancel (was "do not match")
- After password save: no "Password updated" message (express.e silent save)
- Strength messages: no trailing `\r\n`

**S command (express.e:25540-25606)**:
- `timesCalled`, `messagesPosted` AND $FFFF
- `screenClr`: check `userFlags&8` not `user.screenClr`
- Remove AnsiUtil.pressKeyPrompt; set menuPause=true

**permissionDenied (express.e:3037-3039 higherAccess())**:
- ErrorHandler.permissionDenied: now emits `'\r\nCommand requires higher access.\r\n'`
- command.handler NOT_ALLOWED path: emit higherAccess for sys/bbs command denials

**Pause prompts (express.e:5141-5152, 5193-5200)**:
- doPause prompt: `[32m([33mPause[32m)[34m...[32mSpace To Resume[33m: [0m` in all paths
- More prompt: added trailing space `(Pause)...More(y/n/ns)? `
- More response: emit `\x1b[1A\x1b[K` to clear pause line (express.e:5199)

**Logoff (express.e:8191)**:
- `'\r\nClick...'` — removed spurious 'NO CARRIER' suffix

**Logon / E command (express.e:9998-10000)**:
- E command msgToHeader: separator box + `'     To: (Enter)=\'ALL\'? '` (was `(Blank)=ALL?`)

**displayULStats (express.e:12701-12714)**:
- Show actual bytesAvailableForDownload when not 0x7FFFFFFF (was always 'Infinite')

**CF command (express.e:24672-24841)**:
- Header: inline `[32m`/`[33m` ANSI (not AnsiUtil.colorize)
- Flag prompt: plain `'Edit which flags [M]ailScan...'`
- Numbers prompt: `"...'*' toggle all,'-' All off,'+' All on >: "`
- Clear: `\x0c` (sendCLS) not `\x1b[2J`

**WHO/WHD (express.e:24204-24382)**:
- Remove screen clear (express.e: just `\r\n\r\n`)
- Remove AnsiUtil.pressKeyPrompt; set menuPause=true

**Q command (express.e:25504-25516)**:
- `'\r\nQuiet Mode On/Off\r\n'` — removed AnsiUtil.successLine + press-key

**GR command (express.e:24411-24421)**:
- `'In memory of...'` plain text (was cyan via AnsiUtil.colorize)

**X command (express.e:26113-26121)**:
- `'\r\nExpert mode disabled/enabled\r\n'` — removed extra blank lines

**UP command (express.e:25667-25673)**:
- Remove AnsiUtil.pressKeyPrompt; set menuPause=true

**Z command (express.e:26123-26213)**:
- `'Enter string to search for: '` — plain text (was cyan)
- `'No files available in this conference.'` — plain text (was red AnsiUtil.errorLine)
- `'Scanning directory N'` — plain text (was green in all file handlers)

**FM command (express.e:24889-25044)**:
- `'View option is not available for hold directory'` — plain text (was wrong text + AnsiUtil.errorLine)

**F/N commands**:
- `'No files available in this conference.'` — plain text (myError ERR_NOFILES)
- F: `'Scanning directory N'` — plain text, remove colored 'Area: {name}' sub-header

**JM command (express.e:25185-25237)**:
- `'.' params: silently delegate to J (no AnsiUtil warning)
- Remove 'Available message bases:' list + '<-- Current' indicator
- After join: joinConf() already shows message — remove AnsiUtil.successLine
- Invalid input: silently clamp (no AnsiUtil error)

**Message scan / message-entry**:
- Remove AnsiUtil.pressKeyPrompt after confScan/save; set menuPause=true

### HYDRA protocol (hydra-e)
Not implemented — known gap.

### ACP-E admin panel gaps
- `SV_ACCOUNTS`, `SV_LOCALLOG` — no endpoints
- Per-node stats filtering — global only

## Open priorities
1. **xim/io.ts** — at 2000 line limit, needs modular split
2. messaging.handler.ts approaching 1600 lines — monitor

## Known WEB_ deviations (intentional)
- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- VO (voting): WEB_ implementation; voting source not in indexed modules

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **conf_base**: scan_flags DEFAULT was 12 (bug, now 0). If AquaScan reappears, check conf_base rows.
- **User.data rebuilt**: 2-slot BE file.
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit.
- **ctop.data** must exist per conference for Conftop-II (Conf1/, Conf2/, Conf12/ only).
