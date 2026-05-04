---
date: 2026-05-04
topic: native-arexx-bringup
tags: [arexx, moira, 68k, handoff, in-progress]
status: in-progress
---

# Native AREXX via real RexxMast — bring-up (#78 Phases 1-5-final)

10 commits this session establishing the infrastructure to run real
Amiga AREXX scripts via RexxMast under MOIRA, with the existing
TypeScript interpreter as a fallback. Live-tested with the sysop's
own `RexxMast` + `rexxsyslib.library` binaries dropped at the
expected paths.

Result: every layer below the actual RexxMast bring-up is in place
and unit-tested. RexxMast itself loads + executes 1M instructions
under MOIRA without faulting, but doesn't reach
`AddPort('REXX')` because it needs a fuller Amiga environment
(dos.library traps, Process struct, CLI argv) that
AmigaDoorSession sets up for doors but RexxMastService doesn't yet
replicate. Phase 6 picks that up.

## What shipped (commits)

```
85a4d4235 feat(arexx): #78 Phase 5-final — executeRexxScript + boot wiring
b551c9ecc feat(arexx): #78 Phase 4 — host-port inbound message servicer
4201128eb feat(arexx): #78 Phase 4 — allocate + register the BBS host MsgPort
241873e56 feat(arexx): #78 Phase 4-skeleton — host-port command parser + dispatch
010b05c39 feat(arexx): #78 Phase 3b-real — RexxMastService boots emulator + loads binaries
2a1ffbd06 feat(arexx): #78 Phase 3b-skeleton — RexxMastService lifecycle shape
c5642a583 feat(arexx): #78 Phase 3a — hunk-parse the binaries on detection
8f047b801 feat(arexx): #78 Phase 2 — rexxsyslib.library LVO traps (10 functions)
b5a0c5109 feat(arexx): #78 Phase 1 — engine factory + detection no-op shim
8359141b2 chore(gitignore): cover RexxMast.info, Rexxc/, and .uaem sidecars
5135ebf15 chore(gitignore): exclude System/RexxMast (Commodore copyright)
```

84 tests across 6 suites:
- arexx-engine-selector (7) — detection + selector routing
- rexxsyslib-library (16) — argstring + RexxMsg API + IsRexxMsg
- rexxmast-service (7) — lifecycle + runUntilReady wiring
- rexx-host-dispatch (15) — command parser + handler registry
- rexx-host-servicer (7) — inbound message drain + reply
- (plus the original AREXX interpreter test)

## Architecture

**Singleton model** — one RexxMast process per BBS, queues scripts
via REXX port. Real-Amiga AmiExpress shipped one regardless of
node count; concurrent scripts are RexxMast's job (one interpreter
task per inbound RexxMsg). Trade vs per-node was 1× RAM/cold-start
+ real-Amiga-faithful vs N× isolation; crash blast-radius was the
only honest per-node argument.

**Engine selector** — `bbsConfig.info AREXX_ENGINE` tooltype:
- `ts` — force TS (sysop debug override)
- `native` — force native; missing binary → fall back to TS + loud log
- `auto` (default) — native if available, else TS

**Detection ladder** (each step short-circuits on failure):
1. `System/RexxMast` exists + non-empty
2. `Libs/rexxsyslib.library` exists + non-empty
3. Both parse cleanly via HunkLoader
4. (Phase 6) RexxMast actually reaches `AddPort('REXX')`

## What works (live-tested)

```
[AREXX] engine=ts (auto: binaries parsed successfully, awaiting Phase 5 wire-up)
[LibraryLoader] Loading rexxsyslib.library (version >= 0)
[LibraryLoader] Found library: /Users/spot/Code/amiexpress-web/Libs/rexxsyslib.library
[LibraryLoader] Read 33392 bytes from /Users/spot/Code/amiexpress-web/Libs/rexxsyslib.library
✅ [LibraryLoader] Successfully loaded rexxsyslib.library at 0x200000
[LibraryTraps] Installing rexxsyslib.library vectors at base 0x200000
[LibraryTraps] Installed 10 rexxsyslib.library vectors
[HunkLoader] Applying 0 relocations to 0 segments
[AREXX] RexxMast service started, running until ready...
[AREXX] RexxMast not ready: RexxMast did not call AddPort('REXX') within 1000000 cycles
```

## What's left for Phase 6

To make `[AREXX] RexxMast READY — native dispatch active` actually
fire, RexxMast needs the same environment AmigaDoorSession sets up
for door binaries. Likely TODO list (in dependency order):

1. **Install dos.library LVO traps** in RexxMastService (mirror
   `LibraryTraps.installAEDoorVectors` pattern). RexxMast uses
   dos.library for argument reading, file I/O, and DOS process
   discovery. Without this every dos call returns 0 and RexxMast
   either bails silently or loops in retry.

2. **Synthesise a Process struct** at a known address. Required
   fields per `<dos/dosextens.h>`:
   - `pr_MsgPort` — already allocated (we have hostPortAddr)
   - `pr_Task.tc_Node.ln_Type = NT_PROCESS` (13)
   - `pr_CLI = 0` (CLI=NULL → called from Workbench style — RexxMast
     handles this path)
   - `pr_CurrentDir = 0` (root)
   - `pr_TaskNum = 1`

3. **Set up Exec Task structure** — RexxMast calls `FindTask(0)`
   in setup. Currently this returns 0 because we never registered
   our pseudo-task. Either install a stub task or hook FindTask.

4. **CLI argv** — RexxMast may parse argv to find its config file.
   Even an empty argv (just the program name) should suffice.

5. **Re-run** `runUntilReady` after the above. Bump cycle budget
   to ~10M for the first end-to-end attempt.

## Files

```
src/services/arexx/
  engine-selector.ts         — bbsConfig AREXX_ENGINE → ts/native
  native-engine.ts           — detectNativeAREXX (file presence + hunk parse)
  rexx-host-dispatch.ts      — host-command parser + registry
  rexx-host-servicer.ts      — drain mp_MsgList + dispatch + reply
  rexxmast-service.ts        — singleton: start/stop/runUntilReady/executeRexxScript

src/amiga-emulation/api/
  RexxSysLibLibrary.ts       — 10 LVO impls (argstring + RexxMsg)
  library-vectors/
    rexxsyslib-vectors.ts    — LVO offset → handler dispatch
  LibraryTraps.ts            — gained setRexxSysLibLibrary +
                               installRexxSysLibVectors
```

## How to run

```
# Sysop drops binaries (one-time)
cp /path/to/RexxMast       System/RexxMast
cp /path/to/rexxsyslib.library Libs/rexxsyslib.library
cp -r /path/to/Rexxc       System/Rexxc

# Force engine for debugging
echo 'AREXX_ENGINE=native' >> bbsConfig.info.txt

# Boot
./dev/scripts/start-servers.sh --bbs-only

# Watch
tail -f logs/backend.log | grep AREXX
```
