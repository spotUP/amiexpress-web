---
date: 2026-04-28
topic: file-system-track-audit
tags: [audit, files, download, upload, listing, zippy, maintenance]
status: final
---

# Track E — File System Audit

## Summary

- **express.e lines covered**: 12000–20320, 24141–24250, 26123–26213, 27529–27640
- **zmodem.e**: lines 1–100 (protocol constants / init)
- **TypeScript files audited**: 7 handlers
- **Total deviations**: 19
- **OK / minor / cosmetic**: flagFile logic, FM delete/move physical file handling, zmodem constants (N/A for web)

---

## DEVIATION CATALOGUE

---

## D1 — downloadPrompt (express.e:19784–19789)
**File**: `web/backend/src/handlers/file/download.handler.ts:216–231`
**Issue**: `showFilespecPrompt` always shows "Infinite bytes" regardless of `ratioType`. The original has three distinct formats: ratioType=0 shows `bytes`, ratioType=2 shows `files`, ratioType=1 shows both.
**express.e**:
```
19786: IF(ratioType=0) THEN StringF(str,'\b\n\d mins, \d bytes, Filespec(\d): ',mins,bytes,filespec)
19787: IF(ratioType=2) THEN StringF(str,'\b\n\d mins, \d files, Filespec(\d): ',mins,files,filespec)
19788: IF(ratioType=1) THEN StringF(str,'\b\n\d mins, \d bytes, \d files, Filespec(\d): ',mins,bytes,files,filespec)
```
**Our code**: Always emits `\r\n${minsLeft} mins, Infinite bytes, Filespec(${filespecNum}): ` — never shows files count, never uses ratioType=2 format.
**Fix**: Read `user.secBoard` (ratioType) and select the correct format. Pass actual `bytesADL` and `filesADL` values calculated from the ratio check.
**Priority**: P2

---

## D2 — Aborting prompt exact string (express.e:20141)
**File**: `web/backend/src/handlers/file/download.handler.ts:265`
**Issue**: express.e outputs `'Aborting...\b\n\b\n'` (two newlines after). Our code emits `'\r\nAborting...\r\n\r\n'` — the leading `\r\n` is extra. express.e has already printed the Q/A character via lineInput echo; our code prepends an extra newline.
**express.e**:
```
20141: aePuts('Aborting...\b\n\b\n')
```
**Our code**: `socket.emit('ansi-output', '\r\nAborting...\r\n\r\n');`
**Fix**: Remove the leading `\r\n` — the character input already moved to a new line (or the lineInput echo handled it).
**Priority**: P3

---

## D3 — LAST CHANCE exact spacing (express.e:20210)
**File**: `web/backend/src/handlers/file/download.handler.ts:360`
**Issue**: String matches. Confirmed OK. `'\r\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? '` — this is correct. Noted as OK.
**Priority**: OK

---

## D4 — Post-transfer stats line format (express.e:20266)
**File**: `web/backend/src/handlers/file/download.handler.ts:480–481`
**Issue**: express.e format is `' \d files, \sk bytes, \d minutes \d seconds \d cps, \d% efficiency at \d'` — note leading space, `\sk` (k after BCD-formatted number), and `efficiency at \d` where `\d` is `onlineBaud`. Our code outputs `${fileList.length} files, ${totalKb}k bytes, ...` but uses a leading space and drops the `at ${onlineBaud}` entirely — `onlineBaud` is the final field in the original.
**express.e**:
```
20266: StringF(string,' \d files, \sk bytes, \d minutes \d seconds \d cps, \d% efficiency at \d',dlFileCount,tempStr,Div(dlTTTM,60),Mod(dlTTTM,60),pcps,peff,onlineBaud)
```
**Our code**: `\` ${fileList.length} files, ${totalKb}k bytes, ${mins} minutes ${secs} seconds ${cps} cps, 100% efficiency at ${onlineBaud}\r\n`
Sub-issue: we hardcode `100%` efficiency; express.e computes `tTEFF = calcEfficiency(tTCPS, onlineBaud)`. This makes the efficiency always incorrect.
**Fix**: Compute `tTEFF` from actual CPS vs baud. Pass `onlineBaud` from session correctly. Separate the two calls (line 20267 `aePuts(string)` and line 20268 `aePuts('\b\n\b\n')` which becomes two blank lines — our code only emits `\r\n` after.
**Priority**: P2

---

## D5 — Post-transfer second blank line (express.e:20268)
**File**: `web/backend/src/handlers/file/download.handler.ts:483`
**Issue**: express.e emits `aePuts('\b\n\b\n')` — two CRLF after the stats line. Our code emits only `'\r\n'` (one CRLF).
**express.e**: `20268: aePuts('\b\n\b\n')`
**Our code**: `socket.emit('ansi-output', '\r\n');`
**Fix**: Change to `'\r\n\r\n'`.
**Priority**: P3

---

## D6 — pGoodbye not called correctly after download (express.e:20317)
**File**: `web/backend/src/handlers/file/download.handler.ts:494–498`
**Issue**: express.e calls `pGoodbye()` which is a 10-second countdown "Last chance! Auto LOGOFF in N SECS" loop (express.e:13751–13772). Our code calls `handleGoodbyeCommand(socket, session, 'Y')` which immediately logs off — the countdown is skipped.
**express.e**:
```
20317: IF((mystat=71) OR (mystat=103)) THEN RETURN(pGoodbye())
13751: FOR i:=10 TO 1 STEP -1
13755:   aePuts('[A')
13756:   aePuts(tempStr)
13757:   stat:=readChar(1)
```
**Our code**: Calls `handleGoodbyeCommand(socket, session, 'Y')` — no countdown.
**Fix**: Implement or call a `pGoodbye()` equivalent that shows the countdown before logoff.
**Priority**: P2

---

## D7 — displayULStats: bytes display uses integer division not BCD (express.e:12680–12715)
**File**: `web/backend/src/handlers/file/download.handler.ts:509–527`
**Issue**: express.e stores download/upload bytes as 8-byte BCD arrays in `userMisc.downloadBytesBCD` and `uploadBytesBCD`, then calls `formatBCD()` to display them. It also calls `divBCD1024()` when `CREDITBYKB` toggle is off to convert bytes → KB before display. Our code does `Math.floor((user.bytesDownload || 0) / 1024)` which is integer division on a regular JavaScript number — correct for small values but diverges at large values since BCD format handles arbitrary precision.
**express.e**:
```
12685-12689: CopyMem(um.downloadBytesBCD,totBCD,8)
              IF sopt.toggles[TOGGLES_CREDITBYKB]=FALSE THEN divBCD1024(totBCD)
              formatBCD(totBCD,ktot)
12691: StringF(string,'Number of Downloads      : \d (\sk total)\b\n',u.downloads AND $FFFF,ktot)
```
**Our code**: `const dlKb = Math.floor((user.bytesDownload || 0) / 1024);`
**Fix**: Use `formatBCDUtil` from `bcd-math.util` on the user's BCD field if available; fall back to integer division only when BCD not stored. Label discrepancy: when CREDITBYKB is on, the label is `\sk total` (already in KB), when off it's also `\sk total` after divBCD1024 — our label is always `k total` which is correct.
**Priority**: P3

---

## D8 — Upload header string wrong when ramPen configured (express.e:19003–19010)
**File**: `web/backend/src/handlers/file/file.handler.ts:919–920`
**Issue**: express.e:19005 shows `'\s UPLOADING to \s..\b\n'` (with "to <ramPen>") when `sopt.ramPen` is non-empty, but `'\s UPLOADING....\b\n'` when using the normal playpen. Our code always formats as `'${protocolTitle} UPLOADING....\r\n'` — the "to <path>" variant is never shown.
**express.e**:
```
19005: StringF(buff,'\s UPLOADING to \s..\b\n',xprTitle.item(loggedOnUser.xferProtocol),sopt.ramPen)
19007: StringF(buff,'\s UPLOADING....\b\n',xprTitle.item(loggedOnUser.xferProtocol))
```
**Our code**: Always `emitText(socket, \`\r\n${protocolTitle} UPLOADING....\r\n\`);`
**Fix**: Check if a custom upload path (ramPen equivalent) is configured and if so use the "to <path>" format. For the web this would be the configured ULPATH value.
**Priority**: P3

---

## D9 — Upload disk space: two separate values required (express.e:19012–19014)
**File**: `web/backend/src/handlers/file/file.handler.ts:926–928`
**Issue**: express.e shows TWO disk space values — total free across all configured drives (`tFShi/tFSlo`) AND free at the upload path (`fSUploadingHi/fSUploadingLo`). The string is `'\s available for uploading.  \s at one time.\b\n'`. Our code calls `formatSpaceValue(ulPath)` once and uses the same value for both fields.
**express.e**:
```
19012: formatSpaceValue(tFShi,tFSlo,tempstr)      <- total free (all DRIVE.N entries)
19013: formatSpaceValue(fSUploadingHi,fSUploadingLo,tempstr2) <- free at upload path
19014: StringF(string,'\s available for uploading.  \s at one time.\b\n',tempstr,tempstr2)
```
**Our code**: `const spaceStr = formatSpaceValue(ulPath); emitText(socket, \`${spaceStr} available for uploading.  ${spaceStr} at one time.\r\n\`);`
Both values are the same number. For the web with a single filesystem these will always be identical but for multi-drive setups this would be wrong.
**Fix**: Compute total-free from all configured DRIVE.N paths separately from the upload-path free space. (Low impact for single-drive web BBS.)
**Priority**: P3

---

## D10 — uploadDesc: "Filename lengths above 12" warning placement wrong (express.e:17679–17683)
**File**: `web/backend/src/handlers/file/file.handler.ts:931`
**Issue**: In `uploadDesc()`, the check `IF StrLen(str)>12` (express.e:17679) appears inside the per-filename loop AFTER the user has already entered the filename. Our `displayUploadInterface` shows the warning `'Filename lengths above 12 are not allowed.\r\n\r\n'` as a header before any input — this is actually correct per express.e:19016 which is part of `uploadaFile` header output, not `uploadDesc`. There is a second check inside `uploadDesc` at line 17679 that rejects filenames > 12 chars and loops back. This per-entry rejection check is missing from our upload loop.
**express.e**:
```
17679: IF StrLen(str)>12
17680:   aePuts('Files longer than 12 characters are not allowed.\b\n')
17681:   count--
17682:   JUMP updesccont
```
**Our code**: No per-filename length check inside `handleFilenameInput` — a filename > 12 chars would be accepted.
**Fix**: In upload filename input handler, check `str.length > 12` and show `'Files longer than 12 characters are not allowed.\r\n'` then loop back.
**Priority**: P1

---

## D11 — uploadDesc: exact prompt string for "Okay" prompt wrong (express.e:17769)
**File**: `web/backend/src/handlers/file/file.handler.ts` (via upload flow in file.handler or upload handler)
**Issue**: express.e:17769 shows `'Okay:   (Enter) to Start, (G)oodbye after transfer, (A)bort? '` (seven spaces before "(Enter)"). The bgFileCheck variant (line 17765-17767) shows `'(B)ackground filecheck: YES/NO'` before this. Our upload flow doesn't show this prompt at all — it triggers a WebSocket `show-file-upload` event instead of waiting for Enter/G/A.
**express.e**:
```
17769: aePuts('\bOkay:   (Enter) to Start, (G)oodbye after transfer, (A)bort? ')
```
**Our code**: `socket.emit('show-file-upload', {...})` — bypasses entire Okay/G/A prompt.
**Fix**: For BBS terminal clients (non-web), show the prompt and handle G=goodbye. For web mode this is a `WEB_:` divergence that needs to be tagged. Currently it is not tagged.
**Priority**: P2

---

## D12 — uploadDesc: "Batch UpLoading....." exact string (express.e:17657)
**File**: `web/backend/src/handlers/file/file.handler.ts:935`
**Issue**: express.e outputs `'Batch UpLoading.....\b\n'` — five dots. Our code outputs `'Batch UpLoading.....\r\n'` — five dots. **This is correct.** OK.
**Priority**: OK

---

## D13 — uploadDesc: "Unlimited files." exact string (express.e:17658)
**File**: `web/backend/src/handlers/file/file.handler.ts:937`
**Issue**: express.e outputs `'\b\nUnlimited files.  Blank Line to start transfer.\b\n'` — two spaces between "files." and "Blank". Our code outputs `'\r\nUnlimited files.  Blank Line to start transfer.\r\n'` — two spaces. **Correct.** OK.
**Priority**: OK

---

## D14 — uploadDesc: A=Abort returns RESULT_FAILURE not special code (express.e:17668–17670)
**File**: `web/backend/src/handlers/file/file.handler.ts` (upload input handling)
**Issue**: In `uploadDesc`, pressing A alone returns `RESULT_FAILURE` (express.e:17670). The caller (`uploadaFile`) checks `IF(gstat<0) THEN cleanItUp(); RETURN gstat`. Our upload handler does not implement the A=Abort path at all; it goes straight to the file picker. This is partially a `WEB_:` deviation but is not tagged.
**express.e**:
```
17668: IF(((str[0]="A") OR (str[0]="a")) AND (StrLen(str)=1))
17669:   aePuts('\b\n')
17670:   RETURN RESULT_FAILURE
```
**Our code**: No A-abort handling in `UPLOAD_FILENAME_INPUT` state.
**Fix**: Add A=Abort check in the upload filename input handler; tag as WEB_: if behavior must differ.
**Priority**: P2

---

## D15 — uploadaFile post-transfer stats: "File Uploading Complete..." (express.e:19053)
**File**: `web/backend/src/handlers/file/file.handler.ts` (post-upload)
**Issue**: express.e:19053 shows `'File Uploading Complete...\b\n'` (three dots). Then line 19072 shows the stats line `' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.'`. Then line 19127 shows `'Time increased by \d mins.\b\n\b\n'`. None of these post-transfer outputs appear in our upload handler; the upload flow ends by triggering `show-file-upload` and the success is handled via the `/api/upload` endpoint without these BBS-facing strings.
**express.e**:
```
19053: aePuts('\b\n\b\nFile Uploading Complete...\b\n')
19072: StringF(string,' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.',...)
19073: aePuts(string)
19127: StringF(str,'Time increased by \d mins.\b\n\b\n',Div(peff,60))
```
**Our code**: None of these strings are emitted. The upload success path goes through HTTP, not BBS output.
**Fix**: After upload completes, emit these strings to the socket in order. Tag the time-bonus logic as WEB_: if not implemented.
**Priority**: P2

---

## D16 — file-listing.handler.ts: "Scanning directory X" format wrong (express.e:27667–27692)
**File**: `web/backend/src/handlers/file/file-listing.handler.ts:198–203`
**Issue**: express.e outputs `'Scanning directory \d\b\n'` (plain, no color). Our `FileListingHandler` emits the same plain format. However `file.handler.ts:displayFileAreaContents` (line 85) outputs `'Scanning directory ${area.id}, Area: ${area.name}\r\n'` which adds `, Area: <name>` — that suffix does not exist in express.e.
**express.e**:
```
27683-27685: StringF(ray,'Scanning directory \d\b\n',fLLoop)
             aePuts(ray)
```
**Our code** (`file.handler.ts:85`): `emit(\`Scanning directory ${area.id}, Area: ${area.name}\r\n\`);`
**Fix**: Remove `, Area: ${area.name}` from `displayFileAreaContents` in `file.handler.ts`.
**Priority**: P2

---

## D17 — Zippy search: getDirSpan default is empty string (express.e:26165)
**File**: `web/backend/src/handlers/content/zippy-search.handler.ts:133–158`
**Issue**: express.e:26165 calls `getDirSpan('')` when no second param — which interactively prompts the user for a directory range. Our code defaults `dirSpan = dirSpanParam || 'U'` (upload directory), never prompting. This makes zippy search always default to DIR20 (the last dir) instead of prompting.
**express.e**:
```
26164: ELSE
26165:   stat,startDir,dirScan:=getDirSpan('');      /* chg to "A' to search all dirs */
```
**Our code**: `const dirSpan = dirSpanParam || 'U';`
**Fix**: When no dir span param is provided, prompt the user with `getDirSpan` interactive prompt (show `getDirSpanPrompt`, set state to wait for dir span input, then run zippy).
**Priority**: P1

---

## D18 — Zippy search: hardcoded endDir=20 (express.e:26177–26209)
**File**: `web/backend/src/handlers/content/zippy-search.handler.ts:143–158`
**Issue**: For `dirSpan === 'A'` our code hardcodes `endDir = 20`. The actual `maxDirs` value is already fetched earlier in the function but not used for the loop bounds.
**express.e**: `26177: WHILE(fLLoop<=dirScan)` where `dirScan` comes from `getDirSpan`.
**Our code**: `endDir = 20; // maxDirs` — comment acknowledges this but doesn't fix it.
**Fix**: Use the `maxDirs` value already fetched at line 51 of the handler for `endDir`.
**Priority**: P2

---

## D19 — fileStatus (FS command): column headers differ based on CREDITBYKB toggle (express.e:24156–24161)
**File**: `web/backend/src/handlers/file/file-status.handler.ts`
**Issue**: express.e:24156–24160 shows different column headers depending on `sopt.toggles[TOGGLES_CREDITBYKB]`: "KBytes" vs "Bytes" in the header. The `file.handler.ts:displayFileStatus` hardcodes `KBytes` in both header and data labels regardless of the toggle.
**express.e**:
```
24156: IF sopt.toggles[TOGGLES_CREDITBYKB]
24157:   aePuts('[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\b\n')
24158: ELSE
24159:   aePuts('[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\b\n')
```
**Our code** (`file.handler.ts:646`): `emitText(socket, '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail  Ratio\x1b[0m\r\n\r\n');`
The `FileStatusHandler` in `file-status.handler.ts` uses `FileStatisticsUseCase` and would need inspection of its output format, but the legacy `file.handler.ts` version is clearly wrong.
**Fix**: Check `ToggleFlags.CREDITBYKB` and select the correct header string.
**Priority**: P2

---

## OK ITEMS (no deviation)

- `displayULStats` label strings: "Number of Downloads", "Number of Uploads", "Todays Bytes/KBytes Available" — correct.
- LAST CHANCE prompt exact text — correct.
- "Batch UpLoading....." (five dots) — correct.
- "Unlimited files.  Blank Line to start transfer." (two spaces) — correct.
- "Filename lengths above 12 are not allowed." header line in `uploadaFile` — correct placement.
- Flag/unflag (`flagFiles`, `alterFlags`, `showFlags`) — `FileFlagManager` implements the C/F/clear/add logic correctly.
- FM handler: prompt flow (flagged → filename → dirSpan → action → D/M/V/Q) — correct state machine.
- FM delete/move operating on disk DIR files — correct (disk-based, not DB-primary).
- zmodem.e: `RXSUBPACKETSIZE=8192`, `TXSUBPACKETSIZE=8192` constants are N/A for web (no native zmodem).
- Zippy search: uppercase search string before matching (`UpperStr(ss)`) — our code does `searchString.toUpperCase()` — correct.
- Zippy search: `^C` → `'**Break\b\n'` — our code returns -1 with no Break message. Minor: express.e:27563 shows `'**Break\b\n'` before returning. Missing but low-impact.
- `checkFlagged()` prompt `'You have flagged files still not downloaded.\nDo you leave without them? '` — not audited in scope but referenced in flag manager.
