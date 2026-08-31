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

## Second pass: doors

**Add Door was broken for every door type the board uses.** `createDoor`
inserted the mirror row FIRST, and `doors.door_type` is CHECKed against
('SYSCMD','BBSCMD','INTERNAL') - the command's SCOPE - while the list the form
is filled from reports the door's TYPE, which is what the .info carries: XIM,
AIM, FIM, DD, SIM, typescript. So the insert threw "CHECK constraint failed:
door_type" before the registration was written, and the sysop got a 500 with a
raw SQLite message and no door. The registration is written first now and the
mirror insert is best-effort, which is the order the rest of this config layer
already uses; the field's two meanings are left alone, because the writer's
reading of it (SYSCMD -> SysCmd, everything else -> BBSCmd) is correct.

`POST /doors` also never reloaded the door registry, so a door created here
would not have appeared in the list it was created from until a restart - the
same defect the .info edit route already fixes with a reload, and now the same
reload.

**Editing a door works** (200, and the .info is rewritten): the mirror row for
a disk-defined door does not exist, so `updateDoor` touches no rows and the
CHECK is never reached.

**Deleting a door works and is thorough** - `DELETE /config/doors/<CMD>`
reported removing `Commands/BBSCmd/AUDITDOOR.info`, `Doors/auditdoor/auditdoor`
and `Doors/auditdoor`, which is the installed-door link doing its job.

**Not resolved:** a door created with a placeholder binary never reaches the
registry - the reload runs and the command cache grows to include it, but
`Registered door: AUDITDOOR` is never logged. The likely reason is that the
placeholder is the text "placeholder" rather than an Amiga executable, and an
XIM door with no loadable binary should be refused. Unverified: worth ten
minutes with a real door binary before anyone calls it a defect.
