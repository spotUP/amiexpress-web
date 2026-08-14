# Handoff

## 2026-08-14 (night) — WIP audit + Tier 0/1/2 execution

Full-project WIP/stub audit (3 agents) → `thoughts/shared/plans/2026-08-14-wip-debt-master-plan.md`
(86 actionable code items, 32 doc opens, emulator stub map). Executed:

- **Tier 0** (29f33083b, live): XIM GET_CMD_TOOLTYPE 707 routing (was mislabeled
  551), honest IconLibrary.PutDiskObject, real node_sessions cleanup, hot-path
  log fix, honest config no-ops. Note: audit's "551 hangs" was WRONG (verified
  551 handled upstream) — fixed the real narrower bug.
- **Tier 1** (3dee329af, live): the restricted-download gate was DEAD in every
  path (no resolver populated comments) — restricted files downloadable by
  anyone; fixed via file-restriction.util wired into all 3 paths. Plus doors
  bypassing conf ACL (BBSApi.joinConference now checks), APPEND_ACCOUNT slot
  collision (real slot alloc), honest ARexx (BBSLAUNCHDOOR/executeAREXXScript).
  SSH-accepts-any = NOT a hole (correct BBS transport model; comment fixed).
- **Tier 2 measurement** (7a567a8d2, pushed): library-call-ledger classifies
  real/stub/missing 68K LVO calls. `ledger-sweep.sh N` aggregates. First
  30-door sample: 26 LVOs ALL real, 0 stub, 0 missing — common doors fully
  served. Audit's S1-S8 stubs are LOW-FREQUENCY tail risks; needs a broad
  sweep (socket/graphics/timer doors or full 3124, ~13h) before implementing.
  Gotchas solved: handleTrap is live path (not handleTrapByOffset — stale
  comment); tsx import+require duplicates singletons; corpus runner hangs so
  sweep uses single-door harness; door stdin must be </dev/null in the loop.

- **Tier 2 CONCLUSION** (fa2cd2a86): targeted sweep of 24 tail-library doors
  (intuition/graphics/socket/math) — STILL 0 stub, 0 missing. Emulator serves
  the entire exercised corpus. gethostbyname/socket/connect/send/recv are real;
  only IoctlSocket is a called stub (harmless no-op, door passed). No
  data-supported stub target exists — do NOT implement S1-S8 blind. Ledger is
  the standing early-warning (task #14). Building measurement first turned a
  multi-week effort into a proven non-issue.
- **Corpus reds RESOLVED** (f3a3cd9cb): all 19 were mostly a stale CI list, not
  broken doors (LEDGER diagnosed). 17 phantom/renamed ids fixed (7 verified
  renames added, 10 gone + who/aquawho dropped). zootility was the one real
  door failure — slow paginated stats outran the 8000ms timeout; bumped to
  13000 + 'ns' pause dismiss. smoke-all now 408 valid ids.
  NOTE: corpus.json got fully reformatted by json.dump (indent change) — huge
  diff, data intact (3170 entries verified). Use minimal sed edits next time.

Open tiers: 4 (SQLite parity — architectural, needs buy-in), plus tasks #12
(CONFTOP mail), #13 (Tier 1 leftovers), #5 (mgs door), #14 (ledger policy).

## 2026-08-14 (evening) — inline-door prompt bugs + GWALL hang fixed live

- **Double prompt / ghost prompt around ~CC_ inline doors** (CONFTOP in
  join screen, DRE!WALL at logon): all three door-exit guards checked
  `screenSegments.segments.length > 0`, but a ~CC_ door in the LAST
  segment runs after shift() (length 0) while screenSegments is still
  set. Fixed with presence check + extracted `postDoorMenuAction()`
  (ea8bc3ffa + b10b0b682, tests in
  web/backend/tests/post-door-menu-action.test.ts). Confirmed by user.
- **GWALL 8s logon hang**: scenewall.bbs.io:1541 resolves but never
  answers. Added 2.5s fail-fast timeout + 5-min circuit breaker
  (fb5256cd5). GWall/index.ts was previously UNTRACKED — now in git.
  Loader runs root index.ts directly; Doors/**/*.js is gitignored.
- **Doors/ volume caveat now in memory**: deploys never update live
  Doors/ — docker-exec cp from /app/default-data + verify
  (memory: doors-volume-sync-after-deploy).
- **Corpus gate honest numbers**: 400 pass / 19 fail / 1 skip of 420.
  Reds: who, wall_mst, rtw, request, glc, sent_fe, zootility, 5d_*
  cluster, conftop_2 (flaky). Runner wall-clock anomaly: 8s-timeout
  doors sometimes take ~58s to report.
- Open: CONFTOP "Cannot write message/bulletine" on weekly reset
  (MAILUSER=eall path); FAME plan awaiting execution; full-project
  WIP/stub audit in progress.

## 2026-08-14 (later) — CONFTOP deployed live; corpus CI gate was silently broken, fixed; FAME plan written

- **CONFTOP fix is LIVE**: pushed 62ffaed05; first deploy silently died
  (server disk 97% full — docker layer extract ENOSPC, workflow still green).
  Pruned build cache + images (freed ~6GB), redeployed, verified /health
  revision + container age + patched bytes (60b0) in BOTH image and the
  persistent volume. NOTE: entrypoint copies Doors/ from image ONLY if
  missing in volume — Doors binary changes need a manual
  `docker exec ... cp /app/default-data/Doors/... /app/data/bbs/Doors/...`
  after deploy.
- **Corpus CI gate (`corpus:integration:ci`) had been silently green on
  0/0 doors**: per-door-test.sh grepped an output format the runner
  stopped emitting long ago. Fixed in 5b24fbefc (verdicts from exit code
  + SKIP/CAPTURED/FAIL rows, unknown ids exit 2). Full 420-door gate
  re-running; corpus has grown to 3170 entries (420 = curated green list).
  conftop_2 shows flaky timeouts unrelated to the Y2K patch (original
  binary fails identically).
- **FAME/DD research + plan**:
  `thoughts/shared/research/2026-08-14_fame-dd-door-compat.md` (protocol
  fully documented for FAME, ~75 doors; DayDream needs 2.4KB library
  disassembly, ~13 doors) and
  `thoughts/shared/plans/2026-08-14-fame-fim-compat.md` (9 TDD tasks,
  awaiting review before execution).

## 2026-08-14 — CONFTOP "Reset date is out of range" root-caused + binary-patched

**Status**: fixed, deployed, verified live (see entry above).

### Root cause (Y2K bug in Conftop v2.3 binary, emulator innocent)

- Door stores resetdate in `Conf*/Conftop.Data` as: word `0x0400` version +
  long resetdate = Unix-epoch seconds + 21600 (hardcoded CST tz, `"CST"` at
  data+0xeee), always midnight. Prior 2026-04-25 research misread this as a
  packed mystery format.
- Reset catch-up loop (Conftop000.x code 0xdd4): advances resetdate by
  DAYS*86400 until it passes `now`, but guards each step with
  `cmpi.l #0x386F0580,d0` (946702720 = **2000-01-01 06:00**) — any resetdate
  past Y2K during a multi-period catch-up → fatal error 6 *before* the file
  rewrite, so the door stays bricked. Fires only when idle gap > 2×DAYS;
  weekly resets through May 2026 worked, the 88-day summer gap killed it.
- Fix: flipped guard `blt.b` (0x6DB0) → `bra.b` (0x60B0) at 0xE80
  (Conftop000.x) / 0xE7C (Conftop020.x). Loop still terminates via the
  `now < resetdate+period` exit. Originals in session scratchpad.
- Verified: orig binary + stale data reproduces exact user error; patched
  binary resets cleanly, resetdate Apr 27 → Aug 10 (15×7 days, alignment
  preserved), full uploader board renders.
- Regression test: `web/backend/tests/conftop-y2k-binary-patch.test.ts`
  (6 tests; fails against unpatched binary — verified by revert).
- `dev/scripts/reset-conftop-data.sh` band-aid now obsolete; door self-heals
  stale Conf2/Conf5 data on next run.

### Gotchas discovered

- Harness `--command CONFTOP000.X` → door parses `.X` as uploaded filename →
  "Cannot find uploaded file" path. Use `--command CONFTOP` for reset/display.
  Corpus entry `conftop_2` uses the `.X` command — only exercises upload path.
- `web/backend` had no node_modules; `SKIP_SDK_PREPARE=1 npm install
  --ignore-scripts` works (backend postinstall web-assets build fails,
  irrelevant for tests). `ts-node` absent → jest TS config fails; render
  config to JSON via tsx and pass `--config <json>`.

---

## 2026-06-03/04 — DOORMAN v2 complete + dist/ enforcement

**Status**: confirmed working by user. Doorman is finished for now.

### What shipped

- **DOORMAN v2** — full blessed UI door: ViewManager state machine, InstalledView, RepoView, DocView, StripView, ConfirmView, InputView, InfoEditorOverlay, FileExplorerOverlay, AmigaGuideViewer. All keys via `screen.on('keypress')` — widget.key() is unreliable with vi-mode lists. ESC handled correctly via ViewManager + `requestClose()` on overlays.
- **AREXX door type badge** — `RX`/`AREXX` now shows as `RX` instead of `??`.
- **InfoEditorOverlay ESC** — `overlay.key(['escape'])` only fires when overlay itself is focused (not children). Fixed by using `screen.on('keypress', _globalKeyHandler)` + `requestClose()` public method called from `InfoEditorOverlayView.onEsc()`.
- **dist/ enforcement** — Burned an entire session because `dist/InfoEditorOverlay.js` was from 10:42, fixes landed 19:49. Three-layer defence: (1) pre-commit hook auto-rebuilds and stages `dist/` when `.ts` door files are staged; (2) Dockerfile `doors-builder` stage runs `npm install -g typescript@5 && tsc` from source — stale committed dist is overwritten at build time; (3) RULES.md Rule 5 + memory updated.

### Key lesson (never again)

TypeScript doors in `Doors/{name}/` run `dist/index.js`, **not source**. Always `cd Doors/{name} && npm run build` then commit `dist/` with the source. The pre-commit hook now does this automatically.

### Dockerfile doors-builder quirks (for next person who touches it)

- `npm ci` against door-manager's `package.json` triggers SDK build scripts via `file:../../sdk` dependency even with `--ignore-scripts` — do not use it.
- `npm install -g typescript@5` (not unversioned — TS6 errors on `moduleResolution:node`).
- SDK symlinked manually: `ln -sf /app/sdk node_modules/@amiexpress/bbs-door-sdk`.
- Full SDK source copied via `COPY sdk ./sdk` so `moduleResolution:node` can follow `.ts` files in `sdk/engines/`.

### Open backlog (not doorman)

- Corpus reds — 149 failing integration doors
- FAME/DD door compat layers

---

---

Older sessions (2026-05-18 .. 2026-05-26) archived to
`thoughts/shared/handoffs/2026-08-14_rollup-of-may-sessions.md`.
