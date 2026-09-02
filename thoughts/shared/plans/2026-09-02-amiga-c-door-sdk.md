---
date: 2026-09-02
topic: Porting the useful subset of the TypeScript door SDK to C for 68K Amiga doors
tags: [sdk, 68k, amiga, c, doors, vbcc, aedoor, xim, planning]
status: draft
---

# A C door SDK for the Amiga

## What this answers

"How much work is it to port the SDK to Amiga in C? It would be so cool if the
Amiga doors we write could use the SDK as well. I fully understand that not all
feats like audio etc can be ported to the Amiga though as it has to work via
telnet."

The answer, up front: **not the SDK. A measured subset of it, about 6,200 lines
of C plus 3,800 of tests, 24 to 35 working days, and a little over half of that
C has already been written once by hand inside `examples/doorrepo-c/` and needs
promoting to a library rather than inventing.** The first three phases, 13 to 19
days, already get a C door to "draws a bordered list and reads a key". The
estimate has one dependency that must be measured before phase 2 is designed,
and one decision that only the sysop can make. Both are named at the end.

Nothing in this document is a guess about what doors need. Every number below
came out of a command run against this worktree.

---

## 1. What the doors actually use

37 directories under `Doors/` contain TypeScript source (excluding
`node_modules/` and `dist/`), 647 `.ts` files, measured by
`find Doors -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*'`.
Those doors resolve the SDK through `"@amiexpress/bbs-door-sdk": "file:../../sdk"`
in 36 of 37 `package.json` files (one, `sdk/examples`, uses `file:../..`), which
npm materialises as a symlink: `Doors/theme-picker/node_modules/@amiexpress/bbs-door-sdk -> ../../../../sdk`.

### 1.1 SDK modules, by number of doors importing them

| Doors | Module |
|---:|---|
| 35 | `@amiexpress/bbs-door-sdk` (package root: `CoreDoor`, `ServerDoor`, `DoorContext`) |
| 27 | `.../engines/ui/blessed` |
| 23 | `.../utils/blessed-helpers` |
| 15 | `.../engines/ui/theme` |
| 15 | `.../client` (browser-side half of a door) |
| 10 | `.../utils/terminal-mode` |
| 9 | `.../settings` |
| 9 | `.../engines/ui/arcade` |
| 5 | `.../utils/door-input-manager` |
| 4 | `.../utils/gamepad-input-manager` |
| 3 | `.../engines/graphics/cell-art` |
| 2 | `.../petscii`, `.../utils/DoorLoader`, `.../engines/graphics/motion-trail` |
| 1 each | `wasm-loader`, `ncurses`, `ansi-editor/core/file-ops`, `network/network-engine`, `graphics/subcell`, `graphics/braille-graphics`, `audio/audio-engine`, `core/types` |

### 1.2 The ranked API surface

Two columns: how many of the 37 doors use the call at all, and how many call
sites. Both were produced by parsing every `.ts` file's import clauses and
method calls; `console.log` was excluded from the `.log()` count and the
receiver of every method was recorded so that Set/Map methods could be
separated from widget methods.

| # | SDK call | Doors | Call sites | Notes |
|---:|---|---:|---:|---|
| 1 | `screen.render()` | 29 | 817 | 616 of the call sites have the literal receiver `screen` |
| 2 | `element.destroy()` | 30 | 421 | |
| 3 | `element.setContent()` | 26 | 279 | the single most-used mutator |
| 4 | `DoorInputManager` (`.enable()` / `.disable()`) | 25 / 24 | 26 / 26 | 11 doors import it from `blessed-helpers`, 4 from `utils/door-input-manager` |
| 5 | `DoorContext` (type) | 23 | — | the shape a door's entry point receives |
| 6 | `createScreen()` / `new Screen()` | 19 | 67 | 15 import `createScreen` from `blessed-helpers`, 9 import `Screen` from the engine |
| 7 | `screen.key(...)` | 18 | 246 | 102 sites are literally `screen.key` |
| 8 | `createBox()` / `new Box()` | 17 | 253 | by far the most-constructed widget |
| 9 | `element.focus()` | 17 | 218 | |
| 10 | `ServerDoor` | 16 | — | |
| 11 | `themeStyles()` and `themeById()` | 15 | — | plus `Theme` type in 13, `ThemeStyles` in 12, `ThemeTokens` in 11 |
| 12 | `createList()` / `new List()` | 11 | 42 | |
| 13 | `createTerminalModeSwitch()` | 10 | — | `TerminalModeSwitch` type in 7 |
| 14 | `CoreDoor` | 10 | — | |
| 15 | `createTextbox()` / `new Textbox()` | 8 | 15 | |
| 16 | `list.setItems()` / `list.select()` | 8 / 8 | 27 / 21 | |
| 17 | `element.hide()` / `element.show()` | 7 / 7 | 120 / 116 | |
| 18 | `bbs.write()` | 7 | 19 | the only direct prose-output call with more than 4 users |
| 19 | `resolveDoorRoot()` (settings) | 6 | — | `readDoorSettingOverrides` in 3 |
| 20 | `textbox.getValue()` | 6 | 29 | `setValue` 4 doors, `clearValue` 2 |
| 21 | `element.setLabel()` | 5 | 58 | |
| 22 | `element.setFront()` | 5 | 42 | z-order |
| 23 | `getCompactProfile()` | 5 | — | `effectsAllowed()` in 4 |
| 24 | `attachMasthead()` | 5 | — | `footerHints` / `footerStyle` in 4, `attachGlitches` in 2 |
| 25 | `ConfirmModal` / `DocModal` / `DockablePanel` | 4 / 4 / 4 | 27 / 18 / 10 | |
| 26 | `createText()` / `new Text()` | 4 | 19 | |
| 27 | `screen.unkey()` | 6 | 46 | |
| 28 | `createButton()` / `new Button()` | 3 | 16 | |
| 29 | `StatusBar` | 3 | 18 | |
| 30 | `ANSIEditor` | 3 | 15 | out of scope, see section 6 |
| 31 | `SfxCues` (arcade) | 9 | — | audio cue table, out of scope |
| 32 | `ClientDoor` (browser half) | 6 | — | out of scope |

Everything below three doors is a single-door dependency and does not belong in
a shared C library.

**The result that should shape the whole plan: the classic `ctx.output.*` /
`ctx.input.*` API that `sdk/core/types.ts:767-847` defines is almost dead.**
Measured across all 37 doors: `ctx.output.writeLine` 4 doors / 6 calls,
`ctx.storage.load` 2 doors, `ctx.storage.save` 2 doors, `ctx.input.*` **zero
doors**. Doors do not write lines and read keys; they build a widget tree and
render it. A C SDK that ports `OutputAPI` and `InputAPI` would be a faithful
port of the part nobody calls.

### 1.3 Which doors could actually run on this C SDK

Classifying each door by whether it imports anything with no 68K analogue
(`client`, `engines/audio`, `engines/network`, `engines/graphics/cell-art`,
`engines/ui/arcade`, `petscii`, `ansi-editor`):

**17 of 37 doors are in the expressible class**: `bbs-dashboard`, `bbslink`,
`bbslinkwall`, `bug-tracker`, `door-manager`, `doors-menu`, `dopewars`,
`header-dropdown-demo`, `ncurses-pong`, `prompt-complete`, `rip-browser`,
`scrollwars`, `telnet`, `telnet-front`, `theme-picker`, `whip`,
`widget-shadow-demo`. (`rip-browser` is a false positive of the classifier — it
drives RIP graphics through the frontend and belongs with the 20.)

**20 are not**, and the reason for each is: audio and a browser half (the ten
arcade games), socket.io multiplayer (`card-lobby`, `grandmaster`), the ANSI
editor (`ansi-editor`, `mail-composer`, `sprite-editor`), PETSCII
(`ami-stripper`, `phreakwars`), a browser client (`voice-chat`,
`neo-blessed-showcase`).

So a C SDK serves roughly half the door catalogue by count, and the half it
serves is the half a 2400-baud caller can use anyway.

---

## 2. What already exists on the 68K side

There are two separate 68K C code bases in this tree and they do not agree.

### 2.1 `examples/doorrepo-c/` — working, tested, maintained

Measured with `wc -l` on every `.c` and `.h`:

| Group | Lines |
|---|---:|
| Reusable infrastructure (`aedoor`, `ansi`, `shell`, `dirlist`, `netio`, `config`) | 2,815 |
| Door-specific logic (`doorrepo.c`, `flow`, `http`, `json_lite`, `guide`, `md5`, `sha256`, `listtxt`, `owner_auth`, `infocache`) | 15,941 |
| **All top-level `.c` + `.h`** | **18,756** |
| `tests/` + `tools/` | 10,590 |
| **Whole directory** | **29,346 lines of C** |

Test-to-source ratio 0.56:1. The tests run natively against
`aedoor_native.c`, with a real local stub HTTP server
(`examples/doorrepo-c/tests/stub_server.c`, 377 lines) rather than mocks — no
emulator required for the unit suite.

**The core that any door needs is 1,370 lines**: `aedoor.h` (170) +
`aedoor_amiga.c` (513) + `aedoor_native.c` (278) + `ansi.h` (117) + `ansi.c`
(292). That is the entire cost of "a C door that talks to AmiExpress and paints
a full-screen ANSI UI".

**The BBS surface is 11 functions**, all in `examples/doorrepo-c/aedoor.h`:
`ae_start` (:44), `ae_put` (:66), `ae_get` (:72), `ae_key` (:76),
`ae_input_pending` (:98), `ae_delay_ticks` (:111), `ae_check` (:119),
`ae_raw_arrows` (:136), `ae_return_command` (:160), `ae_shutdown` (:162),
`ae_fatal` (:168).

**It reads no user data at all.** There is no call for name, level, conference
or time. The only identity the door receives is the node number from `argv[1]`
(`examples/doorrepo-c/doorrepo.c:7799-7803`; protocol note at
`examples/doorrepo-c/aedoor.h:40-42`, citing `express.e:4308`). Adding user
identity is new work, and small — see 2.3.

**`ansi.c` already is the widget primitive layer.** Its own header says so:

> "Exists so doorrepo.c can render the same full-screen layout DOORMAN (the
> TypeScript door, `Doors/door-manager/app.ts`) renders with blessed, without a
> TUI library that could not exist on a real Amiga."
> — `examples/doorrepo-c/ansi.h:3-5`

> "Colours match DOORMAN panel for panel: white-on-blue header and footer bars,
> a cyan-bordered list, a blue-bordered info pane, and a white-on-blue selected
> row."
> — `examples/doorrepo-c/ansi.h:20-22`

Its 13 functions (`ansi_begin`, `ansi_flush`, `ansi_clear`, `ansi_goto`,
`ansi_color`, `ansi_reset`, `ansi_cursor`, `ansi_text`, `ansi_text_raw`,
`ansi_fill`, `ansi_box`, `ansi_panel`, `ansi_center`) are the C equivalents of
what `createBox` and `setContent` do, and they are 409 lines rather than
blessed's 3,679-line `element.ts` because they are immediate-mode.

**Above that sits an unpromoted widget layer.** `doorrepo.c` contains 40
functions named `ui_*` totalling **1,946 lines** — masthead, footer with hint
priority, list with selection and scroll bar, detail pane with word wrap, notice
overlay, help screen, geometry. `ui_compute_geometry` even carries the
TypeScript layout constant: `/* 35% of the width, matching DoormanLayout's
listPanel. */` (`examples/doorrepo-c/doorrepo.c:1667`). This is the C SDK's
widget set, written once, welded to one door.

Build (`examples/doorrepo-c/Makefile:44-45, 62, 135-141`):

    VBCC ?= /opt/homebrew/Cellar/vbcc/0.9hp3
    AMIGA_CFLAGS = +aos68k -c99 -I"$(VBCC)/targets/m68k-amigaos/include"
    $(VC) $(AMIGA_CFLAGS) -DAMIGA -I$(AMIGA_NDK_SHIM) -I"$(AMIGA_NETINCLUDE_DIR)" -I"$(NDK)" $(AMIGA_SOURCES) -lauto -o $@

Output `doorrepo.amiga`, **121,608 bytes** (`examples/doorrepo-c/package-for-amiga.sh:45`).
`-c99` is a vbcc flag name, not a language level — the source is strict C89
(`examples/doorrepo-c/Makefile:28-30`). Platform split is by file selection, not
`#ifdef`: `aedoor_amiga.c` / `aedoor_native.c`, `shell_amiga.c` /
`shell_native.c`, `dirlist_amiga.c` / `dirlist_native.c`
(`examples/doorrepo-c/Makefile:103-107`). `netio.c` is the only file allowed to
contain `#ifdef AMIGA` (`examples/doorrepo-c/netio.h:3-6`).

### 2.2 `sdk/68k/` — a December 2025 snapshot that has drifted

Toolchain is vbcc and only vbcc: *"vbcc is the only supported compiler for 68K
door development"* (`sdk/68k/BUILD_GUIDE.md:276`); *"GCC support has been
completely removed due to unfixable entry point and library corruption issues"*
(`sdk/68k/VBCC_MIGRATION.md:280`). Flags at `sdk/68k/Makefile:12-13`:

    CFLAGS  := +aos68k -c99 -O2 -speed -cpu=68000 -I$(NDK_INCLUDES)
    LDFLAGS := +aos68k -lamiga -lvc

Note these differ from doorrepo-c's (`-lamiga -lvc` vs `-lauto`, a different
vbcc install path, a different NDK).

`sdk/68k/includes/amiexpress.h` (350 lines) is the existing AEDoor C header: 158
`#define`s and 77 prototypes, including the `DT_*` user-data codes
(`:70-111`, e.g. `DT_NAME 100`, `DT_SECSTATUS 105`, `DT_LINELENGTH 122`) and the
`BB_*` codes (`:121-141`). `sdk/68k/ndk-includes/` is 687 vendored NDK headers,
69,719 lines, with **zero** AEDoor references — every AEDoor call in this SDK
goes through a hand-written assembly wrapper (`sdk/68k/src/writestr.asm`, 28
lines, three `jsr -NN(a6)` stubs).

What must be known before anyone reuses it:

- **`sdk/68k/src/glue.c` (337 lines) is stubs.** Only `Register`, `ShutDown` and
  `sendmessage` reach the library. Verified at `sdk/68k/src/glue.c:131-167`:
  `lineinput()` sets `buffer[0]='\0'` with the comment `/* TODO: Actually read
  input */`; `getkey()` returns `'\0'`; `getlevel()` returns `100`; `getname()`
  does `strcpy(buffer, "TestUser")`; `getbbsname()` returns
  `"AmiExpress Web BBS"`. Every test door built with `make door` links these, so
  their `[PASS]` output for user data is testing a `strcpy`.
- **The LVO documentation is wrong for 15 of 20 slots.** `sdk/68k/AEDOOR_LVO_MAP.md`
  and `AEDOOR_LVO_IMPLEMENTATION.md` were last touched 2025-12-17 and name -42
  `SetNodeData`, -78 `GetUserName`, -126 `CopyLocationString` and so on. The
  live table is `web/backend/src/amiga-emulation/api/library-vectors/aedoor-vectors.ts`,
  where -42 is `SendCmd` (:78-79), -78 is `Prompt` (:120-121), -126 is `HotKey`
  (:176-177). Both docs claim "27 LVOs"; there are 24 documented and 20 trapped.
  The one artefact in `sdk/68k/` whose LVO table matches reality is
  `sdk/68k/templates/minimal.asm:36-56`.
- `sdk/68k/build-all-test-doors.sh:134` calls `make install-door`, a target that
  does not exist in `sdk/68k/Makefile`.
- `sdk/68k/templates/Makefile.vbcc:5,13` still defaults to host `gcc` and copies
  glue from a path `VBCC_MIGRATION.md:11-12` says was deleted; `sdk/68k/scripts/create-door.sh:30`
  copies that template into every new door.
- Exactly **one** 68K C door is registered and reachable on this board:
  `Commands/BBSCmd/FILETEST.info` -> `Doors/FILE-OPS-TEST`. A second registration,
  `INTDEMO.info`, points at a directory that does not exist.

The parts of `sdk/68k/` still worth keeping: the vbcc flags, the `DT_*`/`BB_*`
constant tables in `amiexpress.h`, `writestr.asm`'s three offsets,
`templates/minimal.asm`'s LVO map, and the BBSInfo structure offsets derived
from disassembly (`sdk/68k/BBSINFO_FIX_FINAL.md:29-44`, which still match live
`AEDoorLibrary.ts:33-41`).

### 2.3 What the backend already answers that no C door asks

The emulator implements 20 AEDoor traps
(`web/backend/src/amiga-emulation/api/library-vectors/aedoor-vectors.ts`) and
the full `DT_*` / `BB_*` query set in
`web/backend/src/amiga-emulation/xim/data-query.ts` and `xim/bbs-info.ts`. Two
that matter and that `doorrepo-c` never calls:

- `BB_SCRWIDTH` (520) returns the live terminal width via `doorScreenWidth()`
  (`web/backend/src/amiga-emulation/xim/bbs-info.ts:376-381`) — the same single
  source of truth `createScreen` reads for TypeScript doors
  (`web/backend/src/doors/BBSApi.ts:237-257`). `BB_SCRHEIGHT` (521) at
  `bbs-info.ts:383-391`.
- `DT_LINELENGTH` (122) is **screen height, not width** — `express.e:3653-3660`,
  quoted at `web/backend/src/amiga-emulation/xim/data-query.ts:340-342`. Getting
  this backwards is the JoinCnf pagination bug in the memory notes.

So a C door *can* be responsive; nothing has asked yet.

---

## 3. The hard constraints

Every one of these is enforced by code in this tree, not by convention.

**3.1 The door memory region is 500 KB and it is fatal.**
`web/backend/src/amiga-emulation/memory-map.ts:79-84`:

> "First address a door's hunks may NOT occupy. Gives a door `0x2000-0x7f000`,
> i.e. 500 KB of CODE + DATA + BSS"

with `DOOR_SEGMENT_LIMIT = EXEC_BASE_ADDR - EXEC_LVO_TABLE_BYTES`
(`:84`, `EXEC_BASE_ADDR = 0x080000` at `:44`, `EXEC_LVO_TABLE_BYTES = 0x1000` at
`:76`). The file's own header explains why it is not merely a warning
(`memory-map.ts:10-24`): `HUNK_BSS` is zeroed at load, so an oversized door
blanks exec.library's LVO table and ExecBase before its first instruction, and
the caller sees "the door exits RETURN_FAIL for no visible reason".
`assertDoorSegmentsFit` (`memory-map.ts:160`, called from
`DoorLoader.ts:269`) turns that into a named load error.

The margin is not theoretical. Measured 2026-08-31 and recorded in
`.claude/skills/shrinkler-door-releases/SKILL.md:32-36`:

    DoorRepo plain      464 KB needed   loads, runs
    DoorRepo crunched   513 KB needed   REFUSED - DoorTooLargeError

DoorRepo, at 18,756 lines, is already within 36 KB of the ceiling. Also
`examples/doorrepo-c/dirlist.h:34-38` states its static data is "within ~80 KB
of the ceiling the emulator enforces". A shared C SDK linked into every door
spends part of that budget in every door.

**3.2 The stack is 8 KB, declared in the door's icon.** Cited as a design
constraint in four places: `examples/doorrepo-c/http.c:29-33` (the 32 KB body
buffer is `static`, not automatic), `doorrepo.c:126-128`, `infocache.h:16-18`
("no malloc: this is a C89 door with a declared 8 KB stack, and everything large
in it is static"), `guide.h:27`. DoorRepo makes exactly **one** heap allocation
for the whole program (`doorrepo.c:132`). A C SDK must therefore be
caller-owns-storage throughout: no `malloc` inside the library, no widget
constructors that allocate.

**3.3 Bytes are milliseconds.** `handoff.md:72`: *"Bytes are milliseconds in a
68K door — ~45 ms per 198-byte XIM message. Never send a colour already set, or
pad rows on a cleared screen."* `WriteStr` chunks at 198 bytes
(`web/backend/src/amiga-emulation/api/AEDoorLibrary.ts:53, 633-663`).

This is the constraint that decides the widget architecture. `ansi.h:7-12`
records that the first DoorRepo renderer cost "roughly a hundred XIM message
round trips per frame and was visibly slow to redraw on every keystroke"; the
fix was one frame, one buffer, one `ae_put`. `ansi_color` then suppresses
redundant colour sequences — "19 of 25 colour sequences in one screen paint
asked for the colour already in effect" (`ansi.h:54-58`). And even that was not
enough: `ui_draw_list` takes `only_row_a` / `only_row_b` so a cursor move
repaints two rows (`doorrepo.c:1971-1974, 5219-5221`).

Arithmetic that has to be checked before phase 2 is designed: a full 80x24 ANSI
frame with colour changes is roughly 4-6 KB, which is 20-30 chunks, which at
45 ms is 0.9-1.4 s per keystroke. **If that figure is right, differential
redraw is not an optimisation in the C SDK, it is the architecture.** See
section 7 — this is the single number that most needs measuring.

**3.4 Eight colours, ASCII box drawing, no Unicode.**
`examples/doorrepo-c/ansi.h:36-43` defines exactly `ANSI_BLACK`..`ANSI_WHITE` =
0..7, values being CSI foreground numbers minus 30. `ansi.h:24-27`: box drawing
is `+ - |` because "on a real Amiga the terminal is topaz-8 in a Latin-1 world,
where a multi-byte U+2500 renders as mojibake".
`examples/doorrepo-c/design/README.txt:35-38, 44-47`: eight colours plus bold,
no 256-colour, no RGB; CP437 single-byte high-bit characters are available, UTF-8
is not. The TypeScript themes are hex strings for xterm.js
(`sdk/engines/ui/theme/tokens.ts:22-25`), and `tokens.ts:25-27` already concedes
the point: *"These themes are for TypeScript doors on the web board; a 68K door
draws its own ANSI and is not affected by any of this."*

**3.5 80x25, no mouse.** The board's own contract:
`.claude/skills/door-three-screens/SKILL.md:13-17` gives fixed Amiga ANSI as
80x25 (blessed uses 80x24), responsive as anything wider, and C64 PETSCII as
exactly 40x25. `createScreen` calls `screen.enableMouse()` and
`screen.enableMouseToggle()` unconditionally
(`sdk/utils/blessed-helpers.ts:1008-1012`) and 8 doors call `.hide()`/`.show()`
in mouse handlers; none of that exists for a telnet caller on a real Amiga.
There is no mouse in the C API.

**3.6 The SDK symlink has no Amiga analogue.** A TypeScript door resolves the
SDK through `file:../../sdk` in `package.json`, materialised as
`Doors/<door>/node_modules/@amiexpress/bbs-door-sdk -> ../../../../sdk`. A C
door has no package manager and no module resolution; it has `-I` and a `.o`
list in a Makefile. The C SDK is therefore a source library that each door's
Makefile compiles alongside its own sources, exactly as
`examples/doorrepo-c/Makefile:103-107` already lists `CORE_SOURCES`. That also
means a change to the C SDK does not reach a shipped door until that door is
rebuilt, which is the opposite of the TypeScript side, where the SDK is shared
in process.

**3.7 Registration.** `handoff.md:88-91`: *"A door is its REGISTRATION"* — the
rules live in `web/backend/src/doors/door-registration-paths.ts` and the shared
case table `examples/doorrepo-c/tests/delete-rule-cases.txt`, and there is
already one C copy of them (`examples/doorrepo-c/flow.c`). Whatever the C SDK
does about `.info` files must read the same table, not a second hand-written
copy.

---

## 4. The C API

Design decision, stated before the signatures because it is the one that keeps
the library small: **the C SDK is immediate-mode, not retained-mode.**

blessed's retained widget tree costs `element.ts` 3,679 lines + `screen.ts`
2,956 + `program.ts` 1,788 + `colors.ts` 1,023 = 9,446 lines of core, and it
exists to serve mouse hit-testing, arbitrary z-order, focus chains, percentage
geometry, a tag parser and 256-colour mapping. Doors use `setFront` in 5 doors
and `detach` in 3; they use `setContent` in 26. An immediate-mode painter — a
plain state struct per widget plus a paint function — drops nearly all of that,
and it is what `doorrepo.c`'s `ui_*` layer already is. Keeping the same shape
means the 1,946 lines already written can be lifted rather than rewritten.

Proposed layout, alongside the existing SDK:

    sdk/c/
      aedoor.h  aedoor_amiga.c  aedoor_native.c    session, output, input
      ansi.h    ansi.c                             ANSI painter (lifted verbatim)
      ui.h      ui_screen.c ui_list.c ui_input.c   widgets
                ui_chrome.c ui_dialog.c
      theme.h   theme.c                            8-colour theme tokens
      layout.h  layout.c                           responsive profile, string utils
      settings.h settings.c                        door settings (JSON)
      tests/                                       native-backend unit tests

### 4.1 Session and user

```c
typedef struct ae_session ae_session;   /* opaque; caller supplies storage */

int  ae_open(ae_session *s, void *storage, long cap, int node);  /* node from argv[1] */
void ae_close(ae_session *s);            /* JH_SHUTDOWN then exit(0) */
void ae_fatal(ae_session *s, int code);
int  ae_carrier(const ae_session *s);    /* 0 once any round trip saw Data == -1 */

/* User identity. Each is one DT_* round trip; the caller owns `out`. */
int  ae_user_name    (ae_session *s, char *out, int n);  /* DT_NAME       100 */
int  ae_user_location(ae_session *s, char *out, int n);  /* DT_LOCATION   102 */
int  ae_user_level   (ae_session *s);                    /* DT_SECSTATUS  105 */
int  ae_user_time_left(ae_session *s);                   /* DT_TIMELIMIT  115 */
int  ae_user_is_ansi (ae_session *s);                    /* DT_ISANSI     123 */

/* Geometry. */
int  ae_screen_cols(ae_session *s);      /* BB_SCRWIDTH  520 */
int  ae_screen_rows(ae_session *s);      /* BB_SCRHEIGHT 521 */
int  ae_conference (ae_session *s);      /* BB_CONFNUM   510 */
```

`ae_open` replaces `ae_start` and takes caller storage, because the current
`aedoor_amiga.c` keeps a `static` `struct JHMessage`
(`examples/doorrepo-c/aedoor_amiga.c:199-204`) and a library cannot own global
state if two subsystems in one door both talk to the BBS. The 264-byte
allocation rule and its compile-time guard
(`examples/doorrepo-c/aedoor_amiga.c:69-77, 109`) move into the library
unchanged.

Nothing in the TypeScript `DoorContext` maps to `nodeId` differently; `ctx.user`
is used by 3 doors and `ctx.nodeId` by 2, so this list is generous, not thin.

### 4.2 Output

Lifted from `examples/doorrepo-c/ansi.h` without change, plus a screen owner:

```c
typedef struct { int rows, cols; ansi_buf buf; const ui_theme *theme; } ui_screen;

int  ui_screen_open (ui_screen *sc, ae_session *s, char *frame, long cap);
void ui_screen_flush(ui_screen *sc);        /* one ae_put per frame */
void ui_screen_close(ui_screen *sc);        /* reset attributes, show cursor */

/* the 13 ansi_* primitives, unchanged: ansi_clear/goto/color/reset/cursor/
   text/text_raw/fill/box/panel/center/begin/flush */
```

`ui_screen_flush` is the C `screen.render()` — the #1 call in the ranked table,
29 doors and 817 sites. `ansi_text` is `setContent` (#3, 26 doors): it truncates
and space-pads to a width, so a row overwrites what was under it without a
clearing pass (`examples/doorrepo-c/ansi.h:88-90`).

**Not expressible, and what replaces it:** blessed's `{bold}{cyan-fg}` tag
markup and `colors.ts`'s 256-colour name mapping have no C form at eight
colours. The replacement is explicit `ansi_color(buf, fg, bg, bold)` calls with
theme token indices. `element.setFront()` (5 doors) has no z-order to
manipulate; paint order is the z-order and a dialog is painted last.
`element.hide()`/`show()` (7 doors) become "do not call the paint function".

### 4.3 Input

```c
int  ae_key(ae_session *s);              /* blocking; 0-255, or -1 on carrier loss */
int  ae_key_pending(ae_session *s);      /* non-consuming */
void ae_raw_arrows(ae_session *s, int on);
int  ae_line(ae_session *s, char *buf, int max);   /* JH_LI, no prompt */

/* Decoded keys, so a door switches on a name rather than an escape sequence. */
enum { UI_KEY_UP = 256, UI_KEY_DOWN, UI_KEY_LEFT, UI_KEY_RIGHT,
       UI_KEY_PGUP, UI_KEY_PGDN, UI_KEY_HOME, UI_KEY_END,
       UI_KEY_ENTER, UI_KEY_ESC, UI_KEY_TAB, UI_KEY_BACKSPACE };
int  ui_key_read(ae_session *s);         /* ae_key + CSI decoding */
```

`ui_key_read` is what replaces `screen.key('up', fn)` — the #7 call, 18 doors and
246 sites. The TypeScript form binds a closure to a key name and blessed
dispatches; C has no closures worth the bookkeeping, so the door writes a
`switch` in its own loop and the widgets return whether they consumed the key.
`DoorInputManager` (#4, 25 doors) exists to solve lifecycle problems that do not
occur here — grabbing keys, mouse, game mode, cleanup on destroy
(`sdk/utils/door-input-manager.ts:5-10`) — so it has no C counterpart. The one part
worth keeping is that `ae_raw_arrows` must be turned back off before exit.

### 4.4 Layout and theme

Ported from `sdk/engines/ui/blessed/core/responsive-constants.ts` (248 lines)
and `sdk/engines/ui/theme/tokens.ts` (331 lines):

```c
typedef struct { int borders, single_column, collapse_chrome, gap, padding; } ui_profile;
void ui_profile_for(int cols, ui_profile *out);   /* getCompactProfile */
int  ui_is_compact(int cols);                     /* isCompactWidth  (< 40-col tier) */
int  ui_effects_allowed(int cols);                /* effectsAllowed */
int  ui_dialog_width(int cols);                   /* calculateDialogWidth */

typedef struct {
    unsigned char ground, ink, chrome, dim, bar, bar_ink,
                  accent, accent_alt, sel_bg, sel_ink, ok, warn, alert;  /* 0-7 */
    int border;              /* UI_BORDER_LINE | UI_BORDER_NONE */
    const char *rail;        /* ASCII branding mark; may be "" */
} ui_theme;

const ui_theme *ui_theme_by_id(const char *id);   /* themeById */
```

`themeStyles()`/`themeById()` are #11 in the ranked table, 15 doors. The 13
token names are exactly `ThemeTokens` (`sdk/engines/ui/theme/tokens.ts:36-59`),
so the two implementations describe the same roles. What cannot be ported is the
`hex` half of the palette: `CLASSIC` uses blessed colour names and the other six
themes use hex (`tokens.ts:22-25`). C gets `CLASSIC` faithfully and each other
theme reduced to its nearest 8-colour form, or it gets `CLASSIC` only — see
section 8, the decision.

`Theme.border: 'double'` also goes: `ansi_box` draws `+ - |`
(`examples/doorrepo-c/ansi.h:24-27`), so `double` degrades to `line`.

### 4.5 Widgets

Named from the usage counts in 1.2, and nothing else is in scope.

```c
/* Panel — createBox/new Box, 17 doors, 253 constructions. Already exists as
   ansi_box/ansi_panel; the SDK wrapper adds theme colours and focus. */
void ui_panel(ui_screen *sc, int top, int left, int h, int w,
              const char *label, int focused);

/* List — createList/new List, 11 doors; setItems 8, select 8. */
typedef struct {
    int top, left, h, w;
    unsigned long count, selected, scroll_top;
    const char *(*row)(void *ctx, unsigned long i);   /* pull, never a stored array */
    void *ctx;
    int  show_scrollbar;
} ui_list;
void ui_list_paint    (ui_screen *sc, ui_list *l);
void ui_list_paint_row(ui_screen *sc, ui_list *l, unsigned long i);  /* differential */
int  ui_list_key      (ui_list *l, int key);   /* 1 = consumed, and which rows dirtied */

/* Text input — createTextbox/new Textbox, 8 doors; getValue 6, setValue 4. */
typedef struct { char *buf; int cap, len, cursor; } ui_input;
int  ui_input_key  (ui_input *in, int key);
void ui_input_paint(ui_screen *sc, ui_input *in, int row, int col, int w);

/* Chrome — attachMasthead 5 doors, footerHints/footerStyle 4, StatusBar 3. */
typedef struct { const char *key, *label; int priority; } ui_hint;
void ui_masthead(ui_screen *sc, const char *title, const char *right);
void ui_footer  (ui_screen *sc, const ui_hint *hints, int n);   /* drops by priority */
void ui_status  (ui_screen *sc, const char *text);

/* Dialogs — ConfirmModal 4 doors, DocModal 4. These own a key loop and block. */
int  ui_confirm(ui_screen *sc, ae_session *s, const char *title, const char *body);
void ui_doc    (ui_screen *sc, ae_session *s, const char *title, const char *text);
int  ui_prompt (ui_screen *sc, ae_session *s, const char *label, char *buf, int cap);

/* Word wrap / column formatting, used by every list and detail pane. */
int  ui_wrap(const char *text, int width, int (*line)(void *, const char *, int), void *ctx);
void ui_fmt_kb(char *out, unsigned long bytes);
void ui_fmt_ulong(char *out, unsigned long v);
```

`ui_list.row` is a pull callback rather than a stored `char **` because of 3.2:
a listing buffer sized for a large directory would eat a visible fraction of the
memory budget, which is the same reason `dirlist_scan()` is a callback
(`examples/doorrepo-c/dirlist.h:34-38`).

`ui_footer` dropping hints by priority is already implemented at
`examples/doorrepo-c/doorrepo.c:1847-1935`, complete with the rule that a key is
shown only when it applies to the selected row (`:1836-1873`).

**Widgets deliberately not in the C SDK, with their door counts:**
`DockablePanel` (4 doors, 2,985 lines in TypeScript — its whole purpose is
mouse-draggable docking), `Button` (3 doors — a keyboard door has hint keys,
not buttons), `createText` (4 doors — `ansi_text` already is it), `Log` (3
doors), `Table` (1 door), `ProgressBar` (1 door — `leaderProgress` in
`theme/chrome.ts:222` is a one-line string builder), `Form` (2 doors),
`ANSIEditor` (3 doors, 5,038 lines, see section 6).

### 4.6 Settings and storage

```c
int ui_setting_str(const char *door_dir, const char *key, char *out, int n);
int ui_setting_int(const char *door_dir, const char *key, int fallback);
int ui_door_dir   (const char *argv0, char *out, int n);   /* resolveDoorRoot */
```

`resolveDoorRoot` is #19, 6 doors. The TypeScript reader is
`sdk/core/settings.ts` (254 lines) over two JSON files
(`MANIFEST_FILE`, `VALUES_FILE`); `examples/doorrepo-c/json_lite.c` (687 lines)
already parses JSON in C89 and is tested by `tests/test_json_lite.c` (866 lines,
137 assertions). This phase is mostly wiring, not writing.

`ctx.storage.*` is used by 2 doors and is a thin wrapper over the same files; it
is not worth a C API of its own.

### 4.7 A trivial door, both ways

TypeScript, as `Doors/theme-picker/index.ts` and `app.ts` actually do it:

```ts
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { createScreen, createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { themeStyles, themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

const door = new Door({ name: 'Picker', version: '1.0.0', author: 'AmiExpress' });

door.onStart(async (ctx: any) => {
  const s = themeStyles(themeById(await ctx.bbs.getTheme()));
  const screen = createScreen(ctx.bbs, { title: 'PICKER' });
  const header = createBox({ parent: screen, top: 0, height: 1, width: '100%',
                             content: s.accent('PICKER'), style: s.bar, border: undefined });
  const list = createList({ parent: screen, top: 1, bottom: 1, width: '100%',
                            label: ' Items ', style: s.list, keys: true });
  list.setItems(['alpha', 'beta', 'gamma']);
  list.on('select', (_item: any, index: number) => { chose(index); screen.destroy(); });
  list.focus();
  screen.render();
});

export default door;
```

The same door in the proposed C API:

```c
#include "aedoor.h"
#include "ui.h"

static const char *items[] = { "alpha", "beta", "gamma" };
static const char *row(void *ctx, unsigned long i) { (void) ctx; return items[i]; }

int main(int argc, char **argv)
{
    static char session[AE_SESSION_BYTES];
    static char frame[UI_FRAME_BYTES];          /* static: 8 KB stack, see 3.2 */
    ae_session *s = (ae_session *) session;
    ui_screen sc;
    ui_list list;
    int key;

    if (argc < 2 || ae_open(s, session, sizeof session, atoi(argv[1])) != 0) return 20;
    if (ui_screen_open(&sc, s, frame, sizeof frame) != 0) { ae_fatal(s, 20); }
    sc.theme = ui_theme_by_id("classic");

    list.top = 2; list.left = 1; list.h = sc.rows - 3; list.w = sc.cols;
    list.count = 3; list.selected = 0; list.scroll_top = 0;
    list.row = row; list.ctx = 0; list.show_scrollbar = 1;

    ansi_clear(&sc.buf);
    ui_masthead(&sc, "PICKER", 0);
    ui_panel(&sc, list.top - 1, list.left, list.h + 2, list.w, " Items ", 1);
    ui_list_paint(&sc, &list);
    ui_screen_flush(&sc);                       /* one write per frame, see 3.3 */

    for (;;) {
        key = ui_key_read(s);
        if (key < 0 || key == UI_KEY_ESC) break;
        if (key == UI_KEY_ENTER) { chose(list.selected); break; }
        if (ui_list_key(&list, key)) {
            ui_list_paint_row(&sc, &list, list.selected);   /* two rows, not a frame */
            ui_screen_flush(&sc);
        }
    }

    ui_screen_close(&sc);
    ae_close(s);                                 /* JH_SHUTDOWN; never skip */
    return 0;
}
```

Shape differences worth noting rather than hiding: the C door owns its loop and
its storage, there is no `parent:` tree, no percentage geometry, no event
emitter, and repainting is explicit. That is more code for the same screen —
roughly 40 lines against 20 — and it is the honest cost of the constraints in
section 3.

---

## 5. Effort

Sizes are derived from what already exists, not from intuition. The reusable
core of `doorrepo-c` is 1,370 lines and its unpromoted widget layer is 1,946
lines; the TypeScript modules this replaces total 18,302 lines (measured across
`blessed-helpers.ts`, `door-input-manager.ts`, `terminal-mode.ts`,
`core/settings.ts`, the blessed core files, the six widgets in scope, and the
theme directory), so the C:TS ratio for this subset is about 1:3.5.

A working day here means a day of one person writing C89, with tests, against
the doorrepo-c standard (0.56 test lines per source line).

| Phase | What it makes possible | New/lifted C | Tests | Days |
|---|---|---:|---:|---:|
| **0. Library extraction** | `sdk/c/` exists: a door links `aedoor` + `ansi` and paints a frame. Session storage is caller-owned rather than `static`. Native backend and unit suite run without an emulator. `doorrepo-c` is rebuilt against it, byte-identical output. | 1,370 lifted + ~250 new | ~900 | 4-6 |
| **1. Session and geometry** | A door knows who is calling and how wide the terminal is: `ae_user_*`, `ae_screen_cols/rows`, `ae_conference`, and `ui_profile_for` / `ui_effects_allowed`. First time any C door reads user identity. | ~450 | ~350 | 3-4 |
| **2. Widgets** | **A door can draw a bordered list with a scroll bar and a selection, a masthead, a priority footer and a status line, and repaint only what changed.** This is the phase that answers the sysop's question. | ~1,950 (1,946 lifted and generalised + rewrites) | ~1,100 | 6-9 |
| **3. Input and dialogs** | `ui_key_read` decodes arrows and page keys; `ui_input` is a working single-line editor; `ui_confirm`, `ui_prompt` and `ui_doc` block and return. A door can ask a question. | ~900 | ~500 | 4-6 |
| **4. Theme and settings** | `ui_theme_by_id`, the 13 tokens at 8 colours, `ui_setting_str/int` over the door's JSON, `ui_door_dir`. A C door and its TypeScript twin read the same settings file. | ~600 (json_lite reused) | ~350 | 3-4 |
| **5. Proof** | One real door ported end to end and registered — the obvious candidate is `Doors/theme-picker` (275 lines of TypeScript, in the expressible class) plus a second at `doors-menu` scale. A C-door probe target in `dev/scripts/`. Binary size and repaint latency measured and written down. | ~700 (the ported doors) | ~600 | 4-6 |
| | **Total** | **~6,200 lines of C** (of which ~3,300 lifted) | **~3,800** | **24-35** |

Call it **five to seven weeks of one person's time**, and note that phases 0-2
alone (13 to 19 days) get to "a C door draws a bordered list and reads a key",
which is most of what the catalogue actually needs.

### Risks that could double it

**Risk 1, most likely: repaint cost forces a redesign of phase 2.**
`handoff.md:72` says ~45 ms per 198-byte XIM message. A full 80x24 coloured
frame is 20-30 messages. If that holds, every widget in phase 2 must expose a
dirty-region interface from the first line of code, not gain one later, and the
door loop becomes an explicit invalidate/repaint cycle rather than
paint-everything. `doorrepo-c` hit exactly this and its answer
(`ui_draw_list(..., only_row_a, only_row_b)`, `doorrepo.c:1971-1974`) is a
two-row special case, not a general mechanism. Generalising it is real design
work and it is inside phase 2's estimate only if the measurement in section 7
comes back near the current figure. If it comes back much worse, phase 2 grows
by 50-100%.

**Risk 2: the 500 KB region.** DoorRepo already needs 464 KB of the 500 KB
available (`.claude/skills/shrinkler-door-releases/SKILL.md:32-36`), and
`dirlist.h:34-38` says its static data is within ~80 KB of the ceiling. Nobody
has measured what a C SDK adds per door. If the library costs 40 KB of code plus
static frame buffers, some existing doors stop loading, and the failure surfaces
as `DoorTooLargeError` at load, or — for a real Amiga with no
`assertDoorSegmentsFit` — as silent BSS corruption of ExecBase
(`memory-map.ts:10-24`). Mitigation is a granular link: one `.o` per widget so a
door pays only for what it calls. That is a constraint on the API design, not a
later optimisation.

**Risk 3: two incompatible 68K code bases, and one of them documents itself
wrongly.** `sdk/68k/` reaches the BBS through AEDoor.library LVOs;
`examples/doorrepo-c/` bypasses the library entirely and speaks the raw
`AEDoorPort<node>` message protocol (`examples/doorrepo-c/aedoor_amiga.c:1-13`,
with no `OpenLibrary("AEDoor.library")` anywhere in the file). Starting phase 0
on the wrong one costs the whole phase, and `sdk/68k`'s own LVO map is wrong for
15 of the 20 trapped slots (section 2.2), so "read the docs and follow them" is
an active hazard rather than a shortcut. This is settled by the recommendation
in section 8, but if it is settled the other way, add 5-8 days to phase 0 to
first correct `AEDOOR_LVO_MAP.md` against `aedoor-vectors.ts` and replace
`sdk/68k/src/glue.c`'s stubs.

**Secondary risks, each worth 2-4 days if they bite:** vbcc version drift (the
two Makefiles use different install paths and different link libraries —
`sdk/68k/Makefile:13` `-lamiga -lvc` against `examples/doorrepo-c/Makefile:141`
`-lauto`); the `devices/timer.h` and space-in-path build hazards already
worked around by symlink at `examples/doorrepo-c/Makefile:64-93`; and the fact
that only one 68K C door is registered on this board today
(`Commands/BBSCmd/FILETEST.info`), so the "does a C door still work end to end"
regression surface is thin.

---

## 6. What is explicitly out

Each of these stays TypeScript. A door that needs one stays a TypeScript door;
there is no partial port and no shim.

| Excluded | Why | Doors affected |
|---|---|---|
| Audio (`engines/audio`, 2,275 lines; `SfxCues`) | Tone.js in the browser. A telnet caller has no audio channel at all. | 10 |
| The browser client (`bbs-door-sdk/client`, `ClientDoor`) | It runs in the caller's browser. A 68K door has no browser half. | 15 |
| socket.io multiplayer (`engines/network`, 8,885 lines; `LobbyNetworkAdapter`) | Needs a persistent event socket the XIM protocol does not provide; XIM is strictly request/reply (`aedoor_amiga.c:212-223`). | `card-lobby`, `grandmaster`, `livechat` |
| RIP graphics | Vendored RIPtermJS driving a browser canvas. | `rip-browser` |
| PETSCII canvas (`bbs-door-sdk/petscii`) | A C64 caller is served by the backend's PETSCII transducer, not by the door. | `ami-stripper`, `phreakwars` |
| `cell-art` and the arcade engine (`engines/graphics`, 6,782 lines; `engines/ui/arcade`) | Sprite sheets at frame rate, on a transport where a frame costs about a second (3.3). | 9 |
| The vendored blessed fork (`engines/ui/blessed`, 49,753 lines) | Retained-mode tree, mouse hit-testing, 256 colours, terminfo, tag parser. Section 4 replaces the used 5% and drops the rest. | — (replaced) |
| The ANSI editor (`engines/ui/ansi-editor` 8,028 lines + `widgets/ansi-editor.ts` 5,038) | A full canvas editor with undo and a CP437/SAUCE codec. Larger on its own than the entire proposed C SDK. | `ansi-editor`, `mail-composer`, `sprite-editor` |
| Gamepad input (`utils/gamepad-input-manager`) | Browser Gamepad API. | 4 |
| The whole TypeScript build chain (esbuild, `dist/`, the pre-commit dist rebuild, the `file:../../sdk` symlink) | No analogue (3.6). C doors are compiled by their own Makefile against `sdk/c/` sources. | — |

The TypeScript SDK stays the reference implementation in the sense that
`sdk/engines/ui/theme/tokens.ts` and
`sdk/engines/ui/blessed/core/responsive-constants.ts` define the token names and
the breakpoint rules, and `sdk/c/` implements them. Where both sides implement
the same rule, they should be pinned by a shared case table the way the door
delete rules already are (`examples/doorrepo-c/tests/delete-rule-cases.txt`,
read by both the C tests and the TypeScript side).

---

## 7. What is not known, and how to find out

These are gaps in the evidence, not things I chose not to look up.

1. **The real cost of a full frame.** `handoff.md:72`'s "~45 ms per 198-byte XIM
   message" is a repo claim with no measurement cited in this tree. Phase 2's
   architecture depends on it. Measure it by building a probe door that paints a
   full 80x24 coloured frame in a loop and running it under
   `dev/scripts/door-probe/probe.ts` with `XIM_DEBUG=1 XIM_DEBUG_JSON=1`, then
   dividing wall clock by frames. Do this before designing phase 2.
2. **What the library costs in bytes.** `doorrepo.amiga` is 121,608 bytes for
   18,756 lines, which is ~6.5 bytes per line, but that ratio includes the vbcc
   runtime and is not known to be linear. Measure by linking
   `sdk/68k/doors/hello-vbcc/hello-vbcc.c` (8 lines, 1,184 bytes today) against
   the phase-0 library and diffing, then again after phase 2.
3. **Whether `DT_*` and `BB_SCRWIDTH` actually answer a C door.** They are
   implemented in the backend (`xim/data-query.ts`, `xim/bbs-info.ts:376-391`)
   and exercised by AmigaE and AREXX doors, but no C door in this tree calls
   them — `examples/doorrepo-c/aedoor.h` has no user-data function at all.
   Measure by extending `sdk/68k/doors/comprehensive-test` (344 lines) to call
   them for real rather than through `glue.c`'s stubs, and reading the XIM log.
4. **Whether a real Amiga behaves like the emulator here.** Everything measured
   in this document was measured under the emulator. The 500 KB region is an
   emulator limit; a real Amiga has more RAM and no `assertDoorSegmentsFit`,
   which makes it more forgiving about size and less forgiving about a door that
   corrupts memory. No 68K C door from this tree is known to have been run on
   real hardware.
5. **How many of the 90-odd non-TypeScript doors under `Doors/` would want
   this.** The classification in 1.3 covers the 37 TypeScript doors. The legacy
   AmigaDOS and AREXX doors were not surveyed, and whether a C SDK would attract
   any of them is unknown.

---

## 8. The decision the sysop has to make - ANSWERED 2026-09-02

> **Decided: parity. "the identity of our doors is important" (sysop).
> A C door looks like its TypeScript twin - all seven themes, the same
> layout rules - not a frozen `classic`.**

> This is the more expensive answer (phases 2 and 4 each grow by about a
> third as written), and there is one way to stop it being paid twice for
> ever: do not hand-maintain the C tables. `sdk/engines/ui/theme/tokens.ts`
> and `responsive-constants.ts` stay the single source of truth, and a
> generator emits `sdk/c/theme_tables.h` and `sdk/c/layout_tables.h` from
> them - the same trick the door delete rules use to keep their C and
> TypeScript copies honest (`examples/doorrepo-c/tests/delete-rule-cases.txt`).
> A token change is then one edit plus a regenerate, and a test compares
> the generated header against the tokens so the two cannot drift in
> silence. Add that generator to phase 2 rather than writing theme.c and
> layout.c by hand.

The original question and its costing follow.

### A third point from the sysop (2026-09-02): a door must know where it is

> "the 68k door can't display petscii unless they run in amiexpress-web so
> they need to detect where they are running"

> PETSCII on this board is a TRANSDUCER in the backend (`sdk/petscii/`), not
> something a door emits: a door writes ANSI and the board turns it into
> PETSCII for a C64 caller. A 68K door running under real AmiExpress on real
> hardware has no such thing behind it, so the same door binary must behave
> differently depending on its host - and cannot assume the 40-column or
> PETSCII paths exist at all.

> So the C SDK needs a host query before anything else it offers: something
> like `ae_host_t ae_host(void)` returning the host (amiexpress-web, or
> classic AmiExpress) together with what that host can carry - PETSCII,
> wide terminals, the C64 40-column adaptation, mouse. The web host can be
> detected from the door port/environment it was started with; a classic
> host is the fallback and must be the SAFE one (80x25 ANSI, nothing else).
> A door then asks, rather than assuming. Put this in phase 0 - it changes
> what every later phase is allowed to do.

### A second decision, also settled (2026-09-02)

> **A door links only what it uses.** "only what is used by the 68k doors
> should be included in the binaries not the full sdk every time, this should
> be true for the typescript blessed sdk as well" (sysop).

> For the C side this is a build rule, not a feature: `sdk/c/` ships as a
> static library built one function per section (`-ffunction-sections`,
> `-fdata-sections`) and doors link with `--gc-sections`, so a door that
> never draws a list never carries the list widget. Anything that would
> defeat it - a registry that references every widget, a table of function
> pointers "for convenience", a constructor that touches all of them - is
> banned by construction. Phase 0 has to prove it: build the hello door
> against the full library and record the binary size, then add a widget and
> record it again. If the first number moves, the layering is wrong.

> This bears directly on risk 2. "464 KB for DoorRepo" is a measurement of a
> door that links everything it has; the number that matters is what a SMALL
> door costs, and nobody has measured it.

> The TypeScript side has the same disease and it is visible today:
> `Doors/card-lobby/dist/client.bundle.js` is **1.3 MB** and the door's
> esbuild line carries no tree-shaking flags to speak of. A door that uses
> four widgets should not ship the whole engine set. Worth its own pass,
> separate from this plan: measure every door's bundle, find what pulls the
> weight in (a barrel import of `@amiexpress/bbs-door-sdk` re-exports
> everything), and import by subpath instead.

Everything above is engineering. One thing is not, and it should be settled
before any code is written, because phases 2 and 4 are sized differently
depending on the answer.

**Does a C door have to look like its TypeScript twin, or only like a door on
this board?**

`examples/doorrepo-c/ansi.h:20-22` already chose the first answer once, for one
door: *"Colours match DOORMAN panel for panel: white-on-blue header and footer
bars, a cyan-bordered list, a blue-bordered info pane, and a white-on-blue
selected row"*, and `doorrepo.c:1667` carries DOORMAN's 35% list width as a
constant. Held to across a whole SDK, that means:

- **Parity.** `sdk/c/theme.c` implements all seven themes reduced to eight
  colours, `sdk/c/layout.c` tracks `responsive-constants.ts`, and every future
  change to a token, a breakpoint or a footer rule is made twice and pinned by a
  shared case table. Phase 2 and phase 4 each grow by roughly a third. In
  exchange, a caller sees one board, and a door can be written in either
  language without the sysop having to think about which.
- **One frozen look.** `sdk/c/` implements `CLASSIC` only, at eight colours, and
  says so. The 68K side stops tracking the TypeScript themes — which is what
  `sdk/engines/ui/theme/tokens.ts:25-27` already assumes today: *"These themes
  are for TypeScript doors on the web board; a 68K door draws its own ANSI and
  is not affected by any of this."* Cheaper to build and much cheaper to keep,
  at the cost of a visible seam between the two kinds of door once a user picks
  a theme.

There is no third option that is honest: a C SDK that "mostly" tracks the themes
drifts, and the drift shows up as a user reporting that one door ignored their
theme.

Recommended: **one frozen look for phases 0-5, with the token names kept
identical** so that parity remains possible later without an API change. The
theme system exists so a user can pick; a user on a real Amiga over telnet at
eight colours is not the user that feature was built for, and the maintenance
cost of two theme implementations is paid on every theme change for ever.

Two smaller calls follow from it and are engineering, not policy, so they are
recommended rather than asked:

- **Transport: the raw `AEDoorPort` message protocol
  (`examples/doorrepo-c/aedoor_amiga.c`), not the AEDoor.library LVOs
  (`sdk/68k/`).** It is proven on this board, it is under test, it needs no
  library present on the target, and it does not depend on documentation that is
  wrong in 15 of 20 slots. `sdk/68k/` contributes its constant tables
  (`includes/amiexpress.h`) and its vbcc knowledge, not its code.
- **Housing: `sdk/c/` in this repo**, versioned with the TypeScript SDK, tested
  in CI on the native backend the way `examples/doorrepo-c/tests` already is, so
  that a change to a shared rule fails a test rather than being noticed later.
