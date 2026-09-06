---
date: 2026-09-06
topic: "80-column PETSCII for the Commodore 128 (VDC): is it real, and what would it cost this board?"
tags: [petscii, c128, vdc, 80-column, transducer, screen-width, research]
status: final
---

# 80-column PETSCII for the Commodore 128

**Question asked:** what would it take to serve a C128 in 80-column VDC mode, and is it
worth doing?

> **Revision note (2026-09-06, same day).** Section 1.5 originally concluded that
> DesTerm 128 has no PETSCII mode, from its v3.02 User Guide's emulation list.
> That was wrong - the manual is stale and omits `ccg40.emu`/`ccg80.emu`. The
> section, the verdict table and the recommendation's reasoning have been
> rewritten. The recommendation itself is unchanged, but it now rests on cost
> and client divergence rather than on "no client exists".

**Short answer:** 80-column PETSCII is real, is precisely specified by a live
implementation, and is *not* a widened version of what we already send. It is a
different palette, a different font and four control bytes with different
meanings - one of which (`$02`) we currently emit and which means something else
entirely on a C128 80-column screen. It is a **fourth screen**, not a widening of
the third. Real clients render it - DesTerm 128's `ccg80.emu`, Dialogue 128's
`CBM` mode, UltraTerm128, CCGMS Future, SyncTERM's "C128 80x25" - so this is a
cost decision, not a feasibility one. **Recommendation: still don't build it**,
because a fourth screen taxes every future door and the clients diverge enough
that no single one can serve as the oracle. The one idea worth an hour is
section 4(c): SyncTERM will render an ordinary 80-column ANSI session in the
**Commodore 128 character ROM** if you send it `ESC [ 0 ; 34 SP D`. Details in
section 4.

This note builds on `thoughts/shared/research/2026-09-01_true-petscii-reference.md`
(the 40-column reference) and does not repeat what is settled there.

---

## 0. The three layers, kept apart

Almost every confused claim in this area comes from collapsing these:

| Layer | What it is | What it decides |
|---|---|---|
| **HARDWARE** | VIC-II (40 col) and the VDC / MOS 8563 (80 col) | how many cells, what colours the tube can make, what glyph bitmaps are in RAM |
| **KERNAL / screen editor** | the C128 ROM routines a program running *on the C128* prints through | what a control byte does when a *local* program prints it |
| **TERMINAL PROGRAM** | DesTerm, Novaterm, CCGMS, SyncTERM, CGTerm | what a byte arriving *from the wire* does |

A BBS talks to the third layer only. The first two matter only because the third
mostly imitates them. Where a terminal program disagrees with the KERNAL, the
terminal program wins - that is what the caller sees.

---

## 1. What is true

### 1.1 Hardware: the VDC changes the width, not the character repertoire

- The MOS 8563 VDC drives an 80x25 text screen (640x200, 8x8 cells) and is the
  C128's second, independent video chip. Other geometries (80x50, 40x25) are
  possible by reprogramming it; 80x25 is the default.
  <https://en.wikipedia.org/wiki/MOS_Technology_8563>
- **The character bitmaps are in VDC RAM, not ROM, and the C128 power-on copies
  the VIC-II character ROM patterns into VDC RAM.** So the 80-column screen has
  the same two PETSCII banks (upper/graphics and lower/upper) the 40-column
  screen has. There is nothing in the hardware that stops 80-column PETSCII
  graphics. Same source.
- The C128's own character ROM is not byte-identical to the C64's: the lowercase
  glyphs differ. Kreative Korp ships `Pet Me 64` and `Pet Me 128` as separate
  faces for exactly that reason, and SyncTERM carries separate fonts 32/33 (C64
  upper/lower) and 34/35 (C128 upper/lower).
  <https://syncterm.bbsdev.net/cterm.html>
- The VDC's colour output is **RGBI, CGA-compatible** - "8 colors at 2
  intensities". This is *not* the VIC-II palette. It is the single most
  important hardware fact in this note.
- 40/80 switching on real hardware is the physical **40/80 DISPLAY key**, or
  `ESC X` in the C128 screen editor. <https://www.c64-wiki.com/wiki/Commodore_128>

### 1.2 KERNAL: the C128 screen editor translates PETSCII colour to VDC colour, and it is lossy

The C128 KERNAL holds two tables:

- `$CE4C` "Ascii Color Codes" - the 16 PETSCII colour bytes in VIC-colour-number
  order; the editor finds the printed byte's index, and the index is the VIC
  colour number.
- `$CE5C` "System Color Codes" - the VIC-to-VDC translation, indexed by that
  number:

```
$CE5C: 00 0f 08 07 0b 04 02 0d 0a 0c 09 06 01 05 03 0e
```

Sources: [C128 ROM Map](https://github.com/franckverrot/EmulationResources/blob/master/consoles/commodore/C128%20ROM%20Map.txt),
[ACME's C128 VDC library](https://sourceforge.net/p/acme-crossass/code-0/20/tree/trunk/ACME_Lib/cbm/c128/vdc.a?force=True)
(which mirrors the table at `$6A4C`/`$CE5C` and the inverse at `$81F3`),
[Lemon64 discussion of the editor's use of the tables](https://www.lemon64.com/forum/viewtopic.php?t=55272).
The C128 Programmer's Reference Guide p.35 prints the same list as the
80-column column of its COLOR table
([archive.org](https://archive.org/stream/C128_Programmers_Reference_Guide_1986_Bamtam_Books/C128_Programmers_Reference_Guide_1986_Bamtam_Books_djvu.txt),
[Frank Buss, citing p.35](https://frank-buss.de/c128/vdc/index.html)).

The mapping is a **bijection** - all 16 codes survive, nothing collapses - but
four of them change hue:

| PETSCII | VIC colour | VDC value | What you actually see at 80 columns |
|---|---|---|---|
| `$81` | 8 orange | `$0A` | **dark purple / magenta** - the worst break |
| `$97` | 11 dark grey | `$06` | **dark cyan** - the second worst |
| `$95` | 9 brown | `$0C` | dark yellow (reads as brown on a real CGA monitor) |
| `$98` | 12 medium grey | `$01` | dark grey - recognisable, much darker |
| `$1C`/`$1E`/`$1F` | red/green/blue | `$08`/`$04`/`$02` | right hue, a shade darker |
| the other 9 | - | - | right hue |

ACME's library says so in its own comments: *"ORANGE ... on VDC, this is in fact
a dark shade of purple"*, *"GRAY1 ... on VDC, this is in fact a dark shade of
cyan."*

**Two widely-cited tables are wrong and must not be used:**

- **cc65's `c128-vdc.s`** uses `COLTRANS: $00 $0f $08 $06 $0a $04 $02 $0c / $0d
  $0b $09 $01 $0e $05 $03 $07`, which is *not* the KERNAL table, and its own
  comment admits *"Color translation values for BROWN and GRAY3 are obviously
  wrong."* <https://github.com/cc65/cc65/blob/master/libsrc/c128/tgi/c128-vdc.s>
- **VDCScreenEditor2's README** claims orange and brown both convert to dark
  yellow and the two light greys collapse. That describes that project's own
  perceptual conversion, not Commodore's.
  <https://github.com/xahmol/VDCScreenEditor2/>

### 1.3 The C128 KERNAL gives four bytes a different meaning at 80 columns

SyncTERM's CTerm manual documents the C64/C128 control-code divergence
explicitly (<https://syncterm.bbsdev.net/cterm.html>, "Known Differences from
Hardware"):

| Byte | C64 hardware | C128 hardware |
|---|---|---|
| `$02` | ignored | **UNDERLINE ON** (C128 only) |
| `$08` | LOCK CASE (disable SHIFT+C= toggle) | TAB SET/CLEAR (HTS) |
| `$09` | UNLOCK CASE | TAB (HT) |
| `$0A` | ignored | LINE FEED |
| `$0B` | ignored | UNLOCK CASE |
| `$0C` | ignored | LOCK CASE |
| `$0F` | ignored | **FLASH ON** (80-column only) |
| `$1B` | ignored | **ESC** (introduces the C128 editor escape sequences) |
| `$82` | ignored | UNDERLINE OFF |
| `$8F` | ignored | FLASH OFF (80-column only) |

CTerm's own note is the one to keep: *"The actual behavior desired may differ
from raw hardware because BBS terminal programs (CCGMS, DesTerm, NovaTerm, etc.)
running on these systems may have performed their own translation or stripping
of control codes before displaying them."*

**This is a live collision with our code.** `AnsiToPetsciiTransducer` emits the
CCGMS convention `$02 <colour>` on a full clear to set background and border
(`sdk/petscii/ansi-to-petscii.ts`; policy recorded in the 40-column reference
doc, section 3). On a C128 80-column screen `$02` is UNDERLINE ON and the colour
byte behind it lands as a pen change. Our existing repair - re-asserting the pen
immediately after `$02 <colour>` - happens to limit the damage to "everything is
underlined", but the background never gets set.

### 1.4 A BBS CAN serve 80-column PETSCII, and there is exactly one normative spec for it

- **Synchronet** reserves dedicated ports: *"Port 64: TCP Port used for
  40-column PETSCII terminal connections"*, *"Port 128: TCP Port used for
  80-column PETSCII terminal connections"*, and states plainly *"a Commodore 128
  could also support 80 column text mode, so 80 column PETSCII is also
  supported."* Width is decided by **which port answered** - there is no
  autodetect. <http://wiki.synchro.net/howto:petscii>
  Configured as `Pet40Port`/`Pet80Port` in `ctrl/sbbs.ini`; Vertrauen
  (vert.synchro.net) answers on 64 and 128 today.
- **SyncTERM/CTerm** implements it as one of three PETSCII screen modes:

| Mode | Size | Colours | Default attribute |
|---|---|---|---|
| C64 40x25 | 40x25 | 16, C64 VIC-II palette | `$6E` light blue on blue |
| C128 40x25 | 40x25 | 16, C64 VIC-II palette | `$BD` light green on dark green |
| **C128 80x25** | **80x25** | **16, CGA palette** | **`$07` light grey on black** |

  <https://syncterm.bbsdev.net/cterm.html>

- CTerm's C128 80-column colour table (its Table 19), PETSCII byte to palette
  index:

```
$90 black    0    $98 grey        8
$1F blue     1    $9A lt blue     9
$1E green    2    $99 lt green   10
$97 dk grey  3    $9F cyan       11
$1C red      4    $96 lt red     12
$81 orange   5    $9C purple     13
$95 brown    6    $9E yellow     14
$9B lt grey  7    $05 white      15
```

  **This independently corroborates the KERNAL `$CE5C` table.** Convert each VDC
  nibble (`RGBI`, bit3=R) to a CGA index (`IRGB`, bit3=I) and they agree cell for
  cell: orange `$0A` -> CGA 5 (magenta), dark grey `$06` -> CGA 3 (cyan), brown
  `$0C` -> CGA 6 (brown). Two independent sources, same answer. This is the table
  to implement against.

- Cursor semantics at 80 columns are the ordinary PETSCII ones (CTerm, "Cursor
  Movement Details"): `$1D` wraps at the right margin to column 0 of the next
  row, `$9D` wraps backwards, `$11` scrolls at the bottom, `$91` clamps at the
  top, `$0D` clears reverse and `$8D` does not.
- Not implemented even by SyncTERM: the flash codes `$0F`/`$8F`.

### 1.5 Which real terminal programs actually do it

This is where the case weakens badly.

> **Correction, recorded 2026-09-06.** An earlier draft of this note concluded
> from the DesTerm 3.02 *User Guide* that DesTerm has no PETSCII mode. **That was
> wrong: the manual is stale.** See the DesTerm entry below for what the shipped
> archive actually contains and how far each part of it is verified.

**DesTerm 128 - does 80-column PETSCII, and has since 1998.**

The v3.02 *User Guide*
(<http://www.elysium.filety.pl/tools/c128/modem/DesTerm_3_02/user_man.txt>,
fetched and read here in full) lists exactly three emulations:

> `tty.emu` A fairly generic no-frills 80 column teletype emulation.
> `ansi.emu` A complete implementation of the ANSI X3.64 standard. (With
> modifications for compatibility with the IBM-PC).
> `vt102.emu` A fairly complete implementation of the DEC VT-102 Terminal.

**The manual is incomplete, and that is provable from a second source without
opening the archive:** the community recipe for PETSCII on DesTerm is "load
character file `cbmcgset.chr`, load emulation program **`ccg40.emu`**"
(<https://www.lemon64.com/forum/viewtopic.php?p=875581>) - and `ccg40.emu`
appears nowhere in the manual. A manual that omits one emulation module can be
trusted for nothing about the emulation list.

A survey agent unpacked the 3.02 distribution and reports **six** modules -
`ansi.emu`, `ccg40.emu`, **`ccg80.emu`**, `tty.emu`, `vt102.emu`, `vt52.emu` -
with matching `.eky` keymaps, status-line names `TTY80 / ANSI / VT102 / VT52 /
CCG40 / CCG80`, and a `rel-301.txt` in the archive documenting them under
"Additions Since 3.00":

> "- Commodore Colour Graphics emulation
>   - 40 column: ccg40.emu & ccg40.eky
>   - 80 column: ccg80.emu & ccg80.eky
>   These emulations are first run attempts."

It also reports that `manual01.asc`-`manual05.asc` inside the archive contain
zero occurrences of "ccg", which is consistent with the stale-manual reading.
**Verification limit: I could not re-open the archive myself** - both
commodore.software and the elysium mirror return 403/404 to automated fetches -
so `ccg80.emu` and the `rel-301.txt` quote rest on that agent's inspection, not
on a source I read. `ccg40.emu` is independently corroborated by the forum
recipe. Treat the 80-column module as high-confidence-but-unre-verified; opening
the D64 by hand is a 10-minute job and worth doing before building on it.

DesTerm 2.00's own manual is reported to document the mode as first-class -
`MODE: ASCII / ANSI / VT52 / VT102 / C=C/G -- Commodore 64 Colour Graphics`,
with the instruction to load `DES.CBMCGSET`, "set to 8 bits, and DO NOT have the
high bit masked" - and DesTerm 1.0's own release blurb ("full 9600 baud support,
ANSI and C/G modes") says the same. DesTerm is **VDC-only**: it has no
40-column VIC output at all
(<https://www.lemon64.com/forum/viewtopic.php?t=78832>), so its C/G mode has
always been PETSCII on an 80-column screen.

DesTerm's `ansi.emu` also documents the constraint that matters most to us:

> `4x` select background colour x. The VDC cannot show a separate background
> colour for each character. The background change will only take effect when
> the screen is cleared. Then, the whole screen will become this colour.

**The known DesTerm PETSCII defect** is real and is a design constraint for any
board serving it: the charset switch codes affect only cells printed *after* the
switch, not the whole screen the way a C64 does, so a board that flips case
mid-screen corrupts a DesTerm display. Send `$0E`/`$8E` **before** the text they
govern; never as a retroactive fix-up.

**Novaterm 9.6 - PETSCII is 40 columns only.** Its manual, section 3.1.1
(<https://commodoreman.com/Commodore/Library/Man/Programs/64/Novaterm96/nt014.html>),
lists ANSI (80 col), ANSI-40, VT102, VT52, Standard-80, Standard-40,
**Commodore**, and "ANSI-wide / VT102-wide / Std-80-wide". Of the Commodore
emulation, verbatim:

> **Commodore:** This emulation is for using bulletin boards that can display
> Commodore color/graphics. The only difference between this and Standard-40
> is that ASCII translation is turned off.

There is no `Commodore-wide` and no 80-column Commodore mode; `C= C` (40/80
toggle) works only in the Standard emulations. The marketing line "Commodore
graphics in 40 or 80 column mode" that circulates on product wikis and in the
9.6 release announcement is **not what the manual says**. **StrikeTerm 2014**
(by alwyz) is a fork of Novaterm 9.6c and inherits this exactly - same emulation
list, same 40-column-only Commodore mode - though it offers three 80-column
paths (soft-80, or true `VDC (25)` / `VDC (28)` on a C128 running in 64 mode).
There is **no ANSI-PETSCII hybrid** in either.

**The rest of the field**, from the survey agent (secondary sources; not
re-verified here except where noted):

| Program | 80 col via | PETSCII glyphs at 80 | ANSI/VT at 80 | Telnet |
|---|---|---|---|---|
| DesTerm 3.01/3.02 | VDC | **yes** - `ccg80.emu` | yes | bridge |
| DesTerm 2.00/2.01 | VDC | **yes** - `C=C/G` | yes | bridge |
| Dialogue 128 | VDC (always) | **yes** - `CBM` mode, untranslated | yes | bridge |
| UltraTerm128 | VDC | **yes** - PETSCII 80-col profile | yes (CP437 font) | **native** |
| CCGMS Future 0.2+ | VIC-II soft-80 | **yes** - `80c PETSCII` (two cells share one fg colour) | partial | bridge |
| Novaterm 9.6 / StrikeTerm | soft-80 or VDC(25/28) | no | yes | bridge |
| CCGMS <= 2021 | - (40 col only) | n/a | n/a | bridge |
| BobsTerm Pro 128 | VDC | no (font is in ASCII order) | ADM-31/VT-52/VT-100 | no |
| Kermit 128 | VDC | no (PETSCII is a *file* conversion) | VT-52/100/102 + Tek 4010 | no |
| Kipperterm 128 | VDC | UNVERIFIED | UNVERIFIED | **native** (IP65/RR-Net) |

A whole 1980s tier shipped C/G modes on the VDC as well: Hayes Term 128 ("40/80
Column C/G mode"), Lobster Term 128, CGTerm 128 v4.2, Multiterm 128 ("the
graphic term is 80 column only"), Dawnstar Term ("ASCII/Petscii"). A period
archive index corroborates the shape of this: `cgterm12.sda` is listed as a
"40/80col C/G terminal program" and `nova128v.sda` (Novaterm **128**, a
different program from Novaterm 64) as a "40/80 column terminal program with
ASCII/PETSCII". <https://www.fragit.net/cbm/c128/comm/index.html>

Two names in the original question do not exist: **"Kernal64" is not a
terminal** (it is a Scala C64/128 emulator), and no C128 terminal called
ColorTerm, Term128 or Ivory Terminal turns up in any catalogue.

**Net:** 80-column PETSCII on a C128 is not a modern reconstruction - it was a
shipping feature of the two flagship C128 terminals (DesTerm and Dialogue 128)
and half a dozen others, and it is carried forward today by SyncTERM's "C128
80x25" mode, Synchronet's `Pet80Port`, UltraTerm128 (which speaks telnet
natively, with no bridge) and CCGMS Future's soft-80 PETSCII. **The premise
"80 columns on a C128 means ANSI" is refuted.**

### 1.6 How width and PETSCII are actually decided

Nobody autodetects width. The three real mechanisms, in order of how much they
are used:

1. **Dedicated port** (Synchronet's convention, and the only one with a written
   spec): port 64 = PETSCII 40, port 128 = PETSCII 80, port 23 = ASCII/ANSI. The
   caller's choice of port *is* the answer. No negotiation, no probe.
   **We already implement this half**: `TELNET_PETSCII_PORT`
   (`web/backend/src/utils/telnet-petscii-port.util.ts`, wired in `index.ts`
   around lines 916 and 1595), documented in
   `Documentation/2-Sysops/CONFIGURATION.md` section 5 as *"the only signal that
   cannot be wrong"*. There is one such port and it means 40 columns.
2. **Ask the caller** - the classic Commodore-BBS graphics prompt. Our own board
   does this (the `A/r/p/n` answer, `applyGraphicsAnswer` in
   `web/backend/src/handlers/command-handler/pre-login.ts`).
3. **Read the first keypress** - the DEL-key probe. PETSCII DEL is `$14` where
   an ASCII terminal sends `$08`/`$7F`, and C64 shifted letters arrive as
   `$C1-$DA` where ASCII sends `$61-$7A`. Documented in three classic packages'
   own manuals - **C*Base v3.3** prompt #68 (*"It urges the caller to press
   [DELETE]. From the keycode of the keypress, the BBS-program then determines
   whether the caller has a PETSCII-machine or an ASCII/ANSI-machine"*),
   **Image BBS** (*"HIT YOUR BACKSPACE/DELETE KEY: This detects the caller's
   graphics mode"*), **C-Net DS-II** - and still live in **RetroBBS**, whose
   PETSCII encoder sets `bs = 0x14` and whose ASCII/MSX/VT52 encoders set
   `bs = 0x08`. We already implement it
   (`web/backend/src/utils/c64-detect.util.ts`).

Telnet TTYPE (RFC 1091) and NAWS (RFC 1073) exist and we already honour both
(`telnet-server.ts`, `applyTerminalTypeReport` / `applyWindowSizeReport`), but a
real C64/C128 behind a WiFi modem negotiates no telnet options at all - the
bridge terminates the telnet layer and the machine sees a raw byte stream. That
is exactly why the DEL-probe exists in our tree.

None of these three distinguishes a C128 at 80 columns from a C64 at 40. A
fourth screen needs a fourth *declaration*: a port, or a letter on the graphics
prompt.

The dedicated-port convention is what the live boards actually run: Synchronet
`Pet40Port`=64 / `Pet80Port`=128, Taco Pronto 2064/2128, Retrocampus 6510 vs 23,
Cottonwood 6502, Particles!/RetroBBS 6400. Retrocampus's port 23 additionally
runs a literal chooser menu ("1- CBM PETSCII 40X25 ... 6- DOS CP 437 80X24").

Two things do genuinely detect width, and neither helps a C128:

- **Turbo56K** (Retroterm's protocol) is a real handshake: the BBS sends
  `$FF $A2 $FE`, the terminal replies `RT` + id + version, and command `$A4`
  subsystem `$01` returns columns and rows. It needs a Turbo56K terminal, and
  its `$FF` lead byte collides with telnet IAC - RetroBBS runs it on a raw
  socket.
- **Centipede 128** is the only classic package found that asks at login:
  *"1 Try auto-detecting ANSI and SupeRes first. Call routine #2 below if not
  detected. 2 Prompt caller for emulation mode and screen width."* Everywhere
  else (Image BBS, C-Net DS-II, C*Base) width is a **stored account field**
  edited from a settings menu, not a login-time question.

### 1.7 Transport traps that bear on any PETSCII width

Findings from the detection research that matter to us regardless of the
80-column question:

- **A C64 does send a bare `$0D`.** CCGMS's `terminal.s` does
  `jsr getin` -> optional `petscii_to_ascii` -> `jsr rs232_put`, and the
  conversion chain in `ansi.s` never touches `$0D`. CGTerm hardcodes
  `int sendcrlf = 0;` and its `net.c` has no IAC handling at all.
  <https://github.com/mist64/ccgmsterm/blob/master/src/terminal.s>
  That is the grain of truth in the CR claim - and it is still not a
  discriminator, because the bridges rewrite it:
  **Zimodem's PETSCII mode maps `$0D` to `$0A`** (`petToAscTable[0x0d] == 0x0a`,
  `pet2asc.ino`), and the **WiFi232/StrikeLink family appends NUL** (`ATNET1`
  sends `$0D $00`). Practical rule for our input path: accept `$0D` as
  end-of-line, swallow a following `$0A` **or `$00`**, and accept a lone `$0A`
  as end-of-line too - or a Zimodem PETSCII caller hangs at every prompt.
- **TTYPE lies about the caller.** tcpser hardcodes `"VT100"`, the WiFi232
  family defaults to `"ansi"`, Zimodem sends whatever `AT&S41=` holds (default
  `"Zimodem"`). Our `classifyTerminalType()` substring test for
  `C64`/`COMMODORE`/`PETSCII` will therefore never fire for a real C64 behind
  any of them. That is not a bug - it is why the DEL-probe exists - but the
  TTYPE branch should not be trusted as the strong signal it looks like.
- **NAWS is worse than useless here.** tcpser answers `IAC WILL NAWS` and then
  never sends the subnegotiation (a BBS that blocks waiting for dimensions
  hangs); Zimodem and UltimateTerm refuse NAWS; the WiFi232 family answers a
  hardcoded `80x24`. Our `applyWindowSizeReport()` uses NAWS `40x25` as a
  fallback C64 detector - a real C64 behind a WiFi232 reports `80x24` and is
  classified `modern`. The DEL-probe is what saves that caller.
- **tcpser masks every byte to `& 0x7F` in telnet mode until BINARY is
  agreed** (`parse_ip_data` / `line.c`), which destroys every PETSCII byte
  `>= $80` - the entire graphics half of the character set. We do negotiate
  `TELOPT_BINARY` in both directions (`telnet-server.ts:541-578`), so we are
  covered *if* the negotiation completes; a C64 behind a tcpser that never
  agrees BINARY would see the graphics stripped. Worth a check the next time
  a PETSCII-over-telnet bug is reported.
- tcpser also decides whether to *speak* telnet from the server's **first
  byte** (`is_telnet` is set from `data[0]` being `0xff` or `0x1a`), which is a
  reason our first write to a fresh telnet connection matters more than it
  looks.

---

## 2. What is not true

Claim-by-claim verdict on the supplied notes.

| Claim | Verdict |
|---|---|
| "`CHR$(27)` ESC as a VDC prefix" | **Half true, wrongly framed.** `$1B` is a real control byte on C128 hardware (it is ignored on a C64) and introduces the C128 *screen editor's* `ESC`+letter sequences - `ESC X` toggles 40/80, `ESC I` inserts a line, and so on. It is not a "VDC prefix" and it is not something a BBS sends: a terminal program receiving `$1B` from the wire treats it as ANSI's ESC, not as a C128 editor escape. Sources: CTerm's C64-vs-C128 table; [Touring the C128 Keyboard](https://www.devili.iki.fi/Computers/Commodore/articles/Touring_the_C128_Keyboard/index.html). |
| "`CHR$(14)` switches to lower/uppercase" | **True.** `$0E` selects the lower/upper set, `$8E` (142) the upper/graphics set. C64 PRG Appendix C; [C64-Wiki control character](https://www.c64-wiki.com/wiki/Control_character); C128 System Guide Appendix D. |
| "`CHR$(8)` disables 40-column CHR$ output variations to lock 80 columns" | **False, twice over.** On a C64 `$08` disables the SHIFT+Commodore *keyboard* charset toggle (`$09` re-enables it) - it has nothing to do with columns and nothing to do with output. On a **C128** `$08` is TAB SET/CLEAR and `$09` is TAB. Neither locks anything to 80 columns. Nothing in PETSCII selects the VDC screen; that is the 40/80 DISPLAY key or `ESC X`, both local to the machine. |
| The 16 colour bytes (`$90` black ... `$9B` light grey) | **All 16 correct**, verified against C64 PRG Appendices C and G, sta.c64.org, C128 System Guide Appendix E, and our own `PETSCII_COLOR_TO_VIC` table. Only names vary between sources (`$96` is "lt. red" in the PRG, "pink" on sta.c64.org; `$97`/`$98`/`$9B` are "grey 1/2/3" in Appendix C). The first 8 are CTRL+1..8, the second 8 C=+1..8; a VIC-20 has only the first 8. |
| "`$13` home, `$93` clear+home, `$11` down, `$1D` right" | **All correct**, no source disagrees. Add `$91` up, `$9D` left, `$12`/`$92` reverse on/off, `$14` DEL (destructive backspace), `$94` INST, `$0D` RETURN (also clears reverse), `$8D` shift-RETURN (does not). |
| "The VDC's 16 colours are the same as the VIC-II's" (implied by reusing one table) | **False.** The VDC is RGBI/CGA. Four PETSCII colour codes change hue at 80 columns; orange becomes dark purple and dark grey becomes dark cyan. See 1.2 and 1.4. |
| "A Commodore terminal sends a bare CR where a telnet client sends CRLF, so use that to switch to PETSCII" | **Half the premise is true; the conclusion is false.** See 1.7 - a C64 really does send a bare `$0D` (CCGMS source), but bare-CR forms are legal for standard telnet clients (RFC 1123 s3.3.1: a User Telnet MUST be able to send CR LF, CR NUL, *and* LF), Zimodem's PETSCII mode sends `$0A` instead of `$0D`, and the WiFi232 family sends `$0D $00`. The byte is not a discriminator. Synchronet says flatly that PETSCII cannot be autodetected at connect. No BBS package documents this heuristic. | No BBS package documents a bare-CR heuristic. It is also weak on its face: plenty of ASCII telnet clients send bare CR, telnet's own NVT rule is CR NUL rather than CRLF for a bare carriage return, and a C64 behind a WiFi modem is a raw stream with no telnet layer to compare against. The documented mechanisms are dedicated ports, a menu question, and the DEL/`$14` first-keypress probe - all three of which we already have or already use. Treat the CR claim as folklore, in the same bin as the "client sends `$83`" story the 40-column reference doc already rejects. |
| "Novaterm has an ANSI-PETSCII mode where ANSI cursor positioning can be combined with PETSCII glyphs" | **False.** Novaterm 9.6's manual lists ANSI, ANSI-40, VT102, VT52, Standard-80, Standard-40, Commodore, and three "-wide" variants. `ANSI-40` is ANSI *in 40 columns with ANSI glyphs*, which is probably what the claim garbled; `Commodore` is "Standard-40 with ASCII translation off", i.e. PETSCII with no escape interpretation at all. There is no hybrid, and no 80-column Commodore mode - in Novaterm or in its StrikeTerm 2014 fork. (The claim is *directionally* right about the world, just wrong about Novaterm: DesTerm and Dialogue 128 do PETSCII at 80 columns, and Dialogue does it alongside VT100 as a separate mode.) |
| "DesTerm 128 is a way to reach an 80-column PETSCII board" | **TRUE** - and an earlier draft of this note said otherwise, wrongly. DesTerm ships `ccg80.emu` ("Commodore Colour Graphics emulation - 80 column"), added in v3.01; v2.00 documented the same mode as `C=C/G`. Its 3.02 *User Guide* omits both `ccg40.emu` and `ccg80.emu` from its emulation list, which is a documentation bug, not an absence. What it accepts in that mode is raw PETSCII control bytes; in `ansi.emu` it accepts ANSI X3.64. It is VDC-only (no 40-column output at all). See 1.5, including the verification limit on `ccg80.emu`. |
| "Terminals named: DesTerm 128, Novaterm, Dialogue 128" | **All three are real and relevant, and two of the three do 80-column PETSCII.** DesTerm: yes (`ccg80.emu`). Dialogue 128: yes - it is VDC-always, and its `CBM` mode is documented as "PETSCII mode. Used to call Commodore colour boards", applying no translation at all. Novaterm: no, its Commodore mode is 40 columns. |
| "The VDC 80-column screen changes the character set" | **False.** The C128 copies the VIC-II character ROM into VDC RAM at boot; the PETSCII repertoire is there. Only the lowercase glyphs differ slightly from the C64's, which is why `Pet Me 128` and SyncTERM fonts 34/35 exist. |

### Not verified

- Whether `Pet Me 64 2Y` is a half-width 80-column face (as our 40-column
  reference doc records) or a double-height one - kreativekorp.com returns 403
  to automated fetches. Do not rely on that line without opening the page by hand.
- Novaterm 128 v2.0 (a different program from Novaterm 64) is described as
  "40/80 column terminal program with ASCII/PETSCII" by one archive index and
  "80 col only term program" by another. Unresolved, and academic - it is a
  1980s disk image.
- The byte layout of DesTerm's `cbmcgset.chr` (which glyph sits at which ASCII
  code). This matters only for the ANSI-plus-font approach - in `ccg80.emu` mode
  DesTerm consumes PETSCII bytes and does its own glyph lookup, so the font's
  ASCII ordering is irrelevant there.
- What sets the screen background in DesTerm's `ccg80.emu` mode. The
  whole-screen-on-clear rule quoted above is from the **ANSI** appendix; native
  PETSCII has no background byte, and whether `ccg80` honours the CCGMS `$02`
  convention, the C128's `$02`-is-underline meaning, or neither, is unknown.
  This is the single most load-bearing unknown for our transducer, since `$02`
  is a byte we already emit.
- A per-board survey of Image BBS / C*Base / Centipede 128 login prompts. The
  detection findings here rest on Synchronet's howto, the Image BBS DEL-probe
  already recorded in our 40-column reference doc, and our own implementation -
  not on reading each package's manual.
- **`ccg80.emu` inside the DesTerm 3.02 archive, and the `rel-301.txt` quote.**
  Reported by a survey agent that unpacked the distribution; I could not re-open
  the archive (commodore.software and the elysium mirror both refuse automated
  fetches). `ccg40.emu` is independently corroborated by the Lemon64 setup
  recipe, which also proves the 3.02 manual's emulation list is incomplete - so
  the stale-manual conclusion is safe even without the archive. Confirm
  `ccg80.emu` by hand before building on it.
- The DesTerm 2.00 manual quote (`C=C/G -- Commodore 64 Colour Graphics`),
  Dialogue 128's `CBM` mode description, UltraTerm128's PETSCII 80-column
  profile, CCGMS Future's `80c PETSCII` mode, and the 1980s C/G terminal tier -
  all secondary, from the same survey agent, not re-verified here.
- Whether the C128 fonts CTerm exposes as 34/35 are indexed so that ASCII
  letters land on letters. Decides whether recommendation 4(c) is one escape
  sequence or unusable.

---

## 3. What it would cost us

### 3.1 The width source

`web/backend/src/amiga-emulation/xim/screen-width.util.ts` is the one place a
PETSCII width is decided, and every rule in it currently encodes "PETSCII implies
40":

- `doorScreenWidth()`: `width > 0 && width < 80 ? width : 40` - an 80 for a
  PETSCII session is *deliberately* discarded, because a web `P` session still
  carries the xterm's 80 when the caller answers P.
- `applyClientReportedGeometry()`: refuses to write any client-reported geometry
  onto a PETSCII session at all.
- `applyWindowSizeReport()`: NAWS `40x25` is the fallback C64 detector.

A C128 mode cannot be expressed by widening these. `petsciiMode` is a single
boolean doing two jobs - "send PETSCII bytes" and "the screen is 40x25" - and
those must be split first. **87 call sites reference `petsciiMode`** across
`web/backend/src`. The split itself is the bulk of the work, and every one of
those sites is a place a 40-column assumption may be hiding.

### 3.2 The transducer and the machine

- `sdk/petscii/ansi-to-petscii.ts` has `const COLS = 40; const ROWS = 25;` as
  module constants, used in ~20 places (wrap deferral, the bottom-right scroll
  guard, CSI clamping, `fillRow`). Parameterising them is mechanical.
- `sdk/petscii/petscii-machine.ts` is worse: `COLS = 40, ROWS = 25, CELLS = 1000`
  and a typed state `cols: 40; rows: 25`. It also models **KERNAL logical lines**
  (two 40-column rows linked into one 80-character line, which INSERT/DELETE
  operate on). That model is *correct for a C64* and *not obviously correct for a
  C128 80-column terminal* - SyncTERM's C128-80 mode does not describe logical
  lines at all, and DesTerm/Novaterm each have their own screen driver. **We
  would be widening an oracle that no longer describes the target.**
- Colour is the real cost. The whole chain
  `nearestVicForRgb -> vicColorToPetscii -> PETSCII byte` and the reverse
  `PETSCII_COLOR_TO_VIC -> Colodore RGB` is VIC-II-specific. An 80-column C128
  target needs a **second palette and a second nearest-match** against the CGA
  RGBI set, or every colour choice is made against the wrong 16 swatches: we
  would pick `$81` for an orange SGR and the caller would see dark purple.
- `$02` must be suppressed. Our background/border convention is a CCGMS
  *terminal* convention; on the C128-80 target `$02` is UNDERLINE ON. The
  background for that screen is set by the mode's default attribute `$07`
  (SyncTERM) or by whole-screen `4x` semantics in an ANSI session (DesTerm's
  `ansi.emu`) - and what `ccg80.emu` does with `$02` is an open question (see
  "Not verified"). Until that is answered, emitting `$02` at an 80-column C128
  is a coin flip between "sets the background" and "underlines the board".

### 3.3 The frame path

Cheaper than expected, and this is the one genuinely attractive part.

`sdk/petscii/frame/adapt.ts` already takes `opts.cols`/`opts.rows`;
`frame-render.ts`'s `renderDiff`/`cupTo` already take `cols`/`rows` parameters
with 40/25 only as defaults. At `cols = 80` the whole rule ladder in `adapt.ts`
(the 80-to-40 folding that `classify.ts` and the rule pins exist for) becomes the
**identity** - a 68K door paints 80x25 natively.

That means the `C64_ADAPT` story inverts: at 80 columns **every** 68K door works,
not just the 16 currently marked `C64_ADAPT=40`. The adapter would install only
to reconstruct frames, not to fold them - or could be skipped entirely.

### 3.4 The gates and marks

- `web/backend/src/utils/door-min-columns.util.ts`: `sessionColumns()` routes a
  PETSCII session through `doorScreenWidth()` (always 40); `doorShowsC64Mark()`
  hardcodes `claim <= C64_COLUMNS`. The `[C64]` marker is drawn per door with no
  session in scope, so it would have to become session-aware or the DOORS list
  lies to one of the two PETSCII widths.
- 23 doors carry a mark today (7 `MIN_COLUMNS=40`, 16 `C64_ADAPT=40`).
  `MIN_COLUMNS` is a *minimum*, so those 7 already open at 80 - no re-marking
  needed. `C64_ADAPT=40` would need a companion value or a rule that 80 implies
  40 is satisfiable.

### 3.5 The frontend

- `packages/terminal/src/petscii/PetsciiCanvas.tsx` hardcodes `COLS = 40`,
  `ROWS = 25`, and derives its bordered footprint (`352x232` per unit of integer
  scale) from them. Widening is mechanical but changes every layout number.
- The glyph atlas is built from **PetMe64**; a C128 target wants **PetMe128**
  (the lowercase glyphs differ). Second font, second atlas, second tint cache.
- `packages/terminal/src/components/BBSTerminal.tsx` switches to the canvas on
  `size.cols === 40 && size.rows === 25`. That equality is the switch.

### 3.6 Content

Every `.seq` on the board is 40 columns (103 files, mostly per-node BBSTITLE
copies). An 80-column PETSCII caller gets 40-column art on an 80-column screen -
half a screen of art with a ragged right - or the ANSI art it cannot render. A
real 80-column PETSCII mode needs its own art, commissioned.

### 3.7 Tests

57 PETSCII test files, of which
`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts` is the
end-to-end proof and `sdk/tests/unit/forty-col-baseline.test.ts` plus
`web/backend/tests/forty-col-sweep.test.ts` are the sweeps. All of them assert
40x25 geometry on the KERNAL oracle. A second width needs a second oracle - and
per 3.2 we do not have one for C128-80.

### 3.8 The contract

`.claude/skills/door-three-screens/SKILL.md` defines the C64 screen as "exactly
40x25". Adding C128-80 makes it four screens, with a fourth proof obligation on
every door. That is the largest hidden cost in the whole exercise: it is not the
code, it is the per-door tax forever after.

---

## 4. Recommendation

**Do not build a caller-facing 80-column PETSCII mode - but the case is closer
than the first draft of this note claimed, and it fails on cost and divergence
rather than on "nobody can see it".**

The first draft rested its recommendation on "there is no client". That argument
is dead: DesTerm 3.x (`ccg80.emu`), Dialogue 128 (`CBM` mode), UltraTerm128
(native telnet, no bridge), CCGMS Future (soft-80 PETSCII) and SyncTERM's
"C128 80x25" all render it. What survives:

1. **It is a fourth screen, not a wider third.** Different palette (CGA/RGBI,
   not VIC-II - four codes change hue, orange becomes dark purple), a different
   font (the C128 char ROM), four control bytes with different meanings, and one
   byte we currently emit (`$02`) that means UNDERLINE ON there. Nothing about
   "it is PETSCII, just wider" survives contact with the spec.
2. **The per-door tax is permanent, and it is the real cost.** Three screens is
   already the expensive part of shipping a door
   (`.claude/skills/door-three-screens/SKILL.md` is six sections of proof
   obligations). A fourth is a standing ~33% increase on every door from now on.
   That is paid forever; the transducer work is paid once.
3. **The clients diverge from each other, so there is no single oracle.**
   `PetsciiMachine` models the C64 KERNAL. The C128 targets do not agree with it
   *or with each other*: DesTerm's charset switch affects only cells printed
   after it (a C64 repaints the whole screen), SyncTERM's C128-80 mode has its
   own screen driver and does not implement the flash codes at all, CCGMS
   Future's soft-80 makes two adjacent cells share one foreground colour. Pick
   any one as the oracle and you are proving output against a client the next
   caller is not using. This is the same failure the corpus e2e test exists to
   prevent.
4. **Zero observed C128 callers on THIS board.** This is now an argument about
   our audience, not about the world - and it is the weakest of the four, so it
   should not be the one carrying the decision. If the sysop knows of even one
   C128 caller, revisit points 1-3 on the merits rather than treating this as
   settled.

Honest summary of the change: the world supports 80-column PETSCII better than I
first reported; our tree still should not, because a fourth screen costs every
future door and no single client can be used to prove it correct.

### What IS worth doing - the smallest version that delivers value

Two things, neither of which is "80-column PETSCII mode":

**(a) Write down why PETSCII means 40 here, in the two places that decide it.**
The most valuable output of this research is a guard against a future agent
"just widening `COLS`". Two comments:

- `sessionColumns()` in `web/backend/src/utils/door-min-columns.util.ts` says
  *"a PETSCII session is ALWAYS 40 (a C64 has no other width)"*. True of a C64,
  false of the C128 it does not mention. Say so, and say that the C128 case is a
  different palette and different control codes rather than a wider one - so the
  next reader does not treat 40 as an oversight.
- `.claude/skills/door-three-screens/SKILL.md` defines the C64 screen as
  "exactly 40x25". Add one line: 80-column PETSCII exists, is specified by
  SyncTERM's CTerm C128-80 mode and Synchronet's port 128, and is deliberately
  **out of scope** for this board - with a pointer to this note.

Cost: two comments. Value: it stops the wrong version of this feature from ever
being half-built.

**(b) Tell a C128 caller to answer `A`, and it works today.**
A C128 owner has a choice of modes, and every one of the C128 terminals that
does PETSCII also does ANSI or VT102 at 80 columns: DesTerm has `ansi.emu`,
Dialogue 128 has VT100, UltraTerm128 ships a CP437 font, Novaterm/StrikeTerm are
ANSI-first. So the zero-code answer for a C128 caller is the graphics prompt's
`A`: 80x25, ANSI X3.64, SGR `3x`/`4x` colour, whole-screen background on clear -
**our existing 80-column ANSI path**, and DesTerm's own manual states the
whole-screen-background rule our PETSCII path already obeys.

This is worse than a native PETSCII mode would be, and it should be described
honestly as a fallback rather than as the right answer: the caller gets our
Amiga/Latin-1 or CP437 line-drawing instead of Commodore glyphs. Our
wire-encoding layer offers three charsets (`utf-8`, `iso-8859-1`, `cp437`,
negotiated per RFC 2066 - `CHARSET_NAMES` in
`web/backend/src/server/telnet-server.ts`, `utils/wire-encoding.util.ts`);
DesTerm's `cbmcgset.chr` is a fourth, private ordering we do not have the byte
layout for, but a DesTerm caller who loads `ibmset.chr` instead lands on
`cp437`, which we already speak. Note also that `classifyTerminalType()` puts a
DesTerm caller in the non-Unicode bucket by default (neither a known modern
terminal nor Amiga, so `unicodeCapable` is false) - the right outcome by
accident.

**(c) The one idea in this note that might actually be worth prototyping: push
the C128 font over ordinary ANSI.**

SyncTERM/CTerm supports `CSI Ps1 ; Ps2 SP D` ("Font Selection", FNT) - `Ps1 = 0`
means "the default font", and `Ps2` is a font number. Verified in the CTerm
manual's Table 3: **32 = Commodore 64 (UPPER), 33 = Commodore 64 (Lower),
34 = Commodore 128 (UPPER), 35 = Commodore 128 (Lower)**. So
`ESC [ 0 ; 34 SP D` on a plain 80-column ANSI session asks SyncTERM to render
the whole screen in the C128 character ROM - full ANSI colour, full cursor
addressing, 80 columns, and Commodore glyphs, with **no PETSCII mode at all**.
CTerm also exposes a capability report (`CSI < Ps c`) whose bit 5 says whether
the terminal can be pushed a font, so this can be asked rather than assumed.

Caveats, both real: the manual says *"Not all output types support font
selection. Only X11 and SDL currently do"* - so a Windows or curses SyncTERM
build ignores it. And **the byte-to-glyph ordering of those fonts is
unverified**: whether ASCII letters land on letters (making it a drop-in font
swap) or whether the font is in screen-code order (making our ANSI text
unreadable) was not established. That is the single experiment worth running
before anything else in this note: send `ESC [ 0 ; 34 SP D` followed by a line
of mixed text and box-drawing to a SyncTERM, and look. If letters survive, an
"80-column Commodore" screen costs one escape sequence and zero new
architecture.

If the sysop later *wants* the badge - "this board serves 80-column PETSCII" -
the honest minimum is:

1. A **second listening port**. This is the cheap part and mostly exists:
   `TELNET_PETSCII_PORT` already implements the Synchronet convention for 40
   columns. An `TELNET_PETSCII80_PORT` reusing `telnet-petscii-port.util.ts`
   would stamp `petsciiMode + width 80 + palette CGA` where today's stamps
   `petsciiMode + width 40`. No detection code at all - and it is the only
   declaration mechanism that exists, since nothing distinguishes a C128-at-80
   from a C64-at-40 on the wire.
2. Split `petsciiMode` into `petsciiBytes` and `screenGeometry`. Non-negotiable
   first step; nothing else can be done cleanly until it lands.
3. Parameterise `COLS`/`ROWS` in the transducer, keep `PetsciiMachine` **at 40
   only**, and build the 80-column oracle separately from CTerm's spec rather
   than by widening the KERNAL model.
4. Add the CGA palette and a second `nearestColorFor` against it; suppress `$02`
   when the target is C128-80.
5. Leave the frame adapter alone - at `cols = 80` it is already the identity, so
   68K doors come for free.

### What would prove it works

The oracle is **not** a widened `PetsciiMachine`. It is a new 80x25 screen model
written from `https://syncterm.bbsdev.net/cterm.html`'s C128 80-column section -
the three-mode table, Table 19's colour mapping, the cursor-movement rules, the
default attribute `$07`. That is the only *written* specification of the target
that exists, and SyncTERM is the easiest target to test against.

Be explicit that it is one client among several that disagree (see reasoning 3
above), so the model must be named for what it is - `SynctermC128Machine`, not
`PetsciiMachine80` - and two known divergences pinned as separate expectations
rather than baked in: DesTerm's charset switch is **not** retroactive (so the
board must emit `$0E`/`$8E` ahead of the text they govern, and a test should
assert that ordering rather than assert a whole-screen repaint), and CCGMS
Future's soft-80 gives **two adjacent cells one shared foreground colour** (so a
one-cell colour change is a lie on that client; a test should assert colour runs
start on even columns).

The test would follow the shape of
`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts` exactly:
the same captured 68K door fixtures, driven through the real emitter, with
`adaptFrame` at `cols = 80` (identity) instead of 40, into the transducer in
C128-80 mode, onto the new oracle - asserting that no `ESC` reaches the wire,
that every cell is a glyph the C128 character ROM has, that every colour byte
lands on the CGA index CTerm's Table 19 names, and that `$02` never appears in
the stream. Red proof: force the VIC-II palette back in and the colour
assertions must fail; re-enable `$02` and the stream assertion must fail.

Until a caller exists who can see the result, that test is the only thing the
work would produce.

---

## Sources

**Hardware and KERNAL**
- MOS 8563 VDC - <https://en.wikipedia.org/wiki/MOS_Technology_8563>
- Commodore 128 (40/80 DISPLAY, VDC modes) - <https://www.c64-wiki.com/wiki/Commodore_128>
- C128 ROM Map ($CE4C / $CE5C) - <https://github.com/franckverrot/EmulationResources/blob/master/consoles/commodore/C128%20ROM%20Map.txt>
- ACME C128 VDC library (RGBI constants, the three translation tables, the ORANGE/GRAY1 comments) - <https://sourceforge.net/p/acme-crossass/code-0/20/tree/trunk/ACME_Lib/cbm/c128/vdc.a?force=True>
- C128 Programmer's Reference Guide (COLOR table p.35) - <https://archive.org/stream/C128_Programmers_Reference_Guide_1986_Bamtam_Books/C128_Programmers_Reference_Guide_1986_Bamtam_Books_djvu.txt>
- Frank Buss, RGBI to RGB for VDC output (cites C128 PRG p.35) - <https://frank-buss.de/c128/vdc/index.html>
- Lemon64, "C128 kernal text color routine?" - <https://www.lemon64.com/forum/viewtopic.php?t=55272>
- Touring the Commodore 128 Keyboard (ESC sequences) - <https://www.devili.iki.fi/Computers/Commodore/articles/Touring_the_C128_Keyboard/index.html>

**Conflicting / rejected colour tables**
- cc65 `c128-vdc.s` COLTRANS - <https://github.com/cc65/cc65/blob/master/libsrc/c128/tgi/c128-vdc.s>
- VDCScreenEditor2 README - <https://github.com/xahmol/VDCScreenEditor2/>

**PETSCII control and colour codes**
- C64 Programmer's Reference Guide, Appendices C and G - <https://www.zimmers.net/cbmpics/cbm/c64/c64prg.txt>
- C128 System Guide Appendix E (CHR$ codes) - <https://www.commodore.ca/manuals/128_system_guide/app-e.htm>
- C128 System Guide Appendix D (charset switching) - <https://www.commodore.ca/manuals/128_system_guide/app-d.htm>
- C64-Wiki control character - <https://www.c64-wiki.com/wiki/Control_character>
- sta.c64.org PETSCII codes - <https://sta.c64.org/cbm64pet.html>

**The 80-column PETSCII specification**
- SyncTERM / CTerm manual - PETSCII Emulation (three screen modes, Table 18/19 colour maps, C64-vs-C128 control codes), and Font Selection `CSI Ps1;Ps2 SP D` with Table 3's font numbers 32-35 - <https://syncterm.bbsdev.net/cterm.html>
- Synchronet "Support CBM/PETSCII Terminals" (ports 64 / 128, "PETSCII cannot be automatically detected") - <http://wiki.synchro.net/howto:petscii>

**Transport and detection**
- CCGMS source, `terminal.s` / `ansi.s` (RETURN sends a bare `$0D`) - <https://github.com/mist64/ccgmsterm/blob/master/src/terminal.s>
- Zimodem `pet2asc.ino` (`petToAscTable[0x0d] == 0x0a`) - <https://github.com/bozimmerman/Zimodem/blob/master/zimodem/pet2asc.ino>
- PicoWiFiModem / WiFi232 README (`ATNET1` sends `$0D $00`) - <https://github.com/mecparts/PicoWiFiModem/blob/main/README.md>
- tcpser `line.c` (`is_telnet` from `data[0]`; `& 0x7f` masking before BINARY) - <https://github.com/go4retro/tcpser/blob/master/src/line.c>
- RetroBBS (DEL-probe still live; PETSCII `bs = 0x14`, ASCII `bs = 0x08`) - <https://github.com/retrocomputacion/retrobbs/blob/master/retrobbs.py>
- RFC 1123 s3.3.1 (a User Telnet MUST be able to send CR LF, CR NUL, and LF) - <https://www.rfc-editor.org/rfc/rfc1123>
- RFC 1091 TERMINAL-TYPE - <https://www.rfc-editor.org/rfc/rfc1091> ; RFC 1073 NAWS - <https://www.rfc-editor.org/rfc/rfc1073>

**Terminal programs**
- DesTerm 128 v3.02 User Guide - <http://www.elysium.filety.pl/tools/c128/modem/DesTerm_3_02/user_man.txt>
- Novaterm 9.6 User's Guide s3.1.1 Terminal emulations - <https://commodoreman.com/Commodore/Library/Man/Programs/64/Novaterm96/nt014.html>
- Novaterm 9.6 User's Guide, 80-column notes - <https://commodoreman.com/Commodore/Library/Man/Programs/64/Novaterm96/nt020.html>, <https://commodoreman.com/Commodore/Library/Man/Programs/64/Novaterm96/nt022.html>
- Lemon64, "Best terminal for C128" (DesTerm CG setup, VDC case-switch bug) - <https://www.lemon64.com/forum/viewtopic.php?p=875581>
- Lemon64, "DesTerm 128 stuck in uppercase?" - <https://www.lemon64.com/forum/viewtopic.php?t=78832>
- C128 comm program archive - <https://www.fragit.net/cbm/c128/comm/index.html>
- zimmers C128 file index - <https://www.zimmers.net/anonftp/pub/cbm/c128/ALLFILES.html>

**Our tree (paths, not URLs)**
- `sdk/petscii/ansi-to-petscii.ts`, `sdk/petscii/petscii-machine.ts`, `sdk/petscii/c64-palette.ts`, `sdk/petscii/frame/{adapt,frame-render,classify}.ts`
- `web/backend/src/amiga-emulation/xim/screen-width.util.ts`
- `web/backend/src/utils/{door-min-columns,c64-detect,wrap-for-session}.util.ts`
- `web/backend/src/server/{telnet-server,c64-door-adapter}.ts`
- `packages/terminal/src/petscii/{PetsciiCanvas.tsx,glyph-atlas.ts}`, `packages/terminal/src/components/BBSTerminal.tsx`
- `.claude/skills/door-three-screens/SKILL.md`
- `thoughts/shared/research/2026-09-01_true-petscii-reference.md`
