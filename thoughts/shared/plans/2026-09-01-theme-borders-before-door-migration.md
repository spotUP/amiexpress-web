---
date: 2026-09-01
topic: Panel borders under the phosphor themes, decided before migrating 23 doors
tags: [themes, sdk, blessed, doors, migration]
status: draft
---

# Borders, before the door migration

The sysop, on seeing the themes land: *"we made new themes, they are awesome,
but they removed all panel borders? some apps rely on those."*

This has to be settled before the 23-door migration, because migration is
where every door's boxes get classified. Deciding afterwards means touching
all 23 twice.

## What is actually happening

Not a removal. `styles.ts:95-104`:

```ts
const borderType: BlessedBorderType = theme.border === 'double' ? 'double' : 'line';
// ...
border: { fg: theme.border === 'none' ? t.ground : t.chrome },
```

A `border: 'none'` theme still draws a `line` border - in the GROUND colour.
The rule is painted the same colour as what is behind it, so it is invisible
but still there.

Two consequences worth being precise about:

- **Layout is unaffected.** The box model is unchanged and no child shifts by
  a column. Nothing is structurally broken; a door cannot be mislaid out by
  this.
- **It is a legibility problem, not a layout one**, and confined to two of
  seven themes.

| Theme | border | Frames visible |
|---|---|---|
| classic | `line` | yes |
| slate-slash | `line` | yes |
| uprough-neon | `double` | yes |
| slate-muted | `line` | yes |
| neon-muted | `double` | yes |
| **quiet-phosphor** | `none` | **no** |
| **phosphor-muted** | `none` | **no** |

So five themes are fine as they are. The question is only what the two
phosphor themes should do when a door's box genuinely carries meaning.

## Where invisible borders actually hurt

Not everywhere. A border that groups related rows can go without much loss -
that is the phosphor aesthetic working as intended, and the sysop liked it
("it looks awesome").

It hurts when a surface must read as SEPARATE from what is behind it:

1. **Modals and dialogs** - `confirm-modal.ts` and the message dialogs draw
   OVER existing content. With no frame and the same background, the dialog
   text lands amongst the text underneath it. This is the strongest case and
   is not a matter of taste.
2. **Adjacent panes** - two lists side by side with no rule between them read
   as one ragged column.
3. **Anything with a scrollbar or a title** - the title floats with nothing
   to sit on.

## Options

**A. Leave it, document it.** Free. Rejected: the sysop has already reported
apps relying on borders, and a dialog blending into the page underneath is a
defect regardless of taste.

**B. Make `none` dim rather than invisible** - one line, `t.dim` instead of
`t.ground`. Restores structure everywhere immediately. Rejected as the whole
answer: it deletes the identity of the two themes people liked most
("one phosphor hue, no borders, hierarchy by brightness alone"). It is,
however, the correct fallback if the work below has to be cut short.

**C. Doors declare INTENT; the theme decides rendering.** (Recommended.)

Split the single `panel` style by meaning:

- `s.panel` - decorative grouping. May be borderless. What most boxes are.
- `s.frame` - a surface that must read as separate: modals, dialogs, overlays,
  anything drawn on top of something else. Never invisible.

The theme then renders `frame` legibly even when `border: 'none'`, using
`t.chrome` for the rule. A door written against `s.frame` gets a correct
result in all seven themes without knowing which is active - which is the
same contract the rest of the token system already has.

**D. Give the phosphor themes a non-box separator** for `frame`: a rule under
the title, or a background one shade off `ground`. Preserves "no boxes" while
keeping the surface distinct. Pairs with C rather than competing with it -
C decides WHICH widgets need separating, D decides HOW those two themes do it.

## Recommendation

**C, with D as the phosphor rendering, and B kept as the emergency fallback.**

C is the only option that survives the migration: the classification work
(panel vs frame) happens once, while each door is being converted anyway. B
alone throws away the two themes' identity; A leaves a real defect in modals.

## Plan

**Phase 1 - SDK: add the `frame` role.**
- `styles.ts`: add `frame` alongside `panel`/`list`/`bar`. For `line`/`double`
  themes it is `panel` with a `chrome` border. For `none` themes the border is
  `t.chrome`, not `t.ground` (option D's shading can follow later; a visible
  rule is the floor).
- `tokens.ts`: no new tokens needed - `chrome` and `dim` already exist.
- Tests: for every one of the seven themes, `frame` must resolve to a border
  colour that is not `ground`. That is the whole invariant and it is one
  assertion per theme.

**Phase 2 - SDK: modals use `frame`.**
- `confirm-modal.ts` and the message dialogs at `blessed-helpers.ts:1299-1322`
  (which still hardcode white-on-blue, noted during the list fix and never
  fixed) both move to `s.frame`.
- This kills two birds: the hardcoded blue goes, and dialogs stop vanishing
  under the phosphor themes.
- Test: a modal rendered under `quiet-phosphor` paints a border colour
  distinct from its own background.

**Phase 3 - The 23-door migration, now with a rule to follow.**
- For each door, every box is classified: overlays and dialogs -> `s.frame`;
  everything else -> `s.panel`.
- DOORS stays the reference (25 colour sites -> 0).
- Per door: typecheck, rebuild `dist`, run its tests, then the SDK suite.

**Phase 4 - Verification.**
- Automated: SDK suite; a test asserting no door source contains a literal
  colour name in a widget style.
- Manual (sysop only): open DOORS, DOORREPO and a door with a confirm dialog
  under `quiet-phosphor` and under `classic`, and confirm dialogs read as
  separate surfaces in both.

## Open question for the sysop

Which doors were the "some apps" that rely on borders? Naming even two would
let Phase 3 start with those rather than in alphabetical order. If the answer
is "the ones with dialogs", Phase 2 alone may settle it.
