---
date: 2026-09-02
topic: "A one-row box cannot hold text, and four doors had been proving it"
tags: [doors, sdk, blessed, panel, deploy, handoff]
status: final
session: amiexpress-web-c7
---

# The one-row box that could not hold text

## The through line

`createBox` and `blessed.box` both build a `Panel`, and Panel draws a line
border whenever the caller passes no `border` key
(`sdk/engines/ui/blessed/widgets/panel.ts:53`). A box one row high has no
interior once a frame takes its top and bottom rows, so **its content never
renders** - the door paints a rule where the text was supposed to be.

Four unrelated reports today were this one rule:

| what was reported | what it was |
|---|---|
| GRANDMASTER's "outer border broken" | full-screen background boxes framing the whole terminal |
| Scrollwars' footer showed a line, no keys | a one-row `createBox` status bar |
| the widget showcase looked bare | its header and status bars had never painted a word |
| (found, not reported) WHIP's new-project form | four field labels, all invisible |
| (found, not reported) DOPEWARS' header | cash, health, date and location, all invisible |

Twenty-eight instances existed across nine doors. Thirteen are fixed; the
remaining fifteen are pinned by a test and listed below.

## Landed

Everything is on `origin/main`, cherry-picked from worktrees cut off fresh
`origin/main`, each worktree removed in the task that made it.

- `0595d0507` GRANDMASTER: backgrounds unframed; the leaderboard measures from
  the screen and re-renders on resize (it had no resize handler at all).
- `c41c9aacf` the deploy's `git fetch` retries.
- `52e122395` WHIP: two hand-rolled `blessed.question` dialogs -> one shared
  `ConfirmModal`.
- `fc074c883` Scrollwars: `StatusBar`, and a footer that measures itself.
- `b612f6d70` the widget showcase: bars unframed, chrome themed, `app.ts`
  exempted in the hook.
- `24de2b37c` WHIP's field labels, DOPEWARS' two bars, the showcase's seven
  demo captions, and the cross-door test.

## Learnings

- **`gm_matches` was never a data loss.** The table has no writer anywhere in
  the repo and no reader either. Every table with a repository or a seed has
  rows; every table without one is empty. The Sep 1 22:10 mtime is a WAL
  checkpoint, not a recreation - in WAL mode the main file is only written at
  a checkpoint. Full evidence:
  `thoughts/shared/research/2026-09-02_grandmaster-match-history-was-never-written.md`.
- **A deploy that dies in under 20 seconds is the host's `git fetch`.**
  github.com answers an anonymous HTTPS ref listing badly under a burst of
  pushes, git falls back to a prompt, and an ssh-action shell has no terminal.
  Four deploys died that way before `c41c9aacf` added retries. `gh run rerun`
  and `gh workflow run` are both refused here - no admin rights - so the only
  way to retry a deploy is to push again.
- **`dev/hooks/pre-commit` had drifted behind `.git/hooks/pre-commit`.** An
  exemption added on 09-01 never reached the tracked copy, so a fresh clone
  had a hook that would refuse a file the repo had already decided about. If
  the hook refuses something unexpected, diff the two.
- **`git commit` with no pathspec takes the whole shared index.** It swept
  three of another session's staged files into a dopewars commit; `git reset
  --soft HEAD~1` put everything back untouched and `git commit -F <file> --
  <path>` did it properly. Commit by pathspec in this tree, always, and note
  that `-F -` reads the MESSAGE from stdin - a heredoc meant for the next
  command leaves git with an empty message and no commit.
- **A test that says "fix the test" is a test to fix.**
  `menuArrowHandlersDoNotResetTheSelection` was red on main: its parser looked
  for `menuSelection = Math.max(` literally and went stale when the arcade
  doors moved that arithmetic into a `moveSelection()` helper. Repaired, then
  re-verified by putting the original bug back into joust.

## Open: the fifteen that remain

`oneRowBoxesDoNotCarryAFrame` in `dev/tests/door-regressions.test.ts` pins
them per file and fails if any count changes in either direction. Fix yours
and delete its entry from `THIN_BOX_BACKLOG`.

- bug-tracker: `app.ts` 2, `dialogs.ts` 1
- rip-browser: `app.ts` 1
- grandmaster: `app.ts` 2, `ui/menu.ts` 1
- livechat: 8, across `server.ts`, `ui/channel-header.ts`, `ui/user-status.ts`,
  `ui/video-tile.ts`, `overlays/settings-overlay.ts`,
  `overlays/settings-checkboxes-events.ts`, `features/drawing-canvas.ts`,
  `features/video-grid.ts`

## Also open

1. **CARD LOBBY has still never been played** - the gamepad paths, the end of
   an UNO game and deleting a table. Only tests have driven them.
2. **`Doors/GWall` needs its 68K door typed once** on the board.
3. **Match history** is a feature to decide on, not an incident.
4. **The widget survey is closed out** apart from door-manager's one document
   view and three bars belonging to session 82 -
   `thoughts/shared/research/2026-09-02_doors-that-hand-roll-sdk-widgets.md`.
5. **neo-blessed-showcase's `app.ts` is exempt, not fixed.** It is 3,720 lines
   of forty demos in one closure; the extraction is still worth doing.
