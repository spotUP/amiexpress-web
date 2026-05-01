# Handoff

## 2026-04-30 — NDK-generated LVO maps + MCP knowledge base

### What changed

- **Auto-generated LVO/struct maps from NDK 3.1**: `dev/scripts/generate-lvo-maps.js` reads the MCP NDK index and generates 3 TypeScript files:
  - `lvo-names.generated.ts`: 1114 function names across 43 libraries
  - `lvo-params.generated.ts`: 952 functions with register/type annotations
  - `struct-fields.generated.ts`: 180 fields across 14 key structs (Process, Task, CLI, MsgPort, FileHandle, FileLock, etc.)
- **LibraryTraps enhanced**: Stub vectors now show real function names (was generic `lib-stub`). Unimplemented function errors show function name + offset.
- **DoorExecutionLogger**: Complete AEDoor function name map (20 functions, was 6).
- **MCP knowledge base tools**: 3 new tools (`search_ndk_structs`, `search_hw_registers`, `search_m68k_isa`) backed by indexes from rmtew/amiga-reversing.
- **Startup tmux fixes**: kill-servers.sh self-destruction fixed. Single-window layout. F-key hotkeys.

### Recent commits

```
d1fd5d8 feat(emulation): auto-generate LVO maps, params, and struct fields from NDK
9fb1445 feat(mcp): add Amiga knowledge base tools from amiga-reversing
a6ba536 docs: update handoff for MCP knowledge base session
```

### Verified

- `npx tsc --noEmit` clean
- Generated maps validated: Process pr_CLI=172, OpenLibrary LVO=-552, all 43 libraries present
- MCP smoke tests pass for all 3 new tools

## Prior Sessions (archived)

Message storage refactor + AUTO_REJOIN flow (2026-04-29). Console v3 Phase E (2026-04-29). See `thoughts/shared/handoffs/` for details.

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
