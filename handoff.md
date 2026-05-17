# Handoff

## 2026-05-16 — Door bug batch (4/5 fixed, uncommitted)

Full session writeup: `thoughts/shared/handoffs/2026-05-16_door-bug-batch.md`.

### Status

4 user-reported door bugs fixed locally on `main`, **uncommitted**.
1 (MASTERMIND) parked — needs deeper instruction trace, not a quick fix.

| # | Door     | Issue                                       | Status     | Touched                                          |
|---|----------|---------------------------------------------|------------|--------------------------------------------------|
| 2 | 5D-LogOff | `Y` reloads page (door re-launches itself) | fixed      | `door.handler.ts` (RETURNCOMMAND self-recursion guard) |
| 3 | AquaPWFail | "Error reading CallersLog!" each entry    | fixed      | `PathManager.ts` (relative-path baseDir fallback) |
| 4 | GrapeBooth/Vote | "Error trying to save users cfg!!"   | fixed      | installed `Config.Txt` + `MainMenu.Txt` + `Users/` + `Votes/` |
| 5 | MASTERMIND/LUCKY | exits 65535, zero XIM ops          | **parked** | n/a — corpus golden already records exit 65535 |
| 6 | EALL     | rejects sysop as "disabled user"            | fixed      | `DoorMessageHandler.ts` (DT_SECBOARD/SECLIBRARY/SECBULLETIN) |

### MASTERMIND deep-dive — 2026-05-16 evening

Full writeup: `thoughts/shared/handoffs/2026-05-16_mastermind-deep-dive.md`.

- Door is a hunk-format **Imploder-family unpacker stub** (548-byte
  unpacker + 14252-byte packed DATA payload).
- Two real fixes landed (uncommitted, both safe for other doors):
  1. **`DoorLoader.ts`**: write `ExecBase` to AbsExecBase at
     `$00000004`. Doors using `movea.l $4.w,A6` now resolve A6
     correctly instead of the ROM reset PC vector.
  2. **`DoorLoader.ts`**: signature-detect hunk-unpacker stubs by
     their 14-byte prologue (`pea`/`movem`/`lea -$e(PC)`/`movea.l`)
     and patch nextBPTR at `code_base-4` to standard Amiga convention
     (BPTR → nextBPTR field, not size field). Only MASTERMIND-style
     binaries are touched; WHO + AquaScan still pass.
- Door progresses from "crashes ~13s in with 0 lib calls" → "14
  AllocMems through the unpacker's descriptor loop, then garbage on
  the 15th." **Still doesn't render** — closing the last gap requires
  reverse-engineering the Imploder-family output format (~2–4 h).
- Diagnostic helpers kept in tree: `DOOR_TRACE_RING=N` (deep PC ring
  dumped on first OOB), `DOOR_RANDOM_SEED=HEX` (reproducible seed at
  $400), `DOOR_TRACE_ALLOCMEM_CTX=1` (per-AllocMem register + A3-mem
  context).

### Next session — punch list

1. Verify the four earlier fixes via telnet/web client (commits already
   on `main`: f3ed9e043, abfff8347, 319a99553, 2f589adba).
2. Review & commit MASTERMIND deep-dive deltas in working tree:
   - `fix(emulator): write AbsExecBase to $00000004 on door load`
   - `fix(emulator): standard-Amiga BPTR for hunk-unpacker stubs`
   - `feat(debug): DOOR_TRACE_RING / DOOR_RANDOM_SEED / DOOR_TRACE_ALLOCMEM_CTX`
   See `thoughts/shared/handoffs/2026-05-16_mastermind-deep-dive.md`.
3. Optional: finish MASTERMIND — Imploder unpacker-output format
   reverse-engineering (where does HUNK_END appear in the unpacker's
   descriptor stream?).

### Prior session (archived)

The previous root-level handoff (2026-05-12 corpus / probe / universe stub
elimination — 38 → 62 corpus doors, BBSYES recovery, etc.) is in
`thoughts/shared/handoffs/2026-05-13_corpus-expansion-second-pass.md`.
Corpus untouched this session; still at 324 entries.
