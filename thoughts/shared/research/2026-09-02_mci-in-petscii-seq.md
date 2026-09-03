---
date: 2026-09-02
topic: MCI code support in PETSCII .seq screens
tags: [petscii, mci, screens, c64, seq, express-e-parity]
status: draft
---

# MCI codes in PETSCII `.seq` screens

## 1. The `.seq` path today

### Selection

- `resolvePetsciiPath()` — `web/backend/src/handlers/screen.handler.ts:269-279`.
  For a `petsciiMode` session, any resolved path gets a sibling `.seq` probe and
  the `.seq` wins.
- `addPetsciiVariants()` — `screen.handler.ts:1570-1584`: `NAME.seq`,
  `NAME.SEQ`, `NAME`, `NAME.txt`, `NAME.TXT`, …
- `filenameVariations` — `screen.handler.ts:1602-1629`. A `petsciiMode` session
  uses the PETSCII variant list; a real C64 (`terminalType === 'c64'`) first
  tries `NAME_C64` (`:1622-1624`).
- `findSecurityScreen(..., petscii=true)` — `screen.handler.ts:1639`:
  `LOGON20.seq`-style per-security variants are found too.

### Read

Two loader returns produce the raw buffer, both identical in shape:

- security-screen hit — `screen.handler.ts:1640-1649`
  (`isPetsciiSeqFile` → `readScreenBuffer` → `convertPetsciiToPetMe64` →
  `{ content, isPetscii: true, petsciiBuffer }`)
- ordinary hit — `screen.handler.ts:1677-1682` (same three calls)
- assign paths (`bbs:`/`work:`) — a third copy at `screen.handler.ts:1716-1720`

`isPetsciiSeqFile` is `petscii.util.ts:472`; `convertPetsciiToPetMe64`
(`petscii.util.ts:415`) only fills the legacy `content` string (Unicode PUA),
used when the session is NOT in PETSCII mode.

### Send

`displayScreen` short-circuits on `isPetscii` (`screen.handler.ts:1955-1963`);
the header at `:1861-1876` states it: "PETSCII screens bypass the ANSI
MCI/wipe/pagination pipeline entirely". `emitPetsciiScreen` — `screen.handler.ts:1892-1902` — emits the buffer
base64-encoded over `petscii-bytes` when
`session.petsciiMode || session.terminalType === 'c64'`, else falls back to
`petscii-output` with the PUA string.

The bytes never touch `parseMciCodes` (`screen.handler.ts:379`) or the
`allowMCI` gate (`screen.handler.ts:2086-2091`), because both live AFTER the
`isPetscii` early return.

### Two consumers, one payload

- **Web "P" session** — `packages/terminal/src/components/BBSTerminal.tsx:2193-2200`:
  base64 → `Uint8Array` → `petsciiTransducerRef.current.observe(bytes)` (the
  client oracle must see what the screen now shows) → `enqueuePetscii(bytes)`
  → `PetsciiMachine` → canvas.
- **Telnet C64** — `web/backend/src/server/connection-emitter.ts:130-140`. The
  bytes are `observe()`d into the session transducer and written to the wire
  untouched. A non-PETSCII telnet session degrades via
  `convertPetsciiToPetMe64` (`connection-emitter.ts:138`).
- Doors take the same transport: `BBSApi.writePetscii(Buffer)` —
  `web/backend/src/doors/BBSApi.ts:305-312`; the C64 frame adapter drops its
  diff baseline when it sees the event — `web/backend/src/server/c64-door-adapter.ts:286-290`.

Both consumers receive the identical byte array, so anything done server-side
is automatically shared — the lever for this feature.

### A live symptom already in the repo

`Conf2/Screens/Logoff.seq` (and 11 identical siblings) is 39 bytes:

```
~SR_WORK:bbs/Screens/logoff/logoff.seq\n
```

First byte `0x7E`. On the ANSI path this is a redirect. On the PETSCII path it
goes out raw, so a C64 caller logging off sees the literal text
`~SR_WORK:BBS/SCREENS/LOGOFF/LOGOFF.SEQ` instead of the art. By contrast every
`Node*/BBSTITLE.SEQ` (1834 bytes) contains **zero** `0x7E` bytes (so does the bank-flipping
`Node1/Screens/BBSTITLE.SEQ`) — real art is unaffected either way.

## 2. What express.e did

**Finding: express.e has no PETSCII concept at all.** `search_express_source`
returns 0 matches for `petscii`, `.seq` and `C64`. The only translator in the
source, `translateText` (`express.e:6470-6489`, table lookup at `:6420-6458`),
is a natural-language word translator driven by `translatorMode`
(`express.e:234`, `:11073-11099`), not a charset remapper. There is therefore no
original behaviour to port for "MCI in a PETSCII screen", and no answer to "in
which charset bank did substituted text arrive" — the question did not exist on
an Amiga.

What express.e *does* give is the shape of the decision:

- `displayFile` — `express.e:6746-6768`. A `.rip` file is detected by extension
  (`:6765-6768`) and every line is pushed to the wire raw (`:6776-6781`),
  jumping past MCI, the 79-column splitter and `checkForPause`. This is exactly
  the precedent the current `.seq` path follows: binary-ish payload ⇒ no MCI.
- `allowMCI` is opt-in per file — `express.e:6800-6806`: if the first character
  of the first line is not `~`, MCI is disabled for the whole file. Mirrored at
  `screen.handler.ts:2086-2091`.
- MCI is otherwise a plain byte substitution: `processMci`
  (`express.e:5768-5802`) → `processMciCmd` (`express.e:5258+`) → `aePuts`, all
  8-bit ASCII into the same stream as the art.

The original's answer to "which bank" is implicitly "the one byte encoding
there is". A `.seq` has two, which is a genuinely new problem.

## 3. The byte-level problem

1. **Tokens are ASCII bytes inside a PETSCII stream.** `~` is `0x7E`, which is a
   legitimate art byte (screen code `0x5E`, `printablePetsciiToScreenCode`,
   `sdk/petscii/screen-codes.ts:9-16`). Scanning art for `~` risks false
   positives; the express.e first-byte gate is the cheap defence.
2. **The tokenizer must not see UTF-8.** `processMci`
   (`web/backend/src/utils/mci-tokenizer.util.ts`) is a pure
   `string → string` scanner. Bytes ≥ `0x80` (most of a `.seq`) must be viewed
   as latin-1, one char per byte, or offsets and art bytes are destroyed
   (see MEMORY: "Edit/Write destroys high-bit bytes").
3. **Values must be encoded per bank.** In bank 1 (`$0E`, lowercase/uppercase)
   `a-z → $41-$5A` and `A-Z → $C1-$DA`; in bank 0 (`$8E`,
   uppercase/graphics) `$C1-$DA` are *graphics*, so letters must go out as
   `$41-$5A` with case folded up. `AnsiToPetsciiTransducer.printChar`
   (`sdk/petscii/ansi-to-petscii.ts:310-333`) implements the bank-1 half and
   forces bank 1 via `printByte`/`ensureBank`
   (`ansi-to-petscii.ts:266-270`, `:221-225`).
4. **Bank state is positional, and shipped art really does flip it.**
   `Node1/Screens/BBSTITLE.SEQ` (864 bytes) starts
   `1f 12 8e 54 0e 4f ...` and carries **11 `$0E` and 11 `$8E`** switches; a
   token's bank cannot be assumed per file. (`Node*/BBSTITLE.SEQ`, 1834 bytes,
   has none — both shapes exist on disk.) `PetsciiMachine` already tracks it — `state.charsetBank`
   (`sdk/petscii/petscii-machine.ts:47`, control handling `:100-110`) — so
   feeding the art bytes emitted so far gives the bank (and `cursorX`,
   `reverse`, `pen`) at the token position for free.
5. **Colour / reverse must survive.** `$0D` cancels reverse in the machine
   (`petscii-machine.ts:110`); a substitution mid-row must not emit `$12`/`$92`
   or a colour byte unless it also restores what the art had —
   `setReverse` (`ansi-to-petscii.ts:246-248`) is the existing idiom.
6. **Reuse answer: yes, without running the transducer over the art.** The
   pieces needed are `printChar`'s mapping table, `UNICODE_TO_PETSCII`
   (`sdk/petscii/unicode-to-petscii.ts:28-54`) and `screenCodeToPetscii`
   (`screen-codes.ts:18-24`) — none of which need the transducer's cursor,
   wrap-latch or SGR machinery. Extracting `printChar`'s body into a pure
   `asciiToPetsciiByte(code, bank)` lets the transducer and a new value encoder
   share one table. Note there is already a **third** copy of this mapping,
   bank-1-only: `convertAsciiToPetsciiOutput`
   (`web/backend/src/utils/petscii.util.ts:584-643`). It should collapse into
   the same function.

## 4. Which tokens make sense in a `.seq`

Dispatch map is `userInfoDispatch`, `screen.handler.ts:718-800`.

**Display-only (safe: pure text substitution).** `~N` username
(`screen.handler.ts:720` — the sysop's `~UN` is not a code), `~CN` conference
name (`:752`), `~CF` conference number (`:751`), `~TL`/`~TR` time limit and
remaining (`:735`/`:736`), `~UL` location (`:722`), `~RN` real name (`:749`),
`~FU`/`~FD` file counts (`:743`/`:744`), `~UB`/`~DB` byte counts (`:738`/`:739`),
`~ND`/`~ON` node (`:760`/`:747`), `~DT`/`~OT`/`~OD` date and time (`:761-763`).
All short, fixed-ish width, and all want a width prefix (`~10N|`).

**Structural (need the display path, not the byte renderer)**

- `~SS_<file>` include — prefix dispatch `screen.handler.ts:879`. In a `.seq`
  the include target should itself resolve through `resolvePetsciiPath`
  (`:269-279`) and be emitted as its own `petscii-bytes`.
- `~SR_<base>` random numbered file — `:882`. **Already used by 12 shipped
  `.seq` files** (§1).
- `~CC_<cmd>` command chain — `:877`.

**Does not belong in a `.seq`**

- `~WX`/wipes — the wipe pipeline is ANSI-only and is already skipped
  (`screen.handler.ts:1868-1872`).
- `~SP` soft pause — dropped for PETSCII today (`screen.handler.ts:1868-1876`);
  restoring it means a pause prompt in PETSCII bytes, a separate decision.
- `~CR` (`:774`) emits `\r\n`; in a `.seq` the correct byte is `$0D` alone.
- `~AK` access keys (`:769`) and the list builders `~CL`/`~ML` produce
  multi-line ANSI-width text that will smear a 40-column frame.
- `~c0..~c7`/`~b0..~b7` ANSI colour — PETSCII colour is one byte the artist
  writes directly.

## 5. Proposed design

**Single source of truth**

1. `processMci` (`mci-tokenizer.util.ts`) stays THE tokenizer. Feed it a
   latin-1 string view of the buffer (`buf.toString('latin1')`), get bytes back
   with `Buffer.from(out, 'latin1')`.
2. Extract `AnsiToPetsciiTransducer.printChar`'s table
   (`ansi-to-petscii.ts:310-333`) into a pure exported
   `asciiToPetsciiByte(code, bank)` in `sdk/petscii/`, build
   `encodePetsciiValue(text, bank)` on it, and re-point `printChar` and
   `convertAsciiToPetsciiOutput` (`petscii.util.ts:584`) at it — 3 copies → 1.
3. Track the bank with `PetsciiMachine` (`petscii-machine.ts`), fed the bytes
   already emitted. No new bank scanner.
4. Do the work **once**, server-side, in `emitPetsciiScreen`
   (`screen.handler.ts:1892`) before the base64, so both transports
   (`BBSTerminal.tsx:2194`, `connection-emitter.ts:130`) get identical bytes.

**Gate** — express.e parity: process only when `buffer[0] === 0x7E`
(`express.e:6800-6806`). Every shipped art `.seq` starts with `0x20` and is
therefore untouched.

**Invariants**

- Art bytes outside a matched token are copied byte for byte; a file failing
  the gate is emitted `Buffer.equals`-identical to disk.
- A substituted value never crosses into the wrong bank: the encoder is called
  with the machine's `charsetBank` at that byte offset, and emits no bank switch
  of its own.
- A value is clipped, never wrapped: `min(width prefix, 40 - cursorX)`.
  `applyMciWidth` (`mci-tokenizer.util.ts:141-143`) already does the first half.
- Reverse/pen state at the token position is left as the art set it; if the
  encoder must toggle reverse for a glyph it restores immediately
  (`ansi-to-petscii.ts:329-333` is the pattern).

**RED tests** (new file `web/backend/tests/petscii/seq-mci.test.ts`, sibling of
`web/backend/tests/handlers/petscii-bytes-transport.test.ts`)

1. lower bank: fixture `0x7E` + art + `$0E` + `~N|` + art. Feed the emitted
   bytes to a `PetsciiMachine`; assert the screen cells spell the session
   username using bank-1 codes, and that the art byte runs either side are
   `Buffer.equals` to the fixture's.
2. upper bank: same fixture with `$8E`; assert `$41-$5A` letter codes and no
   `$C1-$DA` in the substituted span.
3. `~CN` in both banks, same assertions.
4. gate: `Node1/BBSTITLE.SEQ` (first byte `0x20`) emits byte-identical to disk.
5. clipping: a username longer than the artist's slot does not change
   `cursorY` and does not overwrite the next row.
6. redirect: `Conf2/Screens/Logoff.seq` no longer puts `~SR_` on the wire.
7. transport parity: the socket.io emit and the telnet emitter produce the same
   bytes for the same fixture.

## 6. Open questions for the sysop

1. Which token set ships first — the display-only table in §4, or display-only
   plus `~SS_`/`~SR_`?
2. Confirm telnet C64 and web P share one server-side render (recommended: yes,
   in `emitPetsciiScreen`). Any reason to diverge?
3. Is a width prefix mandatory in a `.seq`, or is "clip to end of row" enough?
4. `~SS_`/`~SR_`/`~CC_` inside a `.seq` need the display path, not the byte
   renderer — is that in scope now or later?
5. In bank 0 (`$8E`), should a mixed-case value be folded to uppercase, or
   should the renderer flip to bank 1 for the value and back?
6. Should a substituted value inherit the art's pen, or carry its own colour so
   the sysop can highlight it?
7. Restore `~SP` pause for PETSCII screens (currently dropped,
   `screen.handler.ts:1868-1876`)?
