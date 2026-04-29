---
date: 2026-04-29
topic: message-storage-refactor + AUTO_REJOIN flow fixes + test cleanup
tags: [messaging, autorejoin, conftop, testing, scripts]
status: implemented
---

# 2026-04-29 — Message storage refactor + AUTO_REJOIN flow fixes

## Tasks completed

1. Round-5 audit of the message subsystem against express.e
2. Express.e-canonical message storage refactor (file path + format + MailStats semantics)
3. Cleared all 39 pre-existing backend test failures (now 3974 pass / 0 fail / 151 suites green)
4. Mail scan "Would you like to read it now (Y/n)?" prompt now fires correctly
5. AUTO_REJOIN flow polished: conftop banner finds the right conf, multi-line message bodies render properly, `~SP` no longer prints literally
6. start-servers.sh always cleans up before starting (no more "servers already running" wall, no self-kill)

## Commits (chronological)

| SHA | Summary |
|---|---|
| `c1fba301a` | Message storage moves to express.e canonical `<conf>/MsgBase/<id>` layout (raw body, no extension). Fixes off-by-one `highMsgNum`, dual-MailStats, triple-write per save. |
| `e67bbb386` | Round-5 audit research doc. |
| `2cc990ed0` | Cleared 39 pre-existing test failures. Two real bugs fixed (pendingGoodbye, qwk parse). |
| `91169651e` | `joinConference` skips its inline mail scan when invoked from confScan path — was advancing the read pointer past every msg before advanceConferenceScan's prompt could fire. |
| `a54f2ace0` | AUTO_REJOIN pre-sets `session.currentConf` so CONF_BULL's `~CC_CONFTOP` MCI resolves to the target conf instead of "not installed". |
| `a8998d778` | Three more login/msg fixes: full conf-state pre-set (`relConfNum` etc.), body `\n`→`\r\n` for xterm cursor, `~SP` strip in raw-displayed screens. |
| `9d1d46862` | AUTO_REJOIN no longer double-pauses when CONF_BULL has its own `~SP`/segments. |
| `844acb3df` | start-servers.sh always kills old servers + tmux session + TUI before starting. |
| `1b80edc20` | kill-servers.sh skips its own PID and `$PPID` so it doesn't kill its parent start-servers.sh. |

## Critical references

### Message subsystem
- `web/backend/src/utils/message-file.util.ts` — rewritten for `<conf>/MsgBase/<id>` raw-body layout
- `web/backend/src/services/MessageIndexManager.ts:415-440` — `updateMailStatsAfterAdd` now bumps `highMsgNum+1` unconditionally and applies the `lowestNotDel:=1` first-save rule (express.e:12418-12419)
- `web/backend/src/services/MessageIndexManager.ts:75` — new `setBbsRoot(root)` for tests
- `web/backend/src/services/MessageFileManager.ts` — thin wrapper using same canonical paths
- `web/backend/src/database/message-repository.ts:15` — `createMessage(message, opts?)` takes `skipDiskWrite` so message-entry.handler.saveMessage doesn't trigger a second allocation
- `web/backend/src/handlers/message/message-entry.handler.ts:480` — passes `skipDiskWrite: true`
- `web/backend/src/handlers/message/message-scan.handler.ts:733-743` — "Would you like to read it now (Y/n)?" prompt + yield (express.e:11739)
- `web/backend/src/handlers/message/messaging.handler.ts:250` & `:322` — body `\n`→`\r\n` conversion at display time
- `thoughts/shared/research/2026-04-29_message-subsystem-deviations.md` — full round-5 audit doc

### AUTO_REJOIN flow
- `web/backend/src/handlers/operations/conference.handler.ts:240` — `joinConference` mail scan now gated on `!auto && !confScan && forceMailScan != SKIP`
- `web/backend/src/handlers/command.handler.ts:747-820` — AUTO_REJOIN block resolves confId early, pre-sets `currentConf`/`relConfNum`/`currentConfName`/`currentMsgBase` before `displayScreen('CONF_BULL')`, and only calls `doPause` when CONF_BULL didn't set up its own pause/segment state
- `web/backend/src/handlers/screen.handler.ts:2263-2284` — raw-display path strips trailing `~SP` so allowMCI=FALSE files (form-feed start, e.g. `Conf*/Screens/uprough.txt`) don't print "~SP" literally

### Test cleanup
- `web/backend/dev-scripts/jest.config.ts:27-32` — `moduleNameMapper` strips `.js` suffix so swc/jest resolves ESM-style imports back to `.ts`
- `web/backend/src/handlers/transfer/batch-download.handler.ts:140-160` — `pendingGoodbye` branch moved BEFORE the early-return guard
- `web/backend/src/services/qwk.service.ts:171-176` — `parseQWKMessage` returns null for buffers `< 128` bytes (was returning bogus partials)
- `web/backend/tests/utils/message-file.util.test.ts` — rewritten for express.e-canonical layout (39 tests, all green)
- `web/backend/tests/utils/error-handling.util.test.ts:224-272` — `permissionDenied` now matches express.e:3037-3039 (no action token, no press-key, no default nextState)
- `web/backend/tests/utils/date-time.util.test.ts:55-152` — `formatLongDate` is FORMAT_USA "MM-DD-YY"; `formatLongDateTime` carries the FORMAT_DOS weekday prefix
- `web/backend/tests/displayFlow.test.ts` — quickFlag tests now reflect express.e:29853 (only LOGON is gated, not BULL); NO_BULLS test deleted (not in express.e)

### Scripts
- `dev/scripts/start-servers.sh:642-660` — always kill+rm-lockfile, never bail on "servers already running"
- `dev/scripts/kill-servers.sh:14-40` — skip `$$`/`$PPID`; widened to also kill dev/console TUI, status strip, build-wasm, tmux session "amiexpress"

## Recent test+verification matrix

| What | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| Full backend jest run | 3974 pass / 0 fail / 151 suites green |
| Mail scan list 1:1 with express.e:11713-11720 | verified — `Public  tester …  000002` zero-padded |
| "Would you like to read it now (Y/n)?" | fires on new mail; silent when no mail (express.e:11738) |
| Multi-line message body display | `tes`+`t` renders flush left (no indent under previous line) |
| CONF_BULL renders in target conf context | confirmed (`[2:Amiga Warez!]`, conftop reports actual stats) |
| `~SP` literal in raw-display screens | gone |
| Message #1 starts at 1 (post-wipe) | confirmed |

## Learnings / gotchas

- **The mail-scan prompt only fires when there's actual new mail.** Express.e:11738 gates the prompt on `mailFlag=1`. When the inbox has nothing new, the scan stays silent (or prints "No mail today!" at conf 0). The "Scan for Mail (Y/n)?" prompt at the *start* of the scan is gated separately on the `MAILSCAN_PROMPT` tooltype in `Node{N}.info`.
- **`displayScreen` already pauses for `~SP`-containing screens.** It sets up `paginatedScreen` + `screenSegments` and emits the "(Pause)..." prompt itself. Callers that follow up with their own `doPause()` overwrite `paginatedScreen` and the segment-resume runs the post-`~SP` MCI codes a second time. AUTO_REJOIN's `doPause()` is now gated on `!lastScreenHadPause && !screenSegments`.
- **`relConfNum`, not `currentConf`, drives the menu prompt format `[N:Name]`** — and the conftop door reads `Conf<relConfNum>/ctop.data`. Pre-setting `currentConf` alone is not enough; pre-set the whole conf-identity tuple before any conf-scoped MCI renders.
- **`allowMCI` gate (express.e:6800-6806) lives in `displayScreen`, not in `parseMciCodes`.** Files loaded via inline `~SS_` go back through `displayScreen` which re-applies the gate per file. Files starting with form-feed (`\x0C`) or other non-`~` bytes are then raw-displayed; any `~SP` in such files needs a separate strip pass (now in place).
- **kill-servers.sh's `pgrep -f start-servers.sh` matches itself when invoked from start-servers.sh.** Always exclude `$$` and `$PPID` from kill targets when a kill script is spawned by another script.
- **Body files store `\n` line breaks per express.e:10700-10703.** xterm.js needs `\r\n` to return cursor to col 1; bare `\n` just advances a row. Convert at display time, not at write time, to keep the on-disk format byte-identical to express.e.

## Artifacts

- Audit doc: `thoughts/shared/research/2026-04-29_message-subsystem-deviations.md`
- All commits on `main`, pushed-or-not status: see `git log origin/main..HEAD`

## Open

- 56k modem emulation: user has `MODEM_SPEED=56000` set; output is throttled by `ModemEmulator`. Not a bug, just context for any timing-related observations.
- User reported "BBS clears the screen a lot" — most clears come from `~f` MCI in bulletin files (e.g. `Conf2/bull20.txt` has `~f` at start AND between `~SP` and `~CC_CONFTOP`). These are explicit directives in the data, not in our code, and 1:1 with express.e behavior. If the user wants fewer clears the data files need editing, not the BBS.
- Doorman: still can't list archive contents — "Cannot read directory" error (untouched this session).

## Next steps

1. Verify start-servers.sh restart cycle works after the self-kill fix.
2. User reports "test" as message #1 displayed correctly post-fix; widen the smoke test to: post a public message addressed to ALL, log in as a second user, verify scan + read flow.
3. The "BBS clears too much" complaint deserves a targeted look at exactly which screens trigger which clears — but only after the user identifies a specific spot that's wrong vs. express.e.
