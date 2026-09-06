---
date: 2026-09-06
topic: C*Base as a reference for a 40-column PETSCII file listing - MCI, control codes, and the real C64 file-directory convention
tags: [c64, petscii, 40-col, cbase, mci, files, file-listing, research]
status: final
---

# C*Base, its MCI set, and what a C64 file listing actually looks like

Research for the 40-column `FR` file record. The brief pointed at
<https://cbasereferenceguide.github.io/>. That site turned out to be a signpost
rather than the evidence: the reference pages for MCI are two short tables, and
the guide documents no file-directory format at all. What it does carry is
links to **the C*Base source code**, and that source answers every question in
the brief directly.

**Evidence hierarchy used below**, strongest first:

1. **C*Base v3.3.7 source** (Tao mod, David Weinehall), `bbs.bas` (BASIC) and
   `ml0123.a65` (assembly), plus the shipped prompt file `data/text` decoded
   byte for byte. Downloaded from
   <https://cbasereferenceguide.github.io/resources/cbase/sources/tao/cbase-3.3.7-source.tar.gz>
   (listed at <https://cbasereferenceguide.github.io/resources/cbase/sources/>).
2. **C*Base Larry Mod v3.1 2023 source**, `src/larry-bbs.bpp` (BPP+ BASIC, fully
   commented) and `src/ml1.o.asm` (commented disassembly), plus the shipped
   `CTEXT` prompt file extracted from `cbaselarmod2023.d64`. From
   <https://cbasereferenceguide.github.io/resources/cbase/for-commodore64-128/larry-v3.1/cbaselarmod2023.zip>.
3. **The official C*Base v3.3 User Guide**, chapter 11 "The Prompts —
   Explanations", which documents each prompt's default content verbatim.
   <https://cbasereferenceguide.github.io/resources/cbase/manuals/cbase-v3.3-user-guide.pdf>
4. The reference guide's own web pages, where 1-3 are silent.

**On the `cbase-larrymod` GitHub org.** It holds four repositories -
`cbase-petscii-viewer`, `.github`, `bpp-plus` (fork) and
`bpp-plus-syntax-highlighting`. **None of them contains the C*Base BBS source.**
The BBS source ships as ZIP/TAR archives on the reference guide site, which is
where the source cited above came from. `cbase-petscii-viewer` is out of scope
here (another agent owns it) and has been dropped from section 5.

**A decoding note that changes how everything reads.** PETSCII `$5C` is the
**pound sign `£`**, not a backslash. Every `\Tnn` that a naive ASCII dump shows
in a C*Base prompt file is really **`£tnn` - an MCI command**. The C*Base file
listing is not laid out by hardcoded `PRINT` statements at all; it is laid out
by MCI tab commands inside a sysop-editable prompt file. That single fact ties
sections 1 and 3 together.

---

## 1. The C*Base MCI command set, in full

### 1a. What the guide documents

MCI = "Message Command Interpreter". Two families: `@` commands (sysop levels
only) and `£` commands (any user whose access group allows MCI).
<https://cbasereferenceguide.github.io/reference/mci-commands/>
(the `/reference/mci/` path in the brief does not exist; the real root is
`/reference/mci-commands/`, and its `pound-commands/` index 404s while its two
children resolve).

**Colour - `£c*`** —
<https://cbasereferenceguide.github.io/reference/mci-commands/pound-commands/color/>
"These commands change the text color for users who are not on a PETSCII machine
but want to add color to their messages… MCI commands are handled in the input
parser instead of the output routine."

| C*Base | Meaning | VIC | Ours | Note |
|---|---|---|---|---|
| `£ca` | White | 1 | `~c7` | `mci-dispatch.ts:413` ff., `PETSCII_FG_VIC` maps `~c0..~c7` to VIC 0,2,5,7,6,4,3,1 |
| `£cb` | Red | 2 | `~c1` | |
| `£cc` | Cyan | 3 | `~c6` | |
| `£cd` | Purple | 4 | `~c5` | |
| `£ce` | Green | 5 | `~c2` | |
| `£cf` | Blue | 6 | `~c4` | |
| `£cg` | Yellow | 7 | `~c3` | |
| `£ch` | Orange (Dark Purple in ANSI / 80-col) | 8 | **none** | |
| `£ci` | Brown | 9 | **none** | |
| `£cj` | Light Red | 10 | **none** | |
| `£ck` | Dark Grey (Dark Cyan in ANSI / 80-col) | 11 | **none** | |
| `£cl` | Medium Grey | 12 | **none** | |
| `£cm` | Light Green | 13 | **none** | |
| `£cn` | Light Blue | 14 | **none** | but `~q` resets *to* VIC 14, `mci-dispatch.ts:450` |
| `£co` | Light Grey | 15 | **none** | |
| `£cp` | Reverse Video On | - | **none** | we have no MCI reverse-on at all |
| `£cq` | Reverse Video Off | - | partial | `~q` emits `$92` + default pen, `mci-dispatch.ts:450` |

We reach 8 of the 16 VIC colours (including black, which `£c` cannot reach);
C*Base reaches 15 plus reverse. **10 colour codes lacking.**

**Output - `£o*`** —
<https://cbasereferenceguide.github.io/reference/mci-commands/pound-commands/output/>
"Output MCI commands are handled properly during variable column output,
ensuring that messages appear word-wrapped correctly, regardless of the length
of a variable in the MCI command list."

| C*Base | Meaning | BASIC var | Ours |
|---|---|---|---|
| `£oa` | User's handle | `na$` | `~N` (`mci-dispatch.ts:316`) |
| `£ob` | User's location | `yl$` | `~UL` |
| `£oc` | User's phone number | `pn$` | `~#` |
| `£od` | User's real name | `rn$` | `~RN` |
| `£oe` | User's access group | `gn$` | **partial** - we have `~A` (numeric level) and `~CA` (conference access string), no group *name* |
| `£of` | User's last login time | `lo$` | `~LC` |
| `£og` | Name of the last caller | `lc$` | **none** |
| `£oh` | Time of the last call | `tc$` | **none** (`~LC` is *this* user's, not the board's last caller) |
| `£oi` | Sysop availability status | `fg$` | **none** |
| `£oj` | Sysop handle | `vi$` | **none** |
| `£ok` | User's date of birth | `bd$` | **none** |
| `£ol` | Current system date | `da$` | `~DT` |
| `£om` | Current system time | `tm$` | **none** - `~CT`/`~OT` are the *logon* time (`mci-dispatch.ts` `CT`/`OT` rows), `~DT` is today's date only |
| `£on` | User's computer type | `ct$` | `~HW` (returns the literal `Web Browser`) |
| `£oo` | Last inputted line by the user | `i$` | **none** |

**7 output codes lacking, 1 partial.**

### 1b. What the guide OMITS, recovered from source

The guide has no page for the rest of the `£` set, and no page for `@` commands
at all. The complete output-side dispatch is a `CMP` chain in the Larry Mod ML,
`larry/l2023/src/ml1.o.asm:1301-1345`, each entry carrying its own comment:

```
//FREESTR / BLINPRT (MCI after Pound)
.> A728 C9 49     CMP #$49		"I" I1 - press key I0 - enter line
.> A72F C9 4F     CMP #$4F		"O" output oa - oo
.> A736 C9 54     CMP #$54		"T" tab
.> A73D C9 56     CMP #$56		"V" v0 - v9 Variables
.> A744 C9 42     CMP #$42		"B" Branch
.> A75C C9 4E     CMP #$4E		"N" normal mode
.> A763 C9 53     CMP #$53		"S" slow mode s0 - s9
.> A76A C9 50     CMP #$50		"P" punctuation mode
.> A771 C9 52     CMP #$52		"R" rainbow mode char
.> A778 C9 4C     CMP #$4C		"L" rainbow mode line
.> A77F C9 57     CMP #$57		"W" rainbow mode word
.> A78A C9 40     CMP #$40		"@"        (followed by ":" -> BASIC expression)
```

`£c` is absent from that chain because, exactly as the guide says, colour is
handled in the **input** parser instead - `ml1.o.asm:2118-2073`:

```
.> AE36 C9 5C     CMP #$5C			// "pound"
.> AE3E C9 43     CMP #$43			// "C"
.> AE45 C9 50     CMP #$50			// "P"      -> LDA #$12  (reverse on)
.> AE50 C9 51     CMP #$51			// "Q"      -> LDA #$92  (reverse off)
.> AE57 C9 41     CMP #$41			// "A"..    -> table at $E8DB indexed by (char-'A')
```

That confirms the guide's colour table from source: `£cp`/`£cq` are literal
`$12`/`$92`, and `£ca`..`£co` are a 15-entry lookup table.

| C*Base | Meaning (from source comments) | Ours |
|---|---|---|
| `£t<nn>` | **Tab to column `nn`** | **none** - the single most important gap; see §3 |
| `£i0` / `£i1` | Enter a line / press a key | **partial** - `~CR` (`mci-dispatch.ts:372`) approximates `£i1`; `~SP` pauses |
| `£v0`..`£v9` | User-definable variables | **none** |
| `£b<nn>` | Branch (conditional jump within a prompt) | **none** |
| `£n` | Normal mode (cancel slow/rainbow/punctuation) | **none** - `~q` resets colour only |
| `£s0`..`£s9` | Slow mode, per-character delay 0-9 | **partial** - `~w` exists and is a deliberate no-op (`mci-dispatch.ts`, `w:` row) |
| `£p` | Punctuation mode | **none** |
| `£r` | Rainbow mode, per character | **none** |
| `£l` | Rainbow mode, per line | **none** |
| `£w` | Rainbow mode, per word | **none** |
| `£@:<expr>:` | Evaluate a BASIC expression inline | **none** (deliberate - we have no expression evaluator) |

`£t`'s implementation is worth quoting because it constrains the layout
(`ml1.o.asm:1464-1490`):

```
// MCI Tab
.> A884 20 BB A6  JSR $A6BB		// get the two digits after pound t (tab)
...
.> A8B1 C9 2D     CMP #$2D		 (target >= 45 -> do nothing)
.> A8B5 A5 D3     LDA $D3		 (current cursor column)
.> A8B7 C5 46     CMP $46
.> A8B9 B0 0E     BCS $A8C9		 (already at or past target -> do nothing)
.> A8BB A9 20     LDA #$20		 (else emit a SPACE and loop)
```

`£t` is a **forward-only pad-with-spaces** tab. It never wraps, never truncates,
and if the preceding field has already overrun the target column it silently
does nothing and the next field simply butts up against it. That is why C*Base
caps its filenames (see §3).

### 1c. Codes we have that C*Base does not, and the collision risk

Our `~` set is far larger on the *board-statistics* side (`~TC`, `~TT`, `~M`,
`~UB`, `~DB`, `~SU`, `~SD`, `~FU`, `~FD`, `~BD`, `~SC`, `~FC`, `~FF`, `~FL`,
`~CF`, `~CN`, `~MB`, `~MN`, `~AK`, `~CC_`, `~SS_`, `~SR_`, `~x`/`~y` cursor
moves - all in `web/backend/src/handlers/mci-dispatch.ts:315-500`). C*Base
reaches equivalents through `£@:<BASIC expression>:` rather than through named
codes, which is why its named set is small.

**COLLISION - the one real trap for a C64 caller.** There is no token collision
(`~XX` vs `£xx` cannot be confused), but there is a **byte** collision, and it
cuts the wrong way:

- PETSCII `$5C` **is** `£`. Our `unicode-to-petscii.ts:49` maps the literal
  character `£` to `0x5C`, so a `£` typed into one of our screens reaches a C64
  as a visible pound sign.
- `ascii-to-petscii.ts:53` maps ASCII backslash `\` to `$2F` (`/`) precisely
  *because* "PETSCII has pound there" - so we never emit `$5C` by accident.
- Therefore a sysop who pastes C*Base prompt text (`£t14`, `£oa`, `£ce`) into
  one of our `.seq` or `.TXT` screens gets **`£t14` printed literally on the
  caller's screen**, because we interpret no `£` code whatsoever. The bytes are
  valid, the render is silent, and the result is garbage in the middle of a
  listing.
- The mirror-image trap: our `~` introducer is ASCII `$7E`, and
  `ascii-to-petscii.ts:60` maps `~` to `$2D` (`-`). A `~` that survives MCI
  substitution reaches a C64 as a hyphen, not a tilde. Nothing breaks, but
  round-tripping a screen between the two systems is lossy in both directions.

**Count: 28 C*Base MCI codes we lack** — 7 output (`£og`, `£oh`, `£oi`, `£oj`,
`£ok`, `£om`, `£oo`), 10 colour (`£ch`..`£co`, `£cp`, `£cq`), 11 undocumented
families from source (`£t`, `£v`, `£b`, `£n`, `£s`, `£p`, `£r`, `£l`, `£w`,
`£i`, `£@:`). Three more are partial (`£oe`, `£s`, `£i`).

**Worth adding, in priority order:** `£t<nn>` (a column tab is the thing that
makes a 40-column table expressible as data instead of code - see §4), `£cp`/
`£cq` (reverse video is the C64's only per-cell emphasis and we cannot reach it
from MCI at all), and the eight missing colours.

---

## 2. PETSCII control codes - discrepancies and gaps only

Baseline: `sdk/petscii/petscii-machine.ts:119-152` (the KERNAL-exact dispatch)
and `sdk/petscii/ansi-to-petscii.ts`. Codes we already handle correctly are not
restated.

Guide page:
<https://cbasereferenceguide.github.io/development/cbase-petscii-viewer/reference/petscii-control-codes/>

### 2a. `$88` (F7) - a real gap, and the source confirms the guide

The guide: "`$88` F7 - Flush row, start new row… `$88` is the F7 key code.
C\*Base uses it as a soft line break in message text - the BBS inserts it at word
boundaries to wrap long lines before sending them to the terminal."

The source proves it is not merely a viewer convention. C*Base's own output
routine `atprintmo` translates it before anything else sees it
(`src/cb337/cbase-3.3.7/src/ml0123.a65:353-366`):

```
atprintmo	sta mochrs
atprint2	jsr clrchn
		lda mochrs
		pha
		ldx #5
		jsr chkowmo
		cmp #$88		;soft cr
		beq isacr
```

`petscii-machine.ts:151` falls through to `if (PetsciiMachine.isControlCode(b))
return false; // all other controls: no-op`, so **`$88` is silently dropped by
our machine**. That is KERNAL-correct - a stock C64 does nothing with `$88` -
but it means *every* line break in a C*Base prompt file or `.seq` disappears if
we ever render one, and the whole screen collapses onto one row. Nearly every
prompt in the shipped `data/text` ends in `$88`.

### 2b. `$85`/`$86`/`$87` (F1/F3/F5) - **the guide is wrong**

The guide lists `$85`-`$87` among the "stripped codes… consumed silently and
produce no output". The source, four lines below the `$88` case in the same
routine (`ml0123.a65:355-366`):

```
		cmp #$85		;F1
		bne notlcol
		lda lcol
notlcol		cmp #$86		;F3
		bne notmcol
		lda mcol
notmcol		cmp #$87		;F5
		bne notdcol
		lda dcol
		.byte $2c
isacr		lda #$0d
notdcol		sta mochrs
```

F1, F3 and F5 are **substituted with three sysop-configurable colour registers**
(`lcol` = light, `mcol` = medium, `dcol` = dark) at output time. That is
C*Base's whole theming mechanism: a prompt written with F1/F3/F5 re-colours
itself when the sysop changes three bytes. The guide's viewer strips them, which
renders such a screen in the wrong colours; our machine no-ops them, which does
the same. Not a bug in our machine (a real C64 also ignores them), but it means
**F-key-themed C*Base art cannot be rendered faithfully by either the guide's
viewer or our machine without a C*Base-specific pre-pass**.

Immediately after that substitution, `ml0123.a65:367-372` resets the autopause
line counter on `$93` and `$13` - so on a C*Base board a clear-screen or home
also resets pagination. We have no line counter tied to those bytes.

### 2c. `$13` HOME - divergence, ours is right

Guide: stripped. Ours: `petscii-machine.ts:146` sets cursor to (0,0), which is
what the KERNAL does. Note it because a `.seq` authored against that viewer will
have been visually verified with HOME doing nothing.

### 2d. `$02` - we implement an extension the guide does not document

`petscii-machine.ts:130` treats `$02 <colour>` as the CCGMS set-background-and-
border sequence, and `$0E` additionally resets background/border to black
(`petscii-machine.ts:131-136`). Neither appears anywhere in the guide's control-
code table. This is ours and correct for CCGMS callers; recorded so nobody
"reconciles" our table to the guide's and deletes it.

### 2e. Unmapped-byte fallback differs

Guide: "Any other byte in the control range (`< $20` or `$80`-`$9F`) not listed
above is rendered as a placeholder middle-dot character (`·`)." Ours: control
bytes are no-ops, and unmapped *printable* glyphs print `?`
(`thoughts/shared/plans/2026-09-02-c64-40col-adaptation.md`). Different
philosophies - theirs makes stray control bytes visible during authoring, ours
makes them invisible. No action; recorded so a `·` in someone's viewer
screenshot is not mistaken for real content.

### 2f. No gap on colours or the row terminators

`$0D`/`$8D` and all sixteen colour codes match ours byte for byte, and the
guide's stated default foreground (Light Blue, index 14) is the same default
`~q` restores (`mci-dispatch.ts:450`, `PETSCII_DEFAULT_PEN_VIC = 14`). The
guide's colour-palette page
(<https://cbasereferenceguide.github.io/development/cbase-petscii-viewer/reference/color-palettes/>)
also names Pepto/Colodore/PALette/VICE as the palette options, which agrees with
`sdk/petscii/c64-palette.ts`.

---

## 3. THE MAIN QUESTION - how a real C64 BBS lays out a file listing

**The guide does not document C*Base's file-directory format.** There is no page
for it in `/reference/`, `/resources/` or `/development/`. Everything below is
from the source and from the official user guide, not from screenshots.

### 3a. Where the listing lives

C*Base's U/D catalogue is a **flat sequential file per directory**, `ud-<n>`,
appended to at upload time. The write is one statement,
`src/cb337/cbase-3.3.7/src/bbs.bas:3682-3684`:

```
3682	gosub73:p$=o$+"ud-"+str$(dn):o$=p$:b=2:en$=",s,a":gosub50
3684	print#8,cx:print#8,da$g$d$g$c$:print#8,(w5-bk):print#8,ds$:gosub9305:goto2
```

`g$=chr$(13)` (`bbs.bas:7241`), so `da$g$d$g$c$` writes **three** lines. One
record is therefore **five CR-terminated lines** on disk:

| Line | Var | Field |
|---|---|---|
| 1 | `cx` | the board's call number at upload (used for "new since last call") |
| 2 | `da$` | upload date, format `m/d/y` (`bbs.bas:2310`) |
| 3 | `d$` | filename, capped at 16 characters (`bbs.bas:5550`, `p$=left$(i$,16)`) |
| 4 | `c$` | file type - the literal `prg` or `seq` (`bbs.bas:3672-3673`) |
| 5 | `(w5-bk)` | size **in 254-byte disk blocks**, not bytes |
| 6+ | `ds$` | the description, free text, prefixed by the uploader's id and handle (`bbs.bas:3686`) |

The read is the mirror image, `bbs.bas:5334`:

```
5334	ifsetheninput#8,mt$:gosub31:d$=i$:i$="$":input#8,c$:input#8,a$:bk=val(a$)
```

Note there is **no byte count and no size unit** anywhere. A C64 user reads
sizes in blocks, always.

### 3b. The layout is MCI in a sysop-editable prompt file

The listing routine prints no format string of its own. It calls numbered
prompts. Larry Mod's copy is fully commented -
`larry/l2023/src/larry-bbs.bpp:2293-2377`, verbatim:

```
;Blx, Typ, Filename Headerline
                    poke 251,0:if p1=0 then fl=102:gosub _prmptout
;DATE Prompt
                    if p1=0 and se>0 then fl=103:gosub _prmptout
;Delimiter Prompt q9$
                    if p1=0 then ::@"":fl=104:gosub _prmptout
...
;Autopause
                    if ll%<>23 then goto _dirnoap
                    gosub _apcheck:if i$="a" then goto _clall
;file#, blx etc.
_dirnoap:           fl=11:gosub _prmptout:if peek(251) then goto _clall

;mt$ (Filedate)
                    if se then fl=12:gosub _prmptout
;print <cr>, Delimiter (q9$...) and Description (i$)
                    @"":if se>0 and ds>0 then fl=104:gosub _prmptout::@i$
;yes, no, abort
_23073:             if sf>0 and(en=1 or ne<>1) then fl=107:gosub _prmptout:rp=1:gosub _bbsinput:gosub _clearisrvs::@""
...
;q9$ delimiter
                    fl=104:gosub _prmptout:fl=108:gosub _prmptout:gosub _clall:i$="":return
```

Tao 3.3.7 runs the identical sequence with `poke176,<n>:sys51048` instead of
`fl=<n>:gosub _prmptout` (`bbs.bas:5300-5304`, `5420-5428`, `5500`).

The prompt contents, decoded byte for byte out of the shipped Tao `data/text`
(prompt number = 0-based index; the user guide numbers the same prompts 1-based,
so guide #12 is `fl=11`):

| `fl` | Guide # | Guide title | Content (decoded, `£` restored) |
|---|---|---|---|
| 102 | 103 | Directory header | `{clr}▁#▁▁Blks▁Type▁Filename▁` + a 23-wide `▔` rule |
| 103 | 104 | Date | appends `▁Date!▁` and a 7-wide rule at column 31 |
| 104 | 105 | Delimiter line | `@:q2$:` - a full-width rule built from `data/dline` |
| 11 | 12 | Directory list-entry part 1 | `@:MID$(STR$(nq),2):£t04@:MID$(STR$(bk),2):£t09@:c$:£t14@:d$:` |
| 12 | 13 | Directory list-entry part 2 version A | `£t31@:mt$:` |
| 74 | 75 | Press any key | `[Slam a Key!]` |
| 107 | 108 | Yes/No/Done/Abort | `[Yes/No/Done/Abort]:` |
| 108 | 109 | Blocks and bytes free | `Blks free:@:D(bk): Bytes free:@:D(bk*255):` |

The user guide documents prompt #12's default with one extra field the shipped
3.3.7 file omits -
<https://cbasereferenceguide.github.io/resources/cbase/manuals/cbase-v3.3-user-guide.pdf>,
chapter 11:

> **12  Directory list-entry part 1** — This prompt is used when showing
> directories, both from remote-mode, and from the U/D-area. It contains
> graphics for one line, which, with the help of MCI-coomands then transform
> itself to show information about every entry. In the U/D-area, it is followed
> by either prompt #13 or prompt #121.
>
> `@:J(D(nq),2):£t04@:J(D(bk),2):£t09@:c$:£t14@:nf$:@:d$:`

`nf$` is a one-character **new-file flag**: `nf$=" "` normally
(`bbs.bas:5418`), and `nf$="{SHIFT-@}"` when the file's date is newer than the
user's last call (`bbs.bas:9285`, reached from the date comparison at
`bbs.bas:9200-9210`).

So the **column map** is fixed by MCI tabs and confirmed by the header prompt
lining up with it:

| Column | Field |
|---|---|
| 0-1 | record number, left-aligned |
| 4-7 | size in blocks, left-aligned (Larry Mod uses `£t05`) |
| 9-11 | type (`prg` / `seq`) |
| 14 | new-file flag (one char) |
| 15-30 | filename, hard-capped at 16 characters |
| 31-38 | upload date `m/d/y` |

**One row per file.** 16 + 1 + 8 + separators exactly consumes 39 of 40 columns.
The 16-character filename cap is not cosmetic - it is what makes the row fit,
and it is enforced at input (`bbs.bas:5550`).

### 3c. The description is a separate command, and it comes last

`ds` is the show-description flag. It is **0 for the ordinary listing** and set
to 1 only by a distinct command:

- Tao 3.3.7 (`bbs.bas:3480`, `3485`, `3486`):
  `if i$="$" then a$="1:":gosub5275:goto3430` (plain list, `ds` stays 0)
  `if i$="*" then ds=1:gosub5290:ds=0` (list **with** info)
  `if i$="a" then ds=1:jl=1:k1=val(u$):gosub5290:ds=0` (info on **one** file)
- Larry Mod (`larry-bbs.bpp:1198`): `if i$="i" then ds=1:gosub _22461:ds=0`

The shipped U/D menu spells it out. Tao's `data/ul^dl`, decoded:

```
[ $ ] List Files
[ $x] List Files from x
[ * ] List Files with Info
[ Ax] View Info on File x
[ N ]ew Uploads
```

When `ds=0`, the description line is **read and thrown away** -
`bbs.bas:5335`, `larry-bbs.bpp:2320`:

```
;show UD- List without Filedescr. (skip) $c930 READLN
                    if se>0 and (ds=0 or p1>0) then sys 51504
```

When `ds=1`, the order on screen is: record row, date, CR, **delimiter rule**,
then the description as free text - `larry-bbs.bpp:2352`:

```
                    @"":if se>0 and ds>0 then fl=104:gosub _prmptout::@i$
```

`@i$` is a plain print. **The description is neither truncated nor wrapped by
the listing code**; word wrap happens in the ML output routine at the user's
column width (`clmnbrk`). The description carries its uploader attribution
inline, built at upload time (`bbs.bas:3686`):

```
3686	ds$="{grn}["+str$(un)+" ]{lgrn}["+na$+"{lgrn}{rvof}]{wht}:{F7}"
```

so a description row reads `[123 ][Taper]:` followed by the uploader's text.

### 3d. Pagination

`larry-bbs.bpp:2379-2380`, verbatim, including the author's own caveat:

```
;Autopause Linecounter
;also used by Userlister
;quirky on Dirlist with Description ("i" in UDs), because each DIR entry with x lines of Description + Delimiter is counted as one line only.
_apcheck:           v=v+1:if v>22 then fl=74:gosub _prmptout::←"{blk}":rp=2:gosub _bbsinput:v=0
                    return
```

- **22 lines per page.** Because the counter is incremented once per *record*,
  a plain listing pages after 22 files; a description listing overshoots.
- The prompt is `fl=74`. Larry's `CTEXT` prompt 74 is literally
  `[Press A Key / A To Abort]`; Tao's is `[Slam a Key!]`; the user guide titles
  prompt #75 "Press any key - This prompt is shown whenever the BBS-program
  waits for a keypress from the user."
- **Any key continues; `A` aborts** - `larry-bbs.bpp:2345`,
  `gosub _apcheck:if i$="a" then goto _clall`.
- Autopause is a **per-user toggle**: `ll%` is 23 or 0
  (`larry-bbs.bpp:3292`, `_chngpause: fl=110:gosub _prmptout:ll%=23-ll%`), and
  the listing skips the pause entirely when `ll%<>23` (`larry-bbs.bpp:2344`).
  Non-stop is a first-class user setting, not a per-command flag.
- The Tao ML erases the prompt after the keypress rather than leaving it in the
  transcript (`ml0123.a65:687-700`): `lda #$4a ;pause-prompt` … then
  `remptxt lda #$14 ;delete`.
- Independently, the ML resets the line counter on `$93` (clear) and `$13`
  (home) — `ml0123.a65:367-372`.

### 3e. Colour, and why it is layout

Every field carries its own colour code, changed *between* fields on the same
row. Tao prompt 11, decoded:

```
{wht}<#>  £t04 {lgrn}<blks>  £t09 {cyn}<type>  £t14 {gry2}<filename>  {grn}{lower}
```

and prompt 12 opens `{gry1}` before the date. Larry's `CTEXT` prompt 102 puts
the header words in **reverse video** (`{rvon}`/`{rvof}`) rather than a second
colour. Both use the `▁` (`$A4`) and `▔` (`$A3`) thin rules as field separators
and as the header underline; `sdk/petscii/unicode-to-petscii.ts:41` already maps
both (`['▔', 0xA3], ['▁', 0xA4]`), so we can draw them today.

Tao's delimiter `q2$` is assembled from `data/dline` at boot
(`bbs.bas:7240-7241`) into 40 × `▁` followed by 40 × `▔` — a two-row hollow
rule. Larry's `DLINE` is a single 40-column run of `$C0` (`─`) in a colour
rainbow. Neither is a `-` or `=` ASCII rule; both are PETSCII graphics.

### 3f. Group / release-group handling

**C*Base has none.** There is no group field in the catalogue record, no logo
resolution, and no per-group anything in either source tree. The nearest thing
is the UDOP sysop command `[ Px] Pattern x  (ex. TRIAD/*)` (Tao `data/udop`,
decoded) — a filename **glob** used to bulk-select files, and Larry's
`$x*` = "View DIR with Pattern x" (`CUL-DL`, decoded). Scene groups are
expressed as a filename prefix and matched by glob, exactly the mechanism our
spec's `GROUPS.MAP` proposes.

### 3g. Example 1 — C*Base v3.3.7, plain `$` listing

**Reconstructed from source**, not captured: header from prompts 102+103 of the
shipped `data/text`, records from prompts 11+12 driven by
`bbs.bas:5420-5427`. Sample values are representative; the field positions are
exact.

```
0         1         2         3         4
0123456789012345678901234567890123456789
▁#▁▁Blks▁Type▁Filename▁        ▁Date!▁
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔        ▔▔▔▔▔▔▔
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
1   84   prg  triad-intro      9/6/26
2   166  seq  antidote.info    8/28/26
10  7    prg  goldmine         12/31/25
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
Blks free:2841 Bytes free:724455
```

With the user-guide default for prompt #12, which adds the `nf$` new-file flag
at column 14 (`✓` shown here for `{SHIFT-@}`):

```
0123456789012345678901234567890123456789
1   84   prg  ✓triad-intro     9/6/26
2   166  seq   antidote.info   8/28/26
```

**One row per file. Number, size, type, filename, date. No description.**

### 3h. Example 2 — C*Base Larry Mod v3.1, `I` (info) listing

**Reconstructed from source**: header from `CTEXT` prompts 102+103 (extracted
from `cbaselarmod2023.d64`), records from prompts 11+12, description flow from
`larry-bbs.bpp:2347-2352`. Larry's header is one row, not two, and the delimiter
is a single `─` rule.

```
0         1         2         3         4
0123456789012345678901234567890123456789
▁#▁▁Blks▁Type▁Filename▁▁▁▁▁▁▁▁▁▁Date
────────────────────────────────────────
1    84  prg  triad-intro      9/6/26
────────────────────────────────────────
[123 ][Taper]: 100% trackmo, needs 1541
────────────────────────────────────────
2    166 seq  antidote.info    8/28/26
────────────────────────────────────────
[7 ][Larry]: board info + access rules
[Press A Key / A To Abort]
```

The delimiter is printed **before** each description and again after the last
record; the record row and its date share one physical row throughout.

### 3i. Corroboration and where it disagrees

The user guide agrees with the source on every prompt's purpose and on the
default content of #12, #13, #103, #104, #105, #108 and #109. Two small
disagreements, both between the *documented default* and the *shipped file*:

- Guide #104 (Date) is `£t31_Date_[F7]` — a plain MCI tab. The shipped Tao
  `data/text` prompt 103 instead uses cursor-up plus nine cursor-lefts to append
  `▁Date!▁` to the *previous* row. Both land the word at column 31; the shipped
  file is doing it the hard way to decorate two header rows instead of one.
- Guide #109 computes bytes free as `bk × 254`; the shipped file uses `× 255`.
  Cosmetic.

No screenshot evidence was needed and none contradicts the source.

---

## 4. Where our design differs from the convention

Reference: `docs/superpowers/specs/2026-09-03-c64-file-view-design.md`,
"Settled decisions" and "The 40-column record".

**The direct answer the brief asks for: C*Base puts the filename FIRST and the
description LAST — and only shows the description at all under a separate
command.** The ordinary listing has no description in it. When the user asks for
one (`*` in Tao, `I` in Larry), the description is printed *below* the record
row, separated by a full-width rule, as free text with no truncation and no
row cap.

| # | Our spec | C*Base convention | Better? |
|---|---|---|---|
| 1 | **Description first**, then filename, version, size, date (decision 1) | Filename row first (`#`, blocks, type, filename, date); description below it, after a rule, only on request | **C*Base is better, and the reason is mechanical.** A listing is scanned by identity, not by prose. With description-first, a caller looking for `TRIAD-INTRO` reads two rows of prose before every candidate; at 25 rows he sees six records instead of twenty-two. C*Base's own author counted this: the autopause fires at 22 records precisely because a record is one row. **This is the sysop's call and it is his to reverse; the evidence is that no C64 BBS in either source tree does it his way.** |
| 2 | 2-4 rows per record (spec "The layout") | **1 row** per record in the plain listing; 3 with description (record / rule / description) | C*Base. Our own spec already flags the cost in Risk 6 ("roughly six records per C64 screen, against ten to twelve today"); the convention's number is twenty-two. |
| 3 | Size as `ceil(bytes/1024) + 'K'` (`formatNarrowSize`, `table-format.util.ts:76` region) | Size in **254-byte disk blocks**, bare integer, no unit (`bbs.bas:3684`, `5334`) | Neither, and this one is genuinely ours. Blocks are meaningless off a 1541. Keep `K`. Worth noting a C64 user reads "84" as blocks by habit, so keeping the `K` suffix is what disambiguates it — do not drop the unit to save a column. |
| 4 | Date flush **right** at column 40 (spec FACTS row) | Date flush **left** at column 31 via `£t31`, filename capped at 16 so it cannot collide | C*Base. Left-aligning at a fixed column makes the whole column scannable; right-aligning a variable-width date (`9/6/26` vs `12/31/25`) makes its left edge ragged. And `£t`'s no-op-on-overrun semantics mean a fixed column is what the layout is *built* on. |
| 5 | Filename "never shortened", relying on express.e's 12-column DIR grammar | Filename **hard-capped at 16 characters at input** (`bbs.bas:5550`) | Equivalent outcome, different mechanism. Ours is safe because express.e caps upstream. Record the dependency: if a filename ever exceeds 12 the spec's promise and the layout both break at once. |
| 6 | GROUP row printed once per run of same-group records (decisions 11) | No group concept; group is a filename prefix matched by glob (`[ Px] Pattern`, `$x*`) | Ours is an addition, not a divergence. C*Base offers no precedent either way. The one thing to steal: C*Base makes the prefix a **filter**, not a header — `$TRIAD*` lists only that group. That is cheaper than a header row and is the interaction a C64 user already knows. |
| 7 | Description capped at 2 rows, dropped past that | No cap; wrapped by the terminal at the user's column width | C*Base, *given* that the description is opt-in and below the fold. If we adopt the opt-in split (see the recommendation) the cap stops being needed. If description stays inline in the list, keep the cap. |
| 8 | No pagination decision in the spec; "the pause handler already paginates" (Risk 6) | 22 records per page; prompt `[Press A Key / A To Abort]`; **any key continues, `A` aborts**; non-stop is a per-user toggle, not a per-command flag | C*Base, and this is a gap in our spec rather than a difference. The abort key is the part that matters: a C64 caller expects to be able to stop a long listing from the pause prompt, not only by dropping carrier. |
| 9 | No new-file marker | One-character `nf$` flag at a fixed column, set by comparing the record's date against the user's last-call date (`bbs.bas:9200-9210`, `9285`) | C*Base. We already compute "new files" for the `N` command; surfacing it as one column in the listing is nearly free and is what makes a listing worth scrolling. |
| 10 | Status marker `P`/`F`/`N`/`D` kept, one column after the size | Type column (`prg`/`seq`) in the same structural position | Compatible. Both reserve a narrow fixed column between size and filename. No change needed. |
| 11 | Layout is code (`renderFileRecord`) | Layout is **data** — MCI tabs in a sysop-editable prompt file | C*Base, in principle, and this is the deepest difference. Not worth adopting wholesale (our byte-identity requirement in decision 8 depends on one renderer), but it argues strongly for adding `£t`-style column tabs to our MCI set so *other* 40-column tables can be sysop-editable without a code change. |

### Recommendation

**Adopt the C*Base shape for the LIST and keep description-first for the SINGLE
record.** Concretely:

- `F`/`FR`/`N` at 40 columns render **one row per file**: number, size, marker,
  filename, date, at fixed columns. That is twenty-plus records per screen and
  it is what a C64 caller's hands already know.
- The description moves to a **second command** — the direct analogue of
  C*Base's `*` / `I` — which prints the same record row, a rule, then the
  description. There the sysop's description-first instinct is right and costs
  nothing, because there is exactly one record on the screen.
- Add pagination at 22 rows with an abort key, and a one-column new-file flag.

This gives the sysop what he asked for on the surface where it helps (the single
record, the search hit, the upload announcement) without paying for it on the
surface where C*Base's authors measured that it hurts. **It is his call, and the
evidence above is what he should decide on.**

---

## 5. Anything else worth taking from that site

`cbase-petscii-viewer` is excluded (owned elsewhere). Of the rest:

| Thing | Where | Verdict |
|---|---|---|
| **The C*Base source archives themselves** | <https://cbasereferenceguide.github.io/resources/cbase/sources/> | **The most valuable thing on the site by a wide margin.** Four independent mods, all with source, all shipping a decodable prompt file. This is a ready-made oracle corpus for `sdk/petscii/` — real PETSCII produced by a real C64 BBS, with the code that produced it beside it. Nothing in `Doors/` or `sdk/petscii/` has an external corpus today. |
| **The prompt-file design** | `data/text`, `CTEXT`/`UTEXT`/`ATEXT` | Larry ships **three** prompt files - C (colour/PETSCII), U (uppercase) and A (ASCII/ANSI) - selected by terminal mode. That is exactly the split our board needs between `.seq` and `.TXT` and it is worth copying as a naming convention. Would sit alongside, not replace, `Screens/`. |
| **`£t<nn>` column tabs in MCI** | `ml1.o.asm:1464-1490` | The concrete thing to steal. Would let `web/backend/src/handlers/mci-dispatch.ts` express a fixed-column table as data. Nothing in our MCI set does this today (`~x`/`~y` are absolute cursor moves resolved against the live machine, `mci-dispatch.ts:479-495`, which is not the same thing and is PETSCII-only). |
| **BPP+ preprocessor** | <https://cbasereferenceguide.github.io/development/bpp-plus-preprocessor/language-specification/petscii-control-codes/>, <https://github.com/cbase-larrymod/bpp-plus> | Its `{code}` curly-brace notation for PETSCII control codes, with repetition (`{40 space}`, `{cbm-t*40}`, `{20 down}`), is a better authoring syntax than anything we have. Would replace nothing in `sdk/petscii/` (it is a preprocessor for Commodore BASIC, not a runtime) but it is the right notation for a `.seq` authoring tool, and it is what made the prompt files in this document readable. |
| **BPP+ syntax highlighting** | <https://github.com/cbase-larrymod/bpp-plus-syntax-highlighting> | Editor-only. No use here. |
| **`petcat` recipes** | <https://cbasereferenceguide.github.io/petscii/converters/> | `petcat -text -o out.txt -- in.seq` and `petcat -text -w2 -o out.seq -- in.txt`. Useful in a test harness for generating `.seq` fixtures from plain text without hand-writing bytes; `petcat` ships with VICE. |
| **Character-set references** | <https://cbasereferenceguide.github.io/petscii/character-set/> | Points at Linus Walleij's PETSCII→Unicode tables and `cbmcodecs2`. `thoughts/shared/research/2026-09-01_true-petscii-reference.md` already derives our map from the Unicode Consortium's C64IPRI/C64IALT, which is the same lineage. **No change warranted** - our table is sourced at least as well. |
| **Editors and converters lists** | <https://cbasereferenceguide.github.io/petscii/editors/>, `/converters/`, `/tools/` | Catalogue pages (Petmate, Petmate 9, Marq's editor, lvllvl, Playscii; Petsciiator, img2petscii; DART). Relevant only if we ever build a sysop-facing PETSCII art tool. Nothing here beats what `sdk/petscii/` does, because none of them is a runtime. |

---

## Provenance

Everything cited from C*Base is either a URL on the reference guide site or a
path inside one of these archives, downloaded to a scratch directory outside
this repository:

- `cbase-3.3.7-source.tar.gz` → `src/cb337/cbase-3.3.7/{src/bbs.bas, src/ml0123.a65, data/*}`
- `cbaselarmod2023.zip` → `l2023/src/{larry-bbs.bpp, ml1.o.asm}` and `cbaselarmod2023.d64` → `CTEXT`
- `cbase-larrymod.zip` → `release2.d64` → `DLINE`, `CUL-DL`
- `cbase-v3.3-user-guide.pdf` → chapter 11, "The Prompts — Explanations"

Prompt files were decoded with a PETSCII reader that restores `$5C` as `£` and
detokenises Commodore BASIC tokens ($C4 `STR$`, $CA `MID$`, $C3 `LEN`,
$C2 `PEEK`, $AA `+`, $AC `*`) inside `@:`…`:` expressions. Prompt numbering was
cross-checked five independent ways (the pause prompt named at
`ml0123.a65:687`, and prompts 102/103/104/107/108 against their call sites in
both source trees), and against the user guide's own 1-based numbering.
