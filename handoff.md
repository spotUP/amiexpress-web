# Handoff

## READ THIS FIRST in a fresh session

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`
(`github.com/spotUP/amiexpress-doorserver`). Both are LIVE and current as of
this handoff. A push to either repo's `main` auto-deploys; after pushing,
CHECK IT (`docker exec <container> cat /app/.git-sha` plus image build time -
a green workflow has lied before).

## Current state (2026-08-24)

**Phase 2 (`phase2-door-proxy`) is MERGED to main and LIVE.** The BBS is now
a client of the standalone door server, not its own catalog owner. Plan:
`docs/superpowers/plans/2026-08-23-door-server-phase2.md`. The SDD ledger
(full detail on every task, ruling and finding) is deleted per the skill's
own finish step - the record now lives in git history and this handoff.

- `/api/door-repo/*` proxies to `DOOR_SERVER_URL` (a shared Docker network,
  `doorserver-net`, connects the two containers by service DNS - the door
  server still binds loopback-only on the host, unchanged).
- `door_installs` (not the old `door_catalog`) is now what THIS node
  installed. DOORMAN records installs there directly (no more faking
  catalog rows); BBSApi overlays it onto the doors list.
- The final whole-branch review (opus, post-deploy) found **2 Critical,
  confirmed-live regressions, both fixed same-session**: (1) `door_installs`
  had 0 rows in production - nothing in the deploy path ran the backfill;
  backed up the live DB and ran it, 36 installs recorded. (2) live `.env`
  had a stale `DOOR_REPO_ROLE=owner` from before this BBS stopped owning
  the catalog, which silently killed DOORMAN's owner-mode browse (the
  service it looked for is no longer loaded into the process); commented
  out in `.env`/`.env.local`, container recreated, verified.
- The review's 8 Important findings were fixed in the same session:
  case-insensitive `door_installs.command` lookups (AmigaDOS commands are
  case-insensitive; real data has mixed case), the proxy's upstream path
  now built as a plain string instead of `new URL()` (was re-encoding raw
  high bytes and resolving `..` segments - a real traversal risk), an
  upstream timeout + client-disconnect teardown, 405 on non-GET/HEAD
  through the proxy, a vacuous-pass bug in the contract staleness test,
  DOORMAN's install-lookup N+1 sqlite opens fixed to one query per browse,
  and a dev-only DB-path default mismatch.
- Live SHA after all of the above: `49b65a6fe` (verify before trusting this
  number - it will be stale the moment anyone pushes again).
- **Task 8** (drop the BBS's own now-legacy `door_catalog`/
  `door_catalog_files` tables) remains explicitly gated on separate human
  approval + a backup. Not done, not scheduled.

**The ARexx process-hang is FIXED and LIVE** (was: `Do Until` against a
never-opened file handle spun the interpreter in a pure-microtask loop that
starved Node's event loop completely). Byte-accurate Seek/ReadCh rewrite +
a 30s runaway watchdog. A separately-surfaced, still-open gap: AccEd.Rexx
calls its own `MsgLog` PROCEDURE via function-call syntax
(`MsgLog(args)`), and the interpreter doesn't fall back to internal-
procedure resolution before throwing `Unknown function: MSGLOG` - so
ACCV103 still won't run fully end-to-end. Separate, unscoped bug.

**Door server admin console + public browser**: fully built and live at
doors.uprough.net (all 8 phases of
`thoughts/shared/plans/2026-08-23-door-repo-admin-and-public-browser.md`).
Login `spot`; password + JWT secret in `/app/doorserver/.env` on the host.

## Next

1. **DOORMAN parity gaps** - `resolveDoorRepoMode`'s `owner` branch is now
   vestigial (nothing sets `DOOR_REPO_ROLE=owner` correctly points at
   anything since the catalog service left the require graph) - worth
   retiring or clearly re-scoping to phase 3's admin API rather than
   leaving a live env var that can silently select a dead code path again.
2. **Tell Patrik and Phantasm.** Documents on the Desktop
   (`door-repo-index-for-patrik.md`, `door-repo-api-for-phantasm.md`)
   already point at `doors.uprough.net` - run
   `scratchpad/verify-doorserver-live.sh`, then send. His archive is ready
   at `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`.
3. **The LOCATION picker's judgement.** Finding *a* program is fixed;
   picking the RIGHT one is not - `5D!DP002.LHA` got
   `LOCATION=.../HiScore`, wrong for a doorpack. New concrete repro
   (2026-08-24, live): `1OO-WALL.LHA` fails to install - the real program
   is `PFiles/1oo/Wall/1oo_Wall`, three directories deep and not named
   anything close to the command (`1OOWALL`), so the picker can't find it.
   The archive's header also trips `lha l` here ("read header (level 87)
   is unknown", though it still lists all 4 files despite the error) -
   worth checking whether that contributes to "the archiver reported an
   error" on the 68K side too, or is a red herring. Download itself is
   confirmed byte-perfect (verified: local `curl`, through-proxy `curl`,
   and the file actually written to
   `/app/data/bbs/Doors/DoorRepo/downloads/1OO-WALL.LHA` on live all match
   the manifest's md5 `f2778708ba1e183f8918c45fae04a369` exactly) - this is
   purely an extraction/LOCATION-picking bug, not a download or proxy one.
4. **Catch the download corruption.** `-D-CALC.LHA` gave the same wrong
   digest twice; `-J-LCV30.LHA` gave TWO different ones - a race, not a
   fixed transformation. `KeepFailedDownloads=yes` is live, so the next
   failure keeps `<name>.bad`; diff it against curl's bytes.
5. **Show BBS system in the main list.** (added 2026-08-24, not yet
   scoped - clarify which "main list": doors.uprough.net's browser? the
   in-BBS door catalog? confirm before implementing.)
6. **`Doors/door-manager/app.ts` is at the pre-commit hook's exact
   2000-line cap.** Any future change to this file needs a real split
   first (feature-based modules per the hook's own guidance), not another
   comment-trim.

Older sessions: `thoughts/shared/handoffs/`.
