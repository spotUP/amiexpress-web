# Handoff
## Current State (2025-12-05)
- Documentation now relies on clean summary files under `Documentation/1-6` plus per-folder `archive/` buckets (e.g., user, sysop, developer, door, reference, progress) and the raw reference sources consolidated in `Documentation/7-Reference Sources/`.
- Door/AquaScan logs still show ASCII art/pause glitches, SIM-style 68K doors remain blocked on the port handshake, and npm registry access is still blocked in this sandbox.
- Previously scattered SDK, dev script, MCP, and door readmes now live under the appropriate archive folders (e.g., `Documentation/3-Developers/archive/sdk`, `Documentation/3-Developers/archive/dev-scripts`, `Documentation/4-Door-Developers/archive/doors`, `Documentation/5-Reference/archive/mcp-server`) with inline pointers in the original code directories.
- All test harnesses were centralized under `Scripts/` (with per-category subfolders) and the `Scripts/README.md` now guides AI agents to the right runner; the root `README.md`, `Documentation/README.md`, and `CLAUDE.md` all mention this map so navigation is explicit.

## Recent Work (Session 1)
- Rebuilt the user/sysop/developer/door/reference documentation to be concise summaries, archived every legacy `.md` inside `Documentation/*/archive/`, and relocated door/emulator sources (`Doors_with_Source`, `vAmiga`) into the dedicated `7-Reference Sources` directory.
- Updated the progress tracking artifacts (`CURRENT_STATUS.md`, `MILESTONES.md`, `KNOWN_ISSUES.md`, `MASTERPLAN.md`) to describe the consolidation and the outstanding issues mentioned above.

## Next Steps
1. Resolve the remaining AquaScan FR pagination/pause art issues so the output matches express.e’s behavior exactly.
2. Revisit SIM-style door emulation once the port/FindPort sequence is understood, using the archived disassembly notes for reference.
3. Restore network connectivity (npm/registry access) or provide offline packages so validation and font downloads can complete locally.
