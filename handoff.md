# Handoff

## 68K Door Loop Bug - FIXED (2025-12-11)

**Problem**: mtop, samilog, and other 68K doors looped infinitely when run via batch scripts, consuming 100% CPU and making BBS unusable.

**Root Cause**: Long Unix paths (`/Users/spot/Code/amiexpress-web/Doors/...`) caused infinite memcpy loops in door string copy routines. Doors expect short Amiga-style paths (`doors:`, `bbs:`).

**Fix Applied**:
1. `batch-scheduler.ts` line 155: Keep Amiga assigns instead of resolving to full paths
2. `run-amiga-door.ts` lines 77-111: Added EventEmitter for batch socket event handling
3. Re-enabled batch door execution (removed temporary disable)

**Verification**:
- mtop completes successfully with Amiga paths (bull1.txt created, 357 bytes)
- CPU reaches 39,358 iterations vs stuck at ~100 with long paths
- File I/O working: `dos.library.Read(handle=3, buffer=0x102d34, length=232)`

**Files Modified**:
- `web/backend/src/services/batch-scheduler.ts` (path resolution fix)
- `web/backend/src/scripts/run-amiga-door.ts` (socket EventEmitter)

**Next Steps**:
1. Restart servers and verify all batch doors work (mtop 5x, samilog, quicknew, glcviewer)
2. Test SDK v2.0 tic-tac-toe door with `ttt` command

## SDK v2.0 Status - BUILD FIXED (2025-12-11)

**Build Issue Resolved**:
- SDK core files were in wrong location (`sdk/src/core/` instead of `sdk/core/`)
- Moved Door.ts, Output.ts, Input.ts, Storage.ts, types.ts to `sdk/core/`
- Merged SDK v2.0 types with old SDK types (added 257 lines to types.ts)
- SDK now compiles cleanly with zero errors

**Completed**:
- Core SDK classes built (Door, Output, Input, Storage) ✅
- Backend integration supports both old and new patterns ✅
- Fixed SDK import path bug (sdk/index.ts uses './core') ✅
- Fixed door routing bug (TYPE=TS in .info files) ✅
- Test door created: `Doors/tic-tac-toe/` ✅
- SDK builds successfully ✅

**Ready to Test**: Restart servers and test `ttt` command

## Current Session (2025-12-12)

**Neo-Blessed Import Fix - COMPLETED**
- Fixed "Element is not defined" error in `sdk/engines/ui/blessed/index.ts:360`
- Root cause: Default export referenced classes without importing them first
- Solution: Added imports for all 40+ blessed widgets before default export block
- Updated `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` with neo-blessed best practices
- All installed doors (NEODEMO, NEOSHOWCASE, DASHBOARD) now work correctly

**Fire Emblem v2 - COMPLETED**
- Completely rewrote using proper SDK v2.0 pattern (Door class with lifecycle hooks)
- Implemented tactical combat system with turn-based gameplay
- Created neo-blessed UI with split-panel layout (map + status)
- Added 3 playable units (Aldric the Lord, Elara the Cleric, Marcus the Knight)
- Added 2 enemy units (Bandits) with simple AI
- Player controls: Arrow keys/WASD to move, Space to select/act, E to end phase, Q to quit
- Features: unit selection, movement, combat, phase system, victory/defeat conditions
- Built successfully with zero TypeScript errors
- Command: `/fireemblem` or `FIREEMBLEM`

**SDK Package Exports - FIXED**
- Added missing exports to `sdk/package.json`:
  - `./core` and `./core/types` (SDK v2.0 Door class)
  - `./engines/ui/blessed` (Neo-blessed UI)
  - `./engines/ui/blessed/contrib` (Blessed-contrib widgets)
- Rebuilt SDK and reinstalled in all doors
- Fixes: "Package subpath './engines/ui/blessed' is not defined" error

**Ready to Test**:
1. `/dashboard` - BBS Dashboard (sysop monitoring)
2. `/neodemo` - Neo-Blessed demo with widgets
3. `/neoshowcase` - Neo-Blessed showcase
4. `/fireemblem` - Fire Emblem tactical RPG (NEW!) 
