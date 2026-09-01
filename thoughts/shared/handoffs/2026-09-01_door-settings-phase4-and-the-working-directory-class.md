---
date: 2026-09-01
topic: Door settings phase 4, the admin that could not show them, and six doors that asked the wrong directory
tags: [doors, sdk, admin, registrations, live-board]
status: implemented
---

# What this session did

Three arcs. The first was the planned one; the second and third were found by
doing it.

1. **Phase 4 of the door-settings plan** - `Doors/bbslink` and `Doors/livechat`
   declare their own settings, and the admin renders them. Doing it exposed
   that the plan's own instruction could not work on the board.
2. **The admin could not show what it advertised.** A badge said a door was
   configurable; the form lived behind a different icon, then below the fold,
   then in white-on-white fields.
3. **Six doors were reading paths that have never existed on the board.** Same
   root cause, four different symptoms, one of them a data loss waiting to
   happen.

Everything below is on `main` and verified live by container sha.

## Start here

- The plan, with phase 4's record: `thoughts/shared/plans/2026-08-31-typescript-door-settings-in-admin.md`
- The guard that stops arc 3 coming back: `web/backend/tests/doors/doors-do-not-use-cwd.test.ts`
- The registration guard: `web/backend/tests/doors/registration-matches-the-door.test.ts`

## Arc 1 - a door declares its settings

`Doors/<door>/door.settings.json` is the declaration; `settings.json` beside it
is what the sysop set. Three doors ship one now: BBSLINK, LIVECHAT, LINKWALL.

**The plan said `readDoorSettings(__dirname)` and that could not work.**
`door.handler.ts` imports a door's `index.ts` in development and its
`dist/index.js` in production, so the same call arrives from two directories
while the admin only ever writes to one. Every compiled door would have read an
empty object and run on its defaults, silently. `resolveDoorRoot` walks up for
the declaration - and for `package.json`, so it answers "where is this door's
own directory" for doors with no settings at all.

**`readDoorSettingOverrides` returns only what the sysop actually set.** The
plan requires a migrating door to keep reading its old file for one release,
and `readDoorSettings` cannot tell a default from a value: the declared
`timeout: 10` would have overwritten this board's `TIMEOUT=5` the moment
BBSLink migrated.

**`@amiexpress/bbs-door-sdk/settings` is a real file now** (`sdk/settings.ts`).
Doors compile with `moduleResolution: node`, which ignores the `exports` map,
so that subpath resolved for node and not for `tsc`. Both mean the same module
now, and neither pulls in the audio engine.

**BBSLink had never worked in production.** It resolved `bbslink.cfg` with
`path.resolve(__dirname, ...)` and `dist/` does not carry the file, so every
launch died on "syscode/authcode/schemecode missing" with the credentials one
directory up.

## Arc 2 - the admin

- `has_settings` had been served by the API since phase 2 and read by nothing.
  The list badges it now.
- The form was in the `.info` editor, behind an icon labelled ".info file",
  while the badge said "Settings". It is in the **Edit Door** modal - the
  screen a sysop opens to configure a door.
- Putting it after the modal's footer put it off-screen: the dialog is capped
  at 90vh and scrolls. It is above the buttons, and `DoorSettingsForm` renders
  a `div` rather than a `form`, because a form inside a form is dropped by the
  browser and its Save would have submitted the door.
- The fields were white in a dark admin: they asked for `bg-surface-raised`,
  which is not a token, and an undefined Tailwind colour compiles to nothing.
  `tailwind-tokens.test.ts` only validated the legacy `bbs-*` names; it checks
  the `surface`/`content`/`status` ramps now.
- The editing dialogs wore a two-pixel accent border. They use the border
  token, like every other surface. Six dialogs share that shell.

## Arc 3 - six doors asked the wrong directory

The backend runs with cwd `/app/web/backend` (Dockerfile WORKDIR) and a door's
files are under `/app/data/bbs/Doors/<door>`. `__dirname` is `dist/` in
production. Both were used as "my own directory":

| Door | What it could not find | Symptom |
|---|---|---|
| BBSLink | `bbslink.cfg` via `__dirname` | died on missing codes |
| BBSLink wall | the same cfg via `cwd`, plus unset `BBSLINK_*` env | never had credentials |
| telnet | `telnetdoor.cfg`, the file its own menu tells sysops to create | empty menu, no error |
| GRANDMASTER | its SQLite database, on the container's ephemeral layer | every deploy would have erased every game |
| DOORMAN | the file explorer's root, and the backend's AmigaGuide parser | explorer on nothing; every .guide as plain text |
| GWall (uninstalled) | `BBS_ROOT`, empty in the container | - |

Arkanoid and Super Qix had each already been bitten and grown a private copy of
the walk, with comments describing this exact loss. Both call the SDK now.

**Nothing was lost.** No `grandmaster.db` existed on the board, so the door had
never written one there to lose.

## Registrations

- `LINKMENU` deleted: `TYPE=XIM`, a 68K binary not on the board.
- `LINKWALL` repaired to `TYPE=TS`, `LOCATION=Doors/bbslinkwall` - the wall that
  exists. Written through the project's own `.info` writer, so the file is still
  a DiskObject (e310, 1306 -> 1367 bytes).
- **33** dead per-game registrations deleted (lord, luna, teos, tw2002 and 29
  more), every one pointing at `Doors:bbslink/bbslink`. The live board had
  already pruned them; this stops the image restoring them. 33, not 32:
  `TEST.info` and `test.info` were both tracked, identical and dead, and only
  the git tree showed the pair.
- Two package.json commands corrected to what the board registers: BBSLink said
  `LINKMENU`, the wall said `BBSLINKWALL`. The shipped-manifest test caught both.

## Learnings worth keeping

- **`git show | strings | grep -q` returns non-zero on SIGPIPE.** A tree scan
  reported "nothing found" twice before that was noticed. Same trap as `| head`.
  Write to a file, then grep it.
- **jest's `expect` takes one argument.** `expect(value, message)` is vitest,
  and it fails the test with "Expect takes at most one argument" - which reads
  exactly like the assertion failing for real. One dead-registration sweep was
  briefly blamed on data because of it.
- **A case-insensitive filesystem hides duplicate registrations.** `TEST.info`
  and `test.info` collapse to one entry in the working tree. `git ls-tree` is
  the only honest listing.
- **The pre-commit hook refuses any change to a file over 2000 lines.** A
  one-line fix to `neo-blessed-showcase/app.ts` (3702 lines) cannot be
  committed until the file is split. That door still lists the wrong directory
  in its FileManager demo.
- **Verify which deploy you are watching.** `gh run list --limit 1` right after
  a push returns the PREVIOUS run as often as not; twice a "not live" reading
  was really "watched someone else's run".
- **The board's own disk is a failure mode.** The board was down for an hour on
  a full disk (73G of 75G): the deploy died at
  `docker-entrypoint.sh: echo: write error: No space left on device` and the
  automatic rollback failed too. `df -h /` and `docker system df` before
  suspecting a commit.

## Next steps

1. **Sysop test on the board.** BBSLINK -> Door settings, set the codes, run it.
   LIVECHAT -> change the default channel, relaunch. Neither has been driven by
   hand.
2. **The rest of the doors, one per PR.** A door without a manifest is
   unaffected; the pattern is `Doors/<door>/config.ts` reading through
   `readDoorSettingOverrides`, with a round-trip test.
3. **`TTT.info` and `ttt.info` are both on the live volume** - case-duplicate
   registrations for the same door. `Doors/tic-tac-toe` is on the board and not
   in git, so the door itself is fine.
4. **`neo-blessed-showcase/app.ts` needs splitting** before its cwd bug can be
   fixed at all.
5. **GWWALL and LINKWALL are now two commands for one door.** Deliberate -
   aliases, like IRC/CHAT/LIVECHAT - but worth a sysop's opinion.
