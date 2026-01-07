# Handoff

## Current State (2026-01-07)

### Dynamic Task Allocation - FULLY RESOLVED

**Three compounding bugs fixed:**

1. **Binary defect (joincnf):** Missing BSS relocation at offset 0x3C
   - ✅ Synthetic relocation in HunkLoader.ts (offset 0x14)

2. **Hardcoded Task address:** ExecLibrary used 0x90000 for all doors
   - ✅ Dynamic allocation via allocateDoorTask() after door segments
   - ExecLibrary.ts: allocateDoorTask(doorSegmentEnd)
   - DoorLoader.ts: calculate highest segment, call allocateDoorTask()

3. **XIM door CLI detection:** pr_CLI and INIT/STAT messages
   - ✅ DoorLoader.ts: Set pr_CLI=0 for XIM doors (NULL = BBS mode)
   - ✅ DoorMessageHandler.ts: Send INIT/STAT for XIM (native lib doesn't)

**Test Results (all pass):**
- WHO: Task 0x6b00, exits cleanly
- RTW: Task 0xbf00, exits cleanly
- AquaScan: Task 0xb300, works (waits for input as expected)
- joincnf: Task 0x17700, XIM handshake works, exits cleanly
- MultiTop: Task 0x7e00, exits cleanly (params error expected for batch util)

### Other Resolved Issues
- Fullscreen black screen (resize buffer allocation)
- Box-drawing corruption (UTF-8 slicing) - commit `094ecc90f`
- QUICK door polling loop (shutdown detection)
