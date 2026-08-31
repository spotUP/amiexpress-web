# Handoff

## READ THIS FIRST

**The admin, the .info parser and door settings:**
`thoughts/shared/handoffs/2026-08-31_admin-audit-and-door-settings.md` is the
current state - eighteen fixes, three live repairs, and the open work.
**Doors, deletes, DOORREPO:** `..._door-delete-rules-and-doorrepo-parity.md`.
Behind them: `..._admin-functional-audit.md` (how the admin was checked),
`..._tooltype-length-prefix-and-the-orphan-prune.md` (the parser arc).

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

## Next

Nothing queued by the user. Open:

1. **Door settings phase 4** - the two pilot doors, `Doors/livechat` and
   `Doors/bbslink`. Plan:
   `thoughts/shared/plans/2026-08-31-typescript-door-settings-in-admin.md`.
   Phases 1-3 are in; no door has a manifest yet, so nothing has changed for
   any door.
2. **Yours:** nobody has driven DOORREPO's `T` (config), `H` (history),
   `ENTER` (run) or an uninstall in a shared directory by hand.
   `Doors/emp_tools` holds two doors and is the interesting case.
3. `PUT /api/door-admin/installed/:cmd/info` 401s a config-API token - its own
   router, its own auth - so its live behaviour is UNVERIFIED. Same for the
   streaming `DELETE`.
4. `Doors/door-manager/app.ts` is ~1940 lines against the 2000 ceiling; the
   next feature there needs an extraction first.
5. Audio stutter: one cause fixed, diagnostics live, never confirmed.
6. The realtime admin layer has never met a busy board.
7. The two security endpoints name the same flags differently (`ACS.CENSORED`
   vs `CENSORED`); `dev/console` uses the mirror one, so it cannot just go.

Checked 31 Aug, do not re-do: the six admin pages ARE on
`components/ui/DataTable` (Security is a flag editor, not a table);
`VITE_BYPASS_AUTH` is gone, `src/test/auth-guard.test.ts` keeps it gone;
Configuration Files is two tabs; the wall door was never missing. Node
Configuration deliberately stays on the old `DataGrid`.

`bbsConfig.info` is writable now and the live icon is healed. Three data
repairs landed on the board 31 Aug - MAX_NODES 255->32, 187 dead registrations
deleted, GWALL uninstalled - each backed up under `/root/bbs-backups/`.

**A green suite proved nothing here.** `tests/api/config-routes.test.ts`
asserts "200 or 404" and mocks the user-file managers, which is how new users
came to be written to a file nothing reads. Drive the API and read the bytes.

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
