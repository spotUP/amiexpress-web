---
date: 2026-09-03
topic: The PETSCII oracle wave's reachability ledger - every row, its call-count sentinel, and its live/dead numbers
tags: [petscii, c64, reachability, oracle, choke, transducer, ledger, testing]
status: final
---

# REACHED.tsv - the oracle-at-the-choke wave, proved by call count

Companion to `2026-09-03_petscii-oracle-reached.tsv` (the machine-readable
ledger; the working copy lives beside the wave's progress ledger at
`.superpowers/sdd/2026-09-02-oracle-at-the-choke/REACHED.tsv`, which is
gitignored). Plan:
`thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`, task OC-10.
Protocol: `~/.claude/REACHABILITY_PROTOCOL.md`, sections 3, 9 and 10.

**The claim this document makes is narrow and mechanical.** For each of the
twelve rows the plan lists, a test drives a PRODUCT top-level entry point, a
spy on `AnsiToPetsciiTransducer.prototype` counts the calls the new code makes,
and the same row is re-measured with its arm switched off in a throwaway
worktree so the number is shown to MOVE. A row whose live count is what the
dead count would also be proves nothing, and none of these are.

## How the numbers were taken

- **Live**: the suites named in `pinned_by`, run in the shared tree at
  `afaa48185`.
- **Dead**: the same suites run in a detached worktree of the same commit
  (`scratchpad/wt-oc10`, node_modules symlinked, removed at the end of the
  task) with exactly ONE line of `src` mutated - the row's `dead_arm`. The
  mutation was reverted with `git checkout --` **inside the worktree** after
  every probe and `git status --porcelain` confirmed clean; the shared tree's
  `src` was never edited.
- **Every sentinel is a spy on `AnsiToPetsciiTransducer.prototype`**
  (`transduce` / `observe` / `flush` / `reset`). A spy on a module export -
  `transducePetsciiAtChoke`, `petsciiTerminalModelFor` - records ZERO whether
  the path runs or not, because the transpiler binds intra-module calls
  locally; it would report a broken build as clean (plan I4).
- **R0 is the instrument's own validation** and was run first
  (protocol section 3): the same spy must report a wired choke LIVE and an
  identical unwired socket DEAD before any other count here is quoted.

## The rows

| id | entry point driven | sentinel | live | dead (arm off) | pinned by |
|---|---|---|---|---|---|
| R0 | a choked socket vs an identical unchoked one, same session, same string | `transduce` | 1 | 0 | `tests/petscii/reachability-ledger.test.ts:264` |
| R1 | `handleCommand(emitter, c64Session, 'M')` + `displayScreen(MENU.TXT)` on a real `buildConnectionEmitter` | `transduce` | 2 | 0 | `tests/petscii/reachability-ledger.test.ts:296` |
| R2 | the real `registerSocketHandlers(io, socket)`, then the same walk | `transduce` + the socket's choke marker | 2 (marker 1) | 0 (marker 0) | `tests/petscii/reachability-ledger.test.ts:352` |
| R3 | the real `session-restore` handler on a NEW socket, then a paint through the live socket | `transduce`; the disposed model | 1, model disposed | 1, model NOT disposed - `cursorY` stays 12 | `tests/server/petscii-model-choke.test.ts:227` |
| R4 | `handleCommand` -> `executeDoor` -> `executeAmigaDoor` on a C64-adapted 68K door | `transduce` | 6 | 0 | `tests/petscii/model-sees-door-frames.test.ts:410` |
| R5 | `displayScreen(paged .TXT)` -> `handlePaginatedScreenInput` -> `displayScreen(.seq)` | `transduce` + `observe([])` | 3 / 1 | 0 | `tests/petscii/oracle-at-the-choke.test.ts:203` |
| R6 | `displayScreen(.TXT)` -> `displayScreen(.seq)` | `transduce` + `observe([])` | 1 / 1 | 0 | `tests/petscii/oracle-at-the-choke.test.ts:243` |
| R7 | the real `socket.on('command')` handler | `flush` | 1 per keystroke | 0 | `tests/server/petscii-model-choke.test.ts:312` |
| R8 | the real graphics-prompt `P` answer through `handleCommand` | `reset` | 1, before the first `.seq` | 0 | `tests/petscii/model-reset-at-flip.test.ts:318` |
| R9 | `BBSApi.writePetscii(Buffer)` through the real socket | `observe`, NON-empty | 1 | 0 | `tests/petscii/oracle-at-the-choke.test.ts:294` |
| R10 | a `.seq` paint - the render's own bytes | `observe`, EMPTY | 1 empty / 0 full | 0 empty / 1 full (double-fed) | `tests/petscii/oracle-at-the-choke.test.ts:243` |
| R11 | the same `.seq` paint through the door's `Object.create(socket)` proxy | `observe`, EMPTY | 1 empty / 0 full | 0 empty / 1 full | `tests/petscii/reachability-ledger.test.ts:403` |

The `spec_asserted` column of the TSV carries what each row asserts beyond the
count - the cursor / bank / pen the oracle must hold, the byte identity of a
door's payload, the width ceiling on an adapter frame.

## Every declared knob in the wave

Protocol section 2: a declared knob either moves the output or carries a
written exemption. All seven move a number.

| knob | row / pin | number it moves |
|---|---|---|
| `sessionWantsPetscii` gate | `tests/server/eighty-col-choke-identity.test.ts:420` | an 80-column walk: `transduce` 0 with the gate, **6** without |
| `socketStillCarriesSession` gate | `tests/server/petscii-model-choke.test.ts:364` | a door's pre-reconnect socket: `transduce` 0 with the gate, **1** without |
| the `SELF_FED` mark | R10, R11 | a rendered payload: 1 empty observe with the mark, **1 full observe** (applied twice) without it, and 0 empty when the mark is keyed on the socket |
| the five reset sites | R8 | `reset` 1 -> 0 at `pre-login.ts:161`; `command.handler.ts:1419` is pinned by `model-reset-at-flip.test.ts:253` and `telnet-server.ts:754` by `:342` |
| the input flush | R7 | `flush` 1 per keystroke -> 0 |
| the reconnect dispose | R3 | the restored session's model: disposed -> `cursorY` **12** survives onto a canvas the browser threw away |
| the model itself (`petsciiTerminalModelFor`) | R1, R2, R4, R5, R6 | every row's `transduce` count, and `session.petsciiTransducer` `undefined` on an 80-column walk |

Two of the five reset sites carry a written exemption rather than a probe, and
that exemption is unchanged by OC-10 (it is D12 in the wave's progress ledger):
`command.handler.ts:1469` is a NO-OP in its own order - `applyGraphicsAnswer`
two lines earlier already reset and nothing model-visible is emitted between
them - and `pre-login.ts:66` is the DEAD `handlePreLoginInput` branch
(`command.handler.ts` is the live dispatcher and says so). Both are kept
because the plan's five-site table requires them and because they stop the two
branch pairs from drifting; neither has an independent RED probe.

## The interim exemption OC-10 closes

The OC-1/OC-2 review granted an interim reachability exemption: at OC-2 the
three new exports below had **no `src` caller at all** - they were to be wired
by OC-4 and OC-5. Both landed; the exemption is now closed, with the caller and
the row that drives it named for each.

| export | `src` caller(s) | driven by |
|---|---|---|
| `emitPetsciiBytes` | `src/handlers/screen.handler.ts:1548` (`emitPetsciiChunk`), `:1565` (`emitRawPetscii`), `:1757` (`emitPetsciiScreenInline`'s direct call) | **R5, R6, R10** (a `.seq` paint: 1 payload -> 1 empty observe), **R11** (the same paint through a door's proxy socket) |
| `resetPetsciiModel` | `src/handlers/command.handler.ts:1419`, `:1469`; `src/handlers/command-handler/pre-login.ts:66`, `:161`; `src/server/telnet-server.ts:754` | **R8** (`reset` exactly 1, before the first `petscii-bytes`); the other reachable sites by `model-reset-at-flip.test.ts:253` and `:342`; `:1469` and `pre-login.ts:66` by the written exemption above |
| `disposePetsciiSessionModel` | `src/server/auth-socket-handlers.ts:188` (the reconnect), `src/server/socket-handlers.ts:1267` (the disconnect cleanup) | **R3** for the reconnect (arm off -> `cursorY` 12 survives); `tests/petscii/render-ctx-disposal.test.ts:58`, which drives the real `registerDisconnectHandler`, for the disconnect |

No export added by this wave is now callerless, and no row's count is zero.

## Deviations

- **D-OC10-1 (where the four new tests live).** The brief asks for missing rows
  to be added to "the most appropriate existing OC suite". R0, R1, R2 and R11
  are not about any one task's subject - R1 is telnet, R2 is web registration,
  R0 is the instrument, R11 is the mark - and the two suites that could have
  hosted them are the wrong shape: `tests/server/petscii-model-choke.test.ts`
  mocks `src/index` as `{}` and so cannot import `command.handler`, and
  `tests/server/connection-emitter-petscii.test.ts` is one of the six OC-7
  identity pins that must stay green with ZERO edits. They went into a new
  `tests/petscii/reachability-ledger.test.ts`, which is how every other task in
  this wave carries its own evidence (OC-1 `oracle-at-the-choke`, OC-3
  `petscii-model-choke`, OC-5 `model-reset-at-flip`, OC-7
  `eighty-col-choke-identity`, OC-8 `model-sees-door-frames`). The rows that
  DID have a natural home - R5, R6, R7, R9, R10 - got their call-count
  assertion added to the existing suite, not a duplicate harness.
- **D-OC10-2 (R3's arm).** The plan's R3 line names `resetPetsciiModel` among
  its symbols. Pass 8 of the plan replaced the reconnect's reset with a
  DISPOSE (a `~SP`-paused `.seq` parks `petsciiCtx` holding the machine), so
  no reset runs there and a `reset` spy would be a false DEAD. The row's arm is
  the reconnect dispose instead, which is the knob that path actually declares.
- **D-OC10-3 (R2's dead count needed the assertion relaxed).** With the
  registration install removed, R2 fails on its marker assertion before the
  walk runs, so the `transduce` count would never print. The DEAD run was taken
  a second time with that one assertion commented out in the WORKTREE copy, to
  get the number (0) rather than only the red. Both runs are recorded.
- **D-OC10-4 (R1's session shape).** The plan writes R1 as
  `handleCommand(connection.emitter, c64Session, 'M')`. That is exactly what
  the test does, with the session in the state a real C64 is in after the flip
  (`terminalType: 'c64'`, `petsciiMode: true`, `ANSI_PROMPT`), which takes the
  printable-character echo at `command.handler.ts:1590-1593` rather than
  `completeRealC64Connect` - the flip itself is R8's and
  `model-reset-at-flip.test.ts:342`'s subject, not R1's.
- **D-OC10-5 (`CHECKLIST.md`).** Written to the gitignored ledger directory
  beside `REACHED.tsv`, as OC-10 specifies. It is not committed, for the same
  reason the rest of `.superpowers/` is not.
