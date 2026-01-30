# Handoff - 2026-01-30

## Current Session: dRE!WAll Debug - strPtr Fix Applied

### Changes Made This Session

**File Modified:** `web/backend/src/amiga-emulation/xim/io.ts`

Added strPtr update to JH_HK handling in both `handleHotkey()` and `completeHotkey()`:
```typescript
// FIX 2026-01-30: Also update strPtr to point to embedded buffer
// Some doors (like dRE!WAll) may read characters via strPtr for storage
const strPtrUpdated = this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);
```

**Rationale:**
- Door correctly echoes characters (reads msg.string[0] from embedded buffer)
- Door doesn't accumulate to internal buffer
- strPtr was NULL, never updated for JH_HK
- Door might read via strPtr for storage while using embedded buffer for echo

### Testing Required

1. Start servers: `./dev/scripts/start-servers.sh`
2. Connect to BBS at http://localhost:3001
3. Run WALL door
4. Type a message (e.g., "test")
5. Press Enter
6. Verify message is saved to `Doors/dRE/dRE!WAll/dRE!WAll.dAtA`

### Debug Log to Check

Look for in backend log:
```
[DEBUG JH_HK completeHotkey] Updated strPtr to 0x122d4c: OK
[DEBUG JH_HK completeHotkey] Original msg.stringPtr=NULL
```

If "OK" appears, strPtr was updated. If "FAILED", message structure too small.

### If Fix Doesn't Work

Next steps:
1. **Add MOIRA watchpoint** on door's buffer address (0x122ee0) to detect writes
2. **Disassemble dRE!WAll** to understand character accumulation logic:
   ```bash
   r2 -q -c "e asm.arch=m68k; e asm.bits=32; aaa; pdf" Doors/dRE/dRE!WAll/dRE!WAll
   ```
3. **Test on WinUAE** with real Amiga emulation to verify if door works there

### Previous Findings (Context)

- dRE!WAll uses raw XIM protocol (FindPort/PutMsg/GetMsg), NOT AEDoor.library
- Character flow works: BBS writes char to msg.string[0], door echoes via JH_WRITE
- Previous fixes already applied:
  - ximPort returns 2 (SERIAL_PORT)
  - Double replyMsg bug fixed

### Memory Layout Reference
- msg.msgAddr = 0x122d38
- msg.string = 0x122d4c (offset 0x14)
- msg.strPtr offset = 0x100 (LONG layout)
- Door's file buffer = 0x122ee0

### Critical Rule
**NEVER start servers without asking user first** - per CLAUDE.md
