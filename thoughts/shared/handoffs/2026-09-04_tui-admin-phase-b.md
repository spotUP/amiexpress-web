---
date: 2026-09-04
topic: TUI Admin — Phase B Complete
tags: [tui, admin, theme, inline-edit]
status: draft
---

# Phase B Complete — TUI Admin Wiring

## Done

### Sidebar Focus Border
- `Sidebar.tsx:121` — borderColor now `focus ? T.accent : T.chrome`
- Border highlights when sidebar has keyboard focus

### Header Rail — Constant Width
- `blessed-theme.tsx:269` — Rail component rewritten to match door `railFrame()` pattern
- No more `/\ //\ ////\` variable-length animation — shorter frames get leading spaces
- Title/tagline no longer jitter as rail animates

### Phase A — Theme Tokens (22 files)
- Every active page: hardcoded `"cyan"`/`"white"`/`"red"` → `T.accent`/`T.ink`/`T.alert` etc
- Includes CrudList.tsx (shared, covers 8 CRUD pages), Security, Statistics, HealthCheck, DoorInstall

### Phase B — Inline Editing
- **ToggleSwitch** (`InlineEdit.tsx:14`): `onChange` made optional for display-only use
- **CrudList.tsx**: ToggleSwitch + space-to-toggle for bool edit fields (covers LookupTables, Security, GlobalWall, Drives, etc)
- **SystemConfigPage.tsx**: Rewritten with per-field auto-save. Enter to edit → enter to save immediately. Bool fields show ToggleSwitch, enter toggles+saves inline
- **DoorsTab.tsx**: `e` key opens inline edit panel. Space toggles enabled. Enter edits name/command. Per-field auto-save via `updateDoor(id, {key: val})`. Added `updateDoor` API to client.ts
- **UsersTab.tsx**: `t` hotkey toggles ban/unban (SL=0 ↔ SL=50) inline. ToggleSwitch shows ban status for selected user

### Registry Hints Updated
- Doors, Configuration, Users — footer hints and help keys reflect new hotkeys

## Remaining

### Phase C — Content Panel Responsive Sizing
- Some pages hardcode widths; should use `useStdout().columns`

### Phase D — UsersTab Inline Edit for More Fields
- Currently only SL + ban toggle. Could add realname/email inline edit matching web modal

## Build
`npm run build` — passes clean, 0 errors
