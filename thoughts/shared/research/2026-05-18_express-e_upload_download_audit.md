---
date: 2026-05-18
topic: express-e upload and download flow audit
tags: [express-e, upload, download, audit]
status: draft
---

# express.e Upload & Download Flow Audit

Reference doc for parity verification between the original AmigaE `express.e` and the TypeScript port. Line numbers refer to `express.e` (sourced via `mcp__amiexpress-docs__read_source_range`, source = `express-e`). All `aePuts(...)` strings are quoted verbatim where they carry user-visible semantics.

Result-code constants used throughout:

- `RESULT_SUCCESS` (normal success)
- `RESULT_FAILURE` (operation failed but session continues)
- `RESULT_NOT_ALLOWED` (permission/security gate)
- `RESULT_GOODBYE` = `2` from `uploadDesc()` / `downloadAFile` REPEAT loop (user pressed G after transfer); caller calls `modemOffHook()`
- `RESULT_NO_CARRIER` (carrier lost mid-flow)
- `RESULT_PRIVATE` (description began with `/`)
- `RESULT_LCFILES` (carrier lost during description prompt)
- `RESULT_STANDARD_LOGOFF` (mail-attach upload final logoff)
- `RESULT_TIMEOUT`, `RESULT_NOT_FOUND`, `RESULT_SIGNALLED`, `RESULT_ABORT`

---

# PART 1 — UPLOAD FLOWS

## 1.1 Upload command entry points

### `internalCommandRZ(cmdcode)` — express.e:25608-25620 (ZMODEM "RZ" raw upload)

Steps:
1. **25610** Security gate: `IF checkSecurity(ACS_UPLOAD)=FALSE THEN RETURN RESULT_NOT_ALLOWED`.
2. **25611** `setEnvStat(ENV_UPLOADING)`.
3. **25613-25617** If `logonType>=LOGON_TYPE_REMOTE`, enable `bgFileCheck` via tool-type `BGFILECHECK` on node; else `bgFileCheck:=FALSE`.
4. **25618** `stat := uploadaFile(1, cmdcode, FALSE)` — note `uLFType=1` selects the no-prompt RZ branch.
5. **25619** If `stat=RESULT_GOODBYE` then `modemOffHook()` (drop carrier).
6. **25620** Always returns `RESULT_SUCCESS`.

Key per-protocol divergence: **RZ skips `displayScreen(SCREEN_UPLOAD)`, `resumeStuff()`, `uploadDesc()`, and the "Goodbye after transfer" decision-loop** (everything inside `IF uLFType=0` in `uploadaFile`).

### `internalCommandU(cmdcode)` — express.e:25646-25658 (interactive "U" upload)

Steps:
1. **25648** `checkSecurity(ACS_UPLOAD)` gate.
2. **25649** `setEnvStat(ENV_UPLOADING)`.
3. **25651-25655** Compute `bgFileCheck` same as RZ.
4. **25656** `stat := uploadaFile(0, cmdcode, FALSE)` — `uLFType=0` selects the full interactive path with `uploadDesc()` prompt.
5. **25657** If `stat=RESULT_GOODBYE` then `modemOffHook()`.

### `internalCommandUS()` — express.e:25660-25665 (sysop upload)

- `checkSecurity(ACS_SYSOP_COMMANDS)` gate, then `setEnvStat(ENV_UPLOADING)`, then `sysopUpload()` (express.e:18789 — separate routine, lets sysop pick destination path; not covered further here).

### Mail-attach upload site — express.e:10721-10741 (in mail-save block)

Triggered when `rzmsg` is set (user said "yes" to attach file at end of message). Steps:
1. **10722-10725** Create `<msgBaseLocation>F<msgNumb>` directory.
2. **10726** `setEnvStat(ENV_UPLOADING)`.
3. **10728** Force `bgFileCheck:=FALSE` (no background checking on mail attach).
4. **10729** `stat := uploadaFile(0, '', TRUE)` — note `alreadyUploaded=TRUE` (third arg), skips intro/`fileReceive` (used by hydra-during-download too), and the cmd string is empty.
5. **10730-10733** Clear `rzmsg`, delete the `F<n>` dir.
6. **10734-10740** On `RESULT_GOODBYE` → `RESULT_STANDARD_LOGOFF` after clearing `fileattach` and setting `REQ_STATE_LOGOFF`; on `RESULT_NO_CARRIER` propagate.

## 1.2 `uploadaFile(uLFType, cmd, attach, alreadyUploaded=FALSE)` — express.e:18944-19549

The receive/post-receive pipeline. Two distinct entry modes:

- `uLFType=0` → interactive ("U") with description prompt
- `uLFType=1` → raw ZMODEM ("RZ"), no description prompt loop, no goodbye logic
- `alreadyUploaded=TRUE` → entry from mail attach or hydra-during-download; skip pre-receive setup (assume files already in playpen, only run post-receive pipeline)

### Phase A — Pre-receive (skipped when `alreadyUploaded=TRUE`)

Lines 18970-19054:

1. **18971-18972** Reset `ulFileCount:=0`; `skipdFiles.clear()`.
2. **18974-18978** If `maxDirs=0` (no file dirs in conf): `myError(5)` ("Sorry no files in conf") → `RETURN RESULT_FAILURE`.
3. **18980-18982** If not a mail-attach: `IF displayScreen(SCREEN_NOUPLOADS) THEN RETURN RESULT_SUCCESS` (admin can disable uploads via screen).
4. **18985-18987** If `uLFType=0`: `displayScreen(SCREEN_UPLOAD)` banner.
5. **18989-18990** `freeDiskSpace()` global free-space check; on `RESULT_FAILURE` → `RETURN RESULT_SUCCESS` (silent abort).
6. **18992** Compute `path` = `sopt.ramPen` if set, else `<bbsLoc>Node<N>/Playpen/`.
7. **18994-19001** `rFreeSpace(path)` on playpen; if <2 MB free and no `RAMWORK` tooltype on node → `myError(9)` ("no free space") → `RETURN RESULT_SUCCESS`.
8. **19003-19031** If `uLFType=0` (interactive):
   - **19004-19010** Print "<protocol> UPLOADING..." (or "...to <ramPen>" if different device).
   - **19012-19016** Print free-space line ("X available... Y at one time. Filename lengths above 12 are not allowed.").
   - **19018-19023** Call `resumeStuff()` (express.e:18119); returns `<0` on carrier loss (forward), `0` if nothing to resume, `1` if resumed. If `cmd='RG'` (resume-goodbye) and nothing to resume → message + `RESULT_SUCCESS`.
   - **19024-19030** If `zresume=0`: call `uploadDesc()` (batch description prompt — express.e:17650). On `<0` error: `cleanItUp()` + return. `gstat` is captured for the goodbye decision later.
9. **19037** Recompute `path` (same as 18992 — defensive against `sopt.ramPen` flips during the description loop).
10. **19039-19044** Reset transfer counters: `convertToBCD(0,dTBT)`, `convertToBCD(0,uTBT)`, `ulTTTM:=0`, `dlTTTM:=0`, `tTEFF:=0`, `tTCPS:=0`.
11. **19046-19049** If `beenUDd=FALSE`: `displayUserToCallersLog(1)` (write U/D-log divider header — express.e:16023) and set `beenUDd:=TRUE`.
12. **19051** **`fileReceive(path, uLFType)`** — actual protocol receive (express.e:17964); see §1.3.
13. **19053** Print "File Uploading Complete...".

### Phase B — Post-receive pipeline (runs for all entries)

Lines 19056-19549.

14. **19056-19065** Compute aggregate `peff` / `pcps` from `tTEFF`/`tTCPS` if `ulFileCount<>0` OR background-check count > 0.
15. **19058-19060** Snapshot `bgData.checkedCount` under semaphore.
16. **19067-19073** Format aggregate line: "N file(s), Xk bytes, M minute(s). S second(s), C cps, E% efficiency." → `aePuts`.
17. **19075-19079** Top-CPS update: `IF pcps > loggedOnUserKeys.upCPS2` then store `upCPS2:=pcps` and `oldUpCPS:=Min(pcps,65535)`.
18. **19081-19087** Background-file-check summary: when `bgFileCheck` AND (user `USER_BGFILECHECK` flag OR node `FORCE_BGFILECHECK` tooltype), print "<N> files were checked and posted in the background during upload".
19. **19091-19102** Build `\tUpload <agg-line>` and write to **callersLog + udLog** (only if `ulFileCount>0`); else log `\tUpload Failed..` to both.
20. **19098** If `ulFileCount>0` → **`doUploadNotify()`** (express.e:6689 — runs `runExecuteOn('UPLOAD')` ARexx and, if `MAIL_ON_UPLOAD` tooltype + sysop email, sends notification email).
21. **19104-19107** If `ulTTTM<0` (negative-time error): log `\t\t****UL ERROR (-) TIME USED = N` to callersLog.
22. **19109-19110** Compute `peff:=(ulTTTM*3/2)+60`; zero if no files or negative time. **Time credit formula**.
23. **19112-19125** Skipped-files report: walk `skipdFiles`, print and log each "Skipped <name>"; then "...SKIPPED. They already exist or have symbols.".
24. **19127-19128** Print "Time increased by M mins.".
25. **19130** `timeLimit := timeLimit + peff` (credit user during this session).
26. **19133** `checkOnlineStatus()` (may return no-carrier).
27. **19135** `purgeLine()`.
28. **19137** If `cmds.acLvl[LVL_KEEP_UPLOAD_CREDIT]>0`: `loggedOnUser.timeTotal := timeTotal + (peff/2)` (persisted time bonus).
29. **19139-19514** **Per-file move loop** over `recFileNames`: for each file just received (subject to `noF<=ulFileCount` cap):
   - **19151-19153** Get name; if `LVL_CAPITOLS_in_FILE=1`, uppercase it.
   - **19170-19175** Lock the playpen file (`<path><fn>`); `myError(8)` and skip on failure.
   - **19182-19190** `Examine` → `fsize`, format with `formatFileSizeForDirList`.
   - **19192-19256** **Long-name (>12 char) prompt loop** `inpAgain`/`cinpAgain`:
     - Print "<file> is too long a name, please rename.".
     - Carrier check; on loss, `handleLCFiles(str,fcomment)` and jump `cNext`.
     - Prompt "New Filename:" via `lineInput`; reject empty, reject `RZ`, reject `:`/`/`/`*`/space/`#`/`+`/`?`.
     - `checkForFile(istr)` (DLPATH/ULPATH/LCFILES dup check — express.e:18408); on dup: "<name> is used, please rename.".
     - `Rename(playpen/<old>, playpen/<new>)`. On fail: same message, loop.
   - **19258-19273** **FILE_ID.DIZ extraction**: run `EXAMINE` sysCommand on the playpen file, then `EXAMINE1`, `EXAMINE2`, ... in a loop. Break if the diz syscommand ran and produced no diz file. `dizSysCmd` read from BBSCONFIG tooltype `FILEDIZ_SYSCMD`.
   - **19277-19283** Re-check carrier; on loss → `handleLCFiles` + `cNext`.
   - **19285-19347** **Description handling**:
     - If a `<nodeWorkDir><file>` file exists (description written by EXAMINE diz door): read first line as `fcomment`, remaining lines via `ReadStr` into `scomment` list (up to `max_desclines-1`).
     - Else (no diz): prompt "Enter a description, you only have N lines.\nPress return alone to end. Begin description with (/) to make upload Private.". Print optional CONF `ULPROMPT`. Print "<fname> <fsstr> <odate> :" then `lineInput(44)` for first line. Reject empty, reject "RZ"/"rz", reject "B0", reject any non-ascii char in first 20 chars (loops back via `cinpAgain`). Then loop "                                :" until blank line or `max_desclines-1`. Carrier loss → `handleLCFiles` + clear all comments + `cNext`.
   - **19349-19354** **File integrity test** (skipped if `moveToLCFILES` or `rzmsg`): print "Testing... <name>..."; `status2 := testFile(str,path)` (express.e:18639 — runs `FILECHECK <fn>` syscommand, then extension-based `checkFileExternal`). Returns `RESULT_FAILURE`/`RESULT_SUCCESS`/`RESULT_NOT_ALLOWED`/`RESULT_NOT_TESTED`. On success/not-allowed: "Tested Ok...".
   - **19356** `status := checkForFile(str)` (DLPATH/ULPATH/LCFILES presence check).
   - **19358-19362** Adjust `status`: `RESULT_LCFILES` if `moveToLCFILES`; `RESULT_PRIVATE` if `fcomment[0]='/'` AND not `rzmsg`.
   - **19364-19369** If `status2=RESULT_FAILURE`: mark `hold:=1`, print "Requires review, possibly bad format\n  Moving to <sysop>'s private Directory."; jump `move_It`.
   - **19371-19377** If `status=RESULT_FAILURE` AND `foundDupe`: mark `hold:=1`, "File already exists, moving to <sysop>'s private directory".
   - **19379-19384** If `status=RESULT_SUCCESS`: `hold:=0`; if `creditAccountTrackUploads(loggedOnUser)` then `loggedOnUser.uploads++`.
   - **19385-19389** If `RESULT_LCFILES`: `lcfile:=1`, clear `rzmsg`, "Carrier lost, moving to lost carrier directory.".
   - **19391-19396** If `RESULT_PRIVATE`: `hold:=1`, clear `rzmsg`, "Moving to <sysop>'s private directory.".
   - **19398-19400** If `rzmsg`: "Moving to message base file directory.".
   - **19401-19438** `move_It:` **Actual file move**:
     - Build target: LCFILES → `<conf>LCFILES/<fn>`; HOLD → `<conf>HOLD/<fn>`; mail attach → `<msgBase>F<msgNumb>/<fn>`.
     - Build source: playpen path (ramPen or `Node<n>/PLAYPEN`).
     - Loop while filename part <35 chars: try `Rename`; on fail try `fileCopy` then `SetProtection`+`DeleteFile`; on persistent fail append `_` to target.
     - Log `\tUpload moved to <target>` (or `\tUpload unable to be moved to <target>`) to **callersLog**.
   - **19437** Else (normal upload, not hold/lcfile/rzmsg): **`moveFile(str, fsize)`** (express.e:16192) — iterate `ULPATH.<n>` conf tooltypes; try `Rename` then `fileCopy` to first path with enough space; log `\tUpload moved to <path>` to callersLog, print " File Posted\n\n"; on total failure log `\tFAILURE!, unable to move file <fn> from PlayPen` and delete playpen file.
   - **19440** **`sysopULStats(hold)`** (express.e:18746): increment `<confDir>NumULs` counter and per-conf sysop `SysopStats/NumULs_<n>` (or `_<n>HOLD`).
   - **19442-19448** If non-hold/non-lcfile/non-rzmsg AND `creditAccountTrackUploads`:
     - If `TOGGLES_CREDITBYKB`, `fsize := fsize>>10 & 0x3FFFFF`.
     - `addBCD(loggedOnUserMisc.uploadBytesBCD, fsize)`; refresh `loggedOnUser.bytesUpload := convertFromBCD(...)`.
   - **19451-19470** **Build DIRn / FILES.BBS line**: padded "<fn>[13] <fsstr>  <odate>  <fcomment>\n". Set status flag at col 13: `checksym` if set, else `F`/`P`/`N` from `testFile` result; `D` if `foundDupe`.
   - **19472-19490** Pick destination dir file:
     - Normal: `<confDir>DIR<maxDirs>` (always the highest-numbered dir, i.e. the "uploads" dir).
     - rzmsg: `<msgBase>F<n>/<fn>.dis`.
     - LCFILES: `<confDir>LCFILES/<purgeScanNM>.lc`.
     - HOLD: `<confDir>HOLD/HELD`.
   - **19492-19510** Append the line + each `scomment` line (each prefixed with 33 spaces). If node `SENTBY_FILES` tooltype set, also append `                                 Sent by: <user>`.
30. **19520** **`cleanPlayPen()`** (express.e:18259) — for each playpen file: move to `<conf>PartUpload/<fn>@<slot>` (or `...@<node>-<slot>` if `ownPartFiles`), so partials can be resumed later by `resumeStuff()`. Files belonging to no user / unrecognised are deleted.
31. **19522** `cleanItUp()` (helper).
32. **19525-19533** `tempsize := convertFromBCD(uTBT)` (kb if CREDITBYKB); if not lcfile and not infinite-daily: `loggedOnUser.todaysBytesLimit += tempsize`, `bytesADL += tempsize`.
33. **19535-19536** `displayULStats(loggedOnUser, loggedOnUserMisc)` (express.e:12680) — print Number-of-Downloads/Uploads/Today's-Bytes summary.
34. **19538-19541** `checkOnlineStatus()`; propagate `<0`.
35. **19543-19547** If `uLFType=FALSE` AND `gstat=2` (user picked "G" in `uploadDesc`): `RETURN pGoodbye()`.
36. **19549** `RETURN RESULT_SUCCESS`.

## 1.3 Supporting helpers

### `fileReceive(flname, uLFType)` — express.e:17964-18011

1. If `logonType>=LOGON_TYPE_REMOTE` AND not `localUpload` AND not `lcFileXfr`:
   - **17970-17973** `xprLib.count()=0` → "No transfer protocols are currently configured" + `RESULT_FAILURE`.
   - **17975-17995** Choose protocol per-name banner: Zmodem/Ymodem/Xmodem/Hydra/FTP/HTTP "Ready to Receive". External XPR → `checkSecurity(ACS_XPR_RECEIVE)` gate ("not allowed to upload using external xpr protocols").
   - **18000** `RETURN fileUpload(flname)` (express.e:16954 — does protocol init + transfer; FTP/HTTP/Hydra/XYZMODEM/external XPR branches; afterwards calls `receivePlayPen(TRUE)` to scan playpen and populate `recFileNames`).
2. Else (local upload or lcFileXfr): if `lcFileXfr=FALSE` use `batchasl(flname)` then `receivePlayPen(TRUE)`; else just `receivePlayPen(TRUE)`. Clear `lcFileXfr` and `localUpload`.

### `receivePlayPen(log)` — express.e:18022-18095

Scans playpen dir; for each valid file: validates name (ascii, no space at start, no `/`), increments `ulFileCount`, adds size to `uTBT` (BCD), logs `\tUploading <fname> N bytes` to udLog+callersLog when `log=TRUE`, appends filename to `recFileNames`. Starts from `bgData.checkedCount/checkedBytes` snapshot so already-bg-checked files aren't double-counted.

### `doBackgroundCheck(fname)` — express.e:19551-19737

Mirror of the per-file post-receive pipeline, but used by the background-check thread (started after each ZMODEM file lands when `bgFileCheck`+`USER_BGFILECHECK` are set). Runs EXAMINE diz door, calls `testFile`, `checkForFile`, decides hold/normal, calls `moveFile` or HOLD move, updates `bgData.checkedCount/Bytes`, `sysopULStats(hold)`, user `uploadBytesBCD/bytesUpload`, `todaysBytesLimit`/`bytesADL`, and appends DIRn/HELD line just like the inline loop.

### `zmuploadcompleted(fname, filesize)` — express.e:16820-16827

Called per-file when ZMODEM finishes one file: `addBCD(uTBT, filesize)`, `recFileNames.add(FilePart(fname))`, `ulFileCount++`, then `doBgCheck()` (express.e:18474) which posts a `BG_CHECKFILE` message to the bg-check thread port (only if currently uploading AND bgFileCheck+flags set).

### `zmdupecheck(fname)` — express.e:16831-16849

ZMODEM dupe-check hook. If not net-mail/sysop-upload/mail-attach: checks `checkForFile` and `checkInPlaypens`; on dupe adds to `skipdFiles`. On non-dupe upload calls `sendMasterUpload(FilePart(fname))` (express.e:13426 — multi-node "another node is uploading this file" registration).

### `resumeStuff()` — express.e:18119-18257

Scans `<confDir>PartUpload/`. For each file whose `@<slot>` suffix matches logged-on user: prompts "Resume <fn> [size] (Y/N)?". On Y, rename/copy from PartUpload back into playpen (under original name). On N, "Delete (Y/N/All)?" loop; A switches to silent delete-all. Returns `1` if anything resumed, `0` otherwise, negative on carrier loss.

### `uploadDesc()` — express.e:17650-17797

Batch description-entry. Loops over `FileName N:` lines (unlimited; blank line ends batch; `A` aborts → `RESULT_FAILURE`):
- For URL inputs (HTTP/HTTPS/FTP): `curl` into playpen; sets `lcFileXfr:=TRUE` on success.
- Else: 12-char limit, `checkForFile` dup check, write `<nodeWorkDir><fn>` text file with first description line + up to `max_desclines-1` continuation lines.
After loop: "Okay: (B)ackground filecheck: ..., (Enter) to Start, (G)oodbye after transfer, (A)bort?". `B` toggles `USER_BGFILECHECK`; `A` aborts; `L` (if local console + `ACS_VIEW_A_FILE`) → set `localUpload:=1` and proceed; `G` returns `2`; Enter returns `1`.

### `sysopULStats(holdflag)` — express.e:18746-18787

Two counters: `<confDir>NumULs` (incremented unless HOLD) and `<bbsLoc>SysopStats/NumULs_<conf>[HOLD]`. Used by `displaySysopULStats` (logon "<N> new file(s) uploaded" summary).

### `moveFile(filename, filesize)` — express.e:16192-16258

Iterates `ULPATH.1`, `ULPATH.2`, ... conf tooltypes; tries `Rename` first then `fileCopy` to the first path with enough free space; on success deletes playpen original and logs `\tUpload moved to <path>` plus prints "File Posted". On total failure prints "FAILURE!! unable to move file!" and deletes playpen file.

### `doUploadNotify()` — express.e:6689-6699

`runExecuteOn('UPLOAD')` (ARexx hook) + optional sysop email when `MAIL_ON_UPLOAD` tooltype set.

### `cleanPlayPen()` — express.e:18259+

Iterates playpen; moves each leftover into `<confDir>PartUpload/<fn>@<slot>` (or `<fn>@<node>-<slot>` when `ownPartFiles`) so `resumeStuff()` can find it next session. Files belonging to no logged-on user are deleted outright.

---

# PART 2 — DOWNLOAD FLOWS

## 2.1 Download command entry points

### `internalCommandD(cmdcode, params)` — express.e:24853-24858 (and "DS" sysop download)

Dispatched by the main command switch at express.e:28300-28303 — both `D` and `DS` route here.

1. **24854** `checkSecurity(ACS_DOWNLOAD)` gate.
2. **24855** `setEnvStat(ENV_DOWNLOADING)`.
3. **24857** `beginDLF(cmdcode, params)` → wraps `downloadAFile(cmdcode, params)`; on `RESULT_GOODBYE` calls `modemOffHook()`.

`beginDLF()` is express.e:19791-19795:
```
stat:=downloadAFile(cmdcode,params)
IF(stat=RESULT_GOODBYE) THEN modemOffHook()
ENDPROC stat
```

Note: "DS" path is distinguished only inside `downloadAFile` (see step §2.2 #16) by `StriCmp(cmdcode,'DS')` AND `checkSecurity(ACS_SYSOP_DOWNLOAD)`.

## 2.2 `downloadAFile(cmdcode, params)` HANDLE — express.e:19941-20334

### Phase A — Setup and ratio precheck

1. **19957-19958** Init `proto:=0`, `numFiles:=0`.
2. **19960-19964** If `maxDirs=0`: `myError(5)` → `RETURN RESULT_FAILURE`.
3. **19966-19971** Unless `quietDownload`: `displayScreen(SCREEN_DOWNLOAD)` then `doPause()`.
4. **19973-19977** `estDlCPS := lastDlCPS OR onlineBaud/10`.
5. **19979** `convertToBCD(0, dtfsize)` (total transfer size accumulator).
6. **19981** `displayULStats(loggedOnUser, loggedOnUserMisc)` (Downloads/Uploads/Bytes summary).
7. **19983-20028** **Ratio precheck before file selection**:
   - If `secLibrary<>0` (ratio enabled) AND `secBoard>0` AND no credit account: file-count ratio. `cnt := (secLibrary * (uploads+1)) - downloads`; "Files Avail before UL : N"; if `<1` → `exceedRatio()` ("You have exceeded your ratio, you must upload first.") + `RETURN RESULT_SUCCESS`.
   - If `secBoard<2`: byte-ratio. Compute `tmpBCD := secLibrary * uploadBytesBCD - downloadBytesBCD`; format as "KBytes/Bytes Avail before UL : <bcdStr>" (or "Infinite" for $7fffffff). If `cnt<1` → `exceedRatio` + return.
   - If `secLibrary=0`: "Download to Upload Ratio : Disabled.".
8. **20030-20035** Unless quiet: "Space between filenames. [No ]Wildcards permitted." (gated by `ACS_FILE_EXPANSION`).
9. **20037-20055** Build `tempList` (PTR TO stdlist):
   - `sysopdl:=FALSE`.
   - If "DS" AND `ACS_SYSOP_DOWNLOAD`: `sysopdl:=TRUE`, log `\tSYSOP DOWNLOAD: DS` to callersLog+udLog; `addFlagItems(tempList, currentConf, params)` (only params, no flagged list).
   - Else: `addFlagItems` from params + iterate `flagFilesList` and `addFlagItem(tempList, item.confNum, item.fileName)` for each.
10. **20057-20063** Init per-conf accumulators: `tfsizes`, `freeDFlags` (size = `cmds.numConf`); `finalList = MAX_FLAGGED_FILES`.
11. **20065-20097** If tempList not empty: print "Checking...". For each item:
    - Sysop mode rejects `?`, `*`, `#`; user mode rejects `:`, `/`, plus `?`/`#`/`*` unless `ACS_FILE_EXPANSION`; reject if name starts with `?`/`*`.
    - On any rejection, `JUMP arestart1`.
    - Call `checklist(tempList, tfsizes, freeDFlags, finalList)` (express.e:16009) → wraps `checkForFileSize` for each, which finds the file across DLPATH/ULPATH and per-file calls `checkFIBForFileSize` (express.e:12717). That helper prints "<size>k, M mins SS secs <fname>", flags Free Download (comment starts `F` or global `freeDownloads`), rejects Restricted (`fBlock.comment` starts `Restricted` → logs `\t\tAttempt to download RESTRICTED file [<path>]` to callersLog and returns), and on first-seen adds to `cfn` (final list) + `flagFilesList` (if not sysopdl). Adds size to `dtfsize` and to `tfsizes[confNum-1]`.
    - On `RESULT_FAILURE` from checklist: `Throw(ERR_EXCEPT, RESULT_SUCCESS)`.
12. **20099-20103** `arestart1:` clear/free `tempList`.

### Phase B — Filename input loop (interactive)

13. **20105-20171** `arestart:` then `LOOP`:
    - **20108-20114** `checkRatiosAndTime({min},{size},{cnt},string,estDlCPS,tfsizes,freeDFlags)` (express.e:19823 — checks time, daily-bytes, per-conf byte/file ratios honouring `ACS_CONFERENCE_ACCOUNTING`, `secBoard`/`secLibrary`, `cb.ratioType`, `cb.ratio`, and `creditAccountEnabled`). Returns `0` (fail with `errormsg` — print + `Throw RESULT_SUCCESS`), `1` (skip prompting, jump `astart`), or `2` (continue prompting).
    - **20116-20128** Unless quiet: prompt with `\<min\>` time, `\<size\>` bytes available, `\<numFiles+1\>` file count, `\<cnt\>` files available (via `downloadPrompt`). `lineInput(200)` into `tempStr2`, then `fullTrim(tempStr2,tempStr)`.
    - **20130-20132** `lineInput<0` → `Throw RESULT_NO_CARRIER`.
    - **20134-20137** Empty input AND no files selected → "\n" + `Throw RESULT_SUCCESS`.
    - **20139** Empty input AND files selected → `JUMP astart`.
    - **20140-20143** `Q`/`A` (len 1) → "Aborting..." + `Throw RESULT_SUCCESS`.
    - **20145-20165** Same special-char validation as step 11 (sysop vs user).
    - **20167-20170** `checkForFileSize(tempStr,'',currentConf,tfsizes,freeDFlags,finalList,0)` to add user-entered name. On `RESULT_FAILURE`/`RESULT_SIGNALLED`/`RESULT_PRIVATE`: `Throw RESULT_SUCCESS`.

### Phase C — Pre-transfer confirmation

14. **20173-20180** `astart:` free `tfsizes`, `freeDFlags`. If `numFiles=0`: `RETURN RESULT_NO_CARRIER`.
15. **20182-20195** Print protocol header (Zmodem/FTP/other) + "Batch Download Estimate at N cps" (or bps).
16. **20197-20203** `tsec:=divBCD(dtfsize,estDlCPS)`; print "   <numFiles> files, <kbytes>k bytes, <min> mins <secs> secs".
17. **20205-20208** If `min>timeLimit/60` AND not `ACS_OVERRIDE_TIMELIMIT`: "  Insufficent time for transfer.\n\n" → `RETURN RESULT_SUCCESS`.
18. **20210-20231** "LAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort?" REPEAT loop:
    - `checkOnlineStatus()`, then `readChar(INPUT_TIMEOUT)`.
    - `A`/`a` → "Abort!" → `RETURN RESULT_SUCCESS`.
    - Local console L → set `localUpload:=TRUE` and treat as Enter.
    - Loop until `mystat in [13, 71='G', 103='g']`.
    - 13 → "\n\n", else → "Goodbye!".

### Phase D — Transfer execution

19. **20233-20240** Reset counters: `dTBT`/`uTBT`:=BCD(0), `ulTTTM`/`dlTTTM`/`tTEFF`/`tTCPS`/`dlFileCount`/`ulFileCount`:=0.
20. **20242-20245** First-time-in-session: `displayUserToCallersLog(1)` (udLog divider header), `beenUDd:=TRUE`.
21. **20247** **`status := downloadFiles(finalList, dtfsize, TRUE)`** (express.e:15571) — see §2.3.
22. **20249** On non-zero result: `clearFlagItems(flagFilesList)` (clears the user's session flag list).

### Phase E — Post-transfer accounting

23. **20251** "\n\nFile transfer Completed.\n".
24. **20252-20260** Compute aggregate `peff`/`pcps` from `tTEFF`/`tTCPS` if `dlFileCount<>0`; persist `loggedOnUserMisc.lastDlCPS := pcps`.
25. **20262-20268** Format "<N> files, <kb>k bytes, <m> minutes <s> seconds <cps> cps, <eff>% efficiency at <baud>" → `aePuts`.
26. **20271-20275** Top-CPS download update: `IF pcps > loggedOnUserKeys.dnCPS2` then `dnCPS2:=pcps`, `oldDnCPS:=Min(pcps,65535)`.
27. **20277-20278** `clearFlagItems(finalList); END finalList`.
28. **20280-20289** Write `\t<agg-line>` to callersLog+udLog when `dlFileCount>0`; else `\tDownload Failed..` to both.
29. **20291-20309** **Hydra reverse uploads** (Hydra is bidirectional — files can arrive during a download):
    - Reset `bgData.checkedCount/Bytes` under semaphore.
    - Recompute upload CPS/efficiency from `uTBT`/`ulTTTM`.
    - `receivePlayPen(TRUE)` to populate `recFileNames` from any hydra-uploaded files.
    - `uploadaFile(0, '', FALSE, TRUE)` — `alreadyUploaded=TRUE` runs only the post-receive pipeline (move/dirn/logs/stats) over those files. This is the **only** path where the upload pipeline runs without `internalCommandU`/`RZ`.
30. **20311-20312** `displayULStats(loggedOnUser, loggedOnUserMisc)` ; "\n".
31. **20314** `purgeLine()`.
32. **20316** `statPrintUser(loggedOnUser, loggedOnUserKeys, loggedOnUserMisc)` (status-window refresh).
33. **20317** If `mystat in [71,103]` (user picked G) → `RETURN pGoodbye()` (10-sec countdown abort with "Last chance! Auto LOGOFF in N SECS. Abort: (Enter)=yes?"; default → `RESULT_GOODBYE`; user says `n` → `RESULT_GOODBYE` (clarified — returns GOODBYE on N too? — actually it returns `RESULT_GOODBYE` when user does NOT abort, and `RESULT_SUCCESS` when user types y/T/Enter; see express.e:13750-13772).
34. **20318-20333** `EXCEPT` cleanup: free `tempList`, `tfsizes`, `freeDFlags`, `finalList`; `RETURN exceptioninfo` (the value passed to `Throw`).
35. **20334** Default `RETURN RESULT_SUCCESS`.

## 2.3 `downloadFiles(fileList, estimatedSize, updateDownloadStats, forceZmodem=FALSE)` — express.e:15571-16007

Returns `0`=fail / `1`=success (inverted from most BBS routines).

1. **15597-15599** Empty list → `RETURN 0`.
2. **15601-15606** If not netmail and not remote and not `ACS_LOCAL_DOWNLOADS`: "Not supported locally..." → `RETURN 0`.
3. **15608-15611** No xprLib → "No transfer protocols are currently configured" → `RETURN 0`.
4. **15613** `statWinType:=0`.
5. **15615-15659** **Protocol resolution**:
   - `forceZmodem` OR no user → `protocol='INTERNAL'` (raw ZModem).
   - Else look up by `loggedOnUser.xferProtocol`.
   - Aliases: `INTERNAL` → ZModem (`ext=FALSE`); `HYDRA` → INTERNAL + `internalName=Hydra`, `statWinType=1`, `hydraFlag=TRUE`; `INTERNALYM` → ZModem block + `ymodemFlag`; `INTERNALXM` → `xmodemFlag`; `INTERNAL8K` → ZModem at maxBlkSize=8192; `XPRZM` → ZModem but `ext=TRUE` (via xprzmodem.library).
6. **15661-15668** Init `zModemInfo`: `currentOperation:=ZMODEM_DOWNLOAD`, `shouldUpdateDownloadStats:=updateDownloadStats`, counters cleared.
7. **15670-15724** **FTP/HTTP branches**: open transfer stat window, call `ftpDownload`/`httpDownload`, close window, dispose port lists, `RETURN result`.
8. **15726-15729** If not remote AND not above: "Not supported locally..." → 0.
9. **15731-15741** Banner "<protocol>: Ready to Send"; external-XPR users need `ACS_XPR_SEND` ("not allowed to download using external xpr protocols").
10. **15743-15753** External: `OpenLibrary(<protocol>.library OR xprzmodem.library)`; fail → 0.
11. **15755-15758** `wantzwin:=TRUE`; if `scropen` → `openTransferStatWin()`.
12. **15760-15761** Save `serShared`, set `serShared:=FALSE`.
13. **15763-15764** Alloc `zmodemRxBuffer` (8192).
14. **15766-15797** **External XPR init**: build xprio struct with all the `xpr*Asm` callbacks, read `OPTIONS` tooltype.
15. **15798-15887** **Internal protocol init**:
    - Hydra: read `TXWINDOW`/`RXWINDOW` tooltypes; `hydra_init`; wire all hyd_* callbacks (firstfile/nextfile/open/close/seek/read/write/dupecheck/uploadcompleted/downloadcompleted/recvbyte/flush/isconnected/logmessage/getkey/sysidle/chatwrite/status).
    - XYMODEM: `xymodem_init` with size-2048 blocks, set total_files/total_bytes from estimatedSize.
    - ZMODEM: `zmodem_init` with maxBlkSize (default 1024 or 8192), set total_files/total_bytes.
16. **15889** Open `asyncio.library`.
17. **15891-15896** Telnet: send `IAC DO BINARY` (253,0) and `IAC WILL BINARY` (251,0).
18. **15898-15911** External: `XprotocolSetup(xprio)`; on fail clean up everything and `RETURN 0`.
19. **15914** `stopSerialRead()`.
20. **15916-15922** `result:=TRUE; transfering:=TRUE; cancelTransferOffHook:=FALSE; lastIAC:=FALSE`. `zModemInfo.currentDL:=0; .fileList:=fileList`.
21. **15924-15945** **The actual send**, branched:
    - ext (XPR): `XprotocolSend(xprio)`; measure ticks; if `transPos<>filesize` mark failure.
    - hydra: `hydra_do_transfer(hyd, uploadPath, ...)` — captures both `dlTimeTaken` and `ulTimeTaken` (bidirectional).
    - xy: `xymodem_send_files(ymodemFlag, xym, ...)`.
    - zmodem: `zmodem_send_files(zm, ...)`.
    - `dlTTTM := dlTimeTaken` (in ticks).
22. **15947-15953** Compute aggregate `tTCPS`: if `dlTTTM` then `dTBT*50 / dlTTTM`; else `convertFromBCD(dTBT)`.
23. **15954** `tTEFF := calcEfficiency(tTCPS, onlineBaud)`.
24. **15956-15959** Telnet: send `IAC DONT BINARY` (254,0) and `IAC WONT BINARY` (252,0).
25. **15961-15971** Cleanup: `XprotocolCleanup` / `hydra_cleanup` / `xymodem_cleanup` / `zmodem_cleanup`.
26. **15972-15974** `transfering:=FALSE; binaryRaw:=FALSE; checkOffhookFlag()`.
27. **15976-15986** Free xprio / hyd / xym / zm structs; close xprotocolbase / asynciobase.
28. **15989-15998** `zModemInfo.currentOperation:=ZMODEM_NONE; .fileList:=NIL`; `closeTransferStatWin`; restore `serShared`; `queueSerialRead(serbuff)`; `Dispose(zmodemRxBuffer)`.
29. **16000-16005** Print "<protocol> download successful/unsuccessful" line.
30. **16007** `RETURN result`.

## 2.4 Per-file download-complete hook

### `zmdownloadcompleted(fsize, sentsize)` — express.e:16878-16883

Called per file by ZMODEM/Hydra/XYMODEM after each successful send.

1. Look up `fileItem := zModemInfo.fileList.item(zModemInfo.currentDL)`.
2. `removeFlagFromList(FilePart(fileItem.fileName), fileItem.confNum)` — auto-unflag.
3. `updateDownloadStats(fileItem, fsize, sentsize)` (express.e:15429):
   - `dlFileCount++`; `addBCD(dTBT, sentsize)`.
   - If `TOGGLES_CREDITBYKB`: `fsize:=fsize>>10 & 0x3FFFFF`.
   - Only when `sentsize>0`:
     - If `ACS_CONFERENCE_ACCOUNTING`: `saveMsgPointers`, then unless `freeDownloads` AND `creditAccountTrackDownloads`: `addBCD(cb.downloadBytesBCD, fsize)`, `cb.bytesDownload`, `cb.downloads++`; then `loadMsgPointers`.
     - Else unless freeDownloads AND creditAccountTrackDownloads: `addBCD(loggedOnUserMisc.downloadBytesBCD, fsize)`, `loggedOnUser.bytesDownload`, `loggedOnUser.downloads++`.
     - Always: `loggedOnUser.dailyBytesDld += fsize`; if `bytesADL<>0x7fffffff` then `bytesADL -= fsize`.

There is **no `doDownloadNotify`** in express.e — downloads do not invoke an ARexx hook or sysop email. The only ARexx hook fired is `runExecuteOn('UPLOAD')` from `doUploadNotify` after uploads. Searched and confirmed: no `doDownloadNotify` symbol exists.

## 2.5 Per-protocol divergences (download side)

| Protocol     | Picked when                       | Path in `downloadFiles`              | Notes                                                                 |
|--------------|------------------------------------|---------------------------------------|-----------------------------------------------------------------------|
| Internal ZM  | xprLib='INTERNAL'                 | internal zmodem block, maxBlk=1024    | Most common; uses `zmodem_send_files`                                |
| Internal ZM 8k| xprLib='INTERNAL8K'               | internal zmodem, maxBlk=8192          | Same as INTERNAL otherwise                                            |
| YMODEM       | xprLib='INTERNALYM'               | `xymodem_send_files(TRUE,...)`        | Block size 2048, batch send                                           |
| XMODEM       | xprLib='INTERNALXM'               | `xymodem_send_files(FALSE,...)`       | No batch metadata; only single-file effectively                       |
| Hydra        | xprLib='HYDRA'                    | `hydra_do_transfer`                   | Bidirectional — `ulTTTM` set too; triggers `uploadaFile(...,TRUE)` post-transfer |
| XPRZM        | xprLib='XPRZM'                    | external XPR via xprzmodem.library    | Uses XPR callback table; only path with `ACS_XPR_SEND` check          |
| External XPR | xprLib=other                      | external XPR via `<name>.library`     | `ACS_XPR_SEND` security gate                                          |
| FTP          | xprLib='FTP'                      | `ftpDownload` returns immediately     | No serial transfer; no statwin send path                              |
| HTTP         | xprLib='HTTP'                     | `httpDownload` returns immediately    | Same                                                                  |

For uploads (`fileUpload` at express.e:16954): same matrix, with `ACS_XPR_RECEIVE` gating external XPR, and FTP/HTTP branches calling `ftpUpload`/`httpUpload` then `receivePlayPen(TRUE)` themselves (so they bypass the normal `zmuploadcompleted` per-file hook entirely).

---

# PART 3 — Quick-reference invariants for parity diff

- **Top-CPS persist**: uploads update `upCPS2`/`oldUpCPS` only when `pcps > upCPS2` (express.e:19075). Downloads update `dnCPS2`/`oldDnCPS` (express.e:20271).
- **`oldUpCPS`/`oldDnCPS` are 16-bit-clamped** (`IF pcps>65535 THEN pcps:=65535`) but `upCPS2`/`dnCPS2` are stored raw.
- **`bytesUpload` / `bytesDownload`** are the convertFromBCD snapshot of `uploadBytesBCD` / `downloadBytesBCD`. Always refresh after `addBCD`.
- **CREDITBYKB**: when `sopt.toggles[TOGGLES_CREDITBYKB]` is on, *all* byte counters store kilobytes via `fsize >> 10 & 0x3FFFFF`. Applies to: `loggedOnUserMisc.uploadBytesBCD`, `loggedOnUserMisc.downloadBytesBCD`, `cb.downloadBytesBCD`, `bytesADL`, `todaysBytesLimit`, `dailyBytesDld`, and `tempsize` in ratio calcs.
- **`bytesADL=$7fffffff`** means infinite; never decrement.
- **`displayUserToCallersLog(1)`** is called exactly once per session (gated by `beenUDd`) — first time the user does either an upload OR a download.
- **`callersLog` + `udLog`** entries are written **both** with the same `\t` prefix on success; only `\tUpload Failed..` / `\tDownload Failed..` on zero-count.
- **`doUploadNotify`** triggers only when `ulFileCount>0`; calls `runExecuteOn('UPLOAD')` + optional sysop email. No counterpart on download.
- **`pGoodbye`** semantics: returns `RESULT_GOODBYE` by default (countdown expires) or when user types `n`/`N`; returns `RESULT_SUCCESS` when user types `y`/`T`/Enter (the user "aborted" the logoff).
- **Mail-attach** is the only path that calls `uploadaFile(...,alreadyUploaded=TRUE)` with `rzmsg` set, sending files into `<msgBase>F<n>/<fn>` rather than DIRn.
- **Hydra reverse-upload** is the only other `alreadyUploaded=TRUE` path (post-download in `downloadAFile`).
- **`recFileNames`** is the canonical "files just received" list — populated by `receivePlayPen` (locally / FTP / HTTP / external XPR / once-per-batch) AND incrementally by `zmuploadcompleted` (per-file for ZM/XM/YM/Hydra).
- **`skipdFiles`** is populated by `zmdupecheck` when a ZMODEM-offered name already exists in DLPATH/ULPATH/LCFILES/other playpens; skipped files are logged but never moved.
- **`foundDupe`** is referenced (express.e:18958, 19372, 19466) but never set inside `uploadaFile` itself — it's set by `checkForFile`/diz logic elsewhere; behaviour is: when checkForFile returns FAILURE AND foundDupe — mark hold and stamp DIRn col-13 = `D`.
- **DIRn**: line at col 13 carries the status flag — `F`/`P`/`N` from testFile, `D` for dupe, or whatever `checksym` is set to from external file-check tools.
- **Conf-stats** (`cb.downloadBytesBCD`, `cb.downloads`) only updated under `ACS_CONFERENCE_ACCOUNTING`; otherwise per-user counters carry everything.
- **Time-credit on upload** = `(ulTTTM*3/2)+60` (express.e:19109) when there was at least one file AND positive time; added to live `timeLimit` always, and persisted to `loggedOnUser.timeTotal` (`+= peff/2`) only when `LVL_KEEP_UPLOAD_CREDIT>0`.
- **No `doDownloadNotify`** — confirmed absent from express.e. Any port-side notification on download is novel behaviour, not parity.
