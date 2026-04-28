# Handoff

## Current State
All changes committed (494bd6fd7). Server running with new code.

## Loop audit round 6 (2026-04-28) — Message handler audit COMPLETE
Deep audit confirms 1:1 parity with express.e for:
- enterMSG body editor (A/C/D/E/F/L/S commands, yesNo confirmations)
- Message body line input (75-char limit, line number prompts, empty line→options)
- Quote-from-reply flow (range prompt, line numbering, separator, blank lines)
- yesNo(0)/yesNo(2) prompt behavior (loop on unknown, CR defaults)
- Message READ display (header box, EALL, Recv'd, subject, body)
- 2/3-digit line padding boundary (lines<=98 logic equivalent)

Only minor: `checkForPause` (More prompt) not in quote display loop — WEB_ acceptable.
No critical deviations remain in messaging code.

## Round 7 (2026-04-28) — Reader nav modifiers
Added N+/N- and bare +/- direction modifiers in message reader (express.e:12238-12261).
Direction is sticky: CR/Enter steps in last-typed direction (default forward).
Previously '5+', '5-', and '+' returned 'No such command!!'

EH (edit header) audit confirmed: it DOES persist to disk via repository.updateMessage →
messageIndexManager.updateMessageHeader. Earlier audit was wrong about this.

EM/E (edit body) is still a WEB_ stub that re-displays — full Emacs editor integration
deferred. Sysop can edit via web admin instead.

## Open bug: wrong conf joined first on login (2026-04-28)
User reports: "it joins conf 14 before i joins the one i was in during the last bbs session"
Output observed:
```
Conference Top Uploaders is not installed in this conference.
AmiExpress Web BBS [14:bAUD bOY bATTLE] Menu (9999 mins. left): 
Joining Conference: Amiga Warez!
```
Conf 14 is the highest-numbered conf. CONFTOP ran in conf 14, menu shown for conf 14,
THEN AUTO_REJOIN fires "Joining Conference: Amiga Warez!" (conf 2).
DB shows sysop autorejoin=1 — neither 14 nor 2. Need to check:
- whether session restore is reusing stale `currentConf=14`
- whether the display flow is running CONF_BULL/menu BEFORE AUTO_REJOIN
- whether `db.updateUser({confRJoin})` silently fails (no such column — only `autorejoin`)

## Round 8 (2026-04-28) — Audit byte-level pass
Comprehensive audit of remaining areas: translation (T/TS/T!/T*), R-command entry,
searchNewMail flow, quote range parsing, file attach flow, subject input, body editor
sub-commands D/C/E/L, message file binary format, HeaderFile structure.

Only real gap found: subject input did not enforce 30-char limit. Fixed in both
handleMessageSubjectInput and handleForwardMessageSubjectInput (express.e:10847, 9826).

False alarms: K logic (correct — confused express.e:11128 with 11759), MessageIndexManager
called from createMessage (line 52 calls appendMessageHeader). Dual text+binary file
format is intentional (text .msg for body, binary HeaderFile for index).

Body editor sub-commands D/C/E/L are byte-perfect with express.e:10402-10506.
I/R/Q are intentional WEB_ extensions, well-implemented.

## AquaScan 00:00:00 ROOT CAUSE FOUND (2026-04-28)
After 5+ debugging rounds, the actual bug was in `DT_STAMP_LASTON` (express.e:8943-8949 reader).

When AquaScan reads the formatted "last logon" date string via XIM, our handler did:
```ts
formatCDateTime(new Date(user.lastLogin || user.timeLastOn!))
```

But `user.lastLogin` from the DB is **Unix SECONDS** (e.g., 1762463426).
`new Date(1762463426)` treats the value as **milliseconds**, giving 1970-01-21.
AquaScan formats this and (likely) only displays the time portion → near `00:00:00`.

Fix: `new Date(raw * 1000)` when raw is a number (file: data-query.ts).

Plus: AquaScan.UserData login seed + post-scan advance (already in place from round 4)
covered a separate, less-impactful path; both are correct now.

Also added /tmp/aquascan-debug.log instrumentation:
- DT_TIMELASTON reads
- DT_STAMP_LASTON reads
- handleLoadAccountCommand entries
- AquaScan UserData write/skip decisions

To verify: `tail -f /tmp/aquascan-debug.log` then run N S U in a logged-in session.

## Loop audit round 5 (2026-04-28 latest)

### Fixes
- EALL display: `username (ALL)` not conference name — confMailName = userName (express.e:12461)
- Short help `?`: removed spurious `A>gain` (only in `??`); both use direct ANSI literals
- Private msg listing: sysops with SYSOP_READ now see all private messages (express.e:12344)
- `A>gain` in `??` now has no leading `\r\n` — continuation of nav line (express.e:12035)
- TO: field truncated to 30 chars (express.e lineInput limit, express.e:10779)
- WEB_ tag on MAILSCAN_ALL (ALL messages in confScan always included; conf Conf.DB gating deferred)
- 'Joining Conference' now appears after CONF_BULL doPause, not before (express.e:5056-5088)

## Console v2 (2026-04-28)
TUI sysop control center: full Ink-based dashboard with 8 tabs.

### What was built
- start-servers.sh: creates tmux session `amiexpress` (3 windows + 5 panes in window 0)
  when run in interactive terminal with tmux. Falls back to plain output otherwise.
- dev/console/: standalone Ink TUI package, 8-tab control center
  - Tab 1 Dashboard: ink-big-text "SYSOP" banner, animated stat cards (Live/Today/All Time),
                     24h call sparkline (Unicode block chars), recent callers ticker
  - Tab 2 Nodes: live poll every 3s, kick (k), chat (c)
  - Tab 3 Users: list+search, edit SL (e), ban (b), delete (d)
  - Tab 4 Confs: toggle enabled (t), health check (h), auto-fix (f), refresh (r)
  - Tab 5 Callers: last 50, auto-refresh 30s
  - Tab 6 Logs: backend/preview/68K door, switchable, auto-refresh 5s
  - Tab 7 Doors: list all, [R]eload all, refresh
  - Tab 8 System: per-node start/exit/reserve/sysop-login, [Q]uiet mode, system config view
  - Status strip: dev/console/dist/strip/strip.js — plain ANSI 3-line summary

### How to run
- `./dev/scripts/start-servers.sh` → creates tmux session automatically if tmux available
- `node dev/console/dist/src/index.js` → run console manually
- `node dev/console/dist/strip/strip.js` → run status strip manually

### Build
- `cd dev/console && npm run build`

### Tab keys
1=Dashboard 2=Nodes 3=Users 4=Confs 5=Callers 6=Logs 7=Doors 8=System

## Current State
Server stopped. All changes committed. Console integrated.

## Summary of Session Work

## Prior Sessions (archived)
Audit rounds 3-4 with 138 deviations fixed (binary struct corruption, security checks, core loop,
conference system, MCI/display, file system, messages). See `thoughts/shared/handoffs/` for detailed
audit reports and commits b5d55eaea→be7e2fbcf. Key: MailStats/UserStructures BE byte order (CLAUDE.md Rule 0),
scan_flags DEFAULT 12→0, confScan multi-msgBase, ACL forward-walk, time-limit checks.

## Open priorities
1. **messaging.handler.ts** approaching 1600 lines — monitor, split if needed
2. **screen.handler.ts** at 3220 lines (exempted) — future refactor candidate

## Known WEB_ deviations (intentional)
- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files (WEB_: tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login disabled (uses QuickNew instead of AquaScan); set SHOW_NEW_FILES in .info to re-enable per conference

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **conf_base scan_flags**: DEFAULT now 0. Migration resets any non-zero rows on startup.
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires (a) from SCREENS_REQUIRE_CLEAR before all processing, (b) from leading 0x0C in screen files, (c) before ~SR_ art files. If a screen still bleeds, check if it has a leading form feed.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit may resurface.
