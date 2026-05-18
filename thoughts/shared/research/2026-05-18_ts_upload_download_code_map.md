---
date: 2026-05-18
topic: TypeScript Upload/Download Code Flow Audit
tags: [typescript, upload, download, audit]
status: draft
---

# TypeScript BBS Reimplementation: Upload & Download Code Map

Complete walkthrough of all file transfer flows in the TypeScript BBS implementation (amiexpress-web). Every entry-point, handler, transfer service, post-receive utility, and stat update is cross-referenced to source line numbers.

## UPLOADS

### 1. Web File Picker Upload (Browser → Socket.IO)

**Entry Point → File Handler Flow:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check | transfer-misc-commands.handler.ts:85 | checkSecurity(ACSPermission.UPLOAD) |
| 1b | EnvStat set | transfer-misc-commands.handler.ts:93 | _setEnvStat(session, EnvStat.UPLOADING) |
| 1c | Emit upload UI | transfer-misc-commands.handler.ts:351 | _displayUploadInterface() → shows file picker to user |
| 1d | Frontend picks file | file-socket-handlers.ts:797 | processFileUpload() called via socket 'file-upload' event |
| 1e | DIZ extraction attempt | file-socket-handlers.ts:136 | extractAndReadDiz(data.path, nodeWorkDir) + 10sec timeout |
| 1f | DIZ description prompt | file-socket-handlers.ts:224 | promptForDescription() if no DIZ found |
| 1g | User enters description | file-socket-handlers.ts:264 | processBatchFile() called after description input |

**Per-File Processing:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | File integrity test | file-socket-handlers.ts:365 | testFile(data.path, nodeWorkDir) + 15sec timeout |
| 2b | Test status marker | file-socket-handlers.ts:403 | Set checked='P'/'F'/'N'/'D' based on TestResult |
| 2c | Move to directory | file-socket-handlers.ts:417 | moveUploadedFile() → FILES/LCFILES/HOLD based on test result |
| 2d | DB duplicate check | file-socket-handlers.ts:433 | SELECT by normalized filename in areaid |
| 2e | DB file entry create | file-socket-handlers.ts:451 | db.createFileEntry() unless duplicate |
| 2f | DIR file append | file-socket-handlers.ts:476 | writeUploadToDirFile() to DIR{maxDirs} |
| 2g | FILES.BBS write | file-socket-handlers.ts:515 | writeToFilesBBS() for door compatibility |
| 2h | User stats update | file-socket-handlers.ts:541 | UPDATE users SET uploads+1, bytesupload+sz, topuploadcps |
| 2i | User stats disk sync | file-socket-handlers.ts:591 | userFileManager.updateUserDataFile() (slots/misc files) |
| 2j | Conference stats update | file-socket-handlers.ts:614 | db.updateConference() SET uploads+1, bytesUpload+sz |
| 2k | CallersLog entry | file-socket-handlers.ts:636 | callersLog() "Uploaded file: {filename}" |
| 2l | BBS event emit | file-socket-handlers.ts:649 | emitUpload() for LiveChat |
| 2m | Webhook trigger | file-socket-handlers.ts:673 | webhookService.sendWebhook(NEW_UPLOAD) |
| 2n | Sysop upload stats | file-socket-handlers.ts:693 | updateSysopUploadStats() → NumULs / SysopStats counters |

**Batch Completion:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | Frontend signals batch done | file-socket-handlers.ts:770 | handleUploadBatchComplete() on 'upload-batch-complete' event |
| 3b | Post-receive pipeline | post-upload.service.ts:55 | runPostUpload() with stats from tempData |
| 3c | Completion banner | post-upload.service.ts:68 | "File Uploading Complete..." + stats line |
| 3d | Time credit grant | post-upload.service.ts:107 | peff = (ulTTTM * 3/2) + 60 seconds |
| 3e | TimeLimit update | post-upload.service.ts:115 | session.timeLimit += peff |
| 3f | Context cleanup | file-socket-handlers.ts:789 | clearUploadContext() removes tempData |
| 3g | Return to menu | post-upload.service.ts:143 | subState = DISPLAY_MENU + menuPause = true |

---

### 2. Web RZ Command (Interactive ZMODEM from Menu)

**Entry Point → Protocol Handler:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check | transfer-misc-commands.handler.ts:85 | checkSecurity(ACSPermission.UPLOAD) |
| 1b | EnvStat set | transfer-misc-commands.handler.ts:93 | _setEnvStat(session, EnvStat.UPLOADING) |
| 1c | Playpen prep | transfer-misc-commands.handler.ts:106 | BBSPaths.node().playpen() + fs.mkdirSync() |
| 1d | Transport detect | transfer-misc-commands.handler.ts:114 | transportType = 'web' (vs 'telnet'/'ssh') |
| 1e | **web: zmodem.js path** | transfer-misc-commands.handler.ts:265 | ZmodemTransferManager instance |
| 1f | Socket emit init | transfer-misc-commands.handler.ts:314 | socket.emit('transfer-raw:init') to browser |
| 1g | Transfer start | transfer-misc-commands.handler.ts:323 | manager.start() → sends ZRQINIT header |
| 1h | Input routing | transfer-misc-commands.handler.ts:310 | (session as any).transferRawSink for inbound data |
| 1i | Session park | transfer-misc-commands.handler.ts:257 | subState = FILES_UPLOAD (prevents menu re-render) |

**ZMODEM Session & File Receive (zmodem.js):**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | Detection callback | zmodem-transfer.service.ts:98 | handleDetection(det) on ZRQINIT from peer |
| 2b | Confirm + role check | zmodem-transfer.service.ts:104 | det.confirm() → 'send' (our receive) or 'receive' (our send) |
| 2c | Session end hook | zmodem-transfer.service.ts:123 | zsession.on('session_end', finish) |
| 2d | Receive path | zmodem-transfer.service.ts:191 | startReceive(zsession) |
| 2e | Target dir create | zmodem-transfer.service.ts:193 | fs.mkdirSync(targetDir, recursive) |
| 2f | Offer listener | zmodem-transfer.service.ts:201 | zsession.on('offer', xfer => ...) |
| 2g | File sanitize | zmodem-transfer.service.ts:203 | sanitizeFilename() removes path separators |
| 2h | File write | zmodem-transfer.service.ts:208 | fs.createWriteStream(dest) |
| 2i | Xfer accept | zmodem-transfer.service.ts:213 | xfer.accept() → write bytes on 'input' events |
| 2j | Transfer finish | zmodem-transfer.service.ts:250 | finish(success=true) on zsession_end |

**Post-Transfer & Post-Upload:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | onComplete callback | transfer-misc-commands.handler.ts:273 | Called when zmodem.js session_end fires |
| 3b | Received files snapshot | transfer-misc-commands.handler.ts:285 | detail.received[] from ZmodemTransferManager |
| 3c | Synthetic uploadContext | transfer-misc-commands.handler.ts:197 | tempData = { uploadMode, fileArea, uploadBatch, ... } |
| 3d | BatchFile loop | transfer-misc-commands.handler.ts:213 | for (file in received) processBatchFile() |
| 3e | Auto-complete on last | transfer-misc-commands.handler.ts:229 | Last file's processBatchFile calls handleUploadBatchComplete |
| 3f | Cleanup + stats | post-upload.service.ts:55 | runPostUpload() with uploadedFiles/uploadedBytes |
| 3g | Return to menu | post-upload.service.ts:143 | subState = DISPLAY_MENU |

---

### 3. Telnet/SSH RZ Command (lrzsz Path)

**Entry Point → lrzsz Child Spawn:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check | transfer-misc-commands.handler.ts:85 | checkSecurity(ACSPermission.UPLOAD) |
| 1b | EnvStat set | transfer-misc-commands.handler.ts:93 | _setEnvStat(session, EnvStat.UPLOADING) |
| 1c | Playpen path | transfer-misc-commands.handler.ts:106 | BBSPaths.node().playpen() |
| 1d | Transport detect | transfer-misc-commands.handler.ts:115 | transportType = 'telnet' or 'ssh' |
| 1e | lrzsz availability check | transfer-misc-commands.handler.ts:132 | isLrzszAvailable() cached check |
| 1f | **lrzsz: spawn rz** | lrzsz-transfer.service.ts:131 | spawn('rz', ['-b', '-y', '-vv']) |
| 1g | Child stdio setup | lrzsz-transfer.service.ts:132 | stdio: ['pipe', 'pipe', 'pipe'] |
| 1h | Pre-transfer snapshot | lrzsz-transfer.service.ts:111 | fs.readdirSync(cwd) saved to preTransferFiles |
| 1i | Session transfer markers | transfer-misc-commands.handler.ts:248 | transferRawActive=true, transferRawSink/Send set |
| 1j | Output to wire | lrzsz-transfer.service.ts:153 | proc.stdout → normalizeHexHeaderTrailers() → transport.send() |
| 1k | Status message | transfer-misc-commands.handler.ts:258 | socket.emit('ansi-output', "Ready to receive via ZMODEM (lrzsz)") |
| 1l | Start lrzsz | lrzsz-transfer.service.ts:102 | manager.start() |

**Input Handling & File Receive:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | Inbound data handler | lrzsz-transfer.service.ts:202 | handleInput(data) from telnet/SSH input loop |
| 2b | MuffinTerm rewrite | lrzsz-transfer.service.ts:288 | rewriteMuffintermZfile() patches ZFILE terminator |
| 2c | Stdin write | lrzsz-transfer.service.ts:215 | proc.stdin.write(rewritten) |
| 2d | stderr logging | lrzsz-transfer.service.ts:165 | proc.stderr listener logs progress lines |
| 2e | Child exit wait | lrzsz-transfer.service.ts:183 | proc.on('close', (code, signal) => finish()) |
| 2f | Timeout watchdog | lrzsz-transfer.service.ts:189 | 10min default, proc.kill('SIGTERM') on timeout |

**File Completion & Post-Upload:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | finish() computed received | lrzsz-transfer.service.ts:456 | Diff: fs.readdirSync(cwd) minus preTransferFiles |
| 3b | onComplete callback | lrzsz-transfer.service.ts:470 | Fires with success=true, received=[], exitCode |
| 3c | Synthetic uploadContext | transfer-misc-commands.handler.ts:197 | tempData = { uploadMode, fileArea, uploadBatch, ... } |
| 3d | BatchFile loop | transfer-misc-commands.handler.ts:213 | for (fp in received) processBatchFile() |
| 3e | Per-file pipeline | file-socket-handlers.ts:264 | DIZ, test, move, DB, DIR, stats |
| 3f | Auto-complete | transfer-misc-commands.handler.ts:229 | Last file auto-triggers handleUploadBatchComplete |
| 3g | Post-upload stats | post-upload.service.ts:55 | runPostUpload() |
| 3h | Return to menu | post-upload.service.ts:143 | subState = DISPLAY_MENU, menuPause = true |

---

### 4. Telnet/SSH RZ Command (Fallback zmodem.js Path)

**Entry Point → ZmodemTransferManager:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | lrzsz unavailable | transfer-misc-commands.handler.ts:262 | console.warn, falls through to zmodem.js |
| 1b | ZmodemTransferManager spawn | transfer-misc-commands.handler.ts:265 | new ZmodemTransferManager() |
| 1c | Session markers | transfer-misc-commands.handler.ts:309 | transferRawActive=true, transferRawSink/Send set |
| 1d | Status message | transfer-misc-commands.handler.ts:320 | socket.emit('ansi-output', "Ready to receive via ZMODEM") |
| 1e | Sentry initialization | zmodem-transfer.service.ts:45 | new Zmodem.Sentry() with on_detect/sender |
| 1f | Transfer start | zmodem-transfer.service.ts:79 | manager.start() → Zmodem.Header.build('ZRQINIT') |

**Input & Detection:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | Inbound data | zmodem-transfer.service.ts:63 | handleInput(data) from telnet input loop |
| 2b | Sentry consume | zmodem-transfer.service.ts:68 | sentry.consume(data) |
| 2c | ZRQINIT detection | zmodem-transfer.service.ts:98 | on_detect callback fires when client sends ZRQINIT |
| 2d | Confirm + role | zmodem-transfer.service.ts:104 | det.confirm() |
| 2e | Receive branch | zmodem-transfer.service.ts:128 | role === 'receive' → startReceive(zsession) |
| 2f | Target dir | zmodem-transfer.service.ts:192 | resolveTargetDir() |
| 2g | Offer listener | zmodem-transfer.service.ts:201 | zsession.on('offer', xfer => ...) |
| 2h | File write | zmodem-transfer.service.ts:208 | fs.createWriteStream(dest) |
| 2i | Accept & receive | zmodem-transfer.service.ts:213 | xfer.accept() → xfer.on('input', data => writer.write()) |

**Completion:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | session_end event | zmodem-transfer.service.ts:123 | Listener fires on ZEOF |
| 3b | finish(true) | zmodem-transfer.service.ts:245 | receivedFiles[] populated from file write callbacks |
| 3c | onComplete callback | transfer-misc-commands.handler.ts:273 | Called with success=true, detail |
| 3d | Synthetic uploadContext | transfer-misc-commands.handler.ts:197 | tempData with received files |
| 3e | BatchFile loop | transfer-misc-commands.handler.ts:213 | processBatchFile() for each file |
| 3f | Post-upload pipeline | post-upload.service.ts:55 | runPostUpload() shared across transports |
| 3g | Return to menu | post-upload.service.ts:143 | subState = DISPLAY_MENU |

---

### 5. Telnet/SSH U Command (Interactive Upload)

**Status: NOT IMPLEMENTED**

No handler found for `U` command (interactive upload prompt). The `RZ` command is the only telnet/SSH upload entry point. `U` may have been telnet-only in express.e and not ported.

---

### 6. Sysop Upload (US Command)

**Entry Point → Upload Interface:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check | transfer-misc-commands.handler.ts:336 | checkSecurity(ACSPermission.SYSOP_COMMANDS) |
| 1b | EnvStat set | transfer-misc-commands.handler.ts:344 | _setEnvStat(session, EnvStat.UPLOADING) |
| 1c | Display UI | transfer-misc-commands.handler.ts:351 | _displayUploadInterface(socket, session, params) |
| 1d | File picker (same as web) | file-socket-handlers.ts:797 | processFileUpload() → all sysop uploads route through web picker |

**Per-File Processing:**

Same as Web File Picker (steps 2a-2n above). Sysops have no bypass—all go through DIZ extraction, file test, directory move, stats update.

**Batch Completion:**

Same as Web File Picker (steps 3a-3g above).

---

### 7. Mail Attachment Upload

**Status: NO DIRECT HANDLER FOUND**

Mail compose likely uses the same web file picker flow (handleUploadInterface → processFileUpload). No separate entry point identified in codebase. Attachments would go through the standard per-file pipeline (2a-2n).

---

## DOWNLOADS

### 1. Web File Picker Download

**Status: Not yet implemented in this codebase**

The batch download handler (batch-download.handler.ts) exists but web file-picker download logic not yet ported. Downloads currently route through the telnet `D` command path.

---

### 2. Web RZ-Style Transfer (Download via Zmodem)

**Status: Conceptual, not implemented**

No web-specific download-via-zmodem handler found. Web downloads use HTTP GET with `/api/download` endpoint (handled by Express routes, not the TS socket handlers).

---

### 3. Telnet/SSH Download via lrzsz (sz Command)

**Entry Point → Download Handler:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check | download.handler.ts:44 | checkSecurity(ACSPermission.DOWNLOAD) |
| 1b | Begin DLF | download.handler.ts:62 | beginDLF() → show DOWNLOAD screen + ratio checks |
| 1c | Ratio/byte gating | download.handler.ts:101 | creditAccountTrackDownloads + secLibrary checks |
| 1d | Display ratio avail | download.handler.ts:112 | Show "Files Avail before UL" or "KBytes Avail" |
| 1e | Ratio exceeded check | download.handler.ts:115 | IF cnt < 1 → "must upload first" |
| 1f | Flagged files load | download.handler.ts:158 | Merge session.flagManager + sessionFlaggedFiles into fileList |
| 1g | Filespec prompt | download.handler.ts:231 | showFilespecPrompt() loop |
| 1h | User filename input | download.handler.ts:276 | handleFilenameInput() per filename or blank to start download |
| 1i | File search | download.handler.ts:798 | findFilesInConference() with wildcard support |
| 1j | Accumulate files | download.handler.ts:281 | Collect all requested files into tempData.downloadFileList |
| 1k | "Last Chance" prompt | download.handler.ts:294 | showLastChance() before transfer |
| 1l | Confirm ratio cost | download.handler.ts:476 | Display files, sizes, and "proceed? (Y/N)" |

**File Transfer Initiation (lrzsz via telnet/SSH input handler):**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | **Web: not applicable** | — | Web uses HTTP GET, not ZMODEM |
| 2b | **Telnet/SSH: entry** | socket-handlers.ts:??? | Input handler routes `sz` command OR automatic on 'Y' |
| 2c | **Detect lrzsz** | lrzsz-transfer.service.ts:493 | isLrzszAvailable() |
| 2d | **Spawn sz** | lrzsz-transfer.service.ts:131 | spawn('sz', ['-b', '-vv', ...filePaths]) |
| 2e | **cwd = source dir** | lrzsz-transfer.service.ts:133 | CWD is dirname of first file |
| 2f | **stdout → wire** | lrzsz-transfer.service.ts:153 | normalizeHexHeaderTrailers() → transport.send() |
| 2g | **stdin ← wire** | lrzsz-transfer.service.ts:202 | handleInput() → proc.stdin.write() |
| 2h | **stderr progress** | lrzsz-transfer.service.ts:165 | proc.stderr listener logs transfer progress |
| 2i | **Exit wait** | lrzsz-transfer.service.ts:183 | proc.on('close') → finish(code === 0) |

**Post-Transfer Accounting:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | onComplete callback | (no handler found) | Should call download stat update |
| 3b | **MISSING: updateDownloadStats()** | download.handler.ts:??? | Not called in lrzsz download path |
| 3c | **MISSING: callersLog()** | download.handler.ts:??? | Not logged for lrzsz downloads |
| 3d | **MISSING: logDownload()** | download-logging.util.ts:??? | Not invoked for lrzsz path |
| 3e | **MISSING: Time credit debit** | ??? | No time cost applied for lrzsz downloads |
| 3f | **MISSING: Conference stats** | download.handler.ts:??? | Not updated for lrzsz downloads |
| 3g | **MISSING: Webhook trigger** | ??? | No download webhook for lrzsz |
| 3h | Return to menu | ??? | Manual 'D' command loop or input handler state |

**PARITY GAP: lrzsz downloads are missing the post-transfer accounting that web downloads have (see Web Download below).**

---

### 4. Telnet/SSH Download via Fallback zmodem.js

**Entry Point → ZmodemTransferManager:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | lrzsz unavailable | (inferred) | Falls back when isLrzszAvailable() = false |
| 1b | ZmodemTransferManager init | zmodem-transfer.service.ts:38 | new ZmodemTransferManager({direction:'download', paths:[...]}) |
| 1c | Sentry on_detect | zmodem-transfer.service.ts:50 | on_detect callback when remote sends ZRQINIT |
| 1d | Confirm role | zmodem-transfer.service.ts:104 | det.confirm() → 'send' (we send) |
| 1e | startSend path | zmodem-transfer.service.ts:139 | Async loop over paths |
| 1f | send_offer per file | zmodem-transfer.service.ts:152 | zsession.send_offer({name, size, mtime, ...}) |
| 1g | File stream send | zmodem-transfer.service.ts:169 | fs.createReadStream() → offer.send(chunk) on 'data' |
| 1h | Offer end | zmodem-transfer.service.ts:175 | offer.end() when stream ends |
| 1i | Session close | zmodem-transfer.service.ts:181 | zsession.close() after all files |
| 1j | session_end → finish | zmodem-transfer.service.ts:123 | finish(true) on session_end event |

**Post-Transfer Accounting:**

Same PARITY GAP as lrzsz (step 3a-3h above). No stat update, callersLog, webhook, or time debit.

---

### 5. Sysop Download (DS Command)

**Entry Point:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Permission check (inferred) | transfer-misc-commands.handler.ts:841 | DS → calls DownloadHandler.handleDownloadCommand() |
| 1b | D command delegate | transfer-misc-commands.handler.ts:844 | DownloadHandler.handleDownloadCommand() |

**Flow:**

Same as "Telnet/SSH Download via lrzsz/zmodem.js" above (steps 3a-3i). DS is just an alias to D with no special privilege bypass.

---

### 6. Batch Download Flow

**Entry Point → Batch Confirmation:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 1a | Flagged files collected | download.handler.ts:158 | session.flagManager.getAll() |
| 1b | Batch mode signal | (inferred) | User selects batch download mode |
| 1c | Batch handler called | batch-download.handler.ts:32 | handleBatchDownload() |
| 1d | Ratio check global | batch-download.handler.ts:99 | checkDownloadRatios() over all files |
| 1e | Summary display | batch-download.handler.ts:116 | List files, sizes, totals |
| 1f | Confirm prompt | batch-download.handler.ts:122 | "Start batch download? (Y/N)" |

**Batch Confirmation & Dispatch:**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 2a | handleBatchConfirm input | batch-download.handler.ts:135 | On user Y/N answer |
| 2b | Cancelled branch | batch-download.handler.ts:169 | If not 'Y'/'YES' → return to menu |
| 2c | Initiate loop | batch-download.handler.ts:179 | for (fileInfo in downloadList) emit 'download-file' |
| 2d | Download URL build | batch-download.handler.ts:186 | `/api/download/{confNum}/{dirNum}/{filename}` |
| 2e | Socket emit event | batch-download.handler.ts:189 | socket.emit('download-file') for each |
| 2f | Per-file stats update | batch-download.handler.ts:199 | updateDownloadStats(session, fileInfo, isFree) |
| 2g | Browser handles URLs | (client-side) | Frontend downloads each URL via HTTP GET |

**Per-File Accounting (batch-download.handler.ts):**

| Step | Handler | File:Line | Summary |
|------|---------|-----------|---------|
| 3a | updateDownloadStats | batch-download.handler.ts:??? | Calls applyDownloadStats() |
| 3b | User stats update | download-ratios.util.ts:??? | downloads++, bytesDownload+= |
| 3c | Conference stats update | batch-download.handler.ts:??? | Calls updateConferenceDownloadStats() |
| 3d | **MISSING: callersLog()** | ??? | Not found in batch path |
| 3e | **MISSING: logDownload()** | ??? | Not found in batch path |
| 3f | **MISSING: Webhook trigger** | ??? | Not found in batch path |
| 3g | Return to menu | batch-download.handler.ts:??? | After all emitted |

**PARITY GAP: Batch downloads may skip callersLog and webhook triggers.**

---

## MISSING COMPONENTS SUMMARY

### Upload Paths with Full Coverage ✓

- **Web file picker**: DIZ, test, move, DB, DIR, FILES.BBS, user stats, conf stats, callersLog, BBS event, webhook, sysop stats ✓
- **Telnet/SSH RZ (lrzsz)**: Routes through processBatchFile → identical to web ✓
- **Telnet/SSH RZ (zmodem.js)**: Routes through post-upload service → identical across transports ✓
- **US (sysop upload)**: Same web picker pipeline ✓

### Download Paths with Gaps ✗

| Feature | lrzsz | zmodem.js | batch web | notes |
|---------|-------|-----------|-----------|-------|
| Post-transfer accounting | ✗ | ✗ | ? | No updateDownloadStats called |
| callersLog | ✗ | ✗ | ? | "Downloaded file:" not logged |
| logDownload() | ✗ | ✗ | ? | download-logging.util unused |
| Time cost debit | ✗ | ✗ | ? | No timeLimit adjustment |
| Conference stats | ✗ | ✗ | ? | conf.downloads/bytesDownload not updated |
| Webhook trigger | ✗ | ✗ | ? | No NEW_DOWNLOAD event sent |
| BBS event emit | ✗ | ✗ | ? | No LiveChat integration |

---

## Per-File Processing Pipeline Details

### Shared for ALL UPLOADS (processBatchFile @ file-socket-handlers.ts:264)

**DIZ Extraction:** file-socket-handlers.ts:330-361
- Attempted if !skipDizExtraction
- extractAndReadDiz() + 10sec timeout
- On success: replaces description, sets hasDiz marker
- On timeout/fail: uses batch description or prompts user

**File Integrity Test:** file-socket-handlers.ts:364-400
- testFile() with 15sec timeout
- Sets checkedMarker = 'P'|'F'|'N'|'D'
- 'F' (failed) → moves to HOLD directory automatically
- 'N' (not tested) → keeps current status

**Directory Move:** file-socket-handlers.ts:416-431
- moveUploadedFile() to status-specific directory
- fileStatus = 'active'|'private'|'hold' based on test result
- Uses fileArea.dlPath from conf config

**Duplicate Detection:** file-socket-handlers.ts:433-449
- SELECT * FROM file_entries WHERE LOWER(filename) = normalized_name AND areaid = fileArea.id
- Duplicate → moves to HOLD, sets checkedMarker = 'D', skips DB insert
- Non-duplicate → continues to DB insert

**Database Entry:** file-socket-handlers.ts:451-474
- createFileEntry() with filename, description, size, uploader, date, status, checked marker
- Stores FILE_ID.DIZ text if extracted
- Skipped for duplicates

**DIR File Write:** file-socket-handlers.ts:476-539
- writeUploadToDirFile() to DIR{maxDirs}
- Always numbered DIR (never named)
- Includes sentBy_files from node config
- Also writes FILES.BBS for door compatibility

**User Stats Update:** file-socket-handlers.ts:541-612
- Only if !foundDupe AND creditAccountTrackUploads()
- db.run UPDATE users: uploads+1, bytesupload+sz, topuploadcps (CASE when new high)
- db.run UPDATE user_stats: bytes_uploaded+sz, files_uploaded+1
- userFileManager.updateUserDataFile() (disk: slots/misc files)

**Conference Stats Update:** file-socket-handlers.ts:614-632
- Only if !foundDupe AND creditAccountTrackUploads() AND CONFERENCE_ACCOUNTING
- db.updateConference(): uploads+1, bytesUpload+sz

**CallersLog Entry:** file-socket-handlers.ts:636-643
- Only if !foundDupe
- Format: "Uploaded file: {filename}"

**BBS Event:** file-socket-handlers.ts:647-662
- Only if !foundDupe
- emitUpload() for LiveChat integration

**Webhook Trigger:** file-socket-handlers.ts:666-685
- Only if !foundDupe
- webhookService.sendWebhook(NEW_UPLOAD, {username, userId, filename, filesize, conf, description})

**Sysop Stats:** file-socket-handlers.ts:687-701
- updateSysopUploadStats() for all files (even duplicates)
- Updates NumULs (conf-level counter) and SysopStats/NumULs_{confId}[HOLD]

---

### Post-Upload Completion (post-upload.service.ts:55)

Called by ALL transports (web, telnet/SSH lrzsz, telnet/SSH zmodem.js) with identical stats.

**Stats Calculation:**

```typescript
ulTTTM = Date.now() - uploadStartTime (seconds)
bytesKB = uploadedBytes / 1024
cps = uploadedBytes / ulTTTM
eff = efficiencyPct (from context, e.g., 100 for web)
```

**Output:**

- "File Uploading Complete..." banner (post-upload.service.ts:68)
- Stats line: "N file(s), Xk bytes, M minute(s), S second(s), Z cps, E% efficiency." (post-upload.service.ts:70)
- callersLog entry: stats line or "Upload Failed.." (post-upload.service.ts:78-82)

**Sysop Notify:**

- doUploadNotify() only if uploadedFiles > 0 (post-upload.service.ts:90-103)
- Triggers EXECUTE_ON_UPLOAD script
- Sends mail notification

**Time Credit:**

```typescript
peff = (ulTTTM * 3/2) + 60 seconds (only if uploadedFiles > 0 && ulTTTM > 0)
timeIncreasedMins = floor(peff / 60)
session.timeLimit += peff
```
(post-upload.service.ts:106-118)

**Cleanup & Menu Return:**

- ctx.onCleanup?.() (web calls clearUploadContext) (post-upload.service.ts:122-126)
- subState = DISPLAY_MENU (post-upload.service.ts:143)
- menuPause = true (post-upload.service.ts:143)
- "Press any key to continue..." prompt (post-upload.service.ts:142)

---

## Directory Structure Reference

```
/web/backend/src/
├── handlers/
│   ├── commands/
│   │   └── transfer-misc-commands.handler.ts      (RZ, US, VO, UP, DS commands)
│   ├── file/
│   │   ├── download.handler.ts                    (D command, filespec loop, ratio gating)
│   │   └── file.handler.ts                        (F command, file listing)
│   ├── transfer/
│   │   └── batch-download.handler.ts              (batch DL UI & confirmation)
│   └── screen.handler.ts                          (DOWNLOAD screen display)
├── server/
│   ├── file-socket-handlers.ts                    (web upload UI, processBatchFile, handleUploadBatchComplete)
│   ├── socket-handlers.ts                         (main command router)
│   └── upload-session-store.ts                    (context persistence)
├── services/
│   ├── lrzsz-transfer.service.ts                  (sz/rz child process manager)
│   ├── zmodem-transfer.service.ts                 (zmodem.js wrapper)
│   ├── post-upload.service.ts                     (shared post-receive pipeline)
│   ├── bbs-event-emitter.ts                       (emitUpload, emitDownload)
│   └── webhook.service.ts                         (NEW_UPLOAD trigger)
├── utils/
│   ├── upload-notify.util.ts                      (doUploadNotify, updateSysopUploadStats)
│   ├── download-ratios.util.ts                    (ratio gating, updateDownloadStats)
│   ├── download-logging.util.ts                   (logDownload — unused in current flows)
│   ├── file-diz.util.ts                           (extractAndReadDiz)
│   ├── file-test.util.ts                          (testFile, TestResult enum)
│   ├── file-hold.util.ts                          (moveUploadedFile, getConferenceDir)
│   ├── dir-file.util.ts                           (writeUploadToDirFile)
│   ├── files-bbs.util.ts                          (writeToFilesBBS)
│   └── date-time.util.ts                          (getSystemTime)
└── database/
    └── (file operations via db.createFileEntry, db.updateConference, etc.)
```

---

## Express.e Reference Cross-Index

| express.e Line | Description | TS Handler | TS Line |
|---|---|---|---|
| 25608-25621 | internalCommandRZ | transfer-misc-commands.handler.ts:83 | handleZmodemUploadCommand |
| 25660-25665 | internalCommandUS | transfer-misc-commands.handler.ts:334 | handleSysopUploadCommand |
| 24853-24858 | internalCommandD | download.handler.ts:38 | handleDownloadCommand |
| 28302 | internalCommandDS | transfer-misc-commands.handler.ts:841 | handleDownloadWithStatusCommand |
| 18944-19130 | uploadaFile post-receive | post-upload.service.ts:55 | runPostUpload |
| 19258-19285 | FILE_ID.DIZ extraction | file-socket-handlers.ts:330 | extractAndReadDiz in processBatchFile |
| 19348-19354 | File integrity test | file-socket-handlers.ts:364 | testFile in processBatchFile |
| 19403-19415 | Move to directory | file-socket-handlers.ts:416 | moveUploadedFile in processBatchFile |
| 19473-19509 | DIR file append | file-socket-handlers.ts:476 | writeUploadToDirFile |
| 19530+ | Conference stats update | file-socket-handlers.ts:614 | db.updateConference |
| 9493 | callersLog | file-socket-handlers.ts:636 | callersLog in processBatchFile |
| 18746 | sysopULStats | upload-notify.util.ts:42 | updateSysopUploadStats |
| 19784-19789 | downloadPrompt formatting | download.handler.ts:240 | showFilespecPrompt |
| 20107+ | Download filename input loop | download.handler.ts:276 | handleFilenameInput |
| 13750-13772 | pGoodbye countdown | download.handler.ts:629 | startPGoodbye |

---

## Key Observations for Diff Against express.e

1. **Parity: Uploads** — All uploads (web, telnet RZ, sysop) converge on processBatchFile + runPostUpload. Complete feature parity with express.e per-file pipeline and post-receive stats.

2. **Gap: Download Accounting** — lrzsz and zmodem.js download paths do NOT call updateDownloadStats, logDownload, or emit webhooks. Web batch download may also be incomplete. This is a critical parity gap vs. express.e which logs every download.

3. **Gap: Mail Attachments** — No dedicated upload entry point for mail attach found. Likely routes through web picker, but not explicitly verified.

4. **Gap: Interactive U Command** — Telnet/SSH `U` command (enter filename at prompt before upload) not found. Only `RZ` (automatic zmodem initiate) is implemented.

5. **Transport Isolation** — lrzsz and zmodem.js are clean abstractions with onComplete callbacks that feed into the shared post-upload pipeline. Good design for maintaining parity across transports.

6. **Web Upload ≠ Web Download** — Web upload is fully implemented (file picker → processBatchFile → post-upload). Web download still uses HTTP GET (/api/download endpoint, Express routing, not socket.io handlers).

---

## Test Coverage Recommendations

**High Priority (Parity-Critical):**
1. Verify download post-transfer stats are persisted (updateDownloadStats path for lrzsz)
2. Verify callersLog entries exist for lrzsz/zmodem downloads
3. Verify webhook NEW_DOWNLOAD triggers on download complete
4. Verify time cost debit applied to timeLimit on download

**Medium Priority:**
1. Test U command implementation (or document as not-ported)
2. Test mail attach upload flow
3. Verify batch download callersLog/webhook coverage
4. Verify conference stats update for all download paths

**Low Priority:**
1. Verify DIZ extraction timeout behavior (10sec is intentional?)
2. Test file integrity test timeout (15sec is intentional?)
3. Verify sentBy_files logic across all conferences

