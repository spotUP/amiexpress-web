# Session Handoff - 2025-12-16

## Latest: vbcc-only SDK + XIM Door Compilation

**Status**: vbcc migration complete, XIM door compiled

### Completed This Session

1. **Removed all gcc references from SDK**
   - Updated sdk/68k/README.md, BUILD_GUIDE.md
   - Rewrote dev/c-doors/README.md, 68K_DOOR_DEVELOPMENT.md
   - Updated all Makefiles to use vbcc only
   - Removed gcc-related source files and obsolete Makefiles
   - Updated build scripts (build-all-test-doors.sh, test-door.sh, verify-api.sh)

2. **Compiled working XIM door with vbcc**
   - Created xim-vbcc.c based on AEKIT101 XIM protocol
   - Fixed SysBase conflict (use extern, not define)
   - Successfully compiled: `Doors/XIMVBCC/xim-vbcc` (3652 bytes)
   - Created .info files for BBS registration

3. **vbcc NDK Headers**
   - NDK headers at: `sdk/68k/ndk-includes/`
   - Include with: `-I/path/to/sdk/68k/ndk-includes`
   - Contains: exec/, dos/, clib/, proto/, etc.

---

## Test Now

```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
telnet localhost 2323
XIMVBCC
```

**Expected**: XIM door should register, display output, query user data.

---

## vbcc Compilation (Quick Reference)

```bash
# Set environment
export VBCC=/opt/homebrew/opt/vbcc

# Compile door
vc +aos68k -O2 -I/path/to/sdk/68k/ndk-includes mydoor.c -o mydoor -lamiga

# Key points:
# - Use 'extern struct ExecBase *SysBase;' (NOT 'SysBase = NULL')
# - vbcc startup code handles SysBase initialization
# - Include amiga library: -lamiga
```

---

## Key Files Modified

- `sdk/68k/README.md` - Removed gcc section
- `sdk/68k/BUILD_GUIDE.md` - vbcc-only
- `dev/c-doors/README.md` - Completely rewritten for vbcc
- `dev/c-doors/68K_DOOR_DEVELOPMENT.md` - vbcc-only
- `dev/c-doors/Makefile` - vbcc-only
- `dev/c-doors/doors/xim-vbcc/xim-vbcc.c` - New XIM door
- `Doors/XIMVBCC/` - Installed door

## Previous Fixes Still In Place

1. ExecBase at 0x4 AND 0xC (SAS/C pattern)
2. JMP table at negative offsets (LVO -84 -> WriteStr etc)
3. OpenLibrary register fix (A1 not A0)
4. PutMsg trap handler (LVO -366)
