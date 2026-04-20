# Handoff — 2026-04-20 (late)

## Current task: WarOLM cross-node OLM delivery

Message says "sent" but silently drops. Next step: identify which
of three bailout branches in WarOLM fires after user confirms Y.

**Full playbook**: `thoughts/shared/handoffs/2026-04-20_olm-delivery-followup.md`
(disasm excerpts, runtime-PC calculation, step-by-step instrumentation,
MCP reproduction recipe with exact curl commands).

## State on cold-restart

Seven commits on `main` (pushed nowhere — local only):

```
6a0a58ab9 docs(68k): update handoff with OLM delivery diagnosis
9e3966c08 fix(68k): always reply DT_SLOTNUMBER for cross-node queries
12f1e9f1b fix(68k): gate hybrid input injection on AEDoor waitForReply
73c2dcfc9 fix(68k): AEDoor WriteStr restores native msg.data semantics
52770b4d8 fix(68k): pre-create RAM:T so doors can write to it
87749febe fix(68k): XIM CLI args = node only, not runtime parameters
d7d1cc1e9 fix(68k): honor AmigaDOS MODE_OLDFILE fail-if-missing semantics
```

Typecheck-clean. User confirmed dRE!WAll draws correctly for the
first time (WriteStr newline fix).

## What's known about the OLM bug

**Prior handoff's LISTS/<slot> write theory was wrong.** Disasm of
`0x11DE` proved actual delivery is `PutMsg(JH_SM)` to
`AEServer.<targetNode>`, one per line. LISTS/<slot> is just a
presence probe.

**Cross-node `JH_SM` handler already exists and is correct** —
`web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts:236-274`
emits to target socket via `io.to(...)`. It's simply never triggered.

**Door bails out at one of three `beq.w 0xf8e` branches** (file PCs):

| PC    | Test                          | Failure            |
|-------|-------------------------------|--------------------|
| 0xDD0 | `tst.l d7`                    | line count == 0    |
| 0xDD8 | `tst.w 0x11a(a7)`             | Y/n answer == 0    |
| 0xDE8 | `tst.w d0` after `bsr 0x122c` | wait-for-idle said bail |

Between the success banner and JH_SHUTDOWN, the trap log shows no
`STATS@N` Open and no `Delay()` call → bailout happens at check 1 or
check 2, NOT wait-for-idle. D7==0 is the prime suspect (line editor
not committing typed line the way WarOLM counts).

## First move on restart

1. Read `thoughts/shared/handoffs/2026-04-20_olm-delivery-followup.md`
   completely. It has the disasm, the reproduction recipe, the
   runtime-PC calculation, and what I tried that failed.
2. Reproduce the bug via the MCP recipe (script + curl commands in
   that doc). Expected: `grep 'X-NodeRoute.*AEServer.2 cmd=4' logs/backend.log`
   → no output (delivery loop never runs).
3. Instrument PCs `0xDCE-0xDE8` (runtime ≈ `0x2DA6-0x2DC0` if the
   load-offset math is right; **I couldn't confirm that this
   session** — the PC probe didn't fire). First step is to validate
   the mapping with a wide probe over `0x2000-0x4600` and watch for
   any hit.

## Still-open (carried forward, not touched this session)

- SysInfo sync waitForReply blocks JS event loop — needs async yields
  on `AEDoorLibrary.waitForReply`. Non-trivial (traps are fully sync).
- WarOLM editor cursor `[11A` offset. Cosmetic.
- Row 00 phantom in Olm table. LOWNODE=0 default.
- Input lag — `AEDOOR_BATCH_SIZE` exposed; needs `DOOR_PROFILE=1`.

## Working-tree state

Uncommitted (from PRIOR session, not mine this session): `AmigaDoorSession.ts`,
`ExecLibrary.ts`, `DoorLifecycleManager.ts`, `index.ts`. These carry
debugRegistry wiring, `[CopyMem-100]` console.log, `dosLib.isDelayed()`
10ms yield, `(global as any).io = io`. The last one is load-bearing
for the cross-node JH_SM routing — don't lose it.

## Server / cleanup state

No backend running. Lockfile clean. All MCP-launched backends and
dual-node WS clients were killed at session end.

If you need to start: `cd web/backend && BBS_DATA_DIR=/Users/spot/Code/amiexpress-web NODE_ENV=development DEBUG_68K=1 XIM_DEBUG_JSON=1 npx tsx src/index.ts > logs/backend.log 2>&1 &`
(run_in_background:true via the Bash tool, then kill with
`kill -TERM <pid>` when done). The `start-servers.sh` script opens
a terminal window which doesn't work in headless/MCP context.

Ports: Frontend 5174, Backend 3001, Telnet 2323, SSH 2222.
