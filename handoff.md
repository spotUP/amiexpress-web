# Handoff - 2026-02-05

## Current Session: Removed Door-Specific Hacks

### Problem Identified

Analysis found door-specific hacks violating CLAUDE.md rule: "No door-specific hacks or heuristics"

### Fixes Applied

**1. IconLibrary.ts - Dynamic DOORUSE lookup**
- Removed: Hardcoded `'DOORUSE.FR', 'DOORUSE.CS', 'DOORUSE.NSU', 'DOORUSE.N'`
- Added: `findAllDoortypeEntries()` method that dynamically finds ALL DOORUSE.* entries
- Now works for any door command, not just FR/CS/NSU/N

**2. command.handler.ts - Removed test door commands**
- Removed: `GA` (GetAnswer), `MULTITOP`, `WH` (What) hardcoded commands
- These bypassed the proper door system with hardcoded paths
- Doors should use .info file registration and door menu

**3. internal-commands.ts - Removed duplicate test commands**
- Removed: `MULTITOP`, `WH` duplicate handlers
- Same issue as command.handler.ts

**4. command.handler.ts - Fixed WHO helper path**
- Changed: `path.join(process.cwd(), '../../doors/who')`
- To: `path.join(config.get('dataDir'), 'Doors', 'who')`
- Uses proper BBS directory resolution

### Acceptable Patterns (NOT violations)

These were analyzed and found to be acceptable:

1. **batch-scheduler.ts** - QuickNew/MultiTop/SlickTop handlers
   - TypeScript ports of batch utilities (NOT doors)
   - Run from batch files like originals
   - 1:1 compatible with 68K behavior

2. **screen.handler.ts** - MultiTop bulletin codes (%XX.YYCC)
   - Parsing documented bulletin format
   - Any bulletin generator can use this format

3. **Character conversion for 0xA0**
   - Generic CP437 handling, affects all doors

### Previous Session Fix

- batch-scheduler.ts: Added app root to batch file search paths
- SAmiLog now properly found and executed via batch files

### Deployment Status

- All changes need commit and push
- TypeScript compiles clean
