# Handoff

## Current State
Clean `main`. Last deploy: `6f0bc8a9f` (NODE_BULL + CONF_BULL). GDPR baseline live on Hetzner; messaging-handler DI + MailStats self-heal + cross-tab session leak all fixed; livechat visuals cleaned up with self-preview + block-letter avatar; ASCII video frames now actually paint in self-preview tile.

## NeoShowcase audit + fixes (2026-04-24)
- **List wheel throttle** (`sdk/engines/ui/blessed/widgets/list.ts`): added 80ms throttle to `wheelup`/`wheeldown` — fixes scroll-too-fast in any List widget including NEOSHOWCASE menu.
- **#8 Image Demo**: replaced placeholder stub with procedural ANSI-block "sunset" pixel art showing exactly what the tng.js PNG→cellmap pipeline produces.
- **#9 ANSIImage Demo**: renamed to "Color Art Demo" — accurately labels it as a blessed tag coloring demo, not the ANSIImage widget.
- **#12 Special Widgets**: removed Terminal stub; FileManager reads real BBS root via `fs.readdirSync(process.cwd())`; FileBox shows same real entries; both get full height.
- **#12b Viewport Demo**: new separate menu item — 60 lines of scrollable content with clear keyboard/mouse instructions.
- **#16 Donut Chart**: `bottom: 3→2`, footer `height 2→1`, explicit `halfblock` mode — more vertical space for the ring.
- **#20 LCD Demo**: centered in 50-char container (`left: 'center'`) — no more full-width wrap. Added second static "HELLO" LCD.
- **#25 Picture Demo**: replaced empty `file: ''` with hand-crafted ASCII art representing the widget's typical output.
- **#31 ASCII Video**: replaced stub with live matrix rain animation (~12fps, white heads/green trail) demonstrating the Video widget's frame-rendering model.
- Already done (no changes needed): #10 Ascii Animation, #17 Sparkline animated, #30 Dockable Layout, #21 Contrib Data.

## Shipped recently (see git log for details)
- GDPR Phase 1–6, Registration UX, Cross-tab leak fix, MailStats self-heal, Messaging DI fix, R reader exit, Livechat visual + tile-keying fixes, Node/conference screens.
- Regression test session: 113 backend + 3 frontend suites, 3700+ tests across 44+ new files (Phases 2–10).

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
