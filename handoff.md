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

**A tooltype 32 characters long was read as a comment.** Its length byte is
0x21; the scraper glued it to the front and dropped it, so LOCATION vanished
and the command left the registry.
`BADD`, `BS`, `M`, `edit`, `open`, `va`, `_s`, `<` and eight more were that,
not the `Doors/` wipe. The parser reads the array as icon.library wrote it now
(1545 icons: 48 tooltypes back, 0 lost), and
`dev/scripts/prune-orphan-registrations.ts` renamed the 13 dead. Live: 139
registrations, zero dead.

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

Audited 31 August, item by item. Two entries that stood here were already
done - do not take this list on trust, it has been wrong before.

1. **Node Configuration deliberately stays on the old `DataGrid`** - a row
   being edited turns into input fields and must not move. Both files say so.
2. **The realtime layer has never met a busy board** - coalescing, Reconnecting
   and the pages-waiting badge were exercised by tests and by hand only.
3. **`bbsConfig.info` cannot be written back.** `writeInfoFile` refuses it:
   "tooltype array structure not recognised". Its first entry declares 0x19
   bytes and holds 14, so the array does not describe its own contents and a
   rewrite would be a guess. Saves land in `bbsConfig.info.txt`, which this BBS
   reads; the icon drifts until Workbench or IconEdit re-creates it. The strict
   reader in `amiga-command-parser.util.ts` does not help - the writer is
   `info-file.util.ts`.
Closed 31 Aug: appended tooltypes, invented tooltypes and odd-offset arrays
(`622594b17`); the wall door was never missing; 187 orphaned registrations
deleted, backed up on the host.

Checked on `main`, not assumed: the six own-table pages are on
`components/ui/DataTable` (Security is a flag editor, not a table);
`VITE_BYPASS_AUTH` is gone, `src/test/auth-guard.test.ts` keeps it gone;
Configuration Files is two tabs, "All .info files" being the single list.

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

**Conferences, the J door, dockerd - detail in
`thoughts/shared/handoffs/2026-08-31_conferences-doors-and-the-docker-outage.md`.**
Conferences work end to end (create pinned to NCONFS+1, dir Conf<id>-or-refuse;
removal shifts users/mirror/Conf.DB together; change-bus refresh). J reads
ConfConfig.info via icon.library - joincnf.cfg must carry NO CNF_NAME lines.
dockerd panicked on every build after a builder prune corrupted buildkit's db;
repaired, prune step removed, live-restore ON. **Never restart dockerd while a
`docker compose` process runs.** Gotchas: SKIP_DB_INIT=1 breaks DB suites in a
full run; run `npm run typecheck:tests`; never import server/initialization
from a service; a test that mocks the half the bug lives in passes while the
bug is live.

**Review + slot-1 incident (evening).** Three adversarial agents reviewed
conference create/edit/delete; findings and fixes are in `e42f6602e` (worst:
the delete migrated every user "into" slot 0 - fs.writeSync writes negative
positions at byte 0 - destroying slot 1, the -TCB!- account; the mirror shift
cascade-ate the conference above; every UI edit silently skipped the mirror).
Live repaired from `/root/user-files-pre-repair-*` + the remove-9 backup:
slot 1 restored, keys/misc rebuilt from the DB, all 64 drifted disk access
strings regenerated from the mirror; second dry run plans zero. Repair script:
this session's scratchpad `repair-user-files.ts`. STILL OPEN, decisions:
user.data is CHAR[10] vs 12+ conferences (disk cannot hold access for 11+);
PRIVATE/MIN_ACCESS tooltypes are not enforced at join and access expansion
grants new conferences to everyone; the message runtime is NUMBER-keyed
(MessageFileManager, bbs-paths.util) so drifted boards need a directory
renumber heal before create works past the refusal.
