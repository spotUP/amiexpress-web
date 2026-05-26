# Handoff

## 2026-05-26 — new-user login flow fixed + MCI regression suite

**Status**: confirmed golden by user.

### Bugs fixed (2 sessions, commits 8f99f5d55..fd6b4b497)

- **BULL screen "not found" error** — added `silent=true` matching express.e:6548-6550
- **~f and ~N literal in menu** — `parseWipeMCI` left a leading `\n` after stripping
  `~WX`, making `allowMCI=false` and disabling all MCI substitution. Fix: strip the
  wipe code's line-ending too.
- **Double-Enter on conference join pause** — `handleCommand` line guard changed
  subState to READ_COMMAND before `paginatedScreen` was dismissed, skipping
  `advanceDisplayFlow`. Added `!session.paginatedScreen` guard.
- **join.txt display ordering** — `onComplete` fired before `processNextScreenSegment`,
  emitting the name prompt before the questionnaire text. Migrated to
  `screenSegments.onComplete` and call after last segment.
- **Name prompt wiped by ~f after join.txt** — inline parseMciCodes queues output
  through a 16ms buffer; `promptForName` emitted directly and arrived first, then
  the buffered `\x1b[2J` cleared it. Fix: `flushOutput(socket)` before `segOnComplete`.
- **First ANSI art line offset in wipe-animated menu** — `parseAnsiToGrid` was
  recording `\x1b[H` (cursor-home from `~f`) into `currentAnsi`; `gridToAnsi`
  re-emitted it as a color prefix, snapping cursor to home mid-row. Fix: only
  update `currentAnsi` for SGR sequences ending in `m`.

### Tests added

- `tests/wipe-mci-allowmci.test.ts` — 6 tests for wipe stripping + allowMCI gate
- `tests/handlers/mci-codes-regression.test.ts` — 61 tests: allowMCI invariants,
  case sensitivity, non-inline mode (wipe path), inline sentinels, width-prefix
- `tests/utils/screen-wipe.util.test.ts` — 2 new regression tests for grid parser

### Open items

- **Corpus reds** — 149 failing integration doors (timeouts + drift assertions)
- **FAME/DD compat layers** — ~380 archive doors use FAMEDoorPort/DD_DoorPort
- **Menu first-line todo** — added by user mid-session, tracked above (now fixed)

---

## 2026-05-21 — corpus integration to 100% testable

**Goal**: take corpus integration from the 175/324 (54%) baseline to
green across the board.

**Result**: 323 pass + 1 documented skip = 324/324 testable.

### Phase-by-phase

| stage                              | pass | total |   %  |
|------------------------------------|------|-------|------|
| baseline (longest-line v1)         |  175 |   324 |  54% |
| Phase 1 — v2 signature picker      |  261 |   324 |  81% |
| Phase 2 — scripted inputs + channel fix |  285 |   324 |  88% |
| Phase 2.5 — per-door isolation     |  320 |   324 |  99% |
| Phase 3 — notes + skip mechanic    | 323 + 1 skip | 324 | 100% |

### Key code shipped

- `dev/scripts/door-corpus/populate-integration-v2.ts` — smarter
  signature picker (reject random-entropy / shaded-block ANSI /
  chrome menu rows; score by name/version/credit; preserve
  `integration.inputs` and other sibling fields).
- `dev/scripts/door-corpus/script-timeout-inputs.ts` — golden-tail
  inspector that writes `integration.inputs` per-door (yn → `n\r`,
  press-RETURN → `\r`, BBS menu present → `g\r` logoff, …).
- `dev/scripts/door-corpus/per-door-test.sh` — workaround for the
  runner's in-process state pollution (each door gets a fresh tsx).
- `web/backend/src/scripts/corpus-integration-runner.ts` — emit
  scripted inputs on BOTH `'command'` (BBS commands) and
  `'door:input'` (XIM keystroke channel — what XIM doors actually
  listen on). Added `integration.skip` / `integration.skipReason`.
- `web/backend/package.json` — new `corpus:integration:per-door`
  script.

### Known runner bug (deferred)

In-process runner accumulates state across doors when run
back-to-back, even with `--concurrency 1`. Doors that pass in
isolation start timing out after ~8 doors in a batch. Workaround:
`per-door-test.sh` (fresh tsx subprocess per door). Real fix
requires unwinding AmigaDoorSession / shared globals — not
trivially small.

### Other work tonight (chronological)

- Untracked 551 already-gitignored runtime artifacts (Node\*/,
  Conf\*/, SysopStats/, logs/, …). Working-tree status: 448 → 354
  entries.
- The 1 skipped door is `mgs__r11_autoreward`. Binary stops
  emitting XIM after `BB_CONFNUM`, presumably doing
  AEDoor.library trap-mediated FS work that hangs. Unlocking
  requires deeper instrumentation. Fixture-state seeding might
  help (door looks at `Playpen/` for uploaded LHAs).

### Commits pushed tonight (8)

```
3b95e6d8e corpus(integration): Phase 3 — last 4 via notes + skip mechanic
e5834ea69 corpus(integration): Phase 2.5 — per-door isolation
c004f4a54 corpus(integration): Phase 2 — scripted inputs unlock 24
611ef4729 chore(gitignore): untrack runtime artifacts
cbac4a969 corpus(integration): v2 signature picker — 86 drift doors
51ebddd72 docs(handoff): evening wrap-up archive + root snapshot
871d0e831 corpus: restore literal UTF-8 in corpus.json
859b7b0ac corpus(integration): baseline triage + smoke gate + plan
```

All on `origin/main`.

---

## 2026-05-20 evening — project wrap-up: audit closeout, corpus baseline, smoke gate

**Full archive**: `thoughts/shared/handoffs/2026-05-20_evening_wrap-up.md`

### Live state at session end
- `https://bbs.uprough.net/health` → 200, revision `5c2db3ca8`.
  Tonight's 6 commits are **local, not pushed yet**.
- SQLite `users` clean: 26 users, all `confaccess` length 14.
- Binary `user.data` slot positions now mirror SQLite `slotnumber`
  (re-aligned via `gh workflow run fetch-live-logs.yml -f log=regenerate-users`).
- Two SQLite files exist on live: `/app/data/db/amiexpress.db` (active)
  and `/app/data/bbs/data/amiexpress.db` (stale, 3 users from old
  import). Audit always probes both.

### Shipped this session (6 commits — `5c2db3ca8..HEAD`, unpushed)

```
871d0e831 corpus: restore literal UTF-8 in corpus.json
859b7b0ac corpus(integration): baseline triage + smoke gate + follow-up plan
7d461beb8 docs(thoughts): archive untracked handoffs + research
de6a24b0c docs(plans): stamp status on the three open plan documents
41578d60e ops(corpus): npm scripts for in-bbs integration corpus runner
5c2db3ca8 ops: confdb-access case — per-conf Conf.DB access flags
```

**Corpus integration runner — wired and baselined.**
The runner existed with 324 entries and integration goldens but had
no npm entry point. Wired:

- `npm run corpus:integration` — all 324, concurrency=1.
- `npm run corpus:integration:capture` — refresh goldens.
- `npm run corpus:integration:smoke` — 175-door green subset (CI-safe).

Baseline run produced **pass=175 fail=149 skip=0**. Categorization
saved to `dev/scripts/door-corpus/triage/2026-05-20_baseline.json`:
63 timeouts, 85 drift (fragile assertions), 1 bogus (fixed:
sent_fe). Full follow-up plan in `thoughts/shared/plans/2026-05-20-
corpus-integration-triage.md`.

**Sneaky-bug audit closed.** Swept for the three patterns the
afternoon fix eliminated (slot-mismatch / fixed-width null-term /
padding masks). No further code changes warranted — every other
slot-indexed reader either uses inline byte loops or is for
correctly null-terminated string fields. Findings in archive.

**Live confaccess backfill — no-op needed.** Active SQLite is
already uniform (26 users × 14-char). Stale legacy DB isn't
connected.

**Live regenerate-users ran clean.** Sysop → binary slot 25, spot →
slot 23, etc. Backups: `*.before-regen-20260520T162948.bak`.

**Plan statuses stamped:**
- `2026-05-18-zmodem-web-unification` → `implemented`.
- `2026-05-11-68k-door-coverage` → `partial` (Phase 1 done).
- `2026-04-28-express-1to1-audit` → `superseded`.

**Source TODOs triaged:** all 5 are intentional design markers
(`audio-video` color renderer, `wizard.handler` template-string
TODO meant for sysop-generated code, `message-scan` doPause with
rationale, `user-commands` D16 parity note, `amiga-parser` admin-
import placeholder). No actionable debt.

### Open items

- **Push when ready.** 6 commits ahead of `origin/main`, none
  destructive, all hook-clean. `git push origin main`.
- **Corpus triage 149 reds** — backlog per follow-up plan. Smoke
  gate covers the green 175 already.
- **68K door coverage phases 2-5** — deferred; no Phase 1
  regressions.
- **Working-tree churn (448 entries)** — mostly runtime artifacts
  (Node*/, Conf*/, Bulletins). Should mostly be `.gitignore`d but
  aren't. Cosmetic.

### Important gotchas (memo to future-me)

- **`json.dump` defaults destroy UTF-8 diffs.** Editing
  `corpus.json` via Python — always `ensure_ascii=False` +
  trailing `\n`. Otherwise every non-ASCII byte rewrites as
  `\uXXXX` and the diff balloons to hundreds of lines.
- **populate-integration heuristic is fragile.** Picks longest
  golden line as `mustContain`. For ~85 doors that line is non-
  deterministic (session IDs, user state, ANSI art). v2 populator
  needed — see follow-up plan.
- **Bash background polling — use `until $PID; sleep 30`, not
  Monitor.** Long sleeps in foreground Bash blow the 5-minute
  prompt-cache TTL. `run_in_background: true` with an until-loop
  gives a single completion notification.
- **Corpus concurrency cap = 1.** Per
  `feedback_avoid_parallel_emulator_heat` — 2+ sustained Moira
  runs spin fans hard.

### Quick resume entry points

```bash
# Push tonight's work
git push origin main

# Smoke corpus (175 known-green, ~25 min)
cd web/backend && npm run corpus:integration:smoke

# Full corpus (324, ~45 min; expect 175/149 until triage done)
cd web/backend && npm run corpus:integration

# Re-trigger the run + re-categorize
mkdir -p /tmp/corpus-triage
cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts --concurrency 1 > /tmp/corpus-triage/full-run.log 2>&1 &
python3 /tmp/corpus-triage/triage.py /tmp/corpus-triage/full-run.log

# Live ops (read-only diagnostic dumps)
gh workflow run fetch-live-logs.yml -f log=users
gh workflow run fetch-live-logs.yml -f log=conferences
gh workflow run fetch-live-logs.yml -f log=confdb-access
gh workflow run fetch-live-logs.yml -f log=backend -f tail=2000 -f grep='ERROR|spawn'

# Force-restart local backend (clears tsx cache)
ps aux | grep -E "tsx.*backend|start-servers" | grep -v grep | awk '{print $2}' | xargs -I{} kill {} 2>/dev/null
rm -rf /var/folders/w6/hc_wf7v94_dcn98mmjb_k9fh0000gn/T/tsx-501/
nohup env LRZSZ_DEBUG=1 ./dev/scripts/start-servers.sh --bbs-only > /tmp/start-servers.log 2>&1 < /dev/null &
disown
```

---

## 2026-05-20 afternoon — multi-file upload fix cluster + parity diff closeout

**Full archive**: `thoughts/shared/handoffs/2026-05-20_session-handoff.md`

Earlier work today: ConfDB pointer writer + sync tests, createUser
slotnumber assignment (fixed `notorious` "account deleted"
lockout), `db.syncConferencesFromDisk` (root cause of "only 4
confs"), callers-log dual-write, U/RZ/Z transfer pipeline fix
(multi-file upload no longer hung), 2 MB playpen floor (U13),
flaggedFilesManager queue cleanup (D5), restricted-comment batch
gate (D16), DREWALL chained-door menu-prompt leak (#15). 21
commits, all pushed and deployed before this evening's session.

---

## 2026-05-19 — ZMODEM web unify shipped; doors cluster fixed; SQLite/disk audit started

**Full archive**: `thoughts/shared/handoffs/2026-05-19_session-handoff.md`

ZMODEM web unification + Phase 4 dead-code deletion, 32 regression
tests, doors-overclock revert, JoinCnf cluster fix, corpus capture
(324 + 320 assertions), `fetch-live-logs.yml` manual-dispatch ops
workflow, live regen of user.data/keys/misc.

The SQLite ↔ disk parity audit started 2026-05-19 was closed
across 2026-05-19 and 2026-05-20 — see
`thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md`.

---

## 2026-05-18 — Overclock bench + in-process corpus tester + WSS endpoint

**Full archive**: `thoughts/shared/handoffs/2026-05-18_overclock_corpus_wss_zmodem.md`

Door overclock bench, in-process integration corpus runner v0.1,
WSS terminal endpoint at `/ws/terminal`, BBSCmd restored from
sanctuary, LOGOFF syscommand.util crash fix.
