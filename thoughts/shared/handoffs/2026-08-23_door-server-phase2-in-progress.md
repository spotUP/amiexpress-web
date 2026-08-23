---
date: 2026-08-23
topic: Phase 2 of the door server split - half built on a branch, nothing deployed
tags: [handoff, door-repo, doorserver, phase2, proxy, door_installs, in-progress]
status: draft
---

# Session handoff - 2026-08-23 (evening) - phase 2, paused mid-flight

Phase 1 shipped and is PUBLIC: `https://doors.uprough.net/api/door-repo/` serves
the real 3300-door catalog from its own repo, database and container. See
`2026-08-23_door-server-split-phase1.md`.

Phase 2 turns the BBS into a client of it. **It is half done, on the unmerged
branch `phase2-door-proxy`, and NOTHING is deployed.** The live BBS still serves
its own catalog exactly as it did this morning. Pausing here costs nothing.

## HOW TO RESUME

1. `git checkout phase2-door-proxy` in amiexpress-web. The plan is
   `docs/superpowers/plans/2026-08-23-door-server-phase2.md`; the spec it argues
   from is `docs/superpowers/specs/2026-08-23-door-server-split-design.md`.
2. The controller ledger with every ruling made so far is
   `.superpowers/sdd/2026-08-23-door-server-phase2/progress.md` (git-ignored).
   Tasks with a `complete` line are done; resume at the first without one.
3. Re-read the plan's Global Constraints before touching anything. The two that
   matter most: this repo IS the live BBS and a push to main deploys it, and the
   working tree permanently carries runtime noise (`Conf.DB`,
   `web/backend/debug-display-flow.log`) that must never be committed.

## Done on the branch (each reviewed, fix rounds where needed)

- **Task 1** `door_installs` table + repository. Records what THIS node
  installed, including the display metadata BBSApi overlays (`description`,
  `category`, `version`, `release_group`) - the shared catalog is no longer
  local to read them from.
- **Task 2** backfill from the catalog's `installed = 1` rows. Took three fix
  rounds and taught us something: the live catalog has **79 rows marked
  installed but only 51 distinct commands**. `Z` is claimed by nine archives,
  `SENT` by six, and some are DIFFERENT doors sharing a command name. The BBS
  never cleared the flag when a command was re-used. The backfill now NAMES
  every contested command rather than silently picking one.
- **Task 3** the proxy. `/api/door-repo/*` forwards to `DOOR_SERVER_URL`; the
  sqlite handlers are deleted, not kept as a fallback. Two suites that tested
  the old behaviour were rewired rather than skipped - the DOORMAN E2E now runs
  through the proxy at a stub upstream, which is better coverage than it had.
- **Task 4** `BBSApi` reads `door_installs`. The overlay was extracted into
  `applyInstallMetadata()` so the five user-visible fields are finally covered
  by tests instead of inspection.

## Left to do

- **Task 5** DOORMAN records installs locally. Three things are already
  pre-audited into its brief: it must reach the repository through a
  `require.cache` scan (it cannot import backend paths), my snippet's
  `manifestRevision` does not exist, and there is a collision guard that must
  survive or one door can take over another's command name.
- **Task 6** vendor the contract mirror. Rehearsed: the mirror is already
  field-identical to the door server's contract, so this is a regeneration plus
  a staleness test.
- **Task 7** deploy. Needs a shared docker network first: the BBS container
  CANNOT reach the door server on `127.0.0.1:3010` (that is the container
  itself, and the two sit on separate bridges). Both compose files join an
  external `doorserver-net` and the URL becomes `http://doorserver:3010`.
- **Task 8** drop the BBS's catalog tables. GATED on explicit approval and a
  backup. Its first step removes the `CREATE TABLE IF NOT EXISTS` statements at
  `database.ts:1732` and `:1763` plus the column migration at `:786-800` -
  without that the tables silently come back on the next boot.

## Queued behind phase 2 (real users waiting)

- **Phantasm** built `https://scenewall.bbs.io/doors.htm` with the entire 2.75 MB
  manifest PASTED INTO THE HTML (revision `c3300-t1787029906`, generated
  2026-08-19) because CORS looked broken to him during the duplicated-CORP
  window. **CORS on bbs.uprough.net has worked since 2026-08-19 - he only needs
  to retest.** The door server itself has NO CORS headers; that plus
  `?limit=`/`?offset=` paging is specified and ready to dispatch.
- **Patrik (UHC)** wants the doors in his Amiga package manager. Needs a TSV
  index (tab-separated, ISO-8859-1, **LF**, `Filename` + `Path` first), plain
  `http://` access (currently 308-redirects to HTTPS), and a sibling `.diz` at
  the archive's own path. The System column he asked for is already in the data:
  the corpus is organised AmiExpress / CNet / DayDream / FAME / S!X.

## Also open, unrelated to the split

**The ARexx engine hangs on a real door script.** `ACC-V103` installs and routes
correctly, then the interpreter spins at 100% CPU with no log output. Measured:
looping, not blocked, and only a container restart clears it. Reproduce OFF the
BBS - it takes a whole core with it. Details in `handoff.md`.
