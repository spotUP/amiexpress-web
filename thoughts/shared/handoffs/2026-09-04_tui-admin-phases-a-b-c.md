---
date: 2026-09-04
topic: TUI Admin — Phases A-C Complete
tags: [tui, admin, theme, inline-edit, responsive]
status: final
---

# TUI Admin — Phases A, B, C Complete

## Phase A — Theme Tokens

All ~22 active pages replaced hardcoded colors with `T.*` tokens. Includes `CrudList.tsx` (shared, covers 8 CRUD pages: Security, Languages, Protocols, Computers, ScreenTypes, FileCheckers, Drives, GlobalWall). Also Statistics, HealthCheck, DoorInstall.

Unused pages (SystemTab, AmiXnetPage, OpChatSettingsPage, CallersTab) still have hardcoded colors — not imported in App.tsx.

## Phase B — Inline Editing

- **CrudList.tsx**: ToggleSwitch + Space to toggle bool fields
- **SystemConfigPage.tsx**: Per-field auto-save. Enter to edit, enter to save. ToggleSwitch for bools
- **DoorsTab.tsx**: `e` opens inline edit panel. Space toggles enabled. Per-field auto-save via `updateDoor` API
- **UsersTab.tsx**: `t` toggles ban/unban (SL=0 ↔ SL=50). ToggleSwitch indicator on selected user
- **ToggleSwitch**: `onChange` made optional for display-only use

## Phase C — Responsive Sizing

- **DoorsTab.tsx**: `contentWidth = termWidth - SIDEBAR_WIDTH - 4` so grid cols adapt to actual content panel
- All other pages use Ink flex layout (`flexGrow=1`) and have no hardcoded widths beyond acceptable UI chrome
- Only remaining fixed width: BatchEditorPage `width={50}` editing box — intentional UX

## Bug Fixes

- Sidebar border highlights on focus: `borderColor = focus ? T.accent : T.chrome`
- Header rail constant-width: matches door `railFrame()` — shorter frames padded with spaces
- Added `updateDoor(id, updates)` API to client.ts

## Build

`npm run build` — passes, 0 errors. All on `main`.

## Remaining

- **UsersTab inline edit for more fields** (realname, email) — matches web modal UX
- **Unused pages** could be cleaned up (SystemTab, etc)