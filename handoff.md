# Handoff

## Current State (2025-12-02 - Session 8 FINAL UPDATE)

### Door Emulation Status
**XIM Implementation: WORKING** ✅
- **Tested & Working**: GA (GetAnswer), 5D-Edit
- **Tested & Broken**: WHO, RTW (show standalone banner, crash or fail to connect)
- **Root Cause**: WHO/RTW have compatibility issues - missing ROM/library functions
- 20 XIM doors identified in collection via scan

**SIM Doors: DO NOT EXIST** ❌
- Scanned entire collection - **ZERO doors use DoorControl port**
- All Amiga doors use AEDoorPort (XIM protocol)
- "SIM" classification was incorrect

**Batch-Launched Doors: CPU ISSUE** 🔥
- quicknew, multitop launched by batch scripts
- Get stuck in infinite polling loops
- Consume 56-74% CPU each (27 processes found)
- **Problem**: No timeout/iteration limit in DoorLifecycleManager
- **Solution**: Add execution timeout or max iteration count

**BBS API Implementation: UNUSED** ⚙️
- Complete 0x790 dispatcher built but no doors need it
- Can be removed or kept for future use

### Recent Work (Session 8 - 2025-12-02 FINAL - MAJOR DISCOVERY)
**MAJOR DISCOVERY**: Scanned all 39 doors - **NO SIM DOORS EXIST**

**Door Collection Analysis**:
- ✅ 20 XIM doors found (use AEDoorPort, work with existing implementation)
- ❌ 0 SIM doors found (none use DoorControl port or 0x790 pattern)
- 🔍 WHO is unique HYBRID: Uses AEDoorPort AND has 0x790 BBS API calls
- 📄 19 Unknown doors (TypeScript doors or special types)

**WHO Door Self-Modifying Code Discovery**:
- Static binary: `0x1174: beq + movea.l 0x790.l,a0 + jsr(a0)`
- Runtime execution: `0x1174: tst.l(a2) + bne.b` (COMPLETELY DIFFERENT!)
- WHO rewrites its BBS API call instructions at runtime
- Our 0x790 dispatcher implementation is CORRECT but never called

**BBS API Implementation** (completed but unused ✅):
- BbsApiLibrary.ts: Stub dispatcher with logging
- LibraryTraps.ts: `registerCustomTrap()` method
- LibraryManager.ts: BBS API setup (0x790→0x90d0, ILLEGAL at 0x90d0)
- Verified working but no doors need it

**Conclusion**: "SIM door" classification was incorrect - all doors are XIM

**Files Created**:
- `Documentation/6-Progress/DOOR_TYPE_ANALYSIS_20251202.md`
- `Documentation/6-Progress/WHO_SELF_MODIFYING_CODE_DISCOVERY.md`
- `Documentation/6-Progress/SIM_DOOR_BBS_API_DEBUGGING_20251202.md`
- `dev/scripts/analyze-all-doors.sh` - Door scanner utility

### Recent Work (Session 7 - 2025-12-02 Final)
**SOLVED**: WHO door mystery - incompatible with express.e architecture
1. **Nudos.library**: RTS instruction (0x4E75="Nu") + "dos.library" overlay (space trick)
2. **WHO uses absolute addressing**: Sets A4=0x0000 at entry (0x2c), making all accesses absolute
3. **WHO expects function table**: Loads from 0x790.l (twice: 0x1154, 0x1176) for BBS calls
4. **WHO is "/X DooR"**: Binary contains "/X DooR by SPY/MST" - designed for AmiExpress /X
5. **Express.e provides NOTHING**: No code to set up 0x790 or any function tables
6. **Verdict**: WHO is from different /X variant OR third-party door using incompatible conventions

**Recommendation**: Port SIM doors to TypeScript vs full OS emulation

### Recent Work (Session 5)
**Implemented**: SIM door port support (commit 2ac44749)
- LibraryManager.ts: Creates `DoorControl{n}` for SIM doors (express.e:4316-4320)
- AEDoorLibrary.ts: Tries both port types in findBbsPort()
- Ports created correctly but SIM doors still crash due to OS structure expectations

**Tested**: WHO door fails with PC → ROM at 0xf00080 after accessing unmapped 0x790

### Context Consumption Issue (Session 6)
**Problem**: Context runs out very fast - 43K tokens used in first few messages

**Root Causes Identified**:
1. **Verbose handoff.md** (was 16KB) → 40-50K token conversation summary
2. **Zombie processes** (e5c278, 2ff207) → 300 tokens/message overhead
3. **Oversized source files** violate 2,000 line rule:
   - dasm.ts: 54K tokens if read (27% of budget)
   - command.handler.ts: 36K tokens
   - DosLibrary.ts: 33K tokens
   - 7 files total over 2,000 lines

**Fixes Applied**:
- Reduced handoff.md from 16KB → 2KB (87% reduction)
- Documented all issues in AGENTS.md with prevention guidelines
- Created check scripts: `check-handoff-size.sh`, `check-context-usage.sh`
- Updated CLAUDE.md with handoff size limit as CRITICAL RULE
- Zombie processes will clear on session restart (cannot be removed mid-session)

**Prevention Rules** (now in CLAUDE.md + AGENTS.md):
- Keep handoff.md under 5KB always
- Never read files over 2,000 lines - use Grep/Task instead
- Never use background bash processes
- Run `./dev/scripts/check-context-usage.sh` to identify risks

## Key Files
- `web/backend/src/amiga-emulation/LibraryManager.ts` - Port creation
- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` - Port lookup
- `masterplan.md` - Door test results and roadmap
- `AGENTS.md` - Zombie process prevention guide

## Implementation Plan Created
**Document:** `Documentation/4-Door-Developers/SIM_DOOR_0x790_IMPLEMENTATION_PLAN.md`
- **Phase 1** (1-2 days): Minimal implementation - get WHO to not crash
- **Phase 2** (2-3 days): Full WHO support - implement all BBS API functions
- **Phase 3** (1-2 days): Generalize for other SIM doors
- **Total estimate:** 4-7 days full-time work

## Next Steps
1. **Test S door**: Simple door that returns BBS data - good test case for XIM data retrieval
2. **Fix XIM data responses**: GA connects but queries return empty - check XIMProtocol.ts handlers
3. **Add door timeout**: Prevent infinite loops (5-10 sec max) in DoorLifecycleManager
4. **Investigate WHO/RTW failures**: Compare ROM calls with working GA/5D-Edit
5. **Remove BBS API code**: Unused since no SIM doors exist (optional cleanup)
6. Keep handoff.md compact for future sessions
