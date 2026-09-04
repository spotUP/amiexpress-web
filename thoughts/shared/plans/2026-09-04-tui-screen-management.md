---
date: 2026-09-04
topic: TUI Console - Full Screen Management (ScreenFilesPage rewrite)
tags: [tui, console, screens, ansi, mci, admin]
status: draft
---

# TUI Console Screen Management

## Goal
Replace the current `ScreenFilesPage` (which lists `.info` metadata files, not screens) with a full screen management page matching the web admin's functionality: browse, preview, edit, upload, delete, repair, share screens.

## Backend API (already exists)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/screens` | Full screen index (screens, resolutions, duplicates, MCI refs, SAUCE metadata) |
| GET | `/api/screens/file?path=...` | Read screen file (base64 content + file facts) |
| PUT | `/api/screens/file?path=...` | Write screen file (with backup) |
| DELETE | `/api/screens/file?path=...` | Delete screen file (with backup) |
| POST | `/api/screens/repair` | Fix missing ESC bytes in ANSI files |
| POST | `/api/screens/upload` | Upload new screen file |
| GET | `/api/screens/shared-directories` | List directories that can host shared screens |
| POST | `/api/screens/share` | Point nodes at shared screen directory |
| GET | `/api/screens/export?scope=...` | Export screens as zip |
| POST | `/api/screens/import` | Import screens from zip |

## Phases

### Phase 1: Screen Index Browser (NOW)
- Add API client functions for screen endpoints
- Rewrite `ScreenFilesPage` to display the real screen index
- Show tabs: All Screens, Node screens, Conference screens, Board screens, Unused
- Show file facts (bytes, format, SAUCE, read-by, MCI references)
- Sortable columns: path, scope, size, format, read-by, MCI refs

### Phase 2: ANSI Preview
- Render ANSI screen content in a blessed box using `ansiToTags()`
- Show MCI code annotations on the preview
- Show SAUCE metadata (title, author, font, etc.)
- Keyboard navigation: scroll through MCI codes

### Phase 3: Screen Management
- Upload new screen files (file picker → base64 → PUT)
- Delete screen files (with confirmation)
- Repair broken ESC bytes
- Share screens across nodes

### Phase 4: Full Editor (if needed)
- Use blessed textarea for content editing
- MCI code picker/inserter
- Tooltype / SCREENS routing editor