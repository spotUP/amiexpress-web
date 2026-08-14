# Handoff

## 2026-08-14/15 (late night) — FAME (FIM) door compat SHIPPED to main

**Full archive:** `thoughts/shared/handoffs/2026-08-14_fame-fim-shipped.md`

- 9-task plan executed via subagent-driven dev, 18 commits, merged FF to main
  `8ef4ba0c2`, pushed (deploy auto-triggered ~23:30).
- New: FIM constants / FAME.library / FIMProtocol (lifecycle, output, input
  w/ line editing, info, args, NR_WaitChar), doorType FIM routing end-to-end,
  FAMEDoorPort binary detection, TestDoor.FIM + FAMEWHO.FIM in corpus
  (fametest_1 green golden; famewho_1 SMOKE-ONLY until FAMESemaphore).
- **Root emulator fix**: library-opened callback now a compose list — was
  last-writer-wins; AmigaDoorSession silently disabled LibraryManager's
  vector installs for every door. 12-door corpus slice validated, 12/12.
- Final opus review: 3 Critical + 5 Important found (header-contradicting
  Data2/Data3 fields, blocking-vs-poll semantics, NODENR loss, .fim gate,
  mode-7 echo leak, installer pick) — ALL fixed + re-reviewed. Header
  (FAMEDoorCommands.h) always won over plan text.
- Suite: zero new failures (door-logging 104 + file-flag fail identically on
  main — pre-existing; log-retention was a load flake).

**OPEN — next session / user:**
1. USER: manual sysop check — install FIM door via DOORMAN, run, exit clean.
2. Verify deploy freshness (green != fresh): /health revision = 8ef4ba0c2,
   container age, docker logs clean. Then sync NEW doors to live volume:
   `docker exec amiexpress-bbs sh -c 'cp -r /app/default-data/Doors/FAMETest
   /app/default-data/Doors/FAMEWho /app/data/bbs/Doors/'` + verify.
3. Backlog: FAMESemaphore (multi-node who-list — FAMEWHO output), DD compat
   (task #11, disassembly targets in research doc), tasks #11-14 from audit.

## 2026-08-14 (day/evening) — WIP audit tiers + corpus reds + prompt bugs

**Archive:** `thoughts/shared/handoffs/2026-08-14_wip-audit-tiers-and-fame-next.md`

- Tier 0 (29f33083b) + Tier 1 security (3dee329af: dead restricted-download
  gate fixed, conf ACL, slot alloc, honest ARexx) + Tier 2 CLOSED as
  measurement (ledger: 54 doors, 0 stub 0 missing — do NOT implement S1-S8)
  + 19 corpus reds resolved (f3a3cd9cb, mostly stale CI list; zootility
  timeout 13000). CONFTOP Y2K 2-byte patch + inline ~CC_ prompt guards +
  GWALL fail-fast all confirmed live by user.
- Standing: corpus/ledger SWEEP BANNED (one-door diagnostic only; bounded
  --only slices acceptable). handleTrap is the live sink (not
  handleTrapByOffset). tsx caches transpile output (clear /var/folders tsx-501
  when a change "doesn't apply").

Open tiers/tasks: #11 Tier 4 SQLite↔disk parity, #12 CONFTOP weekly-reset
mail write, #13 Tier 1 leftovers (legacy import, SDK arexx WAITINPUT,
area-based access), #5 mgs__r11_autoreward, #14 ledger policy cleanup.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`;
jest config → JSON via tsx (`ts-node` absent); emulator suites
`SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`; door runs redirect-never-pipe with
`</dev/null`; Edit/Write destroys high-bit bytes — cp/python/sed for
binaries/corpus.json; deploys never refresh live Doors/ volume.

Older sessions: DOORMAN v2 + dist/ enforcement + CONFTOP root-cause detail →
`thoughts/shared/handoffs/` (2026-08-14 archives + May rollup).
