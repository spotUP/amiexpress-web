---
date: 2026-09-02
topic: Health-page auto-fix, dead MCI reporting, the importer's last two parsers, the message-header layout, and a gallery that froze the browser
tags: [admin, health-check, importer, messages, screens, deploy]
status: implemented
---

# The button that lied, and the messages that were all number zero

## Task

Started from "the bbs health checker doesnt manage to autofix these, or
anything" and ran through the remaining session to-dos. Everything below is on
`main` and deployed.

## What was wrong, in the order it was found

**Auto-Fix reported success over an untouched board.** `autoFixIssue`
dispatched on the issue's PROSE - it matched `'directory missing'` and
`'file missing'`, the second of which no issue has ever said - and returned
silently for everything else, while `autoFixAll` counted every silent return
as a fix. Thirteen issue kinds claimed to be auto-fixable with nothing behind
the claim. An issue NAMES its fix now (`HealthFix`), dispatch switches on the
name, an unhandled kind throws, and `autoFixable` is DERIVED from the fix in
one place so the button's count is what will actually be acted on.

**Conference issues carried no `path`,** so `autoFixAll` skipped every one in
silence even though `ConferenceSetupService` could fix them. Wired up.

**`bbsConfig.info` / `Access.info` offered to be created** and could not be:
`writeInfoFile` mutates an existing DiskObject and cannot conjure one. The
offers are gone.

**A screen pointing at a missing door was invisible** to the health page. Now
reported, grouped by CODE rather than file - 153 files here carry a dead
reference and there are three distinct codes among them. Also new: a command
whose door is not installed (`BestConf` and five SysCmd entries here), using
`commandLocationIsLive`, the board's own rule.

**Screen-index resolution was wrong three ways** and all three were found by
running the new check over the real board and reading every finding: `~SR_`
names a POOL BASE (12 live references called dead), non-`BBS:` assigns were
read as literal directory names (both go through `BBSPaths` now), and an icon
is not a door. Resolution is no longer cached with a file's bytes - it is the
one fact that comes from OTHER files.

**The ANSI editor truncated screens at the SAUCE row count** - and saving
wrote back only the rows it had, DELETING the MCI codes below the art. Almost
certainly what ate the user's bottom tags earlier in the week.

**The importer's last two parsers were finished on paper and empty in
practice.** `Conf.DB` was a `TODO: Parse binary structure` over a hardcoded
access level; it is an array of per-USER records (74 bytes x 1000 slots,
confirmed by every file on the board being exactly 74000). `handle[16]` is a
BITFIELD, not a name. The CallersLog pattern demanded `DD-Mon-YYYY (HH:MM:SS)`
where AmiExpress writes `DD-Mon-YY HH:MM`, so it matched not one line of any
log and imports produced zero caller history in silence.

**Every message on the live board read as #0.** `MessageIndexManager` wrote
`msgNumb` at offset 1 - a LONG at an ODD address, which a 68000 cannot fetch -
and put the record's two pads at the end. `axobjects.e:179-190` spells the real
one out in its own comment. Reader and writer both use the AmiExpress layout
now; 737 live messages read `#1, #2, #3...` where they all read `#0` before.

**The gallery froze the browser.** Cards were lazy about FETCHING and not at
all about PIXELS: each thumbnail allocated the editor's canvas (1280x800
retina, 4,096,000 bytes) and shrank it with `transform: scale(0.28)`, which
changes what you see and not one byte of what is allocated - and the observer
disconnected on first sighting, so nothing was ever released.

## Learnings

- **Padding proves nothing.** Amiga E does not clear structure padding; byte 99
  of a genuine record on this board is `0x47`, leftover memory. A classifier
  built on "the pad is zero" called 480 ordinary records unidentifiable.
- **Nor does a name field's tail.** `eall\0\xf9\xfc\x0e` is a real `toName` on
  the live board. Only the bytes before the NUL are written.
- **Dates look like a great discriminator and are a trap.** In the port's
  layout bytes 100..103 straddle two fields, so reading them as an AmiExpress
  date lands in a plausible window by coincidence.
- **The message NUMBER is the honest tell** - express.e numbers from 1, so a
  zero is what reading a LONG from the wrong offset gives you. Where one record
  is genuinely undecidable, the FILE decides by sequence, and where even that
  cannot separate them the record stays unidentified: a reader may fall back, a
  migration may not.
- **Measure the user's board, not a copy of it.** A decision was put to the
  user about migrating "496 port-layout records" that existed only in a local
  dev tree. The live board was already 100% correct and the migration was a
  no-op. Rehearsing on a copy is right; rehearsing on the WRONG copy is worse
  than not rehearsing.
- **A fixture that agrees with the code proves only that they agree.** Every
  fixture added here is real board bytes.

## Artifacts

`d7f0f7ea2` replace panel; `f85062850` SAUCE truncation; `8f287e3bf`
conference name + chips + Topaz; `d9db81d51` auto-fix dispatch; `860b18cf0`
health page refresh; `150751cfe` importer audit; `8732558c4` deploy auth;
`48f79f76f` + `f475f608f` message layout; `ec3837ebd` gallery pixels;
`6d7d12744` thumbnails in every tab.

`web/backend/src/scripts/migrate-msgheaders.ts` converts another board's
HeaderFiles - dry run by default, backups, idempotent, skips backup
directories, and reports rather than guesses.

## Next steps

1. The three dead MCI codes are real art that never displays:
   `~SR_WORK:bbs/Screens/flt/flt` (58 screens), `.../logoff/logoff` (42) and
   `~SS_BBS:screens/sanctuary.txt` (42). `WORK:bbs/` maps to `<board>/bbs/`,
   which does not exist; the art is in `Screens/flt/`, `Screens/logoff/` and
   `Screens/sanctuary/`. Rewriting the references is the sysop's call.
2. The two door-repo plans are still drafts the user wants to brainstorm
   before anyone builds.
3. `handoff.md` is over its 10 KB cap and carries another session's notes;
   it needs a trim by whoever owns those.

## Other notes

Deploys were failing for everyone on the host's anonymous git fetch - five
retries in 75 seconds, three deploys in a row. The repo is public, so it fits
rate-limiting of unauthenticated traffic rather than a credential problem; the
fetch authenticates now, with anonymous kept as the fallback.
