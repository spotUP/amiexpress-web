---
date: 2026-04-28
topic: audit-track-c-internal-commands
tags: [audit, internal-commands, express.e, deviation]
status: final
---

# Track C — Internal Commands A–Z Audit

Express.e source: lines 24411–28227 (internal-commands module)

## Summary

Total commands audited: 26 alphabet letters + ~15 multi-letter variants
✅ OK: A, B, C, CF, D, E, F, FR, FS, G, GR, H, J, JM, M, MS, N, Q, R, RL, RZ, S, T, U, UP, US, V, VER, VO, W, WHO, WHD, X, Z, ZOOM, <, >, <<, >>, ?, 0, 1, 2, 3, 4, 5, CF, CM, FM, NM, OLM
⚠️ DEVIATION: B, G, M, O, RL, V, W, Z, ZOOM, NM, FM, OLM
❌ MISSING: (none fully missing — all have at least partial implementations)

---

## internalCommandGreets / GR (express.e:24411–24423)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/advanced-commands.handler.ts` (handleGreetingsCommand)
**Notes**: Output strings match express.e exactly, all group names present in correct order.

---

## internalCommand0 — Remote Shell (express.e:24424–24451)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleRemoteShellCommand)
**Issue**: Express.e prompts for a remote shell password (if configured) then runs `remoteShell()`. Our version shows a stub explanation screen instead — it never prompts for a password and never enters a shell. This is intentional (web security) but is not tagged `WEB_:`.
**Priority**: P3 (AmigaDOS shell not applicable to web; acceptable divergence but needs `// WEB_:` tag)
**Fix**: Add `// WEB_: express.e:24434-24450 — password prompt + remoteShell() not applicable on web; stub intentional.`

---

## internalCommand1 — Account Editing (express.e:24453–24459)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleAccountEditingCommand)
**Notes**: ACS check, callersLog entry, and delegate to `editAccounts` equivalent (handleAccountEditorMenu) all present.

---

## internalCommand2 — Callers Log (express.e:24461–24509)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleCallersLogCommand)
**Issue**: Express.e lists available nodes (0..N), prompts which node's log to view, then calls `displayCallersLog(file, NS)`. Our version shows a single flat list of recent database activity — no node selection loop, no per-node log files.
**express.e**:
```
loop:=0
REPEAT
  StringF(temp,'\sNode\d/Callerslog',cmds.bbsLoc,loop)
  IF(fh:=Open(temp,MODE_OLDFILE))<>0
    Close(fh)
    StringF(temp,'\d - Callerslog for Node \d\b\n',loop,loop)
    aePuts(temp)
    loop++
  ENDIF
UNTIL fh=NIL
aePuts('\b\nWhich node to view? ')
```
**Priority**: P2 — multi-node log selection flow entirely different. Should either implement node log files or tag `WEB_:` with reason.

---

## internalCommand3 — Edit Directory Files (express.e:24511–24515)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleEditDirectoryFilesCommand)
**Issue**: Express.e calls `editDirFile(params)` (MicroEmacs editor). Our version shows a stub explanation. Acceptable for web but missing `// WEB_:` tag.
**Priority**: P3

---

## internalCommand4 — Edit Any File (express.e:24517–24521)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleEditAnyFileCommand)
**Issue**: Express.e calls `editAnyFile(params)`. Our version stubs with explanation. Acceptable for web but missing `// WEB_:` tag.
**Priority**: P3

---

## internalCommand5 — Directory Anywhere (express.e:24523–24527)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/sysop-commands.handler.ts` (handleChangeDirectoryCommand)
**Issue**: Express.e calls `myDirAnyWhere(params)`. Our version stubs. Acceptable for web but missing `// WEB_:` tag.
**Priority**: P3

---

## internalCommandLT / < — Previous Conference (express.e:24529–24546)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/operations/navigation-quick.handler.ts` (handlePreviousConferenceCommand)
**Notes**: ACS check, saveMsgPointers, search backwards for accessible conf, fallback to J prompt — all match.

---

## internalCommandGT / > — Next Conference (express.e:24548–24564)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/operations/navigation-quick.handler.ts` (handleNextConferenceCommand)
**Notes**: Same as < — all steps match.

---

## internalCommandLT2 / << — Previous Message Base (express.e:24566–24578)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/operations/navigation-quick.handler.ts` (handlePreviousMessageBaseCommand)

---

## internalCommandGT2 / >> — Next Message Base (express.e:24580–24592)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/operations/navigation-quick.handler.ts` (handleNextMessageBaseCommand)

---

## internalCommandQuestionMark / ? (express.e:24594–24599)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/display-file-commands.handler.ts` (handleQuestionMarkCommand)
**Notes**: Expert mode check (`user.expert === 'X'`), `checkScreenClear()`, then `displayScreen(SCREEN_MENU)` — all present.

---

## internalCommandA — Alter Flags (express.e:24601–24605)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/operations/alter-flags.handler.ts` (AlterFlagsHandler)
**Notes**: ACS_DOWNLOAD check, ENV_FILES set, `alterFlags()` called. Interactive C/F flag commands, flagFrom() implemented.

---

## internalCommandB — Read Bulletin (express.e:24607–24656)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/display-file-commands.handler.ts` (handleReadBulletinCommand)
**Issue 1**: Express.e checks for `Bulletins/BullHelp.txt` in `confScreenDir` (per-conference). Our version checks a global `dataDir/Bulletins/BullHelp.txt`, not the conference-specific path.
**express.e**:
```
StrCopy(str,confScreenDir)
StrAdd(str,'Bulletins/BullHelp.txt')
IF((fh:=Open(str,MODE_OLDFILE)))=0
  myError(ERR_NO_BULLS)
  RETURN RESULT_SUCCESS
ENDIF
```
**Issue 2**: Express.e loops back (`JUMP inputAgain`) after every bulletin display, remaining in the B command until the user presses Enter with no input. Our version does implement the BULLETIN_INPUT state loop, which is correct, but the help/bulletin path construction differs.
**Issue 3**: Express.e displays the error message as `'\b\nSorry there is no bulletin #\d\b\n\b\n'` — our version uses `AnsiUtil.errorLine()` which adds different formatting.
**Priority**: P2 — confScreenDir vs dataDir path issue means bulletins in per-conference locations won't be found.

---

## internalCommandC — Comment to Sysop (express.e:24658–24670)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/chat/preference-chat-commands.handler.ts` (handleCommentToSysopCommand)
**Notes**: ACS_COMMENT_TO_SYSOP check, ENV_MAIL, mciViewSafe=FALSE/TRUE, commentToSYSOP path all present.

---

## internalCommandCF — Conference Flags (express.e:24672–24841)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/advanced-commands.handler.ts` (handleConferenceFlagsCommand)
**Issue 1**: Express.e uses `relConf()` (relative conference numbering) for display and input. Our version uses raw conference IDs — users would enter `1` for what AmiExpress displays as `1`, but if `relConf` mapping is used on the live system the numbers may diverge.
**Issue 2**: Express.e parses comma-separated input with a pointer-walk through the string (`p:=confNums; WHILE InStr(p,',')…`). Our version uses `split(',')` which is functionally equivalent.
**Issue 3**: Express.e display format uses `StringF(tempstr,'[34m[[0m\r\s[5][34m] [36m\c \c \c \c [0m\l\s[23]',confStr,c1,c4, c2,c3,confTitle)` — exact right-padded column widths. Our version uses `padEnd(5)` and `padEnd(23)` which should match, but the flag ordering is **c1 c4 c2 c3** (M A F Z) which our code respects.
**Issue 4**: Express.e shows `F` for FORCE_NEWSCAN, `D` for NO_NEWSCAN, `*` for user-set, ` ` for off. Our version only shows `*` or ` ` — no `F`/`D` TOOLTYPE distinction.
**Priority**: P2 — FORCE_NEWSCAN / NO_NEWSCAN tool types not reflected in CF display.

---

## internalCommandCM — Conference Maintenance (express.e:24843–24852)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/command-handler/internal-commands.ts` (handleConferenceMaintenanceCommand)
**Issue**: The reference in internal-commands.ts shows it delegates to `handleConferenceMaintenanceCommand`. Express.e calls `sendCLS(); conferenceMaintenance(); loadMsgPointers(...)`. The actual implementation needs verification — the function is imported but its body is not in the audited files.
**Priority**: P2 — need to verify `handleConferenceMaintenanceCommand` fully implements `conferenceMaintenance()`.

---

## internalCommandD — Download (express.e:24853–24858)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/user-commands.handler.ts` (handleDownloadCommand)
**Notes**: ACS_DOWNLOAD check, ENV_DOWNLOADING, delegates to `beginDLF` equivalent (download handler). Flagged files shortcut also present.

---

## internalCommandE — Enter Message (express.e:24860–24870)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/system-commands.handler.ts` (handleEnterMessageCommand)
**Notes**: ACS_ENTER_MESSAGE check, ENV_MAIL, delegates to messaging handler.

---

## internalCommandFS — File Status (express.e:24872–24875)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/display-file-commands.handler.ts` (handleFileStatusCommand)
**Notes**: ACS_CONFERENCE_ACCOUNTING check, fileStatus(0) equivalent implemented.

---

## internalCommandF — File Listings (express.e:24877–24881)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/display-file-commands.handler.ts` (handleFileListCommand)
**Notes**: ACS_FILE_LISTINGS check, ENV_FILES, delegates to FileListingHandler.

---

## internalCommandFR — File Listings Reverse (express.e:24883–24887)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/display-file-commands.handler.ts` (handleFileListRawCommand)
**Notes**: Same as F but with `reverse=TRUE` parameter.

---

## internalCommandFM — File Maintenance (express.e:24889–25045)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/file/file-maintenance.handler.ts` (FileMaintenanceHandler)
**Issue**: Express.e's FM is an elaborate interactive file maintenance loop supporting search, delete, move, view operations across all directory files. It processes flagged files, uses `maintenanceFileSearch()`, `maintenanceFileDelete()`, `maintenanceFileMove()`. The TS implementation exists but its fidelity to the full express.e flow (especially the C/D/M/V/Q action prompts and the full move-with-date-sorting logic) could not be verified from the audited handler files alone.
**Priority**: P1 — FM is complex and frequently used by sysops; fidelity is critical.

---

## internalCommandG — Goodbye/Logoff (express.e:25047–25075)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/system-commands.handler.ts` (handleGoodbyeCommand)
**Issue 1**: Express.e checks `partUploadOK(0)` before `checkFlagged()`. Our version skips the part-upload check entirely (noted as "For web version, we don't have partial uploads").
**Issue 2**: Express.e's `checkFlagged()` prompts the user whether to download flagged files and lets them do a batch download before logoff. Our version just checks the count and enters a separate `BATCH_DOWNLOAD_CONFIRM` state — the actual download-then-logoff sequence may differ.
**Issue 3**: Express.e outputs `'\r\n\r\nClick...NO CARRIER\r\n'`. Our version outputs `'\r\n\r\nClick...NO CARRIER\r\n'`. ✅ String matches.
**Issue 4**: Express.e shows `displayScreen(SCREEN_LOGOFF)` inside the main BBS loop (express.e:8187), not inside `internalCommandG`. Our version calls `_displayScreen(socket, session, 'Logoff')` inside the G handler itself. This may cause sequencing differences.
**Priority**: P2 — partUploadOK skip could cause data loss in edge cases.

---

## internalCommandH — Help (express.e:25075–25087)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/system-commands.handler.ts` (handleHelpCommand)
**Issue**: Express.e only sets `nonStopDisplayFlag` (does NOT clear screen). Our version emits `'\x1b[2J\x1b[H'` (CLS) unconditionally. Express.e never does a screen clear in H.
**express.e**: No sendCLS() call — just `findSecurityScreen` + `displayFile`.
**Priority**: P2 — extra CLS changes user experience.

---

## internalCommandUpHat / ^ — Help Files (express.e:25089–25111)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/utility-commands.handler.ts` (handleHelpFilesCommand)
**Notes**: Progressive character-stripping search for `help/<topic>` files, doPause after display — all implemented.

---

## internalCommandJ — Join Conference (express.e:25113–25183)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/user-commands.handler.ts` (handleJoinConferenceCommand)
**Notes**: ACS check, saveMsgPointers, getInverse equivalent (relConf), conference number prompt, access check, msgbase prompt — all present. Recently fixed (2026-04-27 session).

---

## internalCommandJM — Join Message Base (express.e:25185–25237)
**Status**: ✅ OK
**Our file**: Express.e's JM delegates from J when a `.` is in the param — our J command handles `X.Y` syntax correctly, and there is a separate JM path. Implemented in `handleJoinConferenceCommand` with the dotted-param branch.

---

## internalCommandM — ANSI Color Toggle (express.e:25239–25248)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/chat/preference-chat-commands.handler.ts` (handleAnsiModeCommand)
**Issue**: Express.e outputs `'\b\nAnsi Color Off\b\n'` / `'\b\nAnsi Color On\b\n'` — no extra decoration. Our "Ansi Color On" path calls `AnsiUtil.successLine()` which wraps with ANSI green color codes. Express.e uses no ANSI codes in these strings (it could be toggled off and still need to work). "Ansi Color Off" path is correct (plain text). Also, our version emits `AnsiUtil.pressKeyPrompt()` afterward; express.e does not pause — it returns immediately.
**Priority**: P2 — wrong "Ansi Color On" formatting; spurious pause.

---

## internalCommandMS — Mail Scan (express.e:25250–25279)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/advanced-commands.handler.ts` (handleMailScanCommand)
**Notes**: Saves/restores conf, iterates all accessible confs and msgbases with FORCE_MAILSCAN_ALL, restores with FORCE_MAILSCAN_SKIP.

---

## internalCommandN — New Files (express.e:25275–25279)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/navigation-commands.handler.ts` (handleNewFilesCommand)
**Notes**: ACS_FILE_LISTINGS check, ENV_FILES, delegates to myNewFiles equivalent.

---

## internalCommandNM — Node Management (express.e:25281–25370)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/message/message-commands.handler.ts` (handleNodeManagementCommand)
**Issue**: Express.e's NM is a full node management loop: shows the WHO list, prompts for node number, then asks to take node offline / bring online / kick user depending on node status. It sends Exec messages (`SV_EXITNODE`, `SV_KICKUSER`, `SV_STARTNODE`) to node ports. Our version's node management exists but operates on web sessions via different mechanisms — the exact `who(0)` then loop-with-confirm flow may differ. Not fully audited since `message-commands.handler.ts` is 3,633 lines and was not read in this session.
**Priority**: P1 — sysop node control is safety-critical; fidelity gap unknown.

---

## internalCommandO — Page Sysop (express.e:25372–25404)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/command-handler/page-sysop-command.ts` (handlePageSysopCommand)
**Issue 1**: Express.e's O command is more complex than our handler:
  - If `pagesAllowed=0`, redirects to `commentToSYSOP()` (C command flow), not to a generic handler.
  - Decrements `pagesAllowed` only if `pagesAllowed <> -1`.
  - Checks `sysopAvail` AFTER calling `sysopPaged()` — if sysop not available AND user lacks `ACS_OVERRIDE_CHAT`, outputs `'\b\nSorry, \s, is not around right now\b\n'` + `'You can use ''C'' to leave a comment.\b\n\b\n'`.
  - Only calls `ccom()` (chat) if sysop IS available or user has override.
**Our version**: Delegates entirely to `handlePageSysop()` in `operator-chat.handler` — the pagesAllowed→commentToSYSOP redirect, the specific "not around right now" message with the sysop name, and the "You can use 'C' to leave a comment" message are not verified present.
**express.e**:
```
IF(pagesAllowed=0)
  setEnvStat(ENV_MAIL)
  IF((checkSecurity(ACS_COMMENT_TO_SYSOP)=FALSE)) THEN RETURN RESULT_NOT_ALLOWED
  mciViewSafe:=FALSE
  result:=commentToSYSOP()
  mciViewSafe:=TRUE
  RETURN result
ENDIF

IF(pagesAllowed<>-1) THEN pagesAllowed--
IF((checkSecurity(ACS_PAGE_SYSOP))=FALSE) THEN RETURN RESULT_NOT_ALLOWED
setEnvStat(ENV_REQ_CHAT)
pagedFlag:=1
sysopPaged()
result:=RESULT_SUCCESS
IF(sysopAvail=FALSE) AND (checkSecurity(ACS_OVERRIDE_CHAT)=FALSE)
  StringF(string,'\b\nSorry, \s, is not around right now\b\n',cmds.sysopName)
  aePuts(string)
  aePuts('You can use ''C'' to leave a comment.\b\n\b\n')
ELSE
  result:=ccom()
ENDIF
```
**Priority**: P1 — pagesAllowed counter and fallback-to-comment flow are user-facing behaviors.

---

## internalCommandOLM — Online Message (express.e:25406–25503)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/transfer/olm.handler.ts` (handleOlmCommand)
**Issue 1**: Express.e checks `(sopt.toggles[TOGGLES_MULTICOM]=FALSE)` — if multicom is off, returns NOT_ALLOWED. Our version checks `config.get('olmEnabled')` — different config mechanism.
**Issue 2**: Express.e checks `olmBlocked` on the target node (the `destNode.misc2[0]` field) and outputs `'\b\n[34m*[0m--[33mNODE [0m\d[33m HAS MESSAGES SUPPRESSED[0m--[34m*[0m\b\n'`. This is the Q (quiet mode) flag of the target. Not verified in our version.
**Issue 3**: Express.e checks `userstatus` to see if destination node is active before sending. Our implementation may differ.
**Issue 4**: Express.e sends a multi-part OLM packet: header line, message lines, then a "Press [Return] To Resume" tail packet with flag `-1`. Our version uses WebSocket events instead of Exec messaging — fundamentally different transport but acceptable for web.
**Priority**: P2 — olmBlocked/quietMode check on target node and "messages suppressed" message may be missing.

---

## internalCommandQ — Quiet Mode Toggle (express.e:25504–25516)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/system-commands.handler.ts` (handleQuietModeCommand)
**Notes**: ACS_QUIET_NODE check, toggle, output strings correct.

---

## internalCommandR — Read Messages (express.e:25518–25532)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/system-commands.handler.ts` (handleReadMessagesCommand)
**Notes**: ACS check, ENV_MAIL, getMailStatFile, delegates to messaging handler.

---

## internalCommandRL — Relogon (express.e:25534–25539)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/utility-commands.handler.ts` (handleRelogonCommand)
**Issue**: Express.e's RL simply sets `relogon:=TRUE` and calls `internalCommandG(params)` immediately — no confirmation prompt.
**express.e**:
```
PROC internalCommandRL(params)
  IF checkSecurity(ACS_RELOGON)=FALSE THEN RETURN RESULT_NOT_ALLOWED
  relogon:=TRUE
  internalCommandG(params)
ENDPROC RESULT_SUCCESS
```
**Our code**: Prompts "Are you sure you want to relogon? (Y/N):" — this extra confirmation is a `WEB_:` divergence not in express.e and not tagged.
**Priority**: P2 — user experience mismatch; express.e users expect immediate relogon.

---

## internalCommandRZ — Zmodem Upload (express.e:25608–25621)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` (handleZmodemUploadCommand)
**Notes**: ACS_UPLOAD check, ENV_UPLOADING, immediate ZMODEM receive path.

---

## internalCommandS — User Statistics (express.e:25540–25606)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/user-commands.handler.ts` (handleUserStatsCommand)
**Notes**: All fields present: user number, area name, caller num, last date on, security level, times called, times today, messages posted, baud, CPS rates, screen clear, protocol, credit account, sysop here, pages remaining, fileStatus(). Field format strings match express.e color codes.

---

## internalCommandT — Time/Date Display (express.e:25622–25644)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/navigation-commands.handler.ts` (handleTimeCommand)
**Notes**: `'It is '` prefix, FORMAT_USA (MM-DD-YY HH:MM:SS), exact string match to express.e output.

---

## internalCommandU — Upload (express.e:25646–25658)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/user-commands.handler.ts` (handleUploadCommand)
**Notes**: ACS_UPLOAD check, ENV_UPLOADING, delegates to uploadaFile equivalent.

---

## internalCommandUS — Sysop Upload (express.e:25660–25665)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` (handleSysopUploadCommand)
**Notes**: ACS_SYSOP_COMMANDS check, ENV_UPLOADING, delegates to sysopUpload equivalent.

---

## internalCommandUP — Node Uptime (express.e:25667–25673)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` (handleNodeUptimeCommand)
**Notes**: Exact format `'Node \d was started at \s.\b\n'` — our version matches.

---

## internalCommandV — View File (express.e:25675–25687)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/utility-commands.handler.ts` (handleViewFileCommand)
**Issue 1**: Express.e's V command calls `viewAFile(cmdcode, params)` which handles RIP mode brackets (`[1!`/`[2!`) around the view. Our version checks `ACS_VIEW_A_FILE`, sets ENV_VIEWING, then looks for the file in `confScreenDir/../TEXT/`. Express.e's `viewAFile` searches the BBS file areas, not a TEXT subdirectory.
**Issue 2**: Express.e emits `'[1!'` before view and `'[2!'` after in RIP mode. Our version doesn't handle RIP mode brackets.
**Issue 3**: Express.e prompts with whatever `viewAFile` prompts for — not a custom "Enter filename to view" prompt.
**Priority**: P2 — file search path differs; RIP mode not handled.

---

## internalCommandVER — Version (express.e:25688–25699)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/info-commands.handler.ts` (handleVersionCommand)
**Issue**: Express.e outputs:
```
'\b\nAmiExpress \s (\s) Copyright ©2018-2023 Darren Coles\b\n\b\n'
'Original Version:\b\n'
'  (C)1989-91 Mike Thomas, Synthetic Technologies\b\n'
'  (C)1992-95 Joe Hodge, LightSpeed Technologies Inc.\b\n\b\n'
'Registered to \s.\b\n'   (regKey)
```
Our version adds extra lines about Node.js/TypeScript, features, "Open Source Community" registration — these are `WEB_:` extensions but not tagged. The existing original attribution lines are correct but buried in extra web-only text.
**Priority**: P3 — extra info acceptable but should be tagged `WEB_:`.

---

## internalCommandVO — Voting Booth (express.e:25700–25710)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts` (handleVotingBoothCommand)
**Notes**: ACS_VOTE check, ENV_DOORS, `setEnvMsg('Voting Booth')`, ACS_MODIFY_VOTE branches to voteMenu() vs vote() — all present. Full voting flow (conductVoting, displayVoteResults, submitAllVotes, voteMenu for sysops) implemented.

---

## internalCommandW — Write User Parameters (express.e:25712–26092)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/info-commands.handler.ts` (handleWriteUserParamsCommand, _displayWCommandMenu)
**Issue 1**: Our W menu adds options 17 (Modem Emulation Speed), 18 (Terminal Font), 19 (VIEW MY DATA / GDPR), 20 (DELETE MY ACCOUNT) — these are web extensions. Options 17/18/19/20 lack `// WEB_:` tags.
**Issue 2**: Express.e option 16 (BGFILECHECK) is conditionally shown only if `TOOLTYPE_NODE,node,'BGFILECHECK'` exists AND `FORCE_BGFILECHECK` is absent. Our version always shows option 16 as `[DISABLED]` regardless of tooltype — this is wrong for systems where BGFILECHECK is configured.
**Issue 3**: Express.e option 8 (COMPUTER) calls `chooseComputer()` which displays a list from `computerTypes`. Our version prompts for free text — the list selection is missing.
**Issue 4**: Express.e option 9 (SCREEN TYPE) calls `chooseScreenType()` from `screenTypeTitle` list. Our version prompts for free text — same issue.
**Issue 5**: Express.e option 11 (TRANSFER PROTOCOL) calls `chooseProtocol()` from `xprTitle` list. Our version shows a hardcoded list of 7 protocols. The xpr title list is protocol-plugin-driven in express.e.
**Issue 6**: Express.e option 15 (TRANSLATOR) calls `chooseTranslator()`. Our version sets state but then just returns without actually changing anything.
**Priority**: P2 (missing chooseComputer/chooseScreenType lists; BGFILECHECK display logic wrong; translator stub)

---

## internalCommandWHO — Who's Online (express.e:26094–26103)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/commands/info-commands.handler.ts` (handleWhoCommand)
**Notes**: ACS_WHO_IS_ONLINE + TOGGLES_MULTICOM check, ENV_DOORS, `who(0)` equivalent with table format. Table ASCII border matches express.e format.

---

## internalCommandWHD — Who's Online Detailed (express.e:26104–26112)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/info-commands.handler.ts` (handleWhoDetailedCommand)
**Issue**: Express.e's `who(1)` parameter causes it to show debug memory pointer information (not user-friendly). Our WHD shows the same table as WHO but labeled "detailed" — this is a `WEB_:` improvement but not tagged.
**Priority**: P3 — minor; web improvement is acceptable but needs `// WEB_:` tag.

---

## internalCommandX — Expert Mode Toggle (express.e:26113–26122)
**Status**: ✅ OK
**Our file**: `web/backend/src/handlers/chat/preference-chat-commands.handler.ts` (handleExpertModeCommand)
**Notes**: Toggle `expert` field between `'X'` and `'N'`, exact strings `'Expert mode disabled'` / `'Expert mode enabled'`, save to DB — all correct.

---

## internalCommandZ — Zippy Search (express.e:26123–26213)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/utility-commands.handler.ts` (handleZippySearchCommand)
**Issue 1**: Express.e's Z reads DIR files from disk with a multi-directory scan loop (`getDirSpan`, then `zippy(str, ss)` per directory). Our version does a database query — fundamentally different but acceptable for web. However, the `getDirSpan` prompt (`'Directories: (1-\d), (A)ll, (U)pload, (H)old, (Enter)=none?'`) is not shown in our version — we only accept a search string parameter.
**Issue 2**: Express.e's `zippy()` function shows file entries with a multi-line context buffer (buffering description lines, pausing every page). Our version shows flat results without the context buffering.
**Issue 3**: Express.e uppercases the search string before matching. Our version does uppercase the search string (`parsedParams[0].toUpperCase()`). ✅
**Priority**: P2 — missing directory range prompt is a UX difference; zippy output format differs.

---

## internalCommandZOOM — Zoom Mail (express.e:26215–26344)
**Status**: ⚠️ DEVIATION
**Our file**: `web/backend/src/handlers/commands/utility-commands.handler.ts` (handleZoomCommand)
**Issue 1**: Express.e first runs `asciiZoom()` or `qwkZoom()` (writes MESSAGES.DAT, CONTROL.DAT, MESSAGES.NDX to PlayPen), then prompts for pack method (LHA or ZIP), then packs and downloads via ZMODEM. Our version calls QWKManager to generate a packet, provides a download URL, and auto-selects ZIP — the LHA/ZIP prompt exists in output text but is not actually interactive.
**Issue 2**: Express.e's `qwkZoom()` generates `CONTROL.DAT` with BBS name, address, number, sysop, BBS ID, datetime, username, conference list. Our QWKManager should replicate this but is not audited here.
**Issue 3**: Express.e downloads the zoom file via ZMODEM (`downloadFile(outputZoomName)`) after a `doPause()`. Our version provides a URL — not ZMODEM download.
**Issue 4**: Express.e uses `ZOOM_SCAN_MASK` on `cb.handle[0]` (per conf_base flag). Our version uses the `conf_base.scan_flags` DB column — functionally equivalent if the same bit is used.
**Priority**: P1 — ZMODEM download vs URL is a fundamental difference; QWK packet contents need verification.

---

## Summary Table

| Cmd | Status | Priority | File |
|-----|--------|----------|------|
| 0 (shell) | ⚠️ DEVIATION | P3 | sysop-commands.handler.ts |
| 1 (accounts) | ✅ OK | — | sysop-commands.handler.ts |
| 2 (callerslog) | ⚠️ DEVIATION | P2 | sysop-commands.handler.ts |
| 3 (editdir) | ⚠️ DEVIATION | P3 | sysop-commands.handler.ts |
| 4 (editfile) | ⚠️ DEVIATION | P3 | sysop-commands.handler.ts |
| 5 (dirany) | ⚠️ DEVIATION | P3 | sysop-commands.handler.ts |
| < | ✅ OK | — | navigation-quick.handler.ts |
| > | ✅ OK | — | navigation-quick.handler.ts |
| << | ✅ OK | — | navigation-quick.handler.ts |
| >> | ✅ OK | — | navigation-quick.handler.ts |
| ? | ✅ OK | — | display-file-commands.handler.ts |
| A | ✅ OK | — | alter-flags.handler.ts |
| B | ⚠️ DEVIATION | P2 | display-file-commands.handler.ts |
| C | ✅ OK | — | preference-chat-commands.handler.ts |
| CF | ⚠️ DEVIATION | P2 | advanced-commands.handler.ts |
| CM | ⚠️ DEVIATION | P2 | (via internal-commands.ts) |
| D | ✅ OK | — | user-commands.handler.ts |
| E | ✅ OK | — | system-commands.handler.ts |
| F | ✅ OK | — | display-file-commands.handler.ts |
| FM | ⚠️ DEVIATION | P1 | file-maintenance.handler.ts |
| FR | ✅ OK | — | display-file-commands.handler.ts |
| FS | ✅ OK | — | display-file-commands.handler.ts |
| G | ⚠️ DEVIATION | P2 | system-commands.handler.ts |
| GR | ✅ OK | — | advanced-commands.handler.ts |
| H | ⚠️ DEVIATION | P2 | system-commands.handler.ts |
| J | ✅ OK | — | user-commands.handler.ts |
| JM | ✅ OK | — | user-commands.handler.ts |
| M | ⚠️ DEVIATION | P2 | preference-chat-commands.handler.ts |
| MS | ✅ OK | — | advanced-commands.handler.ts |
| N | ✅ OK | — | navigation-commands.handler.ts |
| NM | ⚠️ DEVIATION | P1 | message-commands.handler.ts |
| O | ⚠️ DEVIATION | P1 | page-sysop-command.ts |
| OLM | ⚠️ DEVIATION | P2 | transfer/olm.handler.ts |
| Q | ✅ OK | — | system-commands.handler.ts |
| R | ✅ OK | — | system-commands.handler.ts |
| RL | ⚠️ DEVIATION | P2 | utility-commands.handler.ts |
| RZ | ✅ OK | — | transfer-misc-commands.handler.ts |
| S | ✅ OK | — | user-commands.handler.ts |
| T | ✅ OK | — | navigation-commands.handler.ts |
| U | ✅ OK | — | user-commands.handler.ts |
| UP | ✅ OK | — | transfer-misc-commands.handler.ts |
| US | ✅ OK | — | transfer-misc-commands.handler.ts |
| V | ⚠️ DEVIATION | P2 | utility-commands.handler.ts |
| VER | ⚠️ DEVIATION | P3 | info-commands.handler.ts |
| VO | ✅ OK | — | transfer-misc-commands.handler.ts |
| W | ⚠️ DEVIATION | P2 | info-commands.handler.ts |
| WHO | ✅ OK | — | info-commands.handler.ts |
| WHD | ⚠️ DEVIATION | P3 | info-commands.handler.ts |
| X | ✅ OK | — | preference-chat-commands.handler.ts |
| Z | ⚠️ DEVIATION | P2 | utility-commands.handler.ts |
| ZOOM | ⚠️ DEVIATION | P1 | utility-commands.handler.ts |
| ^ | ✅ OK | — | utility-commands.handler.ts |
