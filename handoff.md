# Handoff

## 2026-05-04 — DateTime offset fix + TUI overhaul

- `2fe69a2c6` **dos.library DateTime struct-offset bug.**
  `dat_StrDay/StrDate/StrTime` were slot-shifted, so every 68K door
  asking for a date got the time string ("00:00:00") in its date
  buffer. Fixes AquaScan "Scanning dir N for X" + any other door
  using dos.library date conversion.
- `7475fc054` doorman F-explorer handles AmigaDOS assigns +
  case-mismatch (`DOORS:EmP_Tools/Bulls` no longer freezes BBS).
- `8f047b801` AREXX rexxsyslib LVO traps (Phase 2; parallel-agent
  bundle, also absorbed AquaScan path-A removal).
- `45c098000`+`e289bdeca` TUI: F2 restart dialog (raw stdin —
  Ink swallows F-keys); tmux send-keys to `:.{right}`; raw-mode
  leak fix; `stty sane` guard in `--help`; backend log to bottom-
  left pane (full-height TUI on right); Logs `/`-filter +
  arrow/PgUp/PgDn scrollback + `g`/`G` top/tail.
- `9f636c9d4` aquascan-trace plumbing ripped post-fix; tree clean.

## 2026-05-04 — Native AREXX Phase 6 — CreateProc next

Phase 6 env wiring committed. tsc clean, 90/90 rexx/arexx tests pass.
Live boot now traps 100 library calls vs 0 before. New blocker:
RexxMast `CreateProc` returns 0 (UNSUPPORTED) → parent loops on
`LockRexxBase` instead of reaching `AddPort('REXX')`.

Live boot status:

```
✅ ExecBase + low-mem + exception vectors
✅ MOIRA library trap handler routed
✅ exec.library 62 LVOs + dos.library 79 LVOs + rexxsyslib 10 LVOs
✅ Process struct (NT_PROCESS, pr_TaskNum=1, pr_CLI=0, ln_Name=RexxMast)
✅ FindTask(0) resolves to RexxMast Process
✅ syncTrapAddressesToMoira: 295 traps in batch set
✅ runUntilReady isTrapAddress-guarded (door-style dispatch)
✅ Traps fire: WaitPort, GetMsg, OpenLibrary x3, CreateProc, CloseLibrary x2
❌ CreateProc returns 0 → RexxMast loops in LockRexxBase
```

Phase 6 ships in `services/arexx/rexxmast-service.ts`:
ExecLibrary.initialize → setLibraryLoader → setLibraryTrapHandler →
installExecVectors → openLibraryHybrid('dos.library', 37) → new
DosLibrary + setDOSLibrary + installDOSVectors → allocateDoorTask
(NT_PROCESS, pr_TaskNum=1, ln_Name="RexxMast", pr_StackBase/Size) →
syncTrapAddressesToMoira → refillPrefetch in runUntilReady (else
ILLEGAL hits exception 4 not trap dispatch). Budget 1M → 10M.

Diagnostic: `dev/scripts/arexx-trace.ts` — boots singleton in
isolation, prints first 100 lib calls with regs + resolved strings.

Next: `DosLibrary.ts:2853 CreateProc` returns D0=0. Forks aren't
modeled in our singleton, so:

1. **Fake success** — non-zero process pointer; arexx-context-gated
   so doors don't see fake forks. One-line change. Run AREXX_TRACE
   after.
2. **Trampoline** — extract D3 SegList, JMP to its entry in singleton.
3. **Disassemble RexxMast** to find `AddPort('REXX')` branch.

Recommend option 1 + AREXX_TRACE.

## How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

Tests: `SKIP_DB_INIT=1 npm test -- --testPathPattern="(rexx|arexx)"`

Sysop: `System/RexxMast` + `System/Rexxc/` are gitignored
(Commodore copyright); sysops drop their own. `Libs/rexxsyslib.library`
is in repo. Toggle `AREXX_ENGINE=auto|native|ts` in `bbsConfig.info`.
`AREXX_TRACE=1` for debug.

## Open priorities

- **#78 CreateProc** — see "Next step" above
- **#77** AREXX TS interpreter (DONE; native is alt path)

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
- **`mailStat.highMsgNum`** stores *next* id; total = high-1.
- **`confMailName`** for "is this my mail?" checks, NOT
  `session.user.username`. Use `getConfMailName(session)` or
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
  `message-scan-parity` / `message-repository`.
- **AREXX native**: `RexxMast` + `Rexxc/` gitignored (Commodore
  copyright); sysops supply their own.
