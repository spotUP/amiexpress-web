# Handoff

## Recent Work
- Rewrote mail-composer door to use ANSIEditor widget
- Fixed ANSIEditor: canvas line-skipping (wrap:false), cursor visibility (red), stale content
- Fixed production caching (index.html no-cache, assets 1y)
- Mapped ANSI editor to AE command (pure door, no BBS modifications)
- SDK: removed transparent bg from dialog widgets, added lightblue focus default for inputs
- SDK: key event bubbling in screen.ts (parent elements receive unhandled keys from children)
- All committed and pushed (c42e252cd)

## Key Decisions
- E = built-in text editor (untouched), AE = ANSI art editor (mail-composer door)
- No BBS internal modifications for new features -- implement as doors
- ae.info is plain text (not binary Amiga .info) -- fallback parser handles it

## Active State
- Servers running on shellId srv10 (--no-watch)
- 140 commands loaded including AE
