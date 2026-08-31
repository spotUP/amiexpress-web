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

The dirty tree is BBS runtime state plus another session's untracked work
(`web/config-app`, `Doors/super-qix`) - one `git clean -fd` from gone.

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

## Admin remediation, executed (2026-08-31)

Deployed. 28 of the plan's 29 items, plus the sysop's three reports and the
volume-ownership fix. Full detail, the corrections to the plan's own claims,
and what is still open:
`thoughts/shared/handoffs/2026-08-31_admin-remediation-executed.md`.

**Fixed:** the board no longer reverts what the admin saves. Six root `.info`
files and every door icon were IMAGE-OWNED, so a restart overwrote them and
logged the sysop's own edit as "hash drift". The entrypoint now tracks what
each deploy wrote. **The first deploy after this adopts a baseline and changes
nothing** - the protection starts from the second, which matters when testing
it.

**Also fixed, from the sysop's report:** SMTP username reaches disk
(express.e:31810); the SMTP test answers instead of spinning on port 465 (that
is SMTPS - no plaintext greeting, so it waited); the Security page shows the
levels users actually hold and which ACS file serves each (express.e:3025
rounds down and walks down, so level 30 is served by ACS.20); usernames can be
renamed.

**62 door icons** no longer carry `ACCESS=0`, which express.e:4703 reads as
"nobody". `GLC.info` is left - its tooltypes have no length prefixes, so the
array cannot be located and the admin's editor refuses it too.

**Still open:** 5.3 (per-page `columns` memo - the cheap version introduced a
staleness bug its own test caught) and `GLC.info`.

**Each deploy snapshots the board's `.info` files first**, to
`/root/bbs-backups/bbs-config-<stamp>.tar.gz`, last 20 kept.
