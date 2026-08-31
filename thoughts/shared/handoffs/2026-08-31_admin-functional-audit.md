---
date: 2026-08-31
topic: Driving the admin API against a real BBS tree, endpoint by endpoint
tags: [admin, config-api, icons, live-board]
status: implemented
---

# The admin audit, done by driving it rather than reading it

The admin is being rebuilt because it was broken. Earlier in the day this
session declared several queued admin items "already done" on the strength of
greps - the page imports `DataTable`, the flag is gone from `App.tsx`. That is
evidence about the source, not about whether anything works. This is the same
list checked by driving the API against a real BBS tree and reading the files
the BBS reads.

## Method

A backend on the repo's own BBS tree (`BBS_DATA_DIR=<repo root>`), a sysop JWT,
and for every domain: GET, PUT one changed field, GET again, then look at the
`.info` file on disk - not at the response, and not at the database mirror.
`dev/scripts` has no harness for this yet; the scripts live in this session's
scratchpad.

The existing API tests do not do this. `tests/api/config-routes.test.ts` asserts
"returns 200 or 404" and "has a boolean success field", which a completely
broken admin passes.

## Defects found, fixed and deployed (`0e9d73928`)

**Renaming a file checker or a language destroyed its icon.** The service
deleted the old `.info` and wrote tooltypes to the new name; `applyTooltypes`
creates a file when it finds none, so `FCheck/ARC.info` went from a 529-byte
Amiga icon to 54 bytes of text with no DiskObject - `GetDiskObject` reads that
as NIL, so the checker stopped existing on the Amiga side. `moveInfoFile` moves
the bytes now and the tooltypes are applied to the file that arrived. Verified
529 -> 529, still an icon.

**File Checkers was dead on the live board.** The service hardcoded `Fcheck`
while the volume holds `FCheck`. express.e writes `Fcheck` and on the Amiga's
case-insensitive filesystem the two are one directory; on the Linux container
they are two, so the live board answered ENOENT for the read and a save would
have created a second directory the BBS never looks in. It cannot fail on the
sysop's Mac, which is case-insensitive too - that is how it survived.
`resolveDirectory` returns the spelling that is on disk, by READING THE PARENT:
`amigafs.resolvePath` short-circuits on `existsSync`, which answers differently
per platform and hands back the spelling that was asked for.

## Live data repaired

**System Configuration could not be saved at all.** `bbsConfig.info` held
`MAX_NODES=255`; `axconsts.e:43` says `MAXNODES=32` and the write schema agrees,
so every save was rejected - on a field the sysop never touched - with
"max_nodes: Number must be less than or equal to 32". Set to 32 in both the icon
and `bbsConfig.info.txt`; the icon healed on the way (1719 -> 1962 bytes, still
an icon, all 61 tooltypes). Backup:
`/root/bbs-backups/bbsconfig-pre-maxnodes-20260831-192653.tar.gz`. The board's
config now passes the write schema.

## Checked and working (writes verified against the file on disk)

System configuration, Nodes, Conferences, Users, Protocols
(`Protocols/XprTypes.info`), Computers (`ComputerList.info`), File checkers,
Languages (a rename moves the file), Screen types (`ScreenTypes.info`), Drives
(`Drives.info`), Security/ACS (`Access/ACS.<level>.info` - a toggle reaches the
file and the page reflects it), Global wall config, Batch list, Statistics,
Deployment info, Node reserve.

Conferences is worth calling out: it returned 500 - "Cannot write Conf1.info:
tooltype array structure not recognised" - until today's info-file fixes, and
round-trips now.

## Traps left standing

- **Two security endpoints disagree.** The page uses
  `GET /config/security/levels/:level`, which reads the ACS FILE and keys flags
  `ACS.CENSORED`. `GET /config/security/:level` reads the DATABASE mirror and
  keys them `CENSORED`. Writing a bare name through the save route puts a
  tooltype in the file that AmiExpress does not read. The mirror-backed route
  appears unused by the admin.
- **`Doors/GWall` and `Doors/Gwall` both exist on the live volume**, and the
  door and the API agree on a third path, `doors/gwall/GWall.cfg`, which is
  where saves land. Consistent between the two, but the stale
  `Doors/Gwall/gwall.cfg` is read by nothing.
- The GET sweep is 20 config endpoints plus statistics, globalwall, deployment,
  batches and node-control; all answer 200 with real data. The write sweep
  covered every domain above. Doors install/delete, user create/delete and the
  batch editor PUT were NOT round-tripped.
