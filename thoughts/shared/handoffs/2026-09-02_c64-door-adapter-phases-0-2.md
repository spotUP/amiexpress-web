---
date: 2026-09-02
topic: C64 door adapter Phases 0-2 landed
tags: [petscii, c64, doors, sdk]
status: final
---

# C64 door adapter - Phases 0-2 landed

## Task(s)

Phases 0-2 of the strategy `thoughts/shared/plans/2026-09-02-c64-door-adapter.md`,
executed against the implementation plan
`thoughts/shared/plans/2026-09-02-c64-door-adapter-impl.md` (Tasks 1-7) on branch
`feat/installed-door-link` in a shared working tree.

- Phase 0 - width honesty: a PETSCII session's door sees 40 columns
  (`BB_SCRWIDTH`, `lineWrap`), an ANSI session stays byte-identical at 80.
- Phase 1 - `FrameReconstructor`: an 80x25 cell grid replayed from a door's raw
  ANSI stream, plus `renderDiff`, the minimal ANSI that repaints a 40x25 frame
  through `AnsiToPetsciiTransducer`.
- Phase 2 - the 80-to-40 rule ladder (`crop` / `gutter` / `reflow` / `split`)
  with row classification, region pins and scroll-up overflow, pinned against a
  corpus of real 68K door captures.

Phase 3 (package export, backend re-export, emitter wiring) is NOT started.

## Critical References

- `sdk/petscii/frame/types.ts` - `Cell` / `Cursor` / `Frame`, `padRow`, `isBlank`.
- `sdk/petscii/frame/ansi-screen.ts` - `FrameReconstructor` (`write`,
  `snapshot`, `dirtyRows`, `cursor`).
- `sdk/petscii/frame/frame-render.ts` - `renderDiff`, `renderFrame`, `cupTo`.
- `sdk/petscii/frame/classify.ts` - `classifyRow`, `looksLikeAsciiArt`,
  `positionsCursorAbsolutely`, `contentWidth` (verbatim port of
  `web/backend/src/utils/ascii-art.util.ts`).
- `sdk/petscii/frame/adapt.ts` - `adaptRows` / `adaptFrame` (screen-level API),
  `cropRow` / `gutterRow` / `reflowRow` / `splitRow`, `isCroppable`,
  `chooseRule`, `RegionPin`.
- `sdk/petscii/frame/index.ts` - the frame barrel (Task 7).
- `sdk/petscii/wrap.ts` - `wrapLineToWidth`, the wrap `reflowRow` builds on.
- `web/backend/src/amiga-emulation/xim/screen-width.util.ts` - `doorScreenWidth`,
  the one function three backend sites call.
- `web/backend/tests/petscii-frame/classify-parity.test.ts` - the SDK-vs-backend
  classifier pin, now also driven over every captured fixture line.
- `sdk/tests/petscii/frame/fixtures/manifest.json` - how each fixture was
  captured (binary, command, stdin script).
- Strategy: `thoughts/shared/plans/2026-09-02-c64-door-adapter.md`.
  Implementation plan: `thoughts/shared/plans/2026-09-02-c64-door-adapter-impl.md`.
  Ledger: `.superpowers/sdd/2026-09-02-c64-door-adapter-impl/progress.md`.

## Recent Changes

- `58daaeb65` feat(xim): BB_SCRWIDTH and lineWrap answer the session width for
  PETSCII callers - ANSI callers byte-identical at 80. **Carries a production
  bug fix**: `handleScreenDimensions` wrote the width and then `reply(msg, 1)`
  overwrote the same offset, so every 68K door was told WIDTH/HEIGHT/LEFT/TOP = 1.
- `56dfecb34` feat(petscii): FrameReconstructor - an 80x25 cell grid replayed
  from a door's ANSI stream with xterm deferred wrap.
- `dfab96dc3` feat(petscii): FrameReconstructor erase, SGR into VIC indices,
  save/restore, alternate screen and string sequences.
- `0e0731485` feat(petscii): FrameDiffRenderer - minimal ANSI for the
  transducer, proven cell-for-cell through the KERNAL oracle.
- `b61e4c9ec` test(petscii-frame): pin run coalescing with an exact-string
  assertion; header no longer asserts a background model.
- `b10399ea7` feat(petscii): row classifier for the C64 rule ladder - verbatim
  port of the backend art/positioning heuristics, pinned equal.
- `82f5518d6` test(petscii): classify parity - todo the fixture test until
  Task 7, pin the artChars branch.
- `ce89cdd69` feat(petscii): the 80-to-40 rule ladder - crop, gutter, reflow,
  split with region pins and scroll-up overflow.
- Task 7 (this handoff): captured 68K door corpus, corpus invariants, the frame
  barrel, and the fixture-coverage half of the parity test.

## Learnings

- **Deferred wrap / the newline trap.** A character printed in column 79 does
  not move the cursor to the next row; it latches a pending wrap that the NEXT
  printable resolves. A newline arriving while that latch is set must not
  advance twice, or an 80-wide line eats a blank row. `FrameReconstructor`
  models the latch explicitly; CR clears it.
- **The (39,24) cell.** Painting the bottom-right cell of a 40x25 screen scrolls
  a real terminal. `renderDiff` paints it last and re-homes with `cupTo`, and
  the oracle round trip pins that trap.
- **Gutter reports as split when it falls through.** `gutterRow` first tries to
  squeeze a table by collapsing runs of gutter spaces; if the squeezed row still
  does not fit it defers to `splitRow`, and `RuleResult.applied` then reads
  `'split'`, not `'gutter'`. Triage that reads the requested rule instead of the
  applied one will chase the wrong function.
- **`RuleResult.map` returns a `RuleCursor {row, x}`** - `row` is an OFFSET into
  the rows that one rule produced, not a screen row. `adaptRows` adds the base
  index to make a real `Cursor`. Region pins select a RULE, never a screen
  position; `adaptFrame`'s tail-paging (keep the last 25 rows, cursor follows)
  is the only positional policy in the ladder.
- **Split has no continuation glyph.** The strategy asked for a marker at column
  39 of a split half. It is deliberately omitted: a marker either displaces cell
  39 onto a third row or drops a character, and both break the invariants the
  corpus pins ("<= 40 cells", "split keeps every cell"). A marker is a pack
  option for Phase 4, not a property of the ladder.
- **Reflow's row boundary IS whitespace.** The first draft of the corpus test
  joined a reflowed row's output rows with no separator and reported a wrap bug
  that did not exist (`hststat` row 9: `"...(return"` / `"for current) :>"`).
  The honest invariants are the whitespace-squeezed character stream (always)
  plus the word list joined with a space (only when no source word is wider than
  the screen, because `wrapLineToWidth` hard-splits those).
- **Fixtures are bytes.** The captures are UTF-8 re-encodings of Amiga Latin-1
  output (`©`, `ø`, `÷`, `ß`, 0x7F glyphs). They were written by shell
  redirection and `cp` only - an editor that round-trips UTF-8 destroys the
  high-bit bytes. Verified: all eight decode as valid UTF-8 with zero U+FFFD.
- **The harness runs from `web/backend`, not the repo root.** There is no
  root `tsconfig.json` any more, so `npx tsx web/backend/src/scripts/run-amiga-door.ts`
  from the repo root dies with "Parameter decorators only work when experimental
  decorators are enabled". `dev/scripts/door-corpus/run.ts` still spawns with
  `cwd: REPO_ROOT` and would hit the same wall.
- **The corpus door binaries are not in the tree.** `1cdddac24`
  ("chore(doors): remove corpus-installed junk") deleted them. To re-capture:
  `git archive 1cdddac24^ Doors/AEHelp Doors/ColorWall Doors/Hststat
  Doors/KdConfStats Doors/RATIOREP Doors/SiX-Status Doors/Super-Stats Doors/who
  | tar -x -C .`, capture, then remove the eight directories again.
  `Doors/TurboLister` is tracked in HEAD - do NOT delete that one.

## Artifacts

- `sdk/tests/petscii/frame/fixtures/*.ans` (8) + `manifest.json` - raw ANSI
  captured from real 68K doors through `run-amiga-door.ts`, each verified
  against `dev/scripts/door-corpus/goldens/<id>/output.txt` modulo the clock.
- `sdk/tests/petscii/frame/corpus.test.ts` - 32 cases, the Phase 2 invariants
  over every frame of every fixture.
- `web/backend/tests/petscii-frame/classify-parity.test.ts` - SDK/backend
  classifier parity, now including per-fixture coverage.
- `sdk/petscii/frame/index.ts` - the barrel Phase 3 will export from the package.

## Next Steps (Phase 3, in order)

1. Add `./petscii/frame` to `sdk/package.json` `exports` (and the `typesVersions`
   map if the package still carries one), so the backend can import the barrel
   by package path instead of a relative source path.
2. Make `web/backend/src/utils/ascii-art.util.ts` re-export the SDK's
   `classify.ts` instead of holding a second copy, then collapse
   `classify-parity.test.ts` from a two-copy pin to a re-export pin.
3. Cross-check the wrap: `reflowRow` (cells, SDK) against
   `web/backend/src/utils/wrap-for-session.util.ts` `wrapForSession` (strings,
   backend) on the shared sentence/break inputs, once that file lands from the
   full-canvas plan's Task 10. They must break identically or a door's text
   moves when it crosses layers.
4. Emitter integration: drive `FrameReconstructor` from the door's output
   stream and flush an `adaptFrame` + `renderDiff` on the quiet gap and on the
   input-wait tick (not per byte), so a PETSCII caller sees whole frames.
5. AREXX: `BB_SCRWIDTH` for AREXX doors is still a hard 80; fold it into the
   40-column plan the same way `doorScreenWidth` did for XIM.

## Other Notes

- The optional ninth fixture `turbolister` was captured and REJECTED: two runs
  of the same script produced 343 and 537 bytes, so it is not deterministic
  (its corpus entry has no golden for exactly that reason). It is a real lister
  and worth revisiting when its input timing is understood.
- `cplistan`, named by the strategy, is not installed under `Doors/` and is not
  in `dev/scripts/door-corpus/corpus.json` at all. The eight captured doors
  replace it and cover every rule and every non-blank row class.
- `gutter` is exercised by exactly one fixture (`aehelp`, the two-column help
  table). Every other capture's tables reach 80 columns with no collapsible
  gutter run and fall through to `split`. If Phase 3 changes `gutterRow`, that
  one fixture is the whole corpus signal - the unit cases in
  `sdk/tests/petscii/frame/adapt.test.ts` carry the rest.
