---
date: 2026-08-31
topic: The .info tooltype length prefix, and the orphaned command registrations
tags: [commands, info-files, parser, live-board, doors]
status: implemented
---

# A 32-character tooltype was read as a comment

## Task

Handoff item "Next Step 0": 277 command registrations pointed at files that do
not exist, the tail of the 30 August `Doors/` wipe. `BR`, `BV`, `BADD` and
`BROADCAST` answered with an error instead of falling through. The sysop had
also just deleted a batch of test doors, and said they should stay deleted.

## What was actually wrong

The prune had already been applied once - 169 `.orphaned` files sat in
`Commands/BBSCmd` and `Commands/SysCmd`, and `.orphan-prune-applied.txt` was on
the volume. A fresh scan with the shipping parser found **zero** dead
registrations. That was wrong: 22 registrations were invisible to it.

`extractTooltypesFromInfoFile` ignored the on-disk shape of `do_ToolTypes`. The
array is LENGTH-PREFIXED - a ULONG holding `(entries + 1) * 4`, then per entry a
ULONG byte count followed by that many bytes, last one the NUL - and the parser
scraped printable runs instead. The low byte of an entry's count therefore
arrived glued to the front of the entry, and for a 32-character tooltype that
byte is `0x21`, which prints as `!`. `parseInfoFileFallback` dropped anything
starting with `!` as a commented-out entry (`8f4aac2e9`, January), a convention
Workbench does not have - it comments with parentheses.

LOCATION is the one required field, so `loadCommandFromInfo` returned null and
the command never entered the registry.

The decisive measurement was `xxd`, not reasoning: `BS.info` reads
`00 00 00 18 | 00 00 00 21 | LOCATION=DOORS:Buy&Sell/Buy&Sell\0`, and the
control `B.info` reads `00 00 00 1c | 00 00 00 09 | ACCESS=1\0` - same shape,
different first byte, and only one of them parsed.

## The fix

`web/backend/src/utils/amiga-command-parser.util.ts` (`ba8314a06`):

- `readToolTypeArray` reads the array as icon.library wrote it and checks every
  declared length against its own NUL, so a wrong offset is reported rather than
  half-read.
- `findToolTypeArray` looks for the array when the computed offset misses it -
  safe precisely because the reader self-validates.
- Tooltypes written PAST the end of the array without growing its count are
  still read and still win. This BBS has done that: `Doors/What/WHAT.info`
  carries `OVERCLOCK=100` appended with no prefix, and it has been honoured for
  as long as it has been there.
- The `!` rule is gone from the string scan; parentheses stay.

Measured over every `.info` on the live board: **1545 files, 48 tooltypes
recovered, 0 lost.** Recoveries beyond commands: every `ACS.*` flag on
`Access.info`, `PRESET.DAILY_BYTE_LIMIT` on two presets, `CUSTOM` on the AmiXnet
conferences, and `BULL.MID_STRING`'s ANSI, which used to read as empty.

`web/backend/tests/utils/amiga-command-parser-length-prefix.test.ts` holds the
real bytes of `BS.info`, `B.info` and `WHAT.info`, base64'd. Red on the
unpatched parser (2 failures), green after.

## The prune

`dev/scripts/prune-orphan-registrations.ts` (`a8946f25d`) decides liveness with
`commandLocationIsLive` - the registry's own predicate - so it can only rename
what the registry was already ignoring. Renames to `.orphaned`, never deletes,
appends to `Commands/.orphan-prune-audit.txt`, and leaves files carrying no
command definition alone.

With the parser fixed it found 13 dead on live and renamed them: `BADD`, `BS`,
`Calls`, `edit`, `HoldScan`, `M`, `MagicMem`, `mobnup`, `MOSEARCH`, `MSGCLEAN`,
`open`, `Restrict`, `SP`. Re-scan: 139 registrations, zero dead. Three commands
come back alive instead - `<` (JoinCnf), `_s` (zOOsTAT) and `va` - their doors
are on disk; they were only ever lost to the parser.

## Learnings

- A heuristic over a format we know exactly is a bug waiting for a length byte
  that happens to print. Parse the structure, and make the parse verify itself.
- The container's `/tmp` does not survive a deploy. The scanner lived there and
  was gone; it is in `dev/scripts/` now.
- `info-file.util.ts` reads these icons correctly - it has the structural walk -
  so only the door-side parser was affected. It does NOT see appended
  tooltypes; `WHAT.info`'s `OVERCLOCK` is invisible to the admin editor.

## Open

- `Commands/BBSCmd` holds six `.info` files with no command definition at all,
  five of them AmigaDOS temporary names (`.!19106!n`). Left alone: nothing in
  them says what they pointed at.
- The `!19106!` files and the 169 older `.orphaned` files could be deleted once
  the sysop is sure. Nothing reads them.

## Postscript: the admin list was audited, not implemented

With the prune finished, `handoff.md`'s "Admin, what is left" was worked
through item by item. Two of the six had already been done and one was
misdescribed:

- **Six pages still render their own tables** - no. Protocols, Computers, File
  Checkers, Conferences and Drives all import `components/ui/DataTable` on
  `main`. The sixth, Security, is a permission-flag editor - level chips and a
  grouped toggle grid - and has no table to migrate.
- **`VITE_BYPASS_AUTH` should go** - it went, in `6bb0ec9ba`. `App.tsx` has no
  reference to it, and `web/config-app/src/test/auth-guard.test.ts` exists to
  stop it drifting back.
- **Configuration Files is four tabs** - it is two, "All .info files" and
  "Batch scripts", and the first is the single list over every icon on the
  board that the plan asked for.

Still true, and now measured rather than remembered:

- `writeInfoFile` refuses `bbsConfig.info` with "tooltype array structure not
  recognised". Verified against a copy of the live file: the array's first
  entry declares `0x19` bytes and holds 14, so the structure does not describe
  its own contents. Today's strict reader is in `amiga-command-parser.util.ts`;
  the writer is `info-file.util.ts`, and porting the self-validating walk there
  would still not make this file writable, because it is malformed rather than
  merely unusual. Workbench or IconEdit remains the answer.
- `info-file.util.ts` does not see tooltypes appended past the array's end, so
  `WHAT.info`'s `OVERCLOCK=100` is invisible to the admin editor. An admin save
  does NOT destroy it - probed on a copy in the running container, the file
  came back the same 806 bytes with the appended bytes intact and only ACCESS
  changed. Invisible, not lost.
- Node Configuration stays on `DataGrid` deliberately, and the realtime layer
  has still never met a busy board.
