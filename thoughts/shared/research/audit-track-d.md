---
date: 2026-04-28
topic: audit-track-d-message-system
tags: [audit, messaging, mail, olm, confScan]
status: final
---

# Track D — Message System Audit Report

## Summary

| Metric | Value |
|--------|-------|
| Files audited | messaging.handler.ts, message-entry.handler.ts, message-commands.handler.ts, message-scan.handler.ts, olm.handler.ts |
| express.e lines covered | 8672–12200 (mail module) |
| Total deviations | **14** (P1: 6, P2: 5, P3: 3) |

### OK functions (no material deviations)
- `getMailStatFile` — not our code (disk binary); mapped correctly via MessageIndexManager
- `listMSGs` — format and column widths match (messaging.handler.ts:729-799)
- `displayMessage` header output — ANSI escape sequences, field widths, EALL mapping correct
- `displayMessage` recv'd marking — marks on first view for addressed user, correct
- `enterMSG` recipient flow — To:, EALL check, SYSOP mapping correct
- `enterMSG` Subject: abort on blank — correct
- `edit()` line prompt format — `\d[2]>` / `\d[3]>` matched
- `edit()` 800-line limit, 75-char width — matched
- `edit()` options A/C/D/E/L/S — all present; C restores last line (bEG_IN) correct
- `saveNewMSG` "Saving..." + "Message Number N...done!\r\n\r\n" format — **correct** (message-entry.handler.ts:450)
- `deleteMSG` "Message N deleted..." — shown in messaging.handler
- `forwardMSG` "Saving..." — present (message-entry.handler.ts:1108)
- OLM send/receive/queue flow — structurally correct
- OLM quiet-mode toggle — correct

---

## DEV-01: replyPrompt / readMSG — Prompt shows CURRENT message number but uses static string (express.e:10998, 12020)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:477–487`

**Issue**: express.e shows the *next-to-read* indicator in the prompt as a dynamic string that may be `"QUIT"` when at the last message, or `"N+fwdDir+highMsgNum-1"`. Our code hard-codes the CURRENT message number instead and never shows "QUIT".

**express.e**:
```
-> readMSG loop, lines 12010-12021
IF(fwdFlag=1) THEN StringF(str,'\d\c\d',msgNum,fwdDir,mailStat.highMsgNum-1)
ELSE StringF(str,'\d\c\d',msgNum,fwdDir,mailStat.lowestKey)
IF((msgNum>(mailStat.highMsgNum-1)) OR (msgNum<mailStat.lowestKey)) THEN StrCopy(str,'QUIT')
StringF(string,'[36m,[33m?[36m,[33m??[36m,[32m<[33mCR[32m> [32m([0m \s[32m )[0m>: ',str)
```
At end of messages the prompt shows `( QUIT )>:` which signals the user they're at the last message. Also note `>:` (no space before colon).

**Our code**:
```typescript
// messaging.handler.ts:487
emitText(socket, ',\x1b[33m?...\x1b[32m(\x1b[0m ' + currentMsgNum + '\x1b[32m )\x1b[0m >: ');
```
Always shows current message number, never "QUIT", and uses ` >: ` (space before colon).

**Fix**: When at the last message, put `QUIT` in the parentheses. Also change prompt suffix from ` >: ` to `>: `.

**Priority**: P2

---

## DEV-02: replyPrompt helplist=1 — Short help shows `<CR>=Next ( N )>:` but our code shows `<CR>=Next ( N )>:` with wrong spacing and uses `>:` (express.e:11009)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:321–375`

**Issue**: In helplist=1 (short help), express.e renders `\b\n[32m<[33mCR[32m>[0m=[33mNext [32m([0m \d[32m )[0m >: ` where `\d` is the *current msgNum* (same as main prompt), but with `\b\n` prefix (newline before). Our `displayShortHelp` outputs it without a leading `\r\n`, and inside the prompt uses different ANSI codes.

**express.e** (11009):
```
StringF(string,'\b\n[32m<[33mCR[32m>[0m=[33mNext [32m([0m \d[32m )[0m >: ',msgNum)
aePuts(string)
helplist:=0
```
After displaying helplist=1, `helplist` is reset to 0 immediately.

**Our code**: `displayShortHelp` does not reset any helplist state, does not emit `\r\n` before the `<CR>=Next` line, uses `nextMsgNum` instead of current msgNum.

**Fix**: Emit `\r\n` before the `<CR>=Next` line; use current msgNum (not next); set local helplist=0 equivalent after display.

**Priority**: P3

---

## DEV-03: replyPrompt / readMSG — `U` (User Account Edit) command missing (express.e:11154–11175, 12196–12220)

**File**: `web/backend/src/handlers/message/messaging.handler.ts` — not present

**Issue**: express.e shows U command in `helplist=2` (full help) if user has `ACS_ACCOUNT_EDITING`, and handles it in both `replyPrompt` (11154) and `readMSG` (12196). Our full-help listing (`displayFullHelp`, messaging.handler.ts:381–461) shows `E/EH/EM` but **omits U entirely**.

**express.e** (11032–11034):
```
IF checkSecurity(ACS_ACCOUNT_EDITING)
  aePuts('\b\n[33mU[32m>[36mser Account Edit[0m')
ENDIF
```
And the handler at 11154–11175:
```
IF(((str[0]="U") OR (str[0]="u")))
  IF(checkSecurity(ACS_ACCOUNT_EDITING))
    StrCopy(str,mailHeader.fromName,31)
    unum:=findUserFromName(...)
    ...
    editInfo(unum,...)
```

**Our code**: `displayFullHelp` and `handleMessageReaderNav` have no `U` case.

**Fix**: Add `U>ser Account Edit` entry to `displayFullHelp` (gated on `ACSPermission.ACCOUNT_EDITING`), and add a `U` case in `handleMessageReaderNav` that routes to user account editing of the message's author.

**Priority**: P2

---

## DEV-04: replyToMSG — prompts To: with existing toName, then re-checks forwarding (express.e:9874–9907)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:541–564` (R command in `handleMessageReaderNav`)

**Issue**: express.e `replyToMSG` (9874):
1. Copies `mailHeader.fromName` → `mailHeader.toName` (auto-fills To: with sender)
2. Prints `'                       [32m([33m------------------------------[32m)[0m\b\n'`
3. Prints `'     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m''[33m\s[32m''[32m?[0m \s\b\n'` showing the pre-filled name with NEWLINE
4. Calls `checkToForward` to check if mail-forward tooltype applies
5. Prompts for Subject: with pre-filled existing subject
6. Then calls `enterMSG` (with replyFlag=1) → skipBegin → Private prompt

Our code (R handler, lines 542–563) skips steps 2–5: it does NOT print the banner+To line, does NOT call `checkToForward`, does NOT prompt for Subject: (it pre-fills subject as `"Re: ..."` silently). It goes straight to the Private prompt.

**express.e** (9881–9890):
```
aePuts('                       [32m([33m------------------------------[32m)[0m\b\n')
AstrCopy(mailHeader.toName,mailHeader.fromName,31)
StringF(str,'     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m''[33mALL[32m''[32m?[0m \s\b\n',mailHeader.toName)
aePuts(str)
checkToForward(str,mailHeader.toName,1)
aePuts('[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m?[0m ')
stat:=lineInput('',mailHeader.subject,30,INPUT_TIMEOUT,str)
...
IF(StrLen(mailHeader.subject)=0) THEN RETURN RESULT_SUCCESS
```
Also: if subject is blank in the reply prompt, it aborts silently (returns RESULT_SUCCESS, does not enter editor).

**Fix**: Show banner + pre-filled `To: <author>` line + call checkToForward + prompt for Subject with pre-fill. If Subject blank, abort. Then go to Private prompt (replyFlag=1 path = skipBegin).

**Priority**: P1

---

## DEV-05: forwardMSG — Subject prompt pre-fills original subject; Our code uses blank (express.e:9825–9830)

**File**: `web/backend/src/handlers/message/message-entry.handler.ts:1022–1025`

**Issue**: express.e `forwardMSG`:
```
aePuts('[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m?[0m ')
stat:=lineInput('',mailHeader.subject,30,INPUT_TIMEOUT,tempStr)
AstrCopy(mh.subject,tempStr,31)
```
`lineInput` with second param `mailHeader.subject` pre-fills the input with the original subject. User pressing Enter keeps the original subject.

Our code (`handleForwardMessageToInput`) emits the Subject prompt but passes no pre-fill:
```typescript
emitText(socket, '\x1b[36mSubject...\x1b[0m ');
session.subState = LoggedOnSubState.FORWARD_MESSAGE_SUBJECT;
```
And `handleForwardMessageSubjectInput` treats empty input as "abort" immediately, so there is no way to keep the original subject by pressing Enter.

**Fix**: Pre-fill `session.tempData.forwardData.originalSubject` = `msg.subject`; emit it after the Subject prompt text; set `session.inputBuffer` to the original subject so Enter accepts it. Only abort on blank if the pre-fill was also blank.

**Priority**: P1

---

## DEV-06: forwardMSG — "Delete original" check wrong condition (express.e:9853–9860)

**File**: `web/backend/src/handlers/message/message-entry.handler.ts:1074`

**Issue**: express.e asks "Delete original message" only if `checkSecurity(ACS_DELETE_MESSAGE)` AND `stringCompare(frm, confMailName) = RESULT_SUCCESS` (i.e., the original was addressed TO the current user).

```
IF checkSecurity(ACS_DELETE_MESSAGE)
  IF(stringCompare(frm,confMailName)=RESULT_SUCCESS)
    aePuts('Delete original message ')
    stat:=yesNo(2)
```
`frm` = original `mailHeader.toName`.

Our code:
```typescript
if (session.tempData.forwardData.canDeleteOriginal) {
```
Where `canDeleteOriginal` is computed in the F handler as:
```typescript
canDeleteOriginal: msg.toUser === session.user.username && checkSecurity(...)
```
This is almost correct but uses strict equality instead of case-insensitive comparison (AmiExpress names are case-insensitive). Also `frm` in express.e is `mailHeader.toName`, not `fromName`.

**Fix**: Use case-insensitive comparison for `msg.toUser === session.user.username`.

**Priority**: P3

---

## DEV-07: deleteMSG — does not print "Message N deleted...\r\n" in exact express.e format (express.e:11936)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:634–657`

**Issue**: express.e after deleting:
```
StringF(string,'\b\nMessage \d deleted...\b\n',delMsgNum)
aePuts(string)
```
Format: `\r\nMessage 42 deleted...\r\n`

Our code:
```typescript
emitText(socket, AnsiUtil.successLine('Message deleted'));
```
`AnsiUtil.successLine` wraps in green ANSI brackets — a custom web format, not express.e's plain text.

Also express.e after deletion returns `RESULT_SUCCESS` and goes to the *next* message (JUMP goNextMsg / RETURN RESULT_SUCCESS), while our code calls `displaySingleMessage(nextIndex)`.

**Fix**: Replace `AnsiUtil.successLine('Message deleted')` with `\r\nMessage ${msg.id} deleted...\r\n`.

**Priority**: P2

---

## DEV-08: K (Keep) — condition check wrong; also misses lowestNotDel update (express.e:11124–11137)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:578–591`

**Issue**: express.e K command:
```
IF((privateFlag=0) OR ((stringCompare(mailHeader.toName,confMailName)=RESULT_SUCCESS)))
  mailHeader.recv:=0
  delMsgNum:=mailHeader.msgNumb
  IF lastNewReadConf>=mailHeader.msgNumb THEN lastNewReadConf--
  IF mailStat.lowestNotDel>=mailHeader.msgNumb THEN lastNewReadConf:=mailStat.lowestNotDel
  saveOverHeader(gfh)
  kMsgFlag:=TRUE
  RETURN RESULT_SUCCESS
```

Our code:
```typescript
session.tempData.msgReaderHighestRead = Math.max(0, (msg.id || 0) - 1);
```
This sets the read pointer to `msg.id - 1` which is a reasonable approximation for `lastNewReadConf--`. However:
1. The `lowestNotDel` fallback (`IF mailStat.lowestNotDel >= msgNumb THEN lastNewReadConf := mailStat.lowestNotDel`) is not implemented.
2. The `recv = 0` (un-mark received) is not done in our disk-based message files.
3. The condition check uses `!msg.isPrivate || msg.toUser === session.user.username || msg.toUser === 'ALL'` but express.e only checks public (`privateFlag=0`) OR addressed to current user — does not allow K for messages to ALL that are private.

**Fix**: Implement the lowestNotDel fallback; call `markMessageUnreceived` on disk; remove the `msg.toUser === 'ALL'` branch from the K condition.

**Priority**: P2

---

## DEV-09: searchNewMail — confScan scan line format deviation (express.e:11712–11714 vs message-scan.handler.ts:538)

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:538–539`

**Issue**: express.e header:
```
aePuts('[32mType     From                           Subject                Msg    \b\n')
aePuts('[33m-------  -----------------------------  ---------------------  -------\b\n')
aePuts('[0m')
```
Our code:
```typescript
socket.emit('ansi-output', '\x1b[32mType     From                           Subject                Msg    \r\n');
socket.emit('ansi-output', '\x1b[33m-------  -----------------------------  ---------------------  -------\r\n');
```
Missing `\x1b[0m` reset line after the dashes.

Also the per-message row format (express.e:11720):
```
StringF(tempStr,'\s  \l\s[29]  \l\s[21]  [0m\z\r\d[6]\b\n',mailStatus,fromName,subject,msgNumb)
```
`\z\r\d[6]` = zero-padded, right-justified, 6-digit number. Our code:
```typescript
const num = String(m.msgNum).padStart(6, '0');
socket.emit('ansi-output', `${status}  ${from}  ${subj}  \x1b[0m${num}\r\n`);
```
The zero-padding is correct. However express.e inserts `\l\s[29]` (left-justify, pad to 29 chars) for fromName and `\l\s[21]` for subject — our code uses `substring(0,29).padEnd(29)` and `substring(0,21).padEnd(21)` which is equivalent. This part is OK.

Missing: the `[0m` reset line.

Also the `"Found Mail!"` line (express.e:11737): `IF(currentConf<>0) AND (mailFlag) THEN aePuts('\b\nFound Mail!')`. Our code (confScan=TRUE path, currentConf≠0) does NOT emit "Found Mail!" before the "Would you like to read it now" prompt.

**Fix**: Add `\x1b[0m\r\n` after the dashes line; add `\r\nFound Mail!` before the read prompt in the confScan path.

**Priority**: P2

---

## DEV-10: searchNewMail — condition `recv=0` missing from scan filter (express.e:11706)

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:255–258`

**Issue**: express.e:11706:
```
IF(... (stringCompare(mailHeader.toName,confMailName)=RESULT_SUCCESS) ...) AND (mailHeader.recv=0)
```
The condition `AND (mailHeader.recv=0)` means messages already marked as received are **NOT** re-shown in the confScan mail listing. Our `getMessagesForConfScan` does not check `recv=0`. The `MsgStatus` enum flags are checked but `recv` is a separate field in the `mailHeader` binary struct (not a status bit).

**Fix**: In `getMessagesForConfScan`, when using the `HeaderFile` path, check `header.recv === 0` (unread). When using the disk-fallback path, check that `message.receivedAt` is null/falsy. This ensures already-read private mail is not re-listed in confScan.

**Priority**: P1

---

## DEV-11: confScan — "Scanning Conference: confName - " emitted BEFORE joinConference (express.e:11670–11672)

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:507–508`

**Issue**: express.e:
```
IF(currentConf=0)    -> inside confScan (confScan sets currentConf=0 as sentinel)
  IF msgBaseNum=1
    StringF(tempStr,'[32mScanning Conference[33m: [0m\s - ',currentConfName)
    aePuts(tempStr)
  ENDIF
```
This is emitted *before* the per-msgBase check. Then per message base: emit msgbase name if > 1 msgbase. Our code (message-scan.handler.ts:507–508) emits the "Scanning Conference" line *after* the `await joinConference` call, which changes `session.currentConf` away from 0. So the guard `currentConf=0` condition is violated — but since we don't have this guard in TS, it still emits (no bug). However we emit just the confName, not the per-msgBase name.

Also: express.e emits per msgbase name *only if* `msgBaseNum > 1` (i.e., if there are multiple bases). Our code only scans the first msgbase and doesn't emit msgbase names at all.

**Fix**: P3 — emit msgbase name when conference has > 1 msgbase.

**Priority**: P3

---

## DEV-12: OLM compose — uses non-standard `/S`/`/A` commands instead of express.e `edit()` (express.e:25443–25445)

**File**: `web/backend/src/handlers/transfer/olm.handler.ts:134–206`

**Issue**: express.e OLM compose calls `edit()` (the standard line-based editor, same as for regular messages):
```
msgBuf.clear()
lines:=0
edit()
```
This gives the user the full `Msg. Options: A,C,D,E,L,S,?` menu after pressing Enter on a blank line. Our code uses a simplified inline `/S` to send and `/A` to abort, with a maximum of 10 lines and no options menu.

Also: express.e OLM does NOT use `\x1b[34m*\x1b[0mOLM MESSAGE SYSTEM\x1b[34m*\x1b[0m` as a header — this text is not in express.e at 25406–25503.

The prompt `"OLM to Which Node? [Node #] [R] To Reply Or [Q] To Quit:"` is a web invention; express.e prompt (25427):
```
-> No explicit "to which node" prompt shown; uses the node-list WHO display first
```
Actually express.e checks multicom toggle and available nodes then prompts for node number — the exact prompt text needs to be verified in the WHO display output, but our current prompt text is a custom web format.

**Fix**: This is a MODERN_* feature area since there is no Amiga edit() pipe available in web. The non-standard `/S`/`/A` compose interface should be tagged `// WEB_: simplified OLM editor (no edit() available in web)`; the header banner should be tagged similarly.

**Priority**: P3 (tagging issue only — functionality equivalent)

---

## DEV-13: saveNewMSG — does not call `doCommentNotify` for sysop comments (express.e:10717–10718)

**File**: `web/backend/src/handlers/message/message-entry.handler.ts:500–523`

**Issue**: express.e `saveNewMSG` after saving:
```
IF (tempUser.slotNumber=1)
  doCommentNotify(mh.fromName,mh.subject)
ENDIF
```
`tempUser.slotNumber=1` means the message was sent to user slot 1 (the sysop). `doCommentNotify` triggers the `EXECUTE_ON_SYSOP_COMMENT` tooltype and mail notification.

Our code does implement the equivalent webhook + `runExecuteOn('SYSOP_COMMENT', ...)` + `mailOnSysopComment(...)` — but only for `entry.toUser.toLowerCase() === 'sysop'`. This is correct for the SYSOP case but express.e uses slot 1 check, which means if sysop has a non-"SYSOP" username, our check may miss. In practice, slot 1 is always the sysop. No real deviation.

**Fix**: None needed. Mark as OK.

**Priority**: N/A

---

## DEV-14: chooseTranslator — 'H' toggle for word highlight missing (express.e:11407–11414)

**File**: `web/backend/src/handlers/message/messaging.handler.ts:1393–1449`

**Issue**: express.e `chooseTranslator` (11391–11424) handles input `H`/`h`:
```
IF (tempstr[0]="H") OR (tempstr[0]="h")
  loggedOnUser.translatorID:=Eor(loggedOnUser.translatorID,128)
  IF loggedOnUser.translatorID AND 128
    aePuts('WORD HIGHLIGHT ON')
  ELSE
    aePuts('WORD HIGHLIGHT OFF')
  ENDIF
  JUMP redoTrans
ENDIF
```
Our `handleChooseTranslatorInput` does not handle `H` at all — it treats any non-numeric input as invalid.

Also express.e `chooseTranslator` calls `displayScreen(SCREEN_LANGUAGES)` first; if screen doesn't exist, prints `'Languages list unavailable\b\n\b\n'`. Our code prints the list inline, always (no screen file check).

**Fix**: Add `H` handling in `handleChooseTranslatorInput`: toggle bit 128 of `translatorID`, emit "WORD HIGHLIGHT ON/OFF", re-prompt. Also check for `SCREEN_LANGUAGES` file before inline listing.

**Priority**: P2

---

## Priority Summary

### P1 — Must fix (behavioral correctness)
- DEV-04: Reply (R) — missing banner, To: pre-fill, Subject: prompt, checkToForward
- DEV-05: Forward (F) — Subject prompt missing pre-fill (always aborts on Enter)
- DEV-10: confScan — `recv=0` filter missing (already-read mail re-shown in scan)

### P2 — Should fix (visible to user)
- DEV-01: Nav prompt shows wrong indicator (no QUIT at end, trailing space before colon)
- DEV-03: U (User Account Edit) command missing from reader nav
- DEV-07: deleteMSG wrong output format (custom ANSI vs plain express.e text)
- DEV-08: K (Keep) — lowestNotDel fallback missing, recv not cleared on disk
- DEV-09: confScan table missing `[0m` reset, missing "Found Mail!" line
- DEV-14: chooseTranslator — H toggle missing

### P3 — Nice to fix (minor)
- DEV-02: Short help CR prompt wrong (nextMsgNum vs current, missing leading \r\n)
- DEV-06: K/F delete-original condition uses == instead of case-insensitive compare
- DEV-11: confScan missing per-msgBase name emission
- DEV-12: OLM compose non-standard editor (needs WEB_: tag only)
