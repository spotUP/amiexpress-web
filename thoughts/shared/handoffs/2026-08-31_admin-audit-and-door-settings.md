---
date: 2026-08-31
topic: The tooltype parser, the admin audit that followed it, and door settings
tags: [admin, doors, info-files, users, sdk, live-board]
status: implemented
---

# What this session did, and where to pick it up

Three arcs, in order. Each one was found by the previous one.

1. A `.info` parser bug hid sixteen commands, and pulling that thread opened
   four more parser defects and made `bbsConfig.info` writable.
2. The sysop said the admin was broken and everything needed checking. Driving
   the admin API against a real BBS tree - rather than reading the source -
   found six defects, two of them destroying data.
3. TypeScript doors could not be configured from the admin at all. Phases 1-3
   of a plan for that are implemented; phase 4 (the doors themselves) is open.

Eighteen commits, all on `main` and deployed. Live repairs are listed under
"The board was changed" below, each with a backup path.

## Start here

- The plan with open work: `thoughts/shared/plans/2026-08-31-typescript-door-settings-in-admin.md`
  (`status: implemented (phases 1-3); phase 4 open`).
- The audit method and what is still standing:
  `thoughts/shared/handoffs/2026-08-31_admin-functional-audit.md`.
- The parser arc in detail:
  `thoughts/shared/handoffs/2026-08-31_tooltype-length-prefix-and-the-orphan-prune.md`.

## Next steps, in order

1. **Phase 4, the two pilot doors.** `Doors/livechat` (already defines its own
   `DoorMetadata` interface) and `Doors/bbslink` (real credentials, currently
   parsed out of `bbslink.cfg` at `index.ts:173`). Each gets a
   `door.settings.json`, reads through `readDoorSettings(__dirname)`, and keeps
   reading its old file as a fallback for one release. Nothing else changes
   until a door has a manifest.
2. **`PUT /api/door-admin/installed/:cmd/info` returns 401** to a config-API
   sysop token. It is a different router with its own auth; the edit path was
   verified through `/api/config/*` instead, so that route's live behaviour is
   UNVERIFIED. Ten minutes with the right token settles it.
3. **The two security endpoints still disagree by name.** The page uses
   `GET /config/security/levels/:level` (reads `Access/ACS.<level>.info`, keys
   `ACS.CENSORED`); `GET /config/security/:level` reads the DB mirror and keys
   `CENSORED`. `dev/console/src/api/client.ts:456` uses the mirror one, so it
   cannot simply be deleted. The damage is stopped - `flagsToTooltypes` now
   refuses to invent a non-`ACS.` key - but the two still describe the same
   thing differently.
4. **Four dead client methods** in `web/config-app/src/api/client.ts:421-444`
   (`getSecurityAccessForLevel`, `create/update/deleteSecurityAccess`): zero
   uses in the app. They are the trap that leads a future dev to the mirror.
5. **The realtime admin layer has still never met a busy board**, and the audio
   stutter is still unconfirmed by the sysop.

## The board was changed

Every one of these is a data change on the live volume, each backed up on the
host first.

- **`MAX_NODES` 255 -> 32** in `bbsConfig.info` and `bbsConfig.info.txt`.
  `axconsts.e:43` says `MAXNODES=32`, the write schema agrees, so every System
  Configuration save was rejected on a field the sysop never touched. Backup:
  `/root/bbs-backups/bbsconfig-pre-maxnodes-20260831-192653.tar.gz`. The icon
  healed to a standard array on the way (1719 -> 1962 bytes, 61 tooltypes).
- **187 dead registrations deleted** - 182 `.orphaned` files and five AmigaDOS
  temp-name icons. `Commands` went 370 files -> 183, 100 live BBSCmd
  registrations. Backup:
  `/root/bbs-backups/orphaned-registrations-20260831-181358.tar.gz`.
- **GWALL uninstalled.** Its registration declared `TYPE=XIM` and
  `LOCATION=DOORS:GWall/GWall`, a 68K binary that is not on the board and not
  in the repo; the TypeScript GWall next to it was referenced by nothing. The
  registration is gone from the volume AND from git, so no deploy restores it.
  Sources kept. Backup:
  `/root/bbs-backups/gwall-pre-uninstall-20260831-204251.tar.gz`.

## What was fixed

**The parser arc.** `ba8314a06` `622594b17` `ae40c17df` `4a322bc3e` `52bd4fa83`

- A tooltype 32 characters long carries the length byte `0x21`, which prints as
  `!`, and the scraper dropped anything starting with `!` as a comment. LOCATION
  is the one required field, so sixteen commands vanished from the registry -
  `BADD`, `BS`, `M`, `edit`, `open`, `va`, `_s`, `<` among them.
- An array at an ODD offset was never found (`FCheck/LHA.info` keeps its array
  at 439), so that file fell back to the scrape and reported `SOPTIONS` for a
  tooltype spelled `OPTIONS`.
- Tooltypes appended past the array's end were invisible to the admin
  (`WHAT.info`'s `OVERCLOCK=100`); tooltypes were invented from bitmaps (5714
  fabricated keys across 2691 files, down to 63, nothing real lost).
- `bbsConfig.info` was refused by the writer: first entry declares `0x19` bytes
  and holds 14, the count says 20 where the file holds 62, and entries mix
  prefixed with bare. All three are handled; `saveBBSConfig` reports
  `infoFileWritten: true`.
- A repeated key resolves to the FIRST now - `FindToolType`
  (tooltypes.e:215-218) - in the icon, in the text companion, and in the door
  parser. `FTPDATAPORT` appears twice in `bbsConfig.info`; last-wins had turned
  the sysop's port list into a bare flag.

**The admin audit.** `0e9d73928` `b544868df` `f0efb6491` `5afc50fae` `0c8193be2`

- **Renaming a file checker or a language destroyed its icon** - 529-byte Amiga
  icon to a 54-byte text stub with no DiskObject, which `GetDiskObject` reads as
  NIL. A rename moves the file now.
- **File Checkers was dead on the live board**: the service read `Fcheck`, the
  volume has `FCheck`, which is ENOENT on Linux and invisible on a Mac.
- **New users were written to a file nothing reads.** `UserDatabaseManager`
  resolved `BBS_ROOT` only; Docker sets `BBS_DATA_DIR` and leaves `BBS_ROOT`
  empty, so it wrote `/app/user.data` (0 bytes) while the board reads
  `/app/data/bbs/user.data` (8.7 MB). That path is what a NEW USER SIGNING UP
  goes through (`new-user.handler.ts:1475`). Also, admin user create never
  wrote disk at all.
- **Add Door was broken for every real door type**: `doors.door_type` is CHECKed
  against `('SYSCMD','BBSCMD','INTERNAL')` - the command's SCOPE - while the
  list reports the door's TYPE (`XIM`, `FIM`, `TS`...). The insert threw before
  the registration was written. Registration is written first now.
- **The admin's door reloads re-read a stale map.** `initializeDoors()` only
  READS `commandCache`; `loadCommands` fills it. All three admin reload sites
  called the former, so a door added through the admin never appeared until a
  restart. They call `reloadDoorCommands` now, which already existed.
- **ACS files took flags AmiExpress does not read.** `flagsToTooltypes` invented
  a tooltype for any key handed to it.

**Door settings.** `fff9345ef` `72afdb13d` (plan: `78711ab15`, `0918054c6`)

A door ships `door.settings.json` beside its `package.json`; the admin renders
the form from it with no door-specific code; values go to
`Doors/<door>/settings.json`, which survives deploys because the entrypoint
syncs a door's directory with `tar cf - . | tar xf -` and never deletes.

## Learnings worth keeping

- **The test suite was green through every one of these.**
  `tests/api/config-routes.test.ts` asserts "200 or 404" and "has a boolean
  success field", and mocks both user-file managers - so the disk write it was
  meant to cover was never executed. Replacing those with the round-trip
  pattern used in `tests/services/door-settings-round-trip.test.ts` is the
  single highest-value follow-up.
- **Grepping the source is not evidence that a feature works.** Three admin
  items were declared "already done" this session on the strength of imports
  and greps; the functional audit that followed found six defects in the same
  area.
- **A case-only rename cannot be applied in a macOS working tree.** `git
  update-index --index-info` plus `--force-remove` does it without touching the
  filesystem. `Doors/GWall` and `Doors/Gwall` were BOTH tracked, which is how
  the door ended up split across two directories on Linux.
- **`initializeDoors` reads, `loadCommands` fills, `reloadDoorCommands` does
  both.** Reloading doors without reloading commands re-reads the startup
  snapshot.
- **Never trust that the backend you are testing is the code you edited.**
  Multiple `tsx src/index.ts` processes fight over port 3001; the loser logs
  EADDRINUSE and the winner serves stale code. Kill the port's owner AND its
  parent, then confirm `grep -c EADDRINUSE` on the new log is 0 before drawing
  any conclusion. Two "the fix did not work" moments this session were this.
- **The dev JWT secret differs per tree.** `.env`, `.env.local` and the
  hardcoded default are all in play; a worktree with no `.env` uses the
  default. Mint a token for each candidate and keep the one that returns 200.
- **The backend cannot compile SDK source** (`tsconfig.build.json` sets
  `rootDir: ./src`), and the SDK package root pulls in the audio engine
  (Tone.js, ESM). Narrow subpaths or a duplicated reader with a round-trip
  test; not a relative import.
- **Four probe "findings" this session were the probe's fault**, not the code's:
  the ACS key needs its `ACS.` prefix, batch endpoints return `{name, content}`
  unwrapped while the config API wraps in `{success, data}`, the config
  services write `Protocols/XprTypes.info` and `ComputerList.info` rather than
  the names their pages suggest, and a door that will not register may simply
  point at a binary that is not there. Reproduce against the bytes before
  reporting.

## Other notes

- `dev/scripts/prune-orphan-registrations.ts` is committed and reusable; it
  decides liveness with `commandLocationIsLive`, the registry's own predicate,
  so it can only rename what the registry already ignores.
- The sysop asked for no deploys during one window; the board went down at
  19:05-19:09 for another session's deploy (`dfd943cc5`), which reset every
  open websocket. It recovered on its own; browsers needed a reload.
- `main` moves constantly - four other sessions pushed during this one. Cut a
  deploy worktree from a fresh `origin/main`, cherry-pick, and confirm the
  container's sha by ANCESTRY (`git merge-base --is-ancestor <commit> <sha>`)
  rather than by matching it, because a deploy is often superseded before it
  lands.
