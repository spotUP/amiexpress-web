# Handoff - 2026-01-29

## Current Work: ZooStats (S) Door - GOLDEN

### Problem (was)
ZooStats (S) door showed all zeros for user data:
- User #0, Level 0, Conference #0, Time 0, Name empty, Location empty

### Root Cause Found
ZooStats **does** call `Read()` to get user data from `bbs:node1.user` file. The file content was correct all along. The previous debugging session didn't log Read() calls to console, making it appear ZooStats wasn't reading the file.

### Resolution
The bug was already fixed in a previous session:
- `NodeFileManager.ts`: Writes correct binary user struct to `node{n}.user`
- `DosLibrary.ts`: Read() returns file contents correctly
- `FileManager.ts`: Opens and reads files properly

### Temp File Deletion Issue - FIXED & VERIFIED
ZooStats reported "RAM:T/ZOOSTAT.TMP was NOT deleted" because it uses `Execute("delete RAM:T/ZOOSTAT.TMP")` to delete its temp file, but our Execute() implementation didn't handle the DELETE command.

**Root Cause:** DosLibrary.Execute() only supported DATE, AVAIL, INFO, VERSION, SHOWCONFIG commands. DELETE fell through to "UNSUPPORTED" and returned failure (D0=0).

**Fix:** Added DELETE command support to Execute() in `DosLibrary.ts:3477-3509`:
- Parses target filename from command
- Resolves Amiga path to system path via PathManager
- Deletes file using amigafs.unlinkSync()
- Returns success (DOSTRUE=-1) or failure with appropriate IoErr

**Status:** Confirmed working - ZooStats now completes without error message.

### ANSI Regex Bug - FIXED
Missing characters in output: `[zOOROPA` displayed as `OOROPA`.

**Root Cause:** `emitText()` in `io.ts:1400` had regex `\d*` (zero or more digits) which incorrectly matched `[z` as a bare ANSI code, converting it to `ESC[z` which xterm consumed.

**Fix:** Changed `\d*` to `\d+` (one or more digits) so `[32m` still converts but `[zOOROPA` is left alone.

### Test Results (Working)
```
.-[ nOW pROCESSING uSER #1 aT AmiExpress-Web nODE #1: ]---------------------.
 | nAME: sysop                     fROM: Server Room              lEVEL: 255 |
 | cONNECT: 115200 bAUD.     cONFERENCE : #25 - Main                         |
 | uP'd   :      5.120.000 bYTES -   50 fILES.| aVAIL :    536.870.912 bYTES.|
 | dOWN'd :      2.560.000 bYTES -   25 fILES.|              uNLIMITED fILES.|
```

### Key Files
- `web/backend/src/services/NodeFileManager.ts` - writes node.user files
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` - DOS Read/Write/Open
- `web/backend/src/amiga-emulation/api/FileManager.ts` - file handle management

### Next Steps (if continuing)
1. Fix RAM:T/ temp file deletion (minor cleanup issue)
2. Continue with TELNET_CONNECT implementation per existing plan
