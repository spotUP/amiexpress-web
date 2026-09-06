---
date: 2026-09-06
topic: cbase-petscii-viewer (C*Base .seq / .petmate VS Code extension) versus our PETSCII pipeline
tags: [petscii, c64, seq, petmate, char-rom, unicode-mapping, licence, logo-pack]
status: final
---

# `cbase-petscii-viewer` versus our PETSCII pipeline

## What it is

`https://github.com/cbase-larrymod/cbase-petscii-viewer`, v0.6.0-beta, last
pushed 2026-09-04. A **VS Code custom-editor extension** (`package.json:7`
`"license": "GPL-2.0-or-later"`, `package.json:29-53` two
`CustomReadonlyEditorProvider`s) that opens `.seq` and `.petmate` files in a
webview and paints them from an embedded C64 character ROM. It is a
**developer's file preview**, not a terminal: it has no cursor, no scroll, no
40x25 screen, no input, and no network. Cloned for this review to
`<scratchpad>/viewer`; nothing was copied into this tree.

Shape (1,713 lines of source):

| file | lines | what |
|---|---|---|
| `src/petsciiDecoder.ts` | 119 | `.seq` bytes -> rows of `{codePoint, reverse, fgIndex}` |
| `src/petsciiMaps.ts` | 10 | PETSCII byte + bank -> a PUA codepoint `0xE0xx`/`0xE1xx` |
| `src/petmateDecoder.ts` | 73 | Petmate JSON -> `PetmatePage[]` |
| `src/colorPalette.ts` | 69 | six 16-colour palettes |
| `src/seqEditorProvider.ts` | 466 | webview host, MCI stripping, charset sniff |
| `src/petmateEditorProvider.ts` | 294 | webview host for `.petmate` |
| `media/charRom.js` | 20 | base64 of the 4,096-byte C64 character ROM |
| `media/viewer.js` | 371 | `.seq` canvas painter |
| `media/petmateViewer.js` | 303 | `.petmate` canvas painter |

Our side, for reference: `sdk/petscii/petscii-machine.ts:54` (the KERNAL
machine), `sdk/petscii/screen-codes.ts:9`, `sdk/petscii/unicode-to-petscii.ts:29`,
`sdk/petscii/ascii-to-petscii.ts:46`, `web/backend/src/handlers/petscii-screen.render.ts:157`,
`web/backend/src/utils/petscii-session-model.ts:44`,
`packages/terminal/src/petscii/PetsciiCanvas.tsx:58`.

---

## 1. `.seq` handling - differences only

The viewer is a **stream-to-rows** decoder: one pass over the bytes emitting an
unbounded list of rows (`src/petsciiDecoder.ts:50-115`), wrapping at a
user-chosen column count (`push()`, `:65-73`). Ours is a **screen**: 1,000
cells, colour RAM, cursor, charset bank, logical 80-character lines, scrolling
(`sdk/petscii/petscii-machine.ts:42-52`). Every difference below follows from
that.

### Codes it handles that our machine handles differently

| byte | viewer | ours | is it a defect on our side? |
|---|---|---|---|
| `$8D` shifted RETURN | row break **and `reverse = false`** (`petsciiDecoder.ts:76-85`, one branch for `$0D`/`$8D`/`$88`) | RETURN, reverse **preserved** (`petscii-machine.ts:141`, deliberately not `:140`'s `s.reverse = false`) | **No - the viewer is wrong.** `thoughts/shared/research/2026-09-01_true-petscii-reference.md:62` reads "`$8D` \| 141 \| Shift+RETURN (newline without cancelling modes)". Our behaviour is right, but it is **not pinned**: `sdk/tests/petscii/petscii-machine.test.ts:34` only covers `$0D` ("reverse video sets bit 7 of the screen code; RETURN cancels it", `:34-40`). Nothing asserts `$8D` leaves reverse latched. A one-line regression test is warranted. |
| `$88` (F7) | third row terminator - "C\*Base uses `$88` as a soft line break in message text" (`petsciiDecoder.ts:77-78`, `CHANGELOG.md` 0.4.0-beta) | no-op control (`petscii-machine.ts:151`) | **No.** `$88` is a *keyboard* code; a real C64 KERNAL does nothing with it on the screen. This is a C\*Base BBS convention, not a KERNAL one, and we are not C\*Base. It matters only if the sysop feeds us `.seq` files authored on C\*Base - then our render runs those rows together where his viewer breaks them. Not covered anywhere in `sdk/tests/petscii/`; `$88` appears in our tree only as an F7 *input* code (`sdk/petscii/petscii-input.ts:21`). |
| `$0E` / `$8E` charset | **stripped** (`petsciiDecoder.ts:36,43`); the bank is decided once by `detectCharset`, which scans only the **first 10 bytes** (`seqEditorProvider.ts:447-454`) and defaults to lowercase | every occurrence acts: `$0E` -> bank 1 **and** background/border to black (CCGMS, `petscii-machine.ts:131-136`); `$8E` -> bank 0 (`:137`) | **No - ours is stricter and correct.** A `.seq` that switches bank mid-file renders one way here and another way in the viewer. Pinned on our side at `sdk/tests/petscii/petscii-machine.test.ts:28-32`. |
| `$93` CLR | flushes the row and records a **marker** (`petsciiDecoder.ts:86-92`); the rows above stay on screen, optionally drawn as a green dashed rule (`media/viewer.js:153-166`) | actually clears 1,000 cells in the current pen, homes the cursor, drops every line link (`petscii-machine.ts:147`, `:254-261`) | **No.** The viewer's is a document-view convenience; a real caller's screen goes blank. Ours is pinned via the CLR path used throughout `sdk/tests/petscii/`. |
| `$14` DELETE | **not** in the strip set, so it falls to `isControlCode` and is painted as a middle dot `U+00B7` (`petsciiDecoder.ts:48`, `:101-102`) | destructive backspace across the whole logical line, with colour RAM (`petscii-machine.ts:148`, `:304-316`) | **No.** Ours is pinned at `sdk/tests/petscii/petscii-machine.test.ts:48-56` and across `sdk/tests/petscii/kernal-insert-delete.test.ts`. |
| `$94` INSERT | stripped (`petsciiDecoder.ts:44`) | full ROM E7F2-E826 model: line-growth test, `E965` open-space, the scroll, and the `$D8` insert count that makes following control codes print as reversed glyphs (`petscii-machine.ts:122-127`, `:339-395`) | **No.** `sdk/tests/petscii/kernal-insert-delete.test.ts` is the whole file. |
| `$11`/`$91`/`$1D`/`$9D`/`$13` cursor | stripped (`petsciiDecoder.ts:39-42`) | real cursor motion with scroll (`petscii-machine.ts:142-146`) | **No.** Our `~x`/`~y` MCI walk is built on exactly these (`web/backend/src/handlers/petscii-screen.render.ts:47-49`). |
| `$02` | not in the strip set -> painted as `U+00B7` | CCGMS background/border prefix (`petscii-machine.ts:130`, `:112-118`) | **No, but it is an interop trap worth telling the sysop.** Our `~b0..~b7` / `~z0..~z7` emit `$02 <colour>` (`petscii-screen.render.ts:37-40`). A `.seq` we generate, previewed in this viewer, shows a stray dot and no background change. |
| every other control byte | painted as `U+00B7` (`petsciiDecoder.ts:101-102`) | silent no-op (`petscii-machine.ts:151`) | **No** - but the viewer's placeholder is a genuinely useful *debugging* idea we have no equivalent of. |

### KERNAL behaviour we model and it does not

Logical 80-character lines and their link table (`petscii-machine.ts:62-63`,
`:196-216`, `:275-286`), scrolling (`:264-272`), the `$D8` insert count's
"control codes print as reversed glyphs" rule (`:69-79`, `:122-127`), colour
RAM per cell (`:58`), and the CCGMS `$02`/`$0E` background convention
(`:23-35`). The viewer models none of them. For a real C64 caller none of these
are optional, so nothing here is a gap on our side.

### The one place the two tables genuinely disagree

`media/viewer.js:11-15` converts PETSCII to screen code with CGTerm's
`kernal.c` formula:

```js
const SCCONV = [128, 0, -64, -32, 64, -64, -128, -128];
function toSc(b) { if (b === 0xFF) return 94; return (b + SCCONV[b >> 5]) & 0xFF; }
```

Ours is `sdk/petscii/screen-codes.ts:9-16`. Evaluated over all 256 bytes they
agree on **every printable byte, including `$FF` -> 94**, and differ on exactly
**64 bytes**: `$00-$1F` and `$80-$9F`. There, CGTerm returns the *reversed*
screen code (`$00`->128, `$80`->192), which is what the KERNAL prints for a
control byte under a pending INSERT; our function returns nonsense, because its
contract says so ("Callers filter control bytes first", `screen-codes.ts:8`).

That is not a defect today - the only two callers are
`petscii-machine.ts:152` and `ansi-to-petscii.ts:389`, both behind a
control-code filter, and our machine reimplements CGTerm's control-byte rule
inline at `petscii-machine.ts:125` (`b < 0x20 ? b : (b & 0x7f) | 0x40`, then
`| 0x80`) which is **byte-identical** to `toSc` on those 64 bytes. It is a
footgun for any new caller (an importer, say): `sdk/tests/petscii/screen-codes.test.ts:5-15`
asserts only printables and a `0x00-0x7F` round trip, so a control byte reaching
the function is silently wrong and no test says so.

---

## 2. `.petmate` - the format, and whether to import it

**It reads `.petmate`, and the format is trivial.** `src/petmateDecoder.ts:39-72`
is 34 lines of `JSON.parse`. Confirmed against a real upstream file
(`wbochar/petmate9`, `_defaults/boxes_n097a.petmate`, 17,651 bytes, fetched via
`gh api`):

```json
{"version":3,"screens":[0],"framebufs":[{"width":16,"height":48,
 "backgroundColor":6,"borderColor":14,"borderOn":false,"charset":"upper",
 "name":"Boxes_2","framebuf":[[{"code":85,"color":14},{"code":73,"color":14}, ...
```

### The container

- **Plain, uncompressed UTF-8 JSON.** No zip, no gzip. `petmateEditorProvider.ts:47-48`
  reads the file and `TextDecoder('utf-8')`s it; `petmateDecoder.ts:40` parses it
  directly. One `.petmate` is a whole *workspace*, not one screen.
- Top level: `version` (1..4 in the wild), `screens: number[]` (an ordered list
  of indices into `framebufs` - the page order), `framebufs: Framebuf[]`, and
  optionally `customFonts` (version >= 2) and `guideImages`/`framebufUIStates`
  (version >= 4). Authoritative shape: `wbochar/petmate9`
  `src/redux/workspace.ts` (`interface WorkspaceJson`, `framebufFromJson`).
- **Multi-screen handling:** `screens` is the index list; the viewer maps over it
  and throws on an out-of-range index (`petmateDecoder.ts:43-46`). Page
  navigation is `‹ / ›` over the resulting array (`media/petmateViewer.js:168-173`).

### One screen

- `width`, `height` - **arbitrary**, not 40x25 (the sample above is 16x48).
- `charset` - `'upper'` / `'lower'` for C64; also `c128vdc`, `vic20*`, `c16*`,
  `petGfx`, `petBiz`, `dirart`, or a custom-font id. The viewer accepts only
  `'upper'`/`'lower'` and returns `unsupportedCharset` for the rest
  (`petmateDecoder.ts:52-62`), painted as a red error line
  (`petmateViewer.js:109-117`).
- `backgroundColor`, `borderColor`, `borderOn` - palette indices 0-15.
  **The viewer reads `backgroundColor` and silently drops `borderColor` and
  `borderOn`** (`petmateDecoder.ts:56-69` has no `borderColor` field at all).
  Our canvas *does* paint a border (`PetsciiCanvas.tsx:151-153`), so an importer
  of ours should read it where the viewer does not.
- `framebuf: [[{code, color}]]` - row-major, `height` rows of `width` cells.
  **`code` is already a C64 screen code 0-255** including the reverse-video
  range `>= 0x80`; no PETSCII conversion is needed
  (`petmateViewer.js:134-136`: "Petmate stores explicit screen codes (0-255)
  and a per-cell color index directly"). `color` is a palette index 0-15.

### The decode path, end to end

`petmateEditorProvider.ts:47` read file -> `:48` UTF-8 decode -> `decode()`
(`petmateDecoder.ts:39`) -> `PetmatePage[]` -> serialised into the webview
config (`petmateEditorProvider.ts:122-134`) -> `renderPage()`
(`petmateViewer.js:89-158`) indexes the embedded ROM at
`(lowercase ? 2048 : 0) + cell.sc * 8` and blits 8x8 bits into an `ImageData`.

### Verdict for the logo pack

**Importing `.petmate` does not beat the hand-built logo pack - because the
pack does not have to be hand-built.** Petmate9 already ships a `.seq`
*exporter* (`wbochar/petmate9`, `src/utils/exporters/seq.ts`, `saveSEQ`), and
`Screens/groups/<KEY>.seq` (`docs/superpowers/specs/2026-09-03-c64-file-view-design.md:542-556`)
is defined as "40-column PETSCII art, **raw C64 bytes**" that "go out on the
PETSCII byte path exactly as every other `.seq` does" (`:596-598`). So the
correct instruction to the sysop's friend is a workflow, not code:

> Draw at 40 columns and at most 10 rows. **File -> Export -> SEQ**, with
> *Insert charset* and *Insert CR* on, *Insert clear screen* **off** (the logo
> is composited into a record, not a whole screen), *Strip blanks* off.
> Name it `<GROUP>.seq` and drop it in `Screens/groups/`.

What `saveSEQ` actually emits, checked against our machine: `$93` only if
`insClear`; then `$0E` or `$8E` per `isLowercaseCharset`; then per cell a
colour control byte from the standard 16-entry table (identical to our
`PETSCII_COLOR_TO_VIC`, `sdk/petscii/c64-palette.ts:28-31`) when it changes,
`$12`/`$92` around the reverse range, and the character byte. It **never emits
`$02`**, so an imported logo inherits the session's background - which is what
we want. Two traps to know:

1. `appendCR` (`seq.ts`) emits `bytes.push(currev ? 0x0d : 0x8d)` and does
   **not** clear its own `currev` afterwards. On a real C64 - and in our
   machine (`petscii-machine.ts:140`) - `$0D` cancels reverse, so the first
   reversed cell of the next row comes out un-reversed. Predictable, testable,
   and avoidable by asking for art whose row ends are not reversed, or by
   post-processing.
2. Its screen-code -> PETSCII export table differs from our
   `screenCodeToPetscii` (`screen-codes.ts:19-25`) at exactly one code: screen
   code `$5E` (pi), which Petmate writes as `$FF` and we would write as `$DE`.
   Both decode back to screen code `$5E` through
   `printablePetsciiToScreenCode`, so this is an equivalent encoding, not a
   bug - but a byte-identity test over a Petmate round trip must allow it.

**If** the friend delivers `.petmate` and will not export: an importer is a
small, well-bounded job - roughly 120-150 lines plus tests. It is
`JSON.parse` -> for each `screens[i]`, walk `framebuf` rows, and emit
`$0E`/`$8E` + per-run colour byte + `$12`/`$92` + `screenCodeToPetscii(code & 0x7f)`
- i.e. our own inverse of the viewer's renderer, reusing `screen-codes.ts` and
`c64-palette.ts`. Add: reject `width > 40` and `height > 10` (the spec's cap,
`:592-596`), reject any `charset` outside `upper`/`lower`, reject `customFonts`,
and read `borderColor` (which the viewer drops). Do **not** copy the viewer's
decoder - see section 5.

---

## 3. Rendering

### Its pipeline

Char ROM, not a font. `media/charRom.js` carries a base64 blob decoded to
`Uint8Array(4096)`: bytes 0-2047 bank 0, 2048-4095 bank 1, 8 bytes per glyph,
MSB leftmost, 1 = foreground (`charRom.js:1-11`, `docs/manual.md:298-306`). I
decoded it: exactly 4,096 bytes, screen code 0 is `@` (`00111100 01100110
01101110 01101110 01100000 01100010 00111100 00000000`), SHA-256
`fd0d53b8480e86163ac98998976c72cc58d5dd8eb824ed7b829774e74213b420`. **It is the
real Commodore character ROM**, not a redraw.

Painting is per pixel into one `ImageData`, `putImageData` once
(`media/viewer.js:119-168`):

```js
const drawFg = ch.r ? bgRgb : fgRgb;
const drawBg = ch.r ? fgRgb : bgRgb;
for (let cy = 0; cy < 8; cy++) {
  const byte = charsetData[offset + cy];
  for (let cx = 0; cx < 8; cx++) {
    const bit = (byte >> (7 - cx)) & 1;
    if (!ch.r && !bit) continue; // bg already filled
```

Ours (`packages/terminal/src/petscii/PetsciiCanvas.tsx:159-171`) is one
`drawImage` per cell out of a pre-tinted atlas:

```tsx
if (isBlankScreenCode(screenCode)) continue; // background fill above is already correct - draw nothing
const color = palette[s.colorRam[idx] & 0x0F];
const tinted = atlasCache.get(color);
const sx = glyphCellIndex(s.charsetBank, screenCode) * ATLAS_PX_SIZE;
ctx.drawImage(tinted, sx, 0, ATLAS_PX_SIZE, ATLAS_PX_SIZE, dx, dy, destCell, destCell);
```

### Where it is better

- **No web font.** `packages/terminal/src/petscii/glyph-atlas.ts:23` does
  `await document.fonts.load('${pxSize}px PetMe64')` and the whole atlas -
  therefore the whole screen - depends on a 389 KB TTF
  (`web/frontend/public/fonts/PetMe64.ttf`, declared at
  `web/frontend/src/index.css:72-73`) arriving. `PetsciiCanvas.tsx:125-130`
  already exists to log the failure mode ("A rejected atlas build (font fetch
  blocked, OffscreenCanvas denied) used to surface only as an unhandled
  rejection and a canvas that never draws"). A 4 KB inline ROM has no such
  failure mode.
- **No anti-aliasing to fight.** `glyph-atlas.ts:40-55` carries a 15-line
  comment and a `save()/clip()/restore()` per glyph purely because Chromium's
  rasteriser bleeds "a faint (~7% alpha) fringe past its nominal advance box
  into the NEXT cell". Blitting ROM bits cannot produce a fringe.
- **Six palettes with provenance**, user-selectable at runtime
  (`src/colorPalette.ts:11-53`, each with its upstream source URL in a comment;
  `Alt+1`..`Alt+6`). We ship two, `C64_PALETTE_COLODORE` and
  `C64_PALETTE_PEPTO` (`sdk/petscii/c64-palette.ts:16-25`), with no picker.
  Its Colodore is byte-identical to ours; its `pepto`/`cgterm` are
  byte-identical to our Pepto. `palette` (PAL/Offence), `vice` (6569R5) and
  `petmate` are three we do not have.
- **A background swatch row** (`viewer.js:171-187`), so a screen can be checked
  against the background it will actually be served on.

### Where ours is better

- **Border.** Ours paints one (`PetsciiCanvas.tsx:114`, `:151-153`,
  `UNIT_W/UNIT_H` at `:46-47`), in the border colour the machine tracks tied to
  the background (`petscii-machine.ts:245-251`). The viewer has no border at
  all and drops `.petmate`'s `borderColor`.
- **Cursor.** Ours has the C64's solid blinking block, overridable by the
  backend (`PetsciiCanvas.tsx:174-182`). The viewer has none - it is not a
  terminal.
- **Fitting the window.** Ours measures the container with a `ResizeObserver`,
  renders the backing store at `Math.max(1, Math.min(maxScale, Math.ceil(fitScale)))`
  and lets CSS scale down (`PetsciiCanvas.tsx:85-116`, with the "black sea"
  rationale at `:102-111`). The viewer is a hard 2x
  (`viewer.js:111-112`: `canvas.style.width = (currentCols * 16) + 'px'`) inside
  a scroll box, with a drag handle for column count instead
  (`viewer.js:318-345`).
- **Animation cost.** Ours coalesces bursts to one paint per animation frame
  (`PetsciiCanvas.tsx:202-221`, written for the sysop's "the ANSI animated
  logos play super slow in PETSCII mode"). The viewer rebuilds a whole
  `ImageData` and loops every pixel per render - fine for a static document,
  useless for a live screen.
- **Reverse video** is handled by both, differently and both correctly: the
  viewer swaps fg/bg per pixel (`viewer.js:137-138`); ours addresses the
  reverse glyph directly, because PetMe64 puts it at PUA `0xE000 + bank*0x100 + sc`
  with bit 7 set (`glyph-atlas.ts:8-11`, `:36-39`). Ours needs no per-pixel work.
- **The blank-cell invariant** ("a cell painted only with a background is
  invisible") is explicit and tested on our side
  (`PetsciiCanvas.tsx:31-38`, `web/frontend/src/components/__tests__/petscii-canvas-blank-cell-paint.test.tsx`).
  The viewer gets the same result implicitly by pre-filling.

---

## 4. Character mapping tables, as data

**The viewer has no Unicode table.** It never encodes; it decodes a PETSCII
byte straight to a glyph (`petsciiMaps.ts:8-10` packs byte+bank into a PUA
codepoint, `viewer.js:12-15` converts to a screen code, `charRom.js` supplies
the bitmap). So there is no row-for-row diff against
`sdk/petscii/unicode-to-petscii.ts`. What its ROM *does* prove is which screen
codes have a real glyph - and comparing that against our own normative table
(`web/backend/src/utils/petscii-unicode-map.ts:58-105`, transcribed from the
Unicode Consortium's C64IPRI/C64IALT) against our encoder
(`sdk/petscii/ascii-to-petscii.ts:46-66`) turns up a concrete gap.

Method: for every screen code 0x00-0x7F in each bank, take the glyph our
normative table assigns it, run it through `asciiToPetsciiByte(cp, bank)`, and
check the byte's screen code comes back. Script and output kept in the
scratchpad.

### Bank 1 (the bank all transduced text is printed in) - 13 glyphs we print `?` for

Ours emits `0x3F` for every row below (`ascii-to-petscii.ts:63`,
"unsupported glyph -> '?'"). All 13 have a real bitmap in the ROM the viewer
ships, in the bank we use.

| screen code | glyph | Unicode | PETSCII byte we should emit | today | same glyph in bank 0? |
|---|---|---|---|---|---|
| `$5C` | 🮌 | U+1FB8C LEFT HALF MEDIUM SHADE | `$DC` | `?` | yes |
| `$5E` | 🮖 | U+1FB96 INVERSE CHECKER | `$DE` | `?` | no (bank 0 is π) |
| `$5F` | 🮘 | U+1FB98 UPPER LEFT TO LOWER RIGHT FILL | `$DF` | `?` | no (bank 0 is ◥) |
| `$68` | 🮏 | U+1FB8F LOWER HALF MEDIUM SHADE | `$A8` | `?` | yes |
| `$69` | 🮙 | U+1FB99 UPPER RIGHT TO LOWER LEFT FILL | `$A9` | `?` | no (bank 0 is ◤) |
| `$6A` | 🮇 | U+1FB87 RIGHT ONE QUARTER BLOCK | `$AA` | `?` | yes |
| `$6F` | ▂ | U+2582 LOWER ONE QUARTER BLOCK | `$AF` | `?` | yes |
| `$74` | ▎ | U+258E LEFT ONE QUARTER BLOCK | `$B4` | `?` | yes |
| `$75` | ▍ | U+258D LEFT THREE EIGHTHS BLOCK | `$B5` | `?` | yes |
| `$76` | 🮈 | U+1FB88 RIGHT THREE EIGHTHS BLOCK | `$B6` | `?` | yes |
| `$77` | 🮂 | U+1FB82 UPPER ONE QUARTER BLOCK | `$B7` | `?` | yes |
| `$78` | 🮃 | U+1FB83 UPPER THREE EIGHTHS BLOCK | `$B8` | `?` | yes |
| `$79` | ▃ | U+2583 LOWER THREE EIGHTHS BLOCK | `$B9` | `?` | yes |

Ten of the thirteen (`$5C $68 $6A $6F $74 $75 $76 $77 $78 $79`) render the
**same** bitmap in both banks, which is the module's own stated admission rule:
"Only glyphs whose SCREEN CODE renders the same in BOTH charset banks are
mapped as plain bytes: screen codes `$60-$7F` (PETSCII `$A0-$BF`), plus `$40`,
`$5B` and `$5D`" (`sdk/petscii/unicode-to-petscii.ts:6-9`). Nine of those ten
are inside `$60-$7F` and are missing **purely by omission** - the table
enumerated `$61-$67, $6B-$6E, $7B-$7F` and skipped `$68, $6A, $6F, $74-$79`.
`$5C` is outside the window but qualifies on the same rule. The other three
(`$5E $5F $69`) are bank-divergent and need a decision, not an addition.

The gap bites: `▂ ▃ ▎ ▍` are the standard eighth-block set every modern
progress bar and meter is drawn from, so a blessed door's bar renders as a row
of `?` to a C64 caller even though the C64 has the exact glyph.

**Coverage:** `sdk/tests/petscii/unicode-to-petscii.test.ts:38-53` round-trips
27 named screen codes and none of these 13 appear. `:12-15` actively *forbids*
plain bytes in `$C0-$DF` outside `[0xC0, 0xDB, 0xDD]`, so adding `$DC` (and
`$DE`/`$DF`) requires widening that assertion with a reason. Nothing else in
`sdk/tests/petscii/` covers them. Recorded as executable fact in
**`sdk/tests/petscii/unicode-mapping-gaps.test.ts`** (added with this
research, `it.failing`, so the suite stays green).

### Deliberate substitutions, not gaps

Nine bank-0 glyphs resolve to a different screen code by design, because
`$41-$5A` are letters in bank 1 (`unicode-to-petscii.ts:9-12`): `♠ ♥ ♦ ♣`
and `•` -> `*` (`$2A`), and `╭ ╮ ╰ ╯` -> the square corners `┌ ┐ └ ┘`. Correct
and tested (`unicode-to-petscii.test.ts:76-78`).

### Tables that agree exactly

PETSCII colour byte -> palette index: `src/petsciiDecoder.ts:11-28` versus
`sdk/petscii/c64-palette.ts:28-31` - all 16 rows identical. Defaults identical
too: pen 14, background 0 (`colorPalette.ts:68-69` versus
`petscii-machine.ts:60`). Colodore identical (`colorPalette.ts:20-25` versus
`c64-palette.ts:16-19`); its `pepto`/`cgterm` identical to our Pepto.

---

## 5. Licence, provenance, and what to do

### Licence

**GPL-2.0-or-later** (`package.json:7`, `LICENSE.md:1`). Our SDK is **MIT**
(`sdk/package.json:233`). **No file, function or table from this repository may
be copied into `sdk/`, `web/backend/` or `packages/terminal/`.** Everything
worth having from it is a *fact about a file format* - and facts are not
copyrightable. Read it, then write our own.

Two further provenance notes:

- `media/charRom.js` is **Commodore's character ROM**, redistributed as base64.
  It is not the extension author's to license under GPL, whatever the repo
  says. VICE and every emulator ship it too and nobody has been sued, but if we
  ever want ROM-accurate glyphs in the browser the clean sources are
  KreativeKorp's redrawn PetMe outlines (which is what `PetMe64.ttf` already
  is) or a from-scratch bitmap - not this blob.
- The `.petmate` format facts in section 2 were verified against
  **`wbochar/petmate9`** itself (`src/redux/workspace.ts`,
  `src/utils/exporters/seq.ts`, `_defaults/*.petmate`), not taken from the
  viewer's 34-line decoder. Petmate9's own licence governs any code we take
  from *it*; we take none.

### Recommendation, ranked by value to a real C64 caller

A real caller sees bytes on a wire and glyphs on their own hardware. Most of
this extension is a developer's preview window and is worth nothing to them.
The ranking reflects that.

1. **Fix the 13 missing bank-1 glyph mappings.** The only item here that
   changes what a C64 caller sees. A door's `▂▃▎▍` progress bar is `????`
   today. **Job: ~13 lines in `sdk/petscii/unicode-to-petscii.ts`, plus
   widening the `$C0-$DF` guard at `unicode-to-petscii.test.ts:12-15` with a
   reason, plus flipping `unicode-mapping-gaps.test.ts` from `it.failing` to
   `it`.** Half a day, including deciding the three bank-divergent rows.
   Adopt.
2. **Take the Petmate `.seq` export workflow, not a `.petmate` importer.**
   Petmate9 exports `.seq` natively; `Screens/groups/<KEY>.seq` already wants
   raw C64 bytes. This unblocks the logo-pack lane for **zero code** - one
   paragraph of instructions to the sysop's friend (section 2). Adopt now.
3. **Pin `$8D` and `$0D`'s divergent reverse handling with a regression test.**
   We are right and the viewer is wrong, but nothing in
   `sdk/tests/petscii/petscii-machine.test.ts` says so, and a Petmate-exported
   `.seq` is full of both. **Job: three lines.** Adopt.
4. **Tell the sysop the two viewers disagree.** If he previews board art in
   this extension: `$02 <colour>` shows as a stray dot, `$93` does not clear,
   `$14` shows as a dot, a mid-file `$0E`/`$8E` is ignored, and `$8D` drops
   reverse. **Job: a paragraph in `handoff.md`.** Adopt.
5. **A `.petmate` importer**, only if the friend will not export `.seq`.
   ~120-150 lines plus tests, written from the format facts in section 2 -
   reject `width > 40` / `height > 10` / non-C64 charsets / custom fonts, and
   read `borderColor` (the viewer drops it). Defer until there is a file.
6. **Add the three palettes we lack** (PAL/Offence, VICE 6569R5, Petmate) and a
   picker. Zero value to a real caller - their monitor *is* the palette - some
   value to the sysop reviewing art in the browser. **Job: 12 lines of data
   plus a select.** Optional.
7. **Replace the PetMe64 atlas with an inline character ROM.** Removes the web
   font dependency (`glyph-atlas.ts:23`), the anti-alias fringe workaround
   (`glyph-atlas.ts:40-55`) and 389 KB of TTF. Genuinely better engineering,
   worth **zero** to a real C64 caller, and it needs a licence-clean ROM we do
   not have. **Job: half a day plus a provenance hunt.** Defer.
8. **Ignore** everything else: the decoder itself (GPL, and it is a document
   viewer's model, not a terminal's), the `U+00B7` placeholder, the CLS marker
   rule, the drag-to-resize columns, the VS Code chrome, and the `$88` C\*Base
   line break (a C\*Base convention, not KERNAL - adopt only if we ever ingest
   C\*Base art).

## Open questions

- Do any `.seq` files already on the board come from C\*Base (i.e. contain
  `$88`)? A `grep` over `Screens/` would settle whether item 8's `$88` caveat
  matters at all.
- The three bank-divergent rows (`$5E $5F $69`): add them bank-aware, or leave
  them at `?` and document the exemption? `encodePetsciiValue` already takes a
  `bank` argument (`ascii-to-petscii.ts:88-92`), so bank-aware is cheap.
