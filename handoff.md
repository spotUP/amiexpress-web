# Handoff

## READ THIS FIRST

**Door rendering, the deploy that lies, the disk:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`
is the current state.

**The backend used to line-wrap screen paints.** Every door that paints at
absolute cursor positions was being corrupted whenever one 198-byte XIM
message ran past the wrap column - a newline pushed into the middle of a
paint, so the rest of the row started the row below. Fixed by
`positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`):
a door that moves the cursor is PAINTING and has no lines to wrap. If a
door still looks subtly wrong, check it against that.

**Bytes are milliseconds in a 68K door.** ~45ms of emulation per 198-byte
XIM message, measured. A screen paint's cost is its byte count. Do not send
a colour already set, and do not pad rows on a screen that was just cleared.

**Debugging a door's rendering: capture, do not guess.** Three wrong
conclusions in one session ended the moment the door's real traffic was
captured with `XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`. The method
is written down in that handoff, including the log-parsing trap that
manufactures a convincing fake reproduction.

**Start here for 2026-09-01:**
`thoughts/shared/handoffs/2026-09-01_door-settings-admin-and-the-two-store-class.md`
is the full record - door settings, the admin, seven doors reading paths that
never existed, eight live reports from the sysop, and two outages. The earlier
`..._door-settings-phase4-and-the-working-directory-class.md` is the first half
of the same day.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one. Eight reports in one
day were all this. Before believing any config change works, check the store
the CONSUMER reads: `db.authenticateUser` reads the users table, express.e and
the signup prompt read the .info files.
**A door must never resolve its own files from `process.cwd()` or bare
`__dirname`** - cwd on the board is `/app/web/backend` and `__dirname` is
`dist/` in production. Use `resolveDoorRoot(__dirname)` for the door's own
directory and `resolveBbsRoot(__dirname)` for the board. Two tests fail on the
pattern: `tests/doors/doors-do-not-use-cwd.test.ts` and
`tests/no-hardcoded-home-paths.test.ts`.

**Doors, deletes, DOORREPO:**
`thoughts/shared/handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md`
is the state behind it. Behind it: `..._doorrepo-doors-and-deploy-fixes.md`
(the morning), `..._session-handoff.md` (admin, finished and deployed).

**A door is its REGISTRATION.** Five live reports in one day were the same
defect: the `.info` left behind, or another door's `.info` taken away.
Before touching any delete/install/list path read
`web/backend/src/doors/door-registration-paths.ts` and the case table it is
pinned to, `examples/doorrepo-c/tests/delete-rule-cases.txt`. The same rules
exist in C (`examples/doorrepo-c/flow.c`) because DOORREPO runs on real
Amiga boards with no server to ask. **Fix one side, fix the other** - the
shared table fails until you do.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo and deploy: `/Users/spot/Code/amiexpress-doorserver`). Host
`root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, port 22.
`BBS_DATA_DIR=/app/data/bbs` - not `/app`, a bare skeleton. Backend on 3001.

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

## Sprite work

`thoughts/shared/handoffs/2026-08-31_sprite-engine-studio-and-pengo.md`, and
the 2026-09-01 sprite-studio-2c handoff. Queue: memory
`project_arcade_sprite_queue`.

## Next

**Activity overview: largely built.** Still unreported: messages read/posted,
file-area browsing. Scoping:
`thoughts/shared/research/2026-09-01_activity-overview-what-users-are-doing.md`.

**QUEUED BY THE SYSOP: a screen file manager** - the admin cannot touch screen
files at all today. 891 files, 85 distinct contents: express.e resolves each
screen type from ONE directory with NO fallback, so the duplicates are
correct, and `SCREENS` (a per-node/per-conference tooltype) is its own answer
to sharing. **1:1 in the read path, better in the write path.** Also logs a
live DEVIATION - this port invents a `Screens (Fallback)` express.e does not
have. Scoping, read off the E sources:
`thoughts/shared/research/2026-09-01_screen-file-manager.md`.

**UNMERGED AND WORTH RESCUING: `feat/door-themes`**, 8 commits that never
landed - the theme mechanism, four themes, a picker so a theme is chosen
without SQL, hex colour tags in blessed, eight glitch kinds, an animated
masthead. Its worktree had uncommitted changes when this was written, so it
belongs to whoever was in it; do not merge it out from under them. Every other
merged branch was deleted on 2026-09-01, local and remote, so what is left on
the remote is `main`, this, and `feat/installed-door-link`.

**Screen parity: three of four closed.** AWAITSCREEN, BBSTITLE and
SCREEN_BULL now resolve where express.e reads them; a GLOBAL screen is read
from the board ROOT, not `Screens/` (express.e:6549 - seven screens ride on
that). Left: NODE_BULL, 0 of 41 - express.e wants `nodeScreenDir + 'BULL'`
and 39 nodes hold `Screens/NODE_BULL.TXT`, a name NOTHING reads, so those
nodes have no node bulletin anywhere today. Moving them ENABLES a second
logon bulletin - new behaviour, the sysop's call. The invented
`Screens (Fallback)` STAYS until that is settled.

**Measure with the extensions the loader accepts.** Two measurements were
wrong today the same way; `docker logs | grep loadScreenFile` prints the
search locations and the file it settled on, and is what caught it. `.SEQ`
is this project's C64 PETSCII, not Amiga data - it does not render right yet
(known, deferred).

**The entrypoint syncs almost nothing** - six board `.info` files and
`Commands/**`. Committing anything under `Node<N>/` or `Conf<N>/` does NOT
reach the live board; today's screen fixes deployed green and landed nothing
until copied onto the volume by hand. Check the volume, not the workflow.

Also open:

1. **Yours:** nobody has driven DOORREPO's `T` (config), `H` (history),
   `ENTER` (run) or an uninstall in a shared directory by hand.
   `Doors/emp_tools` holds two doors and is the interesting case.
2. `PUT /installed/:cmd/info` and the streaming `DELETE` are untested live.
3. `Doors/door-manager/app.ts` is ~1940 lines against the 2000 ceiling; the
   next feature there needs an extraction first.
4. Six admin pages still render their own tables instead of
   `components/ui/DataTable`. Node Configuration deliberately stays on the
   old `DataGrid`.
5. `VITE_BYPASS_AUTH` in `App.tsx` should go now that a sysop account exists.
6. Audio stutter: one cause fixed, diagnostics live, never confirmed.

## Sysop's list (2026-09-01) - DONE, all six live and verified by sha

Full record: `thoughts/shared/handoffs/2026-09-01_sysop-list-smtp-to-config-files.md`.
SMTP, the web-terminal switch, REGKEY, the Global Wall page, Configuration
Files, file checkers. Two limits that outlive the tasks:

**This board's file checkers still do not run** - they name Amiga binaries
Linux cannot execute, so uploads use the built-in JavaScript checkers. One
configured through the admin with a real command now works. **Nothing "runs" a
transfer protocol here** either: Protocols/*.info is admin-only config.

**A case bug cannot be caught by behaviour on a Mac.** HFS+ is
case-insensitive, so a wrong-case join passes locally and fails only on Linux,
where the board and CI run. Pin the spelling at the SOURCE too.

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
