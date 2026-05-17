# Handoff

## 2026-05-17 — Telnet/SSH/web login unification

Full plan: `/Users/spot/.claude/plans/do-the-full-ssh-telnet-web-wobbly-castle.md`.

### Status

Telnet/SSH/web login + post-auth code paths unified through a single
service (`web/backend/src/services/login-post.service.ts`
`runPostAuthLogin`). Web's behaviour is the source of truth; telnet/SSH
now inherit the full post-auth pipeline (MULTICOM, webhook, session
migration guards, disk-backed accountLocked/forcePwdReset, LOGON syscmd,
mailOnLogon, etc.) plus per-transport adapters where the UX naturally
differs (modal vs. line-buffered).

### Commits on `main`

| SHA | Type | What |
|---|---|---|
| `0e918a356` | chore | LoginEmitter interface + skeleton services (no call sites). |
| `04d647896` | refactor | Web `socket.on('login')` routes through `runPostAuthLogin`. auth-socket-handlers.ts dropped 1527 → 1086 lines. |
| `d289acdd2` | refactor | Telnet/SSH LOGON-state handler routes through `runPostAuthLogin`. command.handler.ts dropped 4564 → 4420 lines. `session.loginInputHandler` short-circuit added before LOGON state check. |
| `992f98679` | feat | Telnet/SSH PWFAIL on excessive password failure + per-attempt CallersLog entry. Extracted `getMaxPasswordFails` to `password-policy.util.ts`. |
| `7cfb5c38a` | feat | Telnet/SSH line-buffered forced-password-change adapter (`promptForcedPwdChange` in `login-prompt.service.ts`). Reuses `validateNewPassword` + `loadPasswordPolicy` shared utils. |

### New files

```
web/backend/src/types/login-emitter.ts          LoginEmitter interface (Socket-compatible)
web/backend/src/services/login-post.service.ts  runPostAuthLogin + runPwfailAndLogoff
web/backend/src/services/login-prompt.service.ts promptForcedPwdChange (telnet/SSH)
web/backend/src/services/password-policy.util.ts validateNewPassword + loadPasswordPolicy + getMaxPasswordFails
web/backend/src/utils/password-strength.util.ts checkPasswordStrength (extracted from inline)
```

### Telnet/SSH features now at parity with web

- `MULTICOM` registration (WHO doors list telnet users).
- Webhook `USER_LOGIN` notification.
- Disk-backed `accountLocked` / `forcePwdReset` / `pwdLastUpdated` checks.
- Forced password change (line-buffered prompt loop with 3-retry budget).
- PWFAIL syscmd + `\t* Password Failure *` CallersLog write on excessive failures.
- Per-attempt `\tPassword Failure (xxxx)` CallersLog entries (masked).
- `session.user.lastLoginBeforeUpdate` (conference "new since" scan).
- `mailOnLogon`, `LOGON`/`LOGON{n}` syscmds (these landed earlier in `df643ca79`).

### Parity gaps still open (intentionally deferred)

1. **Email-based password reset** on telnet/SSH. Web has it (offered when SMTP + user.email + MAIL_ON_PWD_FAIL enabled, drives await_confirm → await_code → await_new_password). Telnet/SSH would need a line-buffered adapter in `login-prompt.service.ts` (`promptPasswordReset`) and the failure-path in `command.handler.ts` to call it. Skeleton signature exists; body throws. Pure additive — telnet currently just bumps PWFAIL on excessive failures instead.

2. **GDPR consent backfill** on telnet/SSH. Web has `promptGdprBackfill`; the shared service skips it for non-web (`if (isWeb && !gdprConsentAt)`). Telnet/SSH users with no consent stamp bypass the gate — sysop can backfill via SQL. Add a `promptGdprConsent` line-buffered adapter when this becomes a real concern.

3. **Web/telnet forced-pwd-change code paths still diverge internally.**
   Web uses its existing `forced-pwd-change-input` socket handler (~280
   lines in `auth-socket-handlers.ts:1316+`). Telnet uses the new
   `promptForcedPwdChange` adapter. Both validate via the same
   `password-policy.util.ts`, but the post-pwd-change tail (callersLog
   / systemStats / webhook / preferences / LOGON screen / bulletin
   flow) is duplicated between the web handler and `runPostAuthLogin`'s
   tail. A future refactor could collapse them by having web's socket
   handler also fall through into `runPostAuthLogin`'s tail.

### Live-only symptoms still parked (out of scope, NOT a refactor regression)

User confirmed both of these reproduce on `bbs.uprough.net` but NOT on localhost:

- **BBSTITLE cursor overlap** (Username prompt drawn inside the ASCII banner). The `~SMC|` fix was committed and the volume verified to contain the correct file (`docker exec amiexpress-bbs xxd /app/data/bbs/Screens/BBSTITLE.txt | tail` shows `7e53 4d43 7c0a`). Likely a cached `terminal-D0r5lDjn.js` bundle (last-modified May 12) at the browser or CDN edge.
- **Access-level rejects** (`j 2 → Command requires higher access`). Localhost works correctly post-login as sysop. Live volume may have a stale `Conf6/Commands/BBSCmd/J.info` (uppercase J vs. mixed case) or the cache miss in `loadCommands` is hitting a different conference path than localhost. Recheck after a forced `docker compose up -d --force-recreate` clears the volume's cmd cache.

### Deploy

- Hetzner workflow (`.github/workflows/deploy-hetzner.yml`, hardened in `1212ac64b`): does git fetch + hard reset, `docker compose up -d --build --force-recreate`, container-age check (≤300s), `/health` probe. Hard-fails if any of those falter.
- Push to `main` triggers it automatically.
- Hetzner Cloud Firewall opened for 64128/tcp + 31337/tcp during the prior session (via API token; rotate that token if it was logged).

### Next session — punch list

1. Push the 5 unification commits if not yet (`git push origin main`).
2. Watch deploy: `gh run list --workflow=deploy-hetzner.yml --limit 1`.
3. Verify on live:
   - Web login still works (browser).
   - `telnet bbs.uprough.net 64128` login as sysop → `j 2` joins conf 2.
   - `ssh -p 31337 sysop@bbs.uprough.net` same.
   - `WHO` on web shows telnet/SSH users.
   - Forced password change via telnet: set `pwdLastUpdated` to past + `password_expiry_days` low for a test user, telnet in, complete the line-buffered prompts, verify next login works.
4. If the live-only render/access-level symptoms persist after deploy, investigate the volume's cmd cache freshness (`docker exec amiexpress-bbs ls -la /app/data/bbs/Commands/BBSCmd/` vs git HEAD).
5. Optional follow-ups: line-buffered `promptPasswordReset` + `promptGdprConsent` adapters; collapse web's `forced-pwd-change-input` socket handler tail into `runPostAuthLogin` for full deduplication.

### Prior sessions archived

- `thoughts/shared/handoffs/2026-05-16_door-bug-batch.md` — 4-door batch fix + MASTERMIND parked.
- `thoughts/shared/handoffs/2026-05-16_mastermind-deep-dive.md` — Imploder-family unpacker analysis.
