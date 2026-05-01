---
date: 2026-04-25
topic: dos.library DateStamp D0 propagation + CTOP investigation
tags: [amiga-emulation, dos.library, ctop, lvo, regression-test]
status: implemented
---

# dos.library DateStamp() D0 propagation fix + CTOP investigation

## Tasks
Continue the deferred backlog item: investigate the CTOP "Reset date is out of
range" failure under the hypothesis that our `dos.library DateStamp()` LVO
dispatcher fails to propagate D0, causing Amiga E callers like Conftop's
`getSystemDate()` to read a stale register and write garbage into Conftop.Data.

## Findings

### Real bug found and fixed (independent of CTOP)
- `web/backend/src/amiga-emulation/api/DosLibrary.ts:6242-6249` — the
  `_LVODateStamp` (-192) case in `handleCall` invoked `this.DateStamp()` but
  discarded its return value, so D0 retained whatever the caller had set
  beforehand.
- `DosLibrary.DateStamp()` itself is correct — it writes ds_Days/ds_Minute/ds_Tick
  to memory at D1 and returns the pointer (matching the AmigaOS dos.library
  contract: D0 = pointer to DateStamp, same as D1).
- Note: there is a parallel vector-table dispatcher in
  `web/backend/src/amiga-emulation/api/library-vectors/dos-vectors.ts:213-219`.
  That handler `return lib.DateStamp()` is correct because the trap framework in
  `LibraryTraps.ts:1554-1556` writes the handler's return into D0. Only the
  `handleCall` path was broken.
- Fix: set `D0 = this.DateStamp()` in the `handleCall` case.
- Regression test:
  `web/backend/tests/amiga-emulation/datestamp-d0-return.test.ts` — verifies the
  dispatcher leaves D0 = the input D1 pointer. Test fails before the fix with
  `Received: 67135776` (= 0x04006920, the exact byte pattern showing up in
  Conftop.Data — a coincidental smoking-gun that nudged the investigation).

### CTOP is NOT fixed by this change
Smoking-gun was misleading. End-to-end test:
1. With the fix in place, `[dos.library] DateStamp() days=17646, minutes=…` is
   the value our DosLibrary returns and writes (correct for 2026-04-25).
2. The on-disk header still reads `04 00 69 20 58 60 00 00`.
3. Conftop v2.3 still prints `CONFTOP (ERROR): Reset date is out of range.`
   on the next invocation.

### Why the v2.3 binary is the real problem
- Binary: `Doors/Conftop/Conftop020.x`, `$VER: Conftop v2.3 by Bobo/Mystic` —
  a different door from `Documentation/7-Reference Sources/AmiExpressEDoorSources/Conftop-II/ctop.e`.
  ctop.e is Conftop-II (open source); the binary on disk is the closed-source v2.3.
- Reference SanctuaryBBS/Conf*/Conftop.Data files all start with the same
  `04 00 6X XX YY 60 00 00` packed header (`0x040068ec`, `0x0400629d`,
  `0x04006920`). That format appears to be the binary's expected on-disk encoding
  — NOT a misuse of `ds_Days` from DateStamp.
- "Reset date is out of range" comes from the binary's own range check after
  recomputing the new resetDate. The recomputation must be doing something
  beyond the simple `getSystemDate() + 1` you'd expect from ctop.e.

### Confirmed evidence (so we don't re-investigate)
- Two `[dos.library] DateStamp() days=17646` calls happen between
  `[dos.library] CurrentDir(...)` and `[FileHandle] write 262 bytes to … Conftop.Data`.
- No `utility.library`, `timer.device`, `EClock`, or other date-source calls
  appear in that window. DateStamp is the only time source.
- Before the fix and after the fix the file bytes are identical
  (`04 00 69 20 58 60 …`). The fix is real for ABI correctness but invisible
  to Conftop v2.3.

## Files changed
- `web/backend/src/amiga-emulation/api/DosLibrary.ts:6242` — propagate D0.
- `web/backend/tests/amiga-emulation/datestamp-d0-return.test.ts` — new file,
  regression test using a minimal stub MoiraEmulator.

## Memory updates
- `~/.claude/projects/-Users-spot-Code-amiexpress-web/memory/project_door_bug_backlog.md`
  — moved DateStamp fix to FIXED list, expanded CTOP entry with v2.3 binary
  finding so we don't repeat the dead-end DateStamp hypothesis.

## Next steps for CTOP (when prioritized)
1. Disassemble `Conftop020.x` and find the `0x04006XXX` write site. The format
   is binary-specific and looks like `(month_byte | 0x00 | low_word)` or a
   packed (days-since-X)/(some-counter) tuple.
2. Once decoded, either replicate the format in our emulator's date helpers or
   emit it from a small wrapper.
3. Alternative: hide CTOP from the menu and reimplement as a TS door that
   reads CALLERS.LOG / DLSTATS to compute the same stats — would side-step
   the closed-source format entirely.

## Verification
- `cd web/backend && SKIP_DB_INIT=1 npm test -- tests/amiga-emulation/` — 247
  tests pass across 9 suites including the new one.
- `cd web/backend && npx tsc --noEmit` — clean.
- End-to-end harness run (`Conftop020.x` via `run-amiga-door.ts`) shows correct
  DateStamp output but unchanged Conftop behavior, confirming the fix is sound
  for what it covers.
