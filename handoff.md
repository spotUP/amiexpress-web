# Handoff

## 2026-05-12 — 68K door coverage: regression corpus + universe-wide stub elimination

Built a CI-runnable door regression corpus and shipped real implementations
for every LVO stub the AmiExpress door universe (~3000 binaries) actually
calls. New tooling: `dev/scripts/door-corpus/` (regression) and
`dev/scripts/door-probe/` (per-door + bulk diagnosis).

**Coverage from the 1489-archive scan (47% of universe, 3631 binaries
probed):**
- **0 hard blockers** (zero missing LVOs anywhere)
- **0 remaining stubs** in any door's reachable code path
- **2311 / 3631 doors (63.6%)** exit cleanly with no emulator gaps
- The other 36% are timeouts at interactive prompts (need scripted input,
  not an emulator bug) or live-time renderers (intentionally
  non-deterministic — corpus drops them)

**Corpus: 34 doors green** covering 65 distinct XIM ops + 10 real LVOs.
Categories: 3 XIM-SysCmd, 27 XIM-BBSCmd, 4 SIM. Refreezable goldens at
`dev/scripts/door-corpus/goldens/<id>/{output.txt,trace.txt}`.
CI wrapper: `web/backend/tests/corpus/door-corpus.test.ts`. Skips with
`SKIP_DOOR_CORPUS=1`. Add a door: drop binary, register in
`corpus.json`, `npx tsx dev/scripts/door-corpus/run.ts --capture <id>`.

**Probe: `npx tsx dev/scripts/door-probe/probe.ts <binary>`** turns
"every new door takes days" into a one-shot diagnosis. Bulk-probe at
`bulk-probe.ts` walks an archive directory and aggregates LVO/XIM-op
frequency. Cached results at `/tmp/bp-full/` (1489 archives, durable).

**LVO impls landed this session (24, all routed via the `*-vectors.ts`
files — DosLibrary.handleCall switch is dead code, only DOS_VECTORS is
live, same for ExecLibrary):**

- exec.library: FreeSignal, RemPort (port-list membership guarded via
  `portsInExecList: Set<number>`), OpenDevice, CloseDevice, DoIO,
  CheckIO, WaitIO, AbortIO, CreateIORequest, DeleteIORequest,
  AllocEntry, FreeEntry, OpenResource, SetFunction, AddTask,
  AddSemaphore, AddIntServer, CacheControl, RemMemHandler, SetIntVector
- dos.library: LockDosList, UnLockDosList, AttemptLockDosList,
  FindDosEntry, NextDosEntry (broke a 367 241-call spin), SetIoErr,
  StrToLong, MatchFirst, MatchNext, MatchEnd, IsFileSystem,
  SetProgramName, GetArgStr, ReadItem, GetDeviceProc, DoPkt, VFWritef,
  SetMode, ExAll

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

**Doors installed:** 25-ish under `Doors/<Name>/` (Sent_FE, Jdn-Csent
in 5D/, U-Stat, ConfScan, uPdOWNiNFO, newinfo, 5D-Status, FuckNature,
JoinCnf, RATIOREP, AutoOnline, ConferenceSecurity, 5D-AutoFree,
5D^DupeCheck, 5D-EnterMsg, 5D-DoorMenu, 5D-TimeBank, LOGOFF,
5D-ZippySearch, Bull, AFL status / pager, HoldCheck, diary,
mgs!-bulls, S!X Status, sKAN^4^sTATUs, Super-Stats, 5D-FileId,
MAKECMD, 5D-News, 5D_Comment + .info registrations as needed).

## 2026-05-11 — Sent_FE 68K + Jdn-Csent AREXX chain works end-to-end

EMP-SF10 (Sent_FE, XIM 68K) and 5D-CS3 (Jdn-CSent, AIM AREXX) installed
and verified. Door chain: `sent_fe` → banner → PRV_COMMAND `Sent` →
Jdn-Csent menu → pick color → QUERY line input → write to
`Doors/FileID/Sent.DAT` → clean exit. See the AREXX-side regression
fixes summarised above.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
npx tsx dev/scripts/door-corpus/run.ts      # corpus regression
npx tsx dev/scripts/door-probe/probe.ts <bin>  # diagnose one door
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
- Bulk-probe full-sweep results cached at `/tmp/bp-full/` (~/3000
  binaries probed). `--skip-existing` resumes.
