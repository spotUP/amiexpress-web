# Handoff

## Recent Work
- Rewrote mail-composer door to use ANSIEditor widget directly (~330 lines)
- Fixed ANSIEditor bugs: line-skipping (wrap:false), cursor visibility (red+setFront), stale content (always sync)
- Fixed SDK preview CSS (restored postcss/tailwind configs) and terminal centering
- Fixed production 404 caching bug (index.html maxAge:0, assets 1y)
- Added Text/ANSI editor choice to E command: "Text or Ansi (T/a):" prompt
  - T/Enter -> normal text editor, A -> launches mail-composer door

## Key Commits
- `1db05f5ee` - mail-composer rewrite + canvas rendering fixes
- `bc7f470e3` - static asset caching fix for production
- `8e4f83b83` - Text/ANSI editor choice on E command

## Servers
- Running via `start-servers.sh --no-watch` on shellId srv6
- Port 3001 (BBS), 8080 (SDK preview)

## What User Was Doing
- Testing the E command Text/ANSI prompt flow
- All features committed and pushed, deploy should auto-run
