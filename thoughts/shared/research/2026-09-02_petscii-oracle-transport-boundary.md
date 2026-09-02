---
date: 2026-09-02
topic: Where PETSCII/ANSI bytes leave the backend for a PETSCII session, which oracle each feeds, and where a transport-boundary oracle could live
tags: [petscii, c64, seq, mci, transducer, oracle, transport, connection-emitter, socket-handlers, research]
status: draft
---

# PETSCII render oracle vs. the transport boundary

Research only. Documents what IS on `feat/installed-door-link` at `9f632c4cb`.
The fix wave this answers ended at `81cc5f8be`; the only commit since
(`9f632c4cb`, "give C64 callers a logoff screen that exists") changed
`Conf*/Screens/Logoff.seq`, `Screens/logoff/00N.logoff.seq` and one test - no
source file cited below moved. Every `file:line` in this document was opened
and checked against the working tree on 2026-09-02.

Inputs: `RULES.md`, `.superpowers/sdd/2026-09-02-mci-in-seq/fix-wave-report.md`,
`thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`,
`thoughts/shared/handoffs/2026-09-02_mci-in-petscii-seq.md`,
`thoughts/shared/handoffs/2026-09-02_petscii-full-canvas.md`, and the source
cited below.

Paths are repo-relative on first mention and shortened afterwards:

| short name | full path |
|---|---|
| `connection-emitter.ts` | `web/backend/src/server/connection-emitter.ts` |
| `socket-handlers.ts` | `web/backend/src/server/socket-handlers.ts` |
| `auth-socket-handlers.ts` | `web/backend/src/server/auth-socket-handlers.ts` |
| `c64-detected-handler.ts` | `web/backend/src/server/c64-detected-handler.ts` |
| `c64-door-adapter.ts` | `web/backend/src/server/c64-door-adapter.ts` |
| `telnet-server.ts` / `ssh-server.ts` | `web/backend/src/server/` |
| `index.ts` | `web/backend/src/index.ts` |
| `screen.handler.ts` | `web/backend/src/handlers/screen.handler.ts` |
| `petscii-screen.render.ts` | `web/backend/src/handlers/petscii-screen.render.ts` |
| `command.handler.ts` | `web/backend/src/handlers/command.handler.ts` |
| `pre-login.ts` | `web/backend/src/handlers/command-handler/pre-login.ts` |
| `door.handler.ts` | `web/backend/src/handlers/door.handler.ts` |
| `BBSApi.ts` | `web/backend/src/doors/BBSApi.ts` |
| `login-post.service.ts` | `web/backend/src/services/login-post.service.ts` |
| `modem-emulator.util.ts` | `web/backend/src/utils/modem-emulator.util.ts` |
| `ansi-buffer.util.ts` | `web/backend/src/utils/ansi-buffer.util.ts` |
| `wrap-for-session.util.ts` | `web/backend/src/utils/wrap-for-session.util.ts` |
| `ansi-to-petscii.ts` | `sdk/petscii/ansi-to-petscii.ts` |
| `BBSTerminal.tsx` | `packages/terminal/src/components/BBSTerminal.tsx` |

The two concerns this answers, verbatim from the fix wave:

- (a) `ansi-output` emitted outside the four scoped taps still bypasses the
  render oracle, so the machine that encodes/clips `.seq` values drifts from
  the real terminal between screens.
- (b) Two transducers model one terminal on the server (emitter + render),
  and the web `P` session keeps a third, client-side.

---

## 1. The objects: who models the C64 screen

Every one of these is an `AnsiToPetsciiTransducer` (`ansi-to-petscii.ts:111`)
or the bare `PetsciiMachine` inside one (`readonly machine`, `:112`). The
transducer has three inputs: `transduce(text)` (ANSI in, PETSCII out, feeds
its machine as it converts, `:193`), `observe(bytes)` (raw PETSCII that
reached the terminal some other way; feeds the machine and clears
`pendingWrap`, `:180-183`), and `flush()` (`:186-191`) which resolves a held
bare `\r` into a `$9D` walk (`carriageOnly`, called at `:188`, defined at
`:326`) and DROPS a held partial escape.

| # | instance | field / ref | created | disposed | fed by |
|---|---|---|---|---|---|
| T1 | telnet/SSH/WS-terminal **session transducer** | `session.petsciiTransducer` (declared `index.ts:384`, JSDoc `:383`) | lazily, first `emit` on a PETSCII session, `connection-emitter.ts:28-31` (`petsciiTransducerFor`, keyed on the session so both emitters built for one connection share it) | never explicitly; goes with the session object when `sessions.delete(connection.sessionId)` runs on `close` (`index.ts:1316-1330`, delete at `:1322`) | `connection-emitter.ts:104` (`transduce`, every `ansi-output` string), `:126` (`transduce`, every `petscii-output` string), `:137` (`observe`, every `petscii-bytes`); flushed at the input boundary `index.ts:1144` (`flushPendingPetscii`, `connection-emitter.ts:61-71`) |
| T2 | **render transducer** (the `.seq` oracle) | `session.petsciiRenderTransducer` (`petscii-screen.render.ts:95`) | lazily, `petsciiTransducerFor(session)` `petscii-screen.render.ts:161-167`; `petsciiMachineFor` returns its machine `:179-181`; first caller is the first `.seq` render, `$93` clear, or oracle tap | `disposePetsciiRenderCtx` `:231-234` (also clears `session.screenSegments`), called ONLY from the web disconnect cleanup `socket-handlers.ts:1240` (inside `finalizeDisconnectCleanup` `:1076`, after the 3 s grace at `:982-991`). No telnet/SSH caller: `grep -rn disposePetsciiRenderCtx src` hits `socket-handlers.ts:40,1240` and the definition, nothing else | `renderChunkBytes`/`renderPetsciiScreen` feed the machine directly (`emitPetsciiChunk` `screen.handler.ts:1615-1642`, `emitRawPetscii` `:1650-1653`); the four scoped taps feed `transduce` for `ansi-output` and `observe([])` for `petscii-bytes` (`installPetsciiOracleTap` `:1521-1559`). NEVER flushed: `grep -n "flush()" src/handlers/petscii-screen.render.ts src/handlers/screen.handler.ts` returns nothing |
| T3 | web **client transducer** | `petsciiTransducerRef` (`BBSTerminal.tsx:264`) | `ensurePetsciiSession()` `BBSTerminal.tsx:850-859`, triggered by `terminal-resize {40,25}` (`:2173-2181`, the `P` answer) or the first `petscii-bytes` (`:2148-2149`) | `clearPetsciiSession` `:266-272` (session reset; callers `:465`, `:1627`, `:2353`) | `:2107` (`transduce`, every `ansi-output` while surface is canvas), `:2131` (`transduce`, every `petscii-output`), `:2151` (`observe`, every `petscii-bytes`), `:865` (`transduce`, every direct `writeTerm`); flushed before every key `:2719-2724` (flush at `:2723`) |
| M3 | web **client display machine** | `petsciiMachineRef` (`BBSTerminal.tsx:259`), mirrored into state at `:263` | with T3 (`:851-854`) | with T3 | `enqueuePetscii` `:839-846`: T3's output bytes plus the raw `petscii-bytes` (`:2152`). T3.machine and M3 see the same byte sequence, so they are in lockstep by construction |
| A | **C64 door adapter** reconstructor | `session._c64DoorAdapter` / `socket._c64DoorAdapterOnSocket` (`c64-door-adapter.ts:93,105`) | `installC64DoorAdapter` `:244-295`, from `executeAmigaDoor` `door.handler.ts:3052-3055` | `uninstallC64DoorAdapter` `:306-323` from `door.handler.ts:1700` (defensive, every `executeDoor` entry), `:3127` (finally), `AmigaDoorSession.ts:1285` (silent) | its own `FrameReconstructor` (80-column ANSI model, not a C64 model); its 40-column output is `ansi-output` that then reaches T1/T3 like any other text |

Summary of (b): a telnet C64 has T1 + T2 on the server. A web `P` session has
T2 on the server and T3 + M3 in the browser. T1 and T3 are the "real
terminal" models (they see the whole wire); T2 sees the `.seq` bytes plus
whatever the four scopes hand it.

---

## 2. Every egress for a PETSCII session

### 2.1 Transport layer: what actually writes to the caller

**Telnet / SSH / WS-terminal (`connection-emitter.ts:73-184`).** One object
literal per `setupTelnetSSHHandler` call (defined `index.ts:1074`, emitter
built `:1091`), attached as `(connection as any).emitter` (`:1097`). `emit` is
an OWN property of the literal (`:95`, body `:95-143`). Every transport event
ends in `connection.write`: `ansi-output` string on a PETSCII session ->
T1.transduce -> write (`:104`); non-string (ZMODEM) -> write untouched
(`:106`); `petscii-output` -> T1.transduce (`:126`); `petscii-bytes` ->
T1.observe + write raw (`:137-138`). SSH (`ssh-server.ts`, wired
`index.ts:1865`) and the WS terminal (`ws-terminal-server.ts`, wired
`index.ts:1785`) reuse this handler; there is no separate SSH emitter. The
dedicated PETSCII telnet port uses it too (`index.ts:1829-1836`).

A **second emitter** for the same connection is built in `handleC64Detected`
(`c64-detected-handler.ts:36`) for the TTYPE / dedicated-PETSCII-port path. It
shares T1 (keyed on the session) but has NONE of the wrappers installed on the
first emitter (login ANSI filter, modem, adapters). It is a FUNCTION-LOCAL
`const` (`c64-detected-handler.ts:36`) used for exactly three emits -
`displayScreen(..., 'BBSTITLE')` `:37`, then `ansi-output '\r\n\r\n'` `:45`
and `ansi-output 'Username: '` `:46` - and is never stored on the connection,
so `connection.emitter` (the first) remains what every later handler sees.

Bytes that bypass the emitter entirely on telnet/SSH (never reach T1):
`connection.write` at `telnet-server.ts:765` (fallback graphics prompt when no
emitter is attached), `ssh-server.ts:312` (the same fallback),
`transferRawSend`/`transferRawSendUnescaped` (`index.ts:1110-1130`, ZMODEM),
and `flushPendingPetscii`'s own write (`connection-emitter.ts:70`, which is
T1's output, so T1 is consistent by construction).

**Web (socket.io).** Server-side there is no transport conversion at all: the
`ansi-output` / `petscii-output` / `petscii-bytes` payloads leave through
socket.io and the browser converts (T3). The server-side own-property `emit`
wrappers on a web socket are, in installation order:

1. dev-only OutputTap tee, `socket-handlers.ts:139-158` (own property assigned
   at `:145`, marker `__ansiTapInstalled` `:139-140`, never removed);
2. session-log capture, `socket-handlers.ts:176-183` (own property, never
   removed) - this is the wrapper the task named as the web choke candidate;
3. `installAnsiFilter`, `login-post.service.ts:84-100` (called at
   `:139`, marker `_ansiFilterInstalled`; also installed on the telnet
   emitter, since the same post-login pipeline runs for both - "works against
   both", `:78-80`);
4. `ModemEmulator.install`, `modem-emulator.util.ts:263-305` (wrapper assigned
   `:276`; marker `_modemEmulatorInstalled` `:267,291`, never removed). Four
   install sites: post-login `login-post.service.ts:146-149` (on the WEB
   socket or the TELNET EMITTER - `getModemEmulator(emitter)`), reconnect
   `auth-socket-handlers.ts:177-184`, ANSI-animation playback
   `screen.handler.ts:2013-2014`, and the `W` baud command
   `handlers/commands/info-commands.handler.ts:1326-1328`. It captures
   `_directEmit` = the `socket.emit` current at CONSTRUCTION (`:25-31`) and
   republishes it (`:301-303`);
5. per-door: `createDoorSocketWrapper` (`door.handler.ts:96-154`; for a
   socket.io socket it uses `onAnyOutgoing` `:135-144` and does NOT replace
   `emit`; for the telnet emitter, which has no `onAnyOutgoing`, it DOES
   replace `emit` `:146-150` and restores `socket.emit = rawEmit`
   unconditionally `:151-153` - a bound copy taken at `:97`, not the value
   found), and `installC64DoorAdapter` (`c64-door-adapter.ts:244-295`, patch
   built `:278-293`, assigned `:293`, restored by identity in `restoreEmit`
   `:333-344`);
6. per-call: BBSApi `joinRoom`/`createRoom` (`BBSApi.ts:1223-1237`,
   `:1292-1309`) replace `emit` for the duration of a handler call and
   restore `this.socket.emit = originalEmit` (`:1237`, `:1309`)
   unconditionally - a bound copy assigned as an own property even where the
   original was inherited;
7. innermost-in-time: the scoped oracle tap `screen.handler.ts:1521-1559`,
   which restores by identity and deletes the own property when there was
   none (`:1551-1558`, guard `:1555`, delete `:1557`).

Because every wrapper captures `socket.emit.bind(socket)` at install time,
the chain is LIFO in time: the outermost function is the last installed. A
`_directEmit` caller (`screen.handler.ts:2294` resolves it for
`emitWithModem`, emitting at `:2332` and `:2346`; `:2564` resolves it for the
wipe frames, emitting at `:2580`; `c64-door-adapter.ts:263-264` seeds it if
missing) jumps straight to the emit that existed when the ModemEmulator (or
adapter) was constructed - which on web is wrapper 2 (installed at
registration, before login), on telnet the emitter literal's own `emit`. So
`_directEmit` output still passes the session-log wrapper and T1, but skips
the ANSI filter, the modem throttle, the adapter, and any scoped tap.

### 2.2 Producer sites (what emits, on which event)

Exact counts over `web/backend/src` (tests live in `web/backend/tests` and are
excluded by the path), reproducible:

    grep -rEo "\.emit\(\s*'ansi-output'"    --include="*.ts" web/backend/src | wc -l   # 1760
    grep -rEo "\.emit\(\s*'petscii-output'" --include="*.ts" web/backend/src | wc -l   #   10
    grep -rEo "\.emit\(\s*'petscii-bytes'"  --include="*.ts" web/backend/src | wc -l   #    4
    grep -rEo "\bemitText\("                --include="*.ts" web/backend/src | wc -l   # 1130
    grep -rEo "\bemitPrompt\("              --include="*.ts" web/backend/src | wc -l   #   96

Receivers of those three events, by identifier: `socket` 1605, `this.socket`
94, `state.emitter` 22 (`services/rename-prompt.service.ts` 13,
`services/resume-stuff.service.ts` 9 - a stored `LoginEmitter`, i.e. the
caller's own socket or telnet emitter), `emitter` 19
(`utils/display-ul-stats.util.ts:37-57`, `services/rename-prompt.service.ts:95`
and others - the same object passed as a parameter), `targetSocket` 3,
`counterpart.socket` 3, `this.context.socket` 1
(`services/arexx.service.ts:1618`, the caller's own socket). The cross-session
class is therefore **6 sites**, not the 60 an earlier draft asserted.

A literal grep misses emits whose event name is a variable. Those are, in
full: `screen.handler.ts:2305, 2332, 2346, 2487, 2607, 2626, 2800, 2877, 2996,
2999` (`eventName` / `segState.eventName`), `:2826, 2838` (`paged.eventName`),
`pre-login.ts:110, 111, 270` (`getOutputEvent(session)`, defined `:16`), and
`doors/client-door-bridge.ts:427` (a `door:message:<id>` event, not terminal
bytes).

`emitText` (`ansi-buffer.util.ts:195-207`) is the only place `wrapForSession`
runs (`:202`; gate `wrap-for-session.util.ts:40-57`: identity unless
`petsciiMode === true`, effective width < 80 and no door owns the terminal);
it appends to a per-socket `AnsiBuffer` that emits
`socket.emit('ansi-output', ...)` (`:104`) on a 16 ms timer (`:80-82`), on
`maxBufferSize` (`:58-61`), when `flushDelay === 0` (`:64-67`), or
immediately (`emitPrompt`, `:216-218`; `flushOutput`).

| producer | event | file:line | reaches T1 (telnet) | reaches T2 (render) | reaches T3 (web) |
|---|---|---|---|---|---|
| `.seq` art / MCI chunks / `$93` clears | `petscii-bytes` | `screen.handler.ts:1640` (`emitPetsciiChunk`), `:1652` (`emitRawPetscii`), `:1842` (`emitPetsciiScreen`), and the `$93` at `:1911` which goes through `emitPetsciiChunk` | observe | fed directly by the render before emit | observe |
| door raw PETSCII | `petscii-bytes` | `BBSApi.ts:308` (`writePetscii(Buffer)`) | observe | **no** | observe |
| legacy PUA PETSCII strings | `petscii-output` | all ten sites: `screen.handler.ts:1852` (non-raw fallback), `command.handler.ts:1067, 1069, 1081` (`completeRealC64Connect` prompts), `pre-login.ts:68, 70, 76` (dead branch, see 4), `BBSApi.ts:311, 322, 324` (`writePetscii(string)`, `writePetsciiLine`) | transduce | **no** - the tap ignores `petscii-output` (`screen.handler.ts:1536-1547` handles only `ansi-output` strings and `petscii-bytes`) | transduce |
| pause prompt (`doPause`) | `ansi-output` via `emitPrompt` | `screen.handler.ts:3123-3125` (inside `doPause` `:3111-3139`) | transduce | tap (scope 1) | transduce |
| `~SP` resume prompt | `ansi-output` via `emitPrompt` | `:3018-3020` (inside `processNextScreenSegment`) | transduce | tap (scope 2) | transduce |
| pagination page break / erase-line / More prompt | `paged.eventName` direct emit | `:2825-2827` (erase-line), `:2837-2839` (page + More) | transduce | tap (scope 3, `ansi-output` only) | transduce |
| `~SS_`/`~SR_` include that resolves to `.TXT` | `ansi-output` via `emitText` + `flushOutput` | `displayIncludedScreen` `:424-454` (tap `:441`, drain `:450`) | transduce | tap (scope 4) | transduce |
| the FIRST page of a paginated screen | `eventName` | `startPagination` `:2800` | transduce | **no** (untapped) | transduce |
| a resumed ANSI segment's own content | `segState.eventName` | `:2996`, `:2999`; NS dump `:2877` | transduce | **no** (untapped - only the prompt at `:3018` is in a scope) | transduce |
| every other BBS screen/prompt/menu (`displayScreen` `.TXT` arm `:2305/:2332/:2346/:2487/:2607/:2620/:2626`, `MENU`, `BULL`, command prompts, error lines, `emitText` callers) | `ansi-output` | 1760 literal + 1130 `emitText` + 96 `emitPrompt` sites | transduce | **no** | transduce |
| session-mode banner (`PETSCII: SIMULATING C64 DISPLAY (40X25)`) | `ansi-output` via `emitText` | `command.handler.ts:1504-1506` | n/a (web only by construction, `:1500-1503`) | **no** (T2 does not exist yet) | transduce |
| real-C64 oracle resync `ESC[2J ESC[H` | `ansi-output` | `command.handler.ts:1060` (`completeRealC64Connect` `:1047-1083`) - the ONLY resync site | transduce (its purpose, `:1048-1059`) | **no** | n/a |
| BBSTITLE hand-off on the TTYPE/PETSCII-port path | `ansi-output` | `c64-detected-handler.ts:45-46` (`'\r\n\r\n'`, `'Username: '`) | transduce (via the second emitter, same T1) | **no** | n/a |
| 68K door output | `ansi-output` | `amiga-emulation/LibraryManager.ts:592, 601`; `amiga-emulation/XIMProtocol.ts:1526-1661`; `amiga-emulation/xim/system-commands.ts:609-677, 1525-1545, 1759-1761`; `amiga-emulation/AmigaDoorSession.ts:780, 808` | via adapter A when installed, then transduce | **no** | transduce (adapter frames are `ansi-output`) |
| TypeScript door output | `ansi-output` | `BBSApi.ts:166` (`write`), `:183, 190, 197`, `:370, 394, 403, 419, 634`; `sdk/core/Output.ts:20-42`; `sdk/utils/door-preloader.ts:77-85`; `sdk/engines/ui/ncurses/ncurses.ts:123`; blessed frames arrive here too - see 6 | transduce | **no** | transduce; client pacing bypassed while `door-active` (`door.handler.ts:868, 923, 2242, 2263` and seven more; `BBSTerminal.tsx:2446-2453`) |
| AREXX door output | `ansi-output` | `services/arexx.service.ts:1618` | transduce | **no** | transduce |
| cross-session pushes (chat page answered, chat ended, kicked, muted, sysop disconnect) | `ansi-output` on ANOTHER node's socket | all six: `handlers/chat/chat.handler.ts:342, 343, 391`; `handlers/chat/group-chat.handler.ts:773, 855`; `handlers/message/message-commands.handler.ts:601` | the TARGET session's T1 | **no** | the target's T3 |
| `_directEmit` bypass (wipes, slowmo) | `ansi-output` below the wrapper stack | `screen.handler.ts:2332, 2346` (resolved `:2294`), `:2580` (resolved `:2564`) | transduce (below the wrappers but above the emitter literal) | **no** (skips any scoped tap) | transduce |
| ZMODEM / binary | non-string `ansi-output`, raw writes | `connection-emitter.ts:106, 119`; `index.ts:1110-1130` | no (passes untouched) | no | no |

Reading the T2 column: the four scopes are the ONLY places non-`.seq` bytes
reach the render oracle, and even inside them a `petscii-output` string does
not. Everything a caller sees between two `.seq` screens - the menu, the
prompt they typed at, a door, a chat page from another node - is unseen by
T2. That is concern (a) in full.

### 2.3 Timing seams that matter for a tap

- **AnsiBuffer.** `emitText` output leaves on a 16 ms timer
  (`ansi-buffer.util.ts:80-82`). A scoped tap only sees a buffered chunk if
  something inside the scope flushes it: `doPause` and the resume prompt use
  `emitPrompt` (immediate, `:216-218`), `displayIncludedScreen` calls
  `flushOutput` before uninstalling (`screen.handler.ts:450`), pagination
  emits directly. Text buffered BEFORE a scope and flushed inside it is
  attributed to the oracle correctly (the flush goes through the tapped
  `emit`); text buffered inside a scope and flushed by the timer after
  uninstall is lost to T2. The pattern class to audit if scopes stay:
  `emitText` immediately before a `.seq` display with no `emitPrompt` in
  between (`displayScreen` itself calls `flushOutput` first, `:1875`).
- **flush() asymmetry.** T1 is flushed at every input arrival
  (`index.ts:1144`), T3 before every key (`BBSTerminal.tsx:2723`); T2 is
  never flushed. A prompt that ends in a bare `\r` leaves T1/T3's `pending`
  resolved into a `$9D` walk (`ansi-to-petscii.ts:188` -> `carriageOnly`
  `:326`) while T2 holds it and prepends it to its NEXT `transduce` - which
  may be the next scope, screens later. Same for a partial escape held across
  chunks: T1/T3 drop it at flush (`:186-191`); T2 keeps it. The scoped tap
  masks this today only because each scope's text is whole.
- **`observe([])` on tap install** (`screen.handler.ts:1532`) clears T2's
  `pendingWrap` latch because raw `.seq` bytes reached the terminal without
  passing `transduce` (`ansi-to-petscii.ts:182`). T1 gets the same via
  `observe(raw)` at `connection-emitter.ts:137`; T3 via `BBSTerminal.tsx:2151`.
- **T2 is born late.** For a web `P` session T2 does not exist until the
  first `.seq`/`$93`/tap; T3 exists from `terminal-resize`
  (`BBSTerminal.tsx:2173-2181`). Everything before (connect screen, graphics
  prompt, the SIMULATING banner) is in T3 and not T2. For a telnet C64,
  `completeRealC64Connect` resyncs T1 with a full clear
  (`command.handler.ts:1060`) and BBSTITLE's `shouldClear` puts `$93` into T2
  (`screen.handler.ts:1905-1911`, set `:1881`, membership `:349`), so both
  start from home - by coincidence of `SCREENS_REQUIRE_CLEAR`, not by design.

---

## 3. Is there ONE per-session choke every byte passes?

**Telnet / SSH / WS-terminal: yes, and it already owns a session-lifetime
transducer.** `buildConnectionEmitter`'s `emit`
(`connection-emitter.ts:95-143`) is the only function that turns
socket-shaped events into `connection.write` for a session; every wrapper
above it calls down into it, `_directEmit` included. The exceptions are the
raw `connection.write` sites listed in 2.1 (pre-emitter fallback prompts at
`telnet-server.ts:765` / `ssh-server.ts:312`, ZMODEM), none of which carry
screen text on a PETSCII session in practice. T1 therefore already IS the
terminal model for a real C64; T2 duplicates it for the render.

Caveat: the second emitter (`c64-detected-handler.ts:36`) is a second choke
object for the same session, but it shares T1 and is function-local, so the
model stays single even though the object is not.

**Web: yes on the server side, but it is a log tap, not a model.** The
session-log wrapper `socket-handlers.ts:176-183` is installed at
registration, before login, on every web socket, and every later wrapper
chains through it (`_directEmit` captured post-registration also lands on
it). It sees every `ansi-output` this socket emits - but the conversion for a
web `P` session happens in the browser (T3), and nothing on the server
mirrors it. The dev-only OutputTap (`:139-158`) sits below it and is not a
candidate (dev only, `ansi-output` only, `NODE_ENV !== 'production'` guard at
`:139`).

What neither choke sees: bytes emitted on ANOTHER session's socket for this
caller (the six sites in 2.2) - they pass the target socket's own choke,
which is the right one, provided the choke is keyed on the target session.

---

## 4. Where a session becomes PETSCII (session-lifetime tap candidates)

| site | path | sets | note |
|---|---|---|---|
| `telnet-server.ts:733-747` | TTYPE `C64`/`COMMODORE`/`PETSCII` (`:734-737`), DEL-probe (`terminalType === 'c64'` stamped at `index.ts:1187`, gate `:1178-1185`, read at `:733`), dedicated PETSCII port (`:788-806` emits a synthetic `terminal-type`, consumed `:771-786`) | `terminalType='c64'` `:739`, `petsciiMode=true` `:740`, `ansiEnabled=false` `:741`, 40x25 `:742-743`, `subState=DISPLAY_BBSTITLE` `:744`, then `emit('c64-detected')` `:747` -> `handleC64Detected` (second emitter) | `connection.emitter` already exists here (`telnet-server.ts:751-753`: `setupTelnetSSHHandler` runs synchronously after `'connection'`), but the LOGIN-time wrappers (ANSI filter, modem) do not. The socket in hand inside `handleC64Detected` is the SECOND emitter |
| `command.handler.ts:1404-1412` | live DISPLAY_CONNECT dispatcher, c64 branch | `petsciiMode=true` `:1406`, `ansiEnabled=false` `:1407`, 40x25 `:1408-1409`, then `completeRealC64Connect` `:1410` (`:1047-1083`) | the comment at `:1398-1403` states `pre-login.ts`'s `handlePreLoginInput` is never called from the live dispatcher |
| `command.handler.ts:1445-1455` | ANSI_PROMPT short-circuit after a DEL-probe | `applyGraphicsAnswer(socket, session, 'P')` `:1448` then `ansiEnabled=false` `:1452`, `completeRealC64Connect` `:1453` | `applyGraphicsAnswer` emits web-style `terminal-resize {40,25}` (`pre-login.ts:149`) on this path too |
| `pre-login.ts:135-149` (`applyGraphicsAnswer`) | web/SSH `P` answer at the graphics prompt | `petsciiMode=true` `:143`, `ripMode=false` `:144`, `ansiEnabled=true` `:145` (SyncTERM-style PETSCII still wants ANSI colour), 40x25 `:146-147`, `emit('terminal-resize')` `:149` | the one site a WEB session becomes PETSCII; `command.handler.ts:1504-1506` prints the banner afterwards |
| `pre-login.ts:54-80` (`handlePreLoginInput`) | c64 branch | same as the live c64 branch (`petsciiMode` `:56`, `ansiEnabled` `:57`, 40x25 `:58-59`) | DEAD per `command.handler.ts:1398-1403`; listed because the task names it |

A session-lifetime tap installed at these sites has to be installed on the
socket the session will actually use: for telnet the first emitter (the one
`setupTelnetSSHHandler` attached at `index.ts:1097`) AND, if anything is to be
seen during BBSTITLE, the second (`c64-detected-handler.ts:36`, which no
caller can reach from outside that function); for web the socket.io socket,
which is replaced on reconnect (`auth-socket-handlers.ts:177-184` re-installs
the modem emulator on the new socket for exactly that reason).

---

## 5. Why the session-lifetime tap broke, and which pins broke it

Commit `98cee332c` left the tap on `socket.emit` for the session. The C64 door
adapter installs its own wrapper over it (`c64-door-adapter.ts:278-293`) and
on uninstall restores what it found (`restoreEmit` `:333-344`):
`adapter.original` when `hadOwnEmit` (`:338-339`), else `delete target.emit`
(`:342`). With the tap underneath, "what it found" was the tap, so the tap was
re-installed after the door and `socket.emit !== originalEmit` held. The
identity pins:

- `web/backend/tests/doors/door-min-columns-gate.test.ts:393,421` (c64
  session, adapter door), `:426-431` (80-column session), `:497-501` (gate
  leaves the socket untouched). Mock socket: a plain object literal with
  `emit` as an OWN property (`:94-102`), so `hadOwnEmit` is true and the
  adapter restores by value.
- `web/backend/tests/doors/door-min-columns-dispatch.test.ts:329-343`,
  `:348-361`, `:524-539`, `:550-570` (`each` over door types through the real
  Enter dispatch).
- `web/backend/tests/amiga-emulation/c64-door-adapter-teardown.test.ts:87,125,137,149`
  and `web/backend/tests/petscii-frame/c64-door-adapter.test.ts:190-244`
  (unit pins of the adapter itself, including `:264` - `emit` inherited to
  start on a prototype-backed socket, so the adapter must `delete`, not
  assign; `:267` asserts the own property exists while installed).
- `web/backend/tests/utils/modem-emulator.util.test.ts:321,326` pins `emit`
  identity around the modem wrapper.
- `web/backend/tests/doors/delete-door-registration.test.ts` also went red in
  the wave (7 tests across the three suites); it carries no `emit` identity
  assertion of its own (`grep -n "emit).toBe\|originalEmit"` is empty), so its
  failure was collateral of the shared door-launch path, not a pin.

The invariant those pins encode: **after a door, `socket.emit` is the exact
function that was there before the door.** Any session-lifetime wrapper that
is installed AFTER those tests capture `originalEmit` - which, for a test that
builds a fresh mock socket and calls `executeDoor`, means any wrapper
installed inside the door path - violates it. A wrapper installed BEFORE the
capture (at session creation, like `socket-handlers.ts:176`) does not: the
pins compare against whatever `socket.emit` was when the test started.

---

## 6. What the client machine (T3/M3) sees that T2 does not

Enumerated, since concern (b) hinges on it:

1. Every `ansi-output` outside the four scopes (2.2, "every other" row):
   menus, prompts, door output, chat, error lines, the SIMULATING banner,
   `startPagination`'s first page (`screen.handler.ts:2800`) and a resumed
   ANSI segment's content (`:2996`, `:2999`).
2. Every `petscii-output` string, inside or outside a scope (the tap does not
   handle the event, `screen.handler.ts:1536-1547`; T3 transduces it at
   `BBSTerminal.tsx:2131`).
3. `BBSApi.writePetscii(Buffer)` raw bytes (`BBSApi.ts:308`; T3 observes at
   `BBSTerminal.tsx:2151`, T2 never sees them).
4. The pre-session prefix: everything between `terminal-resize {40,25}` and
   the first `.seq`/clear.
5. Flush resolutions at each keypress (`BBSTerminal.tsx:2723`), i.e. a
   trailing `\r` becoming a `$9D` walk at input time.
6. Direct `writeTerm` writes from the terminal component itself
   (`BBSTerminal.tsx:863-869`, seam at `:865`; connection banners, the Guru
   screen via `:870`).
7. Client-side modem pacing is a delay only (`enqueuePetscii` is unpaced,
   `:839-846`, and the canvas is explicitly not mirrored, `:2167-2169`); it
   changes nothing T3 sees.

What T2 sees that T3 does NOT: nothing - T2's direct feeds are the same bytes
that go out on `petscii-bytes`, which T3 observes. The one-way gap is the
whole story.

For a telnet C64 the same list applies with T1 in place of T3, minus items
4-6 (T1 is created on the first PETSCII emit and sees
`completeRealC64Connect`'s resync clear at `command.handler.ts:1060`).

**Blessed doors are in the list, not outside it.** No `ansi-output` literal
exists under `sdk/engines/ui/blessed/**`, but `createScreen` gives blessed
`output: outputFn` (`sdk/utils/blessed-helpers.ts:991-1006`, built
`:984-989`), and `outputFn` is `bbs.write` - which for a server-side door is
`BBSApi.write` (`BBSApi.ts:165-167`) and therefore
`socket.emit('ansi-output', ...)`. The teardown clear at
`sdk/utils/blessed-helpers.ts:1085-1093` uses the same seam. So every blessed
frame passes the same choke as any other door text, and T2 is blind to all of
it.

---

## 7. Levels a fix could live at (no recommendation here)

### Level A - transport boundary: one session transducer, fed by the choke

Feed ONE session-lifetime `AnsiToPetsciiTransducer` from the per-session
choke, and make the render use ITS machine. On telnet the choke and the
transducer already exist (`connection-emitter.ts:95-143`, T1); the change is
that `petsciiTransducerFor(session)` in `petscii-screen.render.ts:161`
returns `session.petsciiTransducer` instead of a second object, and T2
disappears. On web there is no server-side conversion, so the choke
(`socket-handlers.ts:176-183`, or a sibling wrapper installed at the same
point) would have to run `transduce` on every `ansi-output`/`petscii-output`
string and `observe` on every `petscii-bytes` purely to keep the model - the
wire is unchanged.

Costs: the web wrapper runs a full ANSI parse over every string for a PETSCII
session (today only T3 does that, in the browser); the model has to be
installed before login and survive socket replacement on reconnect
(`auth-socket-handlers.ts:177-184` is the precedent); `flushPendingPetscii`
semantics must be mirrored on web (flush at input arrival, or accept the
`pending` asymmetry of 2.3); the four scoped taps, `installPetsciiOracleTap`
(`screen.handler.ts:1521-1559`) and `withPetsciiOracleTap` (`:1561-1569`)
become dead code to delete; the second telnet emitter
(`c64-detected-handler.ts:36`) is already keyed on the session so it needs
nothing.

Fails to cover: raw `connection.write` sites (2.1) - none carry PETSCII screen
text today; ZMODEM (correctly excluded); cross-session pushes ARE covered
because they pass the target's choke; a wrapper stacked ABOVE the choke that
swallows a string (the modem emulator queues and later re-emits through
`_directEmit`, which lands on the choke - covered, but with the modem's
timing, not the caller's; the adapter rewrites 80-column frames into
40-column `ansi-output` that then passes the choke - covered). Anything a
future wrapper drops without re-emitting is invisible, as it is to T1/T3.
Item 4 of section 6 (pre-session prefix) is covered only if the wrapper is
installed before the graphics prompt and the session is then flipped, or the
model is reset at the flip.

### Level B - session-lifetime tap at the PETSCII flip sites

Install the tap once, at the sites in section 4, and never uninstall. This is
what `98cee332c` did (on first render, not at the flip), and it is what the
section 5 pins refuse when it is installed after a test's `originalEmit`
capture. Installed at the flip - which for a fresh test socket happens BEFORE
`executeDoor` - the pins would pass, since the adapter would find the tap as
"original" and restore it, and the test captured the tap as `originalEmit`.

Costs: five install sites (section 4, four live), each on a different socket
object (first emitter, second emitter, web socket, replacement web socket);
the tap must be re-applied on web reconnect; ordering with the ANSI filter,
modem emulator and adapters is whatever install order happens to be, so the
tap may sit below the modem queue (sees text before it is delayed - fine) or
above it (sees it when the modem releases it - also fine, but different from
the caller's clock); T1 and T2 still both exist on telnet.

Fails to cover: `_directEmit` callers (`screen.handler.ts:2332, 2346, 2580`)
when the tap is above the ModemEmulator's captured emit; `petscii-output`
unless the tap is widened; the pre-session prefix (item 4); the second
emitter's BBSTITLE hand-off, which no external caller can wrap; the
`delete socket.emit` branch (`screen.handler.ts:1557`) becomes a permanent own
property on socket.io sockets, which
`web/backend/tests/petscii-frame/c64-door-adapter.test.ts:264` pins against
for the adapter and would need its own ruling for the tap; the tap is still a
THIRD wrapper on the stack doing what T1 already does.

### Level C - keep the scoped taps, accept the drift

Document the four scopes as the contract and audit new `.seq`-adjacent emits
into them. `.seq` values are encoded against T2 only inside a `.seq` render;
the first byte of most `.seq` screens is `$93` via `shouldClear`
(`screen.handler.ts:1881, 1905-1911`, set membership `:349`), which homes T2
and the terminal together regardless of what came before.

Costs: nothing now. Every `.seq` that is NOT in `SCREENS_REQUIRE_CLEAR` and is
displayed after arbitrary ANSI (a bulletin, a door, a chat page) encodes its
first value against a stale cursor/bank/pen; `~SS_` includes that resolve to
`.TXT` are covered but a `.TXT` DISPLAYED DIRECTLY before a `.seq` is not; the
`petscii-output` blindness stays; the flush asymmetry of 2.3 stays; the
pattern class in 2.3 (buffered `emitText` flushed by timer after a scope)
stays; the untapped `startPagination` / segment emits (`:2800`, `:2877`,
`:2996`, `:2999`) stay. Two server transducers per telnet session remain.

---

## 8. Questions answered while verifying this document

Recorded here rather than left open, with the evidence:

- **Does anything after BBSTITLE use the second telnet emitter?** No. It is a
  function-local `const` in `handleC64Detected` (`c64-detected-handler.ts:36`)
  used only at `:37, 45, 46`; it is never assigned to `connection.emitter`
  (which was set at `index.ts:1097` and stays the first one). A Level B tap on
  the first emitter therefore misses only the BBSTITLE hand-off, and no later
  traffic.
- **Which route do blessed door frames take?** `bbs.write` ->
  `BBSApi.write` -> `socket.emit('ansi-output', ...)` (see section 6). They
  pass the choke.
- **Is `paged.eventName === 'petscii-output'` reachable?** Partly, and it is
  inert today. `screen.handler.ts:2072`'s ternary is dead on the `.TXT` path -
  `displayScreen` returns at `:1941` for every `isPetscii` screen, so
  `eventName` there is always `'ansi-output'`. But a paused `.seq` DOES set
  `screenSegments.eventName = 'petscii-output'` (`:1776`, with the comment at
  `:1772-1775` saying it is never used), and `processNextScreenSegment` copies
  it into `paged.eventName` (`:3011`). On resume, `kind === 'doPause'` skips
  the erase-line (`:2823`) and `emitPage` emits `lines.slice(1,1)` plus no
  prompt - the empty string - on `petscii-output` (`:2838`). So the event is
  reached, the tap ignores it, and what it carries is zero bytes.

## 9. Open questions

1. **Does the web choke need to model at all?** If Level A is chosen, the
   server transducer for a web `P` session exists only to track T3. Is a model
   that can diverge from T3 (different creation time, different flush points)
   better than T3 reporting its cursor back? Nothing today carries client
   state to the server; `terminal-size` is the only client->server geometry
   message (`socket-handlers.ts:219-235`, and
   `applyClientReportedGeometry` refuses to write geometry for a PETSCII
   session, `:232-235`).
2. **Which emit is "original" on socket.io?**
   `web/backend/tests/petscii-frame/c64-door-adapter.test.ts:264` pins that a
   socket.io socket starts with `emit` INHERITED, but in production
   `socket-handlers.ts:145` and `:177` have already assigned an own property
   before any door runs. The `hadOwnEmit`/`delete` logic in the adapter
   (`c64-door-adapter.ts:259, 338-342`) and in the tap
   (`screen.handler.ts:1534, 1556-1557`) is exercised only by tests on fresh
   mocks. A Level A wrapper installed at registration makes the question moot;
   Level B inherits it.
3. **`BBSApi.joinRoom`/`createRoom` (`BBSApi.ts:1237, 1309`) and
   `createDoorSocketWrapper`'s telnet branch (`door.handler.ts:151-153`)
   restore a BOUND copy unconditionally.** Any wrapper installed during the
   call is dropped, and after the call `socket.emit` is a bound function that
   is no longer `===` to what was there. These pre-date the wave; are they in
   scope for whichever level lands?
4. **T2 disposal on telnet.** `disposePetsciiRenderCtx` has no telnet caller;
   T2 dies with the session object on `close` (`index.ts:1316-1330`), as T1
   does. `session.screenSegments` parked with a `petsciiCtx`
   (`screen.handler.ts:1767-1781`) is likewise dropped. Is a reused telnet
   session object possible (node reassignment - `c64-door-adapter.ts:94-104`
   says a connection can be handed a new session mid-door), and if so does a
   stale T2 travel with it?
5. **Flush point on web under Level A.** Where does the server-side model
   flush for a web session - on every input event from the socket
   (`socket-handlers.ts`' `command` handler), matching `index.ts:1144`, or
   never? T3 flushes at `BBSTerminal.tsx:2723` before the key is sent, so "at
   input arrival" is the matching point.
6. **The six cross-session emit sites** (`handlers/chat/chat.handler.ts:342`
   etc.) target `counterpart.socket` / `targetSocket`. For a telnet target
   that is the emitter literal; for web the socket.io socket. Both pass the
   target's choke under Level A. Under Level B they pass the target's tap only
   if it was installed on THAT socket object; is `session.socket` always the
   object the tap was installed on after a web reconnect?
7. **Client-side and hybrid doors.** A client door's frames travel as
   `door:message:<sessionId>` (`web/backend/src/doors/client-door-bridge.ts:427`)
   and are rendered by the door's own browser bundle, not by `writeTerm`. Do
   any of them draw onto a PETSCII canvas session, and if so which model - if
   any - sees those bytes? Not traced here.
8. **`startPagination` and the resumed ANSI segment.** `:2800`, `:2877`,
   `:2996` and `:2999` emit page content outside every scope while the four
   taps cover only the prompts around them. Under Level C these are the
   nearest untapped neighbours of a `.seq`; should they join the scopes, or is
   the scope list intentionally limited to prompts?
