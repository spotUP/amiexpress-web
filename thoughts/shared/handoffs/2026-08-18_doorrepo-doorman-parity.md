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

## Follow-on: the last three gaps (same session)

**Install state.** DOORMAN tags installed rows and counts them; this door
could not, and `U` had to ask for a command name it had known once. An
install now appends `<archive>|<CMD>` to `DownloadDir/DoorRepo.idx` and an
uninstall removes it. That record drives the `+` list mark (over `*` for
merely downloaded), the header's "N installed", the green `[CMD]` in the
detail pane, and a pre-filled `U`. The alternative - probing `BBSCmdDir` per
visible row per keystroke - is the per-row disk work this door already
refuses to do on a real Amiga.

**`S` strips ads from an already-installed door**, which DOORMAN could always
do and this door could only do during an install. Needs the index for the
same reason `U` does: without it there is no way to know which directory the
archive went into. The footer switches `I` to `U` once installed and shows
`S` only when the door is installed AND its archive has ads.

**The BBS seeing a newly installed door.** Nothing to send the AmiExpress
author: `express.e:4614-4647` resolves a BBS command from disk on EVERY
invocation, so a `.info` is live on the next keypress on a real node. The
cache is ours (`amigaDoorManager.doorCache`, filled at boot). Three parts
now:

1. `revalidateBbsCommandsIfChanged()` on a BBSCMD miss, keyed on the command
   directories' mtime. Deliberately not an unconditional rescan: a miss is
   the COMMON case (every internal command falls through SYSCMD then BBSCMD
   first), so that would parse every `.info` on nearly every keystroke.
2. `bbscmd-watcher.ts`, which clears the freshness stamp so the listing
   paths see the change too. It reloads nothing itself, and nothing depends
   on `fs.watch` firing.
3. `RULES.md` 10b and the C door's README.

`tests/handlers/bbscmd-freshness.test.ts` (8 tests); the two central cases
were confirmed to FAIL against the pre-fix behaviour. Live: the running BBS
logged the watcher firing within a second of a `.info` being written.

Also fixed, not caused: `door-repo-routes.test.ts`'s fd-lifecycle test
asserted a close that happens on the stream's own close handler, after the
response supertest awaits - a race that lost at load average 60 and passed
in isolation. It now waits for the close, then re-checks there is exactly
one.

## Next

1. **Send DoorRepo to the AmiExpress author (Phantasm).** The package is
   BUILT and waiting: `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha`
   (239 KB, 50 files, git-ignored). LHA rather than zip for the audience.
   Contains the m68k binary, the full C89 source, the 9 test programs, the
   protocol contract, the door manual, the commented config example, and
   six REAL captured responses from the live server as client fixtures.
   `ReadMe.txt` is a cover letter for him. Verified by extracting the
   archive and running `make test` + `make native` from the packaged source
   (all green, zero warnings) and by checking the binary's MD5 and
   `file` output survive the round trip. Everything is pure ASCII - the API
   doc's four em-dashes were transliterated, since UTF-8 reads as mojibake
   on an Amiga. Only the sending is left, and that needs the user.
2. ~~Deploy the P1 `list.txt` change~~ - ALREADY LIVE. A deploy went out
   from the pushes and recreated the container at 10:13 UTC 2026-08-18;
   `bbs.uprough.net` returns ten-field rows (verified: `ABS-PLC2.LHA` gives
   `author=LOOP/ABUSE group=ABS junk=4 hasdoc=1`). An earlier note in this
   session said otherwise; it was written before that deploy landed.
3. ~~`DEBUG_68K=1` is still on in the live compose file~~ - WRONG, and it
   had been carried forward across several handoffs. Verified 2026-08-18 by
   reading the container's own environment: the live compose sets only
   `DEBUG=false` and `XIM_DEBUG=0`, and `DEBUG_68K` appears nowhere.
4. Live API readiness sweep, 2026-08-18, all green: every endpoint answers
   on plain HTTP with no redirect (the Caddy exemption is intact and
   `handle /api/door-repo/*` precedes the redirect block); `list.txt` is
   3301 rows, every one ten fields, header count matching, CRLF, no chunked
   encoding, `Content-Length` present; `%DF` in an archive name works on
   /diz, /files, /doc and /archive (the old HTTP 500); a downloaded archive
   matched `X-Archive-MD5`, `X-Archive-SHA256` and the `list.txt` digest;
   `?type=`/`?q=` filter correctly, including author search; missing entries
   404 rather than erroring. The real m68k-source door, built native, was
   driven against live end to end - browse, filter, AmigaGuide navigation,
   and a SHA-256-verified download.
5. Host disk is at 89% (4.1 GB free) - worth watching before the next
   catalog re-index.
