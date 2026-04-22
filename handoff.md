# Handoff

## Recent Work

- Rewrote `Doors/mail-composer/index.ts` to use `ANSIEditor` widget directly (~330 lines, down from ~844)
- Fixed ANSIEditor canvas line-skipping bug: added `wrap: false` to drawCanvas and viewport
- Fixed ANSIEditor cursor: changed to red, added `setFront()` so it stays above canvas
- Fixed stale content: always sync canvas to display on startup (not just when initialContent exists)
- Restored SDK preview Tailwind configs (postcss.config.js, tailwind.config.js) that were deleted
- Added SDK preview terminal centering override (`!min-h-0 !h-full !items-start`)
- Fixed `createScreen(bbs, ...)` call (was passing ctx instead of bbs)

## User's Last Prompts

- Fix red cursor missing from ansi message editor, commit and push
- Previously: mail editor uses ansi editor, fix line-skipping, fix SDK CSS

## Key Files Changed

- `Doors/mail-composer/index.ts` - Complete rewrite using ANSIEditor widget
- `sdk/engines/ui/blessed/widgets/ansi-editor.ts` - wrap:false, red cursor, setFront, always sync
- `sdk/tools/preview/frontend/postcss.config.js` - Restored
- `sdk/tools/preview/frontend/tailwind.config.js` - Restored
- `sdk/tools/preview/frontend/src/App.tsx` - Terminal centering override

## Status

- Committed and pushed (1db05f5ee), deploy in progress
- Servers running on shellId srv3
