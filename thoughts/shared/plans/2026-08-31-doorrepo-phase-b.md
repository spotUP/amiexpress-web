---
date: 2026-08-31
topic: DOORREPO phase B - the four read APIs
tags: [doorrepo-c, door-admin, api, plan]
status: implemented
---

# Phase B - read APIs

Research: `thoughts/shared/research/2026-08-31_doorrepo-phase-b-read-apis.md`.
Spec: `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:186`.

Done when DOORREPO could draw a metadata panel and a file explorer from the
server alone. **Server side only** - no C is written in this phase. The C
screens are phase D.

## Decisions

The research listed four open points. All four are settled here; nothing in
this plan is left to the implementer.

**1. Route shape: nest the per-door routes under `/installed/:cmd/`,
departing from the spec's table.** The spec gives
`/api/door-admin/:cmd/files` next to `/api/door-admin/installed`, and `:cmd`
is `[A-Za-z0-9]{1,12}`, which matches the literal `installed`. A board with a
command named `INSTALLED` would make `GET /api/door-admin/installed`
ambiguous between the list and that door. Nesting removes the ambiguity for
the cost of one path segment:

| method | path |
|---|---|
| GET | `/api/door-admin/installed` |
| GET | `/api/door-admin/installed/:cmd/files` |
| GET | `/api/door-admin/installed/:cmd/file?p=` |
| GET | `/api/door-admin/installed/:cmd/info` |

Phase C's writes follow the same nesting. The spec's table is updated in the
same commit so the two documents do not disagree.

**2. The door list moves to a session-free builder that `BBSApi` then
calls.** New `web/backend/src/doors/door-list.ts` exporting
`buildDoorList(bbsRoot: string)`, holding the current body of
`BBSApi.getDoorList` verbatim except that `bbsRoot` arrives as an argument.
`BBSApi.getDoorList()` becomes a two-line wrapper that resolves the root from
the session and delegates. The route calls the same function. This is what
keeps the spec's rule - "Two front ends must never carry two rules" (spec:171)
- true once there are three callers.

**3. The route's path containment is new backend code, not a reuse of
`Doors/door-manager/safe-install-dir.ts`.** That module answers a different
question: which stored `install_dir` a *delete* may remove, contained to
`<root>/Doors/`. The route asks which caller-supplied relative path may be
*read* inside one named door's directory. Different input, different base,
different result type. The technique is reused and cited; the module is not,
and is not moved - it lives inside the door phase E deletes, and the backend
must not depend on that.

New: `web/backend/src/doors/door-path-guard.ts`.

**4. `file` serves text only, and says when it truncated.** Door directories
hold LHA archives and 68K binaries; the C door has no use for either and its
buffers are 16 KB (`FILES_MAX_BYTES`) and 24 KB (`DOC_MAX_BYTES`,
`examples/doorrepo-c/doorrepo.c:1127` and `:1164`). A NUL byte in the first
8 KB means binary -> `415 BINARY`. Text is capped at 32768 bytes, above the
door's own ceilings so the door decides how much it keeps, with the header
flagging truncation.

## Response formats

Plain text, CRLF, one header line naming the shape and a count, then rows -
the family `flow.c:1247` and `:1357` already parse. Headers are distinct
words: reusing the door server's `FILES|` for a different row shape would
walk straight into the existing parser.

Field hygiene, applied by one shared renderer so no route can forget it: in
every field, `|`, CR and LF are replaced with a single space, and the field is
then truncated to its stated cap. A door name containing a pipe must not be
able to shift every later column.

```
DOORS|<count>
<command>|<type>|<size>|<enabled>|<accessLevel>|<archive>|<name>|<category>|<description>
```
Caps: command 12, type 8, archive 64, name 64, category 32, description 160.
`enabled` is `0`/`1`. `size` and `accessLevel` are decimal. `archive` is empty
when the door has no install record - which is all 370 of the existing ones.

```
DIR|<count>
<size>|<isDir>|<relative path>
```
Recursive, depth-first, paths relative to the door's directory with `/`
separators, directories listed before their contents, `size` 0 for a
directory. Cap: 2000 rows, and the header count is what was *emitted*, so a
client always knows how many rows to read.

```
FILE|<byteCount>|<truncated>
<the file's bytes>
```
`byteCount` is what follows the header, after truncation.

```
INFO|<count>
<commented>|<key>|<value>
```
From `parseInfoFile`. Cap: key 64, value 256.

Errors keep the router's existing vocabulary and add three:
`UNAUTHORIZED` (401), `FORBIDDEN` (403), `BAD REQUEST` (400), `NOT FOUND`
(404), `BINARY` (415), `TOO LARGE` (413).

## Steps

Each step ends with its automated checks green before the next starts.

### B1 - extract the door list

- New `web/backend/src/doors/door-list.ts`, `buildDoorList(bbsRoot: string)`,
  containing `BBSApi.ts:1336-1411` unchanged apart from the root argument.
- `BBSApi.getDoorList()` (`BBSApi.ts:1320`) becomes:

```ts
async getDoorList(): Promise<DoorListEntry[]> {
  const bbsRoot = (this.session as any)?.dataDir || process.env.BBS_DATA_DIR || process.cwd();
  return buildDoorList(bbsRoot);
}
```

- The return type moves to an exported `DoorListEntry` interface in
  `door-list.ts`; `BBSApi` imports it rather than restating the inline shape.

Automated: `npx jest tests/doors/door-list.test.ts` - a temp BBS root with two
door directories and one `.info`, asserting the entry for each, the
`resolvedPath` fallback when `door.path` names a file rather than a directory
(the `AquaScan.020` case at `BBSApi.ts:1348-1360`), and that
`getInstallByCommand` is called once per door, not twice (the 740-open-close
regression the comment at `:1381` records).

### B2 - GET /installed

- `door-admin.routes.ts`: `GET /installed` -> `buildDoorList(bbsRoot)` ->
  `DOORS|` rows.
- The renderer lives in a new `web/backend/src/server/door-admin-text.ts`:
  `renderRows(header: string, rows: string[][]): string` plus the field
  sanitiser, so all four routes share one implementation.

Automated: `tests/server/door-admin-routes.test.ts` gains cases for the happy
path, 401 without a token, 403 below secLevel 250, an empty board (`DOORS|0`
and nothing else), and a door whose name contains `|`, CR and LF - asserting
the row still has exactly nine fields.

### B3 - GET /installed/:cmd/files

- `door-path-guard.ts`: `resolveDoorDir(bbsRoot, command)` returns the door's
  absolute directory or a rejection, using the same three candidates
  `buildDoorList` resolves with, through `utils/amigafs` for case-insensitive
  lookup.
- The walk uses `amigafs.readdirSync` / `amigafs.lstatSync`. `lstat`, not
  `stat`: a symlink is listed as what it is and never followed, so the walk
  cannot leave the door's directory.
- Unknown command -> 404 `NOT FOUND`.

Automated: `tests/server/door-admin-files.test.ts` against a **real** temp BBS
root, per the spec's testing rule (spec:205) - nested directories, an empty
door, a door that does not exist, a symlink pointing outside the door
directory that must appear as a row and must not be descended into, and the
2000-row cap with the header reporting what was emitted.

### B4 - GET /installed/:cmd/file

- `resolveDoorFile(doorDir, p)` in `door-path-guard.ts`:
  1. reject an absolute `p`, and any `p` whose `path.relative(doorDir, resolved)`
     is empty, starts with `..`, or is absolute - the technique
     `safe-install-dir.ts:68-71` uses;
  2. then `amigafs.realpathSync` the result and re-run the same check, so a
     symlink inside the door directory cannot be used to escape it;
  3. reject a directory.
- Read at most 32769 bytes; NUL in the first 8192 -> 415 `BINARY`; over
  32768 -> emit 32768 with `truncated=1`.

Automated: `tests/server/door-admin-file.test.ts` - a normal text file; `p`
missing (400); `p=../../Access/ACS.INFO` (403); an absolute `p` (403); a
symlink inside the door pointing at `/etc/passwd` (403, and the test asserts
the file's content never appears in the body); a directory (400); a binary
(415); a 40 KB text file (truncated flag set, exactly 32768 bytes served).

### B5 - GET /installed/:cmd/info

- `Commands/BBSCmd/<CMD>.info` via `amigafs`, parsed by
  `parseInfoFile` (`utils/info-file.util.ts:220`), rendered as `INFO|`.
- Missing `.info` -> 404.

Automated: `tests/server/door-admin-info.test.ts` - a real `.info` from
`Commands/BBSCmd/` copied into the temp root, a commented tooltype round-trips
its flag, a missing file 404s, and a value containing `|` is sanitised.

### B6 - documentation

- Update the spec's API table (spec:122-131) to the nested paths and record
  why, so phases C and D are written against the shape that exists.
- `docs/DOOR-REPO-API.md` gains the four response formats, since that is where
  the C door's author looks.

## Automated verification

Run from `web/backend`:

```
npx jest --config dev-scripts/jest.config.ts --rootDir . tests/server tests/doors
npm run typecheck:tests
npx tsc --noEmit -p tsconfig.json
```

All three must be clean. `npm run typecheck:tests` is not optional: jest uses
swc and strips types, so a test file can be green under jest and fail the
typecheck (`handoff.md`).

## Manual verification

Not to be ticked by me.

- [ ] With the dev stack up (`./dev/scripts/start-servers.sh --bbs-only`),
      launch DOORREPO on a node so a token is minted, then from the host:
      `curl -H "X-Door-Token: $(cat <dataDir>/Doors/DoorRepo/DoorRepo.token)" \
       http://localhost:<port>/api/door-admin/installed` returns a `DOORS|`
      header and one row per registered command.
- [ ] The same call without the header returns `UNAUTHORIZED`.
- [ ] `.../installed/DOORMAN/files` lists DOORMAN's own directory.
- [ ] `.../installed/DOORMAN/file?p=package.json` returns the file.
- [ ] `.../installed/DOORMAN/file?p=../../Access/ACS.INFO` returns `FORBIDDEN`
      and no content.
- [ ] `.../installed/DOORMAN/info` lists the tooltypes DOORMAN's `.info` holds.

## Success criteria

- The four routes answer in the documented formats, token-gated and
  secLevel-gated like `POST /installed` already is.
- One door-list builder with three callers; no second copy of the precedence
  rule.
- No path outside a door's own directory is readable through `file`, proven by
  tests that fail against a containment check that only compares prefixes.
- The spec and `docs/DOOR-REPO-API.md` describe the routes that exist.

## Out of scope

Phase C's writes (`enabled`, `info` write, streaming `DELETE`), the C screens
(phase D), and any change to DOORMAN. The 370 existing doors still get no
backfill - they will render with an empty `archive` field, which is correct
and is the scope call recorded at spec:60.

## As built

Implemented 2026-08-31 in `4d2e92927` (B1) and `1d6693f15` (B2-B6). Every
step landed as planned. Three things worth recording:

- **`resolveDoorDirectory` was extracted too.** B3 needed to resolve a command
  to the same directory the list reports, and the candidate order (recorded
  location, `Doors/<command>`, lower-cased) is the answer to that question. It
  now lives in `door-list.ts` and both the list and the guard call it, rather
  than the guard carrying a second copy.
- **The `.info` comment syntax is not uniform**, and this was measured, not
  assumed. In a plain-text `.info` only `!KEY` marks a tooltype disabled;
  `(KEY)` comes back as a literal key named `(KEY)`. Both forms are honoured in
  the binary DiskObject files the board actually holds. `extractTooltypesFallback`
  in `utils/info-file.util.ts` is where the difference lives. Pinned by a test
  rather than fixed - the utility is shared with the admin app, whose
  round-tripping has its own verified tests, so changing it is its own piece of
  work. **Phase C's writer must know which form it is editing.**
- **`file` refusal tests assert absence of content, not just status.** A 403
  that still put the bytes in the body would pass a status-only assertion.

Automated verification at the end of the phase: 103 suites, 1102 tests,
`tsc --noEmit` and `typecheck:tests` both clean. The manual checklist below is
untouched and remains for the sysop.
