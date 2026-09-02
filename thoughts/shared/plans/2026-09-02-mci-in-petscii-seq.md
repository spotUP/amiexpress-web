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
  byte-identical. Every task carries an ANSI pin.
- **One-width-source rule.** Width comes from `ctx.machine.state.cols` (the
  PetsciiMachine's physical 40). No new `40` literal, no second
  `sessionColumns`/`doorScreenWidth` call.
- **Authoring rule (must reach sysops).** Once a `.seq` opens with `~`, EVERY
  `0x7E` in its art is a token candidate; a gated-in `.seq` must not use `0x7E`
  as art. Art files keep their non-`~` first byte and are untouched.
- Regression test per bug (`RULES.md`), express.e parity, no emojis, ASCII
  tokens in BBS output.

## Architecture in one paragraph

`emitPetsciiScreen` (`web/backend/src/handlers/screen.handler.ts:1889-1901`) is
the single point both transports pass through: it base64s a Buffer onto
`petscii-bytes`, which telnet forwards raw (`connection-emitter.ts:130-141`)
and the web terminal feeds to its own `PetsciiMachine`
(`packages/terminal/src/components/BBSTerminal.tsx:2147-2153`). Rendering there
— and only there — satisfies decision 2 for free. The render views the buffer
as latin-1, runs the shared pre-pass module (T4b), then the ONE tokenizer
`processMci` (`mci-tokenizer.util.ts:160`) with the ONE dispatch table
extracted from `parseMciCodes`, and re-encodes only the substituted spans —
located by a new `onSubstitution` hook — through the ONE ASCII→PETSCII table,
with the charset bank read positionally off a `PetsciiMachine` fed the bytes
emitted so far.

| concern | survivor | duplicate retired / prevented |
|---|---|---|
| MCI scanning | `processMci` | (already single) |
| MCI pre-passes | `applyMciPrePasses` (T4b) | a second regex pipeline in the `.seq` renderer |
| ASCII→PETSCII table | `sdk/petscii/ascii-to-petscii.ts` | `printChar` (`ansi-to-petscii.ts:310-333`), `convertAsciiToPetsciiOutput` (`petscii.util.ts:584-643`) |
| cursor walk | `petsciiMoveTo` (T4) | a second `$13`/`$11`/`$1D` walker for `~x`/`~y` |
| bank/cursor tracking | `PetsciiMachine` | (no hand-written scanner is introduced) |

---

## Task 1 — RED: the shipped `Logoff.seq` bug

**Fact.** `Conf2/Screens/Logoff.seq` is 39 bytes
(`~SR_WORK:bbs/Screens/logoff/logoff.seq\n`), with eleven identical siblings in
`Conf3..Conf13` (12 total). A C64 caller logging off sees the literal
`~SR_WORK:BBS/SCREENS/LOGOFF/LOGOFF.SEQ`, because `displayScreen` early-returns
on `isPetscii` (`screen.handler.ts:1960-1964`) before `parseMciCodes` (`:379`)
and before the `allowMCI` gate (`:2086-2091`).

**File.** New `web/backend/tests/petscii/seq-mci.test.ts`, sibling of
`tests/handlers/petscii-bytes-transport.test.ts` (copy its `SKIP_DB_INIT` +
emit-spy + absolute-path idiom); name the 12 shipped files in its header.

```ts
// fixture written as raw bytes, never via Edit/Write (UTF-8 destroys >0x7F)
const seq = Buffer.from('~SR_WORK:bbs/Screens/logoff/logoff.seq\n', 'latin1');
fs.writeFileSync(path.join(dir, 'LOGOFF.SEQ'), seq);
await displayScreen(socket, session /* petsciiMode: true */, path.join(dir, 'LOGOFF.SEQ'));
const payloads = emits.filter(([e]) => e === 'petscii-bytes').map(([, d]) => Buffer.from(d, 'base64'));
expect(Buffer.concat(payloads).toString('latin1')).not.toContain('~SR_');
// Strengthened (T7 resolver hole): absence of the token is not proof it resolved.
expect(payloads.length).toBeGreaterThan(0);
expect(Buffer.concat(payloads).length).toBeGreaterThan(seq.length);
```

**Expected now: FAIL** (the wire carries `~SR_WORK:...`). **GREEN at Task 7.**
Mark `it.failing` only if the suite gates CI; flip back in Task 7.

**Verification.** `cd web/backend && npx jest tests/petscii/seq-mci.test.ts`.
**Success criteria.** It fails for the stated reason (assert the message names
`~SR_`, not a crash).

---

## Task 2 — ONE ASCII→PETSCII table in the SDK

**New file** `sdk/petscii/ascii-to-petscii.ts`:

```ts
/** bank 1 ($0E): a-z -> $41-$5A, A-Z -> $C1-$DA. bank 0 ($8E): $C1-$DA are
 *  GRAPHICS, so both cases fold to $41-$5A (decision 5: fold up, never flip).
 *  needsReverse is true only for glyphs that exist solely as the inverse of
 *  another (UNICODE_TO_PETSCII's `{ rvs }` form). */
export function asciiToPetsciiByte(code: number, bank: 0 | 1): { byte: number; needsReverse: boolean };

/** Text -> PETSCII bytes in one bank. Emits NO bank switch and NO colour byte
 *  (decisions 5 + 6). `\n` and `\r\n` collapse to a single $0D.
 *  allowReverseToggle (default false) permits the $12/$92 restore pair around
 *  an inverse-only glyph; off means that glyph degrades to '?'. */
export function encodePetsciiValue(
  text: string, bank: 0 | 1, opts?: { reverseState?: boolean; allowReverseToggle?: boolean },
): number[];
```

Body is `printChar`'s table (`ansi-to-petscii.ts:310-333`) lifted verbatim,
plus the bank-0 fold and the `UNICODE_TO_PETSCII` / `screenCodeToPetscii`
fallbacks it already uses.

**Edits.**
- `sdk/petscii/ansi-to-petscii.ts:310-333` — `printChar` becomes a thin caller:
  `asciiToPetsciiByte(code, 1)` then the existing `printByte`/reverse-toggle
  path. Behaviour unchanged (the transducer still forces bank 1 via
  `printByte`/`ensureBank`, `:266-270`, `:221-225`).
- `sdk/petscii/index.ts` — export both symbols beside `printablePetsciiToScreenCode`.
- `web/backend/src/utils/petscii.util.ts:584-643` — delete
  `convertAsciiToPetsciiOutput`'s body; keep the exported name as a one-line
  delegate to `encodePetsciiValue(text, 1, ...)` plus the `$0E` prelude.
  **Correction to an earlier draft:** it is NOT caller-free —
  `convertAnsiToPetscii` (`:507-509`) delegates to it and `writePetsciiSeqFile`
  (`:514`) calls that; neither chain has a production caller today, but the
  delegate must stay so the chain compiles.

**Deliberate behaviour changes** (update the assertions in
`tests/utils/petscii.util.test.ts:405+`; do not paper over them):

| input | old `convertAsciiToPetsciiOutput` | new SDK table |
|---|---|---|
| `\` (0x5C) | `$5C` (pound glyph) | `$2F` (`/`) |
| `_` (0x5F) | `$5F` | `$A4` (PETSCII underline) |
| unknown glyph | `$20` | `$3F` (`?`) |
| 0x08 / 0x7F | `$14` | `$14` (keep — add the case to the SDK table) |

**RED tests** (`web/backend/tests/petscii/ascii-to-petscii.test.ts`):
1. bank 1: `'Ab'` → `[0xC1, 0x42]`. 2. bank 0: `'Ab'` → `[0x41, 0x42]`, no byte
in `$C1-$DA`. 3. `encodePetsciiValue` emits no `$0E`/`$8E`/`$12`/`$92`/colour
byte for plain alphanumerics (decisions 5 + 6). 4. `'a\r\nb'` →
`[0x41, 0x0D, 0x42]` (one `$0D`). 5. Pin:
`new AnsiToPetsciiTransducer().transduce('Hello')` byte-identical before and
after (capture the current output first).

**Verification.** `cd sdk && npx tsc --noEmit -p tsconfig.json`;
`cd web/backend && npx jest tests/petscii tests/utils/petscii.util.test.ts`.
**Success criteria.** `grep -rn "0xC1\|+ 0x80" sdk web/backend/src --include=*.ts`
shows the letter-case mapping in exactly one file; transducer output unchanged.

---

## Task 3 — ONE tokenizer, told where it substituted

`processMci` stays the only MCI scanner. The renderer must know which output
bytes are substituted values (encode them) and which are art (copy them). The
tokenizer has exactly **one** append site — `mci-tokenizer.util.ts:266-268`.

**Edit.** Add to `MciDispatchConfig` (`:110-136`):

```ts
  /** Called once per successful substitution with the value's span in the
   *  RETURNED string and the matched cmd (original case). Offsets are only
   *  meaningful on processMci's immediate output — any later regex pass
   *  invalidates them, which is why the PETSCII renderer calls processMci
   *  directly rather than through parseMciCodes' regex stages. */
  onSubstitution?: (start: number, length: number, cmd: string) => void;
```

and at `:266-268`, between the `pos` assignment and `out += result`:
`config.onSubstitution?.(out.length, result.length, rawCmd);`.
Zero behaviour change when the hook is absent.

**RED tests** (extend `tests/utils/mci-tokenizer.util.test.ts`):
1. `processMci('AB~N|CD', {dispatch:{N:()=>'zed'}, onSubstitution: spy})` → spy
called once with `(2, 3, 'N')`, `out.slice(2, 5) === 'zed'`. 2. Prefix dispatch
reports too: `~SS_x|` at the right offset. 3. Two substitutions report
cumulative offsets that both index correctly. 4. No hook → output identical to
today (pin).

**Success criteria.** `grep -rn "indexOf('~')" web/backend/src --include=*.ts`
returns only `mci-tokenizer.util.ts`.

---

## Task 4 — ONE dispatch table (the risky one)

**Problem.** The token set lives inside `parseMciCodes` as two object literals
over ~40 locals (`screen.handler.ts:718-838` `userInfoDispatch`, `:844-887`
`prefixDispatch`, inline-only prefix additions `:876-886`). FULL parity means
the `.seq` renderer uses *that* table, not a copy.

**Edit.** Extract, **verbatim, in a commit that changes no behaviour**, into
`web/backend/src/handlers/mci-dispatch.ts`:

```ts
export type MciFlavour = 'ansi' | 'petscii';

/** ONLY the pause flag lives here. commandsToExecute / filesToDisplay / slowmo
 *  / slowmoCount are set by the PRE-PASSES (T4b) and stay owned by
 *  applyMciPrePasses' return value. Side effect note: `~NS` (:777-782) and the
 *  `~NSF` pre-pass (:1048-1053) set `session.nonStopText` directly on the
 *  session object — a mutation of `session`, not of this state. */
export interface MciDispatchState { hasPause: boolean; }

export interface BuildMciDispatchOpts {
  flavour: MciFlavour;          // 'ansi' = today's values, byte for byte
  inlineMode: boolean;          // drives the SENTINEL_* returns
  bbsName: string; sysopName: string; location: string;
  sentinels: { F: string; SP: string; CC: string; SS: string; SR: string; MOVE: string; END: string };
}

/** ASYNC — decided, not optional. The closed-over values need
 *  `await db.getMessageBases(...)` (screen.handler.ts:682) and
 *  `await import('../services/SystemStatsService')` (:692) before the literal
 *  at :718 can be built. The `sync buildMciDispatch(MciRenderContext)`
 *  alternative was rejected: it only moves the same two awaits into a second
 *  exported function and gives callers two things to keep in step. */
export async function buildMciDispatch(session: BBSSession, opts: BuildMciDispatchOpts):
  Promise<{ dispatch: MciDispatchMap; prefixDispatch: MciPrefixDispatchMap; state: MciDispatchState }>;
```

`parseMciCodes` (already `async`, `:386`) awaits it with `flavour: 'ansi'` and
reads `state.hasPause` where it used its local. No caller changes.

**`flavour: 'petscii'` differences** — the only entries that differ, all
transport encodings of the same semantic:

| token | src | ansi | petscii |
|---|---|---|---|
| `~c0..~c7` | `:879-881` | `\x1b[3Nm` | `vicColorToPetscii(vic)`, VIC `0,2,5,7,6,4,3,1` |
| `~b0..~b7` | `:883-885` | `\x1b[4Nm` | `$02` + `vicColorToPetscii(vic)` (CCGMS, `petscii-machine.ts:91-97`) |
| `~z0..~z7` | `:888-890` | `\x1b[4Nm` | as `~b*` (express.e aliases them on one line) |
| `~q` | `:903` | `\x1b[0m` | `$92` + `vicColorToPetscii(14)` |
| `~f` | `:802` | `\x1b[2J\x1b[H` | `$93` (CLR) |
| `~h` | `:904` | `\x08` | `$14` (no non-destructive BS on a C64) |
| `~CR` | `:770` | `\r\n` | `$0D` (research §4) |
| `~n1..~n9` | `:892-900` | `\r\n`×N | `$0D`×N |
| `~AK` | `:769` (data `:708-716`) | 7 rows of 80-col ANSI | 13 rows of plain 40-col text, no ANSI |
| `~x<n>` | `:849-852` | `\x1b[;<n>H` | MOVE sentinel → `petsciiMoveTo` |
| `~y<n>` | `:855-858` | `\x1b[<n>;H` | MOVE sentinel → `petsciiMoveTo` |

**`~AK` — rendered, not suppressed.** `accessKeysDisplay` (`:708-716`) is seven
80-column rows of two key/label pairs each, wrapped in `\x1b[44;33m` /
`\x1b[40;35m`. Decision 1 says it renders on a C64 too. RULING: refactor the
literal into ONE shared array of 13 `[key, label]` pairs (F1-F10, SH+F5, SH+F6,
SH+F10). ANSI joins them two-per-row with today's exact SGR bytes (pinned by
test 1 below); PETSCII emits one pair per row as `<key padEnd 8><label>`, each
row `narrowClip`ped (`table-format.util.ts:114`) and joined with `\n` (the value
encoder collapses it to `$0D`). No ANSI bytes in the PETSCII rendering.
Decision 4's per-row clip is the backstop, not the mechanism.

**`~x` / `~y` — reuse the transducer's walk, resolved at walk time.** The
transducer's private `moveTo` (`sdk/petscii/ansi-to-petscii.ts:435-442`)
already emits the right walk: `$13` HOME when the target is (0,0), else
`$11`/`$91` runs to the row and `$1D`/`$9D` runs to the column.
- **Extract, do not re-write.** Lift that body into an exported pure
  `petsciiMoveTo(state: PetsciiMachineState, x: number, y: number, out: number[]): void`
  in the same file (Task 2's thin-caller pattern); `moveTo` becomes
  `this.pendingWrap = false; petsciiMoveTo(this.machine.state, x, y, out)` —
  `pendingWrap` is transducer-only and stays at the call site. A second
  `$13`/`$11`/`$1D` walker anywhere is a defect.
- **Deferred, because the walk is positional.** Dispatch closures run during
  `processMci`, BEFORE the renderer feeds any art to the oracle, so a walk
  computed there reads a stale cursor. The PETSCII entries return
  `SENTINEL_MOVE + x + '|' + y + SENTINEL_END`; Task 5's walk resolves it
  against the live machine, clamping to `machine.state.cols`/`rows`.
- Mapping (express.e:5478-5495, mirrored at `:849-858`): `~x<n>` is row 1 /
  col n → 0-based `(n-1, 0)`; `~y<n>` is row n / col 1 → 0-based `(0, n-1)`.

**`inlineMode` sentinels do not vary by flavour.** In `inlineMode`, `~SP`
(`:786-796`) returns `SENTINEL_SP` and `~f` (`:802`) returns `SENTINEL_F` in
BOTH flavours — the dispatch never emits the clear itself. Task 7's PETSCII
walker turns the `F` sentinel into `$93` through the PETSCII chunk emitter,
replacing today's `emitText(socket, '\x1b[2J\x1b[H')` at `:1131`.

**`~FL` needs no PETSCII entry.** `flaggedFilesList` (`:702-705`) is
`"<pad><name>\b\r\n"` per file: the `\r\n` is covered by `encodePetsciiValue`'s
`\r\n` → single `$0D` collapse (T2 test 4), the `\b` (0x08) by the SDK table's
kept 0x08 → `$14` case. Everything else (`~N`, `~CN`, `~CF`, `~TL`, `~TR`,
`~UL`, `~RN`, `~FU`, `~FD`, `~UB`, `~DB`, `~ND`, `~ON`, `~DT`, `~OT`, `~OD`,
`~NS`, `~w`, `~SS_`, `~SR_`, `~CC_`, …) is shared, unchanged, one definition.

**Marking raw values.** The petscii entries above already return PETSCII bytes
and must NOT be re-encoded:

```ts
export const PETSCII_RAW_CMDS = new Set([
  ...[0,1,2,3,4,5,6,7].flatMap(n => [`c${n}`, `b${n}`, `z${n}`]),
  'q','f','h','CR','n1','n2','n3','n4','n5','n6','n7','n8','n9',
]);
/** Prefix dispatch has no exact key; match on the cmd's first char. */
export const PETSCII_RAW_PREFIXES = new Set(['x', 'y']);
```

(`caseSensitive: true` is already set for this dispatch, so the lowercase keys
are exact — `mci-tokenizer.util.ts:134-135`, `:238`.)

**RED / pin tests.**
1. **ANSI byte-identity pin, written BEFORE the extraction.**
   `tests/handlers/mci-dispatch-ansi-pin.test.ts`: ~25 codes (`~N|`, `~10N|`,
   `~CN|`, `~c3|`, `~b4|`, `~n3|`, `~q|`, `~AK|`, `~FL|`, `~x10|`, `~y5|`,
   `~SP`, `~CC_X|`, `~SS_FOO|`, `~5SR_bar|`, `~D.` forms) — snapshot
   `parseMciCodes`'s `parsed`/`commands`/`hasPause` on the pre-refactor tree,
   commit the snapshot, assert equality after. `~AK`'s SGR bytes are in this
   snapshot, so the shared `[key,label]` array must reproduce them exactly.
2. Existing suites stay green untouched: `tests/handlers/mci-codes-regression.test.ts`,
   `screen-inline-sentinels.test.ts`, `screen-handler.test.ts`.
3. `buildMciDispatch(session,{flavour:'petscii'})` returns the same key set as
   `'ansi'` for BOTH `dispatch` and `prefixDispatch`
   (`expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())`). This is the
   FULL-parity guard: an ANSI token without a PETSCII counterpart fails the build.
4. `petsciiMoveTo` pin: the transducer's `\x1b[10;5H` output byte-identical
   before and after the extraction.

**Verification.** `cd web/backend && npx jest tests/handlers`;
`cd sdk && npx jest tests/unit`. Manual: as an ANSI web user view `BULL` and
`MENU`, identical to an `origin/main` worktree baseline (never `git stash` here).
**Success criteria.** `parseMciCodes` holds no object literal of MCI codes; the
pin passes unchanged; both key-set assertions pass.

---

## Task 4b — ONE pre-pass module (blocking for decision 1)

**Why it exists.** Task 4 moves only the *tokenizer dispatch*. A large second
half of the token set never reaches the tokenizer: it is consumed by regex
passes running before `processMciTokenizer` (`screen.handler.ts:1068`). A
`.seq` renderer calling `processMci` alone supports NONE of these, so decision
1 would be unmet. Verified inventory, in source order:

| token | line | effect | flavour-divergent? |
|---|---|---|---|
| `~D<char>` terminator | `:414-434` | sets `mciTerminator`, emits nothing | no |
| `~XC_<cmd>||` | `:480-491` | queues command, emits `''` | no |
| `~XI<doorpath>` | `:492-499` | queues XIM door, emits `''` | no |
| `~CL.` | `:525` | conference list | **yes** — narrow branch at `:518` |
| `~CD.` | `:550` | conference directory | **yes** — narrow at `:539`, `:549` |
| `~ML.` | `:585` | message-base list | **yes** — narrow at `:562` |
| `~MD.` | `:621` | message-base descriptions | **yes** — narrow at `:597`, `:605` |
| `%NODELIST` | `:651` | node list | **yes** — rows carry `\x1b[32mYou\x1b[0m` (`:640`) |
| `~CR_<prompt>||` | `:908` | sets `hasPause`, emits prompt text | no |
| `~SM_<menu>||` | `:914` | sets `session.currentMenuName`, emits `''` | no |
| `~CC_<cmd>` (non-inline) | `:923` | queues command | no |
| `~SS_` / `~2S` (non-inline) | `:935` | `{{DISPLAY_FILE:N}}` placeholder | no |
| `~<n>SR_` (non-inline) | `:944` | `{{DISPLAY_FILE:N}}` placeholder | no |
| `~SX_<base>||` (both modes) | `:968` | sequential file placeholder | no |
| `~SMO<n>|` | `:1001` | slow mode on | no |
| `~SMC|` | `:1015` | slow mode clear | no |
| `~SP.` | `:1028` | sentinel (inline) / `hasPause` | no |
| `~CR.` | `:1045` | emits `''` | no |
| `~NSF` | `:1048` | `session.nonStopText = true` | no |
| bare `~` on a line | `:1058-1059` | `\x1b[2J\x1b[H` | **yes** — `$93` |

**RULING.** Extract every row above, verbatim and in order, into ONE shared
module `web/backend/src/handlers/mci-pre-passes.ts` that both `parseMciCodes`
and the `.seq` renderer run:

```ts
export interface MciPrePassResult {
  text: string; terminator: string; hasPause: boolean;
  commandsToExecute: string[]; filesToDisplay: string[];
  slowmo: number; slowmoCount: number;
}
/** async for the same reason buildMciDispatch is: await db.getMessageBases
 *  (:557, :592) and await getBoardConfig (:627). */
export async function applyMciPrePasses(text: string, session: BBSSession,
  opts: { flavour: MciFlavour; inlineMode: boolean }): Promise<MciPrePassResult>;
```

**PETSCII-flavour output for the five divergent rows.**
- `~CL.` / `~CD.` / `~ML.` / `~MD.` — do NOT write new narrow builders. The
  `isNarrow(session)` branches already in the code (`:518`, `:539`, `:549`,
  `:562`, `:597`, `:605`) ARE the 40-column renderings, and a `petsciiMode`
  session already satisfies `isNarrow` (`table-format.util.ts:49`). Under
  `flavour: 'petscii'` force that branch and strip its SGR runs; where a row
  needs clipping call `narrowClip` (`table-format.util.ts:114`) — never add a `40`.
- `%NODELIST` (`:627-651`) — `\x1b[32mYou\x1b[0m` at `:640` is its only ANSI;
  PETSCII emits `Node N:  You` unstyled. Rows are already under 40.
- bare `~` line (`:1058-1059`) — `\x1b[2J\x1b[H` becomes `$93`, returned as a
  raw span so the value encoder leaves it alone.

**RED tests** (`tests/handlers/mci-pre-passes.test.ts`):
1. **ANSI byte-identity pin for the extraction**, snapshotted on the
   pre-refactor tree: a fixture exercising all 20 rows through `parseMciCodes`;
   `{parsed, commands, hasPause, slowmo, slowmoCount}` equal after the move.
2. **Parity test**: the pre-pass handles the SAME token list in both flavours.
   Drive the 20-row fixture through both and assert (a) neither output retains
   any `~XC_`/`~XI`/`~CL.`/`~CD.`/`~ML.`/`~MD.`/`%NODELIST`/`~CR_`/`~SM_`/
   `~SX_`/`~SMO`/`~SMC`/`~SP.`/`~CR.`/`~NSF` literal; (b) `commandsToExecute`,
   `filesToDisplay`, `slowmo`, `slowmoCount`, `terminator` and `hasPause` are
   deep-equal across flavours. Adding a 21st pre-pass to one flavour only fails
   here.
3. `flavour: 'petscii'` output contains no `\x1b` byte at all.
4. `~D.` still retargets the terminator for the tokenizer stage that follows.

**Verification.** `npx jest tests/handlers/mci-pre-passes.test.ts
tests/handlers/mci-codes-regression.test.ts`.
**Success criteria.** `grep -c "parsed.replace(/~" web/backend/src/handlers/screen.handler.ts`
is 0; the parity test passes.

---

## Task 5 — `renderPetsciiScreen`

**New file** `web/backend/src/handlers/petscii-screen.render.ts`:

```ts
export interface PetsciiRenderCtx {
  /** Bank/cursor/pen/reverse oracle. Fed EVERY byte this render emits, so
   *  charsetBank and cursorX at a token are exact and positional (research
   *  §3.4). Carried across ~SP resumes and ~SS_ includes. */
  machine: PetsciiMachine;
  dispatch: MciDispatchMap; prefixDispatch: MciPrefixDispatchMap;
  terminator: string; state: MciDispatchState;
}
/** Render one .seq buffer's MCI into PETSCII bytes. No socket, no I/O.
 *  Structural tokens (~SS_/~SR_/~CC_/~SP/~f) arrive as NUL sentinels from the
 *  dispatch and pass through untouched for the caller's walker. */
export async function renderPetsciiScreen(bytes: Buffer, session: BBSSession,
  ctx: PetsciiRenderCtx): Promise<Buffer>;
```

**Algorithm.**
1. **Gate** (decision 3, `express.e:6800-6806`): `if (bytes[0] !== 0x7E)
   { ctx.machine.feed(bytes); return bytes; }` — the machine still observes so
   the oracle stays truthful, and the caller gets the identical Buffer. The
   gate is evaluated ONCE per file, on the file's first byte; never per `~SP`
   segment (Task 8).
2. `const src = bytes.toString('latin1')` — one char per byte, lossless for
   0x00-0xFF. Never `utf8` (MEMORY: high-bit bytes destroyed). Then
   `const pre = await applyMciPrePasses(src, session, {flavour:'petscii', inlineMode})`
   (Task 4b) — which is why the renderer is `async`.
3. Collect spans: `processMci(pre.text, { dispatch, prefixDispatch,
   softFallThrough: false` (express.e strict — the `~` is consumed)`,
   caseSensitive: true` (as the ANSI path)`, onSubstitution: (start, len, cmd)
   => { if (len) spans.push({start, len, cmd}); } }, pre.terminator)`.
4. Walk `out` once, span cursor in hand:
   - art char (outside every span): push `charCodeAt(i) & 0xFF`, feed one byte.
   - span with `PETSCII_RAW_CMDS.has(cmd)` or `PETSCII_RAW_PREFIXES.has(cmd[0])`:
     push its bytes as-is, feed them.
   - MOVE sentinel span: parse `x|y`, call `petsciiMoveTo(ctx.machine.state,
     clampCol(x), clampRow(y), outBytes)` against the LIVE oracle, feed the walk.
   - any other span: per char read the live oracle
     (`ctx.machine.state.charsetBank`), encode with `asciiToPetsciiByte`, push,
     feed.
   - Width source: `const cols = ctx.machine.state.cols` — no literal.
5. `return Buffer.from(bytesOut)`.

**Clip rule — RULING (decision 4).** A substituted value **never writes column
39**. Before pushing a *printable* value byte, stop the remainder of that value
if `ctx.machine.state.cursorX >= cols - 1`; the last column a value may occupy
is `cols - 2` (column 38). The machine therefore never wraps and never scrolls
inside a substitution, so no wrap detection is needed.

Why 38 and not 39: `PetsciiMachine` has **no deferred-wrap latch** — its
printable path (`petscii-machine.ts:122-127`) writes the cell and immediately
calls `cursorRight(fromPrint = true)`, which at `cols` sets `cursorX = 0` and
either advances `cursorY` or **scrolls the whole screen** (`:157-170`). (The
`pendingWrap` latch is transducer-only.) Writing column 39 would move the
cursor the instant it landed; decision 4 forbids that. `$0D` inside a value
(from `~CR`/`~n*`) is a RAW span and exempt — it legitimately moves the cursor.

**Invariants as tests.** No `$0E`/`$8E` ever emitted by the renderer (decision
5). No `$12`/`$92`/colour byte inside a non-raw span (decision 6), except the
inverse-only-glyph restore pair when `allowReverseToggle` is on — default off.
A gated-out file returns `Buffer.equals`-identical bytes.

**`$02` edge case — corrected.** `$02` arms `bgPrefix` (`petscii-machine.ts:100`);
on the NEXT byte the machine consumes it **only if that byte is itself a
PETSCII colour byte** (`:91-97`), otherwise `bgPrefix` clears and the byte falls
through and prints normally. So a `$02` before a token does NOT eat the first
substituted letter — the only thing it can bite is a **raw colour span** (a
`~c*`/`~b*`/`~q` value whose first byte is a colour byte). Document that in the
JSDoc and test the real C64 behaviour, not a workaround.

**RED tests** (`tests/petscii/seq-mci.test.ts`; every fixture built as a byte
array in code, never via Edit/Write):
1. **lower bank**: `0x7E`, art, `$0E`, `~N|`, art. Fed to a fresh
   `PetsciiMachine` the cells spell the username; both art runs `Buffer.equals`
   the fixture's.
2. **upper bank**: same with `$8E`; every substituted letter in `$41-$5A`, none
   in `$C1-$DA`. 3. **`~CN` in both banks**, same assertions.
4. **gate**: `Node1/Screens/BBSTITLE.SEQ` (864 bytes, first byte **`0x1F`**,
   11×`$0E` + 11×`$8E` = the 22 bank flips) round-trips `Buffer.equals` to
   disk. Also `Node1/BBSTITLE.SEQ` (1834 bytes, first byte `0x20`, zero `$7E`).
5. **mid-file bank flip**: `~` + `$8E` + `~N|` + `$0E` + `~N|` — the same token
   encodes differently either side of the flip. Proves the oracle is positional.
6. **clip (column-38 rule)**: art puts the cursor at column 25, then a
   30-character username substitutes. Assert exactly **14** value bytes
   (columns 25..38 inclusive); `cursorY` unchanged; `cursorX <= cols - 1` (it
   is 39); every cell of the row BELOW still its pre-substitution value.
7. **pen/reverse inheritance**: art sets `$1C` (red) + `$12` before the token;
   the value's `colorRam` cells are VIC 2, screen codes have bit 7 set, and the
   span contains no colour or `$12`/`$92` byte.
8. **colour token**: `~c1|` emits `$1C` (VIC 2 red), not `\x1b[31m`.
9. **`~x`/`~y`**: `~x10|` emits exactly the `petsciiMoveTo` walk and lands the
   machine on `(9, 0)`; `~y5|` on `(0, 4)`. No `\x1b` anywhere.
10. **`~AK`**: PETSCII rendering has no `\x1b`, is 13 rows, no row over 40.

**Verification.** `npx jest tests/petscii/seq-mci.test.ts`.
**Success criteria.** All ten pass. `renderPetsciiScreen` imports
`PetsciiMachine`, `processMci`, `applyMciPrePasses`, `petsciiMoveTo` and
`asciiToPetsciiByte`, and defines no table, no walker and no scanner of its own.

---

## Task 6 — Wire it: one render, both transports

**Edit** `screen.handler.ts:1889-1901` (`emitPetsciiScreen`), before the base64:

```ts
if (result.petsciiBuffer && (!!session.petsciiMode || session.terminalType === 'c64')) {
  const ctx = await petsciiRenderCtxFor(session);
  socket.emit('petscii-bytes',
    (await renderPetsciiScreen(result.petsciiBuffer, session, ctx)).toString('base64'));
} else { /* unchanged */ }
```

Rewrite the header comment at `:1868-1876`: the "bypasses the MCI pipeline
entirely" claim and the "intentionally drops ~SP" sentence are now false.

**`petsciiRenderCtxFor(session)` — what is cached, and what is not.**
- **Cached: the `PetsciiMachine` ONLY.** It is the positional oracle; a `~SS_`
  include or a `~SP` resume must continue the same bank and cursor. Stored on
  the session, exactly the idiom `petsciiTransducerFor` uses for the telnet
  transducer (`connection-emitter.ts:27-31`).
- **Rebuilt every render: `dispatch`, `prefixDispatch`, `state`, `terminator`.**
  Their closed-over values are volatile — `~TR` (time remaining), `~DT`/`~OT`/
  `~OD` (date/time), `~CN`/`~CF` (conference, changes on `J`), `~FU`/`~FD`/
  `~UB`/`~DB` (counters). Caching the dispatch would freeze a caller's clock at
  login. `buildMciDispatch` is async and cheap next to a screen paint.
- **Disposal site:** `session.petsciiRenderMachine = undefined` in the
  disconnect cleanup at `web/backend/src/server/socket-handlers.ts:973` (after
  the 3-second reconnect grace period, alongside the existing teardown) and
  wherever the session record is deleted. Like `session.petsciiTransducer` it
  is otherwise collected with the session object.

**Divergence rule** (replaces the old "all three machines see the same bytes"
paragraph). Three oracles exist: this render-side machine, the telnet emitter's
transducer (`connection-emitter.ts:137` `observe()`s the final bytes) and the
web client's (`BBSTerminal.tsx:2150`). They agree ONLY if every byte reaching
the wire also reaches this machine — and today the ANSI path emits raw escapes
around the PETSCII payload that the render machine never sees:

| site | line | emits |
|---|---|---|
| `~f` sentinel branch | `screen.handler.ts:1131` | `emitText(socket, '\x1b[2J\x1b[H')` |
| `~SR_` pre-clear | `screen.handler.ts:1217` | `socket.emit('ansi-output', '\x1b[2J\x1b[H')` |
| `shouldClear` | `screen.handler.ts:1947-1949` | `socket.emit('ansi-output', '\x1b[2J\x1b[H')` |
| raw-display bare `~` | `screen.handler.ts:2073` | `socket.emit('ansi-output', '\x1b[2J\x1b[H')` |

**RULE:** in petscii flavour each of these four must either go through the
PETSCII chunk emitter as `$93` (preferred — the wire then carries `$93` and
every oracle sees it) or be fed to the render machine as `$93`. Doing neither
is a silent bug class: the render machine believes the cursor is where the art
left it while the terminal has been homed.

**Do not touch** `displayScreen`'s `isPetscii` early return (`:1960-1964`) in
this task; it keeps calling `emitPetsciiScreen`, which now renders.

**RED tests.**
1. **Reachability at the product entry point** (headline criterion):
   `displayScreen(socket, {petsciiMode:true, user:{name:'spot'}}, '<abs>/T.SEQ')`
   on a `.seq` of `~` + art + `~N|` + `~CN|` + art yields `petscii-bytes`;
   decode, feed a `PetsciiMachine`, assert username and conference name in the
   right bank codes with the surrounding art byte-identical.
2. **Transport parity**: the same fixture through `buildConnectionEmitter(...)`
   and through the socket.io spy produces the same bytes (follow
   `tests/handlers/petscii-bytes-transport.test.ts`).
3. **Web path**: the base64 payload decodes to the rendered bytes
   (`BBSTerminal.tsx:2147-2153` feeds it verbatim).
4. **ANSI pin**: an ANSI session displaying the same screen name with a `.TXT`
   sibling produces byte-identical `ansi-output` to `origin/main`.
5. **Oracle-divergence pin**: a `.seq` on a `shouldClear` screen name emits
   `$93` on the PETSCII wire (not `\x1b[2J\x1b[H`), and the render machine's
   `cursorX`/`cursorY` after the render equal a fresh machine fed the same wire.

**Verification.** `npx jest tests/petscii tests/handlers/petscii-bytes-transport.test.ts`.
Manual (after Task 9's freshness protocol): telnet with a real C64 / CCGMS or
`syncterm` in C64 mode, and the web terminal with `P` at the graphics prompt;
both show the same substituted screen.
**Success criteria.** Exactly **two** production call sites of the renderer —
`emitPetsciiScreen` (whole file) and the walker's PETSCII `emitChunk` (Task 7,
per chunk) — and no third: `grep -rn "renderPetsciiScreen\|renderChunkBytes"
web/backend/src` lists only those two plus the module itself.

---

## Task 7 — Structural tokens: `~SS_`, `~SR_`, `~CC_` (Task 1 goes GREEN)

**Mechanism.** The inline sentinel walker (`screen.handler.ts:1101-1236`)
already does the right thing in document order: emit text-before, run the side
effect, continue. Its only PETSCII-hostile part is `emitChunk` (`:1104-1110`),
which runs `addAnsiEscapes` and `\n`→`\r\n` normalization.

**Edit.** Give the walker a chunk emitter chosen by flavour:

```ts
const emitChunk = petsciiFlavour
  ? (chunk: string) => { if (!chunk.length) return false;
      const bytes = renderChunkBytes(chunk, ctx);   // encode + feed the oracle
      socket.emit('petscii-bytes', bytes.toString('base64')); return true; }
  : (chunk: string) => { /* today's addAnsiEscapes path, unchanged */ };
```

Because `renderPetsciiScreen` passes sentinels through untouched (T5 step 4
treats a `\x00`-delimited run as art, and `\x00` is a machine no-op —
`petscii-machine.ts:120`), the walker sees them exactly as today. The `F`
sentinel branch (`:1129-1135`) emits `$93` through this emitter instead of
`emitText(socket, '\x1b[2J\x1b[H')`, per Task 6's divergence rule.

**Recursion — there is NO existing depth guard.** An earlier draft said "guard
depth as `displayScreen` already does"; that was wrong.
`grep -n "depth\|Depth" web/backend/src/handlers/screen.handler.ts` returns only
`currentIndex`/`nextIndex` pagination noise — no include-recursion guard exists
anywhere in the file, so a `.seq` whose `~SS_` names itself (or a `~SR_`/`~SS_`
cycle) recurses until the stack blows, today, on the ANSI path too. **Add one**:
`session.screenIncludeDepth` (default 0), incremented before the
`await displayScreen(...)` in the `SS:` branch (`:1175-1181`) and the `SR:`
branch (`:1184-1221`), decremented in a `finally`, hard cap 8; over the cap,
`screenDebug` and emit nothing.

**Entry point.** `displayScreen`'s `isPetscii` branch (`:1960-1964`) becomes:
gate-check the buffer; if `buffer[0] === 0x7E` run the inline MCI path
(dispatch `flavour: 'petscii'`, `inlineMode: true`), otherwise call
`emitPetsciiScreen` exactly as today. **Both arms `return true`.** A `.seq` must
NEVER fall through to the 40-column text path below it — the PETSCII
prose-reflow / ANSI-art-skip branch at `:1979-1996` (`petsciiTextScreenPlan`,
`ANSI_ART_SKIPPED_NOTICE`) and its reflow hook at `:2264+` operate on `content`,
which for a `.seq` is the legacy Unicode-PUA conversion; reflowing that smears
the art and, for an art-scoring screen, silently *skips* it and drops its MCI.

**Include resolution (decision 9) — and the hole it hides.** `~SS_`
(`:1175-1181`) and `~SR_` (`:1184-1221`) both end in
`await displayScreen(socket, session, target, false)`; `displayScreen` →
`loadScreenFile` → `resolvePetsciiPath` (`:269-279`) prefers a `.seq` sibling,
and `findSecurityScreen` prefers `.SEQ` first (`screen-security.util.ts:104-111`).
But the shipped `Logoff.seq` payload exposes a real defect:

```
~SR_WORK:bbs/Screens/logoff/logoff.seq
  -> formatNumberedFilename (services/SequentialFileManager.ts:16-24)
  -> Screens/logoff/001.logoff.seq
  -> filenameVariations -> addPetsciiVariants (screen.handler.ts:1570-1584)
  -> probes 001.logoff.seq.seq, 001.logoff.seq.SEQ, 001.logoff.seq,
            001.logoff.seq.txt, 001.logoff.seq.TXT, ...
```

Only `Screens/logoff/{001,002,003}.logoff.txt` exist. Every probe misses, so
the include resolves to nothing — which is why Task 1's assertion had to be
strengthened from "no `~SR_` on the wire" to "real art bytes on the wire": a
silently-empty include would have passed the weak form.

**RULING: fix the resolver, in code, with a test.** In `addPetsciiVariants`
(`:1570-1584`) strip a known screen extension from `name` before expanding
variants — case-insensitively, one of `.seq` / `.txt` / `.rip` — then expand
`.seq` first and `.txt` second, exactly as today. Apply the same strip in
`addAnsiVariants` and `addRipVariants` so the three stay symmetric; do not fork
a fourth list. `~CC_` (`:1156-1173`) needs no change — `processCommand` renders
through the normal display path, which is PETSCII-aware per session.

**RED tests.**
1. **Task 1's test flips to GREEN**, non-empty-art assertion included. Plus:
   with `Screens/logoff/001.logoff.seq` present in a temp dir and a `~1SR_`
   width prefix, the wire carries that file's art bytes.
2. `~SS_` prefers a `.seq` sibling: temp dir holds `INC.SEQ` and `INC.TXT`; a
   petsciiMode session gets `INC.SEQ`'s bytes.
3. `~SS_` falls back to `.TXT` when no `.seq` exists, and that content takes
   the ANSI path (no `petscii-bytes` for it) — the shipped `logoff` reality.
4. `~CC_` in a `.seq` calls `processCommand` once with the right code.
5. Document order: art / include / art emits three payloads in that order.
6. Recursion: a self-including `.seq` terminates at depth 8.
7. A gated-in `.seq` never emits `ANSI_ART_SKIPPED_NOTICE` and never reaches
   the reflow at `:2264`.
8. Resolver: `001.logoff.seq` → `001.logoff.txt` when only the `.txt` exists;
   → `001.logoff.seq` when both exist; `MENU` (no extension) resolves exactly
   as today (ANSI pin).

**Known follow-up — sysop DATA change, record it.** `~SR_` with no width prefix
defaults to `maxCount = 99` (`:952` non-inline, `:1211` inline) while only
`001-003.logoff.txt` exist, so ~97% of logoffs pick a missing file and show
nothing. express.e does `Rnd(Val(num))` with `Val('') = 0`
(`express.e:5537-5541`) — a different miss. The fix is editing the 12 shipped
`Conf*/Screens/Logoff.seq` from `~SR_...` to `~3SR_...`: data, not code (use
`sed`/`python`, never Edit/Write, per MEMORY). Note it in `handoff.md`.

**Verification.** `npx jest tests/petscii tests/handlers/screen-inline-sentinels.test.ts`.
Manual: log off from a conference on a C64 session; real art, no `~SR_` text.
**Success criteria.** Task 1's assertions pass; `screen-inline-sentinels.test.ts`
still green (ANSI walker untouched).

---

## Task 8 — `~SP`, `~WX`, colours: the remaining decisions

**`~SP` (decision 7).** Reuse the existing pause state machine.
`session.screenSegments` (`screen.handler.ts:2136-2150`,
`processNextScreenSegment` at `:2939`) already holds segments, an `eventName`
and an `onComplete`. Add `petscii?: boolean` (segments are latin-1 `.seq`
bytes) and `petsciiCtx?: PetsciiRenderCtx` (carries the oracle across the pause).

**HARD RULE: a `.seq` never enters the split/`trim()` segment branch.** The
non-inline `~SP` splitter at `:2129-2132` is
`contentForMci.split(/~SP(?:\s|\||\.)/).map(s => s.trim()).filter(s => s.length > 0)`.
`String.prototype.trim()` strips ` ` — byte `0xA0` on a latin-1 view, the
PETSCII shifted-space and a common solid art byte. Every leading and trailing
run of it in a segment would be silently deleted. A `.seq` therefore takes ONLY
the `pendingInlineContent` path (`:2224-2232`), where the remainder is stored
verbatim: no split, no `trim()`, no `filter`. Enforce it — the `.seq` entry
point (Task 7) sets `inlineMode: true` unconditionally, and a test asserts a
`.seq` fixture with `0xA0` at a segment boundary round-trips those bytes.

**Segment emission.** In `processNextScreenSegment` (`:2953-2973`), when
`segState.petscii`:
- skip `addAnsiEscapes` and the CRLF normalization (`:2962-2965`);
- emit through the **PETSCII chunk emitter over `petscii-bytes`**, never over
  `segState.eventName` — `eventName` is `'petscii-output'` for an `isPetscii`
  screen (`:2094`), and `connection-emitter.ts:120-127` re-transduces a
  `petscii-output` string through `AnsiToPetsciiTransducer`, double-encoding
  bytes that are already PETSCII;
- **suppress the `inlineEmitted` else-branch's `\x1b[0m` reset (`:2971`)**.
  There is no "all attributes off" on a C64; a bare `\x1b[0m` on the PETSCII
  wire is five garbage glyphs. Emit nothing for a petscii segment.

The pause prompt itself (`:2988`) stays ANSI — a petsciiMode telnet session
converts it through the session transducer (`connection-emitter.ts:104`), the
web canvas session client-side. No new prompt encoding.

**Automated `~SP` resume test** (in `tests/petscii/seq-mci.test.ts`): a `.seq` =
`~` + art (with a `$8E` bank flip and cursor movement) + `~SP` + a remainder
whose FIRST byte is an art `0x7E`. Assert:
1. two `petscii-bytes` payloads, split at the pause;
2. the second payload, fed to the machine that rendered the first, continues at
   the same `charsetBank`, `cursorX`, `cursorY`, `pen` and `reverse` — i.e.
   `petsciiCtx` really carried the oracle;
3. the remainder's leading `0x7E` is emitted as **art**, byte-identical: the
   gate is per FILE, evaluated once on `bytes[0]`, never re-opened per segment;
4. no `\x1b` and no `0x0A` in either payload;
5. a `0xA0` adjacent to the `~SP` boundary survives in both payloads.

**`~WX` (decision 8).** No code change: `wipeEffectsEnabled`
(`screen-wipe.util.ts:622-624`) already returns `false` for `petsciiMode` and
`displayScreen` already strips the directive so `~WX` never prints
(`:2061-2085`); what changes is that a `.seq` now *reaches* that stripping. Add
a regression test — a `.seq` containing `~WX` emits no wipe frames and no
literal `~WX` bytes — in `tests/handlers/petscii-wipe-off.test.ts`'s idiom.

**Colour tokens (decision 8, second half).** Covered by T4's flavour table and
T5 test 8, plus one more: `~b2|` emits `$02 $1E` (CCGMS background green), the
machine reports `background === 5` and a full repaint.

**Documented C64 semantics** (module JSDoc of `petscii-screen.render.ts`, and
`handoff.md`):
- `~WX` — wipes never animate on a C64; the screen paints directly. The
  directive is stripped, never printed.
- `~c0..~c7` — one VIC pen byte, applied until art or another token changes it.
- `~b0..~b7`/`~z0..~z7` — CCGMS `$02 <colour>`: sets background AND border
  together (they cannot be independent). Inert on SyncTERM's C64 mode.
- `~f` — `$93` CLR, which also homes the cursor and repaints in the pen colour.
- `~q` — reverse off + default pen; there is no all-attributes reset on a C64.
- `~CR`/`~n*` — `$0D`, which on a C64 also cancels reverse
  (`petscii-machine.ts:109`). Real KERNAL behaviour, not a bug.
- `~x`/`~y` — a relative `$11`/`$1D` walk from wherever the cursor is; the C64
  has no absolute cursor address.
- `~AK` — 13 plain rows, no colour; the ANSI SGR frame has no C64 equivalent
  worth faking.

**Verification.** `npx jest tests/petscii tests/handlers/petscii-wipe-off.test.ts`.
Manual: a `.seq` with `~SP` mid-file pauses on a real C64 and resumes with the
art continuing in the correct bank.
**Success criteria.** All decisions 1-10 have a named passing test (table below).

---

## Task 9 — Freshness and handoff (last, mandatory)

`sdk/petscii/**` was edited in Tasks 2 and 4. Per
`.claude/skills/door-sdk-freshness/SKILL.md` section A the running dev backend
will **not** pick that up — the failure mode that cost a session on 2026-08-24.

1. `cd sdk && npx tsc --noEmit -p tsconfig.json`
2. `cd web/backend && npx jest tests/petscii tests/handlers tests/utils` — green.
3. `cd web/backend && npm run typecheck:tests`
4. `cd sdk && npm run build:cjs && npm run build:esm`
5. `grep -rn "asciiToPetsciiByte\|petsciiMoveTo" sdk/dist | head` must hit BOTH
   symbols. A green `tsc` proves types, not that the right outDir was written.
6. Restart with absolute paths:
   ```
   /Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
   ps aux | grep -E "(start-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep   # must print nothing
   rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
   /Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only --quick
   ```
7. Wait for `[READY] AmiExpress BBS is ready for connections!` in
   `logs/backend.log` before telling the user anything.
8. **Manual acceptance — the `door-three-screens` "Ship" list
   (`.claude/skills/door-three-screens/SKILL.md:117-127`), all four items:**
   (a) `dist/` is what runs — here that is the SDK rebuild in step 4, not a
   door; (b) run the door-sdk-freshness skill after SDK edits and restart the
   backend before any manual walk (steps 4-7); (c) **manual walk (sysop): web
   `P` session and a telnet C64, at 40 columns; an 80-column session shows no
   change**; (d) **record the walk in the handoff.** Concretely: on both
   40-column surfaces log in, view a `.seq` with `~N`/`~CN`/`~AK`/`~x`, and log
   off from a conference (the `Logoff.seq` path); on the 80-column web ANSI
   session `MENU` and `BULL` are unchanged from `origin/main`.
9. Update `handoff.md`: what shipped, the ONE-source collapses, the `~3SR_`
   sysop data follow-up (Task 7), the authoring rule, and the C64 semantics
   table (Task 8). Under 10 KB / 120 lines (`wc -c handoff.md`).

**Success criteria.** The rebuilt dist contains both new symbols; the board is
up; both 40-column screens and the 80-column pin verified by hand and recorded;
`handoff.md` current and under cap.

---

---

## Sequencing and dependencies

```
T1 (RED, stays red) ─────────────────────────────────────────────────────────┐
T2 (SDK table + petsciiMoveTo) ──┐                                           │
T3 (tokenizer hook) ─────────────┤                                           │
T4 (dispatch extract) ───────────┼─> T5 (renderer) ─> T6 (wire) ─> T7 ─> T8 ─┼─> T9
T4b (pre-pass extract) ──────────┘                        (T1 GREEN at T7)   │
                                                                             │
                                 └───────────────────────────────────────────┘
```

T2, T3, T4 and T4b are independent and can run in any order or in parallel; T5
needs all four. T4 and T4b must each land before T5, and each must be a
behaviour-free move with its own ANSI byte-identity pin snapshotted on the
pre-refactor tree.

## Risk register

| risk | task | mitigation |
|---|---|---|
| Dispatch extraction silently changes `.TXT` rendering board-wide | T4 | Byte-identity pin snapshotted pre-refactor; verbatim move, no edits in the same commit; three existing suites stay green |
| **Pre-pass gap: 20 tokens never reach `processMci`, so a `.seq` supports none of them and decision 1 is unmet** | T4b | One shared `applyMciPrePasses` run by both callers; parity test asserting both flavours consume the identical token list; a second ANSI byte-identity pin |
| **No recursion guard exists anywhere (grep proves it): a self-including `.seq` blows the stack — on the ANSI path today too** | T7 | `session.screenIncludeDepth`, cap 8, `finally`-decremented, at both the `SS:` (`:1175`) and `SR:` (`:1184`) branches; self-including fixture test |
| **`trim()` on a latin-1 `.seq` segment eats `0xA0` art bytes** | T8 | Hard rule: a `.seq` never enters the split/`trim()` branch at `:2129-2132`; only `pendingInlineContent` (`:2224-2232`); `0xA0`-at-boundary round-trip test |
| **Caching the dispatch on the session freezes `~TR`/`~DT`/`~CN` at first render** | T6 | `petsciiRenderCtxFor` caches the `PetsciiMachine` only; dispatch rebuilt per render; disposal at `socket-handlers.ts:973` |
| **Include-resolver hole: `001.logoff.seq` expands to `001.logoff.seq.seq`… and never finds the shipped `001.logoff.txt`, so a "fixed" include renders nothing** | T7 | Strip a known screen extension before variant expansion in `addPetsciiVariants` (`:1570-1584`) and its two siblings; three resolver tests; T1's assertion strengthened to require non-empty art bytes |
| **Authoring hazard: once a `.seq` opens with `~`, every `0x7E` in its art is a token candidate** | T5, T9 | express.e-parity first-byte gate (decision 3); no shipped art file starts with `0x7E` (`Node1/Screens/BBSTITLE.SEQ` starts `0x1F`, `Node1/BBSTITLE.SEQ` starts `0x20`); the rule goes in `handoff.md` and the render module's JSDoc for sysops |
| **Oracle divergence: an ANSI `\x1b[2J\x1b[H` reaches the wire without the render machine seeing it** | T6 | Four sites tabulated (`:1131`, `:1217`, `:1947-1949`, `:2073`); each routed as `$93` through the PETSCII chunk emitter or fed to the render machine; T6 test 5 |
| UTF-8 corruption of high-bit art bytes | T5 | `latin1` in and out, asserted by the `Buffer.equals` gate test; fixtures built as byte arrays, never via Edit/Write |
| Retiring `convertAsciiToPetsciiOutput`'s body changes output | T2 | It is NOT caller-free (`convertAnsiToPetscii:507-509` delegates to it) — keep the delegate; the four deliberate mapping changes are tabulated and their assertions updated on purpose |
| `$02` immediately before a raw colour span eats its first byte | T5 | Faithful C64/CCGMS behaviour (`petscii-machine.ts:91-97` consumes only a following colour byte); documented and tested, not worked around |
| Stale SDK in the running backend | T9 | Freshness protocol with a `grep sdk/dist` proof step for both new symbols |

## RED coverage table — every sysop decision, pinned

| # | decision | pinned by |
|---|---|---|
| 1 | FULL parity: every `.TXT` token works in a `.seq` | T4 test 3 (dispatch + prefixDispatch key-set equality across flavours) **and** T4b test 2 (pre-pass token-list parity across flavours). Together they cover both halves of the token set: adding a token to one flavour, or to one stage only, fails the build. |
| 2 | ONE server-side render for telnet C64 and web `P` | T6 tests 2 (telnet emitter vs socket.io spy byte equality) and 3 (base64 payload decodes to the rendered bytes); T6 success criterion (exactly two production call sites). |
| 3 | first-byte `~` gate opts a file in | T5 test 4 (`Node1/Screens/BBSTITLE.SEQ` first byte `0x1F`, `Node1/BBSTITLE.SEQ` first byte `0x20`, both `Buffer.equals` round-trip); T8 `~SP` resume assertion 3 (gate is per file — a remainder starting `0x7E` stays art). |
| 4 | values clip to the row, never wrap or scroll | T5 test 6 (column-38 rule: exactly 14 bytes from column 25, `cursorY` unchanged, `cursorX <= cols-1`, row below untouched). |
| 5 | upper bank folds to uppercase, no bank flip | T2 tests 2 and 3; T5 test 2 (`$41-$5A`, none in `$C1-$DA`), test 5 (mid-file `$8E`/`$0E` flip encodes the same token two ways), and the "no `$0E`/`$8E` emitted" invariant test. |
| 6 | values inherit the art's pen and reverse | T5 test 7 (`colorRam` is VIC 2, screen codes have bit 7 set, no colour or `$12`/`$92` byte in the span); T2 test 3. |
| 7 | `~SP` restored for PETSCII | T8 `~SP` resume test, all five assertions (two payloads; bank/cursor/pen/reverse continuity; per-file gate; no `\x1b`/`0x0A`; `0xA0` survives `trim()`). |
| 8 | `~WX` skipped, colours map to the VIC pen table | T8 `~WX` test (no wipe frames, no literal `~WX` bytes); T5 test 8 (`~c1|` → `$1C`); T8 `~b2|` test (`$02 $1E`, `background === 5`, full repaint). |
| 9 | `~SS_`/`~SR_` resolve `.seq` siblings first | T7 tests 2 (both exist → `.seq` wins), 3 (`.TXT` fallback takes the ANSI path) and 8 (three resolver cases incl. `001.logoff.seq` → `001.logoff.txt`); T1 (GREEN at T7) with its non-empty-art assertion. |
| 10 | `~CC_` chains run through the same display path | T7 test 4 (`processCommand` called once with the right code) and test 5 (document order: art / include / art in three payloads). |

No GAP rows: every decision names at least one automated assertion, and every
assertion lives in a named file — `tests/petscii/seq-mci.test.ts`,
`tests/petscii/ascii-to-petscii.test.ts`,
`tests/handlers/mci-dispatch-ansi-pin.test.ts`,
`tests/handlers/mci-pre-passes.test.ts`,
`tests/handlers/petscii-wipe-off.test.ts`,
`tests/handlers/petscii-bytes-transport.test.ts`.
