---
date: 2026-09-07
topic: GWALL masthead / border and ctop empty-conference banner at 40 columns
tags: [petscii, c64, adapt-ladder, gwall, ctop, conftop, 40-columns, sysop-report]
status: draft
---

# GWALL's banner, GWALL's border, ctop's message

Commit: **`c15ac53b1`** on local `main`, NOT pushed. Seven files, all under
`sdk/petscii/frame/`, `sdk/tests/petscii/frame/` and
`web/backend/tests/petscii-frame/`. Nothing under `src/`.

Two of the three faults are DONE and pinned. The third (ctop's message) is DONE.
The fourth thing asked for - a verdict on ctop's column header - is a verdict,
not a fix, and it is below.

---

## 1. The three faults, in his words, with the cells

Both doors were re-driven before anything was changed, from
`web/backend`, with `BBS_DATA_DIR=$REPO` (without it the door silently captures
~108 bytes):

```
printf '%s\n' '4000 \r' '8000 \r' '12000 q\r' \
  | env BBS_DATA_DIR=$REPO npx tsx src/scripts/run-amiga-door.ts \
      $REPO/Doors/GWall/GWall 1 --doortype XIM --command GWALL --timeout 25
```

Both came back **byte-identical to their pinned fixtures** (gwall 1840 bytes
sha `085cd26c…`, ctop 1349 bytes sha `6a89543d…`), so
`sdk/tests/petscii/frame/fixtures/{gwall,ctop}.ans` ARE the live captures and
nobody needs to re-drive the emulator to reproduce any of this.

### Fault 1 - "its wrapped in two lines with an ugly linebreak in the middle of a word"

BEFORE (`adaptRows`, 40 columns, gwall source row 1):

```
.- - ---_\/_--÷G÷L÷O÷B÷A÷L÷--÷T÷H÷E÷R÷M÷
O÷N÷U÷C÷L÷E÷A÷R÷--÷W÷A÷L÷L÷--÷V÷1÷ß÷--.
```

AFTER:

```
.- - ---_\/_--÷G÷L÷O÷B÷A÷L÷--÷
T÷H÷E÷R÷M÷O÷N÷U÷C÷L÷E÷A÷R÷--÷W÷A÷L÷L÷--÷
V÷1÷ß÷--.
```

### Fault 2 - "the vertical blue pipes are still cut"

BEFORE (gwall source rows 2 and 4, the header and the first comment):

```
!cOMMENt\/\/                 hANDLE¡bBS!
...
This site now has links to 3000 Amiga
bbs doors                     -REbEL¦WWW
```

AFTER:

```
cOMMENt\/\/                   hANDLE¡bBS
...
This site now has links to 3000 Amiga
bbs doors                     -REbEL¦WWW
```

### Fault 3 - "ctop needs to shorten the no top uploaders are available in this conference message it wraps"

BEFORE (ctop source rows 10-12):

```
 4.
 5.            - NO UPLOADERS ARE
AVAILABLE IN THIS CONFERENCE -
 6.
```

AFTER:

```
 4.
 5.
- NO UPLOADERS ARE AVAILABLE IN THIS
CONFERENCE -
 6.
```

---

## 2. What I measured, and where the brief's framing was wrong

**The `+`-separator theory (fault 1) was RIGHT in substance and wrong in the
character.** The brief said the separators are `+`. In the real capture they are
`÷` (U+00F7); `+` is what the PETSCII transducer paints them as on the glass.
Nothing hinges on it - the guard is the same either way - but a search for `+`
in the fixture finds nothing.

**The half-box theory (fault 2) was WRONG, and this is the important one.**
The brief said: "Today's `record` rung drops an enclosing box border only for a
SINGLE-CELL boxed record; a wall row has two fields plus the box, so it does not
qualify and the box survives into a row that cannot hold it."

It does qualify. GWALL's comment rows are `|message … -handle¦BBS|`, and the
separator between handle and BBS is `¦` (U+00A6), **not** `|`. `recordFields`'
`interior` scan looks for `'|'`, finds none, so `bordered` is TRUE and the box
is dropped from BOTH ends. Measured on the real capture and confirmed all the
way to the KERNAL oracle (`PetsciiMachine`): every comment row reaches the glass
as `-REbEL¦WWW` flush at column 39 with **no pipe at either end**. There was no
surviving closing pipe to slice.

What the sysop was actually photographing is that same box-dropped state, and
`¦` renders on a C64 as a vertical bar - so his "a blue `|`" is the
handle/BBS separator, and "the closing pipe is sliced off" is the box's right
edge being absent. The reason it reads as damage rather than as a decision is
that **GWALL draws ONE wall with FIVE different glyph pairs**:

| source row | pair | rung | what the caller saw |
|---|---|---|---|
| 1 top rule + banner | `.` … `.` | split | both (closing `.` on the last split row) |
| 2 column header | `!` … `!` | record | **both, flush at column 39** |
| 3 separator rule | `¦` … `¦` | crop | opening only |
| 4-14 comments | `\|` … `\|` | record | **neither** |
| 15 footer | `` ` `` … `'` | narrow | opening only, `>`-marked |

`recordFields` named the literal `'|'`, so exactly one of the five was
recognised. The header kept its right edge and the fifteen rows under it did
not: one right edge on the screen and none below it. That is the fault.

**"A row must never show one pipe of a pair" as a universal rule was measured
and REJECTED** - see §4.

---

## 3. What changed, and its state

All three are DONE, gated and pinned. `sdk/petscii/frame/adapt.ts` only.

1. **`wordSpans` + `splitRow`'s sever test** (fault 1). A word is a maximal run
   of alphanumerics that may be LETTER-SPACED: ONE non-blank,
   non-alphanumeric character between two alphanumerics is inside the word; two
   or more in a row are a real gap. A cut severs when it lands strictly inside
   such a word.
2. **`chooseRule` asks the lossless `deindent` before a `crop` that drops a
   glyph** (fault 2, the half-box part that can actually be removed). Same
   principle already used for `stat`-before-`record`: where two rungs both
   match, the one that loses nothing wins.
3. **`recordFields` recognises the box RAIL the row uses** (fault 2, the
   mismatched-edges part) - a named set `['|', '¦', '!']`, same glyph at
   both ends, no other occurrence of it inside.
4. **New `banner` rung** (fault 3): an ATOM, one run of padding, and a SENTENCE
   the door positioned beside it, together wider than the screen. The atom keeps
   its own row AT ITS OWN COLUMN (so slot 5 still lines up with 4 and 6) and the
   sentence is de-indented to column 0 and reflowed under it.

### Tests added (named as he would say them), all RED-proved

`sdk/tests/petscii/frame/adapt.test.ts`, three describes driven with the SOURCE
ROWS the doors really paint, copied out of the captures byte for byte:

- `the wall's banner` › **does not break inside a word** (+4 more)
- `a comment row` › **never shows half a box** (+2 more)
- `the empty-conference banner` › **does not collide with the numbered list** (+4 more)

`sdk/tests/petscii/frame/corpus.test.ts`: the **FOLD invariant is widened to
letter-spacing**, so fault 1 is now a property over every frame of every
fixture rather than one example. It previously asked for two alphanumerics
either side of the break, which is exactly the hole the masthead walked through.

RED proofs, each mutation applied alone to `adapt.ts` and reverted:

| mutation | red |
|---|---|
| sever back to alnum-both-sides | `the wall's banner` ×4, corpus fold invariant (gwall), gwall row pin |
| lossy `crop` before lossless `deindent` | `a comment row › keeps a box the row can hold whole`, renderDiff byte pin |
| box rail back to `'\|'` | `a comment row` ×2, corpus record invariant (gwall), renderDiff byte pin |
| `banner` unreachable from the ladder | `the empty-conference banner`, ctop + conftop row pins, renderDiff byte pin |

### Pins moved, each with the reason inline; three were RECORDING THE DEFECT

- `corpus.test.ts` `EXPECTED_ROWS`: **gwall 30 → 31** (recording the defect),
  **ctop 31 → 32** (recording the defect), **conftop 32 → 33** (recording the
  defect).
- `corpus.test.ts` record/box check: `/^\|[^|]*\|$/` → the rail set. **Recording
  the defect** - it is why the header kept its `!`.
- `frame-render-corpus-pin.test.ts`: six hashes - `avhbc`, `conftop`, `ctop`,
  `gwall`, `pager5d`, `rtw`. The other 23 untouched.
- `web/backend/tests/petscii-frame/i-can-see-the-top-of-the-global-wall.test.ts`:
  window census 30/26/1 → 31/27/2 and 30/26/5/1 → 31/27/6/2.
- `web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`: the same
  rail generalisation as the corpus copy.
- `fixtures/manifest.json`: notes for `gwall`, `ctop`, `conftop`. **No fixture
  bytes moved** - the captures are untouched and their sha256 pins still pass.

### One cost, recorded in the test rather than hidden

A GWALL caller **with pausing turned OFF** now loses the word `GLOBAL` off the
top of the window. The whole word costs one adapted row, the wall is 27 painted
rows on a 25-row screen, so two rows fall off the top instead of one and the
second is the `GLOBAL` row. A caller who leaves pausing on walks the page and
sees every row. `i-can-see-the-top-of-the-global-wall.test.ts` asserts exactly
which two rows are dropped, so the trade cannot silently get worse.

---

## 4. What I rejected, and why

**Do NOT re-widen the sever guard to "both non-blank".** It was narrowed to
alphanumeric-on-both-sides deliberately, because "both non-blank" backs away
from DECORATION, which carries no word, and the row it spends comes out of
content: it cost `doorrepo` its title row and `ulist` a user record. What
shipped is **strictly narrower** than that: a SINGLE decoration character
flanked by alphanumerics is letter-spacing, TWO OR MORE are a gap. That keeps it
off a rule of dashes (no alphanumeric at all), off the `--` separators inside
the very banner it fixes, and off `… ) - © 1994`. Measured: **exactly one source
row in all 29 fixtures moves, and no row anywhere changes rule.**

**"A row must never show one pipe of a pair", applied universally: REJECTED,
measured.** Corpus-wide, **139 distinct source rows** show one member of an
enclosing pair after adaptation, and **18** of those are rows with alphanumeric
content. Two variants were measured:

- *content rows only*: makes `pager5d`'s inner box WORSE. Row 4
  (`| Please enter your page reason: … |`) would lose its rail while rows 3, 5,
  6 and 7 (pure rules, no alphanumeric) keep theirs - a new half-box where there
  was a consistent left rail.
- *all 139 rows*: shears `olm`'s ASCII art
  (`    .--°(   |   ) |¯¯| ._.  |°---…`) and removes the only cue that
  `pager5d`'s and `kd_confstats`' rows are inside a box. A 79-column box cannot
  show both edges at 40; the opening glyph is the last evidence the row is boxed.

What survives of the idea is the part that costs nothing: where a LOSSLESS
`deindent` would have shown BOTH rails and a lossy `crop` was asked first, the
order is now fixed and the box comes back whole. `pager5d`'s outer box,
`avhbc`'s rule, `rtw`'s footer.

**Amending `reflowRow` to eat the interior gutter (fault 3): REJECTED.**
`reflowRow` consumes `wrapLineToWidth` and nothing else, and
`adapt.test.ts` pins `reflowRow == wrapLineToWidth` so the door adapter and the
session's own prose wrap cannot drift. Teaching the wrapper to eat a gutter
moves bytes on every 80-column session.

**Sending fault 3 to the existing `gutter` rung: REJECTED.** It produces
` 5. - NO UPLOADERS ARE AVAILABLE IN THIS` / ` CONFERENCE -`, and a slot number
immediately followed by a sentence reads as that slot's CONTENT.

---

## 5. Rule-change census (all 29 fixtures, every frame)

Method: `chooseRule(cells, 40)` for every non-blank source row of every frame of
every fixture, plus `adaptRows(f).rows.length` per frame, dumped to a file
before and after and diffed; then the same for the full adapted ROW TEXT.
Scripts are in this session's scratchpad (`probe.ts` census/show, `dump.ts`,
`orphan.ts`, `banner.ts`, `pairs.ts`, `hdr.ts`) - trivially rewritten, they just
`require()` the SDK sources by absolute path and run under `web/backend`'s
`tsx`.

Baseline rule counts: crop 4448, narrow 1711, record 639, split 505, reflow 315,
stat 197, deindent 168, prose 58.

| change | fixtures that move rule | fixtures whose ROW TEXT moves | row-count change |
|---|---|---|---|
| letter-spaced sever | **none** | `gwall` (1 source row) | gwall +1 |
| lossless `deindent` first | `avhbc` (2 rows), `pager5d` (4), `rtw` (1), all `crop`→`deindent` | same 7 rows, all strictly better | **none** |
| box rail generalised | **none** | `gwall` (1 source row, the header) | **none** |
| `banner` rung | `ctop` (1 row), `conftop` (1 row), `reflow`→`banner` | same 2 rows | ctop +1, conftop +1 |

Every row that moved, verbatim:

```
- pager5d  |    .-----------------------------------   →  |.--------------------------------------.
- pager5d  |    |       5D_Page v0.01 by sNoW !        →  ||       5D_Page v0.01 by sNoW !        |
- pager5d  |    | Registered to:     Public version    →  || Registered to:     Public version    |
- pager5d  |    `-----------------------------------   →  |`--------------------------------------'
- avhbc    |                       =================   →  |==============================
- rtw      |                                      -    →  |- -- --- ---- -------------------------'
- gwall    |!cOMMENt\/\/                 hANDLE¡bBS!   →  |cOMMENt\/\/                   hANDLE¡bBS
```

The `renderDiff` byte pin moved on **exactly the six fixtures the census named**
(`avhbc`, `conftop`, `ctop`, `gwall`, `pager5d`, `rtw`) and no others, which is
the cross-check: the census sees only WHICH rung took a row, the hashes see the
bytes.

The measurement that named the `banner` rung's guards: the shape alone (one
interior gutter, atom left, prose right, does not fit, does not deindent)
matches **84** rows; adding "neither half is ART by the frozen detector" and
"`record` is asked first" and "a gutter squeeze would not fit it" takes it to
**exactly 2** - `ctop` and `conftop`'s message. 82 of the 84 were `rtw`'s
half-painted menu rows.

The measurement that named the rail set: the only non-alphanumeric END PAIRS
that reach `record` anywhere in the corpus are `!`…`!` (gwall's header),
`|`…`|` (six_status) and `[`…`'` - and the last is `games`' `[ARCL] The
Arcadian Legends … Hackin' Crackin'`, which is a bracket and an apostrophe with
no box in sight. Same-glyph-from-a-named-set excludes it; "any two
non-alphanumerics" would have eaten it.

---

## 6. The `ctop` header verdict

**Unfixable as a positional header, same class as WarOLM's - and the reason is
structural, not a tuning problem.**

The door writes:

```
No# Username (Handle)       Location (Group)         Files Uploaded Bytes
===-=======================-========================-=====-==================
```

The **ruler defines FIVE fields**. The **header groups SIX labels into THREE
gutter-separated clusters** (`No#` and `Username (Handle)` are one space apart,
so are `Files` and `Uploaded`; only the padded gaps are gutters). No rung can
put a label over the column it names, because the header's cluster boundaries
are not the table's field boundaries. Nothing about the ladder can fix that.

What each rung does with it, measured:

```
record (today)  |No# Username (Handle)       Location    |
                |(Group)             Files Uploaded Bytes|
narrow          |No# Usernam> Location (Gr> Files Upload>|
gutter          |No# Username (Handle) Location (Group)  |
                |Files Uploaded Bytes                    |
```

`record` keeps **every character**. `narrow` truncates three labels and deletes
`Bytes` outright, which is a heading lost. `gutter` reads marginally better than
`record` (no label split across the row break) but reaching it needs the ladder
to decline BOTH `record` and `narrow` on a per-row basis, i.e. to know that this
row is a HEADER - which is cross-row context the ladder does not have, and
inventing it for one fixture row is a per-door pack, not a rung. **So: leave it
at `record`, which is the best of them.** No change shipped.

**Should `ctop` keep `C64_ADAPT=40`? Recommendation: YES, keep it** - with the
reasoning written out so you can overrule it:

- Unmarking does not give the caller a better header. It removes the adapter
  entirely, and the C64 terminal then folds all 80 columns of **everything** -
  the totals row, the two Top Uploader rows, the numbered list. The header gets
  no better and the rest gets much worse.
- Unlike WarOLM, ctop's remaining content is complete and correct at 40. The
  totals row and the two `Top Uploader` rows are the reason the `stat` rung
  exists.
- The header cannot MISLABEL a column while the table is empty, which it is on
  this board. The moment a conference has uploads, the data rows narrow to five
  or six fields under a three-cluster header and the header does start to lie.
  **That is the trigger to revisit**, and if the sysop's rule is absolute -
  "I would rather unmark a door than ship one whose headings lie about which
  column is which" - then the consistent call is to unmark, and this is his
  decision, not mine.
- There is a third option and it is probably the right one: **synthesise a
  header** (§7).

---

## 7. Next steps, ordered

1. **The sysop's own idea, and it may supersede §6 and part of WarOLM's
   unmarking: synthesise a NEW 40-column header** for doors whose original
   cannot survive the squeeze. We know where the columns are (the door's own
   ruler row gives the field boundaries exactly), so we can write a correct
   40-column label row instead of squeezing someone else's 80-column one. That
   is a **per-door pack** (Phase 4 of the strategy plan), not a ladder rung.
   Weigh this BEFORE writing another rung. It is very likely the real answer for
   WarOLM's header and possibly for `ctop`'s, and it would let both doors keep
   their mark honestly.
2. **Re-drive GWALL against the sysop's live wall** if a comment ever arrives
   whose text contains a literal `|`. That would make `interior` true,
   `bordered` false, and the box would survive into the row - the one case where
   the brief's original theory of fault 2 WOULD be the real mechanism. The
   guard is deliberate (a multi-cell box row must not be read as one message
   plus a field) so this is a "watch for it", not a bug.
3. **Decide the `¦` on gwall's separator row and the `` ` `` on its footer.**
   Both are still orphan opening glyphs. Both are decoration rows and §4 says
   leave them; if the sysop still reads the wall as half-drawn, the next step is
   NOT the universal rule (measured, rejected) but a per-door pack that suppresses
   the wall's box entirely.
4. **`pager5d`'s INNER box** (source rows 2-8, indent 0, 61 columns wide) still
   crops to a left rail with no right. Unlike its outer box, deindent cannot save
   it. Same judgement as (3).

### Traps hit tonight

- **`BBS_DATA_DIR=$REPO` is mandatory** when driving a door from
  `web/backend`, or the capture is ~108 bytes of nothing.
- **One emulator at a time**, use the harness's own `--timeout 25`. Never
  `subprocess.communicate(timeout=…)`.
- **`sdk` has no `tsx`.** Run probe scripts from `web/backend` with
  `npx tsx <abs path>` and `require()` the SDK sources by ABSOLUTE path.
- **Give jest your own `--cacheDirectory`** and check the SUITE COUNT, not just
  the absence of FAILs - some backend suites boot the real server and
  `process.exit(1)`. `tests/petscii tests/petscii-frame` prints one such
  `process.exit called with "1"` line and still reports 28/28 passed; that line
  is not a failure.
- **`sdk/dist` is gitignored** but the build must still be run (`cd sdk && npm
  run build`) before the backend suites, or they test yesterday's SDK.
- Known reds NOT from this work: `livechat-panel-borders`,
  `bug-tracker-theme-applies`, `theme-chrome-wiring`, `bulletin-reflow-drive`,
  `sysop-page-wait`, `user/auth-handler`, `ansi-art-detect`,
  `bbs-config-round-trip`, `tests/guards/live-data-guard`.

### Gates, all green at `c15ac53b1`

| gate | result |
|---|---|
| `cd sdk && npm run build && npx jest --testPathPattern=petscii` | **20 suites / 785 tests, 0 failed** |
| `cd web/backend && npx tsc --noEmit` | **exit 0** |
| `npx jest … tests/petscii-frame tests/petscii` | **28 suites / 570 tests, 0 failed** |
| `npx jest … tests/doors` | **143 of 146 suites; the 3 reds are the known theme ones** |
| the eight identity suites | **11 suites / 240 tests, 0 failed** |
