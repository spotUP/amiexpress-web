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

## 3. The delete log must be verbose and live - DONE

**Reported: "after a pause it shows the log, can the log be more verbose so I
see what it does and can it be realtime?"**

The whole log arrived at the end because DOORMAN called `deleteDoor` once and
painted when it returned. `deleteDoor` now takes an `onStep` callback and
reports as it goes - which registration it read, how many paths it is working
from, each entry as it is removed (a door directory is emptied entry by entry
rather than in one silent recursive call), any path it refused and why, each
failure by name, the rescan and registry reload, and the final on-disk check.

DOORMAN runs inside the backend's own process, so the callback is a direct
call; the filesystem work between steps is asynchronous, so each repaint
actually reaches the terminal.

## 4. Installed doors should read their metadata from the door repo

**Reported with a screenshot: DOORMAN's Name field and the list show ASCII
art and mojibake for several doors ("[??] .____", a FILE_ID.DIZ rendered
into the name).**

The installed list is built from each door's own `Commands/BBSCmd/*.info`,
and for these doors the `NAME` tooltype IS art - so the panel is faithfully
showing junk. The door server knows the real name, description and DIZ for
most of them.

The overlay already exists for the doors MENU (`door-repo-metadata.ts`, used
by `getDoorList`, commit `3217daf3b`) - it matches on name or archive base
name and fills only empty fields. DOORMAN's installed view does not use it,
and the rule would need to be stronger here: art in a NAME is worse than an
empty one, so the repo's name should win over a `.info` NAME that is not
plausibly a name.

Also worth deciding: whether an installed door should record which archive it
came from, so the match is exact rather than heuristic. `door_installs`
already has `archive_name`, but only for doors installed through DOORMAN (37
rows on live, against 370 registered commands).

## Note: door file tracking is not what we thought

`door_installed_files` exists and `db.trackDoorFiles` writes it - but only
from `amigaDoorManager`'s own installer. DOORMAN's install path records into
`door_installs` instead, and everything installed before either existed has
nothing at all.

**On live: 0 rows in `door_installed_files`, for every one of the 370
registered doors.** So no delete has ever had a tracked file list to work
from - they all fall back to the `.info`'s own LOCATION. Worth fixing at the
install side, and it is why the DD failure could not be reproduced from the
tracking data.
