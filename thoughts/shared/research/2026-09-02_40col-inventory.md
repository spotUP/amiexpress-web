---
date: 2026-09-02
topic: 40-column (C64/PETSCII) width-assumption inventory for the BBS backend, doors, screens, and pagination
tags: [c64, petscii, 40col, research, phase-0, doorrepo-parity]
status: final
---

# 40-Column (C64/PETSCII) Adaptation Inventory

Phase 0 research for `thoughts/shared/plans/2026-09-02-c64-40col-adaptation.md`. Read-only survey — no code changed. Scope: every place the backend, doors, screen assets, or pagination code assumes an 80x24/25 terminal, with a REFLOWABLE / NEEDS-40-LAYOUT / ART-OR-FIXED judgment per surface.

**Headline finding: this is not a greenfield 40-col port.** A working C64/PETSCII pipeline already exists — TTYPE-based C64 detection, `screenWidth=40`/`screenHeight=25`, `session.petsciiMode`, `.seq` PETSCII screen files, a PETSCII byte-stream transport, and session-driven pagination that already caps sanely at 40 lines. The gap is coverage (only 2 of the high-traffic screens have `.seq` art) and columnar table layouts (WHO lists, dir listers, conference lists, message headers) that are still hardcoded to 80-ish widths and never consult `session.screenWidth`.

## 1. Backend width assumptions

Central buffered-output path: **`emitText(socket, text)`** in `web/backend/src/utils/ansi-buffer.util.ts:194` (the canonical implementation — batches at 60fps). `web/backend/src/utils/output.util.ts:34` is a thin same-signature wrapper around it (`bufferEmitText`), not a competing implementation. The vast majority of handler output goes through one of these two; a handful of legacy call sites still do `socket.emit('ansi-output', ...)` directly (e.g. `account.handler.ts:118-129`, `account-edit-input.handler.ts:616`, `sysop-commands.handler.ts:161`) — those bypass the buffer but not the width problem.

No `\x1b[<n>G` (column-addressing) escape codes exist anywhere in `web/backend/src` — cursor positioning uses `\x1b[<row>;<col>H` only (see `door.handler.ts` doors-list redraw), so there's no separate class of column-jump bugs to fix.

### NEEDS-40-LAYOUT (columnar, needs a narrow variant)
| File:line | Renders | Notes |
|---|---|---|
| `handlers/chat/chat-commands.handler.ts:153-171,205-206` | WHO list (username 16 + realname 23 + status 18, banner row) | Fixed 3-column table, ~60 cols wide |
| `handlers/user/account.handler.ts:118-129` + `'='.repeat(75)` | User list (Username 16/Real Name 20/Location 15/Level/Last Login) + separator | Direct `socket.emit`, not emitText |
| `handlers/file/file.handler.ts:437,635-637,1037` | Directory/file listings (filename 15-20 + size 5 + date + uploader) | 3 near-identical listing formatters |
| `utils/dir-file.util.ts:88`, `utils/dir-file-reader.util.ts:224`, `utils/file-upload.util.ts:238,243` | Filename padding (12-13 col) for dir listers | Amiga-filename-width convention (13 = AmigaDOS max name shown) |
| `handlers/screen.handler.ts:513,528,547,578` | `~CL.`/`~CD.`/`~ML.`/`~MD.` MCI conference & message-base lists — name padEnd(30), 2-col variant | Driven straight from express.e MCI code semantics; 2-col (`~CD.`, `~MD.`) definitely won't fit 40 cols |
| `handlers/message/message-scan.handler.ts:517,525,744,753` | Message scan list (from 29 + subject 21) | ~55-col table |
| `handlers/message/message-commands.handler.ts:397-399,653` | User-search/msgbase display rows (handle/loc/action 19 each; conf title 29) | |
| `handlers/message/messaging.handler.ts:320,326,341,472-477,1177-1178` | Message-read header block (Date/To/From/Status, each padEnd 30) | Two-column header layout |
| `handlers/door.handler.ts:1236,1284,1316,3317,3350` | Doors menu: 80-col title bar, `-`.repeat(80) footer, activity/upload log rows (username 15, filename 15+size 5) | Whole doors-list UI (`showDoorsList`/`formatDoorLine`, lines ~1228-1300) is a fixed-column, arrow-key redraw UI — needs a real narrow layout, not just a wrap |
| `handlers/user/new-user.handler.ts:865-869` | New-user 2-column choice picker (34-char columns) | 2-col layout won't fit 40 |
| `handlers/chat/room-commands.handler.ts:327,340` | Chat room member list (username 20 + status 15) | |
| `handlers/file/file-status.handler.ts:161,163` | Byte-count columns, padStart(14) | Numeric column, narrower fix possible |
| `services/SamiLogService.ts:976-1145` | Log report tables, several `'-'.repeat(76/30)` separators | Admin/sysop-facing; lower priority |
| `services/use-cases/file-statistics.use-case.ts:125` | File stats separator `-`.repeat(70) | |
| `handlers/command.handler.ts:2669` | Filename input line, `\x1b[13D` cursor-relative + padEnd(13) | Cursor-relative motion, not absolute column — still needs 13-char budget check on 40-col |

### REFLOWABLE (plain prose — a generic word-wrap fixes it)
- `handlers/content/view-file.handler.ts:198-243` — file-viewer wraps at 79 cols (express.e:20492-20516 parity comment); a width-aware wrap replaces the literal 79.
- `handlers/operator-chat.handler.ts:776-777` — `wordWrapMessage(message, 79, 79)`; already goes through a wrap function, just needs the width parameterized from session.
- `handlers/command-handler/core.ts:42` (comment, 2026-09-02) and `services/login-connect.service.ts:70` — both reference a fresh "single long line word-wraps mid-word on an 80-col ___" bug fix in progress; these are exactly the reflow surface this project should parameterize.
- `amigaguide/AmigaGuideViewer.ts:20,55,77` and `AmigaGuideParser.ts:282` — AmigaGuide viewer already takes `width` as a constructor/render param (default 80) — this one is *already* parameterizable, just needs the caller to pass `session.screenWidth`.
- Grumpy-sysop-bot flavor text, help text, bulletins, message-body text: reflowable by a generic wrapper; not enumerated line-by-line (dozens of sites, all the same shape — call a wrap-to-width helper before emit).
- `smiley-picker.util.ts:75,94,109` — picker width and border comes from a local `pickerWidth` variable, already parameterized relative to available width, not hardcoded 80 (minor: `startX` centers against a literal 80, `smiley-picker.util.ts:75`, needs a session-width swap).

### ART-OR-FIXED (leave alone)
- All ANSI/RIP art files (bulletins, BBSTITLE.rip/.ANS, menu screens rendered as ANSI art) — separate asset problem, covered in Section 3, not a code fix.
- Amiga struct/protocol constants that happen to be the literal `80` (DOORMSG string capacity, `fib_Comment[80]`, `GlobalStructures.ts` 80-byte string fields, `arexx.service.ts` `BB_SCRWIDTH` fallback default) — these are Amiga binary-format byte counts or AREXX variable defaults, not terminal-width assumptions; touching them would break 68K door binary compatibility.
- `qwk.ts.fix732` (note odd extension — appears to be a saved patch, not live source) padEnd(12/25) — QWK offline-mail binary format field widths, protocol-fixed, unrelated to display width.
- `DosLibrary.ts`/`struct-fields.generated.ts` 80-byte struct fields — Amiga filesystem struct layout, fixed by spec.

## 2. Door census

Existing width/geometry plumbing in `sdk/engines/ui`:
- `sdk/engines/ui/blessed/core/screen.ts:107,122,126,150,530,540,548,565-567` — the blessed `Screen` already supports a `responsive` option; when `options.responsive` is true it uses `options.width`, otherwise it hardcodes `80`. `setDimensions(linesPerScreen?, width?)` (line 530) is the resize entry point but only honors `width` in responsive mode — **most doors don't pass `responsive: true`, so they get a hardcoded 80 regardless of session width.**
- `sdk/engines/ui/blessed/core/responsive-constants.ts` — breakpoints start at `BREAKPOINT_XS = 50` (mobile phones in landscape). **Nothing in the breakpoint system goes as low as 40** — a 40-col PETSCII terminal falls below every defined breakpoint.
- `sdk/utils/blessed-helpers.ts:923` — `bbs?.getTerminalSize?.() || { width: 80, height: 25 }` — `getTerminalSize()` is the sanctioned door-facing API for terminal geometry.
- `web/backend/src/doors/BBSApi.ts:195-204` — `isPetsciiMode()` (session.petsciiMode) and `getTerminalSize()` (session.screenWidth||80 / session.screenHeight||25) are both implemented and session-driven server-side already; the SDK-side test mocks (`door-themes.test.ts:1059,1079`, `ansi-editor/opens.test.ts:27`, `grandmaster/fullscreen.test.ts:27`, `livechat/opens.test.ts:33`) all stub `getTerminalSize: () => ({width:80,height:25})` — no test exercises a 40-col value, so nothing currently proves any door survives a resize.

Only **grandmaster** and **livechat** call `getTerminalSize`/`isPetsciiMode` in their own source (grep hit `termsize=1` for both); every other blessed door reads nothing and assumes 80x24 implicitly via the Screen default.

Doors under `Doors/` (real doors = has its own `.info`; ~62 qualify; skipping `dist/`, `node_modules`, bundled sub-tools like `Conftop.info`/`tsconfig.base.json` that aren't door dirs):

| Door | Engine | getTerminalSize/isPetsciiMode | Min width | Reason |
|---|---|---|---|---|
| grandmaster (chess) | TS + blessed (33 files) | yes | needs-80 | Full board rendering, heavy blessed UI; the one door that already reads geometry but still needs real board-relayout work |
| livechat | TS + blessed (34 files) | yes | needs-80 | Multi-pane chat UI; geometry-aware but pane layout assumes wide screen |
| bug-tracker, door-manager (DOORMAN), doors-menu, dopewars, card-lobby, super-qix, puzzle-bobble, scrollwars, voice-chat, frogger, neo-blessed-showcase, zoo-keeper(ui/screens.ts), galaga | TS + blessed, no geometry read | no | needs-80 | Inherit hardcoded-80 `Screen` default (see above); would silently truncate/garble on a 40-col client today |
| widget-shadow-demo, ncurses-pong | TS, ncurses-style core (not blessed) | no | needs-80 | Demo/utility doors, low priority |
| ami-stripper, bbslink, bbslinkwall, phreakwars, telnet, telnet-front, rip-browser | TS-plain (ServerDoor, no UI engine) | no | compact-possible | Line-oriented prompt/response doors; likely reflow cleanly, but unverified — no explicit width awareness |
| donkey-kong, joust, pengo, pipe-dream, arkanoid | TS client-rendered arcade games (`ClientDoor`+`AudioEngine`+`installArcadeSfx`, subcell block-graphics via `engines/graphics/subcell`) | no | needs-80 | Client-side canvas/subcell rendering in the xterm viewport; not PETSCII-representable without a parallel C64 rendering path |
| 5D-User, 5d-zippysearch, 5DPAGER, AquaScan, Bossnuke, ByteKiller, dRE, emp_tools, FILE-OPS-TEST, MultiTop, Request, RTW, What | 68K Amiga binary (no source; single named executable + `.guide`/`.info`) | n/a (can't grep binary) | needs-80 | Genuine AmigaDOS executables run under XIM emulation; assume the emulated CON: window is 80x24 the way the original BBS did — 40-col support would require either XIM-side output translation or leaving these doors ANSI-only |
| SCEPTIC | Mixed bundle: `F!-START` (AREXX), `F!-REQUEST/request.rexx` (AREXX), `f!-LAST/SAD-LAST.exe` + `GD-CONFSTAT` (68K binaries) | no | needs-80 | Not a single door — a packaged set of 4 sub-doors with 3 different engines under one `.info` pair |

**Tally: 62 real doors — 40-ok: 0, compact-possible: 7 (plain line-oriented TS doors, unverified but plausible), needs-80: 55** (includes the blessed-UI doors that could become 40-ok with layout work, the 68K binaries that structurally cannot, and the client-rendered arcade games).

## 3. Screen census

`.seq`/`.SEQ` files found repo-wide (102 files, but only **2 unique screen names**):
- `BBSTITLE.SEQ` / `bbstitle.seq` — present per-node (`Node0`-`Node40`, `Node97`) and per-conference (`Conf2`-`Conf13`), both at node root and under `Screens/`. Verified real PETSCII content (hex dump shows Commodore reverse-video/color control bytes, e.g. `0x97 0xA1 0x12`), not a placeholder.
- `Logoff.seq` — present only under `Conf2`-`Conf13` `Screens/` dirs, not at any Node root.

That's the entire existing PETSCII art library. `screen.handler.ts:1523-1653,1793` already has the full `.seq`-preferring resolution logic (PETSCII-mode file lookup prefers `.seq` over `.TXT`, converts for PetMe64 font when needed, falls back to `bbstitle.seq` from `nodeFallbackDir`) — the *mechanism* is built and generic (any screen name can have a `.seq` companion), only the *content* is missing for everything except these two screens.

### High-traffic screens with NO `.seq` variant
- **LOGON**: `Logon.txt`, `Logon20.txt`, `Logon100.txt`, `Logon24hrs.txt`, `logon10.txt` — no PETSCII variant anywhere.
- **LOGOFF** (node-level, not conf-level): `Node1/Screens/Logoff.txt` has no companion `.seq` (only conferences do).
- **Menus**: `MENU.TXT`/`Menu.txt` (root + every `Conf*/`), `MENU250.TXT`/`menu250.txt.GR` — zero `.seq` variants found anywhere in the repo. This is the single most-viewed screen family in the BBS and has no C64 path today.
- **Join/joined conference**: `join.txt`, `joined.txt`, `JoinConf.txt` — no `.seq`.
- **Guest logon**: `guestlogon.txt` — no `.seq`.
- **Callers/awaitscreen**: `Callers.txt`, `awaitscreen.txt` — no `.seq`.
- **Bulletins** (`Bulletins/bull1-6.txt`): plain text, reflowable, no `.seq`.
- RIP-only screens (`BBSTITLE.RIP`, `RIPgraphics/MENU01-11.RIP`, `msgmenu1.rip`, `mainmenu1.rip`, `pagemenu1.RIP`) are a third, RIP-specific art track, orthogonal to PETSCII.

## 4. Pagination + geometry plumbing

Two independent but consistent axes, both already session-driven with sane C64-aware defaults in several call sites:

**Height / lines-per-page** (`linesPerScreen`, `screenHeight`):
- `utils/flag-pause.util.ts:42-49` — canonical pagination gate (`flagPause()`, ported from express.e:28025-28063). Reads `session.tempData.termHeight || session.screenHeight || session.user?.linesPerScreen || session.user?.lineLength || session.user?.pageLength || 23`, then **clamps to `Math.min(Math.max(rawLineLen, 10), 40)`** — already bounded to a range that comfortably covers a 25-row C64 screen. No code change needed here; this is the good pattern to extend, not fix.
- `session.screenHeight` is set to **25** for C64 explicitly in 3 places: `server/telnet-server.ts:743` (DEL-probe/TTYPE C64 detect), `handlers/command-handler/pre-login.ts:152` (ANSI-prompt "P"/PETSCII branch), `handlers/command.handler.ts:1401`. Non-C64 paths default to 24 (`config.ts:141`, `session-manager.ts:184`, `pre-login.ts:166,174`).
- `handlers/screen.handler.ts:2219,2730` — `pageHeight = session?.screenHeight || 25` — reads session, not hardcoded.
- `handlers/door.handler.ts:604,695-696` — `linesPerScreen = session.tempData?.termHeight || session.screenHeight || 24` — session-driven; forwarded into the door's DOORMSG/BSS struct for 68K doors and into `getTerminalSize()` for TS doors.
- Remaining `23`/`24` literals (`database.ts:2949`, `config.ts:142`, `auth.handler.ts:201`, `batch-scheduler.ts:746,764`, `amiga-export.service.ts:192`, `UserDatabaseManager.ts:510`) are **defaults for new/imported users**, not live pagination hardcodes — correct to leave as fallback constants.

**Width** (`screenWidth`):
- `web/backend/src/server/telnet-server.ts:74-108,392,742` — `classifyTerminalType()` detects C64 via TTYPE string (`'C64'`/`'COMMODORE'`/`'PETSCII'`) and sets `width: isC64 ? 40 : 80, height: isC64 ? 25 : 24` (line 392); the DEL-probe fallback path (lines 720-754) independently sets `screenWidth = 40, screenHeight = 25, petsciiMode = true, ansiEnabled = false` for real C64 hardware that never sends TTYPE. Both paths are real, wired, and already shipped — this is the entry point the 40-col project should hang new work off of, not build from scratch.
- `web/backend/src/doors/BBSApi.ts:202-205` — `getTerminalSize()` reads `session.screenWidth || 80` / `session.screenHeight || 25`. Correctly session-driven, but as noted in §2 most doors never call it.
- `sdk/engines/ui/blessed/core/screen.ts:107,540` — the one place width is **not** session-driven by default: `bbsWidth = options.responsive ? (options.width || 80) : 80` — a door must opt into `responsive: true` and thread `session.screenWidth` in as `options.width` itself; nothing does this automatically today.
- `arexx.service.ts:1924-1925,1960,2019` — AREXX `BB_SCRWIDTH`/`BB_SCRHEIGHT`/`DT_LINELENGTH` variables fall back to hardcoded `80`/`24` when the user record has no `linesPerScreen`, independent of the live session's `screenWidth` — a 40-col AREXX door session reading `BB_SCRWIDTH` would get 80 unless `linesPerScreen` happens to be populated.

## Top-3 surprises

1. **The C64/PETSCII pipeline already exists end-to-end at the transport layer.** TTYPE-based detection, a DEL-probe fallback for real C64 hardware that skips telnet option negotiation, `session.petsciiMode`/`screenWidth=40`/`screenHeight=25`, a `petscii-bytes`/`petscii-output` socket transport, and a generic `.seq`-preferring screen-file resolver are all shipped and wired (`telnet-server.ts`, `BBSApi.ts`, `petscii.util.ts`, `screen.handler.ts`). This project is a coverage/layout gap-fill, not a build-from-scratch.
2. **Only 2 of the dozens of screen names have PETSCII art**, and neither is the highest-traffic one: `BBSTITLE.SEQ` and `Logoff.seq` exist; `MENU.TXT` (the per-conference command menu, shown constantly) has zero `.seq` variants anywhere in the 40-node repo, nor does `LOGON`/`join`/`guestlogon`.
3. **The blessed UI engine's `responsive` mode is opt-in and unused by width, so most blessed doors get a hardcoded 80 even though the session already knows the real width.** Combined with `BREAKPOINT_XS = 50` being the narrowest defined breakpoint, a 40-col client is below every layout tier the door SDK currently understands — this is a gap in the SDK's responsive-layout model, not just a per-door bug.

Also notable: `flagPause()`'s pagination clamp (`Math.min(Math.max(rawLineLen,10),40)`) and the three explicit `screenHeight=25` C64 call sites mean vertical pagination is already correctly plumbed for a 25-row screen — the remaining work is overwhelmingly horizontal (column layouts) and content (missing `.seq` art), not pagination logic.
