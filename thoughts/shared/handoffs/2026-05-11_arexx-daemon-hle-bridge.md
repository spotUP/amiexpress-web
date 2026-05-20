---
date: 2026-05-11
topic: arexx-daemon-hle-bridge
tags: [arexx, rexxmast, rexxsyslib, 68k, emulation, handoff]
status: draft
---

# Handoff — AREXX daemon-driven dispatch, HLE bridge phase

## Task

Wire the existing TS `AREXXInterpreter` into the daemon's CreateProc
path so script execution rides on top of the authentic 68K daemon ABI
handshake instead of bypassing it. This is **parity-only work**: the
bridged path in `executeRexxScript` already runs every shipped door
correctly. Do not pick this up unless there is a concrete user-visible
reason (a door that depends on a subtle daemon-driven-dispatch behavior
the bridge doesn't reproduce). The research note explicitly recommends
deferring this until that reason exists.

## Where we stopped

The daemon now boots, accepts a PutMsg on the AREXX port, walks its
dispatch arm cleanly, calls `dos.library CreateProc` with a valid
segList, and lands PC inside the spawned binary's code. The spawned
binary turns out to be the wrong thing (RXC is a 372-byte CLI helper,
not the rexx interpreter — the real interpreter is internal to
rexxsyslib). Discovered via `mcp__amiexpress-debug__parse_hunk` + the
LVO-histogram diagnostic added to `arexx-daemon-trace.ts`.

Two fixes already landed (both have regression tests in
`web/backend/tests/services/rexxmast-counters.test.ts`, 10 cases,
gated on binaries+ROM):

- **Fix 1 — counter zeroing.** `rl_NumMsg` at `libBase + 0xE6` held
  AllocMem-leftover garbage (0x5268), driving a 21K-iteration dbra
  `RemHead(rl_MsgList)` loop before the daemon reached its real
  `GetMsg(rl_RexxPort)`. `rexxmast-service.ts:567-595` zeros six
  fields post-LibInit: `rl_TraceFH`, `rl_NumTask`, `rl_NumLib`,
  `rl_NumClip`, `rl_NumMsg`, `rl_NumPgm`.

- **Fix 2 — task-spawn fields populated.**
  `populateTaskSpawnFields()` LoadSeg's `System/Rexxc/RXC` at base
  0x4000 (`HunkLoader.parse` gained an optional `baseAddress` arg)
  and stamps `rl_TaskName` ("rexx"), `rl_TaskPri` (0), `rl_TaskSeg`
  (BPTR), `rl_StackSize` (8192). Daemon's `CreateProc` now succeeds.

## Critical references

- **Full research + disassembly:**
  `thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md`
  — read this first. Has the RXCOMM handler disassembly, the LVO
  trace post-fix, both HLE-bridge and rexxsyslib-RE paths scoped.

- **Daemon dispatch code under instrumentation:**
  - `web/backend/src/services/arexx/rexxmast-service.ts:393-429`
    — existing `CreateProc` override. Returns a non-zero process
    pointer and switches PC to the spawned segment's entry. **HLE
    work needs to extend this**.
  - `rexxmast-service.ts:567-595` — counter-zero + task-spawn
    invocation. Where to also wire any HLE-specific setup
    (allocating the phantom MsgPort).
  - `rexxmast-service.ts:1057-1240` — `executeRexxScript`. Currently
    bypasses the daemon (does PutMsg + immediately runs TS
    interpreter + writes results + ReplyMsg). HLE work needs to
    refactor this so it drives the daemon dispatch loop, letting
    CreateProc do the HLE inside the loop.

- **Daemon RXCOMM handler disassembly (file offsets, RexxMast.bin):**
  - 0x6A4 — spawn-rexxc subroutine entry
  - 0x6E0 — `dos.library CreateProc(D1=name, D2=pri, D3=segList, D4=stack)`
  - 0x6E8 — post-CreateProc: if D0 == 0, → 0x73A → return 3
  - 0x6EC..0x738 — task-block linking + final `PutMsg` (LVO -366,
    sends msg to spawned task's port)
  - 0x724 — `jsr -0x1ce(a6)` after `exg a5, a6`. Post-swap a6 = ?
    Need to verify what LVO this is and whether we implement it.
  - File offsets map to emulator PCs via `emu = file + 0x2044` for
    RexxMast seg-1 (loaded at 0x2308 with 4-byte AmigaDOS header).

- **Diagnostic scripts (kept under dev/, do not gitignore):**
  - `dev/scripts/arexx-libinit-probe.ts` — dumps RxsLib field
    values pre/post-runUntilReady. Use to verify LibInit state.
  - `dev/scripts/arexx-daemon-trace.ts` — PutMsg's a script,
    drives the emulator, prints PC histogram + LVO trace + msg
    layout breakpoint dump. Already extended with rexxc-mode LVO
    tracking (`REXXC_BASE = 0x4008`).

- **HLE TS interpreter** (the one we'd call from CreateProc):
  `web/backend/src/services/arexx.service.ts` —
  `AREXXInterpreter` class at line 2271+. Already used by the
  bridged path; just needs to be invoked from the CreateProc
  override after extracting `rm_Args[0]` from the msg.

## Recent changes (this session, 2026-05-10 → 2026-05-11)

- `web/backend/src/services/arexx/rexxmast-service.ts`:
  - Refactored LoadSeg override into reusable `loadHunkBinary()` method
  - Added `populateTaskSpawnFields()` (called after `runLibInit`)
  - Rewrote misleading "libBase + 0xB8 wedge" comment with the actual
    finding
- `web/backend/src/amiga-emulation/loader/HunkLoader.ts`:
  - `parse()` accepts optional `baseAddress` parameter; default
    0x2000 preserves all existing call sites
- `web/backend/src/services/index.ts` and `socket-handlers.ts`:
  - (Earlier in this session) `session.scriptAbortHandler` for
    Ctrl+C abort in tight AREXX loops — separate priority, already
    handed off
- `web/backend/tests/services/rexxmast-counters.test.ts`:
  - 10 tests total: 6 for counter fields, 4 for task-spawn fields
- `dev/scripts/arexx-libinit-probe.ts` (new)
- `dev/scripts/arexx-daemon-trace.ts` (new, with LVO histogram)
- `thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md`
  (new, definitive research note — read this first)
- `handoff.md` updated

## Learnings

- **The original "libBase + 0xB8 uninitialised" theory was wrong.**
  All RxsLib lists are properly NewList'd by LibInit. The wedge was
  the trailing UWORD count fields (specifically `rl_NumMsg`) which
  LibInit doesn't touch.
- **LVO -258 is RemHead, not WaitPort.** Confused the two
  mid-investigation; cost ~30 minutes. Always check `exec-vectors.ts`
  rather than recall from memory.
- **RXC isn't the interpreter.** Real ARexx splits responsibilities:
  rexxsyslib.library hosts the daemon AND the interpreter; the
  external Rexxc/* binaries (RX, RXC, RXLIB, RXSET, HI) are
  user-facing CLI utilities that talk to the daemon over the
  AREXX port. The actual interpreter is internal to rexxsyslib's
  33KB hunk and is set up by rexxsyslib's own initialization. We
  don't yet know which entry inside rexxsyslib the daemon's
  CreateProc is supposed to invoke.
- **The daemon's CreateProc PC-switch design (already in
  rexxmast-service.ts:393) bypasses any real task scheduling.**
  This is fine — singleton emulator with no preemption — but it
  means the spawned task "owns" the CPU until it RTS's. For HLE,
  this means the CreateProc override can run the TS interpreter
  synchronously and return to the daemon's dispatch loop.

## Artifacts

- Research note: `thoughts/shared/research/2026-05-10_arexx-daemon-dispatch-wedge.md`
- Earlier handoff (same session, separate priority — Ctrl+C abort):
  not written separately; documented in `handoff.md`.
- All code in working tree, uncommitted at handoff time. `npx tsc
  --noEmit` clean; 108 arexx/rexx tests green.

## Next steps (ordered)

1. **Decide whether to proceed at all.** This is parity-only work.
   Read the research note's "Step 5 — defer or descope" section
   first. If there's no concrete user-visible reason, close this
   out and move on.

2. **If proceeding via the HLE-bridge path (Option A from research
   note, recommended, ~4-8h):**
   a. Allocate a "phantom rexxc MsgPort" once at service start.
      Set its mp_SigTask to the daemon task (or a parked stub
      task), mp_SigBit to a fresh AllocSignal'd bit, mp_Flags=0,
      and run `NewList()` semantics on its mp_MsgList.
   b. In `CreateProc` override (`rexxmast-service.ts:393`),
      detect when `segListBptr` equals the rexxc BPTR we put
      into `rl_TaskSeg`. On match:
      - Read A2 (= msg pointer, per disasm at file 0x6A8).
      - Read `rm_Args[0]` argstring → script source string.
      - Run `AREXXInterpreter` against the source, synchronously.
      - Write `rm_Result1` and `rm_Result2` (argstring with
        result text if RXFB_RESULT set).
      - Return `(phantom_port_addr + 0x5C)` as the "process
        pointer" (daemon does `lea -0x5c(a0),a0` to get task
        addr).
      - Do **not** call `emulator.setRegister(PC)` — let the
        daemon's post-CreateProc code at 0x6EC-0x738 run.
   c. Handle the daemon's `PutMsg` at file 0x732: it'll deliver
      our (now-completed) msg to the phantom port. After the
      daemon returns to `executeRexxScript`'s driver loop,
      drain the phantom port + ReplyMsg each msg to its
      `mn_ReplyPort`.
   d. Investigate `jsr -0x1ce(a6)` at file 0x724 (after `exg a5,a6`,
      so a6 = libBase = rexxsyslib). LVO -462 in rexxsyslib —
      verify our impl returns something sane; if not, add a stub.
   e. Refactor `executeRexxScript` (rexxmast-service.ts:1057):
      instead of bypassing the daemon, drive its dispatch loop
      and let the HLE CreateProc handle the actual interpretation.
      The post-script drain of host-port messages (via
      `serviceInboundMessages`) stays the same.
   f. Validation: re-run `arexx-daemon-trace.ts`. Expect
      `rm_Result1 = 0` and message back on reply port after a
      full daemon round-trip (no longer 200K-cycle timeout).
   g. Promote a minimal version of `arexx-daemon-trace.ts` into
      `tests/services/native-arexx-daemon.test.ts` so CI guards
      the round-trip.

3. **If proceeding via the rexxsyslib-RE path (Option B, ~days):**
   Disassemble `Libs/rexxsyslib.library` (33KB) with radare2 to
   find the function that takes `rl_TaskSeg` and runs the
   interpreter loop. NDK doesn't document this — needs experimental
   probing. Path-A is strictly easier and the recommendation.

## Other notes

- The bridged TS path (`executeRexxScript` as it currently exists)
  is the production engine. Every shipped door (AVAIL, KickBox,
  STNG, SPEEDCHK, SOMEINFO) verifies through it. Do not break it
  during the HLE refactor — keep an option to fall back to the
  pre-HLE path if the daemon round-trip fails, similar to how the
  native engine falls back to TS today (`engine-selector.ts`).
- All AREXX binaries (System/RexxMast, System/Rexxc/*,
  Libs/rexxsyslib.library) are gitignored as Commodore-copyrighted.
  CI cannot run the daemon tests; they're gated on file existence.
- Diagnostic scripts under `dev/scripts/` should stay there as
  long-lived debugging tools; do not delete after a fix lands.
- `handoff.md` (the rolling project handoff at repo root) is at
  ~9.8KB / 10KB limit; trim older entries before adding more.
- A previous session-stopping AI was unable to commit to a
  direction across multiple "proceed" turns; the explicit option
  list at the end of that thread is in case the user wants to
  resume but needs to make the direction call first.
