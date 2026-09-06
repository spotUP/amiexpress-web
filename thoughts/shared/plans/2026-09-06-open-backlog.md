---
date: 2026-09-06
topic: Open backlog - everything outstanding, including work parked by the rate limit
tags: [backlog, petscii, transport, achievements, file-view, 68k, arcade]
status: final
---

# Open backlog - 2026-09-06

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
