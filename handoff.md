# Handoff

## 2026-04-29 — message storage refactor + AUTO_REJOIN flow + test cleanup

Detailed handoff: `thoughts/shared/handoffs/2026-04-29_msg-refactor-and-login-fixes.md`

### What changed

- **Message storage** moved to express.e canonical `<conf>/MsgBase/<id>` (raw body, no extension). HeaderFile is single source of truth for metadata. `mailStat.highMsgNum` is now "next id to assign" matching express.e:10688/12418. `recv` lives in HeaderFile, no more `.recv` companion files. Disk wiped per user direction; new posts start at #1.
- **Mail scan** now fires the "Would you like to read it now (Y/n)?" prompt (express.e:11739). joinConference's inline mail scan is bypassed when called from confScan to avoid pointer-advance race.
- **AUTO_REJOIN** pre-sets full conf-identity tuple (`currentConf`/`relConfNum`/`currentConfName`/`currentMsgBase`) before CONF_BULL renders, so `~CC_CONFTOP` MCI finds the right `Conf<N>/ctop.data` and the menu prompt shows `[N:Name]` correctly. CONF_BULL screens with their own `~SP`/segments no longer get double-paused.
- **Message body** display converts raw `\n`→`\r\n` so xterm cursor returns to col 1.
- **Raw-display screens** (allowMCI=FALSE) now strip trailing `~SP` so files like `Conf*/Screens/uprough.txt` don't print "~SP" literally.
- **39 pre-existing test failures** fixed → 3974 pass / 0 fail / 151 suites green. Two real bugs caught (pendingGoodbye logoff, qwk parse buffer-size).
- **start/kill scripts**: start-servers.sh always cleans first; kill-servers.sh widened to TUI/tmux/build-wasm and skips its own PID/PPID so it doesn't kill its parent start-servers.sh.

### Recent commits

```
1b80edc20 fix(kill-servers): don't kill self / parent start-servers.sh
844acb3df fix(scripts): start-servers.sh always kills old instances + tmux/TUI
9d1d46862 fix(autorejoin): don't double-pause when CONF_BULL has its own ~SP/segments
a8998d778 fix(login/msg): pause+conf state, body line breaks, ~SP in raw screens
a54f2ace0 fix(autorejoin): pre-set currentConf so CONF_BULL MCI codes resolve to target
91169651e fix(confscan): skip joinConference mail scan when called from confScan
2cc990ed0 test: clear all 39 pre-existing test failures
e67bbb386 docs(msg): round-5 audit findings for message subsystem
c1fba301a fix(msg): align message storage with express.e canonical layout
```

### Verified

- `npx tsc --noEmit` clean
- Full backend jest: 3974 pass / 0 fail / 151 suites green (zero regressions vs. baseline)
- Mail scan list 1:1 with express.e:11713-11720 (zero-padded `000001` etc.)
- Multi-line message body renders flush left
- CONF_BULL/conftop reports correct conference data
- `~SP` no longer literal in raw screens

## Prior Sessions (archived)

Console v3 Phase E complete (2026-04-29) — TUI matches /admin/ feature surface across 5 phases. Audit rounds 3-4 (2026-04-26→27) fixed 138 deviations including BE byte-order corruption, security checks, core loop, conference system, MCI/display, file system, messages. See `thoughts/shared/handoffs/` for detailed reports.

## How to run

```
./dev/scripts/start-servers.sh              # full: BBS + Admin + SDK
./dev/scripts/start-servers.sh --bbs-only   # BBS terminal only
./dev/scripts/kill-servers.sh               # stop everything cleanly
```

start-servers.sh now self-cleans before each run (no more "servers already running" wall).

## Open priorities

1. **messaging.handler.ts** at ~1600 lines — monitor, split if needed
2. **screen.handler.ts** at ~3220 lines (exempted) — future refactor candidate
3. **doorman** still can't list archive contents — "Cannot read directory" error (untouched this session)
4. **Modem speed throttling**: user has 56k modem emulation set; output is rate-limited by ModemEmulator. Just context for any timing-related tests.

## Known WEB_ deviations (intentional)

- Line-mode vs char-mode; no HYDRA bidirectional transfer
- No `chooseAName` recipient validation, no `checkToForward`, no extSend
- confScan nav prompt: `(N+MAX)` format vs `replyPrompt`'s `(currentMsg)` — minor
- 2 command (callers log): shows DB entries not per-node files (WEB_: tagged)
- ZOOM: auto-selects ZIP; no LHA binary available
- GDPR gate on new user (WEB_ extension)
- File scan at login: gated on `SHOW_NEW_FILES` tooltype (DB FILE_SCAN_MASK path disabled to stop AquaScan auto-launching)
- MAILSCAN_ALL in confScan: ALL messages always included, conf `Conf.DB` MAILSCAN_ALL flag gating deferred

## Gotchas

- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE.
- **Message storage**: post-refactor body files at `<conf>/MsgBase/<id>` (no extension, raw body). HeaderFile + MailStats are the source of truth. Don't write to `Conf*/Messages/` — that path is dead.
- **`mailStat.highMsgNum`**: stores the *next* id to assign (express.e:10688). Total messages = `highMsgNum - 1`. Off-by-one bugs usually mean the writer treats it as "last assigned".
- **`~SP` in screens**: when CONF_BULL or any flow screen has `~SP`, displayScreen handles the pause + segment-resume internally. Callers must NOT also call `doPause()` — it overwrites `paginatedScreen` and re-runs the post-`~SP` MCI codes (e.g. `~CC_CONFTOP` running twice).
- **`relConfNum` drives the menu prompt and conftop**, not `currentConf`. Pre-set the whole conf tuple before any conf-scoped MCI renders.
- **Body files store `\n`**: convert to `\r\n` at display time, not at write (express.e:10700-10703 stores raw `\n`).
- **conf_base scan_flags**: DEFAULT now 0. Migration resets any non-zero rows on startup.
- **screens/quicknew.txt**: truncate to empty after any server crash/restart that produced garbage; regenerates clean on next batch run.
- **Screen clearing**: ESC[2J fires from (a) SCREENS_REQUIRE_CLEAR, (b) leading 0x0C in screen files, (c) `~f` MCI, (d) ~SR_ art files.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
