# C64 / 40-Column Adaptation Plan (BBS + Doors)

> Status: DRAFT — strategy plan. Phases 1-2 are execution-ready; 3-5 need the Phase 0 inventory
> and the user decisions listed at the bottom before task-level breakdown.

**Goal:** Make as much of the BBS and its doors as possible genuinely usable on a 40x25 PETSCII
screen — real C64s over telnet and the web PetsciiCanvas simulation — instead of "80-col content
viewed through a 40-col keyhole".

**Foundation already landed (2026-09-01/02 PETSCII overhaul):** sessions carry
`screenWidth: 40 / screenHeight: 25 / petsciiMode / terminalType='c64'`; `.seq` screens resolve
first (`addPetsciiVariants`, `_C64.seq` priority) and travel as raw bytes; `convertAsciiToPetsciiOutput`
does correct case+charset; `convertUnicodePuaToPetscii` already parses ANSI (SGR incl. truecolor,
counted cursor moves, absolute positioning) into PETSCII bytes; `BBSApi` exposes
`isPetsciiMode()/getTerminalSize()/writeAuto()`; doors receive `screenType: 'PETSCII'`.

## The four content classes, and what "adapt" means for each

| Class | Examples | Strategy |
|---|---|---|
| A. Core BBS text flow | prompts, menus, mail read, bulletins, pagination | Reflow + column-budget layouts keyed on `session.screenWidth`. Fully adaptable. |
| B. Screen files | BBSTITLE, LOGON.TXT, conference screens, ANSI art | Specific `.seq` art where it matters; automatic text reflow fallback; 80-col ANSI art is NOT adaptable — never squeeze art. |
| C. TS/blessed doors | door-manager, bug-tracker, who-is-online, editors | Two mechanisms: SDK "compact 40x25" layout mode + an ANSI->PETSCII door bridge for real C64s. Per-door triage. |
| D. 68K binaries + AREXX | cplistan, oneliner-style doors, AREXX scripts | Cannot edit binaries: classify (fits-40 / needs-80), gate with a clean notice, fix AREXX line lengths where trivial. |

---

## Phase 0 — Inventory (research, no code) — DONE 2026-09-02

> Results: `thoughts/shared/research/2026-09-02_40col-inventory.md`. Headlines:
> ~30 backend surfaces (16 tables needing 40-col layouts, ~8 reflowable groups);
> 62 doors — 0 currently 40-ok, 7 compact-possible, 55 need-80; only 2 `.seq`
> screens exist (BBSTITLE, Logoff) — MENU.TXT, LOGON, join/guestlogon have none;
> ~12 pagination sites, mostly session-driven already. Blessed engine: width
> response is opt-in (`options.responsive`) and its narrowest breakpoint is
> `BREAKPOINT_XS = 50` — Phase 3.1 must add a 40-col tier (XXS) AND flip
> responsive on by default, or no door ever reaches a 40-col layout.

1. Grep the backend for hardcoded width assumptions: literals `80`, `79`, `\x1b[...G` column
   addressing, `padEnd(7x)`, table builders (file listings, user list, WHO, stats, transfer
   protocol menus, conference lists). Output: `thoughts/shared/research/40col-inventory.md`
   with file:line per surface, classified reflowable / needs-40-layout / art.
2. Door census from the doors registry + `Doors/*/`: for each door — engine (blessed/plain/68K/AREXX),
   does it read `getTerminalSize()`, minimum sensible width, verdict (adapt / compact-mode / gate).
3. Screen census: which screens have `.seq` variants today (Node*/BBSTITLE.SEQ, Conf*/Screens exist),
   which core screens have none.
4. Pagination audit: where `linesPerScreen`/24 assumptions live (JoinCnf splash lesson:
   linesPerScreen=0 -> 9999 mapping) — 25-row C64 wants 24 content + 1 pause row.

## Phase 1 — Core BBS flow at 40 columns (Class A, highest value per line changed)

1. **One choke point: width-aware word-wrap.** A `wrapForSession(text, session)` in the emit
   path (emitText level, never applied to petscii-bytes/binary/ANSI-art passthrough): soft-wrap
   at `screenWidth`, word-boundary, preserving CRLF discipline. Everything downstream of prompts,
   mail bodies, oneliners, help text becomes 40-col-correct in one move.
2. **Pagination from geometry**: pause every `screenHeight - 1` rows; kill remaining hardcoded 24s.
3. **40-col table layouts** for the top offenders found in Phase 0 — file listings (classic C64
   convention: two stacked lines per file — `FILENAME.EXT      1234K` / `  description wrapped...`),
   WHO, user list, protocol menu, conference list. Implement as alternate format functions selected
   by `screenWidth < 80`, single source of truth per table (no inline duplicates).
4. **Menus**: main/conf menus are single-letter driven already; provide `MENU_C64.seq` native
   40-col menu screens (Phase 2 pipeline) with text fallback via the reflow.
5. Tests per surface: render at 40, assert no line exceeds 40 printable columns and no mid-word
   hard breaks in prose paths.

## Phase 2 — Screen pipeline (Class B)

1. **Authoring set**: hand-make (or commission) native 40x25 `.seq` for the ~10 high-traffic
   screens: BBSTITLE, LOGON, main menu, conference join splash, logoff. The `.seq`-first
   resolution already prefers them; this is content work, not code.
2. **Auto-reflow fallback for TEXT screens**: when petsciiMode and only a `.TXT` exists:
   strip ANSI -> `wrapForSession` -> `convertAsciiToPetsciiOutput` (this path exists today;
   ensure it flows through the Phase 1 wrapper instead of hard-wrapping at 80).
3. **ANSI art detection**: screens that are art (heuristic: high density of CP437 blocks /
   cursor positioning) are NOT reflowed — show a one-line `[80-COLUMN ANSI SCREEN - SKIPPED]`
   or a `.seq` placeholder. Never emit smeared art.
4. **Tooling**: extend `dev/scripts/convert-to-petscii.ts` into a real authoring helper
   (ANSI text -> 40-col .seq with color-code mapping via the truecolor->VIC nearest-match from
   Task 4), so sysops can batch-generate first-draft .seq from existing text screens.

## Phase 3 — TS/blessed doors (Class C, the flagship challenge)

Two independent mechanisms; both keyed off door session geometry, no per-door forks of the SDK:

1. **SDK compact mode.** The blessed engine (sdk/engines/ui) gets a `compact` profile activated
   when `cols < 80`: masthead/footer collapse to one line, list widgets drop columns
   (name-only + detail-on-select instead of wide tables), dialogs clamp to `cols-2`, borders
   optional (border eats 2 of 40 columns — default borderless at 40). Widgets already flow
   through shared theme/layout tokens (single-source rule) — compact is a token set + per-widget
   layout branch, not a rewrite. Doors that read `getTerminalSize()` honestly then work unchanged
   or nearly.
2. **ANSI->PETSCII door bridge (real C64s).** Blessed emits VT/ANSI; a real C64 speaks PETSCII.
   Build `AnsiToPetsciiStream` in the backend door output path (petsciiMode + terminalType='c64'):
   parse the door's ANSI stream (Task 4's `convertUnicodePuaToPetscii` ANSI parser is ~70% of it:
   SGR->color bytes incl. truecolor nearest-VIC, CUP->home+moves, ED->$93, reverse->$12/$92),
   plus: cursor-position deltas tracked against a 40x25 model so absolute addressing stays exact,
   charset prelude, and CP437/Unicode glyph -> nearest PETSCII graphic table (small, ~64 entries:
   blocks, box-drawing -> PETSCII line graphics). Web simulation needs nothing: PetsciiCanvas is
   fed by the same bytes, so ONE bridge serves both.
   - Blessed full-screen repaints are chatty; the bridge should coalesce (the door SDK's
     differential rendering for slow links already exists — reuse `modemEmulationEnabled` path).
3. **Per-door triage** (from Phase 0 census), in priority order the user sets. Expected buckets:
   - Adapt properly: who-is-online, bug-tracker, doors-menu, oneliner-type doors (list/text shaped).
   - Compact-mode-only: door-manager, theme-picker.
   - Gate at 40: sprite/ansi editors, grandmaster, rip-browser (canvas/80-col by nature) —
     door launcher checks a `minWidth` field in the door registration (.info tooltype
     `MIN_COLUMNS=80`, default 40-ok absent) and prints a clean uppercase notice:
     `THIS DOOR NEEDS AN 80 COLUMN SCREEN`.
4. **DoorInputManager**: C64 input path drops cursor/F-key bytes today (Task 9 limitation) —
   extend `convertPetsciiInputToAscii` to translate $11/$91/$1D/$9D -> ANSI arrow sequences so
   list navigation works from a real C64.

## Phase 4 — 68K + AREXX doors (Class D) — REVISED (user, 2026-09-02)

**Ruling: blanket gate.** ALL 68K binary doors default to `MIN_COLUMNS=80` — no per-door
classification effort, no dropfile 40-col plumbing, no ANSI->PETSCII bridge work for 68K at
launch. C64 callers see the clean `THIS DOOR NEEDS AN 80 COLUMN SCREEN` notice; door lists mark
what is 40-ok. A sysop can still opt an individual 68K door in via its `.info` tooltype if one
proves to work.

Coverage for C64 callers comes from the OTHER two tracks instead:
1. **Built-in TS doors adapted responsive** (Phase 3): who-is-online, bug-tracker, doors-menu,
   door-manager, theme-picker + the rest of the compact-possible set — these are the built-in
   equivalents of the classic utility doors, and they get the XXS=40 tier properly.
2. **Rewrite track:** a critical 68K door with NO built-in equivalent gets rewritten as a
   responsive TS/blessed door (inherits 40/80 tiers, web canvas, bridge, themes, express.e-parity
   discipline). Sysop names candidates from the door census; each rewrite is its own small plan
   (create-door skill + behavior parity against the 68K original).

AREXX doors: output already flows through emitText, so the Phase 1 wrapper covers them; gate any
AREXX door that draws full-screen (same MIN_COLUMNS mechanism).

## Phase 5 — Verification

- Automated: per-surface 40-col snapshot tests (no line > 40, tables aligned); bridge round-trip
  tests (blessed frame -> PETSCII bytes -> PetsciiMachine state assertions — the machine from
  Task 7 doubles as the test oracle, which is exactly what it was built for).
- Manual script for the sysop: real-C64-path telnet run (SyncTERM C64 mode or CGTerm) through:
  login (DEL probe), menu, file list, mail read, one adapted door, one gated door, logoff.

## Decisions (user, 2026-09-02)

1. Door priority: list/text doors first (who-is-online, bug-tracker, doors-menu style), then
   door-manager + theme-picker. Games are NOT a target — a C64 can't play them; gate them.
   Confirmed direction: doors support 40/80 via responsive tiers (new XXS=40 breakpoint in the
   blessed SDK, responsive on by default), not hardcoded dual layouts.
2. .seq art: the sysop commissions/makes the native 40x25 screens. Code side only guarantees the
   (already-shipped) .seq-first resolution; the convert-to-petscii tooling upgrade is optional
   assist, not the source of final art.
3. Gate list: approved — needs-80 doors (55) get MIN_COLUMNS gating + clean uppercase notice;
   door lists mark 40-ok doors.
4. Phase order: content first (Phases 1-2), ANSI->PETSCII bridge afterwards as its own effort.
5. Real-C64 door input (cursor/F-keys): follow-up — lands with the bridge phase (core BBS is
   line-based and already works from C64 hardware).

> Status: decisions complete. Ready for task-level breakdown (writing-plans pass) whenever the
> PETSCII overhaul branch has landed.

## Explicitly out of scope

- Squeezing 80-col ANSI art to 40 (always wrong).
- C128 80-col PETSCII mode (port design already leaves room; separate plan).
- Editing 68K binaries.

## Layout rule (user, 2026-09-02) — binding for all 40-col work

**Non-C64 platforms never pay for C64 support.** No shared text, table, or screen is
authored to the lowest common denominator. Every 40-column concern lives in a
petsciiMode-only branch (the wrapForSession choke point, the 40-col table formatters, the
XXS tier) — the 80-column path stays byte-identical (already the implementation plan's
non-negotiable (b)). Where the session mode is not yet known (the pre-login graphics prompt,
shown only to callers that TTYPE/port did not already identify as C64), the 80-column layout
wins; C64-identified callers skip that prompt entirely, and a slow-typing WiFi-modem C64
sees the short DEL line first and only the ANSI question wraps.
