# Handoff (condensed)

## Latest prompts
- "telnet works better now but it stops here:"
- "Another language model started to solve this problem and produced a summary... Use this to build on the work that has already been done"
- "i tried to connect via the web terminal, input does't work here: Username:"

## Updates
- Wired environment variables through `run-amiga-door` → `AmigaDoorSession` → `LibraryManager`, so DOS now sees the same env map that Node receives (including `SAmiLog_Path` when exported).
- Enhanced `dos.library::FindVar` with an env-backed fallback that allocates LocalVar nodes (at 0x94000/0x96000) so Amiga doors can read `SAmiLog_Path`, CLI args, or other configured settings without needing manual CLI vars.
- Added helper code in `LibraryManager`/`run-amiga-door` to pass the new `env` property, and ensured the SAmiLog test wraps this flow.
- Prevented batch scheduler from building an unbounded runner-output string by trimming the buffer to the last 256 KB, so Node doesn’t hit `RangeError: Invalid string length` when doors emit lots of data.
- Added an `exports` map to `@amiexpress/terminal`, rebuilt it, and re-ran the frontend build so Vite can resolve the shared terminal package and the BBS terminal renders the login prompt rather than just the title art.
- Deleted `web/frontend/node_modules`, reinstalled the frontend dependencies, and rebuilt (`npm run build`) so the terminal package is freshly resolved; developer still needs to relaunch the dev server for the changes to take effect.
- SSH stability: guarded PTY/window-change accept callbacks to avoid `accept2 is not a function` disconnects after the BBSTITLE screen.
- Telnet/SSH login flow adjusted: BBSTITLE now followed by explicit `Username:` prompt for text clients; login handler now line-buffers username/password like auth socket, updates node files, runs login batches, and installs ANSI filter for non-ANSI clients. Telnet localhost rejection removed; SSH accept guarded. Latest fix: ANSI prompt now strips NULs so CR+NUL (`\r\0`) from telnet counts as Enter and advances to BBSTITLE/login.
- Web terminal input fix: `@amiexpress/terminal` now always resets login state on `prompt-login`, skips token retry there, and after `login-failed` immediately re-prompts `Username:` with cleared buffers so typing works even when a stale token exists. Rebuilt terminal package and ran `web/frontend npm run build`.

## Testing
- `cd web/backend && SAmiLog_Path=bbs:utils/samilog AEDOOR_DISABLE_GUARD=0 AEDOOR_STDOUT=screens:quicknew.txt AEDOOR_ROM=kickstart npx tsx src/scripts/run-amiga-door.ts ../../Utils/samilog/SAmiLog 1 '-UC\"1\"' '-O\"BBS:Bulletins/bull6.txt\"15'` → exits cleanly, `Bulletins/bull6.txt` now contains SAmiLog output.
- `cd web/frontend && npm run build` → prebuild script rebuilds `@amiexpress/terminal`, and Vite succeeds instead of failing to scan the dependency entry.
- `cd web/backend && npx tsc --noEmit` (passes).
- Quick telnet smoke test: `printf '\r\0a\r\0' | nc localhost 64128` shows connection banners; tailing `logs/backend.log` shows CR+NUL input now transitions from `display_connect` into the ANSI prompt flow instead of being ignored.
