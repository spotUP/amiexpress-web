---
date: 2026-09-01
topic: "UIED - a door UI designer forked from SPRITED / the ANSI editor"
tags: [sprited, uied, ansi-editor, doors, idea, todo]
status: draft
---

# UIED: paint a door's UI instead of coding it

The user's idea, 2026-09-01, verbatim in substance:

> it should be able to design ui's for our doors... i select which door i
> want to design the ui for, assuming the door has an ui already all ui
> screens/elements gets loaded into sprited, the artist just paints
> ascii/ansi over them and save and its done... it should probably be two
> different doors. sprited and uied. uied forked from spriteds or
> ansi-edits ansi editor.

The workflow: pick a door, its existing UI screens and elements load into
the editor as they currently render, the artist paints over them, saves,
and the door looks like that from then on. "It would be a fantastic
workflow for making beautiful doors."

The user already anticipates the catch: "i understand that the underlying
mechanism is not as simple as this sounds but we could explore the idea."

## Why it is a separate door, not a mode of SPRITED

The user's own call, and it is the right one. SPRITED edits SPRITES: small
animated cell grids that a game blits. A door's UI is a different object -
full screens, panels, menus, borders, status lines, laid out by code at
runtime. Sharing one door would mean one browser, one key map and one
mental model serving two unrelated things.

Both can still be forked from the same base once the ANSI editor widget is
sprite-capable (see `thoughts/shared/plans/2026-09-01-ansi-editor-sprite-capable.md`),
because that work is what gives the widget an arbitrary canvas size, a real
transparent cell, and working undo.

## The hard part, stated honestly

A door's UI today is CODE, not data. `blessed.box({top, left, width,
height, border, content})` calls scattered through each door's `index.ts`,
with content built by functions at runtime (`formatHUD()`, `titleLines()`,
`menuLines()`). "Load the UI into an editor and paint over it" has to
answer: what exactly is loaded, and what exactly is saved?

Three shapes this could take, roughly in order of ambition:

1. **Skin the chrome only.** The editor loads a door's static decoration -
   borders, title art, backdrops, the frame around a game area - as an
   `.ans` layer the door composites underneath its live widgets. The door's
   layout code is untouched; the artist controls everything that is not a
   live value. Cheapest, and it already almost works: doors read `.ans`
   files today, and SPRITED's art mode edits them.

2. **A layout file the door reads.** The editor writes a `ui.json`
   describing each pane's position, size, border and colours; the door's
   code reads it instead of hardcoding `blessed.box` arguments. The artist
   moves and restyles panes for real. The cost is a migration per door and
   a schema that every door's UI has to fit - the thing that usually turns
   into a framework.

3. **Full WYSIWYG over the live door.** The editor runs the door, captures
   its actual rendered screens, and lets the artist paint over them with
   changes flowing back into layout plus skin. The most like the user's
   description and by far the most work: it needs a way to run a door
   headless, snapshot its screens, and map a painted region back to the
   widget that drew it.

Option 1 is a weekend; option 3 is a project. Option 2 is the interesting
middle and probably where the real value is - but it only pays off if
several doors adopt it, so it wants one door as a pilot first (DOORMAN or a
smaller one, NOT an arcade game whose screen is a game board).

## Questions to settle before any plan

- Which doors are in scope? The nine arcade doors draw game boards, not
  chrome; the utility doors (DOORMAN, DoorRepo, bug-tracker, dashboards)
  are the ones whose look is mostly panes and text.
- Is the artist allowed to MOVE panes, or only to restyle them? Moving
  means layout data and per-door migration; restyling can be a skin file.
- What happens when the code and the painted skin disagree after a door is
  updated - who wins, and how does the artist find out?
- Does a door need to keep working with no skin file present? (It must -
  a missing skin cannot break a door.)
- Live values (score, time, filenames) must stay live. How does the artist
  see where they will land without them being paintable?

## Next step

Brainstorm properly (superpowers:brainstorming) before any plan, with the
five questions above as the agenda, and pick between the three shapes with
the user rather than for them. This is an architectural idea, not a bounded
change.
