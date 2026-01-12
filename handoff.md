# Handoff

## Current State (2026-01-12)
- Mail Composer disables game mode and runs composer async so door input loop works.
- ANSI editor `package.json` now points to `dist/index.js` with `types` entry.
- Backend asset route uses regex matcher; restart required after changes.
- Header Dropdown Demo door added with inline menu labels (no buttons).

## Recent Work (2026-01-12)
- Updated `Doors/mail-composer/index.ts` for async composer + disable game mode.
- Updated `Doors/ansi-editor/package.json` main to `dist/index.js`.
- Added `Doors/header-dropdown-demo/` (package.json, tsconfig, index.ts).
- Added `Commands/BBSCmd/HDRDROP.info`.

## Next Steps
- Restart backend and re-test E door autocomplete and ANSI editor startup.
- If issues persist, capture `logs/backend.log` tail around the failure.
- Launch `HDRDROP` and verify header dropdown layout and focus behavior.

## Latest Prompts
- User: "write a handoff"
