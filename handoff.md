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

### MASTERMIND diagnosis (for next time)

- Door is a self-decrypting stub: 548-byte CODE decryptor + 26136-byte
  encrypted DATA segment.
- After ~13s of CPU activity with ZERO library calls, `DoorLifecycleManager`
  traps an out-of-bounds PC: `Previous PC 0x21d2 (lsr.l D4,D5) → New PC
  0x1804b4 (OUT OF BOUNDS)`.
- The "scattered letters" / "ORIGINAL SIN IS GOOD" art seen in screenshots
  was the FRONTEND login scroller, **not** MasterMind. MasterMind never
  renders anything.
- Ruled out: 68000-vs-68020 (moira is in M68020 mode); CLI command-name
  BSTR at 0xf0080 (tried, no effect, reverted).
- Real fix path: per-instruction tracing in `moira-wrapper.cpp` gated on
  this door, walk forward from entry 0x2008 to find which indirect jump
  computes the bad target and what register/memory it reads to do so.
  See full handoff for breadcrumbs.

### Next session — punch list

1. Verify each fix via telnet/web client.
2. Commit. Suggested 4 commits:
   - `fix(door): RETURNCOMMAND self-recursion guard`
   - `fix(emulator): bare-relative path fallback to BBS root`
   - `fix(emulator): DT_SECBOARD/SECLIBRARY/SECBULLETIN return correct fields`
   - `chore(doors): install GrapeBooth config + dirs`
3. Optional: deep-dive MASTERMIND (2-4h session).

### Reverts before this handoff

- Speculative 0xf0080 BSTR write in `DoorLoader.ts` — reverted.
- `[AED-TRACE]` console.logs in `AEDoorLibrary.ts` — reverted.
- Generic AEDoor trap-dispatcher tracing in `LibraryTraps.ts` — reverted
  (had caused startup crash loop during the session).

### Prior session (archived)

The previous root-level handoff (2026-05-12 corpus / probe / universe stub
elimination — 38 → 62 corpus doors, BBSYES recovery, etc.) is in
`thoughts/shared/handoffs/2026-05-13_corpus-expansion-second-pass.md`.
Corpus untouched this session; still at 324 entries.
