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

- **08-18 morning**: live catalog synced (above), DoorRepo at DOORMAN parity
  for browsing, two silent `lha -l` parser bugs, three endpoints, bsdsocket
  non-blocking connect, CI running jest. Detail:
  `2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`.
- **DoorRepo closes every remaining gap against DOORMAN** (afternoon):
  `list.txt` fields 7-10 (header stays version 1 - appending never bumps it);
  filter searches author/group so it agrees with the server's `?q=`; `V=Doc`
  gated on real documentation; **SHA-256** verification from the
  `X-Archive-SHA256` header, MD5 fallback; **AmigaGuide** rendering with node
  navigation; `I`/`U` **install/uninstall as a BBS command** with a `.info`
  byte-identical to DOORMAN's; an install index (`DoorRepo.idx`) giving the
  `+` mark, header count and pre-filled uninstall; and `S` to strip ads from
  an installed door. Mouse and owner-side curation out of scope by choice.
  Detail: `2026-08-18_doorrepo-doorman-parity.md`.
- **A door installed while the BBS runs no longer needs a restart.** A
  BBSCMD miss revalidates on the command directories' mtime (NOT an
  unconditional rescan - a miss is the common case) and a watcher refreshes
  the listing paths. Why, and why not to "simplify" it: `RULES.md` 10b.
- Three bugs that came out of running it: `ExtractAfterDownload` never worked
  off Amiga (`lha x archive dir` treats the directory as a member filter); a
  97-into-96-byte overflow in the new SHA-256 message (AddressSanitizer); and
  the full-screen browser **spun forever at input EOF**, writing tens of GB of
  frames - now `flow_key_ends_session()`, tested.

Next: **send DoorRepo to Phantasm.** Package is built and waiting at
`thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha` (m68k binary, C89 source,
tests, protocol contract, live captures, cover letter); only sending is left.
Ten-field `list.txt` is deployed and live (`5fbeb2d6b`); the API passed a
full readiness sweep 2026-08-18 (detail in the resume doc). **`DEBUG_68K` is
NOT set on live** - earlier handoffs said it was, and were wrong. Host disk
is at 89%.

## 2026-08-17 and earlier (archived)

Door repo API live on plain HTTP, read-only, gated on
`DOOR_REPO_ROLE=owner`; contract `docs/DOOR-REPO-API.md`; plain HTTP depends
on a host-side Caddy exemption that deploys do NOT manage. DOORMAN filter arc
closed. Full detail:
`thoughts/shared/handoffs/2026-08-17_door-repo-api-and-doorman-filter.md` and
`2026-08-17_doorrepo-c-and-door-repo-api.md`.

Earlier sessions (DD wave, FAME/FIM, 5D_Page paging, WIP audit tiers) are in
`2026-08-17_pre-0817-rollup.md` with their open pending items and user manual
checks; per-topic archives `2026-08-16_dd-parallel-wave.md`,
`2026-08-14_fame-fim-shipped.md`, `2026-08-14_wip-audit-tiers-and-fame-next.md`.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`; jest
config → JSON via tsx; emulator suites `SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`;
door runs redirect-never-pipe; Edit/Write destroys high-bit bytes — use
cp/python/sed for binaries.
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
