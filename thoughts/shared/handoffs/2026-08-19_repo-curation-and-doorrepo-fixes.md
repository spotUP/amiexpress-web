---
date: 2026-08-19
topic: Repository curation (delete, server-side ad strip), DoorRepo field fixes from live testing, catalog startup performance
tags: [handoff, door-repo, doorman, doorrepo-c, curation, lha, performance, 68k, amiga]
status: final
---

# Session handoff - 2026-08-19 - repo curation + DoorRepo field fixes

Everything is committed, pushed and DEPLOYED. Live runs `1886fd527`, which is
HEAD. Nothing is mid-flight.

Previous context: `2026-08-18_doorrepo-doorman-parity.md` (DoorRepo reaching
DOORMAN parity) and `2026-08-18_doorrepo-ui-and-catalog-parser-bugs.md`.

## HOW TO RESUME

Read "Open items" at the bottom first. The one genuinely unresolved bug is
the `-D-CALC.LHA` download corruption through the emulator; everything else
listed there is a decision waiting on the user, not unfinished work.

## What shipped today

**Repository deletion** (`e691ce908`). `D` in DOORMAN's repo browser, owner
mode only: removes the catalog row, its file rows, and the archive file.
Permanent, no undo, confirmed in the UI.

**Server-side ad stripping** (`a629542a8`). `S` on a door that is NOT
installed now strips the PUBLISHED archive in place, for `.lha`/`.lzh` -
2966 of the 3301 catalog archives. The 328 LZX archives refuse with the real
reason (this project has an LZX reader and no writer).

**Catalog startup 75x faster** (`fadd09b3f`, 2026-08-18 late). See the
performance section below - it was a regression introduced by this project's
own `list.txt` fields 7-10 work.

**Four field-reported DoorRepo/DOORMAN fixes**: cursor position
(`027e4c49a`), FILE_ID.DIZ art, footer hints, message wrapping (all
`a629542a8`), and the blue-screen colour leak (`1886fd527`).

## Decisions worth keeping

**Deletion order: archive file FIRST, then rows.** The indexer
(`dev/scripts/door-corpus/build-door-catalog.ts`) walks the archive
directories and upserts, with NO prune step. Rows-first plus a failed unlink
would leave the file for the next re-index to RESURRECT - a silent undo of a
deliberate, irreversible action. File-first turns that into a visible,
harmless failure: a row whose archive is missing, which `/archive` already
404s by design.

**Deletion ignores `installed`.** The first design refused to delete an
installed door; the user rejected it, correctly. `installed`/`installed_as`/
`install_dir` share the catalog row with the repo entry, but they are
different concerns - making curation wait on local state means a door you are
running cannot be withdrawn from the repo. An installed door keeps working
(its directory and BBS command are never touched); the repo forgets it.

**Stripping re-describes the row in the same step.** Changing the published
bytes without updating size/md5/sha256/junk rows would hand clients digests
for bytes that no longer exist - the exact failure the API's verification
story exists to prevent. `indexed_at` is bumped too, because the revision is
row-count + newest `indexed_at`; without the bump, clients keep a cached
catalog describing the pre-strip archive.

**In-place `lha d`, not a repack.** `ami-stripper.lib.ts` repacks to ZIP
(the bundled npm lha cannot create archives). That is useless for the repo:
every client is an Amiga expecting the `.lha` whose digest it verified. The
real `lha` CLI removes members in place - verified on TELSER40.LHA, 262337 ->
261104 bytes, format intact - and the container ships it at
`/usr/local/bin/lha`. `web/backend/src/doors/lha-member-delete.ts` owns this;
members are passed as argv, never through a shell (real catalog names contain
`$`, `&`, `!`).

## Bugs found by using it, and what they teach

**Catalog startup was 13 seconds of self-inflicted SQL.** The junk-count
subquery added with `list.txt` fields 7-10 reads as O(1) per row but SQLite
planned it as `SEARCH f USING INDEX idx_dcf_is_junk`, so each of 3301 rows
rescanned every `is_junk=1` row. Live measurements: plain count 0.01s,
correlated subquery 13.05s, grouped join 0.03s. Now a grouped join plus a
revision-keyed cache of the rendered catalog. Result on live: `list.txt`
9.13s -> 0.12s internally, 15.7s -> 0.4s over the internet, door cold start
under 1s. **The transfer was never the problem** - measuring from inside the
container and through Caddy gave identical times, which is what pointed at
the server rather than the network.

**FILE_ID.DIZ art was being destroyed by a sanitiser.** `sanitizeForTags()`
stripped everything outside `\x20-\x7e`, deleting the high-bit glyphs Amiga
art is drawn with. Not cosmetic: each deletion shortens its line by one
column, so a rectangular 44-column box loses its right border on exactly the
lines that used one. `$CP-ST14.LZX` is the clean example - 13 lines, all
exactly 44 columns, bordered with 0xA1 and 0xF7. An existing test PINNED the
old rule; it was encoding the bug and was changed deliberately with the
reasoning at the assertion.

**A blue screen from a prompt that did not clean up.** `ESC[2J` erases using
the CURRENT background, so `ui_confirm()` leaving its white-on-blue bar set
meant the next redraw cleared the whole screen blue. Fixed in both places:
the prompts restore what they set, AND `ansi_clear()` emits `ESC[0m` first,
because clearing is what turns a stray attribute into a full-screen one.

**Footer hints were unreadable.** They mixed `F=Filter` with bare words whose
active letter was marked only by a colour highlight ("Strip", "Archive",
"Quit"), which is invisible on a real terminal - the user could not tell that
S strips. All are `KEY=Label` now.

## Open items

1. **`-D-CALC.LHA` fails checksum verification through the EMULATOR** - the
   only real unresolved bug. Established: the server is self-consistent (curl
   gets 7943 bytes whose SHA-256 matches its header); the catalog MD5 for
   that row IS stale, so the door's note about it is correct and not the
   failure; the door computed `e44cef1b...` on BOTH attempts, so not a random
   transport error; and the NATIVE build downloads the same archive
   correctly, which clears the door's HTTP/hash code and points at the
   emulator's bsdsocket recv path. Guessed transformations (truncation,
   offsets, duplicated chunks at 512/1024/2048/4096, CRLF translation, header
   bytes leaking in, high-bit stripping) produce none of that digest - do NOT
   keep guessing, get the bytes. The door deletes the mismatching file before
   retrying, so either grab `Doors/DoorRepo/downloads/` on live between the
   two attempts, or add a diagnostic that keeps the first one as `.bad`
   (offered to the user, not yet approved).

2. **Phantasm has not retested the cursor keys.** The RAWARROW fix
   (2026-08-18) cannot be verified here: this project's emulator delivers
   arrows to a door whether or not `rawArrow` is set, which is exactly why
   the bug shipped to him.

3. **The archive on the user's Desktop is stale.** It predates the
   blue-screen fix. Rebuild before sending:
   `thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha` and
   `/Users/spot/Desktop/DoorRepo-for-Phantasm.lha`. The user was asked
   whether to rebuild now or wait for his retest; unanswered.

4. **`Doors/door-manager/app.ts` is at 1999 lines** against a hard 2000-line
   pre-commit ceiling. The pure helpers already moved to
   `repo-view-helpers.ts` to get under it. The next feature in that file
   forces a real split - `StripView` and `RepoView` are the obvious cuts.

5. **`Scripts/run-amiga-door.ts` reads `web/backend/dist/`**, which was FOUR
   MONTHS stale (27 April) when used yesterday. Rebuilt now, but nothing
   enforces it: anything "verified" with that harness reflects whatever dist
   happened to be lying around. Rebuild with `cd web/backend && npm run
   build` first, or fix the harness.

6. Host disk 77% after reclaiming 3.4 GB of docker build cache. Three DB
   backups (~111 MB) remain on the volume, one of them today's.

## Verification state

Full backend jest: **5166 passed, 0 failed**. C suite: 205 flow tests plus
md5, sha256, guide, ansi, listtxt, config, http, aedoor - all green, zero
warnings from clang `-Wall -Wextra -pedantic` AND vbcc. Live BBS confirmed
running HEAD with the current DOORMAN dist (`clampSelection`,
`doStripArchive`, `repo-view-helpers.js` all present in
`/app/data/bbs/Doors/door-manager/dist/`) and the current DoorRepo binary
(MD5 `000c04eb`).

New test files this session: `delete-catalog-entry.test.ts` (6),
`strip-archive-on-server.test.ts` (11, including an end-to-end case that
builds a real `.lha` with the `lha` binary and skips where none is
installed), `doorman-diz-charset.test.ts` (5), `test_ansi.c` (asserts reset
BEFORE erase, since "a reset appears somewhere" would pass on the broken
version).
