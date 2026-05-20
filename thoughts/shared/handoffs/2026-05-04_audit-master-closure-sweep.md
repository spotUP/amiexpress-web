---
date: 2026-05-04
topic: audit-master-closure-sweep
tags: [audit, express-e, parity, p2, regression]
status: superseded
superseded_by: 2026-05-04_audit-finish-and-prod-hardening.md
---

# Audit-Master Closure Sweep — Handoff

> **SUPERSEDED 2026-05-04.** All 11 remaining items in this handoff
> were closed later the same day by
> `2026-05-04_audit-finish-and-prod-hardening.md`. Audit master is now
> 138/138 closed. Kept as historical record of the sweep methodology
> (idempotent `/tmp/p1-status.txt` + `mark-done.py`). Do not pick
> items from this list — they are all done.

## Task

Continue closing the express.e deviation audit at
`thoughts/shared/research/audit-master.md` (138 items: 32 P1, 67 P2, 39 P3).

User directive (verbatim, repeating): "work trough all the open ones one by
one" / "keep going". Each item: read the audit row, verify against current
code, then either fix / WEB_-tag / mark DONE, with regression tests where
practical and a typecheck-clean commit per item-cluster.

## Status: 127 / 138 verified DONE

`grep -c "FIXED" thoughts/shared/research/audit-master.md` → **127**.

## Critical References

- **Audit master**: `thoughts/shared/research/audit-master.md` — 138 entries,
  P1/P2/P3 priority, each with `### ID:`, `**Priority**:`, `**Status**:` line.
- **Idempotent stamping infra** (re-use, do not rebuild):
  - `/tmp/p1-status.txt` — pipe-separated `ID|STATUS|evidence` source of
    truth. Cumulative across sweeps.
  - `/tmp/mark-done.py` — strips existing Status lines, re-stamps from
    p1-status.txt. Run after appending new rows.
- Express.e source: use MCP `read_express_module` /
  `search_express_source` (project rule §1, §4). MCP servers were killed mid-
  session — they will respawn next session.

## Open Items (11 remaining)

P2 (8 functional gaps):

- **C-V** — V command searches `TEXT/` instead of BBS file areas; missing
  `viewAFile` integration + RIP brackets. express.e:25675-25687.
- **C-W** — W (edit-self) options 8/9/11/15 stubs; option 16 BGFILECHECK
  shows [DISABLED] always. express.e:25712-26092.
- **C-Z** — Zippy missing `getDirSpan` interactive prompt + context-buffered
  output. express.e:26123-26213.
- **E-14** — UPLOAD_FILENAME_INPUT needs A=Abort branch (return failure +
  `\r\n`). express.e:17668-17670. Touch
  `web/backend/src/handlers/command.handler.ts:2573` (the
  `if (session.subState === LoggedOnSubState.UPLOAD_FILENAME_INPUT)` block).
- **E-15** — After upload: emit "File Uploading Complete...", stats line,
  "Time increased by N mins.". express.e:19053, 19072, 19127.
- **E-19** — fileStatus header switches on `ToggleFlags.CREDITBYKB`.
  express.e:24156-24161, `file.handler.ts:646`.

P3 (UNVERIFIED, need code reading):

- **G-UB-DB** — uploadBytes/downloadBytes raw vs BCD. `screen.handler.ts:886-887`.
- **G-FF** — flagged-files format vs `showFlaggedFiles(maxLen)`. `screen.handler.ts:957-960`.

Substantial / out-of-scope for parity sweep:

- **A-3 admin storage** — `session.reservedFor` setter side; needs an admin
  endpoint. The pre-login *display* side is already wired via
  `pre-login.ts:transitionToBBSTitle`.

## Recent Changes (this session)

Closed in this sweep (representative, not exhaustive):

- A-3 (display) `pre-login.ts:transitionToBBSTitle` reservedFor banner.
- A-22 new-user prompt parsing — only `~`-suffixed lines are prompts.
  `new-user.handler.ts`.
- A-5 / A-6 / A-12 — split `usernameRetryCount`, retry default 3,
  WEB_ tag for token reconnect. `auth-socket-handlers.ts` + `index.ts`.
- B-4 — NOT_ALLOWED routing emits `\r\nCommand requires higher access.\r\n`
  + sets `menuPause` + `DISPLAY_MENU`. `command.handler.ts`.
- B-5 — removed duplicate `case "Q"`. `command-execution.ts`.
- D-9 — `\r\n` + "Found Mail!" banner before read prompt.
  `message-scan.handler.ts`.
- E-8 / E-11 — UPLOADING header + WEB_ tag on `startFileUpload`.
  `file.handler.ts`.
- F-2 — CUSTOM tooltype routing for conferences. New field
  `custom: boolean` in ConferenceToolFlags; 3 guard sites in
  `conference.handler.ts` skip mail-stats / MAIL_SCAN when custom.
  Regression tests added.
- F-8 — currentMenuName reset. `command.handler.ts`.
- H-CDateTime — rewrote `formatCDateTime` to ctime layout
  (space-padded day). Tests updated.
- H-ED — new `web/backend/src/constants/express-flags.ts`
  (EditorFlag/UserFlag/PageType from axconsts.e:66-72, axenums.e:46,
  axconsts.e:94-113).
- H-TTV — new `checkToolTypeValue()` helper in `info-file.util.ts`.
- H-states — added LOGGING_OFF / HANGUP / SHUTDOWN to `BBSState`.

## Learnings / Gotchas

- **MCP zombies**: `pkill -f "node.*mcp-server"` will kill *your own* MCP
  servers (amiexpress-debug, amiexpress-docs, playwright, context7,
  sequential-thinking) — this session lost MCP for the whole back half.
  Filter the pkill or restart Claude.
- **B-11 / D-5 looked OPEN but were DONE** — both verifications missed the
  real implementation site (B-11 → ErrorHandler.permissionDenied;
  D-5 → forward subject pre-fill moved to `message-forward.handler.ts`).
  Always cross-check by symbol grep before stamping OPEN.
- **CUSTOM (F-2)** lives in `Conf{N}.info` tooltypes — gate per-conf, not
  globally. Routing must skip mail-stats *and* MAIL_SCAN.
- **typecheck noise**: `npx tsc --noEmit | grep -v "rexxmast\|tmp-arexx"`
  to filter unrelated WIP errors from another agent's branch.

## Artifacts

- Audit: `thoughts/shared/research/audit-master.md` (127/138 DONE).
- Stamping: `/tmp/p1-status.txt`, `/tmp/mark-done.py`.
- Backups present in repo (do not commit): `command.handler.ts.bak2`,
  `command.handler.ts.backup`, `index.ts.backup`. Consider deleting
  before next commit cluster.

## Next Steps (ordered)

1. **E-14** (smallest, well-scoped). Add A/a abort branch at top of the
   UPLOAD_FILENAME_INPUT input handler in
   `web/backend/src/handlers/command.handler.ts:2573`. Match
   express.e:17667-17671 — emit `\r\n`, return failure, restore prior
   state. Add regression test.
2. **E-15**. After successful upload completion, emit
   `File Uploading Complete...\r\n`, then stats line, then
   `Time increased by N mins.`. express.e:19053 / 19072 / 19127. Likely
   `file.handler.ts` upload-complete path.
3. **E-19**. Toggle fileStatus header on `ToggleFlags.CREDITBYKB`.
   `file.handler.ts:646`. express.e:24156-24161.
4. **G-UB-DB** / **G-FF** — verify by reading `screen.handler.ts:886-887`
   and `:957-960`; either DONE-stamp or fix.
5. **C-V / C-W / C-Z** — substantial; tackle one per session.
6. **A-3 admin route** — separate task; not parity, needs admin UI/API.

## Other Notes

- Run `./dev/scripts/check-context-usage.sh` before reading
  `command.handler.ts` (3633 lines — use offset/limit).
- `start-servers.sh --bbs-only` per memory; never use `run_in_background`.
- After each item-cluster: `cd web/backend && npx tsc --noEmit` → must be
  clean (modulo rexx noise).
