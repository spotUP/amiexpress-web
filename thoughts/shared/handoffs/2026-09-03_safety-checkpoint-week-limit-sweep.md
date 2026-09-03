---
date: 2026-09-03
topic: Safety-checkpoint sweep across every worktree after 4+ agents hit the weekly rate limit mid-flight
tags: [git, worktrees, session-handoff, safety-checkpoint, board]
status: implemented
---

# Every worktree got a rollback point, on purpose, via `git add -A`

## Task

The sysop had 4+ Claude sessions (plus their subagents) working in parallel
across the shared tree and 13 separate worktrees when several hit the weekly
usage cap mid-task. Asked to take over, with one condition first: **create a
point we can revert to if anything goes wrong** - commit and push every local
change, in every worktree, on every branch, before touching anything else.

This is a one-time infrastructure task, not a feature. There is no plan doc;
the sequence below IS the record.

## Critical References

| what | where |
|---|---|
| commit message convention used everywhere | `"Free Models Start Working Here"` (+ a `(N/M - reason)` suffix when a worktree needed more than one pass) |
| the board this doc's existence is announced on | `thoughts/BOARD.md` (gitignored, working-tree only - see Log entry timestamped today) |
| root current-state pointer | `handoff.md` (trimmed the stale 09-02 recap to fit a Gotchas pointer at 9982 B) |
| the one branch NOT pushed to its own name | `checkpoint/base-wt-main` (see Learnings - `main` is shared, never force-pushed) |
| the anomaly worth a second look | `land/backend-sdk-copy` - 966-file commit, ALL deletions (see Learnings) |

## Recent Changes

Every worktree, its branch, and what happened. "Committed" means a
`git add -A && git commit -m "Free Models Start Working Here"` ran there;
"pushed" means `git push -u origin <branch>` succeeded (new remote branch in
every case except `feat/installed-door-link` and the three that already had
a remote).

| worktree | branch | result |
|---|---|---|
| `/Users/spot/Code/amiexpress-web` (main tree) | `feat/installed-door-link` | 3 commits (see Learnings - one caught a live session's WIP), pushed |
| `/private/tmp/base-wt` | `main` | 1 commit, pushed to `checkpoint/base-wt-main` (NOT to `origin/main`) |
| `/private/tmp/c2-land` | `land/wheel` | 1 commit, pushed |
| `/private/tmp/c2-land-3` | `land/c2-2026-09-01b` | 1 commit, pushed |
| `/private/tmp/editor-wt` | `feat/browser-ansi-editor` | 1 commit, pushed |
| `scratchpad/land10` (33c6a28a) | `land/backend-sdk-copy` | 1 commit (966 files, all deletions), pushed |
| `scratchpad/gm-brief` (3a17737a) | `feat/gm-mission-briefing` | 1 commit, pushed |
| `scratchpad/land-2` (3a17737a) | `land-themec2` | 1 commit, pushed |
| `scratchpad/land-ta` (4a5fad72) | `land/tetris-attack` | 1 commit, pushed |
| `scratchpad/ta-wt` (4a5fad72) | `feat/tetris-attack` | 1 commit, pushed |
| `scratchpad/land4` (58dbf864) | `land/82-rip-ux` | nothing committed - only pending file is `thoughts/BOARD.md`, intentionally excluded (see Learnings) |
| `scratchpad/storage` (94c66d01) | `feat/pooled-object-storage` | 1 commit (real source changes - pooled storage feature), pushed |
| `scratchpad/hw` (ada5866e) | `docs/handover-verified` | already clean, nothing to do |
| `scratchpad/land-d` (c686e33e) | `land/gwall-casing` | 1 commit, pushed |
| `scratchpad/gm` (c7073df8) | `fix/grandmaster` | already clean, nothing to do |

Plus **37 branches that had no worktree at all** (pure local refs, never
pushed before) - pushed as-is, zero risk since nothing was checked out on
disk for any of them: `check`, `hand`, `land-c2`, `land-c4`, `land-c4b`,
`land-c5`, `land-c5b`, `land-dedup`, `land-proto`, `land-theme`,
`land-themec`, `menus`, `proto`, `telnet-confirmed`, `telnet-input`,
`theme-primary`, and 21 `land/*` branches (`admin-share-scroll`,
`c2-2026-09-01`, `deploy-fix`, `editor-topaz`, `generated-screens`,
`health-and-pools`, `health-fixes`, `menu-keys`, `petscii-2026-09-02`,
`screen-descriptions`, `screen-gallery`, `screen-health`,
`screen-index-perf`, `screen-meta-sources`, `screen-metadata`,
`screen-repair`, `session-handoff`, `session-handoff2`, `share-dry-run`,
`theme-chat-host`, `topaz`).

End state: **52 local branches, all present on `origin`.** Every worktree's
`git status` is clean except the one file deliberately left alone.

## Learnings

**Pushing a branch tip is not the same operation as committing a working
tree, and the difference matters when you don't know who else is on disk.**
`git push` only reads `.git/refs` and the object database - it never touches
a worktree's files or index. That meant the 13 branches tied to other
worktrees could be pushed (their *already-committed* history) immediately,
with zero risk of colliding with a live editor, well before it was safe to
run `git add`/`commit` in those same directories. Sequence the two
operations separately when you're not sure who's live.

**"He's week-limited" does not mean "he's not writing files right now."**
Rate-limited sessions are genuinely frozen most of the time (0% CPU,
sleeping, confirmed by `lsof -a -p <pid> -d cwd` and a `find -mmin -30`
sweep turning up nothing) - right up until the limit resets or a human
nudges them back to life, and then they resume writing without warning.
Mid-sweep, the main tree went dirty again with fresh edits to
`PetsciiCanvas.tsx` / `BBSTerminal.tsx` / `sdk/src/core/{Input,Output}.ts` /
`door.handler.ts`, timestamped 10-25 minutes old - the "hide the cursor in
PETSCII mode" session (board identity `petscii`) had not stopped, it had
just been idle at the exact moment of the first scan. **Stopped the sweep on
that worktree immediately, asked, got "he pushed now" a few minutes later.**
Its own commit (`341e8df22`, `feat(petscii): hide cursor in PETSCII mode
when not waiting for input`) landed and was already pushed by the time this
session touched it again - only trailing runtime-state drift (bulletins,
CallersLog, USER.DATA) needed picking up afterward. **A live process with
near-zero CPU is not proof of "safe to sweep" - only an explicit "it's
finished" is.**

**One shared working tree really does mean one shared git index.**
`thoughts/BOARD.md` Rule 6 exists for exactly this reason: *"Commit by file
name. `git add -u` and `git add -A` sweep the other sessions' work into your
commit (it happened today)."* This task did precisely that, on purpose, at
the sysop's explicit and repeated instruction, twice: the `PetsciiCanvas.tsx`
edit caught in commit `cf711d268` (before the session finished its own
thought), and the trailing runtime drift caught in `8fd3c580e` (after it had
already committed and pushed on its own). Neither caused data loss - a
sleeping process has no partial writes in flight, so whatever `git add -A`
saw was that session's last *complete* write - but it is a deliberate,
disclosed, one-time exception. **Rule 6 still holds day-to-day.** Nobody
should read this handoff as licence to `git add -A` in the shared tree
during normal work.

**`thoughts/BOARD.md` is the real "all agents know" channel, and it's
gitignored on purpose.** It's a 1700+ line append-only log, one entry per
session action, read by every session sharing this tree - and it does NOT
travel via git (it would conflict on every cherry-pick). This handoff is the
git-committed archival record; the Log entry on the board is the thing an
active session actually reads. Both were written; treat the board entry as
the primary notice and this file as the detail behind it.

**A worktree checked out on `main` cannot be pushed to `origin/main`
casually.** `base-wt` was 477 commits behind with zero unique commits before
this sweep; after committing its 2 stray files it had exactly one commit
`origin/main` doesn't have, sitting on a base 477 commits stale. Pushing
that to `main` directly would either be rejected (correct, safe) or invite a
force-push (never - that's the one operation this whole task exists to avoid
needing). Routed it to a new branch, `checkpoint/base-wt-main`, instead.
**That branch is unreviewed and needs the sysop's own look** - it's 2 small
files (`Node17.info`, a debug log), almost certainly disposable, but nobody
should merge it without checking first.

**966 deletions in one worktree is not automatically a bug, but it deserves
a second pair of eyes.** `land/backend-sdk-copy`'s entire diff was
deletions - none of them this project's own maintained source. 745 of 966
were a vendored third-party reference copy
(`Documentation/5-Reference/archive/moebius-master`, an ANSI editor kept for
reading, not running), the rest were stale `Conf10`/`Conf11` BBS config
directories and loose docs. Consistent with the cleanup pattern already
visible in this repo's own `.gitignore` history (see its comments on the
68K trace capture and the GMaster audio assets). Committed as-is, since the
job here was to checkpoint reality, not edit it - but flagging it explicitly
rather than letting 966 silently-deleted files pass without comment.

**`thoughts/BOARD.md` itself must never be committed**, even by an
`git add -A` sweep that's supposed to catch everything. It's explicitly
`.gitignore`d with the comment *"shared via the working tree, never via
git"* - it's the one file this task deliberately left dirty in
`scratchpad/land4`, and the reason that worktree shows "nothing to do"
above despite having a pending file.

## Verification

- Every worktree's `git status --porcelain` is empty except the one
  intentional exception (`thoughts/BOARD.md` in `land4`).
- `git fetch origin` + a walk of every `refs/heads/*` confirmed all 52 local
  branches have a matching `origin/<branch>` at the same SHA (checked
  twice: once mid-sweep at 37/52, once at the end at 52/52).
- `handoff.md` re-measured at 9982 bytes after the edit (cap is 10 KB).
- No `--force` anywhere in this task. No branch's shared history was
  rewritten. `main` was never pushed to directly.

## Artifacts

This document IS the artifact. Companion: the Log entry on `thoughts/BOARD.md`
timestamped 2026-09-03 (search for "safety-checkpoint" or "Free Models").

## Next Steps

1. **Sysop: look at `checkpoint/base-wt-main`** and decide whether to fold
   it into `main` (unlikely to matter - 2 small files) or delete the branch.
2. **Whoever owns `land/backend-sdk-copy`**: confirm the 966-deletion commit
   is the cleanup you expected before that branch lands anywhere.
3. **Nobody should treat `git add -A` in the shared tree as normal** because
   this task used it. It was a one-time, disclosed, sysop-directed exception
   to `thoughts/BOARD.md` Rule 6. Commit by file name otherwise.
4. The 37 previously-local-only branches are now on `origin` but almost
   certainly still need proper landing (cherry-pick onto fresh `origin/main`,
   per the board's standing landing-plan rule) - pushing them was about
   durability, not about declaring them ready to merge.
