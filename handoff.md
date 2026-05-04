# Handoff

## 2026-05-04 — Native AREXX Phase 6 — pick up here

12 commits this session: #78 Phases 1 → 5-final + AREXX_TRACE.
84 tests across 6 suites, TS clean. End-to-end works up to but not
through actual RexxMast bring-up under MOIRA. Detail in
`thoughts/shared/handoffs/2026-05-04_native-arexx-bringup.md`.

### Live boot status

```
✅ rexxsyslib.library loaded at 0x200000
✅ 10 LVO traps installed (CreateArgstring → UnlockRexxBase)
✅ RexxMast hunks parse + load (3 segments)
✅ MOIRA executes 1M instructions, no fault
❌ AddPort('REXX') never reached — needs Amiga env around RexxMast
```

### Phase 6 plan

**Step 1 — diagnose** (env var added this session):
```bash
AREXX_TRACE=1 ./dev/scripts/start-servers.sh --bbs-only
tail -f logs/backend.log | grep AREXX-TRACE
# Logs first 100 library calls with A0/A1/D0/pc + resolved string
# for OpenLibrary("…") so you see exactly where RexxMast gets stuck.
```

**Step 2 — wire the missing Amiga env in `rexxmast-service.ts`:**
1. Install dos.library LVO traps (mirror `installRexxSysLibVectors`
   pattern, both already in `LibraryTraps.ts`).
2. Synthesise a Process struct with `pr_MsgPort=hostPortAddr,
   pr_CLI=0, pr_TaskNum=1` (`<dos/dosextens.h>` layout).
3. Synthesise an Exec Task so `FindTask(0)` returns it
   (`ExecLibrary.ts` ~L711-740 has the door-session pattern to copy).
4. Empty CLI argv (just program name).
5. Re-run `runUntilReady(10_000_000)`.

★ All Phase 6 changes go in `src/services/arexx/rexxmast-service.ts`.

### Sysop ops

- `System/RexxMast` + `System/Rexxc/` (gitignored, sysop-supplied)
- `Libs/rexxsyslib.library` (in repo)
- `bbsConfig.info` `AREXX_ENGINE=auto|native|ts` (default auto)
- `AREXX_TRACE=1` env var → debug startup

### Tests

```
SKIP_DB_INIT=1 npm test -- --testPathPattern="(rexx|arexx)"
# 84 / 84 passing. ✅
```

### How to run

```
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

## Open priorities

- **#78 Phase 6** — see Phase 6 plan above
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
