# Handoff
## Current State (2026-01-05)
- N S U (AquaScan) and J (JoinCnf) doors run but emit no JH_SM output.
- Evidence points to stack corruption after `dos.library Lock("ENV:JC_PWFAIL.2")` fails with IoErr=205.
- Return address on stack is outside code region; door jumps to invalid PC and crashes/loops.

## Recent Work
- Read and confirmed `CLAUDE.md` and `AGENTS.md` per user request.
- Logs previously checked: `logs/backend.log`, `logs/xim-debug.json`, `logs/door-68k-joincnf-*.log`.
- Files examined: `DosLibrary.ts`, `LibraryTraps.ts`, `dos-vectors.ts`.
- **ADDED**: Stack corruption detection in `LibraryTraps.ts` (lines 1144-1158).
  - Validates return address is in range [0x1000-0x1000000]
  - Logs detailed diagnostics when corruption detected (PC, SP, A6, stack dump)
  - Will identify exact library call where stack is corrupted

## Next Steps
- **RESTART BACKEND** to enable stack corruption detection (changes in LibraryTraps.ts)
- Run J command - will log "[STACK_CORRUPT]" with details when corruption hits
- Analyze which library call has corrupted stack (expect Lock or earlier)
- Check JSR/RTS implementation if corruption happens on first library call
- Verify with vamos that JoinCnf works on real Amiga emulator
- Fix root cause, then re-test N S U and J

## Last Prompts
- "read claude.md agents.md"
