# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`
Nothing is mid-flight, everything pushed. CI green, deploy green.

**Live catalog SYNCED 2026-08-18 06:55 UTC** — the 08-18 parser fixes had
shipped as code but not as data. Merged via an ATTACH staging database (never a
SQL text dump: `doc_raw` carries control bytes); live install state preserved,
everything else replaced. Live is now revision `c3301-t1787029906`, 3263 DIZ /
58406 file rows, `TELSER40.LHA` 50 members (11 before the fix). Host backup
`/app/data/db/amiexpress.db.bak-before-catalog-fix-20260818`. **Exact method in
the resume doc, section 1** — reuse it verbatim, deploys never refresh the live
catalog DB or the live `Doors/` volume (both volume-mounted).

Shipped 2026-08-18 (19 commits, `35a31af58..137c39ad0`):

- **DoorRepo is at DOORMAN parity** — full-screen ANSI browser, live filter,
  system-type cycling, DIZ art, archive contents with ad flags, doc viewer,
  scrollable detail pane, `*`/`[downloaded]` markers, download-with-MD5-verify.
  `Ansi=no` keeps the old line renderer.
- **Two silent catalog-indexer bugs**, both in `lha -l` parsing, never logged:
  member rows starting with a Unix permission string were discarded as rule
  lines, and file sizes were the COMPRESSION RATIO for `[generic]` rows — 83%
  of file rows had a bogus size. Parser is now
  `web/backend/src/utils/lha-list-parser.ts` with 6 tests.
- **Catalog caching was impossible** (revision was the image git SHA), so
  DoorRepo re-fetched ~580 KB every launch. Now catalog-derived; 5s cold, 3s warm.
- **Three additive endpoints** — `/diz`, `/files`, `/doc`; `/archive` no longer
  HTTP 500s on Latin-1 archive names.
- **bsdsocket**: FIONBIO honoured, non-blocking connect, `recv()` drains across
  queued chunks, `gethostbyname()` resolves literals and hosts-file names.
- **CI runs jest** (`backend-tests.yml`); its first run showed the suite had
  never run on Linux though the BBS deploys there.

Next: **send DoorRepo to the AmiExpress author** (top item for three sessions).
`DEBUG_68K=1` is still ON in the live compose file. Host root filesystem is at
91%.

## 2026-08-17 and earlier (archived)

Door repo API live on plain HTTP (`http://bbs.uprough.net/api/door-repo/...`,
read-only, gated on `DOOR_REPO_ROLE=owner`, curation stays in git; integrator
contract `docs/DOOR-REPO-API.md`; plain HTTP depends on a host-side Caddy
exemption that deploys do NOT manage). DOORMAN filter arc closed and
user-confirmed. Full detail:
`thoughts/shared/handoffs/2026-08-17_door-repo-api-and-doorman-filter.md` and
`2026-08-17_doorrepo-c-and-door-repo-api.md`.

Earlier sessions (DD wave, FAME/FIM, 5D_Page paging, WIP audit tiers) are in
`2026-08-17_pre-0817-rollup.md` with their open pending items and user manual
checks; per-topic archives `2026-08-16_dd-parallel-wave.md`,
`2026-08-14_fame-fim-shipped.md`, `2026-08-14_wip-audit-tiers-and-fame-next.md`.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`; jest
config → JSON via tsx (`ts-node` absent); emulator suites `SKIP_DB_INIT=1
SKIP_NETWORK_LISTENERS=1`; door runs redirect-never-pipe with `</dev/null`;
Edit/Write destroys high-bit bytes — cp/python/sed for binaries/corpus.json.
Start the stack with `DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh
--bbs-only`, BBS on :3001 (5173 is another app — leave it alone).
`run-amiga-door.ts` needs `SKIP_DB_INIT=1` (else it hangs silently after two
`[DoorLogger]` lines) and `DEBUG_68K=1` for `[BsdSocketLibrary]` traces.
`grep` here is **ugrep** — use `LC_ALL=C grep -a` on emulator logs and Amiga
headers or it returns false negatives on high-bit bytes.
The full jest suite does **not** OOM (268 suites / 5090 tests, ~60s) — run it
WITHOUT `SKIP_DB_INIT`, which manufactures ~344 failures when applied to
everything. Only ever run one heavy thing at a time: concurrent jest or
emulator runs starve `deasync` and produce phantom failures.

Older sessions: DOORMAN v2 + dist/ enforcement + CONFTOP root cause →
`thoughts/shared/handoffs/` (2026-08-14 archives + May rollup).
