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

## 5. BROADCAST is registered but its door is not on disk

**Reported 2026-08-30, from the menu:**

    Error: ARexx script not found: Doors/ANNOUNCE/ANNOUNCE.REXX
    Please contact the sysop.

Confirmed on live:

- `Commands/BBSCmd/BROADCAST.info` exists, with
  `LOCATION=DOORS:ANNOUNCE/ANNOUNCE.REXX`, `TYPE=AIM`, `ACCESS=20`,
  `STACK=50000`, `MULTINODE=YES`.
- `Doors/ANNOUNCE/` does not exist at all - no directory, no `.REXX`.

So the command is registered and offered on the menu while the door it points
at was never installed (or was removed without its registration). The exact
mirror of the DD failure: DD had files and no registration, BROADCAST has a
registration and no files.

Two things to decide:

- **Where the ANNOUNCE door is.** Is it in the door repo (an archive to
  install), or was it a local door that went missing? The registration reads
  like a stock AmiExpress ARexx announce/broadcast door.
- **What the BBS should do with a registration whose LOCATION does not
  exist.** Today it is listed on the menu and fails only when a user runs it.
  `initializeDoors` already warns about LOCATIONs that resolve outside
  `Doors/` - the same scan could warn (or hide the command) when the target
  file is missing entirely, so a broken door is a sysop-visible startup
  warning rather than a user-visible error mid-session.

Related to the install-link work (item 4 / the door-db connection): a door
installed through the recorder would have both halves recorded, and either
half going missing becomes detectable.

---

## GrandMaster TetriNet: a lone bot should be full size, not a minimap

Reported 2026-08-30 while testing the arcade doors.

In TetriNet mode the opponent's board is drawn as a minimap even when there
is only ONE bot in the game. With a single opponent there is room to show
that board at full size, and the minimap costs readability for nothing.

Wanted: full-size opponent board when there is exactly one opponent; keep
the minimaps only once there are two or more, where the space genuinely has
to be shared.

Not started. The TetriNet layout already has a test
(`Doors/grandmaster/tests/tetrinet-layout.test.ts`), so the sizing rule
should be expressible there - assert one opponent renders at the full board
width and that two or more fall back to minimaps.

---

## GrandMaster: "watch a game" always reports no game running

Reported 2026-08-30 while testing the arcade doors.

Choosing to watch/spectate a game in GrandMaster always answers that there
is no game running, even when one is. So either the spectate lookup never
sees live games, or games are not being registered in whatever list it
queries.

Not investigated. Starting points: `Doors/grandmaster/tests/spectator.test.ts`
already covers the spectator path, so compare what that test sets up against
what a real game actually registers - a live game that the test's fixture
creates but the real start path never does would explain it exactly.

---

## The 10 arcade games need real ANSI graphics, not ASCII glyphs

Requested 2026-08-30.

The ten arcade doors (bubble-bobble, donkey-kong, frogger, galaga, joust,
pengo, pipe-dream, super-qix, zoo-keeper, arkanoid) draw with single ASCII
characters in one foreground colour. GrandMaster and Arkanoid already look
far better, and they are the model.

Wanted: think in 8-bit terms - SPRITES and BACKGROUND TILES. A sprite is a
small block of coloured cells drawn at a position, not one character; a tile
is a repeated background cell. Colour comes from the background attribute as
much as the foreground, the way Super Qix's playfield now works
(`BG_COLORS` in `Doors/super-qix/game/constants.ts`) - painting a space with
a background colour gives a solid block, whereas colouring a space's
foreground shows nothing at all.

Worth designing once and sharing rather than nine times: a small sprite/tile
helper in the SDK that takes a grid of {char, fg, bg} and blits it into a
render buffer at x,y would serve every one of these doors. Super Qix's
render already builds exactly that kind of buffer and would be the first
consumer.

Related: the revealed-ANSI-background feature (see below / brainstormed
2026-08-30) uses the same cell model - `loadFile()` in
`sdk/engines/ui/ansi-editor/core/file-ops.ts` already returns
`Cell[][]` of {char, fg, bg}, which is the same shape a sprite would use.
The two should share one representation.

Note: that loader needs three fixes before it can be used from a door -
`TextDecoder('cp437')` throws in Node so .ans/.asc fail outright, there is
no CP437 to Unicode mapping, and only ESC[H/f cursor moves are handled
(ESC[C and friends are ignored, so art that uses them renders misaligned).

---

## Super Qix: an attract screen that plays itself

Requested 2026-08-31, with an arcade screenshot.

The arcade sits in an attract loop: the HUD shows PLAYER-1 / HI-SCORE with
ROUND 0 and RATIO 0%, the field is the plain blue playfield, the computer
plays a demo game in the corner of it, and "GAME OVER / INSERT COIN" blinks
in the middle. Skulls patrol the border and the Gremlin drifts about.

For a BBS the coin line becomes something like PRESS A KEY TO PLAY, blinking
the same way. The demo needs a simple自动 player - walk the frame, draw a
box, repeat - not real AI; it only has to look alive.

Where it fits: the door currently opens on an ASCII-art menu. The attract
screen would either replace that or sit in front of it, with any keypress
dropping into the menu (or straight into a game).

Related pieces that already exist: the Time Meter border, the enemy update
loop, and the renderer all run without a player, so an attract mode mostly
needs a demo driver plus a blinking overlay - the banner helper added for
the level-clear sequence (`overlayBanner` in game/qix-engine.ts) is the
place to draw the blinking text from.

## 6. The doors menu will not improve for the 370 existing doors

**Seen 2026-08-31: every row reads `5DPAGER  5DPAGER`, command echoed as the
name, no descriptions.**

Two separate causes, and only one is a bug:

- **Locally nothing fills at all** because `DOOR_SERVER_URL` is not set in the
  dev backend's environment. With no door server configured the metadata index
  is empty and the overlay returns every door untouched - by design. Live has
  it set, so descriptions do fill there. To see it locally:
  `DOOR_SERVER_URL=https://doors.uprough.net ./dev/scripts/start-servers.sh --bbs-only`
- **Names will still echo the command even with the door server up.** For a
  door with no install record - all 370 - the overlay fills only EMPTY fields,
  and `name` is non-empty because it already falls back to the command. The
  plausibility rule that replaces a junk name applies only to LINKED doors,
  which was the deliberate scope decision ("we can ignore the currently
  installed doors").

So making that middle column read "5D Pager" needs the archive-matching
backfill that was deferred. The honest options are: match installed doors to
catalog rows by fingerprint (file names and sizes from the archive's file
list, which the door server already serves), or accept command-as-name until a
door is reinstalled through the new recorder.

## 7. The DoorRepo Amiga binary is stale, so the C work is inert on the board

`Doors/DoorRepo/doorrepo.amiga` is tracked in git and dated 20 Aug locally,
23 Aug on live. Every C change from 2026-08-30/31 - the archive-named command,
the whole-path listing parse, the install reporting, and the BbsHost security
fix - only reaches the board when that binary is cross-compiled again.
`vbcc`/`vbccm68k` are on PATH and the NDK is vendored at
`Documentation/7-Reference Sources/NDK3.2R4`, so `make amiga` in
examples/doorrepo-c is all it takes. Do it before claiming any C change is
live, and remember the deploy does not sync `Doors/` on its own.

## 8. There were FOUR install paths, not three

The spec's premise ("only one of three install paths ever wrote it") was wrong
by one. `DoorInstaller.install()` - DOORMAN's [U]pload key, via
BBSApi.deleteDoor's sibling `installDoorFromUpload` - extracts, writes the
`.info`, reloads the registry and records nothing. Found by the final
whole-branch review, fixed in the final fix wave. Worth remembering as a
method: the pre-flight scan checked the interfaces between planned tasks but
never grepped for every writer of `Commands/BBSCmd/*.info`, which is the
question that would have found it.
