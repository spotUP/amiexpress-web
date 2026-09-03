---
date: 2026-09-03
topic: SSH, telnet and web (socket.io) transports - entry points, per-surface handling, and every observed divergence from the web terminal
tags: [telnet, ssh, socketio, transport, parity, connection-emitter, socket-handlers, petscii, zmodem, doors, research]
status: draft
---

# SSH / telnet / web: what each transport actually does

Research only. Documents what IS on `feat/installed-door-link` as of 2026-09-03.
Every `file:line` below was opened against the working tree while writing this
document, or produced by a scripted run against the live dev backend
(`logs/backend.log` READY banner: HTTP/socket.io on 3001, telnet on 64128, SSH
on 31337).

Inputs: `RULES.md`, `~/.claude/CLAUDE.md` phase 1,
`thoughts/shared/research/2026-09-02_petscii-oracle-transport-boundary.md`
(the transport egress map for a PETSCII session - reused, not redone; note its
`connection-emitter.ts` line numbers predate a refactor and the current ones
are used here), and the source cited below.

No recommendations. Section 6 is the numbered divergence ledger.

Paths are repo-relative on first mention and shortened afterwards:

| short name | full path |
|---|---|
| `index.ts` | `web/backend/src/index.ts` |
| `telnet-server.ts` | `web/backend/src/server/telnet-server.ts` |
| `ssh-server.ts` | `web/backend/src/server/ssh-server.ts` |
| `ws-terminal-server.ts` | `web/backend/src/server/ws-terminal-server.ts` |
| `connection-emitter.ts` | `web/backend/src/server/connection-emitter.ts` |
| `socket-handlers.ts` | `web/backend/src/server/socket-handlers.ts` |
| `auth-socket-handlers.ts` | `web/backend/src/server/auth-socket-handlers.ts` |
| `session-manager.ts` | `web/backend/src/server/session-manager.ts` |
| `c64-detected-handler.ts` | `web/backend/src/server/c64-detected-handler.ts` |
| `command.handler.ts` | `web/backend/src/handlers/command.handler.ts` |
| `pre-login.ts` | `web/backend/src/handlers/command-handler/pre-login.ts` |
| `screen.handler.ts` | `web/backend/src/handlers/screen.handler.ts` |
| `door.handler.ts` | `web/backend/src/handlers/door.handler.ts` |
| `client-door-bridge.ts` | `web/backend/src/doors/client-door-bridge.ts` |
| `BBSApi.ts` | `web/backend/src/doors/BBSApi.ts` |
| `login-connect.service.ts` | `web/backend/src/services/login-connect.service.ts` |
| `login-post.service.ts` | `web/backend/src/services/login-post.service.ts` |
| `game-mode.service.ts` | `web/backend/src/services/game-mode.service.ts` |
| `screen-width.util.ts` | `web/backend/src/amiga-emulation/xim/screen-width.util.ts` |
| `ansi-buffer.util.ts` | `web/backend/src/utils/ansi-buffer.util.ts` |
| `modem-emulator.util.ts` | `web/backend/src/utils/modem-emulator.util.ts` |
| `amiga-text-decode.util.ts` | `web/backend/src/utils/amiga-text-decode.util.ts` |
| `door-input-manager.ts` | `sdk/utils/door-input-manager.ts` |
| `blessed-helpers.ts` | `sdk/utils/blessed-helpers.ts` |
| `BBSTerminal.tsx` | `packages/terminal/src/components/BBSTerminal.tsx` |

---

## 1. Entry points and session setup

### 1.1 The one fact everything else hangs off

`buildConnectionEmitter` (`connection-emitter.ts:68-181`) is the socket.io-shaped
object telnet and SSH hand to every BBS handler. Its `emit`
(`connection-emitter.ts:90-140`) is an if / else-if chain over exactly three
event names:

- `'ansi-output'` - `:92-116`
- `'petscii-output'` - `:117-124`
- `'petscii-bytes'` - `:125-139`

There is **no `else`**. No fall-through to the synthetic bus, no log, no throw.
Every other `socket.emit(name, payload)` a handler makes on a telnet or SSH
session returns `undefined` and the payload is discarded.

The inbound direction is asymmetric. `on` (`:153-164`) and `off` (`:165-173`)
route a fixed transport set - `data, close, error, ready, terminal-type,
window-size` (`:157`, `:166`) - to the real connection and **everything else to
a private `EventEmitter`** (`:69`). So `socket.on('command')`,
`socket.on('mouse-click')`, `socket.on('disconnect')` all register fine and
simply never fire. The only thing that ever fires one is
`emitter.emitInternal('command', input)` at `index.ts:1235`.

A census of every event name the backend emits (over `web/backend/src`,
`grep -rhoE "\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]"` , 2026-09-03) returns 1831
`ansi-output`, 10 `petscii-output`, 2 `petscii-bytes` - and 149 distinct event
names in total, i.e. **146 the emitter does not handle**. Those 146 are the
divergence surface. (Reproduce:
`grep -rhoE "\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]" --include="*.ts" web/backend/src | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" | sort -u | wc -l`.)

### 1.2 Telnet

`TelnetServer` is constructed at `index.ts:1801`, its `'connection'` event wired
to `setupTelnetSSHHandler(connection, "telnet", io)` at `:1802-1804`, and
`'c64-detected'` to `handleC64Detected` at `:1806`. A second, optional
`TelnetServer` with `{ petsciiDefault: true }` is built at `:1829` when
`TELNET_PETSCII_PORT` is set (not set on this dev box).

`TelnetServer.handleConnection` (`telnet-server.ts:643-822`):

| step | line |
|---|---|
| localhost probe drop (production only) | `:650-656` |
| `socket.setNoDelay(true)` | `:661` |
| IP-ban check | `:663-668` |
| connection rate limit | `:671-676` |
| `new TelnetConnection(socket, {petsciiDefault})` | `:679` |
| `createSession(nodeId, {connectionType:'telnet', ...})` | `:686-692` |
| `setSession(connection.sessionId, session)` | `:696` |
| forward `data` / `window-size` / `close` / `error` | `:699-715` |
| emit `'connection'` (this is what attaches the emitter) | `:718` |
| `showPrompt()` - C64 branch or `runPreLoginConnect` | `:723-777` |
| `once('terminal-type')` -> stash flags, `showPrompt()` | `:780-795` |
| synthetic `terminal-type` for the dedicated PETSCII port | `:797-816` |
| 500 ms TTYPE timer -> `showPrompt()` | `:819-821` |

`TelnetConnection`'s constructor (`telnet-server.ts:140-163`) immediately runs
`initializeTelnet()` (`:169-194`), which sends, in order: `DONT LINEMODE`,
`WONT LINEMODE`, `DO TTYPE`, `DO NAWS`, `WILL ECHO`, `WILL SGA`, `DO SGA`.
`peerWillState` / `peerDoState` (`:120-121`) exist to stop RFC 854 ack loops
that used to corrupt ZMODEM (`:107-119`).

### 1.3 SSH

`SSHServerImpl` is constructed at `index.ts:1861` with `hostKeys` from
`SSHKeyUtil.loadHostKey()` (`index.ts:1846`, body
`web/backend/src/utils/ssh-key.util.ts:251-267`), and its `'connection'` event
wired to `setupTelnetSSHHandler(connection, "ssh", io)` at `index.ts:1862-1864`.

`SSHServerImpl.handleConnection` (`ssh-server.ts:259-337`): IP ban `:263-267`,
rate limit `:270-274`, `new SSHConnection(client)` `:277`, then - and this is the
ordering difference from telnet - the BBS session is created inside
`connection.on('ready')` (`:283-314`), i.e. **only once the client asks for a
shell**, not at TCP accept. `'connection'` is emitted last, at `:336`.

`SSHConnection` (`ssh-server.ts:29-182`):

- `handleAuthentication` `:64-71`: `ctx.accept()` for `method === 'password'` or
  `'none'`, `ctx.reject()` for anything else. The doc comment `:51-63` states
  the intent: SSH is a pure transport and the BBS login gates access.
- `session.on('pty')` `:83-91`: stores `info.cols` / `info.rows` into
  `terminalWidth` / `terminalHeight` and accepts. **`info.term` is read by
  nobody** and **no event is emitted**.
- `session.on('window-change')` `:93-102`: updates the same fields AND emits
  `'window-size'`.
- `session.on('shell')` `:104-121`: `this.stream = accept()`, forwards
  `stream.on('data')` as `'data'`, emits `'ready'`.
- `session.on('exec')` `:123-127`: rejected.
- `write` `:134-138`: `this.stream.write(data)` when a stream exists, silent
  no-op otherwise.

### 1.4 Web (socket.io)

`io` is configured at `index.ts:579-606`: `pingTimeout: 120000` (`:585`),
`pingInterval: 25000` (`:586`), `maxHttpBufferSize: 4 MB` (`:595`),
`connectionStateRecovery` 2 min (`:597-600`), `transports: ['websocket',
'polling']` (`:601`), `connectTimeout: 60000` (`:605`).

`io.on('connection')` starts at `index.ts:1355`. Before any session exists it
prints a banner no other transport gets - `index.ts:1576-1629`:

```
/X Native Telnet:  Searching for free node...
/X Native Telnet:  Successful connection to node N
CONNECT 19200
**EMSI_IRQ8E08
Welcome to <bbsName>, located in <location>
Running AmiExpress v5.6 ...
Web port <ver> by Spot/Up Rough
Registered to ...
Connection occurred at ...
```

then **waits 3000 ms** (`index.ts:1633`), creates the session (`:1637`),
registers all socket handlers (`registerSocketHandlers`, `:1649`) and finally
calls the shared `runPreLoginConnect` (`:1656-1662`).

`setupTelnetSSHHandler` deliberately prints no banner - the comment at
`index.ts:1338-1347` says it was removed "to bring the two transports back into
alignment". The web banner it was aligned to is still there.

### 1.5 `setupTelnetSSHHandler` (`index.ts:1075-1348`)

- `:1092` build the emitter, `:1098` attach it as `connection.emitter`.
- `:1100-1135` `attachTransferSender`: stamps `session.connectionType = type`
  (`:1102`), installs `transferRawSend` (`:1111-1113`) and
  `transferRawSendUnescaped` (`:1121-1131`, the only place `type === 'telnet'`
  is branched on in this file).
- `:1138-1255` `connection.on('data')` - the whole input path (section 2.3).
- `:1258-1282` `terminal-type` -> `applyTerminalTypeReport`.
- `:1285-1311` `window-size` -> `applyWindowSizeReport`.
- `:1314-1328` `close` -> `sessions.delete(connection.sessionId)` and
  `nodeManager.releaseSession`.

### 1.6 A fourth transport exists

`attachWSTerminalServer` (`ws-terminal-server.ts:110-154`) mounts a raw
WebSocket terminal at `/ws/terminal` and is wired at `index.ts:1771-1784`, where
it creates its session with `connectionType: "telnet"` (`:1774`) and calls the
same `setupTelnetSSHHandler` (`:1783`). It never calls `runPreLoginConnect`, so
a `/ws/terminal` caller gets no FRONTEND screen, no graphics prompt, no AREXX
`login` trigger - only whatever the first keystroke provokes. Not driven in the
walk; listed because it shares every telnet code path below.

---

## 2. Surface by surface

### 2.1 Terminal type, size, and where the session geometry is set

The single gate is `applyClientReportedGeometry` (`screen-width.util.ts:60-70`):
it refuses any reported size for `petsciiMode === true` and otherwise writes
`screenWidth` / `screenHeight` verbatim. Its two wrappers are
`applyTerminalTypeReport` (`:98-106`) and `applyWindowSizeReport` (`:122-138`).

| | telnet | SSH | web |
|---|---|---|---|
| terminal TYPE source | TTYPE subnegotiation, `telnet-server.ts:320-357`, classified by `classifyTerminalType` `:73-110` | **none** - the pty request's `info.term` is never read (`ssh-server.ts:83-91`) | none; the browser is assumed |
| where type lands | `applyTerminalTypeReport` via `index.ts:1274` -> `session.terminalType = 'c64' \| 'modern'` (`screen-width.util.ts:103`) | never set | never set |
| terminal SIZE source | NAWS, `telnet-server.ts:274-288`, emitted at `:282` | `window-change` only (`ssh-server.ts:93-102`); the **pty request does not emit** | `terminal-size` event, `socket-handlers.ts:233-268` |
| initial geometry | 80x24 default (`session-manager.ts:183-184`) until NAWS arrives | 80x24 default, **forever**, unless the user resizes the window after connecting | 80x24 default until the browser's `terminal-size` |
| `unicodeCapable` | from TTYPE (`telnet-server.ts:790`) | **always `undefined`** (`session-manager.ts:189` defaults it to `true` only for `connectionType === 'web'`) | `true` |

`unicodeCapable` is not cosmetic: `blessed-helpers.ts:979-996` reads
`bbs.unicodeCapable` (`BBSApi.ts:264-271`) into `needsAmigaConversion` (`:980`)
and `fullUnicode` (`:994`). Every blessed door therefore renders in
Amiga/ACS-fallback mode for **every** SSH caller regardless of their real
terminal, and in Unicode mode for every web caller.

### 2.2 The graphics prompt and the P / R answers

`ANSI_GRAPHICS_PROMPT` (`login-connect.service.ts:73-74`) is
`"\r\nCOMMODORE 64: PRESS <DEL>\r\nANSI, RIP, PETSCII OR NO GRAPHICS (A/R/P/N) [Q=SKIP BULLETINS]? "`
and is emitted by `runPreLoginConnect` (`:121`) for all three transports.

Two hand-rolled fallbacks print a **different, older prompt string** when the
emitter is missing: `telnet-server.ts:774` and `ssh-server.ts:312`, both
`'\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n) [add Q to skip bulletins]?'`.

The answer is line input, parsed by the live dispatcher at
`command.handler.ts:1446-1596` (the copy in `pre-login.ts:194-249` is dead per
`command.handler.ts:1398-1403`), which calls the one implementation
`applyGraphicsAnswer` (`pre-login.ts:142-188`). Matching is `String.includes`,
so `P` beats `R` beats `N` no matter where the letters sit in the typed string.

- **P** (`pre-login.ts:148-162`): `petsciiMode=true`, 40x25,
  `resetPetsciiModel`, then `socket.emit('terminal-resize', {cols:40,rows:25})`
  at `:162`. On web that emit **is** the mechanism (`BBSTerminal.tsx:2268-2278`
  switches to the PETSCII canvas). On telnet/SSH it is discarded; what makes
  PETSCII work there is `sessionWantsPetscii`
  (`web/backend/src/utils/petscii-session-model.ts:39-41`) flipping the emitter
  into `transducePetsciiAtChoke` (`connection-emitter.ts:99`).
- **R** (`pre-login.ts:163-171`): sets `ripMode`, emits nothing. The screen
  loader then prefers `.RIP` files and `screen.handler.ts:1866-1870` sends
  `'\x1b[1!' + content + '\x1b[2!\r\n'`. The consumer is the browser
  (`BBSTerminal.tsx:2121-2145` -> RIPtermJS). **There is no server-side RIP
  rasteriser.** A telnet or SSH caller who answers R receives `ESC [ 1 !`
  followed by raw RIPscrip source (`!|` commands) as literal text.
- **N / A / empty** (`:172-179`): `ansiEnabled = !hasN`, 80x24.
- **Q suffix** (`:182-187`): `quickFlag`, skip bulletins. Orthogonal.

A real C64 on telnet never reaches this: `telnet-server.ts:734-756` (TTYPE or
DEL probe) short-circuits to `c64-detected`, and `command.handler.ts:1405-1422`
/ `:1455-1472` handle the slower typist. SSH has neither branch - there is no
C64 detection on SSH at all.

### 2.3 Keyboard input

**Telnet / SSH** - one handler, `index.ts:1138-1255`:

1. `flushPendingPetscii(connection)` `:1145` (the output/input boundary).
2. raw-transfer sink bypass `:1147-1155`.
3. DEL-probe C64 classification, guarded to `DISPLAY_CONNECT` / `ANSI_PROMPT`
   with an unset `terminalType` `:1178-1190`.
4. bytes -> string: `convertPetsciiInputToAscii(data)` for a PETSCII session,
   otherwise `data.toString("utf-8")` `:1196-1202`.
5. NUL strip for telnet only `:1205-1207`.
6. Ctrl+C -> `scriptAbortHandler` `:1217-1224`.
7. door routing `:1227-1249`: `emitter.listenerCount('command') > 0` ->
   `emitInternal('command', input)`; else `session.doorInputHandler(input)`;
   else `emitter.emit('door:input', input)` - **which the emitter discards**
   (`connection-emitter.ts:90-140` has no such branch), so that fallback is a
   dead end on telnet.
8. otherwise `handleCommand(emitter, session, input, io)` `:1252-1253`, with the
   **whole TCP chunk as one call**.

**Web** - `socket.on('command')`, `socket-handlers.ts:584-826`, which in
addition to the above does: `flushPetsciiModel` `:602`,
`sessionLogManager.captureInput` `:605`, `checkPauseHandler` line accumulation
with echo `:618-655`, `flagPauseHandler` `:658-695`, `handleChatModeInput`
`:714-716`, `session.clientDoorActive` short-circuit `:735-745`,
`session.gameModeEnabled` short-circuit `:748-750`, the BBS-pause-beats-door
intercept `:755-770`, `markDoorInput` `:764`/`:774`, an SGR-mouse drop
`:801-803`, SS3->CSI normalisation `\x1bO` -> `\x1b[` `:807-809`, and finally
**one `handleCommand` call per character** unless the input starts with `\x1b[`
`:810-824`.

Nine of those eleven branches have no telnet/SSH equivalent. Two consequences
are structural rather than cosmetic:

- **Arrow keys in application-cursor mode.** A terminal in DECCKM sends
  `ESC O A`. Web rewrites it to `ESC [ A` (`socket-handlers.ts:807-809`);
  telnet/SSH pass it through untouched.
- **Chunking.** Telnet delivers whatever the TCP segment held. Only four
  handlers in `command.handler.ts` accommodate multi-character input -
  `:454-473` (line editor), `:1486-1500` (ANSI prompt), `:1753-1766` and
  `:1897-1910` (login). Every other subState receives a whole paste or a fast
  burst as a single `data` string.

**Game mode.** `enableGameMode` (`game-mode.service.ts:20-29`) sets
`session.gameModeEnabled` and emits `'game-mode'` `:28`; `disableGameMode`
(`:36-46`) mirrors it. The browser answers by sending `key-down` / `key-up` /
`keys:state`, handled at `socket-handlers.ts:515-548`, `:551-569`, `:493-512`.
**No telnet/SSH path produces those events** - they are DOM events forwarded by
`BBSTerminal.tsx`, and there is no server-side decoder. So on telnet
`session.keyState` stays `{}`, `session.doorKeyStateHandler` is never called and
`session.keyRepeatManager` is never driven.

The SDK's held-key tracker makes that worse rather than degrading cleanly.
`door-input-manager.ts:254-284` documents that it "silently does nothing when
the transport has no key events - telnet and SSH sessions", but its guard is
`if (!bbs?.onKeyDown || !bbs?.onKeyUp) return;` (`:258`) - a **method-existence**
check. `BBSApi` defines both unconditionally (`BBSApi.ts:591-597`, `:604-616`),
so on telnet the guard passes, `keyStateActive = true` is set (`:282`), and
`isKeyStateActive()` (`:293-295`) reports **true** while `held` stays
permanently empty. Doors branch on exactly that to choose held-key movement
over their character handler: `Doors/joust/index.ts:424,435`,
`Doors/zoo-keeper/index.ts:373,495`, `Doors/pengo/index.ts:406,418`,
`Doors/frogger/index.ts:734,753`, `Doors/super-qix/index.ts:727,732,915`,
`Doors/pipe-dream/index.ts:427,438`, `Doors/galaga/index.ts:405,408,423`,
`Doors/donkey-kong/index.ts:438,448`.

**PETSCII keymap.** Input from a PETSCII session is converted by
`convertPetsciiInputToAscii` (`index.ts:1199`); the web equivalent lives in the
browser (`BBSTerminal.tsx`, flushed before each key at its own transducer). The
DEL probe classifier is `classifyFirstKeypress`
(`web/backend/src/utils/c64-detect.util.ts`), called only from
`index.ts:1185` - telnet and SSH share it, web never runs it.

### 2.4 Output pacing

Three mechanisms, in order from the producer:

1. **`AnsiBuffer`** (`ansi-buffer.util.ts`). `emitText` (`:195-207`) and
   `emitPrompt` (`:216-218`) are the universal choke; the buffer flushes on a
   16 ms timer (`:77-83`), at 8192 bytes (`:58-61`), or immediately when
   `flushDelay === 0` (`:64-67`). Buffers live in a module-level
   `Map<string, AnsiBuffer>` keyed by `socket.id` (`:154`, `:163-185`) - which
   for a telnet emitter is `connection.sessionId` (`connection-emitter.ts:145`),
   unique per connection. Cleanup is registered as
   `socket.on('disconnect', ...)` (`:176-182`); `'disconnect'` is not in the
   emitter's transport set (`connection-emitter.ts:157`) and nothing calls
   `emitInternal('disconnect')`, so **every telnet and SSH connection leaks its
   `AnsiBuffer` entry for the life of the process and never flushes what it was
   holding at close**.
2. **Server-side `ModemEmulator`** (`modem-emulator.util.ts:263-305`). Installed
   for all transports at `login-post.service.ts:147-158`, plus
   `auth-socket-handlers.ts:205-211` (web reconnect), the `W` command
   (`web/backend/src/handlers/commands/info-commands.handler.ts:1325-1335`) and
   ANSI-animation playback (`screen.handler.ts:1927-1932`).
3. **Client-side modem emulator**, `packages/terminal/src/utils/modem-emulator.ts`,
   driven by the `'modem-speed'` event (`BBSTerminal.tsx:2257-2265`) and
   short-circuited during doors by `'door-active'` (`:2542-2549`).

So web is paced twice (server and browser) and telnet/SSH once (server only).
The `'modem-speed'` and `'door-active'` emits that turn the client pacing off
during a door are discarded on telnet, which is harmless in itself - but it
means a door that zeroes the speed for itself (`door.handler.ts:2029-2034`)
still gets the server throttle on telnet unless the server emulator is the one
being disabled.

The `_directEmit` bypass used by the screen wipes (`screen.handler.ts:2332`,
`:2346`, `:2580`, resolved at `:2294` / `:2564`) reaches the emitter literal on
telnet and the session-log wrapper on web - the same asymmetry the PETSCII
research recorded, unchanged.

### 2.5 ANSI filtering, CRLF, and the byte encoding

**`installAnsiFilter`** (`login-post.service.ts:84-99`, installed at `:139`) is
transport-neutral - it wraps whichever emitter `runPostAuthLogin` was given, and
that runs for web (`auth-socket-handlers.ts:610-614`) and telnet/SSH
(`command.handler.ts:1872-1876`) alike. It strips **only SGR**:
`AnsiUtil.stripAnsiForPlainText` is `text.replace(/\x1b\[[0-9;]*m/g, '')`
(`web/backend/src/utils/ansi.util.ts:168-171`). Cursor motion, erase, the RIP
`\x1b[1!` framing and DEC private modes all pass. It is gated on
`session.ansiMode === false || user.ansi === false`, **not** on the
`ansiEnabled` the graphics prompt sets (`pre-login.ts:174`), so answering `N`
does not engage it.

**CRLF.** Only the non-PETSCII telnet/SSH branch normalises:
`connection.write(data.replace(/\r?\n/g, "\r\n"))` (`connection-emitter.ts:112`),
strings only, binary untouched (`:114`). Web gets the string as written.

**Encoding - the largest silent difference.** Screens are read by
`readAmigaTextFile` (`amiga-text-decode.util.ts:167-204`), which auto-detects
CP437 vs ISO-8859-1 (`detectEncoding` `:105-158`) and `iconv.decode`s to a JS
string (`:185`). From there:

- **web**: the string travels as a socket.io string and is handed to
  `term.write()` - xterm.js maps UTF-16 code units straight to glyphs. Correct.
- **telnet**: `connection-emitter.ts:112` passes the string to
  `TelnetConnection.write`, which does `Buffer.from(data)` with **no encoding
  argument, i.e. UTF-8** (`telnet-server.ts:495`), then IAC-doubles and writes
  (`:499-507`).
- **SSH**: `this.stream.write(data)` (`ssh-server.ts:136`); Node's default
  stream encoding is also UTF-8.

Measured on the live board's own title screen:

```
Screens/BBSTITLE.txt          13894 bytes on disk, 240 of them >= 0x80
decoded iso-8859-1 -> UTF-8:  14134 bytes on the wire  (+240)
decoded cp437      -> UTF-8:  14243 bytes on the wire  (+349)
```

and in the live telnet capture (section 3) the last-callers header arrives as
`ESC[1m Â· ESC[0m lAST cALLERS` - `C2 B7`, i.e. `·` as two bytes. A UTF-8
telnet client renders it correctly; SyncTERM, NetRunner, mTelnet, ZOC in CP437
mode and every Amiga terminal render `Â·` and every art line is wider than the
screen. There is no per-transport encoder anywhere - the only `latin1` in the
transport layer is inbound web ZMODEM keystrokes at `socket-handlers.ts:611`.

### 2.6 Mouse

Web: `mouse-click` `socket-handlers.ts:402`, `mouse-drag` `:447`, `mouse-up`
`:458`, `mouse-hover` `:469`, `mouse-wheel` `:482`, all gated on
`session.inDoorManager && session.doorInputHandler &&
session.mouseEventsEnabled`, all JSON-stringified into `doorInputHandler`.
`mouseEventsEnabled` is set for client doors at `door.handler.ts:4431`.
None of these can fire on telnet/SSH.

There is nevertheless a **working telnet mouse path for blessed doors**:
`sdk/engines/ui/blessed/core/program.ts:1030-1043` `enableMouse()` writes
`ESC[?1000h ESC[?1003h ESC[?1006h` through `bbs.write` -> `ansi-output`, and the
terminal's SGR replies come back as ordinary `data` bytes and are parsed
server-side at `program.ts:1468-1503` (`parseSGRMouse` `:1094`). So a blessed
door has mouse on telnet without ever touching `mouseEventsEnabled`; a
browser-side client door has none.

`socket-handlers.ts:792-803` drops stray SGR mouse reports that reach
`handleCommand` - a web-only guard; on telnet the same bytes fall into
`handleCommand` unfiltered.

### 2.7 File transfer

Everything is ZMODEM through `LrzszTransferManager`
(`web/backend/src/services/lrzsz-transfer.service.ts`), which spawns real
`sz`/`rz` with pipes (`:149-152`). `services/transfer-protocol.service.ts` (the
XMODEM/YMODEM/Punter selector) has **zero importers**;
`Protocols/` and `user.protocol` are display-only
(`web/backend/src/handlers/file/file.handler.ts:755`).

- Telnet/SSH raw path: `session.transferRawSend`
  (`index.ts:1111-1113`, identical for both) and `transferRawSendUnescaped`
  (`:1121-1131`, the only `type === 'telnet'` branch). Inbound bytes bypass all
  input handling at `index.ts:1147-1155`.
- Telnet negotiates `TELOPT_BINARY` before spawning lrzsz, in exactly two
  places: download
  `web/backend/src/handlers/commands/user-commands.handler.ts:441-447` and
  RZ upload
  `web/backend/src/handlers/commands/transfer-misc-commands.handler.ts:304-307`,
  both gated `transportType === 'telnet' && rawSend`. The `U`-command upload
  path (`user-commands.handler.ts:243-270`) sends none, on any transport.
- SSH takes the telnet branch everywhere else by falling through
  `type !== 'web'` tests, which means an SSH transfer gets telnet's
  client-quirk workarounds: the MuffinTerm ZCRCE->ZCRCW rewrite
  (`lrzsz-transfer.service.ts:245`) and `rz -b -r` instead of web's `-b -y`
  (`:605-608`).
- Web: `transfer-raw:*` handlers at `socket-handlers.ts:916-970`, kicked off by
  `transfer-raw:init` (`user-commands.handler.ts:266,453,508`,
  `transfer-misc-commands.handler.ts:404`), consumed by
  `BBSTerminal.tsx:679-738`, `:1717`, `:1742`. The older `transfer:*` scaffold
  (`socket-handlers.ts:829-914`) has **no frontend listener at all**.
- `download-file` and `show-file-upload` are a third, HTTP-based mechanism.
  `web/backend/src/handlers/file/download.handler.ts:517-527` guards it by
  transport; `web/backend/src/handlers/transfer/batch-download.handler.ts:214`
  does not, so a telnet caller doing a batch download gets the completion text
  and the stat accounting (`:220-230`) while **zero bytes move**.

### 2.8 Disconnect and reconnect

Web (`socket-handlers.ts:1002-1098`): a 3 s reconnect grace (`:1009`, `:1015`),
then session-log end (`:1028`), MULTICOM clear (`:1038-1047`), internode and
group-chat cleanup (`:1050-1059`), multi-tab check via `socketToUser` (`:1063`),
node release (`:1072`), then a 15 s logoff grace
(`DISCONNECT_GRACE_MS = 15000`, `:60`; timer `:1087-1090`) before
`finalizeDisconnectCleanup` (`:1100+`) writes `Logged off` to the CallersLog
(`:1121`). Reconnect is `socket.on('restore-session')`
(`auth-socket-handlers.ts:97-230`), which cancels the pending disconnect
(`:191`), re-installs the PETSCII choke (`:176`) and the ModemEmulator
(`:199-211`), and emits `session-restored` (`:226`).

Telnet/SSH (`index.ts:1314-1328`): delete the session, release the node. That
is the whole handler. No grace, no CallersLog `Logged off`, no chat cleanup, no
session log end, and **no reconnect path of any kind** - `restore-session` is
registered only inside `registerSocketHandlers`, which
`setupTelnetSSHHandler` never calls.

Two further details of that handler:

- `sessions.delete(connection.sessionId)` (`index.ts:1320`) deletes nothing:
  `setSession` keys the map by `nodeId.toString()` (`session-manager.ts:272`),
  not by the `telnet-<node>-<ts>` sessionId. The `socketToNodeId` entry
  (`:269`) is likewise never removed.
- `nodeManager.releaseSession` is the only thing that actually frees state.

### 2.9 Doors

Type dispatch is `door.handler.ts:1836-1888` (`MCI`, `TS`/`SDK`/`typescript`,
`python`, `arexx`, `web`, `native`, `script`, `XIM/AIM/SIM/TIM/IIM`, `FIM`,
`DD`). A second axis is the manifest `runtime` read at `:1789`:
`'client'` -> `executeClientDoor` then return (`:1791-1795`);
`'hybrid'` -> `executeClientDoor` then fall through to the type switch
(`:1794-1806`).

**68K / XIM, AREXX, Python, MCI and server-side TypeScript doors are
byte-identical across transports.** Every byte leaves through
`socket.emit('ansi-output', ...)`; the only `connectionType` references under
`web/backend/src/amiga-emulation/` are the ZMODEM transport tag
(`amiga-emulation/xim/system-commands.ts:1503-1506`) and the `NODE_DEVICE`
string handed back to a door (`amiga-emulation/session/DoorMessageHandler.ts:2638`).
The C64 adapter keys on `petsciiMode`, not transport
(`web/backend/src/server/c64-door-adapter.ts:125`).

**Client and hybrid doors have no transport gate.** The only gate ahead of a
door is MIN_COLUMNS (`door.handler.ts:1734-1746`), and `sessionColumns`
(`web/backend/src/utils/door-min-columns.util.ts:120-124`) returns 40 only for a
PETSCII session - an ordinary ANSI telnet caller always passes. Walking
`executeClientDoor` (`door.handler.ts:4406-4489`) with the telnet emitter:
`bridge.startSession` (`:4415`) sends two `door:message:<id>` events
(`client-door-bridge.ts:141`, `:150`) - discarded; `modem-speed 0` (`:4427`) -
discarded; `game-mode true` (`:4436`) - discarded; a **no-op**
`doorInputHandler` is installed (`:4441-4449`); `door:load-client` (`:4452-4467`)
- discarded, so the bundle is never fetched. Meanwhile `index.ts:1234` sees the
bridge's `command` listener and routes every keystroke into
`client-door-bridge.ts:213`, which posts it as a discarded `door:message`.
Nothing can end the session: `endSession` (`client-door-bridge.ts:453`) is
reachable only from `socket.once('disconnect')` (`:319`) or a client
`DISCONNECT` (`:349`), and `'disconnect'` never fires on the emitter. A 30 s
`door:message` PING loop (`:433-443`) keeps running against the dead emitter.
`Doors/arkanoid` is the one hybrid whose server half is RPC-only
(`door.handler.ts:2228-2233`, `Doors/arkanoid/server.ts:165,170`); it awaits
`bridge.waitForSessionEnd` (`door.handler.ts:2355`), a promise that on telnet
can never resolve.

The 15 doors declaring `runtime: 'hybrid'` are `arkanoid, card-lobby,
donkey-kong, frogger, galaga, grandmaster, joust, livechat,
neo-blessed-showcase, pengo, pipe-dream, puzzle-bobble, super-qix, voice-chat,
zoo-keeper`. Fourteen of them also export a real SDK door, so on telnet the
server half runs and paints a usable blessed UI - with no browser half, no game
mode, and `isKeyStateActive()` lying (section 2.3).

Door lifecycle events that are discarded on telnet and **do** have a web
consumer: `door-active` (`door.handler.ts:881,936,2255,2276,2293,2397,2501,2540,
2576,2590,3077,3179,3343` -> `BBSTerminal.tsx:2542`), `game-mode`
(`game-mode.service.ts:28,44`, `door.handler.ts:4436`,
`client-door-bridge.ts:513` -> `BBSTerminal.tsx:2595`), `door:input-mode`
(`BBSApi.ts:524` -> `BBSTerminal.tsx:2284`), `terminal-mode` (`BBSApi.ts:483` ->
`BBSTerminal.tsx:2296`), `cursor-style` (`BBSApi.ts:510` ->
`BBSTerminal.tsx:2289`), `modem-speed`, `mask-input`, `terminal-resize`.
Discarded on telnet but **dead on web too** (no listener exists):
`door:status`, `door:ready`, `door:exit`, `door:error`, `set-input-mode`,
`door:await-key`, `door:password-mode`.

`door:await-key` deserves its own line: `DoorMessageHandler.ts:2813` parks the
68K emulator until a `door:keypress` arrives, and nothing in the frontend ever
sends one - a hang on every transport, not just telnet.

### 2.10 Chat and cross-session pushes

Telnet/SSH sessions are structurally invisible to the cross-session machinery:

- `socketToUser` is populated only inside `if (isWeb)`
  (`login-post.service.ts:252-258`) and `auth-socket-handlers.ts:153`, so
  `getSocketIdByUserId` (`session-manager.ts:247-255`) never returns a telnet id.
- the `user:<id>` socket.io room is joined in the same web-only block
  (`login-post.service.ts:260`).
- `io.to(id)` / `io.sockets.sockets.get(id)` operate on the socket.io namespace;
  a `telnet-<node>-<ts>` id is not in it.
- `socketToNodeId` **is** populated for telnet (`telnet-server.ts:696`,
  `ssh-server.ts:296` -> `session-manager.ts:269`), so node-keyed lookups
  resolve - and then fail at the socket.io step.

Concretely: the NM sysop kick (`web/backend/src/handlers/message/message-commands.handler.ts:589-608`)
resolves the node, fails `io.sockets.sockets.get` and prints "Could not find
socket for node N" - **a telnet caller cannot be kicked**. Same for
`web/backend/src/api/node-control-routes.ts:263-276`. Operator chat, internode
chat, DMs, room events and moderation all route through `io.to(...)` or the
`user:` room and never reach telnet.

The single mechanism that does cross is the OLM **queue**:
`web/backend/src/handlers/transfer/olm.handler.ts:334-342` mutates the target
`BBSSession` directly and `processOlmQueue` (`:357-371`) drains it through the
recipient's own emitter. The immediate-display branch two lines above
(`:326-332`, `io.to(targetSocketId).emit('ansi-output', line)`) is taken when
the recipient is sitting at `READ_COMMAND` - i.e. **the common case is the one
that is dropped**.

`hangup` (`DoorMessageHandler.ts:1675-1676`, `BB_DROPDTR`) and
`force-disconnect` (`web/backend/src/handlers/commands/system-commands.handler.ts:216`)
are emitted on the caller's own socket and are discarded on telnet - a 68K door
cannot drop a telnet carrier.

### 2.11 Idle and timeouts

There is **no caller-inactivity timer on any transport**. Web gets socket.io's
`pingTimeout: 120000` / `pingInterval: 25000` (`index.ts:585-586`) as a
dead-connection detector. Telnet sets only `setNoDelay(true)`
(`telnet-server.ts:661`) - no `setTimeout`, no `setKeepAlive`. SSH sets nothing
at all. A half-open telnet/SSH connection holds its node until the OS TCP
keepalive fires.

`IDLE_TIMEOUT` is parsed from the board config
(`web/backend/src/services/bbs-config-file.service.ts:236`) and used only for
the Amiga config export (`web/backend/src/services/amiga-export.service.ts:327,345`) -
never enforced. The 5-minute node sweep
(`web/backend/src/services/node-manager.service.ts:18-26`, `:161-172`) marks DB
rows disconnected after 30 minutes idle; it closes no socket.

### 2.12 SSH auth, host key, telnet options

- **SSH auth**: `ctx.accept()` for `'password'` or `'none'`
  (`ssh-server.ts:65-67`). A stock OpenSSH client offers `none` first, so
  `ssh -p 31337 anyone@host` is admitted with no credential at all; the BBS
  login screen is the only gate. `publickey` and `keyboard-interactive` are
  **rejected** (`:69`), so a client configured to insist on a key fails.
- **SSH host key**: one RSA key, `web/backend/data/ssh/ssh_host_rsa_key`
  (`ssh-key.util.ts:46-48`), loaded into `hostKeys: [hostKey]`
  (`ssh-server.ts:215-217`). The file is an OpenSSH-format key; the live
  handshake in section 3 negotiated `rsa-sha2-512`. No ed25519 or ECDSA key is
  offered.
- **Telnet options**: sent at startup `DONT LINEMODE`, `WONT LINEMODE`,
  `DO TTYPE`, `DO NAWS`, `WILL ECHO`, `WILL SGA`, `DO SGA`
  (`telnet-server.ts:169-194`). `TELOPT_BINARY` is acked reactively
  (`:388-396`, `:460-464`) and initiated only around a ZMODEM transfer
  (section 2.7). Outbound IAC is doubled in `write()` (`:499-507`); inbound
  `IAC IAC` is collapsed in `handleData` (`:236-241`), NUL is dropped outside a
  transfer and CR-NUL collapsed inside one (`:216-234`).

---

## 3. The scripted walk over all three transports

### 3.1 Method

Three throwaway drivers, one shared step list, run sequentially against the
running dev backend on 2026-09-03 07:07-07:14
(scratchpad `.../scratchpad/walk/`, not committed):

- `walk-telnet.js` - raw TCP to 64128, full IAC state machine, answers
  `IAC WILL TTYPE` + `TTYPE IS XTERM`, `IAC WILL NAWS` + NAWS 80x25, acks
  ECHO/SGA. Records the raw stream, the IAC-stripped stream, and the
  negotiation transcript.
- `walk-ssh.js` - `ssh2` client to 31337, `shell({term:'xterm',cols:80,rows:25})`,
  password `anything-at-all`.
- `walk-web.js` - `socket.io-client` to 3001 over websocket, `terminal-size
  {80,25}` on connect, `onAny` recording **every** event, keystrokes sent one
  `command` per character (escape sequences whole).

Shared steps: connect, `A\r` at the graphics prompt, `sysop\r`, `sysop\r`, four
pause dismissals, `WHO\r`, pause, `DOORS\r`, two down-arrows, `q`, `ESC`, `\r`,
`G\r`, `Y\r`.

**One step could not be shared.** `command.handler.ts:1716-1719` returns
immediately when `session.connectionType === 'web'`, so the server-side
username/password loop never runs for a browser and typing at the web
`Username:` prompt does nothing at all. The first attempt proved this: the web
run produced 0 bytes after `Username: ` while telnet and SSH logged in. The web
driver therefore uses the browser's own channel,
`socket.emit('login', {username, password})` (`auth-socket-handlers.ts:253`).
That substitution IS divergence #1 below.

The step list is wall-clock, so the login display flow (bulletins, conference
join, the MultiTop/DreamStats 68K batch) lands on different steps per run and
the per-step byte counts below are not directly comparable past step 05. The
byte-level comparisons in 3.3 are done on step 02, the BBSTITLE screen, which
all three render identically and which is deterministic.

### 3.2 Raw results

Bytes delivered per step, and how many of them are >= 0x80:

```
step               telnet      ssh      web    t-hi s-hi w-hi
01-connect           1239      761     1644       0    0    0
02-graphics-A       14217    14217    13977     480  480  240
03-username            17       17        0       0    0    0
04-password          3951     3951     3944       4    4    2
05-pause1               4        4        4       0    0    0
...                (display-flow steps skew by wall clock)
TOTAL               52727    52857    43307
```

SSH handshake as negotiated by a stock `ssh2` client:

```
kex             curve25519-sha256@libssh.org
serverHostKey   rsa-sha2-512          (one RSA key, 535-byte blob)
cipher          aes128-gcm@openssh.com
auth            password "anything-at-all" -> accepted
```

### 3.3 Difference classes, with an example each

**(a) Encoding - telnet/SSH get UTF-8, web gets the string.** On the BBSTITLE
step telnet and SSH are byte-identical (`telnet == ssh` for those 14217 bytes),
and

```python
telnet_step02.decode('utf-8') == web_step02.decode('latin1')   # True
len == 13977 both sides;  telnet is 240 bytes longer, telnet hi = 2 x web hi
```

i.e. the telnet stream is the web string re-encoded as UTF-8. Example, the
last-callers header:

```
web    : 1b 5b 31 6d  B7  20 20 20 20 20 1b 5b 33 33 6d  B7     ...[1m ·     [33m·
telnet : 1b 5b 31 6d C2 B7 20 20 20 20 20 1b 5b 33 33 6d C2 B7  ...[1m Â·     [33mÂ·
```

Same for `÷` in the GLOBAL bulletin (92 high bytes on telnet, 46 on web).
Nothing anywhere converts to CP437 or ISO-8859-1 for the wire (section 2.5).

**(b) Web-only pre-login banner.** Normalised line diff, telnet[0:0] vs
web[0:14]:

```
+ /X Native Telnet:  Searching for free node...
+ /X Native Telnet:  Successful connection to node N
+ CONNECT 19200
+ **EMSI_IRQ8E08
+ Welcome to Uptown, located in Server Room
+ Running AmiExpress v5.6 Copyright (c) 2018-2026 Darren Coles,
+ Web port 1.0.0 by Spot/Up Rough
+ ... Registered to / Connection occurred at ...
```

followed by web's 3000 ms wait (`index.ts:1633`) before the FRONTEND screen.
Telnet/SSH go straight to FRONTEND. `index.ts:1338-1347` removed telnet's own
banner "to bring the two transports back into alignment".

**(c) Login echo.** telnet[85:87] vs web[99:100]:

```
- Username: sysop
- Password: *****
+ Username:
```

Telnet/SSH echo the username (`command.handler.ts:1763`, `:1907`) and one `*`
per password character (`:1761`, `:1905`). The browser echoes locally
(`packages/terminal/src/utils/login-key-machine.ts:46-54`) and the server sends
nothing. Note the inversion inside the browser machine: at `:72` the mask
argument is `!ctx.passwordMode.current`, so `mask-input true` **un**masks.

**(d) The caller's own IP.** telnet[5] vs web[19] on the FRONTEND screen:

```
- \|-\|  0 | Connecting      |                       |   NOT AVAILABLE   |
+ \|-\|  0 | Connecting      |                       |     127.0.0.1     |
```

`Doors/telnet-front/index.ts:183-199` recovers the address from
`socket.handshake`, a socket.io-only property. The telnet/SSH emitter has no
`handshake` (`connection-emitter.ts:72-178`), so both the hostname and the IP
fall through to `'NOT AVAILABLE'` at `:202-203` - even though
`session.remoteAddress` is populated for both (`telnet-server.ts:688`,
`ssh-server.ts:288`). The same screen's "Your Telnet Login Established from
Host :" line reads NOT AVAILABLE for the transports actually named in it.

**(e) 50 events the browser received and telnet/SSH did not.** The web driver's
`onAny` log for this one short session, excluding `ansi-output` and the driver's
own markers:

```
 15  bbs:event        12  door:status      10  door-active
  5  game-mode         3  modem-speed       2  door:error
  1  get-active-users  1  prompt-login      1  login-success
```

All 50 hit `connection-emitter.ts:90-140` on telnet/SSH and are discarded.
`door-active`, `game-mode` and `modem-speed` are the three with live web
consumers (`BBSTerminal.tsx:2542`, `:2595`, `:2257`).

**(f) SSH lost the head of the first screen, twice.** `01-connect` delivered
1239 bytes on telnet and 761 on SSH in the same run - the missing ~478 bytes are
the TOP of the FRONTEND screen (SSH's capture begins mid-table at
`\|-\| 0 | Connecting`). Not reproduced deliberately; the candidate mechanism is
`SSHConnection.write` (`ssh-server.ts:134-138`) silently dropping everything
written before `this.stream` exists, since the SSH session is created inside
`connection.on('ready')` (`:283`) which fires at shell-accept while
`'connection'` - the event that attaches the emitter - is emitted last, at
`:336`. Recorded as an observation, not a proven cause; see open question 4.

**(g) Timing.** The display-flow steps drift across transports because web's
login completes in one event while telnet/SSH type it, and because the 68K
bulletin batch (MultiTop / DreamStats) takes seconds. This walk therefore does
NOT establish that a TypeScript door renders identically end-to-end; the
`DOORS\r` keystroke landed on a pause prompt on all three runs and the walk
never reached `Doors/doors-menu`. Section 2.9 covers the door paths from the
source instead.

---

## 4. Test coverage per transport

Test roots: 539 `*.test.ts` under `web/backend/tests`. Files whose name mentions
a transport: 11, of which 3 are `bsdsocket-*` (Amiga library emulation) and 1 is
the lrzsz service.

| Surface | telnet | SSH | web |
|---|---|---|---|
| IAC option negotiation (ECHO/SGA/BINARY, loop prevention) | **none** - only incidental TTYPE traffic in `web/backend/tests/server/petscii-port.test.ts:128` | n/a | n/a |
| `IACState` machine | one path: `web/backend/tests/server/telnet-server-ttype-geometry.test.ts:42-60` drives real `IAC SB TTYPE` | n/a | n/a |
| `TelnetConnection.write` IAC doubling | **none** - every emitter test injects a fake `connection.write` | n/a | n/a |
| CR-NUL / NUL strip (`index.ts:1205`) | **none** | **none** | n/a |
| NAWS / `applyWindowSizeReport` / `applyClientReportedGeometry` | unit only: `web/backend/tests/server/petscii-session-geometry.test.ts:106-135`, `:172-207` | **none** (`window-change` untested) | `web/backend/tests/server/petscii-session-geometry.test.ts:64-104` (real registrar) |
| TTYPE classify / apply | `web/backend/tests/server/terminal-type-detect.test.ts:3-12` (3 cases), `telnet-server-ttype-geometry.test.ts:42`, `petscii-session-geometry.test.ts:138-170`, `petscii-port.test.ts:44-140` | **none** | n/a |
| SSH pty / window-change / shell / auth / host keys / write | n/a | **none.** `ssh-server.ts` is never imported by a test; the only mention is a regex-over-source assertion at `web/backend/tests/services/login-connect.service.test.ts:107` | n/a |
| emitter `ansi-output` + CRLF | `web/backend/tests/server/connection-emitter-petscii.test.ts:24-97`, `web/backend/tests/server/eighty-col-choke-identity.test.ts:363` | same tests, but **no test ever builds an emitter over an `SSHConnection`** | `eighty-col-choke-identity.test.ts:270`, `web/backend/tests/server/petscii-model-choke.test.ts:138` |
| emitter `petscii-output` / `petscii-bytes` | `connection-emitter-petscii.test.ts:89,99`, `web/backend/tests/handlers/petscii-bytes-transport.test.ts:119,133,202` | same | `petscii-bytes-transport.test.ts:62,94,106,156` |
| `flushPendingPetscii` | `web/backend/tests/server/connection-emitter-petscii-flush.test.ts:23-90` | same fake | `petscii-model-choke.test.ts:312` |
| the emitter's **unhandled-event drop** | **none.** Across all 539 tests `emitter.emit(...)` is called with exactly three names: `ansi-output`, `petscii-bytes`, `petscii-output` | **none** | n/a |
| the synthetic bus (`on`/`off`/`emitInternal`/`connected`/`disconnect`) | **none**; `emitInternal` has zero test hits | **none** | n/a |
| `terminal-size` | n/a | n/a | `petscii-session-geometry.test.ts:64` |
| `key-down`/`key-up`/`keys:state` | n/a | n/a | source-text regex only: `web/backend/tests/server/game-mode-modifiers.test.ts:35` |
| `mouse-*` | n/a | n/a | throttle re-implementation + regex: `web/backend/tests/server/mouse-throttle.test.ts:37`, `web/backend/tests/server/sgr-mouse-leak.test.ts:26`. Real handlers never invoked |
| `gamepad-event` | n/a | n/a | **none** |
| the `command` branch table | n/a | n/a | indirect only (`web/backend/tests/petscii/reachability-ledger.test.ts:352`) |
| `transfer:*` / `transfer-raw:*` handlers | n/a | n/a | **none** at handler level |
| disconnect grace / session restore | **none** (there is nothing to test) | **none** | partial: `web/backend/tests/petscii/render-ctx-disposal.test.ts:57` deliberately skips the grace via the sysop-kick path; the 15 s timer and `restore-session` are untested |
| `setupTelnetSSHHandler`'s `data` handler | **never executed** - `index.ts` self-starts servers on import, so every test works around it (`render-ctx-disposal.test.ts:22`, `eighty-col-choke-identity.test.ts:42`, `connection-emitter.ts:6-10`). Pieces tested in isolation: `web/backend/tests/utils/c64-detect.util.test.ts:3`, `web/backend/tests/utils/petscii.util.test.ts:505` | same verdict | n/a |
| a real socket to the server | one file: `web/backend/tests/server/petscii-port.test.ts` (`net.connect`, real IAC), scoped to the dedicated PETSCII port | **none** - no test imports `ssh2` | none - the `e2e/` and `integration/` suites are in-process |
| telnet-vs-web output parity | `web/backend/tests/petscii/seq-mci-wiring.test.ts:190` is the one genuine cross-transport byte-equality test; `eighty-col-choke-identity.test.ts:260` and `reachability-ledger.test.ts:254/296/352` compare each transport to its own baseline | **never included in any parity comparison** | see left |

---

## 5. Divergence ledger

Severity is written as a sysop would see it: **breaks** = the caller cannot do
the thing at all; **degraded** = it works but worse or differently;
**cosmetic**; **latent** = no user-visible effect today.

| # | surface | transport | file:line | observed vs web | severity |
|---|---|---|---|---|---|
| 1 | login prompt | telnet, SSH | `command.handler.ts:1716-1719` | Web returns immediately from the LOGON branch; the browser runs its own state machine and calls `socket.emit('login', …)` (`auth-socket-handlers.ts:253`). Telnet/SSH use a completely separate server-side line loop (`:1720-1913`). Two implementations of login, one per transport family | degraded (structural; every login fix must be made twice) |
| 2 | high-byte output encoding | telnet, SSH | `connection-emitter.ts:112`, `telnet-server.ts:495`, `ssh-server.ts:136` vs `amiga-text-decode.util.ts:185` | Screens are decoded from CP437/latin1 into a JS string, then written to the wire as **UTF-8**. Measured: `Screens/BBSTITLE.txt` 13894 bytes on disk -> 14134 on the wire; the live capture shows `Â·` where web shows `·`. Any non-UTF-8 terminal (SyncTERM, NetRunner, mTelnet, every Amiga terminal) gets mojibake and every art line overruns | breaks (art unreadable on classic clients) |
| 3 | every non-terminal event | telnet, SSH | `connection-emitter.ts:90-140` (no `else`) | 149 distinct event names exist in the backend; the emitter handles 3. 50 of the other 146 were dropped in one short live session. No log, no warning, no test | breaks (root cause of #4-#13) |
| 4 | client / hybrid doors | telnet, SSH | `door.handler.ts:4406-4489`, `client-door-bridge.ts:141,150,423-428,433-443,453` | `door:load-client` is discarded, the bundle never loads, a no-op `doorInputHandler` is installed, and `endSession` is unreachable because `'disconnect'` never fires on the emitter. The caller's screen freezes with no output and no exit; a 30 s PING loop runs forever. `Doors/arkanoid` additionally parks `executeDoor` on a promise that cannot resolve (`door.handler.ts:2355`) | breaks (session hang, node held) |
| 5 | client/hybrid door gate | telnet, SSH | `door.handler.ts:1734-1746`, `web/backend/src/utils/door-min-columns.util.ts:120-124` | The only gate ahead of a door is MIN_COLUMNS, which an 80-column telnet caller always passes. Nothing checks the transport, so #4 is reachable from the menu | breaks |
| 6 | game mode / held keys | telnet, SSH | `game-mode.service.ts:28,44`; `socket-handlers.ts:493,515,551`; `door-input-manager.ts:258,282,293` | `game-mode` is discarded and no `key-down`/`key-up`/`keys:state` can ever arrive. Worse, the SDK guard is a method-existence check and `BBSApi.ts:591,604` always defines the methods, so `isKeyStateActive()` returns **true** with an empty held set - the eight arcade doors that branch on it (joust, zoo-keeper, pengo, frogger, super-qix, pipe-dream, galaga, donkey-kong) take the held-key path and never move | breaks (games unplayable, and they fail closed in the wrong direction) |
| 7 | RIP graphics | telnet, SSH | `pre-login.ts:163-171`, `screen.handler.ts:1866-1870`, `BBSTerminal.tsx:2121-2145` | Answering **R** switches the screen loader to `.RIP` files and sends `ESC[1!` + raw RIPscrip + `ESC[2!`. There is no server-side rasteriser; the browser is the only consumer. A telnet caller sees `!|` source text as literal characters | breaks (R is a trap for non-web callers) |
| 8 | sysop kick / node control | telnet, SSH | `web/backend/src/handlers/message/message-commands.handler.ts:589-608`; `web/backend/src/api/node-control-routes.ts:263-276` | Both resolve the node then call `io.sockets.sockets.get(socketId)`, which cannot return a telnet connection. NM prints "Could not find socket for node N"; the REST route 404s. **A telnet/SSH caller cannot be kicked** | breaks |
| 9 | operator chat, internode chat, DMs, room events, moderation | telnet, SSH | `login-post.service.ts:252-260`; `session-manager.ts:247-255`; `handlers/operator-chat.handler.ts:215,660,806,833`; `handlers/chat/internode-chat.handler.ts:185-873` | `socketToUser` and the `user:<id>` room are populated only inside `if (isWeb)`, and every push routes through `io.to(...)`. Even the `ansi-output` pushes - the one event name the emitter would honour - address a room a telnet session is not in | breaks |
| 10 | OLM (node message) | telnet, SSH | `web/backend/src/handlers/transfer/olm.handler.ts:326-342` | The immediate-display branch is `io.to(targetSocketId).emit(...)` and is dropped; only the queued branch (`:334-342`, a direct session mutation drained by `processOlmQueue` `:357-371`) reaches a telnet caller. The immediate branch is the one taken when the recipient is at the command prompt - the common case | degraded (messages arrive late or not at all) |
| 11 | batch download | telnet, SSH | `web/backend/src/handlers/transfer/batch-download.handler.ts:214` vs `web/backend/src/handlers/file/download.handler.ts:517-527` | The single-file path guards on transport and starts ZMODEM; the batch path emits `download-file` unguarded, so a telnet caller gets "Batch download complete! N file(s) queued. / Check your browser downloads." plus full download-stat accounting (`:220-230`) while zero bytes transfer | breaks (silent data loss, wrong stats) |
| 12 | `BB_DROPDTR` / forced logoff | telnet, SSH | `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:1675-1676`; `web/backend/src/handlers/commands/system-commands.handler.ts:216` | `hangup` and `force-disconnect` are discarded; a 68K door cannot drop the carrier and the logoff command's own disconnect signal is lost | degraded |
| 13 | door archive install prompt | telnet, SSH | `BBSApi.ts:1565` | `show-file-upload` is discarded; the promise resolves only via its own timeout (`BBSApi.ts:1551`) | degraded |
| 14 | `unicodeCapable` on SSH | SSH | `session-manager.ts:189`, `BBSApi.ts:264-271`, `blessed-helpers.ts:979-996` | Defaults to `true` for web, is filled in from TTYPE for telnet, and is **always `undefined` for SSH**. Every blessed door renders in ACS/Amiga fallback mode for every SSH caller, whatever terminal they use | degraded (SSH looks worse than telnet on the same client) |
| 15 | SSH terminal type | SSH | `ssh-server.ts:83-91` | The pty request carries `info.term` (`xterm`, `syncterm`, …) and it is read by nobody. No C64 detection, no Amiga detection, no unicode classification on SSH at all | degraded (cause of #14) |
| 16 | SSH terminal size | SSH | `ssh-server.ts:83-91` vs `:93-102` | The pty request stores cols/rows on the connection but emits **no** `window-size`, so `applyWindowSizeReport` never runs. An SSH session stays at the 80x24 default (`session-manager.ts:183-184`) until the user resizes the window after connecting | degraded (wide/tall SSH terminals wrap wrongly) |
| 17 | SSH transport auth | SSH | `ssh-server.ts:64-71` | `'none'` is accepted, so `ssh -p 31337 anyone@host` is admitted with no credential; `publickey` and `keyboard-interactive` are rejected, so a client that insists on a key cannot connect. Documented as intentional at `:51-63` - listed so the sysop knows the shape | latent (BBS login still gates access) |
| 18 | SSH host key | SSH | `index.ts:1846`, `ssh-server.ts:215-217`, `web/backend/src/utils/ssh-key.util.ts:46-48` | Exactly one RSA key is offered (live handshake negotiated `rsa-sha2-512`). No ed25519 or ECDSA host key exists | latent |
| 19 | SSH inherits telnet's client quirks | SSH | `web/backend/src/services/lrzsz-transfer.service.ts:245,350,605-608` | Every transfer branch is `type === 'web'` vs everything else, so an SSH transfer gets the MuffinTerm ZCRCE->ZCRCW rewrite and `rz -b -r`, workarounds for serial-line telnet clients that no SSH client needs | latent |
| 20 | ZMODEM BINARY negotiation | telnet | `web/backend/src/handlers/commands/user-commands.handler.ts:243-270` vs `:441-447` and `transfer-misc-commands.handler.ts:304-307` | The download and `RZ` paths negotiate `IAC WILL/DO BINARY` before spawning lrzsz; the `U`-command upload path sends none, on any transport | degraded (U uploads more fragile than RZ) |
| 21 | arrow keys in application-cursor mode | telnet, SSH | `socket-handlers.ts:807-809` | Web rewrites `ESC O x` to `ESC [ x`; telnet/SSH pass SS3 through unchanged, so a terminal in DECCKM mode sends sequences the command handler does not recognise | degraded |
| 22 | input chunking | telnet, SSH | `index.ts:1252-1253` vs `socket-handlers.ts:816-824` | Web calls `handleCommand` once per character; telnet/SSH pass the whole TCP segment. Only four handlers accommodate multi-character input (`command.handler.ts:454-473`, `:1486-1500`, `:1753-1766`, `:1897-1910`); everything else sees a paste or a fast burst as one opaque string | degraded |
| 23 | pause-prompt and chat-mode input interception | telnet, SSH | `socket-handlers.ts:618-655`, `:658-695`, `:714-716` | `checkPauseHandler`, `flagPauseHandler` and `handleChatModeInput` are web-only branches of the `command` handler; the telnet `data` handler has no equivalent | degraded |
| 24 | `clientDoorActive` / `gameModeEnabled` input guards | telnet, SSH | `socket-handlers.ts:735-750` | Web suppresses keystrokes while a client door owns them or game mode is on; telnet has neither check and routes everything into `doorInputHandler` | degraded |
| 25 | stray SGR mouse reports | telnet, SSH | `socket-handlers.ts:792-803` | Web drops `ESC[<n;n;nM` that reaches `handleCommand`; on telnet the same bytes are echoed through the multi-char paths as visible text at the cursor | cosmetic (until a door leaves mouse mode on) |
| 26 | `door:input` fallback | telnet, SSH | `index.ts:1246` | The "door active but no handler" fallback emits `door:input` **on the emitter**, which drops it. The fallback is a dead end | latent |
| 27 | reconnect | telnet, SSH | `index.ts:1314-1328` vs `socket-handlers.ts:1002-1098` + `auth-socket-handlers.ts:97-230` | Web has a 3 s reconnect grace, a 15 s logoff grace and a full `restore-session` path. Telnet/SSH have none: a dropped connection is unrecoverable and the caller logs in again on a possibly different node | degraded |
| 28 | logoff bookkeeping | telnet, SSH | `index.ts:1314-1328` | The telnet/SSH close handler does not write `Logged off` to the CallersLog (`socket-handlers.ts:1121`), does not end the session log, does not clear MULTICOM, and does not run the chat cleanups | degraded (caller log incomplete for telnet users) |
| 29 | session map leak on close | telnet, SSH | `index.ts:1320` vs `session-manager.ts:269-272` | `sessions.delete(connection.sessionId)` deletes nothing - the map is keyed by `nodeId.toString()`. The `socketToNodeId` entry is never removed either | latent |
| 30 | AnsiBuffer leak and final flush | telnet, SSH | `ansi-buffer.util.ts:176-182` + `connection-emitter.ts:157` | Cleanup is `socket.on('disconnect')`; `'disconnect'` is not a transport event on the emitter and nothing emits it internally, so every telnet/SSH connection leaves its buffer in the module map for the process lifetime and never flushes what it held at close | latent (unbounded growth) |
| 31 | dead-connection detection | telnet, SSH | `index.ts:585-586`; `telnet-server.ts:661`; `ssh-server.ts` (nothing) | Web has socket.io's 120 s ping timeout. Telnet sets only `setNoDelay`; SSH sets nothing. A half-open connection holds its node until the OS TCP keepalive | degraded (nodes stuck busy) |
| 32 | idle timeout | all | `web/backend/src/services/bbs-config-file.service.ts:236`, `web/backend/src/services/amiga-export.service.ts:327,345` | `IDLE_TIMEOUT` is parsed and exported to the Amiga config, never enforced. No transport disconnects an idle caller | degraded (parity between transports, divergence from express.e) |
| 33 | pre-login banner | telnet, SSH | `index.ts:1576-1633` vs `:1338-1347` | Web prints "/X Native Telnet: … CONNECT 19200 / **EMSI_IRQ8E08 / Welcome to …" and waits 3 s. Telnet/SSH print nothing; their banner was removed citing alignment with web, which still has one | cosmetic (but the "Native Telnet" banner appears only on the non-telnet transport) |
| 34 | the caller's own IP on the connect screen | telnet, SSH | `Doors/telnet-front/index.ts:183-203` | The FRONTEND door reads `socket.handshake`, socket.io-only. Telnet/SSH show `NOT AVAILABLE` for their own address although `session.remoteAddress` is set (`telnet-server.ts:688`, `ssh-server.ts:288`) | cosmetic |
| 35 | graphics-prompt fallback text | telnet, SSH | `telnet-server.ts:774`, `ssh-server.ts:312` vs `login-connect.service.ts:73-74` | Both no-emitter fallbacks print an older, differently-cased prompt with no `COMMODORE 64: PRESS <DEL>` line | cosmetic |
| 36 | system-password prompt echo | telnet, SSH | `command.handler.ts:1667-1671` and `:1561` | The system-password gate emits **nothing** while typing and relies on `mask-input`, which the emitter drops. A telnet caller sees no characters and no asterisks; backspace (`:1661-1666`) still echoes `\b \b` and eats the prompt | degraded |
| 37 | client-side output pacing | telnet, SSH | `login-post.service.ts:147-158` + `BBSTerminal.tsx:2257,2542` | Web is paced twice (server emulator plus browser emulator, with a door bypass); telnet/SSH once. The `modem-speed`/`door-active` signals that bypass pacing during a door do not exist for them | cosmetic |
| 38 | `/ws/terminal` has no pre-login at all | ws-terminal | `index.ts:1771-1784`, `ws-terminal-server.ts:110-154` | The fourth transport shares `setupTelnetSSHHandler` but never calls `runPreLoginConnect`, so it gets no FRONTEND screen, no graphics prompt and no AREXX `login` trigger | degraded |
| 39 | SSH is untested | SSH | - | `ssh-server.ts` (365 lines) is never imported, instantiated or executed by any of the 539 backend tests; two regex-over-source assertions in `web/backend/tests/services/login-connect.service.test.ts:107,118` are the whole footprint | latent |
| 40 | the emitter's silent drop is unasserted | telnet, SSH | - | Across all 539 tests, `emitter.emit(...)` is only ever called with the three handled names. Nothing pins what happens to a fourth, and `emitInternal` - the mechanism that makes doors work on telnet at all - has zero test hits | latent |

---

## 6. Open questions

1. **SSH's lost first screen (3.3f).** Is the ~478-byte truncation reproducible,
   and is the cause `SSHConnection.write` dropping writes before `this.stream`
   exists (`ssh-server.ts:134-138`), the `'ready'`-before-`'connection'`
   ordering (`:283` vs `:336`), or the ssh2 client's own buffering in the walk
   harness? Not driven to a conclusion here.
2. **Is a non-UTF-8 telnet client actually the target?** Divergence #2 assumes
   classic clients matter. If every real caller is on a UTF-8 terminal the
   encoding is correct as-is and the question becomes which clients the sysop
   supports. Nothing in the codebase records an answer; `classifyTerminalType`
   (`telnet-server.ts:73-110`) computes `unicodeCapable` and only
   `blessed-helpers.ts:979` ever reads it - the transport write path never does.
3. **What should a telnet caller see when they pick a browser-only door?**
   There is no gate (#5) and no notice; `door-min-columns.util.ts` has a
   `DOOR_NEEDS_80_NOTICE` shape that a transport gate could reuse, but whether
   the answer is "refuse", "run the server half only" (which 14 of 15 hybrids
   would survive) or "hide from the menu" is a product decision.
4. **`isKeyStateActive()` returning true on telnet (#6)** - is the intended
   contract "the transport delivers key edges" (in which case the guard belongs
   on the session/transport, not on method existence) or "the door registered
   handlers"? The doc comment at `door-input-manager.ts:247-253` says the
   former; the code does the latter.
5. **Should cross-session pushes be keyed on the session rather than the
   socket.io namespace?** `socketToNodeId` already resolves telnet ids
   (`session-manager.ts:269`); everything downstream then calls
   `io.sockets.sockets.get`. The OLM queue (`olm.handler.ts:334-342`) is the one
   place that goes through the session object instead and is the one place that
   works. Whether the rest should follow is not settled anywhere in `thoughts/`.
6. **Two login implementations (#1)** - is the web client-driven login intended
   to stay, or is the telnet server-side loop the one true path with the browser
   as a skin over it? Every prompt change currently has to be made in both
   `command.handler.ts:1720-1913` and `auth-socket-handlers.ts` +
   `packages/terminal/src/utils/login-key-machine.ts`.
7. **`door:await-key` (`DoorMessageHandler.ts:2813`)** parks the 68K emulator
   waiting for a `door:keypress` that no client - browser or terminal - ever
   sends. Is that path reachable in practice, and if so how does any caller
   escape it?
8. **The dedicated PETSCII telnet port** (`index.ts:1822-1841`) is disabled on
   this box (`TELNET_PETSCII_PORT` unset) and was not walked. Its behaviour is
   covered by `web/backend/tests/server/petscii-port.test.ts`, the only test in
   the repo that opens a real socket to the server.
