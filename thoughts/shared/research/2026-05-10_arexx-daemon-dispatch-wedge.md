---
date: 2026-05-10
topic: arexx-daemon-dispatch-wedge
tags: [arexx, rexxmast, rexxsyslib, 68k, emulation, reverse-engineering]
status: implemented
---

# Native AREXX dispatch wedge — diagnostic findings

## Background

The handoff comment at `web/backend/src/services/arexx/rexxmast-service.ts:1140-1163`
claimed the daemon's post-Wait dispatch loop wedges because:

> The AmiExpress RexxMast 36.5 daemon's dispatch arm uses a libBase-relative static
> pointer (libBase + 0xb8) as a "msg" — some leftover relocation we don't yet
> understand without assembly-level RE of the 33KB rexxsyslib hunk.

This session ran two diagnostic probes against the live daemon to verify the theory.
**The original theory is wrong.** The lists at `libBase + 0xB8` are properly
initialized. The actual wedge is in RexxMast's action-dispatch scan loop — a
tractable issue, not the deep RE the original comment suggested.

## Probe 1 — RxsLib state inspection (`dev/scripts/arexx-libinit-probe.ts`)

Boots `rexxMastService.start()`, waits for LibInit, then dumps every list +
scalar field in the RxsLib struct.

**Findings (post-LibInit, libBase = 0x200000):**

| Field             | Offset | Status                                           |
|-------------------|--------|--------------------------------------------------|
| rl_TaskList       | 0xA8   | EMPTY-INITIALIZED (NewList semantics OK)         |
| rl_LibList        | 0xB8   | EMPTY-INITIALIZED (NewList semantics OK) ★       |
| rl_ClipList       | 0xC8   | EMPTY-INITIALIZED                                |
| rl_MsgList        | 0xD8   | EMPTY-INITIALIZED                                |
| rl_PgmList        | 0xE8   | EMPTY-INITIALIZED                                |
| rl_RexxPort+MsgList | 0x94 | MALFORMED post-LibInit, fixed by daemon's AddPort('AREXX') |
| rl_SysBase        | 0x24   | 0x00080000 (correct ExecBase)                    |
| rl_DOSBase        | 0x28   | 0x000B0000 (correct DOSBase)                     |
| rl_REXX           | 0x4C   | 0x00201188 (constant string area)                |
| rl_COMMAND        | 0x50   | 0x00201198                                       |
| rl_TraceFH        | 0xA4   | **0x609260C4 — uninitialized garbage**           |
| rl_NumTask        | 0xB6   | 0x61E6 (garbage; benign — daemon walks linkage)  |
| rl_NumLib         | 0xC6   | 0x5C36 (garbage; benign)                         |
| rl_NumClip        | 0xD6   | 0xA00E (garbage; benign)                         |
| rl_NumMsg         | 0xE6   | 0x5268 (garbage; benign)                         |

★ — the field flagged in the original comment as the wedge cause is fully
NewList'd; the theory is disproved.

The only genuinely concerning leftover is `rl_TraceFH` (uninit FH pointer); if
TRACE is enabled later, the daemon will deref a garbage FileHandle. Not the
current wedge but worth zeroing post-LibInit.

## Probe 2 — daemon dispatch tracer (`dev/scripts/arexx-daemon-trace.ts`)

Boots the service to ready, PutMsg's a `RETURN 42` script with `rm_Action =
0x01000000` (RXCOMM), then drives the emulator forward 200K cycles WITHOUT the
TS bridge intervening. Tracks every PC and counts visits to identify the inner
loop.

**Findings:**

- 200K cycles ran cleanly (no fault, no permanent hang)
- Daemon visits 113 unique PCs
- Final state: PC = 0x1FFF6A (high-RAM stack), reply port still empty
- Hot inner loop:

| Rank | PC           | Hits   | Region                  |
|------|--------------|--------|-------------------------|
| 1    | 0x000025B2   | 45815  | RexxMast seg-1 + 0x2AA  |
| 2    | 0x000025B4   | 45815  | RexxMast seg-1 + 0x2AC  |
| 3-7  | 0x000027xx   | 4165   | dispatch outer loop     |
| 6    | 0x0007FEFE   | 4165   | exec.library WaitPort (LVO -258) |

`45815 / 11 = 4165` — the inner loop runs 11 iterations per outer cycle, and
the outer cycle calls WaitPort exactly once per iteration. So the daemon spins
WaitPort → 11-byte scan → WaitPort → repeat.

## Disassembly of the hot region

`r2 -q -c "e asm.arch=m68k; pd 30 @ 0x540" System/RexxMast` (file offsets
mapped from emulator PCs via `parse_hunk`):

```asm
0x55E (emu 0x25A2)  movea.l d0, a2            ; A2 ← msg returned by GetMsg
0x560 (emu 0x25A4)  move.l  0x1c(a2), d2      ; D2 ← msg->rm_Action
0x564 (emu 0x25A8)  move.l  d2, d1
0x566 (emu 0x25AA)  rol.l   #8, d1             ; D1.b ← high byte of rm_Action
0x568 (emu 0x25AC)  moveq   #10, d0
0x56A (emu 0x25AE)  lea     0x584(pc), a0     ; A0 ← action-code table
0x56E (emu 0x25B2)  cmp.b   (a0)+, d1          ; ← HOT
0x570 (emu 0x25B4)  dbeq    d0, 0x56e          ; ← HOT
0x574 (emu 0x25B8)  bne.w   0x65c              ; unknown action — back to wait
0x578               movea.l 0x28(a2), a1       ; A1 ← rm_Args[0] (script ptr)
0x57C               move.b  0xa(a0), d0
0x580               adda.w  d0, a0
0x582               jmp     (a0)                ; dispatch into handler

0x584 (table):     0x01 0x02 0x0A 0x0B 0x08 0x09 0x07 0x0C 0x0D 0x03
```

The constants in the table are the documented ARexx host actions (RXCOMM=01,
RXFUNC=02, etc — see `rexx/storage.h`).

## Diagnosis

For our `rm_Action = 0x01000000`:
- `move.l 0x1c(a2), d2` should load 0x01000000
- `rol.l #8, d1` rotates to 0x00000001
- `cmp.b table[0], d1` compares 0x01 against 0x01 → match on first iteration
- `dbeq` should fall through with cc=EQ → bne is NOT taken → handler dispatch fires

The fact that the scan exhausts all 11 entries every time means **the daemon is
NOT seeing 0x01 in D1.b**. Either:

1. **A2 isn't pointing at our msg.** Daemon's GetMsg returns a different
   address — possibly a stale msg, possibly NULL (then `0x1C(NULL)` reads from
   absolute address 0x1C, wherever that lands in our memory map).

2. **rm_Action was clobbered between PutMsg and the dispatch read.** Our
   `executeRexxScript` writes 0x01000000 at `msgAddr + 28`. If RexxMast's
   port-handling code or rexxsyslib's CreateRexxMsg fills in rm_Action itself
   later (overwriting our value), the daemon would read whatever default the
   library writes.

3. **Our msg link fields confuse the daemon's port walk.** PutMsg adds the
   msg to the port's tail. If the daemon's reply-list walking thinks it has a
   different msg to dispatch (e.g. the port's mp_MsgList head sentinel itself),
   it'll read rm_Action from the LIST HEAD → garbage.

## Wedge persistence — why the spin doesn't terminate

Our `ExecLibrary.waitPort()` returns the head msg WITHOUT removing it (correct
per RKRM — only GetMsg removes). After the daemon's "unknown action" branch
at 0x65C, presumably it loops back to `WaitPort` without calling `GetMsg`.
So the same msg sits on the queue forever, the port stays signaled, and every
WaitPort returns instantly. Combined with `dbeq` exhausting on every visit,
that's a tight 45815-cycle inner spin with zero progress.

Even if we figure out the rm_Action read issue, we'll also need to verify
the daemon's "unknown action" path actually calls GetMsg + ReplyMsg before
re-entering Wait — otherwise an unknown action would still hang the daemon
on a real Amiga. So the action-table miss is almost certainly THE bug, and
fixing that will let the dispatch reach a known handler.

## Recommended next-session experiment

Extend `arexx-daemon-trace.ts` to set a PC breakpoint at `0x25A4` (the
`move.l 0x1c(a2), d2` instruction) and dump:

- A2 register value
- 64 bytes of memory at A2 (msg layout from daemon's POV)
- A2+0x1C content (what rm_Action the daemon actually sees)
- The msgAddr we wrote earlier (so we can compare)

If `A2 != msgAddr`, the bug is in the GetMsg/RemHead path. If `A2 == msgAddr`
but `[A2+0x1C] != 0x01000000`, something between PutMsg and dispatch is
zeroing or rewriting the field.

## Affected files

- `web/backend/src/services/arexx/rexxmast-service.ts:1140-1163` — comment is
  misleading; rewrite to reflect actual finding.
- `dev/scripts/arexx-libinit-probe.ts` — new diagnostic, kept under dev/.
- `dev/scripts/arexx-daemon-trace.ts` — new diagnostic, kept under dev/.

## Status

**Diagnostic phase + first fix shipped same session.**

### What we found out (correction to the recommended-experiment plan)

The breakpoint dump at PC = 0x25A4 showed `A2 = 0x0` — the daemon was reaching
the action-dispatch routine with a NULL msg pointer. Tracing the caller (file
0x3B6-0x3E0) revealed the actual mechanism:

```asm
0x3B6  move.w  0xe6(a5), d2     ; D2 = rl_NumMsg counter
0x3BA  bra     0x3cc             ; jump into dbra
0x3BC: subq.w  #1, 0xe6(a5)
0x3C0:  lea     0xd8(a5), a0     ; A0 = rl_MsgList
0x3C4:  jsr     -0x102(a6)       ; LVO -258 = RemHead (NOT WaitPort as I'd assumed)
0x3C8:  bsr.w   action_dispatch   ; with D0 = popped msg (NULL since list empty)
0x3CC:  dbra    d2, 0x3bc         ; loop rl_NumMsg times
0x3D0  bra     0x3d6              ; THEN process the REXX port
0x3D2:  bsr.w   action_dispatch
0x3D6:  lea     0x80(a5), a0      ; A0 = rl_RexxPort
0x3DA:  jsr     -0x174(a6)        ; LVO -372 = GetMsg (the REAL message poll)
0x3DE:  tst.l   d0
0x3E0:  bne.b   0x3d2
```

The daemon does TWO sequential dispatch passes per Wait wakeup:
1. Drain `rl_MsgList` (deferred replies from earlier host commands, RemHead loop).
2. Drain the REXX port (real new messages, GetMsg loop).

Pass 1 uses `rl_NumMsg` (uword at libBase + 0xE6) as the dbra counter.
**`rl_NumMsg` was sitting at 0x5268 (uninitialised AllocMem leftover)**, so the
daemon ran ~21,097 RemHead calls on its empty deferred list, dispatching with
D0=0 each time, before reaching pass 2. With our 200,000-cycle trace cap, it
never made it to pass 2 — that's why earlier I incorrectly concluded the
daemon was stuck in a WaitPort spin. The "WaitPort LVO trap" was actually the
RemHead LVO trap; the two LVOs are different exec library functions, and I'd
guessed wrong without checking the project's exec-vectors mapping.

### The fix

`rexxmast-service.ts:567-595` now zeros the six trailing scalar fields after
`runLibInit()` returns:

| Field        | Offset | Why                                                |
|--------------|--------|----------------------------------------------------|
| rl_TraceFH   | 0xA4   | Avoid garbage FH deref if TRACE is later enabled  |
| rl_NumTask   | 0xB6   | Defensive (rl_TaskList counter)                    |
| rl_NumLib    | 0xC6   | Defensive (rl_LibList counter)                     |
| rl_NumClip   | 0xD6   | Defensive (rl_ClipList counter)                    |
| rl_NumMsg    | 0xE6   | **Load-bearing** — drives the daemon's dbra loop  |
| rl_NumPgm    | 0xF6   | Defensive (rl_PgmList counter)                     |

Regression test `tests/services/rexxmast-counters.test.ts` (6 tests, gated on
binaries+ROM presence) pins each field at zero post-`start()`.

### Result

With the counters zeroed, the daemon trace output:

- Pre-fix:  200,000 cycles, 113 unique PCs, message stuck on AREXX port.
- Post-fix: **254 cycles**, message round-trips back to the reply port,
  rm_Result1 = **500** (the documented ARexx error for "program not found").

`rm_Result1 = 500` is the daemon successfully dispatching: with action=RXCOMM
it treats `rm_Args[0]` as a script *name* to look up via rexxc, not inline
source. Setting `RXFB_STRING` (bit 18) didn't change the result for this binary
— the AmiExpress RexxMast 36.5 daemon hands all RXCOMM lookups to rexxc as
filenames regardless of the flag. Inline-string evaluation would require
either (a) writing the script to a temp file and passing its path, or (b)
driving rexxc as a child process under our DOS layer; both are out of scope
for this session.

### Follow-up scope

Daemon-driven dispatch ABI is now functional end-to-end at the message level.

**Additional probe — script-name vs inline-source:** Trying `rm_Args[0] =
"AVAIL"` (a real filename) instead of inline source returned `rm_Result1 =
492` (vs 500 for inline). Same 254-cycle dispatch path. Crucially **no
`Open()` / `LoadSeg()` / `Lock()` calls were observed** during the dispatch.

**RXCOMM handler disassembly (file 0x626 + 0x6A4 + 0x666):**

```asm
; --- RXCOMM entry (file 0x626, jumped to via dispatch-table jmp) ---
0x626  moveq #1, d0
0x628  tst.w d6                  ; D6 = daemon-state flag word
0x62A  bmi 0x666                 ; if D6 < 0, common-tail with d0=1
0x62C  btst.b #6, 0x22(a5)       ; bit 6 of rl_Flags
0x632  bne 0x660                 ; if set, error path → d0=0xff
0x634  movea.l a2, a0            ; A0 = msg
0x636  bsr.w 0x6a4               ; CALL: spawn-rexxc-subtask subroutine
0x63A  bne 0x666                 ; if returned nonzero, error
0x63C  bra 0x69e                 ; success → epilogue

; --- spawn-rexxc subroutine (file 0x6A4) ---
0x6A4  movem.l d2-d4/d7/a2-a3, -(a7)
0x6A8  movea.l a0, a2            ; A2 = msg
0x6AA  move.l #0x14a, d0         ; AllocMem(330) — TaskBlock size
0x6B0  move.l #0x10001, d1       ; MEMF_PUBLIC|MEMF_CLEAR
0x6B6  jsr -0xc6(a6)             ; exec AllocMem
0x6BC  beq 0x740                 ; if NULL → moveq #3, d0; rts
0x6C0  movea.l d0, a3            ; A3 = TaskBlock
0x6C2  movem.l a3/a5, 0x20(a2)   ; rm_Result1 = TaskBlock, rm_Result2 = libBase
0x6C8  lea 0xa8(a5), a0          ; A0 = rl_TaskList
0x6CC  lea 0xc8(a3), a1          ; A1 = TaskBlock + 0xC8 (embedded MinNode)
0x6D0  jsr -0xf6(a6)             ; AddTail(rl_TaskList, taskblock_node)
0x6D4  addq.w #1, 0xb6(a5)       ; rl_NumTask++
0x6D8  movem.l 0x64(a5), d1-d4   ; D1..D4 = rl_TaskName, rl_TaskPri,
                                  ;          rl_TaskSeg, rl_StackSize
0x6DE  exg.l d5, a6              ; A6 ↔ D5  (D5 holds DOSBase; swap to call dos)
0x6E0  jsr -0x8a(a6)             ; dos.library CreateProc(name, pri, seg, stack)
0x6E4  exg.l d5, a6
0x6E6  move.l d0, d7             ; D7 = process pointer
0x6E8  beq 0x73a                 ; CreateProc failed → bset bit 7 of taskblock+0xea
                                  ;                     → fall to 0x740 → moveq #3, d0; rts
0x6EC..0x738   wire process to msg, send msg to process, return d0=0
0x73A  bset.b #7, 0xea(a3)
0x740  moveq #3, d0
0x742  movem.l (a7)+, ...; rts

; --- common error tail (file 0x666) ---
0x666  btst.b #20, d2            ; RXFB_RESULT bit
0x66A  beq 0x678
0x66C..0x676  formatted result branch (RXFB_RESULT set)
0x678  move.l d0, d2             ; D2 = D0 (= 3 from spawn-rexxc failure)
0x67A  beq 0x692                 ; D0==0 → success
0x67C  bmi 0x68e                 ; D0<0 → moveq #5, d0; moveq #0, d2
0x67E  exg a5, a6                ; (post-swap: A6 = libBase!)
0x680  jsr -0x60(a6)             ; rexxsyslib LVO -96 — UNIMPLEMENTED in our build
0x686  moveq #0, d0
0x688  move.w 0x2(a0), d0        ; D0 = upper word of returned ptr
0x692  movem.l d0/d2, 0x20(a2)   ; rm_Result1 = D0, rm_Result2 = D2
0x698  jsr -0x17a(a6)             ; (post-swap returned to ExecBase) — exec LVO -378 = ReplyMsg
```

**Why we get rm_Result1 = 500 / 492:**

The rexxsyslib LVO `-0x60` (-96) is called on the error tail to format the
result. **We don't implement that LVO**, so our `LibraryTraps` fallback
returns whatever default value into D0 (likely the trap address or a
heuristic). The 500/492 numbers are artefacts of that fallback — not
documented ARexx error codes.

**Real root cause:** `dos.library CreateProc` at 0x6E0 fails because
**`rl_TaskSeg` (libBase + 0x6C) is NULL**. Real ARexx populates this once at
boot via `LoadSeg("REXX:rexxc")` and reuses the segList for every script
spawn. Our setup has the LoadSeg override wired to find rexxc binaries
under `System/Rexxc/`, but nothing pre-loads rexxc and writes the BPTR to
`rl_TaskSeg`.

**The complete daemon-driven-dispatch fix** (multi-hour follow-up):

### Step 1 — task-spawn fields populated (DONE 2026-05-10)

Implemented as `populateTaskSpawnFields()` in `rexxmast-service.ts`,
called after `runLibInit()`. It LoadSeg's `System/Rexxc/RXC` (or RX
fallback) via `loadHunkBinary()` and stamps the four RxsLib fields:

| Field        | Offset | Value populated                            |
|--------------|--------|--------------------------------------------|
| rl_TaskName  | 0x64   | APTR to "rexx" string (allocMem'd)         |
| rl_TaskPri   | 0x68   | 0 (LONG)                                   |
| rl_TaskSeg   | 0x6C   | BPTR returned by LoadSeg                   |
| rl_StackSize | 0x70   | 8192                                       |

`HunkLoader.parse()` gained an optional `baseAddress` parameter (defaults
to 0x2000 for backward compat). rexxc loads at 0x4000 to avoid colliding
with RexxMast at 0x2008. Regression: 4 new tests in
`rexxmast-counters.test.ts`, gated on binaries+ROM, all green.

**Daemon trace after this fix:**
- 256 unique PCs (up from 113 pre-fix)
- Hot loop counts collapsed (×3 instead of ×45,815) — daemon is no
  longer stuck
- Final PC **0x3F76C** — inside RXC's loaded region. The daemon's
  CreateProc call at file 0x6E0 successfully spawned rexxc.

### Step 2 — rexxc runtime environment (not yet done)

After CreateProc returns, the emulator starts executing rexxc's entry
point. rexxc immediately makes calls that depend on its expected
runtime environment:

- A real CLI struct + ProcessStruct linked via Process.pr_CLI
- Open file handles wired through DOS (Input/Output)
- Possibly a working dos.library Examine() / Lock() / Read() chain on
  REXX: assigns for script loading

In our trace, rexxc wanders into low memory (PC 0x0/0x4) — almost
certainly because it deref'd a NULL field expected to point at a real
DOS structure, then jumped through whatever garbage was at 0x4.

What's needed: extend the existing DOS layer so rexxc's "I am a CLI
process running under a parent" assumptions all resolve. This is
~2-3 hours of incremental DOS-side work, comparable to what was
already done for AmiExpress doors.

### Step 3 — task scheduling (already wired)

Inspection of the existing CreateProc override in `rexxmast-service.ts:393-429`
shows it already redirects PC to the spawned segment's entry point — no
explicit scheduler needed in this singleton emulator. The daemon's
`CreateProc(rexxc)` call effectively becomes a PC switch into rexxc's
entry at 0x4008. The "process pointer" return value is just a non-zero
sentinel so the daemon's `tst.l d0; beq` gate passes.

The 2026-05-10 trace post-task-spawn-fix shows the daemon's CreateProc
fires correctly and PC lands inside RXC's code region. From that point
rexxc is the executing program until it faults or RTS's.

### Step 4 — rexxc is the wrong binary (CRITICAL FINDING 2026-05-10)

`mcp__amiexpress-debug__parse_hunk System/Rexxc/RXC` reports the binary
is only **372 bytes of code in seg-0, with seg-1/seg-2 empty**.
That's far too small to be the rexx interpreter. The Rexxc/ directory
contains user-facing CLI utilities, not interpreter images:

| Binary  | Real role                                              |
|---------|--------------------------------------------------------|
| RX      | `rx <name>` — user-facing "invoke script" CLI helper   |
| RXC     | `rxc` — "rexx control" daemon-control command          |
| RXLIB   | manage Rexx function libraries (ADDLIB/REMLIB)         |
| RXSET   | manage rexx clip variables                             |
| HI      | "hi rexx" — send greeting/exit to rexxmaster           |

**None of these is the script interpreter itself.** The real
interpreter lives *inside* `rexxsyslib.library` and is set up by
rexxsyslib's `LibInit`/internal initialization, not loaded from
disk via LoadSeg. `rl_TaskSeg` on a real Amiga is populated to point
at a code address *within rexxsyslib*, not at an external binary.

`dev/scripts/arexx-daemon-trace.ts` (extended this session with an
LVO histogram for the spawned task) captured what RXC actually does
in its 372 bytes:

```
cycle 141  exec.library -384  WaitPort         ← from PC 0x4020
cycle 144  exec.library -372  GetMsg            ← 0x4028
cycle 149  exec.library -552  OpenLibrary       ← 0x4034 (probably dos.library)
cycle 152  exec.library -132  Forbid            ← 0x403a
cycle 155  exec.library -390  FindPort          ← 0x4042
cycle 161  exec.library -552  OpenLibrary       ← 0x4050 (probably rexxsyslib)
cycle 170  rexxsyslib   -144  CreateRexxMsg     ← 0x4062
cycle 176  exec.library -366  PutMsg            ← 0x4074
cycle 180  exec.library -414  CloseLibrary      ← 0x4090
cycle 183  exec.library -414  CloseLibrary      ← 0x4096
[then 3× rexxsyslib LockRexxBase, then faults into low memory]
```

This is a **rexx-CLI-helper startup** — open libs, lookup the daemon
port, build a control msg, PutMsg it, close libs. Not what an
interpreter would do.

So our `LoadSeg("REXX:RXC")` was loading the *wrong* binary entirely.
The fix sequence needs reconsideration.

### Step 4 (corrected) — find rexxsyslib's internal interpreter entry

For daemon-driven dispatch to actually run a script, `rl_TaskSeg`
must point at the interpreter entry **inside rexxsyslib's own code**.
Path forward:

1. Disassemble rexxsyslib (33KB hunk) to find the function that real
   ARexx init/setup uses to populate `rl_TaskSeg`. RKRM rexxsyslib
   exposes a public `RexxSetVar` / `RexxNoNotice` etc. — none look
   like "the interpreter," but one of the daemon's startup calls
   probably reaches into a private entry that wraps the interpreter
   loop.
2. Alternative: HLE the interpreter. We already have a working TS
   AREXX interpreter (`AREXXInterpreter` class in `arexx.service.ts`).
   Instead of pointing `rl_TaskSeg` at 68K interpreter code, we can
   wire `CreateProc` (in `rexxmast-service.ts:393`) to detect when
   the daemon's spawned task is supposed to be the interpreter, and
   instead of switching PC, just synchronously run the TS interpreter
   against `rm_Args[0]`, then ReplyMsg the result. This is effectively
   what the current bridged `executeRexxScript` already does — it just
   bypasses the PutMsg/AREXX-port handshake. Once daemon-driven
   dispatch is wired, the bridge logic moves INTO CreateProc and
   the daemon ABI handshake becomes authentic.
3. Either path takes 4-8 hours of focused work. The HLE approach (#2)
   is faster and lets us keep the production-quality TS interpreter
   that all shipped doors verify against.

### Step 5 — defer or descope

Daemon-driven dispatch is a parity goal, not a correctness one.
Every shipped AmiExpress AREXX door already runs correctly through
the bridged path. The remaining work has high cost and low user
visibility. Recommendation: keep this research note as the
specification, but only invest the 4-8 hours when there's a concrete
user-facing reason (e.g. a door that depends on a subtle
daemon-driven-dispatch behaviour that the bridge doesn't replicate
faithfully).

This is now a standard 68K-emulation per-LVO debug arc, comparable to
the per-LVO work already done for AmiExpress doors (Bulls, S/stats,
AquaScan, etc.). Approach:

1. Add a PC breakpoint at rexxc's entry (0x4008) in
   `arexx-daemon-trace.ts`; let it run a few hundred cycles past entry
   and capture every LVO trap address that fires.
2. Cross-reference each unfamiliar LVO against
   `exec-vectors.ts` / `dos-vectors.ts`. Any LVO that hits our
   "unimplemented LVO" fallback is a candidate; implement the smallest
   subset that gets rexxc past its first script-loading step.
3. Likely first blockers (predictions based on what rexxc has to do at
   startup):
   - `dos.library Input()` (-54) / `Output()` (-60): rexxc needs CLI
     handles; we may need to allocate dummy FileHandle structs.
   - `dos.library Lock()` / `Examine()`: rexxc probes REXX: for script
     files. Our amigafs layer handles assigns; the LVOs just need to
     resolve through it.
   - `dos.library Read()` / `Open()`: actually slurp the script.
   - `exec.library Wait()` / `WaitPort()`: rexxc waits for messages
     from its own port; these already work for AmiExpress doors so
     should not be a blocker.
4. End-to-end test: PutMsg `RETURN 42` (inline source), or write
   `REXX:test.rexx` to disk and pass `"test"` as `rm_Args[0]`. Expect
   `rm_Result1 = 0` and (for inline) `rm_Result2` = result string
   argstring with the value "42".

Each of these is single-LVO scope; bring-up cost is bounded by how
many LVOs rexxc actually touches before reaching a working state.
Rough estimate: 4-8 hours of focused work spread over 1-2 sessions.

**What's NOT yet wired:**
1. Inline script source / filename delivery — both return error codes.
2. Once script execution works: host-command back-flow during the run.
   `serviceInboundMessages` already drains our host port, so this should
   mostly Just Work once rexxc is spawning.
3. The bridged path remains the default (`executeRexxScript` runs the TS
   interpreter after PutMsg) — that's fine; daemon-driven dispatch is a
   parity goal, not a correctness one. Every shipped door verified through
   the bridge continues to work.
