# Handoff - 2026-02-06

## Current Issue: RAM Optimization for Render.com

Implemented RAM optimization to stay within Render.com's 512MB limit.

### Changes Applied This Session

| File | Change |
|------|--------|
| AmigaDoorSession.ts | Configurable emulator memory (EMULATOR_MEMORY_MB, default 4MB vs 16MB) |
| AmigaFileCache.ts | Added LRU eviction with size limit (AMIGA_FILE_CACHE_MB, default 2MB) |
| file-cache.util.ts | Reduced default from 16MB to 4MB (FILE_CACHE_MB configurable) |
| ExecLibrary.ts | Added cleanup() method to release tracked allocations |
| DosLibrary.ts | Added cleanup() method to clear tracked state |
| AmigaDoorSession.ts | Call cleanup() on both libraries in terminate() |
| render.yaml | Added memory environment variables |

### Expected Memory Savings

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| Emulator memory | 16MB/door | 4MB/door | 12MB/door |
| FileCache | 16MB | 4MB | 12MB |
| AmigaFileCache | Unbounded | 2MB max | Variable |
| Session cleanup | Leaks | No leaks | Prevents growth |

### Rollback Instructions

If doors crash with 4MB emulator, increase in Render dashboard:
```
EMULATOR_MEMORY_MB=8  # or 16 for full compatibility
```

### Deploy

```bash
git add -A && git commit -m "fix(memory): RAM optimization for 512MB Render limit"
git push origin main
```

### What to Watch For

- `[HEARTBEAT]` logs show memory usage - target <350MB
- If doors crash: increase EMULATOR_MEMORY_MB
- `[AmigaDoorSession] Emulator memory: XMB` shows configured memory per door
