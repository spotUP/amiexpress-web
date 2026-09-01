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

## Sprite work (session of 2026-08-31 evening) - READ ON RESUME

**Full handoff: `thoughts/shared/handoffs/2026-08-31_sprite-engine-studio-and-pengo.md`.**
Live (verified, container d8a0b20dc): cell-art sprite engine, Pengo
rebuilt full-screen with arcade sprites + sfx + music, sprite studio 2a
(SPRITED, sysop), watcher port-guard. LOCAL ONLY: plan 2b (studio editing)
tasks 1-5 of 6 - resume from the SDD ledger at
`.superpowers/sdd/2026-08-31-sprite-studio-2b-editing/progress.md`
(Task 5 review pending, then sweep, final review, user checklist, deploy).
User queue after that: shared 8-way scroller, Frogger sprites, pengo
levelComplete one-liner - memory `project_arcade_sprite_queue`.

## Next

Nothing queued by the user. Open:

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

## Sysop's open list (2026-09-01) - five of six done

Worked through and LIVE, each verified by container sha. Full record:
`thoughts/shared/handoffs/2026-09-01_sysop-list-smtp-to-config-files.md`.

- SMTP sends (`361a49517`). 587 is STARTTLS whatever the SSL box says; the
  sysop confirmed the test email.
- The HTTP checkbox switches the web terminal (`042b33c7f`), and nothing
  else - /admin, /api and /socket.io pass through even when off.
- REGKEY removed (`e42f6d980`).
- The Global Wall page removed (`e2d435499`); GWWALL's crossed registration
  fixed (`bfd396841`).
- Configuration Files finds one node out of forty (`6d48c4dcb`).

**Still open - the last one:** nothing tests that a transfer protocol or a
file checker RUNS. The admin round-trips their .info files and that is all.
The corpus harness (`npm run corpus:integration`) is the shape a real test
would take.

**A tooltype boolean cannot default to TRUE.** Presence is the whole
encoding, and switching off REMOVES the key, so absent cannot mean "on" and
"this file predates the field" at once. Store the NEGATIVE - `HTTP_DISABLED`,
in `INVERTED_BOOLEAN_TOOLTYPES` - or every existing board reads the flag as
off on upgrade. A startup migration cannot fix it; it re-adds the key every
boot after the sysop switches it off.

**A door showing another door's settings is a crossed LOCATION**, not a
rendering bug: the admin draws the form from the directory the registration
names. Read `LOCATION` before reading any code. A command name differing from
the door's own `bbsCommand` is NOT wrong by itself - TC and TCONNECT both
open the telnet door.

**Removing a registration from the repo does not clear it from a running
board.** The entrypoint deliberately leaves anything the image stops shipping
on the volume, so the live board needs its own delete.

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
