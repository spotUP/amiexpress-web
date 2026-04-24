# Handoff

## Current State
Clean `main`. Last deploy: `6f0bc8a9f` (NODE_BULL + CONF_BULL). GDPR baseline live on Hetzner; messaging-handler DI + MailStats self-heal + cross-tab session leak all fixed; livechat visuals cleaned up with self-preview + block-letter avatar; ASCII video frames now actually paint in self-preview tile.

## Shipped 2026-04-24
- **GDPR Phase 1–6** (`a7ba3058d` merge + follow-ups): privacy notice + consent gate at registration, backfill prompt on first login for pre-GDPR users, W options 19 (view my data) and 20 (delete my account, 3-step confirm + PII scrub), LogRetentionService (10 MB cap), webhook PII stripping (`webhook_include_pii` default false → `User #<id>`), `Documentation/PRIVACY.md`.
- **Registration UX**: `Group Affiliation` relabel, phone optional, required-field reprompt (no retreat), `(Enter to skip)` hints, `NO CARRIER` on abort, v5.6 version banner, silent optional screens.
- **Cross-tab leak** (`9a02dfdb9`): `getSession` prefers `socketId→nodeId→session`; `restore-session` refuses when old socket alive.
- **MailStats self-heal** (`2eec40a52`): undersized `Conf*/Messages/MailStats` files rebuild to 12 bytes instead of throwing.
- **Messaging DI mystery** (`f252613f4`): dynamic `await import()` of messaging.handler replaced with static `require()` / top-level import → fixes `_db undefined` R-command crash caused by tsx ESM/CJS cache split.
- **R reader exit** (`ec12e56f7`): transitions to `DISPLAY_MENU` (matches express.e), no bulletin-chain replay on Enter-at-last-message.
- **Livechat** (`bd6c46e41`, `85a3572c1`, `9013de196`, `02e78c468`): dropped nested video-tile border, removed loud magenta avatar bg, block-letter avatar for no-video, self-preview via unfilter in `voice-channel-ux.ts`, disabled SGR mouse reporting (stopped `[<btn;col;row;M` leaks into chat area), `setVideoFrame` switched to `setContent` (blessed.box has no `setFrame`).
- **Livechat tile keying**: `VideoGrid.tiles.set(userId, ...)` was using the raw value while `updateParticipantVideo` looked up by `String(userId)` — `Map.get(0) !== Map.get('0')`, every frame silently dropped. Both `tiles.set` sites now use `String(userId)`. Self-preview ASCII video confirmed working on localhost.
- **Node/conference screens** (`6f0bc8a9f`): NODE_BULL silent on missing file; CONF_BULL displays on every `joinConference` per express.e:5058.
- **Questionnaire disabled** via `disabled_scripts/` per node; CLAUDE.md rule tightened to require explicit OK before diverging from express.e.

## Regression test fixes (2026-04-24)
- Fixed 12 of 14 pre-existing failing test suites via `fdf10c086`.
- Key production fix: `formatUploadDate` was returning `MM-DD-YY` instead of the correct `DD-Mon-YY` (express.e) format.
- Still failing: `file-hold.util.test.ts` and `info-file.util.test.ts` — both have a deep ts-jest hoisting issue where `jest.mock('path')` / `jest.mock('fs')` don't intercept calls in production modules when those modules are loaded through `setup.ts`→`database.ts` import chain. Requires restructuring mocks to use `jest.spyOn` in `beforeEach` instead of module-level `jest.mock`.
- `file-io.util.test.ts` is intermittently flaky in full-suite parallel runs (passes alone).

## Open / deferred
- **CONFTOP reset-date (#18)** — data wiped locally + prod via `dev/scripts/reset-conftop-data.sh`. Root cause is inside the 68K `Conftop020.x` binary; disassembly out of scope.
- **`Doors/livechat/server.ts`** is 2360 lines, above the 2000-line pre-commit hook. Bypassed with `SKIP_SIZE_CHECK=1` for single-line fixes. Due a feature-based split.

## Gotchas
- **tsx ESM/CJS split cache**: never use dynamic `await import()` for a module that already has a static import in the same file — they resolve to different instances with different module-scoped state. Always use `require()` or re-use the static binding.
- **Pre-commit size hook**: blocks files over 2000 lines. Bypass only with `SKIP_SIZE_CHECK=1` for minor fixes where the oversize is pre-existing.
- **`.info` files contain high-bit bytes**: edit via `sed`/python/git only. `Edit`/`Write` tools corrupt them.

## Debugging
- Backend log: `logs/backend.log`. Markers: `[setMessagingDependencies]`, `[LogRetention]`, `[SessionManager]`, `[JOIN]`, `[gdpr]`.
- Container log: `ssh root@89.167.21.154 "docker logs amiexpress-bbs --tail=200"`.
- **User manages servers manually** — never run `start/kill-servers.sh` unprompted.

## Deployment
Push to `main` → GitHub Actions → `docker compose up -d --build` on Hetzner. Web: https://bbs.uprough.net. Telnet: `telnet 89.167.21.154 2323`.

## Suggested next session
- Smoke Phase 3: `W` → 19 (view data), `W` → 20 (abort at each of the 3 confirm steps; end-to-end erase on a throwaway account).
- Verify webhook PII stripping if a Discord/Slack webhook is configured.
- If splitting `livechat/server.ts` becomes urgent, start by extracting menu/voice/chat setup into `features/`.
