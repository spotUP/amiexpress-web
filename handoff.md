# Handoff Summary

## Latest change (GA door startup)
- Fixed GA door crash in `LibraryManager`: added `ensureAnswerFiles` to create `Answers/` and node `Answers/TempAns` directories (uses `BBS_ROOT`/projectRoot) before icon.library init. Typecheck passes (`cd web/backend && npx tsc --noEmit`). Backend restart needed to pick up the fix.

## Latest change (Admin logs)
- System admin logs endpoint now streams log files instead of reading entire files into memory, preventing `RangeError: Invalid string length` on multi-GB `backend.log`. Uses a streaming reader with a ring buffer to return the last N lines (with optional search) without loading the whole file. Typecheck passes (`cd web/backend && npx tsc --noEmit`). Restart backend to pick up the change.

## Latest fixes (GA + command history)
- GA command now passes the live BBS session into AmigaDoorSession so XIM/door input wiring uses the correct node/session data. Should prevent the GA door from exiting immediately after keystrokes. Restart backend, retry GA.
- Command history arrows were being split into individual chars; socket handler now treats escape sequences (e.g., `\x1b[A`/`\x1b[B`) as single inputs so history navigation works again. Backend restart required.

## Latest fix (screen pauses)
- `doPause` now installs a real pagination gate and signals `advanceDisplayFlow` to resume after a keypress. Login/bulletin screens (e.g., `uprough.TXT`) should now pause for input instead of auto-advancing. Restart backend to apply.
- Added guard so pauseDisplayFlow skips adding a second pause when a screen already set `paginatedScreen` (e.g., QuickNew with `~SP`). Should remove the double pause prompt.
- Paginated screens now clear `menuPause` when finishing (Y/Enter, N, or NS) so we don’t stack an extra pause prompt after screen-driven pauses (e.g., QuickNew).
- Added `~SP` to `Screens/uprough.txt` to force a pause on that screen (matches expected behavior).
- QuickNew screen generation now clears the screen before content (adds ESC[2J ESC[H) so QuickNew displays from a clean screen.
- Login assets aligned with Sanctuary layout: copied `Node2/Screens` into `Node1/Screens` so sysop gets node-specific AWAIT/LOGON/etc.; renamed `Screens/flt/001-005.flt*` to `.flt` so WORK:bbs/Screens/flt lookups resolve; seeded `Bulletins/lastc.txt` from `bull6.txt` so logon can show last callers until the door generates it.
- Added initial Batch API (`/api/batches`) to list/load/save batch0–batch6 so sysops can edit batches from the admin UI. Backend wiring only; UI still pending.
- Added headless 68K door runner (`web/backend/src/scripts/run-amiga-door.ts`) and hooked batch scheduler to run `ntr-lastcallers` via the runner instead of spawning host binaries. MultiTop/SlickTop still pending in the runner path.
- Batch scheduler now routes `ntr-lastcallers`, `multitop/mtop`, and `slicktop/slicktop` through the 68K runner (node0 placeholder for runner) instead of host spawn. QuickNew stays native. UI still pending.

## Latest changes (tooltypes parsing)
- .info tooltypes are now parsed centrally (commented entries skipped) and preserved as an object on command definitions/door metadata. AmigaDoorManager uses the shared parser and exposes every tooltype on DoorInfo.
- Door objects now carry stack/priority/resident/expert/trap/silent/quick/logInputs/scriptCheck/banner/mimicVer/passParameters/internal plus the full toolTypes map.
- 68k door launches receive these fields in DoorConfig (stack/priority/flags/toolTypes, etc.) so stack sizes and other tooltype-driven behaviors flow into Moira. Command execution also passes the extra fields to executeDoor.
- Typecheck: `cd web/backend && npx tsc --noEmit` (pass).

## Latest updates (68K register)
- XIM JH_REGISTER now mirrors express.e: command is set to the user’s line length (user.lineLength → pauseLines → lineWrap, fallback 29) before ReplyMsg; data/node/string are echoed unchanged and length defaults to 0x104 when absent.
- LibraryManager now passes the BBS session into XIMProtocol so register replies and other handlers can see user settings (line length, etc.).
- Amiga doors now receive live keystrokes: launchAmigaDoor sets `inDoorManager`/`DOOR_RUNNING` and a `doorInputHandler` that routes input to XIM queue (and DOS when not waiting on XIM), then clears it on exit. This should let GetAnswer/Bulls accept prompt input instead of timing out.
- Door lifecycle guard now extends automatically when a door is waiting for line input (JH_PM/JH_LI/HK); the loop limit grows in 50k steps instead of terminating so the user can respond.
- GA command path now also sets `inDoorManager`/`DOOR_RUNNING` and installs a doorInputHandler that feeds input into XIM/DOS, with cleanup on exit/error. This was missing before, so GetAnswer was not receiving keystrokes.
- Persist session after wiring door input: both GA and launchAmigaDoor now call `setSession(socket.id, session)` after setting/clearing doorInputHandler so socket-handlers sees the door flags and routes keystrokes correctly.
- Added `[DoorFile]` logging in dos.library: Open/Read/Write/Close calls append to `logs/backend.log` with Amiga path, handle, bytes, and real path when available (FileManager branch logs too). This should show up in the admin log dropdown for 68k door debugging.
- 68k door logs now go to a dedicated `logs/door-68k.log` (DoorDebug/DoorFile/DoorLog/DoorRegs). Admin `/logs` dropdown now includes “68K Doors”, and backend API supports type=door68k (GET/DELETE). Config-app build succeeds.
- GET /logs now auto-creates the requested log file (including door-68k) if missing so the admin log page won’t error when the file doesn’t exist yet.

## New changes (ZMODEM bridge)
- Added real ZMODEM scaffolding. Backend now has a `ZmodemTransferManager` (web/backend/src/services/zmodem-transfer.service.ts) that runs zmodem.js over the raw channel, starts ZRQINIT for downloads, and streams real files instead of staging. XIM ZMODEMSEND/RECEIVE/BATCH/NET* now call this manager and push paths through the playpen copy when sending. Raw flags are wired to session transferRawSink/transferRawSend and telnet/SSH handlers bypass cooked commands during transfers.
- Socket.IO raw channel now uses transfer-raw:data/init/complete; manager cancels on end/cancel events. Telnet/SSH connections set transferRawSend to connection.write and feed raw buffers when transferRawActive is set.
- Frontend terminal now uses zmodem.js (browser module) to run the negotiation loop. transfer-raw:init builds a Sentry, consumes transfer-raw:data, auto-sends ZRQINIT for uploads, and saves downloads via Browser.save_to_disk. startUpload queues Files for pending send sessions; downloads wait for the BBS to initiate. Old transfer:start/data scaffolding removed.
- New type shims for zmodem.js added under web/backend/src/types and packages/terminal/src/types; package.json/package-lock updated (backend + terminal) to include zmodem.js.
- RZ command now starts a real ZMODEM receive into the node playpen, wiring session transferRawActive/transferManager and emitting transfer-raw:init for web clients. Completion messages list received filenames (web/backend/src/handlers/transfer-misc-commands.handler.ts).
- U/D commands now start ZMODEM transfers directly: U invokes a ZMODEM receive into the node playpen; D streams flagged files via ZMODEM if any are queued, otherwise falls back to the download interface (web/backend/src/handlers/user-commands.handler.ts).
- Typecheck run: `cd web/backend && npx tsc --noEmit` (pass).

## Current session
- User asked to restart the backend to pick up Conf.DB overlay + prompt fixes; not restarted here per repo rules—please run `./dev/scripts/start-servers.sh` when ready.
- Servers restarted by user. Backend log shows BBS root `/Users/spot/Code/amiexpress-web`, dataDir same; SQLite in `web/backend/data/amiexpress.db`.
- Current conference list from `web/backend/data/amiexpress.db`: 1 General, 2 Tech Support, 3 Announcements, 4–17 “Conference N”, 18–31 “Conference N (Imported)”. Root `Conf.DB` is 0 bytes, so Conf.DB mirroring stays inert until a real Conf.DB is present or `BBS_ROOT` is pointed at Sanctuary data.
- Need verification after restart: confirm J output matches Conf.DB handles and that VER/WHO/WHD/FS/N no longer require a second Enter.
- Implemented runtime ConfConfig overlay: during init, we now read `ConfConfig.info` (NCONFS/NAME.n/LOCATION.n) from `BBS_ROOT` and set the conference count/names from there; Conf.DB mirroring is now a fallback only when ConfConfig is absent. This trims the runtime conference list to the 14 Sanctuary names (Lamer Zone … bAUD bOY bATTLE) without mutating Conf.DB. Restart backend to load the change.
- Fixes to InfoFileParser: dotted keys supported, and tooltypes are now parsed by splitting null-terminated entries (case-insensitive keys, first occurrence wins, parenthesized entries skipped) to mirror icon.library FindToolType semantics. ConfConfig overlay should now read NAME.n/LOCATION.n correctly. Restart required.
- AEKIT notes expanded: README-now documents 68K door IPC in detail (AEDoorPort handshake, big-endian 32-bit fields, pause rules, ACS screen search, Zmodem/Net transfer codes, account/conf DB helpers). Remaining unknowns flagged (EDITOR_STRUCT/BYPASS_CSI_CHECK/SENTBY, ACP extras).
- ConfConfig parsing fixed for control-prefixed tooltypes (icon length bytes). Conf names now parse correctly (NCONFS=14, Lamer Zone…bAUD bOY bATTLE) via `InfoFileParser`. Restart backend to apply overlay.
- Navigation fallbacks now match express.e: `<`/`>` call J when no previous/next conference; `<<`/`>>` call JM when at message-base bounds (no warning prompt). This should align menu flow without extra pauses.
- Pause handling fixed: flagPause prompts now capture keystrokes via socket handler (line buffer), so F/FR listings should advance on Enter/NS/F/etc. Time command now sets menuPause so T returns to the menu prompt.
- User’s priorities: MS/conf-scan parity, navigation keys (> < >> <<), and any remaining command/help quirks. Reply prepared with next-action plan.

- **Focus:** Finish command-level parity so every command exits with a single prompt and matches express.e output. Sanctuary data must stay untouched.
- **Harness status:** `dev/scripts/test-all-commands.ts` was tweaked but remains flaky; manual testing is preferred now.
- **Manual issues to fix:**
  - `F`/`FR`: verify they still pause once (recent fix sets menuPause + prompt).
  - `FS`: already pauses; recheck after other menu-flow changes.
  - `N`: now prints a press-key prompt; confirm single prompt and return.
  - `VER`, `WHO`, `WHD`: now print a press-key prompt; confirm single prompt and return.
  - `T`: now returns without a second pause; confirm single menu prompt.
  - `S`: now shows a key prompt; ideally invoke userstats door, but confirm clean return.
  - `?`: now redraws the menu (expert only); confirm matches express.e help behavior.
  - `X`: now redraws the menu without extra pause; confirm output matches express.e.
  - `W`: now exits to menu on one Enter; confirm.
  - Logoff flow: ensure no commands execute after logoff (guard added; needs re-test with real session).
  - Logoff screens: WORK:bbs/Screens/logoff/002.logoff should resolve via the new WORK: mapping (drops leading "bbs" component).
  - QuickNew: ~SS_BBS:screens/quicknew.txt should now load (extension stripped); confirm it renders instead of showing raw text.
- **Partial code changes in progress:**
  - `web/backend/src/handlers/display-file-commands.handler.ts`: `?` now redraws the menu in expert mode and drops the “Expert menu refreshed” text.
  - `web/backend/src/handlers/file.handler.ts`: New Files adds a press-key prompt before returning to the menu.
  - `web/backend/src/handlers/info-commands.handler.ts`: VER/WHO/WHD now emit a press-key prompt and return to the menu.
  - `web/backend/src/handlers/preference-chat-commands.handler.ts`: X toggle now redraws menu immediately, no extra pause.
  - `web/backend/src/handlers/navigation-commands.handler.ts`: T no longer adds an extra press-key prompt (returns straight to menu).
  - `web/backend/src/utils/flag-pause.util.ts` + `server/socket-handlers.ts`: pause prompts now short-circuit command handling via a session flag handler, so F/FR should truly wait for user input.
  - Earlier fix: `file-listing.handler.ts` pauses and returns to menu after F/FR.
- **Next steps when resuming:**
  1) Verify menu prompts are single after VER/WHO/WHD/N/F/FR and adjust finalize/pause usage if needed.
  2) Make `?` match express.e help behavior exactly (menu redraw in expert; no extra text in non-expert) and confirm prompt.
  3) Ensure X toggle redraws the menu/prompt once.
  4) Fix T to emit only one prompt and return to menu cleanly.
  5) Wire S to the userstats door (or clean menu return) and W to exit on one Enter.
  6) Decide interim WHO door behavior (simple list vs. 68k door) but keep single-prompt exit.

## Latest changes (current session)
- Added `MASTERPLAN.md` with a phased, line-referenced roadmap to reach 1:1 parity with express.e and Sanctuary data. All future work should update that file (use strikethrough when tasks complete).
- Removed temporary `menuNeeded/menuPromptShown` guard so menu drawing is controlled solely by state transitions.
- In `web/backend/src/handlers/command.handler.ts`, display-flow handling now returns immediately after advancing the bulletin/scan/menu flow to avoid extra menu renders; removed the second `displayMainMenu` call that doubled prompts.
- Added explicit screen clears for AWAITSCREEN/BBSTITLE/LOGON/BULL/NODE_BULL/CONF_BULL/MENU in `screen.handler.ts`, clearing before first page and full-frame renders to stop screen bleed between AWAIT/BBSTITLE/BBS menu.
- New user flow alignment started: added real-name/email/sex prompts, default “screen clears” now No unless Y, cleared input buffers between prompts, and adjusted summary prompt to wait for (Y/n). Questionnaire prompts now reset inputBuffer to avoid swallowed Enters.
- New user fixes in progress: added extra email prompt state and sex/age now advances to questionnaire/account creation; password now enforces min 4 chars; empty passwords now count as invalid during login.
- Bulletin/screen search now avoids legacy dataDir/BBS to prevent creation of empty BBS/ dir and prefers Conf1 roots; screen loader no longer probes repo-root/Screens when dataDir differs (expects correct dataDir/BBS_DATA_DIR).
- MCI: Added bare `~SP` handling to set pause/strip output so Sanctuary screens no longer display the code verbatim.
- MCI pause: `~SP` now triggers an actual pause (minimal pagination with a Pause prompt) before continuing, instead of just stripping the code.
- Masterplan updated with initial express.e line references: state machine/menu loop (28540–28660), processCommand (~28229), MCI subsystem (5258–6812), new user prompts (~29610+), and data layout expectations (Conf1/Node1 screens, root Screens; avoid Conf01/BBS).
- Added logon/logoff flow pointer (~28450+) to masterplan notes; registration references start ~29400 with retry/continue ~29610. Phase 0 mapping still in progress; no code changes.
- Expanded masterplan with a processCommand dispatch map (navigation, messages, files, info/utility) to drive 1:1 alignment; still documenting—no runtime changes yet.
- Added file listing/new-files references to masterplan (displayFileList/myNewFiles 27580–27860, flagPause at ~28025 controlling `(Pause)...(f)lags, More(Y/n/ns)?`). Still in mapping phase; no code touched.
- Added message subsystem anchors to masterplan: enterMSG around 10749 (to/subject/private/reply/saveNewMSG), replyPrompt loop ~11040+ for A/D/M/F/R/L/Q/?/??/NS/translation, with wider message ops 9820–11980. Mapping only; behavior unchanged.
- Phase 0 mapping tasks: marked module mapping and Sanctuary data layout as complete; deviation inventory still pending.
- Masterplan now includes an initial deviation inventory (menu/prompt issues, screen path overreach, MCI/pause gaps, new-user flow, command mismatches, data integrity concerns). No code changes yet.
- Added Phase 1 immediate actions checklist (state/pause/menu audit, menu render call tracing, screen loader path order, doPause/menuPause after mail scan/CONF_BULL). Still doc-only; no code touched.
- Screen loader change: `getConferenceScreensCandidates` now only uses unpadded `Conf{n}` names (drops `Conf01` etc.) to avoid creating/reading padded conference dirs; Sanctuary data uses unpadded paths. No other runtime changes.
- Command handler tweak: in PROCESS_COMMAND, we now skip calling `showMenuAfterCommand` if a command already changed `session.subState` (prevents overriding states that expect a pause/return, reducing extra menu renders). Minimal change; rest of menu flow unchanged.
- Menu display alignment: `displayMainMenu` now always emits the menu prompt (even in expert mode or when MENU screen missing) and sets READ_COMMAND/READ_SHORTCUTS after the prompt; `displayMenuPrompt` no longer forces subState. This should reduce missing/duplicate prompts and better match express.e flow.
- Amiga door sessions now expose the current BBS session globally during startup (and clear it on termination) so Kickstart ROM/AEDoor.library loaders can emit red terminal warnings to the sysop when critical assets are missing.
- Menu flow tightening:
  - Removed direct `displayMainMenu` calls in chat completion/exit; now set DISPLAY_MENU + menuPause and let the display loop render.
  - Conference/message-base selection and read-command empty input now set DISPLAY_MENU (+menuPause where appropriate) without invoking displayMainMenu immediately.
  - Door exits now return to DISPLAY_MENU with menuPause to mirror express.e pause-before-menu behavior.
  - Input-handlers: After command processing, if still in PROCESS_COMMAND we now set DISPLAY_MENU + menuPause and return (no direct displayMainMenu), keeping DISPLAY_MENU as the sole render path.
- Added a centralized `notifySysop` utility and wired it into screen loading, Kickstart/AEDoor library loading, and door executable reading so any missing file or library emits a red notification directly in the BBS terminal.
- DISPLAY_MENU handler now returns immediately after displaying the menu, avoiding re-entry and extra prompts during the display flow.
- CONF_SCAN now sets menuPause before DISPLAY_CONF_BULL to retain pause-before-menu cadence like express.e.
- pauseDisplayFlow now calls doPause (was a stub), restoring express.e pauses after BULL/NODE_BULL/CONF_BULL when screens are shown.
- Next checkpoints: verify post-mail-scan/CONF_BULL pause timing (single pause/prompt), audit screen loader for stray writes (no BBS/extensionless), then move to command-level parity once menu flow is stable.

## Outstanding investigations
- Verify whether triple menu prompts are resolved after the display-flow return change; if not, trace remaining call sites that trigger `displayMainMenu` multiple times during post-mail-scan.
- Screen clearing should now precede key screens; confirm visually that AWAITSCREEN → BBSTITLE and subsequent flows no longer leak previous content.
- New user flow: ensure Enter at questionnaire (NEW_USER_SCRIPT) resumes advancing after pressing Enter on summary/realname/email/sex/age; still need to verify node script continues on blank/Enter per Sanctuary behavior.
- New user remaining: confirm sex/age proceeds into questionnaire or createAccount when no script present, and that questionnaire scripts load from node dirs; verify password rules match AmiExpress if more constraints exist (currently min 4 chars only).

## Current session (68K door/XIM focus)
- User prompt: wire the 68K door bridge with AEKIT semantics (transfer/account/NSF/ACS behaviors).
- jhMessage layout updated to include strptr/filler3 (0x108 length); parser logs new fields and exposes write helpers for string/filler3 pointers.
- IO handler honors string pointers, fixes JH_LI maxlen ordering, and adds NSF display commands (DISPLAY_FILE/CHECK_TO_DISPLAY) that route through showfile/showgfile in non-stop mode. All prompt/output handlers now pull strings from stringPtr when present.
- Transfers implemented with path resolution: ZMODEMSEND/BATCH/NETDOWNLOAD return Data=1 when any target exists (0 if none, -2 on carrier drop); RECEIVE/NETUPLOAD acknowledge destination directories and return 1 when a target path is available (no actual upload stream yet; logs a warning).
- ZMODEMSEND/BATCH/NETDOWNLOAD now stage files into the node Playpen to simulate transfers; uploads/NETUPLOAD create destination dirs and touch a unique placeholder file (Data=1 on success).
- Account/ConfDB helpers implemented: LOAD_/SAVE_/APPEND_ACCOUNT, SEARCH_ACCOUNT, LAST_ACCOUNTNUM, LOAD_/SAVE_CONFDB, GET_CONFNUM now read/write binary slots in User.data/User.keys/user.misc/Conf.DB (handles BE/LE slot numbers). APPEND seeds provided buffers with zeroed structs and a new slot; SAVE uses slot from struct or msg.data.
- System commands now read string pointers (Return/Chain/EnvStat/ACP/etc.); ACP_COMMAND is stored in bbsSession.acpCommand for host pickup. AmigaDoorSession exposes getExitState, and door.handler now captures RETURNCOMMAND/CHAIN/PRV/ACP onto the BBSSession after door completion (execution still TODO).
- Door handler now immediately auto-runs captured commands after door exit (priority CHAIN → RETURN → PRV → ACP) by invoking handleCommand with the returned strings and clearing the fields. Circular import avoided via dynamic require. Conf lookup for GET_CONFNUM now prefers ConfConfig.info entries, then Conf.DB handles, then fallback “Conference N”. ACP_COMMAND capture now includes the numeric code and target node for host-side handling.
- ACP side effects: door.handler now toggles quiet/chat and forces logoff for specific ACP codes (4 ToggleChat, 5 ExitNode, 10/11 OffHook/QuietNode). All ACP actions are recorded on session.acpLastAction for further host handling.
- Remaining gaps: transfer “streams” are still simulated via file copies/touches (no actual protocol exchange), many ACP codes remain as TODO, and pause/linecount parity may need revisit. Tests: backend `npx tsc --noEmit` currently passes.
- New backend scaffold: Socket handler now supports transfer:start/data/end/cancel events for binary upload/download over Socket.IO. Uploads write to resolved Amiga paths (defaulting to Playpen), downloads stream chunks back to the client; state is stored on session.transfer. Still needs a real client-side ZMODEM/WebSocket loop to complete end-to-end transfers.
- Additional scaffold for future ZMODEM: socket-handlers now expose a “transfer-raw” channel (start/data/end/cancel) and bypass command handling when transferRawActive is set. DOS output now has a raw callback that emits transfer-raw:echo when transferRawActive is true, and LibraryManager registers a session.serialInputHook that feeds raw buffers into dos.library’s input. There is still no true serial tap from the door—output is captured at dos.library Write (console) and input is pushed into queueInput—so this remains preparatory.

## Current session (68K door handshake rework)
- Removed all proactive AEDoor “startup” pushes: AEDoorLibrary.CreateComm no longer injects a JH_REGISTER message into the reply port, and DoorLifecycleManager no longer auto-sends startup traffic for Bulls. Doors must now initiate XIM traffic via PutMsg, matching express.e’s `Wait/GetMsg/ReplyMsg` loop.
- XIM replies now mutate the correct jhMessage fields: added `writeCommand()` to the parser and use it so JH_REGISTER sets `Command` to the line-wrap width (defaults to 79) without clobbering Data. Hotkey/quickkey/fetchkey/extHK now set `Command` to the expected port/char code, reset lineCount, and leave Data semantics aligned with express.e (carrier drop returns -1). FetchKey/ExtHK also write Command=0 when no input is present.
- Quick key/Hotkey handling now tags Command with the XIM port (console=1, serial=2 via bbsSession.logonType). Extended hotkey/fetch-key commands now carry the char code in Command to mirror express.e.
- Typecheck run after changes: `cd web/backend && npx tsc --noEmit` (pass).
- Bulls JH_REGISTER reply now writes the line length into `msg.command`, sets NodeID from the session node, and leaves Data untouched (mirrors express.e semantics) to avoid confusing doors that expect their original Data value.
- Note: user intentionally moved many door assets out of the tree (ByteKiller/FileID/etc. deletions showing in `git status`); do not restore or stage them unless requested.
- Expanded LVO trap naming: `web/backend/src/amiga-emulation/constants/lvo-map.ts` now mirrors the Exec/DOS offsets from `dev/docs/amiga68ktools-master/tools/LVOs.i`, so trap logs will show correct names across the full vector range.
- Bulls reroute disabled: PutMsg now honors the door’s chosen port instead of forcing AEDoorPort, to avoid misdelivery during JH_REGISTER.
- Bulls control block now seeds the door info message with a neutral JH_REGISTER (command=1, data=0, node=current) to match expected structure before the door populates it.
- Adjusted jhMessage length constant to 0x104 (260 bytes) to align with door-side structures seen in logs/AeDoor includes.
- Added a TS debug door (`BVDBG` / hotkey `BV`) at `web/backend/src/doors/bullview-debug`. .info registered at `Commands/BBSCmd/BVDBG.info` (Location: `web/backend/src/doors/bullview-debug/index.ts`, Type=TS) so it can be launched to log XIM traffic end-to-end without 68k uncertainty.

## Today (BVDBG/XIM host harness)
- Added `MoiraEmulator.isInitialized()` so we can guard init without resetting memory.
- XIMHostService is now an async factory that initializes Moira + Exec, creates a named `AEDoorPort<n>` (node from session), and wires `doorMessageCallback` to the real XIMProtocol so PutMsg/ReplyMsg flows mirror the Amiga path.
- BVDBG door now allocates its jhMessage via XIMHostService (shared emulator) and drives JH_REGISTER/JH_LI/JH_SHUTDOWN through hostService.transfer with parsed dumps, eliminating the “Emulator not initialized” error and keeping logging aligned with the real XIM parser.
- Typecheck: `cd web/backend && npx tsc --noEmit` (pass).
- BVDBG wrapper now imports the TS implementation directly (`Doors/BVDBG/index.ts`), so ts-node will load the updated source once the backend is restarted/reloaded.
- Bulls reply port is now a named public port (`DoorReplyPort<n>`) via `ensurePublicPort`, so PutMsg to that port triggers `doorMessageCallback` and reaches XIM handlers even when Bulls targets its own reply port.
- Bulls DoorInfo seeding now forces a sane JH_REGISTER seed: command=1, data=0, node=(session node or 1). This avoids 0xFF sentinel nodes/data causing register loops.
- XIM JH_REGISTER now mirrors express.e: only sets Command to line length and replies without altering data/node/string.
- DoorMessageHandler no longer normalizes Bulls messages; it only dumps the first five for debugging.
- Added Bulls-specific strptr fix: on JH_REGISTER we set StrPtr to the embedded string buffer (echo semantics otherwise unchanged) to avoid null pointers in doors expecting a valid string pointer.
- Bulls seed message now sets StrPtr and filler1/filler2 to the embedded string buffer in the door info block so the door starts with valid string pointers.
- BullsDoorHandler now exposes monitorPc(), and DoorLifecycleManager calls it each iteration; PC watchpoints (0x1fca, 0x22ea, 0x2308) will log PC/D0/D1 when hit to diagnose the register loop.
- Register replies now set StrPtr/filler1/filler2 to the embedded string buffer and, if node==0xFF, normalize node to the session node before replying; everything else is echoed (Command=line length). Logs `RegisterReply` with cmd/data/node/strPtr.
- DoorMessageHandler now only dumps Bulls messages (no field mutations) to mirror express.e echo behavior.
- BullsDoorHandler now installs PC watchpoints (0x1fca, 0x22ea, 0x2308) via handleIllegal hook to log PC and D0 when Bulls hits the known loop PCs, to help diagnose the register loop.

## Latest change (2025-11-25)
- Bulls aggressive handling: JH_REGISTER now forces Command=0x3ea for Bulls (or tiny Command), echoes data/node, and mirrors cmd/data/node into any known Bulls pointer buffers (info/control/handshake/nodeMirror) after ReplyMsg. Bulls logging added in ReplyMsg, loop guard raised to 200k. Typecheck run: `cd web/backend && npx tsc --noEmit` (pass).

## Next steps (68k door/Bulls)
- Re-run Bulls after backend restart; check RegisterReply and Bulls PutMsg/ReplyMsg logs. If still looping, inspect PC monitor around 0x233e/0x234c with the longer loop guard; confirm d7 becomes nonzero when we mirror into control buffers.

## Disassembly work
- Saved a clean disassembly of the tiny XIM door `Doors/GetAnswer/GetAnswer` to `disasm/GetAnswer.asm` (raw, no ANSI). This is a small specimen to study proper XIM messaging without Bulls hacks. An earlier coarse annotation exists at `disasm/GetAnswer_annotated.asm` (auto-tagged, rough).
- Next: manually trace `GetAnswer` to find its jhMessage writes (offsets around 0xdc/0xe0) and PutMsg/WaitPort/GetMsg usage; use it to align our XIM handler and remove remaining Bulls workarounds.

## Latest admin/UI work (2025-11-26)
- Added new-user defaults to system_config (security level, time/chat limits, lines per screen, expert/ANSI, protocol/screen type/editor, chat/quiet/auto-rejoin, conf access). SystemConfig API + config-app form expose them; new-user flow and /api/config/users now pick up these defaults.
- Computer Types, Screen Types, File Checkers, Languages, Protocols pages are now fully CRUD with enable toggles and modals. File Checkers include error-pattern management. Protocols page disables Y-Modem toggling and notes it is not yet implemented; default selection now clears other defaults.
- Deployment & Health page now uses authed API client; health/system/database tabs load data again.
- Batch editor: added filter/hide-comments, helper inserts (timeout/sleep/wait), validation endpoint `/api/batches/validate` (checks missing executables, known special cases), inline status per line, and CSV export of validation results.
- Added API client helpers for deployment endpoints and batch validation; config-app build and backend `tsc --noEmit` both pass.
- System Config page now auto-saves on change (debounced) with a status indicator; manual Save button removed.
- Uploads: web terminal now prompts for a file when U is pressed (opens a hidden file input) instead of aborting immediately; keeps the ZMODEM session alive until a file is chosen. Terminal build passes.
- ANSI toggle (M): now flips session/user ansi flag, persists to DB, and server filters ANSI codes when ANSI is disabled. Session ansiMode seeded from user pref at login.
- Telnet/SSH ports default to 64128/31337; startup now reads system_config unless env overrides and instantiates servers accordingly. start-servers.sh prints telnet/ssh commands. Max nodes default 255.
- Admin System Config: color scheme removed (BBS stays standard ANSI), language defaults to English/Languages, telnet/ssh defaults shown, nodes default 255.
