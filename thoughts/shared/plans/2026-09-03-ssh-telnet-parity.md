---
date: 2026-09-03
topic: One transport adapter, one wire encoder, one login machine, one session registry - closing the 40 telnet/SSH divergences from the web terminal
tags: [telnet, ssh, socketio, transport, parity, connection-emitter, encoding, charset, doors, game-mode, login, lifecycle, zmodem, reachability]
status: draft
---

# The transport adapter, and the forty things that fall out of it

Research: `thoughts/shared/research/2026-09-03_ssh-telnet-web-parity.md` (read it
first - this plan does not repeat its tables) and
`thoughts/shared/research/2026-09-02_petscii-oracle-transport-boundary.md`
(sections 2.1 and 3, the egress map and the wrapper chain).
Prior plan (style and standing rules):
`thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`.
Branch: `feat/installed-door-link`. Every `file:line` below was opened against
the working tree at `8b137017d` on 2026-09-03.

Paths are repo-relative on first mention and shortened afterwards, using the
research document's table:

| short name | full path |
|---|---|
| `index.ts` | `web/backend/src/index.ts` |
| `telnet-server.ts` / `ssh-server.ts` / `ws-terminal-server.ts` | `web/backend/src/server/` |
| `connection-emitter.ts`, `socket-handlers.ts`, `auth-socket-handlers.ts`, `session-manager.ts`, `c64-detected-handler.ts`, `c64-door-adapter.ts` | `web/backend/src/server/` |
| `command.handler.ts`, `screen.handler.ts`, `door.handler.ts`, `petscii-screen.render.ts` | `web/backend/src/handlers/` |
| `pre-login.ts` | `web/backend/src/handlers/command-handler/pre-login.ts` |
| `download.handler.ts` | `web/backend/src/handlers/file/download.handler.ts` |
| `batch-download.handler.ts`, `olm.handler.ts` | `web/backend/src/handlers/transfer/` |
| `user-commands.handler.ts`, `transfer-misc-commands.handler.ts`, `system-commands.handler.ts` | `web/backend/src/handlers/commands/` |
| `BBSApi.ts`, `client-door-bridge.ts` | `web/backend/src/doors/` |
| `login-connect.service.ts`, `login-post.service.ts`, `game-mode.service.ts`, `lrzsz-transfer.service.ts` | `web/backend/src/services/` |
| `ansi-buffer.util.ts`, `amiga-text-decode.util.ts`, `modem-emulator.util.ts`, `petscii-session-model.ts`, `door-min-columns.util.ts`, `ssh-key.util.ts` | `web/backend/src/utils/` |
| `screen-width.util.ts` | `web/backend/src/amiga-emulation/xim/screen-width.util.ts` |
| `DoorMessageHandler.ts` | `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts` |
| `door-input-manager.ts`, `blessed-helpers.ts` | `sdk/utils/` |
| `BBSTerminal.tsx`, `login-key-machine.ts` | `packages/terminal/src/components/` and `packages/terminal/src/utils/` (NOT the SDK preview copy at `sdk/tools/preview/frontend/src/components/BBSTerminal.tsx`) |

New files this plan creates, all cited short after their first mention:
`server/transport-session.ts`, `server/transport-adapter.ts`,
`server/terminal-input.ts`, `server/session-emitter-registry.ts`,
`utils/wire-encoding.util.ts`, `handlers/file/file-delivery.ts` (all under
`web/backend/src/`), and the suites under `web/backend/tests/transport/`. Two
existing files are EXTENDED rather than created and are cited short too:
`utils/output-pacing.ts` (`web/backend/src/utils/output-pacing.ts`, the
`PRE_PACED` attribute object) and `types/login-emitter.ts`
(`web/backend/src/types/login-emitter.ts`, which already defines the emitter
interface this plan types against).

## Controller decisions (settled - do not reopen)

1. **ONE transport adapter** for telnet/SSH, with a COMPLETE, typed map of every
   event name the backend emits. Each name is either RENDERED for a byte
   terminal, TRANSLATED into server-side connection state, or explicitly ruled
   otherwise **in writing**. The backend must never emit a web-only event to a
   session that cannot receive it without the adapter knowing. A test
   enumerates the backend's emitted event names from a pinned, grep-derived
   list and fails if any one lacks a ruling.
2. **ONE wire encoder at the emitter.** A telnet/SSH caller receives the
   screen's ORIGINAL bytes unless the connection negotiated UTF-8 (telnet
   CHARSET, or a TTYPE / SSH `term` on a named UTF-8 list). Web keeps UTF-8.
   Pinned by the byte diff of `Screens/BBSTITLE.txt`: **13894 bytes on the wire,
   not 14134**.
3. **ONE login state machine.** The server-side loop
   (`command.handler.ts:1716-1913`) is the truth; the browser's duplicate is
   reduced to a key relay. Typing at the web `Username:` prompt must work.
4. **Client / hybrid browser doors get a transport GATE** shaped like
   MIN_COLUMNS: a registration tooltype (`CLIENT_ONLY`) or the manifest
   `runtime`, refusing a byte-transport caller with a one-line notice through
   the same predicate/refusal path `doorOpensForC64` uses - never a frozen
   screen.
5. **Game mode on byte terminals:** `isKeyStateActive()` is false unless the
   transport can deliver key-down/up edges. The eight arcade doors then take
   the character path they already have. A door with no character path is
   `CLIENT_ONLY` per (4).
6. **Cross-session pushes** (kick, operator chat, internode chat, DMs,
   moderation, OLM) resolve the target through ONE registry that knows both
   socket.io sockets and connection emitters. The OLM queue path is the model.
7. **Downloads:** `download-file` is guarded by transport capability. Telnet
   gets ZMODEM or a refusal, never a fake completion.
8. **SSH:** honour `info.term`, emit `window-size` from the pty request and on
   window-change, set `unicodeCapable` from the negotiated charset, reject
   keep one host key, and document the MuffinTerm quirks as telnet-only.
   (The controller's original wording asked for `none` auth to be rejected;
   that clause is withdrawn - see TP-12's recorded decision - because SSH here
   is a pure transport and the BBS login is the credential.)
9. **Lifecycle:** a telnet/SSH disconnect fires the same session-end path as
   web - `Logged off` in the CallersLog, `sessions.delete` by the right key,
   the AnsiBuffer released, a dead-connection timer - through ONE finalize
   function the web path already has.
10. **Tests:** every task ships transport-specific tests, and the scripted
    three-transport walk from the research becomes a repo test that byte-diffs
    the walk and may differ only in a pinned allow-list.

Sequence: the adapter (1) and the encoder (2) land first as the foundation,
then the gates and the pushes, then SSH and lifecycle, then the walk pin.
**80-column web output stays byte-identical throughout.**

## Non-goals

- **RIP over telnet.** No server-side RIPscrip rasteriser is written. TP-6
  makes the `R` answer refuse cleanly on a byte transport instead of shipping
  `!|` source as literal text.
- **File-transfer protocol parity beyond ZMODEM presence.** XMODEM / YMODEM /
  Punter stay unimplemented; `services/transfer-protocol.service.ts` keeps its
  zero importers and `Protocols/` stays display-only
  (`web/backend/src/handlers/file/file.handler.ts:755`).
- **PETSCII over SSH.** No DEL probe, no synthetic `terminal-type`, no PETSCII
  branch is added to `ssh-server.ts`. TP-12 gives SSH a terminal type; a `term`
  containing `C64`/`PETSCII` is classified and recorded but does NOT flip the
  session into PETSCII mode.
- **The 68K `door:await-key` park** (`DoorMessageHandler.ts:2813`, research open
  question 7). It hangs on every transport, so it is not a divergence. TP-3
  rules the event `DEAD` with a written note and the defect is filed, not
  fixed here.
- **The dedicated PETSCII telnet port** as a fourth walk leg (research open
  question 8). It shares every telnet code path - `petsciiDefault` only seeds
  `terminalType` in the `TelnetConnection` constructor
  (`telnet-server.ts:179-192`) and fires a synthetic `terminal-type`
  (`:797-816`) - and is covered by `web/backend/tests/server/petscii-port.test.ts`,
  the one test in the repo that opens a real socket to the server. The walk
  stays three legs; the exemption is recorded in TP-14.
- **Hardening SSH transport authentication.** `ctx.accept()` for `'none'`
  (`server/ssh-server.ts:64-71`) stays. The controller's decision 8 asked for it
  to be rejected; that clause is withdrawn with a written reason in TP-12,
  because SSH here is a pure transport exactly as telnet is - telnet has no
  transport auth at all - and the file's own doc comment (`:51-63`) says the
  BBS login is the credential. Pre-filling the BBS login from the SSH
  credentials, through the same `AuthenticationUseCase` the login loop uses, is
  named as a later feature and is not built here.
- **Enforcing `IDLE_TIMEOUT`** (divergence 32,
  `services/bbs-config-file.service.ts:236`). It is unenforced on all three
  transports equally, so it is a divergence from express.e and not between
  transports. TP-13b adds TCP keepalives, which detect a DEAD connection; it
  does not disconnect a live but idle caller.
- The PETSCII model and the `.seq` render. Not one line of
  `utils/petscii-session-model.ts` or `handlers/petscii-screen.render.ts` moves.

## Standing rules this plan must not break

- **80-column identity.** `web/backend/tests/server/eighty-col-choke-identity.test.ts`
  is the gate and is re-run after every task. Its web case (`:270`) must stay
  byte-identical. Its telnet case (`:363`) already builds its baseline as
  `Buffer.from(str, 'latin1')` (`:374`, `:403`) - the fake `connection.write`
  never exercised the real UTF-8 conversion - so TP-5 makes production agree
  with a pin that has been asserting latin1 all along, and that test must pass
  **with zero edits**.
- **express.e parity.** No screen flow, prompt order or pause changes except
  where a `WEB_:` comment is written at the site citing the express.e line and
  the reason. Two such comments already exist and are extended, not replaced
  (`screen.handler.ts:1864`, `index.ts:1338-1347`).
- **Single source of truth.** One capability predicate, one event map, one
  encoder, one input classifier, one login loop, one target registry, one
  finalize. Every duplicate this plan retires is listed in TP-15.
- Regression test per change, named after the user-visible symptom, RED before
  GREEN. No emojis; ASCII tokens in BBS output; uppercase-only ASCII for any
  notice a C64 might see (the `DOOR_NEEDS_80_NOTICE` rule,
  `utils/door-min-columns.util.ts:37-39`).
- **Never `Edit`/`Write` a `.seq` / `.info` / binary fixture** - the UTF-8 round
  trip destroys every high-bit byte. Encoding fixtures are byte arrays built in
  code and compared with `Buffer.compare`.
- **Shared tree.** `git diff --cached --stat` before every commit; commit by
  path; never `git add -A`.
- **TypeScript doors:** any door whose `.ts` changes gets `npm run build` and
  its `dist/` committed in the same commit (RULES.md rule 5). TP-7 touches
  `sdk/`, so `.claude/skills/door-sdk-freshness/SKILL.md` runs before anyone is
  told to test.

---

## Architecture in one paragraph

`buildConnectionEmitter` (`server/connection-emitter.ts:68-181`) is the
socket.io-shaped object telnet and SSH hand to every BBS handler, and its
`emit` (`:90-140`) is an if / else-if chain over exactly three event names with
**no `else`**. 232 distinct event names can reach a session socket - 149
emitted across `web/backend/src`, 83 more from `sdk/` (80 of which go to an
in-process broker shim, 3 of which are real) - and 229 of them fall off the end
of that chain and vanish with no log, no throw and no test, along with every
name built at runtime (`door:message:<id>`) that no literal grep can even
count. That single missing `else` is the root of divergences 3 through 13:
a client door freezes because `door:load-client` evaporated, a sysop cannot
kick a telnet caller because the push went to a socket.io room, a batch
download reports success while zero bytes move. The second root is one line
below: `connection.write(data.replace(/\r?\n/g, "\r\n"))` (`:112`) hands a JS
string to `TelnetConnection.write`, which does `Buffer.from(data)` with no
encoding argument (`telnet-server.ts:495`) - UTF-8 - so every screen decoded
from CP437 or Latin-1 (`utils/amiga-text-decode.util.ts:182-192`) leaves as
UTF-8 and every classic client sees mojibake and overrun art; and the charset
the loader detected (`:110-113`) is discarded two frames later, so nothing
downstream can even tell a `.ANS` from an Amiga screen. This plan puts a
**typed adapter** at that chain (every name ruled, unhandled names logged and
counted once) and a **wire encoder** at that write (the caller's charset,
derived from the `unicodeCapable` `classifyTerminalType` already computes, with
the payload's own source charset riding along on the third argument the wipe
frames already use), then walks outward: the gates that stop a browser-only door
opening on a byte terminal, the registry that lets a push find a telnet
session, the SSH facts nobody reads, and the finalize the close handler never
calls.

| concern | survivor | duplicate retired |
|---|---|---|
| "what can this transport do" | `transportCapabilities()` (`server/transport-adapter.ts`, new) | ad-hoc `connectionType === 'web'` / `type === 'telnet'` tests at 8 sites (TP-15) |
| "what charset does this caller read" | `classifyTerminalType`'s `unicodeCapable` (`telnet-server.ts:107`), read by `resolveWireCharset` | no second list of terminal names is written |
| "what charset did this payload come from" | `OutputAttributes.sourceCharset` (`utils/output-pacing.ts`, extended) | the `encoding` `readAmigaTextFile` returns and everything downstream drops |
| "what happens to this event" | `EVENT_RULINGS` (`server/transport-adapter.ts`) | the three-branch chain with no `else` (`connection-emitter.ts:90-140`) |
| bytes on the wire | `encodeForWire` (`utils/wire-encoding.util.ts`, new) | `Buffer.from(data)` (`telnet-server.ts:495`), `this.stream.write(data)` (`ssh-server.ts:136`) |
| the telnet/SSH entry point | `server/transport-session.ts` (new, moved) | `setupTelnetSSHHandler` inline in `index.ts:1075-1348` |
| one keystroke's routing | `classifyTerminalInput` (`server/terminal-input.ts`, new) | the eleven-branch web table (`socket-handlers.ts:584-826`) vs the six-branch telnet one (`index.ts:1138-1255`) |
| the login line editor | `command.handler.ts:1716-1913` | `packages/terminal/src/utils/login-key-machine.ts` (the whole file) and the login branch in both browser key paths |
| "which emitter reaches this session" | `emitterForSession` (`server/session-emitter-registry.ts`, new) | 11 `sockets.sockets.get` sites in 6 files, plus 7 `io.to(...)` `ansi-output` pushes |
| session end | `finalizeDisconnectCleanup` (`socket-handlers.ts:1100-1295`, exported) | `index.ts:1314-1328` |

---

## Task TP-1 - RED: five symptoms, named the way a sysop would name them

**No production code.** One new file
`web/backend/tests/transport/parity-symptoms.test.ts`.

**The mock-write trap, and the rule that closes it.** The emitter suites in this
repo inject a fake `connection.write`
(`tests/server/eighty-col-choke-identity.test.ts:370-378`, whose fake does
`typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)` at
`:374`). That fake **already produces the bytes TP-5 is supposed to produce**,
so an encoding test written on that idiom is GREEN on arrival and proves
nothing: the defect is not in the emitter, it is one layer lower, in
`TelnetConnection.write`'s `Buffer.from(data)` (`telnet-server.ts:495`, no
encoding argument, i.e. UTF-8) and in `SSHConnection.write`'s
`this.stream.write(data)` (`ssh-server.ts:136`, Node's UTF-8 default).

**Every encoding assertion in this plan therefore drives a REAL
`TelnetConnection` over a stub `net.Socket` and reads the bytes the SOCKET
received.** The stub needs only `on(event, handler)` and
`write(buf)`; the constructor (`telnet-server.ts:179-203`) registers three
handlers and calls `initializeTelnet` (`:208-233`), which writes seven
negotiation commands - the test skips that preamble by snapshotting
`stub.written.length` after construction. A mock `connection.write` is
**forbidden** in `tests/transport/wire-encoding.test.ts` and in these first
two cases; a lint-style assertion in the suite's own header
(`expect(String(readFileSync(__filename))).not.toMatch(/write:\s*\(/)`) makes
the ban self-enforcing.

1. **"a telnet caller's art arrives in the bytes the file holds"** - build a
   `TelnetConnection` over the stub, attach `buildConnectionEmitter`, emit an
   `ansi-output` string containing `·` (U+00B7, the character
   `Screens/BBSTITLE.txt` carries 240 of), and assert the SOCKET received the
   single byte `0xB7` and not the pair `0xC2 0xB7`. **RED today**:
   `telnet-server.ts:495`. GREEN at TP-5.
2. **"an event the emitter cannot render leaves no trace at all"** - emit
   `door:load-client` through the same real emitter and assert, against
   **today's** observables only (the adapter does not exist yet, so the test
   cannot name it): the socket received ZERO further bytes, the emitter's
   return value is `undefined`, and a `console.error` / `console.debug` spy
   installed for the call recorded ZERO lines. That triple IS the silent drop.
   TP-3 rewrites this case to assert the drop record and the one log line;
   until then it documents that nothing whatsoever happens. **RED today** in
   the sense the protocol means: it passes now and its TP-3 successor fails
   now, and the RED evidence recorded in the ledger is TP-3's version run
   against `8b137017d`.
3. **"a browser-only door refuses a telnet caller instead of freezing it"** -
   drive the real `executeDoor` (`door.handler.ts:1705`) with a telnet-shaped
   socket and a `runtime: 'client'` manifest; assert the notice text reached
   the caller, `session.subState === LoggedOnSubState.DISPLAY_MENU`, and
   `session.inDoorManager` is unset. **RED today**: `executeClientDoor`
   (`:4406-4492`) runs, `door:load-client` (`:4452`) evaporates and a no-op
   `doorInputHandler` (`:4441-4448`) is installed. GREEN at TP-6.
4. **"a telnet caller can be kicked"** - drive the real NM `kick` branch
   (`handlers/message/message-commands.handler.ts:587-612`) against a session
   whose only socket is a connection emitter; assert the caller received the
   `*** Disconnected by SYSOP ***` line and the connection was closed. **RED
   today**: `_io.sockets.sockets.get(targetSocketId)` (`:591`) cannot return a
   telnet connection and the sysop is told "Could not find socket for node N"
   (`:607`). GREEN at TP-10.
5. **"a telnet arcade door moves on a keypress"** - construct a
   `DoorInputManager` (`sdk/utils/door-input-manager.ts`) over a `BBSApi` whose
   session is `connectionType: 'telnet'` with `trackHeldKeys: true`, and assert
   `isKeyStateActive()` is **false**. **RED today**: the guard at `:258` is a
   method-existence check, `BBSApi` defines `onKeyDown` / `onKeyUp`
   unconditionally (`doors/BBSApi.ts:591`, `:604`), so `keyStateActive = true`
   is set at `:282` and the eight arcade doors take a held-key path whose
   `held` set can never fill. GREEN at TP-7.

**Verification.**
`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/parity-symptoms"`
**Success criteria.** Cases 1, 3, 4 and 5 FAIL with an assertion diff (a byte
pair, a substate, a log string, a boolean) - not a crash and not a missing
fixture. Case 2 passes and its TP-3 successor is run once against this commit
to record its RED diff. The four RED diffs plus case 2's successor go into the
ledger (TP-16) as the RED evidence. Commit them `it.failing` only if the suite
gates CI before their fix tasks land; each fix task flips its own back.


## Task TP-2 - the telnet/SSH entry point becomes importable

**Why first, and why it is not optional.** The research's coverage table records
that `setupTelnetSSHHandler`'s `data` handler is **never executed by any of the
539 backend tests**, because `index.ts` runs a top-level IIFE that starts the
HTTP, telnet and SSH servers as an import side effect - every test works around
it (`tests/petscii/render-ctx-disposal.test.ts:22`,
`tests/server/eighty-col-choke-identity.test.ts:42`, and the extraction comment
at `connection-emitter.ts:5-10` that says so in as many words). Gate 3a of
`~/.claude/REACHABILITY_PROTOCOL.md` requires each later task to drive the
PRODUCT'S top-level entry point. For a telnet caller that entry point is this
function, and today it cannot be reached from a test at all. Every later task
in this plan is unprovable until this move lands.

**Pure move, zero behaviour change.** New file
`web/backend/src/server/transport-session.ts` receives, verbatim, the body of
`setupTelnetSSHHandler` (`index.ts:1075-1348`) with its dependencies passed in
rather than closed over:

```ts
/**
 * The telnet / SSH / ws-terminal session entry point.
 *
 * Moved out of index.ts unchanged. index.ts starts real servers on import, so
 * a test that wants to drive a telnet caller's ACTUAL top-level path - the
 * `data` handler, the close handler, the emitter attach - could not import it
 * there. Nothing in this file is new: the diff against index.ts:1075-1348 is
 * the parameter list and the imports.
 */
import type { Server as IOServer } from 'socket.io';
import type { BBSSession } from '../index';
import type { TransportEmitter } from './transport-adapter';

export interface TransportSessionDeps {
  readonly io: IOServer;
  readonly sessions: Map<string, BBSSession>;
  readonly nodeManager: NodeManager;
  handleCommand(
    emitter: TransportEmitter, session: BBSSession, input: string, io?: IOServer,
  ): Promise<void> | void;
}

export function setupTelnetSSHHandler(
  connection: TelnetConnection | SSHConnection,
  type: 'telnet' | 'ssh',
  deps: TransportSessionDeps,
): void { /* index.ts:1080-1347, verbatim */ }
```

`handleCommand` is passed in rather than dynamically imported at
`index.ts:1252` for one reason: that `await import('./handlers/command.handler')`
is what pulls the whole command graph - and, transitively, `index.ts` - into
any test that touches the data handler. The call site becomes
`deps.handleCommand(emitter, session, input, deps.io)`; production wires it in
`index.ts` with the same dynamic import it uses today, so the module graph at
runtime is unchanged.

**Edits.**
- `web/backend/src/index.ts:1075-1348` - delete; add
  `import { setupTelnetSSHHandler } from './server/transport-session'` and a
  local `const transportDeps = { io, sessions, nodeManager, handleCommand: ... }`.
- The four call sites keep their shape and gain `transportDeps` in place of
  `io`: `index.ts:1783` (ws-terminal), `:1803` (telnet), `:1831` (dedicated
  PETSCII port), `:1863` (SSH).
- `flushPendingPetscii` (`connection-emitter.ts:58-66`), `classifyFirstKeypress`,
  `applyTerminalTypeReport`, `applyWindowSizeReport`, `convertPetsciiInputToAscii`
  and `sessionWantsPetscii` move with the body as ordinary imports - all six are
  already leaf-importable.

**RED tests** (`web/backend/tests/transport/transport-session.test.ts`):
1. **"a telnet keystroke reaches the command handler"** - a fake
   `TelnetConnection` (`EventEmitter` + `write` + `sessionId` + `nodeId` +
   `session`), `setupTelnetSSHHandler(conn, 'telnet', deps)` with a spy
   `handleCommand`, then `conn.emit('data', Buffer.from('M'))`; assert the spy
   saw `('M')` with the emitter as its first argument. **RED today** - the
   module does not exist, and importing `index.ts` to reach it starts servers.
2. **"the emitter is attached before the first byte can be written"** -
   assert `(conn as any).emitter` is defined synchronously on return, the
   invariant `telnet-server.ts:763` and `ssh-server.ts:303` both depend on.
3. **"a telnet close releases the node"** - `conn.emit('close')`, assert
   `nodeManager.releaseSession` was called with `connection.sessionId`.
4. **"nothing new runs on import"** - `require('../../src/server/transport-session')`
   inside a test that spies on `net.createServer`; assert zero calls. This is
   the property the whole task exists to create; it is asserted, not assumed.

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests` then
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/|tests/petscii/"`
**Success criteria.** Four tests green. `grep -n "function setupTelnetSSHHandler" web/backend/src/index.ts`
returns nothing. `git diff --stat` shows `index.ts` shrinking by ~270 lines and
`transport-session.ts` gaining the same, with no third file changed. The
identity suite passes with zero edits.

---

## Task TP-3 - the adapter: one ruling for all 232 event names

**New file** `web/backend/src/server/transport-adapter.ts`. A leaf module: it
imports types, `types/login-emitter` and `utils/wire-encoding.util` (TP-5) and
nothing from `handlers/`, so `connection-emitter.ts`, `transport-session.ts` and
the handlers can all import it with no cycle - the shape
`utils/petscii-session-model.ts` already established.

### The census, and its scope

Three greps, unioned, re-run on 2026-09-03 at `8b137017d`. **Scope is
`web/backend/src` + `sdk` + `Doors/*/[a-z]*.ts`** - the backend is not the only
thing holding a caller's socket.

```
# A - every quoted event name in the backend (149). The backend's whole
#     surface: any of these can be on a session socket.
cd web/backend/src && grep -rhoE "\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]" --include="*.ts" . \
  | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" | sort -u

# B - emits on a SESSION-SOCKET receiver outside the backend (86, of which 83
#     are new). A plain file grep over sdk/ returns 392 names, nearly all of
#     them blessed-widget and engine-internal EventEmitter traffic
#     ('click', 'focus', 'tick'); anchoring on the receiver is what separates
#     "reaches a caller" from "reaches a widget".
grep -rhoE "(^|[^A-Za-z0-9_.])(socket|emitter|sock)\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]|\.(socket|emitter)\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]" \
  --include="*.ts" sdk/engines sdk/utils sdk/types
for d in Doors/*/; do ls $d[a-z]*.ts 2>/dev/null; done | xargs grep -hoE "<same>"   # 0 hits today

# C - the emits whose name is a VARIABLE, which A and B cannot see at all.
grep -rnE "\.emit\(\s*(eventName|segState\.eventName|paged\.eventName|event)\b" --include="*.ts" web/backend/src
grep -rn "door:message" --include="*.ts" web/backend/src
```

**Union: 232 names.** 149 from A; 83 new from B; C contributes no names but a
pinned SITE list. The 83 split cleanly:

- **80 are SDK network-engine broker traffic** - `lobby:*` (24),
  `matchmaking:*` (11), `presence:*` (5), `social:*` (8), `sync:*` (5),
  `replay:*` (4), `leaderboard:*` (4), `stats:*` (2), `matches:*` (3),
  `party:*` (4), `achievements:*` (3), `voice:*` (3), `game:*` (2),
  `security:report`, `ping`, `join_room`, `leave_room` - emitted by
  `sdk/engines/network/modules/*.ts` onto a **`BrokerClient`**, which is an
  in-process socket shim, not a transport
  (`sdk/engines/network/broker/broker-client.ts:26-29`: *"acts as a socket for
  in-process multiplayer... The SDK's LobbySystem calls
  socket.emit('lobby:create', ...)"*). ONE `not-transport` ruling with
  `owner: 'BrokerClient'` covers all 80, and the written reason is that
  sentence.
- **3 are real session-socket emits the backend census could never see**:
  `audio:set-ui-sounds` (`sdk/engines/audio/audio-engine.ts:243`),
  `audio:set-volume` (`:266`) and `audio:play-sfx` (`:1196`, `:1214`, `:1231`),
  all through `this.socket` - the caller's socket, assigned from the
  constructor argument at `:102`. These get `web-only` rulings with their own
  notes; a byte terminal has no Web Audio context.

### The capability model

```ts
import type { BBSSession } from '../index';
import type { LoginEmitter } from '../types/login-emitter';

/**
 * The socket-shaped object a session is reached through: socket.io's Socket
 * and the telnet/SSH emitter both satisfy it. `types/login-emitter.ts` already
 * defines that surface for the login pipeline; this extends it with the two
 * members the adapter needs. NO `any` crosses this module's boundary.
 *
 * `types/login-emitter.ts:12-17` currently documents the silent drop as "the
 * intended behaviour" - that comment is what this plan overturns and TP-15
 * rewrites it.
 */
export interface TransportEmitter extends LoginEmitter {
  emitInternal?(event: string, ...args: unknown[]): boolean;
  readonly session?: BBSSession;
}

/**
 * What this session's transport can actually do.
 *
 * ONE answer, many readers. Before this existed the same question was asked
 * eight different ways - `connectionType === 'web'`, `type === 'telnet'`,
 * `!!socket.handshake`, "does BBSApi define onKeyDown" - and each copy could
 * (and did) answer differently for the same caller.
 */
export interface TransportCapabilities {
  /** A byte stream the server must encode itself (telnet, SSH, /ws/terminal). */
  readonly bytes: boolean;
  /** socket.io: named events with structured payloads reach a browser. */
  readonly events: boolean;
  /** key-down / key-up EDGES arrive. False for every byte transport: there is
   *  no key-up in a character stream. Read by game mode (TP-7). */
  readonly keyEvents: boolean;
  /** A browser is present to run a client door bundle and to accept an HTTP
   *  download trigger. Read by the door gate (TP-6) and downloads (TP-11). */
  readonly browser: boolean;
  /** RIPscrip is rasterised by the caller. Web only; there is no server-side
   *  rasteriser (`handlers/screen.handler.ts:1862-1869`). */
  readonly rip: boolean;
}

export function transportCapabilities(
  session: Pick<BBSSession, 'connectionType'> | null | undefined,
): TransportCapabilities {
  const web = session?.connectionType === 'web';
  return { bytes: !web, events: web, keyEvents: web, browser: web, rip: web };
}
```

Every field derives from ONE fact today (`connectionType`), deliberately: the
struct is the seam, so when a future transport gains key edges exactly one
function changes and no caller does. `/ws/terminal` sessions are created with
`connectionType: "telnet"` (`index.ts:1774`) and are therefore byte transports,
which is correct.

### The ruling table, and the pattern arm

```ts
export type EventRuling =
  /** The adapter turns it into bytes for a byte terminal. */
  | { kind: 'render'; note: string }
  /** The adapter turns it into server-side connection/session state. */
  | { kind: 'translate'; note: string }
  /** Meaningful only to a browser. Dropped on a byte transport, counted, and
   *  logged ONCE PER NAME PER CONNECTION. */
  | { kind: 'web-only'; note: string }
  /** Emitted, but NO consumer exists on ANY transport. A defect in its own
   *  right; ruled here so it cannot masquerade as a transport gap. */
  | { kind: 'dead'; note: string }
  /** Not a session socket at all - an EventEmitter on a server, a manager, a
   *  bridge or the in-process broker shim. `owner` names it so the claim can
   *  be checked. */
  | { kind: 'not-transport'; owner: string; note: string };

export const EVENT_RULINGS: Readonly<Record<string, EventRuling>>;   // 232 entries

/**
 * Names built at runtime, which no literal grep can enumerate. Matched BEFORE
 * the unruled path, in array order, first match wins.
 */
export const PATTERN_RULINGS: ReadonlyArray<{
  test: RegExp; ruling: EventRuling; sites: string;
}>;
```

**Every entry carries a `note`.** A ruling with an empty note fails the
enumeration test - the point of the table is the written reason, not the
classification.

`PATTERN_RULINGS` has exactly two entries today, and both are grep-pinned:

| pattern | ruling | sites |
|---|---|---|
| `/^door:message:/` | `web-only` - a client door's frames, addressed to the browser bundle that `door:load-client` fetched. TP-6 refuses a client door on a byte transport, so after TP-6 this can only be reached by a hybrid whose client half was skipped, and the drop tally is the proof it was | `doors/client-door-bridge.ts:182` (built), `:426` (emitted), `:501` (removed) |
| `/^(ansi-output\|petscii-output\|petscii-bytes)$/` reached through a VARIABLE | `render` - the variable always resolves to one of the three rendered names | `handlers/screen.handler.ts:2236, 2418, 2557, 2576, 2768, 2793, 2804, 2842, 2961, 2964` and `handlers/command-handler/pre-login.ts:110, 111, 270` (`getOutputEvent(session)`, defined `:16`) |

The second entry is not a licence: the enumeration test asserts that the ten
`screen.handler.ts` sites and the three `pre-login.ts` sites are EXACTLY the
variable-emit sites in `web/backend/src`, by re-running grep C. A new
variable-emit site is a test failure, not a silent pass.

### The bulk classes, re-derived from the census output

Counts are from the census above, not from memory; the implementer confirms
each name individually rather than by prefix.

| class | count | ruling |
|---|---|---|
| terminal bytes: `ansi-output`, `petscii-output`, `petscii-bytes` | 3 | `render` - the three the emitter already handles |
| `chat:*` | 27 | `web-only` - consumed by `web/config-app/src/realtime/RealtimeProvider.tsx` and `web/frontend/src/chat`. The BBS-side chat a telnet caller CAN reach travels as `ansi-output` and is fixed by TP-10, not by this table |
| `room:*` | 14 | `web-only`, same consumers |
| `operator:*` | 12 | `web-only`, same consumers |
| `door*` (`door-active`, `door:status`, `door:ready`, `door:exit`, `door:error`, `door:output`, `door:await-key`, `door:password-mode`, `door:input`, `door:input-mode`, `door:load-client`) | 11 | `door-active` and `door:input-mode` are `translate` (TP-4); `door:load-client` is `web-only`; the other eight are `dead` - no listener in `packages/terminal/src`, `web/frontend/src` or `web/config-app/src`. `door:await-key`'s note names `DoorMessageHandler.ts:2813`, which parks the 68K emulator waiting for a `door:keypress` nothing ever sends, and the non-goal that leaves it unfixed |
| `transfer*` (`transfer-raw:*` 6, `transfer:*` 5, minus overlap) | 10 | `web-only`: the browser's ZMODEM channel and the dead `transfer:*` scaffold (no frontend listener at all). Telnet has `transferRawSend` instead (`index.ts:1111-1131`) |
| login / session: `prompt-login`, `prompt-password`, `prompt-password-reset`, `prompt-forced-pwd-change`, `forced-pwd-change-complete`, `retry-login`, `login-success`, `login-failed`, `user-not-found`, `session-restored`, `session-restore-failed`, `chat-only-login-*` | 12 | `web-only`. **`prompt-login` keeps its seven server-side emit sites** (`command.handler.ts:1083, 1580, 1634, 1685`; `pre-login.ts:84, 119, 284`) - TP-9b re-points its browser handler instead of removing it. Each other note names the server-side prompt that replaces it |
| `voice:*` 6, `video:*` 6, `audio*` 7 (backend) + `audio:play-sfx`, `audio:set-ui-sounds`, `audio:set-volume` (SDK) | 22 | `web-only` - browser media APIs |
| connection state: `game-mode`, `modem-speed`, `mask-input`, `password-mode`, `set-input-mode`, `terminal-mode`, `terminal-resize`, `cursor-style` | 8 | `translate` (TP-4) |
| transport action: `hangup`, `force-disconnect` | 2 | `translate` - close the connection (TP-4) |
| rendered notices: `system-message`, `system:notice` | 2 | `render` - the payload's `text` becomes an `ansi-output` line (TP-4) |
| browser chrome: `set-font`, `font-preference`, `font-changed`, `theme-preference`, `theme-changed` | 5 | `web-only` - a byte terminal's font is the caller's business |
| HTTP/DOM transfer: `download-file`, `show-file-upload` | 2 | `web-only`; TP-11 removes the reachable path that emits `download-file` to a byte transport at all |
| not a session socket: `connection`, `data`, `close`, `ready`, `error`, `command`, `complete`, `progress`, `window-size`, `terminal-type`, `disconnect`, `c64-detected`, `pong-test`, `network-pong`, `import:progress`, `supervisor:command`, `example-data`, `example-result`, `active-users`, `olm-quiet-status`, `bbs:event` | 21 | `not-transport`, `owner` naming the emitter (`TelnetServer`, `SSHConnection`, `ClientDoorBridge`, `LrzszTransferManager`, the import service, the SDK example harness, the in-process LiveChat event bus at `login-post.service.ts:269`) |
| SDK broker traffic | 80 | ONE `not-transport` ruling, `owner: 'BrokerClient'` |

232 total. The residue after these classes is zero, and the enumeration test is
what proves it.

### The chain gets its `else`

`web/backend/src/server/connection-emitter.ts:90-140` keeps its three fast
branches verbatim - **not one byte of the rendered path changes here** - and
gains a final `else` that calls the adapter:

```ts
      } else if (event === "petscii-bytes") {
        /* unchanged, :125-139 */
      } else {
        // Every other name. The adapter either performs the event's
        // translation (connection state, a transport action, a rendered
        // notice) or records a RULED drop. An unruled name is a defect and
        // says so once, loudly: the backend must never emit an event to a
        // session that cannot receive it without this file knowing about it.
        applyTransportEvent(connection, session, event, args);
      }
```

`emit` widens from `(event: string, data: any)` to
`(event: string, ...args: unknown[])`; the three existing branches keep reading
`args[0]` as `data`, which is what every current caller passes. The third
argument the wipe path already sends (`PRE_PACED`, `utils/output-pacing.ts:61`,
emitted at `screen.handler.ts:2524`) rides through untouched, as it does today.

```ts
export interface TransportDropRecord {
  readonly event: string;
  count: number;
  readonly ruling: EventRuling['kind'] | 'unruled';
}

export function applyTransportEvent(
  connection: TransportConnection,
  session: BBSSession | null | undefined,
  event: string,
  args: readonly unknown[],
): void {
  const ruling = EVENT_RULINGS[event] ?? matchPattern(event);
  if (!ruling) {
    recordDrop(connection, event, 'unruled');
    // ONCE PER NAME PER CONNECTION, like every other drop: a door emitting an
    // unruled name sixty times a second must not be able to fill the log.
    // recordDrop returns true the first time it sees a name on a connection.
    if (firstSighting) {
      console.error(`[Transport] UNRULED event '${event}' on ${session?.connectionType} node ${session?.nodeId} - add it to EVENT_RULINGS`);
    }
    return;
  }
  if (ruling.kind === 'translate' || ruling.kind === 'render') {
    applyTranslation(connection, session, event, args);   // TP-4
    return;
  }
  if (recordDrop(connection, event, ruling.kind)) {
    console.debug(`[Transport] ${ruling.kind} event '${event}' not delivered to ${session?.connectionType}: ${ruling.note}`);
  }
}
```

Not a throw: a throw here would take down a door mid-frame for a cosmetic
event. `recordDrop` increments `connection.transportDrops`
(a `Map<string, TransportDropRecord>`) and returns whether this was the first
sighting of that name on that connection - the research counted 50 drops in one
short session, and a per-occurrence log would be noise the moment a door starts
emitting `door:status` twelve times.

**RED tests** (`web/backend/tests/transport/transport-adapter.test.ts`):
1. **"every event name the backend, the SDK and the doors emit has a written
   ruling"** (the controller's enumeration test). The list is a **pinned array
   in the test file**, `PINNED_EVENT_NAMES`, produced by greps A and B and
   committed. The test asserts (a) every pinned name is a key of
   `EVENT_RULINGS`, (b) every key of `EVENT_RULINGS` is a pinned name (no
   invented entries), (c) every ruling's `note` is non-empty, and (d) every
   `not-transport` ruling names an `owner`.
2. **"the pin is not stale"** - the test re-runs greps A and B with
   `child_process.execFileSync` over `web/backend/src`, `sdk` and
   `Doors/*/[a-z]*.ts` and asserts the union equals `PINNED_EVENT_NAMES`, with
   a failure message that prints the added and removed names and says to rule
   them. This is what makes (1) a live gate rather than a snapshot. It skips
   with an explicit `it.skip` reason if those trees are absent (a packaged
   run), never silently.
3. **"the variable-emit sites are the ones the pattern arm claims"** - re-runs
   grep C and asserts the site list equals the thirteen in `PATTERN_RULINGS`.
   **RED the day anyone adds a fourteenth.**
4. **"a client door's frame is a ruled drop, not an unruled one"** -
   `emit('door:message:abc123', ...)` matches the pattern arm; the drop record
   says `web-only` and no `console.error` fires.
5. **"an unruled event is loud exactly once"** - emit a name absent from the
   table three times; assert one `console.error` and a drop count of 3.
6. **"a web-only event is dropped, counted, and logged once"** - emit
   `door:load-client` three times; assert count 3 and one `console.debug`.
7. **"the three rendered events are untouched"** - the full
   `eightyColumnWalk` from `tests/server/eighty-col-choke-identity.test.ts`
   through the widened `emit`, byte-compared against the same baseline that
   file builds, INCLUDING a `PRE_PACED` third argument on one payload to prove
   the widening did not eat it.
8. **"a byte transport reports no key events, no browser, no RIP"** -
   `transportCapabilities({connectionType:'telnet'})` and `'ssh'` are
   `{bytes:true, events:false, keyEvents:false, browser:false, rip:false}`;
   `'web'` is the mirror image. `/ws/terminal`'s session (built with
   `connectionType:'telnet'`, `index.ts:1774`) is a byte transport.

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests` then
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/|tests/handlers/petscii-bytes-transport"`
**Success criteria.** Tests 1-8 green.
`grep -n ": any" web/backend/src/server/transport-adapter.ts` returns NOTHING.
`tests/server/connection-emitter-petscii.test.ts`,
`connection-emitter-petscii-flush.test.ts`, `handlers/petscii-bytes-transport.test.ts`
and `eighty-col-choke-identity.test.ts` pass with **zero edits** - the proof
that widening the signature and adding the `else` changed nothing that was
already handled. TP-1 test 2 is rewritten here to its adapter form and flips
GREEN.


## Task TP-4 - the translated events become connection state

The `translate` and rendered-notice rulings from TP-3 get bodies, in
`applyTranslation` (`server/transport-adapter.ts`). Every one of these already
has a live web consumer, so each is a real behaviour a byte-transport caller
does not currently get.

| event | web consumer | byte-transport translation |
|---|---|---|
| `door-active` (`door.handler.ts:881,936,2255,2276,2293,2397,2501,2540,2576,2590,3077,3179,3343`) | `BBSTerminal.tsx:2542` (bypass client pacing) | `session.doorOwnsTerminal = args[0]`; the server ModemEmulator is disabled while true and restored after, which is what the browser's bypass achieves for web |
| `game-mode` (`services/game-mode.service.ts:28`, `:44`, `door.handler.ts:4436`, `doors/client-door-bridge.ts:513`) | `BBSTerminal.tsx:2595` | no-op with a note: `session.gameModeEnabled` is already set by the service before the emit, and a byte transport has no key edges to turn on (TP-7 makes that the door's answer) |
| `modem-speed` (11 sites) | `BBSTerminal.tsx:2257` | `getModemEmulator(emitter).enable(bps)` / `.disable()` - the server emulator, the only one a byte caller has |
| `mask-input` (17 sites) | login machine | `session.maskEcho = args[0]`; the server-side line editors (`command.handler.ts:1761`, `:1905`, and the system-password gate at `:1667-1671`) read it instead of each deciding for themselves. This closes divergence 36: the system-password prompt currently emits nothing while typing and a telnet caller sees no asterisks |
| `password-mode`, `door:password-mode`, `set-input-mode`, `door:input-mode` (`BBSApi.ts:524`) | `BBSTerminal.tsx:2284` | fold into `session.maskEcho` / `session.doorInputMode`; each note names which |
| `terminal-mode` (`BBSApi.ts:483`) | `BBSTerminal.tsx:2296` | `session.terminalMode`; read by nothing server-side today, so the note records it as state-only |
| `cursor-style` (`BBSApi.ts:510`) | `BBSTerminal.tsx:2289` | `render` - the DECSCUSR sequence `\x1b[<n> q`, which every VT-class terminal understands. Byte transports get the real thing rather than a translation |
| `terminal-resize` (`pre-login.ts:162`) | `BBSTerminal.tsx:2268-2278` | no-op with a note: on a byte transport the caller's terminal is the authority and `applyClientReportedGeometry` (`amiga-emulation/xim/screen-width.util.ts:60-70`) already refuses to be told otherwise for a PETSCII session |
| `hangup` (`amiga-emulation/session/DoorMessageHandler.ts:1676`, BB_DROPDTR) | none | `connection.close()` - a 68K door can drop a telnet carrier, which is what BB_DROPDTR means |
| `force-disconnect` (`handlers/commands/system-commands.handler.ts:216`) | none | `connection.close()` after the emitter's buffers flush |
| `system-message`, `system:notice` | admin app | `render`: `emitText(emitter, String(args[0]?.text ?? ''))` - **`emitText` from `utils/output.util.ts:34`**, the wrapper the handlers import (`screen.handler.ts:36`, `door.handler.ts:26`), not the `utils/ansi-buffer.util.ts:195` original it delegates to. The sysop's kick notice (`api/node-control-routes.ts:271-275`) is one of these and must reach a telnet caller |
| `set-font`, `theme-preference`, `font-preference`, `theme-changed`, `font-changed` | browser chrome | `web-only`; noted, not translated - a byte terminal's font is the caller's business |

**Ordering rule, written into the module.** `applyTranslation` runs on the way
DOWN, before any byte would be written, and never re-enters `emitter.emit` for
anything but `render` cases - a translation that emitted would re-enter the
chain and could recurse. The two `render` cases (`cursor-style`,
`system-message`) call `emitText` / `connection.write` directly and are the
documented exceptions. Both go through `utils/output.util.ts`
(`emitText` `:34`, `emitPrompt` `:53`), never through
`utils/ansi-buffer.util.ts` directly - one entry point, so the wrap choke and
the session log see them like everything else. Neither carries a
`sourceCharset` attribute: they are composed text, not screen-file content
(TP-5's rule).

**RED tests** (`web/backend/tests/transport/transport-translations.test.ts`):
1. **"a 68K door can drop a telnet carrier"** - drive the real BB_DROPDTR path
   so `socket.emit('hangup', ...)` runs against a connection emitter; assert
   `connection.close()` was called once. **RED today** (divergence 12).
2. **"the sysop's kick notice reaches a telnet caller"** - `emit('system-message', {text})`;
   assert the text is on the wire.
3. **"a door that zeroes the modem speed is not still throttled"** -
   `emit('modem-speed', 0)` on a session whose server ModemEmulator is enabled;
   assert `getModemEmulator(emitter).enabled === false`. **RED today**
   (research 2.4: the door's bypass signals are discarded on telnet, so the
   server throttle stays on).
4. **"the system password prompt masks on telnet"** - drive the real
   system-password gate (`command.handler.ts:1667-1671`), type three
   characters; assert three `*` reached the wire. **RED today** (divergence 36).
5. **"a translation never re-enters the emitter"** - a spy on
   `emitter.emit`; drive every `translate` ruling; assert zero re-entrant
   calls, and exactly the two documented `render` exceptions write bytes.
6. **"a rendered notice goes through output.util"** - a spy on
   `utils/output.util.ts`'s `emitText`; assert one call for a
   `system-message` and zero direct `utils/ansi-buffer.util.ts` calls.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/eighty-col|tests/doors/bbsapi-"`
**Success criteria.** Six tests green; the identity suite unchanged; every
`translate` ruling in `EVENT_RULINGS` has a body and every body has a test
naming its symptom.

---

## Task TP-5 - the wire encoder, and the charset a payload came from

**The level this belongs at.** The symptom is mojibake on classic clients. It
could be "fixed" at three levels: the decoder (never decode - carry bytes
through the whole MCI / wrap / filter pipeline: a rewrite of everything that
touches a screen), the producer (each screen emitter encodes: 1832 call sites),
or the transport (one encoder where the string becomes a buffer). The last is
where the mismatch actually is - the string is correct, the byte conversion is
not - and it is the controller's decision 2. One place, one codec choice,
measured.

**The wrinkle that forces a second half.** The board serves TWO source charsets
from disk. `readAmigaTextFile` (`utils/amiga-text-decode.util.ts:167-204`)
returns `{text, encoding}` where `detectEncoding` (`:105-158`) answers `cp437`
for a `.ans` file or anything SAUCE-stamped (`:110-113`) and `iso-8859-1`
otherwise, and that `encoding` is **discarded before the text reaches the
transport**. A single session-level charset therefore cannot be right for both:
Latin-1 round-trips this board's own art byte-for-byte and turns an imported
`.ANS` into ASCII line art, and CP437 does the reverse. So the source charset
travels WITH the payload.

### The carrier

`web/backend/src/utils/output-pacing.ts` already established the shape and its
doc comment argues for it (`:26-42`): a third argument on `ansi-output` rather
than a new event name, *"because every emit wrapper on this board forwards
`(event, ...args)` untouched... but the telnet/SSH emitter switches on a FIXED
set of event names and drops anything else"*. The same object gains one
optional field:

```ts
// utils/output-pacing.ts - the file keeps its name; PRE_PACED is untouched.
export interface OutputAttributes {
  /** The server already paced this payload (unchanged, see this file's header). */
  prePaced?: true;
  /**
   * The charset this payload's CHARACTERS were decoded from, when the payload
   * is screen-file content. `readAmigaTextFile` knows it
   * (`utils/amiga-text-decode.util.ts:182-192`) and it used to die there.
   *
   * Absent means "no source charset": door output, prompts, MCI-substituted
   * text and anything a handler composed. Those are UTF-8-in by construction
   * and are encoded to the caller's negotiated wire charset with the
   * box-glyph fallback.
   */
  sourceCharset?: 'cp437' | 'iso-8859-1';
}
export type OutputPacing = OutputAttributes;   // the old name, kept for its importers
export const PRE_PACED: Readonly<OutputAttributes> = Object.freeze({ prePaced: true });
export function fromCharset(enc: 'cp437' | 'iso-8859-1'): Readonly<OutputAttributes>;
export function pacedFromCharset(enc: 'cp437' | 'iso-8859-1'): Readonly<OutputAttributes>;
```

The two factories return frozen, memoised singletons (four objects total), so a
per-frame emit allocates nothing - the property `PRE_PACED` has today.

**Where the attribute is attached.** Only the screen-file path knows an
encoding, and it is the path whose emits are already direct rather than
buffered. `displayScreen`, `displayIncludedScreen`, the pagination path and the
ANSI-animation path each already hold the `readAmigaTextFile` result; each
passes `fromCharset(result.encoding)` (or `pacedFromCharset` where it passes
`PRE_PACED` today) to the emits it makes. The sites are exactly the thirteen
`PATTERN_RULINGS` pins from TP-3 - `screen.handler.ts:2236, 2418, 2557, 2576,
2768, 2793, 2804, 2842, 2961, 2964` and `pre-login.ts:110, 111, 270` - plus
`emitWithModem`'s two internal emits, which take the attribute as a parameter
rather than inventing one. Nothing else changes: a handler that composes a
prompt passes no attribute and gets the negotiated-charset path, which is the
correct answer for text that never came off disk.

**`emitText` / `emitPrompt` carry no attribute, by rule.** They live in
`utils/output.util.ts:34` and `:53`, which wrap
`utils/ansi-buffer.util.ts:195` and `:216`, and the buffer CONCATENATES
payloads before flushing (`ansi-buffer.util.ts:99-104`) - a per-payload
attribute cannot survive that. Screen-file content does not go through them
today and must not start; the rule is written at the top of `output.util.ts`
and asserted by test 9.

### The encoder

**New file** `web/backend/src/utils/wire-encoding.util.ts`:

```ts
/**
 * The ONE place a JS string becomes bytes for a byte-transport caller.
 *
 * Until this module existed the string went to TelnetConnection.write, which
 * did `Buffer.from(data)` with no encoding argument (telnet-server.ts:495)
 * i.e. UTF-8, and to SSHConnection.write's `this.stream.write(data)`
 * (ssh-server.ts:136), Node's UTF-8 default. Measured on the live board:
 * Screens/BBSTITLE.txt is 13894 bytes on disk with 240 of them >= 0x80, and
 * left as 14134 - every high byte doubled, every art line one character wider
 * than the screen for every terminal that is not UTF-8.
 */
export type WireCharset = 'utf-8' | 'iso-8859-1' | 'cp437';

/** No negotiated answer: Latin-1. `detectEncoding` returns 'iso-8859-1' for
 *  everything that is not a .ans or SAUCE-stamped file, and RULES.md's output
 *  convention forbids PC box-drawing in the BBS's own output, so Latin-1
 *  round-trips this board's screens byte-for-byte. */
export const DEFAULT_WIRE_CHARSET: WireCharset = 'iso-8859-1';

export function resolveWireCharset(session: BBSSession | null | undefined): WireCharset;

/**
 * The string unchanged when the resolved charset is UTF-8 - today's behaviour
 * for web, for /ws/terminal, and for a telnet client that negotiated UTF-8 -
 * and a Buffer in that charset otherwise. The union return is load-bearing
 * twice over: `TelnetConnection.write` already does `Buffer.from(data)` for a
 * string (telnet-server.ts:495), so the UTF-8 case is a literal no-op diff;
 * and `WSTerminalConnection.write` (ws-terminal-server.ts:78-85) sends a TEXT
 * frame for a string and a BINARY frame for a Buffer, so returning a Buffer
 * there would change the frame type its clients receive.
 */
export function encodeForWire(
  session: BBSSession | null | undefined,
  text: string,
  attrs?: Readonly<OutputAttributes>,
): string | Buffer;
```

`encodeForWire`'s contract, in three cases, in this order:

1. **wire charset is UTF-8** - return `text`. Nothing changes for web,
   `/ws/terminal`, or a UTF-8 telnet client.
2. **`attrs.sourceCharset === wireCharset`** - `iconv.encode(text, charset)`,
   which reproduces the file's own bytes exactly, because a single-byte codec
   is a total injective map and `encode(decode(b, S), S) === b`. This is the
   case the BBSTITLE pin measures, and the case that makes a `.ans` reach a
   CP437 caller as the bytes the file holds.
3. **otherwise** - `iconv.encode(substituteUnmappable(text, charset), charset)`.
   A `.ans` (cp437 source) to a Latin-1 caller, or any composed text with no
   source charset, is transcoded to what the caller can read.

**`substituteUnmappable`** replaces characters the target charset cannot hold
with the ASCII forms `RULES.md` already mandates for BBS output (*"Amiga ASCII
only: `_/\|-`"*): `U+2500-U+257F` to `-`, `|`, `+`; `U+2580-U+259F` to `#`, `:`
and space. It is a `Map<number, string>` keyed by CODEPOINT and applied by a
**single forward scan over `text.codePointAt(i)`** - never a module-level `/g`
`RegExp` with `.test()`, whose `lastIndex` is shared state and which bit this
codebase once already on an async-recursive path. The scan short-circuits: it
walks the string once, and for `charset === 'iso-8859-1'` only a code point
> 0xFF can miss, so an all-ASCII payload (the overwhelming majority) does one
pass and allocates nothing.

### Negotiation - how a session gets a wire charset

**ONE terminal predicate.** `classifyTerminalType`
(`telnet-server.ts:73-110`) already computes `unicodeCapable` at `:107` from
its modern / Amiga / C64 lists, and the result is already stored on the session
(`telnet-server.ts:790`) and already read by every blessed door
(`doors/BBSApi.ts:264-271` -> `sdk/utils/blessed-helpers.ts:979-994`). The wire
charset is DERIVED from it - **`unicodeCapable` is exactly "this caller reads
UTF-8"** - and no second list of terminal names is written:

```ts
export function resolveWireCharset(session): WireCharset {
  if (session?.connectionType === 'web') return 'utf-8';
  if (session?.wireCharset) return session.wireCharset;          // CHARSET negotiated
  if (session?.unicodeCapable === true) return 'utf-8';          // classifyTerminalType
  return DEFAULT_WIRE_CHARSET;
}
```

Precedence: an explicit CHARSET negotiation beats the TTYPE classification,
which beats the default. `unicodeCapable` is `undefined` for a caller who
negotiated no TTYPE, which correctly falls through to Latin-1 - and for SSH
until TP-12 fills it in, at which point SSH inherits the same one predicate.

**Telnet CHARSET (RFC 2066).** `telnet-server.ts` adds `DO CHARSET`
(option 42) to `initializeTelnet` (`:208-233`, immediately after the `DO NAWS`
at `:221`), a `CHARSET` arm to the SB option dispatch beside the TTYPE arm
(`:298-306`, consumed at `:330-340` where `handleTerminalType` is called), and
answers a client's `CHARSET REQUEST` with `ACCEPTED` for the first of `UTF-8`,
`ISO-8859-1`, `IBM437` it recognises, `REJECTED` otherwise. The accepted name
becomes `connection.wireCharset` and is copied onto the session by the same
applier the TTYPE report uses. A client that never sends CHARSET is unaffected;
the 500 ms TTYPE timer at `:819-821` is the precedent for tolerating silence.

### Edits

- `server/connection-emitter.ts:112` -
  `connection.write(encodeForWire(session, data.replace(/\r?\n/g, "\r\n"), args[1] as OutputAttributes))`.
  The CRLF normalisation runs BEFORE the encode, on the string, exactly where it
  runs today. `:114` (non-string) unchanged - ZMODEM buffers pass untouched.
- `:123` (`petscii-output` on a non-PETSCII session) -
  `connection.write(encodeForWire(session, String(data), args[1] as OutputAttributes))`.
- The PETSCII branches (`:99`, `:121`, `:134-135`) are **untouched**: they
  already produce bytes and PETSCII is its own charset.
- `server/telnet-server.ts:494-508` - `write` is **unchanged**. Both arms stay
  live: a Buffer arrives for a Latin-1 or CP437 caller, a string for a caller
  who negotiated UTF-8 (where `Buffer.from(data)` is the correct encode and
  this task is a literal no-op) and for the two pre-emitter fallback prompts
  (`:774`, `ssh-server.ts:312`), which are pure ASCII. A one-line comment
  records which arm serves which.
- **`/ws/terminal` is UTF-8.** `WSTerminalConnection.write`
  (`server/ws-terminal-server.ts:78-85`) sends a text frame for a string and a
  binary frame for a Buffer, and a WebSocket text frame is UTF-8 by RFC 6455.
  Its session is created with `connectionType: "telnet"` (`index.ts:1774`) and
  cannot otherwise be told apart, so one line in that factory
  (`index.ts:1773-1779`) sets `wireCharset: 'utf-8'` at creation, using the same
  field a CHARSET negotiation would set. `connectionType` is NOT changed: nine
  `=== 'telnet'` comparisons in `web/backend/src` and one in the tests depend on
  it (count taken 2026-09-03; reproduce with
  `grep -rn "=== 'telnet'" web/backend/src --include='*.ts'`).
- `BBSSession` gains `wireCharset?: WireCharset` beside `unicodeCapable`
  (`server/session-manager.ts:109` declares the latter).

### RED tests (`web/backend/tests/transport/wire-encoding.test.ts`)

**No mock `connection.write` in this file** - every case builds a real
`TelnetConnection` over a stub `net.Socket` (`on` + `write`) and reads the
bytes the SOCKET received, snapshotting past `initializeTelnet`'s seven
negotiation writes. The suite asserts its own compliance in a header test
(`readFileSync(__filename)` contains no `write:` property literal), because the
emitter idiom's fake write already produces latin1 bytes and would make every
case below pass on arrival.

1. **"a screen's high bytes reach a classic client unchanged"** - byte array for
   a line containing `0xB7`, `0xBD`, `0xE9`; decode it the way
   `readAmigaTextFile` does (`iconv.decode(buf, 'iso-8859-1')`); emit with
   `fromCharset('iso-8859-1')`; assert `Buffer.compare(socketBytes, original) === 0`.
   Fixture built in code, never written to a file (the high-bit rule).
2. **"BBSTITLE is 13894 bytes on the wire, not 14134"** (the controller's pin) -
   read the real `Screens/BBSTITLE.txt` through `readAmigaTextFile`, emit with
   its own `encoding`, assert the socket received 13894 bytes identical to the
   file. Skipped with an explicit reason - never silently - if the file is
   absent from the checkout.
3. **"a .ans reaches a CP437 caller as the bytes the file holds"** - a cp437
   fixture with box-drawing; session `wireCharset: 'cp437'`; assert byte
   equality. This is case 2 of the encoder contract and the reason the carrier
   exists.
4. **"a .ans reaches an Amiga caller as ASCII line art"** - the same fixture on
   a Latin-1 session; assert `-`, `|`, `+` and **no** `0x3F`.
5. **"a UTF-8 client still gets UTF-8"** - `unicodeCapable: true` on the
   session; assert `0xC2 0xB7`, i.e. today's bytes, and that the value written
   was a string (so `TelnetConnection.write`'s string arm ran).
6. **"the wire charset comes from the one terminal predicate"** - table-driven
   over `classifyTerminalType`: `XTERM-256COLOR` -> `utf-8`; `SYNCTERM`,
   `NCOMM`, `TERM`, `VT52`, `UNKNOWN`, `C64` -> `iso-8859-1`. No second list
   exists to test.
7. **"a CHARSET negotiation beats the TTYPE classification"** - drive the real
   `TelnetConnection.handleData` with `IAC SB CHARSET REQUEST ; IBM437 IAC SE`
   on a connection whose TTYPE said `XTERM`; assert the `ACCEPTED` reply on the
   socket and `cp437` on the wire afterwards. The first IAC-negotiation test in
   the repo beyond TTYPE.
8. **"a /ws/terminal client still gets text frames"** - a fake
   `WSTerminalConnection` recording `(payload, opts)`; emit a string with a
   high byte; assert `opts?.binary` is falsy and the payload is a string.
9. **"screen content never goes through the buffer"** - assert that
   `displayScreen` reaches the wire without `emitText`, by spying on
   `utils/output.util.ts`'s export and asserting zero calls for a screen paint.
   The rule the attribute depends on, pinned rather than assumed.
10. **"the web path is byte-identical"** - the identity suite's web walk, run
    before and after; `toBe` on the emitted argument instances.
11. **"PRE_PACED still rides through"** - a wipe frame emitted with
    `pacedFromCharset('iso-8859-1')`; assert the third argument arrives at the
    web socket intact and the telnet socket gets the right bytes.

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests` then
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/|tests/utils/|tests/handlers/screen"`
**Success criteria.** Eleven tests green. TP-1 test 1 flips GREEN.
`grep -n ": any" web/backend/src/utils/wire-encoding.util.ts` returns NOTHING.
`eighty-col-choke-identity.test.ts` passes **with zero edits** - its telnet
baseline at `:403` has been asserting `latin1` all along, so this task is the
first time production agrees with it.


## Task TP-6 - the browser-door gate, and the RIP answer

**The gate.** New export in `web/backend/src/utils/door-min-columns.util.ts`,
beside the MIN_COLUMNS family it copies - one module, one shape, one refusal
path:

```ts
/** Uppercase-only ASCII, the DOOR_NEEDS_80_NOTICE rule (:37-39). */
export const DOOR_NEEDS_BROWSER_NOTICE = '\r\nTHIS DOOR NEEDS A WEB BROWSER\r\n';

/**
 * THE predicate: does this door require a browser the caller does not have?
 *
 * Two sources, in the order declaredMinColumns() uses so the two families can
 * never disagree about which registration object carries the truth:
 *  - manifest `runtime: 'client'` - the whole door IS a browser bundle;
 *  - `CLIENT_ONLY=YES` - a hybrid whose server half is RPC-only and cannot
 *    stand alone. `Doors/arkanoid` is the one such door today: its server half
 *    is RPC handlers (`Doors/arkanoid/server.ts`) and `executeDoor` then awaits
 *    `bridge.waitForSessionEnd` (`door.handler.ts:2355`), a promise that on a
 *    byte transport can never resolve because `endSession`
 *    (`doors/client-door-bridge.ts:455`) is reachable only from
 *    `socket.once('disconnect')` (`:319`), and 'disconnect' is on the
 *    emitter's synthetic bus where nothing fires it.
 *
 * A hybrid WITHOUT the tooltype is NOT refused: fourteen of the fifteen export
 * a real SDK door and paint a usable blessed UI with no browser half at all.
 * They skip executeClientDoor and run their server half - which is what TP-7
 * makes playable.
 */
/** `manifest` is the shape loadDoorManifestForExecution returns; only
 *  `runtime` is read, so it is narrowed rather than typed `any`. */
export function doorNeedsBrowser(
  door: MinColumnsDoorShape | null | undefined,
  manifest: { runtime?: string } | null | undefined,
): boolean;
```

**Edits in `web/backend/src/handlers/door.handler.ts`.** The manifest is not
known until `loadDoorManifestForExecution` (`:1784`), so the gate sits between
that and the client branch at `:1787`, and uses the identical refusal shape the
MIN_COLUMNS gate uses at `:1738-1745`:

```ts
    const doorManifest = await loadDoorManifestForExecution(door);

    // Transport gate, the browser cousin of the MIN_COLUMNS gate above. A
    // client door's frames travel as `door:message:<id>`
    // (doors/client-door-bridge.ts:426) and its bundle is fetched by the
    // browser after `door:load-client` (:4452) - on a byte transport both are
    // ruled web-only by the adapter, so the caller would sit in front of a
    // frozen screen with a no-op input handler (:4441) and a 30 s PING loop
    // (:434-443) that nothing can stop. Refuse instead, the same way and
    // through the same return shape.
    if (doorNeedsBrowser(door as any, doorManifest) && !transportCapabilities(session).browser) {
      emitPrompt(socket, DOOR_NEEDS_BROWSER_NOTICE);
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }
```

and the hybrid branch at `:1794-1803` gains one clause: `executeClientDoor` runs
only when `transportCapabilities(session).browser` is true; otherwise
`hybridSessionId` stays null and control falls through to the type switch
exactly as it does for a server door. The `if (!hybridSessionId) return;` at
`:1798-1801` becomes conditional on having attempted the client half, or the
byte-transport path would return before the server half runs - **this is the
single most easily-missed line in the task** and it has its own test.

**The door list.** `formatDoorLine`'s `[C64]` marker has a sibling: a door the
caller cannot open should not look openable. `doorShowsC64Mark`
(`utils/door-min-columns.util.ts:212-215`) is the precedent; add
`doorHidesFromByteTransport(door, manifest)` used by `displayDoorMenu` to mark
a browser-only door `[WEB]` rather than hide it - hiding would make a sysop's
door invisible with no explanation, and the notice already exists for the
attempt.

**The RIP answer (divergence 7).** `handlers/command-handler/pre-login.ts:163-171`
sets `ripMode = true` for `R`. On a byte transport there is no consumer:
`screen.handler.ts:1869` emits `'\x1b[1!' + content + '\x1b[2!\r\n'` and the
only reader is `BBSTerminal.tsx:2121-2145`. Edit:

```ts
  } else if (hasR && transportCapabilities(session).rip) {
    /* :164-171 unchanged */
  } else if (hasR) {
    // WEB_: express.e sends RIPscrip to whoever asks for it. This port has no
    // server-side rasteriser - RIP is drawn by RIPtermJS in the browser
    // (packages/terminal/src/rip), the WEB_ deviation already recorded at
    // handlers/screen.handler.ts:1864 - so answering R on a byte transport
    // used to ship `!|` source as literal text across the caller's screen.
    // Fall back to ANSI and say so, once, in the C64-legible uppercase the
    // graphics prompt itself uses (services/login-connect.service.ts:73).
    session.ripMode = false;
    session.ansiEnabled = true;
    session.screenWidth = 80;
    session.screenHeight = 24;
    emitText(socket, '\r\nRIP GRAPHICS NEED A WEB BROWSER - USING ANSI\r\n');
  }
```

**RED tests** (`web/backend/tests/transport/browser-door-gate.test.ts`):
1. **"a client-only door refuses a telnet caller"** - TP-1 test 3, through the
   real `executeDoor`. Assert the notice, the substate, and that
   `executeClientDoor` was never entered (a spy on `getClientDoorBridge`
   records zero `startSession` calls).
2. **"a hybrid door runs its server half on telnet"** - a hybrid manifest with
   no `CLIENT_ONLY`; assert `startSession` was NOT called and the type switch
   WAS reached (a spy on the TS door executor). This is the `:1798` clause.
3. **"arkanoid refuses rather than hangs"** - `CLIENT_ONLY=YES` on the
   arkanoid registration; assert the notice and that `executeDoor` returned,
   with no pending promise. Driven with fake timers so a hang fails fast
   instead of timing the suite out.
4. **"a web caller still gets every client door"** - the same three doors on a
   web session: `startSession` called, `door:load-client` emitted. The guard
   that this task refuses nobody it should not.
5. **"the door list marks a browser-only door"** - `displayDoorMenu` for a
   telnet session contains `[WEB]` on that row and not on the others.
6. **"answering R on telnet does not ship RIPscrip source"** - drive the real
   graphics prompt with `'R'` on a telnet session; assert `session.ripMode` is
   false, the notice reached the wire, and a subsequent `displayScreen` did not
   emit `\x1b[1!`. **RED today**.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/doors/door-min-columns|tests/doors/client-door|tests/handlers/|tests/server/eighty-col-choke-identity"`
**Success criteria.** Six tests green; TP-1 test 3 GREEN; the MIN_COLUMNS
suites (`tests/doors/door-min-columns-gate.test.ts`,
`door-min-columns-dispatch.test.ts`) pass with zero edits - the new gate sits
after theirs and must not disturb the `socket.emit` identity pins those files
carry (`:393`, `:421`, `:497-501`).

---

## Task TP-7 - game mode: the guard moves to the transport

**The contract, decided.** Research open question 4 asks whether
`isKeyStateActive()` means "the transport delivers key edges" or "the door
registered handlers". The doc comment at `sdk/utils/door-input-manager.ts:247-253`
says the former - *"Silently does nothing when the transport has no key events -
telnet and SSH sessions"* - and the code does the latter, a
method-existence check at `:258` that `doors/BBSApi.ts:591,604` can never fail.
The doc comment is the contract; the code is the bug.

**Edits.**
- `web/backend/src/doors/BBSApi.ts`, beside `unicodeCapable` (`:264-271`) which
  is the precedent for a transport-derived getter:

```ts
  /**
   * Do key-down / key-up EDGES reach this door?
   *
   * False for every byte transport: telnet and SSH deliver a character stream
   * with no key-up, and nothing server-side decodes one (the browser's
   * key-down/key-up/keys:state arrive as socket.io events,
   * server/socket-handlers.ts:493-569). Doors branch on this through
   * DoorInputManager.isKeyStateActive() to choose held-key movement over
   * their character handler; a door that believes it has edges and never gets
   * one simply stops moving, which is what the eight arcade doors did on
   * telnet.
   */
  get deliversKeyEvents(): boolean {
    return transportCapabilities(this.session).keyEvents;
  }
```

- `sdk/utils/door-input-manager.ts:254-284` - the guard becomes
  `if (!bbs?.deliversKeyEvents || !bbs.onKeyDown || !bbs.onKeyUp) { this.log(...); return; }`.
  Default-CLOSED: a host that does not expose the getter reports no edges,
  which is the safe reading (the "tooltype booleans cannot default to true"
  rule applied to a capability).
- `web/backend/src/services/game-mode.service.ts:20-29` - `enableGameMode`
  keeps setting `session.gameModeEnabled` and keeps emitting; the emit is
  ruled `translate`/no-op by TP-3 and TP-4. **No door changes.**

**No arcade door is edited.** All eight already guard their held-key path on
`isKeyStateActive()` and fall through to a character handler when it is false -
verified at HEAD: `Doors/joust/index.ts:424,435`,
`Doors/zoo-keeper/index.ts:373,495`, `Doors/pengo/index.ts:406,418`,
`Doors/frogger/index.ts:734,753`, `Doors/super-qix/index.ts:727,915`,
`Doors/pipe-dream/index.ts:427,438`, `Doors/galaga/index.ts:405,423`,
`Doors/donkey-kong/index.ts:438,448`. That is the whole reason the fix is one
guard and not eight doors, and it is asserted rather than assumed by test 3
below.

**RED tests** (`web/backend/tests/transport/game-mode-transport.test.ts` and
`sdk/tests/unit/door-input-manager-transport.test.ts` (the SDK suite is `sdk/tests/{unit,petscii,integration}`; this is a unit case)):
1. **"a telnet door reports no key edges"** - TP-1 test 5.
2. **"a web door still tracks held keys"** - the same manager on a web session:
   `isKeyStateActive()` true after a `key-down`, and `isHeld('left')` true.
   The guard that this task disables nobody it should not.
3. **"each arcade door moves on a character when there are no edges"** - a
   table over all eight doors: import the door's key handler, drive it with
   the door's own left/right character while a stubbed `inputManager` reports
   `isKeyStateActive() === false`, and assert the player position changed.
   Eight cases, one per door, named for the door. **RED today** for none of
   them individually - they are already correct - so this test's value is the
   PIN: it fails the day a door drops its character path, which is exactly when
   that door must become `CLIENT_ONLY` per TP-6.
4. **"the SDK guard is default-closed"** - a `bbs` object with `onKeyDown` and
   `onKeyUp` but no `deliversKeyEvents`; assert `isKeyStateActive()` is false.

**Verification.**
`cd sdk && npm run build && npx tsc --noEmit -p tsconfig.json` then
`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/doors/bbsapi-game-mode|tests/server/game-mode|tests/server/eighty-col-choke-identity"`
and `cd sdk && npm run test:unit` for the SDK suite.
**Success criteria.** Four tests green; TP-1 test 5 GREEN; `sdk/dist` rebuilt
and committed; `.claude/skills/door-sdk-freshness/SKILL.md` run in full - this
is the one task in the plan that edits `sdk/`, and telling the user to test
without it is the exact 2026-08-24 failure that skill exists to stop.

---

## Task TP-8 - ONE input pipeline

**Why this is in the plan.** The controller's decisions cover the output
direction; the input direction carries the same class of defect and the walk
pin (TP-10 of the decision list, TP-14 here) cannot mean anything without it.
Divergences 21 to 25 are five behaviours that exist in the web `command`
handler and in no telnet path: SS3 to CSI normalisation
(`socket-handlers.ts:807-809`), per-character dispatch (`:816-824`),
`checkPauseHandler` line accumulation with echo (`:618-655`),
`flagPauseHandler` (`:658-695`), `handleChatModeInput` (`:714-716`), the
`clientDoorActive` / `gameModeEnabled` guards (`:735-750`) and the stray SGR
mouse drop (`:792-803`). Telnet's handler
(`server/transport-session.ts`, moved from `index.ts:1138-1255`) has six
branches to web's eleven, and passes the whole TCP segment as one string to
handlers of which only four accommodate multi-character input
(`command.handler.ts:454-473`, `:1486-1500`, `:1753-1766`, `:1897-1910`).

**New file** `web/backend/src/server/terminal-input.ts`:

```ts
/**
 * What happens to one chunk of caller input, decided once for every transport.
 *
 * Returns a DECISION, not an action, because the two transports dispatch
 * differently and must keep doing so: on web a door's `socket.once('command')`
 * listener is fired by socket.io itself in parallel with the handler below, so
 * the handler EARLY-RETURNS for a door; on telnet nothing fires it and the
 * handler must call `emitter.emitInternal('command', ...)` instead
 * (transport-session.ts, moved from index.ts:1234-1236). Folding the dispatch
 * in here would have made one of the two wrong.
 */
export type InputDecision =
  | { kind: 'transfer-sink'; sink: (b: Buffer) => void }
  | { kind: 'pause'; handler: (line: string) => void; line: string; echo: string }
  | { kind: 'flag-pause'; handler: (line: string) => void; line: string; echo: string }
  | { kind: 'chat'; text: string }
  | { kind: 'door'; text: string }
  | { kind: 'swallow' }
  | { kind: 'command'; pieces: string[] };

export function classifyTerminalInput(session: BBSSession, data: string): InputDecision;

/** ESC O x -> ESC [ x. A terminal in DECCKM sends SS3 for the arrow keys and
 *  the command handler only knows CSI. Web has done this since
 *  socket-handlers.ts:807; telnet never has. */
export function normaliseCursorKeys(input: string): string;

/** The chunking rule, one copy. An escape sequence is dispatched whole; every
 *  other chunk is split per character, which is what web has always done
 *  (socket-handlers.ts:816-824) and what makes a paste or a fast burst
 *  behave the same on both. */
export function splitInputForDispatch(input: string): string[];
```

**Edits.**
- `web/backend/src/server/socket-handlers.ts:584-826` - the branch bodies move
  into `classifyTerminalInput`; the handler becomes the decision switch plus
  its own door early-returns. `flushPetsciiModel(session)` (`:602`) and
  `sessionLogManager.captureInput` (`:605`) stay in the web handler: the first
  is the web model's input boundary (its telnet twin is
  `flushPendingPetscii`), the second is a web-only capture.
- `web/backend/src/server/transport-session.ts` (the moved `data` handler) -
  replaces its six branches with the same switch, keeping
  `flushPendingPetscii` first, the raw-transfer bypass, the DEL-probe
  classification and the PETSCII input conversion ahead of it (those three are
  byte-level and precede any string classification).

**What deliberately does NOT converge.** The DEL-probe (`index.ts:1178-1190`),
the NUL strip (`:1205-1207`) and `convertPetsciiInputToAscii` (`:1199`) stay
telnet/SSH-only: web has no byte stream to classify. Each keeps its comment
and gains a line saying why it is not shared.

**RED tests** (`web/backend/tests/transport/terminal-input.test.ts`):
1. **"an arrow key in application-cursor mode works on telnet"** - drive the
   real telnet `data` handler with `\x1bOA`; assert `handleCommand` saw
   `\x1b[A`. **RED today** (divergence 21).
2. **"a paste is not one opaque command on telnet"** - `data` of `'ABC'`;
   assert three `handleCommand` calls. **RED today** (divergence 22).
3. **"an escape sequence is not split"** - `data` of `'\x1b[A'`; assert one
   call with the whole sequence.
4. **"a pause prompt eats the keystroke on telnet"** - a session with
   `checkPauseHandler` set; assert the handler received the line and
   `handleCommand` was not called. **RED today** (divergence 23).
5. **"a client door's keystrokes do not reach the BBS on telnet"** -
   `clientDoorActive` true; assert `handleCommand` zero calls. **RED today**
   (divergence 24).
6. **"a stray mouse report is not typed onto the screen"** -
   `\x1b[<0;10;5M` on telnet; assert nothing reached `handleCommand`. **RED
   today** (divergence 25).
7. **"web input is unchanged"** - the web `command` handler driven with the
   same seven inputs, compared against a baseline recorded from the current
   handler before the extraction (built in the test from its own inputs, not a
   stored capture - the `eighty-col-choke-identity.test.ts:364-367` rule).

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/|tests/handlers/"` then the FULL suite
(`npm test`) - the input path is the single widest blast radius in this plan.
**Success criteria.** Seven tests green; the full-suite failure list identical
to the known-flaky set and nothing else.

---

## Task TP-9a - ONE login state machine: the server half

**The direction, and why.** Two implementations exist: the server-side loop
(`command.handler.ts:1714-1893`, ~180 lines, telnet/SSH only - web returns
immediately at `:1717-1719`) and the browser's
(`packages/terminal/src/utils/login-key-machine.ts:46-126`, ~80 lines, plus the
socket-event surface it drives in `server/auth-socket-handlers.ts:253-1085`).
The server loop is the truth, for four reasons measured against the tree:

1. **The server loop already converges on the shared pipeline.** Its success
   path calls `runPostAuthLogin` (`command.handler.ts:1872-1876`), the same
   function the web `login` handler calls (`auth-socket-handlers.ts:610-614`),
   and its failure path calls the same `promptPasswordReset` and
   `runPwfailAndLogoff` (`:1829-1853`). Nothing has to be ported INTO it.
2. **The reverse direction has no server-side terminal.** Making the browser
   machine the truth would require re-implementing its echo, its masking and
   its R/C new-user prompt server-side for telnet - which is the loop that
   already exists.
3. **The browser half is the smaller deletion** - see TP-9b.
4. **It closes a defect the research did not name.** `startNewUserRegistration`
   (`handlers/user/new-user.handler.ts:111`) has exactly one caller in the
   whole backend - `auth-socket-handlers.ts:720-721`, inside the web-only
   `new-user-response` handler. A telnet or SSH caller who types an unknown
   name gets `Invalid PassWord` and can never create an account. The full
   NEW_USER_* substate machine that would serve them already exists and is
   dispatched from `handleCommand` (`command.handler.ts:2355-2400`); only the
   entry into it is web-only.

**Edits - server only. Not one line of `packages/terminal` is touched here.**

- `handlers/command.handler.ts:1716-1719` - delete the
  `connectionType === 'web'` early return. The loop now runs for every
  transport. This one line is what makes typing at the web `Username:` prompt
  work.
- `command.handler.ts:1780-1786` (the username phase) gains the branch the web
  path has and telnet never did: on `getUserByUsername` returning nothing, emit
  express.e's new-user prompt and set a `LOGON_NEW_USER_CONFIRM` phase whose
  `R` re-prompts and whose `C`/Enter calls the SAME
  `startNewUserRegistration` (`handlers/user/new-user.handler.ts:111`) the web
  path calls. The R/C semantics are copied from `processLoginKey`'s
  `new-user-prompt` branch (`login-key-machine.ts:99-123`), which cites
  `express.e:6845` for the echo.
- `command.handler.ts:1761`, `:1905` (the two echo sites) read
  `session.maskEcho` (TP-4) instead of testing `phase === 'password'`, so the
  system-password gate (`:1667-1670`) and the forced-password-change adapter
  mask through the same switch.
- **`prompt-login` keeps all seven emit sites** (`command.handler.ts:1083`,
  `:1580`, `:1634`, `:1685`; `pre-login.ts:84`, `:119`, `:284`). It is the
  server's existing cue that the login prompt is on screen, it already fires on
  every transport, and TP-9b re-points its browser handler rather than needing a
  replacement.
- `server/auth-socket-handlers.ts` - the `login` handler keeps its **token**
  arm (`:271-290`) and the JWT `login-success` at `:594`; its username/password
  arm (`:291-570`) becomes unreachable from the shipped browser once TP-9b
  lands and is deleted THERE, not here, so that this task can be reverted on
  its own.

**RED tests** (`web/backend/tests/transport/login-server-machine.test.ts`):
1. **"typing at the web Username prompt reaches the server"** - drive the real
   `registerSocketHandlers` `command` handler with `'s','y','s','o','p','\r'`
   on a web session in `BBSState.LOGON`; assert the server echoed each
   character and emitted the password prompt. **RED today**: the handler returns
   at `command.handler.ts:1717` and the research's own walk measured 0 bytes
   after `Username: ` on web.
2. **"a telnet caller can create an account"** - unknown username on a telnet
   session; assert the new-user prompt, then `C`, then that
   `startNewUserRegistration` ran and `session.subState` is
   `NEW_USER_GDPR_CONSENT`. **RED today**: the only caller is web.
3. **"the password is masked once, by the server"** - assert one `*` per
   character on the wire on all three transports.
4. **"the JWT path still logs in"** - `socket.emit('login', {token})`; assert
   `login-success`. The guard that the token arm survived.
5. **"a telnet login is unchanged"** - the full telnet login byte-compared
   against a baseline the test builds from its own inputs.

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests && npm test`
(full suite - every other suite logs in through this path), plus the 80-column
identity gate
(`npx jest ... --testPathPattern="tests/server/eighty-col-choke-identity"`).
**Success criteria.** Five tests green; the identity suite unedited; a manual
telnet login and a manual web login both reach the menu.

## Task TP-9b - ONE login state machine: retiring the browser's line editor

TP-9a made the server drive the prompt for every transport. Until this lands the
browser ALSO drives it and the caller sees doubled echo, so the two tasks ship
in that order and TP-9b is not optional.

**The surface, measured.** `loginState` has **29 references, all inside
`packages/terminal/src/components/BBSTerminal.tsx`**
(`grep -rn loginState packages/terminal/src | wc -l` = 29), so the retirement is
contained to one file plus `utils/login-key-machine.ts`. Eight socket listeners
sit in one block, `BBSTerminal.tsx:2486-2537`:

| listener | line | after |
|---|---|---|
| `user-not-found` | `:2486` | retired - the server prompts (TP-9a) |
| `retry-login` | `:2493` | retired |
| `prompt-password` | `:2502` | retired |
| `password-mode` | `:2508` | **kept**, re-pointed: it stops driving the client editor's mask and only tells xterm whether to suppress local echo, which after this task is always |
| `prompt-password-reset` | `:2513` | retired |
| `prompt-forced-pwd-change` | `:2522` | retired |
| `forced-pwd-change-complete` | `:2531` | **kept** - it is a UI state signal, and its one emit site is `auth-socket-handlers.ts:1040` |
| `mask-input` | `:2537` | **kept**, re-pointed the same way as `password-mode`. Its inversion bug dies with `login-key-machine.ts:72`, where `mask` was passed as `!ctx.passwordMode.current` so `mask-input true` **un**masked |

**`prompt-login` (`:2344`) is kept and re-pointed**, not replaced: the server
already emits it from seven sites (listed in TP-9a), and its handler now sets
`loginState` to a single passive value - the shell stops owning the line and
every key goes out as ordinary `command` input, which
`socket-handlers.ts:584` already accepts for every other prompt on the board.
`loginState` collapses from the ten-value `LoginState` union
(`login-key-machine.ts:23-25`) to `'server-driven' | 'loggedin'`; the 29
references are mechanical.

**Ordering that must be preserved.** `login-success` (`:2362`) is what tells the
React shell to leave the login view AND is the trigger the session font depends
on: `utils/session-font.ts` is the single owner and its comments record that the
font preference *"arrives after login-success AND after session-restored"*
(`BBSTerminal.tsx:2764-2776`, and `:819-823`). TP-9a does not move
`login-success` - it is still emitted by `runPostAuthLogin`'s web path - so the
ordering holds, and test 4 below pins it.

**The mobile path.** `injectInput` (the imperative handle at
`BBSTerminal.tsx:792`, typed at `:176`) is how the on-screen keyboard and the
PETSCII canvas feed keys, and `login-key-machine.ts:10-14` records that it
carried a SECOND copy of the login branch which diverged from `term.onKey`'s in
the new-user prompt. Both copies lose their login branch together; after this
task `injectInput` and `term.onKey` both do the one thing - send the key as
`command`.

**Edits.**
- `packages/terminal/src/utils/login-key-machine.ts` - `processLoginKey`'s five
  line-editing branches (`:61-123`) are deleted. What remains is the
  `checking-username`/`logging-in` swallow (`:59`), which has no purpose once
  the server owns the line, so the file is deleted outright and its two callers
  lose their branch.
- `packages/terminal/src/components/BBSTerminal.tsx` - the five retired
  listeners, the three re-pointed ones, `prompt-login`, the `loginState`
  collapse, and the login branch in both `term.onKey` (`:2873-3009`) and
  `injectInput` (`:792-887`).
- `server/auth-socket-handlers.ts` - now that nothing sends them, delete the
  `check-username` (`:634`), `new-user-response` (`:706`),
  `password-reset-input` (`:772`) and `forced-pwd-change-input` (`:874`)
  handlers and the `login` handler's username/password arm (`:291-570`).
- `packages/terminal` and `web/frontend` rebuilt and the bundles committed -
  port 3001 serves a BUILT bundle, and a source-only commit tests last night's
  code.

**RED tests** (`web/frontend/src/components/__tests__/login-relay.test.tsx`):
1. **"a keystroke at the login prompt goes to the server as a command"** -
   `prompt-login`, then a key; assert one `command` emit and **zero** local
   echo (a spy on the terminal's write).
2. **"the browser has no login line editor left"** - a source assertion:
   `login-key-machine.ts` does not exist and `BBSTerminal.tsx` contains no
   `'username'`/`'password'` `loginState` value.
3. **"the mobile keyboard takes the same path"** - drive `injectInput` with the
   same key; assert the identical `command` emit.
4. **"login-success still leaves the login view and still seeds the font"** -
   assert the view switch and that the session font applied after it, in that
   order. The ordering this task could break.
5. **"a masked prompt suppresses local echo"** - `mask-input true`, then a key;
   assert nothing was written locally and the server's `*` is what appears.

**Verification.**
`cd packages/terminal && npm run build && cd ../../web/frontend && npm run build:check && npm test`
then `cd web/backend && npm test`, plus the 80-column identity gate.
**Success criteria.** Five tests green;
`grep -rn "check-username\|new-user-response" web/backend/src packages/terminal/src web/frontend/src`
returns nothing; both bundles rebuilt and committed; the manual web login walk
in TP-17 shows single-echo typing.


## Task TP-10 - ONE registry for cross-session pushes

**New file** `web/backend/src/server/session-emitter-registry.ts`:

```ts
import type { BBSSession } from '../index';
import type { TransportEmitter } from './transport-adapter';
import type { Server as IOServer, Socket } from 'socket.io';

/**
 * The ONE way to find the socket-shaped object that reaches a given session.
 *
 * A web session's live socket is `io.sockets.sockets.get(session.socketId)` -
 * NOT `session.socket`, which is assigned once (server/socket-handlers.ts:175)
 * and is the DEAD socket after a reconnect, because the restore updates
 * `socketId` and calls `setSession` (auth-socket-handlers.ts:160-161) without
 * reassigning it. A telnet/SSH session's is the connection emitter built in
 * server/transport-session.ts, which lives on the connection and in no map at
 * all - which is why every cross-session push fell through
 * `io.sockets.sockets.get` and printed "Could not find socket for node N".
 *
 * Modelled on the one mechanism that already crosses: the OLM queue
 * (handlers/transfer/olm.handler.ts:334-341) mutates the target BBSSession
 * directly and lets the recipient's own emitter drain it (:357-371). This is
 * that idea with the emitter made findable, so the IMMEDIATE branch (:326-332,
 * the one taken when the recipient is at the command prompt - the common case)
 * can cross too.
 */
export function registerConnectionEmitter(session: BBSSession, emitter: TransportEmitter): void;
export function unregisterConnectionEmitter(session: BBSSession): void;
export function emitterForSession(session: BBSSession | null | undefined, io?: IOServer): TransportEmitter | null;
export function emitterForNodeId(nodeId: number, io?: IOServer): { emitter: TransportEmitter; session: BBSSession } | null;
export function emitterForUserId(userId: string, io?: IOServer): { emitter: TransportEmitter; session: BBSSession } | null;

/**
 * The socket.io socket, or null for a byte transport.
 *
 * Room membership (`join` / `leave`) is a socket.io concept a byte transport is
 * never part of, so those call sites still need the real Socket - but they get
 * it HERE, so `io.sockets.sockets.get` exists in exactly one module and TP-15's
 * grep can expect a count of one.
 */
export function socketIoSocketFor(session: BBSSession | null | undefined, io?: IOServer): Socket | null;
```

The emitter is held on the SESSION (`session.connectionEmitter`), not in a
module map keyed by id, for the reason `utils/petscii-session-model.ts:44`
gives for the PETSCII model: a connection can be handed a new session
mid-flight, a web session survives a socket replacement, and the session object
is the one thing both ends already hold. `emitterForNodeId` goes through
`sessions.get(String(nodeId))` (`server/session-manager.ts:272` is the only
writer of that key) and `emitterForUserId` through `userSessions` (`:286`) -
both populated for telnet today, unlike `socketToUser`, which
`services/login-post.service.ts:252-264` fills only `if (isWeb)`.

**`registerConnectionEmitter` is called once**, in `transport-session.ts` right
where the emitter is attached to the connection (`index.ts:1098` before the
move), and `unregisterConnectionEmitter` in the close handler.

**The inventory, measured.**
`grep -rnE "sockets\??\.\s*sockets\??\.\s*get" web/backend/src --include='*.ts'`
returns **11 hits in 6 files** on 2026-09-03 (9 of them written plainly, 2 with
optional chaining, which a naive `io.sockets.sockets.get` grep misses). Every
one gets a verdict:

| # | site | verdict |
|---|---|---|
| 1 | `api/node-control-routes.ts:263` | `emitterForNodeId`; the notice goes out as `system-message`, which TP-4 renders on a byte transport |
| 2 | `handlers/operator-chat.handler.ts:603` (optional-chained) | `emitterForUserId` |
| 3 | `handlers/operator-chat.handler.ts:913` | `emitterForUserId` |
| 4 | `handlers/chat/internode-chat.handler.ts:331` | `emitterForSession` |
| 5 | `handlers/chat/internode-chat.handler.ts:802` | `emitterForSession` |
| 6 | `handlers/chat/internode-chat.handler.ts:819` (`?.leave(roomName)`) | `socketIoSocketFor(...)?.leave(...)` - room membership, correctly socket.io-only |
| 7 | `handlers/chat/internode-chat.handler.ts:879` | `emitterForSession` |
| 8 | `handlers/chat/chat.handler.ts:91` (optional-chained) | `emitterForUserId`; `resolveCounterpartSocket` (`:80-99`) collapses to the one call |
| 9 | `handlers/chat/group-chat.handler.ts:752` | `emitterForSession` |
| 10 | `handlers/chat/group-chat.handler.ts:849` | `emitterForSession` |
| 11 | `handlers/message/message-commands.handler.ts:591` (NM kick) | `emitterForNodeId`; `emitter.emit('ansi-output', ...)` then `emitter.disconnect()` - the emitter literal already maps `disconnect` to `connection.close()` (`connection-emitter.ts:175`) |

Plus the room-addressed pushes that are not in that grep because they use
`io.to(...)`: `handlers/operator-chat.handler.ts:215`, `:660`;
`handlers/chat/internode-chat.handler.ts:185`, `:226`, `:392`, `:446`; and
`handlers/transfer/olm.handler.ts:330`. Each is rewritten to
`emitterForSession(targetSession, io)?.emit('ansi-output', line)` **for its
`ansi-output` pushes only**; the `chat:*` / `operator:*` structured events beside
them stay `web-only` per TP-3 and keep addressing the room. OLM's immediate
branch falls back to the queue when the lookup returns null, so no message is
ever lost.

**What does NOT change.** `socketToUser` and the `user:<id>` room stay web-only
and stay inside `if (isWeb)` (`services/login-post.service.ts:252-264`): they
exist for multi-TAB fanout, and a telnet connection has no second tab. Their
note goes in TP-15's keep table so the next reader does not "fix" them.

**RED tests** (`web/backend/tests/transport/session-registry.test.ts`):
1. **"a telnet caller can be kicked"** - TP-1 test 4.
2. **"a telnet caller receives an OLM at the command prompt"** - target at
   `READ_COMMAND`; assert the line reached the emitter and the queue is empty.
   **RED today** (divergence 10).
3. **"a telnet caller receives an operator page"** - the real operator-chat
   push; assert the text on the wire. **RED today** (divergence 9).
4. **"a telnet caller is invited to an internode chat"** - the `:185` push.
   **RED today**.
5. **"a web caller is still resolved through the live socket"** - a reconnected
   session whose `session.socket` is the dead socket and whose `socketId` is the
   new one; assert `emitterForSession` returns the LIVE socket. The trap the
   PETSCII plan recorded (its Q6/I1) and the reason the registry never reads
   `session.socket`.
6. **"room membership still uses a real socket, and skips a byte transport"** -
   `socketIoSocketFor` returns the Socket for web and null for telnet, and the
   `:819` cleanup does not throw on either.
7. **"the emitter dies with the session"** - after the close handler,
   `emitterForSession` returns null and the session holds no reference.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/handlers/chat|tests/handlers/olm|tests/api/node-control|tests/server/eighty-col-choke-identity"`
plus `npx tsc --noEmit`.
**Success criteria.** Seven tests green; TP-1 test 4 GREEN;
`grep -rnE "sockets\??\.\s*sockets\??\.\s*get" web/backend/src --include='*.ts'`
returns **exactly 1** hit, inside `server/session-emitter-registry.ts`;
`grep -n ": any" web/backend/src/server/session-emitter-registry.ts` returns
nothing; the identity suite unedited.


## Task TP-11 - downloads: ZMODEM or a refusal

`handlers/file/download.handler.ts:515-531` already does the right thing: it
reads `session.connectionType`, and for `'telnet'`/`'ssh'` routes to
`startZmodemDownload` instead of the browser's `download-file` trigger, with a
comment saying the BBS *"used to fake-complete the transfer in 1 second without
actually sending bytes"*. `handlers/transfer/batch-download.handler.ts:200-237`
never got that fix: it emits `download-file` per file (`:214`), prints
`Batch download complete! N file(s) queued. / Check your browser downloads.`
(`:229-230`) and books the download statistics (`:223-226`) while zero bytes
move.

**Edits.**
- Extract download.handler's branch into ONE exported function - the single
  source of truth for "how does a file reach this caller":
  `deliverFilesToCaller(socket, session, paths, opts): Promise<'zmodem' | 'http' | 'refused'>`
  in `web/backend/src/handlers/file/file-delivery.ts` (new), lifted verbatim
  from `download.handler.ts:515-560` including its stats-before-handoff comment.
- `download.handler.ts:515-531` calls it.
- `batch-download.handler.ts:200-237` calls it, and the completion text and the
  stat accounting move BEHIND its result: `'http'` keeps today's two lines,
  `'zmodem'` says `SENDING N FILE(S) VIA ZMODEM`, `'refused'` says
  `THIS TRANSFER NEEDS A WEB BROWSER OR A ZMODEM CLIENT` and books nothing.
- `EVENT_RULINGS['download-file']` stays `web-only`, and after this task no
  reachable path emits it to a byte transport - asserted by test 3.
- Divergence 20 (the `U`-command upload path,
  `handlers/commands/user-commands.handler.ts:243-270`, sends no
  `IAC WILL/DO BINARY` while the download path at `:436-447` and the RZ path at
  `transfer-misc-commands.handler.ts:300-307` do) is fixed in the same edit:
  the three sites call one `negotiateBinaryForTransfer(session)` helper placed
  beside `deliverFilesToCaller`.

**RED tests** (`web/backend/tests/transport/download-transport.test.ts`):
1. **"a telnet batch download sends bytes or says it cannot"** - drive the real
   batch path on a telnet session; assert `startZmodemDownload` was called with
   every path and that `Check your browser downloads` never reached the wire.
   **RED today** (divergence 11).
2. **"a fake completion books no statistics"** - the refused case; assert
   `updateDownloadStats` zero calls.
3. **"download-file never reaches a byte transport"** - a spy on the adapter's
   drop recorder across the whole download and batch-download suites; assert
   zero drops of `download-file`.
4. **"a web batch download is unchanged"** - the same walk on web, emits
   compared `toBe` against the current behaviour.
5. **"the U-command upload negotiates BINARY"** - assert the
   `IAC WILL BINARY` / `IAC DO BINARY` bytes through `transferRawSendUnescaped`
   on telnet and none on web/SSH. **RED today** (divergence 20).

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/handlers/file|tests/handlers/transfer|tests/services/lrzsz|tests/server/eighty-col-choke-identity"`
**Success criteria.** Five tests green; `grep -rn "emit('download-file'" web/backend/src`
returns exactly one site, inside `file-delivery.ts`'s `'http'` arm.

---

## Task TP-12 - SSH becomes a first-class transport

Eight facts, all in `web/backend/src/server/ssh-server.ts`, and the file's first
test.

1. **`info.term` is read** (divergence 15). `session.on('pty')` (`:83-91`)
   stores `info.term`, classifies it with the SAME `classifyTerminalType`
   telnet uses (`telnet-server.ts:73-110`, exported already) and emits
   `'terminal-type'` with the identical payload shape telnet emits
   (`{terminalType, isC64, isAmiga, unicodeCapable, width, height}`), so it
   flows through `applyTerminalTypeReport` (`transport-session.ts`, moved from
   `index.ts:1274`) - the same applier, not a second copy.
2. **`unicodeCapable` is set** (divergence 14) - as a consequence of (1), not
   as its own assignment. Every blessed door stops rendering in Amiga/ACS
   fallback mode for every SSH caller (`sdk/utils/blessed-helpers.ts:979-994`
   reads `bbs.unicodeCapable`, `doors/BBSApi.ts:264-271`), and SSH inherits
   TP-5's ONE terminal predicate for its wire charset at the same time.
3. **The pty request emits `window-size`** (divergence 16). `:83-91` gains the
   `this.emit('window-size', ...)` that `window-change` already has at `:98`,
   so an SSH session is not stuck at the 80x24 default
   (`server/session-manager.ts:183-184`) until the user resizes the window.
4. **PETSCII is NOT flipped** (non-goal). `isC64` from an SSH `term` is
   recorded on the session and logged; it does not set `petsciiMode`. One
   comment says so and names the non-goal.
5. **`write` queues until the stream exists** (research open question 1).
   `:134-138` silently discards everything written before `this.stream` is
   assigned in the shell handler (`:106`). The ordering makes that window
   narrow - `'connection'` is emitted at `:336`, synchronously, before any
   `'ready'` - but a write that vanishes with no error is a defect whatever the
   window, and it is the only candidate the research could name for the
   ~478 bytes of FRONTEND screen that went missing on SSH in the walk. Decided:
   buffer into a pending array and drain on shell accept, in that order, before
   `this.emit('ready')`. If the truncation still reproduces in TP-14's SSH leg
   the cause is the harness attaching its data sink after `shell()` resolves,
   and TP-14's driver attaches it inside the shell callback for exactly that
   reason.
6. **One host key** (divergence 18) - kept, per the controller. The single
   RSA key at `web/backend/data/ssh/ssh_host_rsa_key`
   (`utils/ssh-key.util.ts:46-48`, loaded `index.ts:1846`) is what the live
   handshake negotiates as `rsa-sha2-512`. A comment records that no ed25519 or
   ECDSA key is offered and that adding one changes every existing client's
   known_hosts entry, which is why it is not done here.
7. **The MuffinTerm quirks become telnet-only** (divergence 19).
   `services/lrzsz-transfer.service.ts` branches `this.transport.type === 'web'`
   at `:350` (the duplicate suppression whose ZCRCE-to-ZCRCW reasoning is at
   `:239-243`) and at `:605` (the `rz` flags, reasoned at `:562-571`), so an SSH
   transfer inherits workarounds written for serial-line telnet clients. Both
   tests become `this.transport.type !== 'telnet'` and SSH takes web's branch,
   with the reason in the comment: SSH is a clean 8-bit stream with no IAC layer
   and no serial-line framing.
8. **The fallback graphics prompt matches** (divergence 35). `ssh-server.ts:312`
   and `telnet-server.ts:774` both print an older, differently-cased string;
   both import `ANSI_GRAPHICS_PROMPT` (`services/login-connect.service.ts:73`,
   emitted at `:121`) instead. Two lines, one constant.

**SSH transport auth is NOT changed. Decision, recorded.** The research listed
`ctx.accept()` for `'none'` (`:64-71`) as divergence 17, and an earlier draft of
this plan proposed rejecting it. That is wrong for this board: SSH here is a
pure TRANSPORT, exactly as telnet is - telnet has no transport auth at all, and
**the BBS's own login IS the credential**. The doc comment at `:51-63` already
says so and is kept verbatim, with one line added: *"Pre-filling the BBS login
from the SSH credentials, through the same `AuthenticationUseCase` the login
loop uses, is a later feature and would be the only reason to make this
handler care who the caller claims to be."* Rejecting `none` would break every
client that connects SSH-as-transport with an arbitrary username and would buy
nothing, because the next screen asks for a username and password anyway.

**RED tests** (`web/backend/tests/transport/ssh-server.test.ts` - the FIRST
test in the repo to import `ssh-server.ts`; research section 4 records that its
365 lines are never instantiated by any of the 539 backend tests):
1. **"an SSH caller's terminal type reaches the session"** - drive a fake ssh2
   `session` object through `handleReady`'s `'pty'` handler with
   `{term:'xterm-256color', cols:132, rows:50}`; assert `terminalType`,
   `unicodeCapable === true` and geometry 132x50 on the session. **RED today**
   on all three.
2. **"an SSH blessed door is not in Amiga fallback mode"** - a `BBSApi` over
   that session; `unicodeCapable` true. **RED today**.
3. **"an SSH caller on a legacy terminal gets Latin-1 on the wire"** -
   `term: 'vt220'`; assert `resolveWireCharset` is `iso-8859-1` and an
   `xterm` session is `utf-8`. The one predicate, reached from SSH.
4. **"a C64 terminal string does not make an SSH session PETSCII"** -
   `term: 'C64'`; `isC64` recorded, `petsciiMode` undefined. The non-goal,
   pinned.
5. **"the first screen is not lost"** - write before the shell handler runs,
   then accept the shell; assert every byte arrives, in order. **RED today**.
6. **"transport auth stays permissive"** - `none`, `password` and
   `keyboard-interactive` are accepted; `publickey` is rejected. Pinned as a
   DECISION so a future reader does not "harden" it without reading the comment.
7. **"an SSH transfer does not get MuffinTerm's rewrite"** - the lrzsz branch
   for `connectionType: 'ssh'` takes web's flags. **RED today**.
8. **"a real SSH client reaches the graphics prompt"** - an `ssh2` client
   against a `SSHServerImpl` started on an ephemeral port with a test host key;
   assert `ANSI, RIP, PETSCII` in the first screen. The first end-to-end SSH
   test the repo has; it is also TP-14's SSH leg in miniature.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/ssh|tests/services/lrzsz|tests/services/login-connect|tests/server/eighty-col-choke-identity"`
**Success criteria.** Eight tests green; the two regex-over-source assertions
that were SSH's entire test footprint
(`tests/services/login-connect.service.test.ts:107,118`) still pass;
`grep -rn "ANSI, RIP, PETSCII or No graphics" web/backend/src` returns nothing;
the identity suite unedited.


## Task TP-13a - entry parity: the banner, the fourth transport, the caller's address

Three connect-side divergences, three files.

- **`/ws/terminal` gets a pre-login** (divergence 38). `index.ts:1771-1784`
  creates the session and calls `setupTelnetSSHHandler` but never
  `runPreLoginConnect`, so the fourth transport gets no FRONTEND screen, no
  graphics prompt and no AREXX `login` trigger - only whatever the first
  keystroke provokes. Add the call, in the same shape telnet uses
  (`telnet-server.ts:763-768`).
- **The connect banner stops being web-only** (divergence 33).
  `index.ts:1576-1633` prints eight lines - `/X Native Telnet: Searching for
  free node...` (`:1578`), `CONNECT 19200` (`:1584`), `**EMSI_IRQ8E08`
  (`:1585`), the express.e-cited Welcome and Connection-occurred lines
  (`:1626`, express.e:29507-29522) - and then waits 3000 ms (`:1633`), on the
  one transport that is not telnet. The block moves into
  `services/login-connect.service.ts` as `emitConnectBanner`, called at the top
  of `runPreLoginConnect`, which all three transports already call (the
  graphics prompt is emitted from the same function at `:121`). The 3 s wait
  becomes an option, `postBannerDelayMs`, passed 3000 by web
  (`index.ts:1656-1662`) and 0 by telnet/SSH/ws-terminal, with a `WEB_:`
  comment: a browser has no dial-up negotiation to fill and a 3 s stall added
  to a telnet connect would be a regression. A real C64 never sees the banner -
  `telnet-server.ts:756` short-circuits to `handleC64Detected` without calling
  `runPreLoginConnect` at all. The walk allow-list then records ONE difference,
  a delay, instead of eight lines.
- **The caller's own IP** (divergence 34). `Doors/telnet-front/index.ts:180-203`
  recovers the address from `socket.handshake`, a socket.io-only property, and
  falls through to `NOT AVAILABLE` for the two transports the screen's own
  "Your Telnet Login Established from Host" line names - even though
  `session.remoteAddress` is populated for both (`telnet-server.ts:688`,
  `ssh-server.ts:288`). Read `session.remoteAddress` first, `handshake` second.
  Door change: `cd Doors/telnet-front && npm run build` and commit `dist/`.

**RED tests** (`web/backend/tests/transport/entry-parity.test.ts`):
1. **"a /ws/terminal caller sees the graphics prompt"** - assert
   `runPreLoginConnect` ran. **RED today**.
2. **"all three transports print the same connect banner"** - the eight lines
   on each, byte-compared; only the delay differs. **RED today**.
3. **"a C64 telnet caller does not get the banner"** - the `c64-detected` path;
   assert BBSTITLE is the first thing on the wire. The guard on test 2.
4. **"the FRONTEND screen shows a telnet caller's address"** - assert
   `session.remoteAddress` appears and `NOT AVAILABLE` does not. **RED today**.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/entry-parity|tests/services/login-connect|tests/server/eighty-col-choke-identity"`
then `cd Doors/telnet-front && npm run build`.
**Success criteria.** Four tests green; `Doors/telnet-front/dist/` rebuilt and
committed; the identity suite unedited.

## Task TP-13b - close parity: one finalize, one buffer release, one keepalive

**Depends on TP-10**, for the reason in the multi-session bullet below.

`finalizeDisconnectCleanup` (`server/socket-handlers.ts:1100-1295`) is the web
path's session end: `Logged off` in the CallersLog (`:1121`), the SAmiLog
store, the logout event, the logoff batches, `EXECUTE_ON_LOGOFF`,
`MAIL_ON_LOGOFF`, the command history, the user's disk files, the node files,
`nodeManager.releaseSession` (`:1256`), `disposePetsciiSessionModel` (`:1267`)
and the map teardown (`:1270-1292`). The telnet/SSH close handler
(`index.ts:1314-1328`, moved to `transport-session.ts` by TP-2) does two things:
`sessions.delete(connection.sessionId)` - **which deletes nothing**, because
`setSession` keys that map by `nodeId.toString()`
(`server/session-manager.ts:272`) and the id is `telnet-<node>-<ts>` - and
`nodeManager.releaseSession`.

**Edits.**
- Export `finalizeDisconnectCleanup` from `socket-handlers.ts` and split the
  pre-finalize half of the `disconnect` handler (`:1027-1059`: the session-log
  end, the MULTICOM clear, the internode and group-chat cleanups) into an
  exported `endTransportSession(emitter, session, key)` that runs those and
  then calls finalize. Web's handler calls it after its 3 s reconnect grace
  (`:1013-1025`) and its 15 s logoff grace (`:1086-1090`); the byte transports
  call it immediately from `close`, because they have no reconnect path to wait
  for - `restore-session` is registered only inside `registerSocketHandlers`
  (`auth-socket-handlers.ts:97`), which `setupTelnetSSHHandler` never calls.
- **The multi-session guard becomes transport-aware.** `finalizeDisconnectCleanup`
  skips all cleanup when `Array.from(socketToUser.values()).includes(userId)`
  (`:1103-1110`). `socketToUser` holds web sockets only
  (`services/login-post.service.ts:252-264`), so a user logged in on both a
  browser and a telnet line would have the telnet logoff silently skipped. The
  test becomes `emitterForUserId(userId)` (TP-10) resolving to a DIFFERENT live
  session than the one ending - one registry, one answer. This is why this task
  lands after TP-10.
- **The session key.** `endTransportSession` passes `connection.sessionId`,
  which is the right key for `nodeManager.releaseSession` (unchanged) and for
  `deleteSession` (`server/session-manager.ts:311-316`, which resolves through
  `socketToNodeId`, populated for telnet at `telnet-server.ts:696` and
  `ssh-server.ts:296`). The `sessions.delete(connection.sessionId)` line
  (divergence 29) is deleted - it never deleted anything.
- **The AnsiBuffer** (divergence 30). `utils/ansi-buffer.util.ts:176-182`
  registers its cleanup as `socket.on('disconnect')`; `'disconnect'` is not in
  the emitter's transport set (`connection-emitter.ts:157`) and nothing calls
  `emitInternal('disconnect')`, so every telnet and SSH connection leaves its
  buffer in the module map for the life of the process and never flushes what
  it held at close. Add an exported `releaseAnsiBuffer(socketId)` (flush, then
  delete) beside `flushAllBuffers` (`:223-227`), call it from
  `endTransportSession`, and have `getAnsiBuffer`'s existing disconnect handler
  (`:176`) call the same function so there is one body.
- **`unregisterConnectionEmitter`** (TP-10) is called here, so a closed
  connection is no longer reachable through the registry.
- **Dead-connection detection** (divergence 31). Telnet sets only
  `setNoDelay(true)` (`telnet-server.ts:661`); SSH sets nothing; web has
  socket.io's 120 s ping (`index.ts:585-586`). Add
  `socket.setKeepAlive(true, 60000)` at `telnet-server.ts:661` and the ssh2
  `keepaliveInterval` / `keepaliveCountMax` equivalents to the `SSHServer`
  construction (`ssh-server.ts:215-217`), so a half-open connection releases its
  node instead of holding it until the OS TCP keepalive fires. **Not** an
  idle-caller timeout: divergence 32 (`IDLE_TIMEOUT` parsed at
  `services/bbs-config-file.service.ts:236` and used only by the Amiga config
  export) is a parity-BETWEEN-transports item, not a divergence between them,
  and is explicitly out of scope with that reason written here.

**RED tests** (`web/backend/tests/transport/session-lifecycle.test.ts`):
1. **"a telnet caller's logoff is in the CallersLog"** - drive the real close
   handler on a logged-in telnet session; assert `Logged off` was written.
   **RED today** (divergence 28).
2. **"a telnet close frees the session map entry"** - assert
   `sessions.get(String(nodeId))` is undefined afterwards. **RED today**
   (divergence 29).
3. **"a telnet close releases its AnsiBuffer and flushes what it held"** -
   append without flushing, close, assert the bytes reached the connection and
   the module map shrank. **RED today** (divergence 30).
4. **"a browser session on the same account does not swallow the telnet
   logoff"** - the same user on both; close the telnet one; assert its
   `Logged off` was written and the web session survived. **RED today**, and
   RED against a naive shared finalize too.
5. **"a closed connection is no longer reachable"** - `emitterForSession`
   returns null after the close.
6. **"a web disconnect is unchanged"** - the full web disconnect through both
   graces, emits and side effects compared against the current behaviour.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/socket-handlers|tests/server/logoff|tests/petscii/render-ctx-disposal|tests/server/eighty-col-choke-identity"`
then the FULL suite.
**Success criteria.** Six tests green; `tests/petscii/render-ctx-disposal.test.ts`
(which drives finalize through the sysop-kick path at `:57`) passes with zero
edits; the identity suite unedited.


## Task TP-14 - the three-transport walk, pinned

The research's throwaway drivers become
`web/backend/tests/transport/three-transport-walk.test.ts`, the first test that
opens a real socket to more than one server. `tests/server/petscii-port.test.ts`
is the precedent for the telnet leg (real `net.connect`, real IAC); TP-12 test 8
is the precedent for the SSH leg; the web leg uses `socket.io-client`, which
**is not currently a dependency of `web/backend`** (`web/backend/package.json`
carries `socket.io` at `:57` and `ssh2` at `:58`, not the client) and is added
to its `devDependencies` as part of this task.

**Servers are started by the test**, not by importing `index.ts`: `TelnetServer`,
`SSHServerImpl` and a socket.io `Server` on ephemeral ports, each wired to
`setupTelnetSSHHandler` / `registerSocketHandlers` - possible only because TP-2
made the entry point importable. That is the Gate 3a claim of this whole plan:
three real callers, three real top-level entry points.

**Every step is delimited by a prompt sentinel, not by the clock.** The
research's walk was wall-clock stepped, which is why its own author recorded
that *"the per-step byte counts are not directly comparable past step 05"* and
why an earlier draft of this plan allowed a whitespace-normalised content
compare for the later steps - an escape hatch wide enough to hide a real
divergence, and it is deleted. Instead each driver reads until it sees that
step's SENTINEL, and the step's bytes are everything up to and including it:

| step | keystroke | sentinel read until |
|---|---|---|
| 01 connect | - | `ANSI, RIP, PETSCII` (`ANSI_GRAPHICS_PROMPT`, `services/login-connect.service.ts:73`) |
| 02 graphics | `A\r` | `Username: ` |
| 03 username | `sysop\r` | `Password: ` |
| 04 password | `sysop\r` | the first pause prompt, `(Pause)...` or `More(y/n/ns)?` (`screen.handler.ts:2768`) |
| 05-08 pauses | ` ` x4 | the next pause prompt, or the menu prompt |
| 09 WHO | `WHO\r` | the menu prompt |
| 10 DOORS | `DOORS\r` | the door list's own prompt |
| 11-15 | two down-arrows, `q`, `ESC`, `\r` | the menu prompt each time |
| 16 goodbye | `G\r` then `Y\r` | carrier close |

A step that does not reach its sentinel inside a generous timeout FAILS with
the bytes it did get - it never falls back to "compare loosely". The 68K
bulletin batch (MultiTop / DreamStats) takes seconds and is absorbed by the
sentinel wait, not by a sleep. **Every step therefore stays byte-comparable,
including the display-flow steps.**

**The comparison.** Steps are compared as normalised byte streams (IAC removed
on telnet; SSH raw; web's strings encoded with the same `encodeForWire` a byte
transport would use, so the three are comparable at all). Telnet and SSH must be
byte-identical throughout. Web may differ only where
`WALK_ALLOWED_DIFFERENCES` says so:

| # | difference | why it is allowed | who owns it |
|---|---|---|---|
| 1 | web waits 3000 ms after the connect banner | a browser has no dial-up negotiation to fill; `postBannerDelayMs` | TP-13a |
| 2 | web's bytes are UTF-8, byte transports' are the negotiated charset | decision 2; the streams are compared after a charset round-trip, so this is a transport encoding difference and not a content one | TP-5 |
| 3 | web receives structured events the byte legs do not | every one of them is ruled `web-only` in `EVENT_RULINGS`, and the walk asserts the drop tally on the byte legs equals the event count on the web leg for exactly those names | TP-3 |

**Three entries, and a fourth cannot be added without a plan amendment.** Each
carries a `reason` string in the committed constant. Anything else is a failure
with a printed byte diff.

**Step 02 is the deterministic anchor.** All three render BBSTITLE identically.
The test asserts the telnet leg delivers **13894 bytes** for it (TP-5's pin,
measured end-to-end this time rather than at the emitter), the SSH leg the same
bytes, and the web leg the same content after the round-trip.

**Step 03 is the login pin.** The research measured `web: 0 bytes` there,
because `command.handler.ts:1717` returned before the loop could echo. After
TP-9a and TP-9b all three legs deliver a non-zero, byte-comparable step.

**RED tests.** The walk itself is the test; it is RED today on at least five
counts (step 03's zero web bytes, step 02's 14217 vs 13894 on telnet, the
untracked drops, the SSH truncation, the differing banner) and its first green
run is the plan's acceptance evidence.

**Verification.**
`cd web/backend && npm i -D socket.io-client` then
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/three-transport-walk" --runInBand`
(`--runInBand`: three servers and a 68K bulletin batch must not race other
suites, and the rule about never running more than two emulators at once applies
here too).
**Success criteria.** One green walk; the printed per-step byte table in the
ledger; `WALK_ALLOWED_DIFFERENCES` has exactly the three entries above, each
with a non-empty reason; no step is compared by anything looser than bytes.


## Task TP-15 - what is DELETED

A task, not a footnote: the plan is not done while any of these still exist.

| deleted | file:line (pre-change) | replaced by |
|---|---|---|
| `setupTelnetSSHHandler` inline | `index.ts:1075-1348` | `server/transport-session.ts` |
| the emitter's silent fall-through | `server/connection-emitter.ts:90-140` (no `else`) | `applyTransportEvent` |
| the UN-ENCODED screen string reaching `Buffer.from(data)` | `server/telnet-server.ts:495`, reached from `connection-emitter.ts:112` | `encodeForWire`. The `write` method itself is UNCHANGED and both its arms stay live - see TP-5 |
| the UN-ENCODED screen string reaching `this.stream.write(data)` | `server/ssh-server.ts:136`, same caller | same |
| the web login early return | `handlers/command.handler.ts:1717-1719` | the loop runs for every transport |
| `packages/terminal/src/utils/login-key-machine.ts` ENTIRELY (`processLoginKey`'s five line-editing branches at `:61-123`, and the `:59` swallow that has no purpose once the server owns the line) | the whole file | `command.handler.ts:1716-1913` (TP-9b) |
| the login branch in BOTH browser key paths | `BBSTerminal.tsx:2873-3009` (`term.onKey`) and `:792-887` (`injectInput`) | the same; the two copies had diverged, as `login-key-machine.ts:10-14` records |
| the ten-value `LoginState` union and 24 of the 29 `loginState` references | `login-key-machine.ts:23-25`, `BBSTerminal.tsx` | `'server-driven' \| 'loggedin'` (TP-9b) |
| `check-username`, `new-user-response`, `password-reset-input`, `forced-pwd-change-input` handlers and the `login` username/password arm | `server/auth-socket-handlers.ts:634-705`, `:706-771`, `:772-873`, `:874-1083`, `:253-572` | the server loop; the `login` token arm SURVIVES |
| `prompt-password`, `retry-login`, `user-not-found`, `prompt-password-reset`, `prompt-forced-pwd-change` emits | the same handlers | server-side prompts |
| the method-existence key guard | `sdk/utils/door-input-manager.ts:258` | `bbs.deliversKeyEvents` |
| all 11 `sockets.sockets.get` sites in 6 files (the inventory table in TP-10) plus the seven `io.to(...)` `ansi-output` pushes beside them (`operator-chat.handler.ts:215,660`; `internode-chat.handler.ts:185,226,392,446`; `olm.handler.ts:330`) | see TP-10 | `server/session-emitter-registry.ts` - `emitterFor*` for the pushes, `socketIoSocketFor` for the one room-membership site (`internode-chat.handler.ts:819`) |
| `sessions.delete(connection.sessionId)` | `index.ts:1320` | `endTransportSession` (it deleted nothing: the map is keyed by `nodeId.toString()`, `server/session-manager.ts:272`) |
| the older graphics-prompt fallback string, twice | `server/telnet-server.ts:774`, `server/ssh-server.ts:312` | `ANSI_GRAPHICS_PROMPT` (`services/login-connect.service.ts:73`) |
| the unguarded `download-file` batch emit | `handlers/transfer/batch-download.handler.ts:214` | `deliverFilesToCaller` |
| the web-only connect banner block | `index.ts:1576-1632` | `emitConnectBanner` in `services/login-connect.service.ts` |

**Deliberately NOT deleted, each with its reason recorded in code:**

| kept | why |
|---|---|
| `socketToUser`, the `user:<id>` room, and their `if (isWeb)` guard (`services/login-post.service.ts:252-264`) | multi-TAB fanout. A telnet connection has no second tab; the registry answers the cross-session question instead |
| the DEL probe, the NUL strip, `convertPetsciiInputToAscii` (`transport-session.ts`, from `index.ts:1178-1207`) | byte-level, and web has no byte stream to classify |
| `transferRawSend` / `transferRawSendUnescaped` (`index.ts:1111-1131`) | the ZMODEM raw path; it deliberately bypasses the emitter and the encoder |
| the three PETSCII branches of the emitter (`connection-emitter.ts:99,121,134`) | PETSCII is its own charset; TP-5 must not touch them |
| one SSH host key (`utils/ssh-key.util.ts:46-48`) | controller decision 8; adding a second changes every client's known_hosts |
| `IDLE_TIMEOUT` unenforced (`services/bbs-config-file.service.ts:236`) | divergence 32 is parity BETWEEN transports; out of scope, named |
| `services/transfer-protocol.service.ts` with zero importers | non-goal: no protocol parity beyond ZMODEM presence |
| SSH's permissive transport auth (`server/ssh-server.ts:64-71`, `none` accepted) | TP-12's recorded decision: SSH is a pure transport and the BBS login is the credential. The doc comment at `:51-63` is kept and gains the follow-up line about pre-filling the BBS login |
| `prompt-login`'s seven server emit sites (`command.handler.ts:1083,1580,1634,1685`; `pre-login.ts:84,119,284`) | the shell's cue that the server's prompt is on screen; TP-9b re-points the browser handler instead of removing the event |

**Verification (all must return nothing unless noted):**

```
grep -rn "function setupTelnetSSHHandler" web/backend/src/index.ts
grep -rn "check-username\|new-user-response\|password-reset-input" web/backend/src/server/auth-socket-handlers.ts packages/terminal/src web/frontend/src
grep -rn "ANSI, RIP, PETSCII or No graphics" web/backend/src
grep -rn "emit('download-file'" web/backend/src            # exactly ONE, in file-delivery.ts
grep -rnE "sockets\??\.\s*sockets\??\.\s*get" web/backend/src --include='*.ts'   # exactly ONE, in session-emitter-registry.ts
grep -rn "sessions.delete(connection.sessionId)" web/backend/src
grep -rn "login-key-machine" packages/terminal/src web/frontend/src
grep -rn ": any" web/backend/src/server/transport-adapter.ts web/backend/src/server/transport-session.ts web/backend/src/server/session-emitter-registry.ts web/backend/src/server/terminal-input.ts web/backend/src/utils/wire-encoding.util.ts web/backend/src/handlers/file/file-delivery.ts
```

The `sockets.sockets.get` grep is deliberately an `-E` pattern with optional
chaining: `handlers/chat/chat.handler.ts:91` writes
`io.sockets?.sockets?.get(...)`, and a plain `io.sockets.sockets.get` grep
returns 9 hits where the honest count is 11.

**One comment is rewritten rather than deleted.**
`web/backend/src/types/login-emitter.ts:12-17` currently reads *"Frontend-only
events (`prompt-login`, `prompt-forced-pwd-change`, `modem-speed`,
`mask-input`, `login-success`, etc.) the telnet wrapper silently drops - that's
the intended behaviour."* After TP-3 and TP-4 that is false in three ways
(`modem-speed` and `mask-input` are translated, nothing is silent, and the
drops are ruled and counted). It is replaced with a pointer to
`EVENT_RULINGS`, and `TransportEmitter` is declared in the same file beside
`LoginEmitter` it extends.

Run each over `web/backend/src` AND `web/backend/tests` with `--include='*.ts'`.
Unscoped, several of these also hit `web/backend/debug-display-flow.log`, a
TRACKED runtime log that is not source and not part of this inventory; it is
named here so a future run does not read it as a miss.

**Success criteria.** All eight greps as specified, the `: any` one returning
nothing; `npx tsc --noEmit` and
`npm run typecheck:tests` clean; `cd packages/terminal && npx tsc --noEmit`.

---

## Task TP-16 - the reachability ledger

Per `~/.claude/REACHABILITY_PROTOCOL.md` sections 9 and 10. Create
`.superpowers/sdd/2026-09-03-ssh-telnet-parity/` with `CHECKLIST.md` (every ID
below, ticked in the open with a running count) and `REACHED.tsv`
(`id, entry_point, symbols, call_counts, timestamp, commit`), appended per
subtask, never written in a batch at the end.

**Gate 3b is the whole point: each row carries a CALL-COUNT SENTINEL, not a
source pin.** The instrument is validated first (protocol section 3): every
sentinel is proved to report a known-live path LIVE and a deliberately-unwired
path (the same driver against a session whose `connectionType` is `'web'`, or
an emitter built over a different connection) DEAD before any count is quoted.
That validation is row R0. Sentinels count **prototype or module-boundary
functions the path must cross**, never a module-local export - ts-jest binds
intra-module calls locally and a spy on one records zero whether the path ran
or not.

| ID | real entry point driven | symbol whose calls are counted | must be |
|---|---|---|---|
| R0 | instrument validation: the same walk on a telnet session and on a web one | `TelnetConnection.prototype.write` | LIVE / DEAD |
| R1 | a real telnet socket to a `TelnetServer` on an ephemeral port, through `setupTelnetSSHHandler`, to the first paint | `TelnetConnection.prototype.write`, `encodeForWire` | >= 1 each; the first payload's bytes equal the file's |
| R2 | a real `ssh2` client shell to `SSHServerImpl` | `SSHConnection.prototype.write`, `classifyTerminalType` | >= 1 each; `session.unicodeCapable` defined |
| R2b | the encoder's source-charset carrier: a `.ans` paint to a CP437 caller | `encodeForWire` with `attrs.sourceCharset === 'cp437'` | 1; bytes equal the file |
| R3 | a real `socket.io-client` through `registerSocketHandlers` | the socket's `emit`, `handleCommand` | >= 1 each; identity walk byte-equal |
| R4 | the adapter: a door emitting `door:load-client` on a telnet session, through the real `executeDoor` | `applyTransportEvent` | exactly 1, ruling `web-only`, drop tally 1 |
| R4b | the pattern arm: a client door's `door:message:<id>` frame | `applyTransportEvent` -> `matchPattern` | >= 1, ruling `web-only`, no `console.error` |
| R5 | the gate: `executeDoor` on a client-only door, real dispatch | `doorNeedsBrowser`, `emitPrompt` | 1 each; `executeClientDoor` 0 |
| R6 | game mode: a real `DoorInputManager` over a telnet `BBSApi` | `BBSApi.prototype` `deliversKeyEvents` getter | >= 1; `isKeyStateActive()` false |
| R7 | an arcade door's character path, all eight, through the door's own handler | the door's move function | >= 1 per door, position changed |
| R8 | login: the real web `command` handler, `BBSState.LOGON` | `runPostAuthLogin` | exactly 1 per successful login |
| R8b | the browser relay: a key at the login prompt through `term.onKey` AND through `injectInput` | the socket's `emit` with `'command'` | 1 each; local echo spy 0 |
| R9 | registration: an unknown username on telnet, through the real loop | `startNewUserRegistration` | exactly 1 |
| R10 | the kick: the real NM `kick` branch against a telnet session | `emitterForNodeId`, `connection.close` | 1 each |
| R11 | OLM immediate: a telnet recipient at `READ_COMMAND` | `emitterForSession` | 1; queue length 0 |
| R12 | downloads: the real batch path on telnet | `deliverFilesToCaller`, `startZmodemDownload` | 1 each; `updateDownloadStats` 0 on refusal |
| R13a | connect parity: a real `/ws/terminal` client | `runPreLoginConnect`, `emitConnectBanner` | 1 each |
| R13b | lifecycle: the real telnet `close` handler on a logged-in session | `finalizeDisconnectCleanup`, `releaseAnsiBuffer`, `unregisterConnectionEmitter` | 1 each; `Logged off` written |
| R14 | the walk: all three legs, real sockets, every step delimited by its prompt sentinel | every symbol above, in one run | the per-step byte table, and exactly 3 allowed differences |

**Verification.** `REACHED.tsv` has 19 rows, R0 first; `CHECKLIST.md`'s ticked
count equals the number of DONE IDs and is reported with every progress message
(`[x] TP-5 - 5 of 19, 14 open`).
**Success criteria.** No task is DONE without its rows. A row whose count is 0
is a FAILED item, reported as such - never rounded up. The ratchet (the count of
not-DONE IDs) is committed and CI fails if it rises.

---

## Task TP-17 - freshness, manual acceptance, handoff (last, mandatory)

`sdk/` IS edited by this plan (TP-7), so
`.claude/skills/door-sdk-freshness/SKILL.md` runs in full, not partially. Two
doors are rebuilt (`Doors/telnet-front`, and any arcade door whose `.ts` moved -
none is planned, so the count should be one; if it is more, say which and why).
`packages/terminal` and `web/frontend` are rebuilt because TP-9b changes the
bundle, and port 3001 serves the BUILT bundle.

**Automated (all must pass, in this order):**

1. `cd web/backend && npx tsc --noEmit`
2. `cd web/backend && npm run typecheck:tests`
3. `cd sdk && npm run build && npx tsc --noEmit -p tsconfig.json`
4. `cd packages/terminal && npm run build`
5. `cd web/frontend && npm run build:check`
6. `cd Doors/telnet-front && npm run build` (and `git add Doors/telnet-front/dist/`)
7. `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/transport/|tests/server/|tests/doors/|tests/handlers/|tests/petscii/|tests/services/"`
8. `cd web/backend && npm test` - the FULL suite. **Never gate on a grep**
   (`npm test | grep "^Tests:" && git push` pushes red tests); read the exit
   status. Name any failure that is not in the known-flaky set.
9. Restart with absolute paths:
   ```
   /Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
   ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep   # must print nothing
   rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
   /Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only
   ```
10. Wait for `[READY] AmiExpress BBS is ready for connections!` in
    `logs/backend.log` before telling the user anything.

**Manual verification (the sysop's, separate from the above - never ticked by
the implementer):**

- **Classic telnet client walk.** SyncTERM or NetRunner (a CP437/Latin-1
  client, NOT a UTF-8 terminal) to `localhost 2323`. BBSTITLE, a bulletin with
  high bytes, the last-callers header: the art must be the right width and the
  `·` must be one character, not `Â·`.
- **UTF-8 telnet client walk.** `telnet` from a UTF-8 xterm: the same screens
  must still be right, through the TTYPE allow-list.
- **SSH walk.** `ssh -p 2222 anyone@localhost` from a 132-column window: the
  first screen must arrive complete (its top row, not mid-table), the geometry
  must be 132 columns, and a blessed door must render in Unicode, not ACS
  fallback.
- **Web walk.** Log in by TYPING at the `Username:` prompt. Then a client door
  (arkanoid), then a hybrid (grandmaster) - both must behave exactly as before.
- **The refusals.** From telnet: open arkanoid (expect
  `THIS DOOR NEEDS A WEB BROWSER`, then the menu), open grandmaster (expect the
  blessed board), answer `R` at the graphics prompt (expect the ANSI fallback
  notice, no `!|` text).
- **The arcade doors.** From telnet, play joust and frogger: the character keys
  must move the player.
- **Cross-session.** From a second node, `NM` kick the telnet caller; page the
  telnet caller from operator chat; send them an OLM while they sit at the
  command prompt. All three must land.
- **Logoff.** Drop the telnet connection; `Node1/CallersLog` must gain
  `Logged off` and the node must free.
- **The 80-column guard.** A normal ANSI web session: `MENU`, `BULL`, a
  paginated listing, a door. Nothing may look different from `origin/main`.

**Handoff.** Update `handoff.md` (< 10 KB, `wc -c handoff.md`): the adapter, the
encoder and its default, the one login machine, the registry, and the manual
walks with their results. Archive the long form to
`thoughts/shared/handoffs/2026-09-03_ssh-telnet-parity.md`.

**Success criteria.** Steps 1-10 green; every manual walk recorded with the
sysop's verdict; `handoff.md` current and under cap; `CHECKLIST.md` shows
19 of 19.

---

## Sequencing and dependencies

```
TP-1  (RED, individual tests flip in their fix tasks) ──────────────────────────┐
TP-2  (entry point importable; behaviour-free) ──┐                              │
                                                 ├─> TP-3 (adapter) ──┐         │
                                                 └────────────────────┤         │
                                                    TP-5 (encoder) <──┘         │
                                                          │                     │
                                                 TP-4 (translations)            │
                                                          │                     │
         ┌────────────────────────────────────────────────┼──────────────┐      │
         v                                                v              v      │
  TP-6 (door gate)                                TP-10 (registry)  TP-11 (dl)  │
         │                                                │                     │
  TP-7 (game mode)                                  TP-8 (input)                │
                                                          │                     │
                                                   TP-9a (login server)         │
                                                          │                     │
                                                   TP-9b (login browser)        │
         │                                                │              │      │
         └───────────────────┬────────────────────────────┴──────────────┘      │
                             v                                                  │
     TP-13a (connect) ──> TP-12 (SSH) ──> TP-13b (close) ──> TP-14 (walk pin) ──┤
                                                                                │
TP-15 (deletions, verified on its own) ─────────────────────────────────────────┤
TP-16 (ledger; appended per task, closed before TP-17) ─────────────────────────┴─> TP-17
```

**19 tasks.** The edges that are not obvious, each with the file that forces it:

| edge | why |
|---|---|
| TP-2 before everything | no later task can drive a telnet caller's real entry point until `setupTelnetSSHHandler` leaves `index.ts`, which self-starts servers on import |
| TP-3 before TP-5 | both edit `server/connection-emitter.ts` - TP-3 widens `emit` to `(event, ...args)`, TP-5 reads `args[1]` for the source-charset attribute. **Sequenced, never parallel**, despite the controller calling them "the foundation" together |
| TP-5 before TP-4 | `applyTranslation`'s two `render` cases write bytes and must write them through the encoder |
| **TP-10 before TP-8** | both edit `server/transport-session.ts` - TP-10 adds `registerConnectionEmitter` beside the emitter attach, TP-8 replaces the `data` handler's branch table. TP-10 is the smaller diff and lands first |
| TP-10 before TP-13b | the shared finalize's multi-session guard moves from `socketToUser` (web-only) to `emitterForUserId`, or a telnet logoff is silently skipped whenever the same account is open in a browser |
| TP-9a before TP-9b | TP-9a makes the server drive the login prompt for every transport; until TP-9b retires the browser's editor, a web caller sees DOUBLED echo. The pair is not shippable half-done and the manual walk in TP-17 is what confirms it |
| TP-13a before TP-12 | TP-13a moves the graphics prompt's emit into `emitConnectBanner`/`runPreLoginConnect`; TP-12 item 8 points SSH's fallback at the same constant |
| TP-14 after everything | it byte-compares the result of all of them |

Parallel-safe pairs, by the files they touch: TP-6 (`door.handler.ts`,
`door-min-columns.util.ts`, `pre-login.ts`) and TP-11 (`download.handler.ts`,
`batch-download.handler.ts`, `user-commands.handler.ts`) share nothing. TP-7 is
the only task that edits `sdk/` and TP-9b the only one that edits
`packages/terminal`, so those two never collide with anything or each other.
Three tasks edit `server/transport-session.ts` - TP-2 creates it, TP-10 and
TP-8 amend it - and they are strictly ordered above for that reason.


## Risk register

| risk | task | mitigation |
|---|---|---|
| **Widening `emit` to rest args breaks a caller that passed two arguments** | TP-3 | the three existing branches keep reading `args[0]`; test 5 replays the whole `eightyColumnWalk` byte-for-byte, and the four existing emitter suites must pass unedited |
| **The encoder mangles CP437 art for a Latin-1 caller** | TP-5 | `substituteUnmappable` maps box-drawing to the ASCII forms RULES.md already mandates for BBS output; test 6 asserts no `0x3F` is ever introduced |
| **The encoder turns /ws/terminal's text frames into binary frames** | TP-5 | `WSTerminalConnection.write` (`server/ws-terminal-server.ts:78-85`) branches on the argument type; the ws-terminal factory stamps `wireCharset: 'utf-8'` so the encoder's UTF-8 short-circuit keeps handing it a string; test 8 |
| **The encoder changes web output** | TP-5 | `resolveWireCharset` short-circuits `connectionType === 'web'` to UTF-8 before any table is consulted; test 7 and the identity suite's web case |
| **A UTF-8 telnet client is downgraded to Latin-1 and loses characters** | TP-5 | CHARSET negotiation first, then the TTYPE allow-list; the excluded list carries a reason per entry so a client is never guessed at. A character outside Latin-1 that the caller genuinely could show is the one real cost, and the manual UTF-8 telnet walk is what catches it |
| **Extracting the entry point changes behaviour silently** | TP-2 | the diff must be the parameter list and the imports, and nothing else; test 4 asserts the module starts no servers on import; the full suite runs |
| **The hybrid fall-through returns before the server half** | TP-6 | `door.handler.ts:1798-1801`'s `if (!hybridSessionId) return;` becomes conditional on having attempted the client half; test 2 drives exactly that |
| **The door gate disturbs the `socket.emit` identity pins** | TP-6 | it runs BEFORE `executeClientDoor` and touches no wrapper; `tests/doors/door-min-columns-gate.test.ts:393,421,497-501` re-run with zero edits |
| **Default-closing the key guard kills game mode on web** | TP-7 | `deliversKeyEvents` is `transportCapabilities(session).keyEvents`, true for web by construction; test 2 is the guard, and the manual web arkanoid walk is the acceptance |
| **An arcade door has no character path and silently stops moving** | TP-7 | test 3 sweeps all eight and fails the day one loses it, at which point that door becomes `CLIENT_ONLY` per TP-6 |
| **Retiring the browser login machine breaks the JWT / SSO path** | TP-9b | only the username/password arm of `socket.on('login')` goes; the token arm (`auth-socket-handlers.ts:271-290`, `:595`), `login-success`, `restore-session` and the chat-only pair stay; test 5 |
| **Retiring the browser login machine leaves the shell in the login UI** | TP-9b | `login-success` is still emitted by `runPostAuthLogin`'s web path and is also what seeds the session font (`BBSTerminal.tsx:2764-2776`, `:819-823`); relay test 4 asserts the view switch AND the font, in that order |
| **TP-9a lands without TP-9b and every web caller sees doubled echo** | TP-9a, TP-9b | they are one shippable unit and the dependency table says so; TP-9a's own manual check is a telnet login, TP-9b's is the web one |
| **An encoding RED test is green on arrival because its mock write already encodes latin1** | TP-1, TP-5 | no mock `connection.write` in `tests/transport/wire-encoding.test.ts`; every case drives a real `TelnetConnection` over a stub `net.Socket` and reads the SOCKET's bytes, and the suite asserts its own compliance |
| **A `.ans` reaches a CP437 caller re-encoded as Latin-1** | TP-5 | the source charset travels with the payload on the existing third-argument attribute (`utils/output-pacing.ts`), and `encodeForWire` case 2 inverts exactly the decode that produced the string; TP-5 test 3 and ledger R2b |
| **An event whose name is built at runtime falls through as unruled** | TP-3 | `PATTERN_RULINGS` is matched before the unruled path and its site list is re-grepped by test 3, so a fourteenth variable-emit site is a failure, not a silent pass |
| **The walk hides a divergence behind a loose comparison** | TP-14 | every step is delimited by a prompt sentinel and compared as bytes; the whitespace-normalised content compare an earlier draft allowed for the late steps is deleted, and the allow-list is three entries with a written reason each |
| **The registry keeps a dead emitter alive** | TP-10 | the emitter is held on the SESSION and `unregisterConnectionEmitter` runs in the close handler; test 5 |
| **The registry returns the pre-reconnect socket for a web caller** | TP-10 | it never reads `session.socket` (assigned once at `socket-handlers.ts:175`, never reassigned by the restore); test 4 drives a reconnect |
| **The shared finalize skips a telnet logoff because the same user is on web** | TP-13b | the multi-session guard moves from `socketToUser` (web-only) to `emitterForUserId`; test 4 |
| **Keepalive kills a slow but live connection** | TP-13b | 60 s probes with the OS default retry count, not an idle timeout; a caller reading a screen sends nothing and must not be dropped - which is why divergence 32 stays out of scope |
| **The walk test is flaky and gets skipped** | TP-14 | `--runInBand`, ephemeral ports, servers started and stopped by the test, and content-based comparison past step 05; a skip must carry a written reason and appear in the ledger as OPEN, not DONE |
| **A shared-tree commit carries another session's staged files** | all | `git diff --cached --stat` before every commit; commit by path; never `git add -A` |
| **A door's `.ts` ships without its `dist/`** | TP-7, TP-13a | the pre-commit hook rebuilds and stages, and TP-17 step 6 re-runs it; RULES.md rule 5 |

## Coverage table - every controller decision and every open question, pinned

| # | decision / question | pinned by |
|---|---|---|
| 1 | ONE adapter, complete typed map, enumeration test | TP-3 tests 1-4; ledger R4; TP-15's first two greps |
| 2 | ONE encoder, original bytes unless UTF-8 negotiated, BBSTITLE 13894 | TP-5 tests 1-7; ledger R1; TP-14 step 02 |
| 3 | ONE login machine, server-side, web typing works | TP-9a tests 1-5 and TP-9b tests 1-5; ledger R8, R8b, R9; TP-14 step 03 |
| 4 | transport gate for browser doors, notice not freeze | TP-6 tests 1-5; ledger R5 |
| 5 | `isKeyStateActive()` false without key edges; the eight take the character path | TP-7 tests 1-4; ledger R6, R7 |
| 6 | ONE registry for cross-session pushes | TP-10 tests 1-5; ledger R10, R11 |
| 7 | downloads guarded; ZMODEM or refusal | TP-11 tests 1-5; ledger R12 |
| 8 | SSH: term, window-size, unicodeCapable, one host key, quirks | TP-12 tests 1-8; ledger R2. The decision's `none`-auth clause is WITHDRAWN with a written reason (TP-12's recorded decision, TP-15's keep table) |
| 9 | ONE finalize for every transport | TP-13b tests 1-6; ledger R13b |
| 10 | the three-transport walk, pinned allow-list | TP-14; ledger R14. Three allow-list entries, per-step prompt sentinels, no content-only compare |
| Q1 | SSH's lost first screen | TP-12 item 6: `write` queues until the stream exists (a discarded write is a defect whatever the window), and TP-14's SSH driver attaches its sink inside the shell callback so a harness race cannot masquerade as a server one. Test TP-12.4 |
| Q2 | are non-UTF-8 telnet clients the target | yes, per decision 2. Default Latin-1, negotiate up. TP-5 tests 2-5 and the classic-client manual walk |
| Q3 | what a telnet caller sees for a browser-only door | a one-line notice and the menu, per decision 4; hybrids run their server half. TP-6 tests 1-3 |
| Q4 | `isKeyStateActive()` contract | "the transport delivers key edges" - the doc comment at `door-input-manager.ts:247-253` is the contract and the code was the bug. TP-7 |
| Q5 | should pushes be keyed on the session | yes, per decision 6. TP-10 |
| Q6 | two login implementations | the server loop is the truth; the browser relays. Reasons written in TP-9a, chief among them that the loop already calls `runPostAuthLogin` and that `startNewUserRegistration` has exactly one, web-only, caller |
| Q7 | `door:await-key` | ruled `dead` in `EVENT_RULINGS` with a note; it hangs on every transport, so it is not a divergence. Named in the non-goals and filed as its own defect |
| Q8 | the dedicated PETSCII port | not a fourth walk leg: it shares every telnet code path and is covered by `tests/server/petscii-port.test.ts`. Exemption recorded in the non-goals and in TP-14 |
| - | `/ws/terminal` has no pre-login (divergence 38) | TP-13a item 1, test 1 |
| - | the connect banner appears only on the non-telnet transport (33) | TP-13a item 2, tests 2-3 |
| - | the caller's own IP reads NOT AVAILABLE (34) | TP-13a item 3, test 4 |
| - | SSH transport auth (divergence 17) | NOT changed. TP-12's recorded decision: SSH is a pure transport like telnet and the BBS login is the credential; the doc comment at `ssh-server.ts:51-63` is kept and gains the pre-fill follow-up line. Pinned by TP-12 test 6 |
| - | the source charset dies at the loader (`amiga-text-decode.util.ts:110-113`) | TP-5's carrier on `utils/output-pacing.ts`'s attribute object; tests 1-4, ledger R2b |
| - | the census misses the SDK and the runtime-built names | TP-3's three greps, 232 names, `PATTERN_RULINGS`; tests 1-4 |
| - | input parity (21-25) | TP-8 tests 1-7 - derived from the research rather than dictated by the controller, and flagged as such |
| - | 80-column identity | `tests/server/eighty-col-choke-identity.test.ts`, re-run as a gate after every task, unedited |

No open questions remain. Where a fact in the tree forced a choice, the choice
and its reason are recorded inline: Latin-1 as the default wire charset (TP-5,
because `detectEncoding` returns `iso-8859-1` for everything that is not a
`.ans` and because this board's own output convention forbids PC box-drawing),
the server login loop as the survivor (TP-9a, because it already calls the
shared post-auth pipeline and because registration has no other entry), the
emitter held on the session rather than in a map (TP-10, the reason
`petscii-session-model.ts:44` gives), SSH transport auth left permissive
(TP-12, because SSH here is a pure transport exactly as telnet is and the BBS
login is the credential - the clause the controller's decision 8 asked for is
withdrawn, in writing, rather than implemented against the file's own stated
design), the wire charset derived from `classifyTerminalType`'s existing
`unicodeCapable` rather than a second list of terminal names (TP-5), and the
connect banner shared while the 3 s wait stays web-only (TP-13a, because a
stall added to a telnet connect would be a regression).

---

*Iteration passes: 9. **Pass 1** drafted the task spine from the ten controller
decisions and the research's 40-row divergence ledger, and grouped the 40 rows
onto tasks so that no row is unowned. **Pass 2** opened every cited file against
the tree at `8b137017d` and corrected the anchors the research had drifted from:
`telnet-server.ts:734-756` (not `:733-747` - the PETSCII plan's `resetPetsciiModel`
landed at `:754` and moved the block), `pre-login.ts:148-162` for the `P`
branch (the `:150-162` a draft carried excluded the `if (hasP) {` opener), `door.handler.ts:1784-1803` for the manifest read and
the client/hybrid branches (not `:1789-1806`),
`client-door-bridge.ts:148-153/:235/:319/:426/:434-443/:455/:513/:549` (the
research's `:141/:150/:213/:427/:433-443/:453` predate a refactor),
`download.handler.ts:515-531` for the transport branch, and
`BBSApi.ts:1542-1547` for the upload timeout. It also confirmed that
`index.ts:1196` now calls `sessionWantsPetscii`, i.e. the PETSCII plan's third
predicate copy is already gone. **Pass 3** re-ran the event census
(149 distinct names, `ansi-output` 1832) and cross-referenced it against every
`.on(` in `packages/terminal/src`, `web/frontend/src` and `web/config-app/src`,
which produced the bulk ruling classes and forced two ruling kinds the
controller's three did not cover: `dead` (emitted with no consumer on any
transport - eight names, `door:await-key` among them) and `not-transport`
(EventEmitter emits on servers and bridges that are never a session socket -
seventeen names). Without those two the enumeration test would have had to lie
about a third of the list. **Pass 4** worked the encoding decision to a level
rather than a default: the round-trip pin (13894, the on-disk size) is only
reproducible if the wire codec matches the codec `readAmigaTextFile` chose, so
the plan states Latin-1 as the default with `detectEncoding`'s own bias as the
evidence, adds the CP437 fallback table so `.ans` art degrades to ASCII line
art instead of question marks, and records that the existing identity test at
`eighty-col-choke-identity.test.ts:374,403` has been asserting `latin1` all
along against a fake `connection.write` - so TP-5 makes production agree with a
pin that already existed, and that test must pass unedited. The same pass found
that TP-3 and TP-5 both edit `connection-emitter.ts` and moved them from
parallel to sequenced. **Pass 5** answered the login direction with four facts
from the tree rather than a preference - the server loop already calls
`runPostAuthLogin` (`command.handler.ts:1873`) and `promptPasswordReset`
(`:1829`), the reverse direction would need a server-side re-implementation of
the browser's echo and masking, the browser half is the smaller deletion, and
`startNewUserRegistration` (`handlers/user/new-user.handler.ts:111`) has
exactly ONE caller in the entire backend, `auth-socket-handlers.ts:720-721`,
which means **no telnet or SSH caller can create an account today** - a defect
the research did not name and which the unification closes. It also traced the
lifecycle merge and found the trap that `finalizeDisconnectCleanup`'s
still-connected guard (`socket-handlers.ts:1103-1110`) reads `socketToUser`,
which `login-post.service.ts:252-264` fills only for web, so sharing the
finalize naively would have silently skipped a telnet logoff whenever the same
account was open in a browser - which is why TP-13b depends on TP-10's registry
and not the other way round. **Pass 6** was a mechanical sweep: every one of
the 208 `file:line` citations in this document was resolved to a real file and
bounds-checked, and eight anchors were corrected against the tree -
`session.socket` is assigned at `socket-handlers.ts:175` (not `:171`, which the
prior plan had and which had drifted), the session-log wrapper is `:179-187`,
the `login` handler's token arm is `:271-290` with its JWT `login-success` at
`:594` and its username/password arm at `:291-570` (not the single `:571-630`
range a first draft named), `initializeTelnet` is `:208-233` with `DO NAWS` at
`:221` and the TTYPE subnegotiation split across `:298-306` and `:330-340`,
the two lrzsz client-quirk gates are the comparisons at `:350` and `:605`
rather than the comment blocks at `:239-243` and `:562-571` that explain them,
and `runPostAuthLogin`'s web caller is `auth-socket-handlers.ts:610-614`. The
same pass added the shorthand path table this document had been using without
declaring. **Pass 7** opened `WSTerminalConnection.write`
(`server/ws-terminal-server.ts:78-85`) and found the one place TP-5 could have
broken something by accident: it sends a TEXT frame for a string and a BINARY
frame for a Buffer, so an encoder that always returned a Buffer would silently
change the frame type the fourth transport's clients receive. `encodeForWire`
therefore returns `string | Buffer` - the string unchanged whenever the
resolved charset is UTF-8, which also makes the change a literal no-op for web,
for `/ws/terminal` and for a telnet client that negotiated UTF-8 - and the
ws-terminal factory stamps `wireCharset: 'utf-8'` because its session is
created with `connectionType: "telnet"` (`index.ts:1774`) and cannot otherwise
be told apart. **Pass 8** reconciled that through the rest of the document:
`TelnetConnection.write` is now stated as UNCHANGED with both arms live rather
than as a site with a dead string arm, TP-15's deletion table names the
un-encoded string reaching it rather than the method itself, TP-5 gained an
eighth test asserting the frame type, the risk register gained the frame-type
row, and an invented "eleven `=== 'telnet'` tests" was replaced by the measured
count (nine in `src`, one in `tests`) with the grep that reproduces it.
**Pass 9** answered a NEEDS REVISION review and re-measured every claim it
raised. Five blocking findings: the encoding RED tests were green on arrival,
because the emitter idiom's mock `connection.write`
(`tests/server/eighty-col-choke-identity.test.ts:374`) already does
`Buffer.from(d, 'latin1')` while the defect lives one layer lower in
`telnet-server.ts:495` - so TP-1 and TP-5 now drive a real `TelnetConnection`
over a stub `net.Socket`, read the SOCKET's bytes, and ban a mock write in
`tests/transport/wire-encoding.test.ts` with a self-check. The census was
re-run over `web/backend/src` + `sdk` + `Doors/*/[a-z]*.ts` and grew from 149
names to **232**: a plain file grep over `sdk/` returns 392, nearly all blessed
and engine-internal, so the SDK arm is receiver-anchored, which yields 86 of
which 83 are new - 80 going to the in-process `BrokerClient`
(`sdk/engines/network/broker/broker-client.ts:26-29`, one `not-transport`
ruling) and 3 real session-socket emits from
`sdk/engines/audio/audio-engine.ts:243,266,1196,1214,1231`; a third grep pins
the thirteen sites whose event name is a VARIABLE, which no name census can
see, and `PATTERN_RULINGS` (matched before the unruled path) rules those and
`door:message:<id>` (`doors/client-door-bridge.ts:182,426,501`). The registry
inventory was re-grepped with optional chaining allowed and is **11 hits in 6
files**, not the 6 an earlier draft claimed, so `internode-chat.handler.ts:819`
gets `socketIoSocketFor` for its room `leave` and TP-15's grep is an `-E`
pattern expecting exactly one remaining hit. TP-9 split into TP-9a (server) and
TP-9b (browser) after measuring the browser surface: 29 `loginState`
references, eight listeners at `BBSTerminal.tsx:2486-2537`, a second login copy
in `injectInput` (`:792`) that `login-key-machine.ts:10-14` records as already
divergent, and the `login-success` -> session-font ordering at `:2764-2776`;
`prompt-login` needed no replacement because the server already emits it from
seven sites. TP-14's fourth allow-list entry - a whitespace-normalised content
compare for the late steps - was deleted as an escape hatch and wall-clock
stepping replaced by a per-step prompt sentinel, so every step stays
byte-comparable. Of the controller's own decisions, one was **withdrawn with a
written reason**: rejecting SSH `none` auth contradicts `ssh-server.ts:51-63`'s
stated design that SSH is a pure transport and the BBS login is the credential,
so TP-12 keeps the handler, keeps the comment, and adds the pre-fill follow-up
line. The source-charset carrier the review directed uses the shape
`8b137017d` established three hours earlier: `utils/output-pacing.ts`'s third
argument on `ansi-output`, whose own header (`:26-42`) argues for an attribute
over a new event name precisely because the telnet emitter drops unknown names.
The UTF-8 terminal list a draft had invented was deleted in favour of
`classifyTerminalType`'s existing `unicodeCapable` (`telnet-server.ts:107`),
one predicate; `substituteUnmappable` became a codepoint scan rather than a
module-level `/g` RegExp; `emitText`/`emitPrompt` are now named as
`utils/output.util.ts:34,53` wrappers over `utils/ansi-buffer.util.ts:195,216`;
TP-13 split into TP-13a (connect, 3 files) and TP-13b (close, 5 files plus a
door rebuild, dependent on TP-10); TP-8 was sequenced AFTER TP-10 because both
amend `server/transport-session.ts`; `socket.io-client` was found absent from
`web/backend/package.json` and added to TP-14; and every `any` on the new API
surface was replaced with `BBSSession`, `IOServer` or the `TransportEmitter`
interface that extends the `LoginEmitter` this repo already has
(`types/login-emitter.ts:22`) - whose own doc comment calls the silent drop
"the intended behaviour" and is rewritten by TP-15.*