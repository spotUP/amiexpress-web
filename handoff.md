# Handoff
## Current State (2025-12-22)
- `ExecLibrary.openLibraryHybrid()` now attempts ROM residents before falling back to disk-loaded natives so non-AUTOINIT modules like `dos.library` schedule their `InitResident` trap just as on real AmiExpress.
- A `tsc --noEmit` run fails with existing errors in `src/doors/amigaDoorManager.ts` (string/Buffer mismatch and nullable string assignment); these were present before this change.

## Recent Work
- Reordered native library opening so Kickstart residents gate `InitResident`, logged when a non-AUTOINIT trap is pending, and kept the legacy loader/stub path intact for libraries missing from ROM.
- Verified the backend still builds (TypeScript check reports the pre-existing `amigaDoorManager.ts` issues if rerun).

## Next Steps
- Run FR, J (and optionally `Doors/arkanoid2`) again now that the resident path is preferred; confirm in `logs/backend.log` and the door-specific logs that the door receives the INIT/STAT handshake, remains running, and no longer swallows the first post-door keystroke.
- If the TypeScript errors in `amigaDoorManager.ts` still block `npx tsc --noEmit`, address those legacy issues before rerunning the type check as part of the final verification.

## Last Prompts
- User: “you need to fix the root cause not do workarounds”
- User: “are we using the real amiga kickstart and load libraries directly from the kickstart now? this is the root cause of the issues, doors stopped working since we did that change”
