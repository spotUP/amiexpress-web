# Handoff

## 2026-05-03 — Conftop double-banner fix (XIM stdout)

**Conftop renders banner twice on our emulator; once on real Sanctuary.** Confirmed by
user-recorded video on the real Amiga. Root cause: the binary printf's its startup
banner via DOS `Write(Output(), ...)` BEFORE the report-banner via JH_PUTSTR. On real
Amiga AmiExpress launches XIM doors with `Output()` pointed at NIL: so the stdout
banner goes nowhere. Our `DosLibrary.setOutputCallback` was forwarding ALL stdout
writes to the user's terminal, regardless of door type.

Fix in `LibraryManager.ts:563-579` (commit `8abcb6082`):
- XIM-protocol doors (XIM/AIM/TIM/IIM/MCI/AEM — anything with `useXimProtocol=true`)
  → DOS stdout writes silently discarded; user-facing output must come through AEDoor JH messages.
- SIM/SUP doors → unchanged (stdout IS their user channel, no AEDoor messages).
- Transfer-raw passthrough preserved in both cases.

Test: restart, run `top` (CONFTOP). Should show banner ONCE, matching real Sanctuary.

Other XIM doors that printf debug/status to stdout will also be cleaner now.

## 2026-05-03 — GL command fix on prod, backlog audit

### Today

- **`~CC_gl` / GL.info mismatch on live — FIXED**. Two May 1 commits raced
  in opposite directions: `591f874` renamed door GLC → GL, then `0ec1c1f`
  changed screens from `~CC_gl` → `~CC_glc` to match the wrong command name,
  causing "No such command!!" on every login.
  - Reverted screens to `~CC_gl` in `Screens/logon20.txt` + 41 per-node
    copies (commit `4034494a`).
  - Restored `Commands/BBSCmd/GL.info` from git (had been deleted on disk).
  - Removed stale on-disk `Commands/BBSCmd/GLC.info`.
  - Live host had a divergent stale commit (`fb63f44d`, same fix as
    upstream `bb394a9`) that broke `git pull` in the auto-deploy. Reset
    `/app/amiexpress` to origin/main and rebuilt the container manually.
    Live container started 2026-05-03T15:16:55Z.
  - Cleaned stale `GLC.info` from the live `/app/data/bbs/Commands/BBSCmd/`
    volume (kept as `.backup`).

### Backlog audit (handoff items 1-9 from prior session)

| # | Item | Status |
|---|---|---|
| 1 | SAmiLog "Unknown" locations | ✅ resolved (other agent) |
| 2 | sysop/sysop login on live | ✅ HTTP 200 confirmed |
| 3 | CONFTOP date range error | ✅ likely resolved |
| 4 | LOGON24 screen file missing | 🔧 optional — code falls back to text on missing |
| 5 | GLC.info disk vs git mismatch | ✅ fixed today (above) |
| 6 | Live per-node `logon20.txt` with `~CC_gl` | ✅ none exist on live volume |
| 7 | `messaging.handler.ts` ≈1600 lines | ✅ now 999 lines (handoff was stale) |
| 8 | doorman "Cannot read directory" | 🔧 needs repro to find which dir |
| 9 | `DoorLifecycleManager.ts` over 2000 lines | 🔧 2020 lines, refactor candidate |

### Recent commits

```
8abcb608 fix(emulation): suppress DOS stdout writes for XIM-protocol doors
4034494a fix(screens): revert logon20.txt ~CC_glc back to ~CC_gl
fc584174 fix(emulation): AllocVec/FreeVec must use proper size-header protocol
a94bfdcd fix(emulation): add complete set of AmiExpress door env vars
8acc7928 fix(emulation): wire up more dos.library vectors
27697114 fix(emulation): wire up SetVar/GetVar/DeleteVar
f21e26c4 fix(emulation): add AmiExpress node number env vars for 68K doors
7640480f fix(emulation): wire up GetProgramName at LVO -576
ac68df54 fix(emulation): implement stubbed exec.library LVOs properly
f7d87a7e fix(emulation): list ops + semaphores for SAS/C runtime
e940f157 fix(emulation): implement SuperState/UserState handlers
1bffa580 fix(emulation): disable false-positive stuck loop jump detector
832cba55 fix(emulation): dynamic library trap ranges in stuck loop detector
```

## 2026-05-03 — DOORSMENU (DM) door debugging (still open)

DOORSMENU (68K, SAS/C compiled, by zALO/uP!) exits immediately with FAIL.
~25 emulation issues fixed; door still exits.

The SAS/C startup pushes `argc` from BSS 0x9874 onto the stack, then
`_main()` at memory **0x32e8** checks `if (argc < 2) exit`. The command
line parser (`___nocommandline` at 0x1fd4) DOES parse "1\n" and sets
argc=2 (proven by `AllocVec(12)` = `(argc+1)*4`). But main() still exits
as if argc < 2.

A `[DIAG]` probe was placed at PC=0x32e8 in `DoorLifecycleManager.ts`
(line ~990) but **not yet tested** (server needs restart).

Next session:

1. `./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh --no-watch`
2. Run `dm` in the BBS
3. Check `logs/backend.log` for `[DIAG]` lines — they show actual argc on stack
4. After fixing, remove all temp logging:
   - `LibraryTraps.ts` ~line 1208 `[TRAP] vectorName` console.log
   - `exec-vectors.ts` console.logs in FindPort/CreateMsgPort/PutMsg
   - `DoorLifecycleManager.ts` ~line 990 `[DIAG]` probe at PC=0x32e8

Binary details: `Doors/DOORSMENU/DOORSMENU` 25564 bytes, SAS/C.
CODE@0x2008 (21844B), DATA@0x7608 (384B), BSS@0x7808 (8344B).
`_main` = code+0x12e0 → mem 0x32e8. `___nocommandline` = code+0x1fd4 →
mem 0x3FDC. `___argc` = BSS+0x206c → mem 0x9874.

Two trap dispatch systems:
1. `LibraryTraps` (PRIMARY) — ILLEGAL traps at vector addresses, used by all doors
2. `ExecLibrary.handleCall()` (LEGACY) — only from `AmigaDosEnvironment`
Generic stub in #1 returns D0 unchanged — **wrong** for any function that returns a value.

## Prior sessions (archived)

ACS security fix, NDK-generated LVO maps, MCP knowledge base (2026-04-30 — 05-01).
See `thoughts/shared/handoffs/`.

## How to run

```
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

start-servers.sh self-cleans before each run.

## Open priorities

1. **DOORSMENU argc mystery** — `[DIAG]` probe ready, needs server restart + test
2. **info-editor delete is silently broken** — `delete <KEY>` reports `[OK]` but the
   tooltype persists; re-parse still shows it `[ENABLED]`. Suspect `writeInfoFile`
   binary `_fallback` path round-trips raw bytes. Repro on `Doors/5D-User/5D-User.info`
   with `OVERCLOCK`. Blocks any tooltype editing through the script.
3. **13 divergent door icons vs Sanctuary reference** — 11 with `OVERCLOCK=100`
   (functional, matches our 100x emulation default — keep). 2 substantive: `ByteKiller`
   (NUKER names, SPY_LIST) and `Request` (path differences). Both installation-specific,
   user decision.
4. **doorman** "Cannot read directory" on archive listing — needs repro
5. **DoorLifecycleManager.ts** at 2020 lines — refactor candidate (over 2000 limit)
6. **LOGON24 screen** — optional; create a stylized one if desired


## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files (WEB_: tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login gated on `SHOW_NEW_FILES` tooltype
- MAILSCAN_ALL in confScan: ALL messages always included; conf `Conf.DB` flag gating deferred

## Gotchas

- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **Message storage**: body files at `<conf>/MsgBase/<id>` (no extension, raw body).
  HeaderFile + MailStats are the source of truth. Don't write to `Conf*/Messages/` —
  that path is dead.
- **`mailStat.highMsgNum`**: stores the *next* id (express.e:10688). Total messages
  = `highMsgNum - 1`.
- **`~SP` in screens**: displayScreen handles the pause + segment-resume internally.
  Callers must NOT also call `doPause()` — it overwrites `paginatedScreen` and
  re-runs post-`~SP` MCI codes.
- **`relConfNum`** drives the menu prompt and conftop, not `currentConf`. Pre-set
  the whole conf tuple before any conf-scoped MCI renders.
- **Body files store `\n`**: convert to `\r\n` at display time, not at write
  (express.e:10700-10703 stores raw `\n`).
- **conf_base scan_flags**: DEFAULT now 0. Migration resets any non-zero rows on startup.
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that
  produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires from (a) SCREENS_REQUIRE_CLEAR, (b) leading 0x0C,
  (c) `~f` MCI, (d) ~SR_ art files.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/,
  Conf12/ only).
- **Two May 1 GL/GLC commits** moved in opposite directions and broke logon. If you
  ever see "No such command!!" on login, check `Screens/logon20.txt` `~CC_gl` matches
  the actual `Commands/BBSCmd/<NAME>.info` filename.
