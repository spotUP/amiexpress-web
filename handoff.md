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

## Current state (2026-08-30, evening)

**Everything is pushed and deployed.** Live ran `a76fc207d` at the last check,
with one more deploy in flight for `38937119b`. Verified by reading the running
container, not the workflow's word for it: `/app/.git-sha`, and the new code
greped directly out of the live `dist/`.

`Commands/BBSCmd/wall.info` is modified in the tree: the user's own admin
edit, left uncommitted on purpose. The rest of the dirty tree is BBS runtime
state - Bulletins, CallersLogs, Conf.DB, database.sqlite - never committed.

The admin dev server may still be on `http://localhost:5175/admin/`.

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

Client endpoints: `/manifest` (JSON), `/list.txt` (ISO-8859-1 for C89
clients), `/files/:archive` (`FILES|count|junk` then `size|isJunk|path`),
`/doc/:archive`, `/archive/:archive`, `/health`, and `/doors/:archive` which
carries everything plus version, suggestedTooltypes, fileIdDiz and guide.

**The live BBS runs DOORMAN in consumer mode** - neither `DOOR_REPO_ROLE` nor
`DOOR_REPO_URL` is set, so `resolveDoorRepoMode` defaults to consumer against
`https://bbs.uprough.net`, which loops back through this BBS's own proxy.

Fixed 2026-08-30:

- **DOORMAN's docs and file lists come from the repo** (`055ac8df9`). Both read
  the LOCAL catalog service, which a consumer does not have: [V]iew doc did
  nothing and browsing an archive said "no file data in catalog".
- **Empty door descriptions** (`3217daf3b`). `getDoorList` overlaid metadata
  from `door_installs`, which **does not exist on the live board**, so all 365
  commands reached the doors menu with no description. It now asks the door
  server's manifest, cached ten minutes, and fills only what is empty -
  matching on name or archive base name, case and punctuation removed. A
  door's own `.info` always wins.

DOORREPO (the C door) was audited and is already repo-driven: `list.txt`,
`/archive/`, `/health`, `/learned-patterns`. Its only local state is
`DoorRepo.cfg` and the download directory, which is correct. `id`,
`archive_path` and `binary_name` stay local by nature - they describe this
node's copy, not the catalog's.

- **One fetch fills the rest** (`28e849852`, **committed, not pushed**).
  `fetchDoorDetail` (`/doors/:archiveName`) replaced `fetchDoc` and
  `fetchArchiveFiles`; RepoView caches it per archive, and the info-pane
  fetch is debounced because it runs on every cursor move. The manifest's
  own `hasDoc`/`junkCount` were dropped in `mapManifestDoorToEntry`, so no
  consumer row ever advertised `[V]=Doc`. The install record now carries
  version, md5 and revision. `app.ts` crossed 2000 lines again:
  `installConsumerDoor` moved to `install-core.ts`, re-exported.

## The door fixes, 2026-08-30

Nine commits, from `243e1d79a` to `3217daf3b`: the delete guard, the log
panels for install and uninstall, the list refresh, GRANDMASTER's zone meter,
installing under the archive's own command, the install record naming what was
actually installed, and the two repo-backed reads above. Each is named against
its queue item in `thoughts/shared/todos/2026-08-30_queue.md`.

## Next

Nothing is queued by the user. Open work, in the order it is worth doing.

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
