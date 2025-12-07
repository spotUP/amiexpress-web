# Handoff

-## Current State (2025-12-07)
- AquaScan FR now receives the user's true terminal height/width and a 80‑column wrap, so the door should pause after each full screen and avoid arbitrary breaks at column 79.
- New DIR file writes now emit classic Amiga CR line endings, matching the files AquaScan expects and preventing the ascii logo blobs from gluing themselves into single lines.
- The frontend now resolves fonts through Vite’s `BASE_URL`, so deployments hosted under non‑root paths can load every `.ttf` without 404s.
- Logoff in PETSCII mode randomly pulls one of the new `Screens/logoff/NNN.logoff.seq` files thanks to the new `Screens/Logoff.seq` driver, so every logout shows a fresh PETSCII art card before the NO CARRIER message.
- `npx tsx web/backend/src/scripts/run-amiga-door.ts Doors/AquaScan/AquaScan.000 1 1 REVSCAN` still can’t run locally because the sandbox can’t reach `registry.npmjs.org`, so door validation remains blocked.

## Recent Work (Session 9)
- Added helpers in `web/backend/src/handlers/door.handler.ts` to pick a positive terminal height/width from session data and feed them into `pauseLines`, `lineWrap`, and `lineCount` so `XIMProtocol` gets a real 80×N screen geometry.
- Taught `XIMProtocol` to default to an 80‑column wrap instead of 79 once a width isn’t supplied.
- Converted DIR entry helpers to append `\r` instead of `\n`, keeping generated DIR files Amiga‑styled and freeing the 68K door from misreading the continuation art.
- Updated the frontend preload links, CSS, and `main.tsx` so font paths are computed via `import.meta.env.BASE_URL`, exposing CSS variables for each font in case the SPA loads from a subpath.

## Next Steps
1. Retry the AquaScan FR door run once `tsx` can be installed to confirm the offset pause/pagination is now honoured.
2. Monitor the door logs for `press <RETURN>` prompts and the `BB_NONSTOPTEXT`/line wrap sequence to ensure the ASCII logos stay intact without manual postprocessing.
