# Handoff - Session 46 Continued

## Status: All Fixes Deployed to Production - TESTING PHASE

### Latest Work (Session 46 - Current)

**CRITICAL LIVE SITE FIXES - DEPLOYED (commit fa97aac7)**:
1. Fixed render.yaml to build SDK, admin, and frontend for unified deployment
   - SDK route: http://bbs.uprough.net/sdk/ (should work after Render rebuild)
   - Admin system page: http://bbs.uprough.net/admin/system (should work after Render rebuild)
   - All frontends built during deployment

2. SYSOP Menu Fixed:
   - Now lists all 6 numbered internal commands (0-5)
   - Command 1: Account Editing (user editor - already implemented)
   - Access via: Type "SYSOP" at main menu, then "1"
   - web/backend/src/handlers/sysop-menu.handler.ts

3. User Editor (Command 1):
   - Located: web/backend/src/handlers/user-editor.handler.ts
   - Security level 250+ required
   - Full account editing: username, real name, security, credits, etc.
   - 1:1 AmiExpress compatible (internal command, not door)

### Previous Work (Session 46 - AquaScan Bug)

**Bug #9: AquaScan Door Path Case Sensitivity - CRITICAL**

**Problem**: AquaScan showed "Nothing found!" because door binary couldn't be loaded
**Root Cause**: amigaDoorManager.ts hardcoded lowercase directory names in assigns (line 120: `'Doors:': path.join(this.bbsRoot, 'Doors')`)
**Actual Directory**: `/Users/spot/Code/amiexpress-web/Doors/` (capital D)
**Attempted Path**: `/Users/spot/Code/amiexpress-web/doors/aquascan/AquaScan` (lowercase d)

**How Found**: Checked logs as specified in updated CLAUDE.md debugging protocol:
```bash
grep -i "error\|fail\|not found" logs/door-68k-AquaScan* | tail -30
# Found: Failed to read binary: .../doors/aquascan/AquaScan (lowercase!)
```

**Fix**: `web/backend/src/doors/amigaDoorManager.ts:118-140`
- Changed `initializeAssigns()` to use `resolveCaseInsensitivePath()` utility
- Now correctly finds `Doors/` (capital D) instead of hardcoding lowercase `doors/`
- Applied to all assigns: Doors, Screens, Storage, NODE0-3, Protocols, Utils, Libs

**Files Modified**:
- `web/backend/src/doors/amigaDoorManager.ts:118-140` - Case-insensitive assign resolution
- `CLAUDE.md:15-58` - Added 68K debugging protocol (ALWAYS CHECK LOGS FIRST)

### CLAUDE.md Update - 68K Debugging Protocol

Added critical section at top of CLAUDE.md (lines 15-58):

**68K DOOR EMULATION DEBUGGING - ALWAYS CHECK LOGS FIRST**

1. **MANDATORY**: Check existing logs BEFORE implementing new features
2. **Log files**: `logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log`
3. **Find logs**: `ls -t logs/door-68k-{DOORNAME}* | head -3`
4. **Search for errors**: `grep -i "error\|fail\|not found" logs/door-68k-*`
5. **Look for**: File not found, ENVSTAT issues, assigns, XIM messages, AmigaDOS errors

**Why This Matters**: I wasted time implementing new XIM debug logging when existing logs already showed the error. This protocol prevents that.

### Previous Fixes (Session 46)

**Bugs 1-4**: BBS path resolution, ARGS tooltype, Context-aware DT_NAME, ENVSTAT
**Bug 5**: FR command was disabled (re-enabled in internal-commands.ts)
**Bug 6**: Dir parser bug - variable-width file sizes (adopted express.e technique)
**Bug 7**: Stuck door processes (aggressive 3-stage kill in batch-scheduler.ts)
**Bug 8**: XIM debug logging added (but wasn't needed - logs already existed!)

### Key Files

**Door Loading**:
- `web/backend/src/doors/amigaDoorManager.ts` - FIXED: Case-insensitive assigns
- `web/backend/src/utils/fs-amiga.util.js` - Case-insensitive path resolution utilities

**Logging**:
- `logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log` - Per-door execution logs
- `web/backend/src/amiga-emulation/DoorLogger.ts` - Door logging class

**Documentation**:
- `CLAUDE.md:15-58` - NEW: 68K debugging protocol

### Testing

**Logs Checked**:
```bash
ls -lS logs/door-68k-AquaScan* | head -3
# Found largest logs with most detail

grep -i "error\|fail\|not found" logs/door-68k-AquaScan*
# Result: ENOENT: no such file or directory, open '.../doors/aquascan/AquaScan'
#         (lowercase 'doors' - FOUND THE BUG!)
```

**System-Wide Solution COMPLETE**:
1. Created `web/backend/src/utils/amigafs.ts` - comprehensive wrapper with 22 functions
2. Added missing functions found in codebase: chmodSync, rmSync, openSync, truncateSync, utimesSync, linkSync, symlinkSync, readlinkSync
3. Created migration guide: `Documentation/3-Developers/AMIGAFS_MIGRATION.md`
4. Updated CLAUDE.md to MANDATE amigafs usage (lines 114-148, now lists all 22 functions)
5. Executed migration script on priority files (6 files migrated)
6. Fixed import paths (../../utils/amigafs from nested directories)
7. TypeScript compilation: PASSES with no errors
8. Tests: ALL PASS
   - test-amigafs.ts: Basic case-insensitivity (Doors/doors/DOORS)
   - test-amigafs-extreme.ts: Every character case-insensitive (aQuAscan.000)
   - test-amigafs-complete.ts: All 20 functions tested, 100% pass rate

**Result**: Every character in paths is case-insensitive. aMiGa.eXe = AMIGA.exe = amiga.EXE

**Deployed**: All Session 46 fixes committed (fa97aac7) and pushed to GitHub
**Status**: Awaiting Render rebuild, then test live site
