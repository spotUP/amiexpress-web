# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-18_doorrepo-doorman-parity.md`
Nothing is mid-flight. CI green.

**Live catalog SYNCED 2026-08-18** — merged via an ATTACH staging database
(never a SQL text dump: `doc_raw` carries control bytes); live install state
preserved. Live revision `c3301-t1787029906`, 3263 DIZ / 58406 file rows.
**Method in the resume doc, section 1** — reuse it verbatim; deploys never
refresh the live catalog DB (volume-mounted). Host backup
`amiexpress.db.bak-before-catalog-fix-20260818`.

Shipped 2026-08-18 (two sessions):

- **08-18 morning**: catalog synced, DoorRepo at DOORMAN browse parity, two
  silent `lha -l` parser bugs, bsdsocket non-blocking connect, jest in CI.
  Detail: `2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`.
- **DoorRepo closes every remaining gap against DOORMAN** (afternoon):
  `list.txt` fields 7-10, author/group search, `V=Doc` gating, SHA-256
  verification, AmigaGuide rendering, `I`/`U` install/uninstall as a BBS
  command, an install index (`DoorRepo.idx`) and `S` ad-stripping. Mouse and
  owner-side curation out of scope by choice. Detail:
  `2026-08-18_doorrepo-doorman-parity.md`.
- **A door installed while the BBS runs no longer needs a restart.** A
  BBSCMD miss revalidates on the command directories' mtime (NOT an
  unconditional rescan - a miss is the common case) and a watcher refreshes
  the listing paths. Why, and why not to "simplify" it: `RULES.md` 10b.
- Bugs found by running it: `ExtractAfterDownload` never worked off Amiga;
  a 97-into-96-byte overflow in the SHA-256 message; the browser **spun
  forever at input EOF**; and **a real node eats every cursor key** until the
  door sends RAWARROW (501) - invisible to our emulator.

**Door startup was 13s of self-inflicted SQL.** The junk-count correlated
subquery added with `list.txt` fields 7-10 made SQLite rescan every is_junk
row per catalog row (13.05s on live; grouped join 0.03s). Fixed, plus a
revision-keyed cache of the rendered catalog. Live: 9.13s -> 0.12s internal,
15.7s -> 0.4s public, door cold start under 1s.

**OPEN:** `-D-CALC.LHA` fails checksum verification through the EMULATOR on
live - native build downloads it fine, server is self-consistent, same wrong
digest twice. Needs the actual bytes; see the resume doc.

**TRAP:** `Scripts/run-amiga-door.ts` runs `web/backend/dist/`, which was
four months stale. Rebuild (`cd web/backend && npm run build`) before
trusting anything it tells you.

**Repo deletion shipped** (`D` in DOORMAN's repo browser, owner mode only):
removes the catalog rows AND the archive file, permanently, no undo. Archive
file is unlinked FIRST so a failed unlink cannot leave the file for the next
re-index to resurrect. Deletion ignores `installed` on purpose - an installed
door keeps running, the repo just stops carrying it.

Next: **send DoorRepo to Phantasm.** Package is built and waiting at
`thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha` (m68k binary, C89 source,
tests, protocol contract, live captures, cover letter); only sending is left.
Ten-field `list.txt` is deployed and live (`5fbeb2d6b`); the API passed a
full readiness sweep 2026-08-18 (detail in the resume doc). **`DEBUG_68K` is
NOT set on live** - earlier handoffs said it was, and were wrong. Host disk
is at 89%.

## 2026-08-17 and earlier (archived)

Door repo API live on plain HTTP, read-only, `DOOR_REPO_ROLE=owner`; contract
`docs/DOOR-REPO-API.md`; plain HTTP depends on a host-side Caddy exemption
that deploys do NOT manage. Detail:
`2026-08-17_door-repo-api-and-doorman-filter.md`,
`2026-08-17_doorrepo-c-and-door-repo-api.md`.

Earlier (DD wave, FAME/FIM, 5D_Page, audit tiers): `2026-08-17_pre-0817-rollup.md`.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`; jest
config → JSON via tsx; emulator suites `SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`;
door runs redirect-never-pipe; Edit/Write destroys high-bit bytes — use
cp/python/sed for binaries.
Start the stack with `DOOR_REPO_ROLE=owner ./dev/scripts/start-servers.sh
--bbs-only`, BBS on :3001 (5173 is another app — leave it alone). That script
can stall for MINUTES in its repo-wide `find -delete` step; for API-only work
run `DOOR_REPO_ROLE=owner npx tsx src/index.ts` from `web/backend` instead.
`run-amiga-door.ts` needs `SKIP_DB_INIT=1` (else it hangs silently) and reads
`web/backend/dist/` - rebuild it first.
`grep` here is **ugrep** — use `LC_ALL=C grep -a` on emulator logs and Amiga
headers or it returns false negatives on high-bit bytes.
The full jest suite does **not** OOM (268 suites / 5090 tests, ~60s) — run it
WITHOUT `SKIP_DB_INIT`, which manufactures ~344 failures when applied to
everything. Only ever run one heavy thing at a time: concurrent jest or
emulator runs starve `deasync` and produce phantom failures.

Older: DOORMAN v2, dist/ enforcement, CONFTOP → `thoughts/shared/handoffs/`.
