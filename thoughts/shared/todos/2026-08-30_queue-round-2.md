---
date: 2026-08-30
topic: Second round of user-raised work - SDK dialog buttons, door delete
tags: [todo, sdk, blessed, doorman, ui]
status: in progress
---

# Queue - raised 2026-08-30, second round

Raised after the first six were closed (`2026-08-30_queue.md`).

## 1. SDK dialog buttons: frame the selected one only, and use white text

**Reported with a screenshot of DOORMAN's Delete confirmation.**

Both buttons are drawn inside a `.------.` frame at once, so nothing on screen
says which one Enter will press - the frame is decoration rather than
selection. Only the ACTIVE/selected button should carry the frame; the other
should be drawn without one.

Both button labels also render in grey on their colour fill (blue for Delete,
green for Cancel), which is hard to read at terminal contrast. Both should use
white text, selected or not.

Lives in the SDK's blessed dialog widgets (`sdk/engines/ui/blessed`), so every
door's dialogs change with it - ConfirmModal is used by DOORMAN's delete,
uninstall and install confirmations at least.

## 2. Deleting a door leaves it in the installed list, and freezes the BBS - DONE

**Reported 2026-08-30: "i deleted the door DD now, it says DD deleted but it's
still in the list in the left panel".**

Distinct from round-1 item 3 (`278a3bb75`), which fixed the REPO view's
uninstall path. This is `InstalledView.doDelete` - the left panel, `[D]` on an
installed door. That path already awaits `refreshDoorRegistry()` and re-fetches
with `fetchDoors(this.bbs)` before redrawing, and the door still comes back, so
the stale state is behind one of those two calls, not in the redraw.

**Found and fixed.** The live volume showed it exactly: `Doors/DD` gone,
`Commands/BBSCmd/DD.info` still there at 1114 bytes. The `.info` IS the
registration - every door list is built from those files - so the door lost
its body and kept its name.

`deleteTrackedFiles` treated the DB's tracked rows as an EXCLUSIVE list and
used the caller's fallback paths only when there were none. DD's rows covered
its directory but not its `.info`, so the fallbacks - which name the `.info` -
were skipped. `deleteAmigaDoor` then returned success without looking at what
was left.

- Tracked rows AND fallbacks are deleted now, deduped, and every path
  (the DB's included) is confined to `Doors/` or `Commands/` first.
- Both delete paths verify afterwards and report failure naming what
  survived, instead of saying "deleted".
- The filesystem work is asynchronous (`amigafs.rm`/`unlink`), so the board
  keeps answering - the freeze was a synchronous recursive delete on the one
  process that serves every node.
- DOORMAN paints an ActionLog in the right panel as it goes, and refuses to
  say "deleted" while the door is still in the list it just re-fetched.
