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
(expect empty). **78 stale backends were found running at once this session** -
`tsx` does not hot-reload, so a stale process serving old code looks exactly
like a failed fix. If a change "does not apply" after a restart, clear the tsx
cache: `rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

## Current state (2026-08-30, evening)

**Everything is pushed and deployed.** Live ran `a76fc207d` at the last check,
with one more deploy in flight for `38937119b`. Verified by reading the running
container, not the workflow's word for it: `/app/.git-sha`, and the new code
greped directly out of the live `dist/`.

`Commands/BBSCmd/wall.info` is modified in the tree: the user's own admin edit
writing the repo's copy. Left uncommitted on purpose. The rest of the dirty
tree is BBS runtime state - Bulletins, CallersLogs, Conf.DB, database.sqlite -
which is deliberately never committed.

The admin dev server may still be running on `http://localhost:5175/admin/`.

## The DOORMAN incident - closed

Deleting doors on the live board removed every door, DOORMAN included. The
volume confirmed it: `/app/data/bbs/Doors` did not exist, only `Doors.info`
beside it, while `Commands/BBSCmd` still held 365 `.info` files.

Cause: the repo-view uninstall ran a recursive force-delete of
`PROJECT_ROOT/<install_dir>` with nothing checking the value, and `install_dir`
is written as `Doors/${command}` - so a record with no command gives `Doors/`.
The backend's own delete path already had this guard; DOORMAN's did not.

**The doors are back** - the deploy's door sync restored them from the image,
106 directories, DOORMAN among them - and the guard is confirmed running live.

`thoughts/shared/todos/2026-08-30_queue.md` has all six items the user raised,
each with the commit that fixed it. All six are done and live.

## Next

Nothing is queued. Open items, in the order they are worth doing:

1. **Look at the admin in a browser.** Twenty-plus commits of redesign have
   never been seen by anyone. Start at the Overview.
2. **`bbsConfig.info` has a non-standard tooltype array**, so the writer will
   not rewrite it. System configuration saves land in `bbsConfig.info.txt`,
   which this BBS reads, and the admin says so - but the icon drifts until it
   is re-created in Workbench or IconEdit. This one needs an Amiga, not a
   commit.
3. **Audio stutter** - one measured cause fixed, diagnostics live
   (`[Audio][stutter]`), never confirmed by the user.
4. The plan's Configuration Files screen is four tabs, not the single tree
   with scope filters it describes. The tree is still the better end state.

## The admin redesign is done, and unverified in a browser

`thoughts/shared/plans/2026-08-27-admin-redesign.md`, phases 0 to 5, with two
deliberate departures noted below. What landed:

- **Design tokens** in `web/config-app/src/styles/tokens.css`, mapped in
  `tailwind.config.js`, with the `bbs-*` names kept as aliases. The five
  colours that were used 122 times and never defined now exist. Roughly 400
  raw palette classes across 31 files moved onto the ramp.
- **Blue carries action, red is identity and danger**; body is 13 px sans with
  mono reserved for real values; a density toggle drives row height.
- **App shell** with grouped navigation, 14 destinations instead of 27 flat
  entries, landing on a new **Overview** dashboard rather than a 1 729-line
  form.
- **Merged screens**, each behind tabs with the tab in the URL: Nodes (live
  plus configuration), Conferences (plus file areas), Configuration Files (all
  four tooltype editors), Lookup Tables (five lists), Health and Deployment,
  Operator Chat (plus its settings). **Nothing inside those pages changed** -
  several are the only route to a piece of configuration.
  `src/routes/legacy-routes.ts` holds a permanent redirect for every path they
  used to live at, and the tests walk that table.
- **Realtime.** One socket for the whole app, handshaking `adminOnly=true`
  against a new branch in `web/backend/src/index.ts`. Events invalidate query
  keys on a 250 ms trailing window; polls speed up when the socket drops. New
  Activity feed. A caller paging the sysop now raises a toast and a header
  badge from any screen.
- **The admin no longer occupies a BBS node.** It was falling through to node
  assignment, so every Operator Chat visit burned a node and appeared as a
  phantom user.
- **System Configuration saves explicitly**, with a sticky bar and a Discard,
  instead of writing `bbsConfig.info` 800 ms after a keystroke on a file the
  running BBS reads.
- **Deleting a user or a door asks for the name to be typed back.**
- `InfoEditorPage` is reachable at last - 351 lines that nothing imported.
- Computers and Protocols got the screen-types disk-first fix (from the audit
  agent, merged after verifying 9 of its 12 tests fail without it).

### Departures from the plan, on purpose

1. **TanStack Table v9, not v8.** v9 is what installs today and its API is
   different: `useTable` with explicit `tableFeatures` registration rather than
   `useReactTable` with row-model options. A v9 table missing its feature
   registration renders correctly and sorts nothing, which is what
   `src/test/data-table.test.tsx` asserts against.
2. **Configuration Files is four tabs, not one file tree with scope filters.**
   Tabs preserve each editor exactly; the tree would have meant rewriting three
   pages that are each the only route to their files. The deeper merge is still
   worth doing.

### What has NOT been verified

Nobody has opened any of this in a browser. `tsc` is clean, 51 frontend tests
and the backend suite pass, the entry bundle is 187 kB gzip against a 400 kB
budget - but no screen has been looked at, and the socket has never been
exercised against a running BBS. **First job for anyone picking this up: run
it and look.**

## The admin app is disk-first already

The BBS reads `.info` files from disk; SQLite is downstream. Two audits, with
corrections, are in `thoughts/shared/research/2026-08-27_admin-ui-audit.md` and
`2026-08-27_admin-page-by-page.md`. **The redesign does not need a storage
rewrite underneath it.**

Fixed across 2026-08-27 and 08-30: the Security page writes
`Access/ACS.<level>.info`; door edit, rename and create write
`Commands/BBSCmd/<command>.info` and can no longer destroy a working door;
screen types, computer types and transfer protocols no longer erase the entries
that exist only on disk (`config-merge.util.ts`, which also handles a rename
now); node system commands reach a route that exists; `web/config-app`
typechecks and has a vitest suite.

**Per-field round-tripping is now verified** for system configuration,
conferences, drives, doors, screen types, computers, protocols, languages,
file checkers and nodes - each with tests that fail when the fix is reverted.
It found seven faults, all of the same two shapes: a value written under one
key and read back from another, or a writer rebuilding a file from the
database (or from nothing) and dropping what it did not own. See
`thoughts/shared/todos/2026-08-30_queue.md` and the commits from 2026-08-30.

**One finding needs a person:** this board's `bbsConfig.info` has a
non-standard tooltype array, so the writer will not rewrite it. Saving system
configuration works - the value goes to `bbsConfig.info.txt`, which this BBS
reads, and the admin now says so - but the icon file will drift until it is
re-created in Workbench or IconEdit.

## Unverified, waiting on the user

- **Audio stutter.** One measured cause fixed - 58.4 ms of audio per minute was
  discarded at capture block boundaries. Diagnostics are live: a stuttering
  call now logs `[Audio][stutter]` saying whether the sender's main thread or
  the network is late. Not confirmed fixed.
- **DOORMAN cannot see the wall door.** Unexplained. WALL IS registered on live
  and `getDoorList()` filters nothing, so two theories are ruled out. Need to
  know which view: installed, or repo browse - a local door would not be in the
  repo at all.
- **`wall.info` NAME reads "WALL"** on live, overwritten before the rename fix
  landed. The original is in `wall.info.backup` beside it.

## Gotchas

- **Read the mutation path; do not count.** Three false-positive rounds.
- **`screen.focused` is a boolean about the Screen itself.** The focused
  element is `screen.getFocused()`. This cost time twice, once in a door
  diagnostic that could only ever print "none".
- **SDK tests import the built `sdk/dist`.** A source edit is invisible until
  `npm run build:cjs`.
- **`packages/terminal` compiles the SDK under a stricter tsconfig and gates the
  Docker build.** Typecheck it before pushing anything under `sdk/`.
- **The live log is not the current log** - every deploy replaces the container.
- **`head` truncates evidence.** "Live has no WALL door" was wrong because a
  grep was cut off at six lines.
- **A merged screen must keep a redirect.** Several admin pages are the only
  route to a piece of configuration; `src/routes/legacy-routes.ts` and its test
  are what stop a merge from silently removing one.
- **Doors only got npm dependencies if they used better-sqlite3.** Fixed; 11
  doors were repaired on the next deploy. `web/backend/scripts/door-needs-deps.sh`
  decides, and it is tested.
