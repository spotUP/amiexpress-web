---
date: 2026-09-02
topic: "Which TypeScript doors build by hand what the SDK already ships"
tags: [doors, sdk, blessed, widgets, audit]
status: final
session: amiexpress-web-7a
---

# Doors that hand-roll what the SDK ships

Asked for by the sysop after CARD LOBBY: "survey all typescript doors and
make sure they don't hand roll stuff instead of using the correct sdk
components".

The reason it matters is not tidiness. **Every defect reported against CARD
LOBBY on 2026-09-02 lived in a hand-rolled part**, and none in an SDK widget:

| symptom | the hand-rolled thing |
|---|---|
| the table screen was one small box in an empty window | its own layout, writing geometry to `.options`, which a widget never re-reads |
| profile, achievements, leaderboard could not be closed | its own text window; focus never reached the widget its Escape was bound to |
| dialogs opened on a black screen | its own shade, a Box filled with black, instead of `Overlay` |
| stray white lines under the list and across the screen | bars built from plain boxes, taking `Panel`'s default border |
| "outer border broken" in GRANDMASTER | the same default border on a full-screen background |

## What the SDK has

`sdk/engines/ui/blessed/widgets/`: accordion, ansi-editor, autocomplete,
bar, bigtext, box, button, canvas, category-picker, checkbox, collapsible,
colorpicker, **confirm-modal**, contextmenu, **doc-modal**, dockable-panel,
donut, dropdown-menu, filebox, fileexplorer, filemanager, **fkey-bar**,
form, gauge, iframe, image, kanban-board, **layout**, lcd, line-chart, list,
listbar, **listtable**, loading, log, login-modal, map, markdown, **menu-bar**,
message, **overlay**, **panel**, passbox, picture, progressbar, **prompt**,
radioset, scrollablebox, scrollabletext, **search-modal**, sparkline,
**status-bar**, table, tabpanel, terminal, text, textbox, tree, video,
viewport.

## The survey

Games are excluded: an arcade door's drawing IS the game.

```
door                   hand-rolled shapes
card-lobby              22  hand-laid grid x7, own column list x7, own menu bar x5, own status bar x1, own text window x1, own confirm x1
door-manager            12  own column list x7, own text window x5
bug-tracker             11  own column list x8, own status bar x2, own menu bar x1
whip                     9  own column list x7, own confirm x2
doors-menu               8  own column list x5, own status bar x2, own menu bar x1
scrollwars               4  own column list x3, own status bar x1
livechat                 3  own column list x3
theme-picker             3  own status bar x1, own menu bar x1, own column list x1
ami-stripper             2  own column list x2
ansi-editor              2  own column list x2
telnet-front             2  own column list x2
bbs-dashboard            1  own menu bar x1
neo-blessed-showcase     1  own confirm x1
```

The script is `scratchpad/hand-rolled-survey.py` in the session that wrote
this; it is twenty lines of regex and worth re-running rather than trusting
these numbers after any migration.

**Read the signals with judgement, not as a score:**

- *own column list* is the weakest of them - it matches `padEnd(` and
  `padColumn(`, which any text rendering uses. It is worth looking at only
  where the padding builds ROWS with headers, which is what `listtable` is.
- *hand-laid grid* (`.options.top =`, `top: N + offset`) is the strongest.
  A widget renders from its live properties; writing `.options` moves
  nothing, which is exactly what broke CARD LOBBY's table screen.
- *own status bar* / *own menu bar* are one-row boxes at an edge. They work,
  and they take `Panel`'s default border unless the caller says otherwise -
  where the stray lines come from.

## Already converted

CARD LOBBY, as the pilot: shade -> `Overlay`, text windows -> `DocModal`,
footer -> `StatusBar`, list -> `ListTable` (which is where the widget's own
`select`/`select item` split had to be fixed). Its 2x2 table grid was left
hand-laid ON PURPOSE - `Layout` is an inline flow container and does not
express a proportional two-column, two-row split with an action row.

## Worth doing next, in order

1. **door-manager** - checked, and mostly a false positive. Four of its five
   "text windows" are the AmigaGuide viewer, which navigates guide nodes and
   has no SDK equivalent, and it already uses `ConfirmModal`. The one real
   candidate is the plain document view at `app.ts:1558` - Panel plus
   ScrollableBox plus a hint bar plus Q/ESC and scroll keys, which is
   `DocModal` exactly. Not urgent: its keys go through the door's own key
   manager, so it does not have CARD LOBBY's focus bug.
2. **bug-tracker** - two own status bars, one menu bar. Its four modal
   backdrops are already fixed (4a0d0aa29).
3. **doors-menu**, **theme-picker**, **scrollwars** - one status bar each.
4. **whip** - two own confirms; `confirm-modal` is theme-aware and traps
   focus.
5. **neo-blessed-showcase** - blocked: app.ts is 3705 lines against the
   repo's 2000-line ceiling, so the pre-commit hook refuses any edit. It
   needs an extraction first, like CARD LOBBY got.

## The rule worth keeping

A door may draw its own thing when the SDK has nothing for it. It may not
draw its own thing because the SDK's was not looked for - that is how five
separate bugs reach a sysop in one evening.
