# Handoff - Bulls XIM Door (2025-12-03 Session 29)

## Session Achievements

**Major Progress**:
1. ✅ Bulls successfully enters XIM mode
2. ✅ Bulls sends JH_INIT and JH_STAT messages to BBS
3. ✅ BBS correctly replies to Bulls' reply port
4. ✅ Implemented SetSignal (Exec LVO -306)
5. ✅ Identified self-modifying code behavior
6. ✅ Root cause found: JSR offset calculation error

## Technical Summary

**What Works**:
- CLI argument pointer injection (A4+0x6c16 → 0xd0000)
- CreateMsgPort creation (reply port at 0xa0400)
- XIM message protocol (INIT + STAT sent successfully)
- SetSignal implementation (not yet reached, but needed for message loop)

**Root Cause of Crash**:
Bulls crashes at PC=0x11ba during JSR execution (iteration 12809 never completes).

**Self-Modifying Code Details**:
- File offset 0x11ba contains: 0x2e08 (move.l a0, d7)
- Memory at runtime contains: 0x4eba (JSR with PC-relative offset 0x2924)
- Bulls patches this during execution (HUNK relocations don't include 0x11ba)
- Writes occur at PC=0x0 (during initialization, not visible in watchpoints)

**JSR Offset Error**:
- JSR at 0x11ba targets 0x3ae0 (offset 0x2924)
- Actual function entry is at 0x3ad0 (move.l a5, -(a7) = function prologue)
- Offset is **0x10 bytes too large** (16 bytes)
- Correct offset should be 0x2914 to target 0x3ad0
- Bulls' self-modification logic calculates offset incorrectly

**Why Crash Occurs**:
- JSR targets middle of function (0x3ae0) instead of entry (0x3ad0)
- Function entry code is skipped (A5 not saved to stack)
- Stack state becomes invalid
- PC eventually becomes 0x0 (stack corruption)

## System State at Crash

```
PC: 0x11ba (JSR instruction with wrong offset)
Instruction: 0x4eba 0x2924 (JSR 0x2924(PC) → target 0x3ae0)
A4: 0x5c08 (correct - Bulls data segment + 8)
SP: 0x8e2c → 0x8e24 (8 bytes pushed, but JSR should only push 4)
Iteration: 12809 (never completes)
```

## Fix Options

### Option 1: Patch JSR Offset After Bulls Modifies It
**Approach**: Add watchpoint for 0x11ba, detect write, correct offset from 0x2924 to 0x2914
**Pros**: Minimally invasive, targets specific issue
**Cons**: Requires watchpoint infrastructure enhancement

### Option 2: Find and Fix Bulls' Self-Modification Logic
**Approach**: Locate where Bulls calculates JSR offset, identify why it's +0x10 too large
**Cons**: Complex, Bulls code is obfuscated, may have multiple self-mod locations

### Option 3: Disable Self-Modification, Use Static Patching
**Approach**: Prevent Bulls from writing to code, inject correct JSR statically
**Cons**: Requires understanding all self-mod locations, may break other features

### Option 4: Fix Stack State After Bad JSR
**Approach**: Detect when PC enters 0x3ad0-0x3aff range, adjust stack/A5
**Cons**: Fragile, doesn't address root cause

**Recommended**: Option 1 (patch offset after Bulls modifies it)

## Next Steps

1. **Add JSR offset correction**:
   - Monitor writes to 0x11ba-0x11bd
   - When 0x4eba detected, check next word (offset)
   - If offset is 0x2924, correct to 0x2914

2. **Test corrected JSR**:
   - Verify Bulls reaches 0x3ad0 (function entry)
   - Confirm A5 is saved to stack properly
   - Check if Bulls proceeds to message loop at 0x2a18

3. **If successful**:
   - Bulls should enter message processing loop
   - SetSignal will be called
   - Bulls should process XIM messages from BBS

## Key Files

- `web/backend/src/amiga-emulation/DoorLoader.ts:505-603` - Bulls setup
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts:857-863, 1483-1510` - SetSignal
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts:1137-1147` - Crash detection

## Context Budget

Session 29 used ~100K / 200K tokens (50%) - healthy for continued work.

## Commit

Commit 7188bf19: SetSignal implementation + self-modifying code discovery
