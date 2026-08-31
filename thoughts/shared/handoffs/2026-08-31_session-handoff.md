---
date: 2026-08-31
topic: Full session handoff - installed-door link, DOORREPO parity groundwork, live deploy state
tags: [handoff, doors, doorman, doorrepo-c, door-install, api, security, deploy]
status: final
---

# Session handoff, 2026-08-30 into 2026-08-31

Read this with `handoff.md` at the repo root (short current state) and
`thoughts/shared/handoffs/2026-08-31_installed-door-link.md` (the feature's own
account). This file is the whole session, including what is half-done.

## Tasks

1. **Done and live**: the installed-door link. Every install path records what
   a door is (its catalog archive) and what it wrote (its files), so a delete
   removes exactly that. Neither door lets a sysop type a command name.
2. **Done and verified live**: the DoorRepo Amiga binary rebuilt and shipped,
   so this session's C work actually runs on the board.
3. **Specced, not built**: DOORREPO reaching 1:1 parity with DOORMAN, phases
   B-E.
4. **Raised, not built**: SDK dialog buttons; catalog names for the 370
   existing doors; BROADCAST's missing door.

## RESOLVED 2026-08-31 (later session): it was never a C regression

Everything below about "bisect the startup regression" is superseded. There was
no bad commit. The door's static caches had grown its BSS to 436 KB, which put
its segments at 0x085d04 - past the 500 KB of CODE+DATA+BSS the emulator gives
a door, and on top of exec.library's LVO jump table at 0x7fcf4. HUNK_BSS is
zeroed at load, so the door blanked 126 exec vectors before executing anything
and exited RETURN_FAIL. Both builds ran the identical vbcc startup to PC 0x214c;
the old one went on to AllocVec + StackSwap into main, the new one read the
blanked memory and quit.

The evidence that settles it, same emulator, back to back:

    20 Aug build   BSS 0x599f4  segments end 0x06e8fc  VERIFICATION: all 356 OK
    current build  BSS 0x6a7fc  segments end 0x085d04  VERIFICATION: 126 FAILED

and current source with three cache constants trimmed runs the full browser,
`L=Installed` footer included.

Fixed at both levels:

- `c0f510dd9` - `web/backend/src/amiga-emulation/memory-map.ts` owns the fixed
  addresses; `assertDoorSegmentsFit` refuses the load before
  `HunkLoader.load` writes a byte and names the segment and the damage. Test:
  `web/backend/tests/amiga-emulation/door-segment-limit.test.ts`.
- `e3c1c6e16` - `examples/doorrepo-c/doorrepo.c` DIZ cache 32->8, FILES 4->2,
  DOC 2->1. BSS 327 KB, segments end 0x06b47c, 80 KB of headroom. Rebuilt
  binary shipped to `Doors/DoorRepo/doorrepo.amiga`.

Both commits are LOCAL on `feat/installed-door-link`, not pushed.

Two things learned that cost time here:

- **The emulator detects this corruption and continues.** `VERIFICATION: 230
  OK, 126 FAILED!` and `CRITICAL: 126 library trap(s) missing ILLEGAL
  instruction!` were in the log the whole time and nothing acted on them.
- **Give the door probe 20 s.** `--timeout 6000` or `12000` kills the harness
  before it finishes booting and reports zero LVOs, zero output and no errors -
  which reads exactly like a door that died instantly.

## Deploy state - the TypeScript is live, the C door is NOT

Live is `4a261f5fb`. The TypeScript half of this work is running on the board
and was verified by reading `/app/web/backend/src` in the container.

**The C half is not.** I rebuilt `doorrepo.amiga` from current source, shipped
it (`adb2356b8`), and it does not run - 42 bytes of output, no XIM ops, exits
FAIL before the AEDoor handshake. The previous binary produces 3477 bytes and
completes the handshake. Rolled back in `baefa28ff` / `4a261f5fb`; the board is
on the 20 August binary (79652 bytes).

So these remain merged source that has never run on a board: the archive-named
command, the whole-path listing parse, install reporting, and the BbsHost
security fix.

**Do not assume the break is recent work.** The working binary was built on
20 August; the source has eleven days of changes from several sessions. The
rebuild is simply the first build of all of it. Bisect with the probe:

    cd examples/doorrepo-c && make amiga        # builds ./doorrepo.amiga
    npx tsx dev/scripts/door-probe/probe.ts examples/doorrepo-c/doorrepo.amiga \
      --command DOORREPO --timeout 20000

A working door shows XIM ops and thousands of bytes of stdout; the broken one
shows 42 bytes and none. Under the harness the last thing it does is open
dos.library and one 31-byte AllocMem, then exit.

**The door probe itself was broken for every door** until `baefa28ff` - it
spawned the harness with `cwd=REPO_ROOT`, which has no tsconfig.json, so tsx
compiled the backend with decorators disabled and every probe died on
chat.handler.ts's parameter decorators. Control check: AquaScan should probe
exit 0 with ~1124 bytes.

## Critical references

- Spec: `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`
- Plan (phase A, executed): `docs/superpowers/plans/2026-08-30-installed-door-link.md`
- Feature account: `thoughts/shared/handoffs/2026-08-31_installed-door-link.md`
- Open queue: `thoughts/shared/todos/2026-08-30_queue-round-2.md`
- The recorder: `web/backend/src/doors/door-install-record.ts`
- The token: `web/backend/src/doors/door-launch-token.ts`
- The route: `web/backend/src/server/door-admin.routes.ts` (mounted `/api/door-admin`)
- Name precedence: `web/backend/src/doors/door-name-plausibility.ts` +
  `door-repo-metadata.ts`
- C door: `examples/doorrepo-c/{doorrepo.c,flow.c,config.c,json_lite.c}`

## Recent changes

Merged to main as `178d8a74f` (21 plan commits + 12 fix-wave commits), then
`0a98cb414` for the binary.

- One recorder writes `door_installs` AND `door_installed_files`, walked from
  disk, stored relative to the BBS root, and total: no failure inside it
  reaches the caller, because a bookkeeping error must not fail a good install.
- Five install paths call it - DOORMAN owner, DOORMAN consumer,
  `amigaDoorManager.installDoor`, `amigaDoorManager.installTypeScriptDoor`,
  and `DoorInstaller.install` (DOORMAN's `[U]pload`). The spec said three.
- `POST /api/door-admin/installed`, token-gated: DOORREPO only, `secLevel >=
  250`, token 0600 at `<dataDir>/Doors/DoorRepo/DoorRepo.token`, minted per
  launch, revoked on every exit path including a throw, fails closed.
- Command names come from the archive's own `Commands/BBSCmd/<CMD>.info` in
  both doors; no free-text field anywhere.
- `.LZH` archives install again (81 in the catalog). `.lha` and `.lzh` now
  share the pure-JS `LhaExtractor`; the broken parallel implementation is gone.
- `make syntax` in `examples/doorrepo-c` and `npm run typecheck:tests` in
  `web/backend` close two blind spots (below).

## Learnings - the ones that will save a session

- **The live container runs `tsx src/index.ts` from `/app/web/backend`, NOT
  `/app/dist`.** Greping `/app/dist` for your change returns nothing and looks
  exactly like a failed deploy. Grep `/app/web/backend/src`.
- **Do not assume either way about the live `Doors/` volume.** An older note
  said deploys never sync it; this deploy DID sync it. After any deploy that
  changes a door binary, read the volume copy (`ls -la` for the size, `strings`
  for a symbol you added) instead of trusting either rule.
- **The NDK under `Documentation/7-Reference Sources/NDK3.2R4` is UNTRACKED.**
  A fresh git worktree therefore cannot build the Amiga target at all - the
  netinclude symlink dangles and you get `sys/errno.h not found`. That is not a
  broken build; build in a real checkout. I got this wrong once in this session
  and reported a working build as broken.
- **`web/backend/tsconfig.json` excludes `tests/**` and `@swc/jest` does not
  type-check.** Test files were unchecked until this session; a signature change
  left five call sites passing the old argument list with a clean `tsc`. Gate is
  now `npm run typecheck:tests` (also in `.github/workflows/backend-tests.yml`).
- **`make test` never compiled `doorrepo.c`.** The door failed to compile for
  hours while every test run stayed green. `make syntax` runs first now.
- **This checkout is shared with another Claude session.** It commits AND
  stages into the same index. During this session: a subagent committed 59
  unrelated files with a blanket add; another found two foreign files already
  staged before it started; an aborted merge left an autostash holding a third
  party's uncommitted work. Always `git add` by full path, always check
  `git diff --cached --name-only` before committing, and check `git stash list`
  after any failed merge.
- **Do merges in a scratch worktree** when the shared tree is dirty, then push
  from there. Symlink `node_modules` (root, `web/backend`, `Doors/door-manager`,
  `sdk`) into the worktree or the pre-commit door build fails.

## Artifacts

- 33 commits on `feat/installed-door-link`, merged to main.
- Branch still exists and holds duplicates of two peer commits that were pushed
  to main separately - it can be deleted once nothing else is wanted from it.
- The SDD ledger for this plan was deleted with its workspace after the final
  review; a copy is in this session's scratchpad only, so treat git history and
  these documents as the record.

## What the C door actually targets - read this before judging any test

DoorRepo is a C89 door for REAL AmiExpress boards on real Amigas. That is the
whole point of it: other sysops run it against this repo's catalog. This
project's 68K emulator is a convenient proxy, NOT the arbiter of correctness.

Two consequences:

- **The startup regression matters MORE, not less.** A door that will not start
  under the emulator may well fail on real hardware too, and a sysop on an
  Amiga has no probe, no logs worth the name, and no way to tell us why. Do not
  ship a binary that fails here on the theory that a real board differs.
- **Install reporting is amiexpress-web-only, by design.** A real AmiExpress
  board has no `/api/door-admin` and no token file, so `config_read_token`
  finds nothing and `report_install_to_bbs` never runs. That silence is
  correct; the door must keep working exactly as before on such a board. Any
  change to that path has to preserve it - the door must never require the BBS
  API to function.

Validation on a real board (or WinUAE/vAmiga with a real AmiExpress) is the
only genuine proof. The probe is a fast first filter, not the last word.

## The parity gap - DOORREPO is NOT a DOORMAN replacement yet

Phase A (this session) built the groundwork only: the recorder, the link, the
report route, and the naming rule. Parity is phases B-E of the spec and none of
it exists. What DOORREPO still cannot do that DOORMAN can:

- enable / disable a door
- upload an archive (`[U]`)
- edit a door's `.info` tooltypes
- browse an installed door's files, with the AmigaGuide viewer
- delete with the live step-by-step log
- show a metadata / FILE_ID.DIZ panel for an installed door

Every one of those needs something a C89 door cannot do locally - enumerate a
directory, read the sqlite, walk an installed door's tree - which is why the
spec puts a BBS-side API (phases B and C) in front of the screens (phase D),
and only retires DOORMAN in phase E.

## Next steps, in the order worth doing

1. **Bisect the DOORREPO startup regression. Everything C-side is stacked
   behind this.** A binary built from current source exits FAIL before the
   AEDoor handshake; the board runs the 20 August build. Writing phase-D
   screens against a source tree whose builds do not start would be a lot of C
   nobody can execute. Method:

       cd examples/doorrepo-c && make amiga
       npx tsx dev/scripts/door-probe/probe.ts examples/doorrepo-c/doorrepo.amiga \
         --command DOORREPO --timeout 20000

   Working = XIM ops observed and thousands of bytes of stdout. Broken = 42
   bytes, no XIM ops. Walk back through the commits touching
   `examples/doorrepo-c/` since 20 August - several sessions contributed, so do
   not assume it was the install-reporting work.

2. **Verify the recorder end to end on live.** The TypeScript half IS live.
   Install a door through DOORMAN, check `door_installs` and
   `door_installed_files`, delete it, confirm the panel logs each path as it
   goes and the door leaves the list immediately. Only doors installed from now
   on have records; the 370 already there do not, so install something first.

3. **Phase B (read APIs) and C (write APIs)** from the spec: installed list,
   files, file, info, then enabled / info-write / delete-with-streaming-log.
   Server-side and testable, and DOORMAN can use them too in the meantime. Each
   needs its own plan.

4. **Phase D - the DOORREPO screens** against a door that demonstrably runs,
   and phase E - retire DOORMAN once you have actually used the replacement on
   the board.

5. **SDK dialog buttons** - frame only the active button, white text on both.
   Item 1 in `2026-08-30_queue-round-2.md`. Lives in `sdk/engines/ui/blessed`,
   so it changes every door's dialogs at once.

6. **Decide on the 370 existing doors.** They get no catalog names, by the
   scope decision you made. Real names need archive matching - fingerprint
   installed doors against the catalog's per-archive file lists, which the door
   server already serves. Until then the doors menu shows `5DPAGER  5DPAGER`.

7. **BROADCAST** points at `DOORS:ANNOUNCE/ANNOUNCE.REXX` and `Doors/ANNOUNCE/`
   has never existed. Decide whether the door is in the repo or the
   registration should go, and consider warning at startup when a
   registration's LOCATION does not resolve.

## Other notes

- `DOOR_SERVER_URL` is not set in the dev environment, so the repo-metadata
  overlay does nothing locally. Start with
  `DOOR_SERVER_URL=https://doors.uprough.net ./dev/scripts/start-servers.sh --bbs-only`
  to exercise it.
- Untracked work belonging to another session sits in `Doors/super-qix/`
  (backgrounds, `game/background.ts`, five test files) and `web/config-app/`.
  It is one `git clean -fd` away from gone. Not mine to commit, but worth
  telling whoever owns it.
- The door watcher used to orphan a backend per restart; fixed this session
  (`dev/scripts/lib/managed-process.ts`). If backends pile up again, that is
  where to look.
- Two suites fail for environmental reasons and are not regressions:
  `tests/conftop-y2k-binary-patch.test.ts` needs live-only board data, and
  `tests/log-retention.test.ts` passes in isolation but fails in the full run.
