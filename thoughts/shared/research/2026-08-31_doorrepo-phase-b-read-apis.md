---
date: 2026-08-31
topic: DOORREPO phase B - what exists today for the four read APIs
tags: [doorrepo-c, door-admin, api, doorman, research]
status: final
---

# Phase B read APIs - what is already here

Documentary. What the code does today, with paths and line numbers, so the
plan can reuse rather than reinvent. No recommendations except where a fact
forces one; those are marked **Decision needed**.

Phase B is defined in `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:186`:
`installed`, `files`, `file`, `info`. "Done when DOORREPO can draw a metadata
panel and a file explorer from the server alone."

## The router that already exists

`web/backend/src/server/door-admin.routes.ts`, 89 lines, mounted in
`web/backend/src/server/app.ts:260`:

```ts
app.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
```

It carries one route from phase A, `POST /installed`
(`door-admin.routes.ts:71`), and three things every phase B route inherits:

- **The token gate** (`door-admin.routes.ts:54-69`). `verifyLaunchToken` on
  `X-Door-Token`, then `claims.secLevel < 250` -> 403. The comment there is
  explicit that the token says which session this is, not what it may do, so
  the level is re-checked per request.
- **`doorAdminBodyError`** (`:38`), a four-parameter Express error handler
  exported so the mount site and the test import the same function. It answers
  `BAD REQUEST\r\n` as text, because a C89 door must never be handed JSON.
- **`isCommandName`** (`:50`), `/^[A-Za-z0-9]{1,12}$/` - "the same shape the C
  door validates and the only shape that can name a
  `Commands/BBSCmd/<CMD>.info`".

Every response so far is `res.type('text/plain')` with CRLF.

## 1. `installed` - the list already exists, but only inside a session

`BBSApi.getDoorList()`, `web/backend/src/doors/BBSApi.ts:1320-1412`. This is
the function both doors already render, and the spec (line 166) names it as
the single place the precedence rule is applied.

What it does, in order:

1. `require('../handlers/door.handler').getDoors()` (`BBSApi.ts:1334`) -
   `door.handler.ts:564`, `export function getDoors(): Door[]`, **no
   arguments, no session**.
2. Resolves each door's directory by trying three candidates -
   `<root>/<door.path>`, `<root>/Doors/<command>`, and the lower-cased variant
   (`BBSApi.ts:1348-1360`) - via `utils/amigafs` for case-insensitive lookup.
   Fills `size` from the stat and sets `resolvedPath` to the directory (the
   `dirname` when the located path is a file, e.g. `AquaScan.020`).
3. `getInstallByCommand(door.command)` once per door into a
   `Map<string, DoorInstall | null>` (`:1381-1394`). The comment records why:
   the repository opens and closes its own better-sqlite3 connection per call,
   and calling it twice per door meant 740 open/close cycles per render.
4. `applyInstallMetadata(door, installRow)`.
5. `getRepoMetadataIndex()` then `applyRepoMetadata(door, repoIndex, { archiveName })`
   (`:1401-1409`), where `archiveName` comes from the install row - the exact-key
   match the spec asks for. Wrapped in try/catch so a missing catalog returns
   the un-overlaid list rather than throwing.

The precedence helpers live in `web/backend/src/doors/door-repo-metadata.ts`
(192 lines) and `door-name-plausibility.ts` (57 lines,
`isPlausibleDoorName`). Both are plain functions - no session, no socket.

**The only session dependency in the whole function is one line**,
`BBSApi.ts:1335`:

```ts
const bbsRoot = (this.session as any)?.dataDir || process.env.BBS_DATA_DIR || process.cwd();
```

So the list logic is session-free apart from where the BBS root comes from.
An HTTP route has no session; `door-admin.routes.ts:78` already resolves its
root the same way minus the session: `process.env.BBS_DATA_DIR || process.cwd()`.

## 2. `files` - nothing server-side to reuse

DOORMAN's file browser is `Doors/door-manager/FileExplorerOverlay.ts`, 562
lines. It runs **in-process on the server**, so it reads the disk directly:
`fs.readdirSync` at `:49`, `fs.statSync` at `:62` and `:101`. There is no
service behind it. `BBSApi` has `listFiles(directory, pattern?)`
(`BBSApi.ts:951`) but the overlay does not use it - it calls `fs` itself.

So `files` has no existing implementation to wrap. What does exist and must
be reused is the containment guard: `Doors/door-manager/safe-install-dir.ts`,
which exports `resolveDoorInstallDir` (`:46`) and the
`ResolvedInstallDir | RejectedInstallDir` discriminated union with
`isSafeToDelete` (`:36`). That module is the guard written after the incident
where an unchecked recursive delete of `PROJECT_ROOT/<install_dir>` resolved
to `Doors/` and removed every door. The spec (line 153) requires the same
guard on `GET .../file`.

Note where it lives: under `Doors/door-manager/`, i.e. inside the door that
is being retired in phase E.

## 3. `file` - a reader exists, its containment does not

`BBSApi.readFile(filename)`, `BBSApi.ts:822-831`, resolves against the
session's root and calls `amigafs.readFileSync(fullPath, 'utf8')`. It is
root-relative by construction and has no per-door containment - correct for
its caller, not sufficient for an HTTP route that takes a path from a query
string.

`Doors/door-manager/AmigaGuideViewer.ts` (201 lines) is the renderer, not a
reader; the C door already renders AmigaGuide itself
(`examples/doorrepo-c/guide.c`).

## 4. `info` - fully covered by an existing utility

`web/backend/src/utils/info-file.util.ts`:

| export | line |
|---|---|
| `parseInfoFile(filePath): InfoFile` | 220 |
| `writeInfoFile(info): void` | 309 |
| `updateTooltype` | 399 |
| `addTooltype` | 427 |
| `toggleTooltypeComment` | 441 |
| `removeTooltype` | 451 |
| `checkToolTypeValue` | 477 |

`BBSApi.readInfoFile` (`:883`) and `writeInfoFile` (`:915`) are thin wrappers
over it, returning `Array<{ key, value, commented }>`. DOORMAN's
`InfoEditorOverlay.ts` calls exactly those two, at `:113` and `:240`, and
nothing else. Phase B needs the read half only; the write is phase C.

## The response format family

The spec (line 133) says responses use "the pipe-delimited text family the C
door already parses", `FILES|<count>|<junk>` then `<size>|<isJunk>|<path>`.

That format is served today by the **door server**
(`/Users/spot/Code/amiexpress-doorserver`), not by this repo, and parsed in
`examples/doorrepo-c/flow.c:1247` and `:1357` - both sites skip the
`FILES|` header line explicitly. It is covered by
`examples/doorrepo-c/tests/test_flow.c:1133-1253`, which exercises the header,
a zero-row body, and junk counts.

So the parser and its tests exist; what phase B adds is three more headers in
the same shape.

## Auth, and why it is not ceremony

`docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:143-160`. The
token is minted per launch and written to `Doors/DoorRepo/DoorRepo.token`,
0600 (`web/backend/src/doors/door-launch-token.ts`, 64 lines). `RepoHost` is
baked to `bbs.uprough.net` in doors shipped to other people's boards, so an
unauthenticated route on this host is reachable from those doors.

Phase B is read-only, which lowers but does not remove the stakes: `file`
returns file contents by path, and an escape from the door's directory is an
arbitrary-file-read on the BBS host.

## Testing precedent

`web/backend/tests/server/door-admin-routes.test.ts` (138 lines) is the phase
A pattern:

- mounts the router with `express.json({ limit: '16kb' })`, `doorAdminBodyError`
  and `doorAdminRouter` "in the exact order app.ts does", importing
  `doorAdminBodyError` from the source so the helper and the real mount cannot
  drift (`:31-39`);
- `jest.mock`s `door-install-record` and `door-launch-token`, driving auth
  through a mutable `claims` reset in `beforeEach` (`:19-41`);
- covers the happy path, no token (401), and secLevel below 250 (403).

The spec's testing section (line 205) adds a constraint this pattern does not
yet meet: "route and unit tests against a temp BBS root with **real files**.
The filesystem is not mocked - the two failures this work exists to fix were
both 'the disk disagreed with the record'." Phase B's `files` and `file`
routes are exactly the case that rule was written for.

## Open points the plan has to settle

**Decision needed 1 - route shape.** The spec's table (line 122) gives
`/api/door-admin/:cmd/files`, alongside `/api/door-admin/installed`. `:cmd` is
`[A-Za-z0-9]{1,12}`, which matches the literal string `installed` (9
alphanumeric characters). A board with a command named `INSTALLED` would make
`GET /api/door-admin/installed` ambiguous. Nesting the per-door routes under
`/installed/:cmd/...` removes the ambiguity.

**Decision needed 2 - where the shared door-list builder lives.** The route
cannot call `BBSApi.getDoorList()` (it is a method on a session-bound class),
and the spec forbids a second copy of the rule: "Two front ends must never
carry two rules" (line 171). Extracting the body into a session-free
`buildDoorList(bbsRoot)` that `BBSApi.getDoorList` then calls is the only
shape that satisfies both.

**Decision needed 3 - where the containment guard lives.** `safe-install-dir.ts`
is under `Doors/door-manager/`, which phase E deletes. A backend route
depending on a module inside a door that is scheduled for removal is a
dependency in the wrong direction.

**Decision needed 4 - what `file` may return.** `BBSApi.readFile` reads
`utf8`. Door directories hold LHA archives, 68K binaries and `.info` files.
The spec says "one file's contents" without saying what happens for a binary
or for a file larger than the C door's `FILES_MAX_BYTES` (16384) or
`DOC_MAX_BYTES` (24576) buffers - and after 2026-08-31 those caches were
trimmed, so the door's ceilings are the ones in
`examples/doorrepo-c/doorrepo.c:1127` and `:1164`.
