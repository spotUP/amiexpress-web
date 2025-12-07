# Handoff
## Current State (2025-12-07)
- The massive documentation reorg is now tracked: `Documentation/1-6` holds the summary guides, `archive/` subfolders retain the historical investigations, and `Documentation/7-Reference Sources/` keeps the reference archives verbatim.
- Every conference directory now carries the updated `Menu.txt_.txt`, `Screens/BBSTITLE.TXT`, and `Screens/Logoff.seq` assets, and `menu250.txt.GR` reflects the corrected `.GR` data from the prior `.ans` version.
- The codebase still needs the live AquaScan FR validation, SIM door handshake finishing, and the sandbox network fix before door emulation can move forward, but the repo is now clean and ready for that work.

## Recent Work (Session 3)
- Inventoried the untracked directories, staged the documentation restructure plus the new conference screens/menus, and rewrote `Documentation/6-Progress/MASTERPLAN.md` to point at the reorganized docs plus the outstanding door tasks.
- Locked down the `.GR` filenames, ensured `hammer` files (menus, screens) match the new structure, and recorded the cleanup context in this handoff so future sessions can pick up the new repo layout without redoing the audit.

## Next Steps
1. Run AquaScan FR from the full BBS flow (ensuring `DOORUSE=FR/REVSCAN` and `DEBUG_XIM_OUTPUT=1`) to confirm the ASCII art pauses at each screen as the express.e trace dictates.
2. Finish the SIM door handshake by following the `FindPort`/`DoorControl` sequence noted in `Documentation/4-Door-Developers/archive` so the 68K door can complete its init/stat message flow.
3. Restore sandbox network access to `registry.npmjs.org` so fonts and npm packages resolve, enabling door tests, frontend font loads, and CLI commands that fetch dependencies.
