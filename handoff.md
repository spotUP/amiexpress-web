# Handoff

## READ THIS FIRST in a fresh session

**Admin work: read
`thoughts/shared/handoffs/2026-08-31_session-handoff.md` first.** It carries
the current state, the three unpushed commits, and what still needs testing.
Behind it: `..._admin-remediation-executed.md` for phase-by-phase detail,
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

## Admin work, 2026-08-31 - START HERE

Full session handoff: `thoughts/shared/handoffs/2026-08-31_session-handoff.md`.
Phase-by-phase detail: `..._admin-remediation-executed.md`. Plan (implemented):
`thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`.

**THREE COMMITS ARE UNPUSHED** in `/private/tmp/admin-remediation-wt` on
`fix/admin-audit-remediation` - conference create/delete fixes and entrypoint
hardening. Held back because the sysop was about to test and a push recreates
the container. Push them first.

**The big one, deployed and verified:** the board used to revert what the admin
saved. Six root `.info` files and every door icon were IMAGE-OWNED, so a
restart overwrote them and logged the sysop's own edit as "hash drift". The
entrypoint now tracks what each deploy wrote (`.deployed-manifest`,
`sync_tracked`). Confirmed live: 258 files tracked, steady state a clean no-op.

**Also deployed:** the audit plan's phases 1-6; the sysop's three reports (SMTP
username now reaches disk and the test no longer hangs on port 465; the
Security page shows the levels users actually hold and which ACS file serves
each; usernames can be renamed); and 62 door icons that no longer carry
`ACCESS=0`, which express.e:4703 reads as "nobody".

**Unpushed and audited, not yet tested:** conference delete used to leave a
half-existing conference (ConfConfig.info untouched), and create never
registered the conference at all. A conference is a POSITION
(express.e:8506), so only the LAST one can be removed - the refusal says why.
Neither touches the conference DIRECTORY; its path is reported instead.

**Open:** the SMTP password stays encrypted, so a real Amiga cannot SMTP-auth -
a deliberate parity gap, and the sysop's call. 5.3 (per-page `columns` memo)
and `GLC.info` are left with their reasons.

**Each deploy snapshots the board's `.info` files first**, to
`/root/bbs-backups/bbs-config-<stamp>.tar.gz`, last 20 kept.
