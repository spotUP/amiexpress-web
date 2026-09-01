---
date: 2026-08-27
topic: Port ad stripper from amiexpress-web to amiexpress-doorserver
tags: [plan, ad-stripper, doorserver, migration]
status: draft
---

# Plan: Port Ad Stripper to Doorserver

## Goal

Move the BBS scene ad/junk detection and stripping engine from `amiexpress-web` (BBS-side) into `amiexpress-doorserver` (standalone catalog service), so the doorserver can independently classify and strip junk files from archives in its corpus.

## Scope

**Port:**
- Core classification logic (`classifyFile`, `deriveStripPlan`) — pure functions
- Seed data: `scene-strip-patterns.json` (5103 patterns), `junk-fingerprints.json` (30+ MD5s)
- LHA in-place member deletion (`lha-member-delete.ts`)
- Admin API endpoint for triggering strip on a catalog entry
- `adm-zip` dependency (for repacking stripped archives as clean ZIPs)

**Do NOT port:**
- BBS door UI (`Doors/ami-stripper/`) — stays in amiexpress-web
- CLI tool (`dev/scripts/ami-stripper.ts`) — stays in amiexpress-web
- Full extractor factory — doorserver already has its own LHA/ZIP readers
- Directory stripping (BBS-side only, for installed doors)

## Architecture

The classification engine is already pure (no fs/network). The doorserver wraps it with its own archive readers:

```
archive-reader.ts (existing)     ami-stripper.ts (new)
  readLhaContents(bytes)           classifyFile()       ← pure, from web
  readZipContents(bytes)           deriveStripPlan()    ← pure, from web
         │                         analyzeArchive()     ← reads via archive-reader
         ▼                         stripArchive()       ← reads via archive-reader, writes ZIP via adm-zip
  ArchiveContents                  deleteMembers()      ← shells out to lha CLI (from lha-member-delete.ts)
```

## Files to create/modify in `amiexpress-doorserver`

### New files

| File | Purpose | Source |
|------|---------|--------|
| `src/ami-stripper.ts` | Classification engine + archive analysis + ZIP repack | Port from `amiexpress-web/web/backend/src/doors/ami-stripper.lib.ts` |
| `src/lha-member-delete.ts` | LHA in-place member deletion | Copy from `amiexpress-web/web/backend/src/doors/lha-member-delete.ts` |
| `seeds/scene-strip-patterns.json` | 5103 filename patterns | Copy from `amiexpress-web/web/backend/seeds/` |
| `seeds/junk-fingerprints.json` | 30+ MD5 fingerprints | Copy from `amiexpress-web/web/backend/seeds/` |
| `tests/ami-stripper.test.ts` | Unit tests for classification + stripping | Port from `amiexpress-web/web/backend/tests/doors/ami-stripper.lib.test.ts` |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `adm-zip` dependency |
| `admin-routes.ts` | Add `POST /api/door-repo/admin/doors/:archiveName/strip` endpoint |
| `catalog.ts` | Add `stripArchiveOnServer()` method (orchestrates deleteMembers + re-describe) |
| `schema.sql` | No change needed — `is_junk`, `junk_reason`, `junk_count` already exist |
| `manifest.ts` | No change needed — already computes live junk count from `door_catalog_files` |

## Implementation steps

### Step 1: Copy seed data

Copy `scene-strip-patterns.json` and `junk-fingerprints.json` from `amiexpress-web/web/backend/seeds/` to `amiexpress-doorserver/seeds/`. The `tsconfig.json` already has `resolveJsonModule: true`, so they can be imported directly.

### Step 2: Port the classification engine (`src/ami-stripper.ts`)

Port the pure classification functions from `ami-stripper.lib.ts`:
- `classifyFile()` — pure, no changes needed
- `deriveStripPlan()` — pure, no changes needed
- `matchesPattern()` — internal helper, no changes needed
- Content-protection helpers (`isWorkbenchIcon`, `isAmigaHunk`, etc.) — no changes needed

Add archive reading that uses the doorserver's existing `archive-reader.ts`:
- `readArchiveContents()` — wraps `readLhaContents()` / `readZipContents()` to produce the `{path, size, buf}` entries that `deriveStripPlan` needs
- `analyzeArchive()` — reads archive bytes from disk, dispatches to the right reader, runs classification
- `stripArchive()` — same as analyze, but repacks to ZIP via `adm-zip`

Adapt the seed data paths to point to `../seeds/` relative to `src/`.

### Step 3: Add `adm-zip` dependency

```bash
cd /Users/spot/Code/amiexpress-doorserver && npm install adm-zip && npm install -D @types/adm-zip
```

### Step 4: Port LHA member deletion (`src/lha-member-delete.ts`)

Copy as-is from `amiexpress-web`. The `lha` binary availability check (`findLhaBinary`) searches `/usr/local/bin/lha`, `/usr/bin/lha`, `/opt/homebrew/bin/lha` and `LHA_COMMAND` env — same paths work in both projects.

### Step 5: Add `stripArchiveOnServer()` to `catalog.ts`

Orchestrates:
1. Read catalog row (verify archive exists on disk)
2. Check LHA capability (`canDeleteMembers`)
3. Call `deleteMembers()` to remove junk from the LHA in-place
4. Recompute MD5/SHA256 of the modified archive
5. Update `door_catalog` row (size, digests, junk_count, indexed_at)
6. Delete corresponding `door_catalog_files` rows for removed members
7. Record audit entry

This follows the same pattern as the existing `stripArchiveOnServer` in `amiexpress-web/web/backend/src/doors/door-catalog.service.ts:309-389`.

### Step 6: Add admin API endpoint

```
POST /api/door-repo/admin/doors/:archiveName/strip
Body: { "members": ["path/to/file.nfo", "..."] }
```

- Validates the archive exists in the catalog
- Calls `deleteMembers()` from `lha-member-delete.ts`
- Recomputes digests and updates the catalog row
- Deletes `door_catalog_files` rows for stripped members
- Re-computes live junk count from remaining `is_junk = 1` rows
- Records audit entry
- Returns `{ ok, removed, newJunkCount }`

### Step 7: Write tests

Port the unit tests from `amiexpress-web/web/backend/tests/doors/ami-stripper.lib.test.ts`:
- `classifyFile()` with crafted patterns/fingerprints
- `deriveStripPlan()` with mixed junk/keep entries
- Content-protection rules (Workbench icons, hunk binaries, etc.)
- `deleteMembers()` with mock runner
- Integration test for the admin strip endpoint

## Key design decisions

1. **Adapt, don't copy the extractor factory.** The doorserver already has LHA/ZIP readers. The stripper wraps them instead of duplicating the entire extractor hierarchy.

2. **ZIP repack for clean archives.** When the doorserver needs to produce a new clean archive (not in-place LHA deletion), it writes ZIP via `adm-zip`. This matches the web backend's approach.

3. **LHA in-place for published archives.** The doorserver serves Amiga clients expecting `.lha`. In-place deletion via the `lha` CLI preserves the format. LZX remains unsupported (no writer exists).

4. **Seed data at project root `seeds/`.** Separate from `src/` to keep the JSON blobs out of the TypeScript compilation unit, matching the web backend's convention.

## Verification

1. `npm run typecheck` — zero errors
2. `npm test` — all existing + new tests pass
3. `npm run build` — clean build
4. Manual test: POST to the strip endpoint with a known catalog entry, verify the archive is modified in-place and the catalog row is updated
