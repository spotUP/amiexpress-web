# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-23_full-session-handoff.md`,
then the rest of `thoughts/shared/handoffs/` newest-first (the door-server
split, the reload signal and rexx picker, the archiver extraction, and
`2026-08-19_d-calc-download-investigation.md` for the open download bug).

**Traps and environment quickref:**
`thoughts/shared/handoffs/2026-08-23_standing-traps-and-environment.md` - read
before touching doors, deploys or the emulator.

**THREE BBS COMMITS ARE NOT PUSHED**: `5273075ed`, `614631462`, `05f82761d`.
Live BBS is `daa68714f`. A push to main deploys; after pushing CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` plus the image build time - a
green workflow has lied before).

## Current state

**Door server: fully built and live.** `https://doors.uprough.net`
(`github.com/spotUP/amiexpress-doorserver`, live SHA `aeae5ca`, verified in
the container). All 8 phases of
`thoughts/shared/plans/2026-08-23-door-repo-admin-and-public-browser.md` are
done: public browse/search/sort/download/read-DIZ with no login; a signed-in
admin console (edit any field, revert, redescribe, remove/restore a door,
audit trail); anonymous submissions with a curator approval queue, where an
uploaded LHA arrives with Name/Version/Author/Needs/Description already read
from its FILE_ID.DIZ (`src/archive-reader.ts`, the BBS's own `lha.js`). A
"Needs a name" toggle finds the ~800 doors whose name is a filename guess.

- `src/describe.ts` is the description/name classifier, verified equal row
  for row to `dev/scripts/door-index/description_rules.py` across the whole
  catalog - change a rule in one, change it in both, run both test suites.
- Edits live in `door_catalog_overrides`, never touch the scanned row, and
  reach index.tsv/list.txt/manifest at once; the catalog revision carries an
  edit/hide stamp so no cache serves stale bytes.
- Login `spot`; password + JWT secret in `/app/doorserver/.env` on the host
  (600, not in the repo). Rotating the password needs BOTH editing `.env` and
  deleting the `admin_users` row - bootstrap never overwrites an existing
  account, and there is no change-password endpoint yet.
- Phase 2 of the OLDER split plan (the BBS proxying to the door server,
  branch `phase2-door-proxy`) is a separate, still-unstarted item.

**Doors install and run on live** (ACC-V103, without reconnecting). The five
causes behind "installed but will not run", all fixed, are in the resume doc.

## Next

1. **The ARexx engine hangs on a real door script.** ACC-V103 routes
   correctly (`TYPE=AIM` -> executeARexxDoor), then the interpreter spins at
   100% CPU with no log output after `Executing AREXX script: ACCV103`.
   Measured: looping, not blocked on I/O; only a container restart clears it.
   Reproduce OFF the BBS against `services/arexx.service.ts` - it takes a
   whole core. Suspects in the script's opening: `signal on syntax/error/ioerr`,
   hex literals (`CR='0D 0A'x`), `address value "AERexxControl"node`, host
   commands `GetUser`/`sendmessage`, and `Open('Data','BBS:Node'NODE'/...','R')`.
   Installed copy: `/app/data/bbs/Doors/ACCV103/Account/AccEd.Rexx` on live.
2. **Tell Patrik and Phantasm.** Documents on the Desktop
   (`door-repo-index-for-patrik.md`, `door-repo-api-for-phantasm.md`) already
   point at `doors.uprough.net`, and everything they waited for is live - run
   `scratchpad/verify-doorserver-live.sh`, then send. Phantasm still carries a
   FROZEN 2.75 MB manifest pasted into his HTML because CORS looked broken in
   August; the duplicated CORP header that caused it is fixed. His archive is
   ready at `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`.
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
