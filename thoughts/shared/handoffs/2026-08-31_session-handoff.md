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
2. **Done, deploy in flight**: the DoorRepo Amiga binary rebuilt so this
   session's C work actually runs on the board.
3. **Specced, not built**: DOORREPO reaching 1:1 parity with DOORMAN, phases
   B-E.
4. **Raised, not built**: SDK dialog buttons; catalog names for the 370
   existing doors; BROADCAST's missing door.

## THE FIRST THING TO DO IN A FRESH SESSION

**Finish the binary deploy.** At the time of writing, live runs `817bad77f`
and `0a98cb414` (the binary commit) is still deploying.

    ssh -i ~/.ssh/hetzner_deploy -p 22 root@89.167.21.154 \
      'docker exec amiexpress-bbs cat /app/.git-sha'

When that reads `0a98cb414`, the IMAGE has the new binary but **the live volume
still will not**. Deploys do not sync `Doors/`. Verified at handoff time:
`/app/data/bbs/Doors/DoorRepo/doorrepo.amiga` is still the 23 Aug build, 79652
bytes, and `strings ... | grep -c door-admin` returns 0.

Copy it in and verify by reading the binary, not by trusting the copy:

    ssh -i ~/.ssh/hetzner_deploy -p 22 root@89.167.21.154 \
      'docker exec amiexpress-bbs sh -lc "cp /app/Doors/DoorRepo/doorrepo.amiga /app/data/bbs/Doors/DoorRepo/doorrepo.amiga && strings /app/data/bbs/Doors/DoorRepo/doorrepo.amiga | grep -c door-admin"'

Expect `1`, and the size to become 107008. Until then the board runs a DoorRepo
door that predates every C change in this session.

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
- **Deploys never sync the live `Doors/` volume.** An image can be perfectly
  up to date while the board runs an old door binary.
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

## Next steps, in the order worth doing

1. **Finish the binary deploy** (top of this file), then run DOORREPO on the
   board and install something. Confirm a row appears in both tables.
2. **Verify the recorder end to end on live**: install a door through DOORMAN,
   check `door_installs` and `door_installed_files`, delete it, confirm the
   panel logs each path and the door leaves the list.
3. **SDK dialog buttons** - frame only the active button, white text on both.
   Item 1 in `2026-08-30_queue-round-2.md`. It lives in
   `sdk/engines/ui/blessed`, so it changes every door's dialogs at once.
4. **Decide on the 370 existing doors.** They get no catalog names, by the
   scope decision. Real names need archive matching - fingerprint installed
   doors against the catalog's per-archive file lists, which the door server
   already serves. Until then the doors menu shows `5DPAGER  5DPAGER`.
5. **BROADCAST** points at `DOORS:ANNOUNCE/ANNOUNCE.REXX` and
   `Doors/ANNOUNCE/` has never existed. Decide whether the door is in the repo
   or the registration should go, and consider warning at startup when a
   registration's LOCATION does not exist.
6. **DOORREPO parity phases B-E** from the spec: read APIs, write APIs, the
   screens, then retiring DOORMAN. Each needs its own plan.

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
