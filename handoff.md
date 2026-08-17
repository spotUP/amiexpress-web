# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-17_bsdsocket-reachability.md`
(previous: `thoughts/shared/handoffs/2026-08-17_doorrepo-c-and-door-repo-api.md`)
Nothing is mid-flight, everything pushed.

Shipped this session: the central door-repo **API is live** at
`http://bbs.uprough.net/api/door-repo/` (plain HTTP for classic Amiga stacks;
router gated on `DOOR_REPO_ROLE=owner`, which lives in the host's `.env` and
must NEVER go in the compose `environment:` block); **DoorRepo**, a complete
reference door in C89 for real 68K AmiExpress (`examples/doorrepo-c/`, 336
tests, links a real AmigaOS binary, and **ran end-to-end inside our own
emulator** against the live API with MD5 verification); and a **real emulator
fix** — `bsdsocket` allocated socket descriptors at 100 while AmiTCP's
`WaitSelect` fd_set is a 32-bit mask, so every network door using the standard
`1L << s` idiom hung forever. Four distinct vulnerability classes were found
and closed in the C door by adversarial review; see the resume doc.

Both bsdsocket follow-ups from that doc are DONE (`24028ea09`) and, unlike
their first pass, **proven reachable by running the real m68k binary**:
`getdtablesize()` returns the real ceiling (32, not a hardcoded 256) and
`ECONNREFUSED`/`ETIMEDOUT` carry the classic BSD/AmigaOS 61/60 (not the Linux
111/110), read from the vendored Roadshow NDK header. DoorRepo was extended to
use both (`805c1aa9b`) and the emulator log shows `getdtablesize() - returning
32` firing between `Created socket fd=0` and `connect()`; against a closed port
the door prints `(netio: connect() refused)`, and reverting the emulator errno
to 111 degrades that same run to `(netio: connect() failed)` — the control that
makes the first result mean something. A third emulator bug fell out of setting
that up: `gethostbyname()` used `dns.resolve4()`, so dotted-quad literals and
`localhost` both failed where a real Amiga resolves them; now `dns.lookup()`
(`3e05f5de9`). 8 regression tests, every one verified failing pre-fix.

Also done: the emulator now honours `IoctlSocket(FIONBIO)` and implements the
standard AmigaOS non-blocking connect (`-1/EINPROGRESS` → `WaitSelect` →
`getsockopt(SO_ERROR)`), which previously blocked for up to 30s regardless of
the door's own timeout; `getsockopt` was a stub that wrote nothing. Proven
with the real m68k binary against both the live API and a closed port
(`f0ea7318d`, `244d60d97`).

**CI now runs jest** (`.github/workflows/backend-tests.yml`, `63ed5d9e1`) —
type-check plus the full suite, and a second job for the DoorRepo C suite.
Nothing ran jest before; `door-ci.yml.disabled` runs `npm run door:ci`, not
the suite, so re-enabling it would not have helped.

Next: **send DoorRepo to the AmiExpress author** (`examples/doorrepo-c/README.md`
is written for him, `docs/DOOR-REPO-API.md` is the contract). Still open for
you: `DEBUG_68K=1` is ON in the live compose file.

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
binaries/corpus.json; deploys never refresh live Doors/ volume.
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

