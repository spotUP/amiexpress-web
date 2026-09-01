---
date: 2026-09-01
topic: Door settings phase 4, the admin, seven doors reading paths that never existed, and the two-store class the sysop found
tags: [doors, sdk, admin, users, registrations, live-board, deploy]
status: implemented
---

# The whole session, and what a fresh one needs

Live and verified at `d7b131505`. Roughly 30 commits of mine on `main`, each
deployed and checked by container sha rather than by a green workflow.

Read this file, then `handoff.md` for the open list. Everything below is
either done and live, or written down as a next step with what was already
learned about it.

## What this session did, in five arcs

1. **Door settings phase 4** - the planned work. Doors declare their own
   settings; the admin renders them. Doing it exposed that the plan's own
   instruction could not work on the board.
2. **The admin** - a badge that promised something a sysop could not find,
   then could not see, then could not read, then could not save.
3. **Seven doors reading paths that have never existed on the board**, all one
   root cause, found by pulling the first thread.
4. **The sysop's live reports** - eight of them, and every one turned out to be
   the same shape: two stores, and the BBS reading the one the sysop does not
   edit.
5. **Two outages** - the board down on a full disk, and every deploy failing
   for three pushes on a committed symlink.

## Arc 1 - door settings

Four doors ship `door.settings.json`: **BBSLINK**, **LIVECHAT**, **LINKWALL**,
**TELNET-FRONT**. A door with no manifest is unchanged.

- **`readDoorSettings(__dirname)` could not work.** `door.handler.ts` imports
  `index.ts` in development and `dist/index.js` in production, so a compiled
  door asks from `Doors/<door>/dist` while the admin writes to `Doors/<door>`.
  `resolveDoorRoot` walks up, and takes `package.json` as a marker so doors
  with no settings can use it too.
- **`readDoorSettingOverrides`** returns only what the sysop set. A declared
  default arriving as a value silently overwrites the old config file a door
  is migrating from.
- **`sdk/settings.ts`** makes `@amiexpress/bbs-door-sdk/settings` a real file:
  doors compile with `moduleResolution: node`, which ignores the exports map.
- **`resolveBbsRoot`** answers the other question - where the BOARD is -
  preferring `BBS_DATA_DIR`, else walking up to `Commands/BBSCmd`.

## Arc 2 - the admin

In order, each found by the sysop looking:

- `has_settings` was served by the API and read by nothing -> a Settings chip
  in the doors list.
- The form lived in the `.info` editor behind an icon labelled ".info file"
  while the badge said Settings -> moved into the **Edit Door** modal.
- It rendered BELOW the footer of a dialog capped at 90vh -> above the buttons,
  and `DoorSettingsForm` is a `div`, because a form inside a form is dropped by
  the browser and its Save would have submitted the door.
- Fields were white in a dark admin: `bg-surface-raised` is not a token and an
  undefined Tailwind colour compiles to nothing. `tailwind-tokens.test.ts` only
  validated `bbs-*`; it checks the ramps now.
- The dialogs wore a 2px accent border -> the border token, like every other
  surface. Six dialogs share that shell.
- **Update Door ignored the settings.** Two save buttons in one dialog, and the
  first sysop to use it typed an address, pressed Update Door, and lost it.
- **The form sent every field**, writing declared defaults into settings.json
  as if chosen - `maxNodes: 8` was pinned that way. Only edited keys are sent.

## Arc 3 - the working-directory class

The backend runs with cwd `/app/web/backend`; a door's files are under
`/app/data/bbs/Doors/<door>`; `__dirname` is `dist/` in production.

| Door | What it could not find | Symptom |
|---|---|---|
| BBSLink | `bbslink.cfg` via `__dirname` | died on missing codes, always |
| BBSLink wall | the same cfg via cwd, plus unset `BBSLINK_*` | never had credentials |
| telnet | `telnetdoor.cfg`, the file its own menu tells sysops to create | empty menu, no error |
| GRANDMASTER | its SQLite database, on the container's ephemeral layer | every deploy would have erased every game |
| DOORMAN | the explorer's root, and the backend's AmigaGuide parser | explorer on nothing; every .guide as plain text |
| RIP browser | `/Users/spot/Code/amiexpress-web/RIPgraphics` | "Directory not found" while 98 files sat on the volume |
| GWall (uninstalled) | `BBS_ROOT`, empty in the container | - |

Arkanoid and Super Qix had already been bitten and grown private copies of the
walk; both call the SDK now. Three backend fallbacks named the same laptop path
and were fixed with them.

**Guards:** `tests/doors/doors-do-not-use-cwd.test.ts` (no door resolves its
own files from cwd; three documented exceptions) and
`tests/no-hardcoded-home-paths.test.ts` (no backend source names a home
directory; two documented exceptions).

## Arc 4 - the sysop's reports, and the class behind them

Every one was two stores disagreeing:

1. **Password change did nothing.** The admin lists users from DISK, so editing
   took the disk branch and wrote `user.data`; `db.authenticateUser` reads the
   SQLite row. Proven on the board: 60-character hash in the database,
   32-character fragment on disk, not even a prefix of each other.
2. **`user.misc` held half a bcrypt hash** - the field is 32 chars, bcrypt is
   60. Written empty now, read as empty.
3. **Deleting a user left them able to log in.** Disk slot zeroed, row intact.
   Both directions fixed; a database-id delete clears the slot too.
4. **The batch editor could not resolve `DOORS:`** - `BBS_ROOT/Doors` ->
   `/app/web/Doors`. Proven live with one file and both spellings.
5. **The Who's-Online door never ran at login.** `login-connect.service.ts`
   reached the command handler through `await import()`, which under tsx yields
   a SECOND module instance: startup logged `syscmd.size=16`, the connect flow
   read a cache holding 0. Fixed with `require()`. **This is the trap most
   likely to recur** - see the memory `dynamic-import-duplicates-module-state`.
6. **Signup offered 2 of 10 computers, W offered 2 of 4 screen types.** Both
   prompts asked the database; the admin, the file and express.e read
   `ComputerList.info` / `ScreenTypes.info`.
7. **W option 12 answered "Command processing failed".** It updated
   `editorType`, and there is no such column - `fieldToColumn` falls back to
   the lower-cased name. What is stored is `editor` ('Prompt'/'Line'/'Full').
8. **Languages listed `._*` AppleDouble sidecars.** Cosmetic there; the same
   scan builds the COMMAND REGISTRY, where a registration owns its name.
   `isRealInfoFile` is used by four scans now.

## Arc 5 - two outages, and how deploys lie differently each time

- **The board was down for an hour on a full host disk** (73G of 75G). The
  deploy died at `docker-entrypoint.sh: echo: write error: No space left on
  device` and the automatic ROLLBACK failed too. `df -h /` and
  `docker system df` before suspecting a commit.
- **Every deploy failed for three pushes** because `4e08d205d` committed
  `web/backend/node_modules` and `Doors/grandmaster/node_modules` as symlinks
  into a home directory: `COPY web/backend ./` cannot replace a directory with
  a symlink. `.gitignore` said `node_modules/` WITH a trailing slash, which
  matches directories only. Untracked, slashes removed, and two tests:
  `no-node-modules-in-git.test.ts` fails on a tracked node_modules by MODE, and
  on any tracked symlink pointing outside the repository.

## Registrations

- `LINKMENU` deleted (TYPE=XIM at a binary that is not there).
- `LINKWALL` repaired to the TypeScript wall it should always have named.
- **33** dead per-game BBSLink registrations deleted - 33 rather than 32
  because `TEST.info` and `test.info` were both tracked, and a
  case-insensitive filesystem shows one file. `git ls-tree` is the honest
  listing.
- Three `package.json` files named commands the board does not run: BBSLink
  said LINKMENU, the wall said BBSLINKWALL, the front end said FRONTEND.
- **Add Door refuses a path with no door behind it** - that is how `AE` came to
  answer "Door not found".
- **`Doors/mail-composer` restored.** Deleted 2026-05-29 by `1cdddac24`, a
  sweep of 801 corpus directories that kept "TypeScript doors with BBSCmd .info
  entries" - this one had no registration yet. 448 lines, compiles against
  today's SDK unchanged.

## The board was changed

- `MAX_NODES` **32 -> 255** in `bbsConfig.info` and its text companion, by the
  sysop, after the schema was widened. The 32 came from `axcommon.e`; this BBS
  runs `NodeStatusManager.MAX_NODES = 255`. `node_number` takes 0-254 now.
- `Doors/telnet-front/settings.json` holds `bbsAddress: uptown.uprough.net`.
  I removed a `maxNodes: 8` that the form had pinned, and a
  `bbsAddress: probe.example.net` my own write-path probe left for a minute.
- `Commands/BBSCmd/linkwall.info` rewritten (still a DiskObject, e310).

## Verification habits that earned their place

- **Compare the container's `.git-sha` to the commit by ANCESTRY.** `main`
  moves constantly; a superseded deploy is normal and a failed one looks
  exactly like an unfinished one.
- **`gh run list --limit 1` right after a push often returns the PREVIOUS run.**
  Twice a "not live" reading was really "watched someone else's run".
- **`git show | strings | grep -q` returns non-zero on SIGPIPE**, so a tree scan
  reports "nothing found" twice before you notice. Write to a file, then grep.
- **jest's `expect` takes one argument.** `expect(value, message)` is vitest and
  fails with "Expect takes at most one argument", which reads exactly like the
  assertion failing.
- **A red-check that passes is not a red-check.** Three tests here needed
  correcting before they could fail on the unfixed code.
- **"Works on localhost" where local is an OLDER tree is a regression report.**
  I dismissed it three times as a stale checkout before using it; diffing the
  two trees is what found the dynamic-import bug.

## Next steps

`handoff.md` carries the sysop's list. In the order I would take them:

1. **SMTP does not send.** It is wired -
   `mail-notification.service.ts:137-145` reads `smtp_server`, `smtp_port`,
   `smtp_username` and refuses a transport without a server. Check what the
   live board has stored, then what the send reports; the service merges
   secrets from a second source (lines 116-117), so the page and the transport
   can disagree about the password.
2. **The HTTP checkbox does nothing.** `http_enabled` is schema + column
   (DEFAULT 0, which is why it shows unchecked) + page, read by nothing; the
   listener at `index.ts:1806` starts regardless. Gating it on a column reading
   0 would take the board off the air, and the admin that would re-enable it is
   served by that listener - so removing the field is the honest fix unless it
   is meant to control something else.
3. **REGKEY can go.** One column, one field, one login line
   (`index.ts:1659`), and that line already falls back to the sysop's name.
4. **The Global Wall page can go** - GWALL is uninstalled and
   `GlobalWallPage.tsx` is the last per-door page, the thing door.settings.json
   replaces. Keep a redirect (`src/routes/legacy-routes.ts`).
5. **Configuration Files lists every node's files in one view** - needs
   grouping or a filter before it is usable on a 40-node board.
6. **Nothing tests that a transfer protocol or file checker RUNS.** The admin
   round-trips their .info files and that is all. The corpus harness
   (`npm run corpus:integration`) is the shape a real test would take.
7. **Field-level disk writes**, so a database-side user edit reaches
   `user.data`. Mirroring a whole `User` back through the fixed-width record is
   how `-TCB!-` was destroyed; `writeConferenceAccessAt` is the pattern.
8. **`neo-blessed-showcase/app.ts` is 3702 lines** against a 2000-line hook, so
   its one-line cwd bug cannot be committed until the file is split.
9. **The telnet front end times out** waiting for `active-users` and falls back
   to placeholder rows - the node table shows "Connecting"/"Awaiting Call"
   rather than who is on.
10. Left alone by the sysop's decision: `font-test` (registered as FONTTEST,
    door deleted by the same sweep), `INTDEMO`, `L.info -> doors:scan.x`,
    `TTT.info`/`ttt.info` case duplicates, and `FRONTEND-ts.info` as a second
    registration for the front end.

## Still unverified by a human

- **Phantasm's password.** Set it once more in the admin and have them log in;
  the write path is fixed and tested, the account has not been re-tested.
- **`AE`** - restored and on the volume, but it has not run since May.
- **BBSLINK** - its credentials reach it now, but nobody has opened the door.
