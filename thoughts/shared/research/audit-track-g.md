---
date: 2026-04-28
topic: track-g-display-screen-mci-audit
tags: [audit, mci, display, screen, miscfuncs]
status: final
---

# Track G Audit — Display, Screen Files, MCI Codes

## Summary

**Scope**: express.e mci module (5258–5850), display module (6539–6850), MiscFuncs.e (formatting functions)
**Our files**: `web/backend/src/handlers/screen.handler.ts` (`parseMciCodes`), `screen-security.util.ts`, `date-time.util.ts`, `format-util.ts`, `byte-format.util.ts`, `bulletin.handler.ts`

**Overall status**: Most MCI codes are present. Key deviations are in data types (BCD vs raw bytes for UB/DB/SU/SD), missing `~P` (password suppression omits `pos` advance in original), wrong values for `~LC`, `~CT` vs `~OT` semantics, `~NS` implementation mismatch, `~w` delay unit, `~x`/`~y` ANSI output, bulletin file discovery path mismatch, and several missing screen types in `displayScreen`.

---

## MCI Code Full Table

| MCI Code | express.e:LINE | Our impl (screen.handler.ts:LINE) | Status |
|----------|----------------|-----------------------------------|--------|
| `~N` | 5292–5295 | 870–871 | OK |
| `~UL` | 5296–5299 | 873 | OK (note: UL = Location, not uploads) |
| `~P` | 5300–5302 | 872 | OK (blanked) |
| `~#` | 5303–5306 | 874 | OK |
| `~TC` | 5307–5310 | 875 | OK |
| `~TT` | 5311–5314 | 876 | OK |
| `~LC` | 5315–5318 | 877 | WRONG FORMAT (see detail below) |
| `~M` | 5319–5322 | 878 | OK |
| `~A` | 5323–5326 | 879 | OK |
| `~S` | 5327–5330 | 880 | OK (slot = user ID) |
| `~CA` | 5331–5334 | 881 | OK |
| `~BR` | 5335–5338 | 882 | WEB_ divergence — hardcoded '57600' (remote baud rate not applicable on web) |
| `~HW` | 5339–5342 | 883 | WEB_ divergence — hardcoded 'Web Browser' (no Amiga computer types list) |
| `~TL` | 5343–5346 | 884 | OK (minutes) |
| `~TR` | 5347–5350 | 885 | OK (minutes remaining) |
| `~UB` | 5351–5354 | 886 | WRONG FORMAT (see detail below) |
| `~DB` | 5355–5358 | 887 | WRONG FORMAT (see detail below) |
| `~SU` | 5359–5362 | 888 | WRONG FORMAT (see detail below) |
| `~SD` | 5363–5366 | 889 | WRONG FORMAT (see detail below) |
| `~FU` | 5367–5370 | 890 | OK |
| `~FD` | 5371–5374 | 891 | OK |
| `~BD` | 5375–5378 | 892 | OK |
| `~LG` / `~ON` | 5379–5382 | 893–894 | WRONG — hardcoded '1', should be `session.nodeId` |
| `~IN` | 5383–5386 | 895 | OK |
| `~RN` | 5387–5390 | 896 | OK |
| `~OD` | 5391–5394 | 939 | WRONG FORMAT (see detail below) |
| `~OT` | 5395–5398 | 938 | OK (time of logon) |
| `~SC` | 5399–5402 | 941–945 | OK |
| `~VE` | 5403–5405 | 931 | WEB_ divergence — 'AmiExpress-Web 2.0' (vs 'AmiExpress 2.0') |
| `~VD` | 5406–5408 | 930 | WEB_ divergence — '2.00' (reasonable approximation) |
| `~ND` | 5409–5412 | 935 | OK |
| `~CF` | 5413–5416 | 901 | WRONG — returns `(session.currentConf || 0) + 1`; express.e uses `relConfNum` which is already the display number |
| `~CN` | 5417–5419 | 902 | OK |
| `~MB` | 5420–5423 | 904–906 | OK |
| `~MN` | 5424–5427 | 908–926 | OK |
| `~AK` | 5428–5430 | 971–982 | OK (WEB_ divergence: web key display, no Amiga F-keys) |
| `~CT` | 5431–5434 | 929 | WRONG SEMANTICS (see detail below) |
| `~DT` | 5435–5438 | 937 | OK |
| `~FF` | 5439–5441 | 957–960 | WRONG FORMAT (see detail below) |
| `~FC` | 5442–5445 | 954–955 | OK |
| `~FL` | 5446–5454 | 962–969 | OK |
| `~SP` | 5455–5461 | 983–990 | OK (pause) |
| `~CR` (bare) | 5462–5468 | 984 | WRONG — treated as `\r\n`, should be wait for single keypress |
| `~f` | 5469–5471 | 1037, 1169–1172 | OK (CLS) |
| `~w` | 5472–5477 | 1044–1049 | WRONG UNIT (see detail below) |
| `~x` | 5478–5486 | 1051–1061 | WRONG ANSI (see detail below) |
| `~y` | 5487–5495 | 1063–1073 | WRONG ANSI (see detail below) |
| `~SS_` | 5496–5504 | 1279–1295 | OK |
| `~SX_` | 5505–5532 | 1297–1341 | OK |
| `~SR_` | 5533–5554 | 1343–1380 | OK |
| `~CC_` | 5555–5563 | 1173–1188, 1420–1428 | OK |
| `~CR_` | 5564–5574 | 1430–1436 | PARTIAL — emits prompt but does not actually wait for keypress |
| `~SM_` | 5575–5581 | 1438–1446 | OK |
| `~q` | 5582–5584 | 1077 | OK |
| `~h` | 5585–5587 | 1081 | OK |
| `~CL` | 5588–5607 | 758–767 | PARTIAL (see detail below) |
| `~CD` | 5608–5620 | 769–773 | WRONG — returns conference name, express.e shows conference list in 2-column format |
| `~ML` | 5621–5638 | 775–803 | OK |
| `~MD` | 5639–5650 | 806–836 | OK |
| `~c0`–`~c7` | 5651–5674 | 995–1002 | OK |
| `~b0`–`~b7` / `~z0`–`~z7` | 5675–5698 | 1005–1020 | OK |
| `~n1`–`~n9` | 5699–5725 | 1024–1032 | OK |
| `~SMO` | 5726–5736 | 1448–1464 | OK |
| `~SMC` | 5737–5739 | 1466–1472 | OK |
| `~NS` | 5740–5742 | 985 | WRONG — treated as empty string, should set `nonStopDisplayFlag` (see detail) |
| `~D<char>` | 5743–5748 | 666–693 | OK |
| `~~` | 5749–5751 | 1619–1621 | OK |

**Codes in express.e NOT in our implementation (missing entirely)**:
- None are completely absent. All code branches are covered.

---

## Deviation Details

### ~LC — Last Call DateTime (express.e:5315–5318)
**Issue**: express.e calls `formatLongDateTime(loggedOnUser.timeLastOn, tempstr)` which produces `"Mon 01-Jan-2026 14:32:00"` format (day-of-week + date + time). Our code at line 877 substitutes `user.lastLoginDate || 'Never'` which is a raw date string from the database, not the `formatLongDateTime` format.
**express.e**: `formatLongDateTime(loggedOnUser.timeLastOn,tempstr)` → produces e.g. `"Mon 01-Jan-2026 14:32:00"`
**Our code**: `user.lastLoginDate || 'Never'` — format depends on how DB stores it, likely ISO or similar
**MiscFuncs.e**: `formatLongDateTime` (line 320–341) uses `FORMAT_DOS` producing `<day3> <date7>\d<year2> <time>` = `"Mon 01-Jan-26 14:32:00"` (actually: daystr[3] + datestr[7] + century + year2 + timestr)
**Fix**: Store lastLoginDate as a timestamp; call our `formatLongDateTime()` on it when rendering `~LC`
**Priority**: P2

---

### ~UB / ~DB — Upload/Download Bytes (express.e:5351–5358)
**Issue**: express.e reads from `loggedOnUserMisc.uploadBytesBCD` / `downloadBytesBCD` (BCD-encoded 8-byte values) and calls `formatBCD()` which formats them as an integer. Our code at lines 886–887 uses `uploadBytes.toString()` and `downloadBytes.toString()` directly, which is the raw byte count. The output format depends on how `formatBCD` serializes BCD — it outputs a plain decimal integer. Our raw integer output is likely numerically correct if the DB stores actual bytes, but the legacy format from `formatBCD` may differ.
**express.e**: BCD format → `formatBCD(...)` → decimal string (e.g., `"1048576"`)
**Our code**: `uploadBytes.toString()` — direct integer if DB stores bytes
**Fix**: Verify `uploadBytes` in DB matches bytes (not KB); format is correct if numeric values agree. Low priority if data is stored as raw bytes.
**Priority**: P3

---

### ~SU / ~SD — Upload/Download Size (express.e:5359–5366)
**Issue**: express.e calls `calcSizeText(loggedOnUserMisc.uploadBytesBCD, tempstr)` which produces lowercase suffixes: `"1024kb"`, `"1mb"`, `"1gb"` etc. (express.e:3336–3370 appends `"b"`, `"kb"`, `"mb"`, `"gb"`, `"tb"`, `"pb"`). Our code at lines 888–889 produces `"1024K"` format: `(uploadBytes / 1024).toFixed(0) + 'K'`.
**express.e**: `calcSizeText` → `"1kb"`, `"1mb"` (always lowercase, uses BCD arithmetic division)
**Our code**: `(uploadBytes / 1024).toFixed(0) + 'K'` — always in KB, wrong for MB/GB values, uppercase K, always divides by 1024
**Fix**: Implement a `calcSizeText` equivalent: divide by 1024 until < 1024, then append `b`/`kb`/`mb`/`gb` lowercase suffix
**Priority**: P2

---

### ~LG / ~ON — Node Number (express.e:5379–5382)
**Issue**: express.e outputs `node` (the actual node number). Our code at lines 893–894 hardcodes `'1'` instead of `session.nodeId`.
**express.e**: `StringF(tempstr,'\d',node)`
**Our code**: `'1'` (hardcoded)
**Fix**: Replace `'1'` with `(session.nodeId || 1).toString()`
**Priority**: P2

---

### ~OD — Logon Date (express.e:5391–5394)
**Issue**: express.e calls `formatLongDate(logonTime, tempstr)` which formats the **logon time** as `"01-Jan-2026"`. Our code at line 939 outputs today's date: `` `${day}-${month}-${year}` `` (computed from `now = getSystemTime()`).
**express.e**: `formatLongDate(logonTime,tempstr)` — the time the user logged on
**Our code**: Current date (today's date, not logon date)
**Fix**: Store logon timestamp in session; use `formatLongDate(session.logonTime)` for `~OD`
**Priority**: P2

---

### ~CT — Current Time (express.e:5431–5434)
**Issue**: express.e calls `formatLongTime(logonTime, tempstr)` — this gives the **logon time** (time the user logged on), not current time. Our code at line 929 uses `timeStr` which is the current system time.
**express.e**: `formatLongTime(logonTime,tempstr)` — the logon timestamp's time component
**Our code**: Current time (`timeStr = hours:minutes:seconds` from `now`)
**Fix**: Store logon timestamp in session; use `formatLongTime(session.logonTime)` for `~CT`
**Priority**: P2

Note: `~DT` correctly uses current system time. The confusion is that `~CT` means "Connected Time" (logon time), not "Current Time".

---

### ~FF — Flagged Files Display (express.e:5439–5441)
**Issue**: express.e calls `showFlaggedFiles(maxLen)` which has a specific format. Our code at line 957–960 joins files with spaces. Need to verify `showFlaggedFiles` format matches.
**express.e**: `showFlaggedFiles(maxLen)` — unknown exact format without reading that function
**Our code**: `sessionFlaggedFiles.map(f => f.fileName).join(' ')` — space-separated filenames
**Fix**: Read `showFlaggedFiles` implementation to verify format; likely OK for basic usage
**Priority**: P3

---

### `~CR` (bare, no `_`) — Single Keypress Wait (express.e:5462–5468)
**Issue**: express.e calls `readChar(INPUT_TIMEOUT)` — waits for single keypress. Our code at line 984 replaces `~CR|` with `'\r\n'` (CRLF), which outputs a newline instead of waiting for input.
**express.e**: `readChar(INPUT_TIMEOUT)` — waits for any key, result discarded
**Our code**: `'\r\n'` — emits a newline, does NOT wait
**Fix**: Implement as a pause trigger similar to `~SP` behavior; the web version needs to emit a pause signal and wait for client input. Currently `~CR_` (with prompt) has similar issue — it just emits prompt text and sets `hasPause = true` but the actual keypress wait is not enforced.
**Priority**: P2

---

### `~w` — Delay (express.e:5472–5477)
**Issue**: express.e calls `Delay(maxLen)` where `maxLen` is the numeric argument and `Delay()` is in Amiga ticks (1/50s). So `~w3|` = delay 3 ticks = 60ms. Our code at lines 1044–1049 removes the `~w` code entirely.
**express.e**: `IF maxLen<0 THEN maxLen:=1; Delay(maxLen)` — minimum 1 tick, arg in ticks
**Our code**: Removed entirely (just strips the code)
**Fix**: For the web version, this is not straightforwardly implementable as a server-side delay in a regex replace pass. Could be treated as a `slowmo` hint or ignored with a `// WEB_:` comment. The current "remove" behavior is acceptable if tagged.
**Priority**: P3

---

### `~x` — X cursor position (express.e:5478–5486)
**Issue**: express.e emits `[;<numval>H` (ESC [ ; N H) = move to row=current, column=N. Our code at line 1055–1060 emits `\x1b[<col>G` (ESC [ N G = move to column N, column-only). The ANSI codes are functionally equivalent for column positioning, but express.e format is `ESC[;<col>H` (row=0 means current row in VT100).
**express.e**: `StringF(tempstr,'[;\dH',maxLen)` → ESC [ ; N H
**Our code**: `\x1b[${colNum}G` → ESC [ N G (move to column)
**Fix**: Match express.e exactly: emit `\x1b[;${colNum}H` instead of `\x1b[${colNum}G`. Both move to column but ESC[;NH is what express.e sends.
**Priority**: P3

---

### `~y` — Y cursor position (express.e:5487–5495)
**Issue**: express.e emits `[\d;H` (ESC [ N ; H) = move to row N, column=current. Our code at line 1067–1072 emits `\x1b[${rowNum};H` which is `ESC [ N ; H` — this is actually correct.
**express.e**: `StringF(tempstr,'[\d;H',maxLen)` → ESC [ N ; H
**Our code**: `\x1b[${rowNum};H` → ESC [ N ; H
**Status**: OK (false alarm on initial review — our output matches)
**Priority**: N/A

---

### `~CR_` — Prompted Keypress (express.e:5564–5574)
**Issue**: express.e calls `aePuts(cmd)` then `readChar(INPUT_TIMEOUT)` — displays prompt AND waits for keypress. Our code at line 1433–1436 emits the prompt text and sets `hasPause = true`, but the returned `hasPause = true` is a screen-level flag and may not result in a true per-character read.
**express.e**: Display prompt text, then `readChar()` (blocking single char read)
**Our code**: Display prompt text, set `hasPause = true` — functional but not character-level
**Fix**: Implement as a proper keypress pause rather than a full page pause. The prompt text is correct; keypress handling needs confirmation.
**Priority**: P2

---

### `~NS` — Non-Stop Display Flag (express.e:5740–5742)
**Issue**: express.e sets `nonStopDisplayFlag:=TRUE` which suppresses subsequent pause prompts for the rest of the screen display. Our code at line 985 treats `~NS|` as an empty replacement but line 1390–1395 has `~NSF` (not `~NS`) setting `session.nonStopText = true`. The express.e code uses `~NS` (2 chars), not `~NSF` (3 chars).
**express.e**: `StrCmp(cmd,'NS')` → sets `nonStopDisplayFlag:=TRUE`
**Our code**: `~NS|` → `''` (empty, no effect); `~NSF` is a separate non-standard extension
**Fix**: When `~NS` is encountered, set `session.nonStopDisplayFlag = true` which suppresses subsequent pause prompts in the display loop
**Priority**: P2

---

### `~CL` — Conference List (express.e:5588–5607)
**Issue**: express.e iterates conferences, checking `checkConfAccess(nval)` OR `TOGGLES_CONFRELATIVE=FALSE`, and numbers them sequentially (only counting accessible ones). Our code at lines 758–767 iterates all conferences without access checking and uses a simple loop index.
**express.e**: Only lists conferences user can access (when `TOGGLES_CONFRELATIVE=TRUE`); sequential numbering of accessible ones only
**Our code**: Lists all conferences without access check
**Fix**: Filter by conference access before listing; renumber sequentially
**Priority**: P2

---

### `~CD` — Conference Description List (express.e:5608–5620)
**Issue**: express.e renders a 2-column conference list: `[34m[[0m<3-digit-num>[34m] [0m<name padded to 30><CRLF every 2>`. Our code at line 769–773 returns the single conference name of the current conference (`conferences[session.currentConf || 0]?.name`).
**express.e**: Lists ALL conferences in 2-column format, identical loop structure to `~CL`
**Our code**: Returns current conference name only
**Fix**: Implement identical to `~CL` but in 2-column format matching express.e:5608–5620 exactly
**Priority**: P2

---

## displayScreen / displayFile Deviations

### Missing Screen Types (express.e:6539–6654 vs screen.handler.ts SCREEN_DIR_MAP)

express.e `displayScreen()` handles these CASE values. Our `SCREEN_DIR_MAP` is missing:

| Screen Type | express.e:LINE | Our SCREEN_DIR_MAP | Status |
|-------------|----------------|--------------------|--------|
| `SCREEN_AWAIT` | 6545–6547 | 'AWAITSCREEN' NODE | OK (different name) |
| `SCREEN_BULL` | 6548–6550 | 'BULL' GLOBAL | OK |
| `SCREEN_NODE_BULL` | 6551–6553 | 'NODE_BULL' NODE | OK |
| `SCREEN_LOGOFF` | 6554–6556 | 'LOGOFF' NODE | OK |
| `SCREEN_CONF_BULL` | 6557–6559 | 'CONF_BULL' CONF | OK |
| `SCREEN_MENU` | 6560–6575 | 'MENU' CONF | OK |
| `SCREEN_LOGON` | 6576–6578 | 'LOGON' NODE | OK |
| `SCREEN_BBSTITLE` | 6579–6581 | 'BBSTITLE' NODE | OK |
| `SCREEN_JOIN` | 6582–6584 | 'JOIN' NODE | OK |
| `SCREEN_JOINED` | 6585–6587 | 'JOINED' NODE | OK |
| `SCREEN_JOINCONF` | 6588–6590 | 'JOINCONF' NODE | OK |
| `SCREEN_CONF_JOINMSGBASE` | 6591–6593 | 'CONF_JOINMSGBASE' CONF | OK |
| `SCREEN_JOINMSGBASE` | 6594–6596 | 'JOINMSGBASE' NODE | OK |
| `SCREEN_DOWNLOAD` | 6597–6599 | 'DOWNLOADMSG' CONF | OK |
| `SCREEN_FILEHELP` | 6600–6602 | 'FILEHELP' CONF | OK |
| `SCREEN_UPLOAD` | 6603–6605 | 'UPLOADMSG' CONF | OK |
| `SCREEN_NOUPLOADS` | 6606–6608 | 'NOUPLOADS' CONF | OK |
| `SCREEN_NEWUSERPW` | 6609–6611 | 'NEWUSERPW' NODE | OK |
| `SCREEN_NONEWUSERS` | 6612–6614 | 'NONEWUSERS' NODE | OK |
| `SCREEN_NONEWATBAUD` | 6615–6617 | MISSING | MISSING |
| `SCREEN_NOT_TIME` | 6618–6620 | MISSING | MISSING |
| `SCREEN_NOCALLERSATBAUD` | 6621–6623 | MISSING | MISSING |
| `SCREEN_GUESTLOGON` | 6624–6626 | 'GUESTLOGON' NODE | OK |
| `SCREEN_LOCKOUT0` | 6627–6629 | 'LOCKOUT0' NODE | OK |
| `SCREEN_LOCKOUT1` | 6630–6632 | 'LOCKOUT1' NODE | OK |
| `SCREEN_PRIVATE` | 6633–6635 | 'PRIVATE' NODE | OK |
| `SCREEN_ONENODE` | 6636–6638 | 'ONENODE' GLOBAL | OK |
| `SCREEN_LOGON24` | 6639–6641 | 'LOGON24' GLOBAL | OK |
| `SCREEN_LANGUAGES` | 6642–6644 | MISSING from SCREEN_DIR_MAP | MISSING |
| `SCREEN_INTERNETNAMES` | 6645–6647 | MISSING from SCREEN_DIR_MAP | MISSING |
| `SCREEN_REALNAMES` | 6648–6650 | MISSING from SCREEN_DIR_MAP | MISSING |
| `SCREEN_MAILSCAN` | 6651–6653 | MISSING from SCREEN_DIR_MAP | MISSING |

**Missing screens**: `SCREEN_NONEWATBAUD`, `SCREEN_NOT_TIME`, `SCREEN_NOCALLERSATBAUD`, `SCREEN_LANGUAGES`, `SCREEN_INTERNETNAMES`, `SCREEN_REALNAMES`, `SCREEN_MAILSCAN`

Note: `SCREEN_NONEWATBAUD` is defined in `index.ts:105` as `"NoNewAtBaud"` and used there but not added to `SCREEN_DIR_MAP`. The others appear to be called from their respective handlers (messaging.handler.ts, message-scan.handler.ts) but not via the `displayScreen()` path with `SCREEN_DIR_MAP`.

**express.e behavior for baud-parameterized screens** (6615–6623):
```
StringF(screencheck,'\s\s\d',nodeScreenDir,'NONEWAT',onlineBaud)
StringF(screencheck,'\s\s\d',nodeScreenDir,'NOTTIME',onlineBaud)
StringF(screencheck,'\s\s\d',nodeScreenDir,'NOCALLERSAT',onlineBaud)
```
These append the baud rate as a number to the screen name (e.g. `NONEWAT14400`). This baud-parameterized lookup is not present in our `displayScreen`.

**Fix**: Add all 7 missing entries to `SCREEN_DIR_MAP`. For baud-parameterized screens, the screen name passed to `displayScreen` should include the baud rate suffix.
**Priority**: P2

---

### displayFile — MCI Enable Logic (express.e:6800–6806)

**Issue**: express.e:6800–6806 checks if the **first line** of the file starts with `~` to enable MCI processing. If line[0] is not `~`, MCI is disabled for the entire file. Our `loadScreenFile` and `parseMciCodes` always process MCI on all screen files.

**express.e**:
```
IF (firstline)
  IF len>0
    IF linedata[0]<>"~" THEN allowMCI:=FALSE
  ELSE
    allowMCI:=FALSE
  ENDIF
ENDIF
```
**Our code**: Always calls `parseMciCodes()` on all screen content, regardless of first character.
**Fix**: Before calling `parseMciCodes`, check if the first non-empty line starts with `~`. If not, skip MCI processing and display raw content.
**Priority**: P2

---

### displayFile — 79-column Wrap for Non-MCI Files (express.e:6814–6830)

**Issue**: For non-MCI files, express.e wraps lines longer than 79 chars and calls `checkForPause()` at each wrap. Our implementation doesn't wrap long lines in non-MCI files.
**express.e**: Lines >= 80 chars are split at 79 cols, `\b\n` inserted, `checkForPause()` called
**Our code**: Sends full line without wrapping
**Fix**: Add 79-column line wrap for non-MCI content
**Priority**: P3

---

## MiscFuncs.e — Formatting Function Comparison

### formatSpaceValue (MiscFuncs.e:234–249)

**express.e behavior**: Takes `spaceInMB` (integer MB) and `spacelo` (fractional bits).
- `< 10240 MB`: shows `"N.N MB"` (one decimal)
- `< 1048576 MB` (1 TB): shows `"N.N GB"` 
- `>= 1 TB`: shows `"N.N TB"`

**Our format-util.ts:43–57** (`formatSpaceValue`): Takes bytes, divides automatically through B→KB→MB→GB→TB. Produces `"N.NN MB"` (2 decimals). Different input type (bytes vs MB) and different decimal precision.

**Deviation**: Our function takes raw bytes; express.e takes MB + fractional bits. Different inputs entirely. Our function is used for general byte formatting, not the same purpose.
**Priority**: P3

---

### formatLongDate (MiscFuncs.e:278–297)

**express.e**: Uses Amiga `DateToStr()` with `FORMAT_USA` → `"MM-DD-YY"` format (US date format). Output is `"MM-DD-YY"` not `"DD-MMM-YYYY"`.

**Our date-time.util.ts:39–48** (`formatLongDate`): Produces `"DD-Mon-YYYY"` (e.g. `"07-Jan-2026"`).

**Deviation**: express.e `FORMAT_USA` produces `"01-07-26"` (month-day-year, 2-digit year). Our implementation produces `"07-Jan-2026"` (day-month name-year, 4-digit year). These are different formats.

However, `formatLongDateTime` in MiscFuncs.e:320–341 uses `FORMAT_DOS` and constructs: `daystr[3] + " " + datestr[7]` (first 7 chars of DOS date) + `year` + rest of date + time. This is more like `"Mon 07-Jan-26 14:32:00"`.

**Note**: The discrepancy matters for `~OD`, `~DT`, `~LC` display in screen files. Real Amiga users will see date formatted differently.
**Priority**: P2

---

### formatLongDateTime (MiscFuncs.e:320–341)

**express.e**: Uses `FORMAT_DOS` and constructs:
```
StringF(outDateStr,'\s[3] \s[7]\d\s \s',daystr,datestr,IF dt.stamp.days>=8035 THEN 20 ELSE 19,datestr+7,timestr)
```
This produces: `"Mon 07-Jan-2026 14:32:00"` (day3 + date part-1 + century + year2 + time).
The actual output format: `daystr` first 3 chars, space, `datestr` first 7 chars, century (20 or 19), 2-digit year, space, time.

**Our date-time.util.ts:78–80** (`formatLongDateTime`): Calls `formatLongDate(date) + ' ' + formatLongTime(date)` → `"07-Jan-2026 14:32:15"` (no day-of-week).

**Deviation**: Missing day-of-week prefix. Format is close but missing `"Mon "` prefix and uses different date style.
**Priority**: P2

---

### formatCDateTime (MiscFuncs.e:343–364)

**express.e**: Uses `FORMAT_DOS` and constructs:
```
StringF(outDateStr,'\s[3] \s[3] \s[2] \s \d\s',daystr,datestr+3,datestr,timestr,IF ... THEN 20 ELSE 19,datestr+7)
```
Output: `"Mon Jan 07 14:32:00 2026"` (Unix `ctime`-style format).

**Our date-time.util.ts:92–94** (`formatCDateTime`): Returns `date.toISOString()` → `"2026-01-07T14:32:00.000Z"` (ISO 8601).

**Deviation**: Completely different format. Express.e produces Unix ctime-style; we produce ISO 8601.
**Priority**: P3 (rarely used in screen display)

---

## Bulletin Handler Deviations

### Bulletin File Path (express.e:24616–24618, 24648)

**express.e**:
- BullHelp: `confScreenDir + 'Bulletins/BullHelp.txt'` (checks with `.txt` first)
- Then: `confScreenDir + 'Bulletins/BullHelp'` → `findSecurityScreen()` → with security variants
- Bulletins: `confScreenDir + 'Bulletins/Bull' + stat` → `findSecurityScreen()`

**Our screen-security.util.ts:179–197** (`findBulletinFile`): Builds path as `path.join(baseDir, conferenceDir, 'Screens', 'Bulletins', 'Bull' + N)`. Note the `Screens/` subdirectory is included. Express.e uses `confScreenDir` which already includes the `Screens/` subdir, so these should be equivalent. However, the actual repository layout (`Conf1/Screens/Bulletins/Bull1.txt`) needs to match.

**Our bulletin.handler.ts:24617**: `confScreenDir + 'Bulletins/BullHelp.txt'` is checked with a raw `Open()` call first (before `findSecurityScreen`). Our code uses `findBullHelpFile` which goes directly to `findSecurityScreen` without the raw `.txt` check first. The raw check matters because express.e uses it to detect if bulletins exist at all (opening `BullHelp.txt` directly, not a security variant).

**Deviation**: Our BullHelp existence check uses `findSecurityScreen` (security variants); express.e checks for literal `BullHelp.txt` file existence first before allowing bulletin access.
**Fix**: Check for `BullHelp.txt` existence (no security suffix, literal path) before allowing bulletin command access.
**Priority**: P2

---

### Bulletin Input Loop (express.e:24643–24655)

**express.e**: After displaying a bulletin, `JUMP inputAgain` — loops back to prompt for next bulletin number.
**Our code**: After displaying a bulletin (line 232), sets `session.subState = LoggedOnSubState.DISPLAY_MENU` — returns to menu instead of prompting again.
Our `handleBulletinInput` at line 301–308 does re-prompt after displaying, which partially corrects this. But the first call from `handleBulletinCommand` (line 228–233) does not loop back.
**Fix**: After displaying a bulletin from `handleBulletinCommand`, prompt for next bulletin instead of returning to menu.
**Priority**: P2

---

## findSecurityScreen Deviations

### DEF_SCREENS reads from tooltype per-node (express.e:6251)

**express.e**: `IF checkToolTypeExists(TOOLTYPE_NODE,node,'DEF_SCREENS')` — reads from the **node-specific** tooltype, not global config.
**Our screen-security.util.ts:75–81**: `defScreens` is passed as a parameter. Whether callers pass the correct value (node-specific `DEF_SCREENS` tooltype) is not verified here.
**Priority**: P3

---

## Summary of P1/P2/P3 Items

### P1 (Blocking / Data Corruption)
None found.

### P2 (Wrong Behavior, Noticeable)
1. `~LC` — wrong format (missing `formatLongDateTime` with day-of-week)
2. `~SU` / `~SD` — wrong unit format (`1K` instead of `1kb`; doesn't auto-scale)
3. `~LG` / `~ON` — hardcoded `'1'` instead of actual node number
4. `~OD` — current date instead of logon date
5. `~CT` — current time instead of logon time
6. `~CR` (bare) — outputs `\r\n` instead of waiting for keypress
7. `~CR_` — prompt displayed but keypress not actually awaited
8. `~NS` — no effect (should set nonStopDisplayFlag)
9. `~CL` — no conference access filtering
10. `~CD` — returns single name instead of 2-column list
11. Missing screen types: `SCREEN_NONEWATBAUD`, `SCREEN_NOT_TIME`, `SCREEN_NOCALLERSATBAUD`, `SCREEN_LANGUAGES`, `SCREEN_INTERNETNAMES`, `SCREEN_REALNAMES`, `SCREEN_MAILSCAN`
12. `displayFile` — MCI should be disabled when first line doesn't start with `~`
13. `formatLongDateTime` — missing day-of-week prefix
14. `formatLongDate` — uses DD-Mon-YYYY; express.e FORMAT_USA produces MM-DD-YY
15. Bulletin `BullHelp.txt` existence check — should be literal path, not security variant
16. Bulletin display loop — should re-prompt after displaying, not return to menu

### P3 (Minor / Cosmetic)
1. `~UB` / `~DB` — potential BCD vs raw bytes mismatch (likely correct in practice)
2. `~FF` — format needs `showFlaggedFiles` verification
3. `~w` — removed vs Amiga tick delay (WEB_ divergence, acceptable with comment)
4. `~x` cursor — uses ESC[NG instead of ESC[;NH (functionally equivalent)
5. `displayFile` — no 79-column wrap for non-MCI files
6. `formatSpaceValue` — different input type (bytes vs MB)
7. `formatCDateTime` — ISO 8601 vs ctime-style
8. DEF_SCREENS — not verified as node-specific tooltype lookup
