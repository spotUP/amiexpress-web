# Handoff - 2026-01-30

## Current Session: Door Testing Complete

### All 68K Doors Tested
- **Working: 45** doors fully functional
- **Partial: 10** doors run but have config/data issues
- **Broken: 3** doors (path/binary issues)
- **Complex/Deferred: 1** (MRC - network timeout by design)
- **Needs Testing: 1** (WHAT - needs multi-node transfer)
- **Untested: 0**

### Doors Removed from BBS
CDEMO, AMIGAGCC, SDKTEST, AMIGA68K, XIMVBCC, MINIMAL (test/demo doors)

### Partial Doors Summary
- ctop, DEL, Kick - exit silently or show goodbye only
- Olm, mrcstat2 - scrambled node data
- DUPESTART1 - date range config error
- bk - needs ACP.Icon config
- ulist, fake, I (SysInfo) - need specific files/data

### Broken Doors
- wall - data corruption
- AEDOOR, AEHELP - path resolution issues

### Memory
- `server-restart-rules.md` - Claude should NEVER restart servers
