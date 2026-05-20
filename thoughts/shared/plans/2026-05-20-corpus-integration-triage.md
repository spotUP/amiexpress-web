---
date: 2026-05-20
topic: corpus-integration-triage
tags: [corpus, doors, integration, triage, follow-up]
status: draft
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

## Phase 1 — Drift bucket triage (85 doors)

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

## Phase 2 — Timeout bucket triage (63 doors)

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
