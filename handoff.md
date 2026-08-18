# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-18_doorrepo-doorman-parity.md`
Nothing is mid-flight. CI green.

**Live catalog SYNCED 2026-08-18 06:55 UTC** — the 08-18 parser fixes had
shipped as code but not as data. Merged via an ATTACH staging database (never a
SQL text dump: `doc_raw` carries control bytes); live install state preserved,
everything else replaced. Live is now revision `c3301-t1787029906`, 3263 DIZ /
58406 file rows, `TELSER40.LHA` 50 members (11 before the fix). Host backup
`/app/data/db/amiexpress.db.bak-before-catalog-fix-20260818`. **Exact method in
the resume doc, section 1** — reuse it verbatim, deploys never refresh the live
catalog DB or the live `Doors/` volume (both volume-mounted).

Shipped 2026-08-18 (two sessions):

- **Live catalog synced** (above) and the **08-18 morning work**: DoorRepo at
  DOORMAN parity for browsing, two silent `lha -l` parser bugs fixed, three
  additive endpoints, bsdsocket non-blocking connect, CI running jest. Detail:
  `thoughts/shared/handoffs/2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`.
- **DoorRepo closes its last six gaps against DOORMAN** (afternoon):
  `list.txt` grew fields 7-10 (`author|releaseGroup|junkCount|hasDoc`, header
  stays version 1 - appending never bumps it); the door searches author and
  group so its filter finally agrees with the server's `?q=`; `V=Doc` is
  offered only when a door has documentation; downloads verify **SHA-256**
  from the `X-Archive-SHA256` header with MD5 as fallback; **AmigaGuide**
  documents render with node navigation (1-9 follow, B back) instead of raw
  markup; and `I`/`U` **install and uninstall a door as a BBS command**,
  writing a `.info` byte-identical to DOORMAN's. Mouse and owner-side
  curation deliberately out of scope. Detail:
  `thoughts/shared/handoffs/2026-08-18_doorrepo-doorman-parity.md`.
- **A door installed while the BBS runs no longer needs a restart.** On a
  real node `express.e:4630-4647` resolves every BBS command from disk per
  invocation; this server loaded them once at boot. Now a BBSCMD miss
  revalidates on the command directories' mtime (NOT an unconditional
  rescan - a miss is the common case), a watcher on `Commands/BBSCmd/`
  refreshes the listing paths, and `RULES.md` 10b records why. Also fixed a
  pre-existing race in `door-repo-routes.test.ts` that only lost under
  heavy machine load.
- Three bugs that came out of running it: `ExtractAfterDownload` never worked
  off Amiga (`lha x archive dir` treats the directory as a member filter); a
  97-into-96-byte overflow in the new SHA-256 message (AddressSanitizer); and
  the full-screen browser **spun forever at input EOF**, writing tens of GB of
  frames - now `flow_key_ends_session()`, tested.

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
--bbs-only`, BBS on :3001 (5173 is another app — leave it alone). That script
can stall for MINUTES in its repo-wide `find -delete` step; for API-only work
run `DOOR_REPO_ROLE=owner npx tsx src/index.ts` from `web/backend` instead.
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
