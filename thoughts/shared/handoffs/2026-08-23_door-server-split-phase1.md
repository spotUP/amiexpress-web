---
date: 2026-08-23
topic: The door repository is now a standalone service - phase 1 built, reviewed, migrated and deployed
tags: [handoff, door-repo, doorserver, architecture, deployment, parity, sqlite, wal]
status: final
---

# Session handoff - 2026-08-23 - the door repo became its own server

The door repository no longer has to live inside the BBS. A new repo,
**github.com/spotUP/amiexpress-doorserver** (public, 18 commits), serves the
door-repo read API from its own database and archive corpus, and it is
RUNNING on the Hetzner host at `127.0.0.1:3010`, verified byte-identical to
what the BBS serves.

Nothing has been cut over. amiexpress-web still serves its own
`/api/door-repo/*` exactly as before; the proxy, the admin API and DOORMAN's
switch are phases 2 and 3.

## HOW TO RESUME

1. The design is `docs/superpowers/specs/2026-08-23-door-server-split-design.md`;
   the phase-1 plan is `docs/superpowers/plans/2026-08-23-door-server-phase1.md`.
   Both are committed here. The spec is also copied into the new repo.
2. The new repo is cloned on the host at `/app/doorserver`, its volume is
   `doorserver-data` (`/data/doors.db` + `/data/Archives`).
3. **It is published**: `https://doors.uprough.net/api/door-repo/`. The A
   record landed 2026-08-23 and the Caddy vhost was added the same day
   (backup `/etc/caddy/Caddyfile.bak-doorserver-20260823-154935`). That block
   carries NO `header` directives on purpose - Caddy's non-deferred `header`
   is how `Cross-Origin-Resource-Policy` got duplicated on this host before.
   Verified from off-host: health reports 3300 doors, `list.txt` is md5-identical
   to the BBS's, an archive download's `x-archive-md5` matches its bytes, and
   the Latin-1 name `%24CP-BU%DF1.LZX` returns 200.
4. One thing is OPEN and needs a human: **CI secrets**. `HETZNER_HOST` and
   `HETZNER_SSH_KEY` do not exist on the new repo, so `deploy-doorserver.yml`
   fails red on every push. Either add them or switch that workflow to
   `workflow_dispatch` only.

## What phase 1 actually established

- **The read API was ported, not rewritten.** `routes.ts`, `manifest.ts`,
  `catalog.ts` and `checksums.ts` are the BBS's own modules with the config
  threaded through. Reviews verified this mechanically, symbol by symbol.
- **Byte-parity is proven, not asserted.** A harness captures real responses
  from the BBS and asserts the new server reproduces them - 28/28, including
  the deliberately preserved quirks (HEAD 404s where GET succeeds, Range is
  ignored, Latin-1 `%DF` archive names resolve). It detects a single changed
  door among 3301: mutating one row's name fails exactly four captures.
- **The migration is lossless.** sha256 over all 22 migrated columns of every
  row, and over every archive-file row, matched the source exactly.
- **One deliberate divergence**, recorded as a test rather than hidden: the
  `?q=` filter no longer searches `installed_as`, a per-node column this
  server's schema drops. `q=KICKBOX` returns one door on the BBS and none
  here, and a test pins that so phase 2 cannot close it silently.

## Two things the deployment taught, both worth keeping

**`docker cp` of a WAL-mode sqlite database is not a snapshot.** It copies the
main file and leaves the `-wal` behind, so a committed deletion can be missing.
Here the copy reported **3301** doors where the live database reports **3300** -
a phantom door that no longer exists. Use `sqlite3 <db> ".backup <out>"` inside
the container instead; it includes WAL content.

**An upsert migration does not converge.** `INSERT OR REPLACE` updates and
inserts but never deletes, so re-running over the stale seed would have kept
the phantom row. The database had to be deleted and rebuilt. This is exactly
the limitation the final review insisted be written into the script's header
comment - and it became load-bearing within the hour.

**The live catalog is not where the plan assumed.** It is
`/app/data/db/amiexpress.db` (`DATABASE_DIR=/app/data/db`), 3300 doors /
58400 file rows. The local dev copy has 3301/58406, so the committed parity
fixtures describe the local catalog. They prove the code faithful; the
deployed instance was verified against the LIVE API instead.

## Verification state

- Suite: 64 passed, 1 skipped (the parity suite self-skips without
  `PARITY_DB` and now says so loudly - a skipped parity run is not a passing
  one). `tsc --noEmit` clean.
- Deployed instance vs the live BBS: `health`, `files`, `diz`, `doc`
  byte-identical; `list.txt` byte-identical (620 KB, md5 `ccccf2c2...`);
  `manifest` identical once `generatedAt` is stripped; archive download's
  `X-Archive-MD5` matches both the bytes and the source file.
- Host: 82% disk (was 91%; a builder-cache prune reclaimed 3.99 GB without
  touching a single image). All seven pre-existing containers stayed healthy
  throughout.

## Open, in priority order

1. DNS, then the Caddy vhost (see above).
2. CI secrets, or make the deploy workflow manual.
3. **Phase 2**: the BBS proxies `/api/door-repo/*` to the door server, gains a
   `door_installs` table, and its catalog tables are dropped LAST, after a
   live confirmation.
4. Phase 3: the admin API, DOORMAN's owner mode over HTTP, and the corpus
   tooling's move.
5. Deferred minors, recorded in full in the phase-1 plan's review history: the
   `path.resolve` same-path guard (a symlink alias slips past it), the
   one-directional parity header comparison, `/health` not echoing
   `contractVersion` (impossible under phase-1 parity - it would need the
   health fixture re-captured), and `resolveArchivePath` having dropped the
   BBS's absolute-path re-rooting (0 of 3301 rows are absolute today).
