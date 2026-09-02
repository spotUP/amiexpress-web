---
date: 2026-09-02
topic: An index of every MCI code, and a builder that inserts them correctly
tags: [screens, admin, mci, express-e, ansi-editor]
status: implemented
---

# The ask

> "do an index of all available mci and other codes that can go into screen
> files and build an mci code builder/editor/inserter"
> "some mci codes have arguments cc_doorname etc we need a door picker for
> those etc"

# What is actually there - measured, not assumed

**express.e knows 98 codes.** `processMciCmd()` (express.e:5258-5768) is 90
`StrCmp(cmd, ...)` arms covering 98 distinct spellings, because some arms carry
two (`LG`/`ON`, and every `b<n>`/`z<n>` pair):

```
#  ~  A  AK  b0..b7  BD  BR  c0..c7  CA  CC_  CD  CF  CL  CN  CR  CR_  CT  D
DB  DT  f  FC  FD  FF  FL  FU  h  HW  IN  LC  LG  M  MB  MD  ML  MN  N  n1..n9
ND  NS  OD  ON  OT  P  q  RN  S  SC  SD  SM_  SMC  SMO  SP  SR_  SS_  SU  SX_
TC  TL  TR  TT  UB  UL  VD  VE  w  x  y  z0..z7
```

**This port implements all of them**, plus two extensions of its own (`~XC_`
command queue, `~XI` silent XIM door launch). The dispatch lives in
`parseMciCodes()` (`web/backend/src/handlers/screen.handler.ts:309`) as three
maps - exact (`userInfoDispatch`, line 629), prefix (`prefixDispatch`, line 754,
the `x`/`y`/`w` family) and the inline sentinel emitters.

**The board uses six of the 98.** Counted over every screen file under this
board's node, conference, `Screens` and `Bulletins` directories, `~~` blanked
first exactly as the parser does:

| code | uses | files | with a width prefix |
|---|---|---|---|
| bare `~` on line 1 | 587 | 587 | - |
| `~f` clear screen | 383 | 303 | 0 |
| `~SP` pause | 345 | 179 | 0 |
| `~SS_<file>` include | 252 | 99 | 0 |
| `~CC_<cmd>` run command | 188 | 121 | 0 |
| `~SR_<file>` random | 121 | 121 | 109 |
| `~CL.` conference list | 42 | 42 | 0 |
| `~N` user name | 2 | 2 | 0 |
| `~SMO` / `~SMC` slow-mo | 2 | 2 | 0 |

**That gap is the whole point of this work.** Ninety-two codes the board can
run, that nobody uses, because nothing tells a designer they exist. `~TR` (time
remaining), `~SU`/`~SD` (upload/download sizes), `~CN` (conference name), `~x<n>`
(cursor to column) are all live and all invisible.

**The enabling tilde.** `parseMciCodes` only runs at all when the file's FIRST
LINE starts with `~` (screen.handler.ts:1943). 587 files carry it. Insert a
perfect `~CC_gwall|` into a file that does not, and it prints as text. Any
inserter that ignores this ships a feature that silently does nothing - the
exact failure this handoff's through-line warns about.

# The design

## Argument kinds - what a picker has to offer

Sorting the 98 by what follows the code is what makes a builder possible:

| kind | codes | the picker |
|---|---|---|
| no argument | 80 of them - `~N`, `~f`, `~SP`, `~q`, `~c0`..`~c7`, `~n1`..`~n9`, ... | none; click inserts |
| a BBS command | `~CC_`, `~XC_` | **the door/command picker** - `Commands/BBSCmd/*.info`, each with the `NAME` the board calls it |
| a screen path | `~SS_`, `~SX_`, `~SR_` | the screen picker - the index already enumerates every screen file, with its scope |
| a door path | `~XI` | the installed-door picker |
| a menu name | `~SM_` | the menu picker |
| free text | `~CR_<prompt>` | a text field |
| a number | `~x`, `~y`, `~w`, `~SMO` | a number field with the unit named |
| a terminator char | `~D<char>` | a single character, and a loud warning: it changes parsing for the REST of the file |

Plus the width prefix - `~20N|` truncates to 20 columns - which applies to every
value-producing code and is the one thing that keeps a substitution from
destroying a framed layout. 109 of this board's 121 `~SR_` uses carry one, so
the board's own authors already work this way.

## Single source of truth

Three places already describe MCI codes: the dispatch in `screen.handler.ts`,
the four reference patterns in `screens/mci-references.ts`, and the tokenizer's
header prose. A catalog is a fourth, and a fourth copy is how the sysop gets
told something untrue.

So: **the catalog carries metadata only** - name, argument kind, description,
express.e line, whether this port implements it - and a test proves it against
the RUNNING dispatch rather than against a list. `mci-references.ts` keeps
owning the four reference patterns; the catalog names them, it does not re-parse
them.

# Phases

## Phase 1 - the catalog, and a test that it is true

New: `web/backend/src/screens/mci-catalog.ts`

```ts
export type MciArgument =
  | { kind: 'none' }
  | { kind: 'command' }        // ~CC_, ~XC_ - Commands/BBSCmd
  | { kind: 'screen' }         // ~SS_, ~SX_, ~SR_
  | { kind: 'door' }           // ~XI
  | { kind: 'menu' }           // ~SM_
  | { kind: 'text'; label: string }
  | { kind: 'number'; label: string; min?: number; max?: number }
  | { kind: 'char'; label: string };

export interface MciCode {
  /** The code as typed, without the leading tilde: 'N', 'CC_', 'c4'. */
  code: string;
  /** One line a designer can act on. Never the express.e symbol name. */
  summary: string;
  family: 'user' | 'system' | 'conference' | 'files' | 'colour' | 'layout'
        | 'flow' | 'include' | 'extension';
  argument: MciArgument;
  /** True when a width prefix (~20N|) changes the output. */
  takesWidth: boolean;
  /** Where it lives in express.e, or 'web' for this port's extensions. */
  source: string;
  /** What this board does with it today, filled by the census script. */
  usesOnThisBoard?: number;
}

export const MCI_CATALOG: MciCode[] = [ /* 98 + 2 entries */ ];
```

New: `web/backend/tests/screens/mci-catalog.test.ts` - the drift guard, and it
must exercise the real path:

1. Build a probe string of every catalog entry with a plausible argument.
2. Run it through the exported `parseMciCodes()` with a stub session.
3. Assert no catalog code comes back as its own literal text. A code that falls
   through unsubstituted is either missing from the dispatch or misspelt in the
   catalog, and either way the reference page would lie.
4. Assert the reverse direction too: every key in the three dispatch maps has a
   catalog entry. This one needs `parseMciCodes` to expose its keys - add
   `export function mciDispatchKeys(): string[]` beside it, built from the same
   object literal, so there is no second list to drift.

Automated verification: `cd web/backend && npx jest --config
dev-scripts/jest.config.ts --rootDir . tests/screens/mci-catalog.test.ts`, and
`npm run typecheck:tests`.

Manual verification: none. This phase has no UI.

Success: the catalog cannot describe a code the board does not run, and the
board cannot run a code the catalog does not describe.

## Phase 2 - what the pickers need

The command picker is the one the sysop named. `Commands/BBSCmd/*.info` is
already read by `commandName()` in `screen-index.service.ts` - the icon carries
the `NAME` the board shows. Extend, do not duplicate:

- `GET /api/screens/mci/catalog` returns `MCI_CATALOG` with this board's usage
  counts filled in.
- `GET /api/screens/mci/targets?kind=command|screen|door|menu` returns the
  choices for one argument kind: for `command`, every `BBSCmd/*.info` with its
  `NAME` and access level; for `screen`, the index's file list; for `door`, the
  installed doors; for `menu`, the menu names on the board.

Both in `web/backend/src/api/screens-routes.ts`, beside the endpoints that
already serve this page.

Automated verification: a route test asserting `kind=command` returns `gwall`
with `NAME` "Global Wall" from the fixture icon, and that an unknown `kind` is a
400 rather than an empty list a sysop would read as "no doors installed".

Manual verification: open the endpoint and check the door list matches
`/admin/doors`.

Success: every argument kind in the catalog has a live source of choices, and
none of them is a hardcoded list.

## Phase 3 - the reference page

`/admin/screens` gains a "Codes" view: all 98, grouped by family, searchable,
each row showing the code, the summary, what it does on THIS board (the usage
count, so `~SP` reads as "used in 179 files" and `~TR` as "never used here"),
and whether it takes a width.

`web/config-app/src/pages/screen-index-view.ts` already renders the metadata
table; this is another section of it, not a new page.

Automated verification: a view test that the colour family lists 16 entries
(`c0`-`c7`, `b0`-`b7`) and that `z0`-`z7` are shown as aliases of the `b` set
rather than as eight more codes.

Manual verification: read the page and confirm nothing in it is a surprise.

Success: a designer can find `~TR` without reading express.e.

## Phase 4 - the inserter

In `web/config-app/src/components/ScreenEditor.tsx`, beside the existing
`SmileyPicker` - which is the pattern to copy, not to reinvent: a categorised
palette with an `onSelect` that inserts at the cursor.

New: `web/config-app/src/components/MciPicker.tsx`

- Families as tabs; codes as a grid.
- A code with an argument opens its picker before inserting - the door picker
  for `~CC_`, the screen picker for `~SS_`.
- A width field for codes where `takesWidth` is true, defaulting to empty.
- The inserted text is assembled in ONE place, `buildMciToken(code, arg, width)`
  in `web/config-app/src/pages/screen-mci.ts`, so the terminator rule (`|` after
  an argument, nothing after a bare code) lives once.

Two safety rules, both from the measurement:

1. **The enabling tilde.** If the file's first line does not start with `~`, the
   inserter says so and offers to add it, because without it the code is text.
   This is a checkbox in the dialog, not a silent rewrite.
2. **Placement.** Inserting mid-art shifts every column to its right. The
   inserter defaults to the line above the art or the line below it - the same
   head/tail model measured for the upload carry
   (`2026-09-02_mci-codes-and-the-upload-that-wipes-them.md`) - and inserting at
   an arbitrary cursor position inside art warns first.

Automated verification: unit tests on `buildMciToken` - a bare code emits `~f`,
an argument code emits `~CC_gwall|`, a width emits `~20N|`, and a width on a
code whose `takesWidth` is false is refused rather than emitted.

Manual verification (the sysop's, and only the sysop's): insert `~CC_` with the
door picker into a real screen, save, and press the key on the board.

Success: the code that comes out of the picker is the code the board runs.

# What this plan does NOT do

- It does not add codes. Every entry is one express.e already dispatches.
- It does not touch `parseMciCodes`'s behaviour; the only change there is
  exporting its key list.
- It does not solve the middle-of-file placement problem from the upload note.
  The inserter warns; it does not reflow art.


# Implemented, 2026-09-02

All four phases are on `land/callers-art`. What the plan did not know when it
was written, all of it found by a test rather than by reading:

- **Seven codes had the wrong terminator in the first catalog.** `~CL` `~CD`
  `~ML` `~MD` are recognised only with a PERIOD and `~SM_` `~SX_` `~XC_` only
  with a DOUBLE pipe. `MciCode.terminator` exists because of that, and
  `buildMciToken` is the one place that knows it.
- **"The tilde is gone" proves nothing.** express.e's scanner eats the tilde
  whether or not the code matched, so the first drift test passed on codes the
  parser has never heard of. It compares against the fall-through now.
- **The editor already had an insert bar** - four hardcoded templates in
  `MCI_INSERTS`, typing `~CC_command|` for a sysop to correct by hand. The
  picker REPLACED it rather than sitting beside it.
- **The editor is a fixed grid that overwrites**, so the plan's text-level
  `insertMciToken`/`withEnablingTilde` helpers had no caller. They were
  replaced with canvas-level ones the editor actually calls; the text-level
  versions belong to the upload-carry work, not here.
- **`express.e:5292` cannot appear in the UI** -
  `no-source-citations-in-ui.test.ts` forbids it, and the first draft of the
  "Defined in" column would have failed. It says "AmiExpress" or "This board
  only" now.
- The status token is `status-warn`, not `status-warning`.

Verification as run: 109 catalog tests, 9 route tests, 19 view tests, 10 editor
tests (three of them new and driving the picker through the page), the whole
config-app suite at 363, the backend screens suites at 283, and both
typechecks - the backend's four errors are the pre-existing baseline
(`tone`, `c64-detected-handler`).

Not done, and deliberately: the middle-of-file codes still cannot be placed
automatically, and nobody has driven the picker by hand on the live board.
