# Handoff — 2026-04-20 (late)

## Six fixes landed on `main`

```
9e3966c08 fix(68k): always reply DT_SLOTNUMBER for cross-node queries
12f1e9f1b fix(68k): gate hybrid input injection on AEDoor waitForReply
73c2dcfc9 fix(68k): AEDoor WriteStr restores native msg.data semantics
52770b4d8 fix(68k): pre-create RAM:T so doors can write to it
87749febe fix(68k): XIM CLI args = node only, not runtime parameters
d7d1cc1e9 fix(68k): honor AmigaDOS MODE_OLDFILE fail-if-missing semantics
```

User-visible: dRE!WAll draws correctly (WriteStr newline), AquaScan
no longer exits RC=5 on login (CLI args), zOOsTAT no longer errors
on RAM:T/ZOOSTAT.TMP, WarOLM survives arrow-key nav (injection gate).
All typecheck-clean. See commit bodies for rationale.

## WarOLM cross-node OLM delivery — what's actually going on

"nODE iS rEADY, oLM hAVE bEEN sENT..." prints, **but the message
never reaches the target node**. Prior handoff's `LISTS/<slot>`
theory was wrong.

Disasm of the delivery loop at file `0x11DE`:

```
0x11fa: moveq  0x4, d0          ; JH_SM
0x1200: move.l d0, 0xe0(a0)     ; msg.command
0x1208: adda.w 0x14, a0         ; msg.string
0x120e: move.b (a1)+, (a0)+     ; copy line
0x1220: bsr.w  0x131a           ; SendAEServer(target)
```

Delivery = `PutMsg(JH_SM)` to `AEServer.<target>`, one per line.
`Open("LISTS/<slot>")` is just a queue-presence probe.

**Our cross-node handler at
`web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:236-274`
already routes `JH_SM` → target's socket.** It just never gets called,
because WarOLM takes a `beq.w 0xf8e` early-exit at one of:

| File PC | Test                         | Failure means              |
|---------|------------------------------|----------------------------|
| 0xDD0   | `tst.l d7`                   | line count == 0            |
| 0xDD8   | `tst.w 0x11a(a7)`            | Y/n answer == 0            |
| 0xDE8   | `tst.w d0` after `bsr 0x122c`| wait-for-idle said bail    |

Trap log between success banner and `JH_SHUTDOWN` shows **no
`STATS@N` poll or `Delay()`** — bailout fires BEFORE `0x122c`, so
the failing test is check 1 or 2. Most likely D7 (line count) is 0
because the line-editor state isn't where the door expects.

## Next-session tasks

1. **Instrument PCs 0xDD0/0xDD8/0xDE8** to log D7 and `0x11a(a7)`.
   `DOOR_PC_PROBE_RANGES` didn't fire at runtime `0x2DA6` this
   session — address mapping needs empirical verification. Binary
   loads code at runtime `0x2008`, hunk header is `0x30` bytes, so
   file `0xDCE` should map to `0x2008 + (0xDCE - 0x30) = 0x2DA6`.
   Verify by dumping actual door-code PCs during execution and
   triangulating.
2. If D7==0: line-editor isn't committing our typed line into the
   `0x188(a7)` 10×200-byte buffer. JH_LI reply mismatch — look at
   `0x1ACA`.
3. If `0x11a(a7)`==0: our "Y" isn't landing where WarOLM reads it.
   JH_HK reply bug specific to this door.
4. Once the delivery loop runs, cross-node routing is done.

## Verified live (via MCP harness)

- `MODE_OLDFILE` returns `IoErr=205` when file missing ✓
- `DT_SLOTNUMBER` returns nodeId unconditionally ✓ (WarOLM now
  forms `LISTS/2`, was `LISTS/` with empty slot before)
- Cross-node `JH_SM` handler wiring ✓ (not exercised this session)

## Open items carried forward

- **SysInfo sync waitForReply** blocks JS event loop for full 10000
  iters; my gate is correct but can't deliver input during the sync
  poll. Real fix: async-with-yields on `AEDoorLibrary.waitForReply`
  — non-trivial, traps are fully sync.
- WarOLM editor cursor `[11A` offset (cosmetic).
- Row 00 phantom in Olm table (LOWNODE=0).
- Input lag — `AEDOOR_BATCH_SIZE` exposed; needs live
  `DOOR_PROFILE=1`.

## Working-tree (uncommitted, from prior session)

`AmigaDoorSession.ts`, `ExecLibrary.ts`, `DoorLifecycleManager.ts`,
`index.ts` — debugRegistry wiring, `[CopyMem-100]` console.log,
`dosLib.isDelayed()` 10ms yield, `(global as any).io = io`. Not
mine — check with whoever was working on those.

## Server state

Backend started/stopped via MCP harness for live OLM test. All
processes killed, lockfile clean. Kill path if needed:
`./dev/scripts/kill-servers.sh`.

Ports: Frontend 5174, Backend 3001, Telnet 2323, SSH 2222.
