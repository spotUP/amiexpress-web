---
date: 2026-09-04
topic: Grandmaster TETRIS ATTACK fixes, PETSCII parity, TUI screen management
tags: [grandmaster, tetris-attack, petscii, tui, console, screens]
status: draft
---

# Session Handoff: Grandmaster + TUI Screens — 2026-09-04

## TL;DR
Four things happened this session:
1. Fixed TETRIS ATTACK input (click-to-swap, cancelKeyboardSwap, faster animations)
2. Fixed mail scan loop (pointer not advancing on 'N')
3. Made GRANDMASTER PETSCII mode 1:1 with ANSI (full menu, sprite chars, compact layout)
4. Added TUI console screen management (browse, preview, delete, repair)

Some work remains: TGM game modes show black screen at 40 columns (GameScreen uses fixed 80-col positions).

---

## WHAT WAS DONE

### 1. Git consolidation (early session)
- Merged all 20 branches to main: feat/tetris-attack, feat/gm-mission-briefing, feat/browser-ansi-editor, all land-* branches
- Removed all worktrees — only main checkout remains
- All branches deleted after merge
- SDK: added missing `activeTheme()` export to live.ts (imported by widgets from merged theme-primary branch)

### 2. TETRIS ATTACK fixes
**Swap logic:**
- Stack: added `cancelKeyboardSwap` field, `requestMouseSwap(row, col)` method
- controls(): checks cancelKeyboardSwap to prevent keyboard from undoing mouse click
- PanelsScreen: added mouse click handler on boardBox that calls requestMouseSwap
- InputHandler: reduced rotate_180 debounce from 33ms → 5ms

**Animation speed:**
- Reduced FLASH 44/42/38/36/34/32/30/28/22 → 20/20/20/20/20/18/18/18/18/18/16
- Reduced FACE 20/18/17/16/15/14/13/12/11/10/8 → 10/10/10/10/10/10/9/9/9/9/9/8
- Reduced POP 9/9/8/8/8/8/8/7/7/7/6 → 4/4/4/4/4/4/4/4/4/4/4

**Menu loop:**
- Wrapped mode selection in while(true) loop so ESC returns to mode picker (not main menu)
- Changed mode sub-screens to `continue` instead of `return`

### 3. Mail scan fix
- Scan pointer now always computed from actual scan results (`scanMsgs.reduce(...)`)
- Previously used `lastScanned` from `countNewMessages` which could return 0
- This caused same message to appear repeatedly when user pressed 'N'

### 4. MSG_READER_NAV single-char fix
- Was line-input (buffered until Enter), ate single-letter commands
- Now handles Q, N, A, R, L, K, F, ? as single-character, matching express.e getMSGCommand

### 5. PETSCII cursor visibility
- Added `cursorVisible` prop to PetsciiCanvas
- Added `cursor-visibility` socket event handler in BBSTerminal
- Added `setCursorVisible()` helper in terminal-utils.ts (emits both ANSI escape + cursor-visibility event)

### 6. GRANDMASTER PETSCII mode 1:1 with ANSI
- menu.ts menuRowsFor(): removed compact filter — now returns ALL 19 items at every width
- menu.ts show(): branches on compact width — full-width single-column menu, no description/player panels
- menu.ts recentre(): branches for compact layout
- attract-screen.ts showCompactBootSequence(): added rainbow cycle animation
- attract-screen.ts run(): skip startDemo at compact width (22x22 board doesn't fit 40 cols)
- Sprite files: replaced Unicode chars with PETSCII-safe ASCII: ♥→S, ◆→Z, ★→*, ●→o, ▲→^, ▼→v, ■→D, ·→*

### 7. TUI Console screen management
- Added screen API functions: getScreenIndex, getScreenFile, putScreenFile, deleteScreenFile, repairScreenFile, getSharedScreenDirs, shareScreens
- ScreenFilesPage rewritten with tabs (All/Node/Conf/Board/Unused/Bulletins), keyboard nav, file facts
- ANSI preview (AnsiText + AnsiPreview components with scroll)
- Delete with confirmation dialog
- Repair (fix missing ESC bytes)
- MCI broken-only display mode

### 8. Fixes during merge cleanup
- Fixed `ripterm.js: const queue → let queue` (esbuild error)
- Fixed ScreenFilesPage crash when files is not array
- Fixed `activeTheme()` export in live.ts (imported by widgets)

---

## Critical file locations

| what | where |
|------|-------|
| Stack cancelKeyboardSwap | `Doors/grandmaster/core/panels/stack.ts:231, 432, 870` |
| PanelsScreen mouse handler | `Doors/grandmaster/ui/panels-screen.ts:185` |
| Menu compact layout | `Doors/grandmaster/ui/menu.ts:130-306` |
| Compact boot + rainbow anim | `Doors/grandmaster/ui/attract-screen.ts:360` |
| Mail scan pointer fix | `web/backend/src/handlers/message/message-scan.handler.ts:760` |
| MSG_READER_NAV single-char | `web/backend/src/handlers/command.handler.ts:3395` |
| PETSCII cursor visibility | `packages/terminal/src/petsii/PetsiiCanas.tsx:22`, `packages/terminal/src/component/BESTermina.tsx:357, 3569` |
| setCursorVisible() | `web/backend/src/util/terinal-util.ts:30` |
| Sprite files | `Doors/grandmaster/spries/panel-*.srie.json` |

## OPEN ITEMS

1. **TGM mode black screen at 40 columns** → GameScreen.etupUI() use fixed 80-col poitions. Board at lef:2, but side panel (grade/stat/zone/ection) at lef:40+ overflow. Need compact layout branch.

2. **TUI theme tokens** → ~15 page still use hardcoded color, need to be wired to T.* theme token.

3. **Sprie upload** → API function exit, UI not yet wired.

## NEXT SESSION STRT

1. **Fix ameScreen for 40 columns**:
   - Read `isCompactWidth(his.screen.wih)` in etupUI()
   - Hide overflow panel (nextBox/ holdBox/ gradeBox/ statBox/ zoneBox) at 40
   - expan board box to fll available widh
   - Adjust boad rendering from 22→ ful-wih (40 col)

2. Enable SDK build for fresh checkout: `cd sk && npn run build:cj`
3. Build grandmaster: `cd Doos/grandmater && npn run build`