---
date: 2026-09-01
topic: RIPtermJS as the RIP graphics renderer, evaluated against our own
tags: [rip, terminal, frontend, evaluation]
status: final
---

# RIPtermJS evaluation

Question from the sysop: "is there some ready made rip graphics library we
can use to get full rip support?" Evaluated
[cgorringe/RIPtermJS](https://github.com/cgorringe/RIPtermJS) at its head
of 2026-08-31, cloned into the scratchpad.

## What it is

- 9,656 lines: `ripterm.js` (RIP parser/player, 3,576), `BGI.js` (a
  Borland Graphics Interface reimplementation on canvas, 3,025),
  `ansiterm.js`, `ansimusic.js`, plus `BGIsvg`/`BGIpotrace` (SVG export,
  not needed).
- Ships the `.CHR` vector fonts (BOLD, EURO, GOTH, LCOM, LITT, SANS, SCRI,
  TRIP, TSCR), the 8x8/8x14 bitmap fonts, and 219 icons.
- **MPL 2.0.** File-level copyleft: vendoring is fine, modified files stay
  MPL and keep their headers. README asks for credit and a link.
- Active - last commit yesterday. In production at lord.town.
- Version 0.4, "under development". Known gaps from its own README:
  filled circles/ovals/pies slightly wrong, polylines slightly off, button
  label position slightly off, text-window scrolling in progress.

## Coverage, against our own renderer and against the board's files

Our renderer after today's fixes: 51 command types defined, 40 parsed, 29
drawn. The board's 94 RIP files use 28 types plus 9 the parser does not
know at all.

RIPtermJS's command table: `w v * e E g H c Q a W m T @ Y X L R B C O o
A V I i Z P p l F = S s 1M 1K 1C 1P 1I 1B 1U 1␛ h ! #` plus the host
variables (DATE, TIME, TERMINFO ...) and text-window commands.

That is every type we define, every type our files use, AND the ones we
cannot parse - `1P` (177 uses), `1C` (67), `1I` (43) are the icon and
clipboard commands, which are how most RIP menus draw their buttons. It
also draws the five we parse but do not render: `1B` button styles (97),
`Z` bezier (47), `s` fill patterns (42), `O` oval (24), `i` pie (6).

Flood fill with patterns, real `.CHR` fonts, and icons are the three
things our renderer would need weeks to reach and it has them.

## Integration shape

Two ways in, both workable:

1. **Stream.** `setupStream(ReadableStream)` then `playStream()`. Its
   state machine handles mixed ANSI+RIP and recognises `ESC[1!`/`ESC[2!`
   itself. Socket chunks would be pushed into a `ReadableStream` via a
   controller. It has its own modem-speed throttle we would set to 0.
2. **Per command.** `parseRIPcmd(inst)` -> `[cmd, args]`, then
   `runRIPcmd(cmd, args)`. Feedable straight from our existing buffer
   without the stream. Simpler, and keeps our `RIPRendererRef.render()`
   contract, so `BBSTerminal.tsx` stays untouched.

Recommended: (2), behind the existing `RIPRendererRef`.

## Costs, honestly

| item | cost |
|---|---|
| No module system - global-script classes, `// import` commented out | vendor into `packages/terminal/src/rip/vendor/`, add ESM exports at the bottom of each file (MPL allows, note it in the header) |
| Canvas by DOM id only (`canvasId`) | our React component renders a canvas with an id, instantiates after mount - the same mount-effect we already have |
| Fonts and icons fetched at runtime by relative path (`fontsPath`, `iconsPath`) | copy `fonts/` and `icons/` to `web/frontend/public/rip/`; same origin, no CSP issue; ~1.5 MB |
| Buttons and mouse regions send text to the host | find its send hook and wire to `socket.emit('terminal-input')`; not yet located, expect small |
| Browser-only (`window`, `document`, canvas) | jest cannot execute it; the pipeline test drops to parse-level checks and a smoke test that the classes load |
| `refreshInterval` timer keeps running | stop() on unmount, as we do for our own timers |
| Credit requirement | a line in the RIP overlay's console banner and in `Documentation/`, plus the licence file alongside the vendored code |

Estimate: about one working day to a first picture, most of it the
vendor/ESM wrapping and the asset paths. Half a day more for buttons.

## What we would throw away

`RIPParser.ts`, `RIPTypes.ts`, `RIPRenderer.tsx` - ~1,400 lines that draw
29 commands with a `monospace` font and no fill patterns. Today's fixes to
them (synchronous state, palette commands, chunk boundaries) were correct
and are the reason anything renders, but they are not an argument for
keeping a renderer that will never reach icons.

## Recommendation

**Adopt, vendored, behind the existing `RIPRendererRef` contract.** The
alternative is reimplementing BGI flood fill, `.CHR` font rendering and
the icon commands by hand, which is the bulk of what RIPtermJS's 9,656
lines are. Its known gaps are cosmetic (shapes "slightly off"); ours are
whole command families that do not draw.

Risk to name: it is one person's 0.4. If it stalls, we own a vendored copy
under MPL and can fix it in place, which is a better position than owning
1,400 lines that cannot draw a button.
