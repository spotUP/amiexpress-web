---
date: 2026-09-02
topic: "CARD LOBBY driven until it worked, three doors that could never start, the deploy gates, and a survey of doors that hand-roll SDK widgets"
tags: [card-lobby, sdk, blessed, deploy, docker, backup, gwall, grandmaster, theme, handoff]
status: final
session: amiexpress-web-7a
---

# Handoff: the doors that could not run, and the widgets they built themselves

A long session driven by the sysop testing live and reporting as he went.
Everything below is on `origin/main` unless it says otherwise. **One piece of
work is finished but NOT committed - see "Held, and why" - and it is the
first thing a fresh session should deal with.**

## The through line

**Every defect reported this session lived in something a door built for
itself while the SDK already shipped the widget.** Not one was in an SDK
widget being used as intended. That is the finding worth carrying:

| the sysop saw | what it actually was |
|---|---|
| the table screen was one small box in an empty window | CARD LOBBY's own layout wrote geometry to `.options`, which a widget seeds from at construction and never reads again |
| dialogs that could not be closed | its own text window; `Element` defaults to `focusable: false` and `focus()` returned silently, so Escape reached nothing |
| dialogs on a black screen | its own shade - a Box filled with black - instead of `Overlay` |
| a dialog with two empty buttons | the SDK question widget's Yes/No were one row high WITH a border: the frame takes both rows and the label has nowhere to go |
| stray white lines under the list | bars built from plain boxes, taking `Panel`'s default border |
| "outer border broken" in GRANDMASTER | the same default border on a full-screen background |
| "no games listed, how do I create?" | the placeholder sat in column three of a list 25 columns wide, and the hint naming the keys was 58 characters in a 52-wide panel |

## Landed

Newest last.

```
21c03dc76  one custom key handler in BBSTerminal; Alt+Enter fullscreens the browser
9101fdfe8  image door dist/ is mirrored - the Doors volume finally deletes
e8917ee69  CARD LOBBY type checks (@ts-nocheck removed), 1923 lines, size switch
af7b26f82  CARD LOBBY: joining, resizing and Tab reach the thing they name
ddb7d22e7  ENTER joins, and the stray white borders come off
9521f3f08  livechat, voice-chat, whip and two demos take the board's theme
ddbd03d8f  whip ships the dist the board runs
b248c5a44  every TypeScript door ships its entry point (test + image gate)
526ce5f9e  the entry-point gate runs from a script, not an escaped RUN
ae5375265  CARD LOBBY uses the SDK's Overlay, DocModal and StatusBar
a5c30a0f6  GWALL: the 68K door runs, the TypeScript port leaves the board
dcf2275a2  door data is backed up; backend stage gets the SDK  (SEE WARNING)
f5d5fcd1f  revert: restore the SDK copies dcf2275a2 reverted
4a0d0aa29  a full-screen background is not a frame (bug-tracker, widget demo)
912347f17  the survey of doors that hand-roll SDK widgets
```

## Held, and why - START HERE

**GRANDMASTER's two layout fixes are written and uncommittable.** The patch
is saved so a shared tree cannot lose it:

    thoughts/shared/patches/2026-09-02_grandmaster-layout.patch

It covers five files:

- `ui/menu.ts` - the full-screen `background` box takes createBox's default
  line border, so it outlines the whole terminal. That IS the sysop's
  "outer border broken" screenshot: a frame whose bottom edge floats below
  the panels once Alt+Enter makes the screen taller.
- `ui/leaderboard-screen.ts` - every box was hardcoded to an 80x24
  composition (width 70 and 76, left 2, top 6 and 20) and **nothing re-ran on
  resize**, so after Alt+Enter the whole leaderboard sat in the corner of a
  wide screen. The patch measures from `screen.width/height`, re-renders on
  `resize` (removing the listener on close), and drops the default borders
  from the title, the tabs and the hint line.
- `ui/game-screen.ts`, `ui/attract-screen.ts`, `app.ts` - the same
  default-border fix on their full-screen backgrounds.

**Why it could not land:** GRANDMASTER does not typecheck at HEAD -

    app.ts(1093,23): Property 'endMatch' does not exist on GrandmasterNetworkManager
    ui/versus-screen.ts(10,10): './board-effects' has no exported member 'lockFlashChar'

Neither symbol exists at HEAD, and another session had `Doors/grandmaster/app.ts`
open. The pre-commit hook rebuilds a door's dist and refuses on a build
failure, so nothing touching that door can be committed until it compiles.
Session `amiexpress-web-b0` has been told, with the errors and the list of
held fixes.

**To finish it:** wait for grandmaster to typecheck, `git apply` the patch
(or re-do the four one-line border changes by hand and take the leaderboard
rewrite from the patch), rebuild its dist, commit, land, deploy.

## Doors that could not run at all

Three, each by a different route, and nothing anywhere noticed:

- **whip** - its own `.gitignore` hid `dist/`, overriding the root's
  `!Doors/*/dist/` re-include. The board had sources, `node_modules` and a
  `package.json` whose `main` pointed at a directory that was not there.
- **Gwall** - its tsconfig had no `outDir`, so `tsc` emitted `index.js`
  beside `index.ts` and `dist/` was never written.
- **prompt-complete** - built locally, never committed.

They survived because **only ONE door is compiled during the image build**
(door-manager), under a comment claiming the stage "ensures dist/ is always
fresh from source regardless of what was committed". Two gates now:

- `docker/verify-door-entries.sh`, run in the image build - a door whose
  `main` names a file the image lacks fails the BUILD, with the door named.
  Tested three ways: clean tree passes, a hidden entry fails naming the
  door, an empty directory fails rather than passing vacuously.
- `web/backend/tests/doors/door-dist-is-shipped.test.ts` - the same rule in
  CI, per door, plus "no door may have an entry that exists only in a
  working tree".

## GWALL, and why it never worked

`Commands/BBSCmd/GWALL.info` registers `TYPE=XIM` at `DOORS:GWall/GWall` -
the 68K door - and no such binary existed anywhere. What sat in
`Doors/GWall` was a TypeScript port that nothing registered, and
`Doors/Gwall` held a second copy of it under the other casing: one directory
on a case-insensitive Mac, two in the image, and the pair made `git rebase`
refuse to start in every worktree.

The sysop's call: the port "didn't turn out great", so the original runs.

- `Doors/GWall/GWall` - the AmigaOS binary from
  `Documentation/7-Reference Sources/SanctuaryBBS`, the 49088-byte build,
  chosen over three older ones because it is the only one carrying the whole
  wall API (`PUT` and `DELETE`, not just `GET`).
- `examples/ts-ports/global-wall/` - the port's sources, with a README
  saying why they are not under `Doors/`.
- The entrypoint clears the port's remains and the duplicate directory from
  the volume.

The admin's Global Wall page was removed by another session on the sysop's
instruction. Worth knowing: that page proxied `/GlobalWall/api/WallItems` -
the same endpoints the 68K binary calls - and edited the door's cfg, so it
was the sysop's moderation UI for the door that now runs. Its config path
was `doors/gwall/GWall.cfg`, wrong in both halves, so it resolved on a Mac
and never in the container.

## Backups

The deploy captured `*.info` and nothing else, which is why GRANDMASTER's
match history was unrecoverable. It now also writes
`bbs-doordata-<stamp>.tar.gz`, twenty kept. Two details decide whether it is
worth having:

- **WAL files are included.** `grandmaster.db` is a 4 KB header with 540 KB
  of uncheckpointed WAL beside it; the `.db` alone preserves an empty
  database.
- **`dist/` is not pruned.** frogger and super-qix keep their high scores
  inside `dist/`.

Verified on the host: 13 files, 28 KB, containing grandmaster's db, its
`-wal` and `high-scores.json`, dopewars', arkanoid's, and the two in
`dist/`.

## Learnings that cost something

- **A widget renders from its live properties.** `options` seeds them at
  construction and is never read again, so laying panels out through
  `options.top = ...` moves nothing.
- **`Element` defaults to `focusable: false`, and `focus()` used to return
  silently for such a widget.** Nothing threw; a dialog simply could not be
  closed. `focus()` now honours an explicit call and `focusable` keeps its
  real meaning, which is whether Tab stops there.
- **A bordered box one row high has no interior.** The frame takes the top
  and the bottom; the label is never drawn.
- **`git commit-tree` from an existing blob takes that blob WHOLE.** Using
  plumbing to dodge the GWall casing reverted another session's Dockerfile
  fixes; restoring took a second commit. Plumbing is for when a working tree
  cannot be checked out - it is not a substitute for merging.
- **`git reset --soft HEAD~1` in a shared checkout can remove somebody
  else's commit.** It did; `git reset <their-sha>` put it back with nothing
  lost, but the tip is not yours in this repo.
- **The shared index swallows staged files.** Two commits nearly carried
  another session's work; `git diff --cached --stat` before every commit is
  the check, and it caught both.
- **Build a Dockerfile change before pushing it.** An inlined shell gate
  collapsed onto one line, busybox rejected the `case`, and the deploy
  failed. Docker Desktop works here once
  `/Applications/Docker.app/Contents/Resources/bin` is on `PATH` -
  `docker build --target <stage>` is the whole test.
- **ENOSPC surfaces as a build error, never as "disk full".** Nine landing
  worktrees held 5.6 GB on a disk at 296 MB free. Remove a worktree in the
  task that created it.

## Artifacts

- `thoughts/shared/research/2026-09-02_doors-that-hand-roll-sdk-widgets.md`
  - the survey, the widget list, what to convert next, and which findings
  are false positives.
- `thoughts/shared/patches/2026-09-02_grandmaster-layout.patch` - the held
  fixes.
- `docker/verify-door-entries.sh` - runnable outside Docker.

## Next steps

1. **Land the GRANDMASTER patch** once that door typechecks. See "Held".
2. **GRANDMASTER's match history** - `gm_matches` is 0 while users,
   leaderboards and stats survived. Ruled out with evidence:
   FORCE_REINIT_DOORS (0), the volume sync (excludes `*.db*`), the dist
   prune (never logged a line for grandmaster), the door's own SQL (all
   `CREATE TABLE IF NOT EXISTS`; the one `DELETE FROM gm_leaderboards` is
   `deleteAll()`, called from `leaderboard-manager.ts:334` - read that
   path), a second database, and git (no door DB is tracked, so a local
   commit could not have shipped one). Not established: what recreated
   `data/grandmaster.db` at Sep 1 22:10. That container's logs are gone.
3. **neo-blessed-showcase** - the last unthemed non-game door, and
   uneditable: `app.ts` is 3705 lines against the 2000-line ceiling, so the
   hook refuses any change. It needs an extraction first, like CARD LOBBY
   got.
4. **The conversions the survey lists**, in its order - bug-tracker's status
   bars, doors-menu, theme-picker, scrollwars, whip's confirms.
5. **CARD LOBBY has never been played.** The gamepad paths, the end of an
   UNO game and deleting a table threw a TypeError before this session;
   only tests have driven them.
6. **`Doors/GWall` needs its 68K door driven once.** The binary is in place
   and registered, and nobody has typed GWALL on the board since.

## Other notes

- CARD LOBBY has a test runner now: `npm test` in `Doors/card-lobby`, 22
  tests, driving real widgets against a stubbed session. WHIP has one too.
- The door suites are `npx jest --config dev-scripts/jest.config.ts
  --rootDir . tests/doors` from `web/backend` - 1231 at last run.
- `handoff.md` at the root was left alone deliberately at the end: several
  sessions write it, and merging a whole blob into it is what reverted
  another session's work earlier today.
