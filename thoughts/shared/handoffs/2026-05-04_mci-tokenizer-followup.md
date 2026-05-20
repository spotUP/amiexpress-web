---
date: 2026-05-04
topic: mci-tokenizer-followup
tags: [mci, screen, tokenizer, express-parity]
status: implemented
---

# Handoff — MCI tokenizer follow-on

## Status

**Migration complete + strict fall-through shipped.** Tokenizer is now
in **strict express.e mode** for non-inline rendering: unknown `~XYZ`
codes have the `~` consumed and the cmd content emits as plain text
(express.e:5290-5402 ELSEIF chain — no final ELSE, pos doesn't advance,
outer aePuts2 emits the unmatched cmd as plain text). Inline mode keeps
soft fall-through so the sequential regex below the tokenizer can still
catch `~CC_`/`~SS_`/`~SR_`/`~SX_`/`~SP`/`~f` in document order with
full pause-and-resume semantics.

All side-effecting `~`-codes that previously ran as post-tokenizer
regexes (`~CR_<prompt>||`, `~SM_<menu>||`, `~CC_<cmd>|`, `~SMO`,
`~SMC|`, `~SP.`, `~SP\\r\\n`, `~CR.`, `~NSF`, lone-`~`-line CLS) now
run as a pre-tokenizer pass; the tokenizer sees them already
substituted. `~SMC|` had a pre-existing bug where it cleared local
`slowmo` but not the returned `slowmoApplied` — fixed in the same pass.

569 passing tests across 26 MCI/screen/batch/menu/message/command
suites; 0 new regressions (4 unrelated DB-dependent suites fail
without a real DB — pre-existing).

## Recent changes (this session, 2026-05-04)

- `web/backend/src/utils/mci-tokenizer.util.ts`
  - Added `MciPrefixHandler`, `MciPrefixDispatchMap`, `MciDispatchConfig`.
  - Handler return type widened to `string | undefined` so handlers
    can signal "no match" (used by `~SP`/`~CR` width-gate).
  - `processMci` accepts either a flat `MciDispatchMap` (legacy) or an
    `MciDispatchConfig`. Backward compatible.
  - Prefix dispatch tries longest prefix first; suffix is sliced from
    the ORIGINAL cmd (case preserved for file paths).
  - Strict fall-through option: `softFallThrough: false` makes the
    tokenizer match express.e exactly (consume `~`, emit cmd as plain).
- `web/backend/src/handlers/screen.handler.ts`
  - Added `SP`, `F`, `W` to `userInfoDispatch` (exact match).
  - Added `prefixDispatch` with `X`, `Y`, `W` (suffix-parameterised).
  - Removed post-tokenizer regex stages for `~SP`, `~f`, `~w`, `~x`,
    `~y`, including the now-unused `mciRegex` / `escapeRegex` /
    `applyWidth` helpers (-90 lines net pre-merge of helper removal,
    -52 actual once handlers are added back).
  - **Express.e parity fixes** rolled in via the migration:
    - `~SP|` no longer renders a literal space — sets `hasPause` and
      emits `''` (express.e:5455-5461 `doPause()`).
    - `~x<n>|` now emits `\x1b[;<n>H` (row 1, col n) per express.e:
      5478-5486; previous build emitted `\x1b[<n>G` (column-only),
      a divergence.
- `web/backend/tests/utils/mci-tokenizer.util.test.ts`
  - 11 new tests for prefix dispatch, strict fall-through, and width-
    conditional handlers.
- `web/backend/tests/handlers/screen-handler.test.ts`
  - 9 new regression tests pinning the migrated behaviour at the
    integration level (~SP, ~SP\n bare, ~5SP width-gate, ~f, ~F,
    ~x10, ~y5, ~5w, ~w5).

## Critical references

- **Tokenizer:** `web/backend/src/utils/mci-tokenizer.util.ts`
  - `processMci(input, dispatchOrConfig, terminator='|') => string`
  - `applyMciWidth(value, width)` for handlers that truncate.
  - Soft fall-through default; opt-in strict via `softFallThrough: false`.
- **Caller integration:** `screen.handler.ts:39` (import),
  `screen.handler.ts:651-771` (exact dispatch + SP/F/W handlers),
  `screen.handler.ts:773-800` (prefix dispatch + tokenizer call),
  `screen.handler.ts:802-816` (bare-`~SP\r\n` fallback + lone-`~`
  WEB extension).
- **Express.e source of truth:**
  - `processMci` outer flow: `express.e:5769-5802` (find next `~`,
    emit text, call `processMciCmd` to advance pos).
  - `processMciCmd` dispatch: `express.e:5258-5410`.
  - Width prefix semantics: `express.e:5288` + `aePuts2`.
  - `~SP` pause: `express.e:5455-5461` (`(maxLen=-1) AND (StrCmp(cmd,'SP'))`).
  - `~CR` keypress wait: `express.e:5462-5468`.
  - `~f` clear screen: `express.e:5469-5471` (`StrCmp(cmd,'f')`).
  - `~w` delay: `express.e:5472-5477` (`StrCmp(cmd,'w')`).
  - `~x<n>` row-1 col-n: `express.e:5478-5486` (StringF `[;\dH`).
  - `~y<n>` row-n col-1: `express.e:5487-5495` (StringF `[\d;H`).
- **Tests:** `tests/utils/mci-tokenizer.util.test.ts` (27),
  `tests/mci-ff-flagged-files.test.ts` (3),
  `tests/handlers/screen*` (24),
  `tests/services/batch-scheduler.test.ts` (5+).

## Express.e divergences kept (case-insensitive matching)

The handoff session that landed the tokenizer documented this as
"express.e uses StriCmp" — that is **incorrect**. Express.e uses
`StrCmp` which is case-sensitive: `~c0` matches but `~C0` does NOT.
The tokenizer's `cmd.toUpperCase()` is therefore a real divergence
(both forms now match).

This divergence was kept because:
1. The `case-insensitive code matching` test (`mci-tokenizer.util.test.ts:99`)
   already documents the choice ("Author-typo defence").
2. Real screens have used lowercase exclusively for years — uppercase
   forms wouldn't have substituted on Amiga, so sysops avoided them.
3. Reverting to byte-exact matching would require splitting the dispatch
   keys into the express.e exact case mix (lowercase `c0..c7`,
   `b0..b7`, `z0..z7`, `n1..n9`, `f`, `w`, `x`, `y`, `q`, `h`; uppercase
   everything else) — touchable in a future "byte-exact express.e"
   pass if needed.

If exact byte parity matters later, drop the `cmd.toUpperCase()` in
`processMci`, change all dispatch keys to express.e case, and update
the case-insensitive test.

## Next steps (ordered)

All three previously-deferred items resolved this session:

1. **[DONE] Express.e byte-exact case mode shipped.** Tokenizer
   gained a `caseSensitive` config flag (default `false` for
   backwards compatibility); screen.handler.ts opts in with
   `caseSensitive: true`. Dispatch keys updated to express.e exact
   case: lowercase `c0..c7`/`b0..b7`/`z0..z7`/`n1..n9`/`f`/`w`/`x`/
   `y`/`q`/`h`; uppercase `N`/`UL`/`SP`/`CR`/`AK`/etc. The
   `case-insensitive` test in `mci-tokenizer.util.test.ts` continues
   to pin the legacy default; new tests pin byte-exact behaviour.
   Tree-wide screen sweep (item 2) confirmed real screens already
   use express.e exact case so flipping this on is safe.

2. **[DONE] Tree-wide screen sweep.** Audited `Bulletins/`,
   `Screens/`, `Conf*/Bulletins/`, `Conf*/Screens/`, `Node*/`. No
   real screen file uses `~x<n>|` or `~y<n>|`, so the row-1-col-N
   express.e parity fix has zero impact. All `~`-codes in real
   screens already use express.e exact case. Recorded counts:
   `~f` (lowercase, 395), `~SP` (uppercase, 345), `~SS` (306),
   `~CC` (195), `~CL` (43), `~XI`/`~XC` (12 each), `~SR` (6),
   `~c` (lowercase, 6), `~N` (5), `~SMO` (2), `~q` (1). No
   uppercase variants of lowercase-only express.e codes were found.

3. **[DONE, partial] Inline-mode regex aligned to byte-exact.**
   `screen.handler.ts:944` inline regex now matches express.e
   StrCmp byte-exact: lowercase `f` only, removed the spurious
   `2S` alternative (express.e has `SX_`, not `2S` — a typo from
   the original port). Full sentinel-based dispatch unification
   was scoped out of this session because it requires re-
   architecting file display (`filesToDisplay` + `{{DISPLAY_FILE:N}}`
   placeholders), command queueing, and ~SP pause-and-resume
   semantics. The current architecture is correct; only the
   conceptual asymmetry between `softFallThrough: inlineMode`
   (soft for inline, strict for non-inline) remains. Documented as
   a future architectural cleanup in `screen.handler.ts:944`
   comment.

## Artifacts

- Tokenizer + dispatch changes: working tree (uncommitted).
- New tests: working tree (uncommitted).
- Original handoff (this file) archived in `thoughts/shared/handoffs/`.
- Backlog memory: `~/.claude/projects/-Users-spot-Code-amiexpress-web/memory/project_door_bug_backlog.md`.
- Current root `handoff.md`: not updated by this session (still
  reflects prior work).

## Other notes

- Hetzner deploy auto-fires on push to main. Verify with
  `gh run list --limit 3` after pushing; container restart visible
  via `ssh root@89.167.21.154 'docker compose ps'`.
- 332 jest failures with `SKIP_DB_INIT=1` are PRE-EXISTING (all 38
  failing suites are DB-dependent — chat-repo, user-repo, gdpr,
  e2e/integration, message-repository, message-pointers,
  message-scan-parity). Not regressions from MCI work.
- Pre-existing uncommitted state at end of session:
  - `dev/scripts/arexx-{smoke,trace}.ts` (diagnostic scripts).
  - `web/backend/src/services/arexx-file-io.ts` (Phase 7 helper?).
  - `thoughts/shared/handoffs/2026-05-04_audit-*.md` (other session
    handoffs, leave per gitignore).
  - Runtime noise (`Bulletins/`, `Conf.DB`, `Screens/quicknew*`, log
    files) — never commit.
