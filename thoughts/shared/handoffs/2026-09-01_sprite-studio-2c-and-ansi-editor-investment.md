---
date: 2026-09-01
topic: "Sprite studio 2b close-out, 2c menus/windows/toolbars, SDK input fixes, pengo, and the ANSIEditor investment"
tags: [sprite-editor, sprited, ansi-editor, sdk, blessed, pengo, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the day SPRITED became menu-driven

One long session, 2026-09-01, branch `feat/installed-door-link` in the MAIN
checkout. **Nothing has been pushed.** The branch is ~250 commits ahead of
its remote and far from `main`; deploys go through the cherry-pick worktree
recipe (see the 2026-08-31 handoff), never by pushing this branch.

## Shipped locally, reviewed, running in the dev backend

### Plan 2b (sprite studio editing) — CLOSED
Resumed mid-plan at Task 5's review. Task 5 (art mode) reviewed, one
Important fixed (ArtSession extracted to `art-screen.ts`). Sweep green.
Final whole-branch review returned five Importants, all in EditScreen's
stateful key routing, all fixed in one wave (`fe911ce0e`):
- typing an animation name executed bound ops (naming "spin" saved to disk
  and inserted a frame; any "x" deleted the current frame)
- `setPixel` could throw out of a key handler after frame/mode drift
- the glyph-exclusion list missed `X`, so shift+X deleted the animation
- art mode's `[new file]` with an existing name opened blank and destroyed
  the real `.ans` on first save
- a test asserted `listArt('pengo') === []`, which the plan's own manual
  checklist step would break

### Plan 2c (menus, dockable windows, toolbars) — COMPLETE through final review
Written this session from the user's directives: "the whole sprited app
need to be menu driven and smooth to work with like the livechat door",
"i need to be able to arrange windows", "we need toolbars etc to pick
colors and tools", "nothing should be hidden behind only hotkeys".

Plan: `thoughts/shared/plans/2026-09-01-sprite-studio-2c-menus-windows-tools.md`

| task | commits | what |
|---|---|---|
| 1 | 6f107ac57, 641402896 | one binding table drives hotkeys, the derived glyph-exclusion set, and menu items |
| 2 | 75cfcca06, 16074311b | menu bars both screens, integer LAYOUT replacing all percent geometry, browser mouse selection, F1 help |
| 3 | b728db5a4, 4e14e2b4e | eight DockablePanels (drag/resize/minimize), View > Reset Layout, `panelContentRect` |
| 4 | b1c714a1d, b2a8eff11, 53f98d0cf | toolbar: 16-swatch palette, Paint/Erase/Pick/Fill, click+drag painting, `floodFill`, `CELL_CHAR_WIDTH` |
| 5 | 35148131f, 96c8b8192 | `dialogs.ts` — modal prompt/confirm REPLACING the typed naming mode entirely |
| final wave | efd5b0953, bc5488865 | SDK hidden-container mouse fix + DockablePanel listener leak + preview stagger + guarded browser wiring |
| 7 | 079deb606, 9bffcab04 | menu coverage (nothing hotkey-only) + the ESC dispatch root-cause fix |

**Root causes found and fixed, each measured not guessed:**
- **The bottom double border** (recurring for weeks): sibling percent
  geometry (`45%+45%` vs `90%`) each `Math.floor`ed independently, so the
  two disagreed on a shared boundary by one row at some terminal heights.
  The plan's own "pane bottom lands on the status row" hypothesis was
  DISPROVEN mathematically. Fixed by integer LAYOUT; the class is now
  impossible.
- **Canvas rows staggered one column**: `rows.join('\n ')` — a stray space
  in the separator, shifting every row after the first. Surfaced only
  because the click-to-paint mapping had to reuse the render math.
- **A hidden container's children stayed mouse-live**: rendering cascades
  hidden, hit-testing did not, so the browser's hidden menu bar could open
  its dropdown over the editor and steal the focus trap. Fixed in the SDK
  (`walkVisible` in `screen.ts`, both `_rebuildMouseIndex` and the
  `getElementsAt` fallback).
- **A dialog ate the keystroke that opened it**: a key that opened a modal
  was re-delivered to the newly focused modal, whose own escape-to-cancel
  closed it in the same physical keystroke — the user's reported "can't
  quit the sprite editor". Fixed in the SDK: `_handleKey` snapshots the
  focused element BEFORE global handlers run.
- **DockablePanel leaked three screen listeners per panel** (including
  `mousemove`, this repo's documented door-freeze class) because they were
  registered outside the tracked `_slisteners` mechanism.

**The guard that leaked four times.** The naming-mode guard was patched at
one call site after another (2b keyboard ops, 2c canvas click, canvas drag,
then menus). Task 5 deleted the class outright (dialogs replace naming
mode) and moved the guard to the binding-table source, so `screen.key()`
registrations and `menuItems()` actions are the SAME wrapped closure.

**Two other doors investigated, NOT patched** (`fa57460f8`, tests only):
`neo-blessed-showcase` genuinely had the bug shape but is already fixed by
the SDK change (proved by reverting it: RED without, GREEN with);
`livechat` was never reachable. Both shapes now pinned by
`sdk/tests/unit/door-key-redelivery-shapes.test.ts`.

### Pengo — the queued "game ends after level 1" (`38a4a4e8e`)
Wider than logged: `Doors/pengo/index.ts`'s input switch handled 7 of 9
`GameState` members with a destructive `default: showMenu()`. Fixed with an
exhaustive switch plus a compile-time `never` check. (`dying` was also
missing but is unreachable today — death is tracked via
`pengo.isDead`/`deathFrame` while the state stays `playing`.)

## IN FLIGHT — plan 3, the ANSIEditor investment

Plan: `thoughts/shared/plans/2026-09-01-ansi-editor-sprite-capable.md`
Ledger: `.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/progress.md`

**The decision.** The user asked whether art mode should become "a full
single screen ansi sprite animation editor". Research (two committed docs,
`thoughts/shared/research/2026-09-01_*`) found the widget could not host a
sprite editor as-is, and that my initial pitch was wrong about undo. Given
the honest trade-off the user chose "invest in the widget", then added
"fix the original ansi-edit also, not just our fork" — which turned three
patches into a convergence.

**Why the convergence matters:** there are TWO ANSI editors in the SDK. The
library (`sdk/engines/ui/ansi-editor/`, ~4500 lines) is dimension-agnostic
and has complete, correct undo. The blessed widget imports all ten of its
tool handlers plus `undoDrawing`/`clearUndoStack`, calls NONE of them, and
reimplements every tool inline with 80x25 hardcoded in ~20 places. That
fork is exactly why Ctrl+Z does nothing while drawing.

- **Task 1 COMPLETE** (`dfa41d876`, `5cb0df5f4`; sdk 628/628): dimensions
  derive from the canvas (`canvasW`/`canvasH` getters, `canvasWidth`/
  `canvasHeight` options, `getCanvasSize()`), `setCoreCanvas` made
  size-safe, and a real pre-existing bug fixed — `newDocument()` left
  `layers[active].canvas` pointing at the pre-clear canvas, so after
  File > New a merge or flatten-on-save still emitted the old content.
- **Task 2 IN FLIGHT**: a real transparent cell (`Cell.transparent`), one
  shared `isCellEmpty`, transparency rendered visibly. Mandated
  measurement-first: the widget has two DIFFERENT emptiness tests today
  (bg-only inline vs the library's stricter `fg===7` version) and adopting
  the stricter one blind would change existing rendering.
- **Tasks 3-5 pending**: per-instance undo in the library (its stack is a
  module-level global — two editors would undo each other), then the widget
  adopts the library's tools tool-by-tool (deleting the inline fork, which
  is what makes undo work), then sweep.

## Blocked on the user

1. **The 2b + 2c manual checklist** — never run. The door is live in the
   dev backend and ready.
2. **Deploy** — 2b, 2c, pengo and the SDK fixes are all unpushed.
3. **A one-line hook edit**: `.git/hooks/pre-commit` caps files at 2000
   lines and has a documented exemption list for files "already over the
   cap before being touched". `sdk/engines/ui/blessed/widgets/ansi-editor.ts`
   (4196 lines before this plan) belongs on it; the hook is untracked and
   the classifier blocks me from editing it, so tasks are using
   `SKIP_SIZE_CHECK=1` (the hook's own hatch, never `--no-verify`) and
   disclosing it. Task 4 shrinks the file anyway.
4. **The door-side sprite editor rebuild** is deliberately a SEPARATE later
   plan that consumes plan 3's API. Do not start it until plan 3 lands.

## Learnings worth keeping

- **A source-regex pin can certify a guarantee the code does not provide.**
  `theMenuBarSleepsWithTheEditorAndArtSession` asserted the hide call was
  made; the call did not do what the test's own comment claimed. Two of the
  branch's three most serious defects were invisible to regex pins. Any new
  pin over a RUNTIME guarantee is a smell.
- **When a guard leaks repeatedly, stop guarding and delete the class.**
  Four call sites in, the fix was to remove naming mode and move the guard
  to where bindings are built.
- **Measure before choosing a layer.** The double border, the ESC
  self-cancel and the hidden-container clicks were all diagnosed by tracing
  real dispatch/geometry, and two of the three plan hypotheses were wrong.
- **A plan is an argument, not authority.** This plan named a file that
  never existed (`sdk/.../cell-art/edit-doc.ts` — EditDoc is door-local)
  and an "animation rename flow" the door has never had. Implementers were
  right to refuse both.
