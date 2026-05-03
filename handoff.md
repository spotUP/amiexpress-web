# Handoff

## 2026-05-03 — Maintenance pass: SIG_LI, info-editor, file-cache, DOORSMENU root cause

### Today

- **SIG_LI (XIM 912) implemented properly** (`35779aa8b`). Was a stub returning
  empty string + 0; now mirrors `getPass2` (express.e:1504-1548): prompt
  display, `*` echo per char, 30-char hard cap, backspace/Enter as JH_LI.
  Routed through `XIMIOHandler` so it shares JH_LI's pause/resume + queue-drain.
- **info-editor delete bug fixed** (`5c6b122c9`). Was reporting `[OK]` while
  silently writing `rawBuffer` unchanged on `_fallback` files (e.g. malformed
  `Doors/5D-User/5D-User.info`). `writeInfoFile` now throws `InfoFileWriteError`;
  CLI/admin/door-manager UI surface the real error. Regression test added.
- **DOORSMENU root cause fixed** (`ce742d5ce` + `0049d687f`):
  1. `exec.library Allocate(-186)` was returning NULL; now properly walks the
     MemHeader free-chunk list per `exec/memory.h`. SAS/C `__MERGE` ctor was
     `__exit(20)`-ing on NULL.
  2. Door stack was placed past DATA, but BSS sits ABOVE DATA in SAS/C layout
     (CODE@0x2008, DATA@0x7608, BSS@0x7808). DOORSMENU's 25KB `Config cfg`
     local frame was clobbering the SAS/C startup's saved ExecBase / argc.
     `DoorLoader.computeStackBounds` now anchors the stack past the highest
     segment (8-byte aligned, 32-byte gap).
  3. Removed temporary debug checkpoints from `DoorLifecycleManager.ts`
     (`8d31a1723`).
- **amiga-text-decode util landed** (`26b131485`, `28cabd824`, `1a1278dda`).
  SAUCE-aware encoding/iCE-colors decoder shared by screens + bulletins.
  Reads via `fileCache.readBuffer` (not `readString`) so 0xB7 (·), 0xA9 (©),
  0xAE (®) survive the trip; `file-cache.readBuffer` re-reads from disk
  when a string was previously cached, avoiding the UTF-8 round-trip
  corruption (EF BF BD mojibake).
- **`fileEntries` dead in-memory cache removed** (`fa1f1d2e7`). Was always
  empty; live F-command path is `FileListingHandler` + `readDirFile`.
- **4 stale tests realigned** (`cc63bd526`): `acs.util` (8 failures from the
  c316ada1e file-based-ACS fix), `download-accounting`, `log-retention`
  (in-place truncate), `message-entry`. Suite back to green.
- **GL/GLC live fix** (earlier today): see `4034494a`, container restart at
  2026-05-03T15:16:55Z.
- **Conftop double-banner** (earlier today, `8abcb6082`): XIM-protocol doors
  now silently drop DOS stdout writes, matching real-Amiga AmiExpress.

### Commits today (chronological)

```
9d881f1c5 chore(diagnostics): add opt-in XIM_TIMING per-call timing
8d31a1723 chore(lifecycle): drop temporary DOORSMENU trace checkpoints
0049d687f fix(emulation): place door stack above the highest segment (BSS-aware)
ce742d5ce fix(emulation): implement exec.library Allocate() properly
1a1278dda refactor(screens): route screen + bulletin reads through amiga-text-decode
28cabd824 fix(file-cache): readBuffer must not round-trip through cached strings
26b131485 feat(util): add amiga-text-decode for shared screen/bulletin pipeline
5c6b122c9 fix(info-editor): surface fallback writes as a real error, not silent [OK]
cc63bd526 test: realign 4 stale suites with current behaviour
fa1f1d2e7 chore(file): remove dead fileEntries in-memory cache
049753f5b chore: sweep stale / inaccurate TODOs in active source
35779aa8b fix(xim): implement SIG_LI (912) per express.e:4205-4207
```

## How to run

```
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

`start-servers.sh` self-cleans before each run.

## Open priorities

1. **doorman "Cannot read directory"** — needs you to paste a path that
   triggers it.
2. **AquaScan false new-mail count** — `N` / `NSU` reports unread messages
   that aren't really there. Needs a sysop running the door + MCP traces to
   compare `AquaScan.Date.N` vs `msgBase` lastRead pointer.
3. **13 divergent door icons vs Sanctuary reference** — 11 with `OVERCLOCK=100`
   (functional, keep). 2 substantive: `ByteKiller` (NUKER/SPY_LIST) and
   `Request` (path differences). Both installation-specific, user decision.
4. **AmigaDosEnvironment.ts** (547 lines) — orphaned dead file, no imports.
   Safe to delete; queued for next pass.
5. **Dead `displayFileAreaContents` chain** in `file.handler.ts` — DEPRECATED-
   marked function shells + unreachable `FILES_SELECT_AREA` / `FILES_DOWNLOAD_SELECT`
   subState handlers in `command.handler.ts`. ~500 lines; queued.

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
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that
  produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires from (a) SCREENS_REQUIRE_CLEAR, (b) leading 0x0C,
  (c) `~f` MCI, (d) ~SR_ art files.
- **`_fallback` .info files**: parser tags them when the tooltype-array structure
  isn't recognised. `writeInfoFile` now throws `InfoFileWriteError` on these —
  silent no-op was the bug. Re-create the .info via Workbench/IconEdit.
- **High-bit bytes in screen/bulletin files**: route ALL reads through
  `readAmigaTextFileWithTransforms` (`utils/amiga-text-decode.util.ts`).
  `fs.readFileSync(path, 'utf8')` and `fileCache.readString(path, 'utf8')`
  silently corrupt 0xB7 (·), 0xA9 (©), 0xAE (®).
- **Two May 1 GL/GLC commits** moved in opposite directions and broke logon. If you
  ever see "No such command!!" on login, check `Screens/logon20.txt` `~CC_gl` matches
  the actual `Commands/BBSCmd/<NAME>.info` filename.
