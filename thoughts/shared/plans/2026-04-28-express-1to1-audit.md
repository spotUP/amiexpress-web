---
date: 2026-04-28
topic: express-1to1-audit
tags: [audit, express.e, compliance, 1:1]
status: draft
---

# AmiExpress 1:1 Compliance Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every TypeScript handler file against the full AmiExpress source tree and fix every deviation from the canonical 1:1 implementation.

**Architecture:** Two-phase approach. Phase 1 runs 8 parallel read-only research agents that each audit a subsystem and produce a deviation report in `thoughts/shared/research/audit-<track>.md`. Phase 2 works through the prioritized fix list sequentially, committing after each fix.

**Tech Stack:** TypeScript, express.e (MCP via `search_express_source` / `read_express_module` / `read_source_range`), direct file reads for MiscFuncs.e / axobjects.e / axconsts.e / zmodem.e / tooltypes.e / qwk.e from `AmiExpress-Sources/`.

---

## Source Files Reference

| Source | Path / MCP key | Lines | Content |
|--------|----------------|-------|---------|
| express.e | MCP `express-e` | 32,248 | Main BBS application |
| MiscFuncs.e | `AmiExpress-Sources/MiscFuncs.e` | 718 | Shared utility functions |
| axobjects.e | `AmiExpress-Sources/axobjects.e` | 292 | Binary struct definitions |
| axconsts.e | `AmiExpress-Sources/axconsts.e` | 113 | ACS flags + constants |
| axenums.e | `AmiExpress-Sources/axenums.e` | 47 | Enumerations |
| zmodem.e | `AmiExpress-Sources/zmodem.e` | 3,198 | Zmodem protocol |
| tooltypes.e | `AmiExpress-Sources/tooltypes.e` | 387 | .info tooltype parsing |
| qwk.e | `AmiExpress-Sources/qwk.e` | 739 | QWK packet format |
| hydra.e | MCP `hydra-e` | — | HYDRA protocol |

## What "1:1" means for each check

For every express.e function implemented in TypeScript, verify:
1. **Flow order** — same sequence of prompts, state transitions, and sub-calls
2. **Exact strings** — `aePuts(...)` content matches our `emitText(...)` content byte-for-byte (ANSI codes included)
3. **ACS checks** — `checkSecurity(ACS_*)` gates present at same points, same permissions
4. **Input handling** — same character-level parsing (yesNo modes, lineInput max-len, readChar loops)
5. **Edge cases** — blank input, out-of-range values, carrier drop, timeout — same as express.e
6. **Return values** — RESULT_SUCCESS / RESULT_FAILURE / RESULT_GOODBYE propagated correctly
7. **WEB_ tags** — every intentional deviation has a `// WEB_:` comment citing the express.e line

## Deviation report format (output of each research task)

Each agent writes `thoughts/shared/research/audit-<track>.md` with:
```
## <FunctionName> (express.e:LINE–LINE)
**File**: `web/backend/src/handlers/...ts:LINE`
**Issue**: <description>
**express.e**: <quote the relevant lines>
**Our code**: <quote what we have>
**Fix**: <what needs to change>
**Priority**: P1 (user-visible) | P2 (functional) | P3 (cosmetic)
```

---

## Phase 1: Parallel Research Audits

Run all 8 tasks simultaneously as parallel agents. Each is read-only — no code changes.

---

### Task 1: Auth, Login & New User (Track A)

**express.e modules**: `mainloop` (28500–30500), `security` (908–1500)
**Our files**:
- `web/backend/src/handlers/user/auth.handler.ts`
- `web/backend/src/handlers/user/new-user.handler.ts`
- `web/backend/src/handlers/command-handler/pre-login.ts`
- `web/backend/src/handlers/user/account.handler.ts`
- `web/backend/src/handlers/user/account-edit-input.handler.ts`

- [ ] **Step 1: Read express.e mainloop section** (28500–30500 via MCP)
  Focus on: pre-login, BBSTITLE, LOGON screen, `checkUserPassword`, `newUserEntry`, MAILSCAN_PROMPT, confScan, BULL / NODE_BULL display, MENU.

- [ ] **Step 2: Read express.e security section** (908–1500 via MCP)
  Focus on: `checkPasswordStrength`, `setNewPassword`, `checkUserPassword`, bad-password handling, lockout.

- [ ] **Step 3: Read our auth.handler.ts and pre-login.ts in full**

- [ ] **Step 4: For each express.e function, compare flow, strings, ACS, edge cases**
  Known areas to check:
  - Login retry count (express.e uses 3 attempts before disconnect)
  - Password echo handling during entry
  - LOGON screen shown only if not quickFlag
  - `newUserEntry()` complete flow: name → location → password → phone → birthdate → GDPR
  - Account edit (`/A` command): all fields, exact prompts

- [ ] **Step 5: Write deviation report to `thoughts/shared/research/audit-track-a.md`**

---

### Task 2: Main Loop, Menu & Command Dispatch (Track B)

**express.e modules**: `mainloop` (28500–30500), `command-priority` (28228–28500), `commands` (4614–5257)
**Our files**:
- `web/backend/src/handlers/command-handler/core.ts`
- `web/backend/src/handlers/command-handler/command-processing.ts`
- `web/backend/src/handlers/command-handler/command-execution.ts`
- `web/backend/src/handlers/command-handler/menu.ts`
- `web/backend/src/handlers/command-handler/state-router.ts`
- `web/backend/src/handlers/command-handler/input-handlers.ts`
- `web/backend/src/handlers/command-handler/input-helpers.ts`
- `web/backend/src/handlers/command-handler/internal-commands.ts`
- `web/backend/src/handlers/command-execution.handler.ts`
- `web/backend/src/handlers/screen.handler.ts`

- [ ] **Step 1: Read express.e command-priority module** (28228–28500)
  Focus: SYSCMD → BBSCMD → internalCommand resolution order, `runCommand`, `runBbsCommand`, `runSysCommand`

- [ ] **Step 2: Read express.e mainloop** (28500–30500)
  Focus: `DISPLAY_MENU` state, `readChar` loop, how commands enter the system, `advanceDisplayFlow`, door dispatch, logoff flow

- [ ] **Step 3: Read commands module** (4614–5257)
  Focus: `runCommand`, `runBbsCommand`, `runSysCommand` implementations

- [ ] **Step 4: Compare command dispatch pipeline**
  Known areas to check:
  - Does our SYSCMD check happen before BBSCMD?
  - Does BBSCMD check happen before internal?
  - Is the `.info` file lookup order correct?
  - Menu redisplay after each command — does it match express.e's `displayScreen(SCREEN_MENU)` call?
  - Logoff sequence — same screens + delays as express.e?

- [ ] **Step 5: Write `thoughts/shared/research/audit-track-b.md`**

---

### Task 3: Internal Commands A–Z (Track C)

**express.e module**: `internal-commands` (24411–28227)
**Our files**:
- `web/backend/src/handlers/commands/system-commands.handler.ts`
- `web/backend/src/handlers/commands/navigation-commands.handler.ts`
- `web/backend/src/handlers/commands/info-commands.handler.ts`
- `web/backend/src/handlers/commands/advanced-commands.handler.ts`
- `web/backend/src/handlers/commands/user-commands.handler.ts`
- `web/backend/src/handlers/commands/utility-commands.handler.ts`
- `web/backend/src/handlers/commands/display-file-commands.handler.ts`
- `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts`
- `web/backend/src/handlers/commands/sysop-commands.handler.ts`
- `web/backend/src/handlers/command-handler/user-edit-states.ts`
- `web/backend/src/handlers/command-handler/voting-states.ts`
- `web/backend/src/handlers/command-handler/page-sysop-command.ts`
- `web/backend/src/handlers/operations/alter-flags.handler.ts`
- `web/backend/src/handlers/operations/navigation-quick.handler.ts`

- [ ] **Step 1: Read express.e internal-commands** (24411–28227, use read_source_range in 1000-line chunks)

- [ ] **Step 2: Map each internalCommandX to our handler file(s)**
  Build a table: `internalCommandA` → our function + file:line

- [ ] **Step 3: For each command (A-Z), check**:
  - Is it implemented at all?
  - Correct prompts?
  - Same ACS checks?
  - Same sub-state flow?
  - Handles blank/invalid input same way?
  - Known commands likely to have gaps: K (search), N (quicknew), O (operator page), P (page sysop), T (time-on), V (votes), W (who's online), X (export/QWK)

- [ ] **Step 4: Write `thoughts/shared/research/audit-track-c.md`**
  List every command with status: `OK`, `DEVIATION: <desc>`, or `MISSING`

---

### Task 4: Message System (Track D)

**express.e module**: `mail` (8672–12000)
**Our files**:
- `web/backend/src/handlers/message/messaging.handler.ts`
- `web/backend/src/handlers/message/message-entry.handler.ts`
- `web/backend/src/handlers/message/message-commands.handler.ts`
- `web/backend/src/handlers/message/message-scan.handler.ts`
- `web/backend/src/handlers/transfer/olm.handler.ts`

- [ ] **Step 1: Read express.e mail module** (8672–12000, in chunks)
  Focus: `displayMessage`, `enterMSG`, message reader nav (A/D/F/K/L/M/N/Q/R/??), `editEMessage`, `attachMsgFiles`, `deleteMsgFiles`, forward, reply, mail scan, `saveNewMSG`

- [ ] **Step 2: Read our messaging.handler.ts in full (or key sections)**

- [ ] **Step 3: Check message reader nav against express.e**
  Known areas: all reader nav commands (A=abort, D=delete, F=forward, K=keep/mark, L=last, M=mail-scan, N=next, Q=quit, R=reply, ??=list), exact prompts, ACS checks for delete/edit

- [ ] **Step 4: Check message scan flow**
  express.e: `confScan` → `checkMsgConfScan` → per-conf scan, new-since pointer, mail scan

- [ ] **Step 5: Check OLM (One-Line Message) handler against express.e**

- [ ] **Step 6: Write `thoughts/shared/research/audit-track-d.md`**

---

### Task 5: File System (Track E)

**express.e module**: `files` (12000–18000)
**Our files**:
- `web/backend/src/handlers/file/download.handler.ts`
- `web/backend/src/handlers/file/file.handler.ts` (upload)
- `web/backend/src/handlers/file/file-listing.handler.ts`
- `web/backend/src/handlers/file/file-maintenance.handler.ts`
- `web/backend/src/handlers/file/file-status.handler.ts`
- `web/backend/src/handlers/transfer/batch-download.handler.ts`
- `web/backend/src/handlers/content/zippy-search.handler.ts`
- `AmiExpress-Sources/zmodem.e` (reference for transfer protocol)

- [ ] **Step 1: Read express.e files module** (12000–18000, in chunks)
  Focus: `downloadAFile`, `uploadaFile`, `uploadDesc`, `fileList`, `newfilesScan`, `zippy`, `flagFile`, `unFlagFile`, `showFlags`, `removeDiz`, ratio checks, CREDITBYKB logic, disk-space checks

- [ ] **Step 2: Read zmodem.e header/init section** (AmiExpress-Sources/zmodem.e, lines 1–200)
  Focus: protocol constants, init sequence — verify our Zmodem handshake strings match

- [ ] **Step 3: Check download handler against express.e `downloadAFile`**
  Known recent rewrite (61bdabd9f) — verify edge cases: LAST CHANCE prompt, DS command, batch download exit

- [ ] **Step 4: Check upload handler against express.e `uploadaFile`/`uploadDesc`**
  Known recent rewrite (aa3a7effa) — verify disk-space check format, filename loop, batch vs single

- [ ] **Step 5: Check file listing against express.e `fileList`**
  Focus: CDL format, new-files marker, exact column widths, date format

- [ ] **Step 6: Write `thoughts/shared/research/audit-track-e.md`**

---

### Task 6: Conference System (Track F)

**express.e module**: `conference` (18000–24410)
**Our files**:
- `web/backend/src/handlers/operations/conference.handler.ts`
- `web/backend/src/handlers/command-handler/conference-maint-states.ts`
- `web/backend/src/handlers/command-handler/file-maintenance-states.ts`
- `web/backend/src/amiga-emulation/xim/system-commands.ts` (JH_JC / SET_FILEATTACH)

- [ ] **Step 1: Read express.e conference module** (18000–24410, in chunks)
  Focus: `joinConference` / `joinCnf`, `scanConference`, `confScan`, `checkMsgConfScan`, `checkFileConfScan`, `newFilesScan`, conference registration / unregistration, CONF_BULL display, per-conf scan pointers

- [ ] **Step 2: Read our conference.handler.ts in full**

- [ ] **Step 3: Check joinConference flow**
  Known recent fix: JoinCnf splash+RETURN (memory entry). Verify ACS check for conf access, registered-user flow, unregistered prompt, CONF_BULL display timing.

- [ ] **Step 4: Check confScan / mailscan flow**
  Verify: scan order (messages then files), new-since pointer update, SCREEN_MAILSCAN display, quickFlag interaction

- [ ] **Step 5: Check conference maintenance states**
  (conference maint commands from sysop menu — add/edit/delete conferences)

- [ ] **Step 6: Write `thoughts/shared/research/audit-track-f.md`**

---

### Task 7: Display, Screen Files & MCI Codes (Track G)

**express.e modules**: `display` (6539–6850), `mci` (5258–5850)
**Our files**:
- `web/backend/src/handlers/screen.handler.ts`
- `web/backend/src/handlers/content/bulletin.handler.ts`
- `web/backend/src/handlers/content/view-file.handler.ts`
- `web/backend/src/amiga-emulation/xim/mci-handler.ts`

- [ ] **Step 1: Read express.e display module** (6539–6850)
  Focus: `displayScreen`, `displayFile`, `displayBulkScreen` — file lookup order, language fallback, security-level suffix

- [ ] **Step 2: Read express.e mci module** (5258–5850)
  Focus: every `~XX` code handler — `~N` (username), `~CF` (conf name), `~XC_` (exec), `~D.` (date/time), `~ML.` (msg level), `~MN.` (msg num), `~UL.` (uploads), `~DL.` (downloads), `~TD.` (time-on), etc.

- [ ] **Step 3: Read MiscFuncs.e** (AmiExpress-Sources/MiscFuncs.e, all 718 lines)
  Focus: `formatSpaceValue`, `formatLongDateTime`, `formatDate`, `formatTime`, `formatFileSize` — verify our implementations match exactly (same field widths, same rounding, same units)

- [ ] **Step 4: Compare our screen.handler.ts `parseMciCodes` against express.e mci module**
  Build a table of every `~XX` code: `express.e:LINE` → `screen.handler.ts:LINE` → `OK / DEVIATION`

- [ ] **Step 5: Check bulletin.handler.ts against express.e BULL display**
  express.e:28554-28558: BULL then NODE_BULL unconditionally; quickFlag only skips LOGON

- [ ] **Step 6: Write `thoughts/shared/research/audit-track-g.md`**

---

### Task 8: Support Libraries & Structures (Track H)

**Sources**: `axobjects.e`, `axconsts.e`, `axenums.e`, `tooltypes.e`, `qwk.e`
**Our files**:
- `web/backend/src/constants/acs-permissions.ts`
- `web/backend/src/utils/` (all utility files)
- `web/backend/src/services/ConferenceFileManager.ts` (or wherever struct parsing lives)
- `web/backend/src/services/UserFileManager.ts`
- `web/backend/src/utils/message-file.util.ts`
- Any QWK import/export handler

- [ ] **Step 1: Read axobjects.e in full** (292 lines)
  Extract every OBJECT definition. For each struct, verify:
  - Field names match (or are documented as renamed)
  - Field offsets match (especially critical for BE binary reads)
  - Field sizes match (`LONG`=4, `INT`=2, `CHAR`=1, `ARRAY n OF CHAR`=n)

- [ ] **Step 2: Read axconsts.e in full** (113 lines)
  Compare ACS flag values against `web/backend/src/constants/acs-permissions.ts`
  Verify every ACS_* constant has the same numeric value

- [ ] **Step 3: Read axenums.e** (47 lines)
  Compare ENUM values against our TypeScript enums

- [ ] **Step 4: Read tooltypes.e in full** (387 lines)
  Focus: `readToolType`, `findToolType`, `getToolTypeValue` — compare against our info-editor / tooltype parsing

- [ ] **Step 5: Read qwk.e** (739 lines)
  Focus: QWK header format, message format, conference record format — compare against any QWK import/export code in our TS

- [ ] **Step 6: Write `thoughts/shared/research/audit-track-h.md`**

---

## Phase 2: Triage

### Task 9: Compile & Prioritize Findings

Run after all 8 parallel research tasks complete.

- [ ] **Step 1: Collect all 8 deviation reports**
  Read: `thoughts/shared/research/audit-track-{a,b,c,d,e,f,g,h}.md`

- [ ] **Step 2: Build master deviation list**
  Write `thoughts/shared/research/audit-master.md` with all deviations sorted by priority:
  - **P1** (blocks functionality / user-visible regression)
  - **P2** (functional but incorrect behaviour)
  - **P3** (cosmetic / string mismatch)

- [ ] **Step 3: For each P1 deviation, write a fix task**
  Add to this plan document as Tasks 10, 11, 12... with full file paths, code, and verification steps.

- [ ] **Step 4: Commit the deviation reports**
  ```bash
  git add thoughts/shared/research/audit-*.md
  git commit -m "docs(audit): express.e 1:1 compliance deviation reports"
  ```

---

## Phase 3: Fix Tasks

Fix tasks are generated by Task 9. Template for each fix:

### Task N: Fix <FunctionName> — <short description>

**Source**: express.e:<LINE>–<LINE>
**File**: `web/backend/src/handlers/...ts`

- [ ] **Step 1: Read express.e source** (`search_express_source "<keyword>"` or `read_source_range`)

- [ ] **Step 2: Read our current implementation** (`Read` the file at the relevant line range)

- [ ] **Step 3: Write the fix**
  (Complete corrected code block here)

- [ ] **Step 4: TypeScript check**
  ```bash
  cd web/backend && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 5: Commit**
  ```bash
  git add web/backend/src/handlers/...ts
  git commit -m "fix(<area>): <description> (express.e:<LINE>)"
  ```

---

## Known High-Priority Fixes (Pre-identified)

These deviations are already known from previous work and should be addressed regardless of the audit findings:

### Fix A: MCI codes completeness
**File**: `web/backend/src/handlers/screen.handler.ts`
Verify every `~XX` code from express.e mci module (5258–5850) is implemented. Any missing code returns empty string where express.e would return a value — this silently corrupts screen files.

### Fix B: ACS constant values
**File**: `web/backend/src/constants/acs-permissions.ts`
Cross-check every `ACS_*` numeric value against `axconsts.e`. A wrong numeric value means the wrong bit is checked, silently granting or denying access.

### Fix C: axobjects.e struct offsets
**Files**: `ConferenceFileManager.ts`, `UserFileManager.ts`, `message-file.util.ts`
The BE/LE audit (2026-04-27) fixed read/write endianness but did not re-verify every field offset. Compare field-by-field against axobjects.e OBJECT definitions.

### Fix D: Internal commands with stubs or silent failures
**Files**: `web/backend/src/handlers/commands/*.handler.ts`
Any `internalCommandX` that is partially implemented or returns early without implementing the full express.e flow should be completed.

---

## Excluded from Audit (WEB_ Extensions)

These have no express.e counterpart and are intentionally divergent:
- `chat/` handlers (entire directory)
- `audio-video.handler.ts`, `voice-channel.handler.ts`
- `network-monitor.handler.ts`
- `gdpr.handler.ts`
- `webhook-commands.handler.ts`
- `grumpy-sysop-bot.handler.ts`
- `admin/` handlers
- `chat-only-login.handler.ts`

These should have WEB_ comments but are out of scope for 1:1 compliance.

---

## Excluded: Emulation Layer

The `amiga-emulation/` files implement AmigaOS APIs (not express.e). They are audited against NDK autodocs, not express.e. Out of scope for this plan.

Exceptions (audited against express.e XIM message contract):
- `amiga-emulation/xim/system-commands.ts` — covered in Track B/C
- `amiga-emulation/xim/io.ts` — JH_HK / JH_LI / JH_SM messages (covered in Track B)
