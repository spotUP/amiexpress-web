---
date: 2026-04-21
topic: aedoor-waitforreply-event-loop
tags: [68k, aedoor, event-loop, async, trap-dispatch, performance]
status: draft
---

# AEDoor `waitForReply` event-loop starvation — plan

## Context

`AEDoorLibrary.waitForReply` (web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:1784) is a tight synchronous loop that holds the JS event loop for the duration of a trap handler. Called inside every `dispatchCommand`, i.e. every AEDoor.library function that issues a JH_xx message and expects a reply — effectively every significant door I/O call:

```
  Prompt()     → JH_PM   → dispatchCommand → putMsg → waitForReply (sync)
  GetStr()     → JH_LI   → dispatchCommand → putMsg → waitForReply (sync)
  Hotkey()     → JH_HK   → dispatchCommand → putMsg → waitForReply (sync)
  WriteStr()   → JH_SM   → dispatchCommand → putMsg → waitForReply (sync)
  DataQuery()  → DT_*    → dispatchCommand → putMsg → waitForReply (sync)
  SysInfo()    → (several JH_SG / DT_*) → same loop
```

Current body:

```ts
private waitForReply(state, command): boolean {
  this.inWaitForReply = true;
  try {
    for (let i = 0; i < 10000; i++) {
      if (this.processXIMMessageCallback && state.bbsPortAddr) {
        this.processXIMMessageCallback(state.bbsPortAddr); // sync drain
      }
      const msgAddr = this.execLibrary.getMsg(state.replyPortAddr);
      if (msgAddr !== 0) return true;
    }
    return false;
  } finally { this.inWaitForReply = false; }
}
```

`processXIMMessageCallback` is `installXIMProcessor` (door-message-callbacks.ts:65). It pulls one message off `bbsPortAddr`, parses, handles synchronously, and replies. Blocking commands (JH_HK, JH_LI, JH_PM, JH_ExtHK) pause the emulator so the input-waiting state can take effect.

## Problem

The loop iterates up to 10000 times between `setImmediate`/microtask boundaries, monopolising Node's single thread. Observable consequences:

1. **SysInfo freeze**: on door launch, many DT_* queries fire back-to-back in a single trap burst, each one spinning this loop. Total wall time exceeds the socket heartbeat and the browser's xterm.js stops receiving updates until the trap storm clears.
2. **Input lag**: user keystroke → Socket.IO event → queued in libuv → waits for event loop → but the loop is stuck inside `waitForReply` → keystroke stalls until the trap returns (or until a blocking command pauses the emulator for async input).
3. **Timer drift**: `setTimeout`-driven behavior (door watcher, session heartbeat, pause timeouts) slips by the duration of the trap.

This is the same problem `BsdSocketLibrary` already solved for a C-sync `connect()` call (web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts:228): it uses `deasync.loopWhile`, which pumps libuv while the call looks synchronous to the 68K side.

## Architecture constraints

- **68K traps are hard-synchronous.** Moira's `executeUntilTrap(maxIterations)` (moira-wrapper.cpp:983) is a sync WASM call. When it dispatches to a JS handler for a library vector, it expects an immediate return with registers set. The handler cannot `await` without the emulator's call stack ending, and there is no cooperative-yield mechanism in WASM Moira.
- **Socket I/O is Node-async.** Reply-port messages that come from the BBS side (e.g. user input → JH_HK reply) travel through Socket.IO, which delivers on the main event loop. Without pumping libuv, the reply never lands and the tight loop spins forever.
- **Two existing mitigations already stack up:**
  - `processXIMMessageCallback` drains the door's *own* outbound messages synchronously inside the loop, so the BBS can reply without the async polling path running. Covers door→BBS→door round-trips.
  - `inWaitForReply` flag + async input injection (XIMProtocol.shouldInjectNativeInput) pushes user input directly into the door's replyPort buffer from outside the trap, unblocking JH_HK/JH_LI/JH_PM synchronously.
  Together these keep most doors working, but they don't help cases where:
    - The BBS reply itself requires async work (DNS, file I/O outside the sync fs calls, external API, cross-node IPC that goes through Socket.IO rooms).
    - Many back-to-back sync replies compound latency because the event loop never drains between them.

## Options considered

### 1. `deasync.loopWhile` inside `waitForReply` (recommended)

Replace the `for (let i < 10000)` bound with a `deasync.loopWhile(() => !replied && !timedOut)`. Same trap-sync contract to the 68K side; libuv pumps inside the loop so Socket.IO events, timers, and async `then()` callbacks all get a chance to run.

**Pros**
- Minimal surface area: ~10 lines changed in one function.
- Pattern already proven in BsdSocketLibrary (`connect`, `gethostbyname`, TLS handshake).
- No changes to emulator, trap dispatch, or call sites.
- Preserves `inWaitForReply` semantics so the native-input injection path keeps working.

**Cons**
- `deasync` is a native module (already a dependency: `node_modules/deasync/bin/darwin-arm64-node-24/deasync.node`).
- Reentrancy: if a library call inside the XIM processor triggers another trap that also calls `deasync.loopWhile`, we get nested pumps. Manageable but needs thought.
- Still not truly async — a very slow reply (seconds) would pump the event loop for that long, extending the wall-clock trap but not blocking.

### 2. Convert trap dispatch to async

`executeUntilTrap` returns, trap handler runs as an `async` function, lifecycle loop `await`s it, then resumes the emulator.

**Pros**
- Architecturally cleanest. No native dependency. Fits Node's model.

**Cons**
- Large refactor. Every trap handler path becomes async-aware; many are called by class methods that aren't currently async.
- Moira's C++ side expects a sync callback; would need to buffer trap intent and resume the emulator from JS.
- Call graph across DosLibrary/ExecLibrary/IconLibrary/AEDoorLibrary needs audit — any sync-ish helper that calls back into the emulator (`writeMemory`, `getRegister`) would need to stay sync, only the "wait for I/O" segments become async.

### 3. Worker thread for emulator

Move Moira+lifecycle to a Worker, main thread does I/O, communicate via postMessage.

**Pros**
- Full isolation, real parallelism.

**Cons**
- Largest refactor. Memory-sharing (SharedArrayBuffer) required for WASM heap access from JS side. Every library handler that reads/writes the emulator's memory has to be reorganized.
- Not justified for the observed symptoms; deasync solves them without the cost.

### 4. Pre-drain + iteration-count tuning

Keep the sync loop; drain the XIM callback more aggressively; shrink max iterations to reduce worst-case stall.

**Pros**
- Zero risk.

**Cons**
- Doesn't actually solve the problem — still starves the event loop during the window, just for less time.
- Already done to some extent; diminishing returns.

## Recommended path — option 1

### Delivery steps

1. **Instrument first.** Add `DOOR_PROFILE=1` gating for a one-line `console.time('waitForReply[cmd=N]')`/`console.timeEnd` pair (or `performance.now()` diff). Capture: per-command wall time, per-iteration count, whether the loop bailed on timeout. Run against a known-slow door (any SysInfo user) to baseline.
2. **Add a global reentrancy counter** on AEDoorLibrary. Panic-log (don't crash) if waitForReply enters more than, say, 2 levels deep. We need to know if any XIM handler recursively triggers a trap that calls waitForReply again; the existing inWaitForReply only tracks a boolean.
3. **Replace the loop body.**
   - Keep the `processXIMMessageCallback` synchronous drain — it stays essential for sync round-trips.
   - Replace `for (let i=0; i<10000; i++)` with:
     ```ts
     const deadline = Date.now() + 5000; // hard wall-clock ceiling
     let replied = false;
     deasync.loopWhile(() => {
       if (this.processXIMMessageCallback && state.bbsPortAddr) {
         this.processXIMMessageCallback(state.bbsPortAddr);
       }
       const msgAddr = this.execLibrary.getMsg(state.replyPortAddr);
       if (msgAddr !== 0) { replied = true; return false; }
       return Date.now() < deadline;
     });
     return replied;
     ```
   - Keep `inWaitForReply = true/false` wrapping the deasync call. Native-input injection (XIMProtocol.shouldInjectNativeInput) continues to trigger based on that flag, no changes there.
4. **Test matrix** (see below). Run the existing `dev/scripts/test-all-68k-doors.sh` first, then specifically exercise SysInfo-heavy doors (zOOsTAT, WHO, grandmaster if it uses SysInfo), then the door harness for Bulls + RTW.
5. **Ship behind `DOOR_ASYNC_WAIT=1`** — follow the opt-in pattern B already established in this session. Default off until the test matrix is green on all shipped doors. Flip default after a deliberate decision.

### Risk assessment per XIM command family

| Command(s) | Current behavior | Under deasync | Risk |
|---|---|---|---|
| JH_HK (hotkey) | Loop spins until user input injected via shouldInjectNativeInput | Same, but libuv pumps between iterations so Socket.IO delivery path can run | **Improved** — keystroke latency drops |
| JH_LI (line input) | Same as JH_HK but multi-byte accumulation | Same, improved | **Improved** |
| JH_PM (prompt) | Same as JH_HK | Same, improved | **Improved** |
| JH_SM (send) | BBS reply is synthesized sync in XIMProcessor; waitForReply returns on first iteration | No behavioral change — loop exits immediately once sync reply lands, deasync only helps when reply isn't sync | **Neutral** |
| DT_* queries | Mostly sync; some (e.g. DT_STAMP_CTIME) are sync date reads | Neutral | **Neutral** |
| JH_SHUTDOWN | Sync reply by XIMProcessor | Neutral, already fixed by 3a4c30a3d | **Neutral** |
| Async-dependent (cross-node JH_SM, future: external queries) | Would deadlock today — reply can't arrive in a sync loop | Works correctly — async reply lands during pump | **Enables new use cases** |

The cross-node JH_SM case we just fixed (3a4c30a3d) actually doesn't hit waitForReply's weakness because the BBS-side XIMProcessor replies to the sender's *own* reply port synchronously, then fires a separate `io.to(target)` socket emit for the receiving side. The receiver-side delivery is async and does not block the sender's trap.

### Test matrix before flipping default

Run each in two passes — default (DOOR_ASYNC_WAIT unset) and with the flag on:

- [ ] QuickNew, MultiTop, WHO, ByteKiller, SlickTop, NTR-LastCallers — exit cleanly, no regressions
- [ ] Bulls — launch, interactive menu, quit
- [ ] RTW — launch, menu, quit
- [ ] WarOLM — launch, list render, line editor, send cross-node OLM end-to-end
- [ ] dRE!WAll — banner draw, Y/n prompt, line entry, save
- [ ] grandmaster — if still shipped, quick smoke
- [ ] zOOsTAT + any other SysInfo-heavy doors — measure trap duration with DOOR_PROFILE=1 before/after
- [ ] Session heartbeat timer fires during active door session — confirm no drift

### Open questions to resolve before coding

1. **Reentrant waitForReply**: does any sync XIM handler in installXIMProcessor ever issue another dispatchCommand? If yes, nested deasync loops are a real concern. Audit needed: scan `xim/` handlers for any `this.libraryManager.aedoorLibrary.*` or `dispatchCommand` calls originating inside a JH_xx reply path.
2. **Hard-timeout behavior**: currently `waitForReply` returns false after 10000 iterations. With deasync + 5000ms wall clock, what does the door see on timeout? dispatchCommand returns `-1` — need to confirm each caller tolerates `-1` gracefully (some ignore return value today).
3. **Emulator pause interaction**: `inWaitForReply=true` signals the native-input injection path. Under deasync, does the emulator's `pause()` issued by the blocking XIM callback still take effect before we exit waitForReply? Need to trace: pause() sets a flag that Moira checks between batches, but we're inside a trap handler, not between batches.

### Landmarks (for the implementation session)

- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:1784` — the loop
- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:1731` — dispatchCommand
- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:1778` — inWaitForReply flag
- `web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:65` — installXIMProcessor (the sync drain)
- `web/backend/src/amiga-emulation/XIMProtocol.ts` — shouldInjectNativeInput (async input path)
- `web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts:228` — reference deasync.loopWhile usage
- `dev/scripts/test-all-68k-doors.sh` — regression harness

### What this plan deliberately does NOT address

- Full async trap dispatch (option 2) — out of scope.
- Worker-thread isolation (option 3) — out of scope.
- Performance profiling of individual XIM handlers — that's a separate initiative once we can see the trap-duration histogram.
