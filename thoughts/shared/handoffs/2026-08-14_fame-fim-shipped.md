---
date: 2026-08-14
topic: FAME (FIM) door compat layer built, reviewed, merged to main
tags: [handoff, fame, fim, emulator, doors, subagent-driven]
status: final
---

# Session handoff — 2026-08-14/15 (late night) — FAME FIM compat SHIPPED

Executed `thoughts/shared/plans/2026-08-14-fame-fim-compat.md` (9 tasks) via
subagent-driven development on branch `fame-fim-compat`, merged fast-forward
to main at `8ef4ba0c2`, pushed (deploy auto-triggered).

## What landed (18 commits, 32a5ace28..8ef4ba0c2)

- `fim-constants.ts` — FAMEDoorMsg offsets (282B struct), 37 FIM_CMD codes,
  FIM_RC, fimPortName(). All byte-verified against FAMEPublicStructs.h /
  FAMEDoorCommands.h / FAMEDefine.h.
- `FameLibrary.ts` + `fame-vectors.ts` — minimal FAME.library, LVOs from
  FAME_lib.fd (bias 30; FAMEAtol at -354), real AllocObject/FreeObject/
  StrCopy/Atol/memset-family, logged stubs elsewhere, RTS net beneath.
- `fim-protocol.ts` — FAMEDoorPort<node> message server (mirrors XIM):
  lifecycle (MC 1/2/3 w/ lastWords emission), output (NR_SendStr/CRLF 10/11,
  AR_SendStr 851 data1!=0 CRLF, CF_ShowText honest rc=4), input
  (NR_PromptChars 14 with per-keystroke accumulation/echo/backspace/Data1
  cap; modes: 0 normal, 4 stars, 7 no-echo, 8 digits-only, 1-3 DENIED;
  NR_HotKey 15 / AR_HotKey 861 non-blocking char→Data2; AR_GetKey 800
  presence-only non-consuming; NR_WaitChar 92 blocking w/ IOString prompt),
  info (16/17/23/31/32-DENIED/33/37/48/51-54/600/602/608/614), args
  (NR_GetFullArg 87, NR_GetArgument1-4 88-91 from doorParams).
  Return-field convention (Data2 vs Data3 vs IOString) documented at switch.
- doorType `FIM` end-to-end: parser enum + FM|FI|FIM aliases, DoorType.FIM=8
  log code, executeDoor case, consolidated exported AMIGA_68K_DOOR_TYPES /
  isAmiga68kDoorType (was 2-3 duplicate inline lists incl. corpus runner),
  useXimProtocol excludes FIM, NODENR-only CLI args for XIM|FIM
  (DoorLoader.selectCliArgs — params flow via commands 87-91 instead).
- Detection: exported detectDoorType(buf) — FAMEDoorPort→FIM before
  AEDoorPort→XIM, DoorControl→SIM; shared AMIGA_68K_BINARY_EXT_RE (incl.
  .fim) gates archives; installer prefers LOCATION/execName basename match;
  analyze-all-doors.sh FIM + DD branches.
- **Root-cause emulator fix**: ExecLibrary library-opened callback was a
  last-writer-wins slot — AmigaDoorSession silently killed LibraryManager's
  vector-install branch for EVERY door. Now a compose list
  (addLibraryOpenedCallback; old setter = appending alias). Validated by
  12-door corpus slice (dos/icon/intuition/bsdsocket) 12/12 green.
- E2E: `Doors/FAMETest/TestDoor.FIM` full flow green (banner→prompt→echo→
  "You've said"→EXIT 0), golden captured (corpus id fametest_1).
  `Doors/FAMEWho/FAMEWHO.FIM` crash-free EXIT 0, corpus id famewho_1
  SMOKE-ONLY (no who-list until FAMESemaphore exists — see below).
- Tests: 4564 passing overall; 47 fim-protocol + routing/detect/loader/
  composition suites all green; tsc clean. Pre-existing failures on main
  (door-logging.util 104, file-flag.util) unchanged — NOT from this branch.

## Review trail

Every task: fresh implementer + task review; fix rounds where needed (T4
CF_ShowText test, T5 keystroke accumulation + Data1 cap, T8 .fim gate, T9
callback bug). Final opus whole-branch review found 3 Critical (corpus
blast-radius unvalidated; Data2/Data3 fields contradicted header; blocking
vs poll semantics + missing NR_WaitChar) + 5 Important (NODENR loss for
parameterized doors, empty famewho golden, CRLF flag, mode-7 echo leak,
installer binary pick) — all fixed + re-reviewed. Full rulings list was
reported in-session; plan-vs-header conflicts always resolved to the header.

## Open items

- **Manual sysop verification (USER)**: install a FIM door via DOORMAN, run
  from BBS menu over web terminal, exit clean.
- **Live Doors/ sync**: deploys never update the live Doors/ volume — the two
  NEW FAME doors need `docker exec amiexpress-bbs sh -c 'cp -r
  /app/default-data/Doors/FAMETest /app/default-data/Doors/FAMEWho
  /app/data/bbs/Doors/'` + verify after this deploy.
- **FAMESemaphore** (new backlog): FAME multi-node who-list publishing
  (FindSemaphore("FAMESemaphore") → fsem_FirstNode chain). FAMEWHO and any
  multi-node FAME door need it for real output.
- **DD compat** (task #11): DayDream layer — disassemble
  `Sources/_Assembly/DD-XIM/libs/DreamDoor.Library` (2368B), calibrate via
  Xim.s source match; fix dead DreamDoorLibrary.ts (base 0xE0000 collision,
  never-installed vectors). ~13 doors.
- Cursor-key raw codes (HotKey Data1 remap, WaitChar 4/5/3/2) unimplemented,
  disclosed in code comments. NR_TimeRemain passes minutes through (header
  states no unit). corpus-runner 8000ms timeout is marginal under load
  (fametest_1/who intermittent — pre-existing, baseline-confirmed).
- Deferred minors from per-task reviews died with the SDD workspace; the
  load-bearing ones are all in the fixed set above.

## Environment notes (unchanged from prior handoff)

jest config → JSON via tsx; SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 for
emulator suites; single-door harness with </dev/null + redirects; corpus
sweep BAN intact (bounded --only slices ok); Edit tool destroys high-bit
bytes (cp/python only for binaries); minimal corpus.json edits.
