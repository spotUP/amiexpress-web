---
date: 2026-04-20
topic: warolm-delivery-and-cursor
tags: [68k, olm, warolm, multinode, ipc, editor]
status: draft
---

# WarOLM — cross-node delivery + editor cursor offset

## Task

Two follow-ups from the WarOLM stabilization work committed in
`7c458dd2c`:

1. **Cross-session OLM message delivery** — WarOLM's multi-node table
   and status now render correctly (commit `7c458dd2c`), but a message
   typed on node A still never reaches node B's terminal. Even after
   the target becomes IDLE, the delivery write is made into the
   sender's emulator only.
2. **Editor cursor `[11A` offset** — the line-input editor in WarOLM
   paints the top/bottom "=======" box borders at the wrong row, and
   the first edit line (`1>`) lands on top of the color-palette help
   row. Likely a row-count discrepancy between what WarOLM emits and
   what our terminal renders (ANSI cursor-up counts don't match).

## Critical references

### Fixes already shipped (commit `7c458dd2c`, pushed to `main`)

- `web/backend/src/amiga-emulation/utils/env-initializer.ts` — seed
  STATS@N only when absent; don't clobber live user status on every
  DosLibrary init.
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:650, 1044` —
  `setEnvStat(DOORS)` on launch, `setEnvStat(IDLE)` on cleanup.
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts:5276` — invoke
  doorMessageCallback for current-node AEServer and for cross-node
  AEServer.`<N>` (needed so the msg reply keeps the door's saved
  msg-pointer valid).
- `web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:167-218`
  — new branch that handles cross-node AEServer queries; fetches the
  target node's handle/location from `MulticomManager.getNode(nodeId)`
  and writes it into the jhMessage String[200] before replying.
- `web/backend/src/amiga-emulation/LibraryManager.ts:389` — AEServer
  sigBit changed from 12 (SIGBREAKB_CTRL_C) to 17 (dynamic msg-port
  bit). Bit 12 was triggering false CTRL_C detection in WarOLM's
  `SetSignal(0, 0x3000)` break poll → FAIL exit after 2 rows.
- `web/backend/src/nodes/MulticomManager.ts` — added public
  `getNode(nodeId): NodeInfo | null` for cross-session user lookup.
- `Documentation/6-Progress/WAROLM_INVESTIGATION_2026-04-20.md` — full
  investigation trace.

### WarOLM binary disasm landmarks

All offsets are r2 file offsets (file starts at `0x00`; code hunk at
file `0x30`, data hunk 1 at file `0x3D10`). For runtime addresses: code
hunk loads at `0x2008`, data hunk at `0x5D08`.

- `0x704–0x862` — per-node render loop (iterates `LOWNODE..HIGHNODE`).
  LOWNODE/HIGHNODE read from `Config.info` tooltypes at startup (see
  `0x5D0–0x5EA`). Our test config has `HIGHNODE=3`, no `LOWNODE` so 0.
- `0x1286` — `readEnvStats(nodeId) → status`. `fopen("ENV:STATS@%d")`,
  `fread` 80 bytes, parse ASCII digits at buffer bytes 0x24/0x25 as
  the 2-digit status. Returns `0xFF` when fopen fails. Format string
  at hunk1+0xD52.
- `0x131a` — `queryNodeField(nodeId) → string at msg[0x14]`. Builds
  `"AEServer.%d"`, FindPort, PutMsg/WaitPort/GetMsg; stores result
  msg pointer at hunk1+0x1498 (in BSS). Fields pre-set by caller:
  msg[0xE0]=command (100=DT_NAME, 102=DT_LOCATION), msg[0xDC]=data=1
  (READ).
- `0xCB2–0xCD8` — OLM "has been sent" success path. After
  `0x1286` returns status==0 (IDLE), prints the "nODE iS rEADY, oLM
  hAVE bEEN sENT..." message (hunk1+0x9E4) to sender's screen only.
  **Does not itself deliver the message.**
- `0xDBC–0xE14` — **actual delivery site.** After printing
  success/busy text, the code:
  - `bsr 0xFBA` — pre-delivery cleanup (not yet investigated).
  - Sets `msg.command = 2` (JH_SHUTDOWN) and sends via `0x1162`.
    WarOLM tells the BBS it's exiting.
  - `tst.l d7; beq 0xf8e` — skip if no lines entered.
  - `tst.w 0x11a(a7); beq 0xf8e` — skip if user said No.
  - `move.l 0x97c(a7), -(sp); bsr 0x122c` — wait-for-idle loop.
    `0x122c` repeatedly reads STATS@N until status==0 (IDLE), returns
    1; returns 0 if target is SHUTDOWN (24) or unreachable (0xFF).
  - `tst.w d0; beq 0xf8e` — skip if unreachable.
  - `pea #1; pea 0xb42(a4); move.l 0x984(a7), -(sp); bsr 0x11de`
    — loop setup. `0x984(a7)` is the line-count (d7 rounded up).
  - Inside the loop (not yet fully disassembled, starts at `0x11DE`):
    `pea 0xb9a(a4); pea 0xb94(a4); pea 0xb8e(a4); pea 0x13b(a7);
    pea 0xb88(a4)` — these pea's push the current line pointer
    (`0x13b(a7)` is inside the 2000-byte line buffer at `0x188(a7)`
    that the editor filled with up to 10×200-byte lines). Appears to
    format a per-line delivery command and invoke it.
  - **Next-session task:** disassemble from `0x11DE` forward, identify
    the actual target write (likely either a `Open("ENV:OLM@%d", MODE_NEWFILE)`
    + `Write` sequence, or a PutMsg with a specific command code to
    `AEServer.<target>`).

### Edit-buffer layout

`0x188(a7)` is the start of the 10×200-byte line buffer. Each line
stored at `0x188(a7) + d7*200`. Line index `d7` increments from 0 to 9;
loop at `0xBCC–0xBF8` writes each line via `JH_LI` input (`0x1ACA`) and
strcpy's it into the slot.

### Config.info tooltypes (read at startup)

- `HIGHNODE=3` — upper bound of render loop. atoi'd by `0x2F98`.
- `LOWNODE` — missing → defaults to 0 (phantom row 00 is a
  consequence; rendering an empty STATS@0 results in a blank row).
- `ASK_BEFORE_SENDING=YES`
- `FORM=` (empty)
- `ICONFACE=` (empty)

## Recent changes in this session

See commit `7c458dd2c` on `main`, pushed to origin.

## Learnings

- **WarOLM is file-driven for status, port-driven for user data.**
  STATS@N file gives the numeric status; AEServer.N port query
  (DT_NAME/DT_LOCATION) gives handle/location. Our fixes cover both.
- **sigBit=12 was a trap.** Setting port.sigBit to SIGBREAKB_CTRL_C
  (bit 12) made every PutMsg look like a CTRL_C to doors that poll
  `SetSignal(0, 0x3000)`. Bit 17 is the correct choice — any door
  that waits on `0x21000` still wakes via the port-bit half of the
  mask, and well-behaved doors no longer see phantom CTRL_Cs.
- **NULL msg pointer corruption cascade.** The reason WarOLM exited
  FAIL after 2 rows *before* the sigBit fix was distinct: WarOLM
  stores the msg pointer returned by `GetMsg` into hunk1+0x1498 every
  iteration. When a reply never came back (because our callback
  didn't process non-current AEServer ports), GetMsg returned NULL,
  the global got clobbered to 0, and subsequent iterations PutMsg'd
  with msg=0. Low memory at address 0+0x14 accidentally served as the
  "string buffer" (since both read and write agreed on addr 0x14), so
  row 01 looked like it worked even though it shouldn't have. The
  fix is to always reply on cross-node AEServer queries — even when
  we have no useful data to return.
- **Door exits post-OLM-delivery.** WarOLM's design is
  send-then-die: it issues JH_SHUTDOWN *before* the actual message
  write. That means the delivery code runs after the BBS thinks the
  door has exited. Whatever routing we add must either happen
  pre-shutdown (intercept) or cope with the post-shutdown emulator
  state.

## Artifacts

- Commit: `7c458dd2c` — `fix(68k): unblock WarOLM multi-node table +
  status reporting`
- Full investigation: `Documentation/6-Progress/WAROLM_INVESTIGATION_2026-04-20.md`
- This handoff.

## Delivery investigation — what we learned this session

Traced WarOLM's actual delivery sequence live. It is **not** a
`PutMsg(AEServer.<target>)` payload — it is file-based to
`Doors/!!!War!!!/WarOLM/LISTS/<slot>`. Confirmed flow:

1. Olm sends `JH_SHUTDOWN` to the BBS (the sender's door session
   cleanup).
2. Still running after shutdown, Olm calls `0x122c` (wait-for-idle):
   polls `ENV:STATS@<target>` in a loop until the target reads IDLE
   (0). For each iteration it calls `Delay(50)` — which was a NO-OP
   until this session's fix in `DoorLifecycleManager`.
3. Once target is idle, Olm sends `DT_SLOTNUMBER` (XIM cmd **104**)
   to `AEServer.<target>` to get the target user's slot number. Our
   cross-node handler now answers with `String(targetNodeId)` as a
   stand-in for the user.db slot.
4. Olm does `Open("DOORS:!!!WAR!!!/WAROLM/LISTS/<slot>", mode=1005)`.
5. **Our first gotcha**: the `LISTS` path was a zero-byte regular
   file on disk, not a directory. Open hit `ENOTDIR`. Fix: converted
   to an empty directory (`rm LISTS && mkdir LISTS`).
6. **Our second gotcha (still open)**: after the directory fix, Olm
   opens `LISTS/<slot>` successfully (our `FileManager` auto-creates
   a 0-byte file on open, which is *wrong* for mode 1005 strict
   AmigaDOS semantics — mode 1005 = `MODE_OLDFILE`, read-only, must
   already exist). Olm then `Read()`s 0 bytes, `Close()`s, and
   **never `Write()`s**. No subsequent Open/Write of any other file
   related to the message. All `PutMsg`s after close go to the
   sender's own `AEDoorPort<N>` (screen output only) — no cross-node
   traffic.

Net effect: Olm silently drops the message after the "oLM hAVE bEEN
sENT" confirmation the sender sees.

### Most likely root cause (next session's first hypothesis)

`FileManager.open` treats `MODE_OLDFILE` (1005) as "create if
missing." That falsifies Olm's "does a queue file already exist for
this user?" test — Olm believes a queue exists (because Open
succeeded) but reads 0 bytes (because we just created it empty), and
takes a branch that assumes the caller has nothing to add.

**Fix candidates**:
- **Correct MODE_OLDFILE semantics**: fail Open with IoErr=205 when
  mode=1005 and the file doesn't exist. Then Olm's IoErr-handling
  branch (at the `beq` right after the Open trap at file 0x2C18
  area) should fire a `Open(..., mode=1006 /*MODE_NEWFILE*/)` +
  `Write` + `Close` sequence. Verify with the trap log.
- Once the real `Write()` fires to `LISTS/<slot>`, its payload is
  the message (prefixed with sender metadata per the format strings
  at hunk1+0xB44 / 0xBA0 / 0xBDA). That payload is what the target
  needs to receive. Either:
  - Delivery-as-queue (matches AmiExpress): target's next Olm
    run picks it up. Acceptable but not "live".
  - Live delivery: intercept writes under `LISTS/` in
    `FileManager` and push to target session's socket via the io
    global (already exposed for JH_SM delivery).

### Separate open item — cursor offset in the editor

Unchanged from prior handoff. `\x1b[11A` lands on the wrong row.
Likely xterm.js wrap on the 80-char color-palette row vs WarOLM's
no-wrap assumption. Not blocking.

### Separate open item — row 00 phantom

Unchanged. `STATS@0` renders a blank row because `LOWNODE` defaults
to 0 when absent from Config.info. Harmless. Could suppress by not
seeding `STATS@0` in `env-initializer.ts`.

## Fixes shipped in this session (beyond commit `7c458dd2c`)

Working tree (uncommitted) additions over commit `7c458dd2c`:

1. **`DoorLifecycleManager.ts` STEP 1.5**: honor `dosLib.isDelayed()`
   by sleeping 10 ms slices. Was making `Delay()` a no-op, which
   was burning CPU at 100% on any busy-poll loop (WarOLM's
   wait-for-idle + 86 other doors that use `Delay()`).
2. **`door-message-callbacks.ts` cross-node branch**:
   - Routes `JH_SM` (cmd=4) to `AEServer.<other>` to the target
     session's socket via `(global as any).io.to(<socketId>)`.
   - Answers `DT_SLOTNUMBER` (cmd=104) with the target's nodeId.
   - Honors `msg.data` (1=append `\r\n`, 0=inline) on routed sends.
   - Debug log: `[X-NodeRoute] AEServer.<N> cmd=<C> str="..."` for
     every cross-node callback entry.
3. **`index.ts`**: `(global as any).io = io` so emulator code can
   emit to other sockets without DI plumbing.
4. **Filesystem**: `Doors/!!!War!!!/WarOLM/LISTS` converted from a
   zero-byte file to an empty directory. Not a code change, but
   anyone wiping that area needs to keep it as a directory.

All typecheck-clean (`npx tsc --noEmit` passes).

## Next steps (ordered) — for next session

1. **Verify the delivery hypothesis**: modify `FileManager.open` (or
   `DosLibrary.Open`) so `mode=1005` (MODE_OLDFILE) returns
   `IoErr=205` when the target doesn't exist, instead of
   auto-creating a 0-byte file. Run Olm end-to-end and watch the
   trap log for a subsequent `Open("LISTS/<slot>", mode=1006)` +
   `Write()`. If that pattern appears, we've found the real
   delivery payload.
2. **Intercept that write**: in `FileManager` (or `DosLibrary`),
   if the path matches `Doors/.../LISTS/<nodeId>` and the write
   corresponds to a known target session, forward the payload via
   `io.to(targetSocketId).emit('ansi-output', ...)`. Keep the file
   write in parallel so persisted queue still works for offline
   targets.
3. **Audit `MODE_OLDFILE` semantics across the FileManager.** Any
   other doors that rely on `Open(..., 1005)` returning fail-if-
   missing are silently getting a blank file. Could be masking
   latent bugs.
4. Leftovers from prior session: **editor cursor `[11A` offset**
   (rendering glitch, non-blocking) and **row-00 phantom in Olm's
   table** (cosmetic).

## Other notes

- **Working tree carries unrelated changes** (debugRegistry wiring
  in `AmigaDoorSession.ts`, `CopyMem-100` console.log in
  `ExecLibrary.ts`). They were included in the wide commit. If those
  are in-progress work for another task, they're now on main — check
  with the author before the next branch.
- **`/tmp/ram/ENV/STATS@*` files were deleted mid-session** and
  re-seeded by the next initializer run. State on disk now reflects
  post-commit behavior.
- **Zombie background processes**: none as of this session end.
  Server lifecycle: user was running servers in their own terminal
  with `--debug --bbs-only`; I did not touch them.
