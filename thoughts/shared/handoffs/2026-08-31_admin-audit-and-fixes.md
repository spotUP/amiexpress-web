---
date: 2026-08-31
topic: A day on the admin app - fifteen fixes, then a six-agent audit that found far more
tags: [handoff, admin, config-app, disk-vs-db, express-e-parity, ci]
status: final
---

# Handoff - the admin app, 2026-08-31

## Start here

**The plan is `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`.**
It holds everything still to do, in severity order, with the express.e line
numbers that settle each claim. Read its "Rules for this work" section before
touching anything - findings are marked VERIFIED or REPORTED, and the
REPORTED ones are leads, not facts.

## What this day was

The sysop said the admin "always was in a shitty state, we never could get it
working properly so I gave up on it for some months but I thought we'd finish
it now". That framing turned out to be diagnostic. Nearly every fault found
today is **one bug**:

> The writer and the reader disagree. The admin serves a value its own schema
> rejects, or writes one store while something reads another, or writes a
> tooltype name AmiExpress does not read.

It is silent by construction - both halves work, on data that never meets. The
page looks right, the toast says saved, the board does not change. That is why
fixing one page never made the next one work.

## Shipped and live

Sixteen commits, all deployed and verified against `/app/.git-sha` on the
container except the last (see Next Steps).

| Commit | What |
|---|---|
| `40bb835d1` | 17 System Configuration fields could not be saved - zod stripped 14, no tooltype for them either |
| `6bb0ec9ba` | `VITE_BYPASS_AUTH` removed |
| `4b095f9ed` | Door Enabled writes what DOORREPO reads (ACCESS + DRACCESS) |
| `abfe66606` | **Deleting a door could remove a different door** - the list's positional id was read as a database row id |
| `3cc631886` | Five pages onto the shared `DataTable`; Protocols was sorting the query cache in place |
| `7ce1b9002` | Configuration Files is one tree, not four tabs |
| `a90c40722` | Realtime layer put under busy-board load |
| `d905f9ba0` | A flag could not be switched off on a board with no icon |
| `32f329389` | **Nine runtime consumers read config from the database while the admin writes disk** |
| `2a3e97338` | **No System Configuration save could succeed** - six password-*policy* settings were classed as secrets |
| `acd1b508f` | Configuration Files had never shown a file; conference health check demanded three directories AmiExpress has never had |
| `561dd1cab` | …and then crashed on the first file it was ever sent |
| `817bad77f` | Round-trip contract sweep, nine domains - found three more range bugs on its first run |
| `760b16638` | Users and Access Levels contract tests |
| `80cc21e57` | CI: the clean script deleted committed sources; CI under-installed door deps |
| `150caf151` | The archiver looked for the archive in the wrong case (Linux only) |
| `2b65f8455` | **`ACCESS=0` denies a door to everyone** - see Learnings |

Also fixed on the live board by the sysop, from a command I could not run
(the sandbox blocks `rm` over ssh): `Bulletins` was an empty *file* in eight
conferences where `express.e:24648` needs a directory, so those conferences
had never been able to show a bulletin. All nine now correct.

## Learnings

**`ACCESS=0` is the opposite of what it looks like.** `express.e:4703` is
`IF access=0 THEN RETURN TRUE`, and `TRUE` is `RESULT_NOT_ALLOWED`
(`axenums.e:23`). `readToolTypeInt` answers `-1` for an *absent* tooltype
(`tooltypes.e:176-180`), which is never above a caller's level. So **absence
means everyone may run the door; 0 means nobody may.** Yesterday's door work
had the premise right in a comment and the conclusion backwards, and shipped
two live faults: re-enabling a door that had no ACCESS locked it forever, and
creating a door without a level made it unrunnable. Parking a disabled door at
255 was also wrong - the test is `access > acsLevel`, so a 255 sysop passes.

**Two tests written yesterday asserted that bug as correct behaviour.** They
passed all day. A green test that encodes a misreading of the source is worse
than no test; both now carry the express.e line that settles it.

**A mock can hide the bug its test exists to catch.** The first realtime test
passed with the fix reverted, because the mock returned a fresh `showWarning`
each render - making the dependency unstable and re-running the effect by
accident. The real one is a `useCallback`. Always revert-check.

**`npm test` passing is not the typecheck passing.** Jest uses swc and strips
types; a test file can be green under jest and fail
`npm run typecheck:tests`. That is how a type error reached CI today.

**Fix the gate before chasing what it hides.** CI had been red on `main` for
at least eight runs, so "never push broken code" proved nothing. It was
failing at "Type-check tests", *before* jest - which meant the archiver
failures underneath were invisible. Fixing the typecheck let CI print the real
reason for the archiver bug in one run.

**macOS cannot reproduce a case-sensitivity bug.** The archiver passed 10/10
locally and failed every time on Linux. The emulator's own `amigafs` resolves
case; the extractor's plain `fs` does not. Verification for that class lives
in CI and nowhere else.

**Read the mutation path.** The admin route writes the `.info` directly; the
service's writer is only the database mirror. A fix put in the service alone
would have done nothing.

## The audit

Six agents, on 2026-08-31: API wiring, disk-vs-database, form fields, UI
correctness, routes and realtime, and parity against `AmiExpress-Sources/`.
Their findings are consolidated into the plan. Headlines, none of them fixed
yet:

- **`InfoFileParser.write()` does not produce a valid Amiga icon** - 256 zero
  bytes plus raw `KEY=VALUE` strings, no DiskObject. Ten call sites. Saving
  computers, protocols, screen types, drives, nodes, file checkers, languages
  or conferences writes a file AmiExpress cannot read and destroys the icon.
  **Verified by hand.**
- The database mirror is unioned into disk on every lookup-table save,
  appending phantom entries.
- The tooltype editor's GET parser is blinder than its PUT writer, so a save
  deletes what it could not display.
- `PASSWORD_SECURITY` offers four values express.e does not accept; all four
  fall through to weak LEGACY hashing.
- Node `TELNET` is inverted - saving a node with telnet enabled removes its
  `TELNET` tooltype.
- Import/Export reads `localStorage.getItem('token')`; the JWT is `authToken`.
  Every request 401s.
- Eighteen pages render "nothing configured" when a request fails, so an
  expired session looks like an empty BBS.

**The contract tests cannot see the primary bug class.** `safeParse` on a
single unknown key *succeeds*, because zod strips. Phase 6 of the plan widens
the guards, and should be done before the rest so the remaining fixes are
checked by something.

## Critical references

- Plan: `thoughts/shared/plans/2026-08-31-admin-audit-remediation.md`
- Today's queue, all five items closed:
  `thoughts/shared/todos/2026-08-31_admin-queue.md`
- Authority for anything the BBS reads: `AmiExpress-Sources/express.e`, plus
  `axcommon.e`, `ACP.e`, `tooltypes.e`, `axenums.e`, `axobjects.e`
- The one disk-first config accessor: `getBoardConfig()` in
  `web/backend/src/services/bbs-config-file.service.ts`
- Guards worth knowing: `tests/services/config-read-source.test.ts`,
  `config-round-trip-contract.test.ts`,
  `system-config-field-coverage.test.ts`, `users-acs-write-contract.test.ts`

## Next steps

1. **Confirm `2b65f8455` is deployed.** The full suite was still running when
   this was written; it was committed but not pushed. Nothing else is
   outstanding locally.
2. Work the plan from Phase 1.
3. Ask the sysop to re-test the door Enabled toggle after that deploy - any
   door disabled and re-enabled between yesterday's deploy and this fix may be
   sitting at `ACCESS=0` and unrunnable. Worth grepping
   `Commands/BBSCmd/*.info` on live for `ACCESS=0` and for a stale
   `DRACCESS=0`.

## Other notes

- `main` moved constantly today - other sessions pushed super-qix, arcade and
  door work, and at one point merged `feat/installed-door-link` wholesale.
  Always cut a deploy worktree from a fresh `origin/main` and confirm
  ancestry before pushing *and* before deleting the branch. I deleted one
  before confirming its push had landed; nothing was lost, but the check now
  runs both times.
- The local checkout sits on `feat/installed-door-link`, which carries another
  agent's Phase A door work. Admin commits were cherry-picked onto `main`
  individually rather than merging the branch.
- `/private/tmp/qix2-wt`, a super-qix worktree, vanished from disk during the
  day. Not mine - `git fsck` shows no orphaned super-qix work newer than
  `main`, and the sysop's uncommitted super-qix files are intact.
- The sandbox blocks `rm` over ssh to the live host. Anything destructive on
  the board needs the sysop to run it; give them the exact command.
