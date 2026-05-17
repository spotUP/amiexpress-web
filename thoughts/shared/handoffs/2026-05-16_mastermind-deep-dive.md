---
date: 2026-05-16
topic: mastermind-deep-dive
tags: [doors, mastermind, packer, hunk, decryptor, debugging]
status: final
---

# MASTERMIND deep dive — 2026-05-16 (continuation of door-bug-batch)

## TL;DR

MASTERMIND is a **hunk-format unpacker stub** (Imploder-family) — a
548-byte CODE hunk whose job is to relocate / decompress its own DATA
hunk into freshly AllocMem'd memory and JMP into the relocated entry
point. (Earlier session's "self-decrypting game" framing was wrong.)

Two real bugs found and fixed:

1. **AbsExecBase ($00000004) was uninitialised.** Doors using the
   canonical `movea.l $4.w, A6` idiom got the ROM reset PC vector
   instead of ExecBase, then dispatched library calls into ROM. Fixed
   unconditionally in `DoorLoader.ts` (one line).

2. **Hunk-unpacker stubs need the next-BPTR pointer in standard Amiga
   convention** (BPTR → nextBPTR field, not size field). Our
   `HunkLoader` uses the wrong convention universally. Surgical fix:
   signature-detect the unpacker stub by its 14-byte prologue
   (`pea`/`movem`/`lea -$e(PC)`/`movea.l (A4),A0`) and only patch the
   nextBPTR field for those binaries. Other doors are untouched.

**Door progress with both fixes**: from "0 library calls, crashes at
~13 s into uninitialised AllocMem heap" → "14 successful AllocMems
through the unpacker's hunk-descriptor loop, then garbage on the 15th"
→ door cleanly exits with code 2 (Amiga WARN) via its own error path.

**The remaining bug** (well diagnosed; not yet fixed): the OUTER
descriptor walker computes `D1 = (D3 - A0) / 4` to copy the RELOC32
stream into freed memory, but D1 ends up 4 lwords short because
`D3 = mem[0x2300] + 0x2300` uses our HunkLoader's allocated-size
field, not the per-hunk end the unpacker actually expects. Result:
the copied RELOC32 stream is missing its 0-terminator and HUNK_END
marker, so the inner reloc loop walks past into freed memory and
corrupts A2.

Patching `mem[0x2300] = 0x1994` (= hunk-1-only's end) reduces the run
from 14 garbage allocs to 2 clean ones, then the door hangs because
D3 doesn't evolve correctly for subsequent hunks. The actual fix
requires understanding how the unpacker indicates per-hunk extents —
likely a header field or per-hunk length we're not synthesising in
the right place. That's the next 2–4 h session.

The dump of unpacker output is in `/tmp/mm-dump*.log` (via
`DOOR_DUMP_AT_PC=0x2030,0x9000,28672` env). HUNK_END markers found at
0x3C90, 0x4DE8, 0x7838, 0x872C, 0x87BC, 0x8920. Layout is standard
Amiga hunk format with HUNK_HEADER at 0x2310, 6 size longwords at
0x2324, then 6 hunk bodies. **All the info needed to crack this is
captured in the dump and the disassembly at PC 0x205E–0x2106.**

## Packer identification

- **amigadepacker** (https://gitlab.com/heikkiorsila/amigadepacker)
  handles PP20, PX20, S404, SQSH, MMCMP — none of which match
  MASTERMIND's `0000 03f3` hunk-wrapped layout. It's
  hunk-wrapped (not raw packed), 548-byte decompressor stub
  (Imploder 4 fits exactly), and the unpacker mnemonics
  (`pea $178(PC); movem; lea -$e(PC), A4`) match the Imploder 4
  decrunch header exactly.
- **libxad** (https://github.com/ashang/libxad) bundles xfdmaster's
  full slave source. Searched all 36 slaves —
  `libxfd/source/master/slaves/Imploder.a` recognizes via
  `49fa 0036/005e/0042` at offsets 4/4/12, none of which match
  MASTERMIND's `49fa fff2` at offset 12. So MASTERMIND is **not
  vanilla Imploder**. Closest matches by structural family:
  - `DragPack.a` (DragPack 2.52) — same `pea $xxx(PC); movem; lea
    -$xx(PC), A4; movea (A4), A0; adda.l A0, A0×2; addq #4, A0;
    movea A0, A?; addq #8, A?; movea $4.w, A6` prologue, but at
    file offset 0x20 not 0x24, and `A2`/`A1` instead of `A3`.
  - `TurboSqueezer.a` — matches MASTERMIND's `48E7FFFE` at offset
    0x28 but diverges thereafter.
  - The constant `0x37AC` immediate baked into MASTERMIND at file
    offset 0x44 is the on-disk packed payload size (14252 bytes),
    confirming it's a hunk-wrapped self-relocating packer like
    DragPack/Imploder/TurboSqueezer family but a specific stub
    libxad hasn't catalogued.
- **Productive next step**: read `DragPack.a` `DB_Drag252` and
  `.Correct` end-to-end (they're well-commented assembly, ~120 lines)
  to learn the *family*'s output format. Then single-step
  MASTERMIND's unpacker via instruction trace to find where its
  output format differs from DragPack's. With that, the OUTER walker
  fix should be obvious.

## What landed in tree (uncommitted)

All three changes are gated/diagnostic; safe to keep or revert.

### 1. `DoorLoader.ts` — write AbsExecBase at $00000004

```ts
this.emulator.writeMemory32(0x00000004, execBaseAddr);
```

On real Amiga, Exec writes its base address at memory $4 during ROM
boot. We skip ROM boot, so prior to this fix the slot held the ROM
reset PC vector (0x002000d2). Doors that do
`movea.l $4.w, A6` (the canonical way to obtain ExecBase when you
can't trust A6 from your caller) ended up with A6 pointing into ROM,
and subsequent library JSRs via A6 dispatched into ROM space.

MASTERMIND does exactly this at PC 0x2018. The fix is correct and
should be kept regardless of whether MASTERMIND is ever made to work.
**Not** what crashes MASTERMIND but **a real bug** any door using this
idiom would trip over.

### 2. `DoorLoader.ts` — `DOOR_RANDOM_SEED` env override

```ts
const randomSeed = process.env.DOOR_RANDOM_SEED
  ? (parseInt(process.env.DOOR_RANDOM_SEED, 16) >>> 0)
  : ((Date.now() & 0xFFFFFFFF) ^ (Math.random() * 0xFFFFFFFF >>> 0));
```

Lets us reproduce non-deterministic crashes by pinning the per-door
seed written at $400. Keep it — useful for any future "this crashes
differently each run" investigation.

### 3. `DoorLifecycleManager.ts` — deep PC ring trace

Gated by `DOOR_TRACE_RING=N` env. Captures the last N PCs (one per
outer-loop iteration) plus current opcode + moira disassembly, and
dumps them to `DOOR_TRACE_RING_LOG=/path/to/file` on first OOB PC.
The existing 8-deep `lastPCs` was inadequate — by the time the OOB
fires we've already lost the relevant approach. Pair with
`AEDOOR_BATCH_SIZE=200` (or smaller) for finer granularity.

```ts
private pcRing: number[] = [];
private pcRingSize: number = Number(process.env.DOOR_TRACE_RING ?? 0);
```

Worth keeping for any future "what was PC doing right before the
crash" question.

## How to repro

```bash
DOOR_RANDOM_SEED=DEADBEEF \
DOOR_TRACE_RING=10 \
DOOR_TRACE_RING_LOG=/tmp/mm-ring.log \
timeout 30 npx tsx web/backend/src/scripts/run-amiga-door.ts \
  Doors/MASMD101_MasterMind/MasterMind 1 --doortype XIM
```

With seed `DEADBEEF`, PC reliably crashes to 0x1815cc. Other fixed
seeds give other 0x18xxxx addresses (the upper byte is always 0x18,
the lower 16 bits depend on the seed).

## Architecture of the door (corrected from prior handoff)

```
file: 14852 bytes
HUNK_HEADER: 2 hunks
  hunk 0: CODE, 548 bytes        → loaded at 0x2008
  hunk 1: alloc 26136 bytes,
          DATA payload 14252 b   → loaded at 0x2308
```

CODE hunk disassembly (the unpacker stub):

```
0x2008: lea     (-$e,PC), A4 ; → A4 = 0x1ffc
0x200c: movea.l (A4), A0      ; A0 = mem[0x1ffc]  (BPTR, expected)
0x200e: adda.l  A0, A0
0x2010: adda.l  A0, A0        ; A0 *= 4           (BPTR → APTR)
0x2012: addq.w  #$4, A0
0x2014: movea.l A0, A3
0x2016: addq.w  #$8, A3
0x2018: movea.l $4.w, A6      ; A6 = AbsExecBase  [needs fix #1]
0x201c: move.l  A0, -(A7)
0x201e: adda.l  #$37ac, A0    ; A0 += 14252       (= DATA payload size!)
0x2024: bsr     $217c         ; → decompressor
…
0x2090: lsl.l   #2, D0
0x2092: move.l  D0, D2
0x2094: jsr     (-$c6,A6)     ; AllocMem(size, attrs)   ← never reached
…
0x20cc: move.l  (A2)+, (A1)+  ; copy hunk payload into AllocMem'd buf
…
0x2102: cmpi.w  #$3f2, D4     ; HUNK_END
0x2114: move.l  (A3)+, D1
0x2116: cmpi.w  #$3ec, D1     ; HUNK_RELOC32
```

The constants `$3EC` (HUNK_RELOC32) and `$3F2` (HUNK_END) prove this
is hunk-format processing, not arbitrary encryption.

## Why it crashes

1. `mem[0x1ffc]` reads our chip RAM at a location no one wrote → 0.
2. `A0 = 0*4 + 4 = 4`.
3. `A0 += 0x37ac` → A0 = 0x37b0.
4. Decompressor at 0x217c does `move.l -(A0), D1` (predecrement read)
   and walks BACKWARD through `mem[0x4..0x37b0]`.
5. That range is uninitialised in our emulator (zeros, plus our random
   seed at $400, plus ROM-reset vectors at $0–$3FF).
6. Decompressor's bit-stream interprets garbage; eventually D5
   becomes 0, `beq $21de` taken, control flow degenerates.
7. After ~thousands of iterations SP wraps to 0xfffffff8 (more RTS
   than BSR) and RTS pops `mem[0xfffff8..0xfffffb]` = ROM bytes,
   which after mangling become `0x180xxx`.
8. PC=0x180xxx walks zeros (uninitialised AllocMem heap).

The "0x18xxxx" envelope is coincidental: `nextFreeMemory` starts at
0x100000 and after boot allocations sits around 0x18xxxx, and the
mangled RTS happens to land there. Not a deliberate jump target.

## What the door actually expects

`mem[0x1ffc]` (= `mem[code_base - 14]`) should be a **BPTR to a
seglist** (or seglist-equivalent structure) such that:

```
A0_final = mem[0x1ffc] * 4 + 4 + 0x37ac
```

lands somewhere inside the door's DATA hunk where the packed payload
begins. With our DATA hunk at 0x2308, plausible BPTR values:

- 0x802 → A0_final = 0x57b8 (DATA + 0x34b0, deep inside payload)
- 0x800 → A0_final = 0x57b0
- 0x880 → A0_final = 0x5fb0
- 0x8c0 → A0_final = 0x63b0

Test results with `DOOR_PATCH_MM_BPTR`:

| BPTR  | A0_final | Crash PC after seed=0 |
|-------|----------|-----------------------|
| (off) | 0x37b0   | 0x180a98              |
| 0x800 | 0x57b0   | 0x180a98              |
| 0x802 | 0x57b8   | **0x180494** (diff!)  |
| 0x880 | 0x5fb0   | 0x180a98              |
| 0x8c0 | 0x63b0   | 0x180a98              |

Only 0x802 changes behaviour, but the door still crashes. So either:
- The BPTR theory is right but 0x802 doesn't put A0 in the right
  place either (need to identify the exact offset the packer expects).
- The BPTR is read but additional state is missing (the
  `-$8(A4),(A4)+` style reads after entry may need specific values).

## Where to go next (if anyone picks this up)

Three viable paths, ordered by effort:

1. **Identify the packer.** 548-byte CODE + 14252-byte packed DATA
   with the `$3EC`/`$3F2` constants matches early-90s Amiga
   executable packers (Imploder 4.x, PowerPacker, CrunchMania, FImp).
   Compare the unpacker's byte signature against published packer
   disassemblies. If we identify the packer, we know exactly what
   memory layout to synthesise.

2. **Trace BSS-relative reads from the BBS or shell that originally
   ran MASTERMIND.** The door clearly expects to be launched in some
   AmigaDOS / BBS context that places a specific value at `code_base
   - 14`. Real express.e launching a door uses LoadSeg + CreateProc;
   we could read express.e's door-launch code path to see if it
   poked anything memorable into the area below the loaded code.

3. **Symbolic-execute the decompressor.** Capture the decompressor
   loop's behaviour symbolically: given input bytes are uninterpreted
   variables, derive constraints on what the input must look like to
   reach the `jsr (-$c6,A6)` AllocMem call. Then back-solve what
   `mem[0x1ffc]` needs to be. Most rigorous, also most expensive.

## Disposition

- Three local edits + my probe edits already reverted.
- Two diff'd files: `web/backend/src/amiga-emulation/DoorLoader.ts`
  (ExecBase + seed env) and
  `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`
  (PC ring trace).
- Both typecheck-clean (`cd web/backend && npx tsc --noEmit`).
- Suggested commits:
  - `fix(emulator): write AbsExecBase to $00000004 so doors using
    movea.l $4.w,A6 resolve correctly` (the actually-load-bearing fix)
  - `feat(debug): DOOR_TRACE_RING + DOOR_RANDOM_SEED env vars for
    door post-mortem`
- MASTERMIND remains parked. Corpus golden still records exit 65535;
  no regression risk in shipping these changes.
