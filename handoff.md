# Handoff

## READ THIS FIRST in a fresh session

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`.
Both LIVE. Push to `main` auto-deploys; after pushing, CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` - green CI has lied before).
Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22**.

**A deploy still disconnects /chat - but everyone now gets a 60-second
countdown first**, and /chat reconnects itself. Proven on its first real run
(signal 21:39:21, container recreated 21:40:22). Documentation changes do not
deploy at all (`paths-ignore`).

**A peer Claude Code session may work in this SAME checkout.** `git fetch` and
check both directions before pushing.

**Dev environment**: `./dev/scripts/start-servers.sh --bbs-only` /
`kill-servers.sh`. Zombie-verify after every stop:
`ps aux | grep -E "(start-servers|kill-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep`
(expect empty). **The watcher used to orphan one backend per restart** - 104
were found running at once; fixed in `b70a415d9` (`dev/scripts/lib/
managed-process.ts`). A stale process serving old code still looks exactly
like a failed fix, so if a change "does not apply", clear the tsx cache:
`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

## Current state (2026-08-31)

**Full session handoff: `thoughts/shared/handoffs/2026-08-31_session-handoff.md`.**
Read that first in a fresh session; it carries the live deploy step below, the
gotchas, and the ordered next steps.

**The installed-door link is merged and live** (`178d8a74f`). Every install
path records the archive a door came from and the files it wrote, so a delete
removes exactly that; neither door lets a sysop type a command name.

**The C work is NOT running on the board.** I rebuilt the Amiga binary, shipped
it, and it does not run: it exits FAIL before the AEDoor handshake. Rolled back
in `4a261f5fb`; the board is on the 20 August binary (79652 bytes) that works.

Measured with the door probe, same emulator, back to back:

    previous binary (79652B): 3477 bytes out, XIM ops observed, runs
    my rebuild     (107008B): 42 bytes out, NO XIM ops, exits FAIL

It is NOT established that this is any one session's C change. That binary was
built on 20 August and the source has had eleven days of changes from several
sessions since, so the rebuild is the first time any of them ran under the
emulator. Which change broke startup is open - bisect with the probe.

**A compiling binary that contains the right strings is not a working binary.**
I checked `strings` for the new symbols, saw them, and called it verified. Run
it under the probe instead:

    npx tsx dev/scripts/door-probe/probe.ts Doors/DoorRepo/doorrepo.amiga \
      --command DOORREPO --timeout 20000

**The door probe was broken for EVERY door** until `baefa28ff`: probe.ts spawned
the harness with `cwd=REPO_ROOT`, which has no tsconfig.json, so tsx compiled
the backend with decorators off and every probe died on chat.handler.ts. If a
probe fails with a decorator error, that regressed again.

**Verify deploys by reading the container, and grep the right tree**: it runs
`tsx src/index.ts` from `/app/web/backend`, NOT `/app/dist`. Greping
`/app/dist` finds nothing and looks like a failed deploy.

The dirty tree is BBS runtime state plus another session's uncommitted work
(`web/config-app`, `Doors/super-qix` backgrounds and tests - untracked, so one
`git clean -fd` from gone).

## The DOORMAN incident - closed

Deleting doors on the live board removed every door, DOORMAN included: the
uninstall force-deleted `PROJECT_ROOT/<install_dir>` unchecked, and
`install_dir` is written as `Doors/${command}` - a record with no command
gives `Doors/`.

Guarded in `Doors/door-manager/safe-install-dir.ts`, the doors were restored
by the deploy's door sync, and the guard is confirmed running live. Full
write-up, and the other five items raised the same day, in
`thoughts/shared/todos/2026-08-30_queue.md`.

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
5. **The realtime layer has never met a busy board.** Coalescing, the
   Reconnecting state and the pages-waiting badge were all exercised by tests
   and by hand, not by real traffic.
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
behind tabs with permanent legacy redirects, a realtime layer, and the admin
no longer occupying a BBS node. The full account, commit by commit, is in
`thoughts/shared/handoffs/2026-08-30_admin-redesign-implemented.md`.

The user watched it in a browser while it was built and reported nothing
broken - which is "not obviously wrong", not verified.

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

- **DOORMAN could not see the wall door.** Probably answered by the incident:
  the whole `Doors/` tree was missing, so nothing under it could appear. Worth
  re-checking now that the doors are back, and saying which view it was -
  installed, or repo browse.
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
