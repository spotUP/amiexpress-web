# Handoff

## START HERE: finished but NOT committed

`.../handoffs/2026-09-02_the-doors-that-could-not-run-and-the-widgets-they-built-themselves.md`

**GRANDMASTER's two layout fixes are written, uncommittable**
(`thoughts/shared/patches/2026-09-02_grandmaster-layout.patch`): the menu's
background no longer outlines the terminal; the leaderboard measures from the
screen and re-renders on resize (it had no handler). Blocked - GRANDMASTER
does not typecheck at HEAD (`endMatch`, `lockFlashChar`) and the hook rebuilds
the dist.

**Every defect that day was a door hand-rolling an SDK widget**: CARD
LOBBY computed panel geometry, used an opaque Box not `Overlay`, wrote a text
window whose escape keys never fired. Check doors against `overlay`,
`layout`, `status-bar`, `menu-bar`, `confirm-modal`, `doc-modal`, `prompt`,
`search-modal`, `panel`, `fkey-bar`:
`.../research/2026-09-02_doors-that-hand-roll-sdk-widgets.md`.

Only ONE door was compiled in the image build; two gates stop that
(`docker/verify-door-entries.sh`, `tests/doors/door-dist-is-shipped.test.ts`).
The deploy backs up door data, WAL too.

## Earlier on 2026-09-02

`..._the-key-handler-the-volume-that-never-deleted-and-card-lobbys-nocheck.md`,
`..._the-size-switch-the-editors-and-a-real-battle-royale.md`. Carry:
**xterm keeps ONE custom key handler** - assigns, never appends; every rule
lives in `classifyKey()` (`packages/terminal/src/utils/key-overrides.ts`).
**Alt+Enter fullscreens the browser too**, on the KEY. **The Doors volume
deletes** - `prune_image_door_dists()` in `docker-entrypoint.sh`; dry-run any
delete path on the real volume. **`// @ts-nocheck` is a bug report** - one line
hid six missing methods in CARD LOBBY; the ten size-switch doors are fixed.

## READ THIS FIRST

**Door rendering** (`.../handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`):
backend line-wrapping corrupted every door painting at absolute cursor positions;
fixed by `positionsCursorAbsolutely()` (`web/backend/src/utils/ascii-art.util.ts`)
- a door that moves the cursor is PAINTING, not wrapping. **Bytes are
milliseconds in a 68K door**: ~45ms per 198-byte XIM message, measured - never
resend a colour already set or pad rows on a cleared screen. **CAPTURE a door's
rendering to debug it** - `XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`, never
guess; that handoff has the log-parsing trap that fakes a repro.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, computer list, screen type,
door settings and password each exist in SQLite AND on disk, and BBS and admin
do not always read the same one - eight reports in one day. Read the CONSUMER's
store: `db.authenticateUser` reads the users table; express.e and signup read the
.info files.
**A door must never resolve files from `process.cwd()` or bare `__dirname`** -
use `resolveDoorRoot(__dirname)`/`resolveBbsRoot(__dirname)`; two tests pin it
(`tests/doors/doors-do-not-use-cwd.test.ts`,
`tests/no-hardcoded-home-paths.test.ts`).
**Doors, deletes, DOORREPO:**
`.../handoffs/2026-08-31_door-delete-rules-and-doorrepo-parity.md` + the two behind it.

**A door is its REGISTRATION** - five live reports in one day were an `.info`
left behind or taken away. Before any delete/install/list path, read
`web/backend/src/doors/door-registration-paths.ts` + its case table
`examples/doorrepo-c/tests/delete-rule-cases.txt`. The rules exist in C too
(`examples/doorrepo-c/flow.c`); **fix one side, fix the other** - the shared
table fails until you do.

**DOORMAN is kept** - the parity spec's phase E is withdrawn; it is the
reference implementation. Never delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE repo
`/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`, key
`~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`. Backend on 3001.

Push to `main` auto-deploys; **then check it** -
`docker exec amiexpress-bbs cat /app/.git-sha`. Green CI has lied. A deploy that
builds but cannot serve rolls back by itself; deploys disconnect /chat after a
60s countdown; docs do not deploy.

**`main` moves under you** - other sessions push constantly. Cut a worktree from
fresh `origin/main`, cherry-pick, confirm ancestry before pushing and
deleting. A worktree needs `Documentation/7-Reference Sources/NDK3.2R4` symlinked
in before it builds the Amiga door.

## Dev

`./dev/scripts/start-servers.sh --bbs-only` / `kill-servers.sh`, zombie-verify
after every stop. A change that "does not apply": clear the tsx cache,
`rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`. Run **`npm run typecheck:tests`**,
not just `npm test`: jest uses swc and strips types, so a file can pass jest and
fail the typecheck.

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it, so
two agents in one door pull each other's work into a commit; use separate
worktrees. A worktree also needs each door's `node_modules` symlinked, or a suite
importing it fails to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill): a
crunched door needs MORE emulator memory - crunched DoorRepo (513 KB) is refused
by the 500 KB region.

## Next

**START HERE:** `.../handoffs/2026-09-02_screen-manager-conference-paths-and-the-editor.md`
- screen file manager, conference directories, editor phase 2, and screen
resolution (LOCATION.n / SCREENS tooltype, the deploy re-seeding bug, what is
LIVE).

**Phase 2 DONE - the SDK's ANSI editor runs in the admin**
(`.../handoffs/2026-09-02_browser-ansi-editor-phase-2-complete.md`). Nothing
written twice: canvas, ten tools, undo, CP437/SAUCE codec are the DOOR'S, from
`sdk/engines/ui/ansi-editor` SOURCE; the browser adds renderer and input. Colour
is SGR minus 30 - red is 1, not EGA's 4.

**Measure resolution by driving the loader, never by eye** -
`dev/scripts/probe-screen-resolution.ts` before and after, then diff (5,865
lookups). `dev/scripts/provision-node-screens.ts` gives a node screens; NOT in
the image, copy it in to run it there.

Also open:

1. **Yours:** nobody has driven the screen manager, the browser ANSI editor or
   DOORREPO's `T`/`H`/`ENTER`/uninstall by hand (`Doors/emp_tools`).
2. `PUT /installed/:cmd/info` and the streaming `DELETE` have tests, no LIVE drive.
3. **The release ships THIS board** - `Dockerfile:262-300` copies `Screens`,
   `Conf1`-`Conf14`, `Node0`-`Node40`. Needs a spec.
4. `Conf<N>.Stats` is keyed by NUMBER, deliberately - a position, like
   conferenceAccess. Look there first if conference stats read wrong.
5. Admin remediation 5.3 (memoising nine pages' columns) stays open ON PURPOSE:
   the cheap version broke re-sort, its test caught it.
6. Audio stutter: one cause fixed, unconfirmed.
7. **Drive Setup (sysop):** the admin's drive section may do very little - find
   what `Drives.info` reaches. Wanted: online storage (S3 and the like) as a
   place a board's files can live.
8. **Drive CARD LOBBY by hand** - the four gamepad paths, the end of an UNO game
   and deleting a table have never worked.

**Doors/GWall vs Doors/Gwall blocks rebases.** Two tracked blobs,
`Doors/{GWall,Gwall}/dist/index.js`, are one file on a case-insensitive disk, so
one always reads as modified and `git rebase` refuses to start.
Which name survives is undecided: `GWALL.info` points at `DOORS:GWall/GWall`, the
lowercase path has the package.json.

## PETSCII + 40 columns

A web `P` answer or a C64 gets EVERYTHING as PETSCII - ONE `sdk/petscii/`
transducer per SESSION at the CHOKE, KERNAL oracle inside, fed at both
transports. A C64 terminal is BLACK; only `$02 <colour>` moves the background
and border. `..._2026-09-02_petscii-full-canvas.md`,
`..._2026-09-03_petscii-oracle-at-the-choke.md`.

**The board is adapted to 40 columns** (Task 1's gate is default-closed):
MIN_COLUMNS with `[40]`/`[C64]`, SDK XXS=40 tier, narrow tables, screen reflow
with an `[80-COLUMN ANSI SCREEN - SKIPPED]` token, six adapted doors, effects
OFF on PETSCII. Two chokes - `wrapForSession` (prose) and
`wrapDoorTextForSession` (`BBSApi.write`) - are identity for any ANSI caller and
anything positioning the cursor. A row may use 40 columns, a prompt 39;
`tests/forty-col-sweep.test.ts` sweeps every surface.
**WALK:** `..._2026-09-02_c64-40col-adaptation.md`.

**FULL MCI runs inside a `.seq`**: first byte `~` gates the file - every `.TXT`
code, structural ones too, in document order; ungated art stays byte-identical;
in a gated file EVERY `0x7E` is a token (`~~` escapes). **WALK:**
`..._2026-09-02_mci-in-petscii-seq.md`; sysops: `CONFIGURATION.md` section 5.

**80-column 68K doors reach a C64** (Phase 3): `WHO`, `S`, `WHAT` carry
`C64_ADAPT=40`, show `[C64]`, each frame reduced to 40 columns (`>` = a
shortened column). **Phase 4 WALK:** `..._2026-09-02_c64-door-adapter-phase3.md`

**Wave 3 is on main as `2c709ad60`** (53 commits): the wipes are a real screen
model with delta frames, the terminal fits the window and the viewer overrides
it, `attachDoorChrome` gives 16 doors the chrome, blessed's bottom-right cell no
longer scrolls a C64 (`$14`/`$94` corner idiom, KERNAL-faithful oracle,
4000-case fuzz), and MultiTop's bulletins regenerate on Linux. **WALK:**
`..._2026-09-03_wave3-wipes-zoom-chrome-corner.md`

## Gotchas

- **A green API is not a green disk**; a symbol-free binary is not a checked
  one; look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED` and
  `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Never `git stash` here** - CRLF phantom files block `stash pop` forever; use
  `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible until
  `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
