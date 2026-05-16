---
date: 2026-05-16
topic: door-bug-batch
tags: [doors, bugfix, 5d-logoff, aquapwfail, grapebooth, eall, mastermind, xim, aedoor]
status: final
---

# Session handoff — 2026-05-16 — Door bug batch (4/5 fixed)

## Tasks worked on

User-reported door bugs from prior session:

1. **5D-LoGOFF**: pressing Y reloads page instead of logging off — **FIXED**
2. **AquaPWFail**: shows ">Error reading CallersLog!<" for every entry — **FIXED**
3. **Vote (GrapeBooth)**: "Error trying to save users cfg!!" — **FIXED**
4. **MASTERMIND (LUCKY)**: exits with code 65535, zero XIM ops — **PARKED** (diagnosis below)
5. **EALL**: door's "disabled user" check rejects sysop — **FIXED**

## Final state

- 4 fixes in working tree on `main`, **uncommitted**.
- TypeScript clean (`npx tsc --noEmit` passes from `web/backend/`).
- BBS restarts cleanly; HTTP 200 on `localhost:3001`, telnet on `64128`.
- MASTERMIND still fails (golden corpus already records `exit 65535` so not a regression).

## Fixes — exact diffs

### 1. 5D-LogOff Y-reload — `web/backend/src/handlers/door.handler.ts`

Root cause: door's RETURNCOMMAND="G" matched the command (`G`) bound to the
door itself in `Commands/BBSCmd/G.info` → BBS re-launched the same door
infinitely. Visually = "page reload mid-session".

Fix: when door exits with `RETURNCOMMAND == invoking command`, skip BBSCmd
lookup; route SysCmd → built-in only. This lets the built-in logoff handler
in `system-commands.handler.ts` run instead of the door re-launching.

Both `launchAmigaDoor` (~line 825-870) and `executeAmigaDoor` (~line 2642-2690)
got the same `runCommand(cmd, isReturn)` wrapper:

```ts
if (isReturn && command === invokingCommand && invokingCommand.length > 0) {
  const sysResult = await runSysCommand(socket, session, command, params);
  if (sysResult === 'SUCCESS' || sysResult === 'NOT_ALLOWED') return;
  await processBBSCommand(socket, session, command, params);
  return;
}
```

### 2. AquaPWFail CallersLog — `web/backend/src/amiga-emulation/api/PathManager.ts`

Root cause: door opens bare-relative `Node1/CallersLog`. express.e:3324
shows `SystemTagList` for door spawn has NO `NP_CURRENTDIR` tag, so doors
inherit CWD = BBS root. Our emulator sets CWD = `progdir:` (door's own
dir), so the relative open misses.

Fix: in `amiToSysPath()`, after a relative-to-CWD resolve fails, fall back
to `baseDir` (BBS root) before giving up. Surgical, preserves CWD=PROGDIR
for doors that rely on it, only kicks in when the file isn't there.

Note: doesn't retroactively clean `Doors/AquaPWFail/AquaPWFail.LastData`,
which has historical bad entries baked in. New failures will log correctly.

### 3. GrapeBooth (Vote) — `Doors/Shoxx-Doors/GrapeBooth/`

Root cause: door's PROGDIR was missing required setup files.

Fix: copied from `/private/tmp/bp-full/extracted/SHX-GB10/`:
- `Config.Txt` (ADD_CHOICE=YES, ANSWER_RESULT=YES, SYSOP_ACCESS=255, LISTNEW_ENTER=YES)
- `MainMenu.Txt`
- empty `Users/` and `Votes/` dirs

Per `GrapeBooth.Doc` these are mandatory; "Error trying to save users cfg"
fired because the door called `Open(Users/<uid>, MODE_NEWFILE)` into a
nonexistent dir.

### 5. EALL disabled-user — `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`

Root cause: lines 1097-1117 returned `secLevel` (access level, e.g. 255 for
sysop) for both DT_SECBOARD (106), DT_SECLIBRARY (107), and DT_SECBULLETIN.
Per express.e:3539-3559 these fields are:

- DT_SECBOARD = secBoard = ratioType (0=bytes,1=bytes+files,2=files)
- DT_SECLIBRARY = secLibrary = ratio value (0=unlimited, 1=1:1, 3=3:1, …)
- DT_SECBULLETIN = secBulletin = computer type

EALL reads DT_SECLIBRARY expecting a ratio, got 255 → interpreted as a
bogus disabled state, refused sysop. DT_SECSTATUS (105) was already
returning secLevel which is correct.

Fix returns the actual fields (with `?? user.ratio ?? 0` etc. fallback).

## MASTERMIND (LUCKY) — diagnosis only, not fixed

**What it does:** 14852-byte hunk binary. Two segments:
- CODE 548 bytes at PC base — decryptor stub
- DATA 26136 bytes — encrypted real game code

**What we observe:**
- Entry at 0x2008, registers A0=0xf0100 (args ptr), A6=0x80000 (ExecBase).
- After ~13s of CPU activity with ZERO XIM/AEDoor calls, DoorLifecycleManager
  reports: `FIRST INVALID PC DETECTED! Previous PC: 0x21d2 (lsr.l D4, D5)
  New PC: 0x1804b4 (OUT OF BOUNDS)`. Door is killed → exit 65535.
- The screenshot user saw with scattered letters ("DI", "R", "G(", etc., or
  "ORIGINAL SIN IS GOOD") was the **FRONTEND login scroller**, NOT
  MasterMind. MasterMind never reaches its rendering code.

**What we ruled out:**
- Decryptor needs 68020 bit-field ops? — No, moira is configured for
  M68020 (`moira-wrapper.cpp:449 setModel(Model::M68020)`).
- Wrong CLI command-name BSTR at 0xf0080? — Tried writing "LUCKY" as BSTR
  there. No change. **Reverted** — the misleading "Expected 'who'" debug
  comment in DoorLoader.ts:544 was the only thing suggesting the door
  reads from that address.
- AEDoor LVO returning bad value? — Door makes ZERO library calls before
  the bad PC, so this is impossible.

**Where the actual fault lives:**
Somewhere between PC 0x2008 (entry) and 0x21d2 (last good PC before trap),
the decryptor builds an indirect jump target (RTS / JMP (An) / JSR (d8,An,Xn))
from a register or memory value that's wrong on our emulator. The
DoorLifecycleManager only logs the LAST good PC, not the instruction that
issued the bad jump, so we don't know which instruction is responsible.

**Disassembly:** ran `Scripts/disasm68k.ts` on it. Many bytes show as `DC.W`
because the local script is incomplete; binary appears to mix valid 68000
sequences with bit-field-ish encodings. Useful but not enough to pin the
fault.

**Next steps to actually fix:**
1. Add per-instruction tracing in moira-wrapper for THIS door only (gated
   on door name or PC range), dump every PC + opcode + relevant register
   values from 0x2008 to the trap point. Walk forward to find the offending
   indirect jump.
2. Once the offending instruction is found, identify what register/memory
   value it uses, then dump that value during execution and compare to what
   real Amiga would have there.
3. Likely culprits: hunk reloc base addresses, seglist BPTR chain,
   ExecBase->ThisTask layout, or initial register values at door entry that
   differ subtly from `LoadSeg`+`CreateProc` on real Amiga.

This is a 2-4 hour session of work, not a quick fix. Corpus golden already
records `exit 65535` so it's a documented limitation, not a regression.

## Reverts done before this handoff

- `DoorLoader.ts` BSTR write at 0xf0080 — reverted to original debug-read.
- `AEDoorLibrary.ts` `[AED-TRACE]` console.logs in sendCmd/sendStrCmd/
  sendDataCmd/sendStrDataCmd/getData — reverted. (Other existing
  `[AEDoorLibrary]` debug logs left untouched; they predate this session.)
- `LibraryTraps.ts` generic AEDoor trace block — reverted (had caused
  startup crash loop earlier in the session).

## Memory entries added

(none this session — relevant feedback already captured in prior memories
about CPU stress, false-positive mining, etc.)

## Next session — punch list

1. Verify all 4 fixes via telnet/web:
   - `G` then `Y` should log off cleanly (no door re-launch).
   - `PWFAIL` should log a real connect string on next password failure.
   - `VOTE` should let sysop create/answer a vote without "Error trying to
     save users cfg".
   - `EALL` should grant access to sysop (no "disabled users" message).
2. Commit the 4 fixes. Suggested commit grouping:
   - `fix(door): RETURNCOMMAND self-recursion guard` (door.handler.ts)
   - `fix(emulator): bare-relative path fallback to BBS root` (PathManager.ts)
   - `fix(emulator): DT_SECBOARD/SECLIBRARY/SECBULLETIN return correct fields` (DoorMessageHandler.ts)
   - `chore(doors): install GrapeBooth Config.Txt and dirs`
3. (Optional) Tackle MASTERMIND — see "Next steps to actually fix" above.

## Artifacts

- Working tree changes only on `main`. Run `git status` for the file list;
  `git diff` for full content.
- Corpus untouched at 324 entries — no mining work this session (previous
  rounds' false-positive issue still applies; mining needs better filter
  before resuming).

## Other notes

User dropped task #5 with a "yawn" — they're aware MASTERMIND is a deep
investigation and not blocking them. The four fixes are the meaningful
output of this session.
