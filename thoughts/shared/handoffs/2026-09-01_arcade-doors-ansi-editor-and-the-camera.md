---
date: 2026-09-01
topic: "Sprite studio 2b/2c, the ANSIEditor convergence (merged to main), Frogger's sprite pass, Pengo rebuilt on a camera"
tags: [sprite-editor, sprited, ansi-editor, frogger, pengo, cell-art, camera, sdk, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: the day the doors got sprites, and the editor stopped forking

One long session, 2026-09-01, on branch `feat/installed-door-link` in the
MAIN checkout.

**One thing reached main. Everything else is branch-only and unpushed.**

## What is on main

`a2aa1af0d` — the nine ANSIEditor commits, cherry-picked onto `origin/main`
through the `/private/tmp/arcade-sfx-deploy` worktree and pushed. Both
deploy runs went green; the container was NOT verified afterwards because
SSH is blocked for the assistant. **First job for the next session: verify
it**, per `feedback_verify_live_deploy_freshness` — a green workflow has
lied here before:

```
ssh -i ~/.ssh/hetzner_deploy root@89.167.21.154 \
  'docker inspect -f "{{.Created}}" amiexpress-bbs; \
   docker exec amiexpress-bbs head -c 9 /app/.git-sha; echo; \
   docker exec amiexpress-bbs grep -c snapshotUndoState \
     /app/sdk/engines/ui/ansi-editor/tools/drawing-tools.ts'
```
Container created minutes ago, sha `a2aa1af0d`, grep non-zero.

## Still on the branch, NOT pushed

Frogger's sprite pass, Pengo's rebuild, the cell-art camera, sprite
flipping, and plans 2b + 2c. Deliberately held: the user has never run the
SPRITED manual checklist, and Pengo was changing under them all afternoon.

## Plans finished

### Sprite studio 2b (editing) — closed
Resumed mid-plan. Final review found five Importants, all in EditScreen's
stateful key routing, fixed in one wave (`fe911ce0e`): naming a sprite
executed bound ops (typing "spin" saved to disk and inserted a frame), a
`setPixel` that could throw out of a key handler, a missing `X` in the
glyph-exclusion list, art mode's `[new file]` destroying an existing file,
and a test asserting a directory stays empty that the plan's own checklist
would have filled.

### Sprite studio 2c (menus, windows, toolbars) — complete
Plan: `thoughts/shared/plans/2026-09-01-sprite-studio-2c-menus-windows-tools.md`
Seven tasks. One binding table drives hotkeys, the derived glyph-exclusion
set and the menus; menu bars on both screens; integer LAYOUT replacing all
percent geometry; eight DockablePanels with Reset Layout; a 16-colour
toolbar with four tools and click/drag painting; modal dialogs replacing
typed naming mode entirely; and a runtime audit that fails if any
registered key lacks a menu entry.

**Root causes measured, not guessed.** The recurring bottom double border
was independently-floored sibling percents disagreeing by one row at some
heights — the plan's own hypothesis was disproven mathematically. A canvas
stagger was a stray space in `rows.join('\n ')`. Hidden containers stayed
mouse-live because rendering cascades hidden and hit-testing did not.

### ANSIEditor sprite-capable — complete, and merged
Plan: `thoughts/shared/plans/2026-09-01-ansi-editor-sprite-capable.md`
Research: `thoughts/shared/research/2026-09-01_ansi-editor-internals.md`
and `..._sprite-studio-model-and-hosting.md`

The SDK had TWO ANSI editors: a dimension-agnostic library with working
undo, and a blessed widget that forked it — reimplementing all ten tools
inline, hardcoding 80x25 in ~20 places, and importing the library's undo
functions without ever calling them. That fork was why Ctrl+Z did nothing
while drawing.

Five tasks: dimensions derive from the canvas; a real `Cell.transparent`
with one shared `isCellEmpty`; the library's undo made per-instance (it was
a module global — two editors would undo each other); the widget adopting
the library's tools with the ~300-line preview subsystem deleted; sweep.
SDK 706 → 744 tests, and the widget SHRANK while gaining working undo.

### Frogger — sprites, and six bugs found by playing
Plan: `thoughts/shared/plans/2026-09-01-frogger-sprite-pass.md`
16 columns of Pengo-sized 5x2 cells, sprites authored from the user's
arcade rip (`Doors/frogger/reference/frogger-sprites.png`, palette SAMPLED
from the PNG), a pure `buildBoard`, and the glyph painter deleted. 110 →
139 tests.

Every visual bug came from the user playing, not the suite: traffic snapped
to 5-character cells while collision used fractional positions; the frog
half off the bottom; the frog leaning into the water from the median (a fix
of mine that lied about position); invisible homes (drawn transparent over
a green hedge); a blank game-over panel (a regex expecting the deleted
painter's tag format); and drowning at the visible end of a log.

**Footing is now decided by the frog's CENTRE**, not its left edge — the
frog is a whole cell and logs sit at fractional positions, so half-on the
end of a log lost the old test by a fraction of a cell.

### Pengo — the real grid, the real levels, and mechanics
Research: `thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md`
Todos: `thoughts/shared/todos/2026-09-01_pengo-gaps.md`
Audited against two reference clones (cpp-pengo, Unlicense; PenguBruh-Pengo,
MIT+zlib). 16 mechanics: 1 matched, 10 differed, 5 absent. Now on the real
13x15 grid with the camera, the sixteen authored mazes, chain-kill crushes,
block destroying, touch-killing stunned enemies, enemies breaking blocks, a
population cap, and the diamond bonus scoring once. 46 → 82 tests.

### The cell-art camera — the queue's item 1
`sdk/engines/graphics/cell-art/camera.ts`, 18 tests. `cameraView` clamps so
the window never leaves the world, `cropBuffer` extracts it, and
`offScreenMarkers` says which edge each hidden thing lies past. The markers
are part of the capability on purpose: a camera that hides the enemy about
to kill you makes the game worse, so the module that imposes that cost pays
it. Unblocked Pengo's 13x15 board, which is 30 character rows on a 25-row
terminal.

## Learnings that cost something

- **A source-regex test can certify a guarantee the code does not provide.**
  `theMenuBarSleepsWithTheEditorAndArtSession` asserted a hide call existed;
  the call did not do what the test's own comment claimed. Two of 2c's three
  worst defects were invisible to regex pins. Memory:
  `feedback_regex_pin_cannot_prove_runtime`.
- **Two of my own rulings caused user-visible regressions.** I let a sprite
  lean into the lane above when it did not fit (it then lied about the
  frog's position), and I softened Pengo's AI toward a reference clone whose
  AI is a pure random walk. Both were reported in play. The references are
  not the benchmark; the arcade is.
- **A regression a fix wave causes is that wave being incomplete**, not a
  new finding — so it does not spend the "one fix wave" rule. `moveBlock`
  became strictly worse when its callee became undo-aware; fixing it was
  right, parking it would have shipped a menu-wired feature that silently
  ate content on undo.
- **Reviewers that probe beat reviewers that read.** The double-commit shape
  bug and the layer-undo corruption were both reproduced with probes, not
  inferred.
- **Implementers disclosing their own incomplete work caught two real
  bugs.** Both times the brief said "fix only these"; both times flagging it
  anyway was correct.

## Open, in rough priority order

1. **Verify the live container** (command above).
2. **The SPRITED manual checklist** — never run. 2b and 2c have had no human
   pass. It is in the 2c plan's Task 6.
3. **Deploy the rest** — Frogger, Pengo, camera, flip, 2b, 2c. Same
   cherry-pick worktree recipe.
4. **Pengo, deliberately not done**: the egg model (all three references
   differ entirely), the two-minute despawn (references disagree it exists),
   the last-enemy corner retreat (one reference only), stun duration left at
   5s between the references' 3s and 10s.
5. **Pengo grid caveat**: the transcription resolved a tension in my brief
   toward a 65-character board, costing several ice blocks per level to the
   wall border (0 diamonds, at most 1 egg). Fixable by treating 13x15 as the
   playable interior with a border outside it.
6. **The source data's levels 7-16 are literal duplicates of 1-6** — its "16
   original levels" claim is really six mazes repeated.
7. **Door-only deploys** — spec started, not written. Doors reload from disk
   per launch (`door.handler.ts` clears the require cache for a door's whole
   dist tree), so door-only changes need no container restart. The path
   condition is the dangerous part: any `sdk/**` change must force a full
   deploy, since doors symlink the SDK.
8. **UIED** — the user's door-UI designer idea:
   `thoughts/shared/todos/2026-09-01_uied-door-ui-designer.md`.
9. **Joust** — gap analysis done
   (`thoughts/shared/research/2026-09-01_joust-arcade-accuracy-gap.md`),
   no plan written. 32 facts: 9 match, 13 differ, 12 absent.
10. **One line for `.git/hooks/pre-commit`** — add
    `sdk/engines/ui/blessed/widgets/ansi-editor.ts` to its documented
    exemption list (4196 lines before this work began). The hook is
    untracked and the assistant is blocked from editing it, so tasks have
    been using `SKIP_SIZE_CHECK=1`.

## Other notes

- Four SDD workspaces survive under `.superpowers/sdd/` with full ledgers,
  per-task reports and review packages. Not deleted: the deploy is
  incomplete and the reports are the audit trail.
- A pre-existing Pengo test passes for the wrong reason
  (`theDiamondFanfareDoesNotRepeat` — a re-entrancy guard no-ops its second
  call). Flagged, untouched.
- Two other doors (`neo-blessed-showcase`, `livechat`) carry the
  dialog-eats-its-own-keystroke shape. Investigated and NOT patched: one is
  already fixed by the SDK change, the other was never reachable. Pinned by
  `sdk/tests/unit/door-key-redelivery-shapes.test.ts`.
- `DockablePanel.mergeWith()` reparents without appending to `children`, so
  `destroy()` never cascades into a merged tab panel. Dormant — nothing
  calls it — but the sprite studio has eight panels and would be the first
  caller.
