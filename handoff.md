# Handoff

## 2026-05-04 — Live test pass: DOORSMENU works, Conftop, operator chat, FLT mojibake

### Today

- **DOORSMENU verified live** — runs and reaches its menu. The
  stack-above-BSS fix from yesterday holds.
- **Conftop double-banner — second fix** (`b014ec0cd`). Yesterday's
  form-feed translation (`44411707b`) wasn't enough on its own; user
  still saw 2 rows pre-render before \f cleared. Re-applied the DOS
  stdout suppression from `8abcb6082` (which `44411707b` reverted on
  a wrong hypothesis). Both fixes now coexist: form-feed → ESC[2J
  for in-protocol clears; DOS stdout silently discarded for
  XIM-protocol doors so printf banners stay invisible like on real
  Amiga (Output() → NIL:).
- **Operator chat audited 1:1 with express.e** (`63539d80c`). Two
  deviations fixed: (1) bot only replied on "double enter" — express.e
  has no such gate, every Enter flushes the line; now bot responds to
  every non-empty user line. (2) typing simulation added 3-5s of fake
  delay on top of the LLM round-trip; express.e sysop chars echo at
  line speed, no artificial delay — both intro and replies now emit
  instantly via sendChatMessage. Split-screen layout (line 23 sysop,
  line 24 user) kept as a usability improvement.
- **FLT logo mojibake** — server-side pipeline pinned clean by e2e
  test (`2e31a9415`). Wire-trace instrumentation added (`82dcf35e8`,
  `WIRE_TRACE=1` env var) for if it recurs. User reports the FLT
  logo is randomised per login and they haven't seen the mojibake
  variant since — closed pending re-report.
- **Test cleanup** — re-aligned `acs.util.test.ts` (8 failures from
  the file-based-ACS security fix), `download-accounting`,
  `log-retention`, `message-entry` (all yesterday in `cc63bd526`).
  Suite back to green: 158/159 file suites, 4037/4046 tests passing.

### Open priorities (today's leftover backlog)

1. **doorman "Cannot read directory"** — needs you to paste a path
   that triggers it.
2. **AquaScan false new-mail count** — `N` / `NSU` reports unread
   messages that aren't really there. Needs a sysop running the door
   + MCP traces to compare `AquaScan.Date.N` vs `msgBase` lastRead
   pointer.
3. **13 divergent door icons vs Sanctuary reference** — 11 with
   `OVERCLOCK=100` (functional, keep). 2 substantive: `ByteKiller`
   (NUKER/SPY_LIST) and `Request` (path differences). Both
   installation-specific, your decision.

### Commits today (chronological)

```
82dcf35e8 diag(modem): WIRE_TRACE=1 logs hex of high-bit codepoints on emit
b014ec0cd fix(emulation): re-apply DOS stdout suppression for XIM doors (Conftop)
2e31a9415 test(decode): pin server-side high-bit byte preservation end-to-end
63539d80c fix(operator-chat): respond per message, drop typing simulation
10d85b452 docs(emulation): handleCall comment after AmigaDosEnvironment removal
fa1a27b94 chore(file): remove dead displayFileAreaContents chain + handlers
627d1e15e docs: refresh handoff for 2026-05-03 maintenance pass
```

## 2026-05-03 — Maintenance pass

- **SIG_LI (XIM 912)** properly implemented per express.e:1504-1548
  (`35779aa8b`).
- **info-editor delete** was silently no-op on `_fallback` .info
  files; now throws `InfoFileWriteError` (`5c6b122c9`).
- **DOORSMENU root cause** = stack-above-BSS overlap + missing
  Allocate (`0049d687f` + `ce742d5ce`).
- **amiga-text-decode util** landed: shared SAUCE/iCE/encoding
  pipeline for screens + bulletins; preserves high-bit bytes
  (`26b131485`, `28cabd824`, `1a1278dda`).
- **Dead code removed**: `fileEntries` cache (`fa1f1d2e7`),
  `displayFileAreaContents` chain (`fa1a27b94`),
  `AmigaDosEnvironment.ts` (`db6a8618b`).
- **4 stale test suites realigned** (`cc63bd526`).
- **GL/GLC live fix** (`4034494a`).
- Conftop fix #1 was reverted, see today.

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
