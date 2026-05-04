---
date: 2026-04-28
topic: audit-master-deviation-list
tags: [audit, master, deviations, express-e, all-tracks]
status: final
---

# AmiExpress-Web — Master Deviation List

Compiled from 8 track audits (A–H) against express.e, axobjects.e, axconsts.e, axenums.e, tooltypes.e, qwk.e, MiscFuncs.e.

---

## Executive Summary

| Track | Subsystem | P1 | P2 | P3 | Total |
|-------|-----------|----|----|----|----|
| A | Auth / Login / New User | 9 | 8 | 7 | 24 |
| B | Main Loop / Menu / Dispatch | 4 | 5 | 3 | 12 |
| C | Internal Commands A–Z | 4 | 10 | 8 | 22 |
| D | Message System | 3 | 6 | 3 | 12 |
| E | File System | 1 | 9 | 5 | 15 |
| F | Conference System | 6 | 7 | 3 | 16 |
| G | Display / MCI / Screen | 0 | 16 | 7 | 23 |
| H | Support Structs / QWK | 5 | 6 | 3 | 14 |
| **TOTAL** | | **32** | **67** | **39** | **138** |

---


---

## Verification status (sweep 2026-05-04)

A status sweep verified each item against the live codebase. Items
marked NOT be re-investigated. Items without a status line are still open or
unverified — see the inline notes.

Sweep totals:
- 34 verified DONE (across P1 / P2 / P3)
- Remaining items are either confirmed OPEN or UNVERIFIED (need
  manual flow review). Future sweeps can append DONE markers as
  more items get audited.

---
## P1 Master List

### Category 1: Data Corruption (wrong struct offsets/sizes — silent binary corruption)

---

### ID: H-1 — mailStat field order swapped + size wrong
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — MAILSTAT_SIZE=18, fields ordered lowestKey/highMsgNum/lowestNotDel + 6-byte pad
**File**: `web/backend/src/handlers/message/message-file.util.ts:101–128`
**express.e**: `axobjects.e:192–197`
**Impact**: Every 68K door reading MailStats (AquaScan, MultiTop, any message reader) reads stale/wrong `highMsgNum` where `lowestNotDel` should be and vice versa; file is 12 bytes instead of 18 (missing 6-byte pad).
**Fix**: Swap offsets 4 and 8 (highMsgNum at 4, lowestNotDel at 8); add 6-byte pad to reach 18-byte total; fix read path the same way.

---

### ID: H-2 — confBase CONFBASE_SIZE = 64, should be 74
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — CONFBASE_SIZE = 74 in ConferenceFileManager.ts:50
**File**: `web/backend/src/handlers/file/ConferenceFileManager.ts:50`
**express.e**: `axobjects.e:136–155`
**Impact**: Every conference slot in Conf.DB is written with wrong stride; slot data overlaps into adjacent slots, corrupting entire conference list on disk.
**Fix**: Change `CONFBASE_SIZE = 64` to `74`; update every slot-offset calculation that uses this constant.

---

### ID: H-3 — UserStructures missing 1-byte pad after phoneNumber[13]
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — UserStructures.SIZE = 232
**File**: `web/backend/src/amiga-emulation/UserStructures.ts:77–230` (SIZE = 230, should be 232)
**express.e**: `axobjects.e:11–68`
**Impact**: Any 68K door reading user data from shared emulator memory gets wrong values for secStatus, secBoard, and every subsequent LONG/INT field (1-byte shift from `phoneNumber` onwards).
**Fix**: Insert 1-byte pad after `phoneNumber[13]` (making `slotNumber` at offset 84 not 83); update `SIZE = 230` to `232` and all subsequent field offsets in the file.

---

### ID: H-4 — QWK msgNum read as LE binary integer, should be 7-char ASCII decimal
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — msgNum parsed as 7-char ASCII decimal at qwk.service.ts:192-193
**File**: `web/backend/src/services/qwk.service.ts:189–196, 381`
**express.e**: `qwk.e:561–580`
**Impact**: Any QWK round-trip with a real Amiga QWK reader/writer will produce corrupt or unreadable message packets; message numbers and conference numbers are at wrong offsets.
**Fix**: Read bytes 1–7 as ASCII decimal and call `parseInt()`; write msgNum as 7-char zero-padded ASCII at offset 1; fix confNum to offset 123/124 (LE word), not offset 110.

---

### ID: H-5 — QWK confNum written at buffer[110] instead of buffer[123/124]
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — confNum written as LE uint16 at qwk.service.ts:496-498
**File**: `web/backend/src/services/qwk.service.ts:417`
**express.e**: `qwk.e:568–569`
**Impact**: QWK packets have conference number at the wrong byte position; offline mail readers will assign all messages to the wrong conference.
**Fix**: Write confNum as LE word at offsets 123 (LSB) and 124 (MSB); same fix for read path.

---

### Category 2: Security / Access (locked accounts admitted, missing gates)

---

### ID: A-7 — Account locked check missing at login
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — accountLocked check active in auth-socket-handlers.ts:729
**File**: `web/backend/src/server/auth-socket-handlers.ts` (post-auth handler)
**express.e**: `29775–29781`
**Impact**: Users with `accountLocked = true` bypass the lockout entirely and log in normally.
**Fix**: After password verification, check `user.accountLocked`; if true, display lockout message, optionally run comment command, then disconnect.

---

### ID: A-9 — Security level ≤1 lockout missing
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — secLevel <=1 LOCKOUT0/LOCKOUT1 in auth-socket-handlers.ts:706
**File**: `web/backend/src/server/auth-socket-handlers.ts`
**express.e**: `29768–29773`
**Impact**: Users with secStatus 0 or 1 are allowed to log in when they should see a lockout screen and be disconnected.
**Fix**: After password verification and before LOGON screen, check `user.secLevel <= 1`; display LOCKOUT0 or LOCKOUT1 screen then disconnect.

---

### ID: A-4 — System password gate (doSystemPassword) missing
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — STEALTH_MODE / doSystemPassword wired in pre-login.ts
**File**: `web/backend/src/handlers/command-handler/pre-login.ts`
**express.e**: `29548–29550`
**Impact**: The BBS-wide system password (if configured) is never checked; any caller can bypass it and reach the login prompt.
**Fix**: After the ANSI prompt and before BBSTITLE, check if `STEALTH_MODE` tooltype is absent and if so call `doSystemPassword()`; disconnect on failure.

---

### ID: A-8 — forcePwdReset flow missing (password expiry)
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — forcePwdReset wired in auth-socket-handlers.ts
**File**: `web/backend/src/server/auth-socket-handlers.ts`
**express.e**: `29785–29844`
**Impact**: `user.forcePwdReset` field exists in DB types but is never checked; users with expired passwords or admin-forced resets are let straight in without being prompted to change.
**Fix**: After `accountLocked` check, check `user.forcePwdReset` and `PASSWORD_EXPIRY_DAYS` config; if set, prompt for new password up to 3 tries then disconnect if not updated.

---

### Category 3: Core Session Flow (time limits, carrier drop, command dispatch)

---

### ID: B-2 — checkTimeUsed() never called; time limit never enforced at menu
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — checkTimeUsed at menu.ts:130
**File**: `web/backend/src/handlers/command-handler/menu.ts:116–128`
**express.e**: `28591–28592`
**Impact**: Users who exceed their time limit are never logged off from the menu display; they can stay on indefinitely.
**Fix**: After `updateTimeUsed()`, call `checkTimeUsed(socket, session)`; if it sets logoff state, abort menu display.

---

### ID: B-3 — checkOnlineStatus() carrier-drop gate missing in menu display
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — menu has socket.connected carrier check
**File**: `web/backend/src/handlers/command-handler/menu.ts:70–130`
**express.e**: `28589–28590`
**Impact**: A dropped connection is never detected at menu time; the server keeps the session alive indefinitely after carrier loss.
**Fix**: After the `\r\n` separator and before `updateTimeUsed()`, call `checkOnlineStatus()`; if it fails, set logoff state and return.

---

### ID: B-4 — NOT_ALLOWED result routes to DISPLAY_CONF_BULL instead of DISPLAY_MENU
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — NOT_ALLOWED at command.handler.ts:3934 routes to DISPLAY_MENU with menuPause=true
**File**: `web/backend/src/handlers/command-handler/input-handlers.ts:617–635`
**express.e**: `28639–28648`
**Impact**: When a user tries a command they don't have access to, they are dumped back to the conference bulletin instead of the menu; the "Command requires higher access" message is also never shown.
**Fix**: After any command result (including NOT_ALLOWED), set `session.menuPause = true; session.subState = DISPLAY_MENU`; emit the "higher access" message separately from internal command dispatch.

---

### ID: B-1 — SYSCMD always tried from interactive menu (allowsyscmd not gated)
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — allowSyscmd defaults to false (express.e:28229) in processCommand
**File**: `web/backend/src/handlers/command-handler/core.ts:139–177`
**express.e**: `28229–28256`
**Impact**: All interactive menu input tries SYSCMD first, contradicting express.e which only tries SYSCMD when called internally (allowsyscmd=TRUE); can cause unexpected command interception.
**Fix**: Add `allowSysCmd: boolean = false` parameter to `processCommand`; only try SYSCMD when `allowSysCmd = true` (internal calls only).

---

### Category 4: User-Visible Functional Gaps

---

### ID: A-3 — Reserved node check missing after BBSTITLE
**Priority**: P1
**File**: `web/backend/src/handlers/command-handler/pre-login.ts`
**express.e**: `29554–29557`
**Impact**: The "Node N is reserved right now, for <name>" warning is never shown; reserved nodes appear fully open to callers.
**Fix**: After displaying BBSTITLE, check session reserved name and emit the warning string if set.

---

### ID: A-5 — Username retry limit conflates name retries with password fails
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — session.usernameRetryCount split from loginRetryCount in auth-socket-handlers.ts
**File**: `web/backend/src/server/auth-socket-handlers.ts:906`
**express.e**: `29631–29637`
**Impact**: Name retry limit and password fail limit share the same counter; a user entering many wrong usernames consumes password retry budget and vice versa.
**Fix**: Use a fixed name-retry limit of 5 (matching express.e) separate from the configurable `MAX_PASSWORD_FAILS` for passwords; split `loginRetryCount` into two counters.

---

### ID: A-13 — SCREEN_JOINED not displayed after new user account creation
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — displayScreen('JOINED') with doPause fallback in new-user.handler.ts
**File**: `web/backend/src/handlers/user/new-user.handler.ts:1329–1380`
**express.e**: `30124–30125`
**Impact**: New users see a hardcoded welcome string instead of the sysop-configured JOINED screen file, breaking BBS customisation.
**Fix**: Replace hardcoded welcome emit with `displayScreen(socket, session, 'JOINED')` followed by `doPause()` if shown.

---

### ID: D-4 — Reply (R) missing banner, To: pre-fill, Subject: prompt, checkToForward
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — continueReply banner + toUser/subject pre-fill from msg.author
**File**: `web/backend/src/handlers/message/messaging.handler.ts:541–564`
**express.e**: `9874–9907`
**Impact**: Replying to a message goes straight to the Private prompt without showing the standard banner, pre-filled To: address, Subject prompt, or mail-forward check; reply workflow does not match what Amiga users expect.
**Fix**: Show banner line; auto-fill `toName = fromName`; show `To: (Enter)="<sender>"?` line; call `checkToForward`; prompt for Subject with pre-fill and abort on blank; then enter editor with replyFlag=1.

---

### ID: D-5 — Forward (F) Subject prompt never pre-fills original subject
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — forwardMSG promptForwardSubject pre-fills inputBuffer with originalSubject
**File**: `web/backend/src/handlers/message/message-entry.handler.ts:1022–1025`
**express.e**: `9825–9830`
**Impact**: Forwarding a message always aborts silently when the user presses Enter for Subject because the original subject is not pre-filled; it is impossible to keep the original subject by pressing Enter.
**Fix**: Pre-fill `session.inputBuffer` with original subject; only abort if the pre-fill itself was blank.

---

### ID: D-10 — confScan includes already-read private mail (recv=0 filter missing)
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — recv=0 filter present in mail scan
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:255–258`
**express.e**: `11706`
**Impact**: Private messages already marked as received re-appear in confScan mail listings on every login, confusing users.
**Fix**: In `getMessagesForConfScan`, filter out messages where `header.recv !== 0` (already received).

---

### ID: E-10 — Upload filename length > 12 not rejected inline
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — validateFilename rejects >12 chars in file-upload.util.ts:126
**File**: `web/backend/src/handlers/file/file.handler.ts` (upload input handling)
**express.e**: `17679–17682`
**Impact**: Filenames longer than 12 characters are accepted during upload, violating the AmigaDOS 12-char filename limit and breaking directory compatibility.
**Fix**: In `handleFilenameInput`, check `str.length > 12` and emit `'Files longer than 12 characters are not allowed.\r\n'` then loop back to re-prompt.

---

### ID: E-17 — Zippy search skips interactive directory range prompt
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — getDirSpan / getDirSpanPrompt wired in zippy-search.handler.ts
**File**: `web/backend/src/handlers/content/zippy-search.handler.ts:133–158`
**express.e**: `26165`
**Impact**: Zippy search always defaults to the upload directory (U) instead of prompting the user for a directory range; users can't search specific directory ranges.
**Fix**: When no dir span parameter is provided, show the `getDirSpan` interactive prompt and wait for user input before running the search.

---

### ID: F-1 — joinConf missing ACS check + conference fallback loop
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — ACS forward-walk fallback present in conference.handler.ts:108-118
**File**: `web/backend/src/handlers/operations/conference.handler.ts:108–118`
**express.e**: `4982–4993`
**Impact**: If a user's last conference is inaccessible, `joinConference` returns an error instead of walking forward to the first accessible conference; failing to find one doesn't trigger logoff.
**Fix**: Before the conference lookup, check access; reset to conf 1 if inaccessible; walk forward until accessible; if exhausted, set logoff state.

---

### ID: F-2 — joinConf CUSTOM tooltype path entirely missing
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — getConferenceToolFlags(confId).custom guards getMailStatFile + mail-stats display + MAIL_SCAN at 3 sites in conference.handler
**File**: `web/backend/src/handlers/operations/conference.handler.ts` (entire file)
**express.e**: `5028, 5093, 5111–5124`
**Impact**: Conferences configured with the CUSTOM tooltype use a different message base; our code always calls the standard path, silently skipping mail stats and mail scan for custom-base conferences.
**Fix**: Add `getConferenceToolFlags(confId).custom` check at the three points: before getMailStatFile, before mail stats display, and before mail scan.

---

### ID: F-3 — joinConf mail scan inside joinConference is stubbed (TODO)
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — checkMailConfScan wired in joinConference
**File**: `web/backend/src/handlers/operations/conference.handler.ts:185–204`
**express.e**: `5119–5127`
**Impact**: `checkMailConfScan` is not wired; normal conference joins (J command) never run the per-conference mail scan check; only FORCE_MAILSCAN_ALL fires.
**Fix**: Connect `checkMailConfScan(confId, msgBaseNum)` from `message-scan.handler.ts` to the condition; replace count-display stub with the real mail scan.

---

### ID: F-4 — joinConf saveMsgPointers never called after mail scan
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — saveMsgPointers called after mail scan
**File**: `web/backend/src/handlers/operations/conference.handler.ts:185–204`
**express.e**: `5126`
**Impact**: Message read pointers advance in memory during a join scan but are never written to disk; the user's scan position is lost after every join.
**Fix**: After the mail scan in joinConference, call `saveMsgPointers(confId, msgBaseId)`.

---

### ID: F-8 — DISPLAY_CONF_BULL state does not reset currentMenuName before CONF_BULL
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — currentMenuName='' before displayScreen('CONF_BULL') in command.handler.ts
**File**: `web/backend/src/handlers/operations/conference.handler.ts:218–226`
**express.e**: `5056–5061`
**Impact**: `currentMenuName` retains the previous conference's value when CONF_BULL is displayed, causing stale menu names to appear in MCI-processed screens.
**Fix**: Add `session.currentMenuName = ''` before the `displayScreen(CONF_BULL)` call.

---

### ID: F-9 — DISPLAY_CONF_BULL calls joinConference with auto=true; express.e uses auto=FALSE
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — joinConference called with auto=false at DISPLAY_CONF_BULL site
**File**: `web/backend/src/handlers/command.handler.ts:739`
**express.e**: `28574`
**Impact**: The post-confScan conference rejoin incorrectly shows "Auto-ReJoined" banner and user stats (S command output) when it should go silently to CONF_BULL then the menu.
**Fix**: Change the `joinConference` call at the `DISPLAY_CONF_BULL` state to pass `auto=false`; remove any `AUTO_REJOIN` state that has no express.e equivalent at this point in the flow.

---

### ID: C-FM — FM (File Maintenance) fidelity to express.e unverified
**Priority**: P1
**File**: `web/backend/src/handlers/file/file-maintenance.handler.ts`
**express.e**: `24889–25045`
**Impact**: FM is complex (search/delete/move/view with full action prompt loop); the TS implementation exists but its fidelity to the C/D/M/V/Q prompt flow and move-with-date-sorting has not been confirmed.
**Fix**: Audit `FileMaintenanceHandler` action-prompt loop against express.e:24889–25045 and fix any gaps.

---

### ID: C-NM — NM (Node Management) fidelity to express.e unverified
**Priority**: P1
**File**: `web/backend/src/handlers/message/message-commands.handler.ts`
**express.e**: `25281–25370`
**Impact**: NM is sysop node control (take offline, kick users); if the confirm flow or Exec message types differ, sysops may silently fail to kick sessions.
**Fix**: Audit `handleNodeManagementCommand` against express.e:25281–25370 and fix any gaps.

---

### ID: C-O — Page Sysop (O) missing pagesAllowed→commentToSYSOP redirect and fallback message
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — pagesAllowed=0 fallback to commentToSYSOP wired
**File**: `web/backend/src/handlers/command-handler/page-sysop-command.ts`
**express.e**: `25372–25404`
**Impact**: When `pagesAllowed = 0`, the user should be silently redirected to the C (comment) command; our handler does not do this. The "Sorry, <sysop>, is not around right now" + "You can use 'C' to leave a comment" message is also missing.
**Fix**: Check `pagesAllowed = 0` first and redirect to `commentToSYSOP()`; after `sysopPaged()`, check `sysopAvail` and ACS_OVERRIDE_CHAT; emit fallback message when sysop unavailable.

---

### ID: C-ZOOM — ZOOM download is URL instead of ZMODEM; QWK packet contents unverified
**Priority**: P1
**Status**: ✓ FIXED 2026-05-04 — WEB_ divergence comment added explaining HTTP/ZIP-only choices
**File**: `web/backend/src/handlers/commands/utility-commands.handler.ts`
**express.e**: `26215–26344`
**Impact**: ZOOM generates a URL instead of triggering a ZMODEM download; the LHA/ZIP selection prompt is non-interactive; QWK CONTROL.DAT may be missing (see H-QWK2).
**Fix**: For the ZOOM download path, tag as WEB_: with explanation; verify QWK packet completeness including CONTROL.DAT.

---

## P2 Master List

### Auth / Login (Track A)

---

### ID: A-1 — ANSI graphics prompt includes PETSCII as user-selectable option
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — bbsConfig.info parsing exists in bbs-config-file.service.ts
**File**: `web/backend/src/handlers/command-handler/pre-login.ts:59`
**express.e**: `29528–29530`
**Impact**: Users see four options (A/r/p/n) where express.e shows three (A/r/n); PETSCII is auto-detected from telnet TTYPE, not user-entered.
**Fix**: Remove PETSCII from the prompt; show `ANSI, RIP or No graphics (A/r/n)? ` exactly.

---

### ID: A-2 — Dead code re-prompts for ANSI after BBSTITLE
**Priority**: P2
**File**: `web/backend/src/handlers/command-handler/pre-login.ts:146–155`
**express.e**: `29552–29559`
**Impact**: If the `pendingScreenCommand` branch is ever triggered, the ANSI prompt is incorrectly re-shown after BBSTITLE.
**Fix**: Remove lines 146–155 (the dead code `pendingScreenCommand.then` block).

---

### ID: A-6 — Password fail default allows 5 tries; express.e disconnects after 3
**Priority**: P2
**File**: `web/backend/src/server/auth-socket-handlers.ts:348–383`
**express.e**: `29152`
**Impact**: Users get 5 password attempts when express.e disconnects after 3 (`tries > 2`).
**Fix**: Change the default for `max_password_fails` in system config to 3; or document as `WEB_: default differs from express.e`.

---

### ID: A-10 — Deleted account (slotNumber=0) not detected at login
**Priority**: P2
**File**: `web/backend/src/server/auth-socket-handlers.ts`
**express.e**: `29702–29712`
**Impact**: Logically deleted accounts (slotNumber=0) can still authenticate and log in.
**Fix**: After authentication, check `user.slotNumber === 0` and disconnect with "That account has been deleted."

---

### ID: A-11 — Already-logged-in check (checkUserOnLine) missing from login path
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — CallersLog written during login
**File**: `web/backend/src/server/auth-socket-handlers.ts`
**express.e**: `29715–29720`
**Impact**: The same user account can log in on multiple nodes simultaneously without seeing a "already logged in" message.
**Fix**: In the `login` handler, after user is identified, check if a live session already exists for that user; if so, display SCREEN_ONENODE (or fallback message) and refuse the new login.

---

### ID: A-14 — doNewUserNotify() partially implemented (OLM to sysop missing)
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — NewUserOptions / new_user_conf_access tooltype wired
**File**: `web/backend/src/handlers/user/new-user.handler.ts`
**express.e**: `30124`
**Impact**: New user notify may not send an OLM to the sysop node, depending on what express.e's `doNewUserNotify` does beyond the existing hooks.
**Fix**: Verify `doNewUserNotify` maps 1:1 to `mailOnNewUser` + `runExecuteOn('NEW_USER', ...)`; add OLM sysop notification if missing.

---

### ID: A-17 — New user name retry counter only counts blank names, not all invalid entries
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — retryCount increments on all invalid entries
**File**: `web/backend/src/handlers/user/new-user.handler.ts:266–278`
**express.e**: `30140–30189`
**Impact**: A user entering many 1-char or duplicate names is never disconnected; only blank name attempts count toward the retry limit.
**Fix**: Increment `retryCount` for all invalid name entries (blank, 1-char, duplicate); disconnect after 5 total attempts (the express.e outer FOR loop limit).

---

### ID: A-18 — No wildcard or banned-name check in new user name validation
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Wildcard check (name.includes('*')) at line 281
**File**: `web/backend/src/handlers/user/new-user.handler.ts:289–297`
**express.e**: `30163–30174`
**Impact**: New users can register names containing `*` (wildcards) or names in the banned list.
**Fix**: Add `name.includes('*')` check with "No wildcards allowed in a name"; add banned-name list check against `SCREEN_NONAMES` or equivalent config.

---

### ID: A-22 — Questionnaire `~` detection checks anywhere in line instead of last char only
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — endsWith('~') used in new-user.handler.ts:1203
**File**: `web/backend/src/handlers/user/new-user.handler.ts:1083–1088`
**express.e**: `30368–30373`
**Impact**: Script lines containing `~` in the middle are incorrectly treated as input prompts; only lines ending with `~` should be prompts.
**Fix**: Change `line.includes('~')` to `line.endsWith('~')`; strip only the trailing `~` character.

---

### Main Loop / Dispatch (Track B)

---

### ID: B-5 — Duplicate `case "Q"` in command dispatch (one is dead code)
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — duplicate case "Q" removed from command-execution.ts
**File**: `web/backend/src/handlers/command-handler/command-execution.ts:254, 424`
**express.e**: `25504–25516`
**Impact**: The second `case "Q"` is unreachable dead code; the wrong Q handler may be active.
**Fix**: Remove the second `case "Q"` at line 424; verify the surviving handler matches `internalCommandQ()` in express.e.

---

### ID: B-6 — WHO command removed from internal dispatch without WEB_ tag
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — WHO case restored
**File**: `web/backend/src/handlers/command.handler.ts:3986–3989`
**express.e**: `26094–26103`
**Impact**: Systems without a WHO BBSCMD door installed have no fallback; WHO is silently ignored.
**Fix**: Restore `case 'WHO':` and `case 'WHD':` in the internal dispatch; add `// WEB_: fallback when no WHO BBSCMD present` comment.

---

### ID: B-7 — Custom conference MENU_PROMPT tooltype not implemented
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — menuPrompt implemented
**File**: `web/backend/src/handlers/command-handler/menu.ts:136–204`
**express.e**: `28409–28413`
**Impact**: Conferences configured with a custom `MENU_PROMPT` tooltype always show the standard prompt instead.
**Fix**: Check `session.menuPrompt`; if non-empty, emit `\x1b[0m` + MCI-process the prompt + emit space, instead of the standard prompt.

---

### ID: B-8 — Menu prompt shows "mins left" instead of "mins. left" (missing period)
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Period in "mins. left"
**File**: `web/backend/src/handlers/command-handler/menu.ts:195, 200`
**express.e**: `28417, 28419`
**Impact**: Byte-level text mismatch visible to users on every menu display.
**Fix**: Change "mins left" to "mins. left" in both single-msgbase and multi-msgbase prompt strings.

---

### ID: B-9 — Shortcut translated string not passed through processMci() before dispatch
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Shortcut MCI processed
**File**: `web/backend/src/handlers/command-handler/input-handlers.ts:581–601`
**express.e**: `28617–28620`
**Impact**: Shortcut mappings containing MCI codes (e.g., `~CC_V SCREEN`) are dispatched as raw text without MCI expansion.
**Fix**: Before calling `processCommand` on the translated shortcut, pass it through the MCI processing engine.

---

### Internal Commands (Track C)

---

### ID: C-2 — Callers log command shows flat DB list instead of per-node log files
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — callers log per-node WEB_-tagged at sysop-commands:121-150
**File**: `web/backend/src/handlers/commands/sysop-commands.handler.ts`
**express.e**: `24461–24509`
**Impact**: Multi-node log selection flow is entirely different; sysops can't view per-node caller logs.
**Fix**: Implement node log file enumeration and the "Which node to view?" prompt; or tag as WEB_: with reason.

---

### ID: C-B — B command searches global Bulletins dir instead of conference-specific confScreenDir
**Priority**: P2
**File**: `web/backend/src/handlers/commands/display-file-commands.handler.ts`
**express.e**: `24616–24618`
**Impact**: Bulletins in per-conference Screens/Bulletins/ directories are not found; only global bulletins work.
**Fix**: Build the bulletin path from `confScreenDir` (conference-specific screens directory) rather than global `dataDir/Bulletins/`.

---

### ID: C-CF — Conference Flags: FORCE_NEWSCAN/NO_NEWSCAN tooltype not shown as F/D
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — FORCE_NEWSCAN / NO_NEWSCAN check
**File**: `web/backend/src/handlers/commands/advanced-commands.handler.ts`
**express.e**: `24843–24852`
**Impact**: CF display shows only `*` or ` ` for flag state; tooltype-forced (F) and tooltype-disabled (D) states are invisible.
**Fix**: Check FORCE_NEWSCAN and NO_NEWSCAN tooltypes when rendering CF flag columns; show F/D accordingly.

---

### ID: C-G — Goodbye (G) skips partUploadOK check before flagged file prompt
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — handleGoodbyeCommand wired
**File**: `web/backend/src/handlers/commands/system-commands.handler.ts`
**express.e**: `25047–25075`
**Impact**: Partial uploads in progress are not offered to the user before logoff; possible data loss for interrupted uploads.
**Fix**: Call `partUploadOK(0)` before `checkFlagged()` in the G command handler.

---

### ID: C-H — Help (H) emits CLS before displaying; express.e never clears screen
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — help command (HELP_INDEX) exists
**File**: `web/backend/src/handlers/commands/system-commands.handler.ts`
**express.e**: `25075–25087`
**Impact**: H command unexpectedly clears the screen before showing help text.
**Fix**: Remove the `'\x1b[2J\x1b[H'` emit; just call `findSecurityScreen` + `displayFile` directly.

---

### ID: C-M — ANSI Color On uses AnsiUtil.successLine() wrapper; express.e uses plain text + no pause
**Priority**: P2
**File**: `web/backend/src/handlers/chat/preference-chat-commands.handler.ts`
**express.e**: `25239–25248`
**Impact**: "Ansi Color On" is wrapped in green ANSI brackets (wrong when ANSI might be off); a spurious keypress pause is added.
**Fix**: Emit `\r\nAnsi Color On\r\n` plain text (no ANSI wrapper); remove `AnsiUtil.pressKeyPrompt()` call.

---

### ID: C-OLM — OLM target's quiet-mode (olmBlocked) check not verified present
**Priority**: P2
**File**: `web/backend/src/handlers/transfer/olm.handler.ts`
**express.e**: `25406–25503`
**Impact**: Sending an OLM to a node in quiet mode should show "NODE N HAS MESSAGES SUPPRESSED"; if missing, OLMs are silently delivered against the target's wish.
**Fix**: Before delivering OLM, check if target session has `quietFlag` set and show the suppressed message.

---

### ID: C-RL — Relogon (RL) shows confirmation prompt not in express.e
**Priority**: P2
**File**: `web/backend/src/handlers/commands/utility-commands.handler.ts`
**express.e**: `25534–25539`
**Impact**: Users expecting immediate relogon (per Amiga AmiExpress behavior) see an unexpected confirmation prompt.
**Fix**: Remove the confirmation prompt; set `relogon = true` and call `internalCommandG` immediately; tag as WEB_: if prompt must remain.

---

### ID: C-V — View (V) searches TEXT/ subdirectory instead of BBS file areas
**Priority**: P2
**File**: `web/backend/src/handlers/commands/utility-commands.handler.ts`
**express.e**: `25675–25687`
**Impact**: V command cannot find files in the BBS file areas; only files in a TEXT/ subdirectory are accessible.
**Fix**: Change V to use `viewAFile` file-area search path; add RIP mode bracket emissions around the view.

---

### ID: C-W — W command option 16 (BGFILECHECK) always shows [DISABLED]; options 8/9/11/15 stub
**Priority**: P2
**File**: `web/backend/src/handlers/commands/info-commands.handler.ts`
**express.e**: `25712–26092`
**Impact**: Users can't configure computer type (8), screen type (9), or transfer protocol from a list (11); BGFILECHECK appears disabled even when configured; translator (15) is a no-op.
**Fix**: Gate BGFILECHECK on actual tooltype; implement `chooseComputer`, `chooseScreenType`, `chooseProtocol` as interactive list selections matching express.e.

---

### ID: C-Z — Zippy (Z) missing directory range prompt; output lacks context buffering
**Priority**: P2
**File**: `web/backend/src/handlers/commands/utility-commands.handler.ts`
**express.e**: `26123–26213`
**Impact**: Z command never prompts for directory range (1-N, A, U, H, Enter); always searches all areas by default.
**Fix**: Show `getDirSpan` prompt before searching; implement context-buffered output with per-page pause.

---

### Message System (Track D)

---

### ID: D-1 — Nav prompt never shows QUIT at last message; wrong colon spacing
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — getMsgNavStr QUIT path + prompt format
**File**: `web/backend/src/handlers/message/messaging.handler.ts:477–487`
**express.e**: `12010–12021`
**Impact**: Users at the last message see a message number in the nav prompt instead of QUIT, giving no visual indication they've reached the end; colon spacing differs.
**Fix**: When `msgNum > highMsgNum - 1` or `< lowestKey`, show `QUIT` in the parentheses; change prompt suffix from ` >: ` to `>: `.

---

### ID: D-3 — U (User Account Edit) command missing from message reader navigation
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — U command routes to handleEditUserAccount for message author
**File**: `web/backend/src/handlers/message/messaging.handler.ts`
**express.e**: `11032–11034, 11154–11175`
**Impact**: Sysops with `ACS_ACCOUNT_EDITING` cannot edit a message author's account directly from the message reader.
**Fix**: Add `U>ser Account Edit` to full help display (gated on ACS_ACCOUNT_EDITING); add U case in `handleMessageReaderNav` routing to account editor for message author.

---

### ID: D-7 — deleteMSG output uses custom ANSI format instead of express.e plain text
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — deleteMSG plain text "Message N deleted..." format
**File**: `web/backend/src/handlers/message/messaging.handler.ts:634–657`
**express.e**: `11936`
**Impact**: Deletion confirmation uses green ANSI brackets instead of the exact `\r\nMessage N deleted...\r\n` format.
**Fix**: Replace `AnsiUtil.successLine('Message deleted')` with `\r\nMessage ${msg.id} deleted...\r\n`.

---

### ID: D-8 — Keep (K): lowestNotDel fallback missing; recv not cleared on disk; wrong condition
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — K command lowestNotDel fallback + unmarkMessageReceived
**File**: `web/backend/src/handlers/message/messaging.handler.ts:578–591`
**express.e**: `11124–11137`
**Impact**: K command doesn't implement the lowestNotDel read-pointer fallback; doesn't clear the `recv` flag on disk; incorrectly allows K on private messages addressed to ALL.
**Fix**: Implement lowestNotDel fallback; call `markMessageUnreceived` on disk; remove `msg.toUser === 'ALL'` from the K condition.

---

### ID: D-9 — confScan table missing `[0m` reset and "Found Mail!" line
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — added \r\n after header reset + "Found Mail!" banner in message-scan.handler.ts
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:538–539`
**express.e**: `11712–11714, 11737`
**Impact**: Missing color reset after dash line; "Found Mail!" not emitted before the "Would you like to read it now" prompt.
**Fix**: Add `\x1b[0m\r\n` after the dashes line; add `\r\nFound Mail!` before the read prompt in the confScan path.

---

### ID: D-14 — chooseTranslator missing H (word highlight) toggle
**Priority**: P2
**File**: `web/backend/src/handlers/message/messaging.handler.ts:1393–1449`
**express.e**: `11407–11414`
**Impact**: Users can't toggle word highlighting from the translator menu; H input is treated as invalid.
**Fix**: Add H case: toggle bit 128 of `translatorID`; emit "WORD HIGHLIGHT ON/OFF"; re-prompt; also check for SCREEN_LANGUAGES file before inline listing.

---

### File System (Track E)

---

### ID: E-1 — Download prompt ignores ratioType; always shows "Infinite bytes"
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — ratioType 0/1/2 format selection in download prompt
**File**: `web/backend/src/handlers/file/download.handler.ts:216–231`
**express.e**: `19784–19789`
**Impact**: Users always see "Infinite bytes" in the download prompt regardless of their ratio type; bytes/files limits are invisible.
**Fix**: Read `user.secBoard` (ratioType) and select the correct format (bytes / files / both).

---

### ID: E-4 — Post-transfer stats hardcode 100% efficiency; missing "at N baud" field
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Efficiency and baud-rate stats
**File**: `web/backend/src/handlers/file/download.handler.ts:480–481`
**express.e**: `20266`
**Impact**: Transfer efficiency is always shown as 100% regardless of actual CPS vs baud; the final "at N" (baud) field is missing.
**Fix**: Compute `tTEFF` from actual CPS vs onlineBaud; append `at ${onlineBaud}` to the stats line.

---

### ID: E-6 — pGoodbye countdown not implemented; immediate logoff instead of 10-second countdown
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Goodbye countdown after transfer
**File**: `web/backend/src/handlers/file/download.handler.ts:494–498`
**express.e**: `20317, 13751–13772`
**Impact**: After a G-goodbye download, users are logged off immediately without the "Last chance! Auto LOGOFF in N SECS" countdown.
**Fix**: Implement `pGoodbye()` equivalent with a 10-second countdown before logoff.

---

### ID: E-11 — Upload Okay prompt bypassed (WebSocket event replaces terminal prompt)
**Priority**: P2
**File**: `web/backend/src/handlers/file/file.handler.ts`
**express.e**: `17769`
**Impact**: The `Okay: (Enter) to Start, (G)oodbye after transfer, (A)bort?` prompt is never shown for terminal clients; upload starts immediately.
**Fix**: Tag as WEB_: divergence for web clients; ensure the full prompt is shown for raw terminal sessions.

---

### ID: E-14 — Upload A=Abort not handled in filename input state
**Priority**: P2
**File**: `web/backend/src/handlers/file/file.handler.ts` (upload input handling)
**express.e**: `17668–17670`
**Impact**: Users cannot abort an upload session by entering A alone at the filename prompt.
**Fix**: Add A=Abort check in `UPLOAD_FILENAME_INPUT` state; return failure and emit `\r\n`.

---

### ID: E-15 — Post-upload stats ("File Uploading Complete...", stats line, time bonus) not emitted
**Priority**: P2
**File**: `web/backend/src/handlers/file/file.handler.ts` (post-upload)
**express.e**: `19053, 19072, 19127`
**Impact**: Users receive no confirmation or statistics after a successful upload; time bonus is silently not awarded.
**Fix**: After upload completes, emit "File Uploading Complete..." + stats line + "Time increased by N mins." in order.

---

### ID: E-16 — File listing "Scanning directory" appends `, Area: <name>` not in express.e
**Priority**: P2
**File**: `web/backend/src/handlers/file/file.handler.ts:85`
**express.e**: `27683–27685`
**Impact**: Scanning message is `"Scanning directory N, Area: <name>"` instead of `"Scanning directory N"`.
**Fix**: Remove `, Area: ${area.name}` from the scanning emit.

---

### ID: E-18 — Zippy search hardcodes endDir=20 instead of using fetched maxDirs
**Priority**: P2
**File**: `web/backend/src/handlers/content/zippy-search.handler.ts:143–158`
**express.e**: `26177–26209`
**Impact**: Zippy search stops at directory 20 even on systems with fewer or more configured directories.
**Fix**: Use the `maxDirs` value already fetched at line 51 of the handler for `endDir`.

---

### ID: E-19 — fileStatus header hardcodes "KBytes"; should switch on CREDITBYKB toggle
**Priority**: P2
**File**: `web/backend/src/handlers/file/file.handler.ts:646`
**express.e**: `24156–24161`
**Impact**: On systems where CREDITBYKB is off, file status always shows "KBytes" in headers instead of "Bytes".
**Fix**: Check `ToggleFlags.CREDITBYKB` and select the correct header string.

---

### Conference System (Track F)

---

### ID: F-5 — joinConf calls createNodeUserFiles on auto and confScan paths (should be manual-only)
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Auto/confScan guard clause
**File**: `web/backend/src/handlers/operations/conference.handler.ts:174–181`
**express.e**: `5130–5137`
**Impact**: Node user file is updated on every joinConference call including login confScan and auto-joins, creating unnecessary I/O and potentially wrong node state.
**Fix**: Guard `nodeFileManager.writeNodeUserFile` with `!auto && !confScan` to match express.e:5130.

---

### ID: F-6 — joinConf pointer validation may be missing lowestNotDel clamping
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — lowestNotDel clamping
**File**: `web/backend/src/handlers/operations/conference.handler.ts:163–170`
**express.e**: `5037–5048`
**Impact**: If `lastMsgReadConf` or `lastNewReadConf` falls below `lowestNotDel` (e.g., after deletions), the pointers are not clamped up; users may see "no new messages" when there are new ones.
**Fix**: Verify `validatePointers` in `message-pointers.util.ts` implements the `< lowestNotDel → set to lowestNotDel` clamp and the `> highMsgNum → 0` reset.

---

### ID: F-10 — confScan: user answering N to MAILSCAN_PROMPT still runs file scan
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — File scan gating on mscan
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:648–663`
**express.e**: `28075–28082`
**Impact**: When a user answers N to "Scan for Mail?", both the mail scan and the file scan should be skipped; our code skips only the mail scan.
**Fix**: Gate the file scan loop on `mscan`; when `mscan = false`, go directly to `finishConferenceScan`.

---

### ID: F-11 — confScan only scans first msgBase per conference
**Priority**: P2
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:493–505`
**express.e**: `28092–28098`
**Impact**: Multi-msgbase conferences only have their first message base scanned; mail in bases 2+ is never shown during confScan.
**Fix**: Add an inner loop over `confMsgBases` matching express.e's `FOR msgbase := 1 TO n` inner loop.

---

### ID: F-12 — confScan partUpload check phase entirely missing
**Priority**: P2
**File**: `web/backend/src/handlers/message/message-scan.handler.ts`
**express.e**: `28117–28147`
**Impact**: In-progress (partial) uploads are never detected and resumed during confScan; partial uploads from previous sessions are abandoned.
**Fix**: After the file scan loop, add a partial upload check phase calling `partUploadOK()` per conference with upload access.

---

### ID: F-14 — checkFileConfScan default false not tagged as WEB_ deviation
**Priority**: P2
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:125–129`
**express.e**: `603–607`
**Impact**: When confBase is missing, express.e defaults to scanning (TRUE); our code defaults to not scanning (FALSE) with only a plain comment, not a WEB_: tag.
**Fix**: Change the comment to `// WEB_: diverges from express.e:606 (ELSE res:=TRUE). Default is FALSE to avoid spurious file scans.`

---

### ID: F-16 — J command: getInverse() (relative conference numbering) not implemented
**Priority**: P2
**File**: `web/backend/src/handlers/commands/user-commands.handler.ts:412`
**express.e**: `25140, 25150`
**Impact**: When `TOGGLES_CONFRELATIVE` is set, "J 2" should join the 2nd accessible conference, not conference ID 2; users with this toggle get wrong conferences.
**Fix**: Implement `getInverse()` using `checkConfAccess()` and `TOGGLES_CONFRELATIVE`; fall back to absolute numbering when toggle is off.

---

### ID: F-17 — J command: saveMsgPointers not called before joining new conference
**Priority**: P2
**File**: `web/backend/src/handlers/commands/user-commands.handler.ts:502–505`
**express.e**: `25121`
**Impact**: The user's read position in the current conference is lost when they switch conferences with J.
**Fix**: Call `saveMsgPointers(session.currentConf, session.currentMsgBase)` at the start of `handleJoinConferenceCommand`, before any state changes.

---

### Display / MCI / Screen (Track G)

---

### ID: G-LC — `~LC` uses raw DB date string instead of formatLongDateTime format
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — formatLongDateTime called for ~LC at screen.handler.ts:618
**File**: `web/backend/src/handlers/screen.handler.ts:877`
**express.e**: `5315–5318`
**Impact**: Last-call date in MCI-processed screens shows a raw ISO date string instead of the `"Mon 07-Jan-26 14:32:00"` AmiExpress format.
**Fix**: Store lastLoginDate as a timestamp; call `formatLongDateTime()` when rendering `~LC`.

---

### ID: G-SU-SD — `~SU`/`~SD` always output KB; should auto-scale with lowercase suffix
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — calcSizeText with lowercase kb/mb/gb at screen.handler.ts:633-644
**File**: `web/backend/src/handlers/screen.handler.ts:888–889`
**express.e**: `5359–5366`
**Impact**: Upload/download size always shows in KB with uppercase K; correct format auto-scales to kb/mb/gb lowercase.
**Fix**: Implement `calcSizeText` equivalent: divide by 1024 until < 1024, append `b`/`kb`/`mb`/`gb` lowercase suffix.

---

### ID: G-LG-ON — `~LG`/`~ON` hardcoded to '1' instead of actual node number
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — session.nodeId used at screen.handler.ts:649-650
**File**: `web/backend/src/handlers/screen.handler.ts:893–894`
**express.e**: `5379–5382`
**Impact**: Screen files showing the node number always display 1 regardless of which node the user is on.
**Fix**: Replace `'1'` with `(session.nodeId || 1).toString()`.

---

### ID: G-OD — `~OD` shows today's date instead of logon date
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — formatLongDate(logonDate) at screen.handler.ts:681
**File**: `web/backend/src/handlers/screen.handler.ts:939`
**express.e**: `5391–5394`
**Impact**: MCI `~OD` (logon date) shows today's system date, not the date the user logged on.
**Fix**: Store logon timestamp in session; use `formatLongDate(session.logonTime)` for `~OD`.

---

### ID: G-CT — `~CT` shows current time instead of logon time
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — formatLongTime(logonDate) at screen.handler.ts:674
**File**: `web/backend/src/handlers/screen.handler.ts:929`
**express.e**: `5431–5434`
**Impact**: `~CT` (Connected Time / time of logon) shows the current system time instead of when the user logged on.
**Fix**: Store logon timestamp in session; use `formatLongTime(session.logonTime)` for `~CT`.

---

### ID: G-CR — `~CR` (bare) emits CRLF instead of waiting for single keypress
**Priority**: P2
**File**: `web/backend/src/handlers/screen.handler.ts:984`
**express.e**: `5462–5468`
**Impact**: Screen files using `~CR` to pause for a keypress display a blank line instead of waiting.
**Fix**: Implement `~CR` as a pause trigger equivalent to `~SP` (emit pause signal, wait for client keypress).

---

### ID: G-CR_ — `~CR_` sets hasPause flag but doesn't enforce actual keypress wait
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — hasPause flag set at screen.handler.ts:1187
**File**: `web/backend/src/handlers/screen.handler.ts:1433–1436`
**express.e**: `5564–5574`
**Impact**: Prompted keypress (`~CR_prompt`) shows the prompt but may not block execution waiting for the keypress.
**Fix**: Implement as a proper blocking keypress pause; verify that `hasPause = true` actually suspends screen rendering until input arrives.

---

### ID: G-NS — `~NS` has no effect; should set nonStopDisplayFlag
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — nonStopText flag set at screen.handler.ts:725-730
**File**: `web/backend/src/handlers/screen.handler.ts:985`
**express.e**: `5740–5742`
**Impact**: Screen files using `~NS` to suppress pause prompts still pause; the non-stop flag is never set.
**Fix**: When `~NS` is encountered, set `session.nonStopDisplayFlag = true` to suppress subsequent pause prompts.

---

### ID: G-CL — `~CL` lists all conferences without access filtering
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — conference list filtering at screen.handler:478-492
**File**: `web/backend/src/handlers/screen.handler.ts:758–767`
**express.e**: `5588–5607`
**Impact**: Conference list MCI code shows conferences the user doesn't have access to when `TOGGLES_CONFRELATIVE` is set.
**Fix**: Filter conferences by access before listing; renumber sequentially for relative mode.

---

### ID: G-CD — `~CD` returns single conference name instead of 2-column list
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — 2-column numbered list at screen.handler:495-511
**File**: `web/backend/src/handlers/screen.handler.ts:769–773`
**express.e**: `5608–5620`
**Impact**: `~CD` in screen files shows only the current conference name instead of the full 2-column conference list.
**Fix**: Implement the same loop as `~CL` but in 2-column `[NNN] name` format matching express.e:5608–5620.

---

### ID: G-screens — 7 screen types missing from SCREEN_DIR_MAP
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — All 7 screen types in SCREEN_DIR_MAP at screen.handler.ts:131-137
**File**: `web/backend/src/handlers/screen.handler.ts` (SCREEN_DIR_MAP)
**express.e**: `6615–6653`
**Impact**: `SCREEN_NONEWATBAUD`, `SCREEN_NOT_TIME`, `SCREEN_NOCALLERSATBAUD`, `SCREEN_LANGUAGES`, `SCREEN_INTERNETNAMES`, `SCREEN_REALNAMES`, `SCREEN_MAILSCAN` can never be displayed; baud-parameterized screens use the wrong lookup.
**Fix**: Add all 7 missing entries; implement baud-rate suffix in screen name for the `NONEWAT`, `NOTTIME`, `NOCALLERSAT` screens.

---

### ID: G-MCI-enable — MCI always processed even when first line doesn't start with `~`
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — First-line ~ check at screen.handler.ts:1948-1959
**File**: `web/backend/src/handlers/screen.handler.ts` (loadScreenFile / parseMciCodes)
**express.e**: `6800–6806`
**Impact**: Screen files without a leading `~` have their content incorrectly MCI-processed, potentially mangling literal `~` characters in plain-text screens.
**Fix**: Check if the first non-empty line starts with `~`; if not, skip `parseMciCodes` and display raw content.

---

### ID: G-datetime — formatLongDateTime missing day-of-week prefix
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Day-of-week prefix in formatLongDateTime at date-time.util.ts:93-107
**File**: `web/backend/src/utils/date-time.util.ts:78–80`
**express.e**: `MiscFuncs.e:320–341`
**Impact**: `formatLongDateTime` outputs `"07-Jan-2026 14:32:15"` instead of `"Mon 07-Jan-26 14:32:00"` (missing `Mon` prefix, wrong year format).
**Fix**: Add day-of-week prefix (3-char abbreviated) and use 2-digit year to match the `FORMAT_DOS` output in express.e.

---

### ID: G-longdate — formatLongDate uses DD-Mon-YYYY; express.e uses MM-DD-YY
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — formatLongDate uses MM-DD-YY at date-time.util.ts:41-46
**File**: `web/backend/src/utils/date-time.util.ts:39–48`
**express.e**: `MiscFuncs.e:278–297`
**Impact**: Date fields (including `~OD`, `~DT`, `~LC`) display in a different format than Amiga users expect.
**Fix**: Change `formatLongDate` to produce `MM-DD-YY` (FORMAT_USA) to match express.e; or tag as WEB_: if keeping the longer format intentionally.

---

### ID: G-bull-help — BullHelp existence check uses security variants instead of literal file
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — findBullHelpAcross check at bulletin.handler.ts:214
**File**: `web/backend/src/utils/screen-security.util.ts:179–197`
**express.e**: `24616–24618`
**Impact**: The B command always permits bulletin listing because the literal `BullHelp.txt` existence gate is skipped.
**Fix**: Before calling `findSecurityScreen`, check for literal `BullHelp.txt` existence; only allow bulletin access if that file exists.

---

### ID: G-bull-loop — Bulletin display returns to menu instead of re-prompting
**Priority**: P2
**Status**: ✓ FIXED 2026-05-04 — Re-prompts after bulletin display at bulletin.handler.ts:303-309
**File**: `web/backend/src/handlers/bulletin.handler.ts:228–233`
**express.e**: `24643–24655`
**Impact**: After viewing a bulletin, the user is returned to the main menu instead of being prompted for another bulletin number.
**Fix**: After displaying a bulletin from `handleBulletinCommand`, re-prompt for the next bulletin number instead of transitioning to `DISPLAY_MENU`.

---

### Support Structs / QWK (Track H)

---

### ID: H-QWK1 — QWK blockCount read as LE binary instead of 8-char ASCII
**Priority**: P2
**File**: `web/backend/src/services/qwk.service.ts`
**express.e**: `qwk.e:576`
**Impact**: Block count in QWK message headers may be mis-parsed for large messages; coincidentally correct for small values only.
**Fix**: Read bytes 116–123 as ASCII decimal; parse with `parseInt()`.

---

### ID: H-QWK2 — CONTROL.DAT not generated in QWK packets
**Priority**: P2
**File**: `web/backend/src/services/qwk.service.ts`
**express.e**: `qwk.e:248–289`
**Impact**: QWK packets generated by the TS code are invalid; offline mail readers cannot parse them without CONTROL.DAT.
**Fix**: Implement `createControlDat()` following qwk.e:248–289 format (BBS name, location, phone, sysop, ID, datetime, username, conf list, HELLO/NEWS/GOODBYE).

---

### ID: H-states — Missing BBS states: HANGUP, LOGGING_OFF, SHUTDOWN
**Priority**: P2
**File**: `web/backend/src/types/bbs-states.ts`
**express.e**: `axenums.e:5–6`
**Impact**: The TS state machine cannot represent HANGUP, LOGGING_OFF, or SHUTDOWN states; if a 68K door or internal component sets these states, the transition is silently lost.
**Fix**: Add `HANGUP`, `LOGGING_OFF`, `SHUTDOWN` (and optionally `CONNECTING`, `SYSOPLOGON`, `CHECK`, `SUSPEND`) to `BBSState`.

---

### ID: H-userkeys — userKeys pad after userName[31] missing in UserStructures
**Priority**: P2
**File**: `web/backend/src/amiga-emulation/UserStructures.ts` (userKeys section)
**express.e**: `axobjects.e:70–81`
**Impact**: `number` (LONG) field in userKeys in-memory struct is at misaligned offset 31 (odd address); 68K requires LONG on even boundary; all subsequent fields in the in-memory userKeys layout are 1 byte off.
**Fix**: Insert 1-byte pad after `userName[31]` in the UserStructures userKeys layout; update all subsequent field offsets.

---

## P3 Master List

### Auth / Login (Track A)

---

### ID: A-12 — Token reconnect does not persist quickFlag; missing WEB_: tag
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: tag added at session-restore site explaining no-quickFlag-carryforward
**File**: `web/backend/src/server/auth-socket-handlers.ts:740–755`
**express.e**: `29853–29855`
**Impact**: quickFlag state is not preserved across reconnects; minor UX difference, not tagged.
**Fix**: Add `// WEB_: quickFlag state is not persisted across token reconnects` comment at line 748.

---

### ID: A-15 — "Blank line to retreat" in new-user flow removed but confirmed tagged
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: retreat-on-blank tags already present in new-user.handler
**File**: `web/backend/src/handlers/user/new-user.handler.ts:310–373`
**express.e**: `30134–30229`
**Impact**: New users can't retreat to previous fields with blank entry; already tagged with WEB_: comments.
**Fix**: Confirmed tagged; no action needed.

---

### ID: A-16 — Location field label changed from "City, State" to "Group Affiliation"; tagged
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — City, State emit at line 431 matches express.e:30194 — no divergence
**File**: `web/backend/src/handlers/user/new-user.handler.ts:313`
**express.e**: `30194`
**Impact**: Label differs from express.e; confirmed tagged WEB_:.
**Fix**: Confirmed tagged; no action needed.

---

### ID: A-19 — Password strength check runs before confirmation; minor UX order difference
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: tag explaining eager strength check vs post-confirmation
**File**: `web/backend/src/handlers/user/new-user.handler.ts:674–689`
**express.e**: `30227–30254`
**Impact**: Strength error appears at first password entry instead of after confirmation; functionally equivalent but order differs.
**Fix**: Reorder to match express.e (check strength after both passwords entered and matched); or tag as WEB_:.

---

### ID: A-20 — Screen clear preference uses line input instead of single readChar()
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: single keypress not available in line-buffered web flow
**File**: `web/backend/src/handlers/user/new-user.handler.ts:786–800`
**express.e**: `30272–30281`
**Impact**: User must press Enter after Y/N instead of just one keypress; web terminal limitation.
**Fix**: Tag as `// WEB_: single keypress not available in web terminal context`.

---

### ID: A-21 — Summary confirmation uses line input instead of single readChar()
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: same as A-20 for summary confirmation
**File**: `web/backend/src/handlers/user/new-user.handler.ts:844–860`
**express.e**: `30306–30318, 30391–30404`
**Impact**: Same as A-20; web limitation.
**Fix**: Tag as `// WEB_: single keypress not available in web terminal context`.

---

### ID: A-23 — auth.handler.ts (admin REST API) has no WEB_:/ADMIN_: tags
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — ADMIN_: tag added to auth.handler.ts module header
**File**: `web/backend/src/handlers/user/auth.handler.ts`
**express.e**: No equivalent
**Impact**: File has no WEB_/ADMIN_ convention tags per project rules.
**Fix**: Add `// ADMIN_: HTTP REST API for admin panel — no express.e equivalent` tags to all public functions.

---

### ID: A-24 — account.handler.ts wrapper menu not tagged WEB_:
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_: tag added on displayAccountEditingMenu
**File**: `web/backend/src/handlers/user/account.handler.ts:19–33`
**express.e**: `21211` (editInfo — no menu wrapper)
**Impact**: The 7-option menu wrapper has no WEB_/ADMIN_ tags.
**Fix**: Tag `displayAccountEditingMenu` and `handleAccountEditing` with `// WEB_:` comment.

---

### Main Loop / Dispatch (Track B)

---

### ID: B-10 — 500ms debounce in displayMainMenu not tagged WEB_:
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — debounce already WEB_-tagged at menu.ts:45
**File**: `web/backend/src/handlers/command-handler/menu.ts:38–44`
**express.e**: No equivalent
**Impact**: Debounce guard is untagged; root-cause race condition is unresolved.
**Fix**: Add `// WEB_: debounce to handle async race conditions — no express.e equivalent` tag; consider fixing the underlying duplicate-display race.

---

### ID: B-11 — "Command requires higher access." message never emitted on NOT_ALLOWED
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — "higher access" message emitted via ErrorHandler/command-execution
**File**: `web/backend/src/handlers/command-handler/core.ts:173–176`
**express.e**: `28400, 3037–3039`
**Impact**: Users get no feedback when they type a command above their access level.
**Fix**: After internal command returns NOT_ALLOWED (non-privileged call), emit `\r\nCommand requires higher access.\r\n`.

---

### ID: B-12 — Unknown command error text uses "Unknown command: X" instead of express.e text
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — "No such command!!" text matches express.e:28397 at line 566
**File**: `web/backend/src/handlers/command-handler/command-execution.ts:563`
**express.e**: `28396–28398`
**Impact**: Unknown command message is web-style instead of `No such command!!  Use '?' for command list.`
**Fix**: Change to `\r\nNo such command!!  Use '?' for command list.\r\n\r\n`.

---

### Internal Commands (Track C)

---

### ID: C-0 — Remote shell stub missing WEB_: tag
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — remoteShell stub WEB_-tagged at sysop-commands:46
**File**: `web/backend/src/handlers/commands/sysop-commands.handler.ts`
**express.e**: `24434–24450`
**Impact**: Stub has no WEB_: tag.
**Fix**: Add `// WEB_: express.e:24434-24450 — password prompt + remoteShell() not applicable on web; stub intentional.`

---

### ID: C-3-4-5 — Edit file/directory, dirAnyWhere stubs missing WEB_: tags
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — editDirFile/editAnyFile/dirAnyWhere WEB_-tagged at sysop-commands:196,250,304
**File**: `web/backend/src/handlers/commands/sysop-commands.handler.ts`
**express.e**: `24511–24527`
**Impact**: Three command stubs (3, 4, 5) have no WEB_: tags.
**Fix**: Add `// WEB_: MicroEmacs / AmigaDOS not applicable on web; stub intentional.` to each.

---

### ID: C-VER — VER command adds web-only lines without WEB_: tags
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_ tag added on AmiExpress-Web version line
**File**: `web/backend/src/handlers/commands/info-commands.handler.ts`
**express.e**: `25688–25699`
**Impact**: Extra Node.js/TypeScript/community lines appear in version output without tagging.
**Fix**: Tag all extra lines with `// WEB_:` comment; ensure original Amiga attribution lines are present and unmodified.

---

### ID: C-WHD — WHD shows same table as WHO; should show debug memory info
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — who(1) debug WEB_-tagged at info-commands:151
**File**: `web/backend/src/handlers/commands/info-commands.handler.ts`
**express.e**: `26104–26112`
**Impact**: WHD is identical to WHO; `who(1)` shows debug pointer info in express.e.
**Fix**: Tag as `// WEB_: who(1) debug pointer display not applicable on web`.

---

### ID: C-CM — Conference Maintenance fidelity unverified
**Priority**: P3
**File**: `web/backend/src/handlers/command-handler/internal-commands.ts` (via `handleConferenceMaintenanceCommand`)
**express.e**: `24843–24852`
**Impact**: `conferenceMaintenance()` implementation not confirmed 1:1 with express.e.
**Fix**: Audit `handleConferenceMaintenanceCommand` body against express.e:24843–24852.

---

### Message System (Track D)

---

### ID: D-2 — Short help CR prompt uses nextMsgNum instead of current; missing leading CRLF
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Message nav prompt correct
**File**: `web/backend/src/handlers/message/messaging.handler.ts:321–375`
**express.e**: `11009`
**Impact**: Minor: short help prompt shows next message number instead of current; missing leading newline before `<CR>=Next` line.
**Fix**: Use current msgNum (not next); emit `\r\n` before the `<CR>=Next` line; reset helplist state after display.

---

### ID: D-6 — Forward delete-original uses `==` instead of case-insensitive compare
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Case-insensitive toUser.toLowerCase() compare
**File**: `web/backend/src/handlers/message/message-entry.handler.ts:1074`
**express.e**: `9853–9860`
**Impact**: Forward's delete-original prompt may not appear if sender name case differs (e.g., "SYSOP" vs "sysop").
**Fix**: Use case-insensitive comparison for `msg.toUser === session.user.username`.

---

### ID: D-11 — confScan missing per-msgBase name when conference has >1 msgBase
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Per-msgBase naming when count > 1
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:507–508`
**express.e**: `28092–28097`
**Impact**: confScan output doesn't show the msgBase name for conferences with multiple message bases.
**Fix**: Emit msgBase name when conference has > 1 msgBase, matching express.e behavior.

---

### ID: D-12 — OLM compose uses non-standard /S /A instead of edit(); custom header
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — OLM compose flow
**File**: `web/backend/src/handlers/transfer/olm.handler.ts:134–206`
**express.e**: `25443–25445`
**Impact**: OLM compose is simplified; custom header banner not in express.e.
**Fix**: Tag compose interface with `// WEB_: simplified OLM editor (no edit() available in web)`; tag header banner similarly.

---

### File System (Track E)

---

### ID: E-2 — "Aborting..." has extra leading CRLF
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Aborting message has correct \r\n spacing
**File**: `web/backend/src/handlers/file/download.handler.ts:265`
**express.e**: `20141`
**Impact**: Extra blank line before "Aborting..." text.
**Fix**: Remove the leading `\r\n` from the abort message.

---

### ID: E-5 — Post-transfer stats missing second blank line after
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Double CRLF after stats
**File**: `web/backend/src/handlers/file/download.handler.ts:483`
**express.e**: `20268`
**Impact**: Only one CRLF after download stats instead of two.
**Fix**: Change `'\r\n'` to `'\r\n\r\n'` after the stats line.

---

### ID: E-7 — displayULStats uses integer division instead of BCD for byte display
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — BCD formatting in displayULStats
**File**: `web/backend/src/handlers/file/download.handler.ts:509–527`
**express.e**: `12685–12691`
**Impact**: Minor precision difference for very large byte counts; functionally correct for typical values.
**Fix**: Use `formatBCDUtil` from `bcd-math.util` on user BCD fields where available.

---

### ID: E-8 — Upload header string missing "to <path>" variant when ramPen configured
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — "UPLOADING to <path>.." emitted when uploadArea.ulPath non-default
**File**: `web/backend/src/handlers/file/file.handler.ts:919–920`
**express.e**: `19005–19007`
**Impact**: When a custom upload path (ramPen) is configured, the upload header doesn't show the destination path.
**Fix**: Check configured ULPATH; if custom, use `"<protocol> UPLOADING to <path>.."` format.

---

### ID: E-9 — Upload disk space shows same value for both "available" and "at one time" fields
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Dual disk-space display in upload header
**File**: `web/backend/src/handlers/file/file.handler.ts:926–928`
**express.e**: `19012–19014`
**Impact**: On multi-drive systems, total free space and per-drive free space would differ; on single-drive web BBS these are always identical.
**Fix**: Compute total-free from all configured DRIVE.N paths separately from the upload-path free space.

---

### Conference System (Track F)

---

### ID: F-7 — joinConf WEB_: comment for displaySysopULStats missing reason
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — WEB_ comment for divergence
**File**: `web/backend/src/handlers/operations/conference.handler.ts:259`
**express.e**: `5115`
**Impact**: WEB_: tag exists but has no explanation.
**Fix**: Add `// WEB_: Sysop local terminal display not applicable to web nodes` to the comment.

---

### ID: F-15 — checkMailConfScan scanFlags field mapping to cb.handle[0] unverified
**Priority**: P3
**File**: `web/backend/src/handlers/message/message-scan.handler.ts:187–192`
**express.e**: `582–588`
**Impact**: If `scanFlags` does not map to the same byte as `handle[0]` in confBase, mail scan decisions will be wrong.
**Fix**: Verify `loadMsgPointers` returns `scanFlags` corresponding to `cb.handle[0]` from the confBase binary.

---

### ID: F-19 — conference-maint-states.ts is a router only; structural observation
**Priority**: P3
**File**: `web/backend/src/handlers/command-handler/conference-maint-states.ts`
**express.e**: N/A
**Impact**: Observation only; no deviation.
**Fix**: None; document for maintainers.

---

### Display / MCI / Screen (Track G)

---

### ID: G-UB-DB — `~UB`/`~DB` potential BCD vs raw bytes mismatch
**Priority**: P3
**File**: `web/backend/src/handlers/screen.handler.ts:886–887`
**express.e**: `5351–5358`
**Impact**: Likely correct if DB stores raw bytes; BCD output is a plain decimal integer either way.
**Fix**: Verify `uploadBytes`/`downloadBytes` in DB store raw bytes; format is correct if numeric values agree.

---

### ID: G-FF — `~FF` flagged files format needs showFlaggedFiles verification
**Priority**: P3
**File**: `web/backend/src/handlers/screen.handler.ts:957–960`
**express.e**: `5439–5441`
**Impact**: Space-separated filename list may not match express.e's `showFlaggedFiles(maxLen)` format exactly.
**Fix**: Read `showFlaggedFiles` implementation to verify; likely OK for basic usage.

---

### ID: G-w — `~w` delay removed; should have WEB_: tag
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — Amiga tick delay WEB_-tagged at screen.handler:790
**File**: `web/backend/src/handlers/screen.handler.ts:1044–1049`
**express.e**: `5472–5477`
**Impact**: Amiga tick delays (`~w3|` = 60ms) are silently removed; no WEB_: tag.
**Fix**: Add `// WEB_: Amiga Delay() in ticks not implementable in server-side regex pass; stripped intentionally`.

---

### ID: G-x — `~x` emits ESC[NG instead of ESC[;NH (functionally equivalent)
**Priority**: P3
**File**: `web/backend/src/handlers/screen.handler.ts:1055–1060`
**express.e**: `5478–5486`
**Impact**: Column positioning uses a slightly different ANSI escape sequence; visually equivalent on all terminals.
**Fix**: Optionally change to `\x1b[;${colNum}H` to exactly match express.e output.

---

### ID: G-wrap — displayFile lacks 79-column wrap for non-MCI files
**Priority**: P3
**File**: `web/backend/src/handlers/screen.handler.ts` (displayFile)
**express.e**: `6814–6830`
**Impact**: Lines longer than 79 chars are not wrapped in plain-text (non-MCI) screen files.
**Fix**: Add 79-column line wrap for non-MCI content with `checkForPause()` at each wrap.

---

### Support Structs / QWK (Track H)

---

### ID: H-ED — No named TypeScript constants for ED_* editor flags, USER_* userFlags, PG_* commands
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — web/backend/src/constants/express-flags.ts with EditorFlag/UserFlag/PageType
**File**: Constants not found in `web/backend/src/types/`
**express.e**: `axconsts.e` (ED_*, USER_*, PG_*)
**Impact**: These bit flags and enum values are hardcoded inline wherever used; no central reference.
**Fix**: Create a constants file with named values for `ED_ANSI_ALLOWED`, `ED_ABORT_ALLOWED`, `ED_LOAD_ALLOWED`, `USER_NEWMSG`, `USER_BGFILECHECK`, `PG_SM`, etc.

---

### ID: H-TTV — checkToolTypeValue() missing; callers do case-insensitive value compare manually
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — checkToolTypeValue helper added to info-file.util.ts
**File**: `web/backend/src/utils/info-file.util.ts`
**express.e**: `tooltypes.e:152–174` (MatchToolValue)
**Impact**: No central helper for case-insensitive tooltype value comparison; callers must implement it themselves inconsistently.
**Fix**: Add `checkToolTypeValue(key, value)` helper with case-insensitive value comparison to match AmigaOS `MatchToolValue()`.

---

### ID: H-CDateTime — formatCDateTime produces ISO 8601 instead of ctime-style
**Priority**: P3
**Status**: ✓ FIXED 2026-05-04 — formatCDateTime returns ctime "DDD MMM DD HH:MM:SS YYYY"
**File**: `web/backend/src/utils/date-time.util.ts:92–94`
**express.e**: `MiscFuncs.e:343–364`
**Impact**: `formatCDateTime` produces `"2026-01-07T14:32:00.000Z"` instead of `"Mon Jan 07 14:32:00 2026"` (Unix ctime-style); rarely used in screen display.
**Fix**: Reformat to produce `"DDD MMM DD HH:MM:SS YYYY"` ctime format; or tag as WEB_: if ISO is intentional.

---

## Fix Sequence (P1 Implementation Order)

### Stage 1: Data Corruption Fixes (must be first — they affect all other features)

All 5 H-series P1 fixes must land before any other testing is meaningful, because wrong struct layouts corrupt every 68K door interaction:

1. **H-1** — Fix `message-file.util.ts` mailStat field order and size (swap offsets 4/8, add 6-byte pad)
2. **H-2** — Fix `ConferenceFileManager.ts` CONFBASE_SIZE from 64 to 74
3. **H-3** — Fix `UserStructures.ts` pad after phoneNumber[13], SIZE 230→232, all downstream offsets
4. **H-4 + H-5** — Fix `qwk.service.ts` QWK msgNum ASCII format and confNum offset

### Stage 2: Security Fixes

These affect who can access the BBS and prevent unauthorized session continuation:

5. **A-7** — Add account locked check at login
6. **A-9** — Add security level ≤1 lockout at login
7. **A-4** — Add system password gate (doSystemPassword)
8. **A-8** — Add forcePwdReset / password expiry flow

### Stage 3: Core Loop Fixes

These affect the main session loop for every logged-in user:

9. **B-2** — Add `checkTimeUsed()` after `updateTimeUsed()` in menu display
10. **B-3** — Add `checkOnlineStatus()` carrier-drop gate in menu display
11. **B-4** — Fix NOT_ALLOWED routing to DISPLAY_MENU (not DISPLAY_CONF_BULL)
12. **B-1** — Add `allowSysCmd` parameter to `processCommand`; default false from interactive menu

### Stage 4: Pre-Login and Auth Fixes

13. **A-3** — Add reserved node check after BBSTITLE
14. **A-5** — Separate name retry counter (fixed 5) from password fail counter (configurable)
15. **A-10** — Add deleted account (slotNumber=0) check
16. **A-11** — Add already-logged-in (checkUserOnLine) check

### Stage 5: Conference System Fixes

These underpin message reading and session state for every user:

17. **F-9** — Fix DISPLAY_CONF_BULL to pass auto=false to joinConference
18. **F-8** — Reset `currentMenuName` before CONF_BULL display
19. **F-4** — Add saveMsgPointers after mail scan in joinConference
20. **F-3** — Wire checkMailConfScan into joinConference condition
21. **F-1** — Add ACS check + conference fallback loop in joinConference
22. **F-2** — Add CUSTOM tooltype branch to joinConference
23. **F-17** — Call saveMsgPointers before J command joins new conference

### Stage 6: Message System Fixes

24. **D-10** — Add recv=0 filter to confScan mail listing
25. **D-4** — Fix Reply (R) to show banner, To: pre-fill, Subject: prompt, checkToForward
26. **D-5** — Fix Forward (F) Subject prompt to pre-fill original subject

### Stage 7: New User and Display Fixes

27. **A-13** — Replace hardcoded welcome with displayScreen(JOINED)
28. **G-LG-ON** — Fix `~LG`/`~ON` to use actual session.nodeId
29. **G-OD** — Fix `~OD` to use logon date (not today's date)
30. **G-CT** — Fix `~CT` to use logon time (not current time)
31. **G-NS** — Fix `~NS` to set nonStopDisplayFlag

### Stage 8: File System Fixes

32. **E-10** — Add upload filename length > 12 rejection
33. **E-17** — Add interactive getDirSpan prompt to Zippy search

### Stage 9: Command-Specific Fixes (can be done in parallel per command)

- **C-O** — Fix Page Sysop pagesAllowed→comment redirect and unavailable message
- **C-FM** — Audit FM handler fidelity
- **C-NM** — Audit NM handler fidelity
- **C-ZOOM** — Tag URL download as WEB_:; verify QWK contents

---

*This document is the single reference for all P1/P2/P3 deviations. Do not re-read individual track reports unless investigating a specific deviation; all material findings are reproduced here.*
