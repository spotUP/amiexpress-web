# DayDream (DD) Door Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run native DayDream BBS doors (~13 archive doors: 3 raw `DD_DoorPort`,
10 `dreamdoor.library`-based, 5 also call `DDCommand`) on the AmiExpress-Web
68K emulator by fixing and completing the existing `DreamDoorLibrary.ts`
trap-based `dreamdoor.library` emulation.

**Architecture — different from FIM, and simpler.** FAME's FIM doors build
and `PutMsg()` their own `FAMEDoorMsg` directly to `FAMEDoorPort<node>`
(FAME.library only supplies small utilities), which is why the FIM plan
needed a `FIMProtocol` *message-port server*. DayDream doors never touch a
port or a message at all — they call `dreamdoor.library` functions
(`InitDoor`, `SendString`, `Prompt`, ...) and the *library* does the
port/message plumbing to the real DayDream BBS process internally. Because
this codebase already emulates libraries as **trap-vectored TypeScript**
(same as `AEDoor.library`, `FAME.library`) rather than running real 68K
library code, that internal `DD_DoorPort<node>`/`DreamDoorMsg` wire protocol
never executes and does not need to be reproduced — the LVO jump-table
offsets and per-function calling conventions recovered from disassembly
(below) are the only things that matter; a JSR to
`dreamdoor.library - 48` traps straight into a TypeScript `Prompt` handler
that talks to the real Socket.IO terminal, no synthetic message struct in
between. **No new protocol/port-server file is needed** — this plan fixes
the existing `DreamDoorLibrary.ts` + `dreamdoor-vectors.ts` pair in place.

**Tech Stack:** TypeScript backend (web/backend), MOIRA 68K emulator, jest
(`--config dev-scripts/jest.config.ts`).

**Spec:** `thoughts/shared/research/2026-08-14_fame-dd-door-compat.md`
("DayDream RE results (2026-08-15)" section) — LVO table, wire format (for
context only, not implemented), `Pointers`/`USER`/`CONF`/`CFG` struct
offsets, all with evidence. Read that section before starting; every numeric
constant in this plan is sourced from it.

## Global Constraints

- TypeScript strict, no `any` in new exported APIs; run `npx tsc --noEmit` in
  `web/backend` after every task.
- Tests run with `SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts
  --rootDir . <path>` from `web/backend`.
- Amiga binary I/O: big-endian (`readMemory32`/`writeMemory32` are BE
  already; never Buffer LE methods).
- No emojis anywhere. ASCII log tokens.
- Time fields are **minutes** end-to-end (`USER_DAILYTIMELIMIT`,
  `USER_TIMEREMAINING` — matches the real library's own `Divu #60,D0`
  seconds-to-minutes conversion on the client side documented in the
  research doc; our TS side should store/emit minutes directly, no /60
  needed since `bbsSession` fields are already minutes elsewhere in this
  codebase per `feedback_regression_test_patterns.md`).
- Corpus/E2E test config files are JSON — render with `JSON.stringify`, never
  hand-edit with a text-append trick that could corrupt existing entries.
- Amiga/door binary fixtures copied into `Doors/`: use `cp`, never
  Edit/Write (high-bit byte corruption risk — see
  `feedback_edit_tool_destroys_high_bit_bytes.md`).
- **Confirmed vs inferred, tracked per-field**: every LVO/struct offset below
  is tagged `(confirmed)` or `(inferred)` in the research doc; carry that
  distinction into code comments so a future reader knows which numbers to
  re-verify first if a door misbehaves.

---

### Task 1: DD constants module

**Files:**
- Create: `web/backend/src/amiga-emulation/dd/dd-constants.ts`
- Test: `web/backend/tests/amiga-emulation/dd-constants.test.ts`

**Interfaces:**
- Produces: `DD_LVO` (LVO offset map), `DP_OFFSET` (`Pointers` struct byte
  offsets), `USER_OFFSET`, `CONF_OFFSET`, `CFG_OFFSET`, `DP_SIZEOF = 0x54`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/amiga-emulation/dd-constants.test.ts
import { DD_LVO, DP_OFFSET, USER_OFFSET, CONF_OFFSET, CFG_OFFSET, DP_SIZEOF } from "../../src/amiga-emulation/dd/dd-constants";

describe("DD constants", () => {
  it("matches the FunctionTable-recovered LVO offsets (research doc 2026-08-15)", () => {
    expect(DD_LVO.InitDoor).toBe(-30);
    expect(DD_LVO.CloseDoor).toBe(-36);
    expect(DD_LVO.SendString).toBe(-42);
    expect(DD_LVO.Prompt).toBe(-48);
    expect(DD_LVO.InquirePointers).toBe(-54);
    expect(DD_LVO.DisplayFile).toBe(-60);
    expect(DD_LVO.JoinConference).toBe(-66); // inferred, see research doc
    expect(DD_LVO.XprSend).toBe(-84);
    expect(DD_LVO.GetKey).toBe(-108);
    expect(DD_LVO.ScanFileDirs).toBe(-114);
    expect(DD_LVO.Disconnect).toBe(-126);
    expect(DD_LVO.DDCommand).toBe(-132);
  });
  it("has the confirmed Pointers-struct field offsets", () => {
    expect(DP_SIZEOF).toBe(0x54);
    expect(DP_OFFSET.dp_DayDream).toBe(0x0c);
    expect(DP_OFFSET.dp_CurrConf).toBe(0x1c);
    expect(DP_OFFSET.dp_CurrUser).toBe(0x28);
    expect(DP_OFFSET.dp_DoorParams).toBe(0x34);
    expect(DP_OFFSET.dp_BpsRate).toBe(0x38);
    expect(DP_OFFSET.dp_IODevice).toBe(0x3c); // inferred position
    expect(DP_OFFSET.dp_CurrentNode).toBe(0x40);
  });
  it("has the confirmed USER struct field offsets", () => {
    expect(USER_OFFSET.USER_HANDLE).toBe(0x1a);
    expect(USER_OFFSET.USER_PASSWORD).toBe(0x78);
    expect(USER_OFFSET.USER_ORGANIZATION).toBe(0x34);
    expect(USER_OFFSET.USER_VOICEPHONE).toBe(0x63);
    expect(USER_OFFSET.USER_SECURITYLEVEL).toBe(0xeb);
    expect(USER_OFFSET.USER_BYTERATIO).toBe(0xcf);
    expect(USER_OFFSET.USER_PUBMESSAGES).toBe(0xc8);
    expect(USER_OFFSET.USER_ULFILES).toBe(0xc4);
    expect(USER_OFFSET.USER_DLFILES).toBe(0xc6);
    expect(USER_OFFSET.USER_CONNECTIONS).toBe(0xcc);
    expect(USER_OFFSET.USER_LASTCALL).toBe(0xf2);
    expect(USER_OFFSET.USER_DAILYTIMELIMIT).toBe(0xfe);
    expect(USER_OFFSET.USER_TIMEREMAINING).toBe(0x102);
    expect(USER_OFFSET.USER_ULBYTES).toBe(0xbc);
    expect(USER_OFFSET.USER_DLBYTES).toBe(0xc0);
    expect(USER_OFFSET.USER_SCREENLENGTH).toBe(0x88);
  });
  it("has CONF/CFG offsets", () => {
    expect(CONF_OFFSET.CONF_NUMBER).toBe(0);
    expect(CONF_OFFSET.CONF_NAME).toBe(1);
    expect(CFG_OFFSET.CFG_SYSOPNAME).toBe(0x1a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/amiga-emulation/dd-constants.test.ts`. Expected: FAIL — module not found.
- [ ] **Step 3: Write the module.**

```typescript
// web/backend/src/amiga-emulation/dd/dd-constants.ts
/**
 * DayDream BBS "dreamdoor.library" LVO/struct constants.
 *
 * Source of truth: thoughts/shared/research/2026-08-14_fame-dd-door-compat.md
 * "DayDream RE results (2026-08-15)" — recovered by walking the RTF_AUTOINIT
 * FunctionTable of DreamDoor.Library v1.0/v6.0 and cross-matching Xim.s's
 * Jsr calls against the disassembled `xim` client binary.
 *
 * Offsets marked "confirmed" have both a FunctionTable address AND a
 * matching client call site. Offsets marked "inferred" are recovered from
 * calling-convention shape alone (no client source calls them) — re-verify
 * against a real door if one misbehaves at that LVO.
 */

/** LVO offsets, dreamdoor.library base-relative (negative). */
export const DD_LVO = {
  InitDoor: -30, // confirmed
  CloseDoor: -36, // confirmed
  SendString: -42, // confirmed
  Prompt: -48, // confirmed
  InquirePointers: -54, // confirmed
  DisplayFile: -60, // confirmed
  JoinConference: -66, // inferred — single D1 numeric arg is the only
  // candidate LVO in the unnamed range that matches JoinConference(D1=confNum)
  XprSend: -84, // confirmed
  GetKey: -108, // confirmed
  ScanFileDirs: -114, // confirmed
  Disconnect: -126, // confirmed
  DDCommand: -132, // confirmed
} as const;

/** Pointers struct (dp_SIZEOF bytes), filled by InquirePointers. */
export const DP_SIZEOF = 0x54;
export const DP_OFFSET = {
  dp_DayDream: 0x0c, // BBS config block; CFG_SYSOPNAME sub-field at +0x1a
  dp_CurrConf: 0x1c, // CONF_NUMBER@0 byte, CONF_NAME@1
  dp_CurrUser: 0x28,
  // dp_DoorParams: present in the struct layout Xim.s expects, but NOT
  // written by dreamdoor.library v1.0's InquirePointers reply (a real gap
  // in the reference library, not an RE error). We populate it anyway
  // (door command-line params) since we control both sides — see plan
  // Task 2 "Known risks / decisions".
  dp_DoorParams: 0x34,
  dp_BpsRate: 0x38,
  dp_IODevice: 0x3c, // inferred position (between BpsRate and CurrentNode)
  dp_CurrentNode: 0x40, // node-id byte at sub-offset +0x0e
} as const;

/** USER struct fields, relative to dp_CurrUser. */
export const USER_OFFSET = {
  USER_HANDLE: 0x1a,
  USER_PASSWORD: 0x78,
  USER_ORGANIZATION: 0x34,
  USER_VOICEPHONE: 0x63,
  USER_SECURITYLEVEL: 0xeb, // byte
  USER_BYTERATIO: 0xcf, // byte
  USER_PUBMESSAGES: 0xc8, // word
  USER_ULFILES: 0xc4, // word
  USER_DLFILES: 0xc6, // word
  USER_CONNECTIONS: 0xcc, // word
  USER_LASTCALL: 0xf2, // word
  USER_DAILYTIMELIMIT: 0xfe, // word, minutes
  USER_TIMEREMAINING: 0x102, // word, minutes
  USER_ULBYTES: 0xbc, // long
  USER_DLBYTES: 0xc0, // long
  USER_SCREENLENGTH: 0x88, // byte
} as const;

/** CONF struct fields, relative to dp_CurrConf. */
export const CONF_OFFSET = {
  CONF_NUMBER: 0, // byte
  CONF_NAME: 1,
} as const;

/** CFG (BBS config) struct fields, relative to dp_DayDream. */
export const CFG_OFFSET = {
  CFG_SYSOPNAME: 0x1a,
} as const;
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** `git add web/backend/src/amiga-emulation/dd/dd-constants.ts web/backend/tests/amiga-emulation/dd-constants.test.ts && git commit -m "feat(dd): DreamDoor LVO/struct constants from disassembly"`

---

### Task 2: Fix `DreamDoorLibrary.ts` — base-address collision + correct struct offsets

**Files:**
- Modify: `web/backend/src/amiga-emulation/api/DreamDoorLibrary.ts` (full
  rewrite of the constant tables + `allocateStructures`/`populate*`; keep the
  class shape and `setSession` contract)
- Test: `web/backend/tests/amiga-emulation/dreamdoor-library.test.ts`

**The bug (confirmed at `DreamDoorLibrary.ts:87`):** `DREAMDOOR_BASE =
0xE0000` collides with `ExecLibrary.ts:198`'s `INTUITION_LIB_ADDR =
0x0e0000`. Also: every offset in `POINTERS_STRUCT`/`USER_STRUCT` was a
January guess (6-byte-spacing style) that doesn't match the confirmed
struct layout in Task 1's constants — e.g. the guessed table has
`dp_DoorParams` at `+0x00` and `dp_SIZEOF=0x20` (32 bytes); the real struct
has `dp_DoorParams` at `+0x34` and is `0x54` (84) bytes.

**The fix — two changes:**
1. Stop hardcoding a static base address entirely. Mirror
   `FameLibrary`'s constructor (`Task 2` of the FIM plan,
   `web/backend/src/amiga-emulation/api/FameLibrary.ts`): accept
   `{ allocMem(size, flags): number; freeMem(addr, size): void }` and
   allocate the `Pointers`/`USER`/`CONF`/`CFG`/node-info structs through the
   real exec allocator (`execLibrary.allocMem`) instead of a fixed address.
   This can never collide with anything again, matches the pattern already
   established for FAME, and removes the need to hunt for a "safe" constant.
2. Replace `POINTERS_STRUCT`/`USER_STRUCT`/`CONF_STRUCT`/`CONFIG_STRUCT`
   with `DP_OFFSET`/`USER_OFFSET`/`CONF_OFFSET`/`CFG_OFFSET`/`DP_SIZEOF` from
   Task 1. `USER_SIZEOF` must grow to cover `USER_PASSWORD` at `+0x78` plus a
   reasonable max password length (`0x78 + 32 = 0x98`, round up to `0xa0`
   for safety margin around `USER_TIMEREMAINING`@`0x102`+2 — actually the
   highest used offset is `USER_TIMEREMAINING`@0x102 (word, ends at 0x104);
   size the struct to `0x110` to leave headroom).

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/amiga-emulation/dreamdoor-library.test.ts
import { DreamDoorLibrary } from "../../src/amiga-emulation/api/DreamDoorLibrary";
import { DP_OFFSET, USER_OFFSET, DP_SIZEOF } from "../../src/amiga-emulation/dd/dd-constants";

class MemStub {
  mem = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory32(a: number) {
    return (((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) |
      (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0);
  }
  writeMemory32(a: number, v: number) {
    this.writeMemory(a, v >>> 24); this.writeMemory(a + 1, v >>> 16);
    this.writeMemory(a + 2, v >>> 8); this.writeMemory(a + 3, v);
  }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >>> 8); this.writeMemory(a + 1, v); }
  readString(a: number, max: number) {
    let s = ""; for (let i = 0; i < max; i++) { const c = this.readMemory(a + i); if (c === 0) break; s += String.fromCharCode(c); }
    return s;
  }
}

describe("DreamDoorLibrary", () => {
  it("does not collide with INTUITION_LIB_ADDR (0x0e0000) — allocates via the injected allocator, not a static 0xE0000 base", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000; // far from any *_LIB_ADDR constant
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT", location: "Earth" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 1 }, { emit: () => true });
    const nodeAddr = 0x1000;
    "1\0".split("").forEach((c, i) => emu.writeMemory(nodeAddr + i, c.charCodeAt(0)));
    const handle = lib.initDoor(nodeAddr);
    expect(handle).not.toBe(0);
    expect(handle).toBeLessThan(0x0e0000);
    expect(handle).toBeGreaterThanOrEqual(0x0e0000 + 0x8000); // above INTUITION+GRAPHICS region, i.e. not inside it
  });

  it("InquirePointers fills the caller's buffer using the confirmed dp_* offsets", () => {
    const emu = new MemStub();
    let nextAlloc = 0x300000;
    const lib = new DreamDoorLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    lib.setSession({ user: { name: "SPOT" }, bbsName: "AmiExpress Web", sysopName: "Sysop", conferenceName: "Main", conferenceId: 3 }, { emit: () => true });
    const nodeAddr = 0x1000;
    emu.writeMemory(nodeAddr, "1".charCodeAt(0));
    const handle = lib.initDoor(nodeAddr);
    const outBuf = 0x400000;
    lib.inquirePointers(outBuf, handle);
    const curUserPtr = emu.readMemory32(outBuf + DP_OFFSET.dp_CurrUser);
    expect(curUserPtr).not.toBe(0);
    const handleStr = emu.readString(curUserPtr + USER_OFFSET.USER_HANDLE, 32);
    expect(handleStr).toBe("SPOT");
    const curConfPtr = emu.readMemory32(outBuf + DP_OFFSET.dp_CurrConf);
    expect(emu.readMemory(curConfPtr)).toBe(3); // CONF_NUMBER
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (constructor signature mismatch / offsets wrong).
- [ ] **Step 3: Rewrite `DreamDoorLibrary.ts`.** Constructor:
  `constructor(emulator: MoiraEmulator, alloc: { allocMem(size: number, flags?: number): number; freeMem(addr: number, size: number): void })`.
  `allocateStructures()` calls `this.alloc.allocMem(...)` for each struct
  instead of walking a static base. Keep `setSession`, `initDoor`,
  `inquirePointers`, `sendString`, `displayFile`, `ddCommand`,
  `closeDoor`, `joinConference`, `xprSend`, `scanFileDirs`, `disconnect`
  method names (vectors file in Task 3 depends on them) but fix
  `populateUserStruct`/`populateConfStruct`/`populateConfigStruct`/
  `populatePointersStruct` to use the Task 1 offset constants. `prompt()`
  and `getKey()` become real (deferred) implementations in Task 4 — for this
  task just fix their signatures to match the real calling convention
  (`prompt(handle, bufferAddr, promptTextAddr, maxLen, mode)`,
  `getKey(handle, flags)`) even though the body still stubs synchronously;
  Task 4 fills in the blocking behavior.
- [ ] **Step 4: Run — expect PASS. `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `git commit -m "fix(dd): DreamDoorLibrary base-address collision + confirmed struct offsets"`

---

### Task 3: Rewrite `dreamdoor-vectors.ts` with the confirmed LVO table

**Files:**
- Modify: `web/backend/src/amiga-emulation/api/library-vectors/dreamdoor-vectors.ts`
- Test: extend `web/backend/tests/amiga-emulation/dreamdoor-library.test.ts`

The existing file's offsets (`-6 InitDoor ... -72 Disconnect`, plain 6-byte
spacing) are all wrong per Task 1. Replace with `DD_LVO` from Task 1 and the
confirmed register conventions from the research doc:

| Vector | Offset | Registers in | Registers out |
|---|---|---|---|
| InitDoor | `DD_LVO.InitDoor` | A0=nodeText ptr | D0=handle |
| CloseDoor | `DD_LVO.CloseDoor` | D0=handle | — |
| SendString | `DD_LVO.SendString` | D0=handle, A0=string ptr | — |
| Prompt | `DD_LVO.Prompt` | D0=handle, A0=buffer ptr, A1=prompt text ptr, D1=maxlen, D2=mode | D0=status (0=carrier lost) |
| InquirePointers | `DD_LVO.InquirePointers` | D0=handle, A0=output buffer ptr | fills buffer |
| DisplayFile | `DD_LVO.DisplayFile` | D0=handle, A0=filename ptr, D1=ansi flag | — |
| JoinConference | `DD_LVO.JoinConference` | D0=handle, D1=conf number | D0=result |
| XprSend | `DD_LVO.XprSend` | D0=handle, A0=file-list ptr, A1=device override ptr | D0=status |
| GetKey | `DD_LVO.GetKey` | D0=handle, D1=flags | D0=key code |
| ScanFileDirs | `DD_LVO.ScanFileDirs` | D0=handle, D1=conf number | D0=status |
| Disconnect | `DD_LVO.Disconnect` | D0=handle | — |
| DDCommand | `DD_LVO.DDCommand` | D0=handle, A0=command string ptr | — |

- [ ] **Step 1: Write failing tests** (extend the Task 2 test file):

```typescript
import { DREAMDOOR_VECTORS } from "../../src/amiga-emulation/api/library-vectors/dreamdoor-vectors";
import { DD_LVO } from "../../src/amiga-emulation/dd/dd-constants";

describe("dreamdoor-vectors offset table", () => {
  it("matches DD_LVO exactly — no leftover guessed offsets", () => {
    const byName = Object.fromEntries(DREAMDOOR_VECTORS.map(v => [v.name, v.offset]));
    expect(byName.InitDoor).toBe(DD_LVO.InitDoor);
    expect(byName.CloseDoor).toBe(DD_LVO.CloseDoor);
    expect(byName.SendString).toBe(DD_LVO.SendString);
    expect(byName.Prompt).toBe(DD_LVO.Prompt);
    expect(byName.InquirePointers).toBe(DD_LVO.InquirePointers);
    expect(byName.DisplayFile).toBe(DD_LVO.DisplayFile);
    expect(byName.JoinConference).toBe(DD_LVO.JoinConference);
    expect(byName.XprSend).toBe(DD_LVO.XprSend);
    expect(byName.GetKey).toBe(DD_LVO.GetKey);
    expect(byName.ScanFileDirs).toBe(DD_LVO.ScanFileDirs);
    expect(byName.Disconnect).toBe(DD_LVO.Disconnect);
    expect(byName.DDCommand).toBe(DD_LVO.DDCommand);
    // no two vectors share the wrong slot 6-apart-from-InitDoor-at--6 pattern
    expect(byName.InitDoor).not.toBe(-6);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Rewrite `dreamdoor-vectors.ts`** with the table above. Register
  numbers per this codebase's convention (see `fame-vectors.ts`/
  `aedoor-vectors.ts`): D0-D7 = registers 0-7, A0-A6 = registers 8-14. Prompt
  reads A1 (register 9) for the prompt-text pointer — note in a comment that
  the *real* `Xim.s` client leaves A1 pointing at leftover/residual state
  rather than setting it purposefully (a client-side quirk documented in the
  research doc), so our Prompt implementation should tolerate a garbage/zero
  A1 (treat 0 or unreadable as "no prompt text", not a crash).
- [ ] **Step 4: Run — expect PASS. `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `git commit -m "fix(dd): dreamdoor-vectors LVO offsets + calling convention from disassembly"`

---

### Task 4: Real Prompt/GetKey input — deferred pause/resume

**Files:**
- Modify: `web/backend/src/amiga-emulation/api/DreamDoorLibrary.ts`
- Test: extend `web/backend/tests/amiga-emulation/dreamdoor-library.test.ts`

**Pattern** (mirrors `FIMProtocol`'s `pendingKind`/`pause()`/`resume()`
state machine — `web/backend/src/amiga-emulation/fim/fim-protocol.ts:64-110,
567-664` — but at the trap-call level instead of the message level, since
DreamDoor calls are direct synchronous library JSRs, not `PutMsg`/`GetMsg`
round trips). `emulator.pause()`/`resume()` operate on the batch-execution
loop, not on any particular trap's return path, so calling them from inside
a `LibraryVector` handler works exactly the same as calling them from
`FIMProtocol.handleMessage()` — no changes needed to `LibraryTraps.ts`'s
trap dispatch.

`DreamDoorLibrary` gains:
- `private inputBuffer = ""` (type-ahead backlog, same role as
  `FIMProtocol.inputBuffer`).
- `private pendingPromptBuffer: number | null = null` (the caller's A0
  buffer address, captured when `prompt()` defers).
- `private pendingPromptMaxLen = 0`, `private pendingPromptMode = 0`.
- `private pendingKeyPending = false` (GetKey has no buffer to fill, only
  D0, so no address needs capturing — see below on how the result reaches
  D0 after `resume()`).
- `queueInput(data: string): void` — same shape as `FIMProtocol.queueInput`:
  buffers into `inputBuffer`, then drains into whichever of
  prompt-line-accumulation / key-wait is pending.

**The D0-after-resume mechanism**: unlike `FIMProtocol` (which writes the
result into a message field and calls `execLibrary.putMsg` to reply — no
register write needed), a deferred `Prompt`/`GetKey` trap must set **D0**
after the fact. Since `LibraryTraps.handleTrap` already calls
`emulator.setRegister(0, result)` with the handler's *synchronous* return
value immediately after invoking the handler (this happens before pause()
takes effect on the batch loop, so the placeholder is harmless — the CPU
won't execute past this point until `resume()`), the handler function
itself must return a placeholder (e.g. `0`) on the deferred path, and the
completion callback later does `this.emulator.setRegister(0,
realValue); this.emulator.resume();` — this OVERWRITES the placeholder
before the paused CPU is allowed to continue, exactly mirroring how
`FIMProtocol.completeLineNow()`/`completeWaitChar()` write their result
before calling `resume()`.

`prompt(handle, bufferAddr, promptTextAddr, maxLen, mode)`:
- Read prompt text from `promptTextAddr` (guard: 0 or clearly-invalid
  address → skip emit, don't crash) and `socket.emit("ansi-output", text)`
  if non-empty (mirrors `Prompt`'s real behavior of copying prompt text
  into the output buffer before display — for us, "display" just means
  emit to the terminal).
- `this.pendingPromptBuffer = bufferAddr; this.pendingPromptMaxLen =
  Math.min(maxLen > 0 ? maxLen : 200, 200); this.pendingPromptMode = mode;`
- Drain `inputBuffer` (type-ahead) through the same per-keystroke logic as
  `feedLineChars` (copy the FIM pattern: backspace, echo, CR completes,
  mode 4-ish password echo as `*`). If it completes synchronously (CR
  already buffered), return the real status directly and do NOT pause.
- Otherwise: `this.emulator.pause(); return 0;` (placeholder — resumed by
  `queueInput`).
- On completion: `writeString(bufferAddr, line, maxLen)`, return status 1
  (matches the real library's `Cmp.L #0,D0 / Beq .clost` — 0 only means
  carrier lost, which this emulation never synthesizes on its own, so
  completion always resolves 1 unless an explicit disconnect path sets it).

`getKey(handle, flags)`:
- If `inputBuffer` has a char: consume one, return its code immediately
  (byte, matching v1.0's `move.b (A1),D0`; the `flags` bit-3 word-extended
  v6.0 behavior is a documented but out-of-scope extension — log
  `[DreamDoor] GetKey: v6 extended-key flag set but not implemented` if
  `flags & 8` and fall back to the v1.0 byte behavior).
- Else: `this.emulator.pause(); this.pendingKeyPending = true; return 0;`
- `queueInput` completion path for a pending key: consume one char,
  `this.emulator.setRegister(0, code); this.emulator.resume();`.

- [ ] **Step 1: Write failing tests**

```typescript
it("Prompt defers until queueInput, echoes prompt text first, writes answer into the caller buffer", () => {
  const emu = new MemStub();
  let nextAlloc = 0x300000;
  const out: string[] = [];
  let paused = false, resumed = false;
  (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
  (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
  const lib = new DreamDoorLibrary(emu as never, {
    allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
    freeMem: () => undefined,
  });
  lib.setSession({}, { emit: (_e: string, d?: string) => { if (d) out.push(d); return true; } });
  const handle = lib.initDoor(0x1000);
  const promptText = 0x500000, buf = 0x510000;
  "Name>".split("").forEach((c, i) => emu.writeMemory(promptText + i, c.charCodeAt(0)));
  lib.prompt(handle, buf, promptText, 20, 0);
  expect(out[0]).toBe("Name>");
  expect(paused).toBe(true);
  lib.queueInput("spot\r");
  expect(resumed).toBe(true);
  expect(emu.readString(buf, 20)).toBe("spot");
});

it("GetKey defers until queueInput and resolves the key code", () => {
  const emu = new MemStub();
  let nextAlloc = 0x300000;
  let resumeD0 = -1;
  (emu as unknown as { pause(): void; resume(): void; setRegister(r: number, v: number): void }).pause = () => undefined;
  (emu as unknown as { resume(): void }).resume = () => undefined;
  (emu as unknown as { setRegister(r: number, v: number): void }).setRegister = (r: number, v: number) => { if (r === 0) resumeD0 = v; };
  const lib = new DreamDoorLibrary(emu as never, {
    allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
    freeMem: () => undefined,
  });
  lib.setSession({}, { emit: () => true });
  const handle = lib.initDoor(0x1000);
  lib.getKey(handle, 0);
  lib.queueInput("y");
  expect(resumeD0).toBe(121); // 'y'
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run — PASS. `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `git commit -m "feat(dd): deferred Prompt/GetKey input via pause/resume"`

---

### Task 5: Wire the missing plumbing — vector install, trap registration, session state

**Files:**
- Modify: `web/backend/src/amiga-emulation/api/LibraryTraps.ts` — add
  `this.syncTrapAddressesToMoira();` at the end of `installDreamDoorVectors()`
  (currently missing; `installFameVectors()` at the same file has it — copy
  that pattern exactly).
- Modify: `web/backend/src/amiga-emulation/api/ExecLibrary.ts:1187-1193` —
  bump `stubJumpTableEntries: 20` to `24` (the real LVO range spans `-6`
  through `-144` = 24 slots at 6-byte spacing; `20` truncates before
  `DDCommand`@`-132` and the unnamed `-138`/`-144` slots).
- Modify: `web/backend/src/amiga-emulation/LibraryManager.ts:726-805` — add
  a `dreamdoor.library` branch to the `addLibraryOpenedCallback` chain
  (this is the missing wire the research doc identified — the library
  object and session are already constructed at `LibraryManager.ts:651-654`,
  and `libraryTraps.setDreamDoorLibrary(...)` is already called at
  `LibraryManager.ts:698`, but nothing ever calls
  `installDreamDoorVectors()`):
  ```typescript
  if (name.toLowerCase() === "dreamdoor.library") {
debugLog("[LibraryManager] dreamdoor.library opened, installing vectors...");
    this.libraryTraps!.installDreamDoorVectors();
    // syncTrapAddressesToMoira() is called inside installDreamDoorVectors()
    // itself after this task's LibraryTraps.ts fix, mirroring fame.library.
  }
  ```
- Modify: `web/backend/src/amiga-emulation/LibraryManager.ts:651-654` —
  update the `DreamDoorLibrary` construction to pass the alloc closures per
  Task 2's new constructor signature (mirror the `fameLibrary` construction
  two lines below it):
  ```typescript
  this.dreamDoorLibrary = new DreamDoorLibrary(this.emulator, {
    allocMem: (size: number, flags: number) => this.execLibrary!.allocMem(size, flags),
    freeMem: (addr: number, size: number) => this.execLibrary!.freeMem(addr, size),
  });
  this.dreamDoorLibrary.setSession(this.config.bbsSession, this.socket);
  ```
- Modify: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:81-107` — add
  `dreamDoorLibrary: null as any,` to the `sharedState` literal (mirrors
  `ximProtocol`).
- Modify: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:642-649` —
  add `this.sharedState.dreamDoorLibrary = this.libraryManager.dreamDoorLibrary;`
  alongside the other `sharedState.* = this.libraryManager.*` assignments.
- Modify: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:167-189` —
  add a `dreamDoorLibrary` input-routing branch, mirroring the existing
  `fimProtocol` check exactly (checked before the XIM/TIM/DOS routing, same
  as FIM, so DD input isn't double-delivered):
  ```typescript
  // Route to DreamDoor if a Prompt/GetKey call is deferred. Unlike FIM,
  // dreamdoor.library calls are direct trap-vector calls, not a message
  // port — DreamDoorLibrary tracks its own pending-input state (see Task 4).
  if (this.sharedState.dreamDoorLibrary?.isWaitingForInput?.()) {
debugLog(`[AmigaDoorSession] Forwarding input to DreamDoor: "${data}"`);
    this.sharedState.dreamDoorLibrary.queueInput(data);
    return;
  }
  ```
  Add the `isWaitingForInput(): boolean` method to `DreamDoorLibrary`
  (`return this.pendingPromptBuffer !== null || this.pendingKeyPending;`)
  as part of this task.
- Test: `web/backend/tests/amiga-emulation/dreamdoor-wiring.test.ts`

- [ ] **Step 1: Write a failing test** that exercises the wiring at the
  `LibraryTraps`/`ExecLibrary` boundary (full `LibraryManager`/socket
  integration is covered by Task 8's E2E run; this test targets the two
  concrete, easily-regression-tested fixes):

```typescript
// web/backend/tests/amiga-emulation/dreamdoor-wiring.test.ts
import * as fs from "fs";
import * as path from "path";

describe("dreamdoor.library wiring", () => {
  it("installDreamDoorVectors() syncs trap addresses to MOIRA (mirrors installFameVectors)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/api/LibraryTraps.ts"),
      "utf8"
    );
    const start = src.indexOf("installDreamDoorVectors(): void {");
    const end = src.indexOf("installFameVectors(): void {");
    const body = src.slice(start, end);
    expect(body).toContain("syncTrapAddressesToMoira();");
  });

  it("LibraryManager installs dreamdoor.library vectors on OpenLibrary", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/LibraryManager.ts"),
      "utf8"
    );
    expect(src).toMatch(/name\.toLowerCase\(\) === "dreamdoor\.library"[\s\S]{0,200}installDreamDoorVectors/);
  });

  it("ExecLibrary reserves enough stub jump-table slots for the full -6..-144 LVO range", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/amiga-emulation/api/ExecLibrary.ts"),
      "utf8"
    );
    const match = src.match(/case "dreamdoor\.library":[\s\S]{0,200}stubJumpTableEntries:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (all three assertions fail against
  current code).
- [ ] **Step 3: Apply the file edits above.**
- [ ] **Step 4: Run — expect PASS. `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `git commit -m "fix(dd): wire dreamdoor.library vector install to OpenLibrary + session state"`

---

### Task 6: doorType `DD` plumbing

**Files:**
- Modify: `web/backend/src/utils/amiga-command-parser.util.ts:17-31` (add
  `DD = 'DD',  // DayDream Interface Module (DayDream BBS door compat)`
  to the `DoorType` enum, alongside `FIM`), `:453-471` (add an alias arm:
  `} else if (typeStr === 'DM' || typeStr === 'DD') { type = DoorType.DD;`
  — DayDream doors don't have an established 2-3-char TYPE= convention the
  way FAME's FM/FI/FIM do since DayDream's own `.info`/config format never
  needed one; accept `DD` as the primary/only alias since that's the string
  `analyze-all-doors.sh` and `door-installer.ts` already emit).
- Modify: `web/backend/src/utils/node-logs.util.ts:14-23` (add
  `DD = 9,  // DD (DayDream BBS doors)` — next free numeric code after
  `FIM = 8`).
- Modify: `web/backend/src/amiga-emulation/DoorTypes.ts:7` (update the
  doc-comment list `XIM, AIM, SIM, TIM, IIM, MCI, AEM, SUP, FIM` to add
  `, DD`).
- Modify: `web/backend/src/handlers/door.handler.ts:406` (add `'DD'` to
  `AMIGA_68K_DOOR_TYPES`), `:1582-1584` (add a `case 'DD':` arm identical in
  shape to the `case 'FIM':` arm — `await executeAmigaDoor(socket, session,
  door, doorSession); break;`), `:2789-2796` (extend the `doorTypeCode`
  ternary chain with `doorType === 'DD' ? DoorType.DD :` before the final
  `DoorType.XIM` fallback).
- Modify: `web/backend/src/amiga-emulation/LibraryManager.ts:491` — extend
  the `useXimProtocol` gate: `doorType !== "SIM" && doorType !== "SUP" &&
  doorType !== "FIM" && doorType !== "DD"` (DD doors, like FIM doors, never
  touch `AEDoorPort`/XIM — they only call `dreamdoor.library`, so XIMProtocol
  must not be constructed for them, same reasoning as FIM's exclusion).
- Test: `web/backend/tests/dd-doortype-routing.test.ts`

- [ ] **Step 1: Write a failing test**

```typescript
// web/backend/tests/dd-doortype-routing.test.ts
// NOTE: amiga-command-parser.util.ts has no single exported "parse a TYPE=
// string" entry point (the alias-matching block at :453-471 lives inside
// loadCommandFromInfo()'s larger parse). Test the enum + the 68K category
// list directly (both real, stable exports); cover the alias-matching
// arm itself via loadCommandFromInfo() against a throwaway .info-style
// fixture if one is easy to construct at implementation time, otherwise
// treat the alias arm as covered by Task 8's E2E run (a DD-typed .info
// actually launching the door end-to-end is a stronger signal anyway).
import { DoorType } from "../src/utils/amiga-command-parser.util";
import { AMIGA_68K_DOOR_TYPES, isAmiga68kDoorType } from "../src/handlers/door.handler";

describe("DD doorType", () => {
  it("is a recognized enum member distinct from FIM/XIM", () => {
    expect(DoorType.DD).toBe("DD");
    expect(DoorType.DD).not.toBe(DoorType.FIM);
  });
  it("is categorized as an Amiga 68K door type", () => {
    expect(AMIGA_68K_DOOR_TYPES).toContain("DD");
    expect(isAmiga68kDoorType("DD")).toBe(true);
    expect(isAmiga68kDoorType("dd")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Apply the six file edits above.**
- [ ] **Step 4: Run — PASS. `npx tsc --noEmit` clean. Run the full
  pre-existing suite `SKIP_DB_INIT=1 npx jest --config
  dev-scripts/jest.config.ts --rootDir . tests/` — no regressions (this
  touches `useXimProtocol`, a shared gate FIM already extended once; verify
  FIM's own routing tests still pass).**
- [ ] **Step 5: Commit** `git commit -m "feat(dd): DD doorType routing end-to-end"`

---

### Task 7: Detection — installer sniffs `dreamdoor.library`/`DD_DoorPort`

**Files:**
- Modify: `web/backend/src/doors/door-installer.ts:272-277`
  (`detectDoorType`) — add a branch before the `DoorControl` check (mirrors
  the FIM plan's Task 8 exactly, and matches `analyze-all-doors.sh`'s
  already-shipped ordering, which checks `dreamdoor.library` last, after
  `DoorControl`/`0x790`):
  ```typescript
  export function detectDoorType(buf: Buffer): string {
    if (buf.includes(Buffer.from('FAMEDoorPort', 'latin1'))) return 'FIM';
    if (buf.includes(Buffer.from('AEDoorPort', 'latin1'))) return 'XIM';
    if (buf.includes(Buffer.from('DoorControl', 'latin1'))) return 'SIM';
    if (
      buf.includes(Buffer.from('dreamdoor.library', 'latin1')) ||
      buf.includes(Buffer.from('DD_DoorPort', 'latin1'))
    ) return 'DD';
    return 'XIM';
  }
  ```
  Update the function's doc comment to note the DD branch and its position
  (checked last — `dreamdoor.library` is a generic-enough string that a door
  using both AEDoorPort scaffolding and a DD compatibility shim, if one
  exists, should still classify as XIM first, same precedence reasoning
  already documented for FAMEDoorPort-before-AEDoorPort).
- **No change needed to `dev/scripts/analyze-all-doors.sh`** — confirmed
  already wired (`has_dreamdoor` check, `doortype="DD"`, `DD_COUNT`
  increment, summary line) as of this plan's writing; this task is
  installer-only.
- Test: `web/backend/tests/door-installer-detect-dd.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { detectDoorType } from "../src/doors/door-installer";

describe("detectDoorType — DD", () => {
  const hunk = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
  it("classifies dreamdoor.library binaries as DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...dreamdoor.library...", "latin1")]);
    expect(detectDoorType(bin)).toBe("DD");
  });
  it("classifies raw DD_DoorPort binaries as DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...DD_DoorPort1...", "latin1")]);
    expect(detectDoorType(bin)).toBe("DD");
  });
  it("still prefers FIM/XIM/SIM precedence over DD", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...AEDoorPort...dreamdoor.library...", "latin1")]);
    expect(detectDoorType(bin)).toBe("XIM");
  });
});
```

- [ ] **Step 2: Run — FAIL → Step 3: implement → Step 4: PASS + `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `git commit -m "feat(dd): dreamdoor.library/DD_DoorPort detection in installer"`

---

### Task 8: End-to-end — DreamTagWall and AVH-BaudCheck corpus oracles

Corpus scan of all 84 `Archives/DayDream/*.LHA` (extracted read-only to
`/private/tmp`, never modifying `Archives/`) found 13-19 archives
referencing `dreamdoor.library`/`DD_DoorPort`/`DDCommand`; several are
`.dd`/`ARexx` scripts (not 68K binaries) or GUI/MUI doors (out of scope —
this emulator is terminal-only). Two are real, small, documented, terminal-
only `dreamdoor.library` executables suitable as oracles:

- **`DDTWALL.LHA` → `DreamTagWall`** (11572 bytes): has a `.DOC` with
  install parameters (`DOOR_COMMAND.. WALL`, `DOOR_TYPE..... 1`,
  `DOOR_SECURITY. 1`). Simple tagline-wall door: prompts for a line of text
  and a tag/handle, exercises `SendString`/`Prompt` and likely
  `InquirePointers`(`dp_CurrUser`) for the default handle.
- **`AVH-BC01.LHA` → `avh-baudcheck/doors/AVH-BaudCheck`** (3124 bytes):
  tiny baud-rate gate door (its `.cfg` sets a minimum baud of 9600);
  exercises `dp_BpsRate` specifically — good second, minimal-surface oracle.

**Files:**
- Create: `Doors/DreamTagWall/DreamTagWall` (copy from
  `/private/tmp/dd-re/corpus-scan/DDTWALL/DreamTagWall` — the same
  `/private/tmp` extraction this plan's RE phase already made from
  `Archives/DayDream/DDTWALL.LHA`; if that scratch dir no longer exists,
  re-extract fresh with `lha xq Archives/DayDream/DDTWALL.LHA -w=/private/tmp/ddtwall-extract`
  — use `cp`, NEVER Edit/Write, binary)
- Create: `Doors/AVHBaudCheck/AVH-BaudCheck` (same approach, from
  `Archives/DayDream/AVH-BC01.LHA`)
- Modify: `dev/scripts/door-corpus/corpus.json` — two entries, `doorType:
  "DD"`, scripted input for DreamTagWall's line-then-tag prompts (exact
  prompt text/count TBD from a first interactive run — capture with
  `--capture` per the verification step below, do not hand-guess the
  script). Edit via python `ensure_ascii=False` + trailing newline — NEVER
  Edit tool, high-bit bytes risk.

**Automated verification:**
- [ ] Run DreamTagWall: `cd web/backend && SKIP_DB_INIT=1
  SKIP_NETWORK_LISTENERS=1 npx tsx src/scripts/run-amiga-door.ts
  ../../Doors/DreamTagWall/DreamTagWall 1 --doortype DD --timeout 30
  --command WALL > /tmp/dd-tagwall.out 2> /tmp/dd-tagwall.log` (redirect,
  never pipe — see `feedback_door_exit_test_pipe_pitfall.md`). Expected:
  door's prompt text reaches the terminal via `ansi-output`, no
  `[DreamDoor] Cannot install` / trap-not-found errors in the log, clean
  `EXIT 0`.
- [ ] Run AVH-BaudCheck the same way; expected: reads `dp_BpsRate`, no
  Guru/TRAP in the log.
- [ ] Corpus: `npx tsx src/scripts/corpus-integration-runner.ts --only
  dreamtagwall_1,avhbaudcheck_1 --capture` then a verify run passes both.
- [ ] Full backend suite + `npx tsc --noEmit` clean.

**Manual verification (sysop):**
- [ ] Install DreamTagWall via DOORMAN, launch from the BBS menu over the
  web terminal, post a tag line, confirm it displays with the logged-in
  user's handle, exit cleanly back to the menu.

- [ ] **Commit** `git commit -m "feat(dd): DreamDoor reference doors runnable end-to-end + corpus entries"`

---

## Known risks / decisions

- **`dp_DoorParams` (offset 0x34) is a known gap in the real v1.0 library**
  (confirmed by disassembly: `InquirePointers`'s two reply batches skip this
  offset entirely) that `Xim.s`'s client nonetheless reads. Decision: our
  synthetic `InquirePointers` populates it anyway (with the door's launch
  params, matching what a well-behaved implementation *should* do) rather
  than faithfully reproducing the bug — we control both sides of this
  emulation and a real garbage-memory read has no faithful equivalent
  worth emulating. If a specific corpus door depends on observing the
  *buggy* (unpopulated) behavior, revisit — none of the two Task 8 oracles
  are known to.
- **`JoinConference` (-66) and 8 other LVOs (-72, -78, -90 "XprReceive",
  -96, -102, -120, -138, -144) have no client source confirming their
  name**, only their calling convention (recovered from direct
  disassembly, documented in the research doc). None of the ~13-door corpus
  is known to call them. Policy: any LVO not in `DD_LVO` (Task 1) falls
  through to `stubJumpTableEntries`'s RTS-fill (return 0 silently) — same
  fallback FAME uses for its untranslated tail LVOs. If a real door hangs
  or Gurus on one of these, add it to `DD_LVO` + `dreamdoor-vectors.ts`
  with a `debugLog` explicit stub first (log-and-return-0) before
  implementing real behavior, mirroring the FIM plan's
  `NOTIMPLEMENTED`-and-log discipline.
- **`dreamdoor.library` v6.0 (02 Feb 97) adds 26 more LVOs (-150 through
  -300, confirmed backward-compatible with v1.0's -30..-144 — same offsets,
  same command shapes)** that this plan does not implement. Since our trap
  table is keyed by LVO offset (not library version), a v6.0-targeting door
  calling into that range will fall through to the RTS stub fallback
  automatically — safe, no crash, just unimplemented. Extend
  `stubJumpTableEntries` further (to 50) and add named vectors only if a
  specific corpus door needs one.
- **`Prompt`'s A1 register (prompt-text pointer) is unreliable in the
  reference client** (`Xim.s` leaves it as residual/leftover state rather
  than setting it purposefully for every call path — see Task 3). Our
  `Prompt` implementation must treat a garbage/unreadable A1 as "no prompt
  text to emit" rather than crashing on an out-of-range read.
  `MoiraEmulator.readMemory`/`readString` already returns 0/empty for
  unmapped addresses in this codebase (same defensive behavior XIM/FIM
  traps rely on), so this should be a non-issue in practice — flagged here
  so a future debugger doesn't mistake garbage A1 output for a bug in our
  offset recovery.
- **GetKey's v6.0 extended (word-sized) key mode** (`D1` bit 3) is detected
  and logged but not implemented — falls back to v1.0's byte behavior. No
  known corpus door needs it (both Task 8 oracles are old enough to predate
  v6.0, per their file dates in the LHA archives).
- **DoorTagWall's exact prompt/input sequence is unverified until Task 8's
  first live run** (no source available, unlike FAME's `TestDoor.FIM`) —
  the corpus script must be captured from a real run (`--capture`), not
  hand-authored from static analysis, per the corpus tooling's own
  intended workflow.
