# Session Handoff: TUI Admin — 2026-09-04

## TL;DR

The TUI admin console (`dev/console/`) has been rebuilt from scratch to match the web config-app at `/admin/` 1:1. It uses the SDK's theme system (`ThemeTokens` + 4 built-in themes from `sdk/engines/ui/theme/tokens.ts`). There are still ~15 pages that need theme token application and inline editing wiring.

---

## WHAT WAS DONE

### 1. Theme System (`dev/console/src/theme/blessed-theme.tsx`)
- Ported SDK's ThemeTokens interface (ground, ink, chrome, dim, bar, barInk, accent, accentAlt, selectionBg, selectionInk, ok, warn, alert)
- 4 built-in themes: Classic, **Slate & Slash** (default — `///` rail, magenta accent), Uprough Neon, Quiet Phosphor
- `T` and `CURRENT_THEME` exports for live token access
- `BlessedBox`, `BlessedText`, `BlessedSpinner`, `BlessedProgressBar`, `Rail` components
- Animated slash rail (`///`) in header with 250ms frame interval

### 2. Sidebar (`dev/console/src/components/Sidebar.tsx`)
- Uses SDK theme tokens (T.chrome, T.accent, T.ink, T.dim, T.selectionInk)
- Collapsible categories (Diagnostics starts collapsed)
- Hover effects via `1003h` all-motion mouse tracking (not just while held)
- Keyboard navigation via `useRef` to avoid stale closures
- Tab-aware focus prop (only responds to input when focused)

### 3. Login Prompt (`dev/console/src/components/LoginPrompt.tsx`)
- Fixed cursor moving down instead of right: replaced `█` with `_` cursor + fixed-width 30-char padding
- Uses theme tokens (T.accent, T.chrome, T.dim, T.ink, T.alert)
- Removed `height="100%"` to prevent layout shift on re-render
- Uses BlessedSpinner for loading state

### 4. Header (`dev/console/src/components/Header.tsx`)
- Uses `stdout.columns` for proper responsive width
- Animated slash rail with 250ms interval
- Status pills with `[OK]`/`[!]` using theme colours (T.ok, T.alert)
- `=` separator line

### 5. Footer (`dev/console/src/components/Footer.tsx`)
- Uses theme tokens (T.chrome, T.dim)
- Simple `-` borders, clickable hotkey hints

### 6. App.tsx
- Content panel now has a border, brighter when focused (`T.accent` vs `T.chrome`)
- Tab/Shift+Tab cycles sidebar → content → footer panels
- `focusPanel` state passed to Sidebar and used for content border color
- PAGE_COMPONENTS map updated to match registry (Live, People, Content, System, Diagnostics)
- Removed old unused imports (CallersTab, SystemTab, AmiXnetPage, OpChatSettingsPage)

### 7. Shared Components (`dev/console/src/components/shared/InlineEdit.tsx`)
- `ToggleSwitch` — inline ON/OFF toggle with colored border
- `InlineEdit` — inline text field editing with keyboard handler (Enter save, Escape cancel)
- `SwitchableRow` — labeled toggle row

### 8. New Pages
- `ActivityPage.tsx` — tabs for Callers/Uploads/Downloads
- `StatisticsPage.tsx` — all-time + today stats
- `ConfigurationPage.tsx` — wraps SystemConfigPage
- `ConfigFilesPage.tsx` — InfoFiles + BatchEditor tabs
- `LookupTablesPage.tsx` — 5 tabs (computers, screen types, languages, protocols, file checkers)
- `HealthDeploymentPage.tsx` — Health + Deployment tabs
- `ScreenFilesPage.tsx` — browse all .info files with tooltype viewer
- `ConferencesPage.tsx` — Conferences + File Areas tabs

### 9. API Client (`dev/console/src/api/client.ts`)
- 132 methods (vs web's 126) — full endpoint parity
- Added `getLastUploads`, `getLastDownloads`, `getMe`, `logout`

### 10. Registry (`dev/console/src/pages/registry.ts`)
- Categories: Live, People, Content, System, Diagnostics (matches web nav-config.ts)
- Added `CATEGORY_COLLAPSED` (Diagnostics starts collapsed)
- `DEFAULT_PAGE` = `'overview'` (exists in PAGES)

### 11. Bug Fixes From Audit
- Fixed duplicate `'logs'` page id
- Fixed stale `useInput` closure in sidebar (useRef pattern)
- Fixed hardcoded width 80 in header (useStdout)
- Fixed button mask `0x43` → `0x03` per SGR spec
- Fixed `if (!b)` falsy check for 0 bytes in StatisticsPage
- Fixed Invalid Date in ActivityPage (fmtTimestamp helper)
- Fixed sidebar hover offset (SIDEBAR_FIRST_ROW 5→4)
- Fixed mouse tracking (`1002h` → `1003h` for real hover support)
- Fixed login cursor moving down instead of right
- Fixed `BlessedText` import in LoginPrompt

---

## STILL PENDING / NEXT SESSION

### Phase A: Apply Theme to Remaining Pages (Medium priority, ~2h)
These pages still use hardcoded colors (color="cyan", color="white", dimColor, etc.) instead of `T.*` tokens:
- `DashboardTab.tsx` — uses `color="cyan"`, `color="green"`, `dimColor` throughout
- `ActivityPage.tsx` — uses `color="cyan"`, `color="white"`, `color="red"` throughout
- `NodesTab.tsx` — uses hardcoded colors
- `UsersTab.tsx` — uses hardcoded colors
- `ConfsTab.tsx` — uses hardcoded colors
- `LogsTab.tsx` — uses hardcoded colors
- `DoorsTab.tsx` — uses hardcoded colors
- `AuditLogPage.tsx` — uses hardcoded colors
- `SessionLogsPage.tsx` — uses hardcoded colors
- `OperatorChatPage.tsx` — uses hardcoded colors
- `SecurityPage.tsx` — uses hardcoded colors
- `LanguagesPage.tsx` — uses hardcoded colors
- `ProtocolsPage.tsx` — uses hardcoded colors
- `ComputersPage.tsx` — uses hardcoded colors
- `ScreenTypesPage.tsx` — uses hardcoded colors
- `FileCheckersPage.tsx` — uses hardcoded colors
- `DrivesPage.tsx` — uses hardcoded colors
- `GlobalWallPage.tsx` — uses hardcoded colors
- `InfoFilesPage.tsx` — uses hardcoded colors
- `BatchEditorPage.tsx` — uses hardcoded colors
- `DeploymentPage.tsx` — uses hardcoded colors
- `DoorInstallPage.tsx` — uses hardcoded colors
- `ImportExportPage.tsx` — uses hardcoded colors

### Phase B: Wire Inline Editing to Pages (High priority, ~3h)
- `SystemConfigPage.tsx` — rewrite with per-field auto-save, ToggleSwitch for booleans
- `DoorsTab.tsx` — add inline edit for door settings
- `UsersTab.tsx` — add inline edit for user fields
- All CRUD pages should use ToggleSwitch/InlineEdit for boolean/field editing

### Phase C: Content Panel Responsive Sizing (Medium priority, ~1h)
- The content panel should resize when the terminal is resized (use `useStdout()` dimensions)
- Currently uses `flexGrow`=1 but some pages hardcode widths

### Phase D: Content Border (Done)
- Content panel has a border
- Border color changes: `T.accent` when focused, `T.chrome` when not
- ✅ Done

### Phase E: Animated Slashes (Done)
- Header has animated slash rail with 250ms frame interval
- Uses theme's `Rail()` component and `rail` string from theme
- ✅ Done

### Phase F: Login Cursor (Done)
- Cursor no longer moves down on first character
- Fixed-width field (31 chars) with `_` cursor instead of `█`
- ✅ Done

---

## CRITICAL REFERENCES

- **Theme tokens:** `dev/console/src/theme/blessed-theme.tsx` (T.*, CURRENT_THEME, 4 themes)
- **SDK reference themes:** `sdk/engines/ui/theme/tokens.ts` (ThemeTokens interface)
- **Web nav config (source of truth):** `web/config-app/src/components/AppShell/nav-config.ts`
- **Web page components:** `web/config-app/src/pages/` (Model UI patterns from here)
- **Registry:** `dev/console/src/pages/registry.ts`
- **Page map:** `dev/console/src/App.tsx` (PAGE_COMPONENTS)
- **API client:** `dev/console/src/api/client.ts` (132 methods)
- **Shared components:** `dev/console/src/components/shared/InlineEdit.tsx`
- **Start script:** `dev/scripts/start-servers.sh`

---

## BUILD STATUS
```
cd dev/console && npm run build   # PASSES
cd dev/console && npm run start   # STARTS (requires TTY)
```

All changes pushed to `main`. No branches or worktrees used — working directly on main.