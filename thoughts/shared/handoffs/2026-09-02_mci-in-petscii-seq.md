---
date: 2026-09-02
topic: FULL MCI inside PETSCII .seq screens (plan executed, Tasks 1-9)
tags: [petscii, mci, screens, c64, seq, express-e-parity, sdk, handoff]
status: implemented
---

# FULL MCI in PETSCII `.seq` screens — what shipped

Plan: `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md` (revised final,
`c231542a0`).
Research: `thoughts/shared/research/2026-09-02_mci-in-petscii-seq.md`.
Ledger: `.superpowers/sdd/2026-09-02-mci-in-seq/progress.md`, with a report per
task/lane beside it.
Branch: `feat/installed-door-link`, shared working tree. **NOT pushed.**

The bug that started it: a C64 caller logging off saw the literal text
`~SR_WORK:BBS/SCREENS/LOGOFF/LOGOFF.SEQ`. `displayScreen` early-returned on
`isPetscii` before `parseMciCodes` ever ran, so a `.seq` got no MCI at all —
twelve shipped `Conf*/Screens/Logoff.seq` are exactly 39 bytes of one `~SR_`
token. The sysop's ruling was FULL parity, not a special case for that one
token: every code the `.TXT` path supports now works in a `.seq`.

## What shipped, per task

| task | commit | what |
|---|---|---|
| plan | `c231542a0` | plan revised after review: shared pre-pass, async dispatch, column-38 clip, resolver fix, no recursion guard assumed |
| T1 | `9c1a51f45` | RED: two `it.failing` canaries driving `displayScreen` with the shipped 39-byte payload; `Math.random` pinned so `~SR_`'s 1..99 draw is deterministic |
| T3 | `3b181cdbd` | `onSubstitution?(start, length, cmd)` on `MciDispatchConfig`, fired at `processMci`'s ONE append site. Absent hook = byte-identical output (pinned over 8 samples) |
| T2 | `c8e5c4039` | `sdk/petscii/ascii-to-petscii.ts` — the ONE ASCII→PETSCII table (`asciiToPetsciiByte`, `encodePetsciiValue`); `printChar` and `convertAsciiToPetsciiOutput` became callers; `petsciiMoveTo` lifted out of the transducer's private `moveTo` |
| — | `6763b4f79` | follow-up: the compact-40 and forty-col-sweep suites type-check (11 pre-existing errors found by lane A's gate) |
| T4 | `68eb6d2ad`, `b351daaf4` | ANSI byte-identity pin snapshotted first, then ONE dispatch table (`mci-dispatch.ts`, 82 keys) lifted verbatim out of `parseMciCodes` and shared by both flavours |
| T4b | `a28a1d361`, `e9a098a0d` | second pin, then ONE pre-pass pipeline (`mci-pre-passes.ts`) — the 20 regex-stage tokens that never reach the tokenizer |
| — | `10b537368` | lane C fix round: no `@ts-nocheck`, one SGR stripper (`AnsiUtil.stripAnsi`), one clock per render |
| T5 | `26a64bbd1`, `c8e9b174f` | `petscii-screen.render.ts` — gate, pre-passes, tokenizer, then re-encode only the substituted spans against a live `PetsciiMachine`. Fix round: pre-pass-generated text is encoded per bank (not emitted raw ASCII), and a value never scrolls the bottom row |
| T6 | `0756ad706` | wired at the ONE point both transports pass through (`emitPetsciiScreen`, before the base64). Telnet and web `P` get identical bytes. Ctx disposed in `finalizeDisconnectCleanup` |
| T7 | `6f43692bc`, `664b0b7cb` | `~SS_`/`~SR_`/`~CC_`/`~f` run inside a `.seq` in document order. The inline sentinel walker was LIFTED OUT of `parseMciCodes` into one `walkInlineSentinels` parameterised by emit hooks; a real include-recursion depth guard (there was none, on either path); include-resolver extension SWAP. T1 flipped green |
| T8 | `6b4340247` | `~SP` pauses AND resumes on the SAME machine; `~WX` stripped instead of printed; a throwing render degrades to raw bytes at all three entry points |
| T9 | this document | freshness, docs, handoff, the sysop walk |

## The three ONE-source collapses

This run's real product is not the feature, it is that three concerns that were
about to be written twice now have exactly one implementation each.

**1. The tokenizer.** `processMci` (`mci-tokenizer.util.ts`) was already the
only MCI scanner, and it stayed that way — the PETSCII renderer does not get a
second one. What it needed was to say *where* it substituted, so the renderer
can encode values and copy art: `onSubstitution(start, length, cmd)` at the
single append site. Around it, two more single sources fell out:
`mci-dispatch.ts` (the 82-key dispatch + prefix table, lifted verbatim, shared
by `.TXT` and `.seq`; a parity test asserts the key sets are equal, so a token
added to one flavour fails the build) and `mci-pre-passes.ts` (the 20 tokens
that are regex stages *before* the tokenizer — without this, a `.seq` would
have supported 82 of 102 codes and decision 1 would have been quietly unmet).
The walker itself is the fourth: `walkInlineSentinels` is one function with
four hooks, not an ANSI copy and a PETSCII copy.
Grep proof: `grep -rn "indexOf('~'" web/backend/src --include=*.ts` returns
`mci-tokenizer.util.ts` and nothing else.

**2. The table.** `sdk/petscii/ascii-to-petscii.ts` is the only place that
knows a letter's PETSCII byte. It replaced the mapping inside the transducer's
`printChar` and the copy in `convertAsciiToPetsciiOutput`; both are now thin
callers. Grep proof: `grep -rn "0xC1\|+ 0x80" sdk web/backend/src
--include=*.ts` shows the letter-case mapping in ONE source file
(`ascii-to-petscii.ts:48`); the remaining hits are the inverse direction,
screen-code conversion, and a detector range. Four mappings changed on purpose
and their assertions were updated rather than papered over: `\`→`$2F`,
`_`→`$A4`, unknown→`$3F`, `0x08`/`0x7F`→`$14` (kept).

**3. The machine.** `PetsciiMachine` is the only oracle for charset bank,
cursor, pen and reverse. Nothing hand-scans the byte stream for `$0E`/`$8E` or
walks `$11`/`$1D` by hand: `petsciiMoveTo` (extracted from the transducer, still
feeding the transducer's own oracle — byte-identity pinned) is the ONE cursor
walk, and the render context caches the machine and *only* the machine. The
dispatch is rebuilt per render on purpose: its closures read the clock, the
conference and the byte counters, so caching it would have frozen `~TR`, `~DT`
and `~CN` at first paint.

## C64 semantics of the MCI tokens

The canonical copy is the module JSDoc of
`web/backend/src/handlers/petscii-screen.render.ts`; this is the sysop-facing
version, also in `Documentation/2-Sysops/CONFIGURATION.md` §5.

| token | on a C64 |
|---|---|
| `~WX` (wipes) | never animates — effects are off for a PETSCII session. The directive is STRIPPED, never printed. (Before T8 a C64 was shown the letters `WX`.) |
| `~c0`..`~c7` | one VIC pen byte; holds until art or another token changes it |
| `~b0`..`~b7`, `~z0`..`~z7` | CCGMS `$02 <colour>` — sets background AND border together; they cannot be independent. Inert on SyncTERM's C64 mode |
| `~f` | `$93` CLR: clears, homes the cursor, repaints in the current pen |
| `~q` | reverse off + default pen. There is no all-attributes reset on a C64 |
| `~CR`, `~n*` | `$0D`, which on a C64 also cancels reverse (`petscii-machine.ts:109`) — real KERNAL behaviour, not a bug |
| `~x`, `~y` | a RELATIVE `$11`/`$1D` walk from wherever the cursor is; the C64 has no absolute cursor address. Clamped to the machine's 40x25 |
| `~AK` | 13 plain rows, no colour: the ANSI SGR frame has no C64 equivalent worth faking |
| `~SP` | pauses and resumes on the same machine — bank, cursor, pen and reverse continue across the pause |
| values | inherit the art's pen and reverse; never emit a bank switch, a colour byte or `$12`/`$92`; clip at the end of the row (never wrap, never scroll); fold to uppercase in the upper bank |

Two consequences worth knowing before you author: `$02` immediately before a
raw colour span eats its first byte (faithful CCGMS behaviour,
`petscii-machine.ts:91-97`), and `parseWipeMCI` takes the `~WX` directive's
trailing `\r` with it, so a `~WX` written mid-art rather than on its own line
costs one RETURN. Both are ANSI-path parity, kept deliberately.

## Sysop DATA items — not code, and still open

1. **`Logoff.seq` draws a missing file ~97% of the time.** All twelve
   `Conf{2..13}/Screens/Logoff.seq` are `~SR_WORK:bbs/Screens/logoff/logoff.seq`
   with **no width prefix**, so `~SR_` draws 1..99 while only
   `Screens/logoff/001.logoff.txt`, `002`, `003` exist (1022 bytes each).
   Fix: make them `~3SR_...`. Use `sed`/`python`, never Edit/Write — those
   destroy high-bit bytes (MEMORY).
2. **There is no 40-column logoff art.** Even on a hit, `00N.logoff.txt` is
   80-column ANSI, and a PETSCII session never reflows 80-column art, so a C64
   caller gets `$93` + `[80-COLUMN ANSI SCREEN - SKIPPED]`. Fix: author a
   40-column `Screens/logoff/00N.logoff.seq` (the resolver prefers `.seq` for a
   PETSCII session). Until then the logoff screen is *correct code showing
   missing data*.
3. **`~DT` and `~DB` are unreachable — pre-existing.** The `~D<char>`
   terminator pass (`mci-pre-passes.ts:149`, `/~D(.)/g`, express.e:5651-5735)
   matches BEFORE the tokenizer sees anything, so `~DT` reads as "terminator
   becomes `T`" and `~DB` as "terminator becomes `B`", and both are then
   deleted from the output. Neither date token can ever render. This predates
   the run and is pinned by the T4b pin so it cannot change silently; whether
   to special-case them is a sysop call, not a bug introduced here.

## Open minors (carried to the fix wave, none blocking)

From the per-task reviews, all recorded in the ledger:

1. **The resolver change touches ANSI too.** `stripScreenExtension` swaps a
   known extension instead of appending one, in the three variant builders AND
   in the absolute/assign `pathsToTry`. Side effect: a missing `FOO.txt` can
   now fall back to `FOO.TXT`/`FOO.ans` on a case-sensitive filesystem. It is
   wider than "fix the `.seq` hole" — document or narrow it.
2. **A `.seq` can shadow an explicit `.txt` include.** `~SS_FOO.txt` in a
   PETSCII session prefers `FOO.seq` when both exist. Arguably right (decision
   9), but it is currently unpinned either way — decide and add the test.
3. **`.ans` is not in `SCREEN_EXTENSION_RE`** (`screen.handler.ts:304`,
   `/\.(seq|txt|rip)$/i`), so `~SS_FOO.ans` still gets an extension appended
   rather than swapped.
4. **`lastScreenHadPause` on the `.seq` path — verified DONE**, not open:
   `screen.handler.ts:1652` sets it from `walk.hasPause` on both arms.
5. **`seq-mci.test.ts:141` is coupled to shipped data.** It asserts the
   `[80-COLUMN ANSI SCREEN - SKIPPED]` notice, which the sysop's
   `00N.logoff.seq` fix (item 2 above) will flip to real art. Retarget it at a
   temp fixture before that data lands, or the data fix arrives as a red suite.
6. **Dead `hasPause` local in the walker** (`screen.handler.ts:504`): nothing
   assigns it, so the tail `return { inlineEmitted, hasPause }` always reports
   `false`. Harmless today only because the pause path returns a literal
   `true` from its early return. Delete the local or assign it.
7. **No ANSI-side depth-guard test.** `MAX_SCREEN_INCLUDE_DEPTH = 8` is
   mutation-verified on the PETSCII path (3 → 4 changes the count); the ANSI
   path shares the guard and has no test of its own.
8. **`BBSSession` has no `nonStopText` field.** Two production writes go
   through `(session as any)` — `mci-dispatch.ts:359` and
   `mci-pre-passes.ts:517` (`~NSF`) — while `arexx.service.ts:1937` and
   `XIMProtocol.ts:150` read it. Add the field to `src/index.ts`.
9. **`petsciiCtx` lives for the length of a pause.** A caller who pauses and
   never presses a key keeps the render context (machine + dispatch closures)
   alive until session teardown. Same lifetime as the machine it wraps; noted,
   not a leak.
10. **`eventName` is meaningless on a petscii segment** — it is set to
    `'petscii-output'` only because the type demands one of two strings, and
    the petscii branch never reads it. Commented at the assignment.

## The authoring rule sysops must know

**Once a `.seq` opens with `~`, every `0x7E` in that file is a token
candidate.** The gate is express.e's own (`express.e:6800-6806`) and is
evaluated ONCE, on byte 0, per FILE — not per segment, not per line. A gated
`.seq` therefore must not use `0x7E` as art, and `~~` is the escape for a
literal `~`.

Art files are untouched: every shipped `BBSTITLE.SEQ` starts `0x20` or `0x1F`,
so none of them are gated, and they come back from the renderer as the
byte-identical Buffer (pinned by a `Buffer.equals` test). The only gated files
on the board are the twelve `Logoff.seq`.

## Verification (Task 9 sweep, 2026-09-02 21:1x-21:2x)

| gate | result |
|---|---|
| `cd sdk && npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `cd sdk && npm run build:cjs && npm run build:esm` | exit 0 |
| `grep -rn "asciiToPetsciiByte" sdk/dist` | hits `dist/petscii/ascii-to-petscii.js`, `.d.ts` and `dist/petscii/index.js`; `petsciiMoveTo` likewise. dist mtime 21:16 > source 19:11 |
| `cd web/backend && npx tsc --noEmit` | exit 0 |
| `cd web/backend && npm run typecheck:tests` | 0 errors repo-wide |
| `npx jest --testPathPattern="tests/petscii/\|mci\|screen"` | **30 suites, 485 tests, 0 failures** |
| backend restart | pid 70721, `[READY] AmiExpress BBS is ready for connections!` in `logs/backend.log`; tsx transform cache cleared first |

## THE SYSOP'S THREE-SCREEN WALK

Nothing below is automated. The `door-three-screens` skill's Ship list requires
a human on both 40-column surfaces and an 80-column check that nothing moved.
Run all three in order; each expected result is falsifiable.

### Fixture — build it with bytes, not an editor

Edit/Write destroy high-bit bytes. Build the test screen with python3 so the
`$8E` bank flip and the `$A0` shifted spaces survive:

```bash
cd /Users/spot/Code/amiexpress-web
python3 - <<'PY'
seq = (b'~'                       # byte 0: the MCI gate
       b'\x93'                    # $93 CLR
       b'\x1c'                    # $1C red pen
       b'HELLO ~N|\r'             # your handle, substituted
       b'\x9e'                    # $9E yellow pen
       b'CONF: ~CN|\r'            # conference name
       b'\xa0\xa0\xa0BAR\xa0\xa0\xa0\r'   # $A0 shifted spaces, must survive
       b'~SP\r'                   # pause here
       b'\x8e'                    # $8E upper bank AFTER the pause
       b'~N| IS BACK\r')          # folds to uppercase, same machine
open('Conf2/Screens/BULL.seq','wb').write(seq)
print(len(seq), 'bytes written to Conf2/Screens/BULL.seq')
PY
```

`BULL` is displayed right after logon in the conference you land in
(`command.handler.ts:776`, `DISPLAY_BULL`). Remove the file when you are done:
`rm Conf2/Screens/BULL.seq` — the shipped `BULL.TXT` takes over again for ANSI
callers, which never saw the `.seq` at all.

### Screen 1 — web `P` session (simulated C64, 40x25)

1. Open `http://localhost:3001`, connect, and answer the graphics prompt with
   **`P`**.
   *Expect:* `PETSCII: SIMULATING C64 DISPLAY (40X25)` and the canvas renderer,
   black background — a C64 terminal is black, not KERNAL blue.
2. Log in as yourself into conference 2.
   *Expect on the BULL screen:* the screen CLEARS (that is the `$93`, not an
   ANSI `\x1b[2J` — nothing ANSI must appear as glyphs), then in RED
   `HELLO <YOURHANDLE>`, then in YELLOW `CONF: <the conference name>`.
   *Fail signals:* the literal text `~N|` or `~CN|` on screen (the gate or the
   dispatch did not run), or five garbage glyphs where the pen changes (an
   `\x1b[0m` reached the PETSCII wire).
3. Check the `$A0` row.
   *Expect:* `BAR` with three solid shifted-space blocks either side, at the
   same column on both sides. *Fail signal:* the blocks gone — something ran
   `trim()` over latin-1 bytes.
4. The screen stops at the pause prompt.
   *Expect:* a pause prompt, and the screen has NOT drawn the last line yet.
5. Press RETURN.
   *Expect:* `<YOURHANDLE> IS BACK` in **UPPERCASE**, continuing on the SAME
   row the pause left, in the SAME pen (yellow), with no re-clear and no
   flicker. *Fail signals:* the resume starts at the top of the screen (a fresh
   machine), the handle comes back in mixed case (bank lost), or the pen resets
   to white.
6. Your handle must never wrap. Re-run with a long handle if yours is short:
   *expect* it to stop at the right edge of its row, with the row BELOW
   untouched.
7. Log off from conference 2 (`G`, confirm).
   *Expect TODAY:* the screen clears and prints
   `[80-COLUMN ANSI SCREEN - SKIPPED]`. **That is the correct result until the
   two data items above are done** — the `~SR_` include now RESOLVES (before
   this run it printed its own token), and what it resolves to is 80-column
   ANSI art. *Fail signal:* the literal `~SR_WORK:BBS/...` text, which is the
   original bug.
8. Repeat step 7 after applying data fix 1 (`~3SR_`) and fix 2 (a 40-column
   `Screens/logoff/001.logoff.seq`): *expect* the PETSCII logoff art, every
   time, not one time in thirty-three.

### Screen 2 — real C64 over telnet (the DEL probe), 40x25

9. Dial in with a WiFi modem (WiModem232, 1541 Ultimate) to the telnet port —
   or, without hardware, any telnet client that can send a raw `$14`.
   *Expect:* the three-line uppercase graphics prompt.
10. Press **DEL** (or send byte `$14`).
    *Expect:* the graphics prompt is SKIPPED entirely and the session commits
    to PETSCII — this is the DEL-probe, and it is the only path a real C64 that
    negotiates nothing can take. *Fail signal:* the board waits for `A/R/P/N`.
11. Repeat steps 2-8 on the hardware.
    *Expect:* byte-for-byte the same screens as the web `P` session. That is
    the point of the whole design — the render happens once, before the
    transports split, so telnet forwards the same payload the canvas gets.
    *Fail signal:* any difference at all between the two surfaces; report it as
    a transport bug, not a rendering one.
12. On the C64, confirm the pen and background: only `$02 <colour>` moves
    background and border, and it moves BOTH. A `~b2|` in a `.seq` should turn
    the screen green, border included.

### Screen 3 — 80-column web ANSI (the pin: nothing moved)

13. Open a second browser tab, connect, and answer the graphics prompt with
    **`A`**.
14. Log in and press `MENU` (or `?`).
    *Expect:* the menu exactly as on `origin/main` — same colours, same
    columns, same 80-column layout. This path was refactored three times in
    this run (dispatch extraction, pre-pass extraction, walker lift) and each
    was pinned byte-for-byte, but the pins are of captured strings; this is the
    human check that the captures were right.
15. Press `B` for bulletins and read one.
    *Expect:* unchanged. `Conf2/Screens/BULL.TXT` is what an ANSI caller sees —
    the `.seq` fixture is invisible to them.
16. Log off.
    *Expect:* the 80-column ANSI logoff art, unchanged — an ANSI caller was
    always getting `Logoff.txt`, never the `.seq`.
17. Delete the fixture: `rm Conf2/Screens/BULL.seq`.

## Next

- Land the run. It is 16 commits on `feat/installed-door-link`, NOT pushed;
  land by cherry-picking onto a fresh worktree of `origin/main` — never merge
  this branch (MEMORY: landing by cherry-pick).
- The two sysop DATA fixes, in the order given (fix 1 makes the draw
  deterministic, fix 2 gives a C64 real art); then retarget
  `seq-mci.test.ts:141` (open minor 5) BEFORE fix 2 lands.
- The ten open minors above, as one fix wave.
- Whole-run review has not been done — each task was reviewed individually.
