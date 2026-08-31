---
date: 2026-08-31
topic: "Sprite engine, Pengo pilot, sound/music, sprite studio 2a+2b, watcher fix - session handoff"
tags: [cell-art, pengo, sprite-editor, sfx, music, watcher, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the sprite evening

One session, evening of 2026-08-31. Everything below happened on branch
`feat/installed-door-link` in the MAIN checkout (a deliberate, ledgered
ruling - node_modules and the dev backend live there). `main` is a moving
target other sessions push to constantly; nothing was ever pushed from
this branch directly - see "How to deploy".

## DEPLOYED AND VERIFIED LIVE (container `d8a0b20dc`)

Pushed as 27 cherry-picked commits; container verified at the REAL data
paths (`/app/data/bbs/...`, NOT `/app`, which is a bare skeleton):

- **cell-art sprite engine** (`sdk/engines/graphics/cell-art/`): Cell
  model (numeric 0-15 colours), transparent compositing, run-grouped
  blessed-tag renderer, JSON sprite format with loud validation,
  tick-pure animation, sheet loader. Package export + BOTH tsconfig wires.
- **Pengo rebuilt on it**: 16x11 maze at 5x2 cells = 80x22 board (a door
  owns the full 80x25 terminal; only the BBS proper is 80x23), arcade
  cabinet palette drawn from the user's two reference shots (title art !=
  in-game art; the game shot is the authority), walk/push/death/stun/
  sparkle/shimmer animations, sound effects (earlier same-day work), and
  title + in-game music from two user-supplied ProTracker MODs
  (`pengotitle.mod`/`pengoingame.mod`, Super Qix's poll-the-door pattern).
- **Sprite studio 2a** (`Doors/sprite-editor`, command SPRITED, sysop
  ACCESS=255): three-pane browser over every door's `sprites/`, live
  fat-pixel playback. Includes every 2a fix: guard ordering, identity
  contract, stay-alive, input-enable, layout, registration.
- **ansi-editor black-screen fix** (No Files dialog; premature hide).
- **Watcher port-guard** (`dev/scripts/lib/managed-process.ts
  ensurePortFree` + watch-doors wiring): the twice-in-one-evening
  dev-server-down zombie-404 class is closed. Test:
  `npx tsx dev/scripts/lib/managed-process.test.ts` (not in CI - dev
  scripts have no suite).

Earlier same-day, also live: the arcade sfx channel for all nine doors,
slapback audio tuning (three passes - wet vs decay/feedback are different
knobs), and the shared-menu bleed/HUD fixes.

## LOCAL ONLY - NOT PUSHED (9 commits, `fd342fd32..8ee845675`)

Plan 2b (studio editing), tasks 1-5 of 6:

| commit | what |
|---|---|
| fd342fd32 | plan 2b doc |
| a6f9a7d3d + 6d620a069 | half-block pixel codec + the LOSSLESS-BLACK fix (see below) |
| 943013ec8 | serializeSprite (validated inverse) + guarded writeSprite/listArt/readArt/writeArt (atomic tmp+rename) |
| c2ac5ff34 + 2ce328adc | EditDoc - every edit op pure/tested + the clone-after-current correction |
| c81cd3e4b + 605a4c91d | EditScreen (frames/cell/pixel painting/save/dirty-escape) + the deaf-browser guard |
| 8ee845675 | ArtSession - a door's .ans files in the full ANSI editor engine |

**Codec detail worth knowing**: `(top=colour, bottom=BLACK)` originally
collided with `(top=colour, bottom=TRANSPARENT)`. Fixed losslessly with
no format change: black-under-colour encodes as `{▄, fg:0, bg:colour}`.
Review-verified full bijection. One deferred minor: decompile accepts
non-canonical hand-authored half-block cells and re-normalizes them.

## RESUME POINT (do this first in the fresh session)

SDD ledger: `.superpowers/sdd/2026-08-31-sprite-studio-2b-editing/progress.md`
- first line names the plan; tasks with `complete` lines are DONE (1-4).
Workspace holds briefs, reports, constraints, review diffs. Do NOT delete
it until the plan finishes.

1. **Review Task 5** (commit `8ee845675`, BASE `605a4c91d`): build the
   package with the skill's `review-package` script, dispatch a task
   reviewer (sonnet). It was a PROSE brief (implementer designed, not
   transcribed) - review strictly. Declared concerns to scrutinize:
   ArtSession co-located in app.ts; no save-success toast; dual guards in
   the 'm' handler (kept separate to preserve an existing regex pin); a
   self-found-and-fixed 'q'-key-shadow bug (verify the fix in the diff).
   Its full design rationale: `task-5-report.md` in the workspace.
2. **Task 6**: builds + full suites (sweep brief in workspace), controller
   restarts backend, then the USER's manual checklist (in the plan doc):
   E-edit a pengo sprite, paint pixels and watch the preview, frame ops,
   save + reopen, dirty-escape discipline, art mode round trip, browser
   sane after return.
3. **Final whole-branch review** (opus) over `fd342fd32^..HEAD`, ONE fix
   wave, ONE scoped re-review, adjudicate residuals. Ledger rulings; the
   final message's "Rulings I made" list must be exhaustive.
4. **Deploy** (user permitting): see below. Then delete the workspace.

## How to deploy from this branch

The branch is far ahead/behind main; NEVER push it. The pattern used four
times today: worktree `/private/tmp/arcade-sfx-deploy` (exists, detached;
4 untracked GWall files there are byte-identical duplicates, removable) →
`git fetch && git checkout --detach origin/main` → cherry-pick the exact
range → `diff -q` key files against the tested tree → push HEAD:main →
wait for the Deploy to Hetzner workflow → verify the CONTAINER
(`docker exec amiexpress-bbs head -c 9 /app/.git-sha`, files under
`/app/data/bbs/...`). Green CI is not verification. SSH:
`root@89.167.21.154`, key `~/.ssh/hetzner_deploy`, port 22 (user granted
SSH this session).

## After 2b, the queue (user-ordered, in memory `project_arcade_sprite_queue`)

1. Shared 8-way scrolling camera in cell-art (+ HUD radar for off-screen
   enemies) - prerequisite for boards bigger than 80x25.
2. Frogger sprite pass (Gameduino tutorial refs saved in the memory:
   frogger1/2/3.html - part 2 has the lane numbers).
3. Pengo one-liner: `handleInput` lacks `case "levelComplete"`, so any
   keypress in the 2s hand-over falls to `default: showMenu()` - "game
   ends after level 1". Fix + test.
4. Plan 3 from the spec: chrome theming + 9-slice borders, DOORMAN pilot
   (spec: `thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md`).

## Learnings that cost time (memories exist for most)

- **Blessed door lifecycle** (memory `blessed-door-must-hold-execute-open`):
  no-onInput doors must await a stay-alive promise AND `enable()` the
  DoorInputManager AND have a `Commands/BBSCmd/<CMD>.info` (plain text,
  CRLF). All three shipped broken once; all three are pinned by tests now.
- **Blessed fires EVERY handler bound to a key.** Two screens sharing one
  blessed screen must guard: the browser goes deaf (`apply()` early
  return) while an editor owns the keys.
- **Source-shape tests must strip comments** before matching, and RED
  checks are by DELETION - commented-out code passes regexes (demonstrated
  twice).
- **The review loop caught six of my own plan defects** (guard ordering,
  identity gap, codec black-collision, test-vs-impl addFrame conflict,
  unguarded navigation, wrong traversal test case). Plans are arguments,
  not authority - the spec is.
- **CRLF is everywhere**: pengo constants.ts, watch-doors.ts,
  puzzle-bobble, .info files. `newline=''` + per-file ending checks.
- **`kill(pid, 0)` says a zombie is alive** - wait on the child's exit
  event in process tests.
- Doors own 80x25; the BBS proper is 80x23. Other arcade doors still
  design to 24 rows - one free row each, take it when each door gets its
  sprite pass.

## Untouched, known-dirty

The working tree carries other sessions' dirt (DoorRepo, door-manager,
web/backend, gmaster) - normal, ignore. `Doors/GWall` became tracked on
main mid-session. The other session's root `handoff.md` was rewritten by
them; this session only appended a pointer section.
