# Handoff

## Current State (2025-12-05)
- AquaScan FR fix in DosLibrary (DirN pseudo-directories return fib_DirEntryType=2) is merged; awaiting user test after server restart.
- Repo clean; pushed commits: `docs: add aquascan investigation and disk migration notes`, `feat: expand bbs config loading and health checks`, `chore:data sync conference listings and logs`.
- Large Conf*/Dir* data sync (Dir deletions/NumULs updates, quicknew screen, caller logs, AquaScan.Date) is intended per user.

## Recent Work
- Added AquaScan investigation docs and disk/dataset audit notes; updated handoff and CLAUDE.md.
- Added backend services (bbs-config-file, conference setup, health checks, file-areas loader, message-file util) plus config-app HealthCheck page and related handler updates.
- Synced BBS data files and logs; TypeScript check passed on commits; push to origin main succeeded.

## Next Steps
- User to restart servers and run `ascan fr` to confirm AquaScan FR behavior.
- Optionally run targeted door/file listing checks to validate data sync.

## Session Marker
- ChatGPT has taken over here; use this commit to return to this state if needed.

## Restart Notes
- To continue debugging AquaScan FR without sandbox limits, start Codex with:
  `codex --sandbox_mode danger-full-access --network_access enabled --approval_policy on-request`
- For evidence: run `ascan fr` on the live BBS (after `./dev/scripts/start-servers.sh`) and share:
  - Latest log: `ls -t logs/door-68k-AquaScan* | head -1` then `cat <file>`
  - Backend snippet: `tail -n 200 logs/backend.log`
- Harness alternative (needs full access): `TMPDIR=$PWD/tmp web/backend/node_modules/.bin/tsx web/backend/src/scripts/run-amiga-door.ts Doors/aquascan/AquaScan.000 1 --doortype XIM --doorId FR`
