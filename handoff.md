# Handoff

## Current State
Server running locally (--bbs-only --no-watch). All recent fixes pushed to main.

## This session (2026-04-26)
- **J (JoinCnf) release blocker fixed** — linesPerScreen=0 now maps to 9999 in JH_REGISTER reply so JoinCnf's equality-pagination never fires. Commit `975d8adb7`.
- **RTW (node list door)** — 8-row cap via JH_SM filter + JH_HK auto-reply + footer detection. Commits `b7bf08c6d`, `196cb7cbf`.
- **tlist (TLP2 BSS)** — writes user linesPerScreen into a4+0x3022 (confirmed from disasm) at JH_REGISTER time so TLP2's pagination threshold is set correctly. Commit `fb3cbb727`.
- **Mobile keyboard shift** — ⇧ key added to on-screen keyboard (single-shot, blue when active). Commit `3b8b75b70`.
- **Terminal focus on desktop** — !isMobile branch was calling textarea.blur() on desktop too, losing focus 800ms after load. Now only blurs on landscape mobile. In `TerminalPage.tsx`.

## Door status
- **J**: fixed ✓
- **RTW**: fixed ✓ (8-row cap + footer)
- **tlist**: fixed ✓ (TLP2 BSS patch)
- **CS (AquaScan)**: DT_CONFACCESS fix shipped by other agent. ANSI color bleed on "More?" prompt fixed (generic reset after newline-terminated JH_SM). Commit `af6a5efb5`. FindToolType A6 register preservation still under investigation.
- **CTOP (ctop / Conftop-II)**: fixed ✓ — three bugs fixed: (1) PATH B doorMessageCallback never called replyMsg, causing AEDoor WriteStr to time out; (2) XIMProtocol.sendReply didn't set state.replyHandled, causing double-reply; (3) AEDoor.library address range (0x1ff800–0x200000) missing from stuck-loop exclusion, causing session to be terminated mid-run. Commits `3d0a62749`, `b97b09560`.
- **conftop (v2.3)**: Date format issue in Conftop.Data header. Known hard problem, recommend TS clone.
- **tlist**: fixed ✓ (above)
- **ED (5D-Edit)**: confirmed working ✓ — banner, dir scan, file search, description edit, save all work. Dir listing is 1-indexed matching Conf1/Dir1 and Conf1/Dir2 on disk.
- **GA (GetAnswer)**: NOT broken.

## DEL (MgzListMan) — FIXED ✓

**Root cause** (fully traced 2026-04-27):  
MGZLISTMAN is a direct AEDoor.library door. After opening AEDoor.library and calling CreateComm, the door calls `HotKey()` (AEDoor LVO -0x7E) which sends JH_HK to the BBS and calls `dispatchCommand → waitForReply`. In sync mode (`DOOR_ASYNC_WAIT` unset), `waitForReply` spins 10,000 tight iterations holding the Node.js event loop — no Socket.IO events can arrive, so the JH_HK reply never lands, `waitForReply` returns false, `dispatchCommand` returns -1, `HotKey` returns -1 ("carrier lost"), and the door exits in ~17ms.

**Fix applied**: `DOOR_ASYNC_WAIT=1` added to `.env.local`. This switches `waitForReply` to `deasync.loopWhile`, pumping the libuv event loop between iterations so Socket.IO-delivered user input can arrive and the BBS can reply. 5-second wall-clock deadline matches the existing async path.

**Three-bug fix chain** (all now committed):
1. `LibraryManager.ts:651` — added `syncTrapAddressesToMoira()` right after `installExecVectors()`. Without this, exec trap addresses weren't in MOIRA's WASM trap set, so the WASM batch ran through AllocMem → ROM exception handler → door exited immediately.
2. `DoorLoader.ts:577-586` — removed synthetic BSS zeroing loop (128KB after code segment). This loop was clearing the task struct at 0x5E00 (which falls inside code_end..code_end+128KB), wiping pr_CLI back to 0 after DoorLoader had set it to cliBptr. SAS/C startup checked pr_CLI, saw 0, took Workbench mode, received pre-queued INIT, and exited.
3. `.env` — `DOOR_ASYNC_WAIT=1` added for HotKey/JH_HK async event-loop pumping.

**Current behavior**: DEL runs, calls CreateComm (AEDoorPort1 found), queries BB_MAINLINE + BB_CONFLOCAL, then exits cleanly because Conference 1 has no magazine/download files. The door correctly responds "nothing to manage" — this is correct AmiExpress behavior. To actually see the menu, files must exist in the conference's download area.

**Key files changed**:
- `web/backend/src/amiga-emulation/LibraryManager.ts:651` — sync exec traps
- `web/backend/src/amiga-emulation/DoorLoader.ts:577-586` — remove BSS zero
- `.env` — DOOR_ASYNC_WAIT=1

## Open priorities
1. xim/io.ts over 2000 lines — needs modular split
2. RTW TypeScript clone (future, see memory backlog)

## Gotchas
- **TLP2 BSS patch** (system-commands.ts): writes lineLen to a4+0x3022 for ALL doors at JH_REGISTER time. This is safe because only TLP2-style doors use that BSS slot — others ignore it. But if a future door has something else at a4+0x3022, verify first.
- **RTW JH_SM filter** (xim/io.ts): rtwPassthrough flag uses door name "RTW" from bbsSession.doorCommand. If doorCommand isn't set, filter doesn't activate. Check bbsSession.doorCommand assignment in door.handler.ts:2291.
- **ctop.data** must exist in each conference for Conftop-II to work. Currently only Conf1/, Conf2/, Conf12/ have it.
