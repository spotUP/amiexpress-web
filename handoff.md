# Handoff

## 2026-05-12 — 68K door coverage: corpus + probe + universe stub elimination

Built a CI-runnable regression corpus, a per-door diagnostic probe, a
bulk-probe with race-free sharding, a coverage report generator, and a
timeout-cluster miner. Shipped real implementations for every LVO stub
the AmiExpress door universe (~3000 binaries) actually calls. 10
commits this session ahead of `e6e8f8e11`:

  d72cc0fdd  Full LVO coverage v1 + corpus + probe + bulk-probe
  733068905  Time-mask diff (recovers live-clock doors)
  bc2d16a8c  Docs + npm scripts (test:corpus, corpus, probe)
  929e7eefb  Parallel corpus runner (~3 min → ~80 sec, -j 4)
  62be1ebb7  AREXX TS-interpreter regression tests (5/5)
  ff7aa95ce  --shard I/N for race-free parallel bulk-probe
  962fb6224  Session research doc (proven/probable/deferred)
  795018918  Batch 4 LVO impls + coverage-report tool
  57dd258d1  Timeout-cluster miner + .library filter
  7ed0b0453  +2 corpus doors validated from cluster mining

**Coverage from the 1489-archive scan (47% of universe, 3631 binaries
probed):**
- **0 hard blockers** (zero missing LVOs anywhere)
- **0 remaining stubs** in any door's reachable code path
- **2311 / 3631 doors (63.6%)** exit cleanly with no emulator gaps
- The other 36% are timeouts at interactive prompts (need scripted input,
  not an emulator bug) or live-time renderers (intentionally
  non-deterministic — corpus drops them)

**Corpus: 38 doors green** covering 65+ distinct XIM ops + 10 real
LVOs. Categories: 3 XIM-SysCmd, 31 XIM-BBSCmd (incl. 2 from cluster
mining), 4 SIM. Refreezable goldens at
`dev/scripts/door-corpus/goldens/<id>/{output.txt,trace.txt}`.
CI wrapper: `web/backend/tests/corpus/door-corpus.test.ts` (skip with
`SKIP_DOOR_CORPUS=1`). Runner supports `--concurrency N` / `-j N`
(default 4, drop to 1 under bulk-probe contention) and time-masking
diff (HH:MM:SS, HH:MM, Dow DD-Mon-YYYY → masked tokens; live-clock
doors stay stable). Add a door: drop binary into `Doors/<Name>/`,
register in `corpus.json`, `npm run corpus:capture` (or
`npx tsx dev/scripts/door-corpus/run.ts --capture <id>`).

**Probe (`npm run probe -- <binary>` or
`npx tsx dev/scripts/door-probe/probe.ts`)** turns "every new door
takes days" into a one-shot diagnosis. Bulk-probe (`bulk-probe.ts`,
`--shard I/N` for parallel runs, `--skip-existing` for resumption)
walks an archive directory and aggregates LVO/XIM-op frequency.
Cached at `/tmp/bp-full/` (~2 500 archives durable). Two report
tools sit on top: `npm run coverage:report` (clean-exit %, stubs,
hard blockers, corpus candidates) and `npm run clusters:report`
(timeout-door clusters by trailing prompt + suggested input
bytes).

**LVO impls landed (29, routed via `library-vectors/*-vectors.ts` —
the DosLibrary.handleCall switch and ExecLibrary equivalents are dead
code, only the vector files dispatch live):**

- exec.library: FreeSignal, RemPort (membership-guarded via
  `portsInExecList: Set<number>`), OpenDevice, CloseDevice, DoIO,
  CheckIO, WaitIO, AbortIO, CreateIORequest, DeleteIORequest,
  AllocEntry, FreeEntry, OpenResource, SetFunction, AddTask,
  AddSemaphore, AddIntServer, CacheControl, RemMemHandler,
  SetIntVector, AllocTrap, FreeTrap, SendIO, SumLibrary
- dos.library: LockDosList, UnLockDosList, AttemptLockDosList,
  FindDosEntry, NextDosEntry (broke a 367 241-call spin), SetIoErr,
  StrToLong, MatchFirst, MatchNext (broke 98 167-call spin), MatchEnd,
  IsFileSystem, SetProgramName, GetArgStr, ReadItem, GetDeviceProc,
  DoPkt, VFWritef, SetMode, ExAll, StartNotify

**AREXX-side regression fixes (still from this multi-day arc):**
PRV_COMMAND now queues for post-door-exit dispatch with `allowSyscmd=TRUE`
(matches express.e:3818). `rexx-host-dispatch.ts` uses
`interp.bbsFunctions.*` (was undefined `interp.bbs.*`). Engine selector
honors `AREXX_ENGINE` env var. TS interpreter: TRIM builtin added,
label-call recursion bounded, bare-symbol clause routed through ADDRESS
aliases, stray `IF expr; THEN` clauses re-stitched, PROMPT/QUERY in
line-mode with echo + backspace.

**Misc:** `command.handler.ts startBatchUploadTransfer` aborts with a
clear message on telnet/SSH transports (was leaving the session stuck
at FILES_UPLOAD waiting for a browser file picker).

**Doors installed:** 38 under `Doors/<Name>/`. Full list in
`dev/scripts/door-corpus/corpus.json`.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/kill-servers.sh               # stop everything cleanly
npm run corpus            # 38-door regression diff (-j 4 default)
npm run probe -- <bin>    # diagnose a single binary
npm run coverage:report   # universe coverage from /tmp/bp-full
npm run clusters:report   # timeout-door clusters by prompt
```

Force TS AREXX: `AREXX_ENGINE=ts ./dev/scripts/start-servers.sh ...`.
Sysop drops `System/RexxMast` + `System/Rexxc/` (gitignored).

## Gotchas

- Amiga = BE; QWK/LZH/SAUCE are LE.
- DosLibrary.handleCall switch is dead code (legacy `.fixapi`). Active
  path is DOS_VECTORS in `library-vectors/dos-vectors.ts`. Same for
  ExecLibrary + EXEC_VECTORS.
- RemPort is membership-guarded — only modifies the global PortList for
  ports that AddPort previously linked. Otherwise corrupts head/tail.
- Door corpus traces strip ANSI + normalise hex/large-number, dedup by
  signature, cap at 500 unique lines (so a hung door doesn't write a
  20 MB golden).
- `info-editor set <KEY> <val>` produces `!KEY=...` (disabled marker)
  when the .info uses the fallback parser. For `bbsConfig.info` use
  env-var overrides instead (`AREXX_ENGINE=ts`).
- High-bit bytes: `readAmigaTextFileWithTransforms`; never
  `fs.readFileSync(p, 'utf8')` (silently corrupts 0xB7/0xA9/0xAE).
- `mailStat.highMsgNum` stores *next* id; total = high-1.
- Uploads via HTTP (browser-only). Telnet/SSH transports now abort
  cleanly instead of stalling at FILES_UPLOAD.
- AREXX native engine: `RexxMast` / `Rexxc/` gitignored. Default is
  `auto` (native if present); use `AREXX_ENGINE=ts` to force the TS
  interpreter when native daemon-dispatch is unstable on a script.
- Door stack floor = 256 KB (DoorLoader.computeStackBounds).
- Bulk-probe results cached at `/tmp/bp-full/`; `--skip-existing`
  resumes, `--shard I/N` parallelises across N runners (race-free).
