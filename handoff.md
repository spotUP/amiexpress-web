# Handoff

## READ THIS FIRST in a fresh session

Live BBS: `https://bbs.uprough.net`. Door server: `https://doors.uprough.net`.
Both LIVE. Push to `main` auto-deploys; after pushing, CHECK IT
(`docker exec amiexpress-bbs cat /app/.git-sha` - green CI has lied before).
Live host: `root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, **port 22**.

**A deploy still disconnects /chat - but everyone now gets a 60-second
countdown first**, and /chat reconnects itself. Proven on its first real run
(signal 21:39:21, container recreated 21:40:22). Documentation changes do not
deploy at all (`paths-ignore`).

**A peer Claude Code session may work in this SAME checkout.** `git fetch` and
check both directions before pushing.

**Dev environment**: `./dev/scripts/start-servers.sh --bbs-only` /
`kill-servers.sh`. Zombie-verify after every stop:
`ps aux | grep -E "(start-servers|kill-servers|watch-doors|tsx .*src/index.ts)" | grep -v grep`
(expect empty). **78 stale backends were found running at once this session** -
`tsx` does not hot-reload, so a stale process serving old code looks exactly
like a failed fix. If a change "does not apply" after a restart, clear the tsx
cache: `rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*`.

## Current state (2026-08-27)

**6 commits on `main` are unpushed. Live runs `cc15a318f`, older than HEAD.**
Full detail in
`thoughts/shared/handoffs/2026-08-27_admin-audit-and-redesign.md` - read it.

`Commands/BBSCmd/wall.info` is modified in the tree: the user's own admin edit
writing the repo's copy. Left uncommitted on purpose.

## Next task, agreed with the user

Split across two workers:

1. **This session implements the admin redesign** - Phase 1 of
   `thoughts/shared/plans/2026-08-27-admin-redesign.md`. Design needs the
   user's visual feedback, so it belongs where they can steer it.
2. **An agent finishes the audit** - Computers and Protocols have the
   screen-types data-loss bug; per-field round-tripping is unverified
   everywhere.

**Tell the audit agent to read each service's mutation path, not to count.**
Scripted counting gave the wrong answer three times this session: "14 of 28
pages broken" became one real bug, and a later "ten pages write only SQLite"
was wrong about every one of them.

If both run at once, the second must work in a **git worktree** - the
pre-commit hook rebuilds door `dist/` from disk, so concurrent commits in one
checkout pull each other's half-finished work into a commit.

### Phase 1, in order

1. **The 117 dead Tailwind classes** - only six `bbs-*` colours are defined in
   `web/config-app/tailwind.config.js`, but `bbs-border` (78 uses),
   `bbs-secondary` (18), `bbs-background` (14), `bbs-hover` (6) and `bbs-error`
   (1) are used across 14 files and compile to nothing. Invisible borders,
   missing panel backgrounds. Cheapest visible win in the project.
2. Tokens and design system, then the app shell and grouped navigation.
3. The Overview dashboard, on polling only - it ships without any backend
   change.

**Hard rule: restyle only, never change a data path in the same commit.** The
door NAME bug came from exactly that mistake - a field round-tripped a door's
command into its title and renamed it.

Phase 0 of that plan is already done, and so is its Phase 3 door work; the
planning agent's snapshot predates both.

## The admin app is disk-first already

The BBS reads `.info` files from disk; SQLite is downstream. Two audits, with
corrections, are in `thoughts/shared/research/2026-08-27_admin-ui-audit.md` and
`2026-08-27_admin-page-by-page.md`. **The redesign does not need a storage
rewrite underneath it.**

Fixed this session: the Security page now writes `Access/ACS.<level>.info`;
door edit, rename and create write `Commands/BBSCmd/<command>.info` and can no
longer destroy a working door; screen types no longer erase each other on save;
node system commands reach a route that exists; `web/config-app` typechecks for
the first time.

## Unverified, waiting on the user

- **Audio stutter.** One measured cause fixed - 58.4 ms of audio per minute was
  discarded at capture block boundaries. Diagnostics are live: a stuttering
  call now logs `[Audio][stutter]` saying whether the sender's main thread or
  the network is late. Not confirmed fixed.
- **DOORMAN cannot see the wall door.** Unexplained. WALL IS registered on live
  and `getDoorList()` filters nothing, so two theories are ruled out. Need to
  know which view: installed, or repo browse - a local door would not be in the
  repo at all.
- **`wall.info` NAME reads "WALL"** on live, overwritten before the rename fix
  landed. The original is in `wall.info.backup` beside it.

## Gotchas

- **Read the mutation path; do not count.** Three false-positive rounds.
- **`screen.focused` is a boolean about the Screen itself.** The focused
  element is `screen.getFocused()`. This cost time twice, once in a door
  diagnostic that could only ever print "none".
- **SDK tests import the built `sdk/dist`.** A source edit is invisible until
  `npm run build:cjs`.
- **`packages/terminal` compiles the SDK under a stricter tsconfig and gates the
  Docker build.** Typecheck it before pushing anything under `sdk/`.
- **The live log is not the current log** - every deploy replaces the container.
- **`head` truncates evidence.** "Live has no WALL door" was wrong because a
  grep was cut off at six lines.
- **Doors only got npm dependencies if they used better-sqlite3.** Fixed; 11
  doors were repaired on the next deploy. `web/backend/scripts/door-needs-deps.sh`
  decides, and it is tested.
