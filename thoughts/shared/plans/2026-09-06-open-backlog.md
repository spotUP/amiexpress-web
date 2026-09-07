---
date: 2026-09-06
topic: Open backlog - everything outstanding, including work parked by the rate limit
tags: [backlog, petscii, transport, achievements, file-view, 68k, arcade]
status: final
---

# Open backlog - 2026-09-06

> **VERIFIED 2026-09-06, late.** Sections 0, 1, 2 and 10 were written in the
> morning and most of their rows have since closed. Everything below marked
> **[verified closed]** was re-measured against the tree tonight, with the
> evidence named. Sections 3 to 9 were NOT re-checked and stand as written.
>
> - **0.x (six agents in flight)** - stale; that batch finished.
> - **1.4 / 1.5 red compact-40 suites** - [verified closed] `tests/doors/compact-40`
>   and `forty-col-sweep` run 220/220 green.
> - **1.3 SDK door-theme suites** - STILL RED, 8 in `tests/unit/door-themes.test.ts`.
>   Not a regression: the theme's own source says the change was deliberate
>   (`tokens.ts` - "its bars are yellow with black text now"), so the PINS are
>   stale, not the theme. The theme session owns it; it committed there at 16:05.
> - **1.6 PETSCII cursor never blinks** - superseded: a door that owns the
>   screen now hides the cursor entirely (`door-active` -> `cursorVisible`).
> - **1.7 GRANDMASTER PETSCII** - [verified closed] and then some; see the
>   handoff's top section for the night's work.
> - **2.1 DOORREPO refuses at 40** - [verified closed] `C64_ADAPT=40` is on its
>   `.info`, and the real gate expression
>   (`sessionColumns < resolveDoorMinColumns && !doorOpensForC64`) answers
>   "opens".
> - **2.2 `FR` cannot list files** - [verified closed] by the width-gate
>   fall-through: `F`/`FR`/`N`/`Z` are all in `INTERNAL_COMMAND_NAMES`, so a
>   40-column caller gets the board's own listing instead of the refusal.
> - **2.3 BULLETINS will not start** - [verified closed] `B` carries
>   `C64_ADAPT=40`; the gate answers "opens".
> - **2.4 DOORS has no animated dashes at 40** - BY DESIGN, not a bug.
>   Everything that moves is gated on `effectsAllowed()`, which the compact
>   tier turns off, because a moving effect on a 40-column canvas leaves stray
>   glyphs (the DOORMAN lesson, 2026-09-02).
> - **10.1 CRLF files not on main** - [verified closed] `8bd9b0a5c` is an
>   ancestor of `origin/main`.
> - **10.2 `Doors/THEMEC` and `Doors/ThemeC` both tracked** - [verified closed]
>   along with GWall/Gwall: `dev/scripts/check-case-collisions.cjs` reports no
>   collisions among 17,701 tracked paths, and a pre-commit hook now stops new
>   ones.
>
> What that leaves genuinely open: sections 3 to 9 - transport parity,
> achievements, the C64 file view, the C SDK, 68K marking, the arcade queue -
> plus the manual walks in section 9, which only the sysop can tick.

Every open item, including everything parked when the rate limit hit on
2026-09-03. Ordered by lane, not by priority; the priority call is the
sysop's. "Parked" = was in flight or next-up before the gap.

---

## 0. In flight right now (six agents)

| # | Item | Agent | State |
|---|---|---|---|
| 0.1 | Deploy unblock + CI runs jest again (4 typecheck errors in `web/backend/tests/screens/`) | deploy/CI | running |
| 0.2 | `scanMciCodes` loss in `screen-index.service.ts` | typecheck | running |
| 0.3 | My area: census 150->154, `cursor-visibility` ruling, dead `setCursorVisible`, THEMEC crossed registration | my-area | running |
| 0.4 | TP-10 registry recovery out of `1b7256a39` | tp-10 | running |
| 0.5 | Achievements AC-5/AC-6/AC-7 (door server) | achievements | running |
| 0.6 | GRANDMASTER PETSCII black-screen REGRESSION - bisect, root cause, fix | gmaster | running |

---

## 1. Blockers on `main`

| # | Item | Note |
|---|---|---|
| 1.1 | Live board is stale - 6 failed deploys since 09-05 | 0.1 owns it |
| 1.2 | CI never reaches jest - 4 typecheck errors block it | 0.1/0.2 |
| 1.3 | Red: 4 SDK door-theme suites from `b19f9fd45` | owner is the theme session |
| 1.4 | Red: `tests/doors/compact-40/tetris-attack.test.ts` - stale menu, expects 3 entries gets 19 | unowned |
| 1.5 | Red: `compact-40/doorman-layout`, `livechat-panel-borders`, `transport-adapter` | 0.3 covers transport-adapter |
| 1.6 | PETSCII cursor never blinks - `PetsciiCanvas.tsx:177` | 0.3 |
| 1.7 | GRANDMASTER PETSCII broken by another session | 0.6 |

## 2. Sysop-reported PETSCII bugs from before the gap - VERIFY, may be stale

| # | Report (sysop, 09-03) | Status |
|---|---|---|
| 2.1 | DOORREPO says "needs an 80 column screen" in PETSCII mode | needs re-test after the marking batches |
| 2.2 | `FR` does not work - cannot list files in PETSCII | the C64 file view (lane 5) is the real answer |
| 2.3 | BULLETINS (`B`) door would not start in PETSCII | needs re-test |
| 2.4 | DOORS door has no animated dashes | open |
| 2.5 | `E` layout broken in PETSCII | CLOSED - `E` is not a door; its `.info` deletion was intentional |

## 3. Transport parity - `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`

TP-1..TP-7 landed. TP-10 is 0.4. Remaining, in plan order:

| # | Task |
|---|---|
| 3.1 | TP-8 - ONE input pipeline |
| 3.2 | TP-9a - ONE login state machine, server half |
| 3.3 | TP-9b - retire the browser's line editor |
| 3.4 | TP-11 - downloads: ZMODEM or an honest refusal |
| 3.5 | TP-12 - SSH becomes a first-class transport |
| 3.6 | TP-13a - entry parity: banner, fourth transport, caller address |
| 3.7 | TP-13b - close parity: one finalize, one buffer release, one keepalive |
| 3.8 | TP-14 - the three-transport walk, pinned |
| 3.9 | TP-15 - what is DELETED |
| 3.10 | TP-16 - the reachability ledger |
| 3.11 | TP-17 - freshness, manual acceptance, handoff (last, mandatory) |
| 3.12 | Land `tests/transport/parity-symptoms.test.ts` (the RED suite, deliberately not on main yet) |

## 4. Achievements - `docs/superpowers/specs/2026-09-03-global-achievements-design.md`

Four sub-projects. SP1 is in the door server repo (`amiexpress-doorserver`),
plan `docs/superpowers/plans/2026-09-03-achievements-server.md`, 21 tasks.

| # | Task |
|---|---|
| 4.1 | SP1: AC-5..AC-21 (AC-1..AC-4 committed, AC-5..AC-7 = agent 0.5). Nothing pushed - 5 ahead |
| 4.2 | SP2: web BBS reporter service + call sites |
| 4.3 | SP2: outbox + flusher (a board must survive the server being down) |
| 4.4 | SP2: live unlock notice + next-login notice |
| 4.5 | SP2: SDK toast widget on all three screen sizes and inside a blessed door |
| 4.6 | SP2: `achievement_unlocked` trigger with `tier_filter` |
| 4.7 | SP2: sysop config with its negative off-switch (a boolean tooltype cannot default true) |
| 4.8 | SP3: `Doors/achieve/` TypeScript door |
| 4.9 | SP3: `ctx.achievement()` on the door API + manifest parsing/registration |
| 4.10 | SP3: first door definitions - grandmaster, phreakwars, card-lobby, arcade |
| 4.11 | SP4: C HTTP client promoted into `sdk/c/` |
| 4.12 | SP4: the 68K ACHIEVE door as the C SDK plan's phase-5 proof door |
| 4.13 | SP4: byte-parity test, C ACHIEVE vs its TypeScript twin at 80 columns |

## 5. C64 40-column file view - `docs/superpowers/specs/2026-09-03-c64-file-view-design.md`

0% implemented. This is the answer to 2.2. **Spec revised 2026-09-06** after
`thoughts/shared/research/2026-09-06_cbase-reference-and-40col-listings.md` and
`thoughts/shared/research/2026-09-06_cbase-petscii-viewer.md`, and after two
sysop decisions: the LIST is now ONE ROW PER FILE (C*Base-native, twenty-plus
records per screen) with description-first surviving only on the SINGLE-record
surfaces, and the LAYOUT IS DATA - a sysop-editable `Prompts/FILEVIEW.40` of
MCI templates. Six sub-projects became seven.

| # | Task |
|---|---|
| 5.1 | SP1: shared `describe.ts` extractor moves to the door server `contract/`, plus the mirror, the fixture corpus and both drift tests |
| 5.2 | SP2: the release-group logo pack and its resolver (one function, every caller). No importer - logos are Petmate SEQ exports; carry the two Petmate byte traps into the tests; the image ships NO `.seq` and NO `GROUPS.MAP` (`Screens/` is always-overwrite-synced) |
| 5.3 | SP3: the layout language - `~t<nn>\|` column tab in the global MCI prefix dispatch, the scoped `~F_*` record-field family, `Prompts/FILEVIEW.40`, the built-in default + its generation drift test, `file-layout.service.ts` (mtime guard, frozen snapshot, three malformed conditions), and `Prompts` added to the entrypoint's TRACKED sync |
| 5.4 | SP4: the local file index - schema, build, migration/backfill of the existing base, four group sources |
| 5.5 | SP5: the record interpreter + the internal listing - `renderFileRow` (LIST, one row per file, fixed columns, header + `▔` rule, new-file flag, per-field colour, pagination through `flagPause()`) and `renderFileBlock` (SINGLE record, DESCRIPTION FIRST), the new `FI <n>` command, retire `narrowFileLines` |
| 5.6 | SP6: the adapter's `stack` rung + backend hook, so the DOOR path and the INTERNAL path emit identical bytes - side-by-side pin asserts equal rows AND equal layout sha1 AND that a second fixture layout changes both paths identically; then `C64_ADAPT=40` on `f`/`fr`/`n` |
| 5.7 | SP7: the DIZ fallback ladder - `squeeze` gated on `prose`, `DIZ_ART_SKIP`, six fixtures (three measured, three labelled synthetic) |
| 5.8 | Pin the 80-column view unchanged, including `mci-dispatch-ansi-pin.test.ts` staying green after `~t` lands (Risk 10: `~t` is global, so grep every shipped screen and the live volume's `Screens/` for a literal `~t` first) |

Order: 5.1 / 5.2 / 5.3 in parallel -> 5.4 -> 5.5 -> 5.6; 5.7 any time after 5.5.
Nothing before 5.5 changes a byte for a non-PETSCII caller except 5.3's `~t`.

## 6. C SDK for 68K - `thoughts/shared/plans/2026-09-02-amiga-c-door-sdk.md`

Phase 0 committed as `sdk/c/`. Another session was working this as of 09-03.

| # | Task |
|---|---|
| 6.1 | Phases 1-4 of the C SDK |
| 6.2 | Phase 5 proof door = ACHIEVE (replaces theme-picker in that role) - see 4.12/4.13 |
| 6.3 | DreamDoor.Library compat still needs the 2.4 KB disassembly |

## 7. 68K door C64 marking

| # | Task |
|---|---|
| 7.1 | Continue the capture-then-mark batches - 16 of 87 registered commands marked, none since 09-03 |
| 7.2 | Re-run the reachability sweep after the file view lands (5.x changes what a C64 caller can reach) |

## 8. Arcade / sprite queue (user-ordered 2026-08-31, untouched since)

| # | Task |
|---|---|
| 8.1 | 8-way scrolling playfield as a SHARED capability in `sdk/engines/graphics/cell-art` + off-screen radar indicators |
| 8.2 | Frogger sprite pass - cabinet reference shots first; build from the Gameduino tutorial lane data |
| 8.3 | Sprite studio plans 2a/2b/2c and the sprite-capable ANSI editor run parallel to the above |
| 8.4 | Converge the two ANSI editors - plan 3; do not extend the widget fork |

## 9. Manual walks owed (only the sysop can tick these)

| # | Task |
|---|---|
| 9.1 | TETRIS ATTACK walk: 80-col web, 132-col telnet, a `P` PETSCII session, a real C64 |
| 9.2 | TETRIS ATTACK VS PLAYER, two sessions through the real broker |
| 9.3 | The PETSCII door walk, once 0.6 and the 2.x re-tests are done |

## 10. Housekeeping

| # | Task |
|---|---|
| 10.1 | 29 CRLF-renormalised files sit on `feat/installed-door-link` (`8bd9b0a5c`) and are not on main |
| 10.2 | `Doors/THEMEC` and `Doors/ThemeC` are BOTH tracked - one is wrong |
| 10.3 | Orphaned door dist files live for ever on the Doors volume (the entrypoint sync only adds) |
| 10.4 | `thoughts/BOARD.md` open question: who owns the uncommitted `examples/doorrepo-c/doorrepo.c` |

---

## 11. Queued 2026-09-06, sysop-decided, awaiting an agent slot (cap: 3)

| # | Task | Decision |
|---|---|---|
| ~~11.1~~ DONE `6c021d85e` | Width-gate FALL-THROUGH: a door refused by `MIN_COLUMNS` whose command has an internal equivalent runs the internal handler instead of returning to the menu. Restores `F`, `FR`, `Z`, `OLM` for 40-col callers. Gate is `door.handler.ts:1782-1793`; internal handlers are `command.handler.ts:4602-4607`; dispatch order is `runBbsCommand` before `processBBSCommand` at `:4397`. Needs a test per symptom ("a C64 caller who types FR gets the file list") | sysop: fall through |
| ~~11.2~~ DONE `cbfe3c5a1` | UNREGISTER `ga`, `L`, `SENT` - all three point at binaries that do not exist and fail for every caller on every terminal (`Doors:GetAnswer/GetAnswer.030`, `doors:scan.x`, `DOORS:FILEID/FILEID`). Must not disturb `command-registration-identity.test.ts` | sysop: unregister all three |
| 11.3 | `pauseLines` counts SOURCE rows, not ADAPTED rows (`xim/io-file-display.ts`, `displayResolvedFile` fast path). The ladder can double a screen's height, so rows scroll past unseen. `games` is the clean case: 19 source rows become 40 adapted, 15 unseen, nothing else wrong with it - fixing this makes `games` markable as-is | from batch A |
| 11.4 | Re-drive the six record listers (`fr`, `f`, `scan`, `Z`, `TList`, `I`) TOGETHER once lane 5 lands - they all fail identically on the `narrow` rung eating the filename; judging them one at a time will not change a verdict | from batch A |
| 11.5 | GLOBAL LAST CALLERS (`GLC`/`gl`, `Doors/glc/glcviewer`) asks for the BBS acronym on EVERY start - sysop report 2026-09-06. Should prompt once, store, and never ask again. **Likely the same root cause as 11.6**: the door writes its config into the process CWD, so next launch looks in its own directory, finds nothing, and re-prompts. VERIFY before fixing - capture where the file actually lands | sysop report |
| 11.6 | `GWALL` writes `gwall.cfg` into the process CWD, not `DOORS:GWall/`. It landed in the repo root during a capture run; on live it lands wherever the node's CWD is. Same class as 11.5 - fix both at the level of the door-CWD contract, not per door | from batch B |
| 11.7 | Three more doors broken for EVERY caller by missing data/config: `bk` (wants `USER_DATA=<path to user.data>` tooltype in `Bytekiller.info`), `req` (`BULL.HEADER=<...Bulletin_Header.txt>` not found), `Sent_FE` (`DOORS:FILEID/Sent.DAT` not found). `REALNAME` emits zero bytes and exits cleanly - decide whether it is dead | from batch B |
| 11.8 | **92 of 96 latin1 high-bit bytes map to `?` for a C64 caller.** `asciiToPetsciiByte` maps only `0xA0 0xA3 0xAF 0xB7`. Door output is decoded latin1 in the emulator, so the byte the 68K door wrote arrives as the code point - and Amiga Topaz high-bit decoration is what 68K doors draw rules and separators with. FIVE ALREADY-MARKED doors (`j`, `ulist`, `six_status`, `hackcheck`, `doorrepo`) emit unmapped bytes today. Census with per-door provenance is in the batch B report; `7eaa120d5` fixed U+25xx blocks, a different class entirely | from batch B |
| 11.9 | The ladder cannot save an IDENTITY column. Confirmed across both batches: `narrow` shortens the widest column of a record row, which is the filename on `fr`/`f`/`scan`/`Z` and the `-HANDLE¦BBS` field on `GWALL`. Any three-column table whose last column is the identity field is unsavable by the current rungs - this is the general form of lane 5's problem | from batches A+B |
| 11.10 | MAIL STAYS UNREAD: a message sent to the sysop is flagged unread at EVERY login - reported 2026-09-06. The last-read pointer is not persisted at logoff or not consulted at login. **Suspect link**: `message-pointers` is one of the suites that has been red on main behind the broken CI type-check step, and `6684a4ed0` just fixed a real `writeInt32BE` overflow in `MessageIndexManager.ts:194` for records with the top bit set - a pointer written as a signed value could read back wrong. Check whether the two are the same defect before treating them separately. express.e is the source of truth for pointer semantics | sysop report |
| 11.11 | The `?` rule may survive the `$AF` fix. If the sysop still sees it after `5062d6bdb` deploys, the wall is drawing that row from a SECOND unmapped byte - fold into 11.8 rather than chasing it alone | follow-up |
| ~~11.12~~ LIKELY FIXED | THE INPUT ECHO ROW is re-laid-out by the ladder on EVERY KEYSTROKE, so what the caller is typing jumps as it grows. Renders byte-identical on all three ladder versions (`6684a4ed0`, `0c38c0522`, `80ec5076`), so it predates the record rung. Needs a stable treatment for the cursor row - the ladder should not re-flow the row being typed into. **Sysop confirmed 2026-09-06 that input now works.** Probable cause of the fix: `80ec50768`'s 'separator is strictly the widest gutter' guard, added to stop the prompt row being read as a record - it was written to prevent a NEW bug and appears to have closed this one too. NOT verified as the mechanism; if the echo misbehaves again, this is the first place to look | from the wall agent |
| 11.13 | DEAD PARALLEL DISPATCHER: `web/backend/src/handlers/command-handler/` (`core.ts`, `command-processing.ts`, `command-execution.ts`) is imported by nothing - the live dispatcher is `command.handler.ts`. It still carries door-specific hacks the real switch removed (a hardcoded `case "GA"` shelling out to `../../doors/GetAnswer/GetAnswer` at `command-execution.ts:442`). Decide: delete it, or say why it is kept. It is a trap - a reader fixing dispatch may edit the copy that never runs | from the fall-through agent |

## 12. The always-unread mail bug - three causes, sysop-decided 2026-09-06

Cause A is FIXED and live (`f30fe1383`): marking mail received re-serialises every
header in the conference, and Conf1 messages 319-321 carry `recv` values that
overflow a signed 32-bit write. The write threw before a byte reached the file and
`messaging.handler.ts:490` swallowed it, so the session looked right and the disk
still said unread. Message 13 is NOT misaligned - verified with an independent
parser against `axobjects.e:180-190`; only its sender and subject hold junk
content, and neither is read by the mail scan.

| # | Task | Decision |
|---|---|---|
| 12.1 | CAUSE B: `countNewMessages` (`message-scan.handler.ts:340-395`) produces the number the caller is TOLD and never consults `recv`, while `getMessagesForConfScan` (`:290`) does. Measured: after reading, login two offers nothing to read and still reports 1 new private message. A `test.failing` is already in place - make it pass | needs doing |
| 12.2 | CAUSE C: rebuild Conf1's MailStats FROM THE DISK HEADERS - `rebuildHeaders(1, readHeaderFile(1))`. `highMsgNum` says 151, the HeaderFile holds up to 318, so `validatePointers` (express.e:5040-5049) correctly clamps the stored pointer back to 1 every login and the whole conference re-enters the new-mail window | sysop: rebuild from disk |
| 12.3 | FIX THE REPAIR BUTTON: `POST /api/config/messages/repair-headers` rebuilds the HeaderFile FROM THE DATABASE. On this board disk is truth and SQL mirrors ~170 fewer messages, so pressing it would destroy them. Invert it to rebuild from disk, or refuse with a clear reason. It is a live data-loss trap in the admin UI | sysop: fix the button |
| 12.4 | Reset the three poisoned `recv` values (messages 319-321) to a sane value. Back up first. LEAVE message 13's junk sender/subject alone and do NOT delete it - the sysop chose to keep it | sysop: clean recv only |
| 12.5 | Land branch `fix/ci-residue-66e74843` (2 commits, rebased on origin/main, unpushed): the mail pins, and `3ba90b11d` which restores the screen REVISION HISTORY that another session's merge-repair dropped - three endpoints and the config-app History panel were shipping and 404ing. Session `3a17737a` claims `screens-routes.ts` and should sanity-check it | needs landing |
| 12.6 | Two concurrent jest runs from different checkouts share the default cache dir and DEADLOCK (0% CPU, no output). Pass `--cacheDirectory=<own path>` | gotcha |
| 11.14 | **Z TAKES A HOTKEY INSTEAD OF A STRING** - sysop, 2026-09-06, live. `Z` reaches `ZippySearchHandler.handleZippySearchCommand` through today's width-gate fall-through (`6c021d85e`); the handler sets `session.subState = LoggedOnSubState.ZIPPY_SEARCH_INPUT` (`content/zippy-search.handler.ts:87`) and expects a LINE, but the caller reads one key. HYPOTHESIS, unverified: the fall-through path in `command.handler.ts` resets `subState` to `DISPLAY_MENU` after the internal handler returns, discarding the state the handler just set - the same shape as the inline `~CC_` 68K door subState bug (see memory `inline-door-substate`). If so it hits EVERY prompting internal command reached by fall-through: `N`, `OLM`, `F`'s flag prompt. Verify by driving the real dispatch path, do not patch on the hypothesis | sysop report |
| 11.15 | **OLM: ACCESS DENIED FOR THE SYSOP** - reported 2026-09-06 live. The `ACCESS=020` on the registration gates the command LIST; the denial comes from `checkSecurity(session.user, ACSPermission.OLM)` at `handlers/transfer/olm.handler.ts:63`, which reads ACS grants from `Access/ACS.*.info` ON DISK (SQL is only a mirror - see memory `amiexpress-reads-disk-not-db`). Establish whether the sysop's level genuinely lacks the OLM grant on disk, or `checkSecurity` reads the wrong source / the wrong level field. express.e is the authority for ACS semantics - consult it through the docs MCP. NOTE the same handler denies `Q` (quiet mode) through `ACSPermission.QUIET_NODE` at `:429`, so check whether the fault is one permission or the lookup itself. Related but SEPARATE: `Olm.info` and `OLM.info` both exist (case collision, owned by the casing agent) | sysop report |
| 11.16 | `tests/petscii/logoff-seq-data.test.ts` imports `src/index`, which BOOTS THE REAL SERVER and reaches `process.exit(1)` - killing the whole jest process, so any glob containing it can never print a summary. Cost two agents and the coordinator real time tonight chasing empty output. Fix: the suite must not import `src/index` (mock it, as `conference-stops-re-offering...` does for `command.handler`), or `src/index` must not self-start on import | from the Z agent |
| 11.17 | The session scratchpad is NOT private between agents - another session overwrote `scratchpad/commitmsg.txt` mid-task. Any agent writing a commit message file must use a uniquely-named one | from the Z agent |
| 11.18 | **The internal `N` (new files) reads an EMPTY MIRROR.** `F`/`FR` read the DIR files on disk (truth); `displayNewFiles` reads SQL `file_entries`, which is only ever INSERTed on a WEB UPLOAD - nothing imports DIR files. Measured: Conf2's three areas hold 0/0/0 rows while `Conf2/Dir1` on disk holds three real archives. So `N` answers "no new files" for a conference that is full. This blocked building an internal NSU, and it is a live bug in its own right. Fix it and NSU becomes a two-line composition of express.e's `confScan` loop (express.e:28066-28114) | from the NSU agent |
| 11.19 | express.e:4732-4747 lets a registration declare `INTERNAL=<cmd>` + `PASS_PARAMETERS`, so a door's `.info` can BE an internal command with no code. This port PARSES the tooltype (`amiga-command-parser.util.ts:767-775`) and never dispatches it. Unimplemented parity. Note it is unconditional in express.e, so wiring it would take AquaScan from 80-column callers too - decide deliberately | from the NSU agent |
| 11.20 | GWALL's MISSING MASTHEAD, diagnosed with numbers, sysop wants it fixed. Two faults: (1) `door.handler.ts:829` leaves `autoPauseEnabled` false unless the `.info` declares `PAGINATION=`, and `xim/io.ts:1524` gates the ADAPTED-frame pause on that same flag - no adapted door declares it, so `beginAdaptedPause` never arms; the line-count pause must respect `PAGINATION`, the adapted pause must not, because adaptation makes a frame taller than any door can know. (2) `c64-door-adapter.ts` `unseenRows()` measures `contentEnd - 25` (overflow from the TOP) while `adaptFrame` windows from the BOTTOM. Measured over 25 fixtures: 21 lose painted rows off the top and the counter under-reports every one (gwall 5 lost/1 reported, olm 4/0, b 4/0, ratiorep 4/0, ulist 3/0, six_status 9/10) | sysop: fix it |

---

## VERIFIED 2026-09-07 (session 4a5fad72) - what is actually still open

Re-checked every claim below against the code and the live board rather than
the ledger. Half of it was stale.

**CLOSED, verified:**

| # | Was | Measured now |
|---|---|---|
| 0.1/1.1/1.2 | deploys and CI broken | three deploys landed and verified in the container today |
| 1.3 | 4 SDK door-theme suites red | fixed, `6383ce1b4`; 179/179 |
| 1.4 | `compact-40/tetris-attack` red | the whole compact-40 glob is green: 12 suites, 191 tests |
| 1.5 | `transport-adapter` red | PASS |
| 0.6 | GRANDMASTER PETSCII broken | fixed and live |
| 11.8 | "92 of 96 latin1 high-bit bytes map to `?`" | REVERSED: 93 of 96 map. Only `0xA7 0xB6 0xBF` are unmapped |
| 11.20 | GWALL masthead, two faults | both fixed in source: `pauseSite` is decoupled from `PAGINATION` (`xim/io.ts:1416-1436`, JH_SM/JH_SMPTR pass it explicitly) and `unseenRows()` measures the window (`c64-door-adapter.ts:277`). The SYMPTOM still wants a live look |
| 11.14 | "Z hotkey = subState clobbered by fall-through" | HYPOTHESIS DISPROVEN. `tests/doors/width-gate-fall-through.test.ts` drives the real dispatch and asserts `ZIPPY_SEARCH_INPUT` survives; 12/12 pass. If the symptom is real it is in the input READER, not the state |
| 12.2 | Conf1 MailStats 151 vs 318 headers, pointers clamp every login | live conference 1 (`Conf2/MsgBase`): HeaderFile 28,050 bytes = 255 records, MailStats `lowestKey=1 highMsgNum=256 lowestNotDel=2`. Consistent - nothing to clamp |
| 12.4 | poisoned `recv` on messages 319-321 | that base holds 255 messages; 319-321 do not exist |

**STILL OPEN, verified in the code today:**

| # | Item | Evidence |
|---|---|---|
| 12.1 | `countNewMessages` never consults `recv` | `message/message-scan.handler.ts:369-392` filters on pointer, DELETED and file-exists only |
| 12.3 | The repair button rebuilds the HeaderFile FROM THE DATABASE | `api/config-routes.ts:2412` -> `database.getMessages(...)` then writes `MsgBase/`. Disk is truth here, so it is still a data-loss trap |
| 11.18 | Internal `N` reads the SQL mirror nothing fills | stated as current fact in `utils/door-min-columns.util.ts:104-118` |
| 11.15 | OLM denied for the sysop | ACS.255.info on the live board DOES grant `ACS.OLM` (uncommented). So the grant is present and the fault is in the lookup or the account's level - needs the account's level read and `checkSecurity` driven |
| - | 2 red tests on main | `message-pointers` > "validatePointers clamps to bounds and zeroes on overflow"; `livechat-panel-borders` > "is dim when a panel is not active" |

**UNVERIFIED, needs a capture, not a code read:** 11.5/11.6 (GLC/GWALL config
landing in the wrong directory - `AmigaDoorSession` already passes the door's
own directory as `cwd`, so the ledger's stated cause may be stale too), 11.10
(mail unread symptom), 2.1-2.4 (the PETSCII door re-tests).

### CORRECTION, same day: four of those five "still open" were stale too

The first pass above read the SHARED CHECKOUT, which sits behind `origin/main`.
Re-read against `origin/main`, the picture is:

| # | Claim | On origin/main |
|---|---|---|
| 12.3 | repair button rebuilds from SQL | ALREADY FIXED - the route calls `repairConferenceHeaders` (`services/message-header-repair.ts`), disk-first, and consults the database ONLY when the disk holds no headers at all |
| 12.1 | `countNewMessages` ignores `recv` | ALREADY FIXED - one shared loop produces both the count and the list, and it reads `recv` (`message-scan.handler.ts:380`) |
| - | `message-pointers` red | PASSES |
| - | `livechat-panel-borders` red | PASSES |
| 11.15 | OLM denied to the sysop | MEASURED, not reproducible from the code: the live `Access/ACS.255.info` grants `ACS.OLM`, the real loader against those live files returns `checkSecurity(255, OLM) = true`, the live `sysop` account IS level 255 with no `securityFlags`/`secOverride`, and the door gate (`255 >= ACCESS=020`) passes. `ed8707369` and `150e8dc9a` already removed the invented "Access denied." string this port was sending. Needs a live re-test, not a code change |
| 11.18 | internal `N` reads the SQL mirror | WAS REAL. FIXED (`ce92f960e`): `N` now walks the conference DIR files through `FileListingHandler.handleNewFileScan`, express.e:27906-28023 - find the first entry at or after the date, then dump the rest of the file. Four regression tests, proved red. The colorized row this port invented for the mirror is gone; `N` and `F` paint the same bytes |

Also fixed while sweeping: `tests/handlers/file/file-commands.test.ts` had been red
since pooled storage landed - its stub returned a bare array where
`findFilesInConference` answers `{ files, storageError }` (`b608606c6`).

And a LOCAL-ONLY red worth knowing: `narrow-tables` 5d fails with "Cannot find
module '@aws-sdk/client-s3'" in any checkout whose `web/backend/node_modules`
predates that dependency. `npm install` in `web/backend` - it is not a code fault
and CI never saw it.

**THE LESSON, and it cost this session two wrong reports: verify against
`origin/main` in a worktree, never against the shared checkout.** The shared tree
is behind and dirty with other sessions' work, so a "still open" read there is
worth nothing.
