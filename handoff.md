# Handoff

## Alt+Enter works now, everywhere (2026-09-02)

`thoughts/shared/handoffs/2026-09-02_the-size-switch-the-editors-and-a-real-battle-royale.md`
is the record, including the ANSI editor audit and grandmaster's rebuilt
battle royale (99 players, a grid of playfields, standings under your own
board; 98 bots cost 0.16 ms/frame, measured).

**Responsive is FOUR things.** Ask the terminal to widen, follow the resize,
put 80 columns back (`sdk/utils/terminal-mode.ts` does those three) - and be
able to RECEIVE the key that asks, which was broken in three places at once:
the browser never sent Alt+Enter (xterm does not ESC-prefix Option on macOS),
the SDK parser could not name ESC+CR as `M-enter`, and game mode dropped
modifiers. Alt+LETTER always worked, which is why none of it was noticed.

Doors with the switch, all starting FIXED: grandmaster (also Settings >
DISPLAY), sprite-editor, ansi-editor, livechat (wide only on /chat),
bug-tracker, bbs-dashboard, doors-menu, theme-picker, scrollwars. card-lobby
cannot have it until someone extracts from its 2826-line index.ts.

**A source pin proves a call exists, not that it runs.** The ANSI editor door
threw on start for every caller while a test asserted its source mentions
`createTerminalModeSwitch`. Doors that got the switch later have tests that
START them.

## READ THIS FIRST

**Door rendering, the deploy that lies, the disk:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`
is the current state.

**The backend used to line-wrap screen paints**, corrupting every door that
paints at absolute cursor positions. Fixed by `positionsCursorAbsolutely()`
(`web/backend/src/utils/ascii-art.util.ts`): a door that moves the cursor is
PAINTING and has no lines to wrap. Check any door that still looks subtly
wrong against that.

**Bytes are milliseconds in a 68K door.** ~45ms of emulation per 198-byte
XIM message, measured. A screen paint's cost is its byte count. Do not send
a colour already set, and do not pad rows on a screen that was just cleared.

**Debugging a door's rendering: capture, do not guess** -
`XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`. Three wrong conclusions in
one session ended there. The handoff carries the method and the log-parsing
trap that fakes a convincing reproduction.

**Start here for 2026-09-01:** the three handoffs of that date -
`..._door-settings-admin-and-the-two-store-class.md`,
`..._sysop-list-smtp-to-config-files.md`, and
`..._activity-feed-screen-parity-and-the-live-board.md` (latest).

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one. Eight reports in one
day were all this. Before believing any config change works, check the store
the CONSUMER reads: `db.authenticateUser` reads the users table, express.e and
the signup prompt read the .info files.
**A door must never resolve its files from `process.cwd()` or bare
`__dirname`** - use `resolveDoorRoot(__dirname)` and `resolveBbsRoot(__dirname)`.
Two tests fail on the pattern (`tests/doors/doors-do-not-use-cwd.test.ts`,
`tests/no-hardcoded-home-paths.test.ts`).
**Doors, deletes, DOORREPO:**
`thoughts/shared/handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md`
is the state behind it. Behind it: `..._doorrepo-doors-and-deploy-fixes.md`
(the morning), `..._session-handoff.md` (admin, finished and deployed).

**A door is its REGISTRATION** - five live reports in one day were the `.info`
left behind or another door's taken away. Before any delete/install/list path,
read `web/backend/src/doors/door-registration-paths.ts` and its case table,
`examples/doorrepo-c/tests/delete-rule-cases.txt`. The same rules exist in C
(`examples/doorrepo-c/flow.c`) for real Amiga boards. **Fix one side, fix the
other** - the shared table fails until you do.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo: `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`,
key `~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`. Backend on 3001.

Push to `main` auto-deploys; **then check it** -
`docker exec amiexpress-bbs cat /app/.git-sha`. Green CI has lied. A deploy
that builds but cannot serve now rolls back to the previous image by itself.
Deploys disconnect /chat after a 60s countdown. Docs changes do not deploy.

**`main` moves under you** - other sessions push constantly. Cut a worktree
from fresh `origin/main`, cherry-pick, confirm ancestry before pushing and
before deleting anything. A worktree needs
`Documentation/7-Reference Sources/NDK3.2R4` symlinked in before it can build
the Amiga door.

## Dev

`./dev/scripts/start-servers.sh --bbs-only` / `kill-servers.sh`, and
zombie-verify after every stop. A change that "does not apply": clear the tsx
cache, `rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

Run **`npm run typecheck:tests`**, not just `npm test` - jest uses swc and
strips types, so a file can be green under jest and fail the typecheck.

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it;
two agents in one door pull each other's half-finished work into a commit.
Use separate worktrees.

**Door releases are Shrinkler-packed** - see the `shrinkler-door-releases`
skill. A crunched door needs MORE emulator memory, not less: crunched
DoorRepo (513 KB) is refused by the 500 KB door region, a smaller door is
fine.

## Next

**START HERE:** `thoughts/shared/handoffs/2026-09-02_screen-manager-conference-paths-and-the-editor.md`
is the state - the screen file manager, conference directories, and phase 2 of
the editor, with what each cost.

**Phase 2 is DONE - the SDK's ANSI editor runs in the admin.** Record:
`thoughts/shared/handoffs/2026-09-02_browser-ansi-editor-phase-2-complete.md`.
Nothing about a drawing tool was written twice: the canvas, the ten tools, undo
and the CP437/SAUCE codec are the DOOR'S, imported from
`sdk/engines/ui/ansi-editor` SOURCE; the browser adds a renderer and input and
nothing else. Colour there is SGR minus 30 - red is 1, not the EGA palette's 4.

**A deleted conference used to come back on every deploy.** The entrypoint
re-copied any "missing" `Conf<n>` directory and re-seeded any absent
`Conf<n>.info` from a template shipping Conf1-Conf14, so the live board carried
fourteen directories and fourteen icons for five conferences - and the screen
manager listed all fourteen. Seeding now asks ConfConfig.info. Conferences shows
the directories nothing points at, with a Remove. The nine on the volume were
backed up to `/root/bbs-backups/dead-conferences-2026-09-02.tgz` before removal.

**A directory is never derivable from a number on this board.** A node's screen
directory is its `SCREENS` tooltype (ACP.e:2666-2673); a conference's is
`LOCATION.n` (express.e:31849). Renumbering moves the entries and leaves the
directories alone, so `Conf<n>` from a number reads the DELETED conference -
three live faults so far. Use `conferences/conference-paths.ts` (its
`conferenceNumbers()` answers WHICH conferences exist) and
`screens/screen-resolution.ts`.

**LIVE and verified through the loader in the container:** the invented screen
fallback is gone; 41 nodes keep their own screens, 215 read `Screens/Node/` by
tooltype; every conference path reads LOCATION.n, doors included (BB_CONFLOCAL,
MSGBASE_LOC).

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff (5,865
lookups here). `dev/scripts/provision-node-screens.ts` gives a node screens and
is NOT in the image, so it must be copied into the container to run there.

Also open:

1. **Yours:** nobody has driven the screen manager, the browser ANSI editor,
   or DOORREPO's `T`/`H`/`ENTER`/uninstall by hand. `Doors/emp_tools` is the
   interesting DOORREPO case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests, never a
   drive against the LIVE board.
3. **The release ships THIS board.** `Dockerfile:262-300` copies our `Screens`,
   `Conf1`-`Conf14` and `Node0`-`Node40` into `/app/default-data`. Needs its
   own spec.
4. `Conf<N>.Stats` is still keyed by NUMBER, deliberately - a position, like
   conferenceAccess. First place to look if conference stats read wrong after
   the sysop's deletes.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON
   PURPOSE: the cheap version broke re-sort, and its test caught it.
6. Audio stutter: one cause fixed, never confirmed.
7. **The Doors volume never deletes** - the entrypoint syncs with
   `tar | tar`, so a file dropped from the image lives on the volume for
   ever (eight orphans removed by hand 2026-09-02). Prune
   `Doors/<door>/dist/` for doors the IMAGE ships, never for DOORREPO's.
8. **Drive Setup, from the sysop (2026-09-02):** the admin's drive section is
   suspected of doing very little - find out what `Drives.info` actually
   reaches - and the wanted feature is online storage: S3 buckets and the
   like, offered as a place a board's files can live.
9. **card-lobby needs an extraction** (2826 lines) before it can take the
   size switch.

## Gotchas

- **Read the mutation path; do not count.** Three false positives.
- **A green API is not a green disk**, and a symbol-free binary is not one
  that was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`
  and `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Give the door probe 20 s.** Less kills the harness before it boots.
- **Never `git stash` here** - the CRLF phantom files block `stash pop`
  permanently. Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible
  until `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
