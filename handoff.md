# Handoff - 2026-02-05

## Current Session: SAmiLog Batch Scheduler Fix

### Problem Identified

SAmiLog is a **standalone CLI utility** (NOT a door) run from batch files at logoff time.

**How it works in real AmiExpress:**
```
batch1:
bbs:utils/samilog/samilog -UC"1" -O"BBS:Bulletins/bull6.txt"15
```

The batch scheduler had correct TypeScript SAmiLog implementation but couldn't FIND batch files because:
- Batch files live at app root (`/app/batch1`)
- Scheduler only searched `dataDir` (`/app/data/bbs/`) and `bbsRoot/NodeN/`

### Fixes Applied

1. **batch-scheduler.ts**: Added `appRoot` (process.cwd()) to candidate search paths for `runLoginBatches()` and `runLogoffBatches()`

2. **socket-handlers.ts**: Removed redundant `runSamiLogUpdate()` call - SAmiLog is properly handled by batch scheduler via `typescript:samilog` commands in batch files

3. **Deleted SamiLogRunner.ts**: Removed obsolete hack that tried to run SAmiLog as a 68K door

### SAmiLog Command Support (Complete)

The batch scheduler supports ALL SAmiLog commands from SAmiLog.Guide:
- `-C` - Clear store
- `-S"days"` - Strip mini log
- `-D"file"` - Create docs
- `-U[SC]"node"` - Update from CallersLog
- `-W[N]"file"` - Weekly stats
- `-R[N]"file"` - Record stats
- `-O[NLFSTR]"file"count` - Output bulletin

### Deployment Status

- All changes committed and pushed
- Deploy hook may need manual trigger on Render dashboard
- `FORCE_REINIT_SCREENS=0` set (screens not reinitialized on deploy)

### Post-Deploy Verification

Test on bbs.uprough.net:
1. Login and logoff
2. Check that `bull6.txt` updates with last callers
3. Check backend logs for `[BatchScheduler] Found batch file:` messages
4. Verify 68K doors still work (WHO, etc.)
