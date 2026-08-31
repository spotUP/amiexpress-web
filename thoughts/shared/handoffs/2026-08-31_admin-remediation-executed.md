---
date: 2026-08-31
topic: Executing the admin audit remediation plan - 28 of 29 items
tags: [handoff, admin, config-app, disk-vs-db, express-e-parity, info-files]
status: final
---

# Handoff - the admin remediation, executed

## Start here

Branch `fix/admin-audit-remediation`, cut from `origin/main` at `bab20fd7c`,
eleven commits, **not pushed** (pushing auto-deploys).

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

**macOS still cannot see the case-sensitivity class.** 1.3c's fix (resolve
the path once, use the resolved path for read, backup and write) has a test
that passes here whatever the code does. It only means something in CI.

## Next steps

1. **The 64 doors.** `Commands/BBSCmd` holds 155 command icons and 64 carry
   `ACCESS=0`, with no `DRACCESS` anywhere - so this is the board's own
   state, not the admin's doing. express.e:4703 reads `ACCESS=0` as "nobody",
   `door.handler.ts:1091` reads it as "everybody". All 64 work here and would
   be dead on a real Amiga. Stripping the tooltype is what "open to everyone"
   is actually spelled as. **A decision for the sysop, not a fix.**
2. Push when the sysop says deploy. Phases 1, 2 and 3 change what is written
   to a live board's configuration files - take a copy of `/app/data/bbs`
   first.
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
