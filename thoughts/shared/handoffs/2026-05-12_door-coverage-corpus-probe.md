---
date: 2026-05-12
topic: door-coverage-corpus-probe
tags: [emulation, doors, lvo, corpus, probe, arexx, session-handoff]
status: final
---

# Session handoff — 2026-05-12 — Door coverage: corpus + probe + LVO sweep

## Tasks worked on

Multi-day arc continuation. Mandate from user: "do everything we need to
do to get 100% door coverage; i don't care in what order or how; be
efficient; kick ass, make doors work."

Built and shipped:
1. CI-runnable door regression corpus (38 doors green).
2. Per-door diagnostic probe + bulk-probe-of-universe + coverage-report
   + timeout-cluster miner tools.
3. 29 LVO stub→real implementations (every stub the universe touches).
4. AREXX TS-interpreter regression tests (5 fixes pinned).
5. 38 door binaries installed under `Doors/<Name>/`.

## Critical references

**Tooling under `dev/scripts/`:**
- `door-corpus/run.ts` — regression diff runner (`-j 4` parallel).
- `door-corpus/corpus.json` — 38-door manifest.
- `door-corpus/goldens/<id>/{output.txt,trace.txt}` — frozen reference.
- `door-corpus/README.md` — add-a-door + refreeze workflow.
- `door-probe/probe.ts` — single-binary diagnosis (md/JSON report).
- `door-probe/bulk-probe.ts` — universe scan, `--shard I/N`,
  `--skip-existing`, `--concurrency N`.
- `door-probe/coverage-report.ts` — clean-exit %, stub ranking,
  candidates from cached bulk-probe data.
- `door-probe/timeout-clusters.ts` — group timeout doors by trailing
  prompt + suggest input bytes.
- `door-probe/README.md` — workflow guide.

**Tests:**
- `web/backend/tests/corpus/door-corpus.test.ts` — jest wrapper, skips
  on `SKIP_DOOR_CORPUS=1`.
- `web/backend/tests/services/arexx-interpreter-fixes.test.ts` — pins
  5 AREXX TS-interpreter fixes.

**npm scripts (in `web/backend/package.json`):**
- `npm run test:corpus` — jest wrapper
- `npm run corpus` — direct runner
- `npm run corpus:capture` — refreeze
- `npm run probe -- <binary>` — single probe
- `npm run coverage:report` — universe coverage from `/tmp/bp-full/`
- `npm run clusters:report` — timeout clusters

**Source code touched:**
- `web/backend/src/amiga-emulation/api/library-vectors/exec-vectors.ts`
  — 24 new LVO entries (exec.library family).
- `web/backend/src/amiga-emulation/api/library-vectors/dos-vectors.ts`
  — 11 new LVO entries (dos.library family).
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` — added
  `portsInExecList: Set<number>` for RemPort membership-guard,
  `remPort()` + `freeSignalPublic()` accessors.
- `web/backend/src/amiga-emulation/api/DosLibrary.ts` — added
  `FindDosEntry`, `LockDosList`, `UnLockDosList`, `AttemptLockDosList`,
  `NextDosEntry` methods.
- `web/backend/src/amiga-emulation/xim/system-commands.ts` —
  PRV_COMMAND queues for post-exit dispatch (was forcing
  `allowSyscmd=false`).
- `web/backend/src/handlers/command.handler.ts` —
  `startBatchUploadTransfer` aborts cleanly on telnet/SSH
  transports.
- `web/backend/src/scripts/run-amiga-door.ts` — stdin scripted-input
  support (`<delayMs> <bytes>` per line).
- `web/backend/src/services/arexx.service.ts` — 5 interpreter fixes
  (TRIM builtin, `call`-label recursion bound, bare-symbol clause to
  ADDRESS, IF;THEN re-stitch, PROMPT line-mode).
- `web/backend/src/services/arexx/engine-selector.ts` —
  `AREXX_ENGINE` env-var override.
- `web/backend/src/services/arexx/rexx-host-dispatch.ts` —
  `interp.bbsFunctions.*` (was undefined `interp.bbs.*`).
- `web/backend/src/services/arexx/rexxmast-service.ts` — heap
  watchdog on daemon-drive (defensive, 300 MB delta bail-out).

## Recent changes (11 commits)

```
bbc5a156f docs(handoff): refresh with full session arc (10 commits)
7ed0b0453 feat(door-corpus): +2 doors from timeout-cluster mining
57dd258d1 feat(door-probe): timeout-cluster miner + .library filter
795018918 feat(emulation,doors): batch 4 LVO impls + coverage-report tool
962fb6224 docs: session research note — what's proven, probable, deferred
ff7aa95ce feat(door-probe): --shard I/N for race-free parallel bulk-probe runs
62be1ebb7 test(arexx): regression tests pinning 2026-05-11 interpreter fixes
929e7eefb perf(door-corpus): parallel runner cuts 36-door run from ~3min to ~80s
bc2d16a8c docs(door-testing): document corpus + probe tools; wire npm scripts
733068905 feat(door-corpus): time-mask diff for live-clock renderers
d72cc0fdd feat(emulation,doors): full LVO coverage + regression corpus + door probe
```

All 11 commits on `main`. **Not yet pushed to remote** (Hetzner auto-deploys
on push; user hasn't asked).

## Learnings

- **`DosLibrary.handleCall` switch is dead code.** Only invoked from
  `.fixapi` legacy stubs. Active LVO dispatch path is `DOS_VECTORS` in
  `library-vectors/dos-vectors.ts`. Same for `ExecLibrary` + EXEC_VECTORS.
  Adding a switch case in the library class is a no-op; you must add a
  vector entry. Cost me ~30 min in batch 1 chasing this.
- **RemPort is destructive on a port-not-in-list.** The raw impl writes
  to memory at `port + 0` (succ) and `port + 4` (pred), then rewrites
  the global PortList head/tailPred. For a port the door allocated but
  never AddPort'd, those bytes are arbitrary → corrupts the global list.
  Membership-guarded via `portsInExecList: Set<number>`.
- **Stub returning input pointer causes spin loops.** Auto-installed
  stubs return D0 unchanged (= D1 input). Doors that
  `while ((dl = NextDosEntry(dl, flags)))` see the same dl pointer →
  infinite loop. Real impl returns 0 for empty list → first call
  breaks the loop. Same pattern with MatchNext (98 167 calls in a
  6-sec window from one door before our fix).
- **The DOS-list family is "empty synthetic list" by design.** No
  AddDosEntry registers anything on our side, so LockDosList returns
  sentinel `0x1`, NextDosEntry/FindDosEntry return `0`, UnLockDosList
  no-ops. Doors that walk the list see "nothing matched" and exit
  cleanly. Sufficient for every door in the 1 489-archive sample;
  if a door REQUIRES a real device list it'll need a real impl
  (we'd add `bbs:`, `doors:`, etc. as synthetic entries).
- **Door corpus traces are non-deterministic if not normalised.** Two
  issues surfaced and got fixed:
  1. Time-mask: `HH:MM:SS`, `HH:MM` (with truncated minutes —
     `easystatus` renders `16:0Main` flush against next field),
     `Dow DD-Mon-YYYY` patterns get masked before diff.
  2. Trace ordering: `[LockTrace]` lines are async-emitted and jitter
     position relative to other traps. Filter drops them from
     `trace.txt`.
  Also: a door that prints multiple time-frames per second (5D-Clock)
  is fundamentally non-deterministic even with masking — dropped
  from corpus.
- **`info-editor set <KEY> <val>` writes `!KEY=...`** (the disabled
  marker). When the .info uses the fallback parser this trips the
  door's GetDiskObject lookup. For configs like `bbsConfig.info` use
  env var overrides instead (e.g. `AREXX_ENGINE=ts`).
- **Bulk-probe contention breaks corpus runs at default timeouts.**
  Corpus per-door timeouts bumped to 30 s + concurrency reduced to 1
  recovers stability under load. With bulk-probe paused, corpus runs
  at `-j 4` finish in ~80 sec.
- **Probe parser regex captures `JH_HK (Hotkey` without closing paren.**
  Cosmetic — `cmd=N (NAME, ...)` matches up to the first `)` which is
  inside the inner paren. Op names display as `JH_HK (Hotkey` everywhere.

## Artifacts

- Plan: `thoughts/shared/plans/2026-05-11-68k-door-coverage.md`
- Session research: `thoughts/shared/research/2026-05-12_door-coverage-session.md`
- Initial install research: `thoughts/shared/research/2026-05-11_sent_fe-door-install.md`
- Rolling state: `handoff.md` (root, 6.3 KB / 124 lines)
- Bulk-probe cache: `/tmp/bp-full/results/` (2 575 archives cached;
  `--skip-existing` resumes the remaining ~568)

## Next steps (ordered)

1. **Resume bulk-probe** to finish the last 568 archives:
   ```
   npx tsx dev/scripts/door-probe/bulk-probe.ts \
     /Users/spot/Code/amiexpress_doors/Archives \
     --timeout 6000 --out /tmp/bp-full --skip-existing --concurrency 1
   ```
   ~30 min wall-clock at single concurrency. Or use `--shard I/N` for
   parallelism (3-4 instances safe).
2. **Run `npm run coverage:report`** on the completed cache for the
   final stub/coverage ranking. Confirm zero remaining stubs across
   the full universe.
3. **Run `npm run clusters:report --top 30 --min 3`** to see the
   final cluster map. Pick 5-10 high-leverage clusters and expand
   the corpus via scripted-input entries (each cluster representative
   is one corpus.json addition + `npm run corpus:capture <id>`).
4. **Consider pushing to remote.** 11 commits ahead of `main`,
   triggers Hetzner auto-deploy via GitHub Actions. User has not
   explicitly asked; confirm before pushing.
5. **Investigate native AREXX engine OOM** (deferred — see
   `thoughts/shared/research/2026-05-12_door-coverage-session.md`).
   The native daemon-driven dispatch via MOIRA + RexxMast has a
   heap-growth issue under long scripts. Worked around via
   `AREXX_ENGINE=ts`. Real fix needs deep emulator-bridge work.
6. **Document the new tooling in `Documentation/4-Door-Developers/`**
   so external door authors discover it. Currently only in
   `Documentation/3-Developers/DOOR_TESTING.md` (this session).

## Other notes

- **System is CLEAN.** Background bulk-probe + emulator subprocs all
  killed. `ps aux | grep -E "bulk-probe|amiga-door|tsx.*probe" | wc -l`
  = 0. Lockfile clean. No zombies.
- **typecheck clean** on all changes (`cd web/backend && npx tsc --noEmit`).
- **378/378 in-scope tests pass** (46 arexx + 331 amiga-emulation +
  the 5 new arexx-interpreter-fixes). 332 pre-existing test failures
  in `tests/database/*`, `tests/handlers/chat-*`, `tests/api/*` are
  full-BBS fixture tests unrelated to this session's changes.
- **Don't blow the 10 KB cap on `handoff.md`** when adding to it —
  currently 6.3 KB / 124 lines. If you add a new session prepend the
  new entry and trim the older one.
- The user-typed phrase that captures the bar: **"make doors work"**.
  Treat the 2 311 (so far) clean-exit doors as *probably* working,
  not *proven* working. To prove, run through the BBS UI or
  scripted-input. Phase 3 territory.

## Quick reset for the next session

```
cd /Users/spot/Code/amiexpress-web
git status                                   # expect clean tree
git log --oneline e6e8f8e11..HEAD            # 11 commits this session
ls /tmp/bp-full/results | wc -l              # ~2575 cached probes
npm --prefix web/backend run corpus          # verify 38/38 still green
npm --prefix web/backend run coverage:report # current universe state
```
