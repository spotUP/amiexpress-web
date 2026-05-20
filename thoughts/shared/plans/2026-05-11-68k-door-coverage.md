---
date: 2026-05-11
topic: 68k-door-full-coverage
tags: [emulation, doors, testing, arexx, xim, lvo, planning]
status: partial
phase_1_status: implemented
phase_2_5_status: deferred
implemented_date: 2026-05-20
notes: |
  Phase 1 (harness + corpus) shipped — 324 doors in corpus.json with
  integration assertions and goldens, runner wired via
  `npm run corpus:integration`. Phases 2-5 (stub elimination, AREXX,
  vamos differential, long tail) deferred to follow-up sessions.
---

# Plan — Full 68K (and AREXX) door coverage

## Why this plan exists

Every new door currently surfaces 1-10 bugs in our emulator/interpreter
and costs hours-to-days to debug. Today's Sent_FE/Jdn-Csent session
exposed **8 distinct AREXX-interpreter bugs** in a single shipped door.
That ratio is unsustainable — there are ~4,000 known AmiExpress doors in
the wild and the long tail will keep producing surprises if we don't
shift from reactive (debug-per-door) to proactive (coverage-driven).

The remedy is structural: a regression test corpus of representative
doors driving every LVO / XIM op / AREXX construct, plus systematic
elimination of every "stubbed - returning success" path. Both should be
done together so the test corpus *proves* a stub is now functional.

## Goals (measurable)

- **G1.** A CI-runnable corpus of ≥30 real doors covering the top
  ~95% of documented LVOs (exec/dos/intuition/console.device/
  rexxsyslib/AEDoor) and the top ~95% of XIM/AIM/SIM/TIM op codes.
  Pass criteria per door: matching trap-call sequence + final output
  vs. a frozen golden trace (vamos-derived or hand-verified).
- **G2.** Zero `stub`/`TODO`/`returning success` paths in
  exec.library, dos.library, intuition.library, console.device,
  rexxsyslib, AEDoor.library that the corpus exercises. Long-tail LVOs
  remain stubs but each is annotated with which doors trip it.
- **G3.** AREXX interpreter passes a script corpus of ≥15 shipped
  AREXX doors end-to-end (RexxOpt one-liners, label-recursive menus,
  line-mode QUERY, IF/THEN tolerance, all 79 RKRM builtins). Today's
  8 fixes become permanent regression tests.
- **G4.** Adding a new door to the corpus is a one-line + golden
  trace command, not a per-door investigation.

## Non-goals

- Bit-exact instruction timing (MOIRA already covers that).
- Bidirectional HYDRA protocol (deferred — listed as WEB_ deviation).
- Zmodem-over-telnet (large, separate scope — telnet now aborts cleanly).
- Doors that depend on hardware (paula audio, copper, sprites) — out of
  scope for a BBS shell.

---

## Phase 1 — Test harness + first 5 doors *(target: ~1 week)*

**Deliverables**
- `dev/scripts/door-corpus/` directory structure:
  - `corpus.json` — manifest mapping door name → binary path, expected
    inputs, golden trace path, tags (XIM/AIM/SIM/TIM/AREXX).
  - `run-corpus.ts` — runner that boots a synthetic node, launches each
    door, replays scripted inputs, captures trap-call trace + final
    socket output, diffs against golden.
  - `goldens/<DoorName>/{trace.txt, output.txt}` — frozen reference.
- `tests/corpus/door-corpus.test.ts` — Jest wrapper that runs the
  harness, opt-out via `SKIP_DOOR_CORPUS=1`. Gated on presence of
  Kickstart ROM (same gate as native-arexx tests).
- First 5 doors wired in (one per category):
  - Sent_FE (SysCmd XIM, banner + PRV_COMMAND chain)
  - Jdn-Csent (AIM AREXX, menu + line input + file I/O)
  - AVAIL (SIM batch, simple template render)
  - QuickNew (SIM batch, file-area scan)
  - one from the `Doors/Bulls` line (XIM with AEDoor heavy traffic)

**Exit criteria**
- `npm run corpus` runs the 5 doors green locally.
- Golden traces are reviewed once and frozen.
- CI job added (skips on missing ROM).

**Why first** — Until the harness exists, every subsequent phase
relies on ad-hoc validation. Building it now means every later fix
*automatically* becomes a regression test.

---

## Phase 2 — Stub elimination, by LVO frequency *(target: ~2 weeks)*

**Step 1: Audit.** Grep every stub:
```
grep -rn "Stubbed\|stub (no-op)\|TODO.*impl\|returning success" \
    web/backend/src/amiga-emulation web/backend/src/services/arexx \
    | tee thoughts/shared/research/2026-05-11_stub-audit.md
```
Categorize each: real impl, returns-success, returns-failure,
returns-zero. For each "returns-success" path, note which LVO/XIM-op
and which docs (NDK autodoc / Aedoc4 / RKRM) describe correct behavior.

**Step 2: Frequency-rank.** Run the corpus from Phase 1 with a
trap-call counter (extend `LibraryTraps.handleTrap` to bump a Map).
Sort stubs by call frequency across the corpus. Implement top 80%.

**Step 3: Implement.** For each ranked stub:
1. Read the NDK autodoc for the function (use
   `mcp__amiexpress-docs__search_ndk_autodocs`).
2. Run the door under vamos with `--log-file` to capture reference
   behavior (return values, memory side effects).
3. Implement against autodoc; verify against vamos trace.
4. Add the door's golden trace if not yet in corpus.

**Exit criteria**
- Top-80%-by-frequency stubs converted to real impl.
- Corpus expanded to ≥15 doors covering the touched LVOs.
- Long-tail stubs all annotated with "tripped by N doors" comments.

---

## Phase 3 — AREXX dialect coverage *(target: ~1 week)*

**Step 1: Today's 8 fixes → permanent regression tests.** Add a
script to `tests/services/arexx-dialect-corpus.test.ts` that exercises:
- Unbounded `call <label>` recursion (must hit depth-100, not OOM).
- Bare-symbol clause as host command (`GC=getchar; gc;`).
- IF/THEN tolerance across stray `;`.
- Line-mode QUERY/PROMPT with multi-char input + backspace.
- TRIM, STRIP variants on edge inputs.
- PRV_COMMAND → SysCmd dispatch.
- `interp.bbsFunctions.*` reachability via host-dispatch handlers.

**Step 2: Run the AREXX corpus.** Pick 15 shipped scripts hitting
every RKRM builtin + every Aedoc4 host command. Each becomes a corpus
entry with scripted input + golden output. Many of the doors in
`/Users/spot/Code/amiexpress_doors/_AREXX/` are candidates (filter out
the `ADDRESS COMMAND` ones per existing memory).

**Step 3: Decide on native engine.** Today native dispatch was the
OOM trigger. Options:
- (A) Keep native engine *opt-in* (`AREXX_ENGINE=native`); default TS.
- (B) Force TS everywhere; mark native as Phase-7 experimental.
- (C) Continue native dev with the cycle/heap budget guards we added.

Decision should be made *after* the AREXX corpus passes on TS — that
proves we don't *need* native for shipped doors. Recommendation: (A)
with default TS, since the native daemon-dispatch bridge has dragons
that aren't blocking real users.

**Exit criteria**
- 15 AREXX doors green under TS engine in CI.
- 8 fixes-as-tests pinned.
- Native engine in opt-in mode by env var, documented.

---

## Phase 4 — Differential validation vs vamos *(target: ~1 week)*

For any corpus door that fails *only* under our emulator and not
vamos, automate the diff.

**Deliverables**
- `dev/scripts/door-corpus/diff-vamos.ts` — for a given door, run
  under vamos with `--log-file`, parse the trap sequence, normalise
  argument/return formatting, diff against our run.
- `goldens/<DoorName>/vamos.trace.txt` — frozen vamos reference for
  doors where vamos succeeds.
- Failure output highlights the first divergent trap with both
  argument tuples side-by-side.

This is the long-tail catcher. Once Phases 1-3 land the obvious
gaps, this is what surfaces the subtle ones.

---

## Phase 5 — Long tail + door-onboarding paving *(ongoing)*

**Step 1: Document the corpus contribution path.** A README in
`dev/scripts/door-corpus/` with a 3-step "add a door" recipe:
1. Drop binary + `.info` into `Doors/`.
2. Run `npm run corpus:capture -- <name>` (records inputs +
   freezes golden trace).
3. Run `npm run corpus` (verifies it stays green).

**Step 2: Backlog tracking.** Open one issue per LVO/XIM-op still
stubbed at end of Phase 2. Each issue links to which corpus door
trips it, and to the NDK autodoc reference. New door reveals new
LVO → issue gets created automatically by the trap-frequency report.

**Step 3: Sysop-facing onboarding.** Update
`Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md` with the
"how to add your door to the test corpus" guide so external
contributors can pin their own door's working state without
maintainer involvement.

---

## Rollout order recommended

1. Phase 1 (harness) — unblocks everything else.
2. Phase 3 step 1 (today's 8 fixes pinned as tests) — cheapest
   protection of work just shipped.
3. Phase 2 step 1 (stub audit) — informs sequencing of rest.
4. Phase 3 steps 2-3 + Phase 2 steps 2-3 in parallel (one person on
   AREXX corpus, one on stub elimination).
5. Phase 4 + Phase 5 once Phases 1-3 are green.

## Risks / open questions

- **Vamos divergence on intentional WEB_ behaviour.** Some
  differences are *desired* (e.g. our deduplicated message storage
  vs express.e's). Diff harness must allow tagged "expected
  divergence" annotations.
- **Door binaries' copyright.** Most shipped doors are
  redistributable but a few aren't. Corpus manifest should mark
  each door's licensing and CI should skip restricted ones with a
  clear note rather than failing.
- **Golden trace drift on intentional changes.** When we *fix* a
  bug, traces shift. Need a `corpus:refreeze` workflow with
  human review (not auto-accept).
- **Vamos coverage gaps.** Vamos doesn't implement everything either
  — some doors fail in vamos too. Those need hand-derived goldens
  (run on a real Amiga or Kickstart-emulated FS-UAE session) or get
  marked as "no-reference" with looser pass criteria (door exited
  cleanly, no crash).

## Open files this plan touches

- `dev/scripts/door-corpus/` (new directory)
- `tests/corpus/` (new directory)
- `web/backend/src/amiga-emulation/api/{ExecLibrary,DosLibrary,LibraryTraps}.ts`
- `web/backend/src/services/arexx.service.ts`
- `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

## Estimate at a glance

| Phase | Effort | Doors green at end |
|------|------|-----|
| 1: Harness + 5 doors | 1 week | 5 |
| 2: Stub audit + top-80% impl | 2 weeks | 15 |
| 3: AREXX dialect corpus | 1 week | 30 (15 + 15 AREXX) |
| 4: Vamos diff | 1 week | 30 (qualitative gain) |
| 5: Long tail | ongoing | 50+ |

Total ~5 weeks to a substantial coverage floor; Phase 5 is the
long-term steady state.
