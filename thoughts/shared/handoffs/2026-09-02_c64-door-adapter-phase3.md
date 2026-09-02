---
date: 2026-09-02
topic: "C64 door adapter Phase 3 - 80-column 68K doors reduced to 40 columns for a PETSCII caller"
tags: [c64, petscii, doors, 68k, adapter, min-columns, phase3]
status: implemented
---

# C64 door adapter, Phase 3

Three installed 68K doors - `WHO` (RTW), `S` (ustats) and `WHAT` - now open for
a 40-column PETSCII caller. Their 80x25 ANSI output is replayed onto a virtual
grid and each finished frame is reduced to 40 columns before it reaches the
wire. An ANSI caller's bytes are untouched.

Plan: `thoughts/shared/plans/2026-09-02-c64-door-adapter-phase3.md`.
Ledger and per-task reports:
`.superpowers/sdd/2026-09-02-c64-door-adapter-p3/` (`progress.md`,
`task-{1..8}-report.md`).

## Commits, per task

| Task | Commit(s) | What landed |
|---|---|---|
| 1 - frame export | `ee37a0c23` | `sdk/petscii/frame` exported via `exports` + `typesVersions`; the backend's `ascii-art.util` re-exports the two frozen detectors |
| 2 - the rule ladder | `130d2fad0`, `78e4ab826` (review round) | `isRuleRow`, `deindentRow`, `narrowRow`, `columnSpans`; bordered/columnar rows stop doubling |
| 3 - the emitter seam | `c9ac20954`, `7b2589039` (minors round) | `web/backend/src/server/c64-door-adapter.ts`, installed on the door's socket in `executeAmigaDoor`; `DEFAULT_BG = 0`; teardown on exit and on disconnect |
| 4 - width pins | `6df09cfcb` | four 80-column literal pins (test-only) |
| 5 - the gate hook | `d785570ee`, `d352d66e4` (controller: deletion of the adapter's local predicate copy) | `resolveDoorAdaptColumns` / `doorOpensForC64` in `door-min-columns.util.ts`; one gate clause; the `[C64]` marker; `C64_ADAPT` folded onto `Door.c64Adapt` at registration |
| 6 - BBSTerminal trace + guard | `1d4bcedb6` | test-only; the trace found no client gap |
| 7 - corpus e2e | `f3de424e4` | 123 cases over 11 fixtures through the real emitter + the KERNAL oracle (test-only) |
| 8 - marks, docs, handoff | this commit pair | `C64_ADAPT=40` in the three real `.info` files; reachability through the real dispatch; docs; this handoff |

## The seam, and why it is where it is

The adapter is a **session-keyed, in-place patch of `socket.emit`**, installed
for the lifetime of one door run in `executeAmigaDoor`
(`web/backend/src/handlers/door.handler.ts`) and removed in its `finally`, in
`AmigaDoorSession.removeSocketHandlers()`, on disconnect, and defensively at the
top of `executeDoor`.

- A **web `P` session never passes the server-side transducer**, so the
  connection-emitter seam the plan first considered would have missed exactly
  the callers this is for.
- A **wrapper object would break socket identity**, which `AnsiBuffer` (keyed on
  `socket.id`) and `AmigaDoorSession`'s `door:input` listeners depend on. The
  in-place patch is the established pattern here (`ModemEmulator.install`).
- `launchAmigaDoor` is **dead code**; `executeAmigaDoor` is the live path. The
  install site is in the live one. `executeNativeDoor` (the legacy
  `isAmigaBinary` fallback - no `bbsSession`, no `petsciiMode`, no gate) is
  deliberately **not** wired: nothing has been found to reach a door through it.
- `socket._directEmit` **bypasses the adapter by design**. `install()` seeds it
  with the pre-adapter emit when unset, so a `ModemEmulator` constructed
  mid-door cannot capture the adapter and route bypass traffic back into the
  reconstructor. Screen wipes and slowmo chunks therefore reach the transducer
  unadapted, exactly as they do today.

## The measured ladder (Task 2)

`adaptRows(frame, { cols: 40 })` over the last frame of each golden:

| golden | source rows | before the ladder | after | gate |
|---|---|---|---|---|
| `what` | 10 | 34 | **25** | 25 - the whole frame fits one C64 screen |
| `rtw` (WHO) | 22 | 46 | **26** | 26 - the extra row is the BBS's own post-door prompt (53 columns of prose) reflowing |
| `ustats` (S) | 10 | 35 | **26** | 26 - the same prompt row |

Removing the `narrow` rung reverts the gate to 30 / 40 / 32, which is the RED
proof that the rung is what buys the screen.

`narrow` is **lossy on purpose** and is a new rule name so `gutter`'s multiset
invariant stays literally true. Its five pinned invariants: one row out, column
count and order preserved, a prefix of each column's text, a `>` on any column
that was shortened, and the first column never dropped. The alternative it
replaced - splitting a table so its right-hand columns land on a header-less row
and the title scrolls away - loses more.

## What the sysop actually sees

`WHO`, `S` and `WHAT` show `[C64]` in the DOORS list; the six `MIN_COLUMNS=40`
doors from the 40-column plan show `[40]`; nothing shows both. `RTW`, a second
command pointing at the SAME binary as `WHO`, is deliberately unmarked and is
still refused - the claim is per registration, not per executable.

## Known limitation: the tick cannot preempt a 68K batch

The adapter flushes a frame on a 250 ms quiet gap, on a max-frame cap, and at
every CPU stop boundary (`onPause`, which fires on all fourteen stop sites, not
only input waits - whatever the door has painted at a stop is a complete frame).
The cap is a `setTimeout`, and `executeUntilTrap` (`MoiraEmulator.ts:619`) is a
tight C++ loop that never yields to the JS loop, so **a door that paints inside
one long batch shows its frame at the END of the batch rather than 250 ms in**.
The stop-boundary flush covers the case that matters (the door blocking for
input); the fake-timer unit test does not cover the batch case and says so.

## Deferred - Phase 4 and later

| Deferred | The hook that is already there |
|---|---|
| Pack override (fingerprints, `.seq` / 40-col ANSI substitution per door) | `AdaptOptions.regions` already selects a rule per source-row range; add `regions` to `C64AdapterOptions` and read a `C64_PACK` tooltype where Task 5 reads `C64_ADAPT` |
| Positional pins - per-column priority for which column `narrow` shrinks first | `narrowRow` shrinks the widest column and takes its widths from one place; a pack names the order. A parameter, not a rewrite |
| A ragged-edge region pin | Task 2's follow-up: `rtw`'s logo rows narrow rather than crop because the ladder has no notion of "these rows are one picture"; the `|--+--+--|` junction rows crop from the left while the row above narrows, so one box ends up with two left edges |
| Pan keys + the viewport rule | The adapter owns the whole 80x25 frame, so a pan is a render-time column offset on `adaptFrame`. Pan keys must be intercepted upstream of `routeAmigaDoorInput`, at the door input handler set at launch |
| The MENU's three-column rows relaid out as two columns | They currently narrow to `[U] - UPLOA> [D] - DOWNLO> [RZ] - ZMODE>`; the fix is a 40-column menu layout, not a ladder rung |
| The BBS's own post-door prompt reflowing | The one row of the 26 that is not door output. It is the BBS, not the adapter, that emits it |
| `dev/scripts/c64-pack.ts` (capture / fingerprint / verify) | `web/backend/src/scripts/run-amiga-door.ts` (run with `cwd: web/backend` - there is no root `tsconfig.json`) and the manifest shape in `sdk/tests/petscii/frame/fixtures/manifest.json` |
| `DoorInfo.c64Adapt` for the DOORS menu | Display only - the launch path builds its `Door` from `CommandDefinition.toolTypes`, so the gate never reads `DoorInfo` there |
| AREXX and TypeScript/blessed doors | Not on this seam: they never construct an `AmigaDoorSession`. Blessed doors get NATIVE 40-column layouts from the 40-col plan; AREXX `BB_SCRWIDTH` was fixed separately (`823825f39`) |
| `executeNativeDoor` | Add the same install/uninstall pair if a door is ever found to reach a caller through it |
| A coloured screen background for an adapted door | `renderDiff` never emits a background by design; Phase 4 packs emit `$02 <colour>` through the transducer's CCGMS path |

## Notes worth carrying

- **The corpus doors are unreachable.** The eight corpus binaries (aehelp,
  six_status, kd_confstats, color_wall, who, ratiorep, super_stats, hststat)
  left the tree at `1cdddac24` and none has a `Commands/BBSCmd/*.info`. They
  survive only as captured fixtures. The three marked doors are installed and
  reachable, and their captures are now corpus fixtures in their own right.
- **`MIN_COLUMNS` and `C64_ADAPT` are separate claims on purpose.**
  `MIN_COLUMNS=40` says "this door already fits 40", which is false of an
  unmodified 80-column binary; reusing it would put a lie in the registry.
  Both are default-closed, and both are documented for sysops in
  `Documentation/2-Sysops/CONFIGURATION.md` section 5.
- **`C64_ADAPT` only opens `XIM`, `DD`, `AMI`, `SIM`, `FIM`** - the types whose
  output crosses the adapter's seam.
- **The `.info` files are Amiga icon binaries.** They were marked with
  `applyTooltypes()` (`web/backend/src/utils/info-file.util.ts`), never an
  editor, and verified by re-parsing: the new tooltype reads back, every other
  tooltype is byte-for-byte the same line, `diskObject` and `iconData` are
  byte-identical, and each file grew by exactly 17 bytes (a 4-byte length
  prefix + `C64_ADAPT=40` + NUL).

## Incidents in the shared tree (all recorded, all resolved)

1. **Task 3's first commit (`4c7e2409a`) carried 36 lines of another session's
   in-flight `door.handler.ts` work.** `git commit -o <paths>` commits the
   WORKING TREE version of the named paths, not the index, and the other
   session wrote to the file between staging and committing. Fixed by rebuilding
   the file as `HEAD~1` + the four owned hunks and amending.
   **`git diff --cached --stat` is not sufficient protection when using `-o` in
   this tree; `git show --stat` after the commit is.** Task 3's minors round and
   Task 7 both then committed through a private `GIT_INDEX_FILE`.
2. **`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts` was
   deleted from the working tree after it had been committed.** Task 7 landed it
   at `f3de424e4` (15:29); at ~15:36 another session's forbidden `git stash push
   --keep-index` swept the file in, and its recovery `rm`'d the file on the
   reasoning that "its content had reverted to HEAD, so deleting reproduced the
   prior state" - which had stopped being true seven minutes earlier. Restored
   from HEAD in Task 8; green again (123 cases). The lesson is the one already
   in the rules: **never `git stash` in this tree**, not even scoped.
3. **Task 5 could not commit `c64-door-adapter.ts`** because the Task 3 session
   was editing the same file; the deletion of the now-duplicate local predicate
   rode along in the controller's `d352d66e4` instead.

## Verification (Task 8, recorded verbatim)

```
cd sdk && npm run build                                    # exit 0; dist md5 unchanged
cd sdk && npx jest tests/petscii                            # 12 suites, 340 tests, all passed
cd web/backend && npx tsc --noEmit                          # exit 0
cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . \
  --testPathPattern="c64-door-adapter|min-columns|petscii-frame"
                                                            # 9 suites, 115 tests, all passed
cd web/backend && npx jest ... --testPathPattern="c64-door-adapter-corpus-e2e"
                                                            # 1 suite, 123 tests, all passed (after the restore)
```

Backend restarted at 15:51:33 per `.claude/skills/door-sdk-freshness/SKILL.md`
(sdk `dist` rebuilt and content-verified, tsx cache cleared, `[READY]` in
`logs/backend.log`, and `[initializeDoors] Registered door: WHO/S/WHAT` in the
new log).

## The manual C64 walk (for the sysop)

Local board, backend restarted at 15:51 (`./dev/scripts/start-servers.sh
--bbs-only`). Expectations are written against the Task 2 MEASUREMENT, not hope.

**A. The web session (simulated C64).**

1. Open `http://localhost:3001`, log in, and answer `P` at the graphics prompt
   (`PETSCII: SIMULATING C64 DISPLAY (40X25)`).
2. Open the DOORS list. `WHO`, `S` and `WHAT` carry `[C64]`; the six adapted
   TypeScript doors carry `[40]`; nothing carries both, and nothing else on the
   board carries either.
3. **`WHO`** (RTW). The screen clears at entry, then the node table on a
   40-column screen with its columns STILL SIDE BY SIDE - `Nd`, name, location,
   action - each column shortened, and any column that lost characters ending
   in `>`. The header row is the TOP row (it is no longer scrolled away). The
   bordered rules render as 40-column rules. Nothing past column 39. RETURN
   exits. Measured: 26 rows, of which 25 are the door - the 26th is the BBS's
   own post-door prompt reflowing, so expect the top door row to have just
   scrolled when the prompt lands.
4. **`S`** (ustats). The `NaME/HaNDlE........: sysop` rows verbatim - they
   already fit. The centred `----->>>> YoUr USeR StAtS <<<<-----` banners
   shifted flush left, on ONE row each, not split over two. The two closing
   credit lines word-wrapped over two rows each (they are prose, 52 columns
   after de-indent). Measured: 26 rows, the 26th again the BBS prompt.
5. **`WHAT`**. The whole box on ONE 25-row screen: the `.----.` top rule, the
   title row truncated with a trailing `>`, the six column headers side by side
   (roughly `Nd Usernam> Status/> File(s) Filesize CPS`),
   `- NO TRANSFER ACTIVITIES -`, and the two totals rows. No row is doubled.
   Measured: 25 rows - it fits with nothing to spare.
6. **Any UNMARKED 68K door** - `RTW` is the sharpest test, since it is the SAME
   binary as `WHO` under a second command name. Expect
   `THIS DOOR NEEDS AN 80 COLUMN SCREEN` and the menu back.
7. Reload, answer `A`, and enter the same three doors. Expect the ordinary
   80-column screens, unchanged byte for byte.
8. Inside `WHO`, hold RETURN. The prompt should appear without your having to
   type again (the stop-boundary flush). **A door that paints inside one long
   CPU batch may show its frame at the END of the batch rather than 250 ms in -
   report it if a screen feels like it arrives late, in one lump.** That is the
   known `setTimeout`-vs-`executeUntilTrap` limit above, not a new bug.

**B. A real C64 (or SyncTERM with `ScreenMode=C64`) over telnet.** Repeat 3-6.
The board detects a real C64 from the dedicated PETSCII port, TTYPE, or the
DEL-probe (`Documentation/2-Sysops/CONFIGURATION.md` section 5); `_C64.seq`
screen variants are preferred for `terminalType` exactly `c64`. The adapter
itself does not care which of the two it is - both are `petsciiMode` at 40
columns - so a difference between A and B is a detection or transducer report,
not an adapter one.
