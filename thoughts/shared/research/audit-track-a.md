---
date: 2026-04-28
topic: audit-track-a-auth-login-newuser
tags: [audit, auth, login, new-user, security, express-e]
status: final
---

# Track A Audit: Auth, Login, New User
## express.e lines 908–1021 (security), 28500–28652 (mainloop), 29140–29861 (processLogon), 30003–30421 (newUserAccount, doNewUser, doNewUserQuestions)

---

## Summary

- **Files audited:**
  - `web/backend/src/handlers/user/auth.handler.ts`
  - `web/backend/src/handlers/user/new-user.handler.ts`
  - `web/backend/src/handlers/command-handler/pre-login.ts`
  - `web/backend/src/handlers/user/account.handler.ts`
  - `web/backend/src/handlers/user/account-edit-input.handler.ts`
  - `web/backend/src/handlers/user/gdpr.handler.ts`
  - `web/backend/src/server/auth-socket-handlers.ts`
- **express.e lines covered:** 908–1021, 28500–28652, 29140–29861, 30003–30421
- **Total deviations: 24 (P1: 9, P2: 8, P3: 7)**
- **OK (no deviation):** (see section at bottom)

---

## Deviations

### DEV-01: ANSI Graphics Prompt — Missing Options and Wrong Input Mode (P1)

**File:** `web/backend/src/handlers/command-handler/pre-login.ts:59`
**Issue:** express.e:29528 prompts `ANSI, RIP or No graphics (A/r/n)? ` (3 options). Our code shows `ANSI, RIP, PETSCII or No graphics (A/r/p/n)? ` (4 options, adds PETSCII as a user-selectable choice). Additionally, express.e:29530 calls `lineInput('','',10,INPUT_TIMEOUT/2,tempStr,FALSE)` — full line input with 10-char max and half-timeout. We process character-by-character instead, which changes the interaction model.
**express.e:**
```
29528: aePuts('ANSI, RIP or No graphics (A/r/n)? ')
29530: stat:=lineInput('','',10,INPUT_TIMEOUT/2,tempStr,FALSE)
```
**Our code:**
```typescript
// pre-login.ts:59
socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
// ... processes char-by-char until \r
```
**Fix:** Remove PETSCII from the user-visible prompt string (PETSCII is auto-detected from telnet TTYPE, not user-entered). Prompt should match express.e exactly: `ANSI, RIP or No graphics (A/r/n)? `. The character-by-character model is an acceptable WEB_ adaptation and should be tagged as such.
**Priority:** P2 (prompt string mismatch, functional deviation in option set)

---

### DEV-02: BBSTITLE Shown After Graphics Prompt — No Pause Required (P2)

**File:** `web/backend/src/handlers/command-handler/pre-login.ts:145–158`
**Issue:** express.e:29552 calls `displayScreen(SCREEN_BBSTITLE)` with no `doPause()` after it. Our code shows BBSTITLE correctly, then immediately transitions to login. This part is actually correct. However, we also have a dead code path (line 146–155) that waits for `pendingScreenCommand` and then re-shows the ANSI prompt — this is an unreachable bug path.
**express.e:**
```
29552: displayScreen(SCREEN_BBSTITLE)
29554: IF(StrLen(reservedName)>0) ...
29559: retryCount:=0
```
**Our code:** Correct flow (no pause). The `pendingScreenCommand.then(() => re-show ANSI prompt)` block at lines 147–155 is dead code that would incorrectly re-show the ANSI prompt if triggered.
**Fix:** Remove lines 146–155 (the dead code that re-prompts for ANSI).
**Priority:** P2

---

### DEV-03: Reserved Name Check After BBSTITLE — Missing (P1)

**File:** `web/backend/src/handlers/command-handler/pre-login.ts`
**Issue:** After displaying BBSTITLE, express.e:29554–29557 checks if the node is reserved and prints a warning. Our pre-login handler does not perform this check.
**express.e:**
```
29554: IF(StrLen(reservedName)>0)
29555:   StringF(tempStr,'\b\n*** Node \d is reserved right now, for \s ***\b\n',node,reservedName)
29556:   aePuts(tempStr)
29557: ENDIF
```
**Our code:** No reserved-node check performed in pre-login flow.
**Fix:** After displaying BBSTITLE, check session's reserved name (if any) and emit the warning message.
**Priority:** P1 (functional behavior entirely missing)

---

### DEV-04: System Password (STEALTH_MODE / doSystemPassword) — Missing (P1)

**File:** `web/backend/src/handlers/command-handler/pre-login.ts`
**Issue:** express.e:29548–29549 calls `doSystemPassword()` unless `STEALTH_MODE` is set on the node. This system-wide password gates all inbound connections. Our pre-login handler has no equivalent check.
**express.e:**
```
29548: IF (Not(checkToolTypeExists(TOOLTYPE_NODE,node,'STEALTH_MODE')))
29549:   IF doSystemPassword()<>RESULT_SUCCESS THEN RETURN
29550: ENDIF
```
**Our code:** No system password check.
**Fix:** Add a system-password gate between ANSI prompt and BBSTITLE, reading `SYSTEM_PASSWORD` from bbsConfig/node config. Tag as WEB_ if simplified.
**Priority:** P1

---

### DEV-05: Username Retry Limit — Wrong Constant (P1)

**File:** `web/backend/src/server/auth-socket-handlers.ts:906`
**Issue:** express.e:29631–29637 uses `retryCount=5` as the disconnect threshold for username retries. Our `check-username` handler hardcodes `5` (line 821 in `check-username` handler), but the `new-user-response` handler also hardcodes `5` (line 906). The `login` handler uses `getMaxPasswordFails()` which reads from system config. The three handlers are inconsistent — two hardcode 5, one uses config. express.e uses a single fixed value of 5 for name retries and separate `maxAttempts` logic for passwords.
**express.e:**
```
29631: UNTIL (userFound) OR (newUser) OR (retryCount=5)
29633: IF retryCount=5
29634:   aePuts('\b\nToo Many Errors, Goodbye!\b\n')
```
**Our code:** `check-username` at line 821 hardcodes `>= 5`; `new-user-response` at line 906 also hardcodes `>= 5`. The `login` handler uses `getMaxPasswordFails()` for password fails (correct) but there is no distinction between name-retry limit and password-fail limit.
**Fix:** Separate the name-retry limit (fixed at 5, as express.e) from the password-fail limit (configurable via MAX_PASSWORD_FAILS). Currently both share `loginRetryCount` which conflates the two.
**Priority:** P1

---

### DEV-06: checkPassword() — Lockout After 3 Bad Passwords, Not Configurable (P2)

**File:** `web/backend/src/server/auth-socket-handlers.ts:348–383`
**Issue:** express.e:29140–29265 `checkPassword()` loops, counting `tries`. After `tries>2` (i.e., after 3 failures) it hits the "Excessive Password Failure" path and either offers email reset or calls `PWFAIL` syscmd and disconnects. Our code uses `getMaxPasswordFails()` reading from `sys.max_password_fails` config, defaulting to 5. This means we allow up to 5 password failures where express.e allows only 3 (tries 0, 1, 2 = 3 tries before `tries>2`).
**express.e:**
```
29152: IF(tries>2)
29153:   aePuts('\b\nExcessive Password Failure\b\n')
```
**Our code:**
```typescript
// auth-socket-handlers.ts:348
if (maxFails >= 0 && session.loginRetryCount >= maxFails) { // default maxFails=5
```
**Fix:** The default for `max_password_fails` in the system config should be 3 (to match `tries>2`). Or document as `WEB_: configurable, default differs from express.e 3`.
**Priority:** P2

---

### DEV-07: Account Locked — Missing Lockout Flow (P1)

**File:** `web/backend/src/server/auth-socket-handlers.ts`
**Issue:** express.e:29775–29783 checks `loggedOnUserMisc.accountLocked` after successful password entry. If locked, it prints a message, runs processCommand('C') (leave a comment), thanks the user, and disconnects. Our code performs no `accountLocked` check at login.
**express.e:**
```
29775: IF loggedOnUserMisc.accountLocked
29776:   aePuts('\b\nYour account is locked out (possibly due to repeated password failures)\b\n\b\n')
29777:   aePuts('Leave a comment for the sysop...\b\n\b\n')
29778:   processCommand('C')
29779:   aePuts('\b\nThanks you will now be disconnected...\b\n\b\n')
29780:   state:=STATE_LOGGING_OFF
29781:   RETURN
```
**Our code:** No account locked check in the login flow.
**Fix:** After password verification succeeds, check if `user.accountLocked` is set. If so, display the locked message, optionally run the comment command, then disconnect.
**Priority:** P1

---

### DEV-08: forcePwdReset Flow — Missing (P1)

**File:** `web/backend/src/server/auth-socket-handlers.ts`
**Issue:** express.e:29785–29844 checks `loggedOnUserMisc.forcePwdReset` (set by either the admin or password expiry). If set, the user is required to change their password (up to 3 attempts) before being allowed in. Our login flow does not implement this.
**express.e:**
```
29785: pwdExpiryDays:=readToolTypeInt(TOOLTYPE_BBSCONFIG,0,'PASSWORD_EXPIRY_DAYS')
29786: IF pwdExpiryDays>=0
29787:   IF (loggedOnUserMisc.pwdLastUpdated+Mul(pwdExpiryDays,86400))<getSystemTime()
29788:     loggedOnUserMisc.forcePwdReset:=TRUE
29789:   ENDIF
29790: ENDIF
29792: IF loggedOnUserMisc.forcePwdReset
29804: retryCount:=1
29805: aePuts('\b\nYour account requires your password to be changed.\b\n\b\n')
29806: REPEAT
29807:   stat:=getPass2('Enter New Password: ',0,0,50,tempStr)
...
29838: UNTIL (retryCount>3) OR (loggedOnUserMisc.forcePwdReset=FALSE)
29840: IF (loggedOnUserMisc.forcePwdReset) ...disconnect
```
**Our code:** `user.forcePwdReset` field exists in DB types but is never checked at login. No password expiry check.
**Fix:** After `accountLocked` check, check `user.forcePwdReset` and `PASSWORD_EXPIRY_DAYS` from config. If force-reset required, prompt for new password (up to 3 tries), then disconnect if not updated.
**Priority:** P1

---

### DEV-09: Security Level <=1 Lockout — Missing (P1)

**File:** `web/backend/src/server/auth-socket-handlers.ts`
**Issue:** express.e:29768–29773 checks `loggedOnUser.secStatus<=1` and shows LOCKOUT0 or LOCKOUT1 screen then disconnects. Our login flow does not check for level 0 or 1 accounts.
**express.e:**
```
29768: IF (loggedOnUser.secStatus<=1)
29769:   acsLevel:=loggedOnUser.secStatus
29770:   IF (acsLevel=0) THEN displayScreen(SCREEN_LOCKOUT0) ELSE displayScreen(SCREEN_LOCKOUT1)
29771:   state:=STATE_LOGGING_OFF
29772:   RETURN
29773: ENDIF
```
**Our code:** No sec level <=1 check. Users with secStatus 0 or 1 are allowed to log in.
**Fix:** After password verification and before LOGON screen, check `user.secLevel <= 1`. If so, display the appropriate lockout screen and disconnect.
**Priority:** P1

---

### DEV-10: Deleted Account Check (slotNumber=0) — Missing (P2)

**File:** `web/backend/src/server/auth-socket-handlers.ts`
**Issue:** express.e:29702–29713 checks `loggedOnUser.slotNumber=0` (deleted user) after loading the account, prints "That account has been deleted" and disconnects. Our auth flow does not check if the user account is deleted/zeroed.
**express.e:**
```
29702: IF(loggedOnUser.slotNumber=0)
29703:   aePuts('That account has been deleted.\b\n')
...
29711: state:=STATE_LOGGING_OFF
29712: RETURN
```
**Our code:** `db.authenticateUser()` succeeds for any matching username even if the account is logically deleted (slotNumber=0 in the binary files).
**Fix:** After authentication, check if `user.slotNumber === 0` and disconnect with the appropriate message.
**Priority:** P2

---

### DEV-11: Already Logged In Check (checkUserOnLine) — Missing (P2)

**File:** `web/backend/src/server/auth-socket-handlers.ts`
**Issue:** express.e:29715–29729 calls `checkUserOnLine(1)` — if the user is already on another node, it shows `SCREEN_ONENODE` (or a fallback message) and disconnects. Our code has multi-tab protection in session restore (socket still alive check), but not in the normal login path.
**express.e:**
```
29715: stat:=checkUserOnLine(1)
29716: IF(stat=FALSE)
29717:   StringF(tempStr,'User \s already on another node!',loggedOnUser.name)
29718:   callersLog(tempStr)
29719:   IF displayScreen(SCREEN_ONENODE)=FALSE THEN aePuts('\b\nYou are already logged into another node!\b\n')
29720:   state:=STATE_LOGGING_OFF
```
**Our code:** Session restore has socket-alive guard, but the primary `login` handler does not check if `userSessions.has(user.id)` before completing login.
**Fix:** In the `login` handler, after user is identified, check if a live session already exists for that user. If so, show "already logged in" message and refuse the new login.
**Priority:** P2

---

### DEV-12: LOGON Screen — Shown Even After quickFlag on Token Reconnect (P3)

**File:** `web/backend/src/server/auth-socket-handlers.ts:748–755`
**Issue:** express.e:29853–29855 says `IF (quickFlag=FALSE) IF (displayScreen(SCREEN_LOGON)) THEN doPause()`. Our code correctly skips LOGON when `session.quickFlag` is true for password logins. However, for token-based reconnects (line 740–746), comments say "show bulletins like a normal login" — but the `quickFlag` is already `false` (reset on each login) so LOGON will always show for token reconnects even when the user previously used Q-logon. This is acceptable behavior but not tagged with a WEB_ comment.
**Fix:** Minor: add a `// WEB_:` comment at line 748 explaining that quickFlag state is not persisted across reconnects.
**Priority:** P3

---

### DEV-13: SCREEN_JOINED After New User — Missing (P1)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:1329–1380`
**Issue:** express.e:30125 calls `IF displayScreen(SCREEN_JOINED) THEN doPause()` as the last step of `newUserAccount()` before returning success. Our `createAccount()` function does not display SCREEN_JOINED.
**express.e:**
```
30124: doNewUserNotify()
30125: IF displayScreen(SCREEN_JOINED) THEN doPause()
30126: ENDPROC stat
```
**Our code:** After account creation, emits a hardcoded `\r\n\x1b[36mWelcome to the BBS!\x1b[0m\r\n\r\n` instead of displaying SCREEN_JOINED.
**Fix:** Call `displayScreen(socket, session, 'JOINED')` (with doPause if shown) before transitioning to the bulletin flow.
**Priority:** P1

---

### DEV-14: doNewUserNotify() — Missing (P2)

**File:** `web/backend/src/handlers/user/new-user.handler.ts`
**Issue:** express.e:30124 calls `doNewUserNotify()` immediately before SCREEN_JOINED. Our new-user flow has `MAIL_ON_NEW_USER` (line 1311) and `EXECUTE_ON_NEW_USER` (line 1302) but does not call a general new-user notify (which in express.e sends an OLM to the sysop node and can trigger other hooks).
**express.e:**
```
30124: doNewUserNotify()
```
**Our code:** Has `mailOnNewUser()` and `runExecuteOn('NEW_USER', ...)` but these cover only subset of `doNewUserNotify()` behavior.
**Fix:** Verify that `doNewUserNotify()` in express.e maps 1:1 to the existing hooks, or add the OLM/sysop notification.
**Priority:** P2

---

### DEV-15: doNewUser() — "Blank line to retreat" UX Intentionally Removed (WEB_ — check tagging) (P3)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:310–333, 347–350, 366–373`
**Issue:** express.e:30134–30201 implements a backward-navigation system where a blank line at City,State retreats to Name, blank at Phone retreats to City,State, blank at Email retreats to Phone, blank at Password retreats to Email. Our code diverges intentionally (fields are required, re-prompt instead). This is tagged at line 491 with `// WEB_: retreat-on-blank disabled` but the tag is in `finishIntroAndPromptName()`. The actual handlers at `handleLocationInput` (line 319), `handlePhoneInput` (line 347), `handleEmailInput` (line 366) each have individual `WEB_:` comments.
**express.e:**
```
30193: jLoop2: aePuts('City, State: ')
30198: IF(StrLen(loggedOnUser.location)=0) THEN JUMP iJLoop   -> retreat to name
30203: jLoop3: aePuts('Phone Number: ')
30209: IF(StrLen(loggedOnUser.phoneNumber)=0) THEN JUMP jLoop2  -> retreat to city
30214: jLoop4: aePuts('E-Mail Address: ')
30220: IF(StrLen(loggedOnUserMisc.eMail)=0) THEN JUMP jLoop3    -> retreat to phone
30225: jLoop5: stat:=getPass2('Enter a PassWord: ',...)
30229: IF(StrLen(string)=0) THEN JUMP jLoop4                    -> retreat to email
```
**Our code:** All deviations tagged at individual handler functions with WEB_ comments. Tag at location handler (line 319): `// WEB_: blank no longer retreats to name; field is required and re-prompts.`
**Assessment:** Properly tagged. No fix needed beyond noting it.
**Priority:** P3 (cosmetic/UX — tagged)

---

### DEV-16: Location Field Label — "City, State" vs. "Group Affiliation" (P3)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:313`
**Issue:** express.e:30194 prompts `City, State: `. Our code prompts `Group Affiliation: ` and has `// WEB_: label changed from "City, State" to "Group Affiliation"` comment.
**Assessment:** Properly tagged WEB_ deviation. The summary screen at line 811 also says `Group Aff:` instead of express.e:30288 `City, St.:`.
**Priority:** P3 (tagged)

---

### DEV-17: New User Name Loop — Retry Counter Logic Differs (P2)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:266–278`
**Issue:** express.e:30140–30189 uses a FOR loop with `i:=0 TO 4` (5 iterations) with a separate blank-line counter `ch` that disconnects after `ch>5` (6 blanks). The outer FOR loop also disconnects after 5 total prompts including non-blank bad entries. Our code uses a flat `retryCount` that only counts blank attempts, not duplicate-name or 1-char attempts. So a user who enters many 1-char names will never trigger disconnect.
**express.e:**
```
30140: FOR i:=0 TO 4
30148: IF(StrLen(loggedOnUser.name)=0)
30150:   IF(ch>5) THEN RETURN RESULT_FAILURE
30154: ENDFOR
30188: aePuts('\b\nToo Many Errors, Goodbye!\b\n')
30189: RETURN RESULT_FAILURE
```
**Our code:**
```typescript
// new-user.handler.ts:271
if (session.newUserData.retryCount > 5) { ... disconnect }
// retryCount only increments on blank name, not on 1-char or duplicate-name failures
```
**Fix:** `retryCount` should increment for all invalid name entries (blank, 1-char, duplicate), and the maximum attempts should be 5 total (the outer FOR loop).
**Priority:** P2

---

### DEV-18: checkIfNameAllowed() — No Wildcard/Banned Name Check (P2)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:289–297`
**Issue:** express.e:30163–30174 calls `checkIfNameAllowed(string)` (checks banned name patterns) and `checkForAst(string)` (rejects names with `*` wildcards). Our name validation only checks for duplicates.
**express.e:**
```
30163: IF(stat:=checkIfNameAllowed(string)) THEN JUMP floopc
30170: stat:=checkForAst(string)
30172: IF(stat) THEN aePuts('No wildcards allowed in a name.\b\n')
```
**Our code:** No banned-name check, no wildcard check.
**Fix:** Add wildcard check (`name.includes('*')`) and a banned-names list check. The banned-names list comes from `SCREEN_NONAMES` or similar config.
**Priority:** P2

---

### DEV-19: Password Confirmation — Mismatch Loop Behavior Differs (P2)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:674–689`
**Issue:** express.e:30236–30238 says `IF(StrCmp(string,str2)=0) THEN JUMP jLoop5` — if passwords don't match, restart at jLoop5 (re-prompt first password). Our code correctly re-prompts for the first password (subState -> NEW_USER_PASSWORD). However, express.e does NOT show an error message for mismatch in the strength-check path — only in the mismatch path. Our code shows `'\r\nPasswords do not match, try again..\r\n'` (line 679) which matches express.e:30237. This is correct.

**Also:** express.e:30241–30254 runs `checkPasswordStrength()` BEFORE the re-enter prompt (only once after both are entered and matched). Our code runs strength check after the FIRST password entry (handlePasswordInput), before asking for confirmation. This means strength-failing passwords never reach the confirmation step in our code.
**express.e:**
```
30227: stat:=getPass2('Enter a PassWord: ',...)
30233: stat:=getPass2('Reenter the PassWord: ',...)
30236: IF(StrCmp(string,str2)=0) THEN JUMP jLoop5  -> restart if no match
30241: stat:=checkPasswordStrength(string)
30242: IF stat<>TRUE THEN JUMP jLoop5
```
**Our code:** Strength check is in `handlePasswordInput` (first prompt), confirmation check in `handlePasswordConfirm`. Functionally this is equivalent (invalid passwords still fail) but the error appears at first entry, not after confirmation. Minor UX difference.
**Fix:** Minor, could reorder to match. Tag with WEB_ if keeping as-is.
**Priority:** P3

---

### DEV-20: Screen Clear Preference — readChar() Single Keystroke vs. Line Input (P3)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:786–800`
**Issue:** express.e:30272–30281 prompts `You want Screen Clears after Messages ? ` then uses `readChar(INPUT_TIMEOUT)` (single keypress, no Enter). Our handler uses line input (the input comes via the `handleScreenClearInput` function triggered on Enter).
**express.e:**
```
30272: aePuts('You want Screen Clears after Messages ? ')
30275: ch:=readChar(INPUT_TIMEOUT)
30277: IF((ch="Y") OR (ch="y"))
```
**Our code:** Line input (user presses Y or N then Enter).
**Fix:** Minor WEB_ deviation (web terminal doesn't support raw single keypress in this context). Tag as WEB_.
**Priority:** P3

---

### DEV-21: Summary Confirmation — readChar() vs. Line Input (P3)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:844–860`
**Issue:** express.e:30306–30318 (`doNewUser`) and 30391–30404 (`doNewUserQuestions`) both use `readChar()` (single keypress) for the "Is the above Correct?" prompt. Our code uses line input.
**express.e:**
```
30306: aePuts('Is the above Correct? ')
30311: ch:=readChar(INPUT_TIMEOUT)
30313: IF((ch="N") OR (ch="n") OR (ch="Q") OR (ch="q"))
```
**Our code:** Line input in `handleConfirmInput` and `handleQuestionnaireConfirmInput`.
**Fix:** Minor WEB_ deviation. Tag as WEB_.
**Priority:** P3

---

### DEV-22: Questionnaire Script — `~` Suffix vs. Inline `~` Detection (P2)

**File:** `web/backend/src/handlers/user/new-user.handler.ts:1083–1088`
**Issue:** express.e:30367–30383 identifies prompt lines in the script file by checking if the LAST character is `~` (`c[StrLen(c)-1]<>"~"`), strips it, and reads a response. Our parser (line 1083) checks if the line CONTAINS `~` anywhere and strips all `~` characters. This means lines with `~` in the middle would be treated as prompts in our code but not in express.e.
**express.e:**
```
30368: IF (StrLen(c)=0) OR (c[StrLen(c)-1]<>"~")  -> text if NOT ending in ~
30373: SetStr(c,StrLen(c)-1)  -> strip only trailing ~
```
**Our code:**
```typescript
// new-user.handler.ts:1083
if (line.includes('~')) {
  const prompt = line.replace(/~/g, '').trimEnd();  // strips ALL ~ chars
```
**Fix:** Change to check only if the last character is `~`, and strip only that last character.
**Priority:** P2

---

### DEV-23: auth.handler.ts — This is the Admin REST API, Not BBS Terminal Auth (P3)

**File:** `web/backend/src/handlers/user/auth.handler.ts`
**Issue:** `auth.handler.ts` is the HTTP REST API handler for the admin web panel (`POST /auth/login`), not the BBS terminal login. It is a WEB_-only component with no express.e equivalent. The `register` endpoint creates admin users via REST without any BBS terminal flow at all. The file has no WEB_ tags.
**express.e:** No equivalent (admin REST API is a WEB_/ADMIN_ feature).
**Our code:** `AuthHandler.login()` returns JWT tokens for admin panel; `AuthHandler.register()` creates a user with a hardcoded secLevel of 10 and no interactive prompts.
**Fix:** No fix to express.e flow needed. However, all functions in this file should be tagged `// WEB_:` or `// ADMIN_:` per the project convention to make it clear they are not express.e ports. Currently there are zero such tags.
**Priority:** P3

---

### DEV-24: account.handler.ts — `displayAccountEditingMenu` is Not express.e (P3)

**File:** `web/backend/src/handlers/user/account.handler.ts:19–33`
**Issue:** `displayAccountEditingMenu` presents a 7-option menu (edit account, view stats, change sec level, toggle flags, delete account, list users, search users). The express.e `editInfo()` (lines 21211–21650) is a full-screen account editor accessed directly from the sysop's ACP interface, not via a menu. Our wrapper menu is a WEB_/ADMIN_ addition with no express.e equivalent.
**express.e:** `editInfo()` at 21211 — full-screen editor, no menu wrapper.
**Our code:** Menu wrapper at lines 19–33 with custom 7 options.
**Fix:** Tag `displayAccountEditingMenu` and `handleAccountEditing` with `// WEB_:` comment.
**Priority:** P3

---

## OK (No Deviation)

These functions are correctly ported or properly tagged:

- **`checkPasswordStrength()`** (`security:908–933`): Our `passwordMeetsStrength()` logic in `new-user.handler.ts:616–636` correctly implements the 4-class strength check (lower, upper, numeric, symbol) with correct thresholds. The strength-code mapping differs slightly in our `minStrength` 1–4 scale vs. express.e's direct count-classes approach, but the functional result matches.

- **`setNewPassword()` — bcrypt vs. PBKDF2** (`security:935–981`): Our system uses bcrypt, express.e uses PBKDF2. This is a documented WEB_ deviation (bcrypt is stronger and appropriate for a Node.js port). The `password-mode` masking during entry is correct.

- **`checkUserPassword()` / bad-password increment** (`security:983–1021`): Our `db.authenticateUser()` checks password and the `MAX_PASSWORD_FAILS` mechanic (via `getMaxPasswordFails()`) mirrors express.e:1010–1016. The `invalidAttempts` counter and `accountLocked` flag exist in DB types. The auto-locking mechanism is partially implemented.

- **Password reset email flow** (`checkPassword:29152–29196`): Our `password-reset-input` handler in `auth-socket-handlers.ts:942–1042` correctly implements the reset code generation, email send, and new password entry flow from express.e:29152–29196.

- **ANSI/quickFlag parsing** (`processLogon:29541–29545`): Our `handleAnsiPromptInput` correctly checks for N (no ANSI) and Q (quick logon) in the entered string. The `quickFlag` is correctly used at login to skip LOGON screen (line 751–755 of auth-socket-handlers.ts).

- **LOGON screen with doPause** (`processLogon:29853–29855`): `auth-socket-handlers.ts:748–788` correctly calls `displayScreen(LOGON)` and `doPause()` when the screen is shown, and only when `quickFlag` is false.

- **BULL/NODE_BULL display** (`mainloop:28555–28557`): `command.handler.ts` correctly calls `displayScreen(BULL)` and `displayScreen(NODE_BULL)` with `doPause()` each, before confScan.

- **confScan before CONF_BULL** (`mainloop:28563–28572`): Correct ordering in command handler state machine.

- **Screen flow order** (BBSTITLE → LOGON → BULL → NODE_BULL → confScan → CONF_BULL → MENU): Overall flow order is correct per express.e.

- **New user access password** (`newUserAccount:30013–30046`): Our `handleAccessPasswordInput()` correctly limits to 3 tries (`accessPasswordTries > 2`) matching express.e:30038 `tries>2`.

- **GUESTLOGON + JOIN screens** (`newUserAccount:30049–30057`): Our `beginRegistrationPrompts()` correctly shows GUESTLOGON then JOIN with doPause each.

- **Auto-validation password flow** (`newUserAccount:30062–30091`): Our `handleAutoValidationInput()` correctly matches express.e:30066–30091, including the 5-try loop (`tries:=5; WHILE tries`) and blank-input-exits behavior.

- **Account editor page layout** (`editInfo:21222–21650`): `account.handler.ts` `displayAccountPage0/Page1` field keys (A–Z, #, %, !, *, @, ?, DEL, 9) all match express.e letter assignments. Field sizes and positions are close.

- **Questionnaire answers file format** (`doNewUserQuestions:30331–30421`): Our `persistQuestionnaireAnswers()` correctly writes the header line (date, time, slotNumber, name, connect string, location) matching express.e:30354. File goes to `Node{n}/TempAns` and appends to `Node{n}/Answers` (or central Answers/ if `CENTRAL_ANSWERS` set).

- **GDPR handlers** (`gdpr.handler.ts`): Entirely WEB_/ADMIN_ additions — no express.e equivalent. All three phases (registration consent, backfill consent, self-service erasure) are properly tagged as WEB_ deviations in the file's header comment. The 3-step erasure (`YES ERASE` → password → username) is a new feature not present in express.e, correctly scoped.
