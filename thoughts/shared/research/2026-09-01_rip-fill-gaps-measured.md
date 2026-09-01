---
date: 2026-09-01
topic: The RIPtermJS "fill gaps" measured against this board's corpus - none of them manifest; what the residue actually is
tags: [rip, riptermjs, terminal, research, measurement]
status: final
---

# The RIP fill gaps, measured

Open item 5 of the session-close handoff: RIPtermJS's README admits
"filled circles/ovals/pies slightly wrong, polylines slightly off, button
label position slightly off". This is what those claims amount to on THIS
board, measured rather than assumed.

## Method

Two harnesses, both kept as regression tests:

- `web/frontend/src/components/__tests__/rip-bgi-shapes.test.ts` - BGI
  drawn headless into its palette-index byte buffer (a fake 2D context
  supplies only `canvas`, `createImageData`, `addEventListener`), pixels
  asserted with `bgi.getpixel()`.
- `web/frontend/src/components/__tests__/rip-corpus-coverage.test.ts` -
  all 144 board `.rip` files (59,524 instructions) through RIPterm's own
  `parseRIPcmd` + dispatch table, with the stream reader's semantics
  reproduced: backslash-newline joins (ST_BSLASH) and control-char to
  Unicode-symbol mapping before dispatch (`sendToRIP` ->
  `controlCharsToSymbols`).

## Findings

1. **Filled ovals are fine.** The suspicious commented-out "finish tip of
   ellipse" code notwithstanding, `fillellipse` covers the full vertical
   extent of a tall ellipse, the full horizontal extent of the centre row,
   and stays inside its bounding box. 149 `|o` uses across 11 files render
   correctly.
2. **Pies are fine for everything the corpus does.** The seed-point flood
   fill I expected to fail on thin slices fills a 0..10 degree slice, does
   not escape the ellipse for any tested wedge, and respects the wedge
   boundary. A full 0..360 sector shows a border-coloured radius seam at
   angle 0 - real Borland BGI draws that seam too; it is correct, not a
   defect.
3. **The button-label gap cannot manifest here.** All 276 `|1B` button
   styles across all 144 files are orientation 2 (center) with no
   left/right justification bits, and the center math is at worst off by
   one pixel. The TODO-riddled orientations (above/left/right/below) are
   unused on this board.
4. **Aspect ratio is handled**: RIP mode sets `setaspectratio(372, 480)`,
   the EGA-mode RipTerm value, so `C`/`I` circles and pies come out the
   right shape.
5. **Two false alarms from my own sweep**, worth remembering:
   `MISSING 1\x1b` (146 uses in 50 files, e.g. `Node1/bbstitle.rip`'s
   `$MUSIC$`/`$BEEP$` RIP_QUERYs) dispatches fine live because
   `sendToRIP` maps ESC to `␛` before lookup - the table keys the
   SYMBOL, not the byte; and a naive line splitter breaks `\`-wrapped
   commands the real reader joins.
6. **The genuine residue is RIPscrip 2.0, not fill bugs**: under 50
   instructions spread over a handful of gallery files in `RIPgraphics/`
   (HAWK, LAYOUT, STARFLD, TNG2, EAGLE, screemOTE, JUSTCUZ, PLAYPOOL):
   `y J n M f`, `k N x K`, `1T 1A`, and `1i`/`1p` with `MSG`/`ASTRO.JPG` -
   v2 multimedia. RIPtermJS targets 1.54; these are 2-10 instructions per
   file, the rest of each file renders, and none appear in conference
   menus or node titles. The coverage test tolerates exactly these
   opcodes, only under `RIPgraphics/`, within a fixed budget - growth is
   a decision, not an accident.

## Consequence

No vendor code was changed. The item closes with guards instead of fixes:
a vendor update that loses coverage, or a new board file needing an
unsupported command, now fails the frontend suite instead of drawing a
hole on live.
