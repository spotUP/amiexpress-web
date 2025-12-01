# Handoff (condensed)

## New updates (door IPC tracing)
- Added PC-aware OpenLibrary/FindPort logging in ExecLibrary; Bulls standalone run only opens `dos.library` (pc=0xfdd8) and never calls FindPort/AEDoor. BullsDoorHandler now injects AEDoor base into A4+0x988 when available alongside BBS port pointers.
- Rebuilt backend (`npx tsc`) and reran Bulls via `node web/backend/dist/scripts/run-amiga-door.js Doors/emp_tools/Bulls 1` (stdout → `/tmp/bulls.out`, log → `/tmp/bulls-run.log`). Bulls shows banner only; logs still lack RAWARROW/SV_NEWMSG/FindPort/CreateComm. REGISTER message sent from host, Bulls flips pointers to 0x9688 then closes stdout and crashes to PC=0xa (stack corruption).
- Sandbox note: run logs contain EPERM writing `/Users/spot/logs/door-68k.log`; stdout capture unaffected.
- Next focus: why Bulls skips OpenLibrary("AEDoor.library")/FindPort; ensure AEDoor base is registered up front (maybe during loadRealAEDoorLibrary) and trace early PCs (~0x10xx–0x12xx/0x3bxx) to force proper AEDoor IPC startup.

## Latest prompts
- "hello"
- Context dump of recent logon behavior/logging needs and batch door activity
- "ok sounds good go ahead with all 3"

## Updates
- Wired environment variables through `run-amiga-door` → `AmigaDoorSession` → `LibraryManager`, so DOS now sees the same env map that Node receives (including `SAmiLog_Path` when exported).
- Enhanced `dos.library::FindVar` with an env-backed fallback that allocates LocalVar nodes (at 0x94000/0x96000) so Amiga doors can read `SAmiLog_Path`, CLI args, or other configured settings without needing manual CLI vars.
- Added helper code in `LibraryManager`/`run-amiga-door` to pass the new `env` property, and ensured the SAmiLog test wraps this flow.
- Prevented batch scheduler from building an unbounded runner-output string by trimming the buffer to the last 256 KB, so Node doesn’t hit `RangeError: Invalid string length` when doors emit lots of data.
- Added an `exports` map to `@amiexpress/terminal`, rebuilt it, and re-ran the frontend build so Vite can resolve the shared terminal package and the BBS terminal renders the login prompt rather than just the title art.
- Deleted `web/frontend/node_modules`, reinstalled the frontend dependencies, and rebuilt (`npm run build`) so the terminal package is freshly resolved; developer still needs to relaunch the dev server for the changes to take effect.
- SSH stability: guarded PTY/window-change accept callbacks to avoid `accept2 is not a function` disconnects after the BBSTITLE screen.
- Telnet/SSH login flow adjusted: BBSTITLE now followed by explicit `Username:` prompt for text clients; login handler now line-buffers username/password like auth socket, updates node files, runs login batches, and installs ANSI filter for non-ANSI clients. Telnet localhost rejection removed; SSH accept guarded. Latest fix: ANSI prompt now strips NULs so CR+NUL (`\r\0`) from telnet counts as Enter and advances to BBSTITLE/login.
- Web terminal input fixes: `@amiexpress/terminal` now resets state on `prompt-login` without re-running auto-login, guards duplicate prompts, and no longer writes its own `Username:` prompt (uses backend output) to prevent double prompts and dropped first characters. `login-failed`/`retry-login` only reset state; prompt text comes from backend. Rebuilt terminal package and ran `web/frontend npm run build`.
- Logoff crash fix: `handleLogoff` now safely closes both socket.io and telnet/SSH sockets (checks for `disconnect`, `end`, `destroy`) to avoid `socket.disconnect is not a function` crashes that were bringing down the server after logoff. Needs backend restart to take effect.
- Telnet UX: new connections now auto-advance past the connection screen and immediately show the ANSI graphics prompt (no extra Enter required). This should also prevent the first username character from being “eaten” after hitting Enter to continue.
- Logoff exit for telnet/SSH: the telnet/SSH emitter now exposes `disconnect/end/destroy` to close the underlying transport, so logoff should terminate SSH/telnet sessions instead of hanging after “Disconnecting…”. Requires backend restart.
- Telnet/SSH login CR+NUL handling: login input now strips NULs before enter/char processing so CR+NUL counts as Enter. Should remove the “press Enter twice” behavior and prevent first-character drop after CR+NUL.
- ZMODEM: receiver now always sends a ZRQINIT kick for both upload/download and logs the first 32 bytes when Sentry consume fails (helps debug “Upload aborted” in web terminal). Needs backend restart.
- Downloads: now prefer database-backed file paths (file_entries + file_areas) and flagged file lists. If the user has flagged files, running `D` with no args builds the download list from flagged entries (area path + filename) instead of prompting. Wildcard/filename searches now use DB paths first, falling back to legacy Dir# scanning.
- Download flagged files improved: pulls flags from FileFlagManager (Partdownload/flagged#), session.tempData.flaggedFiles (DB), and session.flaggedFiles, so pressing `D` with flags present should immediately use them without dropping into hotkey prompt.
- Batch files (daily logon): batch0–batch6 now have Sanctuary-style logon door calls uncommented: quicknew, multitop variants, slicktop, ntr-lastcallers, glcviewer/glcupdater, SAmiLog, callerslog helpers, and Announce stubs. These will run on logon per day-of-week when the backend restarts.
- Pre-login: BBSTITLE display now waits for any pending screen command to finish before emitting the ANSI prompt, preserving screen-triggered door runs before prompting.
- Screen flow logging: screenDebug now defaults to console.log with a `[SCREEN]` prefix; added `[SCREEN FLOW]` console logging for logon/display flow screens (BBSTITLE/LOGON/BULL/NODE_BULL/CONF_BULL/MENU) showing load/parse/runCommands decisions plus display-flow transitions (BULL→NODE_BULL→confScan→CONF_BULL→MENU). Use backend.log to trace which screens ran and which MCIs executed.
- Conference tool flags default: `noBulls`/`noConfBulls` now default to `false` (matching AmiExpress behavior) instead of suppressing bulletins when no Conf#.info flags are present. This should allow BULL/NODE_BULL/CONF_BULL screens to display unless explicitly disabled.
- Bulletin screen rendering: BULL/NODE_BULL/CONF_BULL now fall back to `Screens/BULL20!.TXT`, `Node<nodeId>/logon20.txt`, or `Node<nodeId>/logon10.txt` if the named screen is missing; display flow screens skip auto-pagination so they render as a single frame and rely on explicit ~SP pauses (closer to express.e behavior, preventing overlap).
- ANSI handling: `addAnsiEscapes` no longer double-prefixes existing ESC-coded sequences (only prefixes bare brackets), improving fidelity for Sanctuary ANSI screens like BULLETINS/LASTC.txt.
- Sanctuary bulletins: added `Screens/NODE_BULL.TXT` (clear + Up Rough logo + pause) and `Screens/CONF_BULL.TXT` (clear + pause) to prevent fallback repetition of LASTC and to show the logo on its own screen in the BULL→NODE_BULL→CONF_BULL flow.

## Latest prompts (this session)
- “i always want the best solution i don't care about how long it takes to do”
- Goal: fix Bulls door regression, capture full stdout/stderr, and stay 1:1 with Sanctuary flow using real Kickstart/assigns.

## New updates (this session)
- Library/paths: LibraryManager now resolves BBS root from `BBS_DATA_DIR`/`BBS_ROOT` or session data, loads Kickstart via that root (with fallback search), and initializes PathManager/DOS with that root; DosLibrary gains `setBasePaths` and accepts a root override. DoorDropFileManager can now be retargeted via `setBbsRoot`.
- Runner: `src/scripts/run-amiga-door.ts` forces `BBS_DATA_DIR/BBS_ROOT` to the repo root, updates DoorDropFileManager, and builds sessions with that root so drop files land under Node#. Ensured type-check/build passes.
- Moira load: MoiraEmulator now finds `build/moira.js` even from compiled `dist` by checking source and cwd paths; logs selected path.
- Bulls capture: Built backend and ran `node dist/scripts/run-amiga-door.js ../../Doors/EmP_Tools/Bulls 1` with `BBS_DATA_DIR=/Users/spot/Code/amiexpress-web AEDOOR_STDOUT=/tmp/bulls.out`. Path manager resolved assigns correctly; after fixing absolute paths stdout now lands at `/tmp/bulls.out`. Output matches in-BBS symptom—only the banner text (110 bytes). Execution log shows door closes stdout (handle 2), frees buffers, then crashes with “PC in low memory (0x0) - likely stack corruption”, terminating before menu.
- Bulls IPC offsets: Added `MESSAGE_HEADER_SIZE=0x14` and dual-offset reads/writes so AEDoor fields write to both canonical offsets and Bulls’ header-biased offsets (data/command/node/line now mirrored at base+0xf0/+0xf4/+0xf8/+0xfc). XIMMessageParser and host-service setters now use the biased writer; Bulls handler dumps/seeds use biased reads/writes as well. Handshake logs now include biased cmd/data/node, but teardown still shows control/info at 0x9228 with zeroed dc/e0/e4, implying the live message pointer (likely ~0x937c) is being replaced/reset before FreeMem/CloseLibrary. Need to pin 0x6c24/0x6c20 to the real WaitPort/GetMsg result and stop reverting to the preallocated control block so seeding can survive teardown.

## Quick pointers
- Bulls STDOUT capture: now `/tmp/bulls.out` (110 bytes, just banner). Full run trace in terminal output from the latest run with `doorType=XIM`.
- Path handling: PathManager now treats POSIX absolute paths literally; runner sets BBS roots, infers `doorType=XIM` for Bulls, and Moira loader finds build files from dist.
- Next debugging angles: investigate Bulls crash after CloseLibrary/FreeMem near PC≈0x1250 (stack corruption) despite XIMProtocol being created; verify XIM replies/drop-file content and prevent Bulls from closing stdout/dos.library prematurely.

## Testing
- `cd web/backend && SAmiLog_Path=bbs:utils/samilog AEDOOR_DISABLE_GUARD=0 AEDOOR_STDOUT=screens:quicknew.txt AEDOOR_ROM=kickstart npx tsx src/scripts/run-amiga-door.ts ../../Utils/samilog/SAmiLog 1 '-UC\"1\"' '-O\"BBS:Bulletins/bull6.txt\"15'` → exits cleanly, `Bulletins/bull6.txt` now contains SAmiLog output.
- `cd web/frontend && npm run build` → prebuild script rebuilds `@amiexpress/terminal`, and Vite succeeds instead of failing to scan the dependency entry.
- `cd web/backend && npx tsc --noEmit` (passes).
- Quick telnet smoke test: `printf '\r\0a\r\0' | nc localhost 64128` shows connection banners; tailing `logs/backend.log` shows CR+NUL input now transitions from `display_connect` into the ANSI prompt flow instead of being ignored.

## Latest prompts (continued)
- “i always want the best solution i don't care about how long it takes to do”
- Proceed with next steps for 1:1 door emulation; avoid door-specific hacks, keep generic and batch-safe.

## Bulls / 68K door emu status (most recent)
- Express.e host behavior: Wait on AEDoorPort, log “msg request: <cmd> / data / string”, processXimMsg, ReplyMsg. REGISTER sets line length (or 29). Bulls runtime log (real AmiExpress coder) shows REGISTER → RAWARROW → SV_NEWMSG → DT_LINELENGTH etc.
- What’s in place now: JH_REGISTER reply sets line length and clears lineNum (per express.e). DT_LINELENGTH handler exists in data-query. BullsDoorHandler no longer pokes A5/masks/registers; only normalizes message buffers. RAWARROW handler just replies (no synthetic SV_NEWMSG). Added per-message logging in DoorMessageHandler (msg request/data/string). XIMState has optional port fields.
- Attempts that didn’t work (don’t repeat): synthetic SV_NEWMSG injection after RAWARROW; forcing Bulls A5/mask/register/port values to drive the 0x3f9c path. Both removed to stay express.e-pure.
- Current Bulls run: `node web/backend/dist/scripts/run-amiga-door.js Doors/emp_tools/Bulls 1` (log `/tmp/bulls-run.log`, stdout `/tmp/bulls.out` banner only). REGISTER reply is correct (cmd=1,len=260, data=nodeStatus, reply=a0400), but Bulls never issues RAWARROW/SV_NEWMSG, closes stdout, then drops to PC=0xa (stack corruption). No WaitPort/GetMsg observed.

## Next steps (to implement)
1) Add ReplyMsg logging in ExecLibrary.replyMsg to confirm port/target. ✅
2) Audit port usage: ensure we ReplyMsg to the door-provided replyPort and use the real AEDoorPort<n> (name “AEDoorPort<node>”) for PutMsg, no synthetic ports. (Still to confirm in code/logs; no “msg request” seen yet.)
3) Re-run Bulls; expect REGISTER→RAWARROW→SV_NEWMSG. If RAWARROW still absent, focus on why the door isn’t seeing the REGISTER reply (port mismatch/ReplyMsg issue).
