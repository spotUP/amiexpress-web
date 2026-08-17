# Central Door Repo API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only door-repo HTTP API on the owner BBS + consumer mode in DOORMAN + public integrator docs, per the approved spec.

**Architecture:** Three backend modules (checksum cache, manifest builder, Express router) mounted on the existing app; DOORMAN gains a repo-client module and a consumer-mode data source behind `DOOR_REPO_ROLE`/`DOOR_REPO_URL`; a byte-exact plaintext `list.txt` serves 68020+ Amiga clients over plain HTTP.

**Tech Stack:** Express (existing app.ts), better-sqlite3 via door-catalog.service patterns, node crypto, supertest for API tests, jest via dev-scripts/jest.config.ts.

**Spec:** `thoughts/shared/plans/2026-08-17-door-repo-central-api-design.md` — binding. NOTE one spec correction discovered during planning: `door_catalog_files` has NO md5 column (columns: catalog_id, path, size, is_junk, junk_reason). Therefore BOTH md5 and sha256 are computed at manifest build and cached by (absolute path, mtime, size) — the spec's "md5 reused from door_catalog_files where present" clause is void; everything else stands.

## Global Constraints

- TypeScript strict, no `any` in new exported APIs; `npx tsc --noEmit` clean in web/backend (and Doors/door-manager for its tasks) after every task.
- Tests: `SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . <path>` from web/backend; API tests follow the supertest pattern of `web/backend/tests/api/config-routes.test.ts:1-43` (`waitForTestDb()` + SKIP_DB_INIT interplay).
- No emojis anywhere; ASCII log tokens. Full English words in UI labels.
- No rate limiting, no CSRF (house rulings). API is read-only by design — zero write endpoints.
- `list.txt`: ISO-8859-1 (latin1) encoding, CRLF line endings, pipe-delimited, pipes in text replaced with `!`, description truncated to 120 chars, header line `DOORREPO|1|<revision>|<count>`, append-only format evolution.
- Commit per task, files by name (never -A). Doors/door-manager/dist MUST be rebuilt and committed for any door-manager task.
- **Tasks 5-8 are GATED: do not start until the DOORMAN round-6 SDK fix wave is closed by the controller** (they touch Doors/door-manager/app.ts which that wave owns).
- Env vars: `DOOR_REPO_ROLE` (`owner`|`consumer`, default `consumer`), `DOOR_REPO_URL` (default `https://bbs.uprough.net`, empty string disables). Read via `process.env` at module init following door-catalog.service.ts:5-8 style.

---

### Task 1: Checksum cache module

**Files:**
- Create: `web/backend/src/doors/door-repo-checksums.ts`
- Test: `web/backend/tests/doors/door-repo-checksums.test.ts`

**Interfaces:**
- Produces: `getArchiveChecksums(absPath: string): { md5: string; sha256: string }` (throws on unreadable file); `_clearChecksumCacheForTests(): void`.
- Cache key: `${absPath}:${mtimeMs}:${size}` in a module-level `Map` (invalidates automatically when the file changes; module-level is safe — computation is pure per key).

- [ ] **Step 1: Write the failing test**

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getArchiveChecksums, _clearChecksumCacheForTests } from '../../src/doors/door-repo-checksums';

describe('door-repo checksums', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  const file = path.join(tmp, 'a.lha');
  beforeEach(() => { _clearChecksumCacheForTests(); });
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('computes md5 and sha256 of file bytes', () => {
    fs.writeFileSync(file, Buffer.from('hello'));
    const c = getArchiveChecksums(file);
    expect(c.md5).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(c.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns cached result for unchanged file, recomputes after change', () => {
    fs.writeFileSync(file, Buffer.from('hello'));
    const a = getArchiveChecksums(file);
    const b = getArchiveChecksums(file);
    expect(b).toBe(a); // same object => cache hit
    fs.writeFileSync(file, Buffer.from('world'));
    const c = getArchiveChecksums(file);
    expect(c.md5).not.toBe(a.md5);
  });

  it('throws on missing file', () => {
    expect(() => getArchiveChecksums(path.join(tmp, 'nope.lha'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL** — `SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/doors/door-repo-checksums.test.ts` → module not found.
- [ ] **Step 3: Implement**

```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface ArchiveChecksums { md5: string; sha256: string; }
const cache = new Map<string, ArchiveChecksums>();

export function getArchiveChecksums(absPath: string): ArchiveChecksums {
  const st = fs.statSync(absPath); // throws if missing — loud by design
  const key = `${absPath}:${st.mtimeMs}:${st.size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const buf = fs.readFileSync(absPath);
  const result: ArchiveChecksums = {
    md5: crypto.createHash('md5').update(buf).digest('hex'),
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
  cache.set(key, result);
  return result;
}

export function _clearChecksumCacheForTests(): void { cache.clear(); }
```

- [ ] **Step 4: Run test, verify PASS.**
- [ ] **Step 5: tsc + commit** — `npx tsc --noEmit`; `git add web/backend/src/doors/door-repo-checksums.ts web/backend/tests/doors/door-repo-checksums.test.ts && git commit -m "feat(door-repo): archive checksum cache (md5+sha256, mtime-keyed)"`.

---

### Task 2: Manifest builder + list.txt renderer

**Files:**
- Create: `web/backend/src/doors/door-repo-manifest.ts`
- Test: `web/backend/tests/doors/door-repo-manifest.test.ts`

**Interfaces:**
- Consumes: `getArchiveChecksums` (Task 1); catalog DB via the same better-sqlite3 access pattern as `door-catalog.service.ts` (read its top ~40 lines and reuse its DB-open helper if exported, else open the same resolved path readonly); `resolveArchivePath(archive_path)` from `door-catalog.service.ts:100-105`.
- Produces:
  - `interface ManifestDoor { archiveName: string; doorType: string; name: string | null; author: string | null; releaseGroup: string | null; category: string | null; description: string | null; fileIdDiz: string | null; archiveSize: number | null; md5: string | null; sha256: string | null; }`
  - `interface DoorRepoManifest { formatVersion: 1; revision: string; generatedAt: string; doors: ManifestDoor[]; }`
  - `buildManifest(opts?: { type?: string; q?: string }): DoorRepoManifest`
  - `renderListTxt(m: DoorRepoManifest): Buffer` (latin1, CRLF)
  - `getRepoRevision(): string` — read from the SAME source the existing `/health` endpoint uses (see `web/backend/src/server/app.ts:191`; reuse that mechanism verbatim, do not invent a second revision source).
- Checksum policy: checksums are computed lazily per archive and are `null` when the archive file is missing/unreadable (the row still appears; a consumer install of such a row 404s at download — loud there, not here). Log one ASCII `[door-repo] WARN checksum unavailable: <archive>` per offender.
- `q` filter matches the same fields `searchCatalog` (door-catalog.service.ts:107-131) matches, case-insensitive substring; `type` is exact `door_type` equality. Rows with `door_type='REXX'` are included (they are catalog content like any other).

- [ ] **Step 1: Write the failing tests** — use a temp sqlite DB seeded with 3 rows (one with a real temp archive file for checksum coverage, one with a missing archive, one REXX) via better-sqlite3 in the test; assert: manifest shape + formatVersion 1; type filter; q filter; null checksums for missing archive; `renderListTxt` golden — exact bytes:

```typescript
// golden assertion core (after building manifest m with the seeded rows):
const txt = renderListTxt(m);
const lines = txt.toString('latin1').split('\r\n');
expect(lines[0]).toBe(`DOORREPO|1|${m.revision}|${m.doors.length}`);
// pipe escaping + truncation:
// seed one row with description 'a|b'.repeat(60) → expect '!' replacing '|' and length <= 120
expect(lines[1].split('|').length).toBe(6); // archiveName|doorType|size|md5|name|description
expect(txt.toString('latin1').endsWith('\r\n')).toBe(true);
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — `buildManifest` queries `SELECT archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size FROM door_catalog` with optional WHERE; maps to ManifestDoor; checksums via `resolveArchivePath` + `getArchiveChecksums` in try/catch→null+warn. `renderListTxt`: for each door emit `${esc(archiveName)}|${doorType}|${archiveSize ?? 0}|${md5 ?? ''}|${esc(name ?? '')}|${esc(oneLine(description ?? '')).slice(0,120)}` where `esc = (s: string) => s.replace(/\|/g, '!')` and `oneLine` collapses all `\r\n\t` runs to single spaces; join with `\r\n`, trailing `\r\n`, `Buffer.from(out, 'latin1')`.
- [ ] **Step 4: Run, verify PASS; tsc.**
- [ ] **Step 5: Commit** — `git add web/backend/src/doors/door-repo-manifest.ts web/backend/tests/doors/door-repo-manifest.test.ts && git commit -m "feat(door-repo): manifest builder and byte-exact list.txt renderer"`.

---

### Task 3: Express router + mounting

**Files:**
- Create: `web/backend/src/server/door-repo.routes.ts`
- Modify: `web/backend/src/server/app.ts` (mount next to the existing routers at app.ts:204-207)
- Test: `web/backend/tests/api/door-repo-routes.test.ts`

**Interfaces:**
- Consumes: `buildManifest`, `renderListTxt`, `getRepoRevision` (Task 2); `getArchiveChecksums` (Task 1); catalog lookup by archive_name + `resolveArchivePath` (door-catalog.service.ts).
- Produces (HTTP, all read-only, all with `X-Door-Repo-Revision` header):
  - `GET /api/door-repo/manifest` — JSON; `ETag: "<revision>"`; `If-None-Match` match → 304 empty body; supports `?type=`, `?q=`.
  - `GET /api/door-repo/list.txt` — `Content-Type: text/plain; charset=ISO-8859-1`; same query params.
  - `GET /api/door-repo/archive/:archiveName` — resolves ONLY via catalog row lookup (`SELECT archive_path FROM door_catalog WHERE archive_name = ?` — parameterized; NEVER path-join user input to the filesystem), then `resolveArchivePath`; streams file with `Content-Length`, `Content-Type: application/octet-stream`, `X-Archive-MD5`, `X-Archive-SHA256`; unknown name or missing file → 404 `text/plain` body `NOT FOUND: <archiveName>\r\n`.
  - `GET /api/door-repo/health` — `{ status: 'ok', revision, doors: <count> }`.

- [ ] **Step 1: Write the failing tests** (supertest per config-routes.test.ts pattern; seed the test DB with 2 catalog rows, one having a real temp archive file):
  - manifest 200 shape + ETag; second request with If-None-Match → 304.
  - list.txt: charset header + first-line golden + CRLF.
  - archive: 200 with correct Content-Length equal to file size and both checksum headers; `GET /api/door-repo/archive/..%2F..%2Fetc%2Fpasswd` → 404 (catalog lookup misses — proves no filesystem pathing); unknown name → 404 with plaintext body.
  - health: revision string non-empty, doors count matches seeds.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement router; mount in app.ts** — `app.use('/api/door-repo', doorRepoRouter)` beside app.ts:204-207. Handlers are thin: parse params, call Task-2 functions, set headers, stream with `fs.createReadStream` piped to res (error listener → 404/500 plaintext, never hang).
- [ ] **Step 4: Run tests + tsc, verify PASS.**
- [ ] **Step 5: Commit** — `git add web/backend/src/server/door-repo.routes.ts web/backend/src/server/app.ts web/backend/tests/api/door-repo-routes.test.ts && git commit -m "feat(door-repo): read-only repo API (manifest, list.txt, archive, health)"`.

---

### Task 4: Public integrator documentation

**Files:**
- Create: `docs/DOOR-REPO-API.md`

**Interfaces:** Consumes the shipped behavior of Tasks 2-3 (verify every example against the running code — start the backend or use supertest snippets to capture REAL responses; no invented output).

- [ ] **Step 1: Write the document** with exactly these sections:
  1. **Overview** — what the repo is, base URL `https://bbs.uprough.net` and plain-HTTP availability statement (`http://` works for all `/api/door-repo/*` paths), read-only statement, curation-happens-in-git statement.
  2. **Quick start (Amiga, 68020+)** — fetch `list.txt`, pick a row, fetch the archive, verify md5. Include a literal wget/AmiTCP-style example and the exact first line of a real response.
  3. **`list.txt` format** — byte-exact spec: ISO-8859-1, CRLF, header `DOORREPO|1|<revision>|<count>`, field table (archiveName, doorType, archiveSize, md5, name, description), `|`→`!` escaping, 120-char description truncation, append-only versioning promise ("parsers MUST ignore trailing fields they do not know").
  4. **JSON manifest** — full real example response (one door), ETag/If-None-Match usage.
  5. **Archive download** — headers table (Content-Length, X-Archive-MD5, X-Archive-SHA256, X-Door-Repo-Revision), 404 behavior.
  6. **Update detection** — compare header-line revision with last seen; ETag for JSON clients.
  7. **Filters** — `?type=`, `?q=` with real examples.
  8. **Checksum verification walkthrough** — md5 minimum, sha256 available.
  9. **Stability promise** — formatVersion bumps, append-only fields, no removals without a major bump.
- [ ] **Step 2: Verify every example** against the real implementation (run the route tests or a local server; paste actual bytes).
- [ ] **Step 3: Commit** — `git add docs/DOOR-REPO-API.md && git commit -m "docs(door-repo): public API reference for external integrators"`.

---

### Task 5 (GATED on round-6 close): DOORMAN repo-client module

**Files:**
- Create: `Doors/door-manager/repo-client.ts`
- Test: `web/backend/tests/doors/doorman-repo-client.test.ts`

**Interfaces:**
- Produces:
  - `interface RepoClientConfig { url: string; cacheFile: string; }`
  - `interface FetchManifestResult { manifest: DoorRepoManifest; fromCache: boolean; cachedAt: string | null; }`
  - `fetchManifest(cfg: RepoClientConfig): Promise<FetchManifestResult>` — GET `${url}/api/door-repo/manifest` with `If-None-Match` from cache; 200 → write `{ etag, cachedAt, manifest }` JSON to cacheFile and return fresh; 304 → return cached; network/parse error → cached with `fromCache: true` if cache exists, else throw (loud).
  - `downloadArchive(cfg: RepoClientConfig, archiveName: string, destPath: string, expectedSha256: string): Promise<void>` — stream to destPath, then sha256-verify (node crypto); mismatch → delete destPath, throw `Error('CHECKSUM MISMATCH ...')` naming both values. No md5 fallback.
  - Use node `fetch` (global in the runtime Node); tests mock it via `jest.spyOn(globalThis, 'fetch')`.
- Cache file location decided by the caller (Task 6 passes `<resolveBbsRoot()>/door-repo-cache.json`); this module never guesses paths.

- [ ] **Step 1: Failing tests** — fresh-200 path writes cache; 304 path returns cached manifest; network-error path returns cache when present, throws when absent; download verifies sha256 and deletes+throws on mismatch (serve corrupted bytes from the mock).
- [ ] **Step 2: FAIL run. Step 3: implement. Step 4: PASS + tsc both packages. Step 5: rebuild door-manager dist, commit** — `git add Doors/door-manager/repo-client.ts Doors/door-manager/dist web/backend/tests/doors/doorman-repo-client.test.ts && git commit -m "feat(doorman): repo client with ETag cache and sha256-verified downloads"`.

---

### Task 6 (GATED): consumer-mode data source + offline banner

**Files:**
- Modify: `Doors/door-manager/app.ts` (RepoView.loadEntries around app.ts:576-587; header around the round-4b `formatSystemTag` call site)
- Test: `web/backend/tests/doors/doorman-consumer-mode.test.ts`

**Interfaces:**
- Consumes: `fetchManifest` (Task 5); `DOOR_REPO_ROLE`/`DOOR_REPO_URL` env; `resolveBbsRoot()` (already in door-manager per 2026-08-16 work — grep for it).
- Produces: in consumer mode (`DOOR_REPO_ROLE !== 'owner'` AND `DOOR_REPO_URL` non-empty), `loadEntries()` maps ManifestDoor rows into the same entry shape `searchCatalog` returns (fields the view reads: archive_name, door_type, name, description, archive_size, installed — installed resolved LOCALLY by checking the local catalog/registry, since central knows nothing of local installs); text filter + system filter operate on the manifest rows client-side (reuse existing filter functions unchanged). `fromCache: true` → header suffix ` OFFLINE (cached <cachedAt date>)`. Owner mode and empty-URL mode: behavior byte-identical to today (regression tests must prove this).

- [ ] Steps: failing tests (mode selection matrix: owner / consumer-fresh / consumer-cached-offline / URL-empty; entry mapping correctness; filters still applied) → FAIL → implement → PASS + tsc → rebuild dist → commit `feat(doorman): consumer mode browses the central repo`.

---

### Task 7 (GATED): consumer install-from-download

**Files:**
- Modify: `Doors/door-manager/app.ts` (`doInstallUninstall`, app.ts:826-920)
- Test: `web/backend/tests/doors/doorman-consumer-install.test.ts`

**Interfaces:**
- Consumes: `downloadArchive` (Task 5); existing `extractArchiveTo()`, `findExtractedBinary()`, `buildDoorInfoContent()` (all already called in doInstallUninstall — reuse, do not duplicate).
- Produces: in consumer mode, install path becomes: `downloadArchive` to `<bbsRoot>/tmp-door-repo/<archiveName>` (mkdir -p, cleaned in finally) → then the EXISTING extract+register flow on that file → local registration only (`markInstalled` against the local DB where the local row exists; for doors absent from the local catalog, install proceeds without `markInstalled` and the report notes registry-only tracking — do NOT invent local catalog rows). Uninstall unchanged. All errors surface in the existing loud `reportFailure` panel.

- [ ] Steps: failing tests (download+verify called with sha256 from manifest; checksum-fail surfaces error and leaves no temp file; success path calls extractArchiveTo with the downloaded path) → FAIL → implement → PASS + tsc → rebuild dist → commit `feat(doorman): consumer installs download and verify from the central repo`.

---

### Task 8 (GATED): role-gate curation UI

**Files:**
- Modify: `Doors/door-manager/app.ts` (hotkey registrations + footer hints for curation actions)
- Test: `web/backend/tests/doors/doorman-role-gating.test.ts`

**Interfaces:**
- Consumes: the mode decision from Task 6 (extract it as `getDoorRepoMode(): 'owner' | 'consumer' | 'disabled'` in app.ts or repo-client.ts so all three tasks share ONE decision function — if Task 6 inlined it, extract now).
- Produces: consumer mode hides/omits: Strip ([S]) on repo copies, any catalog-row edit action, archive delete. Install/uninstall of own doors stays. Footer hints reflect the reduced set (no dead hints). Owner mode: identical to today (test proves the full hint string unchanged).

- [ ] Steps: failing tests (hotkey map + footer per mode) → FAIL → implement → PASS + tsc → rebuild dist → commit `feat(doorman): consumer mode hides repo curation actions`.

---

### Task 9: Plain-HTTP path exemption (deploy config)

**Files:**
- Modify: whatever serves HTTP→HTTPS redirects for bbs.uprough.net — FIRST locate it: grep the repo for nginx/caddy/traefik/compose config (`grep -ri "443\|ssl\|letsencrypt\|redirect" docker-compose* deploy/ .github/workflows/ 2>/dev/null`). If the proxy config is NOT in the repo (lives only on the host), this task produces `docs/DOOR-REPO-API.md` amendment + an exact ssh-applied config snippet in the task report for the controller/owner to apply, and a curl-based verification step.

**Interfaces:** Produces: `curl -s -o /dev/null -w '%{http_code}' http://bbs.uprough.net/api/door-repo/health` returns 200 (not 301).

- [ ] Step 1: locate the redirect layer; Step 2: exempt `/api/door-repo/` from HTTPS redirect (config change in repo if present; otherwise documented snippet); Step 3: verification command above (post-deploy — mark as controller/manual verification if config is host-side); Step 4: commit whatever is repo-side.

---

### Task 10: E2E fixture-server test

**Files:**
- Create: `web/backend/tests/doors/doorman-repo-e2e.test.ts`

**Interfaces:** Consumes Tasks 3+5: start the real Express app (supertest's http server or `app.listen(0)`), point `fetchManifest`/`downloadArchive` at it with a temp cache file, drive: fresh manifest → 304 on refetch → archive download with good sha (from the server's own header) → corrupted-file case by serving a mismatching seeded row. No live network; all local.

- [ ] Steps: failing test → FAIL → wire → PASS + tsc → commit `test(door-repo): end-to-end consumer flow against local fixture server`.

---

## Self-review notes (done at write time)

- Spec coverage: config table→T6/T8 env handling; manifest→T2; list.txt→T2; archive→T3; health→T3; checksums→T1 (+spec correction noted in header); consumer flow→T5-T7; role gating→T8; failure modes→T5 (offline/loud), T7 (checksum), T3 (404); docs→T4; plain HTTP→T9; testing section→per-task + T10; YAGNI list untouched by any task.
- Type consistency: `DoorRepoManifest`/`ManifestDoor` defined in T2, consumed by T3/T5/T6; `RepoClientConfig`/`FetchManifestResult` in T5, consumed by T6/T7/T10; `getDoorRepoMode` defined in T8's interface block with T6 as origin.
- No placeholders: every code step carries real code or exact commands; T4's doc content is enumerated section-by-section with the format spec inline; T9 is honestly conditional on where the proxy config lives, with an exact locating command and verification.
