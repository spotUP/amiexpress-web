# Handoff

## Recent Work
Fixed multiple blessed UI issues across all TypeScript doors.

### Fixed Issues
1. **Ctrl+Shift+M mouse toggle** - Added to BBSTerminal (was only in ChatTerminal)
2. **Cmd+A/Cmd+C** - Terminal select/copy via xterm.js APIs when mouse disabled
3. **Panel border defaults** - Fixed Panel constructor to respect explicit `border: undefined`
4. **Double borders in doors-menu** - Added `border: undefined` to borderless elements
5. **Double borders in mail-composer** - StatusBar/Toolbar got `border: undefined`
6. **Focus stealing** - Added `focusable: false` to 100+ display-only boxes across all doors
7. **Double line breaks in editor** - Line number box width was `lineNumberWidth+1` but content was `lineNumberWidth+2` chars wide, causing word wrap. Fixed width and left offsets.

### Current State
- All blessed doors audited for focus/border issues
- SDK docs updated with best practices (CLAUDE.md rule 6b, blessed guides)
- Mail-composer editor double-line bug fixed
