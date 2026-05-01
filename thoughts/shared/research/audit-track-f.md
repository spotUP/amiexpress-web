---
date: 2026-04-28
topic: audit-track-f-conference-system
tags: [audit, conference, joinConf, confScan, deviations]
status: final
---

# Track F — Conference System Audit

Compared express.e conference module (lines 4975–5139, 572–608, 28066–28150, 28540–28590) against:
- `web/backend/src/handlers/operations/conference.handler.ts`
- `web/backend/src/handlers/message/message-scan.handler.ts`
- `web/backend/src/handlers/commands/user-commands.handler.ts`
- `web/backend/src/handlers/command-handler/conference-maint-states.ts`
- `web/backend/src/handlers/command-handler/file-maintenance-states.ts`
- `web/backend/src/amiga-emulation/xim/system-commands.ts`

## Summary

| # | Area | Severity |
|---|------|----------|
| 1 | joinConf: ACS check + conference fallback loop missing | P1 |
| 2 | joinConf: CUSTOM tooltype path entirely missing | P1 |
| 3 | joinConf: mail scan inside joinConference is stubbed (TODO comment) | P1 |
| 4 | joinConf: saveMsgPointers() never called after mail scan | P1 |
| 5 | joinConf: createNodeUserFiles() not called on normal join | P2 |
| 6 | joinConf: pointer validation differs (lowestNotDel clamping missing) | P2 |
| 7 | joinConf: displaySysopULStats() missing in auto path | P3 |
| 8 | joinConf: CONF_BULL shown even when confScan=TRUE | P1 |
| 9 | joinConf: auto-rejoin flow passes auto=true but express.e passes auto=FALSE | P1 |
| 10 | confScan: MAILSCAN_PROMPT only checks msg scan, not file scan separately | P2 |
| 11 | confScan: scans only first msgBase per conf instead of all msgBases | P2 |
| 12 | confScan: partUpload check phase entirely missing | P2 |
| 13 | confScan: file scan runs all confs even when mscan=FALSE (prompt case) | P2 |
| 14 | checkFileConfScan: default fallback is FALSE instead of TRUE | P2 |
| 15 | checkMailConfScan: scanFlags field name unverified against confBase schema | P3 |
| 16 | J command: getInverse() (relative→absolute conf numbering) not implemented | P2 |
| 17 | J command: saveMsgPointers not called before joining | P2 |
| 18 | DISPLAY_CONF_BULL state: auto=true passed to joinConference but express.e uses auto=FALSE | P1 |
| 19 | conference-maint-states.ts: no conference maintenance state handler — only dispatches | P3 |
| 20 | SET_FILEATTACH in system-commands.ts: correctly implemented | OK |
| 21 | JH_JC: not present in express.e (was JH_REGISTER), current handling correct | OK |

---

## DEV-1: joinConf — ACS Check + Conference Fallback Loop Missing

**File**: `web/backend/src/handlers/operations/conference.handler.ts:108–118`
**express.e**: lines 4982–4993

```
4982:   IF (checkConfAccess(conf)=FALSE) THEN conf:=1
4983:   IF((conf<1) OR (conf>cmds.numConf)) THEN conf:=1
4984:   WHILE (conf<=cmds.numConf) ANDALSO (checkConfAccess(conf)=FALSE)
4985:     conf++
4986:   ENDWHILE
4987:
4988:   IF (conf>cmds.numConf)
4989:     aePuts('\b\nYou do not have access to any conferences on this BBS\b\n')
4990:     aePuts('Disconnecting..\b\n')
4991:     reqState:=REQ_STATE_LOGOFF
4992:     RETURN
4993:   ENDIF
```

**Our code**:
```typescript
const conference = conferences.find(c => c.id === confId);
if (!conference) {
  if (!silent) socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
  return false;
}
```

**Issue**: express.e does not hard-fail on an inaccessible conference. It first resets `conf` to 1, then walks forward until it finds a conference the user has access to, then if it exhausts all conferences it logs off with the "no access to any conferences" message. Our code does a simple ID lookup and returns false/emits an error message, neither logging the user off nor walking to find an accessible conference.

**Fix**: Before the lookup, run the same three-step check: if `checkConfAccess(conf)=FALSE` reset to 1, walk forward while still not accessible, if walk exhausts all conferences set `reqState = REQ_STATE_LOGOFF` and return.

**Priority**: P1

---

## DEV-2: joinConf — CUSTOM Tooltype Path Entirely Missing

**File**: `web/backend/src/handlers/operations/conference.handler.ts` (entire file)
**express.e**: lines 5028, 5093, 5111, 5121–5124

```
5028:   IF checkToolTypeExists(TOOLTYPE_CONF,conf,'CUSTOM')=FALSE
5029:     mystat:=getMailStatFile(conf,msgBaseNum)
         ...
5093:     IF checkToolTypeExists(TOOLTYPE_CONF,conf,'CUSTOM')=FALSE
5111:       ELSE
5112:         customMsgbaseCmd(MAIL_STATS,conf,0)
5113:       ENDIF
5121:       IF checkToolTypeExists(TOOLTYPE_CONF,conf,'CUSTOM')=FALSE
5122:         mystat:=callMsgFuncs(MAIL_SCAN,conf, msgBaseNum)
5123:       ELSE
5124:         customMsgbaseCmd(MAIL_SCAN,conf,0)
5125:       ENDIF
```

**Our code**: No reference to CUSTOM tooltype anywhere in conference.handler.ts. The code always calls the standard mail stat/mail scan path.

**Issue**: Conferences configured with the CUSTOM tooltype use a different message base implementation (customMsgbaseCmd). When CUSTOM is set, getMailStatFile is skipped entirely (no lastMsgReadConf/lastNewReadConf reset), mail stats display uses customMsgbaseCmd(MAIL_STATS), and mail scan uses customMsgbaseCmd(MAIL_SCAN). This branch is silently missing.

**Fix**: Add `getConferenceToolFlags(confId).custom` check in joinConference at the three points above. The CUSTOM implementation (customMsgbaseCmd) can be stubbed for now but must be architecturally present.

**Priority**: P1

---

## DEV-3: joinConf — Mail Scan Inside joinConference Is Stubbed

**File**: `web/backend/src/handlers/operations/conference.handler.ts:185–204`
**express.e**: lines 5119–5127

```
5119:   IF (auto=FALSE) AND (forceMailScan<>FORCE_MAILSCAN_SKIP)
5120:     IF (forceMailScan=FORCE_MAILSCAN_ALL) OR (checkMailConfScan(conf, msgBaseNum))
5121:       IF checkToolTypeExists(TOOLTYPE_CONF,conf,'CUSTOM')=FALSE
5122:         mystat:=callMsgFuncs(MAIL_SCAN,conf, msgBaseNum)
5123:       ...
5126:       saveMsgPointers(conf,msgBaseNum)
5127:     ENDIF
```

**Our code**:
```typescript
const shouldScan = forceMailScan === FORCE_MAILSCAN_ALL; // TODO: || checkMailConfScan(confId, msgBaseNum)
if (shouldScan && session.user) {
  try {
    const { db } = require('../../database');
    const newMessages = await db.getNewMessagesForUser(...);
    if (newMessages && newMessages.length > 0) {
      socket.emit('ansi-output', `\r\n\x1b[33m${conference.name}\x1b[0m: ${newMessages.length} new message(s)\r\n`);
    }
  }
```

**Issue**: The TODO comment confirms `checkMailConfScan` is not wired. The scan only fires for `FORCE_MAILSCAN_ALL` (MS command). Normal join (forceMailScan=NONE) never runs the mail scan check. Also, `callMsgFuncs(MAIL_SCAN,...)` is our full searchNewMail flow, not just a count — our code just emits a count string instead.

**Fix**: Connect `checkMailConfScan(confId, msgBaseNum)` from `message-scan.handler.ts` to the condition on line 186. Replace the count-display with calling the real mail scan (`callMsgFuncs` equivalent = `performConferenceScan` scoped to one conf/msgbase). This is the single-conference mail scan triggered by explicit J command, distinct from the login-time full confScan.

**Priority**: P1

---

## DEV-4: joinConf — saveMsgPointers Never Called After Mail Scan

**File**: `web/backend/src/handlers/operations/conference.handler.ts:185–204`
**express.e**: line 5126

```
5126:       saveMsgPointers(conf,msgBaseNum)
```

**Our code**: No call to `saveMsgPointers` anywhere in `joinConference`. Message pointers are loaded from disk but never written back after scanning.

**Issue**: After a successful mail scan `callMsgFuncs(MAIL_SCAN,...)`, express.e immediately saves updated pointers. Our joinConference loads pointers but never persists them. This means the scan pointer advances in memory but is lost on the next read.

**Fix**: After completing the mail scan in joinConference (or in the `forceMailScan !== FORCE_MAILSCAN_SKIP` branch), call `saveMsgPointers` / `updateScanPointer` for the conference/msgbase.

**Priority**: P1

---

## DEV-5: joinConf — createNodeUserFiles Not Called on Normal Join

**File**: `web/backend/src/handlers/operations/conference.handler.ts:174–181`
**express.e**: line 5137

```
5130:   IF (auto=FALSE) AND (confScan=FALSE)
5131:     IF (reqState<>REQ_STATE_NONE) THEN RETURN mystat
5132:     IF(logonType>=LOGON_TYPE_REMOTE)
5133:       IF(checkCarrier()=FALSE) THEN RETURN mystat
5134:     ENDIF
5135:     loggedOnUser.confRJoin:=conf
5136:     loggedOnUser.msgBaseRJoin:=msgBaseNum
5137:     createNodeUserFiles()
```

**Our code**:
```typescript
if (session.user && session.nodeId !== undefined) {
  try {
    const { nodeFileManager } = require('../../services/NodeFileManager');
    nodeFileManager.writeNodeUserFile(session.nodeId, session.user);
```

**Issue**: Our code calls `nodeFileManager.writeNodeUserFile` unconditionally on every joinConference call (including `confScan=true` and `auto=true` paths), whereas express.e only calls `createNodeUserFiles()` when `auto=FALSE AND confScan=FALSE`. The node file should only be updated on an explicit user-initiated join, not during startup confScan or auto-rejoin.

**Fix**: Guard the nodeFileManager write with `!auto && !confScan` to match express.e:5130.

**Priority**: P2

---

## DEV-6: joinConf — Pointer Validation Differs (lowestNotDel Clamping Missing)

**File**: `web/backend/src/handlers/operations/conference.handler.ts:163–170`
**express.e**: lines 5037–5048

```
5037:   IF(lastMsgReadConf<mailStat.lowestNotDel) THEN lastMsgReadConf:=mailStat.lowestNotDel
5038:   IF(lastNewReadConf<mailStat.lowestNotDel) THEN lastNewReadConf:=mailStat.lowestNotDel
5040:   IF(lastMsgReadConf>mailStat.highMsgNum)
5041:     errorLog(string)
5042:     lastMsgReadConf:=0
5044:   IF(lastNewReadConf>mailStat.highMsgNum)
5045:     errorLog(string)
5046:     lastNewReadConf:=0
```

**Our code** (in `validatePointers` from `message-pointers.util.ts`):
```typescript
session.lastMsgReadConf = validated.lastMsgReadConf || 0;
session.lastNewReadConf = validated.lastNewReadConf || 0;
```

**Issue**: express.e clamps both pointers up to `mailStat.lowestNotDel` if they fall below it (catches cases where lowest message was deleted forward). Our `validatePointers` may or may not implement this — needs verification against `message-pointers.util.ts`. Also, express.e resets to 0 (not just logs) when a pointer exceeds highMsgNum. Need to verify `validatePointers` matches this exact clamping logic.

**Fix**: Verify `validatePointers` in `message-pointers.util.ts` implements the `lowestNotDel` clamp both upward (< lowestNotDel → set to lowestNotDel) and reset on overflow (> highMsgNum → 0 with errorLog).

**Priority**: P2

---

## DEV-7: joinConf — displaySysopULStats Missing in Auto Path

**File**: `web/backend/src/handlers/operations/conference.handler.ts:259`
**express.e**: line 5115

```
5115:   IF (auto) THEN displaySysopULStats()
```

**Our code**: Comment says `// express.e:5115 - IF (auto) THEN displaySysopULStats() — WEB_: not applicable`

**Issue**: Tagged as WEB_ deviation, but there is no user-facing comment explaining why it's not applicable. `displaySysopULStats` shows upload statistics for sysop monitoring. This is intentionally omitted for the web version, but the WEB_ tag should have a reason.

**Fix**: The WEB_ comment is acceptable; add a brief explanation ("Sysop local terminal display not applicable to web nodes").

**Priority**: P3

---

## DEV-8: joinConf — CONF_BULL Shown Even When confScan=TRUE (Critical)

**File**: `web/backend/src/handlers/operations/conference.handler.ts:218–226`
**express.e**: lines 5056–5061

```
5056:   IF(confScan=FALSE)
5057:     StrCopy(currentMenuName,'')
5058:     IF displayScreen(SCREEN_CONF_BULL)
5059:       temp:=doPause()
5060:       IF(temp<0) THEN RETURN temp
5061:     ENDIF
```

**Our code**:
```typescript
if (!silent) {
  try {
    const shown = await displayScreen(socket, session, 'CONF_BULL', true, true);
    if (shown) {
      doPause(socket, session);
    }
  }
```

**Issue**: express.e gates CONF_BULL display on `confScan=FALSE`. Our code gates it on `!silent`. Looking at the call sites:
- Login flow (`advanceConferenceScan`): calls `joinConference(socket, session, conf, msgBaseId, true, false, 0, true)` — `silent=true`, so CONF_BULL is suppressed. This is correct.
- `DISPLAY_CONF_BULL` state in command.handler.ts:739 calls `joinConference(socket, session, confId, msgBaseId, false, true)` — `silent=false`, so CONF_BULL IS displayed. But express.e calls `joinConf(confRJoin, msgBaseRJoin, FALSE, FORCE_MAILSCAN_SKIP)` with confScan=FALSE, so CONF_BULL should be displayed here too.

The mapping `silent` ↔ `confScan` appears correct in practice, but the semantics are inverted — express.e's `confScan` means "don't show per-conf UI", our `silent` means "suppress output". This happens to produce correct behaviour at current call sites but is semantically fragile. The confScan=TRUE calls do pass silent=true.

Also note: express.e additionally resets `currentMenuName` to '' before displaying CONF_BULL (`StrCopy(currentMenuName,'')`). Our code does not reset `currentMenuName`.

**Fix**: Rename or document the `silent`↔`confScan` relationship. Add `session.currentMenuName = ''` before the CONF_BULL display call.

**Priority**: P1 (currentMenuName reset), P3 (naming clarity)

---

## DEV-9: DISPLAY_CONF_BULL/AUTO_REJOIN — auto=true Passed But express.e Uses auto=FALSE

**File**: `web/backend/src/handlers/command.handler.ts:739`
**express.e**: line 28574

```
28574:     joinConf(loggedOnUser.confRJoin,loggedOnUser.msgBaseRJoin,FALSE,FORCE_MAILSCAN_SKIP)
```

**Our code**:
```typescript
const joinSuccess = await joinConference(socket, session, confId, msgBaseId, false, true);
```

**Issue**: express.e line 28574 calls `joinConf(conf, msgbase, confScan=FALSE, auto=FALSE, FORCE_MAILSCAN_SKIP)`. Our code passes `auto=true`. This causes joinConference to:
- Call `processSysCommand('S')` (user stats display) — express.e does NOT do this in the SUBSTATE_DISPLAY_CONF_BULL path
- Display "Auto-ReJoined" message — express.e does NOT do this here
- Display message count stats — express.e does NOT do this here

The express.e `auto` parameter changes display output. In the SUBSTATE_DISPLAY_CONF_BULL path, auto=FALSE, so none of the auto-join text appears. This text only appears when the user explicitly ran the auto-rejoin during login (the full login flow via scanHoldDesc → S → Auto-ReJoined message). In express.e, `SUBSTATE_DISPLAY_CONF_BULL` is the post-confScan rejoin — it shows CONF_BULL then goes straight to menu, with no user stats or "Auto-ReJoined" banner.

**Fix**: Change `auto=true` to `auto=false` in the DISPLAY_CONF_BULL/AUTO_REJOIN state call. Remove the AUTO_REJOIN state (it was added to our code but has no express.e equivalent at this point in the flow).

**Priority**: P1

---

## DEV-10: confScan — MAILSCAN_PROMPT Does Not Suppress File Scan

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:648–663`
**express.e**: lines 28075–28082

```
28075:   IF (prompt:=checkToolTypeExists(TOOLTYPE_NODE,node,'MAILSCAN_PROMPT'))
28076:     aePuts('\b\n[0mScan for Mail ')
28077:     mystat:=yesNo(1)
28078:     IF mystat<0 THEN RETURN mystat
28079:     mscan:=(mystat=1)
28080:   ENDIF
28081:
28082:   IF (prompt=FALSE) OR (mscan=TRUE)
```

**Our code**: The MAILSCAN_PROMPT branch only controls `session.tempData.confScanState.mscan`. The file scan phase in `advanceConferenceScan` runs independently of `mscan` and always executes. 

**Issue**: express.e:28082 gates the entire scan loop (both mail AND file scan) on `(prompt=FALSE) OR (mscan=TRUE)`. When the user answers "N" to "Scan for Mail?", the entire confScan body is skipped. Our code skips only the mail portion but still runs the file scan.

**Fix**: When `mscan=FALSE` from the MAILSCAN_PROMPT response, skip both mail and file scan phases and go directly to `finishConferenceScan`.

**Priority**: P2

---

## DEV-11: confScan — Only First msgBase Per Conf Scanned

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:493–505`
**express.e**: lines 28092–28097

```
28092:     n:=getConfMsgBaseCount(conf)
28093:     FOR msgbase:=1 TO n
28094:       IF prompt=FALSE
28095:         mscan:=checkMailConfScan(conf,msgbase)
28096:       ENDIF
28097:       mystat:=joinConf(conf,msgbase,TRUE,FALSE,IF mscan=FALSE THEN FORCE_MAILSCAN_SKIP ELSE FORCE_MAILSCAN_NOFORCE)
28098:     ENDFOR
```

**Our code**:
```typescript
const confMsgBases = _messageBases.filter(mb => mb.conferenceId === conf);
if (confMsgBases.length === 0) { continue; }
const firstMsgBase = confMsgBases[0];
const msgBaseId = firstMsgBase.id;
// (only processes firstMsgBase — no inner loop)
```

**Issue**: express.e iterates over all message bases in a conference. Our code only scans the first message base. Multi-msgbase conferences will miss mail in bases 2+.

**Fix**: Add an inner loop over `confMsgBases` matching express.e's inner `FOR msgbase:=1 TO n` loop.

**Priority**: P2

---

## DEV-12: confScan — partUpload Check Phase Entirely Missing

**File**: `web/backend/src/handlers/message/message-scan.handler.ts`
**express.e**: lines 28117–28147

```
28117:   IF checkSecurity(ACS_UPLOAD)
28118:     FOR conf:=1 TO cmds.numConf
28119:       IF (checkConfAccess(conf))
28120:         mystat:=joinConf(conf,1,TRUE,FALSE,FORCE_MAILSCAN_SKIP)
28121:         IF (mystat=RESULT_SUCCESS)
28122:           mystat:=partUploadOK(1)
28123:           IF(mystat=RESULT_FAILURE)
28124:             currentConf:=conf
28125:             setEnvStat(ENV_UPLOADING)
28126:             IF(checkSecurity(ACS_UPLOAD))
28127:               ... uploadaFile(0,'URG',FALSE)
```

**Our code**: After the file scan phase, the code calls `finishConferenceScan`. There is no partial upload check loop at all.

**Issue**: express.e has a third phase after message scan and new-file scan: it checks every conference for in-progress (partial) uploads by calling `partUploadOK()`. If a partial upload is found, it resumes the upload. This entire phase is absent.

**Fix**: After the file scan loop, add a partial upload check phase. This requires implementing `partUploadOK()` semantics (check if a playpen file exists for the conference). This is a full sub-feature. Mark as TODO with a clear comment.

**Priority**: P2

---

## DEV-13: confScan — File Scan Runs All Confs Even When mscan=FALSE

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:576–599`
**express.e**: line 28082

```
28082:   IF (prompt=FALSE) OR (mscan=TRUE)
```

**Our code**: The file scan loop at line 576 runs regardless of whether the user answered N to MAILSCAN_PROMPT. See DEV-10 — same root cause.

**Fix**: Same fix as DEV-10: gate the file scan loop on `mscan`.

**Priority**: P2 (covered by DEV-10 fix)

---

## DEV-14: checkFileConfScan — Default Fallback Is FALSE Instead of TRUE

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:125–129`
**express.e**: lines 603–607

```
601:   cb:=confBases.item(getConfIndex(conf,1))
602:
603:   IF cb<>NIL
604:     IF (cb.handle[0] AND FILE_SCAN_MASK)<>0 THEN res:=TRUE ELSE res:=FALSE
605:   ELSE
606:     res:=TRUE
607:   ENDIF
```

**Our code**:
```typescript
} catch (err) {
  // WEB_: safer default — only scan files when explicitly enabled
  return false;
}
```

**Issue**: express.e:606 returns TRUE when confBase is missing (`ELSE res:=TRUE`). Our code returns FALSE with a WEB_ comment saying "safer default". This is a documented intentional deviation, but the WEB_ tag is not in the code comment — only a plain English comment. No WEB_ tag = no tracking.

**Fix**: Change the comment to `// WEB_: diverges from express.e:606 (ELSE res:=TRUE). Our default is FALSE to avoid spurious file scans when conf_base is not initialized.`

**Priority**: P2

---

## DEV-15: checkMailConfScan — scanFlags Field Name Unverified

**File**: `web/backend/src/handlers/message/message-scan.handler.ts:187–192`
**express.e**: lines 582–588

```
582:   cb:=confBases.item(getConfIndex(conf,msgBase))
584:   IF cb<>NIL
585:     IF (cb.handle[0] AND MAIL_SCAN_MASK)<>0 THEN res:=TRUE ELSE res:=FALSE
586:   ELSE
587:     res:=TRUE
```

**Our code**:
```typescript
const confBase = await loadMsgPointers(userId, conferenceId, messageBaseId);
return (confBase.scanFlags & MAIL_SCAN_MASK) !== 0;
```

**Issue**: express.e reads `cb.handle[0]` (first byte of the confBase handle field). Our code reads `confBase.scanFlags`. This needs to be verified against the schema in `message-pointers.util.ts` to confirm `scanFlags` maps to the same byte as `handle[0]`. The `handle` field in AmiExpress confBase is where per-user scan preferences and flags are stored.

**Fix**: Verify that `loadMsgPointers` returns a `scanFlags` field that corresponds to `cb.handle[0]`. Also note express.e:587 returns TRUE when confBase is missing — our code throws an error and catches it, defaulting to TRUE at line 191 (`return true`), which matches.

**Priority**: P3

---

## DEV-16: J Command — getInverse() (Relative Conference Numbering) Not Implemented

**File**: `web/backend/src/handlers/commands/user-commands.handler.ts:412`
**express.e**: lines 25140, 25150

```
25140:   newConf:=getInverse(newConf)
...
25150:     newConf:=getInverse(Val(newStr))
```

**Our code**:
```typescript
// express.e:25138 - getInverse (for inverse conference numbering)
// For now, we use absolute numbering (not inverse)
```

**Issue**: express.e uses relative conference numbering when `TOGGLES_CONFRELATIVE` is set. `getInverse()` converts a relative number (e.g., "2" meaning "the 2nd conference the user has access to") to an absolute conference number. Our code uses the number directly as absolute. If `TOGGLES_CONFRELATIVE` is set and a user types "J 2", they expect the 2nd accessible conference, not conference ID 2.

**Fix**: Implement `getInverse()` using `checkConfAccess()` and `sopt.toggles[TOGGLES_CONFRELATIVE]`. If CONFRELATIVE is not set (or unknown), fall back to absolute numbering as now.

**Priority**: P2

---

## DEV-17: J Command — saveMsgPointers Not Called Before Joining

**File**: `web/backend/src/handlers/commands/user-commands.handler.ts:502–505`
**express.e**: line 25121

```
25121:   saveMsgPointers(currentConf,currentMsgBase)
```

**Our code**: The comment at line 382 says "// express.e:25120 - saveMsgPointers(currentConf, currentMsgBase) / // This is handled by joinConference function". But joinConference does NOT call saveMsgPointers for the old conference before switching.

**Issue**: Before joining a new conference, express.e saves the current conference's message pointers. Our code neither calls saveMsgPointers in the J command handler nor does joinConference save the previous conf's pointers. The user's read position in the current conference is lost when they switch.

**Fix**: Call `saveMsgPointers(session.currentConf, session.currentMsgBase)` at the start of `handleJoinConferenceCommand`, before any state changes.

**Priority**: P2

---

## DEV-18: DISPLAY_CONF_BULL State — joinConference Called With auto=TRUE

(Duplicate of DEV-9 — same issue, different file reference.)

**File**: `web/backend/src/handlers/command.handler.ts:739`
**express.e**: line 28574

**Priority**: P1 (see DEV-9)

---

## DEV-19: conference-maint-states.ts — Only Dispatches, No Maintenance Logic

**File**: `web/backend/src/handlers/command-handler/conference-maint-states.ts`

**Issue**: This file only dispatches CM_* substate input to `handleCMInput` and `handleCMNumericInput` from `message-commands.handler`. The actual conference maintenance logic (add, edit, delete conferences) is in `message-commands.handler.ts`. This file is a router only. This is a structural observation, not a deviation.

**Priority**: P3 (observation)

---

## Confirmed Correct Implementations

**SET_FILEATTACH** (`system-commands.ts:4042`): `fileattach:=(msg.data<>0)` → our code correctly sets a boolean `fileattach` from `msg.data`. express.e:4042–4043 confirmed identical.

**JH_JC**: Searched express.e — this command code does not exist in express.e. The "JH_JC" in the task prompt appears to be a misidentification. The JH_REGISTER handler in system-commands.ts is the relevant door registration handler and is correctly implemented per express.e:3379–3381.

**checkConfAccess (ACS string)**: Our `message-scan.handler.ts:140–162` correctly implements the X/_ string check from express.e:8504–8509. Area-name access (line 157–161) returns false with a WEB_ note — this is documented.

**confScan setEnvStat(ENV_SCANNING)**: `message-scan.handler.ts:619` sets `session.currentStat = 9` — needs verification that 9 === ENV_SCANNING in express.e's enum.

---

## express.e Login Flow Reference (for cross-checking)

```
SUBSTATE_DISPLAY_BULL:
  displayScreen(SCREEN_BULL)  → doPause if shown
  displayScreen(SCREEN_NODE_BULL) → doPause if shown
  checkCarrier()
  confScan()  ← full scan of all conferences
  → SUBSTATE_DISPLAY_CONF_BULL

SUBSTATE_DISPLAY_CONF_BULL:
  joinConf(confRJoin, msgBaseRJoin, confScan=FALSE, auto=FALSE, FORCE_MAILSCAN_SKIP)
    ↳ displayScreen(SCREEN_CONF_BULL) + doPause  [because confScan=FALSE]
    ↳ NO "Auto-ReJoined" text  [because auto=FALSE]
    ↳ NO S command  [because auto=FALSE]
  loadFlagged()
  loadHistory()
  blockOLM := FALSE
  menuPause := TRUE
  → SUBSTATE_DISPLAY_MENU

SUBSTATE_DISPLAY_MENU:
  IF (expert=N AND doorExpertMode=FALSE) OR FORCE_MENUS:
    IF menuPause: doPause()
    checkScreenClear()
    displayScreen(SCREEN_MENU)
  aePuts('\b\n')
  → READ_COMMAND
```
