# Handoff

## READ THIS FIRST in a fresh session

**Read `thoughts/shared/handoffs/2026-08-31_conferences-doors-and-the-docker-outage.md`
first.** It has the afternoon's state, the Docker incident and its repair, and
what is open. Behind it: `2026-08-31_session-handoff.md` for the morning,
`..._admin-remediation-executed.md` for phase-by-phase detail,
`..._admin-audit-and-fixes.md` for the day the audit was run, and the plan
itself, `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`, now
`status: implemented` with a section correcting its own claims.

The plan's findings were marked VERIFIED or REPORTED. REPORTED means a lead,
not a fact - this repo has produced confident false positives repeatedly, and
executing the plan disproved three of its own REPORTED claims. Confirm against
`express.e` before changing anything.

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`.
Both LIVE. Push to `main` auto-deploys; after pushing, CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` - green CI has lied before).
Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22**.
`BBS_DATA_DIR=/app/data/bbs` - not `/app`, which holds a bare skeleton.

**`main` moves under you.** Other sessions push door and arcade work
constantly. Cut a deploy worktree from a fresh `origin/main`, cherry-pick, and
confirm ancestry before pushing AND before deleting the branch.

**A deploy disconnects /chat after a 60-second countdown**, and /chat
reconnects itself. Documentation changes do not deploy (`paths-ignore`).

**Dev environment**: `./dev/scripts/start-servers.sh --bbs-only` /
`kill-servers.sh`. Zombie-verify after every stop. If a change "does not
apply", clear the tsx cache:
`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

**Run `npm run typecheck:tests`, not just `npm test`** - jest uses swc and
strips types, so a test file can be green under jest and fail the typecheck.

## Current state (2026-08-31)

**Full session handoff: `thoughts/shared/handoffs/2026-08-31_session-handoff.md`**
- the deploy step, the gotchas, the ordered next steps.

**The installed-door link is merged and live** (`178d8a74f`). Every install path
records the archive a door came from and the files it wrote, so a delete removes
exactly that; neither door lets a sysop type a command name.

**Today's full account: `thoughts/shared/handoffs/2026-08-31_doorrepo-doors-and-deploy-fixes.md`**
- twelve commits, five defect classes found on the live board, and the ordered
next steps. Read it before touching doors, the emulator or the deploy.

**ONE THING IS BLOCKED ON YOU**: 277 command registrations point at files that
do not exist - the tail of the 30 August `Doors/` wipe. `BR`, `BV`, `BADD`,
`BROADCAST` are all this. The scanner is on the container, dry-run verified;
the exact command is Next Step 0 of that handoff. It renames, never deletes.

**The C startup failure was never a C regression.** The door's caches had grown
its BSS to 436 KB, putting its segments past exec.library's LVO table at
0x7fcf4. HUNK_BSS is zeroed at load, so it blanked 126 exec vectors before
executing anything - while the emulator logged `VERIFICATION: 126 FAILED!` and
carried on. `memory-map.ts` now refuses such a load by name; the door's caches
were cut. **~46 KB of headroom left** after two new screens.

**A 68K door cannot synchronously call the BBS it runs inside.** The emulator
runs in the backend's process, so a door blocking in WaitSelect starves the loop
that would answer it - the reply arrives after the 30 s timeout. `L` now reads
`Doors/DoorRepo/DoorRepo.doors`, written beside the launch token.
`report_install_to_bbs` has the same defect and has never worked here.

**Do not add a server-side `enabled` route.** Enable/disable lives in the C door
(`ACCESS=255` + `DRACCESS`, `flow.h:618`, "do not redesign") because a real
board has no API. The server offers `rescan`.

**A failed deploy leaves the board DOWN** - the script stops the container,
builds, then starts. That happened once today when the Docker daemon dropped its
socket mid-build.

**A compiling binary with the right strings in it is not a working binary.**
Probe it, and give it 20 s - less kills the harness before it boots and reports
an empty run that looks like a dead door:

    npx tsx dev/scripts/door-probe/probe.ts Doors/DoorRepo/doorrepo.amiga \
      --command DOORREPO --timeout 20000

**Verify deploys by reading the container**: it runs `tsx src/index.ts` from
`/app/web/backend`, NOT `/app/dist`. The backend listens on **3001**.

## DOORREPO and the door repo

Where DOORREPO stands (A, B and C built; D and E not) and how the door repo is
laid out are settled; see `thoughts/shared/handoffs/`.

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

## Waiting on the user

- **DOORMAN could not see the wall door.** Probably the incident: the whole
  `Doors/` tree was missing. Worth re-checking now, saying which view it was.
- **`wall.info` NAME reads "WALL"** on live, overwritten before the rename fix
  landed. The original is in `wall.info.backup` beside it.

## Gotchas

- **Read the mutation path; do not count.** Three false positives.
- **A recursive delete needs a resolved-path guard, not a trusted string.**
- **Frogger and Super Qix are FAQ-complete**; see each `CHECKLIST.md`.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`,
  with the tooltypes it was built with.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends,
  or a four-line change becomes a whole-file diff.
- **`screen.focused` is a boolean about the Screen itself**; the focused
  element is `screen.getFocused()`.
- **SDK tests import the built `sdk/dist`.** A source edit is invisible until
  `npm run build:cjs`; `packages/terminal` compiles it under a stricter
  tsconfig that gates the Docker build.
- **A TypeScript door's `dist/` is what runs** and the pre-commit hook
  rebuilds it. Two agents on one door pull each other's half-finished work
  into a commit; use separate worktrees.
- **The live log is not the current log**: every deploy replaces the
  container. `head` truncates evidence; redirect to a file.
- **A merged admin screen must keep a redirect.** `src/routes/legacy-routes.ts`
  and its test stop a merge silently removing the only route to a setting.

## Conferences, the J door, and the Docker incident (2026-08-31 pm)

Archive: `thoughts/shared/handoffs/2026-08-31_conferences-doors-and-the-docker-outage.md`.
Everything here is deployed and verified on the live board.

**Conferences work end to end now.** Name field on the form; row click edits;
every `Conf<N>.info` / `Node<N>.info` saves (the parser walks the DiskObject
to the tooltype array instead of guessing, and heals the mixed-prefix layout on
first save); a rename/create/delete reaches the running board through
`services/conference-change-bus.ts` with the arrays replaced IN PLACE; a
conference can be removed from ANY position - `ConferenceRemovalService`
renumbers ConfConfig.info, the icons, every account's `conferenceAccess`, six
SQLite tables and Conf.DB together, after a copy to `_conf-backups/`; the
delete-files switch is in the confirm dialog; the mirror prunes stale rows
(`{ complete: true }` only); create writes disk -> mirror row -> config row;
new conferences are numbered `NCONFS+1`, read-only.

**J lists the board's real conferences.** `Doors:emp_tools/joincnf` prefers a
`CNF_NAME.n` line in its cfg over the icon's `NAME.n`; the 36 hand-typed lines
are gone from `Doors/emp_tools/joincnf.cfg`, binary and emulator untouched.

**INCIDENT: dockerd crashed on every build** (`panic: page N already freed`,
buildkit's bbolt cache db), six times, each stopping every container on the
host. Trigger, unproven but only new variable: the per-deploy
`docker builder prune` I had added. Removed (`9af19730f`). Repair: stop
`docker.socket` AND `docker`, move `/var/lib/docker/buildkit/{cache.db,
history_c8d.db}` aside, start, `docker start` the eight containers -
`unless-stopped` did NOT bring them back. **Never restart dockerd while a
`docker compose` process runs.** Live-restore was being enabled at the end of
the session; check `docker info | grep -i "live restore"`.

**Gotchas from today:** `SKIP_DB_INIT=1` breaks every DB suite in a full run;
run `npm run typecheck:tests` (I broke CI without it); never import
`server/initialization` from a service (it boots a second BBS in the worker);
import module-level singletons inside the write path, not at file top; a test
that mocks the half the bug lives in passes while the bug is live.
