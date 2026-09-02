---
date: 2026-09-02
topic: Full session handover - screen manager, screen index, message bases, importer, deploy
tags: [screens, admin, importer, messages, deploy, handover]
status: implemented
---

# Full handover: the day the tools disagreed with the board

Everything below is on `origin/main` and LIVE. Live revision at handover was
`7bcd610ee` (another session's commit on top of mine); every commit listed
here is an ancestor of it. Verify with:

    curl -s https://bbs.uprough.net/health     # {"revision": "..."}

## 1. What this session did

Started from one report - "the bbs health checker doesnt manage to autofix
these, or anything" - and ended up rebuilding the trust in three tools that
were quietly answering different questions from the board itself.

### Shipped (20 commits, oldest first)

| commit | what |
|---|---|
| `d7f0f7ea2` | replace panel readable; `readBy` stops calling live screens dead |
| `f85062850` | SAUCE row count stops truncating a screen (it was DELETING codes on save) |
| `8f287e3bf` | conference name on the replace panel, code chips, Topaz off the UI, art scrolls |
| `76144289b` | a dead MCI reference means the key does nothing |
| `d9db81d51` | Auto-Fix actually repairs what it offers to repair |
| `860b18cf0` | the health page shows the board as it is after Auto-Fix |
| `150751cfe` | importer: Conf.DB and the node logs are read, not skipped |
| `8732558c4` | deploy: the host fetches authenticated, so a rate limit stops blocking it |
| `48f79f76f` | message base written where AmiExpress reads it |
| `f475f608f` | identify a message record by its NUMBER, not by padding that is junk |
| `ec3837ebd` | a screen thumbnail costs a thumbnail's worth of pixels |
| `6d7d12744` | every screen tab shows the art, not just the gallery |
| `92ad45108` | docs(handoff) |
| `d3595fed5` | a reference resolves the way the board resolves it (case) |
| `09f92bf5b` | preview draws a screenful (INSUFFICIENT - superseded, see `87b67783c`) |
| `87b67783c` | preview stops at 25 rows BEFORE the parser, not after |
| `856fb4202` | a paced writer stops at a character, not at a byte |
| `8e8e72b72` | a SAUCE record names a FONT, it does not mean CP437 |
| `a56f0ec29` | the index answers the question the BOARD answers |
| `7d6826966` | the screens page shows art by default, plumbing on request |

## 2. Critical references

**Screen resolution - THE recurring trap.** Three different resolvers existed
for one kind of path, in a file whose own header promises it "resolves through
the same two the loader uses, so the index and the board cannot drift":

- `web/backend/src/handlers/screen.handler.ts:558-562` - the `~SR_` sentinel
  strips a redundant leading `bbs/` from `WORK:bbs/...`
- `web/backend/src/handlers/screen.handler.ts:1031` - the `~SS_` path strips
  the same thing with a regex, differently
- `web/backend/src/screens/screen-index.service.ts` `boardPath()` - now
  collapses it too, and goes through `amigafs.resolvePath` so EVERY path
  component is matched case-insensitively, not just the filename

If you resolve a screen target anywhere, go through the board's path. Do not
write a fourth one.

**Node screen directories** - `ACP.e:2666-2673`: the `SCREENS` tooltype on
`Node<n>.info`, else `Node<n>/`. No fallback to `Screens/`. On this board:
53 nodes carry `SCREENS=BBS:Screens/Node/`, 7 have no tooltype. That is why
~713 of 873 files read as unused and it is HONEST - nodes 0-6 show 10/10 files
used, nodes 7+ show 0/11.

**Message header layout** - `axobjects.e:179-190` spells it out in its own
comment: `1+1+4+31+31+31+1+4+4+2 = 110`, the two 1s being pads that align
msgNumb and msgDate. `web/backend/src/services/amiga-msgheader.ts` and
`msgheader-layout.ts`.

**SAUCE** - ID(5) Version(2) Title(35) Author(20) Group(20) Date(8)
FileSize(4) DataType(1) FileType(1) TInfo1-4(8) Comments(1) **TFlags(1)**
TInfoS(22) = 128. Flags are at +105; +104 is the comment count. The font at
+106 decides the ENCODING (`isAmigaFont`: a name starting "Amiga" is Latin-1).

**Conf.DB** - `axobjects.e:136-155`, 74 bytes x 1000 slots per conference,
one record per USER. `handle[16]` is a BITFIELD (scan masks in byte 0, vote
topics above), not a name.

## 3. Learnings worth carrying

- **Measure the USER'S board, not a local copy.** Twice I put a finding to the
  sysop that came from the local tree: a message-header migration of "496
  records" that existed only in a dev copy (live answer: zero), and "this art
  never displays" about art the board draws every logoff.
- **The sysop is a better oracle than the tool.** Three times they rejected a
  finding - Logon24hrs, the logoff logos, flt/uprough - and were right every
  time. Each was a real bug.
- **A fixture built from the same misunderstanding as the code proves
  nothing.** The SAUCE iCE tests wrote the flag at the same wrong offset the
  parser read.
- **Padding is not zero.** Amiga E does not clear struct padding; byte 99 of a
  real record here is `0x47`.
- **Dry run before writing to live, and undo by a LIST of what you touched,
  not by a pattern.** I stripped two codes across the whole board, hit four
  `.LHA` archives, then "undid" it by restoring every non-text file with a
  `.backup` - reverting 13 `.info` files I had never touched. Both repaired
  and verified, but both were avoidable.

## 4. State of the live board

- 16 screens the sysop deleted are RESTORED (the delete writes a `.backup`).
- `~CC_ANNLOGON` and `~CC_V-AWAIT` stripped from 46 screens, backups beside
  each. Verified: of 53 backup/original pairs, 46 differ ONLY by those codes.
### Verified on the live board by the sysop, not just by tests

- **The gallery no longer freezes.** `/admin/screens?tab=gallery` opens and
  scrolls. It took TWO fixes: thumbnails drawn at thumbnail size instead of a
  full editor canvas shrunk by CSS (`ec3837ebd`), and truncation of the source
  BYTES before the parser rather than the canvas after it (`87b67783c`) -
  needed because a 992,732-line `68klog.txt` was indexed as drawable art.
- **Thumbnails in every tab, art-only by default.** Node/Conference/Board tabs
  each show the art beside the row, and the page opens on ~400 files of art
  instead of 669, with the plumbing one checkbox away.
- **The BBS and the admin now render the same file the same way.** Two
  independent bugs: a SAUCE record was taken to MEAN CP437 while its font
  field said `Amiga Topaz 1+` (Latin-1), and the paced writers cut UTF-8 at a
  byte budget instead of a character boundary.
- Logoff art CONFIRMED working after the fix ("the logoff works") - the
  `~SR_WORK:bbs/Screens/logoff/logoff` pool resolves and the index now reports
  it read, 8 readers.
- NOT yet confirmed by the sysop: the health page (Auto-Fix repairing the
  escape-byte screens, and the new "door is not installed" findings). Worth
  asking first thing.
- Dead MCI references: **1** - `~SS_R_WORK:bbs/Screens/logoff/logoff`, an
  obsolete Sanctuary-inherited typo the sysop said to leave.
- `68klog.txt` (992,732 lines) removed from the board at the sysop's request,
  no backup kept. STILL TRACKED IN GIT - a future deploy could restore it.
- All 1,742 `.info` files match the deploy's pre-mistake backup.

## 5. Next steps, ordered

1. **`git rm 68klog.txt`** - it is still tracked and will come back on a
   deploy. Not done because the sysop was asked and the thread moved on.
2. **The `LOGON20.TXT_.TXT` name** (14 copies) looks like a botched rename.
   Sysop's call.
3. **Two door-repo plans are still drafts** the sysop wants to BRAINSTORM
   before anyone builds: `thoughts/shared/plans/2026-08-17-door-repo-*.md`,
   `2026-08-23-door-repo-admin-and-public-browser.md`. Do not start building.
4. **`root handoff.md` is over its 10 KB cap** and carries another session's
   notes. Needs a trim by whoever owns that content.
5. `web/backend/src/scripts/migrate-msgheaders.ts` exists for importing OTHER
   boards' HeaderFiles. It is a NO-OP on this board (already correct layout).

## 6. Gotchas for the next session

- **The tree is shared by three sessions.** `thoughts/BOARD.md` is the
  channel. Commit BY PATH and run `git diff --cached --stat` first - a commit
  here once carried another session's staged deletions (77172d1fb).
- **Never write into the shared tree's `node_modules`.** Build a per-entry
  symlink farm INSIDE your worktree instead. I broke another session with this
  at 20:04.
- **Deploys are serialised** (`concurrency: deploy-hetzner`, no cancel), so a
  push can wait behind another session's build for 10-20 minutes. The host
  fetch is authenticated now; if it fails five times again, that is the thing
  to look at.
- **SSH to the board works**: `ssh root@bbs.uprough.net`, container
  `amiexpress-bbs`, data at `/app/data/bbs`. Probes must live under
  `web/backend/src/scripts/` inside the container to resolve modules.
- **A fresh worktree has no `sdk/dist`**, so chiptune-worklet route tests 404
  there. Not a regression.
- `tests/api/config-routes.test.ts` and the admin `conference-delete-feedback`
  test both flake under parallel load and pass alone.
