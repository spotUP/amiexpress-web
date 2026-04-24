---
date: 2026-04-24
topic: gdpr-hobby-baseline
tags: [gdpr, privacy, bbs, registration, logs, webhooks, soft-delete]
status: final
---

# GDPR baseline for the hobby BBS — plan

## Context

The BBS is a 1:1 AmiExpress port repurposed as a scene/hobby board hosted on
Hetzner (Falkenstein, EU). Data subjects are new-user registrants plus anyone
who calls in as a guest. Scope here is "good-faith hobby compliance" — not
enterprise-grade (no DPO, no Art. 30 register, no formal DPIA). The goal is to
remove the obvious gaps: notice, consent, access, erasure, retention, and
third-party leakage via webhooks.

Out of scope: SOC2-style access logging, penetration testing, encryption at
rest beyond bcrypt for passwords, formal DPA negotiation with Discord/Slack.

Prior reads this plan relies on:
- `web/backend/src/handlers/user/new-user.handler.ts` (whole file, current
  after `WEB_*` edits for optional phone, group affiliation, questionnaire
  disable).
- `web/backend/src/services/webhook.service.ts:38-225` — webhook payload
  builder, already `username`-only but still leaks handle to Discord/Slack.
- `web/backend/src/services/bbs-config-file.service.ts:111,212,524` —
  `log_retention_days` tooltype plumbing already exists, default 90.
- `web/backend/src/services/SessionLogManager.ts:119` — retention-based
  delete already implemented for session logs.
- No existing soft-delete or data-export support (grep of database.ts /
  UserDatabaseManager returns empty).

## Resolved decisions (locked 2026-04-24)

1. **Privacy notice wording**: Claude drafts v1.0 (see Appendix A). Sysop
   email placeholder `$SYSOP_EMAIL$` substituted at display time; sysop
   fills the actual email in `bbsConfig.info`.
2. **Consent placement**: before the name prompt. No PII captured if
   decline.
3. **Erasure semantics**: soft-delete (`deleted_at` + PII scrub across
   user row, message bodies, Answers/TempAns, recent logs).
4. **Export format**: plain-text dump in the terminal via `MYDATA`.
   No emailed JSON in Phase 3 — revisit if users ask.
5. **Webhook PII default**: strip by default, opt-in via
   `WEBHOOK_INCLUDE_PII=YES`.
6. **Existing users**: hard-stop on next login until consent. Account
   persists; user can reconnect and accept later.
7. **Rollout**: single `GDPR_ENABLED=YES` tooltype, default ON (Art. 25
   by-default).

## Phase 0 — pre-existing PII on disk (one-off cleanup)

Before Phase 1 lands in prod, delete or archive the existing
`Node*/Answers` and `Node*/TempAns` files — they contain historical
questionnaire answers from users who never consented to any notice.
Run once on both local and Hetzner:

```
find /path/to/BBS_DATA_DIR -maxdepth 2 -type f \
  \( -name Answers -o -name TempAns \) \
  -exec rm -- {} +
```

Do this as a separate commit/ticket, not inside Phase 1.

## Open questions (archived)

1. **Privacy notice wording**: who owns the text? Is there a `Documentation/PRIVACY.md`
   draft, or should I produce a first draft from scratch using a standard
   hobby-BBS template? Sysop contact email for the notice?
2. **Consent gate placement**: show notice + accept/decline *before* the
   `Enter your Name:` prompt, or after (so we don't capture the handle if
   they decline)? Recommendation: before — capture nothing until consent.
3. **Erasure semantics**: hard-delete user row + purge message bodies (but
   keep thread structure with `*** erased ***` placeholder), or soft-delete
   (set `deleted_at`, hide from listings, leave messages intact)? GDPR
   accepts either if anonymised. Recommendation: soft-delete + PII scrub.
4. **Export format**: plain text (like `Answers`) or JSON? Users on 2323
   telnet can't download JSON easily. Recommendation: dual — text dump in
   the terminal via `DATA` command, plus an emailed JSON if SMTP is
   configured.
5. **Webhook PII default**: strip by default (opt-in via
   `WEBHOOK_INCLUDE_PII=YES`) or keep current behaviour (opt-out via
   `WEBHOOK_INCLUDE_PII=NO`)? Recommendation: strip by default — safer, matches
   Art. 25 (data protection by default).
6. **Existing users**: pre-existing accounts never consented to anything.
   Do we (a) gate their next login on a one-shot consent prompt, (b)
   grandfather them in on the basis of legitimate interest + notice, or (c)
   send them an email? Recommendation: (a) — hard stop on next login,
   explicit opt-in, until accepted.
7. **Hetzner prod**: same rollout strategy as local (auto-deploy via
   GitHub Actions) or gated behind a `GDPR_ENABLED=YES` tooltype so staging
   can differ from prod? Recommendation: single flag default-on.

## Phases

Each phase is independently shippable. Stop for manual verification at
every phase boundary.

---

### Phase 1 — Privacy notice + consent gate

**Files:**
- New: `backend/data/bbs/Screens/PRIVACY.TXT` (80-col ANSI, loaded via
  `displayScreen`). First draft content in §Appendix A.
- New tooltype: `GDPR_ENABLED=YES` in `bbsConfig.info` (gate the whole
  flow; default ON when absent, per Art. 25).
- `web/backend/src/handlers/user/new-user.handler.ts`:
  - `startNewUserRegistration` (~:103): after `NoNewUsers` / `NoNewAtBaud`
    screens, before initialising `newUserData`, call
    `promptForGdprConsent()`.
  - New helpers: `promptForGdprConsent`, `handleGdprConsentInput`,
    recorded onto `session.newUserData.gdprConsentAt` (ISO timestamp)
    and `session.newUserData.gdprNoticeVersion` (`'1.0'`, bumped if
    notice text changes).
- New `LoggedOnSubState.NEW_USER_GDPR_CONSENT` in
  `web/backend/src/constants/bbs-states.ts`.
- `web/backend/src/handlers/command.handler.ts:~1825`: dispatch
  `NEW_USER_GDPR_CONSENT` → `newUserHandler.handleGdprConsentInput`.
- `web/backend/src/database.ts`: add columns to `users` table via
  migration:
  - `gdpr_consent_at TEXT` (nullable for existing users)
  - `gdpr_notice_version TEXT`
  - `gdpr_consent_source TEXT` (`'registration'|'relogin'|'import'`)
- `createUser(...)` call in `createAccount` (~:1100): pass the new three
  fields.

**Behaviour:**
- User sees `PRIVACY.TXT`, then `Accept privacy notice (y/n)? ` — no
  retreat, no blank.
- `n` / `no` → `\r\nRegistration cancelled.\r\n` + disconnect after 500ms.
- `y` / `yes` → stamp consent, continue to name prompt.
- Anything else → re-prompt.

**Automated verification:**
- `cd web/backend && npx tsc --noEmit` clean.
- Add unit test in `web/backend/src/handlers/user/__tests__/new-user.gdpr.test.ts`:
  - Decline → socket disconnect after 500ms.
  - Accept → consent fields populated on session.
  - Invalid input → re-prompt (no state change).

**Manual verification:**
- Register via telnet; see notice; decline; disconnected.
- Re-connect; accept; complete registration; verify DB row has
  `gdpr_consent_at` populated and within last minute.

---

### Phase 2 — Consent backfill for existing users

**Files:**
- `web/backend/src/handlers/auth/login.handler.ts` (or wherever
  post-password success routes): after successful login, if
  `user.gdpr_consent_at IS NULL`, set sub-state
  `LOGGEDON_GDPR_BACKFILL` and show `PRIVACY.TXT` + consent prompt.
- New `LoggedOnSubState.GDPR_BACKFILL`.
- Decline path: log out (no disconnect from TCP — just return to login
  prompt with a "consent required" message).
- Accept path: persist via `db.updateUser(id, {gdpr_consent_at, ...})`,
  continue to main menu.

**Automated verification:**
- Migration idempotent (run twice, no error).
- Unit test: existing user with NULL consent → prompted on login.
- Unit test: consented user → skips prompt on login.

**Manual verification:**
- Log in as a pre-GDPR existing user; see backfill prompt.
- Decline → logged out, can't enter the BBS.
- Accept → proceeds; next login skips the prompt.

---

### Phase 3 — Access & erasure as W options (2026-04-24 revision)

**Design change from first draft:** MYDATA/FORGETME live inside the `W`
(Write User Parameters) menu as options 19 and 20, not as top-level
commands. Matches the existing WEB_* extension pattern (W already
exposes options 17 modem-emulation and 18 terminal-font as web
extensions), centralises all self-service profile ops in one place, and
avoids new top-level command slots that could collide with future
AmiExpress additions.

**Files:**
- `web/backend/src/handlers/commands/info-commands.handler.ts`:
  - `_displayWCommandMenu`: add two more blue/magenta lines for
    option 19 "VIEW MY DATA" and option 20 "DELETE MY ACCOUNT (GDPR)".
  - `handleWOptionSelectInput`: raise the upper bound from 18 to 20 and
    add `case 19` / `case 20` branches.
  - Option 19 dumps the user record (profile fields, stats, consent
    stamps, Answers/TempAns if any) paged 23 lines at a time, then
    returns to the W menu.
  - Option 20 starts the erasure confirm flow, transitions to a new
    sub-state `LoggedOnSubState.W_FORGETME_CONFIRM`, then
    `W_FORGETME_PASSWORD`, then `W_FORGETME_USERNAME`.
- New `LoggedOnSubState.W_FORGETME_CONFIRM` / `W_FORGETME_PASSWORD` /
  `W_FORGETME_USERNAME` in `web/backend/src/constants/bbs-states.ts`.
- Dispatch in `command.handler.ts` for the three new sub-states →
  handlers in `info-commands.handler.ts`.
- New migration: `users.deleted_at TEXT` (nullable) and
  `users.erased_at TEXT` (nullable), so soft-delete is queryable.
- New utility `erasureService` in
  `web/backend/src/services/gdpr-erasure.service.ts`:
  - Null out `realname`, `location`, `phone`, `email`; set
    `username = 'erased_' + id` (truncated to fit column width); set
    `deleted_at = now()`, `erased_at = now()`; keep
    `security_level = 0`.
  - Message bodies posted by the user: replace body with
    `*** erased ***`, set `from_user` to `erased_<id>`.
  - `Answers` / `TempAns` entries for this user: scrub matching blocks
    by slot number.
  - `CallersLog`, `logs/backend.log`: best-effort sed replacement of
    `user.username` with `erased_<id>` for entries within
    `LOG_RETENTION_DAYS`.
  - Fire a separate `gdpr.erasure` webhook trigger with `userId` only
    (respects Phase 5's `WEBHOOK_INCLUDE_PII=NO` default).

**Erasure flow UX:**
- W option 20 selected → print a red WARNING banner with a
  `Documentation/PRIVACY.md` reference, then
  `\x1b[31mType YES ERASE to continue, anything else cancels:\x1b[0m `
  (literal case-sensitive string; reduces accidental deletion).
  No 10-second cooldown — the verbatim-typed string is a stronger
  guard and simpler to implement.
- On `YES ERASE`: `Re-enter your password: ` (password-masked).
- On password match: `Type your username to confirm: `.
- On exact username match: run erasureService, then emit
  `\r\nYour data has been erased. NO CARRIER\r\n`, schedule
  `socket.disconnect(true)` after 500ms via the same abort helper
  pattern from Phase 1.
- Any mismatch → `Deletion cancelled.` + return to W menu.

**Automated verification:**
- Unit test: option 19 dumps the record (use test DB).
- Unit test: erasureService end-to-end in a test DB — user row
  scrubbed, message bodies replaced, Answers block removed, log
  entries redacted.
- Unit test: W option handler rejects mismatched confirm/password/
  username and keeps user logged in.
- `tsc --noEmit` clean.

**Manual verification:**
- Run `W`, pick 19 → see your record dumped, return to W menu.
- Run `W`, pick 20 → run through 3-step confirm. On success,
  disconnect. Re-connect; old credentials fail; handle
  `erased_<id>` is present in DB with nulled PII fields.

---

### Phase 4 — Log retention & rotation

**Files:**
- `web/backend/src/services/SessionLogManager.ts`: already rotates
  session logs. Add a new `LogRetentionService` that periodically (daily,
  on backend boot + `setInterval(24h)`) truncates:
  - `logs/backend.log` — keep last `log_retention_days` lines by date
    header. If no date markers, fall back to mtime.
  - `logs/frontend.log`, `logs/errors.log`.
  - `Node*/CallersLog`, `Node*/callerslog` (AmiExpress legacy casing):
    keep last `log_retention_days` days of entries by parsing the
    timestamp at the start of each block.
  - `Node*/ErrorLog`, `Node*/StartUpLog`: same.
- Tooltype: `LOG_RETENTION_DAYS` already exists (default 90). No new
  config — reuse.
- On first boot after the change, emit a backend warning if any of the
  above files are older than 2× retention, so sysop knows historical
  PII was truncated.

**Automated verification:**
- Unit test: service run against a fixture `CallersLog` with mixed old /
  new entries — only recent kept.
- `tsc --noEmit` clean.

**Manual verification:**
- Inject a line dated 200 days ago into `Node0/CallersLog`, restart
  backend, confirm gone after rotation tick.

---

### Phase 5 — Webhook PII minimisation

**Files:**
- `web/backend/src/services/webhook.service.ts`:
  - Read tooltype `WEBHOOK_INCLUDE_PII` (default `NO`).
  - When `NO`:
    - Replace all `data.username` in payload fields / descriptions with
      `User #${data.userId}` (or `anon` if no id).
    - Strip `data.location`, `data.realname`, `data.email` from any
      embed field arrays.
    - Description becomes generic: `A user logged in`, `A user uploaded
      a file`, etc.
  - When `YES` (opt-in): current behaviour.
- New Schema key `webhook_include_pii: z.boolean().optional()` in
  `config.schemas.ts`. Default `false`.

**Automated verification:**
- Unit test: webhook payload for `NEW_USER` with PII off → description
  has no username, embed fields empty of PII.
- Unit test: webhook payload with PII on → current behaviour preserved.

**Manual verification:**
- Fire a test webhook with `WEBHOOK_INCLUDE_PII=NO`; confirm Discord
  receives a generic message with no handle.

---

### Phase 6 — Privacy documentation

**Files:**
- New: `Documentation/PRIVACY.md`. Contents:
  - Controller name + sysop contact email
  - Data collected (enumerated from the flow)
  - Purposes & legal basis
  - Retention windows (90d logs, infinite profile, user-initiated deletion)
  - Third-party processors (Discord/Slack, Hetzner)
  - Rights & how to exercise (MYDATA / FORGETME)
  - Breach notification pledge (72h best-effort)
  - Notice version history
- Update `Documentation/README.md` to index it.
- Update `README.md` (project root) with a one-line privacy pointer.

**Automated verification:**
- `Documentation/PRIVACY.md` exists and the version number matches the
  constant used in `PRIVACY.TXT` / the consent stamp.

**Manual verification:**
- Read the doc end-to-end.

---

## Success criteria (all phases)

- `tsc --noEmit` clean across the whole backend.
- All new unit tests pass.
- A new user cannot complete registration without consent.
- A pre-existing user cannot reach the main menu after next login without
  backfill consent.
- `MYDATA` returns a readable dump; `FORGETME` irreversibly scrubs a test
  account.
- Default webhooks no longer carry handle/location/email PII.
- `logs/backend.log` and `CallersLog` no longer grow unbounded.
- `Documentation/PRIVACY.md` exists and is linked from the main README.

## Rollout

- Each phase behind a git-trackable commit; no feature flag needed except
  `WEBHOOK_INCLUDE_PII` and `GDPR_ENABLED`.
- Prod (Hetzner) upgrade: standard `git push main` → GitHub Actions →
  `docker compose up -d --build`. Migration runs on startup via the
  existing init path in `database.ts`. Back up `amiexpress-bbs-data` volume
  first (Hetzner snapshot).

## Non-goals / explicit omissions

- Encryption at rest for the database (out of scope; SQLite on a single
  host with disk-level controls is acceptable for hobby scale).
- Cookie banner on the web frontend (web UI is behind JWT, no marketing
  cookies — doesn't trigger ePrivacy Directive's consent requirement).
- Children's consent (Art. 8) — the BBS is 18+ scene context; add a
  single sentence to `PRIVACY.TXT` stating the service isn't intended for
  users under 16 / 18 depending on jurisdiction.
- Right to restriction / object — not meaningfully distinct from erasure
  for a pseudonymous BBS; folded into the erasure flow.

## Appendix A — draft `PRIVACY.TXT` (80-col, ANSI-safe)

```
============================================================================
                            PRIVACY NOTICE (v1.0)
============================================================================

This BBS collects and processes a small amount of personal data so you can
have an account and use the services. By registering you confirm you have
read this notice.

What we collect:
  - Handle, password (stored hashed), and optionally real name, group
    affiliation, phone, and email.
  - Connection metadata: IP address, time, node, session duration.
  - Content you post: messages, uploads, chat logs.
  - Preference flags: screen type, ANSI, editor choice.

Why:
  - Run your account, let you post, and keep the system abuse-free.
  - Legal basis: your consent (this notice) and legitimate interest in
    operating a working BBS.

How long we keep it:
  - Logs and call records: 90 days (rotating).
  - Your profile & posts: until you ask us to delete them (run FORGETME
    at the main menu) or the service shuts down.

Who sees it:
  - The sysop, the hosting provider (Hetzner, Germany), and, if the
    sysop has enabled them, webhook targets (Discord / Slack) for event
    notifications. Webhooks do not receive your real name, email, or
    affiliation by default.

Your rights:
  - MYDATA at the main menu to see a copy of your data.
  - FORGETME at the main menu to request erasure.
  - Contact the sysop for anything else.

This notice is version 1.0. The sysop is: <SYSOP_EMAIL_HERE>.

Not intended for users under 16 (EU) / 18 (US).

Accept privacy notice (y/n)?
============================================================================
```

Real sysop email substituted at boot via an MCI code or a simple
`\$SYSOP_EMAIL\$` placeholder replaced in `displayScreen`.
