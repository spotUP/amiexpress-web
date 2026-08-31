---
date: 2026-08-31
topic: The admin remediation, the sysop's reports, the door icons, and the conference audit
tags: [handoff, admin, config-app, express-e-parity, info-files, deploy, conferences]
status: final
---

# Session handoff - 2026-08-31

## Start here, in one paragraph

The admin audit remediation plan was executed (28 of 29 items) and deployed.
Then the sysop reported three faults, all fixed and deployed. Underneath them
was the reason the admin has never felt like it worked: **the board reverted
what the admin saved on every restart**, which is now fixed. Finally, the
sysop asked for an audit of conference management before testing it; that
found two mirror-image bugs, both fixed - **and those three commits are NOT
pushed**.

Read `thoughts/shared/handoffs/2026-08-31_admin-remediation-executed.md` for
the phase-by-phase detail of the plan, and
`thoughts/shared/plans/2026-08-31-admin-audit-remediation.md` (status:
implemented) for the findings and the corrections made to its own claims.

## Where things stand

- Worktree: `/private/tmp/admin-remediation-wt`, branch
  `fix/admin-audit-remediation`. It has its own `node_modules` (root, sdk,
  backend, config-app); the sdk install needs `SKIP_SDK_PREPARE=1`.
- Live: `7c58f32ad`, verified through `/health`. Everything below except the
  three unpushed commits is on the board.
- Backend 6502+ passing, config-app 99 passing, both typechecks clean.
- **Three commits unpushed**, deliberately - the sysop was about to test and a
  push recreates the container:

  | commit | what |
  |---|---|
  | `c0fe4b8dc` | a failed tracked copy is loud, and not recorded as written |
  | `a96d00176` | conference delete finishes the job, or refuses to start it |
  | `eed4c402c` | a created conference exists to the BBS, and keeps its name |

## What was done

### The plan (phases 1-6), deployed

Ten `.info` writers stopped destroying the files they wrote; the database
mirror stopped being a source for them; the tooltype editor stopped deleting
what it could not display; six settings the schema silently stripped; six
domains editing by a row id they were never given; the express.e parity work
(PASSWORD_SECURITY, node TELNET, ACS `=NO`, eighteen dead ACS flags, five
wrong tooltype names, the ranges); the dead controls; the error states and
thirteen dialogs onto Radix. The guards were widened FIRST so the rest was
checked by something - and caught a real bug on their first run.

### The sysop's three reports, deployed

**SMTP.** Two faults, one symptom. `SMTP_USERNAME` was in SENSITIVE_FIELDS, so
a save encrypted it into the database and stripped it from the icon, while the
badge said `bbsConfig.info : SMTP_USERNAME` and the field read back empty.
express.e:31810 reads it from that file; it goes there now. Its PASSWORD stays
encrypted - express.e:31811 wants that on disk too, so **a real Amiga cannot
SMTP-auth**: a parity gap taken on purpose, because unlike AUTOVAL_PASSWORD it
is the sysop's own credential and the Configuration Files page would show it.
Open question for the sysop if they want parity instead.

The "test just spins" was port 465 - SMTPS, TLS from the first byte, no
plaintext greeting - so connecting without `secure` WAITED against nodemailer
defaults of a 30s greeting and 10-minute socket timeout. 465 is now always
implicit TLS, both transports carry 10s/10s/20s timeouts, and 587-with-SSL is
refused up front.

**Security levels looked invented.** The page listed the FILES in `Access/`
(10, 20, 50, 255) on a board whose new users are level 30. express.e:3025-3034
rounds a level down to a multiple of five and walks down, so a level-30 caller
is served by `ACS.20.info`. The page now also shows the levels users HOLD, the
count, and which file serves each.

**Usernames could not be renamed.** The field was disabled; the write path had
always supported it (`userToStruct` puts `user.username` in the record). Only
validation was missing: non-empty, <= 31 chars, not already taken. A rename
does NOT rewrite history and the form says so.

### The 62 door icons, deployed

63 of 155 command icons carried `ACCESS=0`, which express.e:4703 reads as
"nobody may run this door" while this port reads as "everybody". All 62 that
could be written safely no longer carry it. `GLC.info` is left: a real
DiskObject whose tooltypes have no length prefixes, so the array cannot be
located; the admin's editor refuses it too, correctly.

Preparing that migration found **four defects in the writer the admin uses on
every door edit** - non-ASCII values truncated, UTF-8 written over Latin-1,
trimmed values re-rendered lossily, and the WORD "FORM" treated as an IFF
chunk (which would have written one file out twice over) - plus two fidelity
fixes (line endings, trailing newline). All in `644a7fcfa`.

### The deploy, and the volume - the big one

Six root `.info` files and every `Commands/BBSCmd/*.info` were IMAGE-OWNED in
`docker-entrypoint.sh`, so a restart overwrote them from the image and logged
the sysop's own edit as "hash drift". **Five of the domains this remediation
fixed saved correctly and were reverted on the next restart.** That is the best
explanation found for "we never could get it working properly".

The sysop chose option B: the entrypoint now records what each deploy WROTE,
in `/app/data/bbs/.deployed-manifest`, and

| state | what happens |
|---|---|
| missing on the volume | copied |
| matches what we last wrote | untouched, so the image may update it |
| differs from what we wrote | the sysop edited it; theirs is kept |
| no baseline yet | record the IMAGE's hash, change nothing |
| agrees with the image again | divergence over, tracking resumes |

**Verified on the board**: deploy 33380048679 printed
`manifest: 258 files tracked` and `Tracked: 0 created, 0 updated, 0 kept, 0
adopted` - which is the correct steady state when nothing changed.

Each deploy also snapshots the board's `.info` files first, to
`/root/bbs-backups/bbs-config-<stamp>.tar.gz` (328K, 1816 files), last 20
kept.

### The conference audit (unpushed)

The sysop asked for this BEFORE testing, and it was worth it.

The old delete **could not destroy anything, because it deleted too little**:
it removed the `conference_config` row and unlinked `Conf<N>.info`, leaving
`ConfConfig.info` untouched. NCONFS unchanged, `NAME.<N>` and `LOCATION.<N>`
still there - so express.e:31849 went on building the conference into its
list, users could still join it, and what they joined had no icon behind it.

The constraint that shapes it: **a conference is a POSITION.**
express.e:8506 is `user.conferenceAccess[confNum-1]="X"`, and NCONFS is a
COUNT. Renumbering to close a gap would silently change which conference every
account can reach. So only the LAST conference can be removed, and the refusal
says why.

Creation was the mirror image: `setupConference` built the icon, directories,
DIR files and counters and **never registered the conference in
ConfConfig.info**, so it was invisible to the BBS. Registered now, and
registered LAST so a failed setup leaves a harmless unregistered directory
rather than a ghost. The name the sysop typed was also being discarded.

Neither delete touches the conference's DIRECTORY - every message and upload
stays, and the path is reported so the sysop removes it deliberately.

## Learnings worth keeping

**Verify bytes, not your own parse.** The door migration's first run compared
PARSED tooltypes before and after, agreed with itself, and had silently
truncated 19 DESCRIPTION values - the parser had already lost the bytes, so
both sides read the same damage. Recorded in memory as
`verify-bytes-not-your-own-parse`.

**Test the shell, do not reason about it.** The manifest's first version had
two bugs a test of the real function caught: recording the VOLUME's hash on
first run made the next deploy read a sysop edit as untouched and overwrite it
(the exact bug being fixed), and without a convergence rule a file stayed
sysop-owned for ever. `tests/services/deploy-manifest-sync.test.ts` drives the
real `sync_tracked` out of the real entrypoint.

**A plausible mechanical improvement can be worse than what it replaces.** 5.3
asked for `useMemo` on nine pages' columns; keying DataTable's model on the
column IDS looked strictly better until its own test failed - accessors then
keep the `value` function they were built with and stop re-sorting. Reverted,
left open with the reason.

**I guessed at a tool twice in a row, in both directions.** `find | tar -T -`
was written unchecked, then "fixed" to a temp file on as little evidence. The
deploy settled it: 1816 files into 328K. Check the tool.

**`git stash` is unusable here.** Six files are committed CRLF against
`eol=lf`, so `git checkout --` re-dirties them and `stash pop` fails for ever.
Recover with `git checkout stash@{0} -- <explicit paths>`. In memory as
`never-git-stash-here`.

**A cancelled deploy is usually not a failure.** The concurrency group keeps
only the newest QUEUED run, so another agent pushing a minute later displaces
yours - and their commit normally has yours as its parent. Check ancestry
before treating it as broken.

**Tests in this tree have asserted misreadings of express.e as correct** -
`LVL_CAPITOLS_in_FILE` was asserted to be a real tooltype on the strength of
its odd spelling. It is an array index (axcommon.e:53). Revert-check every new
test.

## Critical references

- Plan: `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`
- Detail: `thoughts/shared/handoffs/2026-08-31_admin-remediation-executed.md`
- Authority for anything the BBS reads: `AmiExpress-Sources/express.e`, plus
  `axcommon.e`, `ACP.e`, `tooltypes.e`, `axenums.e`, `axobjects.e`
- The one disk-first accessor: `getBoardConfig()` in
  `web/backend/src/services/bbs-config-file.service.ts`
- The one `.info` reader/writer: `web/backend/src/utils/info-file.util.ts`
  (`parseInfoFile`, `readTooltypeMap`, `applyTooltypes`, `writeInfoFile`)
- Volume ownership: `docker-entrypoint.sh` - `TRACKED_INFO`, `sync_tracked`
- Guards: `tests/services/config-read-source.test.ts`,
  `config-round-trip-contract.test.ts`,
  `system-config-schema-covers-tooltype-map.test.ts`,
  `system-config-field-coverage.test.ts`, `deploy-manifest-sync.test.ts`

## Next steps, in order

1. **Push the three commits and deploy.** They are conference-management fixes
   plus entrypoint hardening. `git push origin HEAD:main` from the worktree
   after confirming ancestry; main moves constantly, so expect to merge first.
2. **Have the sysop test**, in this order:
   - settings survive a restart (a computer type, drive, screen type,
     conference name; save, wait for a deploy, confirm they are still there)
   - SMTP username persists and shows in `bbsConfig.info`; the test answers in
     ~10s on port 465
   - Security page shows Level 30 -> ACS.20.info with a user count
   - rename a user, then LOG IN as the new name
   - conference create, then delete the LAST one; confirm a middle one is
     refused with a reason
3. **The SMTP password parity gap** is a decision for the sysop: encrypted
   (safe here, no auth on a real Amiga) or plaintext on disk (full parity).
4. **5.3** stays open with its reason. **GLC.info** needs re-making in
   Workbench/IconEdit if it matters.

## Other notes

- `npm test` writes to the repo's real `Conf.DB`, `Node1/CallersLog` and
  `web/backend/debug-display-flow.log`. Never `git add -A` after a run.
- Seven backend suites FAIL TO RUN in a fresh worktree - `Doors/*` module
  resolution, because per-door `node_modules` are absent. CI installs them.
  0 individual test failures.
- The admin's door editing writes to `Commands/BBSCmd/`, which is now tracked;
  a repo-side change to an existing icon will NOT overwrite a sysop's edit,
  by design.
- macOS cannot reproduce the case-sensitivity class of bug; that verification
  lives in CI.
