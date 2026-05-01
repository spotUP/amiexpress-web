---
date: 2026-04-28
topic: audit-track-b-mainloop-menu-command-dispatch
tags: [audit, mainloop, menu, command-dispatch, deviation]
status: final
---

# Track B Audit: Main Loop, Menu, Command Dispatch

## Summary

### Functions Checked
| Function | express.e lines | Status |
|---|---|---|
| `processCommand` (main dispatch) | 28229–28256 | DEVIATED |
| `processInternalCommand` | 28285–28402 | DEVIATED (2 bugs) |
| `displayMenuPrompt` | 28404–28423 | DEVIATED (2 bugs) |
| `SUBSTATE_DISPLAY_MENU` block | 28582–28603 | DEVIATED (3 bugs) |
| `SUBSTATE_READ_SHORTCUTS` block | 28604–28620 | DEVIATED |
| `SUBSTATE_PROCESS_COMMAND` block | 28639–28648 | DEVIATED |
| `runCommand` (BBSCMD/SYSCMD file lookup) | 4614–4679 | CORRECT |
| `runBbsCommand` | 4807–4811 | CORRECT |
| `runSysCommand` | 4813–4817 | CORRECT |
| `internalCommandG` (logoff) | 25047–25069 | DEVIATED |
| `internalCommandX` (expert toggle) | 26113–26121 | CORRECT |
| `internalCommandWHO/WHD` | 26094–26111 | DEVIATED |
| `internalCommandQuestionMark` | 24594–24599 | CORRECT |
| Logoff screen sequence | 8185–8191 | NOT VERIFIED (out of scope) |

### Deviations Found
| ID | Priority | Function |
|---|---|---|
| B-01 | P1 | `processCommand` — `allowsyscmd` parameter not forwarded, SYSCMD always tried |
| B-02 | P1 | `SUBSTATE_DISPLAY_MENU` — missing `checkTimeUsed()` after `updateTimeUsed()` |
| B-03 | P1 | `SUBSTATE_DISPLAY_MENU` — missing `checkOnlineStatus()` carrier-drop gate |
| B-04 | P1 | `SUBSTATE_PROCESS_COMMAND` — on `NOT_ALLOWED` goes to `DISPLAY_CONF_BULL` not `DISPLAY_MENU` |
| B-05 | P2 | `processInternalCommand` — duplicate `case "Q"` (dead code, wrong handler wins) |
| B-06 | P2 | `processInternalCommand` — `WHO` command removed from internal dispatch |
| B-07 | P2 | `displayMenuPrompt` — `menuPrompt` custom conference prompt (MENU_PROMPT tooltype) not implemented |
| B-08 | P2 | `displayMenuPrompt` — prompt text "mins left" vs original "mins. left" |
| B-09 | P2 | `SUBSTATE_READ_SHORTCUTS` — `processMci(string)` call missing; shortcut translated string not MCI-processed |
| B-10 | P3 | `SUBSTATE_DISPLAY_MENU` — debounce timer (500 ms) is an untagged `WEB_` deviation |
| B-11 | P3 | `processInternalCommand` — `higherAccess()` on `RESULT_NOT_ALLOWED` missing in `command-handler/core.ts` path |
| B-12 | P3 | `internalCommandG` — logoff via `DISPLAY_CONF_BULL` on error path (minor, cosmetic) |

---

## DEV-B-01 — processCommand: allowsyscmd Parameter Not Forwarded (P1)

**File**: `web/backend/src/handlers/command-handler/core.ts:139–177` and `command-processing.ts:49–84`

**Issue**: express.e `processCommand()` accepts an `allowsyscmd` parameter (default FALSE). When called from the main menu loop (express.e:28646), `allowsyscmd` is FALSE — meaning SYSCMD is NOT tried from the interactive menu. Only when the BBS internally calls `processCommand(...,TRUE,...)` (e.g., from doors, auto-scan) is SYSCMD attempted as the first pass. Our `processCommand()` always tries SYSCMD first, unconditionally.

**express.e (28229–28255)**:
```
PROC processCommand(cmdtext,allowsyscmd=FALSE, subtype=-1)
  ...
  -> try running it as a bbscommand first
  IF (subtype<SUBTYPE_INTCMD)
    IF allowsyscmd
      IF (res:=runSysCommand(...))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
      IF res=RESULT_NOT_ALLOWED THEN RETURN res
    ENDIF
    IF (res:=runBbsCommand(...))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
    ...
  ENDIF
ENDPROC processInternalCommand(cmdcode,cmdparams)
```
When called from the main loop (line 28646): `processCommand(commandText)` — no `allowsyscmd`, so it defaults to FALSE. SYSCMD block is skipped entirely from interactive menu input.

**Our code (core.ts:151–175)**:
```typescript
// Always tries SYSCMD first — no allowsyscmd gating
const sysResult = await runSysCommand(socket, session, command, params);
if (sysResult === "SUCCESS") { ... }
if (sysResult === "NOT_ALLOWED") { ... }
// Then tries BBSCMD
const bbsResult = await runBbsCommand(socket, session, command, params);
```

**Fix**: Add `allowSysCmd: boolean = false` parameter to `processCommand`. When false (interactive menu), skip the SYSCMD attempt entirely. Only internal calls (door auto-launch, `processSysCommand`) should pass `true`.

---

## DEV-B-02 — SUBSTATE_DISPLAY_MENU: Missing checkTimeUsed() (P1)

**File**: `web/backend/src/handlers/command-handler/menu.ts:116–128`

**Issue**: express.e calls both `updateTimeUsed()` AND `checkTimeUsed()` in sequence inside the `SUBSTATE_DISPLAY_MENU` block. `checkTimeUsed()` enforces time limit expiry and sets `reqState:=REQ_STATE_LOGOFF` if the user is out of time. Our `displayMainMenu()` calls `updateTimeUsed()` (line 118) but never calls `checkTimeUsed()`.

**express.e (28591–28592)**:
```
updateTimeUsed()
checkTimeUsed()
```

**Our code (menu.ts:116–121)**:
```typescript
updateTimeUsed(socket, session);
// checkTimeUsed() is NOT called — time limit never enforced at menu redisplay
setEnvStat(session, EnvStat.IDLE);
displayMenuPrompt(socket, session);
```

**Fix**: After `updateTimeUsed()`, call `checkTimeUsed(socket, session)`. If it sets `reqState=LOGOFF`, abort the menu display.

---

## DEV-B-03 — SUBSTATE_DISPLAY_MENU: Missing checkOnlineStatus() carrier gate (P1)

**File**: `web/backend/src/handlers/command-handler/menu.ts:70–130`

**Issue**: express.e checks carrier status after displaying the menu (`checkOnlineStatus()<>RESULT_SUCCESS THEN reqState:=REQ_STATE_LOGOFF`) before proceeding to prompt. This is the mechanism that detects a dropped connection at menu time and triggers clean logoff. Our `displayMainMenu()` does not call `checkOnlineStatus()` anywhere.

**express.e (28589–28590)**:
```
doorExpertMode:=FALSE
aePuts('\b\n')
IF checkOnlineStatus()<>RESULT_SUCCESS THEN reqState:=REQ_STATE_LOGOFF
updateTimeUsed()
```

**Our code (menu.ts)**: No `checkOnlineStatus()` call anywhere in `displayMainMenu()`.

**Fix**: After emitting the `\r\n` separator and before calling `updateTimeUsed()`, call `checkOnlineStatus()`. If it returns a failure code, set `reqState=LOGOFF` equivalent and return early.

---

## DEV-B-04 — SUBSTATE_PROCESS_COMMAND: NOT_ALLOWED Goes to Wrong State (P1)

**File**: `web/backend/src/handlers/command-handler/input-handlers.ts:619–635`

**Issue**: In express.e `processInternalCommand()` (line 28400), when a command returns `RESULT_NOT_ALLOWED`, `higherAccess()` is called and then the loop continues to the next state iteration — which is `SUBSTATE_DISPLAY_MENU` (line 28648: `menuPause:=TRUE; subState:=SUBSTATE_DISPLAY_MENU`). In our code, when `processCommand` returns `"NOT_ALLOWED"`, we set `subState = DISPLAY_CONF_BULL` and `menuPause = false`. This skips the menu display entirely and jumps back to the conference bulletin display.

**express.e (28639–28648)**:
```
SUBSTATE_PROCESS_COMMAND:
  UpperStr(commandText)
  processCommand(commandText)   -> any result
  menuPause:=TRUE
  subState:=SUBSTATE_DISPLAY_MENU  -> always goes to menu
```
`processInternalCommand` (28400) calls `higherAccess()` on NOT_ALLOWED but still returns, and the parent returns back to the loop, which unconditionally sets `SUBSTATE_DISPLAY_MENU`.

**Our code (input-handlers.ts:617–635)**:
```typescript
const result = await processCommand(socket, session, commandText, "");
if (result === "NOT_ALLOWED") {
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;  // WRONG
  return;
}
```

**Fix**: After any command result (including NOT_ALLOWED), always set `session.menuPause = true; session.subState = DISPLAY_MENU`. Do not short-circuit to `DISPLAY_CONF_BULL` on `NOT_ALLOWED`. The `higherAccess()` error message is shown by the internal command dispatch, not by the main loop state machine.

---

## DEV-B-05 — processInternalCommand: Duplicate "Q" Case (P2)

**File**: `web/backend/src/handlers/command-handler/command-execution.ts:254, 424`

**Issue**: There are two `case "Q":` entries in the `processBBSCommand` switch statement. In JavaScript/TypeScript, the second `case "Q"` is unreachable dead code — the first one always wins. The first (`line 254`) calls `handleQuietCommand` from the OLM handler. The second (`line 424`) calls `handleQuietModeCommand` from system-commands. These may be different implementations. The correct one per express.e:25504 is the unified `internalCommandQ()` that toggles `quietFlag` and sends it to all nodes.

**express.e (25504–25516)**:
```
PROC internalCommandQ()
  IF checkSecurity(ACS_QUIET_NODE)
    quietFlag:=Not(quietFlag)
    sendQuietFlag(quietFlag)
    IF(quietFlag)
      aePuts('\b\nQuiet Mode On\b\n')
    ELSE
      aePuts('\b\nQuiet Mode Off\b\n')
    ENDIF
  ELSE
    RETURN RESULT_NOT_ALLOWED
  ENDIF
ENDPROC RESULT_SUCCESS
```

**Our code**: Two handlers, one of which is dead code. Which implementation (handleQuietCommand vs handleQuietModeCommand) is the correct one is a separate question, but the duplicate is definitely wrong.

**Fix**: Remove the second `case "Q"` (line 424). Verify that the surviving handler (`handleQuietCommand`) is the 1:1 port of `internalCommandQ()`.

---

## DEV-B-06 — processInternalCommand: WHO Command Removed (P2)

**File**: `web/backend/src/handlers/command.handler.ts:3986–3989`

**Issue**: `WHO` is a legitimate internal command in express.e (`internalCommandWHO` at line 26094). It checks `ACS_WHO_IS_ONLINE` security and calls `who(0)`. This command was intentionally removed from the internal dispatch in our code (commented out with the note "WHO command removed - should use BBSCMD door instead"). This is a silent deviation from express.e — WHO is both a built-in internal command AND potentially overrideable by a BBSCMD door (since BBSCMD is checked before internal, the door takes priority when present). Removing the internal fallback breaks WHO for systems without a WHO door installed.

**express.e (26094–26102)**:
```
PROC internalCommandWHO()
  IF (checkSecurity(ACS_WHO_IS_ONLINE) AND (sopt.toggles[TOGGLES_MULTICOM]<>0))
    setEnvStat(ENV_DOORS)
    who(0)
  ELSE
    RETURN RESULT_NOT_ALLOWED
  ENDIF
ENDPROC RESULT_SUCCESS
```

**Our code (`command.handler.ts:3986–3989`)**:
```typescript
// WHO command removed - should use BBSCMD door instead (WHO.info  DOORS:RTW/RTW)
// case 'WHO': // Node Information (internalCommandWHO) - express.e:26094-26103
//   handleWhoCommand(socket, session);
```
No `WEB_:` tag. Silent deviation.

**Fix**: Restore the `case 'WHO':` and `case 'WHD':` internal commands. Tag the comment with `// WEB_: fallback only when no WHO BBSCMD is present`. `handleWhoCommand` and `handleWhoDetailedCommand` are already imported.

---

## DEV-B-07 — displayMenuPrompt: Custom menuPrompt (MENU_PROMPT tooltype) Not Implemented (P2)

**File**: `web/backend/src/handlers/command-handler/menu.ts:136–204`

**Issue**: In express.e, `displayMenuPrompt()` first checks if `menuPrompt` (a string populated from the conference's `MENU_PROMPT` tooltype in `joinConf`) is non-empty. If so, it resets colors, processes the string through the MCI engine, and appends a space — completely replacing the standard prompt. Our `displayMenuPrompt()` always generates the standard formatted prompt and ignores any conference-level custom prompt.

**express.e (28409–28413)**:
```
IF StrLen(menuPrompt)>0
  aePuts('[0m')
  processMci(menuPrompt)
  aePuts(' ')
ELSE
  ...standard prompt...
ENDIF
```

**Our code (menu.ts:155–204)**: No check for `session.menuPrompt`. Always renders the standard `bbsName [confNum:confName] Menu (N mins left): ` format.

**Fix**: Check `session.menuPrompt` (populated during `joinConf` from `MENU_PROMPT` tooltype). If non-empty, emit `\x1b[0m` + process through MCI engine + emit ` ` space, instead of the standard prompt.

---

## DEV-B-08 — displayMenuPrompt: Prompt Text "mins left" vs "mins. left" (P2)

**File**: `web/backend/src/handlers/command-handler/menu.ts:195, 200`

**Issue**: The exact prompt string in express.e uses "mins. left" (with a period after "mins"). Our code uses "mins left" (without the period). This is a byte-level text deviation visible to users.

**express.e (28417, 28419)**:
```
StringF(mPrompt,'[0m[35m\s [0m[[36m\d[34m:[36m\s[0m] Menu ([33m\d[0m mins. left): ',...
```
Note: "mins. left"

**Our code (menu.ts:195, 200)**:
```typescript
`\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `
```
Note: "mins left" — missing the period.

**Fix**: Change "mins left" to "mins. left" in both the single-msgbase and multi-msgbase prompt strings.

---

## DEV-B-09 — SUBSTATE_READ_SHORTCUTS: processMci() Call Missing (P2)

**File**: `web/backend/src/handlers/command-handler/input-handlers.ts:581–601`

**Issue**: In express.e `SUBSTATE_READ_SHORTCUTS` (line 28617–28618), after calling `translateShortcut(temp,string)`, the translated string is passed through `processMci(string)` before being used. `processMci` is the MCI expansion engine — the shortcut value can contain MCI codes like `~CC_V SCREEN` that should be expanded/executed. Our `handleReadShortcuts()` function calls `translateShortcut()` and then directly calls `processCommand()` on the result, skipping the `processMci()` expansion entirely.

**express.e (28617–28620)**:
```
translateShortcut(temp,string)
processMci(string)
menuPause:=FALSE
subState.subState:=SUBSTATE_DISPLAY_MENU
```

**Our code (input-handlers.ts:583–587)**:
```typescript
const translated = translateShortcut(session, data);
if (translated && translated.length > 0) {
  const { processCommand } = require("./core");
  await processCommand(socket, session, translated, "");  // No processMci
}
```

**Fix**: Before calling `processCommand`, pass the translated string through the MCI processing engine (equivalent of `processMci`). This is important for shortcut mappings that use MCI commands.

---

## DEV-B-10 — displayMainMenu: Debounce Timer is an Untagged WEB_ Deviation (P3)

**File**: `web/backend/src/handlers/command-handler/menu.ts:38–44`

**Issue**: `displayMainMenu()` and `displayMenuPrompt()` both contain a 500ms debounce guard that silently suppresses duplicate calls. This has no express.e equivalent and is a pure web implementation workaround. It is not tagged with `// WEB_:` per project rules.

**express.e**: No debounce exists. The state machine is single-threaded and event-driven; duplicate display simply does not occur.

**Our code (menu.ts:39–44)**:
```typescript
const lastMenuTime = (session as any)._lastMainMenuTime || 0;
if (now - lastMenuTime < 500 && !forceMenuDisplay) {
  console.log('[menu] displayMainMenu SKIPPED (debounce...)');
  return;
}
```

**Fix**: Add `// WEB_: debounce to handle async race conditions — no express.e equivalent` tag. The underlying race condition causing duplicate display should ideally be fixed at the state machine level.

---

## DEV-B-11 — processCommand/processInternalCommand: higherAccess() Message Missing (P3)

**File**: `web/backend/src/handlers/command-handler/core.ts:173–176` and `command-handler/command-execution.ts:560–563`

**Issue**: In express.e, when `processInternalCommand` returns `RESULT_NOT_ALLOWED` AND `privcmd=FALSE` (i.e., called from the interactive menu), `higherAccess()` is called: `aePuts('\b\nCommand requires higher access.\b\n')`. In our fallback path (the `default` branch of `processBBSCommand`), when a command is unknown, we emit `"Unknown command: {command}"` instead. The `processCommand` wrapper in `core.ts` does not call a `higherAccess()` equivalent when `NOT_ALLOWED` is returned from internal commands.

**express.e (28400)**:
```
IF ((res=RESULT_NOT_ALLOWED) AND (privcmd=FALSE)) THEN higherAccess()
```
and `higherAccess()` (3037–3039):
```
aePuts('\b\nCommand requires higher access.\b\n')
```

**Our code**: When an internal command returns `NOT_ALLOWED`, the `command-processing.ts:processCommand` returns `"NOT_ALLOWED"` to `handleProcessCommand` in `input-handlers.ts`, which sets `DISPLAY_CONF_BULL` (see DEV-B-04) but never emits the "Command requires higher access." message.

**Fix**: After the internal command dispatch returns `RESULT_NOT_ALLOWED` (when not called as a privileged command), emit `\r\nCommand requires higher access.\r\n`. This is a separate fix from DEV-B-04.

---

## DEV-B-12 — processInternalCommand Default Case: Wrong Error Text in Refactored Path (P3)

**File**: `web/backend/src/handlers/command-handler/command-execution.ts:563`

**Issue**: The fallback/default branch of `processBBSCommand` emits `"Unknown command: {command}"` — a web-style message. The original express.e text is `'\b\nNo such command!!  Use ''?'' for command list.\b\n\b\n'`. The main `command.handler.ts` (line 4203) uses the correct text, but the refactored `command-execution.ts` used by the modular command handler path uses the wrong text.

**express.e (28396–28398)**:
```
ELSEIF privcmd=FALSE
  aePuts('\b\nNo such command!!  Use ''?'' for command list.\b\n\b\n')
```

**Our code (command-execution.ts:563)**:
```typescript
socket.emit("ansi-output", `\r\nUnknown command: ${command}\r\n`);
```

**Fix**: Change the error text to `\r\nNo such command!!  Use '?' for command list.\r\n\r\n` to match express.e exactly.

---

## Functions That Are Correct

- `runCommand()` (4614–4679): BBSCMD/SYSCMD file lookup priority (CONFCMD > NODECMD > BBSCMD) is correctly implemented in `command-execution.handler.ts`.
- `runBbsCommand()` (4807–4811): Correctly delegates to `runCommand(CMDTYPE_BBSCMD, ...)`.
- `runSysCommand()` (4813–4817): Correctly delegates to `runCommand(CMDTYPE_SYSCMD, ...)`.
- `translateShortcut()` (28434–28466): Key code mapping (RET/DEL/BACK/TAB/ESC/SPACE) correctly implemented in `input-handlers.ts:187–220`.
- `internalCommandX()` (26113–26121): Expert mode toggle correctly implemented.
- `internalCommandQuestionMark()` (24594–24599): Only shows menu when `expert="X"`, correctly gated.
- `processCommand` command/params splitting: Space-split into cmdcode + cmdparams is correctly done via `const parts = normalized.split(/\s+/)` pattern.
- `processInternalCommand` command table: All 40+ commands from express.e (28288–28395) are present in `processBBSCommand` switch (modulo the WHO omission and Q duplicate bugs above).
- `SUBSTATE_DISPLAY_CONF_BULL`: `joinConf` + `loadFlagged` + `menuPause=true` sequence is correct.
- `SUBSTATE_READ_COMMAND`: Line input → `PROCESS_COMMAND` transition is correct.
- `SUBSTATE_DISPLAY_BULL`: `displayScreen(SCREEN_BULL)` + `doPause()` + `displayScreen(SCREEN_NODE_BULL)` + `doPause()` + `confScan()` sequence is correct.
- ACS check in `runCommand`: `access=0 → RETURN TRUE` shortcut is correctly implemented.
- Password-protected commands: `PASSWORD` tooltype check, prompt, StriCmp validation is correctly implemented in `handleCommandPasswordInput()`.
