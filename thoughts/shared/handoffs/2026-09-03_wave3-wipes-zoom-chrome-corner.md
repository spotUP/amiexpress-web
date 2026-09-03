---
date: 2026-09-03
topic: "Wave 3 - screen wipes, terminal zoom, door chrome, the C64 corner cell, MultiTop's bulletins"
tags: [screens, wipes, terminal, zoom, petscii, c64, kernal, theme, chrome, doors, sdk, 68k, amigafs, landing]
status: implemented
---

# Wave 3: the wipes, the window, the chrome, the corner, and the bulletins

Landed on `main` as **2c709ad60** - 53 commits cherry-picked from
`feat/installed-door-link`. Main's SHAs differ from the branch SHAs quoted
below; the branch is the authoritative history for this session's work.

## Task(s)

Nine tasks, all sysop-reported against the live board or found while proving
one of the others:

1. "most of the wipe anims are buggy", then "they flicker a lot" - the ten
   `~W*` screen wipes.
2. "the petscii mode is not centered like the normal term" - the PETSCII
   canvas session was pinned to the top-left corner.
3. Terminal ZOOM, then the rework: "it makes more sense if it follows the
   browser window and i can override and scale it down" / "it needs to scale
   flush - it has padding now".
4. "input doesnt work in phreakwars" - and the same defect found in
   `ncurses-pong` while writing that up.
5. "almost none of the doors that use it has the full chrome with the animated
   slashes and glitches etc - fix it, only colors makes no great theme".
6. BUGS at 40x25 on a C64: rows painted twice, tails left behind
   (`ashboard` after `Search Bugs`).
7. `Bulletins/bull1.txt` keeps ending up 0 bytes.
8. "add the wipe command to all artist made screen files".
9. Land all of it on `main` (branch is never merged - cherry-pick only).

## Critical References

The load-bearing spots, by `file:line`:

- **Wipes as delta frames** -
  `web/backend/src/utils/screen-wipe.util.ts:439` `renderGridDelta(previous,
  next)`, called at `:500`; the attribute-completeness rule for filler cells at
  `:534`; the one-clear invariant documented at `:922`. Playback at
  `web/backend/src/handlers/screen.handler.ts:2466-2506` (one `socket._directEmit`
  per frame, `Math.max(16, frame.delay)`).
- **Terminal zoom** - `packages/terminal/src/utils/terminal-zoom.ts`:
  `FIT_TO_WINDOW = 1` at `:43`, `MIN_ZOOM_FRACTION`/`MAX_ZOOM_FRACTION` at
  `:54-55`, the descending preset ladder at `:67`, `clampFraction` at `:121`,
  `zoomedFontSize(fitFontSize, fraction)` at `:142`, `isZoomWheel` at `:154`,
  `dragZoom` at `:242`, storage at `:265`/`:285`.
- **The page-side refit** - `web/frontend/src/pages/TerminalPage.tsx:153`
  `refit()`; it calls the ONE fit search `fitFontSize`
  (`web/frontend/src/components/mobile/terminal-fit.ts`) at `:199`, multiplies
  once at `:209` (`zoomedFontSize(fitted, zoomFractionRef.current)`), and is
  re-run by the ResizeObserver at `:307`. The fraction state is at `:101`, the
  effective size at `:127`.
- **The one chrome call** - `sdk/engines/ui/theme/chrome.ts:589`
  `attachDoorChrome(theme, options)`; `GlitchSource` (element OR a function
  resolved per tick) at `:489-492`; the option at `:534`. **The pinned glitch
  target** is `:659-685`: the getter is resolved ONCE per glitch, so a glitch
  repairs the pane it damaged rather than whichever pane is on screen when the
  timer comes back.
- **The C64 corner idiom** - `sdk/petscii/ansi-to-petscii.ts:329` routes a
  printable destined for (39,24) to `printAtBottomRight` at `:386`; the
  `'held'`/`'wrapped'` latch is documented at `:145`. `settleWrap` at `:463`
  and the no-emit `ansiCursor()` at `:476`; the settle set (`A B C D E F G d J
  K X` only - never SGR, never `ESC 7` / `CSI s`) is applied at `:613`, with
  `ESC M` / `ESC D` at `:560`/`:564`.
- **The KERNAL-faithful oracle** - `sdk/petscii/petscii-machine.ts`: the insert
  count `$D8` at `:80`, the E745/E829 guard that paints a control byte as a
  reversed glyph while the count stands at `:122`, the E699-E69D pay-down at
  `:162`, `insertChar` (with the E7F2 fullness test) at `:339`,
  `openSpaceOnScreen` (E965, which really scrolls) at `:369`, and the
  80-character logical-line cap `lineCanGrow` at `:206`.
- **The 68K case hole** - `web/backend/src/utils/amigafs.ts:373`
  `createsOnOpen(flags)` (understands the NUMERIC `O_CREAT` mask FileHandle
  passes, not just `'w'`/`'a'`), used at `:409`.
  `web/backend/src/amiga-emulation/api/FileHandle.ts:159` now opens through
  `amigafs.openSync`, and `DosLibrary.ts:3298` (`SetFileSize`) likewise.
- **The SDK ESM marker** - `sdk/package.json` `build:esm` writes
  `sdk/dist-esm/package.json`. On `main` (1f8fb60a0) that marker is
  `{"type":"module","sideEffects":false}`, generated from the root's own
  `sideEffects` declaration; pinned by `sdk/tests/unit/theme-esm-runtime.test.ts:38`.
  **The branch still carries the old two-line marker** - `cd sdk && npm run
  build:esm` after main comes back into the branch, or every door bundle built
  there is fat.

## Recent Changes

50 commits on `feat/installed-door-link`, by wave. (Main carries these as 53:
the same 50 plus three landing fix-ups.)

### Screen wipes (5)
- `900b9993b` make the wipe animations paint the screen they were given
- `9ed53eafc` stop the wipes flickering - one clear, then delta frames
- `700744ec2` complete attribute state for wipe filler cells, guard the dropped clear
- `934a8c38d` data(screens): every conference menu opens with a screen wipe
- `6d1f6b499` data(screens): the guest logon and time-limit art screens wipe in

### Terminal: centring, zoom, ground (7)
- `8663c7a55` centre the fixed-mode terminal box for real - a PETSCII session was pinned to the corner
- `b5577d4a6` a real zoom for the fixed 80x25 screen - the cell size, not a transform
- `e50b444fc` drop the last dead Tailwind classes, and keep the phone's terminal at the top
- `5841a1171` the page ground is black
- `ab58d2d24` the screen follows the browser window, and the viewer overrides it
- `9c3401338` a P session that hides the xterm screen keeps its bezel
- `da2b39b54` re-fit the moment a door hands the screen back, and drop a dead ref

### Door input - the awaited `onStart` (4)
- `83f125aff` phreakwars: let go of onStart so the SDK installs the door's input handler
- `30fbc0496` phreakwars: await the close call, and name the 80-column test for what it drives
- `3ad6128f3` ncurses-pong: let go of onStart so the SDK installs the door's input handler
- `8f129c610` ncurses-pong: make stop() a no-op once the game has finished

### Theme chrome - SDK entry point, 16 doors, then the review wave (29)
SDK: `3fd1e78b5` (`attachDoorChrome`), `99e37f948` (lazy glitch target).
Doors, one per commit: `4b34060a2` doors-menu, `af60f4da9` theme-picker,
`660bbf90e` bbs-dashboard, `0fdbbb708` bug-tracker, `8a418e00c` rip-browser,
`5647fc3e8` door-manager, `0ba984f07` neo-blessed-showcase, `be833b811`
voice-chat, `2b690d5a2` header-dropdown-demo, `e77764759` livechat,
`dd2d7d0ed` whip, `740fe7308` ansi-editor, `3d4394cb2` sprite-editor,
`5c162f693` card-lobby. Tests: `1028b90ff` (repo wiring pin), `af2f147d0`
(card-lobby's driven masthead).
Review wave: `7e0a4786d` (a glitch repairs the pane it damaged, `GlitchSource`
typed - eight `as any` gone, and the type then caught two real `unknown`
leaks), `b4b408060` (voice-chat's rail stops when the line drops), `a594b0a9c`
(rip-browser hint pin), `164cc6f0b` (rip-browser stopped shipping its tests in
dist), `21cfdd387` (bbs-dashboard's 40-column gate pinned), `441a982ca`
(`FooterPaints` names the three members), `785f5ce07` / `7dc94bafa` /
`384a57869` (glitch casts dropped), `02fa252c2` (card-lobby does not replay the
draw-in on resize), `0527d29d3` (bug-tracker pins + an honest claim).

### PETSCII: the corner cell and the KERNAL (3)
- `52e8b8db4` a blessed door's bottom-right cell no longer scrolls the C64
- `20f8ea3a9` make the oracle KERNAL-exact, then prove the corner idiom on it
- `fda71c91d` stop the cursor at column 0, and settle the wrap only where it moves

### 68K file handles (2)
- `b5701ad3a` open door file handles through the case-insensitive amigafs layer
- `b3e1536b8` route SetFileSize through amigafs and stop `r+` taking the create branch

### Landing fix-ups (main only)
- `1f8fb60a0` the ESM marker repeats `sideEffects`
- `c33ce52ea` `Node<n>/BBSTITLE.txt` exempt from the wipe pin; CARD LOBBY's
  40-column chrome test asserts stillness
- `2c709ad60` ncurses-pong imports the ncurses engine by its source path

## Learnings

- **The wipe grid parser was not a screen model.** `parseAnsiToGrid` kept the
  last `...m` per cell and DROPPED every other escape, so CUF/CUP/CNL/EL/ED/
  DECSC and SGR accumulation were all lost: up to 903 wrong cells in a final
  frame. One fix (a real cursor + full attribute state + materialised motion)
  repaired all ten wipes instead of ten patches. Separately, blinds never
  revealed their odd strips, spiral was column-major and took 0.5-1.4 s of
  BLOCKING cpu, radial swept 0-360 when its pivot could only reach 90-270, and
  the typewriter's `line += 2` dropped the last row of an odd-height screen.
- **Every wipe frame cleared the screen.** 2-26 clears per wipe, each followed
  by a full 2.5-10 KB repaint, delivered through the CLIENT-side modem emulator
  (`packages/terminal/src/utils/modem-emulator.ts`) which needs 110-430 ms for a
  frame that wants 40. Not reordering - `processQueue` is a strict FIFO -
  LATENCY: frame N+1's clear landed in a paint of its own with its repaint
  queued behind it, and the screen was blank in between. Fixed by one clear on
  frame 0 and cursor-addressed delta runs after it (2-26 clears -> 1; e.g.
  radial 75460 bytes -> 13910).
- **The padding around the terminal was xterm's cell rounding and a 960px
  cap**, not CSS: `body`, `.terminal-page` and the frame were already flush.
  The cap existed to stop a constant-sized black box stretching across an
  ultrawide viewport; once the cell size is fitted to the window the box is
  exactly as wide as the screen it holds, so the cap could only clip. `Math.round`
  in `zoomedFontSize` cost up to 0.5px of cell = 40px of grid, and dpr-2 cell
  rounding up to ~40px per axis - both now absorbed into the bezel
  (`slack/2`), and the zoom is a FRACTION of the fit, never a second size.
- **The terminal package has no Tailwind.** `BBSTerminal.tsx` centred its
  fixed-mode wrapper with `className="flex items-center justify-center"`;
  `web/frontend` ships no Tailwind dependency, config or directive, and it is
  the package's only consumer, so those class names resolved to nothing and the
  C64 canvas sat at 0,0 with 320px of ground beside it. xterm only looked
  centred because the page shrink-wraps it in a `fit-content` host - and a
  space-filling canvas cannot be shrink-wrapped (a `fit-content` frame plus a
  `width:100%` canvas is a fixed point: the canvas measures the box it just
  produced). Pinned now by
  `web/frontend/src/test/no-tailwind-utility-classnames.test.ts`.
- **PHREAKWARS and ncurses-pong never returned from `onStart`,** so the SDK
  never installed the input handler. `sdk/src/core/Door.ts:118-131` runs every
  start handler to completion and only then `runInputLoop` - the ONLY assignment
  of `bbsSession.doorInputHandler`, the one property both live routers call
  (`socket-handlers.ts:779`, `index.ts:1238`). Both doors held `execute()` open
  for their whole life while registering an `onInput` that only the
  non-blocking lifetime makes live, so every keystroke fell into the
  `door:input` dead-drop. Dead on every surface - xterm, telnet and PETSCII
  canvas - since the SDK 2.0 refactor; the C64 walk is simply where somebody
  finally opened them. Twelve other doors hold `onStart` open legitimately:
  they install the handler themselves first (blessed-helpers, `DoorInputManager`
  or `ctx.input`).
- **The lazy glitch target repaired the wrong pane.** A glitch is a read, a lie
  and a repair; when the target was resolved separately for the damage and for
  the repair, a door that rebuilds its content pane between the two had the
  damage written to one element and the repair to another. The getter is now
  resolved once per glitch and pinned for the paired write.
- **blessed writes (39,24) and the KERNAL scrolls.** `Screen._diff` iterates to
  `bufWidth-1`/`bufHeight-1` and the first render sets every `lastBuffer` cell
  to `[-1,'\x00']`, so the bottom-right cell is emitted on the FIRST frame of
  every 40x25 blessed door. xterm defers the wrap; the KERNAL really wraps and
  really scrolls, so the C64 sat one row above what blessed believed and every
  later diff repaint addressed a row that now held its neighbour - the doubled
  row, the `ashboard` tail, the stray block. The corner idiom, written against
  ROM (E691/E716/E745/E829/E697/E7F2/E965/E8EA, fetched not remembered):
  `$14` DELETE (never scrolls) - the glyph at (38,24) - `$9D` - the DISPLACED
  cell's attributes - `$94` INSERT (provably the plain-shift branch, because the
  DELETE left (39,24) blank) - the displaced glyph, the ONE printable that pays
  the insert count back - the stream's own attributes.
- **CCGMS is the target, and it is more forgiving than the ROM.** CCGMS Future
  hands every received byte to stock CHROUT and then zeroes `$D4`/`$D8`
  (`quote_insert_off`); CCGMS's 80-column driver reimplements the same rule;
  SyncTERM's PETSCII mode is row-local with no insert count and no scroll. An
  idiom written for the strict raw KERNAL is safe on all three, and degrades
  gracefully (a client ignoring `$94` leaves the corner blank, not corrupt).
  **Quote mode `$D4` is deliberately NOT modelled** (controller decision,
  2026-09-03): CCGMS clears it per byte, the web canvas is our own machine and
  must behave like CCGMS here, so modelling `$D4` would make the canvas WRONG
  for any door that prints a double quote.
- **`bull1..5` are MultiTop's output, and the case-insensitive shim was
  bypassed.** `batch1` runs `doors:multitop/mtop ... bbs:bulletins/bullN.txt` at
  every logoff; `Open(MODE_NEWFILE)` truncates first and the door then takes
  ~6 s to write 23 chunks back, so a backend killed inside that window leaves a
  0-byte or torn bulletin. That half is authentic AmigaDOS, not an emulator
  defect. The real defect was next to it: `FileHandle.open()` used raw
  `fs.openSync` on the unresolved path while every other DOS entry point uses
  `amigafs` - `FileManager` even logs "(EXISTS)" one line before handing over a
  path raw fs cannot find. On the Linux container `/app/bulletins/` does not
  exist (`Bulletins/` does), so **live had never regenerated its bulletins**.
  `amigafs.openSync` also only understood the STRING write flags, so switching
  FileHandle over without `createsOnOpen` would have ENOENT'd every new file.
- **The dist-esm marker shadowed `sideEffects`.** `sdk/dist-esm/package.json` is
  the nearest package.json for every built ESM file, so its bare
  `{"type":"module"}` hid the root's `sideEffects: false` and esbuild kept the
  whole widget set for a door that imports one name: NEO-BLESSED-SHOWCASE's
  browser bundle went 13 KB -> 792 KB, LIVECHAT 403 -> 638, CARD LOBBY 608 ->
  1390. `build:esm` now writes the marker FROM the root declaration.
- **The landing fix-ups, and what they say about main.** (a) main has no
  `typesVersions` mirror and pins that absence
  (`tests/petscii-frame/frame-package-export.test.ts`), resolving deep SDK
  imports by walking the source tree - so ncurses-pong had to import
  `engines/ui/ncurses` by its source path, with the exports map gaining that
  subpath for the runtime. (b) main carries `Node<n>/BBSTITLE.txt` copies that
  open `~SMO1|` like the shared title screen, so the art-screen wipe pin exempts
  them for the same reason (a wipe switches the authored slow-motion reveal
  off). (c) main folded CARD LOBBY's menus into one, so at 40 columns the title
  fits where the branch's test assumed it could not; the test now asserts what
  actually matters - **nothing moves at 40** - and accepts a still title or the
  theme's mark.

## Artifacts

Ledgers (gitignored, under `.superpowers/sdd/`):

| ledger | what it holds |
|---|---|
| `2026-09-03-screen-wipes/progress.md` | the defect table per wipe, the byte/latency tables before and after, three RED runs |
| `2026-09-03-terminal-zoom/progress.md` | where a cell size comes from, the padding audit, the fit-to-window rework, seven RED mutants |
| `2026-09-03-petscii-centering/progress.md` | the measured box rects (cases A-E), why the page cannot frame a canvas |
| `2026-09-03-phreakwars-input/progress.md` | the discriminating probe, the two SDK door lifetimes |
| `2026-09-03-ncurses-pong-input/progress.md` | the same defect, plus the sweep proving no door is left with it |
| `2026-09-03-theme-chrome/progress.md` | the 15-door audit table, the rollout table, the review wave |
| `2026-09-03-petscii-blessed-repaint/progress.md` | the capture, the defect table D1-D4, the KERNAL ROM quotes, the CCGMS reading, waves 2 and 3 |
| `2026-09-03-mtop-bull1-writes/progress.md` | the log forensics, the headless repro, the raw-fs survivor list |
| `2026-09-03-wipes-on-art/progress.md` | all 219 art screens with a verdict each; 43 changed |

Reviews' verdicts:
- Theme chrome came back with one BLOCKING (the glitch repaired the wrong
  pane), four IMPORTANT and four MINOR - all folded in, each with a RED proof.
  Two voice-chat tests were THROWN AWAY for passing on broken code (a destroyed
  blessed screen reports empty content for every read) and replaced by a write
  counter armed at capture time.
- PETSCII wave 2 came back **NEEDS FIX**: the shipped idiom was wrong against
  the ROM (it emitted control bytes after `$94`, which the insert count paints
  as reversed glyphs) and `insertChar` had no fullness test. Wave 3's review
  then found backspace at column 0 and, through the reviewer's differential
  fuzz (now a 4000-case seeded test), two more settle defects: `ESC 7` / `CSI s`
  and SGR must NOT settle the wrap.
- ncurses-pong's review raised a symptom that turned out not to happen
  (`endwin()` already returns ERR when uninitialised); the pin is named for the
  cross-layer invariant it actually holds rather than passed off as a
  regression test.
- The bug-tracker chrome claim was corrected in the suite itself: BUGS is ESM
  against a CommonJS SDK and reads `import.meta.url`, so neither jest nor tsx
  can stand in front of its module graph. What is proven is the gate, the
  wiring and the glitch target - and the suite now says so.

Memories written this session: `subagents-on-opus` (every Agent call passes
`model: "opus"`), `terminal-package-no-tailwind`,
`bulletins-are-multitop-output`, and the **one-invocation rule** added to
`private-index-commit` (read-tree, add, `diff --cached --stat`, commit and
`show --stat` must all be in a SINGLE Bash call, with the parent resolved from
the ref just read and passed as `update-ref`'s old value).

## Next Steps

1. **The sysop's walks**, in this order: the zoom (fit-to-window, the three
   gestures, the ladder home); the wipes on the conference menus and on the art
   screens that gained a code (`Screens/Logon24hrs.txt`, `Node<n>/guestlogon.txt`);
   BUGS at 40 columns on a real C64 or a web `P` session; and the chrome in each
   of the 16 doors at 80 AND at 40 (at 40 nothing may animate).
2. **The client-side wipe pacing bypass** (queued, `packages/terminal`): the
   modem emulator drip-feeds wipe frames at real modem speeds (bps 0 = a
   230400 soft cap, 64-byte text chunks, `sleep(5)`). A wipe bypass or a
   "frame" marker on the client is its own task - `packages/terminal` was busy
   with the zoom.
3. **The shared run-differ debt.** `renderGridDelta`
   (`screen-wipe.util.ts:439`) is `renderDiff`
   (`sdk/petscii/frame/frame-render.ts:41`) line for line on a different cell
   model. The attribute-agnostic run differ belongs in a SHARED module -
   neither `sdk/petscii` (cells are VIC indices) nor `web/backend/src/utils`
   (the SDK cannot import it) - parameterised by "how does a cell state reach
   the wire" and "which cells may not be painted". Until then a fix to the run
   walk has to be made twice.
4. **The raw-fs-on-a-door-path survivors** - same defect class as
   `FileHandle.open()`, an AmigaDOS path reaching plain `fs`/`path` with no case
   resolution. **Fix `RexxSupportLibrary.resolveAmigaPath()`
   (`web/backend/src/amiga-emulation/api/RexxSupportLibrary.ts:304-324`) FIRST**
   - it is the shared entry point the other AREXX call sites go through. Then
   `RexxSupportLibrary.ts:69,99,116,134,152,156`, `RexxArpLibrary.ts:50,54,117,
   135-139`, `xim/data-query.ts:786`, `DoorMessageHandler.ts:2383,3049,3054`,
   `DosLibrary.ts:3679-3680`.
5. **Quote mode `$D4`** in `petscii-machine.ts` - declined deliberately (see
   Learnings). Revisit only if a real caller reports it: it would have to be
   modelled as CCGMS does it, not as the bare ROM does.
6. **TAB under reverse video** in the transducer: it walks a tab by PRINTING
   spaces and re-asserts `ansiReverse`, so under `ESC[7m` the skipped cells come
   out as solid blocks where `frame/ansi-screen.ts` leaves them untouched.
   Pre-existing, a different class from the deferred wrap, kept out of the fuzz
   alphabet for that reason.
7. **The SSH/telnet parity audit LAST** - after everything above has been walked
   on the web surface.

## Other Notes

- **The session limit hit at ~03:05 and killed six agents mid-flight.** The
  repaint fix wave had `sdk/petscii/petscii-machine.ts` half edited; art wipes,
  the MultiTop write-loss investigation and three reviews restarted from
  scratch. The local backend went down with the killed restart command. If a
  wave's ledger and its tree disagree, the ledger is the older of the two -
  re-measure before resuming. Related: three deploy runs earlier in the day
  burned all five retries on the host's anonymous git fetch, which fits GitHub
  rate-limiting unauthenticated traffic from that host IP; the workflow now
  authenticates with its own short-lived token and keeps the anonymous fetch as
  a fallback.
- **`Conf.DB` must not be swept into anybody's commit.** It reads as modified in
  this shared tree from door runtime drift, and it was one of the four files
  left as found after the 2026-09-02 `git stash --keep-index` incident (81
  files of three sessions' in-flight work stashed; 77 restored with
  `git checkout stash@{0} -- <file>`; `Bulletins/bull6.txt`, `Conf.DB` and two
  grandmaster files had changed again under a concurrent session in the
  meantime). `stash@{0}` is KEPT as the safety net - never drop it, never
  `stash pop` in this tree. Commit by path through a private index, and read
  `git diff --cached --stat` before every commit.
- **Never restore `Bulletins/bull*.txt` as if it were damage** - see the
  `bulletins-are-multitop-output` memory. A modified bulletin is normal; a
  0-byte one means a backend was killed inside MultiTop's ~6-second write.
- The branch's `sdk/dist-esm/package.json` is still the pre-fix marker. Run
  `cd sdk && npm run build:esm` before rebuilding any door's browser bundle on
  the branch, or ship a fat one.
