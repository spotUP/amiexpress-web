---
date: 2026-08-31
topic: Executing the admin audit remediation plan - 28 of 29 items
tags: [handoff, admin, config-app, disk-vs-db, express-e-parity, info-files]
status: final
---

# Handoff - the admin remediation, executed

## Start here

**Deployed 2026-08-31 08:50 UTC as `7d7de02b4`**, verified: `/health` reports
that revision, the container was recreated 5s before the check, the door
sync completed and the volume matches the image.

The deploy took a snapshot first - `bbs-config-20260831-084639.tar.gz`, 1816
`.info` files in 328K, under `/root/bbs-backups` on the host. That is the
rollback point for everything phases 1-3 changed about what is written to
disk.

The plan is `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`,
now `status: implemented`, with a "What was done" section at the bottom
holding the commit table, the corrections to the plan's own claims, and the
one decision left for the sysop.

## What is done

28 of 29 items. Phases 1, 2, 6, 3, 4 and 5 complete; one item in Phase 5
deliberately not done.

Every fix ships a test that was **revert-checked**: the fix taken out, the
test watched to fail, the fix restored. That step found two tests of mine
that could not fail, and both were rewritten.

| Phase | What |
|---|---|
| 1 | Ten writers stopped destroying the `.info` files they write; the mirror stopped being a source for them; the tooltype editor stopped deleting what it could not display |
| 2 | Six settings the schema silently threw away; six domains editing by a row id they were never given; Add Door; SMTP's username |
| 6 | The three guards widened, BEFORE the parity work, so the rest was checked by something |
| 3 | PASSWORD_SECURITY, node TELNET, ACS `=NO`, eighteen dead ACS flags, five wrong tooltype names, the ranges |
| 4 | Import/Export's `Bearer null`, nine dead Node Control buttons, the Operator Chat security levels, Batch Reload, three door fields with no writer |
| 5 | Error states on nine list pages, a 401 ending the session, the reset effect, thirteen dialogs onto Radix |

## Verification

- `npx tsc --noEmit` clean, `npm run typecheck:tests` clean
- backend: **6374 passing, 0 failing.** Seven suites fail to RUN in this
  worktree - `Doors/*` module resolution, because a fresh worktree has no
  per-door `node_modules`. CI installs them.
- config-app: 99 passing, `npm run build:check` clean. `npm run lint` has one
  pre-existing error in `tailwind-tokens.test.ts`, confirmed present with all
  of this work stashed.

## Learnings

**A plausible mechanical improvement can be worse than the thing it fixes.**
5.3 asked for `useMemo` on nine pages' `columns`. Keying DataTable's column
model on the column IDS instead looked strictly better - until the test
written for it failed: the accessors then keep the `value` function they were
built with, so a column whose accessor changes under a stable id stops
re-sorting. Reverted, and left open with the reason written down. The plan
itself calls it wasted work rather than a visible bug.

**Widening the guards first paid for itself immediately.** The key-set
comparison added in 6.1 found a real bug on its first run: a conference could
not be renamed, because `ConferenceConfigSchema` never declared `name`.

**Two tests in the tree asserted a misreading of express.e as correct**, the
same fault the previous handoff recorded. `LVL_CAPITOLS_in_FILE` was asserted
to be a real tooltype "on the strength of its odd spelling looking
deliberate". axcommon.e:53 declares it as an array index.

**`git stash` is unusable in this repo.** Six files are committed CRLF
against `eol=lf`, so `git checkout --` re-dirties them instantly and
`git stash pop` fails forever. Recovering a stash needs
`git checkout stash@{0} -- <explicit paths>`. Costed twenty minutes; recorded
in memory.

**Verifying with the same parser that made the change proves nothing.** The
door migration's first run compared PARSED tooltypes before and after, agreed
with itself, and had silently truncated 19 DESCRIPTION values - because the
parser had already dropped the bytes, so both sides read the same damage. The
byte-level check that replaced it found four separate defects in the writer
the admin uses on every door edit: non-ASCII values truncated, UTF-8 written
over Latin-1, trimmed values re-rendered lossily, and the WORD "FORM" treated
as an IFF chunk (which would have written one file out twice over). Compare
bytes, not your own representation of them.

**I guessed at a tool twice in a row, in both directions.** The backup uses
`find | tar -T -`. I wrote it without checking whether busybox tar accepts
`-` for stdin, then mid-deploy talked myself into "fixing" it to a temp file
on exactly as little evidence. The deploy settled it - 1816 files into 328K -
and the "fix" was reverted. A comment now records the evidence.

**macOS still cannot see the case-sensitivity class.** 1.3c's fix (resolve
the path once, use the resolved path for read, backup and write) has a test
that passes here whatever the code does. It only means something in CI.

## Next steps

0. **Two commits are held back deliberately.** A workflow-only change is not
   in the deploy's `paths-ignore`, so pushing one recreates the container and
   drops every connected session. `4fa07bfc2` (a comment) waits for the next
   real deploy.
1. **The doors are done.** 62 of the 63 icons that carried `ACCESS=0` no
   longer do. `GLC.info` is the exception: a real DiskObject whose tooltypes
   are stored without length prefixes, so the array cannot be located and the
   file cannot be re-serialised without guessing at its layout. The admin's
   editor refuses it for the same reason, correctly. Re-make that icon in
   Workbench/IconEdit if it matters; it is one door.
2. Done - see above. The backup is no longer a thing to remember: the deploy
   takes it.
3. After deploying, ask the sysop to walk: save a computer type, a protocol,
   a drive and a node; edit a door's `.info`; rename a conference; page the
   sysop from a non-sysop account.
4. 5.3 stays open, deliberately. See the plan.

## Other notes

- The worktree is `/private/tmp/admin-remediation-wt`. It has its own
  `node_modules` (root, sdk, backend, frontend); `SKIP_SDK_PREPARE=1` is
  needed for the sdk install, which otherwise typechecks before its own deps
  exist.
- `npm test` writes to the repo's real `Conf.DB`, `Node1/CallersLog` and
  `web/backend/debug-display-flow.log`. Never `git add -A` after a run.

---

## Open, and waiting on a decision: the volume reverts what the admin saves

Found 2026-08-31 while confirming the door-icon migration had landed. Read
from `docker-entrypoint.sh`, not observed on the board - but the code is
unambiguous.

The entrypoint classifies files. IMAGE-OWNED means "always overwrite the
volume", justified in its own comment as:

> There is no sysop/admin path that legitimately modifies these.

That is false for four of them, and for a whole directory:

| File | Written by | Class |
|---|---|---|
| `ComputerList.info` | Computers page | IMAGE-OWNED - overwritten |
| `Drives.info` | Drives page | IMAGE-OWNED - overwritten |
| `ScreenTypes.info` | Screen Types page | IMAGE-OWNED - overwritten |
| `ConfConfig.info` | conference name / location | IMAGE-OWNED - overwritten |
| `Commands/BBSCmd/*.info` | every door edit | blanket dir sync - overwritten |

`sync_image_owned` md5s both copies and overwrites on mismatch, logging it as
"hash drift". A sysop's edit IS the drift. `Node*.info` and `Conf*.info` are
correctly VOLUME-OWNED, which is why those survive.

So five of the domains this remediation fixed save correctly and are reverted
on the next container restart. That fits "we never could get it working
properly" better than anything else found today.

**Two ways to fix it.**

A. Move the four to VOLUME_OWNED_INFO and seed `Commands/` only when a file
   is missing. Small, and matches the file's own rule ("when in doubt,
   default to VOLUME-OWNED"). Costs the other direction: a repo-side fix to a
   door icon then never reaches an existing board, silently.

B. Write a manifest of what each deploy put on the volume, and next time
   overwrite only files whose volume copy still matches that hash. Untouched
   and changed in the image -> update. Edited by the sysop -> keep. New in the
   image -> create. No silent loss either way; more work in the deploy path.

**Recommended: B.** A trades a silent revert for a silent staleness, and this
entrypoint's comments record having been burned by exactly that already.

Note on sequencing: the 62-icon migration RELIED on the current overwrite to
reach the board, and did (deploy 33377282376). Whichever option is taken
should land after it, which it now can.
