---
date: 2026-08-23
topic: doors.uprough.net - public door browser and admin console
tags: [doorserver, admin, react, radix, sqlite, uploads, moderation]
status: draft
---

# doors.uprough.net: public browser + admin console

## 1. Where things stand today

The door server (`/Users/spot/Code/amiexpress-doorserver`) is a read-only
HTTP API and nothing else:

| Fact | Evidence |
| --- | --- |
| Four public GET routes, no writes | `src/routes.ts:166,182,196,473` - `/manifest`, `/list.txt`, `/index.tsv`, `/health`, plus `/archive/:archiveName` |
| No web UI of any kind | repo has `src/`, `tests/`, `docs/`, `contract/`, `scripts/` - no frontend workspace |
| No auth in the request path | `adminKeys` is parsed (`src/config.ts:44-64`) and never read by any route |
| Catalog is one table plus a file list | `src/schema.sql` - `door_catalog`, `door_catalog_files` |
| Container is loopback-only, Caddy fronts it | `docker-compose.yml` - `127.0.0.1:3010:3010`, with a comment already anticipating `/admin/*` |
| Deploy is push-to-main -> SSH -> compose up | `.github/workflows/deploy-doorserver.yml` |
| Data volume is `doorserver-data` at `/data` | `docker-compose.yml`; DB `/data/doors.db`, archives `/data/Archives` |

So: browsing, searching, sorting, downloading, editing, submitting - none of
it exists. Everything below is new.

## 2. Decisions already taken

1. **The UI lives in the door server repo** and is served by its own Express
   on the same origin. No CORS for the UI, one container, one deploy.
2. **Admins log in with a password and get a JWT** in the `Authorization`
   header. `DOORSERVER_ADMIN_KEYS` becomes the bootstrap that creates the
   first account and is then unused for requests.
3. **Manual edits live in an overrides table.** A corpus re-scan rewrites
   `door_catalog` freely; the API layers overrides on top. Edits are
   permanent, per-field, and revertible.
4. **Submissions are anonymous into a quarantine queue**, invisible until
   approved.

Stack, chosen to match what this project already runs rather than to
introduce a fourth idiom (`web/config-app` is the reference): React 18 +
Vite + TypeScript + Tailwind + TanStack Query + react-hook-form + zod +
lucide-react. Added for this build: **Radix UI primitives** (not Radix
Themes - Themes ships its own token/layout system and would fight the
Tailwind config we are copying in).

## 3. Data model

All DDL goes in `src/schema.sql`, applied by the existing idempotent
`CREATE TABLE IF NOT EXISTS` bootstrap, plus a numbered migration runner
(new `src/migrations.ts`) because two of these change existing rows.

```sql
-- 3.1 the BBS version a door needs. Scanned value; overridable like any
-- other field. "For /X 2.3x", "/X 3.38+", "requires AmiExpress 4.x".
ALTER TABLE door_catalog ADD COLUMN requires_bbs TEXT;
CREATE INDEX IF NOT EXISTS idx_door_catalog_requires ON door_catalog(requires_bbs);

-- 3.2 per-field human corrections. A row exists only for a field a human
-- touched, so reverting is DELETE, and a re-scan can never lose an edit.
CREATE TABLE IF NOT EXISTS door_catalog_overrides (
  catalog_id  TEXT NOT NULL,
  field       TEXT NOT NULL,          -- name|description|version|author|
                                      -- release_group|category|door_type|
                                      -- requires_bbs|binary_name|suggested_tooltypes
  value       TEXT,                   -- NULL means "blank this field"
  edited_by   INTEGER NOT NULL REFERENCES admin_users(id),
  edited_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (catalog_id, field)
);

-- 3.3 admin accounts
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,        -- argon2id
  role          TEXT NOT NULL DEFAULT 'admin',   -- admin|owner
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login_at INTEGER
);

-- 3.4 the submission queue. The file sits in /data/quarantine until
-- approved; approval moves it into /data/Archives and inserts a
-- door_catalog row.
CREATE TABLE IF NOT EXISTS door_submissions (
  id             TEXT PRIMARY KEY,            -- uuid
  archive_name   TEXT NOT NULL,
  quarantine_path TEXT NOT NULL,
  size           INTEGER NOT NULL,
  md5            TEXT NOT NULL,
  sha256         TEXT NOT NULL,
  submitter_note TEXT,
  submitter_ip   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  reject_reason  TEXT,
  parsed_name    TEXT,                        -- what the archive reader found
  parsed_diz     TEXT,
  parsed_files   TEXT,                        -- JSON array of {path,size}
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  decided_by     INTEGER REFERENCES admin_users(id),
  decided_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON door_submissions(status);

-- 3.5 who changed what. Every admin write appends one row.
CREATE TABLE IF NOT EXISTS admin_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL REFERENCES admin_users(id),
  action     TEXT NOT NULL,           -- edit|revert|approve|reject|delete|login
  target     TEXT NOT NULL,           -- catalog_id or submission id
  detail     TEXT,                    -- JSON {field, from, to}
  at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

**Effective row** (new `src/effective.ts`): one function,
`applyOverrides(row, overrides)`, used by *every* read path -
`fetchCatalogRows`, `buildManifest`, `renderListTxt`, `renderIndexTsv`, and
the new JSON endpoints. Single source of truth; nothing else may read
`door_catalog` raw except the admin "scanned vs edited" diff view.

Bump `getCatalogRevision` (`src/catalog.ts:84`) to include
`MAX(edited_at)` from the overrides table, or every cache in the fleet
keeps serving pre-edit bytes.

## 4. Server work (amiexpress-doorserver/src)

New modules:

| File | Purpose |
| --- | --- |
| `auth.ts` | argon2id hash/verify, JWT sign/verify (HS256, 12h), `requireAdmin` middleware reading `Authorization: Bearer` |
| `admin-routes.ts` | everything under `/api/door-repo/admin` |
| `public-routes.ts` | the JSON browse API (kept out of `routes.ts`, which stays the legacy-client contract) |
| `effective.ts` | overrides layering (section 3) |
| `submissions.ts` | quarantine write, hash, archive parse, approve/reject transitions |
| `events.ts` | SSE stream, one event per catalog revision change |
| `migrations.ts` | numbered, forward-only, run at startup before `assertCatalogUsable` |
| `describe.ts` | the description/version/author/requirement rules (section 5) |

Endpoints:

```
PUBLIC (no auth)
  GET  /api/door-repo/doors?q=&type=&system=&requires=&sort=&dir=&page=&per_page=
                                   -> { rows, total, page, per_page }
  GET  /api/door-repo/doors/:archiveName        -> full row + files + FILE_ID.DIZ + doc
  GET  /api/door-repo/doors/:archiveName/diz    -> raw DIZ, text/plain; charset=ISO-8859-1
  GET  /api/door-repo/facets                    -> distinct systems, types, categories, requires_bbs
  GET  /api/door-repo/events                    -> SSE: {revision} on change
  POST /api/door-repo/submissions               -> multipart upload, 202 + submission id
  (existing) /manifest /list.txt /index.tsv /archive/:name /health

ADMIN (Bearer JWT)
  POST   /admin/login                           -> { token, user }
  GET    /admin/me
  GET    /admin/doors?...                       -> as public, plus scanned-vs-effective per field
  PATCH  /admin/doors/:id                       -> { field: value, ... } writes overrides
  DELETE /admin/doors/:id/overrides/:field      -> revert one field to the scanned value
  POST   /admin/doors/:id/redescribe            -> re-run the rules on this row, preview or commit
  DELETE /admin/doors/:id                       -> hide from the catalog (soft: sets a hidden flag)
  GET    /admin/submissions?status=
  POST   /admin/submissions/:id/approve         -> move file, insert catalog row, index it
  POST   /admin/submissions/:id/reject          -> { reason }
  GET    /admin/audit?limit=
```

Upload safety (`submissions.ts`), all enforced server-side:

- `Content-Length` cap 8 MB, and a streaming byte counter that aborts mid-body.
- Extension allowlist: `.lha .lzx .lzh .dms .zip`. Extension is checked
  *and* the archive is opened with the reader the BBS already uses; a file
  that does not parse is rejected before it ever reaches the queue.
- Name normalised to `[A-Za-z0-9!$^&._-]{1,40}`, no path separators; the
  quarantine filename is the submission uuid, never the submitted name.
- sha256 compared against `door_catalog.sha256` and against pending
  submissions - a duplicate is rejected with the archive it duplicates.
- Per-IP quota: 10 submissions / 24h, counted from `door_submissions`. This
  is the one place a limit is right; it guards an anonymous write endpoint,
  not a logged-in BBS user (see the "no rate limiting" note in project
  memory, which is about the BBS's own users).
- Quarantine dir `/data/quarantine`, on the existing `doorserver-data`
  volume, never inside `DOOR_ARCHIVES_ROOT`, never served by any route.

Static hosting: `app.ts` serves `dist/web` for every non-`/api` path with
an SPA fallback to `index.html`, `Cache-Control: no-cache` on the HTML and
immutable hashed assets elsewhere.

## 5. Port the description rules into the server

The tuned rules live in `dev/scripts/door-index/description_rules.py` in
the BBS repo (prototype, 3301-row corpus, regression tests in
`test_description_rules.py`). `src/index-tsv.ts` still runs the older,
weaker classifier, so the live index has the junk that was just fixed
locally: border runs (`]-----[`), `[RELEASE 2]`, `(Version )` scars, CP437
box art, `/X` stripped to `X`.

`describe.ts` ports, rule for rule: cell splitting on border runs, the
two-ASCII-letter word test, high-bit art rejection, meta/empty bracket
removal, word-boundary capping, mid-line banner split into author, the
compatibility-note penalty, `/X` protection, and `split_bbs_requirement`.
`tests/describe.test.ts` mirrors all 25 Python checks with the same DIZ
fixtures, so both implementations are provably the same classifier.

`requires_bbs` is then backfilled by a script
(`scripts/backfill-requires.ts`) over the existing catalog: 410 of 3301
rows carry a requirement in the current corpus.

## 6. The web app (amiexpress-doorserver/web)

```
web/
  index.html
  package.json                 vite + react + tailwind + radix + tanstack query
  tailwind.config.js           dark-first token set (section 6.1)
  src/
    main.tsx  App.tsx  routes.tsx
    api/client.ts              fetch wrapper, injects the JWT, 401 -> logout
    api/queries.ts             typed useQuery/useMutation hooks
    api/types.ts               generated from contract/manifest-types.ts
    hooks/useLiveRevision.ts   SSE subscription -> queryClient.invalidateQueries
    components/
      AppShell.tsx  ThemeProvider.tsx
      DoorTable.tsx            virtualised, sortable, keyboard navigable
      DoorFilters.tsx          search + facet selects (Radix Select, Toggle Group)
      DoorDetail.tsx           Radix Dialog: metadata, file list, DIZ, doc
      DizView.tsx              full FILE_ID.DIZ, monospace, Topaz-ish, preserved
      FieldEditor.tsx          inline edit with scanned-vs-edited badge + revert
      SubmitDialog.tsx         public upload with progress and result
      admin/LoginForm.tsx  admin/SubmissionQueue.tsx  admin/AuditLog.tsx
    pages/Browse.tsx  DoorPage.tsx  admin/Dashboard.tsx  admin/Doors.tsx
```

Radix primitives used: Dialog, DropdownMenu, Select, Tabs, Toast,
Tooltip, ScrollArea, Toggle Group, AlertDialog (destructive confirms),
Popover, Separator, VisuallyHidden. Icons from lucide-react - no emoji
anywhere, per project rules.

### 6.1 Dark theme

Tokens in `tailwind.config.js`, dark as the only theme (this is a scene
BBS site, not a corporate dashboard): background `#0b0d10`, surface
`#14181d`, raised `#1b2027`, border `#272e37`, text `#e6e9ee`, muted
`#9aa4b2`, accent `#5ac8fa`, accent-dim `#2a6f8a`, success `#4ade80`,
warning `#fbbf24`, danger `#f87171`. Body font Inter/system; every
DIZ, file list, tooltype and archive name in a monospace stack. Focus
rings are visible and never removed.

### 6.2 Live without page reloads

- TanStack Query owns all server state; no `window.location.reload()`
  anywhere in the codebase (enforced by an eslint `no-restricted-syntax`
  rule).
- `GET /events` is an SSE stream that emits the catalog revision whenever
  it changes (edit, approve, re-scan). `useLiveRevision` invalidates the
  door queries on each event, so two admins editing at once converge, and a
  public browser sees an approved door appear without touching anything.
- Mutations are optimistic with rollback on error and a Radix Toast on both
  paths.

### 6.3 What the public sees without logging in

Browse, search (name, archive, author, group, description), sort by any
column, filter by system / type / category / required BBS version, open a
door to read its full FILE_ID.DIZ and file list, download the archive, and
submit a door. No login prompt anywhere in that path; the admin entry is a
single link in the footer.

## 7. Phases

Each phase ends with automated checks that must pass and manual checks only
you can tick.

**Phase 0 - description rules ported (server-side truth first).**
Port `describe.ts`, mirror the Python tests, wire it into
`renderIndexTsv`, add `requires_bbs` + backfill.
Automated: `npm run typecheck`, `npm test`, byte-exact `list.txt` parity
test still green, 25 describe checks green.
Manual: spot-check 20 rows of the rendered index against the local
prototype output.

**Phase 1 - data model + effective rows.**
`migrations.ts`, the four new tables, `effective.ts`, revision includes
override time, every read path routed through `applyOverrides`.
Automated: migration test on a copy of the live DB (up, idempotent re-run,
row counts unchanged); an override changes `/index.tsv` bytes and the
revision; deleting it restores the original bytes exactly.
Manual: none.

**Phase 2 - auth.**
`auth.ts`, `/admin/login`, `requireAdmin`, bootstrap account from
`DOORSERVER_ADMIN_KEYS` on first start, audit row on login.
Automated: bad password, expired token, missing header, wrong signature all
401; a valid token reaches a protected route; hashes are argon2id.
Manual: log in from the deployed site once Phase 5 exists.

**Phase 3 - public JSON API.**
`/doors`, `/doors/:name`, `/doors/:name/diz`, `/facets`, `/events`.
Automated: pagination and sort orders, search across all five fields,
Latin-1 DIZ served with the right charset, SSE emits on an override write.
Manual: none.

**Phase 4 - admin API.**
PATCH/DELETE overrides, redescribe preview, soft hide, audit list.
Automated: an edit writes exactly one override row and one audit row;
revert deletes it; a non-admin token is refused; unknown field names are
rejected (allowlist, not free-form SQL).
Manual: none.

**Phase 5 - the web app, public half.**
Vite workspace, theme, shell, table, filters, detail dialog, DIZ view,
download, SSE wiring, served from Express.
Automated: `npm run build:check` in `web/`, component tests for the table's
sort/filter logic and for the DIZ view preserving spacing.
Manual: browse, search, sort, download an archive, read a DIZ - on a phone
and on a desktop; confirm no login is ever requested.

**Phase 6 - the web app, admin half.**
Login, inline field editing with scanned-vs-edited badges and revert,
redescribe preview, audit log.
Automated: form validation tests; a mutation invalidates the right queries.
Manual: edit every editable field on one door, reload, confirm it stuck;
revert one field; confirm the public page shows the edit.

**Phase 7 - submissions.**
Upload endpoint with all of section 4's guards, quarantine volume, the
public submit dialog, the queue UI, approve/reject.
Automated: oversize body aborted, wrong extension refused, non-archive
refused, duplicate sha256 refused, quota enforced, approve moves the file
and inserts a catalog row inside one transaction, reject leaves the archive
directory untouched.
Manual: submit a real LHA from another machine, approve it, confirm it
appears in `/index.tsv` and downloads; submit a junk file and confirm the
refusal message reads sensibly.

## 8. Traps this project has already paid for

- **A green deploy workflow has lied before.** After every deploy check
  `docker exec doorserver cat /app/.git-sha` and the image build time, not
  the workflow's colour.
- **`list.txt` and `index.tsv` are byte-exact contracts** for AmigaDOS
  clients and uhcsearch - `list.txt` CRLF, `index.tsv` LF, both
  ISO-8859-1. The parity tests exist; never "fix" a diff by editing the
  fixture.
- **Latin-1 all the way through.** DIZ text is Latin-1, and Python calls
  some CP437 art characters alphanumeric - the same trap will exist in
  TypeScript with `\w`. Test with the real `SNESDX10.LZH` DIZ.
- **The container is loopback-bound on purpose.** Caddy terminates TLS and
  is host-only config, not in the repo; adding `/admin` means checking the
  host Caddyfile forwards it and does not duplicate headers Express sets.
- **`better-sqlite3` compiles from source in the image** - adding argon2
  (native) means the same treatment: prove it loads in the Dockerfile's
  runtime stage, or the failure surfaces on the host at first start.
- **Uploads land on the data volume, not the image.** `/data/quarantine`
  needs to exist before the first submission; create it at startup, not by
  hand.

## 9. Out of scope

Submitter accounts, ratings or comments, mirroring to other repos, editing
archive *contents* (junk-file pruning stays a corpus-builder job), and any
change to how the BBS itself installs doors.
