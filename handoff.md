# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`
Nothing is mid-flight, everything pushed (`137c39ad0`). CI green, deploy green.

**READ THIS FIRST — the live catalog is STALE.** This session's code shipped;
its DATA did not. Live serves the pre-fix catalog: `/diz/$CP-PS12.LZX` 404s and
`/files/!ALSTER.LHA` reports `61|0|Children` where the real size is 40092. The
live container reads a VOLUME-MOUNTED database, so a deploy does not replace
it. Sync it with an ATTACH staging database — never a SQL text dump, `doc_raw`
carries control bytes. Full detail in the resume doc, section 1.

Shipped 2026-08-18 (19 commits, `35a31af58..137c39ad0`):

- **DoorRepo is at DOORMAN parity** — full-screen ANSI browser, live
  client-side filter, system-type cycling, DIZ art, archive contents with ad
  flags, doc viewer, scrollable detail pane, `*`/`[downloaded]` markers,
  download-with-MD5-verify from the browser. `Ansi=no` keeps the old line
  renderer.
- **Two silent catalog-indexer bugs**, both in `lha -l` parsing and neither
  ever logged: member rows starting with a Unix permission string were
  discarded as rule lines (`TELSER40.LHA` parsed 11 of 59 members), and file
  sizes were the COMPRESSION RATIO for `[generic]`-style rows — **83% of file
  rows had a bogus size**, `.exe` files recorded as 1 byte. Parser moved to
  `web/backend/src/utils/lha-list-parser.ts` with 6 tests.
- **Catalog caching was impossible**, which is why the door was slow to start:
  the revision was the image git SHA, absent in dev (`"unknown"`, which a
  correct client must refuse) and changing on every deploy on live. Now
  catalog-derived. First render 5s cold, 3s warm.
- **Three additive endpoints** — `/diz`, `/files`, `/doc` — and `/archive` no
  longer HTTP 500s on Latin-1 archive names (a bug that predated `/diz`).
- **bsdsocket**: FIONBIO honoured, non-blocking connect, `recv()` drains across
  queued chunks, `gethostbyname()` resolves literals and hosts-file names.
- **CI runs jest** (`backend-tests.yml`). Its first run revealed the suite had
  never run on Linux though the BBS deploys there; `netio.c`'s POSIX branch did
  not compile on glibc at all.

Next: sync the live catalog, then **send DoorRepo to the AmiExpress author**
(top item for three sessions now). `DEBUG_68K=1` is still ON in the live
compose file. Three `database.sqlite.bak-*` safety backups (~120 MB) are
untracked and can be deleted once you are satisfied.

## 2026-08-17 — DOOR REPO API LIVE + DOORMAN filter arc closed (user-confirmed)

**Central door repo API is live and verified on plain HTTP** (classic Amiga
stacks need no TLS): `http://bbs.uprough.net/api/door-repo/{manifest,
list.txt,archive/<name>,health}`. Read-only, no auth; curation stays in git.
Public integrator reference: `docs/DOOR-REPO-API.md` (byte-exact list.txt
spec, real captured examples, archive-name quoting, append-only versioning
promise) — written for the original 68K AmiExpress author, who is
implementing a client. Design + plan:
`thoughts/shared/plans/2026-08-17-door-repo-central-api-design.md` and
`...-door-repo-api.md`; SDD ledger `.superpowers/sdd/2026-08-17-door-repo-api/`.
Plain-HTTP works because of a host-side Caddy exemption applied 2026-08-17
(`/etc/caddy/Caddyfile`, backup `.bak-doorrepo-20260817-102750`) — deploys do
NOT manage that file.

Done + reviewed: checksum cache, manifest builder + latin1-safe list.txt,
Express router (fd-pinned streaming, RFC-7232 conditional GET, count-only
health), integrator docs, Caddy exemption, DOORMAN repo-client with
ETag cache + sha256 verification and a generated-type staleness guard,
consumer-mode browsing (OFFLINE banner), consumer install (download →
verify → existing extract flow → local catalog upsert, `source='door-repo'`),
consumer curation gating, and a no-mocks E2E. All pushed. One finding worth
remembering: Node undici always sends `Cache-Control: no-cache` when
`If-None-Match` is present, so the 304 path never fired for a real client —
found only because the E2E test refused to mock fetch.

**DOORMAN filter arc CLOSED, user-confirmed on live 2026-08-17.** Six rounds:
f-leak → synchronous one-shot guards → KeyBinder return propagation (Tab) →
filterBox made display-only (SDK Textbox self-edits on any focus; one mouse
click enabled a parallel editor) → SDK parser buffering split CSI/SS3
sequences (a chunk-split arrow key was misparsed as Escape and popped the
view, losing the filter) → ESC-timeout reentrancy (double-fire could empty
the view stack = frozen door). Standing gotcha: the pre-commit hook rebuilds
a door's whole `dist/` from disk, so never run two tasks touching the same
`Doors/<door>/` concurrently in one worktree.

Also live: catalog re-typed + DayDream archives indexed (DD 10 / SIM 14 /
FIM 67 / XIM 3201, 3301 total) so DOORMAN's system filter shows a real DD
bucket; live DB merged via ATTACH staging (never text-dump SQL — doc_raw
carries control bytes), backup `amiexpress.db.bak-catalog-delta`.

## Earlier sessions (archived)

- 2026-08-16 night — DD (DayDream) wave T1-T8 + review + fix wave, shipped
- 2026-08-15/16 — FAME 5D_Page shakedown, full paging pipeline live
- 2026-08-14/15 — FAME (FIM) door compat shipped to main
- 2026-08-14 — WIP audit tiers, corpus reds, prompt bugs

All four sections moved verbatim to
`thoughts/shared/handoffs/2026-08-17_pre-0817-rollup.md` (open pending items,
user manual checks and ledger pointers live there). Fuller per-topic archives:
`2026-08-16_dd-parallel-wave.md`, `2026-08-14_fame-fim-shipped.md`,
`2026-08-14_wip-audit-tiers-and-fame-next.md`.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`;
jest config → JSON via tsx (`ts-node` absent); emulator suites
`SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`; door runs redirect-never-pipe with
`</dev/null`; Edit/Write destroys high-bit bytes — cp/python/sed for
binaries/corpus.json; deploys never refresh live Doors/ volume NOR the live
catalog database (both are volume-mounted).
The door-repo router 404s every route unless `DOOR_REPO_ROLE=owner` is set:
`DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh --bbs-only`, BBS on :3001.
`run-amiga-door.ts` needs `SKIP_DB_INIT=1` (else it hangs silently after two
`[DoorLogger]` lines) and `DEBUG_68K=1` to show `[BsdSocketLibrary]` traces.
`grep` here is **ugrep** — use `LC_ALL=C grep -a` on emulator logs and Amiga
headers or it returns false negatives on high-bit bytes.
The full jest suite does **not** OOM (268 suites / 5090 tests, ~60s) — but run
it WITHOUT `SKIP_DB_INIT`, which is for targeted emulator suites only and
manufactures ~344 failures when applied to everything. Only ever run one suite
at a time: concurrent runs starve `deasync` and produce phantom failures.

Older sessions: DOORMAN v2 + dist/ enforcement + CONFTOP root-cause detail →
`thoughts/shared/handoffs/` (2026-08-14 archives + May rollup).

