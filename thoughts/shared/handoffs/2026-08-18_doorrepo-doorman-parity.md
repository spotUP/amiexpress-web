---
date: 2026-08-18
topic: DoorRepo closes its remaining gaps against DOORMAN - list.txt fields 7-10, author/group search, footer gating, SHA-256, AmigaGuide, install/uninstall
tags: [handoff, doorrepo-c, door-repo-api, doorman, amigaguide, sha256, install, 68k, amiga]
status: final
---

# Session handoff - 2026-08-18 (afternoon) - DoorRepo/DOORMAN parity

Follows `2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`, whose top open
item (the live catalog sync) was done at the start of this session - see that
doc's section 1 for the method.

The user asked what DoorRepo still lacked against DOORMAN, then asked for
every gap fixed in order of effort. Six gaps, five phases, all committed.

## What shipped

**P1 - `list.txt` grows fields 7-10** (`door-repo-manifest.ts`).
`author|releaseGroup|junkCount|hasDoc` appended. The header stays version 1
because the format contract says appending never bumps it, so every deployed
client keeps working. `junkCount` is the LIVE per-file count from
`door_catalog_files`, not the denormalised `door_catalog.junk_count` column
(they disagree on 12 of 3301 rows); falls back to the column when a caller's
database has no files table. `sha256` deliberately stays OUT - `/archive`
already returns `X-Archive-SHA256`, and 64 bytes per row is ~211 KB on every
catalog fetch.

**P2 - the C door reads them.** The filter now matches author and release
group, so the in-memory filter finally agrees with the server's `?q=`: typing
a group name used to find nothing locally and everything server-side
(verified: 'ABS' now yields 6 both ways). `V=Doc` is offered only for a door
that has documentation, and pressing V on one that has none is ignored. The
detail pane shows `by <author> / <group>` and a red ad count.

**P3 - SHA-256 verification** (`sha256.c`, tested against NIST vectors,
padding-boundary lengths, streaming in non-aligned chunks, the 1M-'a' vector
and all 256 byte values). The digest comes from the `X-Archive-SHA256`
header, which the server computes from the file it is streaming, so it is
fresher than any catalog row; MD5 stays the fallback. A catalog MD5 that
disagrees while SHA-256 matches is reported as a probable stale catalog
digest, not a failure.

**P4 - AmigaGuide rendering** (`guide.c`). A third of the catalog's
documentation is AmigaGuide (1125 of 3301 rows carry an @node) and all of it
used to print raw markup. Mirrors `AmigaGuideParser.ts`'s decisions so both
clients read a file the same way. Keys: 1-9 follow a link, B back.
`DOC_MAX_BYTES` 8192 -> 24576, because 918 documents are larger than 8 KB and
a truncated guide loses whole nodes, not just a tail.

**P5 - install / uninstall / ad strip.** `I` extracts into `DoorsDir/<CMD>/`,
picks the door's program, writes `BBSCmdDir/<CMD>.info` byte-identical to
DOORMAN's `buildDoorInfoContent()`, and offers to remove ad files. `U`
reverses it. New config: `DoorsDir`, `BBSCmdDir`.

Out of scope by the user's choice: mouse support and owner-side curation
(upload, delete, info editor, file explorer, enable/disable).

## Three bugs found by running it, not by reading it

1. **`ExtractAfterDownload` only ever worked on Amiga.** `lha x <archive>
   <dir>` passes the directory as a MEMBER FILTER to Unix lha - exit 1, empty
   destination. Both call sites now go through `run_extractor()`: AmigaDOS
   form under `-DAMIGA`, `xw=` form otherwise.

2. **Stack-buffer overflow in my own SHA-256 reporting** - the "Checksum
   verified OK" message needs 97 bytes for a 64-character digest and had 96.
   Found with AddressSanitizer on a real download, after the -O2 binary died
   at the same byte offset every time. Worth remembering: the first two
   attempts to confirm the fix ran a STALE copy of the binary sitting in the
   test directory, which looked exactly like the fix not working.

3. **The full-screen browser spun forever at input EOF**, pre-existing.
   Every interactive loop exits only on a key, so the -1 `ae_key()` returns
   at carrier loss matched no case: redraw, re-read, repeat. Two runs wrote
   11.7 GB and 21.6 GB of frames before being killed. The rule is now
   `flow_key_ends_session()` (tested) applied where keys enter the door.

## Judgement calls worth keeping

- **An install's success is not the archiver's exit code.** Amiga-authored
  archives make Unix lha report CRC errors while extracting everything that
  matters. Nor is it `fopen()` of the program: TELSER40.LHA's `bin/` carries
  Amiga protection bits that become a Unix mode with no read permission, and
  on the real target a door needs the executable bit anyway. Refusal now
  requires BOTH an unreadable program and an archiver error.
- **Absent evidence is not contradicting evidence.** 35 catalog archives have
  no file listing at all; those install with a warning rather than blocked.
- **C89 cannot enumerate a directory**, so the `/files` listing is the
  manifest for picking the binary, stripping ads and uninstalling.

## Verification

C suite (flow 183, md5, sha256, guide, listtxt, config, http, aedoor) all
green, zero warnings from clang `-Wall -Wextra -pedantic` AND vbcc. Backend
`tsc --noEmit` clean; door-repo jest suites green.

End-to-end against a local server (`DOOR_REPO_ROLE=owner`, backend started
directly with `npx tsx src/index.ts` - `start-servers.sh` stalls for minutes
in its repo-wide `find -delete` cleanup step): filter parity, footer gating,
guide navigation, SHA-256 verified against the server's own header, TELSER40
installed as `LOCATION=Doors:TELSER40/bin/telser` with both ad files removed,
then uninstalled.

## Next

1. **Send DoorRepo to the AmiExpress author** - unchanged, top item for four
   sessions now.
2. The live server has NOT been redeployed with the P1 `list.txt` change yet.
   Deploy when convenient; old clients are unaffected either way, and the
   catalog DATA on live is already current (synced this morning).
3. `DEBUG_68K=1` is still on in the live compose file.
