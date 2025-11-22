# Handoff Summary

## Task Completed: BBS Screen Files Index for ASCII Artists

### What Was Accomplished
1. **Comprehensive Analysis**: Examined the entire file structure of Sanctuary BBS to identify all screen files used in the AmiExpress system
2. **File Discovery**: Located over 100 screen files across multiple locations including:
   - System-wide screens in `/Screens/` and `/Node0/Screens/`
   - Node-specific screens in `/Node0/Node0/Screens/`, `/Node0/Node2/Screens/`
   - Conference-specific screens in `/Conf01/Screens/`, `/Conf1/Screens/`, etc.
   - Documentation backups in `/Source/Documentation/SanctuaryBBS/`

3. **Content Analysis**: Read and analyzed key screen files to understand:
   - Different screen types and their purposes
   - ASCII art styles and formatting requirements
   - Color coding and ANSI sequences used
   - Content themes and messaging patterns

4. **Documentation Creation**: Created two comprehensive documents:

#### `BBS_Screen_Files_Index_for_ASCII_Artists.md`
- **Complete guide** for ASCII artists with detailed descriptions of each screen type
- **Technical specifications** including width, character sets, and color codes
- **Style recommendations** for different screen categories (system, group, user interface)
- **Content guidelines** specifying what logo and content each screen should include
- **ASCII art examples** and themes relevant to the BBS

#### `Screen_Files_Quick_Reference.md`
- **Complete file listing** organized by category
- **Quick lookup reference** for finding specific screen files
- **Usage notes** and special considerations
- **File type explanations** (.txt, .GR, .library, etc.)

### Screen Categories Identified
1. **System Screens**: Logon/Logoff screens with various versions
2. **User Interface**: Callers display, menus, waiting screens  
3. **Group/Scene Screens**: Fairlight (FLT) and Sanctuary BBS themed screens
4. **Conference Screens**: Menu and bulletin files for different boards
5. **File Operations**: Upload/download messages and warnings
6. **Bulletin/News**: General announcements and messages

### Key Insights for ASCII Artists
- **BBS Theme**: Retro Amiga computing nostalgia with Scandinavian BBS culture
- **Group Branding**: Strong Fairlight scene representation with elite cracker aesthetics
- **Technical Specs**: 80-column terminal width, ANSI color codes, specific ASCII sequences
- **Style Variations**: From clean professional BBS branding to complex cracker-style ASCII art
- **Content Focus**: System information, user statistics, group hierarchy, and nostalgic messaging

### File Structure Understanding
- Multiple node support (Node0, Node2) with location-specific screens
- Conference-based organization with theme-specific content
- Version control for different features (Logon20 vs Logon100)
- Backup/documentation copies in source directory

The documentation provides everything needed for ASCII artists to create authentic screen art that matches the Sanctuary BBS aesthetic while serving the functional requirements of each screen type.

---

## Latest Session (door start prompts / hotkeys)
- User asked to remove door-start messages like "Starting GLCVIEW..." and ensure hotkeys are not active inside doors.
- Updated `web/backend/src/handlers/door.handler.ts` to silence all user-facing launch banners (native/script/python/ARexx/Amiga emulation) and to clear shortcuts for every door executor (web/native/script/python/ARexx, etc.), preventing hotkeys from leaking into doors.
- Tests run: `cd web/backend && npx tsc --noEmit` and `npm test` (all suites passing, 1 skipped as before).

## Latest Session (GLC Viewer width)
- Fixed Global Last Callers door lines exceeding 80 columns and removed extra spaces in stats/records.
- Added ANSI-aware truncation helper to both `doors/glc-viewer/index.ts` and `web/backend/src/doors/glc-viewer/index.ts`; all dynamic lines (call rows and stats) now trim to 80 cols without introducing extra linebreaks.
- Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (prompt in expert mode)
- Menu prompt missing after pressing `?` in expert mode was due to firing the prompt before the MENU screen finished rendering (no await). `handleQuestionMarkCommand` is now async/awaits `_displayScreen`, and all call sites await it (`command.handler.ts`, `command-handler/internal-commands.ts`, `command-handler/command-execution.ts`), ensuring the prompt appears after the menu.
- Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (menu hotkeys forced off)
- Main menu was still entering shortcut mode; hard-disabled .keys handling for MENU. In `command-handler/menu.ts` we now keep `cmdShortcuts` false and clear shortcuts regardless of .keys, and `handleQuestionMarkCommand` no longer considers .keys for MENU. This guarantees hotkeys are off on the main menu.
- Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (download parity wiring)
- Wired the command handler to existing download/file listing flows: `startFileDownload`, `handleFileDownload`, and `displayFileAreaContents` are now invoked from menu selections instead of placeholder TODOs. File listings return to the menu; downloads enter the existing selection flow.
- Added tests previously for CREDITBYKB/FREEDOWNLOADS; latest change is wiring only. Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (account editing routing)
- Redirected all account-editing related tempData branches to the implemented account editor (handleAccountEditingCommand) and removed redundant placeholder branches.
- Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (account editor bulk parity)
- Implemented bulk account editor (B option) to set a security level for all new accounts; added basic flow for change-sec-level, toggle expert/ANSI flags, and user search with DB-backed updates.
- Added new substate for bulk editor and wired user list pagination to use the existing displayUserList.
- Re-ran `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (FM command parity)
- Reworked FM flow to use the proper directory-span prompt/parser (supporting hold/LCFILES), and to search DIR files with raw entry output (ANSI-colored C/D/M/V/Q prompt).
- Added persistence/actions: delete now confirms then removes the entry from the DIR file; move prompts for destination dir and moves the entry to the target DIR file. Both resume scanning correctly across directories and respect flagged-file removal prompts.
- Wired new substates for delete confirmation and move destination in `command.handler.ts`; continue/flag handling now resumes the scan loop instead of restarting.
- `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (Hotkeys and Message Entry Parity)
- Restored AmiExpress-like shortcut flow: MENU resets shortcuts, loads `MENU.keys` if present, and sets `cmdShortcuts`. READ_SHORTCUTS now translates a single key, executes it via the command priority system, sets `menuPause` false, and returns to DISPLAY_MENU; line input is used when no `MENU.keys` exists.
- Tightened screen-command bypass: only active when `executingScreenCommand` is true *and* the incoming command string is >1 char, so single-key user input no longer bypasses the state machine.
- Message-entry substates now recover correctly (To → Subject → Private → Body) and echo input/backspace during To/Subject/Private prompts; typing in the “To:” field works.
- Telnet/SSH no longer force-clear shortcuts; the state machine governs shortcut mode. Door state is cleared if inDoorManager is set without a handler.
- `cd web/backend && npx tsc --noEmit` (pass).

## Current Session (Message body echo)
- Backend log showed POST_MESSAGE_BODY was consuming single characters with an empty buffer, so no echo appeared while typing. Updated `handleMessageEntryInput` to line-buffer characters, echo/backspace locally, and submit the full line on Enter (with a CR/LF before processing) to match AmiExpress behavior.
- `cd web/backend && npx tsc --noEmit` (pass).
- Next: retest full message entry (To/Subject/Private/Body) to verify echo, editor commands, and save/abort flow align 1:1.

## Current Session (Conference paths canonicalized)
- Tooltypes in `ConfConfig.info` specify `LOCATION.n=BBS:Conf#`. Updated path handling to match AmiExpress: unpadded `Conf#` names and BBS-rooted paths.
- Moved `Conf1`-`Conf14` directories into `BBS/Conf#` and merged the old `BBS/Conf01` content into `BBS/Conf1`; removed `BBS/Conf01`.
- Updated path helpers and managers: `bbs-paths.util.ts`, `MessageFileManager`, and `FileAreaManager` now target `BBS/Conf#`; default/fallback paths and exports switched from `Conf01` to `Conf1`.
- Adjusted default references (`index.ts`, `session-manager.ts`, `bbs-info.ts/.js`, deployment/export paths, and helper comments). `npx tsc --noEmit` passes.
