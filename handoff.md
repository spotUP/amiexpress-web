# Handoff

## Current State
Server stopped. All changes committed and pushed (61bdabd9f). Server needs restart to pick up fixes.

## This session (2026-04-28)

### Dopewars buy/sell broken (de44a47d1)
- `wasm_buy_drug`/`wasm_sell_drug` passed `"N N"` to `BuyObject` which expects `"drug^N^N"` — type comparison always failed, buy/sell silently did nothing. `GetNextWord` also used whitespace instead of `^` as delimiter, breaking all internal BuyObject calls.
- After a question fired, `mode` was never reset from `'question'` to `'normal'`, permanently blocking B/S/J/H. `fullRender()` was also skipped when a question showed, leaving inventory stale.

### Message entry extra-Enter after abort (e4b62ba7e)
After `yesNo()` completes in any message state (abort, quote confirm, etc.), `advanceDisplayFlow()` was never called so the menu didn't appear until user pressed another key.

### Upload UI rewrite 1:1 express.e (aa3a7effa)
Old flow: showed stats, file-area menus, web picker — nothing like express.e.
New: `/X Zmodem UPLOADING....` → disk space (`formatSpaceValue` MiscFuncs.e:234) → `Filename lengths above 12` → `Batch UpLoading.....` → `Unlimited files. Blank Line to start transfer.` → `FileName N:` loop → blank → `Okay: (Enter)/G/A` prompt → A=Abort!, G=Goodbye!+transfer+logoff, Enter=transfer.

### Download D/DS rewrite 1:1 express.e (61bdabd9f)
Old flow: invented from scratch.  New flow matches express.e:
- Header: displayULStats (12691), ratio checks with secBoard branches (19984/19993), CREDITBYKB KBytes/Bytes labels, Wildcards line (20031)
- Filename loop: Checking... BEFORE validation (20145), exact error strings, Q/A Aborting, blank→exit/LAST CHANCE
- LAST CHANCE: two spaces between protocol and "Batch" (two aePuts calls in express.e), cps vs bps, REPEAT loop on unknown chars
- Post-transfer: File transfer Completed, stats line, second displayULStats, pGoodbye
- DS fixed: express.e:28303 DS = internalCommandD; DS now delegates to DownloadHandler, all 3 call sites await properly
- myError(ERR_NOFILES=5) = 'No files available in this conference.\r\n\r\n'

## This session (2026-04-27) — continued

### Grandmaster VS lobby overhaul
- Removed Ready/Start split → single Start button for all players (`readyFlow: false` in SDK `MultiplayerLobby`)
- **Option A flow**: pressing Start marks you ready; when last human presses, match auto-starts
- **Countdown + Force Start** (host only): 60s timer after host presses Start; bot-fills on expiry; Force Start button appears for host after pressing
- **Network sync fix**: `game:starting`/`game:start` broker events now emit `match:starting`/`match:started` on `GrandmasterNetworkManager` → both players' lobbies transition simultaneously
- **Adapter fix**: non-host `startMatch()` no longer emits local events; relies on broker broadcast
- **Tab isolation fix** (`BBSTerminal.tsx`): auth token written to `sessionStorage` on login; `getStoredSharedToken` reads `sessionStorage` first → two tabs logged in as different users no longer steal each other's socket on reconnect
- **Versus screen**: opponent name now uses `update.playerName` (added to `GameUpdate` interface + `sendUpdate()`) instead of falling back to UUID
- **GDPR webhook**: `gdprConsented: !!user.gdprConsentAt` threaded into all `sendWebhook` calls; `applyPiiPolicy` now shows real username for users who accepted the GDPR notice
- `unhandled-errors.log` now capped at 10MB (rotate on write)

### Amiga big-endian audit and fix — CRITICAL
**Root cause found**: Conf.DB, MailStats, HeaderFile, User.data/keys/misc were all being read/written with LE methods. The Amiga 68K is big-endian — all multi-byte fields must use BE.

**Code fixed** (all → BE):
- `ConferenceFileManager.ts` — global Conf.DB
- `MessageIndexManager.ts` — MailStats + HeaderFile
- `message-file.util.ts` — MailStats legacy path
- `amiga-parser.service.ts` — User.data/keys/misc parser; record sizes corrected (239/54 → 232/56, 256 → 248)
- `xim/system-commands.ts` — per-conf Conf.DB slots (removed duplicate LE writes)
- `DosLibrary.ts` — DateStamp(), ExamineObject fib_Date, ExNext fib_Date, DateToStr epoch

**DateStamp bug**: was using local-time `getHours()`/`getMinutes()` → AquaScan showed 00:00:00, file areas always "new". Fixed: all date stamp code now uses `dateTimeToDateStamp()` from `date-time.util.ts` (UTC-based).

**Data fixed**:
- SQLite `conf_base`: 45 corrupted rows reset (byte-swapped values like 201326592 instead of 12)
- `updateScanPointer` / `updateReadPointer` → UPSERT (no more silent no-op when row missing)
- `User.data` / `User.keys` / `user.misc` rebuilt from scratch: 2 slots (spot=1, sysop=2), correct BE format, correct struct sizes
- `Conf{N}/MsgBase/HeaderFile`: 22 LE-encoded message numbers fixed in Conf2/4/5/7/14
- `Conf{N}/MsgBase/MailStats`: regenerated for all 14 conferences from corrected HeaderFiles
- `Conf{N}/Conf.DB`: slots 1 (spot) and 2 (sysop) written in correct BE format for Conf1–13

**CLAUDE.md**: Rule 0 added — "Amiga Is Big-Endian". Includes code examples, list of Amiga binary formats, list of correctly-LE PC formats (QWK, LZH, SAUCE), and history note.

### Admin panel audit — DONE (909cc5828)
- **GET /api/stats/last-callers**: crashed (`no such column: u.phoneNumber` → `u.phone`); empty (`action='login'` → `'Logged on'`)
- **totalCalls/callsToday**: also used wrong `'login'` action — now show real counts
- **Conference names**: showed "Conference N" — added `name` field populated from `ConfConfig.info`
- **SMTP password exposure**: GET /api/config/system now masks sensitive fields (`smtp_password`, `reg_key`, etc.) with `'***'`
- **Ghost users**: GET /api/config/users filtered to exclude `_gu_` web guest accounts
- **LE/BE test fixtures**: `mailstats-truncation.test.ts` + `message-file.util.test.ts` now write BE to match the BE read fix

### Message editor — 7-pass deep audit complete (this session)
Seven passes of express.e 1:1 audit. All critical bugs fixed:
- **Passes 1-2**: Dead code removed; express.e header/ruler/prompts; D/E return to options; first-char yesNo handlers; C/E inputBuffer pre-fill
- **Pass 3**: CRASH fix (`entry.lines` → `entry.body`); quote order (lines→separator→blank); abort field names; quote re-prompt format
- **Pass 4**: POST_MESSAGE_OPTIONS/ABORT_CONFIRM/QUOTE_REPLY_CONFIRM missing from messageSubStates (options menu completely broken); DELETE_LINE/EDIT_LINE/EDIT_LINE_CONTENT/INSERT_LINE/INSERT_TEXT not line-buffered (single char broke multi-digit line numbers); parentId null in saveMessage
- **Pass 5**: C command inputBuffer pre-fill; E command inputBuffer pre-fill
- **Pass 6**: R command inputBuffer not cleared; POST_MESSAGE_PRIVATE single-char (was line-buffered, caused 'YYes' echo artifact); yesNo loop-on-unknown for all confirm handlers; 75-char line truncation
- **Pass 7**: saveMessage output now `Saving...Message Number N...done!\r\n\r\n`; removed incorrect empty-message rejection; error output `Failed!\r\n\r\n`; forward message handler raw ANSI codes fixed (missing `\x1b`)

**Remaining WEB_ deviations** (inherent/intentional):
- Line-mode vs char-mode (no word-wrap, no cursor positioning)
- No `chooseAName` recipient validation
- No `checkToForward`
- No `extSend` (external msgbase) support
- WEB_ press-key prompt after save (extra user feedback)

### Login flow audit — DONE (6cda97389)
- **MAILSCAN_PROMPT** (express.e:28075): `MAILSCAN_PROMPT_INPUT` state. Shows `Scan for Mail (Y/n)?` before confScan. Y/Enter=scan; N=skip. Node1-6+Node97 updated with `MAILSCAN_PROMPT=YES`.
- **SCREEN_MAILSCAN** (express.e:28073): Was missing entirely. Added `displayScreen(SOCKET, session, 'MAILSCAN')` in CONF_SCAN handler before tooltype check.
- **File scan default**: `checkFileConfScan` catch now returns `false`. Conf1,2,3,13,14 have SHOW_NEW_FILES.
- **BULL/NODE_BULL fix** (express.e:28556-28557): Were gated by quickFlag and noBulls — wrong. express.e shows both unconditionally. quickFlag only gates LOGON (express.e:29853).
- **AquaScan.UserData** (46ca066e9): After confScan, write current DateStamp to user's slot ((slotNumber-1)*16). AquaScan reads it but has no Write() LVO calls. Fixes "Scanning dir N for 00:00:00".
- **Config audit**: logon20.txt functional (QuickNew+flt via MCI, sec≥20 users). BULL.TXT and CONF_BULL.TXT are empty — no content issues found, those are sysop content choices.

## Open priorities
1. **zOOsTAT "NOT deleted"** — see `thoughts/shared/handoffs/2026-04-27_zoostat-not-deleted.md`
2. **xim/io.ts** — approaching 2000 line limit, needs modular split
3. **Message editor WEB_ extensions** — attach/quote/insert/replace unreachable; add to options menu if desired

## Gotchas
- **Amiga = BE**: see CLAUDE.md Rule 0. QWK/LZH/SAUCE are LE (PC standards). Everything else Amiga = BE.
- **DateStamp fixed**: AquaScan time display and file area "new since" should now work correctly. Restart required.
- **conf_base**: 45 rows were zeroed. On first login after restart, confScan will scan all conferences and set correct high-watermarks. Messages will appear new once, then correctly tracked.
- **User.data rebuilt**: old 17793-slot garbage file replaced with clean 2-slot BE file.
- **Door file tracking** only applies to doors installed after `94c4fefb9`.
- **b4d8c381a WARNING**: startup XIM changes reverted. AquaScan.020 warning-on-exit may resurface.
- **ctop.data** must exist per conference for Conftop-II (currently Conf1/, Conf2/, Conf12/ only).
