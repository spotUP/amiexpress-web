---
date: 2026-09-01
topic: The door-rendering corruption, the paint cost, the full disk, and grandmaster
tags: [handoff, doorrepo, xim, rendering, deploy, disk, grandmaster, terminal]
status: final
---

# Session handoff, 2026-09-01 (overnight)

Everything below is on `main` and deployed. Verified on the running
container by reading `/app/.git-sha` and grepping the running filesystem -
not by trusting a green workflow, which lied twice today.

## The one theme

**Three of the four bugs I "found" were not the bug.** Each time the
mechanism was real and the conclusion was wrong, because I announced a
cause before testing the stage downstream of it. What ended the guessing
was capturing the door's actual traffic - see "How to debug a rendering
bug" below, which is the reusable part of this session.

## What shipped

### The rendering corruption (the big one)

`8c6c24cea`. DOORREPO's screens came out with rows cut short and their
remainder starting the row below: "browse a doo" / "r doc ...".

**The backend was line-wrapping screen paints.** `emitTextInternal`
(`web/backend/src/amiga-emulation/xim/io.ts`) treats each XIM message as a
LINE and wraps it at `state.lineWrap`, so a 198-byte message whose visible
text runs past the wrap column gets a newline pushed into the middle of it.
`looksLikeAsciiArt()` was the only exemption and asks whether text LOOKS
like art by punctuation ratio; a help row of ordinary words does not.

The right question is not "does this look like art" but **"is this door
printing a line or painting a screen"**. `positionsCursorAbsolutely()`
(`web/backend/src/utils/ascii-art.util.ts`) answers it: a message
containing CUP/HVP/cursor-movement is a paint and is never wrapped. Colour
is deliberately NOT positioning - SGR moves nothing, so a coloured line is
still a line.

Measured on the captured session: 35 of 316 messages would have been
wrapped before, 5 after (banner, a note, a cursor-hide, the word "Back" -
none long enough to reach the wrap column).

**This was never DoorRepo-specific.** Every door that paints a screen was
being broken whenever a message ran long. If another door has looked
subtly wrong, check it against this.

### The paint cost

`4fddf8dbf`. "The door redraws very slowly." Measured from the capture:

| | median | total |
|---|---|---|
| backend handling one message | 11 ms | 3.7 s |
| **68K running between messages** | **45 ms** | **75 s** |

Neither the wire nor the backend: ~45ms of 68K emulation per XIM message,
and a message is 198 bytes. **Bytes are milliseconds**, and the only lever
is sending fewer.

One `/help` paint was 2559 bytes / 13 messages / ~0.73s, of which:
- 190 bytes were colour sequences asking for the colour already in effect
- 1036 bytes were trailing spaces padding rows on a just-cleared screen

`ansi_color()` now skips a colour already set, forgetting what it knows at
`ansi_begin`/`ansi_reset`/`ansi_clear` (frames are flushed to a BBS that may
write between them; a reset returns the terminal to defaults). The help rows
use the existing `ansi_text_raw()`. Result: **1324 bytes / 7 messages /
~0.39s**, screen byte-checked identical. Confirmed by the sysop: "its faster
and looks good".

### Smaller, same session

- `4b4611385` - `ae_put()` no longer cuts an ANSI escape across two XIM
  messages (`flow_safe_chunk`). **Defensive only**: the web backend already
  rejoins split sequences, verified by replay. Correct for real 68K
  AmiExpress; it was NOT the reported bug, though I announced it as such.
- `3c150b8a9` - dialogs paint their interior (`ansi_panel`). `ansi_box`
  draws a frame only, which is right on a cleared screen and wrong for
  every overlay. Two callers were overlaying: the notice and the FILTER
  prompt.
- `c138f8881` - the `/` command bar has LIVECHAT's autocomplete: full list
  on open, narrows as you type, Up/Down, TAB completes, ENTER runs.
  `flow_command_suggest`/`flow_command_ghost` in `flow.c` so it is tested.
- `e0beeafed` - `/strip` says why it did nothing instead of returning in
  silence (`flow_strip_verdict`). Both the ANSI and the Ansi=no paths.
- `2d0a220cc` - the web terminal retries forever instead of giving up after
  5 attempts (~11s on localhost, shorter than a dev backend restart), and
  reconnects on focus/visibility/online/pageshow.
- `76d98fa8f` - a finished versus game returns to the lobby
  (`lobby:game_over`); the broker never moved a lobby out of 'playing'.
- `aec3ccb49` - grandmaster control at speed: soft drop and sideways repeat
  shared one accumulator (1 sideways move/second while holding down against
  12), repeats were capped at one per poll, and the engine caught up an
  unbounded number of frames (60 in one 1000ms tick). Plus the landing
  flash, which was shorter than one render frame and painted after the
  board it composites into.

## The disk, and a deploy that lied

The board went down mid-session: **disk 100% full**, container in a restart
loop, entrypoint unable to write a byte. Nothing in the pipeline had ever
freed anything - 27.4GB of buildkit cache across 1348 entries and 19 images
totalling 49GB, on a 75GB disk.

**The deploy reported SUCCESS through all of it.** The workflow is green
when the build is green, so the board served an image from hours earlier
while everything downstream said the release had landed. That is why the
sysop's DoorRepo screenshots were of a local binary, not live.

Fixed both ends:
- `c3b31c4ba` - the deploy prunes before it builds
  (`--keep-storage=10GB` plus a dangling-image prune, `df -h` either side).
- `/etc/docker/daemon.json` now carries `builder.gc` with a 10GB ceiling
  (backup: `/root/daemon.json.bak-20260831-221212`). dockerd restarted with
  `live-restore: true` so containers survived. **Not repo-tracked** - it
  lives on the host, like the Caddyfile.

34GB reclaimed. `docker info` does not expose GC settings, so what was
verified is that the daemon accepted the config and restarted - not that it
was watched evicting anything.

## How to debug a rendering bug (the reusable part)

Three wrong conclusions cost most of this session. The method that worked,
in order:

1. **Capture the door's real traffic.**
   `XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1 ./dev/scripts/start-servers.sh --bbs-only --quick`
   (or `--debug`, which sets the last two itself). `logs/xim-amiga.log`
   carries the payloads; `logs/xim-debug.json` carries the timing.
2. **Parse it carefully.** The Amiga log writes `string:` and then the
   payload ON THE FOLLOWING LINE. Joining those with a newline invents
   corruption that is not there - it produced a convincing fake reproduction
   of the exact bug being chased.
3. **Render the stream to a grid** and look at it. The door's own bytes
   rendered a perfect screen, which exonerated the door in one step.
4. **Replay through each stage.** `processRawText` in 198-byte chunks came
   out byte-identical, which exonerated the emulator and left exactly one
   suspect.
5. Only then name a cause.

The timing split (`receive` -> `send` = backend, `send` -> `receive` = 68K)
comes from the JSON log and is what proved the cost is emulation, not I/O.

## Still open

- **Yours:** nobody has driven the `/` bar's TAB completion, `/strip`'s
  three messages, the versus lobby return, or grandmaster master mode at
  speed (the last is the one that matters - the fix was measured, not felt).
- **Cannot back out of subpages in DoorRepo**, and **a 68K door that
  autocompletes the BBS prompt**: both recorded with a concrete first step
  in `thoughts/shared/research/2026-09-01_doorrepo-back-navigation-and-a-prompt-autocomplete-door.md`.
  Neither started.
- `Doors/door-manager/app.ts` is ~1940 lines against the 2000 ceiling.
- A stray `web/backend/tests/api/globalwall-envelope.test.ts` fails on the
  local branch `feat/installed-door-link`; it does not exist on `main`.

## Other notes

- Live: `https://bbs.uprough.net`, host `root@89.167.21.154`, key
  `~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`, backend on 3001.
- The board runs the 68K binary: **`Doors/DoorRepo/doorrepo.amiga` must be
  rebuilt and committed** or a source change reaches nobody. `make amiga`.
- Commits went through a detached worktree. One was orphaned by re-detaching
  and nearly shipped without it - use a named branch there instead.
