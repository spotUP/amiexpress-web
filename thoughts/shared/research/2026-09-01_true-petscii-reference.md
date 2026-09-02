---
date: 2026-09-01
topic: True PETSCII terminal support — technical reference
tags: [petscii, c64, terminal, rendering, encoding, palette, fonts]
status: final
---

# TRUE PETSCII Terminal Support — Technical Reference

A reference for implementing PETSCII (Commodore 64) terminal support in a web-based BBS: serving real C64 clients over telnet/raw TCP, and rendering authentic PETSCII in a browser terminal.

---

## 1. PETSCII Encoding

PETSCII (PET Standard Code of Information Interchange, aka CBM ASCII) is an 8-bit code. Layout by 32-byte blocks:

| Range | Contents |
|---|---|
| $00–$1F | Control codes (block 1) |
| $20–$3F | Digits/punctuation — identical to ASCII |
| $40–$5F | Unshifted letters `@A–Z[£]↑←` (£ at $5C where ASCII has `\`; ↑ at $5E, ← at $5F) |
| $60–$7F | Rarely used; KERNAL maps these to the same glyphs as $C0–$DF |
| $80–$9F | Control codes (block 2 — "shifted" controls) |
| $A0–$BF | Shifted graphics characters (blocks, lines, semigraphics); $A0 = shift-space |
| $C0–$DF | Shifted letters (in up/gfx mode: more graphics; in lo/up mode: uppercase A–Z) |
| $E0–$FE | Duplicates of $A0–$BE |
| $FF | π (pi) — duplicate of $DE |

Key structural differences vs ASCII: unshifted typing produces $41–$5A (which *display* as uppercase in the default up/gfx charset), shifted letters are $C1–$DA — so naive PETSCII text arriving at an ASCII terminal shows case-swapped. There is no `{ } ~ \ _` (backslash → £, $5F is a left-arrow glyph), and codes ≥ $80 are heavily used.

### 1.1 Control codes — verified table

Verified against sta.c64.org/cbm64pet.html, C64-Wiki, pagetable charset reference.

**Block $00–$1F:**

| Hex | Dec | Function |
|---|---|---|
| $03 | 3 | STOP |
| $05 | 5 | **Color: White** |
| $08 | 8 | Disable Shift+C= charset switching (lock) |
| $09 | 9 | Enable Shift+C= charset switching (unlock) |
| $0D | 13 | RETURN — cursor to start of next *logical* line; also cancels reverse mode, quote mode, and insert mode |
| $0E | 14 | Switch to **lowercase/uppercase** ("shifted"/business/text) charset |
| $11 | 17 | Cursor DOWN |
| $12 | 18 | **Reverse video ON** (applies to subsequently printed chars; auto-cancelled by RETURN) |
| $13 | 19 | HOME (cursor to 0,0; does not clear) |
| $14 | 20 | DELETE — destructive backspace: pulls the rest of the logical line left |
| $1C | 28 | **Color: Red** |
| $1D | 29 | Cursor RIGHT |
| $1E | 30 | **Color: Green** |
| $1F | 31 | **Color: Blue** |

**Block $80–$9F:**

| Hex | Dec | Function |
|---|---|---|
| $81 | 129 | **Color: Orange** |
| $83 | 131 | RUN (keyboard code; a BBS never prints this) |
| $85–$8C | 133–140 | Function keys F1,F3,F5,F7,F2,F4,F6,F8 (input-side codes) |
| $8D | 141 | Shift+RETURN (newline without cancelling modes) |
| $8E | 142 | Switch to **uppercase/graphics** ("unshifted") charset — power-on default |
| $90 | 144 | **Color: Black** |
| $91 | 145 | Cursor UP |
| $92 | 146 | **Reverse video OFF** |
| $93 | 147 | CLEAR screen (and home cursor) |
| $94 | 148 | INSERT — pushes rest of logical line right |
| $95 | 149 | **Color: Brown** |
| $96 | 150 | **Color: Light Red (pink)** |
| $97 | 151 | **Color: Dark Grey (grey 1)** |
| $98 | 152 | **Color: Grey (grey 2, medium)** |
| $99 | 153 | **Color: Light Green** |
| $9A | 154 | **Color: Light Blue** |
| $9B | 155 | **Color: Light Grey (grey 3)** |
| $9C | 156 | **Color: Purple** |
| $9E | 158 | **Color: Yellow** |
| $9F | 159 | **Color: Cyan** |

Unlisted codes in these ranges are no-ops on the C64.

### 1.2 Semantics the terminal state machine must model

- **One global charset, not per-character.** $0E/$8E flip the *entire screen* between the two 2KB font banks (VIC-II register, bit 1 of $D018). Existing characters on screen change appearance instantly. A true renderer must store screen codes + a global charset flag, not resolved glyphs. $08/$09 only gate the *keyboard* Shift+C= toggle.
- **Reverse video is a print mode, not a character.** When RVS is on, the KERNAL sets bit 7 of the *screen code* it writes. RETURN ($0D) turns RVS off.
- **Color is per-cell.** Every printed character writes current pen color into color RAM for that cell. Control codes affect subsequent prints only.
- **Cursor movement wraps.** Cursor-right at column 39 goes to column 0 of next row; cursor-down at bottom scrolls. HOME does not clear; CLR ($93) does.
- **DELETE/INSERT are logical-line editing ops** — they shift the remainder of the logical line.
- **Quote mode** (client-side keyboard quirk): after an odd number of `"`, typed control codes insert as reverse-video glyphs instead of executing. Renderer for BBS output doesn't need it; full screen-editor emulation does.

### 1.3 Logical lines and wrapping (40 vs 80 columns)

C64 screen is 40×25, but the KERNAL links two physical rows into one **logical line of up to 80 characters**: printing past column 39 wraps onto the next row and marks it as continuation; RETURN, DELETE, INSERT, and CHRIN operate on the 80-char logical line. Implications:

- Classic C64 BBS content is authored for **40 columns** — emit 40-col screens to PETSCII clients.
- 80-column PETSCII exists (C128 80-col mode; SyncTERM/CGTerm can do 80); Synchronet reserves a separate port for it.
- Art files position with explicit cursor codes or exact 40-char rows — don't rely on auto-wrap.

---

## 2. PETSCII → Screen Code Mapping (the quadrant remap)

The VIC-II displays **screen codes**, not PETSCII. Character ROM = 4KB = two 2KB banks (up/gfx, lo/up), each 256 glyphs × 8 bytes; glyphs 128–255 are reverse-video copies of 0–127. Conversion (verified against sta.c64.org/cbm64pettoscr.html):

| PETSCII | Screen code | Transform |
|---|---|---|
| $20–$3F (32–63) | $20–$3F | unchanged |
| $40–$5F (64–95) | $00–$1F | −$40 |
| $60–$7F (96–127) | $40–$5F | −$20 |
| $A0–$BF (160–191) | $60–$7F | −$40 |
| $C0–$FE (192–254) | $40–$7E | −$80 |
| $FF (255) | $5E (π) | special-case |
| any, with RVS on | +$80 | set bit 7 |

**Why this matters:** rendering with actual C64 ROM glyph data means glyph lookup is `screen_code = remap(petscii) | (rvs << 7)`, then `glyph = charROM[charset_bank][screen_code]`. Fonts exposing ROM-order glyphs (Style64 U+EE00 page, raw `chargen` ROM) are indexed by screen code, not PETSCII. Art tools (Petmate, lvllvl) store screen codes; BBS byte streams carry PETSCII — convert at the boundary.

---

## 3. The C64 Palette (VIC-II 16 colors)

| VIC# | Name | PETSCII code | **Pepto** (classic) | **Colodore** |
|---|---|---|---|---|
| 0 | Black | $90 | `#000000` | `#000000` |
| 1 | White | $05 | `#FFFFFF` | `#FFFFFF` |
| 2 | Red | $1C | `#68372B` | `#813338` |
| 3 | Cyan | $9F | `#70A4B2` | `#75CEC8` |
| 4 | Purple | $9C | `#6F3D86` | `#8E3C97` |
| 5 | Green | $1E | `#588D43` | `#56AC4D` |
| 6 | Blue | $1F | `#352879` | `#2E2C9B` |
| 7 | Yellow | $9E | `#B8C76F` | `#EDF171` |
| 8 | Orange | $81 | `#6F4F25` | `#8E5029` |
| 9 | Brown | $95 | `#433900` | `#553800` |
| 10 | Light Red | $96 | `#9A6759` | `#C46C71` |
| 11 | Dark Grey | $97 | `#444444` | `#4A4A4A` |
| 12 | Grey | $98 | `#6C6C6C` | `#7B7B7B` |
| 13 | Light Green | $99 | `#9AD284` | `#A9FF9F` |
| 14 | Light Blue | $9A | `#6C5EB5` | `#706DEB` |
| 15 | Light Grey | $9B | `#959595` | `#B2B2B2` |

- **Pepto** (pepto.de/projects/colorvic) — long-time emulator default (VICE "Pepto PAL").
- **Colodore** (colodore.com) — Pepto's 2015+ recalculation with proper gamma; brighter. Modern PETSCII art tooling favors Colodore. Recommend: ship both, default Colodore, name them in settings.
- Canonical power-on defaults: background = blue (6), border = light blue (14), text = light blue (14). A cleared PETSCII BBS screen starts light-blue-on-blue unless the BBS sets colors.

**Correction (2026-09-02): terminal defaults vs. power-on.** The line above describes the C64's KERNAL BASIC power-on screen (the blue "READY." boot look) - it does NOT apply to this project's BBS simulation. A real C64 terminal program (CCGMS, Novaterm) sets the screen and border to black on startup and leaves them there; every C64 BBS's PETSCII art is drawn assuming that black backdrop, and native PETSCII has no control code to change the background at all - the terminal's own default IS the background the BBS gets. `PetsciiMachine` and the backend PETSCII-to-ANSI/PetMe64 converters simulate that terminal, not BASIC, so their power-on/reset/clear-screen state uses background = black (0) and border = black (0); only the light-blue (14) default pen color is inherited from the table above, since it matches CCGMS/Novaterm's default ink and is harmless (the BBS overrides it immediately with its own color codes).

**The CCGMS background/border convention (2026-09-02).** Native PETSCII has no background byte, but the dominant C64 *terminal* convention - CCGMS Future (docs + source), Novaterm, and PyCGMS ("CCGMS/Novaterm compatible") - adds two:

- **`$02` followed by one of the 16 standard PETSCII colour bytes** (`$90 $05 $1C $9F $9C $1E $1F $9E $81 $95 $96 $97 $98 $99 $9A $9B`, the "PETSCII code" column above) sets the **background AND the border** to that VIC colour. The two are always tied - no independent border control exists in the convention. `$02` followed by anything else is inert, and that byte is then processed normally (so a stray `$02` never eats a control code).
- **`$0E`** - the standard lowercase/uppercase charset switch - **also resets background and border to black (0)** on those terminals. A sender that wants a coloured screen must therefore re-send `$02 <colour>` after every `$0E` it emits.
- Terminal defaults at connect are black background / black border (CCGMS, PyCGMS). SyncTERM's C64 mode is the outlier (it starts on the BASIC blue). sblendorio/petscii-bbs never sends background codes at all.

`PetsciiMachine` implements both codes (`background`/`border` mutate together, and a change reports a full repaint since the whole canvas re-paints). `AnsiToPetsciiTransducer` sends a screen background at exactly one moment - a full clear (`ESC[2J`, `ESC[?1049h`/`?47h`) with an ANSI background SGR (40-47 / 100-107 / 48;5 / 48;2) in force - emitting `$93` then `$02 <colour>`, and re-sends `$02 <colour>` after any `$0E` it emits while that screen background stands. Per-cell ANSI backgrounds remain dropped: C64 colour RAM stores ink only.

---

## 4. Fonts for Web Rendering

### 4.1 Style64 "C64 TrueType" (C64 Pro / C64 Pro Mono)

style64.org/c64-truetype — de facto standard C64 web font. **C64 Pro Mono** (fixed-pitch) has all 304 unique glyphs, ttf/otf/woff/woff2.

**Unicode mapping** (style64.org/c64-truetype/petscii-rom-mapping):

| PUA range | Meaning |
|---|---|
| U+E000–E0FF | PETSCII bytes, **uppercase/graphics** set (direct: U+E0xx = PETSCII $xx) |
| U+E100–E1FF | PETSCII bytes, **lowercase/uppercase** set |
| U+E200–E2FF | Reverse-video uppercase/graphics |
| U+E300–E3FF | Reverse-video lowercase/uppercase |
| U+EE00–EEFF | **Character ROM order** (screen codes, both banks) |
| U+EF00–EFFF | PETSCII page variant |
| ASCII/Unicode blocks | Best-effort standard mappings (U+25xx etc.) |

The U+E000–E3FF pages are ideal for a translating terminal: `codepoint = 0xE000 + (charsetBank << 8) + petscii_printable`, reverse video via +$200 pages or SGR 7. **License:** free, explicitly permits unmodified @font-face web embedding, free-software bundling; no selling/collections; commercial beyond that needs negotiation.

### 4.2 Kreative Korp "Pet Me" family

kreativekorp.com/software/fonts/c64.shtml — pixel-exact ROM fonts: Pet Me 64 (C64 40-col), Pet Me 64 2Y (half-width "80-col"), Pet Me 128, etc.

- Since Oct 2019, **all of PETSCII encoded at proper Unicode code points including Symbols for Legacy Computing (U+1FB00–1FBFF, Unicode 13.0)** — Bettencourt co-authored the proposal.
- PUA: U+E000–E1FF = complete C64 set in screen-code order, both banks incl. reverse.

### 4.3 Unicode 13 "Symbols for Legacy Computing" (U+1FB00–1FBFF)

Added specifically to complete PETSCII/ATASCII/Teletext round-tripping: sextants, smooth mosaic diagonals, half-blocks. PETSCII graphics fully representable in standard Unicode via U+1FBxx + Box Drawing (U+2500) + Block Elements (U+2580) + Geometric Shapes. Caveats: font coverage thin in the wild (Pet Me covers it; system fonts don't; xterm.js built-in custom-glyph rasterizer covers block/box/sextant subsets); mapping is per-glyph irregular — need a 128-entry lookup per charset bank.

**Practical choice:** lossless in-browser = C64 Pro Mono U+E000–E3FF pages or canvas+ROM renderer; U+1FBxx only for generic-Unicode interop.

---

## 5. How Existing Software Does It

### Clients

- **CGTerm** (MagerValp) — reference PC-side PETSCII telnet client: ROM font, C64 palette, 40-col. CGTerm 3.0 "Scene Edition" (hackers.nu/cgterm): SDL2, **modem simulator** (baud pacing). Best executable spec for PETSCII terminal semantics.
- **CCGMS / CCGMS Ultimate** — classic real-C64 terminal, C/G or ANSI mode.
- **SyncTERM** — "Full CGTerm PETSCII support": per-dialing-entry `ScreenMode=C64`. Manual selection — no autodetect.
- **MuffinTerm** (macOS/iOS) — pixel-accurate CP437/PETSCII/ATASCII.
- **PyCGMS** — Python clone; ROM font bitmaps, 16 colors, live 40/80 switch.

### Server-side detection — how a BBS knows the caller is PETSCII

**PETSCII cannot be reliably autodetected at connect.** Synchronet PETSCII howto (wiki.synchro.net/howto:petscii) defines the modern convention:

1. **Dedicated ports** (Synchronet standard): port **64** = 40-col PETSCII, port **128** = 80-col PETSCII, port 23 = ASCII/ANSI. Auto-converts CP437↔PETSCII with substitution for unsupported glyphs.
2. **Ask the user** (classic): "Press DELETE for C/G mode" (Image BBS 1.2a). Doubles as detection: **PETSCII DEL is $14**, ASCII sends BS $08 or DEL $7F — received byte identifies client. Related heuristic: inspect letter bytes of any input — lowercase $61–$7A implies ASCII, $C1–$DA implies PETSCII.
3. **Telnet-negotiation absence**: C64 clients behind WiFi modems typically ignore IAC; no TERMINAL-TYPE/NAWS reply within timeout = weak evidence of 8-bit client. Hint only.
4. **"Client sends 0x83" story: unverified folklore.** No primary source documents it. Don't build detection on it.

**Telnet-layer trap:** PETSCII $FF (π) is *printable* and collides with telnet IAC. Correct telnet server must escape outgoing $FF as IAC IAC and strip incoming doubled IAC. Many C64-scene boards run **raw TCP** on the PETSCII port instead.

---

## 6. Rendering PETSCII in the Browser

### 6.1 Why xterm.js can't do it natively

xterm.js is a VT/ANSI machine over UTF-8: no dual switchable charsets, no bit-7 reverse semantics, no PETSCII control bytes, no logical-line editing, no byte-keyed 16-color palette. Bytes ≥ $80 get eaten by the UTF-8 decoder. Custom-glyph rasterizer (issue #2409) draws Block Elements/Box Drawing/sextants pixel-perfect — helps approach (a) — but there is no PETSCII input mode.

### 6.2 The three viable architectures

**(a) PETSCII → ANSI + Unicode, feed xterm.js (lossy, cheap).**
Transducer: control codes → CSI ($93→`ESC[2J ESC[H`, $12/$92→SGR 7/27, colors→16-color with C64-palette theme, cursor codes→CUU/CUD/CUF/CUB), printables → Unicode via 2×128 lookup. Losses: global charset flips can't retro-change on-screen glyphs; glyphs approximate unless font covers U+1FBxx; DEL/INSERT approximated. OK for menus; wrong for charset-switching art.

**(b) PETSCII → PUA code points + C64 web font, still xterm.js (glyph-exact, semantics-approximate).**
Same transducer, printables → C64 Pro Mono U+E000–E3FF direct-PETSCII pages; `fontFamily: "C64 Pro Mono"`, Pepto/Colodore theme, 40 cols. Pixel-true glyphs incl. reverse (+$200 pages). Remaining gaps semantic (global charset switch, logical lines) — transducer can track and repaint, but xterm.js won't repaint history.

**(c) True PETSCII canvas renderer (correct; recommended for "TRUE" support).**
Model the machine: 1000-byte screen-code matrix + 1000-byte color RAM + cursor + state {charset bank, rvs, pen color}. Feed raw PETSCII bytes; implement KERNAL screen-editor rules (§1.2–1.3, §2). Render to canvas: blit 8×8 glyphs from 4KB `chargen` ROM (or atlas), fg = color RAM, bg/border = globals, integer-scale, `image-rendering: pixelated`. ~300 lines of logic; exactly what CGTerm/PyCGMS/VICE do, and what Petmate / petscii.krissz.hu / lvllvl.com do (all canvas over screen-code grids; none use a text terminal widget).
Practical hybrid: keep xterm.js for ANSI; when session is PETSCII, swap frontend to the PETSCII canvas component fed the raw byte stream over the same WebSocket.

Keyboard input: map keys → PETSCII bytes (Enter→$0D, Backspace→$14, arrows→$11/$91/$1D/$9D, Home→$13, Shift+Home→$93, F1–F8→$85–$8C, letters case-swapped per §1), send bytes not UTF-8.

---

## 7. Art Files, SEQ, and Playback Timing

- **.seq**: CBM DOS sequential file; a PETSCII art .seq is the **raw PETSCII byte stream, control codes included**. Playback = print bytes in order. Native BBS distribution format.
- **Other forms**: .prg self-displayers, .pe (PETSCII Editor), .c (Marq's editor), raw 1000+1000 screen/color dumps, PNG renders.
- **Timing/baud**: PETSCII art designed to animate as it draws at 300–2400 bps. CGTerm 3.0 ships a modem simulator. Web renderer: per-byte pacing queue, `delay = 10 bits/byte ÷ baud` (2400 baud ≈ 240 cps ≈ 4.17 ms/byte); selectable 300/1200/2400/9600/full, flush-on-keypress. Real C64 clients: unpaced — physical link paces.

---

## Sources

- PETSCII tables: https://sta.c64.org/cbm64pet.html · https://www.c64-wiki.com/wiki/control_character · https://www.pagetable.com/c64ref/charset/ · https://www.masswerk.at/nowgobang/2020/petscii
- Screen codes: https://sta.c64.org/cbm64pettoscr.html · https://gist.github.com/sblendorio/70776d21155455c2f7695e23785b82ff
- Logical lines: https://www.devili.iki.fi/Computers/Commodore/C64/Programmers_Reference/Chapter_2/page_094.html · https://www.pagetable.com/?p=901
- Palettes: https://www.pepto.de/projects/colorvic/ · https://www.colodore.com · https://lospec.com/palette-list/colodore
- Fonts: https://style64.org/c64-truetype · https://style64.org/c64-truetype/petscii-rom-mapping · https://style64.org/c64-truetype/license · https://www.kreativekorp.com/software/fonts/c64.shtml
- Unicode: https://www.unicode.org/charts/PDF/U1FB00.pdf · https://en.wikipedia.org/wiki/Symbols_for_Legacy_Computing
- BBS/terminals: http://wiki.synchro.net/howto:petscii · https://syncterm.bbsdev.net/ · https://hackers.nu/cgterm/ · https://github.com/sblendorio/petscii-bbs · https://github.com/lastylegp/PyCGMS
- Browser tools: https://github.com/nurpax/petmate · https://petscii.krissz.hu/ · https://lvllvl.com · https://github.com/xtermjs/xterm.js/issues/2409
- Art & timing: https://paleotronic.com/2018/06/13/petscii-c64/ · https://text-mode.org/?p=27470 · https://github.com/robbiew/turbo64
