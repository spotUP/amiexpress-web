---
date: 2026-05-04
topic: audit-finish-and-prod-hardening
tags: [audit, a-3, admin-ui, helmet, cleanup, status-doc]
status: final
followups_resolved_2026-05-11:
  - "AREXX Phase 6 → DONE (HLE bridge landed; see 2026-05-11_arexx-daemon-hle-bridge.md)"
---

# Audit Finish + A-3 + Helmet — Session Handoff

> **Triage 2026-05-11.** Only one item from "Currently open" is still
> live: flip CSP from report-only to enforcing, which is deployment-
> gated (needs production telemetry on `logs/csp-violations.log`, not
> codeable). AREXX Phase 6 — listed below as in-flight by a parallel
> agent — is now DONE end-to-end (see `2026-05-11_arexx-daemon-hle-
> bridge.md`). Door backlog items remain blocked on user repro.

Wrap-up of an evening session that picked up from the prior audit-closure
handoff (2026-05-04_audit-master-closure-sweep.md, started at 127/138)
and shipped through to production-hardening territory.

## Commits pushed (origin/main)

```
42367c4d8 feat(security): wire helmet middleware for default security headers
5f41b30ca docs(status): refresh CURRENT_STATUS.md from Jan -> May 2026 (1090 commits)
2ae0061e3 feat(admin-ui): A-3 reservation panel — Reserve/Clear control on node cards
7d6df113c feat(audit): close A-3 setter side — full express.e parity for reserved-node feature
2fa349d7c chore(cleanup): delete 30 stale .bak/.backup/.fix*/.final duplicates
e3433dd1a chore: update BBS runtime templates from local sysop session
a8bd20b1f chore(gitignore): cover BBS runtime data + agent state
54f886cc1 fix(audit): close C-V/C-W/C-Z — 135/135 audit items DONE; fix Z runtime bug
3e62f7b4b fix(audit): close E-14/E-15/E-19/G-UB-DB/G-FF — 132/135 verified DONE
```

## What landed

**Audit master**: 138/138 closed. Final closures this session:
- E-14 (upload abort exit state), E-15 (post-upload banner pinning),
  E-19 (CREDITBYKB header toggle), G-UB-DB / G-FF (BCD round-trip,
  flagged-files MCI verified equivalent).
- C-V (V command via canonical ViewFileHandler), C-W (BGFILECHECK
  toggle + WEB_ tag for translator), C-Z (canonical ZippySearchHandler).
- **Real bug found**: `require('./zippy-search.handler')` in 5 dispatcher
  sites resolved to a non-existent file; canonical impl lives at
  `./content/zippy-search.handler`. Z command would have thrown at
  runtime. Fixed.
- A-3 (reserved-node) — full express.e parity, see below.

**A-3 full-parity reserved-node feature**:
- New `services/node-reservation.service.ts` — per-node Map with
  case-insensitive match (express.e:29131 StriCmp). Set/get/clear/
  isReservationMatch + resetAllNodeReservations test helper.
- Upgraded `POST /api/nodes/:nodeId/reserve` to accept `{username}` body.
  Empty body toggles per express.e:7652-7653 F4. Whitespace rejected 400.
- New `GET /api/nodes/:nodeId/reserve` for admin status checks.
- `createSession()` populates `session.reservedFor` from the store →
  existing pre-login banner (express.e:29554-29557) fires automatically.
- `handleGoodbyeCommand` clears reservation on logoff (express.e:8213).
- Auth handler bumps non-matching authenticated users with
  `420 Node is currently reserved for another user.` + disconnect
  (express.e:28734-28738). Both auth paths converge at single check.
- 33 regression tests across 5 suites.

**A-3 admin UI panel** (web/config-app/src/pages/NodeControlPage.tsx):
- New `Reserved: <username>` badge in node header when set.
- Reserve button on online + offline cards. Click opens inline
  `[username] Save Cancel` editor; Enter saves, Escape cancels.
- When reserved: Clear Reservation button replaces Reserve.
- Backend `GET /api/nodes/status` now includes `reservedFor: string|null`
  per row so the page doesn't need per-node round-trips.
- 7 structural-grep tests pinning the React JSX shape (config-app has
  no test framework; backend's jest reads the file via fs).

**Helmet security headers** (one of three production-hardening trio):
- Mounted FIRST in src/server/app.ts.
- helmet 8.1.0, defaults except CSP and crossOriginEmbedderPolicy
  (both deferred — would blackbox-break xterm.js / socket.io / inline-
  styled React. Pinned absent in tests so a future helmet upgrade
  can't silently re-enable them).
- 8 tests in tests/server/security-headers.test.ts.

**Repo cleanup**:
- gitignore extended for runtime BBS data (Conf*/MsgBase/*, Conf*/Upload/*.LZH,
  node*.userkeys, .claude/, .superpowers/, AquaScan/Request/glc/DOORSMENU
  door runtime, etc.). Was leaking 700+ untracked files.
- 30 stale duplicates deleted: 7 tracked SDK glue snapshots + 23
  *.bak/.backup/.fixacs/.fiximport/.final source files. None referenced
  by code; backend tsc clean.
- DM.info case-only duplicate cleaned up (single inode, untracked).

**Door bug backlog** (memory updated):
- AquaScan → moved to FIXED THIS SESSION (user confirmed).
- MgzListMan → flagged "probably not actually broken per user 2026-05-04";
  parked pending confirmation.
- doorman → still open, blocked on user repro.

**Documentation**:
- CURRENT_STATUS.md refreshed from Jan → May 2026 (1090 commits in between).
  New "Headline (May 2026)" section, "Major Work Since January 2026"
  summary, "Currently Open" list. Old "100% complete" Summary kept as
  historical record with inline qualifier.

## Status

- audit-master.md: 138/138 closed.
- web/backend `tsc --noEmit`: clean (modulo rexxmast/tmp-arexx noise from
  AREXX agent's parallel work).
- All commits pushed to origin/main.
- Dev server NOT running — nothing to clean up.

## Currently open (next session candidates)

- **Production hardening — CSP shipped in report-only mode (2026-05-05).**
  - Asset audit confirmed: bundled React/xterm/socket.io same-origin,
    local `/fonts/*.ttf`, no CDNs, no inline `<script>`, no `eval`/
    `dangerouslySetInnerHTML`. Only `'unsafe-inline'` need is
    `style-src` (index.html `<style>` block + React `style={{...}}`
    props).
  - Final policy: `default-src 'self'; script-src 'self';
    style-src 'self' 'unsafe-inline'; font-src 'self';
    img-src 'self' data:; connect-src 'self'; worker-src 'none';
    frame-ancestors 'none'; form-action 'self'; base-uri 'self';
    object-src 'none'; report-uri /api/csp-report`.
  - Reporter endpoint at `/api/csp-report` accepts both legacy
    `application/csp-report` and `application/reports+json`; logs to
    `logs/csp-violations.log`; never 5xx's.
  - **Next step**: deploy, tail `logs/csp-violations.log` for a few
    real sessions, then flip `reportOnly: false` in
    `web/backend/src/server/app.ts` if log stays empty. If violations
    show up, the report payload identifies which directive needs
    widening (likely a new asset added by a door bundle).
  - 21 tests pin header + reporter shape (`tests/server/security-
    headers.test.ts`). Commit: `781a48d3e`.
  - **Rate limiting + CSRF rejected** by the user (2026-05-05):
    rate limiters lock out legitimate BBS users (long sessions,
    telnet/SSH retries, doors); CSRF is unnecessary with the JWT-in-
    Authorization-header auth flow we use. See memory
    `feedback_no_rate_limiting.md`. Production hardening trio is
    closed — CSP shipped, the other two intentionally not pursued.

- **Door backlog**: doorman / MgzListMan blocked on user repro
  (memory: project_door_bug_backlog.md).

- **AREXX Phase 6**: in flight by parallel agent. Leave alone.

## Context for the next session

The prior handoff (`2026-05-04_audit-master-closure-sweep.md`) is now
fully obsolete — its 11 open items are all closed. A-3 admin storage
gap is closed including UI panel.

Files NOT to touch (parallel agent work):
- web/backend/src/amiga-emulation/api/DosLibrary.ts
- web/backend/src/amiga-emulation/api/LibraryTraps.ts
- web/backend/src/handlers/command.handler.ts (AREXX agent's upload
  goodbye-flag fix)
- web/backend/src/handlers/file/download.handler.ts (AREXX agent's
  checkFIBForFileSize printout)
- web/backend/src/server/file-socket-handlers.ts
- web/backend/src/services/arexx/rexxmast-service.ts
- web/backend/tests/services/rexxmast-service.test.ts
- dev/scripts/arexx-trace.ts
- handoff.md (AREXX-owned)

If you start production hardening, helmet's already in place. Rate
limiting goes in src/server/app.ts before any state-changing routes.
CSRF audit starts with grepping for any endpoint that reads
req.cookies or socket.handshake.headers.cookie.
