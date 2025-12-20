# Session Handoff - 2025-12-16

## Update - 2025-12-18

- Read all SDK 2.0/SDK-related markdowns (root `SDK_V2_STATUS.md`, `SDK_V2_EXAMPLE.md`, `SDK_REVIEW.md`, `SDK_ELEMENT_*`, `Documentation/4-Door-Developers/SDK_V2_*`, `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`, `sdk/README.md`, `sdk/docs/NEO_BLESSED_GUIDE.md`, `sdk/engines/ui/blessed/*.md`, `sdk/NEOBLESSED_SHOWCASE_IMPLEMENTATION_PROMPT.md`, `sdk/BBS_LIVE_DASHBOARD_IMPLEMENTATION_PROMPT.md`, `sdk/68k/*.md`, `sdk/68k/doors/diagnostic/*.md`, `sdk/examples/neo-blessed-showcase/README.md`).
- No code changes made.
- Noted doc mismatch: `sdk/README.md` references `sdk/docs/GAME_DEVELOPMENT_GUIDE.md`, but the file is missing.
- Last prompts: “read agents.md claude.md and recent markdowns”, “read all SDK 2.0 markdowns”.

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

---

## Update - 2025-12-18 (Card Lobby/SDK fixes)

- Fixed poker ActionType runtime export in `sdk/engines/poker/poker-engine.ts` and rebuilt SDK so ActionType is a real runtime map.
- Added default blue hover/active styling for buttons/listbars in `sdk/engines/ui/blessed/widgets/button.ts` and `sdk/engines/ui/blessed/widgets/listbar.ts`.
- Added keyboard navigation guidance to `sdk/docs/NEO_BLESSED_GUIDE.md` and `sdk/engines/ui/blessed/NEO_BLESSED_GUIDE.md`, plus checklist updates in `AGENTS.md`.
- Card Lobby changes:
  - Added keyboard focus cycling (tab/shift-tab) and hotkeys for lobby actions.
  - Added fallback ActionType map in `Doors/card-lobby/index.ts` to avoid undefined ActionType when SDK cache is stale.
  - Bound listbar callbacks to avoid `runAction` context errors.
- Last prompts: “fix deal showing nothing + runAction errors + why BBS commands execute in door”, “ask about neo‑blessed docking support”.

## Update - 2025-12-20 (ROM fallback)

- `LibraryManager` now supports AROS ROM fallback (combined aros-rom.bin + aros-ext.bin) when Kickstart is missing, and attempts best-effort romtool extraction from the combined image.
- Kickstart remains preferred; AROS is used only when Kickstart is absent.

## Update - 2025-12-20 (ROM library extraction)

- `LibraryManager.ensureRomLibrariesExtracted` now extracts all ROM modules by extension:
  - `.library` → `Libs/` and `System/Libs/`
  - `.device` → `Devs/` and `System/Devs/`
  - `.resource` → `Resources/` and `System/Resources/`
  - `.datatype` → `Classes/Datatypes/` and `System/Classes/Datatypes/`
- Extraction is cached by ROM path/mtime/size stamp in `tmp/rom-extract/.stamp`.

## Update - 2025-12-20 (Expanded ROM extraction + assigns)

- ROM extraction now also handles:
  - `.handler` / `.filesystem` → `L/` and `System/L/`
  - `.keymap` → `Devs/Keymaps/` and `System/Devs/Keymaps/`
  - `.monitor` → `Devs/Monitors/` and `System/Devs/Monitors/`
  - `.font` → `Fonts/` and `System/Fonts/`
  - `.prefs` → `Prefs/` and `System/Prefs/`
  - `.catalog` → `Locale/Catalogs/` and `System/Locale/Catalogs/`
  - `.locale` / `.language` → `Locale/` and `System/Locale/`
  - everything else → `ROM/` and `System/ROM/` fallback
- Added standard assigns in `PathManager`: `l:`, `fonts:`, `locale:`, `prefs:`, `classes:`.

## Update - 2025-12-20 (AROS ROM startup copy)

- Added startup copy step to mirror `web/backend/data/amiga-roms/aros-*.bin` into `data/amiga-roms/` if missing, so AROS fallback works on deploy where root `data/` is excluded.
