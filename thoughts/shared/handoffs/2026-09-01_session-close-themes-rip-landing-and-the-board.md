---
date: 2026-09-01
topic: Session close - everything a fresh session needs; themes and RIP are live, one RIP fix is queued, three sessions share the tree
tags: [handoff, themes, rip, terminal, landing, board, backend]
status: final
---

# Session close, 2026-09-01 (session amiexpress-web-82)

Read this, then `thoughts/BOARD.md`, then the memory index. In that order.

## State in one paragraph

Everything from today is on `origin/main` and **verified running in the
live container** (`d8edfc3f7`; image age and code checked over SSH, not
the workflow). One fix is NOT on main yet: `9cdf8d6ba` - RIP pictures were
black on live because the RIPtermJS wrapper called `playStream()` instead
of `play()`; committed on `feat/installed-door-link`, verified locally,
waiting for a landing slot behind c2's 58 commits. Three Claude sessions
work in this tree; coordination is on `thoughts/BOARD.md`.

## What landed today (31 commits, `767f16340..d8edfc3f7`)

- **Themes.** 7 per-user door themes (`sdk/engines/ui/theme/`), `THEME`
  picker door, preference in the SQLite mirror (never `user.data`).
  `s.panel` may be borderless under the phosphor themes; `s.frame` (modals,
  dialogs) never is. 8 doors migrated off literal colours; 16 exempt (13
  arcade games + 3 widget showcases - palettes are content), recorded with
  reasons in `sdk/tests/unit/door-colour-migration.test.ts`.
- **Chrome.** `attachMasthead()` (animated slash rail) and
  `footerHints()`/`footerStyle()` shared from the SDK; DASHBOARD, BUGS,
  RIP, DOORMAN, THEME use them. Editors (ANSI, sprite) deliberately have
  no masthead - they own the full screen.
- **RIP graphics.** Renderer replaced by vendored RIPtermJS
  (`packages/terminal/src/rip/vendor`, MPL 2.0, credit printed to console).
  Fonts/icons in `web/frontend/public/rip`. Door reads files as latin1,
  waits a beat before arming its dismiss key, terminal respects chunk
  boundaries. See memory `project_riptermjs`.
- **Backend parity.** A command: six broken lazy requires, flag prompt
  line-buffered (`collectLine`), WAITING split from DONE, Enter exits,
  (F)rom flags onward and reads the right conference (`?? 1` not `|| 1`).
  Download and flag prompts repaint the menu on exit. Relogon reaches the
  login prompt. 42 unresolvable lazy requires fixed + sweep test
  (`web/backend/tests/lazy-require-paths.test.ts`).
- **blessed.** Selected row readable; mouse takes the cursor, no hover
  colour; `frame` role; dialogs accept `themeStyles`.
- **Hygiene.** LF-normalised `packages/terminal/{package,tsconfig}.json`
  (ends two CRLF phantoms). Mobile keyboard tests updated for the phone
  layout. Freshness skill gained section E (frontend bundle).

## Open, in order

1. ~~**Land `9cdf8d6ba`** (RIP play() fix).~~ DONE 19:2x: on main as
   `e3c6656b3` + regression test `3f8c66cb0`
   (`web/frontend/src/components/__tests__/RIPRenderer.test.tsx`, fails on
   the old renderer); container verified. c2's 60 followed as `bd3ff7317`.
   Still worth a look by eye: `RIP` -> `amigasp.RIP` must paint.
2. **Manual theme pass on live** (P4.3): `THEME` -> Quiet Phosphor ->
   `DASHBOARD`, `DOORS`, `BUGS` (open a confirm dialog - must read as a
   separate surface), `DOORMAN`; then everything under Classic must look
   unchanged. One knowing change under classic: sprite editor's
   active-tool highlight is `yellow` (accent), was `lightyellow`.
3. **Optional:** faint panel rules under the phosphor themes if they still
   read too plain - `styles.ts`, `t.dim` instead of `t.ground` for
   `panel`.
4. **DoorRepo "can't back out of subpages"** - blocked on the sysop saying
   which key. ESC is deliberately unbound (`doorrepo.c:2502`, cost DOORMAN
   six rounds); `Q` is the way out. If ESC was pressed, the fix is a footer
   hint, not a keybinding.
5. **RIP upstream gaps** (RIPtermJS README): filled ovals/pies and button
   label position slightly off. `1P/1C/1I` icon commands now draw.
6. **Remaining CRLF phantoms**: the web/ five. `git add` + commit each
   normalises it for good (memory `project_crlf_phantom_dirt`).
7. From a9's handoff (not mine): the invented fallback in
   `screen.handler.ts` is safe to remove; logon screen variants were
   changed on the live VOLUME by hand and are not in the repo.
8. `Desktop/AmiExpress-68k-prompt-autocomplete-design.md` is for Phantasm
   (68K side); no code on our side.

## The other sessions (as of 20:30)

- `amiexpress-web-a9`: wrapped up 19:4x, pushed `33790983f`. Integrator
  role (fresh worktree -> cherry-pick -> push). Tests on live only, never
  restarts the backend.
- `amiexpress-web-c2`: arcade/sprite-editor/cell-art/ansi-editor. Has the
  floor for 58 commits; holds pushes until the sysop says "deploy". When
  its sprite-editor rewrite lands, `edit-screen.ts`/`toolbar.ts` change
  shape - the colour-migration guard test will hold it to tokens.
- Worktrees: `/private/tmp/c2-land`, a9's `nb-wt` - theirs, leave them.

## Learnings worth carrying (also in memory)

- Restart the backend after EVERY sdk edit; rebuild BOTH `packages/
  terminal` and `web/frontend` after any terminal edit, then hard-reload.
  Two "doesn't work" reports today were stale processes; two were a stale
  bundle.
- Read the log before naming a cause. Three RIP guesses were wrong; the
  log was right each time.
- Node ESM does not guess extensions; a CJS door hides it, an esbuild/ESM
  door (BUGS) dies.
- React `setState` is async; a synchronous draw loop reading a ref synced
  from state paints everything in stale colours.
- express.e's `lineInput` blocks; every ported prompt needs line-buffering
  on the web side.
- `git add -u` in a shared tree is a defect. By name only.
- A merge of the shared branch fights cherry-picked duplicates; land by
  cherry-pick in a worktree with per-entry node_modules shims (memory
  `project_landing_by_cherry_pick`).
- The deploy script is now hardened (SHA, container-age, health, rollback
  checks) - the `ERROR:` strings in its log are its message text, not
  fired errors. Still verify the container.
- `git ls-tree -r origin/main | grep node_modules` must be empty before
  every push; a tracked symlink broke three builds today (a9's finding).

## Artifacts

- Plans: `thoughts/shared/plans/2026-09-01-theme-borders-before-door-migration.md`
- Research: `thoughts/shared/research/2026-09-01_riptermjs-evaluation.md`
- Earlier handoff today: `2026-09-01_themes-doors-rip-and-the-a-command.md`
- Board: `thoughts/BOARD.md` (gitignored; lives only in this working tree)
- Backup of the deleted `feat/door-themes` (superseded, 196-commit patch):
  scratchpad `backup-feat-door-themes-2026-09-01.patch` - disposable.
