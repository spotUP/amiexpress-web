# Handoff

## 2026-05-04 (later) — DateTime offset bug + TUI overhaul

- `2fe69a2c6` **dos.library DateTime struct-offset bug.**
  `dat_StrDay/StrDate/StrTime` were slot-shifted, so every 68K door
  asking for a date got the time string ("00:00:00") in its date
  buffer. AquaScan "Scanning dir N for X" is now fixed; same fix
  benefits any door using dos.library date conversion.
- `7475fc054` doorman F-explorer handles AmigaDOS assigns +
  case-mismatch (`DOORS:EmP_Tools/Bulls` no longer freezes BBS).
- `8f047b801` AREXX rexxsyslib LVO traps (Phase 2; parallel-agent
  bundle, also absorbed AquaScan path-A removal + aquascan-trace).
- `45c098000` + `e289bdeca` TUI: F2 restart dialog wired in (raw
  stdin listener — Ink swallows F-keys); tmux send-keys to
  `:.{right}` for layout-stable routing; raw-mode leak fix; `stty
  sane` guard in start-servers `--help`; backend log moved to
  bottom-left pane (full-height TUI on the right); Logs page gets
  `/`-filter + arrow/PgUp/PgDn scrollback + `g`/`G` top/tail.

aquascan-trace plumbing was kept while debugging, then ripped after
the fix verified — tree clean.

## 2026-05-04 (latest) — Native AREXX Phase 6 wiring landed; CreateProc next

Phase 6 env wiring committed this session. tsc clean, 90/90 rexx/arexx
tests pass (84 prior + 6 new Phase 6 invariants). Live boot now
**traps 100 library calls** vs 0 before — the wiring is fully
connected. New blocker: RexxMast's `CreateProc` returns 0 (UNSUPPORTED),
which sends RexxMast into a `LockRexxBase` retry loop instead of
reaching `AddPort('REXX')`.

### Live boot status (post-Phase-6)

```
✅ ExecLibrary.initialize() — ExecBase + low-mem ptrs + exception vecs
✅ MOIRA library trap handler routed
✅ exec.library 62 LVOs + dos.library 79 LVOs + rexxsyslib 10 LVOs
✅ Process struct: NT_PROCESS, pr_TaskNum=1, pr_CLI=0, ln_Name=RexxMast
✅ FindTask(0) resolves to RexxMast Process
✅ syncTrapAddressesToMoira: 295 traps in MOIRA's batch set
✅ runUntilReady loop now isTrapAddress-guarded (door-style dispatch)
✅ refillPrefetch after PC change — first instruction decodes correctly
✅ Trap fires: WaitPort, GetMsg, OpenLibrary("dos.library"),
   OpenLibrary("mathieeedoubbas.library"), OpenLibrary("rexxsyslib"),
   CreateProc, CloseLibrary x2
❌ CreateProc returns 0 → RexxMast loops in LockRexxBase forever
```

### What ships in Phase 6

`web/backend/src/services/arexx/rexxmast-service.ts`:
1. `execLibrary.initialize()` (ExecBase + low-mem + exception vectors).
2. `setLibraryLoader(loader, true)` enables ROM-resident library path.
3. `emulator.setLibraryTrapHandler(...)` routes ILLEGAL → handleTrap.
4. `installExecVectors()` armed from cycle 0.
5. dos.library: `openLibraryHybrid('dos.library', 37)` + new
   `DosLibrary` instance + `setDOSLibrary` + `installDOSVectors`.
6. `allocateDoorTask(segEnd)` then patch ln_Type=NT_PROCESS,
   pr_TaskNum=1, ln_Name="RexxMast", pr_StackBase / pr_StackSize.
7. `syncTrapAddressesToMoira()` after all vectors installed.
8. `refillPrefetch()` after PC/SP set in `runUntilReady`.
9. `runUntilReady` rewritten with `isTrapAddress(pc)` pre-check —
   without it MOIRA's ILLEGAL went through exception vector 4 to
   our generic ADDQ/RTE handler instead of our trap dispatch.
10. Default `runUntilReady` budget 1M → 10M.
11. `_getRexxMastTaskAddr()` test accessor.

### Diagnostic tool (`dev/scripts/arexx-trace.ts`)

```bash
cd web/backend
AREXX_TRACE=1 SKIP_DB_INIT=1 BBS_DATA_DIR=/Users/spot/Code/amiexpress-web \
  npx tsx ../../dev/scripts/arexx-trace.ts
# Boots the singleton in isolation — much faster than start-servers
# for trap-level diagnosis. Prints first 100 library calls with
# A0/A1/D0/pc + resolved string for OpenLibrary calls.
```

### Next step — CreateProc

`web/backend/src/amiga-emulation/api/DosLibrary.ts:2853` —
`CreateProc()` is stubbed UNSUPPORTED (returns D0=0). RexxMast forks
itself via CreateProc; with D0=0 the parent treats fork as failed and
bails into the `LockRexxBase` cleanup loop. Forks aren't modeled in
the singleton emulator, so options:

1. **Fake success** — return a non-zero "process pointer" so RexxMast's
   parent thinks fork worked. Cheap to try; one-line change in
   `DosLibrary.CreateProc` gated by an arexx-context flag so doors
   don't see fake forks. Run AREXX_TRACE after to see if AddPort fires.
2. **Trampoline** — extract D3 SegList passed to CreateProc and JMP to
   its entry point in our singleton, treating "the child" as the only
   thread. Closer to real semantics, more invasive.
3. **Disassemble RexxMast** — `r2 -q` System/RexxMast and find where
   `AddPort('REXX')` lives (parent vs child) so we know which branch
   to keep alive.

Recommended start: option 1 + a fresh AREXX_TRACE run.

### Sysop ops

- `System/RexxMast` + `System/Rexxc/` (gitignored, sysop-supplied)
- `Libs/rexxsyslib.library` (in repo)
- `bbsConfig.info` `AREXX_ENGINE=auto|native|ts` (default auto)
- `AREXX_TRACE=1` env var → debug startup

### Tests

```
SKIP_DB_INIT=1 npm test -- --testPathPattern="(rexx|arexx)"
# 90 / 90 passing. ✅
```

### How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

## Open priorities

- **#78 CreateProc** — DosLibrary.CreateProc returns 0; RexxMast forks
  itself, fork fails, parent loops on LockRexxBase. See "Next step" above.
- **#77** AREXX TS interpreter (DONE; native is the alt path)

## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- `2` (callers log): DB entries not per-node files
- ZOOM auto-selects ZIP; no LHA binary
- GDPR gate on new user
- File scan at login gated on `SHOW_NEW_FILES`
- `lowestNotDel` recomputed from headers (express.e just bumps +1)
- EH preserves 'p' (censored) status (express.e forces 'P')
- ZModem `Msg. Options X` replaced by F file-attach

## Gotchas

- **Amiga = BE**: QWK/LZH/SAUCE are LE.
- **Message storage**: body at `<conf>/MsgBase/<id>` (no extension,
  raw body, `\n`). HeaderFile + MailStats authoritative.
- **`mailStat.highMsgNum`** stores the *next* id; total = high-1.
- **`confMailName`, NOT `session.user.username`** for "is this my
  mail?" checks. Use `getConfMailName(session)` or
  `getConfMailNameFor(user, confId, msgBaseId)`.
- **`~SP` in screens**: `displayScreen` handles pause + resume.
- **`relConfNum`** drives menu prompt + conftop, not `currentConf`.
- **`_fallback` .info files**: `writeInfoFile` throws on these.
- **High-bit bytes**: route screen/bulletin reads through
  `readAmigaTextFileWithTransforms`. `fs.readFileSync(p, 'utf8')`
  silently corrupts 0xB7/0xA9/0xAE.
- **Uploads via HTTP**, not websocket.
- **Mouse-move throttled** at socket boundary (60Hz per session).
- **`SKIP_DB_INIT=1`** breaks `message-pointers` /
  `message-scan-parity` / `message-repository` — run them without
  the env var.
- **AREXX native**: `RexxMast` + `Rexxc/` gitignored (Commodore
  copyright). Sysops drop their own.
