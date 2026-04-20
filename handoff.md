# Handoff — 2026-04-21

## Last task: WarOLM cross-node OLM delivery — FIXED

Root cause: our three `JH_SHUTDOWN` handlers halted the door immediately
on receipt (`executionState.isRunning = false`). On real Amiga,
`PutMsg(JH_SHUTDOWN) + WaitPort + GetMsg` is a round-trip and the door
**continues** executing afterward — WarOLM sends `JH_SHUTDOWN` at file
0xDCA then runs the cross-node delivery loop at 0xDEC. Halting killed
the delivery before it could run.

Fix (2 files, +31/-11): in `door-message-callbacks.ts` (both XIMProcessor
and doorMessageCallback paths) and `DoorLifecycleManager.ts`
(pollXIMMessages), we still observe `isShuttingDown` but no longer force
the lifecycle to stop. Doors exit naturally via RTS → sentinel PC →
`DoorExitDetector` (existing path).

Verified: Node 1 sysop ran Olm, typed `HELLO_FROM_NODE_1`, confirmed Y.
Backend log shows `[X-NodeRoute] AEServer.2 cmd=4 str="HELLO_FROM_NODE_1"`
and node 2's WS client rendered the full OLM. Regression sweep via
`dev/scripts/test-all-68k-doors.sh`: 6/6 non-interactive doors still
exit cleanly (QuickNew, MultiTop, WHO, ByteKiller, SlickTop,
NTR-LastCallers). The 2 timeouts (GetAnswer, RTW) are expected —
interactive doors paused waiting for user input.

Not committed yet — ready to stage when you're ready.

## Prior-session background (unchanged)

Full OLM playbook (disasm, runtime-PC calc, reproduction recipe):
`thoughts/shared/handoffs/2026-04-20_olm-delivery-followup.md`.

Key insight from this session: `runtime_pc == file_offset` when
file_offset == 0x30 (i.e. runtime = 0x2008 + file - 0x30). Prior
handoff's math was correct; the PC probe just kept missing the window
because `executeUntilTrap(BATCH_SIZE)` samples PC only at trap
boundaries — and with the halt active, the door never reached 0x2D94+
at any boundary.

## Still-open (carried forward, not touched)

- SysInfo sync `waitForReply` blocks JS event loop — needs async yields
  on `AEDoorLibrary.waitForReply`. Non-trivial (traps are fully sync).
- WarOLM editor cursor `[11A` offset. Cosmetic.
- Row 00 phantom in Olm table. LOWNODE=0 default.
- Input lag — `AEDOOR_BATCH_SIZE` exposed; needs `DOOR_PROFILE=1`.

## Working-tree state

Uncommitted on top of prior 7-commit stack:
- `web/backend/src/amiga-emulation/session/DoorLifecycleManager.ts`
- `web/backend/src/amiga-emulation/session/lifecycle/door-message-callbacks.ts`

Plus prior-session uncommitted drift (not touched): `AmigaDoorSession.ts`,
`ExecLibrary.ts`, `index.ts`. The `(global as any).io = io` in `index.ts`
is load-bearing for cross-node JH_SM routing — don't lose it.

## Server / cleanup state

No backend running. Lockfile clean. All MCP-launched backends and WS
clients were killed at session end.

If you need to start: `cd web/backend && BBS_DATA_DIR=/Users/spot/Code/amiexpress-web NODE_ENV=development DEBUG_68K=1 XIM_DEBUG_JSON=1 npx tsx src/index.ts > logs/backend.log 2>&1 &`
(via Bash with run_in_background:true, then `kill -TERM <pid>` when done;
`start-servers.sh` spawns a terminal that doesn't work headless).

Ports: Frontend 5174, Backend 3001, Telnet 2323, SSH 2222.
