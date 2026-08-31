# Handoff

## READ THIS FIRST in a fresh session

**Admin work: read `thoughts/shared/handoffs/2026-08-31_admin-audit-and-fixes.md`,
then the plan it points at,
`thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`.** Sixteen admin
fixes shipped on 2026-08-31; a six-agent audit then found considerably more,
all of it in that plan, in severity order, with express.e line numbers.

The plan's findings are marked VERIFIED or REPORTED. REPORTED means a lead,
not a fact - this repo has produced confident false positives repeatedly.
Confirm against `express.e` before changing anything.

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

**The C startup failure is solved.** No C regression: the door's caches had
grown its BSS to 436 KB, putting its segments at 0x085d04, past the 500 KB the
emulator gives a door and onto exec.library's LVO table at 0x7fcf4. HUNK_BSS is
zeroed at load, so it blanked 126 exec vectors before executing anything and
exited FAIL - while the emulator logged `VERIFICATION: 230 OK, 126 FAILED!` and
carried on. Two fixes, two levels:

- `web/backend/src/amiga-emulation/memory-map.ts` owns the fixed addresses and
  `assertDoorSegmentsFit` refuses the load BEFORE `HunkLoader.load` writes a
  byte, naming the segment and what it would destroy. Reaches the sysop over
  `door:error` and the probe report.
- `examples/doorrepo-c/doorrepo.c`: DIZ cache 32->8, FILES 4->2, DOC 2->1.
  BSS 327 KB, segments end 0x06b47c, **80 KB of headroom**. Code grew 40 KB in
  eleven days, so D will eat that - the guard now says so loudly.

**A compiling binary with the right strings in it is not a working binary.**
Probe it, and give it 20 s - less kills the harness before it boots and reports
an empty run that looks like a dead door:

    npx tsx dev/scripts/door-probe/probe.ts Doors/DoorRepo/doorrepo.amiga \
      --command DOORREPO --timeout 20000

**The probe was broken for EVERY door** until `baefa28ff` (spawned with
`cwd=REPO_ROOT`, no tsconfig, decorators off). A decorator error means that
regressed.

**Verify deploys by reading the container, and grep the right tree**: it runs
`tsx src/index.ts` from `/app/web/backend`, NOT `/app/dist`.

The dirty tree is BBS runtime state plus another session's uncommitted work
(`web/config-app`, `Doors/super-qix` - untracked, one `git clean -fd` from
gone).

## DOORREPO: A, B and C are built; D and E are not

The door-admin API is complete, reads and writes. Formats in
`docs/DOOR-REPO-API.md` s.11+; as-built in
`thoughts/shared/plans/2026-08-31-doorrepo-phase-{b,c}.md`.

**D (screens) and E (retire DOORMAN) do not exist.** Three things D must not
get wrong: paths are contained by checking twice, resolved AND after
`realpath` (a symlink inside a door defeats a string comparison); a text
`.info` disables with `!KEY` only, binary DiskObjects honour `(KEY)`; and
streaming `DELETE` puts success in `DONE`, not the HTTP status.

**Do not add a server-side `enabled`.** Enable/disable lives in the C door
(`ACCESS=255` + `DRACCESS`, `flow.h:618`, "do not redesign") because a real
board has no API. The server offers `rescan` only.

The DOORMAN incident is closed; see `thoughts/shared/handoffs/`.

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
scope call. No install record, so the name column echoes the command and the
API's `archive` field is empty for them. Real names need the archive-matching
backfill in `thoughts/shared/todos/2026-08-30_queue-round-2.md`.

The board's own management API is `/api/door-admin/*`, NOT `/api/doors` (the
existing door-asset router).

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

## Admin remediation, executed (2026-08-31)

**Deployed 2026-08-31 08:50 UTC.** `main` is `7d7de02b4`; `/health` reports
it. 28 of the plan's 29 items.

Every deploy now snapshots the board's `.info` files first, to
`/root/bbs-backups/bbs-config-<stamp>.tar.gz` (last 20 kept). The one taken
before this deploy is `bbs-config-20260831-084639.tar.gz` - 1816 files, 328K.
That is the rollback point for everything phases 1-3 changed about what gets
written to disk.

- Plan: `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md` (now
  `implemented`, with a "What was done" section holding the commit table and
  the corrections to its own claims)
- Handoff: `thoughts/shared/handoffs/2026-08-31_admin-remediation-executed.md`

Backend 6374 passing / 0 failing; config-app 99 passing; both typechecks
clean. The seven suites that fail to RUN are `Doors/*` module resolution in a
fresh worktree, which CI installs.

**The doors are done.** 62 of the 63 icons carrying `ACCESS=0` no longer do -
express.e:4703 read that as "nobody may run this door" while this port reads
it as "everybody", so they all worked here and were dead on a real Amiga.
Behaviour here is unchanged. `GLC.info` is left: its tooltypes have no length
prefixes, so the array cannot be located and the admin's editor refuses it
too. Re-make that icon in IconEdit if it matters.

Preparing that migration turned up four defects in the writer the admin uses
on EVERY door edit - a non-ASCII description was truncated, UTF-8 was written
over Latin-1, trimmed values were re-rendered lossily, and a file whose first
line is the word FORM would have been written out twice over. All fixed, with
byte-level regressions.

**Before deploying:** phases 1-3 change what is written to a live board's
configuration files. Take a copy of `/app/data/bbs` first.
