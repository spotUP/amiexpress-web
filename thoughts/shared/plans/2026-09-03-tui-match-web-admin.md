# TUI Admin UI to Match Web Admin

## Status: IN PROGRESS

## Problem
The TUI admin (`dev/console`) has a different Import/Export interface than the web admin (`/admin/import`):
- **Web**: 5-step wizard (Upload → Validate → Resolve → Execute → Complete)
- **TUI (before)**: Simple session list with action buttons (v/x/c/d)

## Changes Made

### 1. API Client (`dev/console/src/api/client.ts`)
- Added `uploadArchive(filePath)` function for multipart file upload
- Added types: `ImportValidation`, `ImportConflicts`, `ImportSummary`, `ValidationResult`, `ImportResult`, `ImportProgress`

### 2. Types (`dev/console/src/api/types.ts`)
Added new interfaces:
- `ImportValidation`
- `ImportConflict`
- `ImportConflicts`
- `ImportSummary`
- `ValidationResult`
- `ImportResult`
- `ImportProgress`

### 3. Import/Export Page (`dev/console/src/components/tabs/ImportExportPage.tsx`)
Rewrote as 5-step wizard matching web UI:

| Step | Web Component | TUI State |
|------|--------------|-----------|
| 1. Upload | FileUploader | `step: 'upload'` - text input for file path |
| 2. Validate | ValidationResults + "Validating..." | `step: 'validate'` - spinner then results |
| 3. Resolve | ConflictResolver | `step: 'resolve'` - show conflicts + strategy selection |
| 4. Execute | ImportProgress | `step: 'execute'` - progress bar polling |
| 5. Complete | ImportResults | `step: 'complete'` - show results + [r]eset |

Components added:
- `StepIndicator` - shows 5 steps with done/active/pending states
- `ProgressBar` - ASCII progress bar for execute step
- `SummaryBox` - displays import summary

## API Endpoints (same for both web and TUI)
- `POST /api/import/upload` - multipart file upload
- `POST /api/import/validate/:id` - validate session
- `POST /api/import/execute/:id` - execute import
- `GET /api/import/session/:id` - get session status + progress

## Still Missing / To Do
- [ ] System Config page - web shows read-only table, TUI has editable fields (may need to clarify requirements)
- [ ] Other admin pages - need audit of what else differs
