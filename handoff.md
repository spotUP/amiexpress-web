# Handoff

## Current State (2026-01-13)

Grandmaster (GMASTER) Tetris door had **fourteen issues** - all now fixed:

1. **Space bar not working at logo screen** - Fixed by enabling `grabKeys` on screen.program
2. **Menu keyboard navigation only works after game** - Fixed by enabling `grabKeys` for proper global input capture
3. **Help modal ESC closes entire door** - Fixed by adding modal state check to prevent ESC key bubbling
4. **Screen ghosting from previous door** - Fixed by clearing screen buffers + 200ms delay for modem speeds
5. **Attract mode missing visual effects** - Fixed by refactoring to use GameScreen directly (eliminated code duplication)
6. **Visual effects not visible/misaligned** - Fixed animation centering, added missing particle preset, fixed z-ordering
7. **ESC in main menu causes lockup** - Fixed by adding ESC key handler (ESC = quit)
8. **Can't type in BBS after exiting** - Fixed by disabling grabKeys/mouse on quit
9. **Screen ghosting still visible at modem speed** - Fixed by adding 200ms delay after screen clear
10. **No sound when navigating menus** - Fixed by adding `playSfx('menu_select')` to menu `select item` event
11. **Settings screen has no sound feedback** - Fixed by adding comprehensive sound effects to all interactions (navigation, selection, value adjustment, confirmation, cancel)
12. **TetriNET lobby ghosts into main menu** - Fixed by adding clearRegion + 200ms delay to menu.ts (same as app.ts startup)
13. **TetriNET lobby visible during GMASTER startup** - Fixed by adding clearRegion + 200ms delay to quit() before screen.destroy() to clear buffer on exit
14. **Junk text visible through GMASTER logo** - Fixed by adding clearRegion to attract-screen setupUI() to clear blessed internal buffer + added `style: { bg: 'black' }` to mainBox

## Recent Sessions (2-5)

Sessions 2-4: Input handling, screen ghosting, visual effects centering, menu ESC lockup - all resolved.

Session 5: Created **DoorInputManager** class to eliminate input complexity - one enable/disable, automatic cleanup. Migrated GMASTER. All future doors must use this pattern.

## Session 6 Summary

**Sound fixes:** Menu navigation, menu selection (move→menu_ok), settings screen (added 10 playSfx calls - had ZERO feedback), tetrinet special (lock→attack).

**Ghosting fixes (3 locations):**
- menu.ts: clearRegion + 200ms delay to prevent tetrinet lobby bleeding into menu
- app.ts quit(): clearRegion + 200ms delay to clear screen on exit
- attract-screen.ts: clearRegion in setupUI() + black background on mainBox (blessed buffer wasn't cleared, text showed through logo)

**6 doors migrated** to DoorInputManager. Fixed cleanup bugs in neo-blessed-showcase and header-dropdown-demo.

## Key Files (Session 6)

**SDK**: `door-input-manager.ts`, `DOOR_INPUT_MANAGER_GUIDE.md`

**GMASTER Sound + Ghosting Fixes**:
- `app.ts` - Pass sounds to SettingsScreen, clearRegion in quit()
- `menu.ts` - Navigation sound, selection sound fix, clearRegion before menu display
- `settings-screen.ts` - SoundEngine param, 10 playSfx calls
- `tetrinet-screen.ts` - Special sound fix (lock → attack)
- `attract-screen.ts` - **clearRegion in setupUI() + black background on mainBox**

**6 Doors Migrated**: door-manager, doors-menu, neo-blessed-showcase (fixed cleanup bugs), rip-browser, widget-shadow-demo, header-dropdown-demo (fixed cleanup)

**Docs**: 7 progress docs in `Documentation/6-Progress/GRANDMASTER_*_2026-01-13.md`

## Testing Required

**CRITICAL: Restart backend first**: `./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh`

### Priority Tests
1. **TetriNET lobby ghosting - quit()** (Session 6): Enter GMASTER → select TETRINET → browse modes → ESC to menu → quit GMASTER → enter GMASTER again → **verify no lobby content during startup attract mode**
2. **TetriNET lobby ghosting - menu** (Session 6): Select TETRINET → browse modes → press ESC to go back to menu → **verify no lobby content visible in main menu**
3. **Sound** (Session 6): Menu navigation (up/down arrows), settings navigation/selection, value adjustment (left/right), volume adjustment - all should have sound feedback
4. **Input cleanup** (Session 5): Exit GMASTER → verify you can type in BBS (commands, chat)
5. **Visual effects** (Session 3): Hard drop, grade-up, section clear animations - all centered
6. **Navigation** (Sessions 1-2): SPACE at logo, arrow keys in menu, F1 for manual, ESC in modal only
7. **Exit** (Session 4): ESC in main menu exits cleanly (no lockup)

## Next Steps
- **CRITICAL: Restart backend** to load new GMASTER build
- **Test both tetrinet lobby ghosting fixes:**
  - Quit scenario: GMASTER → TETRINET → ESC → quit → enter GMASTER again (verify no ghosting during startup)
  - Menu scenario: TETRINET → ESC back to menu (verify no ghosting in main menu)
- Test all sound fixes (menu navigation, settings screen, tetrinet special)
- Verify comprehensive settings screen sound feedback
- Consider Priority 2-4 sound improvements (5-combo SFX consistency, T-Spin mini sound, game clear sound)
