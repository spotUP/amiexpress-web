# Handoff

## START HERE: PETSCII and GMASTER (2026-09-06, latest)

LIVE at `a76312675`. A day of live-reported C64 and phone defects, each fixed
at the level it belonged to:

- **A block is square ON THE GLASS.** An xterm cell is half as wide as it is
  tall, so a block is two characters; a PETSCII cell is square, so two is a
  2:1 smear. The panel sheet's C64 variant is one character wide, and the
  tetris boards apply the width at the SINK (`Doors/grandmaster/ui/block-width.ts`)
  rather than in the eight things that produce a block.
- **The SDK draws PETSCII in PETSCII.** `Screen._renderBorder` is the live
  border paint and now takes its glyphs from
  `sdk/engines/ui/blessed/core/border-chars.ts`; the C64 gets the character
  ROM's own box drawing ($70 $6E $6D $7D corners, $40 rule). The ASCII table
  is byte-identical, which is what keeps the 80-column baselines green. A
  dead duplicate table in `element.ts` reads the same source now.
- **Text breaks at words.** `Element._wrapContent` and `List.wrapAnsiText`
  were two copies of a hard column break, both commented "word wrap"; one
  ANSI-aware wrapper (`core/wrap-text.ts`) serves both. The 40-column
  baseline snapshot moved because it pinned `descriptive t` / `ext`.
- **A narrow lobby shows ONE panel at a time**, revealed by the Tab cycle it
  already had. Two columns of 40 leaves 13 characters of content, which no
  wrapper can save.
- **Tab and Escape exist on a PETSCII session**: the canvas emits them, the
  input map lets them back out, and the canvas surface traps Tab in the
  capture phase so the browser cannot take focus.
- **A door survives a reconnect**, and the browser is told which door via
  `door:active-client` on session restore.
- **A CPU battle takes the boards that fit** and miniatures the rest; the
  all-or-nothing rule is for humans only.

Open, and the sysop's to call: the C64 TETRIS ATTACK board is 6x13 (square,
small). A 12x24 board is possible only by dropping the incoming row from the
display, which costs sight of the row that is rising.

NOT MINE, ALREADY RED ON MAIN: `sdk/tests/unit/door-themes.test.ts` (8) and
the backend's `themec-40` 80-column pin - the THEMEC marker changed and its
fixture was not regenerated.

## The screen manager (2026-09-02)

LIVE at `380f7b4af`; the record is
`thoughts/shared/handoffs/2026-09-02_the-screen-manager-and-what-the-board-knows.md`.
The manager kept reporting things that were not true, each the same shape: a
check answering a question nobody asked - "read by nothing" meant "is not the
ONE file the loader picks at level 255", the health check read `/app` while
the board is at `/app/data/bbs` and OFFERED TO FIX IT, `xpr` where AmiExpress
writes `Xpr`, `Conf1/Screens` where conference 1 lives in Conf2. **Check a
claim against the board before believing it.** `/admin/screens` opens on a
gallery drawn with the editor's own renderer.

## Doors and widgets (2026-09-02)

`thoughts/shared/handoffs/2026-09-02_the-doors-that-could-not-run-and-the-widgets-they-built-themselves.md`
is that session's full record.

**GRANDMASTER's layout fixes LANDED** (`0595d0507`), from a worktree off
`origin/main`; the shared tree still holds another session's loose grandmaster
work, which is why a door's pre-commit rebuild may fail on a diff that is not
yours - check the shared checkout first.

**A deploy failing in under 20s is the host's `git fetch`**, not your
commit - anonymous HTTPS ref listing breaks under a burst of pushes.

## Earlier on 2026-09-02

`..._the-key-handler-...md`, `..._the-size-switch-...md`. Carrying: **xterm
keeps ONE custom key handler** (`classifyKey()`); **the Doors volume deletes
now**; **`// @ts-nocheck` is a bug report**; **a source pin proves a call
exists, not that it runs.**

## READ THIS FIRST

**Door rendering:**
`thoughts/shared/handoffs/2026-09-01_door-rendering-the-wrap-bug-and-the-disk.md`.
Backend line-wrapping corrupted every door painting at absolute cursor
positions; fixed by `positionsCursorAbsolutely()`
(`web/backend/src/utils/ascii-art.util.ts`) - a door that moves the cursor is
PAINTING and has no lines to wrap.

**Bytes are milliseconds in a 68K door** - ~45ms per 198-byte XIM message,
measured. Do not send a colour already set, or pad rows on a cleared screen.

**Debug a door's rendering by CAPTURING it** - `XIM_DEBUG=1
XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1`, never by guessing; the handoff carries
the method and the log-parsing trap that fakes a reproduction. The other
09-01 handoffs (settings admin, sysop list/SMTP, activity feed) sit beside
it.

**THE CLASS TO SUSPECT FIRST: two stores.** A user, a computer list, a screen
type, a door's settings and a password each exist in SQLite AND on disk, and
the BBS and the admin do not always read the same one. Eight reports in one
day were all this. Before believing any config change works, check the store
the CONSUMER reads: `db.authenticateUser` reads the users table, express.e and
the signup prompt read the .info files.
**A door must never resolve its files from `process.cwd()` or bare
`__dirname`** - use `resolveDoorRoot(__dirname)`/`resolveBbsRoot(__dirname)`;
two tests fail on the pattern.

**A door is its REGISTRATION** - five live reports in one day were the `.info`
left behind or another door's taken away. Before any delete/install/list path,
read `web/backend/src/doors/door-registration-paths.ts` and its case table,
`examples/doorrepo-c/tests/delete-rule-cases.txt`; the same rules exist in C
(`examples/doorrepo-c/flow.c`). **Fix one side, fix the other.** Background:
`..._2026-08-31_door-delete-rules-and-doorrepo-parity.md`.

**DOORMAN is kept.** The parity spec's phase E is withdrawn; it is the
reference implementation. Do not delete `Doors/door-manager`.

## Live

`https://bbs.uprough.net`, door server `https://doors.uprough.net` (SEPARATE
repo: `/Users/spot/Code/amiexpress-doorserver`). Host `root@89.167.21.154`,
key `~/.ssh/hetzner_deploy`. `BBS_DATA_DIR=/app/data/bbs`, backend on 3001.

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

A TypeScript door's `dist/` is what runs and the pre-commit hook rebuilds it -
two agents in one door pull each other's work into a commit, so use separate
worktrees. A worktree also needs each door's `node_modules` symlinked, or a
suite importing that door fails to RUN and reports 0 failures.

**Door releases are Shrinkler-packed** (`shrinkler-door-releases` skill). A
crunched door needs MORE emulator memory, and the 500 KB door region refuses
some of them.

## Next

**Full session record:** `thoughts/shared/handoffs/2026-09-04_grandmaster-petscii-tui-screens.md`

**CLOSED this session:**
- Grandmaster GameScreen compact 40-col layout (isCompactWidth, hide side panels)
- Font + modem speed cookie persistence
- TUI console: all 6 theme-token-migrated pages
- Admin roles page (live permissions via API), admin access-level gating
- Remember-me checkbox on admin login
- Sprite manager page (browse/upload/preview/delete sprites)
- Operator Chat: bot ANSI rendering (typing preview line 23, scroll region line 22), sysop take-over, keystroke transmission, notification permissions, classic mode default, typing speed/typo/think-time sliders
- Screen revision history (10 revisions, snapshot-on-write, preview + restore)
- Mailscan: same-messages-new-every-login bug (session pointer sync + validatePointers lowestKey clamp)
- Message repair endpoint (POST /api/config/messages/repair-headers)
- Container entrypoint fixes, volume mount discipline

**OPEN:** none

**Doors/GWall vs Doors/Gwall blocks rebases** - two tracked blobs, one file on
a case-insensitive disk, so one always reads as modified and `git rebase`
refuses to start. Land by cherry-picking onto a worktree of origin/main until
somebody decides which name survives (`Commands/BBSCmd/GWALL.info` points at
`DOORS:GWall/GWall`; the lowercase path has the package.json).

## PETSCII (2026-09-02)

The transducer, the canvas and the C64-is-black rule:
`thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md`. Today's section
above supersedes its UI half.

## Gotchas

- **A green API is not a green disk**, and a symbol-free binary is not one
  that was checked. Look at the bytes.
- **The emulator logs corruption and continues** - `VERIFICATION: n FAILED`
  and `CRITICAL: n library trap(s) missing` are real failures shown as noise.
- **Never `git stash` here** - the CRLF phantom files block `stash pop`
  permanently. Use `git checkout <ref> -- <paths>`.
- **Much of this repo is CRLF.** Open files with `newline=''` at both ends.
- **A door archive names its own command** in `Commands/BBSCmd/<CMD>.info`.
- **SDK tests import the built `sdk/dist`** - a source edit is invisible
  until `npm run build:cjs`.
- **A merged admin screen must keep a redirect** (`src/routes/legacy-routes.ts`).
- **`set -e` kills the container if ANY entrypoint step fails.** Exec must not be guarded by it.
- **`session.lastNewReadConf` is NOT automatically synced.** Every DB pointer update must also update the session.
- **Bot ANSI must write to scroll region, not line 23.** Committed text goes to line 22.
- **A deploy without the volume mount loses all data.** Use `docker compose up -d` from `/app/amiexpress/`.