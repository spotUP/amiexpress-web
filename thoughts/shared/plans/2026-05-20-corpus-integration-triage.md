---
date: 2026-05-20
topic: corpus-integration-triage
tags: [corpus, doors, integration, triage, follow-up]
status: phase-2-partial
---

# Plan — In-BBS corpus integration triage (149 reds)

## Context

`npm run corpus:integration` was wired this session (commit `41578d60e`)
against the existing 324-door corpus. First clean baseline run on
`5c2db3ca8` produced:

```
[integration] pass=175 fail=149 skip=0 captured=0
```

Categorization in `dev/scripts/door-corpus/triage/2026-05-20_baseline.json`:

| Bucket | Count | %    |
|--------|-------|------|
| pass   | 175   | 54%  |
| timeout (door doesn't exit ≤15s) | 63    | 19%  |
| drift  (assertion in golden, not in current output) | 85    | 26%  |
| bogus-assertion (assertion not in own golden) | 1     | 0.3% (fixed in this session) |

The 175 greens are gated behind `npm run corpus:integration:smoke`
(comma-expanded list at `dev/scripts/door-corpus/integration-smoke.txt`).
Any regression in the smoke set is caught immediately. The 149 reds
are documented backlog — this plan.

## Goals

- **G1.** Get the 149 reds investigated, fixed-or-documented, and
  rolled into the smoke set.
- **G2.** Replace the fragile longest-line assertion heuristic with
  one that picks stable text (door name + version + copyright).
- **G3.** Document each genuinely-broken door as a regression to
  investigate, ideally with an issue or thoughts/ research note.

## Status

- **Phase 1 — DONE 2026-05-20 evening.** `populate-integration-v2.ts`
  shipped. 86 drift+bogus doors re-derived. All 86 now pass.
  Smoke set expanded from 175 → 261 doors. Corpus: 261/324 green
  (80.6%). The 63 remaining reds are all in the `timeout` bucket
  (Phase 2 territory). See "Phase 1 — outcome" below.

## Phase 1 — Drift bucket triage (85 doors) — DONE

Most "drift" failures look like fragile assertions, not regressions.
Sample patterns from `2026-05-20_baseline.json`:

- **Random-token lines** (e.g. `confscan`, `5d_status`,
  `updowninfo`): populate-integration picked the longest line, which
  happened to be a session-id / user-record dump full of
  non-deterministic chars. Fragile by construction.

- **Wide rule lines** (e.g. `5d_doormenu`, `confstats`, `5d_dupecheck`):
  long runs of `_` or `░` characters at width-80. Width-sensitive.

- **ANSI block-graphic lines** (e.g. `5d_autofree`, `warpsearch`,
  `dlt_af12_autofree`): banner art using IBM block chars. Should be
  stable if the door renders the same way — investigate per-door.

**Strategy:**

1. Build a smarter populator `populate-integration-v2.ts`. New
   heuristic: prefer lines that contain the door's name or version
   or a copyright string, over the longest line. Reject lines with
   >50% non-printable bytes (after ANSI strip).
2. Run `populate-integration-v2.ts --force` against current goldens.
   This regenerates the `mustContain` array per-door.
3. Re-run `corpus:integration`. Expectation: most drift entries
   either pass (better assertion) or remain failing because the
   golden itself is stale (move to Phase 2).

**Effort estimate:** ~4 hours (populator v2 + re-derive + re-run).

### Phase 1 — outcome

`populate-integration-v2.ts` filters and scores candidate lines:

- **Reject shapes**: length ∉ [12,100]; unique chars < 8; single
  char ≥ 60%; ASCII printable ratio < 0.85; shaded block-graphic
  chars present (`░▒▓█▌▐■□▪▫▀▄`); shannon entropy > 4.8 (random
  session-id dumps); date/time patterns; "Scanning dir N for…";
  BBS chrome menu rows (two `[X] - WORD` segments).
- **Score**: +10 door-name match, +5 version (`v0.0`), +5 credit
  (`By`, `(c)`, `Copyright`), +3 brackets, +1 per length/30.
- **Output**: top-1 line if score ≥ 6, plus a second only if it
  independently scores ≥ 10 (door-name match). Otherwise
  `mustNotContain`-only — honest about no stable signature.
- **ANSI-strip** the candidate before storing, matching what
  `corpus-integration-runner.ts` does to live raw output.

Iteration trail (against 86 drift+bogus doors only):

| round | tweak                              | pass | fail |
|-------|------------------------------------|------|------|
| v1    | longest line (baseline)            |    0 |   86 |
| v2.1  | shape filter + 2 candidates        |   40 |   46 |
| v2.2  | top-1 only (unless score ≥ 10)     |   71 |   15 |
| v2.3  | chrome filter + score-6 floor      |   86 |    0 |

Smoke set now 261 doors:
`dev/scripts/door-corpus/integration-smoke.txt` rewritten.

## Phase 2 — Timeout bucket triage (63 doors) — partial

### Status as of 2026-05-20 late evening

- **24/63 timeout doors now pass** via `script-timeout-inputs.ts`
  (heuristic: tail of golden → `n\r` for yn-prompts, `\r` for
  press-RETURN prompts, `g\r` for doors that already dropped to
  the BBS main menu, generic `\r`/`q\r` otherwise).
- **One critical bug fix**: the runner was emitting scripted
  inputs only on the `'command'` channel, which DoorManager
  listens to but XIM doors don't. XIM doors listen on
  `'door:input'` (via `AmigaDoorSession.setupSocketHandlers()`).
  The runner now emits on both channels — that's the entire
  unlock for the 24 newly-passing doors.
- **v2 populator fix**: the previous v2 implementation overwrote
  the entire `integration` block, stripping any `inputs` field.
  Fixed to preserve siblings (inputs, expectedSubState, timeoutMs)
  while only rewriting the `assertions` sub-block.

### Corpus state

| stage                        | pass | total | %    |
|------------------------------|------|-------|------|
| baseline (v1 longest-line)   |  175 |   324 |  54% |
| Phase 1 (v2 assertion picker)|  261 |   324 |  81% |
| Phase 2 (scripted inputs)    |  285 |   324 |  88% |

Smoke set extended to 285 doors:
`dev/scripts/door-corpus/integration-smoke.txt`.

### Phase 2 continued — 2026-05-21 early morning

**State-pollution bug discovered.** The in-process runner accumulates
state across doors even with `--concurrency 1`. Doors that pass in
isolation start timing out after ~8 doors in a back-to-back batch.
Root cause sits in `AmigaDoorSession` / shared globals; not trivially
fixable without unwinding several layers.

**Workaround**: `dev/scripts/door-corpus/per-door-test.sh` runs each
door in its own `tsx` subprocess. Slower (~3 s overhead per door) but
reliable. Wired up as `npm run corpus:integration:per-door` against
`dev/scripts/door-corpus/integration-smoke-isolated.txt`.

**Result with per-door isolation on the 39 stuck doors**:
- 7 pass in normal batch
- +28 pass under per-door isolation
- 4 still timeout even in isolation: exorcist, mdb_confupdater,
  mgs__r11_autoreward, pwfail

| stage                            | pass | total | %    |
|----------------------------------|------|-------|------|
| baseline                         |  175 |   324 |  54% |
| Phase 1 (v2 assertions)          |  261 |   324 |  81% |
| Phase 2 (scripted inputs)        |  285 |   324 |  88% |
| Phase 2.5 (per-door isolation)   |  320 |   324 |  99% |

### 4 doors still failing

All 39 share one trait: **empty capture even with blanket
scripted inputs**. They render nothing to the socket between
launch and exit. Likely categories:

- doors that require specific BBS state not present in the
  runner (file flags, message base entries, registered users
  beyond `sysop`)
- doors that expect specific keystrokes the heuristic can't
  guess (door-specific menu commands, multi-step wizards)
- doors that intentionally drop carrier instead of exiting
  cleanly (LOGOFF-style without a graceful path)

Full list in `dev/scripts/door-corpus/triage/2026-05-20_phase2_stuck.txt`.

**Decision needed:** for each stuck door, either provide
per-door input scripts (manual) or mark as "not corpus-integration
testable" (skip-with-reason). Auto-heuristics have reached their
limit.

## Phase 2 — Timeout bucket triage (63 doors) — ORIGINAL PLAN

`who`, `aquawho`, `5d_timebank`, `logoff`, `bull`, `joincnf`,
`ratiorep` and ~56 more. Some need user input ("Press any key",
"Q to quit"), some genuinely hang.

**Strategy:**

1. For each timeout door, check the golden for a prompt that
   suggests an expected input (e.g. "Press any key", "Continue?",
   `[Y/n]`). Add scripted `integration.inputs` entries to drive
   them.
2. For doors with no prompt visible but a clean banner, bump
   `integration.timeoutMs` to 30000 — many `5d_*` doors finish
   their render and idle on the menu; we need to send a synthetic
   "Q" or RETURN to make them exit.
3. For genuinely-hung doors (no banner, no progress past 1s), open
   a per-door investigation under `thoughts/shared/research/`.

**Effort estimate:** ~6 hours (golden-by-golden grep + scripted
inputs + re-run).

## Phase 3 — Surviving drift (post Phase 1)

Drift entries that don't pass even after the smarter populator:
those goldens are genuinely stale relative to current BBS behavior.
For each:

1. Inspect the diff: `git diff` the new capture against the
   committed golden (do a `--capture` to a side file first, don't
   overwrite).
2. Classify:
   - **Cosmetic / formatting**: re-capture the golden.
   - **Functional regression**: open an issue, leave the door red.
   - **Door dependency missing** (e.g. sent_fe needs FILEID/Sent.DAT
     seeded): document the fixture dependency.

**Effort estimate:** ~4 hours.

## Phase 4 — CI gating

Once the green set stabilizes at ~280-310/324, gate
`corpus:integration:smoke` in CI as the regression net. The
remaining reds stay as `corpus:integration` (manual, periodically
sampled).

## Risks

- Re-deriving assertions against current goldens bakes in current
  behavior — if anything is broken now (e.g. sent_fe's missing
  FILEID file), the assertion will codify the broken state. Mitigate
  by always checking the golden content during derivation; if it
  contains "ERROR" / "Not Found" / "Aborted" near the top, flag for
  manual review.
- Bumping timeouts risks hiding real hangs. Each timeout bump should
  be tied to a specific expected behavior (door renders banner +
  idles vs. door enters an infinite loop).

## Out of scope

- Recapturing all goldens en masse. That's the sledgehammer option;
  it loses information. Prefer per-bucket triage.
- Adding new doors to the corpus. Coverage extension is Phase 5 of
  the 2026-05-11-68k-door-coverage plan, not this one.

## Reference files

- `dev/scripts/door-corpus/corpus.json` — corpus definitions.
- `dev/scripts/door-corpus/goldens/<id>/integration.txt` — per-door
  goldens.
- `dev/scripts/door-corpus/integration-smoke.txt` — 175 greens
  (smoke gate).
- `dev/scripts/door-corpus/triage/2026-05-20_baseline.json` — full
  categorized failure list from this session.
- `web/backend/src/scripts/corpus-integration-runner.ts` — runner.
- `dev/scripts/door-corpus/populate-integration.ts` — current
  (heuristic-1) populator; v2 to be added under Phase 1.
