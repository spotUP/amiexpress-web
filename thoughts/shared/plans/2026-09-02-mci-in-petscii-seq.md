---
date: 2026-09-02
topic: FULL MCI support inside PETSCII .seq screens
tags: [petscii, mci, screens, c64, seq, express-e-parity, sdk]
status: final
---

# FULL MCI in PETSCII `.seq` screens

Research: `thoughts/shared/research/2026-09-02_mci-in-petscii-seq.md`.
Branch: `feat/installed-door-link`.

## Sysop decisions (settled — do not reopen)

1. FULL parity: every token the `.TXT` path supports works in a `.seq`.
2. ONE server-side render path for telnet C64 and web `P`. The client canvas
   transducer never sees MCI.
3. express.e's first-byte `~` gate (`express.e:6800-6806`) opts a `.seq` into
   MCI. Art files without it are emitted byte for byte.
4. Values clip to the end of the current row. Never wrap, never scroll.
5. In the upper bank (`$8E`) a mixed-case value folds to uppercase. No bank flip.
6. Substituted values inherit the art's current pen and reverse state.
7. `~SP` pause is restored for PETSCII screens.
8. `~WX` wipes are skipped on a C64 (effects-off, already true); colour tokens
   map to the VIC pen table.
9. `~SS_` / `~SR_` includes resolve `.seq` siblings first — the same lookup
   `findSecurityScreen(..., petsciiMode=true)` already does
   (`web/backend/src/utils/screen-security.util.ts:104-111`).
10. `~CC_` chains run through the same display path as `.TXT`.

## Standing rules this plan must not break

- **80-column rule.** The ANSI/`.TXT` path stays 80 columns, unreflowed,
  byte-identical. Every task below carries an ANSI pin.
- **One-width-source rule.** The renderer takes its width from
  `ctx.machine.state.cols` (the PetsciiMachine's physical 40). No new `40`
  literal, no second call to `sessionColumns`/`doorScreenWidth`.
- Regression test per bug (`RULES.md`), express.e parity, no emojis, ASCII
  tokens in BBS output.

## Architecture in one paragraph

`emitPetsciiScreen` (`web/backend/src/handlers/screen.handler.ts:1889`) is the
single point both transports pass through: it base64s a Buffer onto
`petscii-bytes`, which telnet forwards raw (`connection-emitter.ts:130-141`)
and the web terminal feeds to its own `PetsciiMachine`
(`packages/terminal/src/components/BBSTerminal.tsx:2193-2200`). Doing the MCI
render there — and only there — satisfies decision 2 for free. The render
views the `.seq` buffer as latin-1 (`buf.toString('latin1')`), runs it through
the ONE tokenizer `processMci`
(`web/backend/src/utils/mci-tokenizer.util.ts:160`) with the ONE dispatch table
extracted from `parseMciCodes`, and re-encodes only the substituted spans —
located by a new `onSubstitution` hook — using the ONE ASCII→PETSCII table,
with the charset bank read positionally off a `PetsciiMachine` fed the bytes
emitted so far.

Three "ONE"s, each replacing a duplicate that exists today:

| concern | survivor | duplicates retired |
|---|---|---|
| MCI scanning | `processMci` | (none — already single) |
| ASCII→PETSCII byte table | `sdk/petscii/ascii-to-petscii.ts` | `printChar` body (`sdk/petscii/ansi-to-petscii.ts:310-333`), `convertAsciiToPetsciiOutput` (`web/backend/src/utils/petscii.util.ts:584-643`) |
| bank/cursor tracking | `PetsciiMachine` (`sdk/petscii/petscii-machine.ts`) | (no hand-written scanner is ever introduced) |

---

## Task 1 — RED: the shipped `Logoff.seq` bug

**Why first.** It is a live product bug, it needs no new machinery to
demonstrate, and it is the only shipped evidence that `.seq` files already
contain MCI.

**Fact.** `Conf2/Screens/Logoff.seq` is 39 bytes:
`7e 53 52 5f 57 4f 52 4b 3a ...` = `~SR_WORK:bbs/Screens/logoff/logoff.seq\n`.
Eleven identical siblings: `Conf3..Conf13/Screens/Logoff.seq` (12 total).
A C64 caller logging off sees the literal text
`~SR_WORK:BBS/SCREENS/LOGOFF/LOGOFF.SEQ` instead of art, because
`displayScreen` early-returns on `isPetscii` (`screen.handler.ts:1960-1964`)
before `parseMciCodes` (`:379`) and before the `allowMCI` gate (`:2086-2091`).

**File.** New: `web/backend/tests/petscii/seq-mci.test.ts` (sibling of
`web/backend/tests/handlers/petscii-bytes-transport.test.ts`; copy its
`SKIP_DB_INIT` + emit-spy + `loadScreenFileForTest` absolute-path idiom).

```ts
it('a ~SR_ .seq include never puts the literal token on the wire', async () => {
  // fixture written as raw bytes, never via Edit/Write (UTF-8 destroys >0x7F)
  const seq = Buffer.from('~SR_WORK:bbs/Screens/logoff/logoff.seq\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'LOGOFF.SEQ'), seq);
  const emits: Array<[string, any]> = [];
  const socket = { emit: (e: string, d: any) => { emits.push([e, d]); } };
  await displayScreen(socket, session /* petsciiMode: true */, path.join(dir, 'LOGOFF.SEQ'));
  const wire = Buffer.concat(
    emits.filter(([e]) => e === 'petscii-bytes').map(([, d]) => Buffer.from(d, 'base64')),
  ).toString('latin1');
  expect(wire).not.toContain('~SR_');
});
```

**Expected now: FAIL** (the wire contains `~SR_WORK:...`).
**Goes GREEN at Task 7.** Between Task 1 and Task 7 it stays red; mark it
`it.failing` only if the suite is gating CI, and flip it back in Task 7.

**Verification.** Automated:
`cd web/backend && npx jest tests/petscii/seq-mci.test.ts`.
Manual: none yet.

**Success criteria.** The test exists, fails for the stated reason (assert the
failure message names `~SR_`, not a crash), and names the 12 shipped files in
its header comment.

---

## Task 2 — ONE ASCII→PETSCII table in the SDK

**New file.** `sdk/petscii/ascii-to-petscii.ts`

```ts
/** One ASCII/Unicode code point -> one PETSCII byte, for a given charset bank.
 *  bank 1 ($0E lowercase/uppercase): a-z -> $41-$5A, A-Z -> $C1-$DA.
 *  bank 0 ($8E uppercase/graphics): $C1-$DA are GRAPHICS, so both cases fold
 *  to $41-$5A (sysop decision 5: fold up, never flip bank).
 *  Returns `{ byte, needsReverse }` — needsReverse is true only for glyphs
 *  that exist solely as the inverse of another PETSCII glyph
 *  (UNICODE_TO_PETSCII's `{ rvs }` form). */
export function asciiToPetsciiByte(
  code: number, bank: 0 | 1,
): { byte: number; needsReverse: boolean };

export interface EncodePetsciiValueOpts {
  /** Emit $12/$92 around inverse-only glyphs and restore this state after.
   *  Default false = skip the glyph as '?' (keeps decision 6 absolute). */
  reverseState?: boolean;
  allowReverseToggle?: boolean;
}
/** Text -> PETSCII bytes in one bank. Emits NO bank switch and NO colour byte
 *  (decision 5 + 6). `\n` and `\r\n` collapse to a single $0D. */
export function encodePetsciiValue(
  text: string, bank: 0 | 1, opts?: EncodePetsciiValueOpts,
): number[];
```

Body is `printChar`'s table (`sdk/petscii/ansi-to-petscii.ts:310-333`) lifted
verbatim, plus the bank-0 fold, plus the `UNICODE_TO_PETSCII` /
`screenCodeToPetscii` fallbacks it already uses.

**Edits.**
- `sdk/petscii/ansi-to-petscii.ts:310-333` — `printChar` becomes a thin caller:
  `const { byte, needsReverse } = asciiToPetsciiByte(code, 1)` then the existing
  `printByte` / reverse-toggle path. Behaviour must not change (the transducer
  keeps forcing bank 1 via `printByte`/`ensureBank`, `:266-270`, `:221-225`).
- `sdk/petscii/index.ts` — export both new symbols next to
  `printablePetsciiToScreenCode`.
- `web/backend/src/utils/petscii.util.ts:584-643` — **delete**
  `convertAsciiToPetsciiOutput`'s body; keep the exported name as a
  one-line delegate to `encodePetsciiValue(text, 1, ...)` plus the `$0E`
  prelude, or remove it entirely and re-point `convertAnsiToPetscii`
  (`:507-509`). Verified: **zero production callers** — only
  `web/backend/tests/utils/petscii.util.test.ts` imports it.

**Deliberate behaviour changes** (the SDK table is the survivor; update these
assertions, do not paper over them):
| input | old `convertAsciiToPetsciiOutput` | new SDK table |
|---|---|---|
| `\` (0x5C) | `$5C` (pound glyph) | `$2F` (`/`) |
| `_` (0x5F) | `$5F` | `$A4` (PETSCII underline) |
| unknown glyph | `$20` | `$3F` (`?`) |
| 0x08 / 0x7F | `$14` | `$14` (keep — add the case to the SDK table) |

**RED tests.** `web/backend/tests/petscii/ascii-to-petscii.test.ts`:
1. bank 1: `'Ab'` → `[0xC1, 0x42]`.
2. bank 0: `'Ab'` → `[0x41, 0x42]`; assert no byte lands in `$C1-$DA`.
3. `encodePetsciiValue` emits no `$0E`, `$8E`, `$12`, `$92` or colour byte for
   plain alphanumerics (decision 5 + 6).
4. `'a\r\nb'` → `[0x41, 0x0D, 0x42]` (one `$0D`, not two).
5. Pin: `new AnsiToPetsciiTransducer().transduce('Hello')` is byte-identical
   before and after the refactor (capture the current output first).

**Verification.** Automated: `cd sdk && npx tsc --noEmit -p tsconfig.json`;
`cd web/backend && npx jest tests/petscii tests/utils/petscii.util.test.ts`.
Manual: none.

**Success criteria.** `grep -rn "0xC1\|+ 0x80" sdk web/backend/src --include=*.ts`
shows the letter-case mapping in exactly one file. Transducer output unchanged.

---

## Task 3 — ONE tokenizer, told where it substituted

`processMci` must stay the only MCI scanner. The renderer needs to know which
bytes of the output are substituted values (to encode them) and which are art
(to copy). The tokenizer has exactly **one** site where a substitution is
appended — `mci-tokenizer.util.ts:266-268`:

```ts
if (result !== undefined) {
  pos = cmdEnd + (consumedTerminator ? 1 : 0);
  out += result;
}
```

**Edit** (`web/backend/src/utils/mci-tokenizer.util.ts`): add to
`MciDispatchConfig`

```ts
  /** Called once per successful substitution with the value's span in the
   *  RETURNED string and the matched cmd (original case). Offsets are only
   *  meaningful on processMci's immediate output — any later regex pass
   *  invalidates them, which is why the PETSCII renderer calls processMci
   *  directly rather than through parseMciCodes' regex stages. */
  onSubstitution?: (start: number, length: number, cmd: string) => void;
```

and at the site:

```ts
if (result !== undefined) {
  pos = cmdEnd + (consumedTerminator ? 1 : 0);
  config.onSubstitution?.(out.length, result.length, rawCmd);
  out += result;
}
```

Zero behaviour change when the hook is absent.

**RED tests.** Extend `web/backend/tests/utils/mci-tokenizer.util.test.ts` (or
create it if absent):
1. `processMci('AB~N|CD', {dispatch:{N:()=>'zed'}, onSubstitution: spy})` →
   spy called once with `(2, 3, 'N')`; `out.slice(2, 5) === 'zed'`.
2. Prefix dispatch reports too: `~SS_x|` reports `('SS_x')` at the right offset.
3. Two substitutions report cumulative offsets that both index correctly.
4. No hook → output identical to today (pin).

**Verification.** Automated: `npx jest tests/utils/mci-tokenizer`.

**Success criteria.** No second `~` scanner anywhere:
`grep -rn "indexOf('~')" web/backend/src --include=*.ts` returns only
`mci-tokenizer.util.ts`.

---

## Task 4 — ONE dispatch table (the risky one)

**Problem.** The full token set lives inside `parseMciCodes` as two object
literals built over ~40 local variables and four mutable accumulators
(`screen.handler.ts:718-838` `userInfoDispatch`, `:844-884` `prefixDispatch`).
FULL parity (decision 1) means the `.seq` renderer must use *that* table, not a
copy of it.

**Edit.** Extract, **verbatim, in a commit that changes no behaviour**, into
`web/backend/src/handlers/mci-dispatch.ts`:

```ts
export type MciFlavour = 'ansi' | 'petscii';

export interface MciDispatchState {
  hasPause: boolean;
  commandsToExecute: string[];
  filesToDisplay: string[];
  slowmo: number;
  slowmoCount: number;
}

export interface BuildMciDispatchOpts {
  flavour: MciFlavour;          // 'ansi' = today's values, byte for byte
  inlineMode: boolean;          // drives the SENTINEL_* returns
  bbsName: string; sysopName: string; location: string;
  sentinels: { F: string; SP: string; CC: string; SS: string; SR: string; END: string };
}

export function buildMciDispatch(
  session: BBSSession, opts: BuildMciDispatchOpts,
): { dispatch: MciDispatchMap; prefixDispatch: MciPrefixDispatchMap; state: MciDispatchState };
```

`parseMciCodes` then calls `buildMciDispatch(session, { flavour: 'ansi', ... })`
and reads `state.hasPause` etc. where it used its locals.

**`flavour: 'petscii'` differences** — the ONLY entries that differ, all of them
transport encodings of the same semantic:

| token | ansi | petscii |
|---|---|---|
| `~c0..~c7` | `\x1b[3Nm` | `vicColorToPetscii(vic)` for black/red/green/yellow/blue/purple/cyan/white = VIC `0,2,5,7,6,4,3,1` |
| `~b0..~b7`, `~z0..~z7` | `\x1b[4Nm` | `$02` + `vicColorToPetscii(vic)` (CCGMS background, `petscii-machine.ts:91-97`) |
| `~q` | `\x1b[0m` | `$92` + `vicColorToPetscii(14)` (reverse off, default pen) |
| `~f` | `\x1b[2J\x1b[H` | `$93` (CLR) |
| `~h` | `\x08` | `$14` (destructive delete — the C64 has no non-destructive BS) |
| `~CR`, `~n1..~n9` | `\r\n`×N | `$0D`×N (research §4: `$0D` alone is correct in a `.seq`) |

Everything else (`~N`, `~CN`, `~CF`, `~TL`, `~TR`, `~UL`, `~RN`, `~FU`, `~FD`,
`~UB`, `~DB`, `~ND`, `~ON`, `~DT`, `~OT`, `~OD`, `~AK`, `~SP`, `~NS`, `~x`,
`~y`, `~w`, `~SS_`, `~SR_`, `~CC_`, …) is shared, unchanged, one definition.

`~AK` is 7 rows of 80-column ANSI. Under decision 1 it renders; decision 4's
per-row clip is what keeps it from smearing the 40-column frame. Say so in the
JSDoc; do not special-case it.

**Marking raw values.** The petscii-flavour entries above already return raw
PETSCII bytes and must NOT be re-encoded. The renderer decides by cmd:

```ts
export const PETSCII_RAW_CMDS = new Set([
  'c0','c1','c2','c3','c4','c5','c6','c7',
  'b0','b1','b2','b3','b4','b5','b6','b7',
  'z0','z1','z2','z3','z4','z5','z6','z7',
  'q','f','h','CR','n1','n2','n3','n4','n5','n6','n7','n8','n9',
]);
```

(`caseSensitive: true` is already set for this dispatch, so the lowercase keys
are exact — `mci-tokenizer.util.ts:126-135`.)

**RED / pin tests.**
1. **ANSI byte-identity pin, written BEFORE the extraction.**
   `web/backend/tests/handlers/mci-dispatch-ansi-pin.test.ts`: for a fixture
   list of ~25 codes (`~N|`, `~10N|`, `~CN|`, `~c3|`, `~b4|`, `~n3|`, `~q|`,
   `~AK|`, `~x10|`, `~SP`, `~CC_X|`, `~SS_FOO|`, `~5SR_bar|`, `~D.` forms),
   snapshot `parseMciCodes(...)`'s `parsed`, `commands`, `hasPause` before the
   refactor and assert equality after. Run it on the pre-refactor tree first
   and commit the snapshot.
2. Existing suites must stay green untouched:
   `tests/handlers/mci-codes-regression.test.ts`,
   `tests/handlers/screen-inline-sentinels.test.ts`,
   `tests/handlers/screen-handler.test.ts`.
3. `buildMciDispatch(session, {flavour:'petscii'})` returns the same key set as
   `'ansi'` — `expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())`.
   This is the FULL-parity guard: adding an ANSI token without a PETSCII
   counterpart fails the build.

**Verification.** Automated: `cd web/backend && npx jest tests/handlers`.
Manual: log in as an ANSI web user, view `BULL` and `MENU`, confirm identical
rendering to `git stash` baseline.

**Success criteria.** `parseMciCodes` no longer contains an object literal of
MCI codes; the pin test passes unchanged; the key-set test passes.

---

## Task 5 — `renderPetsciiScreen`

**New file.** `web/backend/src/handlers/petscii-screen.render.ts`

```ts
export interface PetsciiRenderCtx {
  /** The bank/cursor/pen/reverse oracle. Fed EVERY byte this render emits,
   *  so `charsetBank` and `cursorX` at a token position are exact and
   *  positional (research §3.4). Carried across ~SP resumes and ~SS_
   *  includes so state never resets mid-screen. */
  machine: PetsciiMachine;
  dispatch: MciDispatchMap;
  prefixDispatch: MciPrefixDispatchMap;
  terminator: string;
  state: MciDispatchState;
}

/** Render one .seq buffer's MCI into PETSCII bytes. Pure: no socket, no I/O.
 *  Structural tokens (~SS_/~SR_/~CC_/~SP) arrive here as NUL sentinels from
 *  the dispatch and are passed through untouched for the caller's walker. */
export function renderPetsciiScreen(
  bytes: Buffer, session: BBSSession, ctx: PetsciiRenderCtx,
): Buffer;
```

**Algorithm.**

1. **Gate** (decision 3, `express.e:6800-6806`): `if (bytes[0] !== 0x7E)
   { ctx.machine.feed(bytes); return bytes; }` — the machine still observes so
   the oracle stays truthful, and the caller gets the identical Buffer object.
2. `const src = bytes.toString('latin1')` — one char per byte, lossless for
   0x00-0xFF. Never `utf8` (MEMORY: high-bit bytes are destroyed).
3. Collect spans:
   ```ts
   const spans: Array<{start:number; len:number; cmd:string}> = [];
   const out = processMci(src, {
     dispatch: ctx.dispatch, prefixDispatch: ctx.prefixDispatch,
     softFallThrough: false,   // express.e strict: `~` is consumed
     caseSensitive: true,      // same as the ANSI path
     onSubstitution: (start, len, cmd) => { if (len) spans.push({start, len, cmd}); },
   }, ctx.terminator);
   ```
4. Walk `out` once, span cursor in hand:
   - art char (outside every span): push `charCodeAt(i) & 0xFF`, feed the
     machine one byte.
   - span with `PETSCII_RAW_CMDS.has(cmd)`: push its bytes as-is (already
     PETSCII), feed them.
   - any other span: for each char, **read the live oracle**
     `const bank = ctx.machine.state.charsetBank`, encode with
     `asciiToPetsciiByte(code, bank)`, push, feed. Clip: stop emitting the rest
     of the value the moment `ctx.machine.state.cursorX === 0` after a push
     (i.e. the byte just wrapped) — decision 4, "clip to end of row". `$0D`
     inside a value (from `~CR`/`~n*`) legitimately resets `cursorX`, so the
     clip test is "wrapped from print", not "cursorX===0": track
     `xBefore = cursorX` and break when `xBefore === cols - 1` and the char was
     printable.
   - Width source: `const cols = ctx.machine.state.cols` — no literal.
5. `return Buffer.from(bytesOut)`.

**Invariants to encode as tests.**
- No `$0E`/`$8E` is ever emitted by the renderer (decision 5).
- No `$12`/`$92`/colour byte is emitted inside a non-raw span (decision 6),
  except the inverse-only-glyph restore pair when
  `allowReverseToggle` is on — default off.
- A gated-out file returns `Buffer.equals`-identical bytes.

**Known faithful edge case.** A `$02` immediately before a token makes the
first substituted byte the CCGMS background-colour candidate
(`petscii-machine.ts:91-97`). That is exactly what a real C64/CCGMS does, so we
do not defend against it; document it in the JSDoc and cover it with a test
that asserts the C64 behaviour rather than a workaround.

**RED tests** (`web/backend/tests/petscii/seq-mci.test.ts`, all fixtures built
as byte arrays in code — never via Edit/Write):
1. **lower bank**: `0x7E`, art run, `$0E`, `~N|`, art run. Feed the result to a
   fresh `PetsciiMachine`; assert the screen cells spell the session username,
   and that the two art byte runs are `Buffer.equals` to the fixture's.
2. **upper bank**: same with `$8E`; assert every substituted letter byte is in
   `$41-$5A` and none in `$C1-$DA`.
3. **`~CN` in both banks**, same assertions.
4. **gate**: `Node1/Screens/BBSTITLE.SEQ` (864 bytes, first byte `0x20`,
   11×`$0E` + 11×`$8E` = the 22 bank flips) round-trips `Buffer.equals`
   to disk. Also `Node1/BBSTITLE.SEQ` (1834 bytes, zero `$7E`).
5. **mid-file bank flip**: fixture `~` + `$8E` + `~N|` + `$0E` + `~N|` — the
   same token encodes differently on either side of the flip. This is the test
   that proves the oracle is positional and not per-file.
6. **clip**: a 30-char username substituted at column 25 emits exactly 15
   value bytes; `cursorY` is unchanged; row 1 of the machine is untouched.
7. **pen/reverse inheritance**: art sets `$1C` (red) + `$12` (reverse on)
   before the token; assert the value's `colorRam` cells are VIC 2 and their
   screen codes have bit 7 set, with no colour or `$12`/`$92` byte in the
   substituted span.
8. **colour token**: `~c1|` in a `.seq` emits `$1C` (VIC 2 red), not `\x1b[31m`.

**Verification.** Automated: `npx jest tests/petscii/seq-mci.test.ts`.
Manual: none yet (nothing is wired).

**Success criteria.** All eight pass. `renderPetsciiScreen` imports
`PetsciiMachine`, `processMci` and `asciiToPetsciiByte` and defines no table
and no scanner of its own.

---

## Task 6 — Wire it: one render, both transports

**Edit.** `web/backend/src/handlers/screen.handler.ts:1889-1901`
(`emitPetsciiScreen`). Before the base64:

```ts
const sessionWantsRawPetscii = !!session.petsciiMode || session.terminalType === 'c64';
if (result.petsciiBuffer && sessionWantsRawPetscii) {
  const ctx = petsciiRenderCtxFor(session);      // builds/reuses machine + dispatch
  const rendered = renderPetsciiScreen(result.petsciiBuffer, session, ctx);
  socket.emit('petscii-bytes', rendered.toString('base64'));
} else { ... unchanged ... }
```

Rewrite the header comment at `:1869-1876`: the "bypasses the MCI pipeline
entirely" claim and the "intentionally drops ~SP" sentence are now false.

`petsciiRenderCtxFor(session)` lives in `petscii-screen.render.ts` and caches
`{ machine, dispatch, prefixDispatch, terminator, state }` on the session so a
`~SS_` include or a `~SP` resume continues the same oracle. The machine here is
a *render-side* oracle — separate from the telnet emitter's transducer oracle
(`connection-emitter.ts:137` still `observe()`s the final bytes) and from the
web client's (`BBSTerminal.tsx:2194`). All three see the same bytes, so all
three agree.

**Do not touch** `displayScreen`'s `isPetscii` early return (`:1960-1964`) in
this task; it keeps calling `emitPetsciiScreen`, which now renders.

**RED tests.**
1. **Reachability at the product entry point** (the headline criterion):
   `displayScreen(socket, {petsciiMode:true, user:{name:'spot'}}, '<abs>/T.SEQ')`
   on a `.seq` whose body is `~` + art + `~N|` + `~CN|` + art yields
   `petscii-bytes`; base64-decode, feed a `PetsciiMachine`, and assert the
   username and conference name appear in the right bank codes with the
   surrounding art byte-identical.
2. **Transport parity**: the same fixture through
   `buildConnectionEmitter(...)` (telnet) and through the socket.io spy
   produces the same bytes. Follow
   `tests/handlers/petscii-bytes-transport.test.ts`'s emitter construction.
3. **Web path**: assert the base64 payload the socket receives decodes to the
   rendered bytes (the client transducer is not exercised in Node; the payload
   equality is the contract — `BBSTerminal.tsx:2193-2200` feeds it verbatim).
4. **ANSI pin, again**: an ANSI session displaying the same screen name with a
   `.TXT` sibling produces byte-identical `ansi-output` to `main`.

**Verification.** Automated: `npx jest tests/petscii tests/handlers/petscii-bytes-transport.test.ts`.
Manual (after the freshness protocol in Task 9): telnet in with a real C64 /
CCGMS or `syncterm` in C64 mode, and separately open the web terminal and press
`P` at the graphics prompt; both must show the same substituted screen.

**Success criteria.** One call site renders; `grep -n "renderPetsciiScreen"
web/backend/src` shows exactly one production caller.

---

## Task 7 — Structural tokens: `~SS_`, `~SR_`, `~CC_` (Task 1 goes GREEN)

**Mechanism.** The inline sentinel walker already exists
(`screen.handler.ts:1101-1235`) and already does exactly the right thing in
document order: emit text-before, run the side effect, continue. Its only
PETSCII-hostile part is `emitChunk` (`:1104-1110`), which runs `addAnsiEscapes`
and `\n`→`\r\n` normalization.

**Edit.** Give the walker a chunk emitter chosen by flavour:

```ts
const emitChunk = petsciiFlavour
  ? (chunk: string): boolean => {
      if (!chunk.length) return false;
      const bytes = renderChunkBytes(chunk, ctx);   // encode + feed the oracle
      socket.emit('petscii-bytes', bytes.toString('base64'));
      return true;
    }
  : (chunk: string): boolean => { /* today's addAnsiEscapes path, unchanged */ };
```

Because `renderPetsciiScreen` passes sentinels through untouched (Task 5, step
4 treats a `\x00`-delimited run as art, and `\x00` is a machine no-op —
`petscii-machine.ts:121`), the walker sees them exactly as it does today.

**Include resolution (decision 9).** `~SS_` at `:1175-1182` and `~SR_` at
`:1184-1221` both end in `await displayScreen(socket, session, target, false)`.
`displayScreen` → `loadScreenFile` → `resolvePetsciiPath` (`:269-279`) already
prefers a `.seq` sibling for a `petsciiMode` session, and `findSecurityScreen`
(`:1639`, `:1715`) already prefers `.SEQ` first
(`screen-security.util.ts:104-111`). So the include path is **already correct**
once the walker runs for a `.seq` — no new lookup. express.e agrees: its `SR_`
branch calls `findSecurityScreen(tempstr, screenfilename)` before `displayFile`
(`express.e:5551`).

`~CC_` (`:1156-1173`) needs no change at all — `processCommand` renders through
the normal display path, which is PETSCII-aware per session.

**Recursion.** A `~SS_` include is itself a `.seq` → `emitPetsciiScreen` →
`renderPetsciiScreen` with the *same* `ctx.machine`, so the include continues
the parent's bank and cursor. Guard depth as `displayScreen` already does.

**Entry point.** `displayScreen`'s `isPetscii` branch (`:1960-1964`) becomes:
gate-check the buffer; if `buffer[0] === 0x7E`, run the inline MCI path
(dispatch built with `flavour: 'petscii'`, `inlineMode: true`) instead of the
bare `emitPetsciiScreen`; otherwise call `emitPetsciiScreen` exactly as today.

**RED tests.**
1. **Task 1's test flips to GREEN.** Additionally assert the include *resolved*:
   with `Screens/logoff/001.logoff.seq` present in a temp dir and a `~1SR_`
   width prefix, the wire carries that file's art bytes.
2. `~SS_` prefers a `.seq` sibling: temp dir holds both `INC.SEQ` and `INC.TXT`;
   a petsciiMode session gets `INC.SEQ`'s bytes.
3. `~SS_` falls back to `.TXT` when no `.seq` exists, and the ANSI content
   takes the ANSI path (no `petscii-bytes` for it) — this is the shipped
   `logoff` reality: `Screens/logoff/` holds only `001-003.logoff.txt`.
4. `~CC_` in a `.seq` calls `processCommand` once with the right code.
5. Document order: art / include / art emits three payloads in that order.

**Known follow-up (out of scope, record it).** `~SR_` with no width prefix
defaults to `maxCount = 99` (`screen.handler.ts:952`, `:1211`) while only
`001-003.logoff.txt` exist, so ~97% of logoffs pick a missing file and show
nothing. express.e does `Rnd(Val(num))` with `Val('') = 0` (`express.e:5537-5541`),
which is a different miss. Fixing the shipped `Logoff.seq` files to `~3SR_...`
is a sysop data change, not a code change; note it in `handoff.md`.

**Verification.** Automated: `npx jest tests/petscii tests/handlers/screen-inline-sentinels.test.ts`.
Manual: log off from a conference on a C64 session and confirm no `~SR_` text.

**Success criteria.** Task 1's assertion passes; `screen-inline-sentinels.test.ts`
still green (ANSI walker untouched).

---

## Task 8 — `~SP`, `~WX`, colours: the remaining decisions

**`~SP` (decision 7).** Reuse the existing pause state machine rather than
building a second one. `session.screenSegments` (`index.ts:449`,
`screen.handler.ts:2126-2231`, `processNextScreenSegment` at `:2939`) already
holds segments, an `eventName`, and an `onComplete`. Add two fields:

```ts
  petscii?: boolean;                 // segments are latin-1 .seq bytes
  petsciiCtx?: PetsciiRenderCtx;     // carry the oracle across the pause
```

In `processNextScreenSegment` (`:2953-2973`), when `segState.petscii`, skip
`addAnsiEscapes` and the CRLF normalization (`:2962-2965`) and emit through the
PETSCII chunk emitter instead. The pause prompt itself (`:2986`) stays ANSI —
a petsciiMode telnet session converts it through the session transducer
(`connection-emitter.ts:104`) and the web canvas session converts it client-side,
so no new prompt encoding is needed.

The `~SP` sentinel path (`:1137-1154`) already returns `pendingInlineContent`;
for a `.seq` that remainder is latin-1 bytes and rides through unchanged
(sentinels contain no `~`, so a re-tokenize is idempotent — the existing
comment at `:1093-1100` covers it).

**`~WX` (decision 8).** No code change needed: `wipeEffectsEnabled`
(`screen-wipe.util.ts:622-624`) already returns `false` for `petsciiMode`, and
`displayScreen` already strips the directive so `~WX` never prints
(`:2061-2084`). What changes is that a `.seq` now *reaches* that stripping.
**Add a regression test** asserting a `.seq` containing `~WX` emits no wipe
frames and no literal `~WX` bytes — this is the "note what `~WX` does on a C64"
requirement made executable. Point it at `tests/handlers/petscii-wipe-off.test.ts`'s
existing idiom.

**Colour tokens (decision 8, second half).** Covered by Task 4's `flavour`
table and Task 5's test 8. Add one more: `~b2|` emits `$02 $1E` (CCGMS
background green) and the machine reports `background === 5` and a full repaint.

**Documented C64 semantics** (put this table in the module JSDoc of
`petscii-screen.render.ts`, and in `handoff.md`):
- `~WX` — wipes never animate on a C64; the screen paints directly. The
  directive is stripped, never printed.
- `~c0..~c7` — one VIC pen byte, applied from that point until the art or
  another token changes it.
- `~b0..~b7`/`~z0..~z7` — CCGMS `$02 <colour>`: sets background AND border
  together (they cannot be independent). Inert on SyncTERM's C64 mode.
- `~f` — `$93` CLR, which also homes the cursor and repaints in the pen colour.
- `~q` — reverse off + default pen; there is no "all attributes" reset on a C64.
- `~CR`/`~n*` — `$0D`, which on a C64 also cancels reverse
  (`petscii-machine.ts:110`). That is real KERNAL behaviour, not a bug.

**Verification.** Automated: `npx jest tests/petscii tests/handlers/petscii-wipe-off.test.ts`.
Manual: a `.seq` with `~SP` mid-file pauses on a real C64 and resumes with the
art continuing in the correct bank.

**Success criteria.** All decisions 1-10 have a named passing test.

---

## Task 9 — Freshness and handoff (last, mandatory)

`sdk/petscii/**` was edited in Task 2. Per
`.claude/skills/door-sdk-freshness/SKILL.md` section A, the running dev backend
will **not** pick that up — this is the exact failure mode that cost a session
on 2026-08-24.

1. `cd sdk && npx tsc --noEmit -p tsconfig.json`
2. `cd web/backend && npx jest tests/petscii tests/handlers tests/utils` — all green.
3. `cd web/backend && npm run typecheck:tests`
4. Rebuild the SDK dist: `cd sdk && npm run build:cjs && npm run build:esm`
5. Verify the rebuild took: `grep -rn "asciiToPetsciiByte" sdk/dist | head` must
   hit. A green `tsc` proves types, not that the right outDir was written.
6. Restart the stack with absolute paths:
   ```
   /Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
   ps aux | grep -E "(start-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep   # must print nothing
   rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
   /Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only --quick
   ```
7. Wait for `[READY] AmiExpress BBS is ready for connections!` in
   `logs/backend.log` before telling the user anything.
8. **Manual acceptance, both screens** (`door-three-screens` rule):
   - Telnet/SyncTERM in C64 mode: log in, view a `.seq` with `~N`/`~CN`, log off
     from a conference (the `Logoff.seq` path).
   - Web terminal, `P` at the graphics prompt: the same screens, same result.
   - Web terminal, ANSI: `MENU` and `BULL` unchanged from before the branch.
9. Update `handoff.md`: what shipped, the three ONE-source collapses, the
   `~SR_` default-99 follow-up from Task 7, and the C64 semantics table from
   Task 8. Keep it under 10 KB / 120 lines (`wc -c handoff.md`).

**Success criteria.** Rebuilt dist contains the new symbol; the board is up;
both screens verified by hand; `handoff.md` current and under cap.

---

## Sequencing and dependencies

```
T1 (RED, stays red) ──────────────────────────────────┐
T2 (SDK table) ──┐                                    │
T3 (tokenizer hook) ──┐                               │
T4 (dispatch extract) ─┼─> T5 (renderer) ─> T6 (wire) ─┼─> T7 (structural, T1 GREEN) ─> T8 ─> T9
                       │                              │
                       └──────────────────────────────┘
```

T2, T3 and T4 are independent of each other and can be done in any order or in
parallel. T5 needs all three. T4 must land before T5 and must be a
behaviour-free move.

## Risk register

| risk | task | mitigation |
|---|---|---|
| Dispatch extraction silently changes `.TXT` rendering for the whole board | T4 | Byte-identity pin snapshotted on the pre-refactor tree; verbatim move, no edits in the same commit; three existing suites must stay green |
| `~` in art after the gate passes → false substitution | T5 | express.e-parity gate (decision 3); no shipped art file starts with `0x7E` (verified: every `Node*/BBSTITLE.SEQ` starts `0x20`) |
| UTF-8 corruption of high-bit art bytes | T5 | `latin1` in and out, asserted by the `Buffer.equals` gate test; fixtures built as byte arrays, never via Edit/Write |
| Retiring `convertAsciiToPetsciiOutput` changes output | T2 | Zero production callers (verified by grep); the four deliberate mapping changes are tabulated and their test assertions updated on purpose |
| `$02` immediately before a token eats the first value byte | T5 | Faithful C64/CCGMS behaviour; documented and tested as such, not worked around |
| Stale SDK in the running backend | T9 | Freshness protocol, with a `grep sdk/dist` proof step |