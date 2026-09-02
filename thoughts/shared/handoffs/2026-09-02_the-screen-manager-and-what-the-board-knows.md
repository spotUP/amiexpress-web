---
date: 2026-09-02
topic: The screen manager - a gallery, the board's own metadata, four false reports, and an 8x speed-up
tags: [screens, admin, ansi-editor, health-check, express-e, live-board, performance]
status: implemented
---

# Where this leaves the board

Everything below is on `main` and LIVE. The container was `380f7b4af` at the
time of writing - check `docker exec amiexpress-bbs cat /app/.git-sha` before
believing any of it, because a green workflow has lied here before.

Session before this one:
`2026-09-02_browser-ansi-editor-phase-2-complete.md` (phase 2 of the editor).

## The through-line

**The manager kept telling the sysop things that were not true**, and every one
of them had the same shape: a check that answered a question nobody had asked.

- "Read by nothing" meant "is not the ONE file the loader picks at level 255",
  so every security variant, every screen-type variant and every `~SS_` include
  on the board was reported dead. The sysop's instinct - "i really doubt they
  are read by nothing. i dont dare delete them" - was right.
- The health check read `/app` while the board lives at `/app/data/bbs`, so it
  declared the whole board missing AND OFFERED TO FIX IT.
- It looked for `xpr` while AmiExpress writes `Xpr`, so eight registered
  protocols read as none - and reported "Checked: 0" beside the finding,
  because it counted what it MATCHED rather than what it looked at.
- It looked for `doors/` while every board writes `Doors/`, and read
  `Conf1/Screens` by NUMBER on a board where conference 1 lives in `Conf2`.
- `canAutoFix` was one flag per conference, so one unfixable issue marked every
  fixable sibling "Manual fix required".

If you change one thing about how you work here: **when the manager says
something about the board, check it against the board before believing it.**

## What shipped

### The gallery, for people who draw

`/admin/screens` opens on thumbnails of every screen and bulletin, drawn with
the EDITOR's own renderer, lazily as they scroll. Each card says what the
screen IS, who reads it, and who signed it. Identical copies are ONE card -
this board has 71 identical `Node<n>/BBSTITLE.txt` - and files a designer never
edits (leftovers, board-written files, door-rewritten bulletins) are behind a
toggle, off by default.

### What a file says about itself

`Conf2/bull20.txt` now reads as: **CONF_BULL in Amiga Demoscene (conference 1)
- level 20-29 (no callers)**, shown by `joinConf()` at express.e:5058.

Every fact is the board's own:

| Fact | Source |
|---|---|
| conference names | ConfConfig.info NAME.n |
| the level RANGE a variant serves | the variants present + express.e:6273-6290 |
| how many callers that is | user.data |
| "Amiga Ansi" for `.GR` | ScreenTypes.info TYPE/TITLE |
| "Global Wall" behind `~CC_gwall` | Commands/BBSCmd/GWALL.info NAME |
| title/author/group | the art's own SAUCE record |
| "shown by joinConf() - express.e:5058" | express.e, generated |

`dev/scripts/generate-screen-provenance.ts` reads every
`displayScreen(SCREEN_X)` call site out of express.e; the output is committed
because the deployed image has no express.e in it.

### The editor

A dialog now, not another section on the page - open it from any resolution
row. Topaz throughout, including the canvas (the fallback stack matters: a
CP437 block Topaz has no glyph for falls back per CHARACTER). A tall screen
scrolls inside its own viewport. Download and "Open a file into the editor" sit
beside Save; the save still goes out through the same fan-out choice a replace
uses.

### 47 damaged screens, and the button that fixes them

`Screens/Logon24hrs.txt` and 46 others hold `[0;1;31m` with the ESC byte gone -
a caller sees the codes printed. 41 are copies of one NODE_BULL.TXT. The
manager flags them, the health check lists them, and the dialog offers "Put the
escape byte back", which writes a `.backup` first and refuses any file that
already contains an escape byte (a bare `[` might be art).

### Speed

`buildScreenIndex` took **12,667 ms** for 1,145 files, and a delete builds it
twice - which is why deleting looked like it had done nothing. The cost was not
reading files: express.e's level walk tries 255 down to 5 in fives against four
extensions, and each lookup did a full readdir - a quarter of a million of
them. Listings are cached until a directory's mtime moves, file facts until the
file's own size or mtime moves. **1,548 ms cold, ~900 ms warm.**

### And the rest

- The whole admin speaks the design system: 640 legacy `bbs-*` classes became
  ramp tokens, two raw palette classes are gone, Exports uses DataTable.
  `src/test/design-system-usage.test.ts` enforces all three rules.
- Auth: an expired token answers 401 (it answered 403, which no client can
  tell from "you are not a sysop"), and the admin spends its 7-day refresh
  token instead of logging the sysop out after 8 hours.
- Sharing: the board reports which directories can be shared, and a dry run
  answers 200 with the verdicts rather than a 409 the browser logs as an error.
- A deleted conference stays deleted across a deploy (the entrypoint was
  re-seeding it), and the conference list comes from ConfConfig.info rather
  than the `Conf<n>` directories left behind.

## Learnings

**A test that agrees with the code proves nothing.** The entrypoint's
conference guard and its test both assumed ConfConfig.info was NUL-separated
strings; a real Amiga icon stores a LENGTH BYTE in front of each one, so
`^NCONFS=` matched the fixture and never a real file. It shipped, read zero
conferences on the live board, and only `od -c` on the volume found it. Two
layers under that: `tr` and `sed` both refuse binary input in a UTF-8 locale
and return nothing, which looks exactly like "this board has no conferences".

**Verify a spy actually spied.** A performance test asserted files were not
re-read by spying on `fs.readFileSync` - and passed with the cache deliberately
disabled, because swc freezes the module namespace. The test that replaced it
swaps content underneath an unchanged size and mtime and checks the hash.

**A `*/` inside a block comment ends the comment.** `Node*/BBSTITLE.txt` in a
JSDoc cost twenty minutes of "unterminated template literal" at the wrong line.

**Python rewrites destroy CRLF.** Much of this repo is CRLF; `open().read()`
then `write()` turned a 7-line Dockerfile change into a 111-line diff. Check
`git diff --stat` before staging, or write bytes.

**The shared checkout is where deploys go to die.** Three of today's failures
came from it: a `git commit-tree` from another session took a whole Dockerfile
blob and silently reverted two of my fixes; a door's uncommitted edits blocked
another session's commits entirely (the pre-commit hook rebuilds from disk);
and the GWall case collision (`Doors/GWall` vs `Doors/Gwall`) makes rebases
refuse to start. Land by cherry-picking onto a worktree of `origin/main` and
remove the worktree in the same task - a worktree is ~625 MB, and nine of them
filled the disk today (ENOSPC mid-build).

**The image is not your machine.** Two deploys died on imports that resolve
locally because `../../sdk` is simply there: the admin's aliased sources, and
then the backend's first STATIC SDK import (every earlier one was a runtime
`require()`, which tsc never resolves). Both stages copy what they import now,
and `tests/dockerfile-copies-admin-sources.test.ts` fails, naming the files, if
a new import escapes.

## Open - the "opens" a fresh session should pick up

1. **Repair the 47 damaged screens.** The button is live and does one file at a
   time. Nobody has clicked it yet. Do one, look at it on the board, then
   decide about the other 46 (41 are the same NODE_BULL.TXT). A bulk action
   does not exist and probably should, once one repair is confirmed by eye.
2. **The editor round-trip has never been driven by hand.** Open an ANSI
   screen, draw, Save, choose "this file only", then look at it on the board.
   Colours and CP437 blocks must survive. Everything under it is tested; the
   whole path is not.
3. ~~`Screens/Callers.txt` classified as board-written on the sysop's word~~ -
   SETTLED, it is art. express.e's only writer is `callersLog()`, building
   `Node<n>/CallersLog` (express.e:9499) and never a `.txt`; all 62 copies on
   this board are one of two hashes, the oldest stamped 2008, and not one is
   dirty in git while every `CallersLog` is. Both spellings came off
   RUNTIME_NAME with a test that fails on the old regex. `Bulletins/lastc.txt`
   stays - Super-AmiLog signs it in the art.
4. **`Conf<N>.Stats` is still keyed by NUMBER, deliberately** - it is a
   position, like conferenceAccess. First place to look if conference stats
   read wrong after the sysop's deletes.
5. ~~Grandmaster layout fixes~~ - LANDED as `0595d0507` by another session,
   from a worktree off origin/main. Noted here only because this session spent
   time establishing they were NOT blocked by the admin work: both symbols the
   failing typecheck named exist at HEAD, and what fails is the shared tree's
   uncommitted grandmaster edits. If a door's pre-commit rebuild fails for you,
   check the shared checkout before your own diff.
6. **A bulk "repair all" and a sysop-settable generated flag** are the two
   obvious next features of the manager. Today's classification is by name and
   by generator signature; a sysop who can mark a file himself beats any
   heuristic.
7. **An uploaded ANSI wipes the screen's MCI codes.** The sysop's report:
   replacing a screen through `POST /api/screens/upload` writes the buffer
   verbatim, so every `~SS_`/`~CC_`/`~SR_`/`~CL.` in the old file is gone and
   the menu paints but the keys stop working. Measured over 377 files that
   carry codes: 439 sit in the first three lines, 272 in the last three, 78 in
   the middle - so a head/tail carry covers most of them and nothing can place
   the middle ones. Design note, with the recommendation (merge on the write
   path, but never silently - show what would be lost and let the sysop place
   it): `thoughts/shared/research/2026-09-02_mci-codes-and-the-upload-that-wipes-them.md`.

8. **The release ships THIS board.** `Dockerfile` copies our Screens, Conf1-14
   and Node0-40 into `/app/default-data`, so a sysop installing the release is
   seeded with uprough's screens. Still needs its own spec.

## Other notes

- The live board's conferences: `NAME.1=Amiga Demoscene` in `Conf2/`, C64
  Demoscene in Conf3, Console Demoscene in Conf5, Requests in Conf8, Up Rough
  Internal in Conf12. Nine leftover directories were removed today, backed up
  to `/root/bbs-backups/dead-conferences-2026-09-02.tgz`.
- `ACS.30.info` now exists (copied from ACS.20.info), so the board's 95
  level-30 callers have a file of their own.
- SSH to the host is allowed for reading and for the cleanups the sysop asks
  for; the harness classifier refuses some destructive commands, and those get
  handed back with the exact command to run.
