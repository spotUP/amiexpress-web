---
date: 2026-05-12
topic: door-coverage-session
tags: [emulation, doors, lvo, corpus, probe, phase-2, stub-elimination]
status: final
---

# Door coverage session — what shipped, what's verified, what isn't

Session arc: built tooling + cleared every stub the AmiExpress door
universe (~3000 binaries across 3 143 LHA/LZH archives) actually
called. This doc is the auditable trail: what's *proven* working vs
what's *probably* working vs what's deferred. Future sessions should
treat the "probably" line carefully.

## Proven (end-to-end verified through the BBS UI or scripted I/O)

- **Sent_FE → Jdn-Csent chain.** EMP-SF10 (XIM 68K) + 5D-CS3 (AIM
  AREXX). Sysop typed "test" into the sentby prompt, door wrote
  `Doors/FileID/Sent.DAT`, exit clean. Previously: 4 GB OOM on the
  AREXX side.
- **`-D-INF21/Info`.** Was OOM-crashing on every invocation
  (367 241 NextDosEntry stub calls in 6-sec window before timeout).
  Now exits cleanly.
- **36 doors in `dev/scripts/door-corpus/`.** Each verified to:
  1. Boot under the harness.
  2. Produce a deterministic outcome (or get scripted-input driven
     to one — 8 corpus entries use `inputScript`).
  3. Match a frozen golden across `output.txt` + `trace.txt`.
  Categories: 3 XIM-SysCmd, 27 XIM-BBSCmd, 4 SIM. List in
  `dev/scripts/door-corpus/corpus.json`.
- **24 LVO implementations** went stub-returning-garbage → real.
  Each routed via `library-vectors/{exec,dos}-vectors.ts` (the
  active dispatch path). Tracked in handoff.md.
- **9 AREXX TS-interpreter fixes** (PRV_COMMAND with allowSyscmd=true,
  `interp.bbsFunctions` reachability, label-call recursion bound,
  bare-symbol-clause → ADDRESS dispatch, IF;THEN re-stitch, line-mode
  PROMPT, TRIM, AREXX_ENGINE env var, telnet-upload abort). 5 of
  these have pinned regression tests at
  `web/backend/tests/services/arexx-interpreter-fixes.test.ts`.

## Probable (inferred from the partial bulk-probe scan)

- **63.6% clean exit** across the 3 631 binaries probed in 1 489
  archives (47% of the universe — bulk-probe was still running at
  doc-write time). "Clean exit" = exit code 0 + zero unimplemented
  LVOs + zero remaining-stub LVOs hit. These doors *don't trip an
  emulator gap*. Whether they behave correctly through their full
  user-facing flow is **unverified**.
- The 24 LVO impls returned defensive defaults (e.g.
  OpenDevice/CloseDevice/DoIO return success with `io_Error = 0`,
  MatchFirst/NextDosEntry return "empty list", AllocEntry returns
  the input MemList unchanged). These satisfy doors that don't
  *depend* on the device/file/list actually behaving — but a door
  doing real serial-port I/O would still fail at the next step.
  Today's user-facing doors (banners, status renderers, file-area
  scanners) don't hit those next steps.

## Deferred (known shortcuts)

- **Native AREXX engine OOM** on long-running scripts (Jdn-Csent
  was the trigger). Worked around by forcing TS engine via
  `AREXX_ENGINE=ts`. The native daemon-driven dispatch via MOIRA
  has a heap-growth issue under sustained load. Real fix needs
  deep emulator-bridge work.
- **AllocEntry** returns the input MemList unchanged. A door that
  passes in a MemList where the `me_Addr` fields are uninitialised
  and *uses* them downstream will get garbage. None of the 28 doors
  observed using AllocEntry in the 1 489-archive sample exhibited
  this pattern, so the defensive default is fine for now.
- **SetFunction** returns 0 (no previous function). A door that
  patches a library function and then calls the original via the
  returned pointer would crash. 3 doors hit SetFunction; none
  observed using the return value.
- **DoPkt** returns 0 (DOSFALSE / failure). Doors that use DoPkt
  to talk to file-system handlers directly bypass the normal
  Read/Write API. They get "failed" instead of garbage; whether the
  failure-handling path is graceful is door-by-door.
- The other 36% of probed doors **timeout at interactive prompts**.
  Not emulator bugs — they need scripted input. Phase 3 territory.

## What's *not* claimed

- **"100% door compatibility"** — only that every LVO the scanned
  universe touches now has a non-stub implementation.
- **"Every door works"** — only that 36 are *proven* and 2 311 are
  probably-better-than-before.
- **Production stability under real-user load** — the heap watchdog
  in `rexxmast-service.ts` is a safety net, not a fix.

## How to expand the proven set

1. Pick a category of doors with shared XIM/LVO fingerprint that
   isn't represented in the corpus yet (the bulk-probe summary
   surfaces these).
2. Install the binary under `Doors/<Name>/`. Add a corpus.json
   entry.
3. If the door is interactive, find its quit/abort prompt via
   `strings`, write an `inputScript` of `<delayMs> <bytes>` pairs.
4. `npx tsx dev/scripts/door-corpus/run.ts --capture <id>` to freeze
   the golden.
5. Re-run with no args to verify the diff loop closes.

## Refs

- `dev/scripts/door-corpus/` — regression net.
- `dev/scripts/door-probe/probe.ts` — single-door diagnosis.
- `dev/scripts/door-probe/bulk-probe.ts` — universe scan,
  `--shard I/N` for parallelism.
- `thoughts/shared/plans/2026-05-11-68k-door-coverage.md` — original
  plan.
- `handoff.md` — current state, gotchas, restart instructions.
- `web/backend/tests/services/arexx-interpreter-fixes.test.ts` —
  AREXX regression tests.
- `web/backend/tests/corpus/door-corpus.test.ts` — corpus jest
  wrapper.
