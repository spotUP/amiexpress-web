---
date: 2026-08-31
topic: The installed-door link - every install records what it is and what it wrote
tags: [doors, doorman, doorrepo-c, door-install, api, security, sdd]
status: implemented
---

# The installed-door link

Merged to `main` as `178d8a74f` and verified live by reading the running
container, not the workflow.

## What was wrong

Two failures on the live board, days apart, with one cause:

- **DD**: DOORMAN said "DD deleted". `Doors/DD` was gone;
  `Commands/BBSCmd/DD.info` was still there at 1114 bytes. The `.info` IS the
  registration every door list is built from, so the door lost its files and
  kept its name.
- **BROADCAST**: `Commands/BBSCmd/BROADCAST.info` points at
  `DOORS:ANNOUNCE/ANNOUNCE.REXX`. `Doors/ANNOUNCE/` has never existed. The
  command is offered on the menu and fails only when a user runs it.

Underneath: **the board had no record of what it installed.**
`door_installed_files` existed and `db.trackDoorFiles` wrote it, but only from
one installer. Measured on live before the work: 370 registered commands, 106
door directories, **0 rows** in `door_installed_files`, 37 in `door_installs`.

## What shipped

Spec: `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`
Plan: `docs/superpowers/plans/2026-08-30-installed-door-link.md`
21 plan commits + 12 fix-wave commits, `c2d99e551` .. `7641a27ec`.

- **One recorder** (`web/backend/src/doors/door-install-record.ts`) writes both
  halves: the link (`door_installs`: command -> archive) and the files
  (`door_installed_files`, walked from disk, stored relative to the BBS root).
  It is total - no failure inside it escapes to its caller, because a
  bookkeeping error must never fail a good install.
- **Every install path calls it**: DOORMAN owner mode, DOORMAN consumer mode,
  `amigaDoorManager.installDoor`, `amigaDoorManager.installTypeScriptDoor`, and
  `DoorInstaller.install` (DOORMAN's `[U]pload`). The spec claimed three paths;
  there were five.
- **`POST /api/door-admin/installed`**, so the C door can report its own
  installs. Guarded by a per-launch token minted only for DOORREPO and only for
  `secLevel >= 250`, written 0600 to `<dataDir>/Doors/DoorRepo/DoorRepo.token`,
  revoked when the door exits by any path including a throw.
- **Neither door lets a sysop type a command any more.** The command comes from
  the archive's own `Commands/BBSCmd/<CMD>.info`; when an archive names none,
  both doors show a confirm-or-cancel naming the filename-derived fallback.
- **The catalog's name wins over a `.info` NAME that is not a name** (art,
  mojibake, high-bit runs, an echo of the command) - for LINKED doors only.
- **Deletes** remove exactly the recorded set, report each step as it happens,
  and verify against the disk instead of reporting success blindly.

## Not live, and why

**The DoorRepo C door on the board is the 23 Aug binary.** `make amiga` fails
here: `netio.c` -> `netdb.h` wants `sys/errno.h`, and
`examples/doorrepo-c/amiga-netinclude-vendor/` has no `sys/` directory. This
branch never touched `netio.c` - the build was already broken, which is why the
binary is old. Until it builds, these are merged source only: the archive-named
command, the whole-path listing parse, install reporting, and the `BbsHost`
security fix.

**`BbsHost` matters for other people's boards.** `report_install_to_bbs` used to
POST via `RepoHost` (baked to `bbs.uprough.net`), so on any board that is not
this one the install went unrecorded AND that board's launch token was sent in
cleartext to a third party. Fixed with a separate key defaulting to
`localhost:3001`; an existing `DoorRepo.cfg` without the key keeps working.

## Two blind spots this work exposed

Both are the same shape - the check everyone trusts did not cover the thing that
broke:

1. **`web/backend/tsconfig.json` excludes `tests/**`, and `@swc/jest` does not
   type-check.** A signature change left five call sites in a test file passing
   the old argument list; `tsc --noEmit` stayed clean. Fixed:
   `tsconfig.tests.json` now reports 0 errors (was 247 - 225 of them one
   `rootDir` setting) and `npm run typecheck:tests` runs in
   `.github/workflows/backend-tests.yml`.
2. **`make test` never compiled `doorrepo.c`.** The door did not compile for
   several hours (`537c802fb`, an unterminated block comment) and every test run
   stayed green. Fixed: `make syntax` checks all 15 native C files with the
   strict flags and runs first in `make test`. Proven by breaking the file
   deliberately: exit 2, three errors.

## Also fixed on the way

- **`.LZH` archives were uninstallable** - 81 of them in the catalog. `.lha` and
  `.lzh` are the same format but routed to different extractors; the `.lzh` one
  threw a Buffer offset error and shelled out to a system `lha` binary this
  project had already dropped. Both extensions now use the pure-JS
  `LhaExtractor`; the broken parallel implementation (342 lines) is deleted.
- DOORMAN's uninstall no longer orphans `door_installed_files` rows, which could
  later name a different door's directory.
- `getDoorList` fetched each door's install row twice - 740 sqlite open/close
  cycles per menu render at 370 doors.
- `Doors/DoorRepo/DoorRepo.token` is gitignored; a live bearer token was
  committable.

## What is still open

- **The 370 existing doors get nothing.** Deliberate scope call. They have no
  install record, so they take the unlinked path: descriptions fill from the
  repo when `DOOR_SERVER_URL` is set, but the name column keeps echoing the
  command (`5DPAGER  5DPAGER`). Giving them real names needs the archive-matching
  backfill that was deferred - see `thoughts/shared/todos/2026-08-30_queue-round-2.md`.
- `DOOR_SERVER_URL` is not set in the dev environment, so the metadata overlay
  does nothing locally. Live has it.
- The SDK dialog buttons (frame only the selected one, white text) - queued,
  untouched.
- BROADCAST still points at a door that was never installed.

## Method notes worth keeping

- **Eleven of the defects found were in the plan, not in the execution.** Every
  fix round but one traced back to the written plan - a two-character regex
  class that matched nothing, a deleted guard that broke the plan's own scope
  constraint, an incomplete list of call sites, a mutable claims object, a mint
  call outside its try. The per-task review loop is what caught them.
- **Pre-flight against the real source beats pre-flight against the plan.** The
  C tasks alone had four defects that would have failed the build or shipped an
  intermittent bug: a missing `ctype.h`, C99 declarations under `-pedantic`, a
  test that would never have run because the harness invokes through
  `RUN_TEST(name)`, and a listing that was only loaded if the sysop had pressed
  `[A]` first.
- **Verify commits, not reports.** One subagent committed 59 unrelated files
  with a blanket add; another found two foreign files already staged before it
  began. Checking `git show --stat` before packaging each review is what caught
  both.
