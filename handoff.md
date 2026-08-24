# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:**
`thoughts/shared/handoffs/2026-08-24_doorserver-admin-live-arexx-hang-fixed-phase2-resume-authorized.md`
(doorserver admin console shipped/live, the ARexx process-hang root-caused
and fixed on its own branch, phase2-door-proxy scoped with resume
AUTHORIZED through Task 7). Then `2026-08-23_full-session-handoff.md` and
the rest of `thoughts/shared/handoffs/` newest-first.

**Traps and environment quickref:**
`thoughts/shared/handoffs/2026-08-23_standing-traps-and-environment.md` - read
before touching doors, deploys or the emulator.

**THREE BBS COMMITS ARE NOT PUSHED**: `5273075ed`, `614631462`, `05f82761d`.
Live BBS is `daa68714f`. A push to main deploys; after pushing CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` plus the image build time - a
green workflow has lied before).

## Current state

**Door server: fully built and live.** `https://doors.uprough.net`
(`github.com/spotUP/amiexpress-doorserver`, live SHA `aeae5ca`). All 8 phases
of `thoughts/shared/plans/2026-08-23-door-repo-admin-and-public-browser.md`
done: public browse/search/sort/download/read-DIZ, no login; signed-in admin
console (edit/revert/redescribe/remove-restore, audit trail); anonymous
submissions with a curator queue - an uploaded LHA arrives with
Name/Version/Author/Needs/Description already read from its FILE_ID.DIZ.
Login `spot`; password + JWT secret in `/app/doorserver/.env` on the host
(600, not in the repo; rotating needs BOTH editing `.env` AND deleting the
`admin_users` row).

**The ARexx process-hang is FIXED, on branch `fix/arexx-runaway-hang`
(off main, 2 commits, NOT merged/pushed).** Root cause: `Do Until` against a
file handle that never opened spun the interpreter in a pure-microtask loop
that starves Node's event loop COMPLETELY - not just the script, the whole
process (proved: a diagnostic timer never fired once in 4s). Fixed with a
byte-accurate Seek/ReadCh rewrite (was line-accurate - wrong unit for the
binary fixed-record files these doors use) plus a 30s runaway watchdog that
periodically yields a real macrotask and then aborts through the same flags
Ctrl+C uses. Also found+fixed a second hang in the same investigation: none
of `executeDo`'s loop variants checked for a pending SIGNAL. Full backend
suite: 5216 passed, 0 failed. Push/merge is your call (deploys the live BBS).
Full detail + the (separate, unfixed) MSGLOG gap it surfaced: see resume doc.

**`phase2-door-proxy` (28 commits, unmerged, nothing deployed) is scoped and
resume is AUTHORIZED through Task 7** (you chose this when asked). Tasks 1-4
done+reviewed; Task 5 (DOORMAN local installs) was dispatched but never
completed; Task 6 (contract mirror) rehearsed, low-risk; Task 7 (deploy)
needs a shared Docker network across two repos on the live host - measured
and ruled already, don't re-derive. Task 8 (drop the BBS's own catalog
tables) stays separately gated on your explicit approval regardless. Resume
via `superpowers:subagent-driven-development` in a FRESH session - see the
resume doc for the exact traps to carry into the Task 5/7 dispatches, and
read `.superpowers/sdd/2026-08-23-door-server-phase2/progress.md` first.

**Doors install and run on live** (ACC-V103, without reconnecting). The five
causes behind "installed but will not run", all fixed, are in the older
resume docs.

## Next

1. Decide: push/merge `fix/arexx-runaway-hang`? Then resume phase2-door-proxy
   (fresh session, SDD skill, Task 5 onward) - both ready to go.
2. **Tell Patrik and Phantasm.** Documents on the Desktop
   (`door-repo-index-for-patrik.md`, `door-repo-api-for-phantasm.md`) already
   point at `doors.uprough.net`, everything they waited for is live - run
   `scratchpad/verify-doorserver-live.sh`, then send. His archive is ready at
   `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`.
3. **The LOCATION picker's judgement.** Finding *a* program is fixed; picking
   the RIGHT one is not - `5D!DP002.LHA` got `LOCATION=.../HiScore`, wrong for
   a doorpack.
4. **Catch the download corruption.** `-D-CALC.LHA` gave the same wrong digest
   twice; `-J-LCV30.LHA` gave TWO different ones - a race, not a fixed
   transformation. `KeepFailedDownloads=yes` is live, so the next failure
   keeps `<name>.bad`; diff it against curl's bytes.
5. **DOORMAN parity** - gap list in the 2026-08-19 resume doc. Keystone:
   DoorRepo has no installed-doors list; a `dirscan_amiga.c` /
   `dirscan_native.c` shim unblocks seven features at once.

Older sessions: `thoughts/shared/handoffs/`.
