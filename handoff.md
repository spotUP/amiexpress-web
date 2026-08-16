# Handoff

## 2026-08-16 (night) — DD WAVE SHIPPED: T1-T8 + final review + fix wave, pushed

Ledger = `.superpowers/sdd/2026-08-15-daydream-dd-compat/progress.md` (every
ruling, verdict, deferred minor). **DD SDD T1-T8 COMPLETE + final
whole-branch review (opus) + fix wave, all re-reviewed clean, pushed through
cc7bf852d.** Side-tasks #14 fingerprint-match, #16 Strip port, #18 sysop
page-wait all DONE + reviewed. Final review's Critical: DD input was wired
to `door:input`, which the browser never emits — corpus was green on a
production-dead path; live DD doors would hang 300s at first Prompt. Fix
wave (2aa88dc96..cc7bf852d): door-input routing collapsed into ONE shared
`routeAmigaDoorInput` (root cause of this + the 2026-08-15 FIM incident),
`DreamDoorLibrary.isActive()` gating (type-ahead reachable), Prompt reads
A0 buffer per spec with A1 legacy fallback (Xim.s confirms A1 = register
residue; old garbled golden explained, recaptured), post-door page-wait no
longer repaints menu over an accepted chat, typed chat imports, corpus
`--command-channel-only` mode certifies the REAL input path (both DD
oracles PASS in it), plus test-infra fix (reflect-metadata + SKIP_DB_INIT
guards → full suite 251/253, the 40 chronic DB-init failures gone).

**USER MANUAL CHECKS PENDING (3):** (1) run DTAGWALL or AVHBC live, answer
first prompt — must respond instantly, not hang; (2) type-ahead before a
prompt appears — chars must survive; (3) sysop accepts page during
post-door dot animation — chat UI must appear with no menu flash.
**Then:** live Doors/ volume sync (ssh needed — DreamTagWall, AVHBaudCheck,
configs/tagwall.dat, configs/avh-baudcheck.cfg), DEBUG_68K off when DD
shakedown ends. Follow-ups ledgered: TIM live-input bonus fix needs a
corpus entry; LibraryManager.ts:538 XIM `securityLevel` field bug (every
XIM door sees secLevel 1) needs its own regression pass; #18 CTRL-C abort
wiring; dp_BpsRate hardcoded 115200.

Known out-of-scope leftover on disk (NOT committed, NOT mine to touch):
uncommitted edits to `Doors/GWall/index.ts` (circuit-breaker removal,
unrelated to DD) and BBS runtime-state diffs (`Node1/2 CallersLog`,
`Node1/2 DoorLog`, `Conf.DB`) that are side effects of repeatedly running
the two oracle doors during T8 verification — safe to leave or discard,
not part of any deliverable.

## 2026-08-15/16 — FAME 5D_Page shakedown: full paging pipeline works, live confirmed

Follow-on from the FAME/FIM ship (see section below). A real door (5D_Page,
installed via DOORMAN live repo-install) drove a long debug chain — every fix
shipped + user-confirmed working on local AND live (320a52aec):

- icon.library GetDiskObject now searches Commands/BBSCmd (FAME doors read
  their command icon tooltypes) — was "cAN'T oPEN iCON".
- FIM user-info block 28-50 implemented (header-verified per command).
- AR_SendStr StringPtr strings no longer truncated at 202 bytes (banner was
  cut mid-line; 64KB runaway guard only).
- FAME chat-flag semantics A/B-verified INVERTED: 1 = NOT pageable. Mapping
  sysopAvailable ? 0 : 1. SR_ChatSet (609), CF_InternalCmd (404) "C" -> new
  notify-only sysop page (chat session + webhook + visible confirmation
  line), CF_CallersLog/UDLog (411/412) via express.e-port utils.
- Line completion echoes CRLF (doors' cursor math); mouse/CSI sequences
  stripped from FIM input (stateful, spans per-keystroke delivery).
- Live keystrokes: door.handler had TWO duplicated doorInputHandler closures;
  FIM fix landed in one — routing extracted to routeAmigaDoorInput() used by
  both (unit-tested).
- DOORMAN: modal hotkey guard (filter input), diz sanitize + catalog diz for
  installed doors, registry refresh on install/uninstall/delete (boot-cache
  made installs invisible), resolveBbsRoot (dev source runs wrote outside
  repo), loud install/delete errors, FIM badge.
- Live repo-install shipped: portable JS/WASM extraction (no native lha),
  relative archive paths + DOOR_ARCHIVES_ROOT, 174MB archives + catalog
  synced to live, TYPE= from real detection. lha.js var-scoping path bug
  fixed w/ regression test.
- Node litter: free-list node ids in corpus runner + 0-255 guard in
  DoorDropFileManager; Node41-418 deleted; Node97.info unc committed removed.
- S!X research: it IS AmiExpress XIM — zero code needed (11 doors). CNet:
  AREXX dialect, deferred. DD: RE COMPLETE (LVO table, 120B wire format) +
  8-task plan at thoughts/shared/plans/2026-08-15-daydream-dd-compat.md.
- DEBUG_68K=1 left ON in live compose (/app/amiexpress/docker-compose.yml)
  — REMOVE when FAME shakedown period ends (log volume).

Open: #11 DD execute plan (ready), #14 fingerprint-match 284 pre-catalog
installed doors to catalog (diz), #16 Strip port to portable extractor,
#18 interactive page-wait after FIM door exit (notify-only today).
Backend log lives at logs/backend.log (NOT the start-script redirect).
Local dev login: sysop/sysop; catalog+archives synced live 2026-08-15.

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
— Tier 0/1/2 audit closed, 19 corpus reds resolved, standing rule: corpus/
ledger SWEEP BANNED (bounded `--only` slices only). Open tiers/tasks: #11
Tier 4 SQLite↔disk parity, #12 CONFTOP weekly-reset mail write, #13 Tier 1
leftovers, #5 mgs__r11_autoreward, #14 ledger policy cleanup.

---

Environment quickref: `SKIP_SDK_PREPARE=1 npm install --ignore-scripts`;
jest config → JSON via tsx (`ts-node` absent); emulator suites
`SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`; door runs redirect-never-pipe with
`</dev/null`; Edit/Write destroys high-bit bytes — cp/python/sed for
binaries/corpus.json; deploys never refresh live Doors/ volume.

Older sessions: DOORMAN v2 + dist/ enforcement + CONFTOP root-cause detail →
`thoughts/shared/handoffs/` (2026-08-14 archives + May rollup).
