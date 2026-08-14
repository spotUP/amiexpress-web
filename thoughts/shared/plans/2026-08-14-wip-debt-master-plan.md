---
date: 2026-08-14
topic: Project-wide WIP / TODO / stub audit — consolidated fix roadmap
tags: [audit, debt, roadmap, emulator, security, corpus]
status: draft
---

# WIP / Debt Master Plan

Consolidates three parallel audits (2026-08-14): code markers (86 actionable /
124 total), documentation opens (32 current / 21 stale), emulator stub surface
(19 dishonest-success stubs + 1 confirmed live hang). Sources:
- `thoughts/shared/research/2026-08-14_fame-dd-door-compat.md` (FAME/DD)
- this session's audit agent outputs (captured below)

Ordering is by **blast radius × confidence**, not by subsystem. Security and
silent-data-loss first; cosmetics last. Each tier is independently shippable.

## Guiding rule

Dishonest-success stubs (return OK / return 1 without doing the work) are worse
than honest failures — they make doors proceed on garbage and hang or corrupt
downstream. The recurring fix is: **return the honest error/NULL and log**,
never fake success. This principle drives most of Tier 1-2.

---

## TIER 0 — quick wins (hours, high value, isolated)

| ID | Item | Fix | Ref |
|----|------|-----|-----|
| Q1 | **XIM 551 hangs the door.** `isCommandInfoRequest` hard-codes `is551` but 551 is SETMCIOFF; it's intercepted before its real handler and never replied → WaitPort hang. Also blocks 707 GET_CMD_TOOLTYPE from its own branch. | Change the `is551 = command === 551` clause to `command === XIMCommand.GET_CMD_TOOLTYPE` (707). Regression test: 551 reaches SETMCIOFF handler; 707 reaches tooltype branch; both reply. | `XIMProtocol.ts:756-774, 707, 1460` |
| Q2 | **`PutDiskObject` pretends to save `.info`** (returns 1, writes nothing) — doors persisting config silently lose it. | Implement real `.info` write (IconLibrary already parses them) or return **failure** + log so the door surfaces the error instead of lying. | `IconLibrary.ts:202-213`, `icon-vectors.ts:132-168` |
| Q3 | **`node-manager.service.ts` cleanup no-ops** — idle-session + 7-day cleanup resolve without running their SQL → unbounded `node_sessions` growth. | Restore the SQL behind the "private access" guard, or gate on a config flag; add a test that rows are deleted. | `services/node-manager.service.ts:181,187` |
| Q4 | **`config.ts loadConfig()` body empty** — defaults always used, file ignored. | Implement the load or delete the dead function + its call so config source is unambiguous. | `config.ts:175` |
| Q5 | **`XIMProtocol` synchronous `appendFileSync` per command (21-99 range)** on a hot path. | Route through the existing gated `debugLog`; drop the sync write. | `XIMProtocol.ts:737-744` |
| Q6 | **CONFTOP "Cannot write message/bulletine" on weekly reset** (task #6). Reset+data write succeed; only the results-mail/bulletin write (MAILUSER=eall) fails. | XIM-trace the mail-write command via `xim:debug CONFTOP` with `--command CONFTOP`; likely an unhandled SV_*/mail XIM code. Fix or honest-fail. | live logs 2026-08-14 |

Each ships with a regression test (project rule). Batchable in one PR each or a
small cluster PR.

---

## TIER 1 — security & correctness (must-fix, unauthenticated / data-corruption)

1. **SSH accepts any password** (`server/ssh-server.ts:57`) + **doors bypass
   conference ACL** (`doors/BBSApi.ts:681`). Together the only unauthenticated
   surface. Wire `ctx.password` through the real BBS auth
   (`validateUser`) and call `checkConfAccess()` in `joinConference`.
   Tests: reject bad password; deny no-access conference.

2. **D16 restricted-file gate bypass on ZMODEM flagged download**
   (`handlers/commands/user-commands.handler.ts:950`). Two sibling handlers
   (`download.handler.ts:340`, `batch-download.handler.ts:81`) enforce the
   "Restricted" comment-prefix; this path doesn't. Extract the shared gate,
   call it here. Test: restricted file refused via flagged-file path.

3. **`APPEND_ACCOUNT` slot = `Date.now() % 10000`**
   (`amiga-emulation/session/DoorMessageHandler.ts:2442`) — collision-prone,
   writes into user-account buffers. Replace with the real slot allocator
   (`db.createUser` slotnumber path, per prior notorious-lockout fix). Test:
   two rapid appends get distinct slots.

4. **`message-scan.handler.ts:147` area ACS unconditionally returns false**
   (silent deny of message areas). Implement `Conf.N` TOOLTYPE_AREA check
   against `acs.util`. Test: permitted area passes, denied area blocked.

5. **ARexx surface lies about success** — `database.ts:2993` (getAREXXScripts
   `[]`, executeAREXXScript `{success:true}`), `arexx.service.ts:1307`
   (BBSLAUNCHDOOR "would launch" → 0), `sdk/core/arexx-server.ts:418`
   (WAITINPUT → literal `"KEY:"`). Sysop automation silently no-ops. Wire
   BBSLAUNCHDOOR to `executeDoor`; back the DB methods with the real ARexx
   service or remove them. Tests per entry.

6. **`amiga-parser.service.ts` legacy import broken** — Conf.DB returns
   hardcoded `accessLevel:10/type:BOTH` (`:368`), message bases return `[]`
   (`:497-533`), and `import-transaction.service.ts:652` counts non-imported
   commands as imported. Either implement the binary parse (Conf.DB format is
   now known — see the CONFTOP work decoded packed-record layouts) or make the
   importer report honest skip counts. Blocks the whole legacy-import story.

---

## TIER 2 — emulator stub elimination (the structural cure; = 68K plan Phase 2)

This is the deferred Phase 2 of `2026-05-11-68k-door-coverage.md`, now with a
concrete target list from the stub audit. Approach unchanged from that plan:
grep → categorize → frequency-rank via a trap-hit counter on a corpus run →
implement top 80% against NDK autodocs / vamos.

### Measurement half — DONE (2026-08-14, commit 7a567a8d2)

The trap-hit counter is built: `library-call-ledger.ts` classifies every 68K
library call as real / stub / missing. Run it with `LEDGER=1`; aggregate a
corpus sample via `dev/scripts/door-corpus/ledger-sweep.sh N` →
`triage/library-call-ledger.{json,md}`.

**First finding (30-door sample):** 26 distinct LVOs, ALL real — zero stub,
zero missing. The common door workload (status/wall/stats) only touches
exec/dos/icon core functions, all implemented. Top calls: Forbid, FindPort,
PutMsg, Permit, GetMsg, WaitPort, AllocMem, OpenLibrary, dos Output/Open/Lock.

**Implication for the implementation half:** the audit's dishonest-success
stubs (S1-S8 below) are REAL but LOW-FREQUENCY — they bite specific door
classes (socket/timer/graphics/math), not the common corpus. So do NOT blindly
implement all S1-S8. First run a BROADER sweep (targeted at socket/graphics/
timer/math doors, or the full 3124 — ~13h serial, schedule it) to see which
stubs/missing REAL doors actually hit, then implement by measured frequency.
The priority stubs below stay as the static-analysis hazard list, now to be
confirmed against sweep data:

- **S1 — library-opened callback override drops generic LVO stubbing.** Any
  library not in `AmigaDoorSession`'s hardcoded list (math*, graphics, gadtools,
  locale, asl, datatypes, amigaguide…) gets a base but **no vectors and no RTS
  filler** → `jsr -N(a6)` into zeroed memory. This is the widest emulator
  hazard. Fix: make `AmigaDoorSession.setupComponentCallbacks` chain to (not
  replace) the LibraryManager generic-stub install, or install RTS filler for
  every opened library unconditionally. (`AmigaDoorSession.ts:713-803`,
  `ExecLibrary.ts:778-782`, `LibraryManager.ts:740-793`)
- **S2 — intuition `CurrentTime` (-84) is a bare RTS**, leaving secs/micros
  uninitialized → bogus time-used / instant timeouts / negative time-left.
  Add -84 to `intuition-vectors.ts` writing real seconds (reuse
  `getSystemTime`); add RTS filler for intuition LVOs past -384.
- **S3 — exec device family fakes success** (`OpenDevice`/`DoIO`/`WaitIO`/
  `CheckIO`, `exec-vectors.ts:79-137`): timer reads return garbage, delays
  instant. Implement at least `timer.device` GETSYSTIME/ADDREQUEST honestly;
  honest-fail unknown devices.
- **S4 — generic auto-stub returns D0 unchanged** → documented 100k+ iteration
  spin loops (NextDosEntry, MatchNext, AllocTrap). Make the auto-stub return a
  benign terminating value (0 / DOSFALSE + correct IoErr) per LVO class.
- **S5 — `DeviceProc` fake MsgPort 0x4000** (`DosLibrary.ts:3093`): a PutMsg
  corrupts low memory + hangs. Return NULL like `GetDeviceProc` does.
- **S6 — bsdsocket server/option path lies** (bind/listen/getsockname/
  IoctlSocket/SocketBaseTagList, `bsdsocket-vectors.ts`): AXNet/telnet/FTP
  doors misbehave. Implement or honest-fail the server path.
- **S7 — icon persistence + missing icon LVO filler** (GetIcon/PutIcon have no
  vector and no RTS filler — icon lib has no `stubJumpTableEntries`).
- **S8 — TIM `PG_EF`/default returns no data** (`TIMDoorMessageHandler.ts:439,
  496`), `PG_FF` uses raw Amiga path without `resolveAmigaPath` (`:480`).

Deliverable per the original Phase 2: a stub-audit research doc + trap-frequency
data + implementations landed with corpus assertions. This is the item that
stops every new door paying the reactive-debug tax.

---

## TIER 3 — new capability (planned, specced)

- **FAME (FIM) compat** — execute `2026-08-14-fame-fim-compat.md` (9 TDD tasks,
  ~75 doors). Fully specced, zero code yet. Recommend running it next as a
  standalone effort.
- **DayDream (DD) compat** — after FAME. Blocked on disassembling the 2.4KB
  `DreamDoor.Library` v1.0. Also **fix the dead-code + 0xE0000 base collision**
  in `DreamDoorLibrary.ts:87` and wire `installDreamDoorVectors` into the
  open-callback (currently never called → any DD door dies at InitDoor).
- **SDK blessed widgets** — 8 unimplemented (`sdk/engines/ui/ui-engine.ts:80,
  237-493`: Line, FileManager, ListTable, Checkbox, RadioSet, Prompt, Message,
  Loading) + neo-blessed compat layer. Widest door-facing gap; every TS door
  builds on this. Scope its own plan.

---

## TIER 4 — SQLite↔disk parity (largest correctness debt)

From `2026-05-18_sqlite-disk-parity-audit.md`. Users class closed; still
unpaired: messages→MSGS, conferences→ConfConfig.info, callers log, votes, file
flags, message pointers (`message-pointers.util.ts:321/346` SQL-only, needs a
`ConfDBFileManager`), OLMs; `initialization.ts:671` confaccess writes SQL only.
**Strategic fix:** a repository-level sync hook so writes dual-target
automatically, instead of patching each call site. Write a dedicated plan.

---

## TIER 5 — corpus health (the regression net)

- **19 red doors of 420** (task #7): who, wall_mst, rtw, request, glc, sent_fe,
  zootility, 5d_* cluster, conftop_2 (flaky). Triage per-door.
- **In-process runner state pollution** — doors pass in isolation, time out
  after ~8 in a batch; root cause in AmigaDoorSession/shared globals. Currently
  worked around by `per-door-test.sh`. Fixing it lets the fast in-process runner
  return.
- **58s wall-clock anomaly** — 8s-timeout doors sometimes take ~58s to report.
- **mgs__r11_autoreward** (task #5) — seed `Node*/Playpen/` with a fake .LHA.
- **25 known-broken doors need skipReason entries** + `fileid` missing-binary
  curation fix.

---

## TIER 6 — feature gaps in shipped doors (user-visible "looks done, isn't")

- **livechat**: 8 dead context-menu actions (mute/ignore/block/react/pin/
  mark-unread/delete/pinned-channels) — `features/context-menus.ts:103-177`.
- **grandmaster (TetriNET)**: garbage-send/immunity/opponent-tracking absent
  (`ui/tetrinet-screen.ts:224-285`); rollback netcode assumes unchecked
  `engine.setState()` (`network/prediction.ts:422`, `rollback.ts:336`).
- **card-lobby**: spectator mode disabled, weekly bulletins disabled pending
  test (`index.ts:226,734`).
- Each door owner decides scope; not BBS-core. Track as per-door issues.

---

## TIER 7 — smaller correctness / cosmetics (batch when touching the area)

Navigation new-files date prompt never read (`navigation-commands.handler.ts:143`),
bulletin re-prompt loop missing (`bulletin.handler.ts:233`), chat time billed
(`time-tracking.util.ts:69` — chatFlag exclusion), messaging-translation
"press key" doesn't wait (`messaging-translation.ts:89`), `executePagerDoor`
always false (`door.handler.ts:3948`), `statistics-routes.ts:86` returns wrong
data set, AmigaGuide formatting stripped, colored ASCII forced grayscale, etc.
Full list in the code-audit output. Fix opportunistically with a regression
test each.

---

## Recommended sequencing

1. **Tier 0** (one afternoon, 6 isolated wins incl. the live 551 hang + CONFTOP mail).
2. **Tier 1** (security/correctness sprint — SSH auth, D16 gate, slot alloc, ARexx honesty).
3. **Tier 5** in parallel (corpus reds — protects everything else).
4. **Tier 2** (stub elimination — the structural cure; largest long-tail payoff).
5. **Tier 3** FAME execution (biggest new-capability win, already specced).
6. **Tier 4** parity (own plan), **Tier 6/7** opportunistic.

Open question for the user: which tier to start executing? Tier 0 is safe to run
immediately; Tier 3 (FAME) is the biggest single feature win and is already
plan-complete.
