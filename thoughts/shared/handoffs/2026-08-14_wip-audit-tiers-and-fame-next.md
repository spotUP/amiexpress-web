---
date: 2026-08-14
topic: WIP/stub audit execution (Tier 0/1/2 + corpus reds) — FAME compat primed as next step
tags: [handoff, audit, security, emulator, ledger, corpus, fame]
status: final
---

# Session handoff — 2026-08-14 (night)

Long session. Started "get up to speed", turned into: CONFTOP Y2K fix →
inline-door prompt bugs → project-wide WIP audit → Tier 0/1/2 execution →
corpus reds cleanup. **Next session: build the FAME (FIM) door compat layer.**

Everything below is COMMITTED and PUSHED. Live (`bbs.uprough.net`) is on
`299d0c807`, verified fresh.

---

## What shipped this session (commits, newest first)

```
299d0c807 docs(handoff): Tier 2 conclusion + corpus reds resolved
f3a3cd9cb fix(corpus): resolve all 19 CI-gate reds — stale-id curation + zootility timeout
fa2cd2a86 docs(tier2): ledger sweep proves emulator serves the corpus — stub-elim low-ROI
9f229f1dc docs(tier2): ledger measurement finding
7a567a8d2 feat(tier2): library-call ledger — measure real/stub/missing 68K LVO usage
3dee329af fix(tier1): restore restricted-download gate, conf ACL, real slot alloc, honest ARexx
29f33083b fix(tier0): XIM tooltype routing, honest icon stub, real node cleanup, hot-path log
fb5256cd5 fix(gwall): fail fast + circuit breaker when scenewall server down
b10b0b682 fix(doors): segment guard must check presence, not remaining count
ea8bc3ffa fix(doors): no menu prompt when inline ~CC_ door exits mid-screen-flow
5b24fbefc fix(corpus): per-door gate silently tallied 0/0
62ffaed05 fix(conftop): patch Y2K guard bricking reset after idle gaps
```

### Confirmed working by the user
- CONFTOP "Reset date is out of range" — Y2K guard in the v2.3 binary, 2-byte
  patch (blt.b→bra.b at 0xE80/0xE7C). Live.
- Double-prompt + ghost-prompt after inline ~CC_ doors (CONFTOP join, DRE!WALL) —
  segment-presence guard in `postDoorMenuAction`. Live.
- GWALL 8s logon hang — scenewall.bbs.io dead; fail-fast + circuit breaker. Live.

### Tier 0 (29f33083b) — 5 fixes, live
XIM GET_CMD_TOOLTYPE(707) routing (was mislabeled 551 — but 551 does NOT hang,
it's handled upstream; audit claim was wrong); IconLibrary.PutDiskObject honest
failure; node_sessions real cleanup; XIMProtocol hot-path log; config no-ops.

### Tier 1 (3dee329af) — security sprint, live
- **Restricted-download gate was DEAD in every path** (no resolver populated
  comments → the `startsWith('restricted')` check never fired → restricted
  files downloadable by anyone). Fixed via `web/backend/src/utils/file-restriction.util.ts`
  (single source of truth) wired into single-file, batch, and D-command paths.
- doors bypassing conference ACL (`BBSApi.joinConference` now calls checkConfAccess).
- APPEND_ACCOUNT slot was `Date.now()%10000` → real `db.getMaxUserSlot()`+counter.
- ARexx honesty: BBSLAUNCHDOOR / executeAREXXScript no longer fake success.
- SSH-accepts-any = NOT a hole (correct BBS transport model; comment fixed only).

### Tier 2 (7a567a8d2 + follow-ups) — CLOSED, measurement not implementation
Built a library-call ledger (`web/backend/src/amiga-emulation/instrumentation/library-call-ledger.ts`)
that classifies every 68K library call real/stub/missing. **Finding: the
emulator serves the entire exercised corpus.** 54 doors sampled (30 common + 24
tail-library) → 0 stub, 0 missing. The audit's dishonest-success stubs (S1-S8)
exist in code but real doors don't call them. **Do NOT implement S1-S8 blind.**
Tier 2 is DONE as "answered: no work needed."

### Corpus reds (f3a3cd9cb) — all 19 resolved
Mostly stale CI list, not broken doors (LEDGER diagnosed each). 17
phantom/renamed ids fixed in `integration-smoke-all.txt` (7 renames re-added,
10 gone + who/aquawho dropped). zootility was the one real failure — slow
paginated stats outran the 8000ms timeout; bumped to 13000 + 'ns' pause
dismiss. smoke-all now 408 valid ids.

---

## Recurring lesson this session (important)

**Five audit/backlog findings were false alarms**, each caught by measuring
reality instead of trusting the report: 551 "hang", SSH "hole", S1-S8 "high
priority", 17 "broken doors", zootility "emulator bug". Verify the call site /
run the thing before implementing. The emulator and door corpus are far
healthier than the static audit implied — the debt was in tooling and curation.

## User frustration to respect (READ THIS)

The user is burned out on the corpus/ledger SWEEP. It has been attempted many
times and restarted from zero. My `ledger-sweep.sh` has NO checkpoint/resume —
that was a real miss vs the promise to "only sweep failed + keep progress."
**DO NOT run a full corpus sweep.** The ledger's value is a ONE-DOOR diagnostic:
when a specific door fails, run just that door under `LEDGER=1` (30s) to see if
it needs a stub. Never a corpus-wide grind. (Cleanup owed: strip
`dev/scripts/door-corpus/ledger-sweep.sh` to single-door-only or delete it.)

---

## NEXT STEP: FAME (FIM) door compat layer

**Why:** biggest concrete payoff left — ~75 archive doors that don't run at all
today start running. Build, not measure. Plan is complete and TDD-structured.

**The plan:** `thoughts/shared/plans/2026-08-14-fame-fim-compat.md` — 9 tasks,
no placeholders, exact code. Read it start to finish first.

**The research:** `thoughts/shared/research/2026-08-14_fame-dd-door-compat.md` —
protocol fully decoded. Key facts:
- FAME doors open `FAME.library`, allocate a `FAMEDoorMsg` (282 bytes, exact
  offsets in the plan), build port name `"FAMEDoorPort%ld"`, PutMsg/WaitPort
  loop. Reference client: `amiexpress_doors/Sources/_C/FA_DE103/FAME/FAMEDoor/
  FAMEDoorStartUp/FAMEDoorStartUp.c`. Struct: `FAMEPublicStructs.h`. Commands:
  `FAMEDoorCommands.h` (412 defines). Library LVOs: `FAMECFPR/Pre-Release/
  include/fd/FAME_lib.fd` (bias 30).
- Test oracles WITH source + binary: `FA_DE103/.../TestDoor.FIM`,
  `FAMEWH12/.../FAMEWHO.FIM` (+ .c). Task 9 wires these end-to-end.

**Architecture:** mirror the XIM stack. New `FIMProtocol` handler + a
`FAMEDoorPort<node>` exec message port created pre-start; `ExecLibrary.putMsg`
recognizes the port name (like the existing `aedoorport` check) and dispatches
to FIMProtocol; minimal `FAME.library` trap-vectored like bsdsocket. New
doorType `FIM` routes through `executeAmigaDoor` unchanged.

**Start with Task 1** (FIM constants + FAMEDoorMsg offsets — pure TDD, zero
emulator risk), then Task 2 (FAME.library), etc. Each task ends with a passing
test. Execute with `superpowers:subagent-driven-development` or task-by-task.

**Out of scope for FAME:** famedoor.library (AmigaE client), and DayDream/DD —
DD needs disassembling the 2.4KB `DreamDoor.Library` and is a separate plan.
The existing in-repo `DreamDoorLibrary.ts` is DEAD CODE (vectors never
installed, base 0xE0000 collides with intuition) — fix when DD is tackled.

---

## Critical how-to / gotchas for the next session

**Environment:**
- `web/backend` may have no node_modules. Install: `SKIP_SDK_PREPARE=1 npm
  install --ignore-scripts` (the backend postinstall web-assets build fails —
  irrelevant for backend/tests).
- `ts-node` is absent → jest's `.ts` config fails. Render it to JSON:
  `cd web/backend && npx tsx -e "const c=require('./dev-scripts/jest.config.ts');console.log(JSON.stringify(c.default||c))" > /tmp/jest.config.json`
  then `SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 npx jest --config /tmp/jest.config.json --rootDir . <path>`.
- DB-touching suites need NO SKIP_DB_INIT (they init their own test DB);
  emulator/unit suites want `SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1`.
- Type-check: `cd web/backend && npx tsc --noEmit`.

**Single-door harness (reliable; corpus runner HANGS on state pollution):**
```
cd web/backend && SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 \
  npx tsx src/scripts/run-amiga-door.ts <../../path/to/binary> 1 \
  --doortype FIM --timeout 20 --command <CMD> </dev/null > /tmp/x.out 2>/tmp/x.log
```
LEDGER=1 makes it dump `[ledger-json]` (per-door real/stub/missing). Always
`</dev/null` and redirect to files (never pipe — SIGPIPE gives false EXIT).

**Emulator dispatch facts (learned the hard way):**
- Live library-trap sink is `LibraryTraps.handleTrap(pc)` (via
  `MoiraEmulator.setLibraryTrapHandler` → `handleIllegal`). NOT
  `handleTrapByOffset` (that method's "live dispatch" comment is STALE; nothing
  calls it). Wire new instrumentation into `handleTrap`.
- tsx duplicates singletons when a module is loaded via both `import` and
  `require` — use consistent ESM import.

**Corpus / doors:**
- corpus.json is 3170 entries. EDIT WITH MINIMAL sed/targeted python — a naive
  `json.dump` reformats all 217k lines (huge diff; happened this session, data
  was intact but noisy). Always `ensure_ascii=False` + trailing `\n`.
- Live Doors/ are on a persistent volume; deploys DON'T update them. After any
  Doors/ change: `ssh root@89.167.21.154 "docker exec amiexpress-bbs sh -c
  'cp /app/default-data/Doors/<D>/<f> /app/data/bbs/Doors/<D>/'"` then verify.
  (memory: doors-volume-sync-after-deploy) — FAME doors will need this once
  they're installed.
- Edit/Write tool destroys high-bit bytes in binary/door/cfg files — use
  sed/python/git (memory: edit_tool_destroys_high_bit_bytes).

**Deploy:** push to main auto-triggers `deploy-hetzner.yml`. GREEN ≠ fresh —
the SSH script can swallow docker build failures (disk-full ENOSPC bit us this
session). Always verify: `curl bbs.uprough.net/health` revision matches HEAD +
container age + no ERROR/failed-to-solve in `docker logs`. Server disk runs
tight (~38G); prune build cache/images if a deploy fails on ENOSPC.

---

## Open backlog (tasks)

- **#3 FAME/DD compat** — FAME plan ready, DD deferred. ← NEXT
- #11 Tier 4 SQLite↔disk parity — 7 unpaired state classes; architectural,
  needs a repository-level dual-write hook. Biggest remaining correctness debt.
- #12 CONFTOP mail/bulletin write on weekly reset ("Cannot write
  message/bulletine." — MAILUSER=eall path; reset+data write succeed).
- #13 Tier 1 leftovers: legacy binary import (amiga-parser.service.ts Conf.DB/
  msgbase parsing returns placeholders), SDK arexx-server WAITINPUT, area-based
  conf access.
- #5 mgs__r11_autoreward — 1 skipped corpus door (hangs after BB_CONFNUM).
- #14 LEDGER standing policy — one-door diagnostic only, never full sweep.
  Cleanup: neuter/delete ledger-sweep.sh.

Master plan with all tiers: `thoughts/shared/plans/2026-08-14-wip-debt-master-plan.md`.
Code audit / doc audit / emulator stub audit outputs are summarized there.
