# Handoff

## READ THIS FIRST in a fresh session

**Resume doc:** `thoughts/shared/handoffs/2026-08-17_doorrepo-c-and-door-repo-api.md`
Nothing is mid-flight. Head `44357cf22`, everything pushed.

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

Next: a one-line `getdtablesize()` fix (still says 256, real cap is now 32),
and sending the door to the AmiExpress author.

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
— 9-task plan, 18 commits, merged `8ef4ba0c2`. FIM constants / FAME.library /
FIMProtocol + doorType FIM routing + FAMEDoorPort detection; root emulator
fix (library-opened callback is a compose list — was last-writer-wins and
silently disabled every door's vector installs); opus review found 3 Critical
+ 5 Important, all fixed (FAMEDoorCommands.h always beat plan prose).
Backlog from it: FAMESemaphore (multi-node who-list, FAMEWHO output).

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
