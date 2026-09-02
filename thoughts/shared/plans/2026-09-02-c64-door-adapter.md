# C64 Door Adapter — 68K/ANSI door output preprocessed for 40-column callers

> Status: STRATEGY PLAN (user idea 2026-09-02: "preprocess 68K door output for C64s ... smartly
> reduce to 40 columns ... help out with custom 40-col logos"). Research done (hook points below);
> task-level breakdown follows the full-canvas run. Depends on: full-canvas plan (transducer +
> canvas surface) landing first.

**Goal:** make every door usable on a 40x25 C64 screen — automatically where output is text-shaped,
with sysop-authored "adaptation packs" where art/layout needs a human — without touching a single
68K binary, and without changing what 80-column callers see.

**Core idea (the reframe):** don't rewrite the byte stream — work on FRAMES. Reconstruct the door's
output on a virtual 80x25 screen, transform each frame 80->40 with an ordered rule ladder (pack
overrides first, mechanical rules after), then diff-render the 40x25 result through the existing
`AnsiToPetsciiTransducer` + `PetsciiMachine` oracle. A frame is a picture; pictures can be cropped,
compressed, reflowed, substituted. A byte stream cannot.

## What exists (research 2026-09-02, file:line in the report — reuse, do not rebuild)

- **Target side is done.** `sdk/petscii/petscii-machine.ts` (40x25 cell/colour oracle) +
  `sdk/petscii/ansi-to-petscii.ts` (`AnsiToPetsciiTransducer`, assumes 40-col-shaped input,
  clamps absolute moves to 40x25). The adapter's job ends when it hands a 40-col ANSI frame to it.
- **The per-session choke point is the transport:** `web/backend/src/server/connection-emitter.ts`
  `buildConnectionEmitter()` intercepts `ansi-output` / `petscii-output` / `petscii-bytes` per session
  (telnet/SSH); web sessions are transduced client-side in BBSTerminal (full-canvas Task 8). Both
  see every byte a door emits — the adapter plugs in HERE, not inside the emulator (which has ~24
  independent `socket.emit('ansi-output')` sites across xim/io.ts, DoorMessageHandler, TIM, FIM,
  AEDoor/DreamDoor libraries — no single choke there).
- **Nothing parses an incoming ANSI stream into a grid** (xterm is frontend-only; `ScreenBuffer` in
  `sdk/client/screen-buffer.ts` is a write-side buffer doors draw INTO). Frame reconstruction is the
  one new core component.
- **Cheap levers already wired:** `bbsSession.lineWrap` (XIMProtocol.ts:139) feeds `wrapLine()` for
  non-art, non-positioned text lines — set to 40 for PETSCII sessions and plain text already reflows;
  `looksLikeAsciiArt()` / `positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`)
  are ready-made frame classifiers.
- **Width reporting to doors:** `BB_SCRWIDTH` is hardcoded 80 (`xim/bbs-info.ts:372-375`); DOOR.SYS
  has page length (rows, session-derived) but NO width field in either dropfile format. Width-aware
  doors (rare) can only learn 40 via `BB_SCRWIDTH`.
- **Capture harness exists:** `web/backend/src/scripts/run-amiga-door.ts` runs a door headless with
  scripted stdin (`<delayMs> <bytes>` lines) and writes the verbatim ANSI stream to stdout;
  `dev/scripts/door-corpus/corpus.json` + `corpus-integration-runner.ts` already diff captured output
  against goldens. This IS the pack authoring + verification tool, nearly for free.
- **Registry:** `.info` tooltypes parse generically into `Door.toolTypes` (door.handler.ts:4137, read
  at launch ~:2827) — `MIN_COLUMNS` / `C64_PACK` need no schema change.
- **Input side is done:** PETSCII keystrokes become ASCII/ANSI at the transport (index.ts:1180) before
  `door:input` reaches any 68K door (sdk/petscii/petscii-input.ts).

## Architecture

```
door ANSI (80-col) --> [1] FrameReconstructor (80x25 cells: char, fg, bg, attrs; cursor)
                   --> [2] Adapter rule ladder (per frame, per door pack)  --> 40x25 cells
                   --> [3] FrameDiffRenderer (40x25 cells -> minimal ANSI for the transducer)
                   --> AnsiToPetsciiTransducer -> PETSCII bytes -> real C64 / PetsciiCanvas
```

1. **FrameReconstructor** (`sdk/petscii/frame/ansi-screen.ts`): a small VT parser in the style of
   `PetsciiMachine` — CSI cursor moves, SGR (fg/bg/bold/reverse), ED/EL/ECH, CR/LF/BS/TAB, wrap at
   80, scroll; cell = {ch, fg, bg, rvs}. Frame boundaries: a render tick (~16-50ms quiet gap, or an
   explicit flush on a pause/prompt/JH_HK input wait — the emulator already knows when a door blocks
   for input). Doors that redraw constantly still produce discrete frames per tick.
2. **Rule ladder** (`sdk/petscii/frame/adapt.ts`), applied top-down, first match per REGION wins:
   1. **Pack override** — fingerprint match (hash of a normalized region: chars only, colours
      stripped, whitespace collapsed) -> substitute a sysop-authored 40-col region (from `.seq`, or
      40-col ANSI/PETSCII art). This is where "remake the logo in 40" lives.
   2. **Crop** — if columns 40-79 are blank (or only a repeated border char), keep 0-39.
   3. **Gutter compression** — rows that look tabular (`looksLikeAsciiArt`-negative, 2+ column runs of
      >=2 spaces): collapse gutters to 1 space; if still >40, drop the widest low-information column
      (pack can pin which).
   4. **Reflow** — prose rows: word-wrap at 40 (the full-canvas Task 10 choke point, same code).
   5. **Split** — wide art/table rows that survived: row -> two rows, continuation glyph at col 39.
   6. **Viewport (last resort)** — positioned UIs that cannot be reduced: present a 40-col pane of the
      80-col frame with pan keys (C64 cursor left/right + a key to toggle halves). Ugly but USABLE —
      the difference between "gated" and "playable".
   Rule choice is per region and can be pinned per door by the pack (e.g. "rows 0-5 = pack logo;
   rows 6-23 = gutter-compress; row 24 = crop").
3. **FrameDiffRenderer**: 40x25 target cells -> minimal ANSI (cursor-address + changed runs), fed to
   the transducer which already dedups colour/reverse and drives the oracle. Coalesces bursty
   repaints (blessed/68K doors repaint whole screens; the SDK's slow-link differential renderer is
   the precedent).
4. **Width honesty for doors that ask:** `BB_SCRWIDTH` returns `session.screenWidth` (40) for PETSCII
   sessions; `bbsSession.lineWrap = 40`. Doors that respect it self-adapt and the ladder becomes a
   no-op for them.

## Adaptation packs (the "we help out" layer)

`Doors/<door>/c64/pack.json`:
```json
{ "door": "cplistan", "minColumns": 40, "mode": "ladder" | "viewport" | "native40",
  "regions": [ { "rows": [0,5], "fingerprint": "sha1:...", "replace": "logo40.seq" },
               { "rows": [6,23], "rule": "gutter" } ],
  "captures": ["captures/menu.ans", "captures/list.ans"] }
```
- `replace` art: `.seq` (PETSCII, authored in Petmate/lvllvl) or 40-col ANSI (goes through the ladder
  untouched because it already fits). The sysop makes the art; the tooling makes the fingerprints.
- Tooling (`dev/scripts/c64-pack.ts`): `capture <door>` runs the door via `run-amiga-door.ts` with the
  corpus's scripted inputs and stores frames; `fingerprint <door> <frame> <rows>` prints the hash
  for a region; `verify <door>` replays every capture through the ladder and fails on any frame that
  still has content beyond column 39 without a rule or override (= the door's 40-ok gate).
- A door with no pack gets the mechanical ladder (rules 2-6) if the sysop opts it in
  (`MIN_COLUMNS=40` in its `.info`); default stays closed (`MIN_COLUMNS=80`, from the 40-col plan).

## Honest limits

- Rules 2-5 give real results for listers, stats, menus, text UIs, most oneliner/vote/news doors —
  the bulk of a C64 caller's use. Positioned full-screen UIs (editors, games, dashboards) only get
  the viewport rule: navigable, not pretty. Games stay gated per the sysop's decision.
- Fingerprints are brittle against dynamic content (dates, counts inside a logo row) — the normalizer
  strips digits by default and packs can mask spans.
- Every "great" door costs an afternoon of art + a capture session. The tooling makes it an
  afternoon, not a week.
- Frame ticks add latency (one tick) to door output on C64 sessions only; 80-col sessions are
  byte-for-byte untouched (adapter is petsciiMode-gated at the emitter, same non-negotiable as the
  full-canvas plan).

## Phases

0. **Prereq:** full-canvas plan landed (transducer + canvas + telnet emitter). Width honesty
   (`BB_SCRWIDTH`, `lineWrap=40`) can land immediately after — it is 20 lines and helps today.
1. **FrameReconstructor + FrameDiffRenderer** in `sdk/petscii/frame/` with the machine-style test
   discipline (ANSI fixture -> grid asserts; grid -> ANSI -> re-parse round-trip). Oracle-tested.
2. **Rule ladder rules 2-5** (crop, gutter, reflow, split) + per-region pinning; corpus: 10 captured
   68K frames of each shape from the door census; assert every output row <= 40 cols.
3. **Emitter integration:** petsciiMode sessions with `doorActive` route door output through the
   adapter (telnet emitter + BBSTerminal seam); tick/flush on input-wait; 80-col byte-identity pin.
4. **Pack format + tooling** (`c64-pack.ts capture/fingerprint/verify`), `C64_PACK` + `MIN_COLUMNS`
   tooltypes read at launch, `verify` wired as the 40-ok gate; door lists mark 40-ok doors.
5. **Viewport rule (6)** + pan keys via the PETSCII input map.
6. **First packs:** the sysop's three most-wanted doors, authored together; one becomes the worked
   example in the docs.

## Decisions needed
1. Which three doors first (packs are authored around them)?
2. Frame tick: fixed quiet-gap (~30ms) vs input-wait-only flush? (Recommend both: gap for streaming
   doors, input-wait as the hard boundary.)
3. Viewport rule at launch, or gate positioned UIs until it exists?
