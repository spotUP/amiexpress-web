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

**Door server: live, public, current.** `https://doors.uprough.net/api/door-repo/`
(`github.com/spotUP/amiexpress-doorserver`), live SHA `78bfe26`, verified in
the container. `index.tsv`, `.diz` siblings, `/archive/<system>/<file>` and
CORS all deployed; deploy workflow green with its secrets in place.

- `src/describe.ts` is the description classifier, ported from
  `dev/scripts/door-index/description_rules.py` and **verified equal to it row
  for row across all 3301 rows and seven fields**. Change a rule in one,
  change it in both, and run BOTH suites (`tests/describe.test.ts`,
  `dev/scripts/door-index/test_description_rules.py`).
- `door_catalog.requires_bbs` is live and backfilled (410 of 3300 doors name a
  BBS version). Migrations run at startup from `src/migrations.ts`.
- `list.txt` still serves the RAW `description` column (box art included): its
  bytes are a parity contract with the AmigaDOS clients. Only `index.tsv` is
  classified. Changing that is a decision, not a bug.
- **The site and its admin console are live**: `https://doors.uprough.net`
  serves a React/Radix UI from the door server's own Express (same origin, no
  CORS). Public: search, filter, sort, read a FILE_ID.DIZ verbatim, download.
  Signed in: edit every field, revert one field, re-read from the DIZ, audit
  trail. Login is `spot`; the password and JWT secret are in
  `/app/doorserver/.env` on the host (600, not in the repo). An edit lands in
  `door_catalog_overrides` and shows up in index.tsv, list.txt and the
  manifest at once; the catalog revision carries the edit stamp so caches
  cannot serve stale bytes.
- Plan: `thoughts/shared/plans/2026-08-23-door-repo-admin-and-public-browser.md`.
  Phases 0-6 done and deployed. **Phase 7, anonymous submissions with an
  approval queue, is the only one left** (tables already exist). Phase 2 of
  the older split plan (the BBS proxying to the door server) is unstarted, on
  branch `phase2-door-proxy`.
- Rotating the admin password means editing `.env` AND deleting the
  `admin_users` row - bootstrap never overwrites an existing account. A
  change-password endpoint does not exist yet.

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
