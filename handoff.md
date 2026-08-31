# Handoff

## READ THIS FIRST in a fresh session

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`.
Both LIVE. Push to `main` auto-deploys; after pushing, CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` - green CI has lied before).
Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22**.

**A deploy disconnects /chat, but everyone gets a 60-second countdown first**
and /chat reconnects itself. Documentation changes do not deploy
(`paths-ignore`).

**A peer Claude Code session may work in this SAME checkout.** `git fetch` and
check both directions before pushing.

**Dev environment**: `./dev/scripts/start-servers.sh --bbs-only` /
`kill-servers.sh`. Zombie-verify after every stop:
`ps aux | grep -E "(start-servers|kill-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep`
(expect empty; the watcher used to orphan a backend per restart, fixed in
`b70a415d9`). A stale process serving old code looks exactly like a failed fix,
so if a change "does not apply", clear the tsx cache:
`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

## Current state (2026-08-31)

**Full session handoff: `thoughts/shared/handoffs/2026-08-31_session-handoff.md`.**
Read that first in a fresh session; it carries the live deploy step below, the
gotchas, and the ordered next steps.

**The installed-door link is merged and live** (`178d8a74f`). Every install
path records the archive a door came from and the files it wrote, so a delete
removes exactly that; neither door lets a sysop type a command name.

**The C startup failure is solved and the rebuilt door is committed**
(`c0f510dd9`, `e3c1c6e16`, local - NOT pushed). There was never a C
regression. The door's static caches had grown its BSS to 436 KB, which put
its segments at 0x085d04 - past the 500 KB the emulator gives a door and on
top of exec.library's LVO jump table at 0x7fcf4. HUNK_BSS is zeroed as it
loads, so the door blanked 126 exec vectors before executing anything, then
exited RETURN_FAIL. The emulator logged `VERIFICATION: 230 OK, 126 FAILED!`
and carried on.

Two fixes, two levels:

- `web/backend/src/amiga-emulation/memory-map.ts` owns the fixed addresses
  (ExecBase 0x80000, stubs, AllocMem heap 0x100000, ENV 0x120000, ReadArgs
  0x140000) and `assertDoorSegmentsFit` refuses the load BEFORE
  `HunkLoader.load` writes a byte, naming the segment and what it would
  destroy. It reaches the sysop over `door:error` and the probe report.
- `examples/doorrepo-c/doorrepo.c`: DIZ cache 32->8, FILES 4->2, DOC 2->1.
  BSS is 327 KB, segments end 0x06b47c, **80 KB of headroom left**. Code grew
  40 KB in eleven days, so phases B-E will eat that; the guard now says so
  loudly instead of dying silently.

**A compiling binary that contains the right strings is not a working binary.**
Run it under the probe, and give it 20 s - a shorter budget kills the harness
before it boots and reports an empty run that looks like a dead door:

    npx tsx dev/scripts/door-probe/probe.ts Doors/DoorRepo/doorrepo.amiga \
      --command DOORREPO --timeout 20000

**The door probe was broken for EVERY door** until `baefa28ff` (harness spawned
with `cwd=REPO_ROOT`, no tsconfig, decorators off). A decorator error in a probe
means that regressed.

**Verify deploys by reading the container, and grep the right tree**: it runs
`tsx src/index.ts` from `/app/web/backend`, NOT `/app/dist`.

The dirty tree is BBS runtime state plus another session's uncommitted work
(`web/config-app`, `Doors/super-qix` - untracked, one `git clean -fd` from
gone).

## The DOORMAN incident - closed

An unchecked recursive delete of `PROJECT_ROOT/<install_dir>` resolved to
`Doors/` and removed every door. Guarded in
`Doors/door-manager/safe-install-dir.ts`; write-up in
`thoughts/shared/todos/2026-08-30_queue.md`.

## DOORREPO is not a DOORMAN replacement yet

Phase A shipped the groundwork only. DOORREPO still cannot enable/disable a
door, upload an archive, edit `.info` tooltypes, browse an installed door's
files, delete with the live log, or show a metadata/DIZ panel. Those are
phases B-E of `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`
and none are built.

The C blocker is gone: a binary built from current source runs under the probe
again, so phase D is buildable. Phases B and C still come first - the screens
need the BBS-side API.

## The doors and the door repo

The catalog lives in a separate project: **`/Users/spot/Code/amiexpress-doorserver`**,
live at **doors.uprough.net**. This BBS proxies `/api/door-repo/*` to it
(`DOOR_SERVER_URL`, live `http://doorserver:3010`) and keeps answering at its
own hostname, because the DoorRepo C door ships `RepoHost=bbs.uprough.net`
baked into config on other people's machines.

`DOOR_SERVER_URL` is NOT set in the dev environment, so the repo-metadata
overlay does nothing locally. Start with it to test that path:
`DOOR_SERVER_URL=https://doors.uprough.net ./dev/scripts/start-servers.sh --bbs-only`

**The 370 doors already installed get no metadata improvement** - deliberate
scope call. They have no install record, so the name column keeps echoing the
command. Real names need the archive-matching backfill in
`thoughts/shared/todos/2026-08-30_queue-round-2.md`.

The board's own management API is `/api/door-admin/*` (NOT `/api/doors`, which
belongs to the existing door-asset router). It is token-gated: DOORREPO only,
sysop only, token written 0600 per launch.

## Next

Nothing queued by the user. Open work, in the order worth doing.

### Admin, what is left

1. **Configuration Files is four tabs, not the plan's single tree** with scope
   filters over every `.info` file. Tabs preserved each editor exactly; the
   tree is still the better end state.
2. **Six pages still render their own tables**: Protocols, Computers, File
   Checkers, Conferences, Drives and the Security flag editor. They are on the
   design tokens, so they look right, but they sort by hand and do not get the
   sticky header, keyboard-reachable row actions or the empty and loading
   states. `components/ui/DataTable` is what they move to; Users, Doors,
   Languages and Screen Types are already there.
3. **Node Configuration deliberately stays on the old `DataGrid`** - its rows
   turn into input fields in place, and a row being edited must not move
   because a sort changed. Both files say so; leave it unless the edit model
   changes.
4. **`VITE_BYPASS_AUTH` in `App.tsx`** bypasses the frontend auth guard
   entirely. It should go now that a sysop account exists. It has no influence
   over the socket handshake, which reads `secLevel` server-side.
5. **The realtime layer has never met a busy board** - coalescing, Reconnecting
   and the pages-waiting badge were exercised by tests and by hand only.
6. **`bbsConfig.info` has a non-standard tooltype array**, so the writer will
   not rewrite it. System configuration saves land in `bbsConfig.info.txt`,
   which this BBS reads, and the admin now says so - but the icon drifts until
   it is re-created in Workbench or IconEdit. Needs an Amiga, not a commit.

### Elsewhere

7. **Audio stutter** - one measured cause fixed, diagnostics live
   (`[Audio][stutter]` says whether the sender's thread or the network is
   late), never confirmed by the user.

## The admin redesign is done

Phases 0 to 5 of `thoughts/shared/plans/2026-08-27-admin-redesign.md`, marked
implemented with an "As built" section recording two departures: TanStack
Table **v9** (not the plan's v8 - different API, `useTable` plus explicit
`tableFeatures`), and Configuration Files as four tabs rather than one scoped
tree.

Design tokens, grouped navigation, an Overview dashboard, merged destinations
behind tabs with permanent legacy redirects, a realtime layer, and the admin no
longer occupying a BBS node. Commit-by-commit account in
`thoughts/shared/handoffs/2026-08-30_admin-redesign-implemented.md`. The user
watched it being built and reported nothing broken - "not obviously wrong", not
verified.

## The admin app is disk-first

The BBS reads `.info` files; SQLite is a downstream mirror. Audits:
`thoughts/shared/research/2026-08-27_admin-ui-audit.md` and
`2026-08-27_admin-page-by-page.md`.

**Per-field round-tripping is verified** for system configuration,
conferences, drives, doors, screen types, computers, protocols, languages,
file checkers and nodes - each with tests that fail when the fix is reverted.
It found seven faults, all of two shapes: a value written under one key and
read back from another, or a writer rebuilding a file from the database (or
from nothing) and dropping what it did not own.

## Waiting on the user

- **DOORMAN could not see the wall door.** Probably the incident: the whole
  `Doors/` tree was missing. Worth re-checking now, saying which view it was.
- **`wall.info` NAME reads "WALL"** on live, overwritten before the rename fix
  landed. The original is in `wall.info.backup` beside it.

## Gotchas

- **Read the mutation path; do not count.** Three false-positive rounds.
- **A recursive delete needs a resolved-path guard, not a trusted string.**
- **A door archive already names its own command** in
  `Commands/BBSCmd/<COMMAND>.info`, with the tooltypes it was built with.
- **Python rewrites line endings.** Much of this repo is CRLF; open with
  `newline=''` on both ends or a four-line change becomes a whole-file diff.
- **`screen.focused` is a boolean about the Screen itself.** The focused
  element is `screen.getFocused()`.
- **SDK tests import the built `sdk/dist`.** A source edit is invisible until
  `npm run build:cjs`, and `packages/terminal` compiles the SDK under a
  stricter tsconfig that gates the Docker build.
- **A TypeScript door's `dist/` is what runs**, and the pre-commit hook
  rebuilds it. Two agents touching the same door will pull each other's
  half-finished work into a commit; use separate worktrees.
- **The live log is not the current log** - every deploy replaces the
  container. `head` truncates evidence; redirect to a file instead.
- **A merged admin screen must keep a redirect.** `src/routes/legacy-routes.ts`
  and its test are what stop a merge from silently removing the only route to
  a piece of configuration.
