---
date: 2026-09-02
topic: An uploaded ANSI replaces a screen's MCI codes with nothing
tags: [screens, admin, mci, upload, express-e]
status: draft
---

# The problem the sysop reported

> "if i upload a new ansi screen file to replace a screen file that has mci
> codes etc in it the codes get wiped, can we do something smart to keep the
> codes here? preferably at the same location as before (before or after the
> ansi graphics usually)"

A screen on this board is a PROGRAM, not a picture: `~SS_` includes, `~CC_`
command invocations, `~nSR_` recursions, `~CL.` conference lists. A designer
draws the art in PabloDraw or ACiDDraw, which knows nothing about any of that,
and uploads the result. `POST /api/screens/upload`
(`web/backend/src/api/screens-routes.ts:389`) writes the uploaded buffer to the
target verbatim - `writeToTargets(targets, file.buffer)` - so every code in the
old file is gone, silently. The menu still paints; the keys stop working.

The editor's Save (`PUT /api/screens/file`) is less exposed: the codes are
literal text on the canvas, so a designer who does not delete them keeps them.
The upload path has no such chance.

## Where the codes actually sit - measured

Counted over every `.txt/.gr/.ibm/.seq/.rip/.ans/.asc` file under this repo's
node, conference, `Screens` and `Bulletins` directories, using the same four
patterns as `locateMciReferences()`:

| position | on its own line | sharing a line | total |
|---|---|---|---|
| first 3 lines | 181 | 258 | 439 |
| last 3 lines | 162 | 110 | 272 |
| middle | 28 | 50 | 78 |

377 files carry at least one code. "Sharing a line" almost always means a code
beside another MCI token, not a code buried in art: `~ ~3SR_bbs:Screens/logoff`,
`~SS_BBS:bulletins/bull6.txt ~SP`. So the sysop's own description holds -
**a head block and a tail block cover ~90% of them**, and 78 codes in the middle
of a file are the case no automatic rule can place correctly.

## Levels a fix could live at

**Data format - a sidecar holding the codes.** Wrong level. The board reads ONE
file; express.e's parser has no notion of a sidecar, and a screen copied to
another node by hand would lose it. Rejected.

**Write path - merge the old codes into the new bytes.** Take the old file's
codes with `locateMciReferences()` (it already returns offsets), split them into
the ones above the first art line and the ones below the last, and re-emit them
around the uploaded buffer. Cheap, and it matches how the files are actually
shaped. It cannot place the 78 middle codes, and it would be re-inserting text
into art a person drew - silently, on a path with no undo.

**Presentation - tell the sysop what is about to be lost, and let them place
it.** The upload dialog already knows the target. Read the old file first, and
when it carries codes the uploaded bytes do not, show them and offer: keep them
above the art, keep them below, or drop them. The gallery's own renderer can
preview the merged result before anything is written.

## Recommended

The write-path merge, with the presentation step in front of it - build both,
but never merge silently:

1. `POST /api/screens/upload` learns a `carryCodes: 'above' | 'below' | 'none'`
   parameter, defaulting to `none` so existing callers are unchanged.
2. A `GET`-shaped precheck (or the upload's own 409-style answer) reports the
   codes the replacement would lose, with the text and line of each, split into
   head/tail/middle.
3. The dialog shows them, defaults to the placement the old file used, and
   refuses to guess for a middle code: those are listed as "these will be lost,
   put them back by hand in the editor".
4. Whatever is written keeps a `.backup` first, exactly as the escape repair
   does.

Reuse, do not re-implement: `locateMciReferences()`
(`web/backend/src/screens/mci-references.ts`) is the single parser and its
header already warns that a second copy is the drift to avoid.

## Decided by the sysop, 2026-09-02

**The upload wins.** If the uploaded file carries ANY MCI code of its own, it is
the whole truth and none of the replaced file's codes are carried. Nothing is
merged, nothing is de-duplicated, and a sysop who retypes the codes has exact
control over the result. The carry happens only when the upload has no codes at
all - which is the case the ANSI editors actually produce.

**Per target.** A fan-out writes one art file to many paths, and each path keeps
the codes that were in ITS own old copy: `Node1/LOGON.TXT` keeps
`~SS_BBS:Node1/BBSTITLE.txt`, `Node7/LOGON.TXT` keeps `Node7`. One set taken
from the first target would give every node node 1's screen. The old file is
therefore read once PER TARGET, not once for the upload.

Both decisions are about the same thing: the tool never invents a code and never
moves one between scopes.

## Still open

- What the dialog shows for the 78 middle-of-file codes. They cannot be placed,
  so they are lost whatever the rule is; the question is whether the upload
  refuses outright, or writes and lists them for the sysop to restore in the
  editor.
