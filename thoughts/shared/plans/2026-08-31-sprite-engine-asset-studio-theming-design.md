---
date: 2026-08-31
topic: "Sprite engine, asset studio door, and door chrome theming"
tags: [sprites, animation, editor, themes, nine-slice, arcade, pengo, doorman, sdk, design]
status: final
session: amiexpress-web (sound-effects/menu session, continued)
---

# Sprite engine, asset studio, and door theming — design

Approved in conversation 2026-08-31. This is the WHAT and the WHY; the
implementation plan (separate document, written next) is the HOW and the
order.

## The ask, as it accumulated

1. Pengo is cute but tiny: use the full terminal, draw sprites with more
   than one character, give them detail and animation.
2. Plan it properly: a sprite engine with animation support, and an editor.
3. The editor should fork the ANSI editor the BBS already has.
4. The editor should be responsive, the way the livechat door is.
5. The editor should also serve as a UI designer: themes for the doors.
6. Themes are not just palettes - panels, borders, everything customizable.
7. Borders should be 9-slice, so designers draw one and it resizes.
8. Theming pilots on a chrome-heavy door. DOORREPO was proposed; it is a
   68K Amiga binary that draws its own ANSI inside the emulator, so themes
   cannot reach it. DOORMAN (`Doors/door-manager`) is the pilot instead.

Three subsystems fall out: a **sprite engine**, an **asset studio door**,
and **chrome theming**. One shared cell model underneath all three.

## What already exists (reuse, do not rebuild)

| piece | where | role in this design |
|---|---|---|
| ANSI editor engine | `sdk/engines/ui/ansi-editor/` (~8.7k lines: canvas, drawing tools, brush modes, colour picker, character picker, keyboard handler, viewport, `.ans`/`.asc`/`.xb` + SAUCE file-ops) | the editor: the studio door is a fork of its door wrapper reusing this engine wholesale |
| ANSI editor door wrapper | `Doors/ansi-editor/index.ts` (871 lines) | template for hosting the engine in a door |
| `Cell { char, fg: 0-15, bg: 0-15 }` | `sdk/engines/ui/ansi-editor/types.ts` | the canonical cell. Sprites, borders and art all use this shape; numeric 0-15 colours, names only at the blessed boundary |
| `createScreen` + `screen:resize` | `sdk/utils/blessed-helpers.ts` | responsiveness. The backend emits `screen:resize`; percentage layouts re-flow. This is what makes livechat responsive; the studio uses the same path |
| SDK blessed layer | `sdk/engines/ui/blessed/` (Panel, List, confirm-modal, ...) | the single choke point where a theme applies. Every TS door builds its widgets here |
| Arcade shell | `sdk/engines/ui/arcade/` (menu, sfx) | `MENU_COLORS` becomes theme-fed; precedent for "shared module, pilot one door, roll out" |
| Old sprite toy | `sdk/src/game-engine/sprite.ts` + `sprite-manager.ts` (157 lines, one colour per sprite, no consumers) | superseded. Left in place with a pointer comment; not extended |
| Subcell/braille graphics | `sdk/engines/graphics/` | unrelated to this design; braille rejected for sprites (one colour per char = mush) |

## Shared foundation: the cell-art module

`sdk/engines/graphics/cell-art/` — pure, dependency-free, no blessed
import. Package export `./engines/graphics/cell-art` (both `dist` and
`dist-esm`; remember `tsconfig.client.json` includes, the arcade module
needed the same).

- **`cells.ts`** — `Cell { char, fg, bg }` with numeric 0-15 colours
  (type-compatible with the ANSI editor's), `CellBuffer` (rows of
  `Cell | null`; `null` = transparent, paint nothing), compose/blit
  helpers, and ONE function that turns a buffer row into a blessed tag
  string via the 16-colour palette map. Colour names exist only there.
- **`sprite.ts`** — model, loader, animation timing (below).
- **`nine-slice.ts`** — border asset model, loader, frame renderer (below).

Everything in this module is a pure function of its inputs. That is what
makes all of it testable without a terminal, the same property that made
the sound cues and the arcade menu testable.

## Subsystem 1: the sprite engine

### Format — `Doors/<door>/sprites/<name>.sprite.json`

```json
{
  "name": "pengo",
  "cellW": 5,
  "cellH": 2,
  "animations": {
    "walk-right": {
      "ticksPerFrame": 4,
      "loop": true,
      "frames": [
        [ [["(", 11, 0], ["o", 15, 0], null, null, null],
          [["/", 11, 0], ["_", 11, 0], [")", 11, 0], null, null] ]
      ]
    }
  }
}
```

- A frame is `cellH` rows of `cellW` entries; each entry `[char, fg, bg]`
  or `null` (transparent).
- Every animation's every frame must match `cellW`×`cellH`; the loader
  throws with the sprite name, animation and frame index on mismatch. A
  malformed sprite fails the DOOR LOAD loudly, not the first draw quietly.
- `loop: false` animations hold their last frame (death, shatter).
- JSON on purpose: git-diffable, hand-editable in a pinch, and exactly what
  the studio saves.

### Runtime

- `loadSpriteSheet(dir)` — reads every `*.sprite.json` in a door's
  `sprites/` directory once at door start.
- `frameAt(animation, tick)` — pure: which frame at game tick N. Driven by
  the door's existing `frameCount`, never by wall clock, so animation state
  is deterministic and assertable (same rule as the game clocks).
- `blit(buffer, sprite, animationName, tick, cellX, cellY)` — composes a
  sprite's current frame into a `CellBuffer` at a cell position;
  transparent entries leave the background.
- The door renders: build buffer (background terrain, then sprites in
  z-order: terrain, blocks, eggs, diamonds, enemies, player), then one
  tags-line per row into the blessed box. This replaces the per-door
  `game/sprites.ts` glyph tables in adopting doors.

### Testing

Loader validation (dimension mismatch, bad colour range, unknown keys
tolerated), `frameAt` timing (ticksPerFrame boundaries, loop vs hold),
transparency (null leaves the underlying cell), z-order, tag output for a
known buffer. All pure; RED-verified per repo rule.

## Subsystem 2: Pengo pilot (sprites)

The geometry decision, approved: **maze 15×13 → 15×10, cells 5 wide × 2
tall**. Board 75×20 on the fixed 80×24 game screen. Layout: HUD 1 row,
board 20 rows, status+hint 1 row, 2 rows spare. 13 maze rows × 2 = 26 was
the impossible number; 10×2 fits with the whole width used.

- Screen layout constants change (`GRID_HEIGHT` 10, new `CELL_H 2`,
  `CELL_WIDTH` 5); layout tests updated the way Frogger's were — the box
  must fit its parent, measured from the door's real constants.
- Sprites shipped (hand-authored JSON first; the studio edits them later):
  - **pengo** — walk ×4 directions (2 frames each), push, death
    (hold-last)
  - **sno-bee** — crawl (2 frames), stunned (wobble), hatching
  - **ice block** — idle (subtle 2-frame shimmer), sliding
  - **diamond block** — sparkle (slow loop)
  - **wall** — idle, shake
  - **egg** — idle pulse
- Game logic is untouched except constants: the grid, movement, collision
  all stay cell-based. Only the DRAWING layer changes. Gameplay tests keep
  passing unmodified except where they assert grid dimensions.
- The existing `game/sprites.ts` glyph module is deleted in the same
  change; its colour-contrast rules (complement table) migrate into the
  sprite JSONs as drawn colours.

Reachability proof for the phase: PENGO on the local board, full-width
board, visibly animated. The other eight doors are NOT touched in this
phase.

## Subsystem 3: the asset studio door

`Doors/sprite-editor`, BBS command `SPRITED`, sysop access (it writes
assets that every player sees). Fork of the `Doors/ansi-editor` wrapper,
reusing `sdk/engines/ui/ansi-editor` for canvas, tools and pickers.

Four modes on one engine:

1. **Sprite** — canvas fixed to the sprite's `cellW`×`cellH` (zoomed
   view via the existing viewport), a frame strip (add / duplicate /
   delete / reorder), per-animation `ticksPerFrame`, play/pause preview
   running at that speed, animation list per sprite. Saves
   `.sprite.json`. Opens any door's `sprites/` directory.
2. **Art** — the ANSI editor as it already is (`.ans` etc.), pointed at
   `Doors/<door>/art/`. Nothing new to build beyond the file browser.
3. **Theme** — a property form for the theme schema (below) beside a live
   preview screen: sample panel, list with selection, modal with buttons,
   arcade menu strip, HUD line — re-rendered on every edit. Colour and
   char pickers reused.
4. **Border** — draw a border canvas, drag two slice guides each way,
   preview the frame rendered at three sizes (small / wide / tall) live,
   so tiling artifacts show immediately. Saves `.border.json`.

Responsive like livechat: built on `createScreen` (which subscribes to the
backend's `screen:resize`) with percentage layouts. Minimum 80×24;
larger terminals get more canvas and preview room.

The studio needs a directory browser over `Doors/*/sprites|art|themes` —
server-side RPC listing/reading/writing those files, path-guarded to the
`Doors/` tree with resolved-path checks (the door-delete lesson: a
resolved-path guard, not a trusted string).

## Subsystem 4: chrome theming

### Theme format — `Doors/<door>/theme.json`

```json
{
  "name": "amber-crt",
  "palette": { "accent": 11, "text": 7, "dim": 8, "alert": 9 },
  "panel":   { "border": { "style": "line" }, "borderFg": 10,
               "bg": 0, "labelFg": 15 },
  "list":    { "itemFg": 7, "selectedFg": 11, "selectedBg": 4 },
  "modal":   { "borderFg": 10, "bg": 0, "buttonFg": 7, "buttonBg": 4,
               "focusFg": 0, "focusBg": 10 },
  "menu":    { "title": 11, "titleBg": 4, "selected": 11, "selectedBg": 4,
               "option": 7, "hint": 8, "subtitle": 14 },
  "hud":     { "fg": 7, "bg": 0 },
  "hint":    { "fg": 8 }
}
```

- Colours are numeric 0-15, same space as cells.
- `panel.border` is either `{ "style": "line" | "double" | "ascii" }` or
  `{ "asset": "amber-frame" }` referencing a 9-slice border asset in the
  door's `borders/` directory.
- Partial themes are legal: anything absent falls through to the default.

### Application — one choke point

- `sdk/engines/ui/blessed/theme.ts`: `setTheme(theme)` /
  `currentTheme()`, plus `DEFAULT_THEME`, which is written by READING the
  values the widgets use today, so an unthemed door renders byte-identical
  before and after this subsystem lands. That identity is a test, not a
  hope: render a reference screen (panel + list + modal) to tags before
  the change, snapshot it, assert the themed default reproduces it.
- Widget constructors merge: explicit options given by the door WIN over
  theme values, theme values win over old hardcoded defaults. So theming
  reaches a door exactly as fast as that door's hardcoded styles are
  removed - which is the rollout work, door by door.
- Doors opt in with one call at startup: `loadDoorTheme(doorDir)` reads
  `theme.json` if present and `setTheme`s it. The arcade shell's
  `MENU_COLORS` becomes a view over the current theme's `menu` block
  (names mapped from the numeric palette), defaulting to today's values.

### Pilot: DOORMAN

`Doors/door-manager` (~2,000-line blessed app: panels, lists, modals,
confirm dialogs, archive browser, action log) is the chrome-heaviest TS
door and exercises every theme surface.

1. Ship a `theme.json` that reproduces DOORMAN's current look, and remove
   the hardcoded styles it replaces. Verify identical rendering.
2. Ship one alternate theme (the amber demo) to prove switching is a
   file swap, and a drawn 9-slice frame on its panels.

DOORMAN work coordinates with the standing rule: it is another session's
active door at times; serialize or worktree per the dist-hook memory.

### Explicitly out of theming's reach

68K Amiga doors (they emit their own ANSI through the emulator - DOORREPO
included), the web frontend, and per-USER theme selection (themes are
per-door assets; a user-preference layer is a later, separate design).

## Subsystem 5: 9-slice borders

### Asset — `Doors/<door>/borders/<name>.border.json`

```json
{
  "name": "amber-frame",
  "canvas": [ "...rows of Cell|null, same encoding as sprite frames..." ],
  "slices": { "x1": 2, "x2": 5, "y1": 1, "y2": 2 }
}
```

The two guide pairs divide the canvas into nine regions: four corners
(drawn verbatim, any size), four edges (tiled along their run, the last
repeat truncated), centre (tiled as fill, or transparent to leave the
panel background alone).

### Renderer + Panel integration

- `renderFrame(asset, width, height) -> CellBuffer` — pure. Clamps: a
  panel narrower than the two corner widths draws corners truncated
  toward the centre; never throws at runtime for size reasons.
- The SDK Panel accepts `border: { asset }` (directly or via theme):
  reserves inner margins equal to the slice thicknesses, draws the frame
  into its own render, places the label over the top edge, and re-renders
  the frame on resize — tiling is what makes resize free, which is the
  point of 9-slice.
- A thickness-1 asset degenerates to exactly a classic line border, which
  is how the default theme stays identical.

### Testing

Tiling math at awkward sizes (3 wide, exact multiples, off-by-one),
truncation direction, transparent centre, degenerate 1-thick equivalence
with the classic border, label placement over a 2-row top edge.

## Phases (each lands something usable; plan doc will detail steps)

1. **cell-art module + sprite engine** — format, loader, timing, blit,
   tags; full unit suite.
2. **Pengo pilot** — geometry 15×10 / 5×2, hand-authored sprite JSONs,
   adoption, layout+gameplay tests updated. Visible on the local board.
3. **Asset studio door** — fork, responsive shell, sprite mode + art
   mode, file browser RPC. Round-trips Pengo's real sprites.
   **Gate before any forking**: the known ansi-edit defect is reproduced,
   root-caused and fixed IN THE ORIGINAL first (reported live 2026-08-31:
   attempting to load an image when there is none shows a "no image to
   load" dialog and then a black screen - the door does not recover).
   Fixing it in the original fixes both doors; forking first would mean
   debugging it twice. The fix ships with a regression test in the
   ansi-editor engine's suite.
4. **Chrome theming + 9-slice runtime** — theme.ts, DEFAULT_THEME,
   identical-by-default snapshot tests, nine-slice renderer, Panel asset
   borders, arcade `MENU_COLORS` fed by theme. DOORMAN pilot themed.
5. **Studio theme + border modes** — live-preview theme form, border
   canvas with slice guides and three-size preview.
6. **Rollout** — remaining TS doors adopt sprites/art/themes door by
   door; hardcoded styles removed as each door is touched. Amiga doors
   permanently out of scope.

Sequencing rationale: the engine is proven by a real game before any
tooling exists (same as the sfx channel: transport first, pilot audibly,
then scale); theming is proven by the hardest door before the editor
grows its UI for it.

## Cross-cutting rules that bind the implementation

- Repo discipline: CRLF-aware editing (several door files are CRLF),
  `door-sdk-freshness` after every sdk/ or door edit, dist rebuilt and
  committed by the pre-commit hook, `tsconfig.client.json` include list
  updated for any new client-importable sdk module.
- Every phase ships regression tests that fail on the reverted change
  (RED check), and a reachability proof at the door level - a thing the
  user can open on the board, not a green unit suite.
- No door outside the named pilots is modified before phase 6.
- The old `sdk/src/game-engine/sprite.ts` gains a deprecation pointer to
  cell-art in phase 1 and is otherwise left alone.

## Risks, named

- **Render cost**: 75×20 cells re-tagged every tick at Pengo's tick rate.
  Frogger already renders comparable areas per tick; if it shows, the
  buffer differ (only changed rows re-set) is the lever. Measure before
  optimizing.
- **DOORMAN contention**: another session works it; coordinate via
  worktree or timing (existing memory rule).
- **Editor scope creep**: four modes invite a fifth. Anything beyond
  sprites/art/theme/border goes back through a brainstorm.
- **Default-theme drift**: the identity snapshot is the guard; it must be
  captured BEFORE theme.ts lands, in a commit of its own.
