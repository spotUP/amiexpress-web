---
date: 2026-09-02
topic: Phase 2 finished - the SDK's ANSI editor, running in the admin
tags: [screens, admin, ansi-editor, sdk, mci]
status: implemented
---

# The editor is in the browser, and it is the door's editor

Phase 2 of the screen manager is 6 of 6 tasks done, on branch
`feat/browser-ansi-editor` (rebased onto `origin/main` at `2164c4056`), five
commits, NOT pushed - the sysop holds pushes during work in progress because a
push deploys.

Session before this one:
`2026-09-02_screen-manager-conference-paths-and-the-editor.md`, which left the
plan at task 3.

## The point, if you read nothing else

**Nothing about a drawing tool was written twice.** The canvas, the cells, all
ten tools, the undo history and the CP437/SAUCE codec are imported from
`sdk/engines/ui/ansi-editor/{core,tools}` - the same SOURCE files the door
runs, aliased in `vite.config.ts` and `tsconfig.json` rather than taken from
`sdk/dist`, so an edit to a tool changes the door and the admin together.

The browser adds exactly two things a terminal did not need: a canvas renderer
and pointer/keyboard input. Where the browser needed behaviour the SDK did not
have, it went INTO the SDK behind its own test - `typeText` goes through the
SDK's documented `snapshotUndoState` path, and the MCI offsets went into the
BOARD's parser. No copies were made.

## What shipped, task by task

**Task 3 - the canvas renders** (`components/AnsiCanvas.tsx`,
`components/ansi-canvas-paint.ts`). Cell metrics are fixed constants (8x16, VGA
text mode) rather than measured: jsdom measures every box as zero, so
coordinates from `getBoundingClientRect` alone would put every click in cell
0,0 there.

The paint lives in its own module because **jsdom returns no 2D context** - a
paint loop inside the effect would never be executed by any test, and the
mistake it is most likely to make is silent. A `Cell` numbers colours in SGR
order (red is 1); `EGA_PALETTE` in the terminal package numbers them the BIOS
way (red is 4). Indexing one with the other rotates every colour on screen and
still looks like ANSI art. `ansi-canvas-paint.test.ts` runs the paint against a
recording context; putting the wrong index back fails two of its cases.

One palette now: `utils/ansi-palette.ts`, indexed the way a Cell numbers its
colours, with the session-log parser's SGR tables derived from it.

**Task 4 - drawing through the SDK's tools** (`pages/screen-editor-state.ts`).
Two things are React's problem and both are pinned by a test: the SDK draws in
place, so the state gets its own copy and every function returns a fresh clone;
and the undo history is a WeakMap keyed on ONE `EditorState` instance
(`drawing-tools.ts:40`), so a surface that rebuilt the state per change would
have an empty history at every step and undo would silently do nothing.

Colours are read BACK out of the state after a tool runs - that is what makes
the pick tool work with no code of its own. An unfinished stroke is finished
before an undo: the draw tool holds a chunked undo entry open until the pointer
comes up, and undoing across it would pop the step BEFORE the stroke.

**Task 5 - the editor a sysop opens** (`components/ScreenEditor.tsx`, wired
into `pages/ScreenFilesPage.tsx`). Edit appears on an ANSI or text screen. Save
is deliberately NOT a second write path: it hands the bytes to the same
pending-upload state a replace uses, so the fan-out choice, the backup and the
refusals are the ones already there. Typing reaches the canvas only while the
Type tool is chosen, or a sysop searching the list would be painting letters.

**Task 6 - MCI codes** (`pages/mci-tokens.ts`). Each `~CC_`, `~SS_`, `~nSR_`
and `~CL.` is found on the canvas, rung in place, listed with line and column,
and shown in the alert colour when the index says its target is gone. The
patterns are the board's own: `mci-references.ts` gained `locateMciReferences`,
keeping the offset and matched text it was already computing and discarding,
and the admin resolves that module through a `@bbs/screens/*` path alias. A
third copy of those regexes - after the loader's and the index's - would have
been the first to drift.

## Learnings

**A test that cannot execute the code is not a test.** The component test
proves only that the paint did not throw, because jsdom has no canvas backend.
Splitting the paint out and driving it with a recording context is what makes
the colour convention provable. Every claim here was checked by putting the bug
back: the wrong palette index fails two paint cases, and serialising the loaded
canvas instead of the drawn one fails the save case.

**Python file rewrites destroy CRLF.** `open(p).read()` then `write()` turned
`vite.config.ts` from CRLF to LF and produced a 111-line diff for a 7-line
change. Much of this repo is CRLF (`git ls-files --eol`); rewrite bytes, or
check the diff stat before staging.

**A strict admin tsconfig now compiles SDK source.** `noUnusedLocals` and
`noUnusedParameters` apply to every SDK file the admin imports, so sixteen
tool-handler parameters needed underscores and one genuinely dead local in
`editor-state.undo()` went. Expect this again as more of the SDK is pulled in.

**One unexplained flake.** Immediately after the rebase, one config-app test
failed once; five subsequent full runs passed 267/267 and the failing name was
lost with the output. If it reappears, capture the whole log, not a grep.

## Verified

- config-app: 267 tests pass, `tsc --noEmit` clean, `npm run build` produces a
  bundle (the backend MCI module bundles - it is pure, no fs).
- backend: 167 tests across `screens|mci` pass, `npm run typecheck:tests` clean.
- SDK: 682 unit tests pass after the tool-handler tidy.

## Next steps, in order

1. **The manual checklist at the end of the phase 2 plan has never been run** -
   it is the sysop's, and nothing here has been driven by hand in a browser.
2. **Land it.** Cherry-pick these five onto a fresh worktree of `origin/main`;
   the branch is already rebased on `2164c4056` and clean.
3. **The sysop's TODO (2026-09-02) is DONE in code, and needs one click on the
   live board:** see "The security levels" below. Level 30 still has no
   ACS.30.info on the volume; the page now offers to create it.
4. Phase 3 owns RIP - a `.rip` screen offers no editor today and says so.
5. `Conf<N>.Stats` is still keyed by number, deliberately.

## The security levels that read 20 instead of 30

Investigated with `superpowers:systematic-debugging`, and the mapping turned
out to be correct: this board's users are level 30, `Access/` holds 10, 20, 50
and 255, and express.e serves a level-30 user out of ACS.20.info - round the
level down to a multiple of five, then walk down (`findAcsLevel`,
`AmiExpress-Sources/express.e:3025-3035`). The backend already mirrors that
exactly, and the in-use counts come from `user.data`, not the SQL mirror.

Three real defects sat on top of a correct mapping, and the sysop named all
three:

- **The page titled the screen with the FILE.** Clicking "Level 30" opened
  ACS.20.info and the heading said "Level 20". It now says
  "Level 30 - edited through ACS.20.info", warns that saving also changes level
  20 and every other level that file serves, and offers
  "Create ACS.30.info from ACS.20.info" right there. The create endpoint
  already existed; nothing pointed at it from where the problem is met.
- **No level 30 to pick**, because the button row lists files. That is what the
  create action fixes - and it is one click the sysop has to make on the live
  board, since a `.info` is a binary Amiga icon copied from the nearest lower
  level.
- **Two other pages carried invented level tables.** System Configuration said
  "20 - New User" and Operator Chat offered 70 and 150. Both now build their
  lists from the levels API - the files that exist plus the levels users hold -
  through `security-level-options.ts`, labelled with the truth
  ("30 - no ACS file, served by ACS.20.info, 30 users"). A value already
  configured stays selectable so a saved setting cannot vanish.

`acsLevelServing` moved into `acs-level-serving.ts` (no disk in it) so the
admin can apply express.e's rule in a browser without a second copy of the
walk.

**SSH to the live host is refused by the harness classifier**, so nothing here
was checked against the running container. `docker exec amiexpress-bbs cat
/app/.git-sha` and a look at `Access/` on the volume are the sysop's to run.

## Landing note

`handoff.md` at the root was rewritten wholesale by another session after this
branch edited it, so the root file WILL conflict on a cherry-pick. Take main's
version and re-apply these two paragraphs (phase 2 done, and the security-level
work) rather than resolving it hunk by hunk.

## Other sessions

Session 82 still owns `web/backend/src/handlers/screen.handler.ts` (PETSCII
task 9) - untouched here. This work stayed inside `web/config-app`, the SDK's
ansi-editor tools, and `web/backend/src/screens/mci-references.ts`.
