---
date: 2026-08-31
topic: DOORREPO phase C - the write APIs
tags: [doorrepo-c, door-admin, api, plan]
status: implemented
---

# Phase C - write APIs

Spec: `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:190`.
Phase B: `thoughts/shared/plans/2026-08-31-doorrepo-phase-b.md`.
Implemented 2026-08-31 in `5dc45dd87`.

Written short and after the fact rather than as a full plan document: the
research that mattered was one question, it was settled with the sysop before
the first edit, and the rest followed phase B's shape exactly.

## The one decision, and why the spec was wrong

The spec's table said `POST /api/door-admin/:cmd/enabled`. It should not have,
and the table is corrected in the same commit.

**Enable and disable already exist, in the C door.** `examples/doorrepo-c/flow.h`:

- disable is `ACCESS=255` with `DRACCESS=<prior>` remembering the normal level
  (`flow.h:549-562`);
- `flow_compute_prior_access` (`flow.h:618-644`) is the rule as a pure
  function, carrying an explicit note: *"controller ruling - do not redesign"*;
- `flow_rewrite_access_lines` edits the `.info` in place, touching only those
  two lines and copying every other byte;
- `DRACCESS` is inert to the BBS's own tooltype parser, confirmed in that
  header by reading the parser rather than assuming.

It has to stay there. A real AmiExpress board has no `/api/door-admin` and no
token file, so the door must be able to disable a door with no server at all.
A server-side `enabled` would therefore not replace the C implementation, it
would sit beside it - one ruling, two languages, drifting. That is what the
spec forbids at line 171.

DOORMAN's toggle is not a counter-example: `Doors/door-manager/app.ts:592`
reports `"(session only)"` and writes nothing. `amigaDoorManager.setDoorEnabled`
says the same and mentions a third convention (an `ENABLED` tooltype) that
nothing persists.

**What the door genuinely cannot do** from outside this process is make the BBS
notice. `getDoors()` is an in-memory registry, so a door disabled by a direct
write keeps being offered until a rescan - the same reason `deleteDoor` already
calls `refreshDoorCache()` and `initializeDoors()` when it finishes.

So: `POST /installed/:cmd/rescan`, and the ruling stays in C where it is.
Decision taken with the sysop before the first edit.

## As built

| route | reply |
|---|---|
| `POST /installed/:cmd/rescan` | `RESCAN|<found>` |
| `PUT /installed/:cmd/info` | `INFOWRITE|<count>` |
| `DELETE /installed/:cmd` | `STEP|<kind>|<text>` … `DONE|<ok>|<message>` |

- **rescan** reloads both registries and reports whether the command is present
  afterwards, which is what the door needs to tell the sysop the change took.
- **info write** replaces the tooltype array rather than merging: a partial
  update cannot express "remove this one", and the caller always holds the full
  list it just read from `GET .../info`. It reads-swaps-writes through
  `parseInfoFile`/`writeInfoFile`, so a binary DiskObject keeps its icon - the
  test copies a real `WALL.info` in and asserts the first 78 bytes are
  identical afterwards. Rejections (a key with `=`, a value with a line break,
  an empty key, more than 64 entries) assert the file is **unchanged**, not
  just the status.
- **delete** streams. A door with a few hundred files takes long enough that a
  silent pause followed by a finished log reads as a hang, which is why
  DOORMAN's in-process delete already reports step by step; the route reuses
  that same `onStep`. Consequence worth knowing: the first `STEP` flushes the
  headers, so **success is in the `DONE` line, not the status**. The 404 for a
  command with neither a `.info` nor a directory is decided before the stream
  opens, while a status can still be sent.

`deleteDoorAndRefresh` moved out of `BBSApi` into
`web/backend/src/doors/door-delete.ts` - phase B's move, repeated. Authorization
deliberately did **not** move with it: the session checks its own secLevel, the
route checks the token's, and neither may assume the other did it.

The removal itself is unchanged `amigaDoorManager` code. Its guard confines
every path it touches - the tracked database rows included - to `Doors/`,
`Commands/` or a recorded library under `Libs:`, never to one of those roots.
That guard is the one written after 2026-08-30, and is the reason this route
could be exposed at all.

## Verification

106 suites, 1133 tests, `tsc --noEmit` and `typecheck:tests` clean.

`typecheck:tests` earned its keep again: jest was green while two mock spreads
in the rescan test failed the test typecheck.

## Still open

- **Phase D** - the DOORREPO screens, against B and C.
- **Phase E** - retire DOORMAN, once D has run on the board and the sysop has
  used it.
- The manual checklists in both plans are untouched and need a real launch
  token from a running DOORREPO.
- `setDoorEnabled`'s `ENABLED` tooltype is a third convention that nothing
  persists. It is not wired to anything; phase E is the moment to delete it or
  make it real, not before.
