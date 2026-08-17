---
date: 2026-08-17
topic: Central door repo — read-only distribution API + consumer DOORMAN mode + 68K client surface
tags: [design, spec, door-repo, doorman, api, 68k]
status: draft
---

# Central Door Repo — Design Spec

Decided with the repo owner 2026-08-17 (brainstorm session). This document is
the binding spec; the implementation plan derives from it.

## Goal

The door catalog + archives hosted by bbs.uprough.net become the CENTRAL door
repo for every AmiExpress-web deployment — and for real 68K AmiExpress via a
retro-friendly API. Only the repo owner curates; consumer sysops browse and
install. Curation authority = git push access to this repository. The public
API carries ZERO write endpoints.

## Decisions (from brainstorm, in order)

1. Audience: anyone running amiexpress-web (public ecosystem) + real 68K
   AmiExpress clients (original-author integration). Baseline for the retro
   client: 68020 or better (per repo owner) — the plaintext/md5/plain-HTTP
   choices are about the classic AmigaOS TCP + TLS tooling ecosystem, not
   CPU limits.
2. Transport: HTTP API served by the existing backend on bbs.uprough.net.
3. Write path: git only. Owner curates locally, commits, pushes; deploy
   publishes. No auth system, no upload endpoints, nothing to attack.
4. Owner signal: explicit config — `DOOR_REPO_ROLE=owner` on the owner
   deployment only. UI-only gate; enforcement is the read-only API + git.
5. Default-on: `DOOR_REPO_URL` defaults to `https://bbs.uprough.net` so fresh
   deployments get the repo in DOORMAN with zero config. Opt out or repoint
   via the same variable.
6. Plain HTTP allowed for `/api/door-repo/*` (redirect exemption) so classic
   Amiga TCP stacks work without AmiSSL.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DOOR_REPO_ROLE` | `consumer` | `owner` enables DOORMAN curation UI + serves the API from local catalog/archives. |
| `DOOR_REPO_URL` | `https://bbs.uprough.net` | Base URL consumers fetch from. Empty string disables the remote repo entirely. |

Consumer mode is the default everywhere; the owner deployment sets
`DOOR_REPO_ROLE=owner` in its compose environment.

## API (read-only; served by the existing Express backend)

All endpoints respond on both HTTPS and plain HTTP. No auth. No rate limiting
(house rule). Every response carries `X-Door-Repo-Revision` (git SHA of the
serving deployment).

### `GET /api/door-repo/manifest`
JSON. ETag = repo revision; supports `If-None-Match` → 304.

```json
{
  "formatVersion": 1,
  "revision": "<git sha>",
  "generatedAt": "<iso8601>",
  "doors": [
    {
      "archiveName": "DDTWALL.LHA",
      "doorType": "DD",
      "name": "DreamTagWall",
      "author": "MadDoX",
      "releaseGroup": "...",
      "category": null,
      "description": "...",
      "fileIdDiz": "...",
      "archiveSize": 12345,
      "md5": "<hex>",
      "sha256": "<hex>"
    }
  ]
}
```

Optional query params: `type` (exact door_type match), `q` (substring match on
name/archiveName/description — same fields searchCatalog uses).

### `GET /api/door-repo/list.txt`
Plaintext for 68K clients. Latin-1 (ISO-8859-1) encoding, CRLF line endings.
Line 1 header, then one door per line, pipe-delimited. Pipes inside text
fields are replaced with `!`. Description is truncated to one line, max 120
chars.

```
DOORREPO|1|<revision>|<count>
<archiveName>|<doorType>|<archiveSize>|<md5>|<name>|<description>
```

Same `type`/`q` query params. Format-version bumps (field additions) only
ever APPEND fields; parsers must tolerate trailing fields. This promise is
documented in the public API doc.

### `GET /api/door-repo/archive/<archiveName>`
The raw archive bytes. `Content-Length` always set (68K clients preallocate).
`X-Archive-MD5` and `X-Archive-SHA256` headers. 404 with a plaintext body for
unknown names. `archiveName` must match a catalog row exactly (no path
traversal — resolve via catalog lookup, never the filesystem string).

### `GET /api/door-repo/health`
`{ "status": "ok", "revision": "<sha>", "doors": <count> }`.

## Checksums

sha256 computed at manifest-generation time and cached per (archive, mtime);
md5 reused from door_catalog_files where present, computed the same way where
absent. Both always present in the manifest; md5 is the documented minimum
for retro clients.

## Consumer DOORMAN flow

- Repo view open: fetch manifest from `DOOR_REPO_URL` with `If-None-Match`
  of the cached ETag. Cache (manifest + ETag) persists on disk under the
  BBS data dir. On network failure: use cache, show `OFFLINE (cached
  <date>)` in the header. No cache + no network = loud error view.
- Install: download archive → verify sha256 (fail loudly on mismatch, no
  retry-with-md5 fallback) → existing portable repo-install path → local
  registration. `installed`/`installed_as` remain purely local.
- `DOOR_REPO_ROLE=consumer` hides all curation actions (strip-repack of repo
  copies, catalog edits, archive delete). Local install/uninstall of the
  sysop's own doors remains available.
- Owner deployment: DOORMAN unchanged from today (local catalog is THE
  catalog).

## Failure modes

- Central down → cached browse + OFFLINE banner; uncached archive installs
  fail loudly.
- Mid-deploy skew (manifest revision != archive bytes) → checksum mismatch →
  loud error naming both revisions; user retries after deploy completes.
- Malformed manifest (partial fetch) → JSON parse failure → treated as
  network failure (cache + banner), never a crash.

## Public documentation deliverable

`docs/DOOR-REPO-API.md`, written for an EXTERNAL integrator (the original
AmiExpress author is integrator zero):
- Endpoint reference with full request/response examples.
- `list.txt` format specified byte-exactly (encoding, CRLF, escaping,
  truncation, header line, append-only versioning promise).
- Update detection: compare header revision against last seen.
- md5 verification walkthrough.
- Plain-HTTP availability statement + base URL.
- Explicit statement: API is read-only; catalog curation happens in the
  amiexpress-web repository.

## Testing

- API: manifest shape + ETag/304; list.txt byte-exact golden (encoding, CRLF,
  escaping, truncation); archive serving with Content-Length + checksum
  headers; 404 path; type/q filters; path-traversal rejection.
- Consumer client: cache write/read, 304 handling, offline fallback, checksum
  verify (RED on corrupted archive), role gating of curation UI.
- E2E: consumer-mode DOORMAN against a local fixture server (existing test
  patterns; no live network in CI).

## Not in v1 (explicit YAGNI)

Stats/telemetry, ratings, sysop door submissions, delta sync, mirrors,
signing beyond sha256, upload API, per-BBS keys/registration.

## Deployment notes (owner side)

- Redirect exemption: plain-HTTP requests to `/api/door-repo/*` must NOT be
  redirected to HTTPS (check nginx/proxy config in the deploy stack; if a
  blanket redirect exists, exempt the path).
- Archives are already on the live volume (DoorArchives); the API serves
  from the same resolved archive root the installer uses
  (DOOR_ARCHIVES_ROOT).
- The live catalog DB is the serving source on the owner box; consumers
  never see the DB, only the API.
