---
date: 2026-08-23
topic: The forced BBSCmd reload was swallowed by the startup guard; a door whose only program is a .rexx now installs as TYPE=AIM
tags: [handoff, doorrepo-c, bbscmd, command-cache, arexx, express-e, install]
status: final
---

# Session handoff - 2026-08-23 - the reload that never happened, and the door with no binary

Continues `2026-08-20_doorrepo-archiver-extraction.md`. That session made the
archive actually unpack. With files finally landing, two further reasons an
installed door still would not run became visible - both reported by the user,
both now fixed, none of the three commits pushed yet.

## HOW TO RESUME

1. `git log --oneline origin/main..HEAD` - `5273075ed`, `614631462`,
   `05f82761d` are THIS session's fixes and are **deliberately unpushed**
   until an installed door has been seen to start.
2. Retest target: re-enter DOORREPO (`Q` out first - the door binary is read
   at LAUNCH) and install `ACC-V103.LHA`. Expect `TYPE=AIM` and
   `LOCATION=Doors:ACC/Account/AccEd.Rexx`, and the command `ACC` to run
   without reconnecting.
3. Local backend was relaunched detached at the end of the session (pid
   18787, :3001, `commandCache.bbscmd.size=154`, `[BBSCmd watcher] watching 1
   command directory`). Confirm it is still the one listening before
   believing any test result.
4. Rebuilt door binary is already in place: `Doors/DoorRepo/doorrepo.amiga`,
   md5 `81c9cadce3346e6be522f16a6ee69f3a`.

## Fix 1 - the watcher's "reload now" signal was swallowed (`5273075ed`)

Symptom, reported twice: install a door, type its command, get
`No such command!!`. Restart the BBS and the same command works.

`web/backend/src/handlers/command-execution.handler.ts` carried the forced
reload out-of-band, in the same variable that carries the freshness stamp:
`invalidateBbsCommandFreshness()` set `bbscmdDirsStamp = null`. But `null` is
also the value that means "no stamp taken yet", and
`revalidateBbsCommandsIfChanged()` treats that as the startup baseline: take
the stamp, return false, do NOT reload. So the watcher's signal reliably
produced the one behaviour it was meant to prevent.

One channel was carrying two meanings. The fix separates them:

```ts
let bbscmdForcedStale = false;
// in revalidateBbsCommandsIfChanged:
const forced = bbscmdForcedStale;
bbscmdForcedStale = false;
if (!forced && bbscmdDirsStamp === stamp) return false;
const firstCall = bbscmdDirsStamp === null;
bbscmdDirsStamp = stamp;
if (firstCall && !forced) return false;
commandCache.bbscmd.clear();
loadCommands(baseDir, conferenceId, nodeId);
return true;
```

`tests/handlers/bbscmd-freshness.test.ts`: **two existing tests had encoded
the bug as correct** and asserted the skipped reload. Both rewritten, two
added, 14/14 pass, and the new ones were run against the old code first.

## Fix 2 - the picker could not find the door's program (`614631462`, `05f82761d`)

Symptom: install `ACC-V103.LHA`, type `ACC`, get `Door executable not
found.`. The archive ships **no executable at all** - its only program is
`Account/AccEd.Rexx`. `flow_pick_door_binary()` had no rule for that, fell
through to the command name, and wrote a LOCATION for a file that does not
exist.

- **Rule 3** (`614631462`): when no binary is found, pick the largest
  `.rexx` member. `name_is_rexx()` in `flow.c`.
- **TYPE=AIM, not XIM** (`05f82761d`): my first version left the type at XIM.
  The user's correction - *"real amigas have arexx doors as well"* - is right,
  and express.e settles how they are launched:
  - `DOORTYPE_AIM` -> `REXXDOOR <node> <cmd>` (express.e:4272-4276)
  - `DOORTYPE_AEM` -> `REXXEXEC` (express.e:4298-4302)
  - `DOORTYPE_XIM` executes the LOCATION file directly (express.e:4278)
  - LOCATION is read at express.e:4751

  A `.rexx` under XIM cannot execute on a real node, so
  `flow_effective_door_type()` rewrites the type to `AIM` - and **only** when
  the catalog type is empty or XIM, so a catalog that already knows better is
  never overridden.

## Learnings worth keeping

- **Never overload one variable with a sentinel that already means something
  else.** `null` meant both "reload now" and "this is startup"; the two
  meanings cancelled. A separate boolean costs nothing.
- **A regression test can be a monument to the bug.** Two tests here passed
  happily against broken code because they asserted the broken behaviour.
  Any test for a reported symptom must be run against the OLD code first.
- **Ask what the real system does before inventing a rule.** I asserted that
  real AmiExpress routes ARexx doors by suffix under XIM. It does not - it
  has door types for exactly this. express.e is the authority and answering
  the question took one read.
- **Each fix uncovered the next.** Extraction hid the reload bug; the reload
  bug hid the picker bug. Five causes total for one symptom - the list is in
  `handoff.md`.

## Open items

1. **Still nobody has seen an installed door start.** Files land, `.info` is
   written, the command is registered - the last step is unwitnessed. Push
   the three commits after it is.
2. **The picker's judgement, not its coverage.** `5D!DP002.LHA` still gets
   `LOCATION=.../HiScore`, which for a doorpack is almost certainly wrong.
3. Unchanged from the previous handoff: live download corruption
   (`KeepFailedDownloads=yes` armed), LZX installs refuse by design,
   `HEAD`/`Range` mismatches on `/api/door-repo/archive/<name>`, DOORMAN
   parity (directory-scan shim is the keystone),
   `Doors/door-manager/app.ts` at the 2000-line ceiling, and the two flaky
   suites `config-routes` / `info-editor-routes`.

## Verification state

- C: `make -C examples/doorrepo-c test` green, `test_flow` **260 assertions**,
  new ones verified failing against the old code. `native`, `amiga`,
  `amiga-stub`, `probe-native`, `probe-amiga` all build.
- `tests/handlers/bbscmd-freshness.test.ts` 14/14.
- Door binary md5 `81c9cadce3346e6be522f16a6ee69f3a`, copied to
  `Doors/DoorRepo/doorrepo.amiga`.
- **Not verified:** an installed door actually running. That is the whole
  remaining question.
