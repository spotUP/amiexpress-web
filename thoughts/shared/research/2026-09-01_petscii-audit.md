---
date: 2026-09-01
topic: PETSCII support audit — every flaw, with root causes
tags: [petscii, c64, audit, terminal, rendering]
status: final
---

# PETSCII Support Audit

Companion spec: `thoughts/shared/research/2026-09-01_true-petscii-reference.md` (verified PETSCII tables, palettes, fonts, detection conventions, rendering architectures).

Symptom (screenshot 2026-09-01): BBSTITLE.SEQ renders as tofu "?" glyphs + smeared color bars across 80 columns; only reverse-video color runs and later-drawn text survive.

## Verified facts

- `web/frontend/public/fonts/PetMe64.ttf` = genuine "Pet Me 64" (Kreative Korp), 389 KB, 3809 mapped codepoints. **U+E000–E1FF fully covered, zero gaps**, layout confirmed by outline comparison: `U+E001` ≡ glyph `A` (bank 0, screen code $01), `U+E101` ≡ `a`, `U+E141` ≡ `A` (bank 1), `U+E080` = reverse glyph. Screen-code order, both banks, reverse included — exactly what `petsciiToScreenCode()` + `0xE000/0xE100` base assumes. Also covers U+1FBxx (213 glyphs) and U+25xx (251).
- So the tofu is **not** a font-coverage problem and **not** a mapping-table problem.

## Flaws

### A. Root causes of the screenshot (critical)

| # | Flaw | Where |
|---|---|---|
| A1 | **PetMe64 never preloaded.** The font preload effect loads only Topaz/mOsOul faces — PetMe64 absent from the list. xterm.js draws to canvas; canvas won't fetch a CSS `@font-face` on demand, so every PUA glyph rasterizes with the fallback (`TopazPlus`/`Courier New`) → `.notdef` "?" tofu. | `packages/terminal/src/components/BBSTerminal.tsx:269-275` (list), `web/frontend/src/index.css:71-74` (unused-by-canvas @font-face) |
| A2 | **No glyph-atlas invalidation on font switch.** `term.options.fontFamily` is changed then content written immediately (`BBSTerminal.tsx:2044-2047`, `2070-2077`); xterm caches rasterized glyphs per atlas — even after the font eventually loads, cached tofu stays. No `clearTextureAtlas()`/refresh-after-`document.fonts.load`. | `BBSTerminal.tsx:2036-2078` |
| A3 | **40 columns not guaranteed.** `petscii-output` handler writes art without resizing; 40-col resize only happens via a separate `terminal-resize` event (only emitted on the `P` graphics answer path, `pre-login.ts:138-149`) or NAWS. C64-detected and `.seq`-fallback paths can deliver art into an 80-col terminal → art smears/wraps wrong (screenshot spans full width). | `BBSTerminal.tsx:2036-2048` vs `2065-2078`; `web/backend/src/handlers/command-handler/pre-login.ts` |
| A4 | **RETURN doesn't cancel reverse video.** Real KERNAL: $0D turns RVS off. Converter emits `\r\n` without resetting `state.reverseVideo` or emitting `SGR 27` → reverse bleeds across lines = the giant solid color bars. | `web/backend/src/utils/petscii.util.ts:285-286` (PetMe64 path), `:357` (ANSI path) |
| A5 | **Unhandled control codes fall through to the printable path.** Only a subset of $00–$1F/$80–$9F is handled; the rest ($01,$02,$04,$06,$07,$0A,$0B,$0C,$0F,$10,$15–$1B,$80,$82,$84,$8F…) reach `petsciiToScreenCode()` which maps $00–$1F → +$80 → PUA reverse glyphs → garbage characters injected into art. Should be no-ops. | `petscii.util.ts:133-137` + fallthrough at `:303`, `:135` |

### B. Wrong machine model (architecture)

| # | Flaw |
|---|---|
| B1 | xterm.js is a VT/ANSI machine; PETSCII is a screen editor. Missing semantics: **global charset flip** ($0E/$8E must retro-change every glyph already on screen — converter only affects subsequent bytes), per-cell color RAM, logical 80-char lines, destructive DELETE ($14 → emitted as plain `\x08`, non-destructive), INSERT line-shift, HOME/CLR interplay. Charset-switching art renders wrong by construction. |
| B2 | **Converter state resets every chunk.** `convertPetsciiToPetMe64()` creates fresh state (white, unshifted, RVS off) per call and appends `SGR 0` — color/charset/reverse continuity across streamed chunks is destroyed. Fine for one-shot screens, broken for streaming (doors `writePetscii()`, multi-emit screens). `petscii.util.ts:466-482`. |
| B3 | **`petscii-output` bypasses the modem emulator.** ANSI output routes through `modemEmulatorRef` pacing queue; PETSCII writes go straight to `term.write` (`BBSTerminal.tsx:2037-2048`) → out-of-order interleaving with throttled ANSI, and no baud pacing for art that's designed to animate as it draws. |
| B4 | Reverse video emitted as SGR 7 instead of screen-code +$80, even though the font ships dedicated reverse glyphs (U+E080–E0FF/E180–E1FF). Works visually in xterm but throws away pixel-exact reverse glyphs and couples to A4. |

### C. Colors / palette

| # | Flaw |
|---|---|
| C1 | **No C64 palette anywhere in the repo** (confirmed by sweep). Colors approximated to 16-color ANSI: orange→yellow, brown→yellow (duplicate), grey $98 and light grey $9B both →`SGR 37` (collision), red is pure ANSI red not VIC-II `#813338`. `petscii.util.ts:74-91`. Fix: truecolor SGR (38;2;r;g;b) from Pepto/Colodore tables, or xterm theme per session. |
| C2 | No C64 default screen state: real C64 = light blue text on blue background with border; converter forces white-on-(terminal default) black. No border emulation. |

### D. ANSI-fallback converter (`convertPetsciiByte`, for non-PetMe64 terminals)

| # | Flaw |
|---|---|
| D1 | Graphics map partly invented: $B0–$BA assigned box-drawing corners that don't match real PETSCII glyphs; $BB–$BF missing (default full block); $C0–$DF (unshifted graphics: horizontals, crosses, circles, diagonals) → all "full block" except $C0; $E0–$FF → space. `petscii.util.ts:401-448`. |
| D2 | Unicode 13 Symbols for Legacy Computing (U+1FB00–1FBFF — designed for PETSCII) unused; correct lossless standard-Unicode mapping exists and the shipped font even covers it. |
| D3 | Unshifted $61–$7A rendered as lowercase letters ("graphics approximation") — wrong glyph class. `petscii.util.ts:396`. |

### E. Real-C64 client output path (broken)

| # | Flaw |
|---|---|
| E1 | **`screenCodeToPetscii()` cannot represent reverse-video screen codes.** $80–$9F → returns $00–$1F = raw control bytes (color changes, charset flips, clear-screen!) injected into the stream; $A0–$BF falls into the wrong branch; never emits $12/$92. Any reverse content corrupts a real C64's screen. `petscii.util.ts:186-214`. |
| E2 | `convertUnicodePuaToPetscii()` ANSI parser: multi-param SGR (`0;37`) not split → dropped; counted cursor moves (`ESC[5C`) emit a single move; absolute positioning (`ESC[r;cH`) dropped unless `1;1`; SGR 7/27 only as bare params. `petscii.util.ts:603-706`. |
| E3 | `convertAsciiToPetsciiOutput()` encodes for **shifted** charset but nothing ever sends $0E to put the client in shifted mode; a C64 at power-on default (up/gfx) shows $C1–$DA as graphics junk instead of letters. `petscii.util.ts:747-803`. |
| E4 | `convertAnsiToPetscii()` (used by `writePetsciiSeqFile` + `dev/scripts/convert-to-petscii.ts`): ASCII lowercase passed through unchanged (= graphics in PETSCII), uppercase not case-swapped, no charset prelude → generates broken `.seq` files. `petscii.util.ts:559-579`. |

### F. Detection / negotiation

| # | Flaw |
|---|---|
| F1 | Detection = TTYPE substring (`C64/COMMODORE/PETSCII`) + NAWS 40×25 heuristic. Real C64 clients behind WiFi modems typically negotiate nothing → never detected. Industry convention (Synchronet): **dedicated ports** (64 = 40-col PETSCII, 128 = 80-col) and/or the DEL-probe ("Press DELETE": PETSCII DEL = $14 vs ASCII $08/$7F). Neither implemented. The famed "client sends 0x83" is folklore — don't add it. `telnet-server.ts:288-333`, `index.ts:1302-1336`. |
| F2 | NAWS 40×25 → C64 misdetects any modern client resized to 40 cols. |
| F3 | (Adjacent bug, found during audit) `isAmiga` matches substring `TERM` — which matches `XTERM`; `unicodeCapable = isModern && !isAmiga && !isC64` → **xterm reports unicodeCapable=false**. `telnet-server.ts:295-321`. |
| F4 | Inbound $FF (π) dropped by input converter; acceptable, but no test for IAC-doubled π round-trip on the telnet path. |

### G. Input path

| # | Flaw |
|---|---|
| G1 | `convertPetsciiInputToAscii()` strips cursor keys, F-keys, color keys — C64 caller can't use full-screen editors/doors. `petscii.util.ts:823-890`. |
| G2 | Browser users in PETSCII mode have no key→PETSCII graphics entry (acceptable, note only). |
| G3 | `.seq` detection is extension-only (`isPetsciiSeqFile`) — any user file named `*.seq` in file areas gets converted as a screen where these paths overlap. Minor. |

## Fix strategy

Two tiers (details + citations in the reference doc §6):

**Tier 1 — make the current xterm path correct (small, high yield):**
1. Add PetMe64 to the preload list; after `document.fonts.load`, switch font, call `term.clearTextureAtlas()` (or recreate renderer), then write. Buffer petscii-output until font ready.
2. Resize to 40×25 (and back) as part of the petscii-output contract, not a separate optional event; route PETSCII through the modem emulator.
3. petscii.util.ts correctness: unknown controls → no-op; $0D cancels RVS (emit `\x1b[27m`, reset state); persistent per-session converter state; truecolor C64 palette (Pepto + Colodore constants); consider +$80 reverse screen codes instead of SGR 7.
4. Fix E1–E4 (real-C64 path) + F3. Regression tests per fix (existing suite: `tests/utils/petscii.util.test.ts`).

**Tier 2 — true PETSCII (the "correct" architecture, reference §6.2c):**
- Canvas PETSCII renderer component: 1000-cell screen-code matrix + color RAM + {charset bank, RVS, pen}, KERNAL screen-editor rules (global charset flip repaints, logical lines, destructive DEL/INS), 8×8 glyphs from chargen ROM or PetMe64 atlas, VIC-II palette, blue border, `image-rendering: pixelated`, baud-paced byte queue. Swap in for petsciiMode sessions; keep xterm for ANSI. Send **raw PETSCII bytes** end-to-end to the frontend (stop converting to PUA-in-ANSI-soup server-side); real C64 clients get the same bytes (IAC-escaped).
- Detection: dedicated telnet port(s) + DEL-probe prompt fallback.

This is what CGTerm/SyncTERM/Petmate/lvllvl all do — nobody renders PETSCII through a VT-style text widget.

## Closure (2026-09-02)

The true-PETSCII overhaul (`thoughts/shared/plans/2026-09-01-true-petscii.md`,
tasks 1-11, `.superpowers/sdd/2026-09-01-true-petscii/`) closed every flaw
below. "Fixed" means the referenced task changed the code path the flaw
named; "deferred" is scoped-out work with a stated reason; "accepted" is a
flaw the team chose to leave as-is, not an oversight.

| Flaw | Status |
|---|---|
| A1 | Fixed in Task 5 |
| A2 | Fixed in Task 5 |
| A3 | Fixed in Task 5 |
| A4 | Fixed in Task 1 |
| A5 | Fixed in Task 1 |
| B1 | Fixed in Tasks 7-9 (PetsciiMachine/PetsciiCanvas replace the VT-style xterm model for the raw-byte path; the legacy xterm/PUA path is kept as a fallback and remains an approximation by design, not a regression) |
| B2 | Fixed in Task 3 |
| B3 | Fixed in Tasks 5 and 9 |
| B4 | Fixed in Task 1 |
| C1 | Fixed in Task 2 (VIC-II truecolor palettes), extended by Tasks 7-8 (canvas renders true palette directly, no SGR approximation) |
| C2 | Fixed in Task 2, extended by Tasks 7-8 (canvas renders the C64 border and default blue-on-blue screen state) |
| D1 | Fixed in Task 11 |
| D2 | Fixed in Task 11 |
| D3 | Fixed in Task 11 |
| E1 | Fixed in Task 4 |
| E2 | Fixed in Task 4 |
| E3 | Fixed in Task 4 |
| E4 | Fixed in Task 4 |
| F1 | Fixed in Tasks 6 and 10 (DEL-probe at connect and at the graphics prompt, plus the dedicated `TELNET_PETSCII_PORT`). Passive-only autodetection of a real C64 that negotiates nothing and never presses a key first remains impossible in principle — documented, not a defect. |
| F2 | Fixed in Task 6 (NAWS 40x25 demoted to a hint below TTYPE and the DEL-probe, no longer sufficient on its own) |
| F3 | Fixed in Task 6 (`isAmiga` no longer matches the `TERM` substring inside `XTERM`) |
| F4 | Accepted: inbound `$FF` (pi) is dropped by the input converter by design; IAC-doubling of that byte at the telnet transport layer was verified separately (Task 9) |
| G1 | Partially fixed: the keymap translates cursor/movement/F-keys to PETSCII bytes client-side (Tasks 7-9), but server-side acceptance of those bytes into doors/editors is deferred — a real C64 caller still cannot drive a full-screen editor over this path |
| G2 | Accepted: browser-side C= graphics-key entry is out of scope (declared exemption, `task-12-brief.md` deliberate scope exemptions list) |
| G3 | Accepted: `.seq` detection stays extension-only; a user file named `*.seq` in a file area would be read as PETSCII content by the same check a screen load uses. Documented in `Documentation/2-Sysops/CONFIGURATION.md` section 5. |
