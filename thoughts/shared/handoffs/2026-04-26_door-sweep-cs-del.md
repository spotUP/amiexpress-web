---
date: 2026-04-26
topic: door-sweep-cs-del
tags: [doors, aquascan, mgzlistman, icon-library, aedoor]
status: final
---

# Handoff: CS fix + DEL investigation

## Task

Door sweep from backlog: fix CS (AquaScan) and investigate DEL (MgzListMan).

## Recent changes this session

### CS (AquaScan) — FIXED

Two-part fix, both committed:

**Commit 71d97905b** — `fix(xim): DT_CONFACCESS returns access area name for AquaScan`
- `web/backend/src/amiga-emulation/xim/data-query.ts` — DT_CONFACCESS (cmd 146) READ handler
  now returns `user.areaName` ("Sysop") or secLevel-derived name instead of raw X-flags.
- AquaScan builds `BBS:ACCESS/AREA.<name>.info` from this value; returning "Sysop" makes
  it open `ACCESS/AREA.Sysop.info` which exists and lists conferences to scan.
- Regression test: `web/backend/tests/amiga-emulation/dt-confaccess-areaname.test.ts`

**Commit f70d00a03** — `fix(icon): parse Amiga .info tooltype length-prefixed entries correctly`
- `web/backend/src/amiga-emulation/api/IconLibrary.ts` — `parseInfoFile()` had three bugs:
  1. Detection treated null byte (included in Amiga length) as invalid → detected nothing
  2. Word-alignment step (`if (offset % 2) offset++`) misaligned the main parser
  3. Fallback regex `^[A-Z0-9_]+$` rejected "CONF.1" (dot) and accepted "63" (digits)
- Fix: null-aware detection loop, removed alignment step, regex `^[A-Z][A-Z0-9_.]*$`
- CS now fully scans conferences and shows output.

### DEL (MgzListMan) — NOT FIXED, investigation only

Binary is present (11728 bytes, 1 hunk, loads at 0x2008). Not missing as originally noted in backlog.

MGZLISTMAN is a **direct AEDoor.library door** (not XIM protocol). Execution trace:
1. AllocMem(17424, MEMF_PUBLIC) → 0x122d2c ✓
2. SAS/C startup: Forbid, Permit, FindTask ✓
3. WaitPort on Door Task Port → receives INIT message from BBS session (Command=0, "INIT")
4. Opens intuition.library v37, graphics.library v33, dos.library v33 ✓
5. Calls Forbid + ReplyMsg (replies to INIT) → door exits

Never reaches OpenLibrary("icon.library") or OpenLibrary("AEDoor.library").

**Root cause hypothesis**: After INIT reply, the door expects a follow-up AEDoor protocol
message (possibly STAT or a node-info packet) that our session doesn't send. The door hits
an error path and exits cleanly (no crash, no XIM traffic).

## What to do next session (DEL)

1. Disassemble MGZLISTMAN from ~offset 0x90 (after SAS/C startup) to find:
   - What it calls after ReplyMsg(INIT)
   - Which AEDoor.library LVO it opens (look for OpenLibrary with "AEDoor.library" string)
   - What it does if that succeeds

2. Check what our session sends after receiving the INIT reply:
   - `AmigaDoorSession.ts` — look for what happens after WaitPort/GetMsg sees Command=0/"INIT"
   - What message (if any) the BBS sends after INIT ack

3. Compare with a real AmiExpress AEDoor init sequence to understand the protocol.

## Open backlog (unchanged except CS fixed)

- DEL: see above
- GA (GetAnswer): confirmed not broken — waits for user input
- ED (5D-Edit): confirmed working
- CTOP: needs Conftop v2.3 disassembly — out of scope

## Key file refs

- `web/backend/src/amiga-emulation/api/IconLibrary.ts` — parseInfoFile()
- `web/backend/src/amiga-emulation/xim/data-query.ts:646` — DT_CONFACCESS handler
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` — INIT/STAT message handling
- `Doors/-mgs!-MgzListMan/MGZLISTMAN` — the binary

## User's last prompts

- "i ran del now" (x2 — ran DEL twice, same result)
- "write a handoff and we'll fix del in a fresh session"
