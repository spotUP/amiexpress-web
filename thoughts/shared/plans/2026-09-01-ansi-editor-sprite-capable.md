# ANSIEditor: dimension-aware, transparency-aware, real draw undo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SDK's ANSIEditor widget capable of hosting a sprite editor: a canvas of any size (not a hardcoded 80x25), a real transparent-cell concept, and working undo in draw mode.

**Architecture:** Three capabilities added across BOTH implementations of the ANSI editor, converging them. Today there are two: the reusable library `sdk/engines/ui/ansi-editor/` (core/canvas.ts, tools/drawing-tools.ts — dimension-agnostic, and it already has a complete working undo) and the blessed widget `sdk/engines/ui/blessed/widgets/ansi-editor.ts`, which reimplements all ten drawing tools inline, hardcodes 80x25, and imports the library's tool and undo functions without ever calling them. The user's directive (2026-09-01) is explicit: fix the original too, not just the fork. So this plan makes the library correct and then makes the widget USE it, deleting the inline duplicates. Every change is additive and defaulted so both existing hosts (`Doors/ansi-editor`, `Doors/sprite-editor`'s art mode) behave exactly as today. The door-side sprite editor rebuild is a SEPARATE, later plan that consumes this one.

**Tech Stack:** TypeScript, SDK blessed engine, jest (`sdk/tests/unit/`).

**Spec:** the user's directive of 2026-09-01 ("invest in the widget"), grounded in two research documents that are binding context for every task:
- `thoughts/shared/research/2026-09-01_ansi-editor-internals.md` — the widget's data model, the ~20 hardcoded dimension sites (with a table of exact line numbers), the undo gap, the transparency gap, the hosting contract.
- `thoughts/shared/research/2026-09-01_sprite-studio-model-and-hosting.md` — the sprite Cell model, where transparency is `null`, and the half-block codec's lossless black-vs-transparent encoding.

Read the relevant sections of both before starting a task. The line numbers in the research are from commit 9bffcab04 and may drift; treat them as starting points, and re-grep before editing.

## Global Constraints

- Repo root: /Users/spot/Code/amiexpress-web. All paths relative to it.
- **No behavior change for existing hosts.** `Doors/ansi-editor` and `Doors/sprite-editor`'s art mode must look and behave exactly as they do today. Every new capability is opt-in via a defaulted option. This is the single hardest constraint in this plan: prove it per task, don't assert it.
- SDK checks: `cd sdk && npx tsc --noEmit -p tsconfig.json`, then `npx jest` (full suite; was 605/605 green at plan time), then `npm run build:cjs && npm run build:esm`. Nothing rebuilds dist for you. `sdk/dist` is gitignored — do NOT try to commit it.
- Door regression check after any task that touches shared types or rendering: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test` (was 183/183).
- Never `git add -A` or `git add .` — stage by name. Commit locally. NEVER push. NEVER run kill-servers/start-servers. No subagents of your own.
- New files LF. No emoji. ASCII-only terminal output.
- RED checks are by DELETING code, never commenting it out.
- Do not touch files outside your task's list; other sessions' dirt in git status is normal (there is known unrelated dirt in `sdk/engines/ui/blessed/core/screen.ts`).
- Commit trailers, both lines, verbatim:
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF

## File Structure (end state)

- `sdk/engines/ui/ansi-editor/types.ts` — `Cell` gains an optional `transparent?: boolean`.
- `sdk/engines/ui/ansi-editor/core/canvas.ts` — one exported `isCellEmpty` becomes the single definition of "nothing here"; `createCanvas` gains an opt-in transparent fill.
- `sdk/engines/ui/blessed/widgets/ansi-editor.ts` — dimensions derived from the canvas everywhere; transparency rendered and painted; draw-mode undo.
- `sdk/tests/unit/ansi-editor-dimensions.test.ts`, `ansi-editor-transparency.test.ts`, `ansi-editor-draw-undo.test.ts` (new).

---

### Task 1: Canvas dimensions derive from the canvas

**Files:**
- Modify: `sdk/engines/ui/blessed/widgets/ansi-editor.ts`
- Test: `sdk/tests/unit/ansi-editor-dimensions.test.ts` (new)

**Interfaces:**
- Produces (Tasks 2-3 and the later door plan rely on these):
```ts
// ANSIEditorOptions gains:
canvasWidth?: number;   // default 80
canvasHeight?: number;  // default 25
// ANSIEditor gains public:
getCanvasSize(): { width: number; height: number };
```
- Internally: two private getters are the ONLY source of dimensions.
```ts
private get canvasW(): number { return this.cellCanvas?.[0]?.length ?? this.optCanvasWidth; }
private get canvasH(): number { return this.cellCanvas?.length ?? this.optCanvasHeight; }
```

**Steps:**

- [ ] **1. Write the failing tests.** Construct an `ANSIEditor` with `canvasWidth: 5, canvasHeight: 2` on a real `Screen` (see `sdk/tests/unit/` for real-Screen construction examples) and assert: `getCanvasSize()` returns `{width:5,height:2}`; `getCoreCanvas()` is 2 rows of 5; the keyboard cursor cannot move past column 4 or row 1; a mouse click at (40,10) does not move the cursor outside the canvas; `selectAll()` bounds are `{x1:0,y1:0,x2:4,y2:1}`; the status bar reports `5x2`, not `80x25`. Then the no-regression half: an editor constructed with NO size options behaves exactly as today (80x25 in all the same assertions).
- [ ] **2. Run; verify they fail** (`cd sdk && npx jest tests/unit/ansi-editor-dimensions.test.ts`). Expect failures on every bounded assertion.
- [ ] **3. Add the options and getters.** Read `canvasWidth`/`canvasHeight` into private fields (defaults 80/25), allocate the initial canvas from them, and add the two private getters plus public `getCanvasSize()`.
- [ ] **4. Replace every hardcoded dimension** with `this.canvasW`/`this.canvasH` (or `-1` forms). The research's "Summary of hard constants" table lists every site: initial/new-document allocation, layer allocation in `addLayer`, keyboard cursor clamps, mouse click/drag clamps, preview canvas allocation, preview shape bounds (line/box/ellipse/select), paste bounds, row insert/delete loops, default/select-all selection, layer compose, the canvas-to-display sync loop, and the status-bar size label (currently a literal string). Re-grep for the literals `80`, `25`, `79`, `24` in the file when done and account for every remaining hit in your report — some are legitimately unrelated (colour codes, timings); name each one you left and why.
- [ ] **5. Make `setCoreCanvas` size-safe.** It currently assigns a new canvas without syncing `this.layers[activeLayerIndex].canvas` (research §3), which leaves a stale layer reference. Assign both, and clamp the cursor and any live selection into the new bounds.
- [ ] **6. Run the new tests (pass) and the FULL sdk suite** (`npx jest`) — nothing may regress. Then `npm run build:cjs && npm run build:esm`.
- [ ] **7. Prove the no-behavior-change constraint for hosts**: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test` (183/183 expected).
- [ ] **8. RED by deletion**: revert one clamp to its literal, watch the matching test fail, restore.
- [ ] **9. Commit**: `feat(sdk/ansi-editor): canvas dimensions derive from the canvas, not literals`

### Task 2: A real transparent cell

**Files:**
- Modify: `sdk/engines/ui/ansi-editor/types.ts`, `sdk/engines/ui/ansi-editor/core/canvas.ts`, `sdk/engines/ui/blessed/widgets/ansi-editor.ts`
- Test: `sdk/tests/unit/ansi-editor-transparency.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's dimension getters.
- Produces:
```ts
// types.ts
export interface Cell { char: string; fg: number; bg: number; blink?: boolean; transparent?: boolean; }
// core/canvas.ts — the ONE definition of "nothing here"
export function isCellEmpty(cell: Cell | null | undefined): boolean;
// ANSIEditorOptions gains:
transparentBackground?: boolean;  // default false — when true, a cleared cell is transparent, not black
```

**Design constraints (decided; do not re-litigate):**
- `transparent` is an OPTIONAL field on `Cell`, not a `null` entry in `Cell[][]`. The array shape stays `Cell[][]`, so no existing indexing breaks.
- Transparency does NOT need to survive `canvasToANSI`/`parseANSIToCanvas`. ANSI text has no such concept, hosts that need it use `getCoreCanvas`/`setCoreCanvas` (live `Cell[][]`), and the sprite door's own JSON carries it. State this explicitly in the code comment so a later reader doesn't "fix" it.
- The widget currently duplicates a bg-only emptiness test inline at two compositing sites, while the core library's `isCellEmpty` uses a stricter test that also requires `fg===7` (research §6). Unify on the core helper, extended to treat `transparent === true` as empty. Both call sites must use it. The behavioral difference between the old inline test and the unified one is exactly the kind of thing that changes existing rendering — measure it: before changing, write a test capturing today's compositing behavior for the `{char:' ', fg:3, bg:0}` case, and make your change keep that behavior for non-transparent cells.

**Steps:**

- [ ] **1. Write the failing tests.** With `transparentBackground: true`: a freshly created canvas is all-transparent; erasing a cell makes it transparent (not black); a transparent cell renders as a distinct guide glyph rather than a solid black cell (assert on the rendered content, so an artist can see through-holes); painting a character clears `transparent` on that cell; `isCellEmpty` returns true for a transparent cell and false for a deliberately-drawn black space (this is the distinction the sprite codec depends on). With the option absent (default): every one of those behaves exactly as today.
- [ ] **2. Run; verify failure.**
- [ ] **3. Add the field, the option, and the unified `isCellEmpty`;** replace both inline compositing tests with it.
- [ ] **4. Render transparency visibly.** In `syncCoreCanvasToDisplay`, a transparent cell paints a dim guide (a `.` on the editor's background at low contrast is sufficient; ASCII only, no emoji) instead of a solid cell. This must be purely presentational — `getCoreCanvas()` still returns `transparent: true` cells with their real `char`.
- [ ] **5. Wire erase to transparency** when the option is on: the existing erase path (which resets to `fg:7,bg:0`) sets `transparent: true` instead.
- [ ] **6. Full sdk suite + build; then the door regression check** (`Doors/sprite-editor` 183/183, and inspect that art mode still renders normally — it constructs the widget without the new option, so it must be untouched).
- [ ] **7. RED by deletion**: remove the `transparent` branch from `isCellEmpty`, watch the black-space-vs-transparent test fail, restore.
- [ ] **8. Commit**: `feat(sdk/ansi-editor): a cell can be transparent, and one helper defines empty`

### Task 3: Fix the original library's undo (per-instance, not module-global)

**Files:**
- Modify: `sdk/engines/ui/ansi-editor/tools/drawing-tools.ts`
- Test: `sdk/tests/unit/drawing-tools-undo.test.ts` (new)

**Why this task exists:** the library already implements what the widget lacks — `saveUndoState` is called by every tool handler (`drawTool`, `lineTool`, `boxTool`, `boxFillTool`, `ellipseTool`, `ellipseFillTool`, `fillTool`), with chunked undo for the freehand case, plus `undoDrawing`/`clearUndoStack`. It is correct in shape and simply never called by the widget. But its `undoStack` is a MODULE-LEVEL `let` (`drawing-tools.ts:28`), so every editor instance in a process shares one stack — two editors open at once would undo each other's strokes, and `clearUndoStack()` wipes everyone's history. Fix that before Task 4 makes the widget depend on it.

**Interfaces:**
- Produces: undo state moves onto the editor state (or an explicit per-instance handle) so each editor has its own history. Keep the exported function names (`undoDrawing`, `clearUndoStack`) so no caller breaks; change where the state lives, not the API shape, unless a signature change is unavoidable — if it is, state it and update every call site.

**Steps:**

- [ ] **1. Write the failing test.** Two independent editor states; draw on A, draw on B, undo A, assert only A reverted and B is untouched; `clearUndoStack` on A leaves B's history intact. Also pin the existing good behavior: a freehand stroke chunks into one undo entry, a shape commits as one entry, undo past the beginning is a safe no-op.
- [ ] **2. Run; verify the cross-contamination assertions fail** (they will — one global stack).
- [ ] **3. Move the stack to per-instance state.** Keep the chunking behavior and the cap exactly as they are; this is a scoping fix, not a redesign.
- [ ] **4. Full sdk suite + build.**
- [ ] **5. RED by deletion**: revert the stack to module scope, watch the isolation test fail, restore.
- [ ] **6. Commit**: `fix(sdk/ansi-editor): undo history is per editor, not shared across all of them`

### Task 4: The widget uses the library's tools instead of its inline fork

**Files:**
- Modify: `sdk/engines/ui/blessed/widgets/ansi-editor.ts`
- Test: `sdk/tests/unit/ansi-editor-draw-undo.test.ts` (new), plus additions to Task 1's dimension test

**Why:** the widget imports `drawTool`, `lineTool`, `boxTool`, `boxFillTool`, `ellipseTool`, `ellipseFillTool`, `fillTool`, `pickTool`, `selectTool`, `getToolHandler`, `undoDrawing`, `clearUndoStack` and calls NONE of them (research §4-5), having reimplemented each inline. That fork is why draw-mode `Ctrl+Z` is inert: the inline copies never record undo state. Converging on the library fixes undo, deletes duplicated geometry code, and means a future fix lands once.

**Design constraints (decided; do not re-litigate):**
- Behavior must not change for existing hosts, EXCEPT that undo starts working — that is the point of the task. If the library's geometry differs from the inline copy anywhere (a line's endpoint rounding, an ellipse's shape, fill's connectivity), the LIBRARY wins, but you must name every difference you find in your report so the user knows what visibly changed.
- Convert incrementally and verify per tool, not in one sweep: draw, then fill, then pick, then select, then the four shape tools. A tool at a time is reviewable; a 500-line rewrite is not.
- The half-block brush paths and the right-button-swaps-colours convention are widget-level input concerns, not library tools — keep them in the widget, but route their canvas mutations through the library so they record undo too.
- If a library tool cannot express something the widget does today, do NOT bend the widget to fit: extend the library, and say why in your report.

**Steps:**

- [ ] **1. Write the failing tests.** Draw a character, `Ctrl+Z`, assert the cell reverts; redo reapplies. Drag a line, assert ONE undo reverts the whole line (not one cell per preview repaint). Flood fill, undo, assert the region reverts. Two editors open at once do not undo each other (the Task 3 guarantee, verified through the widget). Text mode's own undo is unchanged.
- [ ] **2. Run; verify failure** — draw-mode undo is inert today.
- [ ] **3. Convert tool by tool**, deleting each inline implementation as its library replacement lands. After each tool: run the sdk suite.
- [ ] **4. Delete every now-unused import** and any inline geometry left orphaned. Re-grep the file for the imported names to prove none are dead any more; report anything you deliberately kept and why.
- [ ] **5. Wire `Ctrl+Z`/`Ctrl+Y`/`u` in draw mode to `undoDrawing`** (they currently reach the text-mode stack, which is why they appear inert).
- [ ] **6. Full sdk suite + build + door regression check** (`Doors/sprite-editor` 183/183; the ANSI editor door has no suite — verify by construction and note it).
- [ ] **7. RED by deletion**: remove the undo wiring from the fill path, watch that test fail, restore.
- [ ] **8. Commit**: `refactor(sdk/ansi-editor): the widget uses the shared tools, and undo works`

### Task 5: Sweep and host verification

- [ ] Full builds: `cd sdk && npx tsc --noEmit -p tsconfig.json && npx jest && npm run build:cjs && npm run build:esm`; report suite totals.
- [ ] Door regression: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json && npm test`; report totals.
- [ ] Grep `sdk/dist` for the three new capabilities to prove the build carries them (`canvasWidth`, `transparent`, the draw-undo entry point).
- [ ] Re-grep `ansi-editor.ts` for bare `80`/`25`/`79`/`24` and list every survivor with a one-line justification.
- [ ] Controller: restart the backend per `.claude/skills/door-sdk-freshness/SKILL.md` (SDK edits are invisible to the door watcher), verify a fresh `[READY]` and `Registered door` line.
- [ ] The user's manual checklist (do not check these yourself):
  - [ ] the ANSI editor door still opens, draws, saves and exits exactly as before
  - [ ] SPRITED's art mode still opens an `.ans`, edits and saves it
  - [ ] in the ANSI editor door, Ctrl+Z now undoes drawing (it previously did nothing)

## Self-review (at writing time)

- Spec coverage: dimension-awareness (T1), transparency (T2), and working draw undo (T3 fixes the library's per-instance scoping, T4 makes the widget actually use it) are exactly the three blockers the research identified for hosting a sprite editor. T3+T4 also satisfy the user's "fix the original too, not just our fork" directive, and are the single-source-of-truth fix: after T4 there is ONE implementation of each drawing tool. The door-side rebuild is deliberately NOT in this plan — it is a separate deliverable that consumes this API.
- Type consistency: `canvasWidth`/`canvasHeight`/`getCanvasSize` (T1) are consumed by T2's rendering and T4's tool routing; `Cell.transparent` (T2) is consumed by the library tools T4 adopts and by the later door plan; `isCellEmpty` has exactly one definition after T2; undo has exactly one implementation after T4.
- Ordering rationale: T3 before T4 because T4 makes the widget depend on the library's undo, and adopting a module-global stack into a widget that can be instantiated more than once would ship a new bug.
- Risk named in-task: T2's unification of two differing emptiness tests can change existing compositing — the plan requires capturing today's behavior in a test first.
- YAGNI: no diff-based undo, no alpha channel, no ANSI-level transparency encoding, no layer-model rework.
