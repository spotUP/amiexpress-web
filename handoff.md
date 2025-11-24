# Handoff Summary

- **Focus:** Fix backend command flows so prompts clear correctly and commands return to the menu without extra keypresses. Sanctuary data must stay untouched.
- **Harness status:** `dev/scripts/test-all-commands.ts` was tweaked but remains flaky; manual testing is preferred now.
- **Manual issues to fix:**
  - `F`, `FR`: scroll the file list without a “Press any key”; should prompt and return to the menu.
  - `FS`, `N`, `VER`, `WHD`: block until Enter with no prompt; should print summary, prompt, and return to menu.
  - `T`: shows time then requires extra Enters; should prompt once and return to a single menu prompt.
  - `S`: currently inline stats; should be overridden by the userstats door (or still return cleanly to menu).
  - `?`: only says “Expert menu refreshed”; should show the help list and return to menu.
  - `X`: toggles expert but the menu doesn’t redraw; should show on/off message and return to menu.
  - `W`: works but needs two Enters to exit; should prompt once and return.
  - `WHO`: launches the door but 68k emu isn’t complete; either finish glue or show a simple list and return.
- **Partial code changes in progress:**
  - `web/backend/src/handlers/file-listing.handler.ts`: now resets `menuPause`, sets `subState` to DISPLAY_MENU, and emits a press-key prompt after F/FR listings.
  - `web/backend/src/handlers/info-commands.handler.ts`: VER now shows a press-key prompt and returns to menu; WHO/WHD need similar prompt/return adjustments (not fully patched yet).
- **Next steps when resuming:**
  1) Ensure WHO/WHD output includes a press-key prompt and sets `subState` to DISPLAY_MENU.
  2) Add press-key + menu return for FS, N (in file.handler.ts/navigation-commands), and time handler (T).
  3) Replace S with the userstats door invocation or at least ensure it returns to the menu.
  4) Update ? to display the help list, not “Expert menu refreshed”.
  5) Redraw the menu after X toggles expert mode.
  6) If WHO door remains incomplete, stub a simple list that returns cleanly.

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
- Menu flow tightening:
  - Removed direct `displayMainMenu` calls in chat completion/exit; now set DISPLAY_MENU + menuPause and let the display loop render.
  - Conference/message-base selection and read-command empty input now set DISPLAY_MENU (+menuPause where appropriate) without invoking displayMainMenu immediately.
  - Door exits now return to DISPLAY_MENU with menuPause to mirror express.e pause-before-menu behavior.
- Input-handlers: After command processing, if still in PROCESS_COMMAND we now set DISPLAY_MENU + menuPause and return (no direct displayMainMenu), keeping DISPLAY_MENU as the sole render path.
- DISPLAY_MENU handler now returns immediately after displaying the menu, avoiding re-entry and extra prompts during the display flow.
- CONF_SCAN now sets menuPause before DISPLAY_CONF_BULL to retain pause-before-menu cadence like express.e.
- pauseDisplayFlow now calls doPause (was a stub), restoring express.e pauses after BULL/NODE_BULL/CONF_BULL when screens are shown.
- Next checkpoints: verify post-mail-scan/CONF_BULL pause timing (single pause/prompt), audit screen loader for stray writes (no BBS/extensionless), then move to command-level parity once menu flow is stable.

## Outstanding investigations
- Verify whether triple menu prompts are resolved after the display-flow return change; if not, trace remaining call sites that trigger `displayMainMenu` multiple times during post-mail-scan.
- Screen clearing should now precede key screens; confirm visually that AWAITSCREEN → BBSTITLE and subsequent flows no longer leak previous content.
- New user flow: ensure Enter at questionnaire (NEW_USER_SCRIPT) resumes advancing after pressing Enter on summary/realname/email/sex/age; still need to verify node script continues on blank/Enter per Sanctuary behavior.
- New user remaining: confirm sex/age proceeds into questionnaire or createAccount when no script present, and that questionnaire scripts load from node dirs; verify password rules match AmiExpress if more constraints exist (currently min 4 chars only).
