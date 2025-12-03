# Handoff - Bulls XIM Door Fix (2025-12-03 Session 29)

## BREAKTHROUGH - Bulls Enters XIM Mode!

**SUCCESS**: Bulls now sends XIM messages to AEDoorPort1! CLI argument pointer injection fixed initialization.

**Evidence**:
1. Bulls calls CreateMsgPort (creates reply port at 0xa0400) ✓
2. Bulls sends INIT message (0x100200) to AEDoorPort1 (0xa0000) ✓
3. Bulls sends STAT message (0x100304) to AEDoorPort1 (0xa0000) ✓
4. BBS replies by sending messages to Bulls' reply port 0xa0400 ✓
5. Bulls exits at 0x1250 after sending messages

**What Fixed It**:
- Injected CLI argument pointer at A4+0x6c16 → 0xd0000 (empty string)
- Initialized argument buffer at A4+0x510 (200 bytes)
- Bulls' strcmp check at 0x100c now passes

## Current Issue - Bulls Exits After Sending XIM Messages

Bulls successfully enters XIM mode but exits immediately after sending INIT and STAT messages. Need to determine:

1. **Is Bulls waiting for replies?** Check if Bulls calls GetMsg/WaitPort on reply port 0xa0400
2. **Are BBS replies correct?** Verify message format matches Bulls' expectations
3. **Is Bulls polling?** Check if Bulls has message processing loop after XIM registration

## Implementation Status

1. ✅ DoorInfo structure at 0x100000
2. ✅ AEDoorBase injection at A4+0x988
3. ✅ DoorInfo pointer at A4+0x6c24
4. ✅ Reply Port at 11 A4 offsets
5. ✅ CLI argument pointer at A4+0x6c16
6. ✅ Argument buffer at A4+0x510

## Next Investigation

```bash
# Check Bulls message loop after 0x2a18
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x2a18; pd 100" Doors/emp_tools/Bulls

# Find GetMsg/WaitPort calls
r2 -q -c "e asm.arch=m68k; af; pdf @ sym.main" Doors/emp_tools/Bulls | grep -E "GetMsg|WaitPort"
```

## Key Files

- `web/backend/src/amiga-emulation/DoorLoader.ts:575-592` - CLI arg fix
- `Documentation/4-Door-Developers/Bulls_DISASM_NOTES.md`
