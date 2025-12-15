# Session Handoff - 2025-12-15

## Critical Architectural Fix: Real AEDoor.library Implementation

**Status**: COMPLETE - Fixed fundamental design flaw from Dec 11 commits onward

### What Was Fixed

**Problem**: TypeScript trap-based reimplementation of AEDoor.library
- Commits after Dec 11 used ILLEGAL instruction traps
- TypeScript AEDoorLibrary class reimplemented library functions
- Duplicated functionality from real binary (./Libs/AEDoor.library)
- C door SDK had non-functional stub implementations

**Solution**: Use REAL AEDoor.library binary execution
- Load actual 1128-byte Amiga binary via LibraryLoader
- CPU executes real 68K code when doors call library functions
- Bridge ONLY message port I/O (PutMsg/GetMsg) to XIMProtocol
- No TypeScript reimplementation needed

### Changes Made (Commit 8e25d2ffd)

**Phase 1**: ExecLibrary.loadRealAEDoorLibrary() enhancement
- Uses LibraryLoader for proper HUNK parsing and relocations
- Loads real library at startup, registers in library list

**Phase 2**: Disabled TypeScript traps in LibraryTraps.ts
- Commented out AEDOOR_VECTORS array (19 trap handlers)
- Modified installAEDoorVectors() to skip trap installation
- CPU now executes real library code instead of TypeScript

**Phase 3**: Verified message port bridge
- ExecLibrary.putMsg() intercepts library's PutMsg calls
- Routes to XIMProtocol.handleMessage() via doorMessageCallback
- ExecLibrary.getMsg() returns BBS replies to library
- Complete message flow validated

**Phase 4**: Documentation and deprecation
- Added warnings to AEDoorLibrary.ts (methods now unused)
- Added warnings to glue-amiga.c (stub implementations wrong)
- Created AEDOOR_ARCHITECTURE_FIX.md (complete plan)
- Created C_DOOR_ARCHITECTURE_ISSUES.md (C SDK problems)

### Architecture Flow

```
Door calls CreateComm()
  → CPU executes real AEDoor.library 68K code
  → Library calls PutMsg(AEDoorPort, msg)
  → ExecLibrary.putMsg() intercepts
  → doorMessageCallback invoked
  → XIMProtocol.handleMessage(msg)
  → BBS processes XIM command
  → replyMsg() called
  → putMsg(replyPort, reply)
  → Library calls GetMsg(replyPort)
  → ExecLibrary.getMsg() returns reply
  → Library returns result to door
```

### Files Modified

- web/backend/src/amiga-emulation/api/ExecLibrary.ts
- web/backend/src/amiga-emulation/api/LibraryTraps.ts
- web/backend/src/amiga-emulation/api/AEDoorLibrary.ts
- dev/c-doors/src/glue-amiga.c
- AEDOOR_ARCHITECTURE_FIX.md (new)
- C_DOOR_ARCHITECTURE_ISSUES.md (new)

### Impact

- Real library does all the work (1:1 AmigaOS compatibility)
- TypeScript AEDoorLibrary.ts methods now deprecated/unused
- Message port IPC is the ONLY bridge point
- Minimal code, maximum correctness

### References

- Real library: ./Libs/AEDoor.library (1128 bytes, 18 May 1996)
- Architecture: AEDOOR_ARCHITECTURE_FIX.md
- C door issues: C_DOOR_ARCHITECTURE_ISSUES.md
- Baseline commit: 25ed673cb (Dec 11, 2025)
