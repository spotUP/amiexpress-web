# FAME (FIM) Door Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run native FAME BBS "FIM" doors (75+ archive doors) on the AmiExpress-Web 68K emulator via a FAMEDoorPort message server + minimal FAME.library.

**Architecture:** Mirror the existing XIM stack: a `FAMEDoorPort<node>` exec message port created before the door starts; `ExecLibrary.putMsg` recognizes the port name and hands the message to a new `FIMProtocol` handler that reads/writes the 282-byte `FAMEDoorMsg`, executes the command against `bbsSession`/socket, and replies `NT_REPLYMSG` to `mn_ReplyPort`. A minimal `FAME.library` (trap-vectored like bsdsocket) supplies `FAMEAllocObject` etc. New doorType `FIM` routes through `executeAmigaDoor` unchanged.

**Tech Stack:** TypeScript backend (web/backend), MOIRA 68K emulator, jest (`--config dev-scripts/jest.config.ts`).

**Spec:** `thoughts/shared/research/2026-08-14_fame-dd-door-compat.md` (protocol details, plug-in points). Primary upstream refs: `/Users/spot/Code/amiexpress_doors/Sources/_C/FA_DE103/Includes/FAME/FAMEDoorCommands.h` (command semantics), `FAMEPublicStructs.h` (struct), `FAME/FAMEDoor/FAMEDoorStartUp/FAMEDoorStartUp.c` (client handshake), `FAMECFPR/Pre-Release/include/fd/FAME_lib.fd` (library LVO order, bias 30).

## Global Constraints

- TypeScript strict, no `any` in new exported APIs; run `npx tsc --noEmit` in `web/backend` after every task.
- Tests run with `SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . <path>` from `web/backend`. If `ts-node` is absent, render config: `npx tsx -e "const c=require('./dev-scripts/jest.config.ts');console.log(JSON.stringify(c.default||c))" > /tmp/jest.config.json` and pass that.
- Amiga binary I/O: big-endian (`readMemory32`/`writeMemory32` are BE already; never Buffer LE methods).
- No emojis anywhere. ASCII log tokens.
- FAMEDoorMsg field offsets (fixed, from FAMEPublicStructs.h; exec Message = 20 bytes):
  IOString@20(len 202), StringPtr@222, Command@226, Data1@230, Data2@234,
  Data3@238, ReturnCode@242, Node@246, InternalBits@250, StructDummy1-3@254/258/262,
  StringPtr2@266, Data4@270, BitFlags@274, ExternalPort@278. sizeof=282.
- Return codes: 0 OK, 1 fail, 2 no-such-cmd, 3 denied, 4 not-implemented, 5 aborted, -1 abort-requested.
- Unknown/unimplemented commands MUST reply ReturnCode=4 and log `[FIM] not implemented: <n>` — never hang the door.

---

### Task 1: FIM constants module

**Files:**
- Create: `web/backend/src/amiga-emulation/fim/fim-constants.ts`
- Test: `web/backend/tests/amiga-emulation/fim-constants.test.ts`

**Interfaces:**
- Produces: `FDOM` (offset map), `FIM_CMD` (command codes), `FIM_RC` (return codes), `FAMEDOORMSG_SIZE = 282`, `fimPortName(node: number): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/amiga-emulation/fim-constants.test.ts
import { FDOM, FIM_CMD, FIM_RC, FAMEDOORMSG_SIZE, fimPortName } from "../../src/amiga-emulation/fim/fim-constants";

describe("FIM constants", () => {
  it("matches FAMEPublicStructs.h byte offsets", () => {
    expect(FDOM.IOSTRING).toBe(20);
    expect(FDOM.IOSTRING_LEN).toBe(202);
    expect(FDOM.STRINGPTR).toBe(222);
    expect(FDOM.COMMAND).toBe(226);
    expect(FDOM.DATA1).toBe(230);
    expect(FDOM.DATA2).toBe(234);
    expect(FDOM.DATA3).toBe(238);
    expect(FDOM.RETURNCODE).toBe(242);
    expect(FDOM.NODE).toBe(246);
    expect(FAMEDOORMSG_SIZE).toBe(282);
  });
  it("names the port like SPrintf(FAMEDoorPort,\"FAMEDoorPort%ld\",NodeNr)", () => {
    expect(fimPortName(1)).toBe("FAMEDoorPort1");
    expect(fimPortName(12)).toBe("FAMEDoorPort12");
  });
  it("has the MC/NR/CF/SR/AR codes used by the reference kit", () => {
    expect(FIM_CMD.MC_DoorStart).toBe(1);
    expect(FIM_CMD.MC_ShutDown).toBe(2);
    expect(FIM_CMD.MC_ShutDownLastWords).toBe(3);
    expect(FIM_CMD.NR_SendStr).toBe(10);
    expect(FIM_CMD.NR_PromptChars).toBe(14);
    expect(FIM_CMD.AR_SendStr).toBe(851);
    expect(FIM_RC.NOTIMPLEMENTED).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web/backend && SKIP_DB_INIT=1 npx jest --config dev-scripts/jest.config.ts --rootDir . tests/amiga-emulation/fim-constants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```typescript
// web/backend/src/amiga-emulation/fim/fim-constants.ts
/**
 * FAME BBS "FIM" door protocol constants.
 * Source of truth: amiexpress_doors/Sources/_C/FA_DE103/Includes/FAME/
 * FAMEPublicStructs.h (struct FAMEDoorMsg) and FAMEDoorCommands.h.
 */
export const FAMEDOORMSG_SIZE = 282;

/** Byte offsets inside struct FAMEDoorMsg (exec Message header = 20 bytes). */
export const FDOM = {
  MSG: 0,
  MN_REPLYPORT: 14,
  MN_LENGTH: 18,
  IOSTRING: 20,
  IOSTRING_LEN: 202,
  STRINGPTR: 222,
  COMMAND: 226,
  DATA1: 230,
  DATA2: 234,
  DATA3: 238,
  RETURNCODE: 242,
  NODE: 246,
  INTERNALBITS: 250,
  STRUCTDUMMY1: 254,
  STRUCTDUMMY2: 258,
  STRUCTDUMMY3: 262,
  STRINGPTR2: 266,
  DATA4: 270,
  BITFLAGS: 274,
  EXTERNALPORT: 278,
} as const;

export const FIM_RC = {
  OK: 0,
  FAIL: 1,
  NOSUCHCMD: 2,
  DENIED: 3,
  NOTIMPLEMENTED: 4,
  ABORTED: 5,
  USERERROR: 10,
  DOORABORT: -1,
} as const;

export const FIM_CMD = {
  MC_DoorStart: 1,
  MC_ShutDown: 2,
  MC_ShutDownLastWords: 3,
  NR_SendStr: 10,
  NR_SendStrCRLF: 11,
  NR_SendStrCon: 12,
  NR_SendStrSer: 13,
  NR_PromptChars: 14,
  NR_HotKey: 15,
  NR_BBSName: 16,
  NR_SysOp: 17,
  NR_MainLine: 23,
  NR_Name: 31,
  NR_Password: 32,
  NR_Location: 33,
  NR_AccessLevel: 37,
  NR_TimeRemain: 48,
  NR_Uploads: 51,
  NR_Downloads: 52,
  NR_BytesUpload: 53,
  NR_BytesDownload: 54,
  CF_ShowText: 400,
  CF_ReturnCommand: 408,
  CF_CallersLog: 411,
  SR_ConfName: 600,
  SR_ConfNum: 602,
  SR_FAMEVersion: 608,
  SR_NodeNumber: 614,
  AR_GetKey: 800,
  AR_SendStr: 851,
  AR_HotKey: 861,
} as const;

export function fimPortName(node: number): string {
  return `FAMEDoorPort${node}`;
}
```

- [ ] **Step 4: Run test to verify it passes** (same command). Expected: PASS.
- [ ] **Step 5: Commit** `git add web/backend/src/amiga-emulation/fim/fim-constants.ts web/backend/tests/amiga-emulation/fim-constants.test.ts && git commit -m "feat(fim): FAMEDoorMsg constants + port naming"`

---

### Task 2: FAME.library (minimal) + vectors + registration

**Files:**
- Create: `web/backend/src/amiga-emulation/api/FameLibrary.ts`
- Create: `web/backend/src/amiga-emulation/api/library-vectors/fame-vectors.ts`
- Modify: `web/backend/src/amiga-emulation/api/library-vectors/index.ts` (export, mirror line 24 style)
- Modify: `web/backend/src/amiga-emulation/api/ExecLibrary.ts:190-201` (add `FAME_LIB_ADDR = 0x0fe000`) and `:1160-1166` (add `case "fame.library"` — lowercase compare, version 6, `stubJumpTableEntries: 80`)
- Modify: `web/backend/src/amiga-emulation/api/LibraryTraps.ts` (setter next to `:297`, `installFameVectors()` copied from the `:1172-1203` pattern **plus `this.syncTrapAddressesToMoira()` at the end**)
- Modify: `web/backend/src/amiga-emulation/LibraryManager.ts:649-652` (construct + setSession), `:688` (inject into traps), `:715-793` (add open-callback branch `if (lower === "fame.library") { traps.installFameVectors(); }`)
- Test: `web/backend/tests/amiga-emulation/fame-library.test.ts`

**Interfaces:**
- Consumes: `FAMEDOORMSG_SIZE` from Task 1.
- Produces: `class FameLibrary { setSession(bbsSession: unknown, socket: unknown): void; allocObject(type: number): number; freeObject(addr: number): void; strCopy(srcAddr: number, dstAddr: number, maxLen: number): number; atol(bufAddr: number): number; }` and `fameVectors` array (same shape as `dreamdoor-vectors.ts` entries: `{offset, name, handler(emu, lib)}`).

LVO layout (from `FAME_lib.fd`, `##bias 30` — offset = -(30 + 6*index)):
`FAMEStrStr -30, FAMEStackReport -36, FAMEStrChr -42, FAMEFileCopy -48, FAMEFSearch -54, FAMEIsNumStr -60, FAMEStrChrCase -66, FAMEStrFil -72, FAMEStrMid -78, FAMEStrStrCase -84, FAMEAllocPooled -90, FAMECreatePool -96, FAMEDeletePool -102, FAMEFreePooled -108, FAMEResetPool -114, FAMEFillMem -120, FAMEChrCut -126, FAMEChrCutCase -132, FAMEStrCut -138, FAMEStrCutCase -144, FAMEStrCopy -150, (3 privates -156..-168), FAMEMemSet -174, (3 privates -180..-192), FAMESwapRedWhite -198, FAMEAllocObject -204, FAMEFreeObject -210, FAMENumToStr -216, ...` (implement through -216; everything beyond stays RTS-stub).

MVP real implementations: `FAMEAllocObject(d0=type)` — allocate `FAMEDOORMSG_SIZE` zeroed bytes via `execLibrary.allocMem(282, MEMF_CLEAR)` when type===1, return address (0 on other types is WRONG — allocate 282 for any type, doors only use type 1 today, log others); `FAMEFreeObject(a1)` — `execLibrary.freeMem(addr, 282)`; `FAMEStrCopy(a0 src, a1 dst, d0 maxLen)` — copy C string capped at maxLen-1, NUL-terminate, return copied length; `FAMEAtol(a0)` — parse ASCII integer, return value; `FAMEStrFil/FAMEFillMem/FAMEMemSet(a0,d0,d1)` — memset. All other listed LVOs: register the name with a handler that logs `[FAME.library] STUB <name>` and returns 0 (explicit handlers beat silent RTS for debugging; the RTS fill from `stubJumpTableEntries` remains the safety net for the tail).

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/amiga-emulation/fame-library.test.ts
import { FameLibrary } from "../../src/amiga-emulation/api/FameLibrary";
import { fameVectors } from "../../src/amiga-emulation/api/library-vectors/fame-vectors";
import { FAMEDOORMSG_SIZE } from "../../src/amiga-emulation/fim/fim-constants";

// Minimal emulator stub: byte-addressable memory map (pattern from
// tests/amiga-emulation/datestamp-d0-return.test.ts).
class MemStub {
  mem = new Map<number, number>();
  regs = new Map<number, number>();
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
  getRegister(r: number) { return this.regs.get(r) ?? 0; }
  setRegister(r: number, v: number) { this.regs.set(r, v >>> 0); }
}

describe("FAME.library", () => {
  it("FAMEAllocObject(1) returns a 282-byte zeroed block", () => {
    const emu = new MemStub();
    let nextAlloc = 0x200000;
    const lib = new FameLibrary(emu as never, {
      allocMem: (size: number) => { const a = nextAlloc; nextAlloc += size; return a; },
      freeMem: () => undefined,
    });
    const addr = lib.allocObject(1);
    expect(addr).toBe(0x200000);
    expect(emu.readMemory32(addr)).toBe(0);
    expect(emu.readMemory32(addr + FAMEDOORMSG_SIZE - 4)).toBe(0);
  });
  it("FAMEStrCopy respects maxLen and NUL-terminates", () => {
    const emu = new MemStub();
    const lib = new FameLibrary(emu as never, { allocMem: () => 0, freeMem: () => undefined });
    const src = 0x1000, dst = 0x2000;
    for (let i = 0; i < 5; i++) emu.writeMemory(src + i, "HELLO".charCodeAt(i));
    emu.writeMemory(src + 5, 0);
    lib.strCopy(src, dst, 4);
    expect(String.fromCharCode(emu.readMemory(dst), emu.readMemory(dst + 1), emu.readMemory(dst + 2))).toBe("HEL");
    expect(emu.readMemory(dst + 3)).toBe(0);
  });
  it("vector table covers FAMEAllocObject at LVO -204 (fd bias 30)", () => {
    const alloc = fameVectors.find(v => v.name === "FAMEAllocObject");
    expect(alloc?.offset).toBe(-204);
    const free = fameVectors.find(v => v.name === "FAMEFreeObject");
    expect(free?.offset).toBe(-210);
    const strcopy = fameVectors.find(v => v.name === "FAMEStrCopy");
    expect(strcopy?.offset).toBe(-150);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found).**
- [ ] **Step 3: Implement.** `FameLibrary` constructor takes `(emulator, { allocMem, freeMem })` so tests avoid the full ExecLibrary; production wiring in LibraryManager passes closures over `execLibrary.AllocMem`-equivalents. Vector handlers read registers per .fd register spec (`FAMEAllocObject(Type)(d0)` → `emu.getRegister(0)`; `FAMEStrCopy(a0/a1/d0)` → registers 8, 9, 0). Register conventions identical to `dreamdoor-vectors.ts:23-133`.
- [ ] **Step 4: Run test — expect PASS.** Also `npx tsc --noEmit` clean.
- [ ] **Step 5: Wire registration** (ExecLibrary case, LibraryTraps setter+installer with `syncTrapAddressesToMoira()`, LibraryManager construct/inject/open-callback). Grep check that the open-callback branch exists: `grep -n "fame.library" src/amiga-emulation/LibraryManager.ts` shows the install call.
- [ ] **Step 6: Commit** `git commit -m "feat(fim): minimal FAME.library with trap vectors, wired at OpenLibrary"`

---

### Task 3: FIMProtocol skeleton — MC_DoorStart round-trip

**Files:**
- Create: `web/backend/src/amiga-emulation/fim/fim-protocol.ts`
- Modify: `web/backend/src/amiga-emulation/api/ExecLibrary.ts` putMsg name-dispatch (beside the `isAEDoorPort` check at the `"aedoorport"` prefix test): add `const isFimPort = port.name?.toLowerCase().startsWith("famedoorport");` and invoke `this.fimMessageCallback?.(msgAddr)` under the same suppress guard; add `setFimMessageCallback(cb)`.
- Modify: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:675-684`: extend the pre-start port creation to `doorType === "FIM"` → `execLibrary.createLightweightPort(fimPortName(nodeId))`; register the protocol: `execLibrary.setFimMessageCallback((msgAddr) => this.fimProtocol.handleMessage(msgAddr))`.
- Test: `web/backend/tests/amiga-emulation/fim-protocol.test.ts`

**Interfaces:**
- Consumes: Task 1 constants.
- Produces: `class FIMProtocol { constructor(deps: FIMDeps); handleMessage(msgAddr: number): void; queueInput(data: string): void; }` where `FIMDeps = { emulator; execLibrary: { putMsg(port: number, msg: number, opts?: {suppressDoorCallback?: boolean}): void }; socket: { emit(ev: string, data?: string): boolean } | null; bbsSession: Record<string, unknown>; nodeId: number; onShutdown(rc: number, lastWords?: string): void; }`.

Reply mechanics (copy XIM semantics): write `FDOM.RETURNCODE`, set `ln_Type` byte at `msgAddr+8` to 6 (NT_REPLYMSG), read reply port from `msgAddr+FDOM.MN_REPLYPORT`, `execLibrary.putMsg(replyPort, msgAddr, { suppressDoorCallback: true })`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/backend/tests/amiga-emulation/fim-protocol.test.ts
import { FIMProtocol } from "../../src/amiga-emulation/fim/fim-protocol";
import { FDOM, FIM_CMD, FIM_RC } from "../../src/amiga-emulation/fim/fim-constants";
// reuse MemStub from fame-library.test.ts (extract to tests/amiga-emulation/helpers/mem-stub.ts in this task)
import { MemStub } from "./helpers/mem-stub";

function buildMsg(emu: MemStub, addr: number, cmd: number) {
  emu.writeMemory32(addr + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(addr + FDOM.COMMAND, cmd);
  return addr;
}

describe("FIMProtocol", () => {
  function make(emu: MemStub) {
    const putMsgCalls: Array<{ port: number; msg: number }> = [];
    const shutdowns: number[] = [];
    const proto = new FIMProtocol({
      emulator: emu as never,
      execLibrary: { putMsg: (port, msg) => { putMsgCalls.push({ port, msg }); } },
      socket: { emit: () => true },
      bbsSession: {},
      nodeId: 1,
      onShutdown: (rc) => { shutdowns.push(rc); },
    });
    return { proto, putMsgCalls, shutdowns };
  }

  it("MC_DoorStart replies OK to mn_ReplyPort as NT_REPLYMSG", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls } = make(emu);
    const msg = buildMsg(emu, 0x8000, FIM_CMD.MC_DoorStart);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
    expect(emu.readMemory(msg + 8)).toBe(6); // NT_REPLYMSG
    expect(putMsgCalls).toEqual([{ port: 0x9000, msg }]);
  });

  it("unknown command replies NOTIMPLEMENTED, never hangs", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls } = make(emu);
    const msg = buildMsg(emu, 0x8000, 9999);
    proto.handleMessage(msg);
    expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.NOTIMPLEMENTED);
    expect(putMsgCalls.length).toBe(1);
  });

  it("MC_ShutDown replies then fires onShutdown", () => {
    const emu = new MemStub();
    const { proto, putMsgCalls, shutdowns } = make(emu);
    proto.handleMessage(buildMsg(emu, 0x8000, FIM_CMD.MC_ShutDown));
    expect(putMsgCalls.length).toBe(1);
    expect(shutdowns).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `fim-protocol.ts`** — `handleMessage` reads `COMMAND`, switch: MC_DoorStart → rc=OK; MC_ShutDown/MC_ShutDownLastWords → rc=OK, reply first, then `onShutdown(0, lastWords?)` (lastWords = C string from IOSTRING for cmd 3); default → rc=NOTIMPLEMENTED + `debugLog`. Private helpers: `readCString(addr, max)`, `writeCString(addr, s, max)` (Latin-1, cap max-1, NUL), `reply(msgAddr, rc)`.
- [ ] **Step 4: Run — expect PASS. `npx tsc --noEmit` clean.**
- [ ] **Step 5: Wire putMsg dispatch + AmigaDoorSession port creation** as listed under Files. Grep-verify: `grep -n "famedoorport" src/amiga-emulation/api/ExecLibrary.ts`.
- [ ] **Step 6: Commit** `git commit -m "feat(fim): FIMProtocol skeleton — lifecycle commands + port dispatch"`

---

### Task 4: Output commands (AR_SendStr, NR_SendStr, NR_SendStrCRLF, CF_ShowText)

**Files:**
- Modify: `web/backend/src/amiga-emulation/fim/fim-protocol.ts`
- Test: extend `web/backend/tests/amiga-emulation/fim-protocol.test.ts`

**Interfaces:** Consumes Task 3 `FIMProtocol`. Produces no new exports — new switch arms.

Semantics (from FAMEDoorStartUp.c support funcs + FAMEDoorCommands.h):
- `AR_SendStr (851)`: string is at memory address `fdom_StringPtr` (deref!), `Data1=1` appends `\r\n`. Emit via `socket.emit("ansi-output", text)`.
- `NR_SendStr (10)` / `NR_SendStrCRLF (11)`: string in `fdom_IOString`; 11 appends `\r\n`.
- `CF_ShowText (400)`: IOString = screen file name; MVP resolves against BBS text dirs the way `xim/io-file-display.ts` does — reuse its resolution helper if exported, else emit `[FIM] CF_ShowText <name>` log + rc=NOTIMPLEMENTED (do NOT fake success). Decide by reading `io-file-display.ts` exports at implementation time; if reuse takes >30 lines of glue, ship the honest NOTIMPLEMENTED and log — TestDoor/FAMEWHO don't call it.

- [ ] **Step 1: Write failing tests**

```typescript
it("AR_SendStr derefs fdom_StringPtr and emits, Data1=1 adds CRLF", () => {
  const emu = new MemStub();
  const out: string[] = [];
  const proto = new FIMProtocol({
    emulator: emu as never,
    execLibrary: { putMsg: () => undefined },
    socket: { emit: (_ev, data) => { out.push(String(data)); return true; } },
    bbsSession: {}, nodeId: 1, onShutdown: () => undefined,
  });
  const msg = 0x8000, str = 0x4000;
  emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_SendStr);
  emu.writeMemory32(msg + FDOM.STRINGPTR, str);
  emu.writeMemory32(msg + FDOM.DATA1, 1);
  "HI".split("").forEach((c, i) => emu.writeMemory(str + i, c.charCodeAt(0)));
  emu.writeMemory(str + 2, 0);
  proto.handleMessage(msg);
  expect(out).toEqual(["HI\r\n"]);
  expect(emu.readMemory32(msg + FDOM.RETURNCODE)).toBe(FIM_RC.OK);
});

it("NR_SendStr emits fdom_IOString verbatim", () => {
  const emu = new MemStub();
  const out: string[] = [];
  const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
    socket: { emit: (_e, d) => { out.push(String(d)); return true; } }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
  const msg = 0x8000;
  emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_SendStr);
  "OK>".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
  proto.handleMessage(msg);
  expect(out).toEqual(["OK>"]);
});
```

- [ ] **Step 2: Run — FAIL.** 
- [ ] **Step 3: Implement the four arms.** NULL `fdom_StringPtr` on AR_SendStr → rc=FAIL, no emit, no crash.
- [ ] **Step 4: Run — PASS. tsc clean.**
- [ ] **Step 5: Commit** `git commit -m "feat(fim): output commands AR_SendStr/NR_SendStr/CRLF/ShowText"`

---

### Task 5: Input commands (NR_PromptChars, AR_GetKey, NR_HotKey, AR_HotKey)

**Files:**
- Modify: `web/backend/src/amiga-emulation/fim/fim-protocol.ts`
- Modify: `web/backend/src/amiga-emulation/AmigaDoorSession.ts` input routing (~`:174-217` / the `door:input` handler): when doorType is FIM, forward socket input to `fimProtocol.queueInput(data)`.
- Test: extend `web/backend/tests/amiga-emulation/fim-protocol.test.ts`

**Interfaces:** Produces `FIMProtocol.queueInput(data: string): void`. Consumes `emulator.pause()` / `emulator.resume()` (same calls `xim/io.ts:handleHotkey` uses — see `io.ts:777` deferred-reply pattern).

Semantics:
- `NR_PromptChars (14)`: `Data1` = max chars, `Data2` = mode (0 normal, 4 password-echo-`*`; modes 1/3 reply rc=DENIED for MVP — mode 2 is DENIED even on real FAME). IOString on entry = prompt text → emit it. Then defer: stash `pendingMsg`, `emulator.pause()`. On `queueInput(line)`: write line (stripped of trailing `\r\n`, capped 201) into IOSTRING, rc=OK, reply, `emulator.resume()`. Echo typed chars back to socket (`*` for mode 4).
- `AR_GetKey (800)` / `NR_HotKey (15)` / `AR_HotKey (861)`: single key. Defer identically; on input write first char code into `Data3` AND first byte of IOString (FAMEDoorCommands.h: key returns in Data3), rc=OK, resume. If input already queued (type-ahead buffer), answer synchronously without pausing.

- [ ] **Step 1: Write failing tests**

```typescript
it("NR_PromptChars defers reply until queueInput, echoes prompt first", () => {
  const emu = new MemStub();
  const out: string[] = []; const putMsgCalls: number[] = [];
  let paused = false, resumed = false;
  (emu as unknown as { pause(): void; resume(): void }).pause = () => { paused = true; };
  (emu as unknown as { pause(): void; resume(): void }).resume = () => { resumed = true; };
  const proto = new FIMProtocol({ emulator: emu as never,
    execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
    socket: { emit: (_e, d) => { out.push(String(d)); return true; } },
    bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
  const msg = 0x8000;
  emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_PromptChars);
  emu.writeMemory32(msg + FDOM.DATA1, 50);
  "Name>".split("").forEach((c, i) => emu.writeMemory(msg + FDOM.IOSTRING + i, c.charCodeAt(0)));
  proto.handleMessage(msg);
  expect(out[0]).toBe("Name>");
  expect(putMsgCalls.length).toBe(0);       // no reply yet
  expect(paused).toBe(true);
  proto.queueInput("spot\r");
  expect(putMsgCalls.length).toBe(1);
  expect(resumed).toBe(true);
  let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
  expect(s).toBe("spot");
  expect(emu.readMemory(msg + FDOM.IOSTRING + 4)).toBe(0);
});

it("AR_GetKey returns key code in Data3", () => {
  const emu = new MemStub();
  (emu as unknown as { pause(): void; resume(): void }).pause = () => undefined;
  (emu as unknown as { pause(): void; resume(): void }).resume = () => undefined;
  const putMsgCalls: number[] = [];
  const proto = new FIMProtocol({ emulator: emu as never,
    execLibrary: { putMsg: (_p, m) => { putMsgCalls.push(m); } },
    socket: { emit: () => true }, bbsSession: {}, nodeId: 1, onShutdown: () => undefined });
  const msg = 0x8000;
  emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.AR_GetKey);
  proto.handleMessage(msg);
  proto.queueInput("y");
  expect(putMsgCalls.length).toBe(1);
  expect(emu.readMemory32(msg + FDOM.DATA3)).toBe(121);
});
```

- [ ] **Step 2: Run — FAIL.** 
- [ ] **Step 3: Implement** deferred-reply state machine (`pendingMsg: number | null`, `pendingKind: "line" | "key"`, `inputBuffer: string`). Type-ahead: buffer input arriving with no pending message; consume on next input command.
- [ ] **Step 4: Run — PASS. tsc clean.**
- [ ] **Step 5: Wire `door:input` → `queueInput` in AmigaDoorSession for FIM doors.**
- [ ] **Step 6: Commit** `git commit -m "feat(fim): deferred input — PromptChars/GetKey/HotKey with pause-resume"`

---

### Task 6: Info retrieval commands

**Files:**
- Modify: `web/backend/src/amiga-emulation/fim/fim-protocol.ts`
- Test: extend `web/backend/tests/amiga-emulation/fim-protocol.test.ts`

Semantics — all reply rc=OK; string results into IOString, numeric into Data2 (ULONG into Data3), matching the "returned values arrive in Data2" convention:
- `NR_BBSName (16)` ← `bbsSession.bbsName`; `NR_SysOp (17)` ← `bbsSession.sysopName`; `NR_MainLine (23)` ← `bbsSession.doorParams || bbsSession.doorCommand || ""` (same source as `xim/bbs-info.ts:528-533`).
- `NR_Name (31)` ← `bbsSession.user.username`; `NR_Password (32)` → rc=DENIED, empty string (never leak); `NR_Location (33)` ← `user.location`; `NR_AccessLevel (37)` → Data2 = `user.secLevel`.
- `NR_TimeRemain (48)` → Data2 = `bbsSession.timeRemaining` (minutes; FAME uses seconds per DoorCommands — CHECK the header comment for NR_TimeRemain at implementation time with `python3 -c` extraction; encode whichever unit the header states, note it in a code comment).
- `NR_Uploads (51)`/`NR_Downloads (52)` → Data2 = `user.uploads` / `user.downloads` (0 when absent); `NR_BytesUpload (53)`/`NR_BytesDownload (54)` → Data3 = bytes.
- `SR_ConfName (600)` ← `bbsSession.conferenceName`; `SR_ConfNum (602)` → Data2 = `bbsSession.conferenceId`; `SR_NodeNumber (614)` → Data2 = `nodeId`; `SR_FAMEVersion (608)` → IOString `"FAME 6.0 (amiexpress-web compat)"`, Data2 = 60.

- [ ] **Step 1: Failing tests** — one `it` per group, e.g.:

```typescript
it("NR_Name returns username in IOString", () => {
  const emu = new MemStub();
  const proto = new FIMProtocol({ emulator: emu as never, execLibrary: { putMsg: () => undefined },
    socket: { emit: () => true },
    bbsSession: { user: { username: "SPOT", secLevel: 255 }, bbsName: "AmiExpress Web", timeRemaining: 59 },
    nodeId: 3, onShutdown: () => undefined });
  const msg = 0x8000;
  emu.writeMemory32(msg + FDOM.MN_REPLYPORT, 0x9000);
  emu.writeMemory32(msg + FDOM.COMMAND, FIM_CMD.NR_Name);
  proto.handleMessage(msg);
  let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(emu.readMemory(msg + FDOM.IOSTRING + i));
  expect(s).toBe("SPOT");
});
it("SR_NodeNumber returns nodeId in Data2", () => { /* same shape, expect readMemory32(msg+FDOM.DATA2) === 3 */ });
it("NR_Password is DENIED and blank", () => { /* rc === FIM_RC.DENIED, IOString[0] === 0 */ });
```

- [ ] **Step 2: FAIL → Step 3: implement all arms → Step 4: PASS + tsc clean.**
- [ ] **Step 5: Commit** `git commit -m "feat(fim): user/BBS/conference info commands"`

---

### Task 7: doorType FIM plumbing

**Files:**
- Modify: `web/backend/src/utils/amiga-command-parser.util.ts:17-31` (add `FIM = "FIM"`), `:453-471` (alias arm `FM|FI|FIM`)
- Modify: `web/backend/src/utils/node-logs.util.ts:14-23` (next free numeric code, comment `FIM (FAME BBS doors)`)
- Modify: `web/backend/src/handlers/door.handler.ts:1517-1521` (add `case "FIM":` falling to `executeAmigaDoor`), `:3872-3875` (add `'FIM'` to the Amiga-68K category array), `:2734-2739` (DoorLog ternary arm)
- Modify: `web/backend/src/amiga-emulation/DoorTypes.ts:7` (accept `"FIM"`)
- Modify: `web/backend/src/amiga-emulation/LibraryManager.ts:489` — keep `useXimProtocol` FALSE for FIM: change to exclude `"SIM" | "SUP" | "FIM"`.
- Test: `web/backend/tests/fim-doortype-routing.test.ts`

- [ ] **Step 1: Failing test** — parse + routing surface:

```typescript
import { parseDoorType } from "../src/utils/amiga-command-parser.util"; // use the actual exported name — check exports first; if parsing is enum-only, assert enum membership instead
describe("FIM doorType", () => {
  it("is a recognized Amiga door type", () => {
    // exact assertion shape depends on the module's exports — the test MUST
    // cover: 'FIM' string accepted, categorized as Amiga 68K, routed to
    // executeAmigaDoor switch (assert via the exported category list or a
    // small exported helper; add an export if none exists).
  });
});
```

(Implementer: inspect `amiga-command-parser.util.ts` exports first; write the three assertions against real exports, adding a tiny exported `isAmiga68kDoorType(t: string): boolean` helper in `door.handler.ts`'s util if the category array is inline-only.)

- [ ] **Step 2: FAIL → Step 3: implement all six file edits → Step 4: PASS + `npx tsc --noEmit` clean → Step 5: run the full pre-existing suite `SKIP_DB_INIT=1 npx jest --config ... tests/` (no regressions).**
- [ ] **Step 6: Commit** `git commit -m "feat(fim): FIM doorType routing end-to-end"`

---

### Task 8: Detection — installer + analyzer sniff FAMEDoorPort

**Files:**
- Modify: `web/backend/src/doors/door-installer.ts:206-227` (`detectDoorType`): after hunk-magic check, `strings`-scan the binary buffer: contains `FAMEDoorPort` → `"FIM"`; contains `AEDoorPort` → `"XIM"`; contains `DoorControl` → `"SIM"`; also `:164` — emit the detected type into the generated `.info` `TYPE=` line instead of hardcoded XIM.
- Modify: `dev/scripts/analyze-all-doors.sh:38-63` — add `elif strings "$f" | grep -q "FAMEDoorPort"; then echo FIM` branch before the UNKNOWN fallback (and a `dreamdoor.library` → `DD` branch while in there).
- Test: `web/backend/tests/door-installer-detect-fim.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { detectDoorType } from "../src/doors/door-installer"; // export it if currently private
describe("detectDoorType", () => {
  const hunk = Buffer.from([0x00, 0x00, 0x03, 0xf3]);
  it("classifies FAMEDoorPort binaries as FIM", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...FAMEDoorPort...", "latin1")]);
    expect(detectDoorType(bin)).toBe("FIM");
  });
  it("still classifies AEDoorPort as XIM", () => {
    const bin = Buffer.concat([hunk, Buffer.from("...AEDoorPort...", "latin1")]);
    expect(detectDoorType(bin)).toBe("XIM");
  });
});
```

- [ ] **Step 2: FAIL → Step 3: implement (export `detectDoorType(buf: Buffer): string`) → Step 4: PASS + tsc.**
- [ ] **Step 5: Commit** `git commit -m "feat(fim): FAMEDoorPort detection in installer + analyzer"`

---

### Task 9: End-to-end — TestDoor.FIM and FAMEWHO.FIM

**Files:**
- Create: `Doors/FAMETest/TestDoor.FIM` (copy from `/Users/spot/Code/amiexpress_doors/Sources/_C/FA_DE103/FAME/FAMEDoor/TestDoor.FIM` — use `cp`, NEVER Edit/Write, binary)
- Create: `Doors/FAMEWho/FAMEWHO.FIM` (from `Sources/_C/FAMEWH12/...`)
- Modify: `dev/scripts/door-corpus/corpus.json` (two entries, doorType FIM, scripted input `"something\r"` for TestDoor's GetString; edit via python `ensure_ascii=False` + trailing newline — NEVER Edit tool, high-bit bytes)

**Automated verification:**
- [ ] Run TestDoor: `cd web/backend && SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 npx tsx src/scripts/run-amiga-door.ts ../../Doors/FAMETest/TestDoor.FIM 1 --doortype FIM --timeout 30 --command FAMETEST > /tmp/fim-test.out 2> /tmp/fim-test.log` (redirect, never pipe). Expected in output: the door's banner, `Tell me something>:` prompt, echo of scripted input, `You've said: ...`, clean `EXIT 0` (door path: FIMStart → PutString/GetString → FIMEnd).
- [ ] Run FAMEWHO the same way; expected: a who-is-online table containing the session username, no TRAP/Guru in the log.
- [ ] Corpus: `npx tsx src/scripts/corpus-integration-runner.ts --only fametest_1,famewho_1 --capture` then a verify run passes both.
- [ ] Full backend suite + `npx tsc --noEmit` clean.

**Manual verification (sysop):**
- [ ] Install one FIM door via DOORMAN, launch from BBS menu over the web terminal, interact, exit cleanly back to menu.

- [ ] **Commit** `git commit -m "feat(fim): FAME reference doors runnable end-to-end + corpus entries"`

---

## Known risks / decisions

- **ReadArgs**: FIM doors parse `NODENR/N/A` via dos ReadArgs. XIM doors already receive the node number as argv[0] (`run-amiga-door.ts` doorArgs) and our DosLibrary implements ReadArgs — if TestDoor fails at arg parsing (exits before FIMStart), debug ReadArgs numeric-arg (`/N`) handling first (`xim:debug` + `logs/door-68k-*.log`).
- **FAMEAllocObject before port exists**: door allocates its msg then FindPort loops. Our port is created pre-start (Task 3), so FindPort succeeds on first try — matches FAME semantics (port owned by BBS node, not door).
- **RawDoFmt putch stub** (`"\x16\xc0\x4e\x75"` — move.b d0,(a3)+ ; rts): PutStringFormat runs this through ExecLibrary.RawDoFmt (`ExecLibrary.ts:6310`). If formatted output is garbled, that's where to look.
- **Data2-vs-IOString return convention** is per-command, not global — when a door misbehaves on a specific command, re-read that command's block in `FAMEDoorCommands.h` (latin-1, CRLF; extract with python, not grep).
- famedoor.library (AmigaE client) is OUT OF SCOPE for this plan — separate follow-up if E-built FAME doors (COR-* etc.) matter; detection: binary contains `famedoor.library` but no `FAME.library`.
- DayDream is a separate plan, blocked on disassembling the 2.4KB `DreamDoor.Library` (targets listed in the research doc).
