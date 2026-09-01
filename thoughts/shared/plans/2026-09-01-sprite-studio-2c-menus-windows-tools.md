# Sprite Studio 2c: Menu-Driven UI, Dockable Windows, Toolbars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SPRITED door's presentation layer so the whole app is menu-driven, mouse-driven, and window-managed like the livechat door: menu bars, dockable/resizable panels, a paint toolbar with palette and tools, and modal dialogs replacing the typed naming mode.

**Architecture:** Presentation-layer rebuild only. The tested core (EditDoc pure ops, half-block codec, serializeSprite/writeSprite, browser-model) stays untouched except one new pure op (floodFill). A single binding table becomes the source of truth for hotkeys, the glyph-exclusion list, and menu items. Panes become SDK DockablePanels; a fixed-row default layout replaces all percent geometry (root-causing the recurring bottom double-border). Reference implementations: `Doors/livechat` (menu bar wrapper, dockable panels, dialogs, fastCSR) and the SDK `ansi-editor` widget (toolbar/palette look).

**Tech Stack:** TypeScript, SDK blessed engine (`MenuBar`, `DropdownMenu`, `DockablePanel`, `ConfirmModal`, `Textbox`), existing sprite-editor test harness (`tests/run-tests.ts`, comment-stripped shape tests + behavior tests).

**Spec:** `thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md` (phase 3) plus the user's session directives (2026-09-01), which are binding and extend the spec: "the whole sprited app need to be menu driven and smooth to work with like the livechat door", "i need to be able to arrange windows", "we need toolbars etc to pick colors and tools". Where this plan and the written spec differ, the user directives win.

**Recorded deviations (approved-by-user-directive):** typed naming mode is REMOVED in favor of modal dialogs (supersedes 2b's naming-mode design and its opKey blocksTyping guard for name entry); percent-based layout removed; right-click context menus and line/rect/circle tools deferred.

## Global Constraints

- Repo root: /Users/spot/Code/amiexpress-web. All paths relative to it.
- Never `git add -A` or `git add .` — stage by name, exactly your task's files.
- New files LF. Do not convert endings of files you edit.
- No emoji anywhere. BBS/terminal output uses ASCII tokens.
- SDK edits: `cd sdk && npx tsc --noEmit -p tsconfig.json`, then `npm run build:cjs && npm run build:esm`, then grep the new symbol in sdk/dist. Nothing rebuilds dist for you.
- SDK jest: `cd sdk && npx jest tests/unit/<file>.test.ts`.
- Studio door: `cd Doors/sprite-editor && npx tsc --noEmit -p tsconfig.json` and `npm test`; register new test files in tests/run-tests.ts.
- Commit locally with your task's exact message. NEVER push. NEVER run kill-servers/start-servers. No subagents of your own.
- Do not touch files outside your task's list; other sessions' dirt in git status is normal.
- RED checks are by DELETING code, never commenting it out.
- Shape tests strip comments before matching (see existing tests for the helper).
- The door owns the full 80x25 terminal.
- Commit trailers, both lines, verbatim:
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014HgBVxWkPvLox7zP2jrcEF

## File Structure (end state)

- `Doors/sprite-editor/bindings.ts` (new) — binding table types + `buildEditBindings(ctx)` + `buildBrowserBindings(ctx)`; derives hotkey wiring, glyph-exclusion set, and menu item lists.
- `Doors/sprite-editor/menu.ts` (new) — `createStudioMenuBar(screen, items)` wrapper over SDK MenuBar (livechat `Doors/livechat/ui/menu-bar.ts` pattern), exports `MENU_HEIGHT = 1`.
- `Doors/sprite-editor/layout.ts` (new) — integer row/col constants for the default 80x25 arrangement of both screens; single source for all geometry.
- `Doors/sprite-editor/panels.ts` (new) — `makePanel(...)` helper creating a DockablePanel with the studio's shared options (constraints, persistenceKey prefix, style).
- `Doors/sprite-editor/toolbar.ts` (new) — palette strip + tool buttons panel for the edit view; exports `Tool = 'paint' | 'erase' | 'pick' | 'fill'`.
- `Doors/sprite-editor/dialogs.ts` (new) — `promptText(screen, title, initial)` and `confirm(screen, message)` promise-returning modals (livechat dialog pattern; SDK `confirm-modal`, `textbox`).
- `Doors/sprite-editor/app.ts` (modify) — browser: menu bar, panels, mouse selection; stays glue.
- `Doors/sprite-editor/edit-screen.ts` (modify) — menu bar, panels, toolbar, mouse paint, dialogs; naming-mode machinery deleted.
- `Doors/sprite-editor/art-screen.ts` (modify, small) — new-file name via `promptText` dialog instead of inline naming.
- `sdk/engines/graphics/cell-art/edit-doc.ts` (modify) — add pure `floodFill` op.
- Tests: `Doors/sprite-editor/tests/` (extend existing files + new `bindings.test.ts`, `layout.test.ts`, `toolbar.test.ts`, `dialogs-shape.test.ts`), `sdk/tests/unit/edit-doc.test.ts` (extend).

---

### Task 1: Binding table

**Files:**
- Create: `Doors/sprite-editor/bindings.ts`
- Modify: `Doors/sprite-editor/edit-screen.ts` (replace the 24 opKey call sites + hand-written exclusion string), `Doors/sprite-editor/app.ts` (browser key wiring)
- Test: `Doors/sprite-editor/tests/bindings.test.ts` (new, register in run-tests.ts); update `edit-screen-shape.test.ts` pins that reference the old exclusion string

**Interfaces:**
- Produces (Tasks 2 and 4 rely on these exact names):

```typescript
export interface StudioBinding {
  id: string;                    // stable id, e.g. 'frame.new'
  keys: string[];                // blessed key names, e.g. ['n']
  hotkeyHint: string;            // shown in menu label, e.g. 'n' or 'S-x'
  menu: string;                  // top-level menu label, e.g. 'Frame'
  label: string;                 // menu item label, e.g. 'New Frame'
  handler: () => void;
}
export interface BindingSet {
  bindings: StudioBinding[];
  excludedGlyphKeys: Set<string>;   // derived: every key of every binding that is a single printable char
  menuItems(): { label: string; items: { label: string; action: () => void }[] }[];
}
export function buildBindingSet(bindings: StudioBinding[]): BindingSet;
```

- Consumes: the existing handlers inside EditScreen/StudioApp (moved into table entries, bodies unchanged).

**Steps:**

- [ ] **1. Write failing tests** in `tests/bindings.test.ts`: (a) `excludedGlyphKeys` contains every single-printable-char key from a sample table including a shifted key like `S-x` contributing `X`; (b) `menuItems()` groups by `menu` preserving table order and each item's `label` includes the `hotkeyHint` in the form `Label (hint)`; (c) two bindings with the same `id` throw at build time.
- [ ] **2. Run, verify fail** (`npm test` — module not found / assertions fail).
- [ ] **3. Implement `bindings.ts`.** `buildBindingSet` validates unique ids, derives `excludedGlyphKeys` (a key contributes its printable char; `S-<c>` contributes uppercase `<c>`), builds `menuItems()`.
- [ ] **4. Rewire `edit-screen.ts`**: declare its op table via `StudioBinding[]` entries whose handlers are the existing bodies verbatim; `opKey` loop iterates the table; the glyph-typing exclusion check reads `excludedGlyphKeys` instead of the hand-written string. Rewire `app.ts` browser keys the same way. Delete the literal `'gfbFB,.ncx<>a+tTlsSX '` string. Behavior identical — no key added/removed/changed.
- [ ] **5. Update shape-test pins** that matched the old exclusion string to instead pin that the check reads the derived set; every pre-existing behavior test must pass unchanged.
- [ ] **6. Run full studio suite green; RED by deleting the derivation line (exclusion test must fail), restore.**
- [ ] **7. Commit** `refactor(sprite-editor): single binding table drives keys and exclusion set`.

### Task 2: Menu bars, fixed-row layout, double-border root cause, browser mouse selection

**Files:**
- Create: `Doors/sprite-editor/menu.ts`, `Doors/sprite-editor/layout.ts`
- Modify: `Doors/sprite-editor/app.ts`, `Doors/sprite-editor/edit-screen.ts`
- Test: `Doors/sprite-editor/tests/layout.test.ts` (new, register); extend `browser-shape` / `edit-screen-shape` tests

**Interfaces:**
- Consumes: `BindingSet.menuItems()` from Task 1; SDK `MenuBar`/`MenuBarItem` from `@amiexpress/bbs-door-sdk/engines/ui/blessed`.
- Produces: `menu.ts` exports `MENU_HEIGHT` (=1) and `createStudioMenuBar(screen: Screen, items: MenuBarItem[]): MenuBar`; `layout.ts` exports one frozen object `LAYOUT` with integer `top/left/width/height` for every pane of both screens on 80x25, plus `STATUS_ROW = 24`.

**Steps:**

- [ ] **1. Read the references first**: `Doors/livechat/ui/menu-bar.ts` (wrapper shape), `sdk/engines/ui/blessed/widgets/menu-bar.ts` (options), livechat `server.ts` menu-bar wiring around lines 241 and 1030 (layout offsets by MENU_HEIGHT).
- [ ] **2. Write failing layout tests**: every pane rect in `LAYOUT` has integer fields; panes tile without overlap; no pane extends past row 23 (status row is 24, menu row 0); left column + right column widths sum to 80.
- [ ] **3. Implement `layout.ts`**: default arrangement — edit view: Canvas rows 1-19 cols 0-43, Preview rows 1-8 cols 44-79, Frames rows 9-14 cols 44-79, Toolbar rows 15-19 cols 44-79 (Task 4 fills it; until then the Paint pane), status row 24, rows 20-23 reserved for floating/minimized panel headroom; browser: Doors / Sprites / Animations / Preview equivalent integer rects. Exact numbers are the implementer's to tune inside the test invariants (integers, no overlap, nothing on rows 0 or 24 except menu/status).
- [ ] **4. Implement `menu.ts`** (livechat wrapper pattern, handler indirection not needed since bindings carry handlers — pass `menuItems()` straight through).
- [ ] **5. Rewire both screens**: menu bar at top; all panes take geometry from `LAYOUT`; delete every percent string; status bar at `STATUS_ROW` showing contextual hints. **Root-cause the bottom double border while doing it**: identify which two widgets drew stacked borders at rows 22-24 in the old percent layout (suspect: percent rounding pushing a pane bottom edge onto the status row) and record the cause in your report; the integer layout must make the class impossible — add a shape/behavior test asserting no widget's bottom edge lands on `STATUS_ROW`.
- [ ] **6. Browser mouse selection**: `mouse: true` on the three lists and preview; click selects (blessed list `select` event → same handler as arrow+enter path), double-click on a sprite opens the editor (same handler as `e`). No new logic — existing handlers only.
- [ ] **7. Suite green; RED by deleting the menu-bar creation line (a new shape pin must fail), restore. Commit** `feat(sprite-editor): menu bars, integer layout, mouse selection - kills the bottom double border`.

### Task 3: Dockable panels and layout persistence

**Files:**
- Create: `Doors/sprite-editor/panels.ts`
- Modify: `Doors/sprite-editor/app.ts`, `Doors/sprite-editor/edit-screen.ts`
- Test: extend shape tests; new assertions in `layout.test.ts`

**Interfaces:**
- Consumes: `LAYOUT`, `MENU_HEIGHT` from Task 2; SDK `DockablePanel` (read `sdk/engines/ui/blessed/widgets/dockable-panel.ts` options block and `Doors/livechat/ui/chat-log.ts` for a worked example).
- Produces: `makePanel(screen, opts: { key: string; title: string; rect: Rect }): DockablePanel` — applies shared defaults: `useTitleBar: true`, `draggable: true`, `resizable: true`, `allowMinimize: true`, `topConstraint: MENU_HEIGHT`, `bottomConstraint: 1`, `persistenceKey: 'sprited:' + key`, `fitContent: false`.

**Steps:**

- [ ] **1. Check the screen's storage backend**: grep how `screen.storage` is provided in this door's blessed screen (`sdk/engines/ui/blessed/core/screen.ts`) and how livechat's screen gets one. If the door screen has no storage, persistence silently no-ops (saveState early-returns) — that degradation is ACCEPTABLE for this task; report which case applies. Also mirror livechat's `fastCSR: false` screen option (`Doors/livechat/ui/screen.ts:13`) — required for stable dockable rendering.
- [ ] **2. Write failing shape tests**: every pane in both screens is constructed via `makePanel`; `fastCSR: false` present in the door's screen creation; `View` menu contains `Reset Layout`.
- [ ] **3. Implement `panels.ts`; convert all eight panes** (browser: doors, sprites, animations, preview; edit: canvas, preview, frames, toolbar) from bare boxes/lists to DockablePanels whose content element is the existing widget, geometry from `LAYOUT`.
- [ ] **4. `View -> Reset Layout` menu item** (add to both screens' binding tables, no hotkey — empty `keys` is legal; Task 1's build must allow it): restores every panel to its `LAYOUT` rect and docked state.
- [ ] **5. Destroy discipline**: EditScreen/ArtSession teardown destroys panels, not just child widgets — extend the existing destroy pin tests.
- [ ] **6. Suite green; RED by deleting the `topConstraint` line (shape pin fails), restore. Commit** `feat(sprite-editor): dockable panels with persistent arrangement`.

### Task 4: Toolbar, palette, tools, mouse painting, floodFill

**Files:**
- Modify: `sdk/engines/graphics/cell-art/edit-doc.ts` (floodFill), `Doors/sprite-editor/edit-screen.ts`
- Create: `Doors/sprite-editor/toolbar.ts`
- Test: extend `sdk/tests/unit/edit-doc.test.ts` (floodFill cases); new `Doors/sprite-editor/tests/toolbar.test.ts` (register)

**Interfaces:**
- Consumes: EditDoc op conventions (read `edit-doc.ts` — pure ops, identity rule), `makePanel` from Task 3, `StudioBinding` from Task 1.
- Produces:

```typescript
// edit-doc.ts — same style as existing ops, pure, throws on out-of-bounds like setPixel
export function floodFill(doc: EditDoc, row: number, col: number, colour: number | null): EditDoc;
// toolbar.ts
export type Tool = 'paint' | 'erase' | 'pick' | 'fill';
export interface ToolbarState { tool: Tool; colour: number; }  // colour 0-15
export function createToolbar(screen, panel, state: ToolbarState, onChange: (s: ToolbarState) => void): { refresh(): void; destroy(): void };
```

**Steps:**

- [ ] **1. Write failing floodFill tests in sdk** (jest): fills a bounded same-colour region and stops at differing colours; filling a transparent (null) region with a colour; fill where target colour equals replacement is identity (returns doc unchanged — same object or deep-equal, match the codebase's identity rule); respects frame bounds; works in pixel space on half-block frames (operates on the PixelGrid like setPixel does).
- [ ] **2. Implement floodFill (4-connected BFS), sdk suite green, rebuild sdk dist (cjs+esm), grep `floodFill` in `sdk/dist`.**
- [ ] **3. Write failing toolbar tests**: palette renders 16 swatches; clicking swatch k calls onChange with `colour: k`; clicking a tool button sets that tool; active tool+colour indicated in content (shape-level: assert the click handler wiring exists and the state flows — use the existing behavior-test technique from `edit-screen-behavior.test.ts`).
- [ ] **4. Implement `toolbar.ts`** inside the Task-3 toolbar panel: 16 colour swatches (cell-art numeric palette, click to select), four tool buttons `[Paint] [Erase] [Pick] [Fill]`, one status line `tool colour`. ASCII labels only.
- [ ] **5. Mouse painting on the canvas**: mouse handler maps click coordinates to cell (cell mode) or half-block pixel row (pixel mode) using the same math `paint()` uses to render; applies the active tool via the existing `tryOp` path — paint=setPixel/setCell with active colour, erase=null, pick=read colour into ToolbarState (no doc change), fill=floodFill. Drag (`mousemove` with button down) paints continuously for paint/erase only. Frames strip: click a frame number selects it (same handler as `,`/`.` path).
- [ ] **6. Add tool hotkeys to the binding table** (`p`/`e` conflict check: `e` is browser-level; inside edit view `e` is free? VERIFY against the table from Task 1 — if taken, choose free keys and record them in the menu labels; menu `Tools` gets the four entries either way).
- [ ] **7. Full sdk + studio suites green; RED floodFill by deleting the BFS loop body (sdk test fails), restore. Commit** in two commits: `feat(cell-art): floodFill pure op` (sdk incl. dist) and `feat(sprite-editor): toolbar, palette, tools, mouse painting`.

### Task 5: Modal dialogs replace naming mode

**Files:**
- Create: `Doors/sprite-editor/dialogs.ts`
- Modify: `Doors/sprite-editor/edit-screen.ts` (delete naming-mode machinery), `Doors/sprite-editor/art-screen.ts` (new-file name via dialog)
- Test: new `Doors/sprite-editor/tests/dialogs-shape.test.ts` (register); update `edit-screen-behavior.test.ts` naming tests; update `art-mode-shape.test.ts`

**Interfaces:**
- Consumes: SDK modal widgets — read `sdk/engines/ui/blessed/widgets/confirm-modal.ts` and `textbox.ts`, plus livechat's join-channel dialog for the worked pattern.
- Produces: `promptText(screen, title: string, initial?: string): Promise<string | null>` (null = cancelled; ESC cancels; validates non-empty trimmed); `confirm(screen, message: string): Promise<boolean>`.

**Steps:**

- [ ] **1. Write failing shape/behavior tests**: `dialogs.ts` exports both functions; while a dialog is open the edit screen's op bindings do not fire (same discipline as the old naming guard — assert via the behavior-test technique); ESC in a dialog cancels without touching the document.
- [ ] **2. Implement `dialogs.ts`.**
- [ ] **3. Replace naming mode**: `+` (new animation) and animation rename flow call `await promptText(...)`; DELETE the `naming` field, the keypress name-typing listener, and the name-branches in space/delete/enter/escape handlers. The `opKey` guard changes from `naming !== null` to `dialogOpen` (one boolean set by dialogs.ts helpers around await). The Task-1 exclusion set STAYS — it still guards glyph typing into cells.
- [ ] **4. Confirm modals**: frame delete (`x`), animation delete (`S-x`), dirty-exit (replaces the ESC-twice discipline — ESC on dirty asks `Discard unsaved changes?`). Menu items route through the same handlers.
- [ ] **5. `art-screen.ts`**: `[new file]` uses `promptText`; keep the existing-name collision behavior (opens existing content) exactly — the collision test from the 2b fix wave must keep passing with the new entry path (update the shape pin's matched string, not its meaning).
- [ ] **6. Update the old naming behavior tests** to assert the new flow (typing during dialog does NOT reach ops; submitting creates/renames; cancel leaves doc untouched). RED by deleting the `dialogOpen` guard, restore.
- [ ] **7. Full suite green. Commit** `feat(sprite-editor): modal dialogs replace typed naming mode`.

### Task 6: Sweep and the user's checklist

- [ ] Full builds: sdk (cjs+esm), studio door; suites: sdk jest full, studio `npm test`; report totals.
- [ ] Controller: backend restart; `Registered door: SPRITED` fresh.
- [ ] The user's checklist (do not check these yourself):
  - [ ] menu bars on browser and edit view; every operation reachable by mouse alone
  - [ ] drag a panel by its title bar; resize it; minimize it; arrangement survives reopening the door (or degrades per Task 3's storage finding)
  - [ ] View -> Reset Layout restores the default
  - [ ] click to paint; drag to paint a stroke; erase, pick, fill work; palette click changes colour
  - [ ] new animation / rename via dialog; delete frame/animation asks first; dirty ESC asks once
  - [ ] no double border at the bottom anywhere
  - [ ] art mode still opens and saves; browser still sane after returning

## Self-review (at writing time)

- User directives covered: menus (T1/T2), windows (T3), toolbars/colors/tools (T4), smooth/mouse (T2/T4/T5), livechat as reference (T2/T3/T5 read it first).
- Type consistency: `StudioBinding`/`BindingSet` (T1) consumed by name in T2 step 4 and T4 step 6; `LAYOUT`/`MENU_HEIGHT` (T2) consumed in T3; `makePanel` (T3) consumed in T4; `floodFill` signature matches EditDoc op style; `promptText`/`confirm` (T5) self-contained.
- Known risks stated in-task: screen.storage availability (T3 step 1), `e` hotkey conflict (T4 step 6), double-border root cause recorded not assumed (T2 step 5).
- YAGNI enforced: no context menus, no line/rect tools, no undo (2b's recorded deviation stands).
