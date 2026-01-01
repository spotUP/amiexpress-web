# Handoff - 2026-01-01

## Current State
- AquaScan `N S U` still outputs only blank lines; XIM sessions stop after `EXPRESS_VERSION` and then restart with repeated `JH_REGISTER`.
- Real Amiga reference log is in `Documentation/4-Door-Developers/Aquascan N.log` (shows follow-up requests after `EXPRESS_VERSION`).
- Recent fixes aligned with express.e: stopped overwriting `msg.strptr` in XIM replies and line-input completion; reply tracking added in ExecLibrary.

## Recent Work (Session 2026-01-01)
- Read `logs/backend.log`, `logs/door-68k-N-20260101013836.-N1.log`, ran `npm run xim:analyze -- --door N --verbose` and `npm run xim:view -- --door N --last 200`.
- Verified in `AmiExpress-Sources/express.e` that `msg.strptr` is only used for `JH_SMPTR`; `INTERPRET_MCI` and `SIG_LI` use `msg.string`.
- Updated `web/backend/src/amiga-emulation/xim/system-commands.ts` and `web/backend/src/amiga-emulation/xim/io.ts` to avoid writing `msg.strptr`.
- Documented this in `Documentation/6-Progress/AQUASCAN_DEBUG_SESSION.md`.

## Next Steps
1. Restart backend and rerun `N S U`, then check `npm run xim:view -- --door N --last 200` and `npm run xim:analyze -- --door N --verbose`.
2. Confirm message sequence matches Amiga log (expect `BB_MAINLINE`/`DT_LINELENGTH`/`DT_TIMELASTON`/`DT_NAME`/`JH_WRITE` after `EXPRESS_VERSION`).
3. If still crashing, capture `logs/door-68k.log` around the run and verify `strptr/filler` values vs `msg.length` (0x104).

## Last Prompts
- "fully focus on aquascan until it's fixed"
- "n s u ran in the bbs now, check the logs"
- "the modified files are ok; typescript arcade doors are fixed"
