---
date: 2026-04-27
topic: zOOsTAT NOT deleted regression
tags: [zoostat, dos-library, system-tag-list, ram-device]
status: draft
---

# zOOsTAT "NOT deleted" Regression

## Task
Fix "Please tell the sysop that RAM:T/ZOOSTAT.TMP was NOT deleted." error shown after the S (stats) door runs.

## Current State
The error persists. A previous agent committed `f8c3eb159` claiming to fix it, but the fix is not working.

## What Is Known

### Fix commit in HEAD (f8c3eb159)
`web/backend/src/amiga-emulation/api/DosLibrary.ts` — `SystemTagList()` at LVO -606.
- Handles `"delete RAM:T/ZOOSTAT.TMP"` from D1
- Uses `pathManager.amiToSysPath()` → `/tmp/ram/T/ZOOSTAT.TMP`
- Calls `amigafs.unlinkSync()`, returns D0=0 on success

### The file IS being created
`/tmp/ram/T/ZOOSTAT.TMP` EXISTS on disk after each S run (1601 bytes). So the door creates it successfully.

### XIM log sequence (door-68k-S-*.log)
```
JH_SF (Show File) str="RAM:T/ZOOSTAT.TMP"   ← display the file
JH_SM "...was NOT deleted."                  ← error immediately after
JH_SHUTDOWN
```
Only 19ms between JH_SF and the error — no timeout.

### Critical gap: no emulation console.log in any log
Neither `backend.log` nor door-specific logs contain ANY `[dos.library]`, `[PathManager]`, or `[icon.library]` output. This means:
- **Emulation-layer `console.log` calls are going somewhere unknown** (not captured in any current log)
- Cannot determine from logs whether `SystemTagList` is being called at all

### Door binary facts
- Binary: `Doors/zOOtILITY/zOOsTAT_small`
- Uses format string `"delete %s"` → constructs `"delete RAM:T/ZOOSTAT.TMP"`
- Uses `SystemTagList` (LVO -606) on exec version ≥ 36 (our exec reports version 40)
- "NOT deleted" string is in the binary confirming this code path

### Path resolution chain
- `RAM:T/ZOOSTAT.TMP` → PathManager: `ram:` assign → `/tmp/ram/` + `T/ZOOSTAT.TMP` = `/tmp/ram/T/ZOOSTAT.TMP`
- Confirmed: the same path where the file actually exists

## Hypotheses (ordered by likelihood)

1. **SystemTagList IS called but fails path resolution at runtime** — `pathManager` might not be initialized correctly for this door session, so `amiToSysPath` returns null and falls through to `pathResolver.resolve()` which resolves to a wrong path. The file isn't found → RC=10 returned → "NOT deleted".

2. **SystemTagList is NOT being called** — LVO -606 might not reach `DosLibrary.handleCall` at all. The dispatch might fail to route it (e.g., A6 at time of call doesn't match 0xffff0000, or the offset math is wrong).

3. **JH_SF failure triggers "NOT deleted" regardless of SystemTagList** — zOOsTAT checks JH_SF's return value (not just SystemTagList). If JH_SF returns data=0, the door unconditionally shows "NOT deleted". But JH_SF should succeed since the file exists...

## Next Steps

1. **Add a log flush / dedicated door log for dos.library calls.** The missing console.log output is the biggest blocker. Before any fix, figure out where `[dos.library] SystemTagList(...)` would appear. Try adding a line to `/tmp/bbs-debug.log` (the file used by some other door handlers) directly in `SystemTagList()` instead of `console.log`.

2. **Verify dispatch reaches SystemTagList.** Add a line like `fs.appendFileSync('/tmp/bbs-debug.log', '[SYS] SystemTagList called\n')` at the very top of `SystemTagList()` and re-run.

3. **If not called:** check if LVO -606 dispatch is correct. Look at what `libraryBase` is when the door calls `JSR -606(A6)`. If A6 ≠ `0xffff0000` (DosBase), the call gets routed to the wrong library.

4. **If called but fails:** log the actual `sysPath` value. If it's null/wrong, the `pathManager` isn't initialized for this session. Check that `DosLibrary.pathManager` is set in the door session setup.

## Files to look at
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` — `SystemTagList()` at line ~3760
- `web/backend/src/amiga-emulation/api/AmigaDosEnvironment.ts` — library dispatch (A6 routing)
- `web/backend/src/utils/bbs-paths.util.ts` — `BBSPaths.resolveAmigaPath` RAM: handling

## Do NOT break
- AquaScan/DEL ULPATH fix (`IconLibrary.ts`) — already committed
- Startup revert (`8143dd355`) — already committed, doors work
