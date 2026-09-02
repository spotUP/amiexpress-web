---
date: 2026-09-02
topic: One PETSCII terminal model per session, fed at the transport choke; the .seq render reads it instead of keeping a second one
tags: [petscii, c64, seq, oracle, transducer, transport, connection-emitter, socket-handlers, choke, reachability]
status: draft
---

# The PETSCII oracle moves to the choke

Research: `thoughts/shared/research/2026-09-02_petscii-oracle-transport-boundary.md`
(read it first; this plan does not repeat its tables).
Prior wave: `.superpowers/sdd/2026-09-02-mci-in-seq/fix-wave-report.md`.
Prior plan (style and standing rules): `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`.
Branch: `feat/installed-door-link`. Every `file:line` below was opened against
the working tree at `f7c2b8ce2` on 2026-09-02.

## Controller decisions (settled - do not reopen)

1. **Level A of the research, section 7.** ONE session-lifetime
   `AnsiToPetsciiTransducer` per PETSCII session is THE terminal model. It is
   fed at the per-session transport choke.
2. The `.seq` render (`petsciiTransducerFor` / `petsciiMachineFor` in
   `web/backend/src/handlers/petscii-screen.render.ts:161,179`) **returns that
   model** instead of a second object. T2 (`session.petsciiRenderTransducer`)
   is deleted. (Of the two accessors only `petsciiMachineFor` survives: after
   the flip nothing asked the render for a transducer, so OC-9 deleted
   `petsciiTransducerFor` as well.)
3. **Telnet / SSH / WS-terminal:** the model is the connection emitter's
   existing transducer (`connection-emitter.ts:28-31`, choke at `:95-143`).
4. **Web:** a wrapper installed at socket registration next to the session-log
   wrapper (`socket-handlers.ts:176-183`), re-installed on the reconnect
   replacement socket (`auth-socket-handlers.ts:177-184` precedent). It runs
   `transduce` on every `ansi-output` / `petscii-output` string and `observe`
   on every `petscii-bytes` payload, gated on the session being PETSCII
   (`petsciiMode` or `terminalType === 'c64'`) so ANSI sessions pay nothing.
5. The model is **reset at the PETSCII flip sites** (research section 4) so a
   pre-session prefix cannot poison it.
6. **Flush at input arrival** in the web `command` handler, mirroring
   `index.ts:1144`.
7. The four scoped taps, `installPetsciiOracleTap`, `withPetsciiOracleTap` and
   `disposePetsciiRenderCtx`'s transducer ownership are dead code and are
   removed; their tests are retargeted to the new choke and must keep proving
   **oracle == terminal through the real path**.
8. Open questions ruled: **Q1** server model, no client reporting. **Q2** moot
   (wrapper at registration). **Q3** IN SCOPE. **Q4** the model is keyed on the
   session object and travels with it; a node reassignment that hands a
   connection a new session gets a fresh model, pinned. **Q5** flush at input
   arrival. **Q6** the wrapper is on whatever socket `session.socket` is after
   reconnect, pinned. **Q7** client-side doors out of scope. **Q8** moot under
   A, but the proof must include a `.seq` right after `startPagination` page
   content (`screen.handler.ts:2800`) and after a directly displayed `.TXT`.

## Non-goals

- **Client-side and hybrid doors** (research Q7). A client door's frames travel
  as `door:message:<sessionId>` (`web/backend/src/doors/client-door-bridge.ts:427`)
  and are drawn by the door's own browser bundle, not by `writeTerm`; no
  server-side model sees them and none is added here.
- ZMODEM / binary payloads. Non-string `ansi-output` and the raw
  `connection.write` sites (`telnet-server.ts:765`, `ssh-server.ts:312`,
  `index.ts:1110-1130`) stay outside the model, exactly as they are today.
- The 80-column ANSI path. Not one byte of it changes; **OC-7 is the guard**.
- `stripSentinelRuns`' duplicated NUL scanner (fix-wave concern 3). Untouched.

## Standing rules this plan must not break

- **80-column rule.** Every ANSI session's bytes are byte-identical before and
  after, on every transport. OC-7 owns this and is re-run as a gate after
  OC-2, OC-3, OC-4 and OC-5.
- **express.e parity.** No screen flow, prompt order or pause changes. The wire
  is untouched throughout: this plan moves a MODEL, never a byte.
- **Single source of truth.** One predicate, one accessor, one flush, one
  reset, one dispose - all in one new module. Two copies of the PETSCII
  predicate exist today (`connection-emitter.ts:24`,
  `screen.handler.ts:1483`); they collapse to one.
- Regression test per change, named after the user-visible symptom, RED before
  GREEN. No emojis. ASCII tokens in BBS output.
- **Never `Edit`/`Write` a `.seq`/`.info`/binary fixture** - the UTF-8 round
  trip destroys every high-bit byte. Fixtures are byte arrays built in code
  (`seqBytes()` in `tests/petscii/seq-pause-and-colour.test.ts:52-62`).

---

## Architecture in one paragraph

Today a PETSCII session carries two server-side models on telnet (T1 in the
emitter, T2 in the render) and one on web (T2 only, with the real model T3 in
the browser). T2 sees `.seq` bytes plus whatever four scoped taps hand it;
everything between two `.seq` screens - the menu, a door, a chat page - is
invisible to it, so a `.seq` displayed after arbitrary ANSI encodes and clips
its first value against a stale cursor. This plan makes
`session.petsciiTransducer` the ONE model, feeds it at the single point every
byte for that session passes (`connection-emitter.ts:95-143` on telnet, a new
registration-time wrapper on web), and has the render read that model instead
of building a second one. `petscii-bytes` payloads the render produced are
already in the model by the time they are emitted (the render must consult the
cursor WHILE it encodes), so the producer marks the payload on the socket and
the choke consumes the mark and clears only the deferred-wrap latch; every
other `petscii-bytes` payload - `BBSApi.writePetscii(Buffer)`
(`BBSApi.ts:308`), which no model sees today - is observed for real.

| concern | survivor | duplicate retired |
|---|---|---|
| "is this session PETSCII" | `sessionWantsPetscii` (new module) | `isPetsciiSession` (`connection-emitter.ts:23-25`), `sessionWantsRawPetscii` (`screen.handler.ts:1482-1484`) |
| the terminal model | `session.petsciiTransducer` | `session.petsciiRenderTransducer` (`petscii-screen.render.ts:95,161-167`) |
| feeding it ANSI | the two chokes | `installPetsciiOracleTap` / `withPetsciiOracleTap` (`screen.handler.ts:1521-1569`) and their four call sites |
| emitting `petscii-bytes` | `emitPetsciiBytes` (new module) | three open-coded `socket.emit('petscii-bytes', b.toString('base64'))` (`screen.handler.ts:1640,1652,1842`) |
| flushing the model | `flushPetsciiModel` (new module) | `flushPendingPetscii` (`connection-emitter.ts:61-71`) keeps its name and delegates |
| restoring a wrapped `emit` | restore-what-was-found | three bound-copy restorers (`BBSApi.ts:1237,1309`, `door.handler.ts:152`) |

---

## Task OC-1 - RED: the oracle drifts from the terminal between screens

**No code.** Five failing tests that name the symptom, in a new file
`web/backend/tests/petscii/oracle-at-the-choke.test.ts`, built on the idioms
already in `tests/petscii/seq-pause-and-colour.test.ts` (`SKIP_DB_INIT`, the
emit-array socket at `:64-69`, `seqBytes` at `:52-62`, `petsciiPayloads` at
`:85-90`, and **`wireMirror` at `:105-119` copied verbatim** - it is the
definition of "what the terminal has").

```ts
/** The session's oracle must equal a fresh terminal fed the whole wire. */
function expectOracleMatchesWire(session: any, emits: Emit[]) {
  const wire = wireMirror(emits);            // fresh AnsiToPetsciiTransducer, whole wire
  const oracle = petsciiMachineFor(session); // what the render encodes against
  expect({ x: oracle.state.cursorX, y: oracle.state.cursorY,
           bank: oracle.state.charsetBank, pen: oracle.state.pen,
           rvs: oracle.state.reverse })
    .toEqual({ x: wire.state.cursorX, y: wire.state.cursorY,
               bank: wire.state.charsetBank, pen: wire.state.pen,
               rvs: wire.state.reverse });
}
```

1. **"a `.seq` shown after a paged `.TXT` is encoded against the real cursor"**
   - `displayScreen` a `.TXT` long enough to paginate (its first page leaves
   through `startPagination`'s untapped emit, `screen.handler.ts:2800`), answer
   the `More(y/n/ns)?` prompt through `handlePaginatedScreenInput`, then
   `displayScreen` a `.seq` whose name is NOT in `SCREENS_REQUIRE_CLEAR`
   (`screen.handler.ts:349`) so no `$93` hides the drift. Assert
   `expectOracleMatchesWire`. **RED today**: `:2800` and `:2877` are outside
   every scope.
2. **"a `.seq` shown straight after a `.TXT` is encoded against the real
   cursor"** - `displayScreen` a short `.TXT` (the `ansi-output` arm,
   `:2305/:2332/:2346/:2487/:2607/:2626`), then the same `.seq`. **RED today**
   (research section 7, Level C "a `.TXT` DISPLAYED DIRECTLY before a `.seq`
   is not covered").
3. **"a door's output moves the oracle"** - emit a door frame the way
   `BBSApi.write` does (`this.socket.emit('ansi-output', text)`,
   `BBSApi.ts:166`) containing `\x1b[10;5H` and a colour, then the `.seq`.
   **RED today** (research section 6, item 1; blessed frames take this exact
   seam via `sdk/utils/blessed-helpers.ts:991-1006`).
4. **"a door's raw PETSCII moves the oracle"** - `writePetscii(Buffer)`
   (`BBSApi.ts:308`) with `[0x93, 0x8E, 0x11, 0x11]`, then the `.seq`. **RED
   today** (research section 6, item 3 - no server model observes it).
5. **"a `petscii-output` string moves the oracle"** - `writePetsciiLine`
   (`BBSApi.ts:322-324`), then the `.seq`. **RED today** (the tap ignores the
   event, `screen.handler.ts:1536-1547`).

**Verification.**
`cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/petscii/oracle-at-the-choke"`
**Success criteria.** All five FAIL, and each failure message shows a cursor /
bank / pen mismatch - not a crash, not a missing fixture. Record the five
failing diffs in the ledger (OC-9) as the RED evidence; GREEN arrives at OC-4.
Commit them `it.failing` ONLY if the suite gates CI before OC-4 lands; flip
back in OC-4.

---

## Task OC-2 - the ONE session terminal model

**New file** `web/backend/src/utils/petscii-session-model.ts`. It is a leaf
util: it imports the SDK transducer and nothing from `server/` or `handlers/`,
so `connection-emitter.ts`, `socket-handlers.ts`, `screen.handler.ts` and
`petscii-screen.render.ts` can all import it with no cycle.

```ts
/**
 * The ONE terminal model a PETSCII session has on the server.
 *
 * It is fed at the per-session transport CHOKE - the connection emitter for
 * telnet/SSH/WS-terminal (`server/connection-emitter.ts`), a
 * registration-time `socket.emit` wrapper for web (`server/socket-handlers.ts`)
 * - so the `.seq` render can encode and clip each substituted value against
 * the cursor the caller's terminal actually has, no matter what put the
 * terminal there: a menu, a door, a chat page from another node.
 *
 * Keyed on the SESSION, never on the socket: a connection can be handed a new
 * session mid-flight (a re-login, a node reassignment - see
 * `server/c64-door-adapter.ts:94-104`), and a web session survives a socket
 * replacement on reconnect. A new session object therefore starts with a
 * fresh model, which is the correct answer in both directions.
 */
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

/** The ONE predicate. Was duplicated in connection-emitter.ts and screen.handler.ts. */
export function sessionWantsPetscii(session: any): boolean {
  return !!session?.petsciiMode || session?.terminalType === 'c64';
}

/** The session's model, created on first use. */
export function petsciiTerminalModelFor(session: any): AnsiToPetsciiTransducer {
  if (!session.petsciiTransducer) session.petsciiTransducer = new AnsiToPetsciiTransducer();
  return session.petsciiTransducer;
}

/**
 * Bytes the PRODUCER already fed to the model, parked on the SESSION for the
 * duration of one synchronous emit.
 *
 * The `.seq` render has to consult the cursor WHILE it encodes, so by the time
 * its bytes reach the choke they are already in the model; observing them
 * again would double-feed it. Every OTHER `petscii-bytes` payload - a door's
 * `BBSApi.writePetscii(Buffer)` (`doors/BBSApi.ts:308`) - has never been fed,
 * and the choke is the only thing that will ever see it.
 *
 * On the SESSION and NOT on the socket: a door runs against a prototype proxy,
 * `Object.create(socket)` (`handlers/door.handler.ts:157`), so a mark written
 * through the proxy becomes a shadowed OWN property of the proxy while the
 * choke - which is the prototype's `emit` - reads the prototype and sees
 * nothing, and nothing ever clears it. The session is the one object both ends
 * already hold, and the mark's whole life is inside a single synchronous
 * `emit`, so a session key cannot collide with another session's payload.
 * (`handleC64Detected`'s second emitter, `server/c64-detected-handler.ts:36`,
 * is a second socket for the SAME session - another reason the session is the
 * right key.)
 */
const SELF_FED = Symbol('petsciiSelfFedPayload');

/** The ONE way rendered PETSCII reaches the wire. Marks, emits, unmarks. */
export function emitPetsciiBytes(socket: any, session: any, bytes: Buffer): void {
  const payload = bytes.toString('base64');
  session[SELF_FED] = payload;
  try {
    socket.emit('petscii-bytes', payload);
  } finally {
    // Cleared unconditionally: a wrapper above the choke that DROPS the event
    // would otherwise leave a stale mark that swallows a later identical
    // payload from a door.
    session[SELF_FED] = undefined;
  }
}

/** Choke side of `petscii-bytes`. Feeds exactly once. */
export function observePetsciiBytesAtChoke(session: any, payload: string): Buffer {
  const raw = Buffer.from(payload, 'base64');
  const model = petsciiTerminalModelFor(session);
  if (session[SELF_FED] === payload) {
    // Already fed by the render. Raw PETSCII reached the terminal without
    // passing `transduce`, so the ANSI deferred-wrap latch is stale and
    // nothing else is: `observe([])` clears exactly that and touches no cell
    // (`sdk/petscii/ansi-to-petscii.ts:180-183`).
    model.observe([]);
    return raw;
  }
  model.observe(raw);
  return raw;
}

/** Choke side of `ansi-output` / `petscii-output`. Returns the PETSCII bytes. */
export function transducePetsciiAtChoke(session: any, text: string): Uint8Array {
  return petsciiTerminalModelFor(session).transduce(text);
}

/** The input boundary: resolve a held bare CR into its $9D walk. Returns [] when there is no model. */
export function flushPetsciiModel(session: any): Uint8Array {
  const model = session?.petsciiTransducer;
  return model ? model.flush() : new Uint8Array(0);
}

/**
 * A session becomes PETSCII: from here on the model describes a fresh 40x25
 * screen, not whatever drained onto the wire while the caller was still being
 * classified. Used ONLY at the flip sites (OC-5). A RECONNECT does not call
 * this - it calls `disposePetsciiSessionModel`, because a `~SP`-paused `.seq`
 * parks `session.screenSegments` with a `petsciiCtx` holding this machine
 * (`handlers/screen.handler.ts:1779`) and homing the machine without dropping
 * those segments would resume the pause against a cursor they were never
 * encoded for.
 */
export function resetPetsciiModel(session: any): void {
  if (session?.petsciiTransducer) session.petsciiTransducer.reset();
}

/** Final teardown, with the parked segments that are only valid against this model. */
export function disposePetsciiSessionModel(session: any): void {
  session.petsciiTransducer = undefined;
  session.screenSegments = undefined;
}
```

**The installer's second argument is optional** (declared once here, used by
OC-3, OC-4's retargets, OC-7 and OC-8):
`installPetsciiModelChoke(socket: any, resolveSession: () => any = () => (socket as any).session)`.
The fallback is what every non-registration caller uses: the connection emitter
exposes a live `session` getter (`server/connection-emitter.ts:145-147`) and the
test mocks in `tests/petscii/*` carry a `session` property of their own, so
`installPetsciiModelChoke(socket)` is the whole call there. Only
`registerSocketHandlers` and the reconnect block pass an explicit resolver,
because a socket.io socket has no `session` property of its own.

**Edits (behaviour-free wiring; nothing reads the model differently yet).**

- `web/backend/src/server/connection-emitter.ts`
  - delete `isPetsciiSession` (`:23-25`) and the private `petsciiTransducerFor`
    (`:28-31`); import `sessionWantsPetscii`, `petsciiTerminalModelFor`,
    `observePetsciiBytesAtChoke`, `transducePetsciiAtChoke`,
    `flushPetsciiModel`.
  - `:104` -> `connection.write(Buffer.from(transducePetsciiAtChoke(session, data)))`
  - `:126` -> `connection.write(Buffer.from(transducePetsciiAtChoke(session, String(data))))`
  - `:130-141` -> `const raw = observePetsciiBytesAtChoke(session, data as string);`
    for the PETSCII branch, `Buffer.from(data as string, 'base64')` for the
    non-PETSCII `convertPetsciiToPetMe64` branch. `session` is the emitter's
    live getter (`:145-147`) - the same object `emitPetsciiBytes` marked.
  - `flushPendingPetscii` (`:61-71`) keeps its name, its doc comment and its
    call site (`index.ts:1144`); its body becomes
    `const bytes = flushPetsciiModel(connection.session); if (bytes.length > 0) connection.write(Buffer.from(bytes));`
- `web/backend/src/handlers/screen.handler.ts:1482-1484` - delete
  `sessionWantsRawPetscii`, import `sessionWantsPetscii` and rename its three
  uses: `:1524` (inside the tap, which OC-4 deletes), `:1833` and `:1903`.

**Nothing marks a payload yet**, so `observePetsciiBytesAtChoke` takes the
`observe(raw)` branch for every payload - byte-for-byte and model-for-model
what `:137` does today. `tests/server/connection-emitter-petscii.test.ts:89`
("petscii-bytes are forwarded raw AND observed") therefore stays green
**untouched**, which is the proof this step changed nothing.

**RED tests** (`web/backend/tests/utils/petscii-session-model.test.ts`):
1. "an ANSI session never gets a model" - `sessionWantsPetscii({})` false,
   `sessionWantsPetscii({ terminalType: 'modern' })` false;
   `sessionWantsPetscii({ petsciiMode: true })` and
   `{ terminalType: 'c64' }` true.
2. "the model is created once per session" -
   `petsciiTerminalModelFor(s) === petsciiTerminalModelFor(s)`.
3. "a new session object gets a fresh model" (**Q4**) - build `s1`, feed it
   `$93 $11 $11`, then `petsciiTerminalModelFor(s2) !== s1.petsciiTransducer`
   and `s2`'s cursor is `(0,0)`.
4. "rendered bytes are fed once, a door's raw bytes are fed once" - call
   `emitPetsciiBytes(socket, session, buf)` where the socket's `emit` calls
   `observePetsciiBytesAtChoke`; assert the model's cursor moved by ONE
   application of `buf`, not two. Then call `socket.emit('petscii-bytes', same)`
   with no mark and assert it moved again.
5. "a dropped emit does not poison the next payload" - a socket whose `emit`
   swallows the event; then an unmarked emit of the SAME base64 is observed for
   real.
6. **"a door's proxy socket cannot hide the mark"** (**I7**) - emit through
   `Object.create(socket)` the way `createDoorSocketWrapper`
   (`handlers/door.handler.ts:157`) hands a door its socket; the mark is still
   consumed and the model's cursor moves ONCE. **RED against a socket-keyed
   mark**, which is why the key is the session.

**A THIRD copy of the predicate exists** (**M1**): `index.ts:1195-1198`, spread
over four lines, gating `convertPetsciiInputToAscii` on the INPUT side. Fold it
into `sessionWantsPetscii` in the same edit - it is the identical condition and
the util is already imported by that file's neighbours. If it is left alone
instead, the exemption must be written at the call site and named here; do not
leave it undecided.

**Verification.**
`cd web/backend && npx tsc --noEmit` and
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/utils/petscii-session-model|tests/server/connection-emitter-petscii|tests/server/connection-emitter-petscii-flush|tests/petscii-frame/"`
(`connection-emitter-petscii-flush.test.ts` pins `flushPendingPetscii`, whose
body this task rewrites - **M3**.)
**Success criteria.** The predicate grep must be MULTILINE, because the third
copy spans four lines:
`grep -rzoE "petsciiMode[^;]{0,80}terminalType\s*===\s*[\"']c64|terminalType\s*===\s*[\"']c64[^;]{0,80}petsciiMode" --include=*.ts web/backend/src | tr '\0' '\n'`
returns exactly ONE hit, in `utils/petscii-session-model.ts` (or exactly two
with `index.ts:1195-1198` named in the written exemption). The
connection-emitter suites are green with zero edits. OC-1 is still RED.

---

## Task OC-3 - the web choke

**The installer lives in `web/backend/src/utils/petscii-session-model.ts`**
(added there, not in `socket-handlers.ts`) and takes a SESSION RESOLVER rather
than importing `getSession`: `server/session-manager.ts:1` imports
`../index`, and a util reaching back into `server/` for it would put a cycle
under a module every handler already imports. Both call sites pass their own
resolver. It is exported and idempotent so the reconnect path and the tests can
call the SAME function `registerSocketHandlers` calls - the idiom
`registerDisconnectHandler` already established
(`tests/petscii/render-ctx-disposal.test.ts:31,93`).

**Edit `web/backend/src/server/socket-handlers.ts`** to call it immediately
after the session-log wrapper (`:176-183`).

```ts
/**
 * Marks the SOCKET, not the emit function.
 *
 * A function-keyed marker is lost the moment anything replaces `socket.emit`
 * with an unmarked wrapper - which the modem emulator does unconditionally
 * (`utils/modem-emulator.util.ts:276`). The reconnect block below runs right
 * beside `getModemEmulator(socket).install()`, so a function-keyed guard would
 * let a SECOND choke be installed on top of the modem wrapper and every
 * `ansi-output` would be transduced TWICE. The three wrappers already in this
 * codebase all key their marker on the socket - `_modemEmulatorInstalled`
 * (`utils/modem-emulator.util.ts:267,291`), `_ansiFilterInstalled`
 * (`services/login-post.service.ts:85,99`), `__ansiTapInstalled`
 * (`server/socket-handlers.ts:139-140`) - and this follows them.
 */
const PETSCII_MODEL_CHOKE = Symbol('petsciiModelChoke');

/**
 * The web transport's model choke.
 *
 * Web does NO server-side PETSCII conversion - the browser converts
 * (`packages/terminal/src/components/BBSTerminal.tsx`) - so this wrapper
 * changes not one byte on the wire. It exists only so the server carries the
 * same terminal model a telnet C64 gets for free from the connection emitter,
 * because the `.seq` render encodes every substituted value against it.
 *
 * Installed at REGISTRATION, before login and before any door, so the door
 * teardown pins (`tests/doors/door-min-columns-gate.test.ts:393,421`) - which
 * capture `socket.emit` on their own fresh mock and require it back exactly -
 * never see it; those tests never run `registerSocketHandlers`.
 *
 * Registration installs it LAST, so among the registration-time wrappers it is
 * the OUTERMOST and sees everything the session log sees. Everything installed
 * later - the ANSI filter (`services/login-post.service.ts:139`), the modem
 * emulator (`:149`), a door adapter (`server/c64-door-adapter.ts:293`) - wraps
 * ABOVE it and calls DOWN into it, which is why their output still reaches the
 * model.
 *
 * The session is resolved AT EMIT TIME, not captured: a reconnecting browser
 * gets a new socket.io socket which runs this registrar with a throwaway
 * session, and `auth-socket-handlers.ts` swaps the restored session in
 * afterwards (`setSession(socket.id, existingSession)`, `:161`).
 */
export function installPetsciiModelChoke(
  socket: any,
  resolveSession: () => any = () => (socket as any).session,
): void {
  if (!socket || typeof socket.emit !== 'function') return;
  if ((socket as any)[PETSCII_MODEL_CHOKE]) return;   // SOCKET-keyed, not function-keyed
  const downstream = socket.emit.bind(socket);
  const choked = function (event: string, ...args: any[]): any {
    const session = resolveSession();
    if (session && sessionWantsPetscii(session)) {
      if ((event === 'ansi-output' || event === 'petscii-output') && typeof args[0] === 'string') {
        transducePetsciiAtChoke(session, args[0]);
      } else if (event === 'petscii-bytes' && typeof args[0] === 'string') {
        observePetsciiBytesAtChoke(session, args[0]);
      }
    }
    return downstream(event, ...args);
  };
  socket.emit = choked as any;
  (socket as any)[PETSCII_MODEL_CHOKE] = true;
}
```

called at `socket-handlers.ts:184` (the line after the session-log wrapper):

```ts
  // The session's PETSCII terminal model. Inert for an ANSI session: one
  // property read per emit and the arguments are passed through untouched.
  installPetsciiModelChoke(socket, () => getSession(socket.id));
```

**Reconnect (Q6).** In `web/backend/src/server/auth-socket-handlers.ts`, in
the `session-restore` branch, **immediately after `setSession(socket.id,
existingSession)` (`:161`) and BEFORE `getModemEmulator(socket).install()`
(`:178-180`)** - the modem replaces `socket.emit` with a wrapper of its own, so
the choke must already be underneath it, and the socket-keyed marker then makes
this call a no-op on the socket its own registration already wrapped:

```ts
        // Belt to registration's brace: the ONE place a restored session could
        // otherwise land on an unwrapped socket. Socket-keyed, so it is a
        // no-op when registration already installed one.
        installPetsciiModelChoke(socket, () => getSessionBySocketId(socket.id));
        // The browser rebuilt its canvas and its own transducer from scratch
        // (BBSTerminal.tsx clearPetsciiSession/ensurePetsciiSession), so a
        // model still describing the pre-disconnect screen would encode the
        // first post-reconnect `.seq` value against a screen nobody has.
        // DISPOSE, not reset: a `~SP`-paused `.seq` parks its remaining
        // segments on `session.screenSegments` TOGETHER with a `petsciiCtx`
        // holding this very machine (`handlers/screen.handler.ts:1767-1782`,
        // `petsciiCtx: ctx` at `:1779`). Homing the machine while those
        // segments stay parked would resume the pause against a cursor the
        // segments were never encoded for. Disposal drops both; the model is
        // recreated on next use.
        disposePetsciiSessionModel(existingSession);
```

**Q6, restated against the tree (I1).** `session.socket` is assigned in exactly
one place, `socket-handlers.ts:171`, and the restore does NOT reassign it - it
updates `existingSession.socketId` and `setSession(socket.id, existingSession)`
(`:160-161`). So after a reconnect `session.socket` is the DEAD socket. This
plan does not change that and must not rely on it: the wrapper is on the LIVE
socket, resolved the way the cross-session pushes already resolve it -
`io.sockets.sockets.get(session.socketId)`
(`handlers/chat/chat.handler.ts:86-95`, the lookup at `:91`). Every live socket
carries the choke because every live socket ran `registerSocketHandlers`
(`index.ts:1651` for the normal web path).

**The dead socket's choke (M4).** It stays armed for the 3 s reconnect grace,
because `getSession(oldSocketId)` still resolves until
`finalizeDisconnectCleanup` deletes the record
(`socket-handlers.ts:982-991`, `:1076`). Nothing addresses it: socket.io drops
emits on a disconnected socket, and every server-side push resolves the live
socket by `session.socketId`, which the restore updated at `:160`. No code, one
recorded rule-out.

**Flush at input arrival (Q5).** `socket-handlers.ts:570`, first statement of
`socket.on('command')` after the session lookup (`:574-578`), mirroring
`index.ts:1144`:

```ts
    // Output stops, input begins - the same boundary index.ts:1144 uses for
    // telnet. A trailing bare CR held in the model resolves into its $9D walk
    // here, so the model matches what the browser's own transducer did before
    // it sent this key (BBSTerminal.tsx flushes on the same edge).
    flushPetsciiModel(session);
```

Nothing is written to the wire: on web the model's flush output is a MODEL
event only (the browser produced the real bytes itself). This is the one place
web and telnet differ, and it is why `flushPendingPetscii` stays a separate
telnet-only function that writes.

**Decision (recorded, not left open).** `door:input` (`socket-handlers.ts:363`)
gets no flush: `grep -rn "door:input" packages/terminal/src web/frontend/src`
returns only `door:input-mode` (`BBSTerminal.tsx:2189`) - no client emits
`door:input`, and the handler returns early for an active door anyway
(`:369-371`). `key-down`/`key-up` (`:501`, `:537`) are game mode, where no
`.seq` renders. One flush site, like telnet.

**RED tests** (`web/backend/tests/server/petscii-model-choke.test.ts`):
1. **"a web PETSCII session's menu text moves the server's model"** - build a
   socket.io-shaped mock, `installPetsciiModelChoke(socket, () => getSession(socket.id))`,
   set the session PETSCII via `setSession`,
   `socket.emit('ansi-output', 'HI\x1b[5;3H')`; assert
   `petsciiTerminalModelFor(session).machine.state` matches `wireMirror`.
   **Reachability sentinel:** a `jest.spyOn(AnsiToPetsciiTransducer.prototype,
   'transduce')` installed BEFORE the emit records exactly 1 call (a spy on the
   module function `petsciiTerminalModelFor` would record zero either way -
   ts-jest binds intra-module calls locally; see I4 in OC-7).
2. **"an ANSI session's bytes and emit are untouched"** - non-PETSCII session:
   the downstream spy receives the identical argument instance
   (`toBe`, not `toEqual`), the return value is the downstream's, and
   `session.petsciiTransducer` is still `undefined`.
3. **"a modem re-install does not get a second choke"** (**B1**) - the
   sequence the reconnect path actually produces:
   `installPetsciiModelChoke(socket, resolver)`, then
   `getModemEmulator(socket).install()` (which replaces `socket.emit` with an
   unmarked wrapper, `utils/modem-emulator.util.ts:276`), then
   `installPetsciiModelChoke(socket, resolver)` again. Emit ONE `ansi-output`
   and assert `AnsiToPetsciiTransducer.prototype.transduce` was called exactly
   ONCE. **RED against a function-keyed marker** - it fires twice there, which
   is the whole reason the marker is on the socket. (Installing back to back
   with nothing in between is green either way and proves nothing.)
4. **"a reconnected session's model starts clean"** (**Q6**, **I1**, **I2**) -
   drive the real `registerSocketHandlers` -> `registerAuthHandlers`
   `session-restore` handler on a NEW socket with a restored PETSCII session
   whose model is at row 12 and whose `screenSegments` are parked with a
   `petsciiCtx`. Assert (a) `existingSession.petsciiTransducer` is `undefined`
   and `screenSegments` is `undefined` after the restore, (b) the next paint
   builds a model whose cursor is `(0,0)`, and (c) an `ansi-output` emitted
   through **`io.sockets.sockets.get(existingSession.socketId)`** - the live
   socket, resolved the way `handlers/chat/chat.handler.ts:91` resolves it, NOT
   `session.socket`, which the restore never reassigns - moves that model.
5. **"a keystroke resolves a held carriage return"** (**Q5**) - emit
   `'ready\r'`, assert the model still holds it, fire the real `command`
   handler with `'A'`, assert the model's cursor moved to column 0 of the same
   row (the `carriageOnly` walk, `ansi-to-petscii.ts:326`).

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests` and
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/server/|tests/utils/petscii-session-model"`
**Success criteria.** Tests 1-5 green; OC-1 still RED (the render still keeps
its own transducer); OC-7's identity suite green.

---

## Task OC-4 - the render reads the model; the taps die

This is the flip, and it is ONE commit: the render cannot stop keeping its own
transducer without the chokes already feeding the session model, and the chokes
cannot stop double-feeding without the render marking its payloads.

**Edit `web/backend/src/handlers/petscii-screen.render.ts`.**

```ts
// :95 - DELETE `type PetsciiRenderSession`
// :142-167 - the accessor becomes a one-liner onto the ONE model
/**
 * The session's bank / cursor / pen oracle - the machine of the SAME model
 * the transports feed.
 *
 * A PETSCII terminal receives both flavours and both reach it through a
 * choke: `ansi-output`/`petscii-output` are transduced there
 * (`server/connection-emitter.ts` for telnet/SSH, the registration-time
 * wrapper in `server/socket-handlers.ts` for web), and every `petscii-bytes`
 * payload is either observed there or, when this render produced it, fed here
 * as it was encoded and marked so the choke does not feed it twice
 * (`utils/petscii-session-model.ts`).
 */
export function petsciiMachineFor(session: BBSSession): PetsciiMachine {
  return petsciiTerminalModelFor(session).machine;
}
// The sibling accessor `petsciiTransducerFor(session)` - a second one-liner
// onto `petsciiTerminalModelFor` - was kept by OC-4 and found CALLERLESS by
// the OC-4 review: once the render stopped owning a transducer, nothing in
// `src` or `tests` asked this module for one. OC-9 DELETES it, together with
// the `AnsiToPetsciiTransducer` VALUE import it was the sole consumer of.
// `petsciiMachineFor` stays - it has callers.
// :231-234 - DELETE disposePetsciiRenderCtx (its transducer ownership is the
// dead part; `screenSegments` teardown moves to disposePetsciiSessionModel)
```

**Edit `web/backend/src/server/socket-handlers.ts:40,1240`** - import and call
`disposePetsciiSessionModel(session)` in place of `disposePetsciiRenderCtx`,
keeping the comment (updated: it is now the ONE model, and the parked
`screenSegments` are only valid against it).

**Decision (recorded).** No dispose call is added at telnet's `close`
(`index.ts:1316-1330`): the session record is deleted from `sessions` there and
the model is collected with it, exactly as `session.petsciiTransducer` is
today. Q4's reassignment case is covered by keying on the session, pinned in
OC-2 test 3.

**Edit `web/backend/src/handlers/screen.handler.ts`.**

- `emitPetsciiChunk` (`:1615-1642`) and `emitRawPetscii` (`:1650-1653`) each
  take `session: BBSSession` as a new parameter - the mark is SESSION-keyed
  (OC-2, I7) and both need it. `session` is already in scope at every one of
  their call sites. Count corrected at OC-9 against the landed commit
  (`211810e7d`) and re-verified at HEAD: **EIGHT** sites take `session`, not
  nine - `emitPetsciiChunk` at `:1604`, `:1606`, `:1609` (inside
  `renderPetsciiWalk`, whose second parameter it is) and `:1826` (inside
  `displayScreen`'s `$93` clear); `emitRawPetscii` at `:1663`, `:1671`
  (`renderPetsciiWalk`) and `:1764` (`emitPetsciiScreenInline`); plus the one
  DIRECT `emitPetsciiBytes(socket, session, rendered)` at `:1757`. The plan's
  original list named seven anchors under the word "nine" and both numbers
  were wrong. Mechanical, no logic moves.
- `:1640` -> `emitPetsciiBytes(socket, session, bytes);`
- `:1652` -> `machine.feed(buffer); emitPetsciiBytes(socket, session, buffer);`
- `:1842` -> `emitPetsciiBytes(socket, session, rendered);`
- `:1487` DELETE `PETSCII_ORACLE_TAP`; `:1489-1559` DELETE
  `installPetsciiOracleTap`; `:1561-1569` DELETE `withPetsciiOracleTap`.
- `:441` DELETE the tap install; `:450` **KEEP `flushOutput(socket)`** - it is
  wire ordering, not model plumbing, and removing it would reorder an
  include's bytes against the chunks encoded after it. Its comment loses the
  oracle half and keeps the ordering half.
- `:2825-2827`, `:2837-2839`, `:3018-3020`, `:3123-3125` - unwrap the four
  `withPetsciiOracleTap(socket, session, () => ...)` calls back to the bare
  `socket.emit(...)` / `emitPrompt(...)` they wrap. Byte-identical.

**Edit `web/backend/src/doors/BBSApi.ts`** - none. `writePetscii(Buffer)`
(`:308`) stays an unmarked emit, which is exactly right: the choke observes it
for real and the model finally sees a door's raw PETSCII (research section 6,
item 3).

**Retargeted tests** (they must keep proving oracle == terminal through the
REAL path, now via the choke):

- `tests/petscii/seq-pause-and-colour.test.ts` - the mock socket at `:64-69`
  gains `installPetsciiModelChoke(socket)` (or, for a telnet-shaped case, the
  real `buildConnectionEmitter`) before `displayScreen`. `wireMirror`
  (`:105-119`) is unchanged, and it already transduces `petscii-output`, which
  the model now sees too - so the mirror gets STRICTER, not looser.
- `tests/petscii/seq-structural-tokens.test.ts` - same socket change; the
  "an ANSI .TXT include still reaches the oracle" test now passes through the
  choke instead of the include's scoped tap, and gets a second assertion: an
  `ansi-output` emitted OUTSIDE `displayIncludedScreen` also moves the oracle.
- `tests/petscii/render-ctx-disposal.test.ts` - `petsciiRenderTransducer` ->
  `petsciiTransducer` (`:78`, `:99`), `disposePetsciiRenderCtx` ->
  `disposePetsciiSessionModel` (`:10`, `:18` in the header prose); the
  assertions (`toBeInstanceOf(AnsiToPetsciiTransducer)` before,
  `toBeUndefined()` after, `screenSegments` cleared) are unchanged.
- `tests/petscii/oracle-at-the-choke.test.ts` (OC-1) - **all five go GREEN**,
  with the choke installed on the socket the way registration installs it
  (`installPetsciiModelChoke(socket)`, using OC-2's default resolver, since the
  test's socket mock carries its own `session`).

**`disposePetsciiRenderCtx` is imported by SIX MORE test files (B3)** - grep,
not guesswork; every one swaps the import and the call site to
`disposePetsciiSessionModel`, assertions unchanged. `petsciiRenderCtxFor`
SURVIVES and is untouched wherever it appears beside it:

| file | lines |
|---|---|
| `tests/petscii/seq-mci.test.ts` | `:281` (import), `:317`, `:526`, `:539`, `:551`, `:593` |
| `tests/petscii/seq-structural-tokens.test.ts` | `:33` (import), `:145`, `:163`, `:193`, `:213`, `:252`, `:273`, `:288` |
| `tests/petscii/seq-mci-wiring.test.ts` | `:42` (import), `:229` |
| `tests/petscii/seq-clear-divergence.test.ts` | `:37` (import, beside the surviving `petsciiRenderCtxFor`), `:90` |
| `tests/petscii/logoff-seq-data.test.ts` | `:50` (import), `:224` |
| `tests/handlers/mci-tc-five-digits.test.ts` | `:42` (import), `:127` |

The rename is a compile error if one is missed, which is why
`npm run typecheck:tests` is the first verification step below and not the
last.

**Verification.**
`cd web/backend && npx tsc --noEmit && npm run typecheck:tests` then
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/petscii/|tests/petscii-frame/|mci|screen-inline-sentinels|screen-handler|screen-loader|petscii-wipe-off|socket-handlers|connection-emitter"`
then the FULL suite (`npm test`) - the fix-wave regression was found only by
the full suite, never by a pattern.
**Success criteria.** OC-1's five tests are GREEN and their RED diffs are in
the ledger. `grep -rn "PetsciiOracleTap\|petsciiRenderTransducer\|disposePetsciiRenderCtx" web/backend/src web/backend/tests`
returns NOTHING. `grep -rn "emit('petscii-bytes'" web/backend/src --include=*.ts`
returns exactly TWO hits: `utils/petscii-session-model.ts` and
`doors/BBSApi.ts:308`. Full-suite failure list is identical to the fix-wave
report's known-flaky set (`bbs-config-round-trip`, `card-lobby-typechecks`,
the API-route suites under parallel load) and nothing else.

---

## Task OC-5 - the model is reset where a session becomes PETSCII

**Why it is needed, stated against what production actually orders (I3).**
The naive story - "the connect screen and graphics prompt are transduced into
the model after the DEL-probe stamps `c64`" - is WRONG, and a test built on it
would stage an order production never produces. The stamp at
`index.ts:1187` is gated at `:1178-1185` on a pre-login state with
`terminalType` absent or
`'unknown'`, and both of those screens were emitted on a PREVIOUS dispatch
while it still was (`command.handler.ts:1424` / `:1431`); the dispatch that
follows the stamp takes the c64 branch at `:1404` or `:1445` with no emit in
between. `completeRealC64Connect`'s own comment says exactly this
(`command.handler.ts:1048-1059`: "the transducer never saw any of it").

Two windows are genuinely reachable, and they are what the reset is for:

- **(a) output that drains AFTER the stamp.** `emitText` leaves on a 16 ms
  `AnsiBuffer` timer (`utils/ansi-buffer.util.ts:80-82`), and the graphics
  prompt can be deferred behind `session.pendingScreenCommand`
  (`command.handler.ts:1420-1429`), whose `.then` emits at `:1424` whenever it
  resolves. Either can land on the wire after `terminalType` is already
  `'c64'`, i.e. with `sessionWantsPetscii` TRUE, and be transduced into the
  model as if it were C64 screen content.
- **(b) the web `P` answer** (`pre-login.ts:143`). Before it,
  `sessionWantsPetscii` is false and the model does not exist; the reset there
  DEFINES the origin from which everything after is legitimately modelled -
  the `terminal-resize` at `:149`, the SIMULATING banner at
  `command.handler.ts:1505`, and the first screen.

Reset at the flip closes (a) and fixes the origin for (b).

Four live sites + one dead one, each getting `resetPetsciiModel(session)` as
the LAST statement of the PETSCII branch, before any emit:

| site | file:line | note |
|---|---|---|
| TTYPE / DEL-probe / dedicated PETSCII port | `web/backend/src/server/telnet-server.ts:739-747` | after `subState = DISPLAY_BBSTITLE` (`:744`), before `this.emit('c64-detected', connection)` (`:747`) |
| live DISPLAY_CONNECT c64 branch | `web/backend/src/handlers/command.handler.ts:1404-1410` | before `completeRealC64Connect` (`:1410`), whose `ESC[2J ESC[H` resync (`:1060`) then transduces on top - idempotent |
| ANSI_PROMPT after a DEL-probe | `web/backend/src/handlers/command.handler.ts:1445-1453` | after `session.ansiEnabled = false` (`:1452`), before `completeRealC64Connect` (`:1453`) |
| web/SSH `P` at the graphics prompt | `web/backend/src/handlers/command-handler/pre-login.ts:141-149` | after `screenHeight = 25` (`:147`), before `socket.emit('terminal-resize', ...)` (`:149`) |
| `handlePreLoginInput` c64 branch | `web/backend/src/handlers/command-handler/pre-login.ts:54-59` | DEAD per `command.handler.ts:1398-1403`; reset anyway so the two branches cannot drift |

**No wire change.** On telnet the model is created lazily at the first PETSCII
emit, which happens at or after the flip, so `reset()` is a no-op there today;
its value is the DEL-probe window above and the web path, where the model
already exists.

**RED tests** (`web/backend/tests/petscii/model-reset-at-flip.test.ts`):
1. **"a prompt that drains after the C64 is detected does not describe the
   C64's screen"** (window (a)) - arm an `emitText` chunk that positions the
   cursor at row 12 and leave it in the 16 ms `AnsiBuffer`
   (`utils/ansi-buffer.util.ts:80-82`); stamp `terminalType = 'c64'` the way
   `index.ts:1187` does; let the buffer drain (advance timers) so the choke
   transduces it with `sessionWantsPetscii` already TRUE; then drive the real
   `handleCommand` c64 branch. Assert `cursorY === 0`, `charsetBank === 0`,
   `pen === 14` at the flip, before BBSTITLE paints. **RED today** - the model
   carries row 12 into the first `.seq`.
2. **"a web caller who answers P starts at home"** (window (b)) - drive the
   real graphics prompt with `'P'` through `handleCommand` on a session whose
   model was already built and moved; it is at `(0,0)` afterwards, and the
   SIMULATING banner (`command.handler.ts:1505`) is the first thing it models.
3. **"the reset is at the flip, not at the first `.seq`"** - sentinel: spy on
   `AnsiToPetsciiTransducer.prototype.reset` and assert exactly one call, made
   before the first `petscii-bytes` emit.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/petscii/model-reset-at-flip|tests/server/telnet-server|tests/server/petscii-session-geometry|tests/handlers/"`
**Success criteria.** Three tests green; `grep -n resetPetsciiModel web/backend/src` shows exactly the five sites above.

---

## Task OC-6 - a restorer puts back what it found (Q3)

Three sites restore a BOUND COPY unconditionally, so after them `socket.emit`
is a function that is no longer `===` to what was there, and any wrapper
installed during the call is silently dropped. Two of them also skip the
restore entirely when the handler throws.

The grep that bounds the pattern class (run it; paste the output in the
ledger):

```
grep -rn "\.emit\.bind(" --include="*.ts" web/backend/src
grep -rnE "\.emit = [A-Za-z_$][A-Za-z0-9_$.]*;" --include="*.ts" web/backend/src
```

Measured 2026-09-02 (re-run at review, HEAD `23851e820`): TEN `bind` sites,
seven assignment sites. Classified (the table below covers all ten):

| site | verdict |
|---|---|
| `doors/BBSApi.ts:1223` install / `:1237` restore (`joinRoom`) | **BROKEN** - bound copy, and the restore is inside the `try` whose `catch` at `:1250-1253` swallows |
| `doors/BBSApi.ts:1292` / `:1309` (`createRoom`) | **BROKEN** - same, `catch` at `:1316-1319` |
| `handlers/door.handler.ts:97` / `:152` (`createDoorSocketWrapper`, telnet branch) | **BROKEN** - `cleanupOutgoing` assigns the bound `rawEmit` |
| `server/c64-door-adapter.ts:260,293,333-344` | correct - `adapter.original = hadOwnEmit ? socket.emit : null` (`:272`) is the VALUE found, and `restoreEmit` refuses to restore over a later wrapper (`:337`) before restoring at `:339` |
| `server/socket-handlers.ts:144`, `:176`, new choke | permanent by design, never restored |
| `services/login-post.service.ts:86`, `utils/modem-emulator.util.ts:28` | permanent by design |
| `handlers/screen.handler.ts:2294`, `:2564` | reads, not restores |

**Fix, applied identically at all three** (the adapter's own rule, which is the
survivor pattern - do not invent a fourth):

```ts
      const hadOwnEmit = Object.prototype.hasOwnProperty.call(this.socket, 'emit');
      const found = this.socket.emit;                       // the VALUE, not a bound copy
      const downstream = found.bind(this.socket);
      const interceptor = ((event: string, ...args: any[]) => {
        if (event === 'room:joined') response = args[0];
        return downstream(event, ...args);
      }) as any;
      this.socket.emit = interceptor;
      try {
        await handleRoomJoin(this.socket, this.session, { roomName, password });
      } finally {
        // Put back exactly what was here - and only if ours is still the live
        // one, so a wrapper installed during the handler is not torn off.
        if (this.socket.emit === interceptor) {
          if (hadOwnEmit) this.socket.emit = found;
          else delete this.socket.emit;
        }
      }
```

(`door.handler.ts:151-153` takes the same shape inside `cleanupOutgoing`,
comparing against the wrapper it assigned at `:146-150`.)

**RED tests** (`web/backend/tests/doors/emit-restorer-identity.test.ts`), one
per site, each named after the symptom:
1. "joinRoom leaves the socket's emit exactly as it found it" - prototype-backed
   socket (the shape `tests/petscii-frame/c64-door-adapter.test.ts:264-273`
   uses): after `joinRoom`, `socket.emit` is `toBe` the prototype method and
   `hasOwnProperty('emit')` is false. **RED today** (an own bound copy is left).
2. "joinRoom restores after the handler throws" - `handleRoomJoin` rejects;
   `emit` identity restored. **RED today.**
3. + 4. the same two for `createRoom`.
5. "a door wrapper on a telnet emitter restores the emitter's own emit" -
   `createDoorSocketWrapper` on a `buildConnectionEmitter` object (which has no
   `onAnyOutgoing`, so it takes the `:146-150` branch), then `cleanupOutgoing`;
   `emit` is `toBe` the emitter literal's own function. **RED today.**
6. "a wrapper installed during the call survives" - install a marker wrapper
   from inside the stubbed handler; after the restore the marker is still live.
   **RED today** at all three sites.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/doors/emit-restorer-identity|tests/doors/door-min-columns|tests/petscii-frame/c64-door-adapter|tests/utils/modem-emulator"`
**Success criteria.** Six tests green; the four existing `emit`-identity pins
(`door-min-columns-gate.test.ts:393,421,426,431,497,501`,
`door-min-columns-dispatch.test.ts:329,343,348,361,543,558,569,589`,
`c64-door-adapter.test.ts:190,199,206,219,244,273,300,307,362,375,393,399`,
`modem-emulator.util.test.ts:321,326`) green with ZERO edits.

---

## Task OC-7 - the 80-column identity guard

**Every ANSI session pins byte-identical output before and after.** This task
owns the guard and is re-run as a gate at the end of OC-3, OC-4, OC-5 and
OC-6; a red here stops the plan.

**Must stay green with NO edits** (their presence unedited is the pin):

- `web/backend/tests/petscii-frame/c64-door-adapter-identity.test.ts` - runs
  the same door output through the REAL `buildConnectionEmitter` twice and
  compares the wire; its third case (a PETSCII session MUST differ) is what
  keeps the first two from passing vacuously.
- `web/backend/tests/doors/door-min-columns-gate.test.ts` (`:426-431` is the
  explicit 80-column session case).
- `web/backend/tests/doors/door-min-columns-dispatch.test.ts`.
- `web/backend/tests/forty-col-sweep.test.ts` - the 40-column sweep, whose
  every case also asserts the 80-column branch is untouched.
- `web/backend/tests/utils/emit-text-wrap.test.ts` - `wrapForSession` is
  identity at >= 80 columns.
- `web/backend/tests/server/connection-emitter-petscii.test.ts`.

**New test** `web/backend/tests/server/eighty-col-choke-identity.test.ts`:

1. **"an 80-column web session's emits are the same objects, in the same
   order"** - record `(event, args)` tuples through a spy installed BELOW
   `installPetsciiModelChoke`, drive a menu paint + a paginated `.TXT` + a
   door frame; assert each `args[0]` is `toBe` (identity, not equality) the
   string the producer passed, the event order is unchanged, and each call's
   return value is the downstream's.
2. **"an 80-column session never builds a model"** -
   `session.petsciiTransducer` is `undefined` after the whole walk.
3. **"an 80-column telnet session's bytes are unchanged"** (**M5**) - the same
   walk through the real `buildConnectionEmitter` with
   `terminalType: 'modern'`; `Buffer.concat(written)` equals a baseline the
   test BUILDS from its own raw input - `data.replace(/\r?\n/g, '\r\n')`, the
   non-PETSCII branch at `connection-emitter.ts:117` - not a stored fixture and
   not a capture from another branch, so the pin cannot rot.
4. **"the choke costs an ANSI session no model at all"** (**I4**) - a
   `jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce')` and one on
   `.observe` record ZERO calls across the whole 80-column walk. **Not** a spy
   on `petsciiTerminalModelFor`: ts-jest binds intra-module calls locally, so a
   module-export spy records zero whether the code path runs or not - it would
   pass on a broken build. Test 2's `session.petsciiTransducer === undefined`
   stays as the never-builds-a-model half of the proof.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="eighty-col-choke-identity|c64-door-adapter-identity|door-min-columns|forty-col-sweep|emit-text-wrap|connection-emitter-petscii"`
**Success criteria.** All green, and `git diff --stat` shows no change to any
of the six files listed above.

---

## Task OC-8 - a 68K door's XIM bytes, stated and pinned

**What happens.** A 68K door writes through XIM
(`amiga-emulation/XIMProtocol.ts:1526-1661`,
`amiga-emulation/xim/system-commands.ts:609-677,1525-1545,1759-1761`,
`amiga-emulation/LibraryManager.ts:592,601`,
`amiga-emulation/AmigaDoorSession.ts:780,808`), all of it as `ansi-output`. On
a 40-column PETSCII session with an adapted door, `installC64DoorAdapter`
(`door.handler.ts:3052-3055`) wraps `socket.emit`
(`c64-door-adapter.ts:293`); the adapter reconstructs the door's 80-column
frame and **re-emits it as 40-column `ansi-output`**
(`c64-door-adapter.ts:201`, `this.downstream('ansi-output', ansi)`), where
`downstream` is the emit captured at install (`:260`) - which is the choke,
because the choke was installed at registration and the adapter wraps ABOVE it
and calls down into it. So the model sees
the door's frames **as the caller sees them: 40 columns, adapter-reduced**, not
the door's 80-column originals. That is the correct model, and it needs no new
code.

Non-adapted doors and every ANSI door pass straight to the choke unwrapped
(`installC64DoorAdapter` returns null without touching `socket.emit`,
`:253`).

**RED test** `web/backend/tests/petscii/model-sees-door-frames.test.ts`:

1. **"a 68K door's frames move the oracle, reduced to 40 columns"** - install
   the choke, install the adapter on a PETSCII session, push a >40-column
   frame with absolute cursor addressing through the adapter's patched `emit`,
   flush it, then assert `petsciiMachineFor(session)` equals `wireMirror` over
   the `ansi-output` the adapter actually emitted (not the input), and that
   `cursorX < 40`.
2. **"the door's own 80-column bytes never reach the model"** - sentinel: a
   counting proxy on `transduce` sees exactly the adapter's frames, and no
   argument to it is longer than the adapter's 40-column row.
3. **"an unadapted door still reaches the model"** - no adapter installed; a
   `BBSApi.write` frame moves the oracle (this is OC-1 test 3 re-driven through
   the real `executeDoor` path with a stub TypeScript door, which is the
   top-level entry point).
4. **"after the door, the oracle is where the terminal is"** - run the adapter
   through `uninstallC64DoorAdapter` (`door.handler.ts:3127`), then display a
   `.seq` with no clear; `expectOracleMatchesWire`.

**Verification.**
`npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="model-sees-door-frames|petscii-frame/|tests/xim/"`
**Success criteria.** Four tests green; the `tests/xim/` suites
(`petscii-door-linewrap`, `door-screen-width`,
`absolute-paint-is-never-wrapped`) green with no edits.

---

## Task OC-9 - what is DELETED

A task, not a footnote: the plan is not done while any of these still exist.

| deleted | file:line (pre-change) | replaced by |
|---|---|---|
| `installPetsciiOracleTap` | `screen.handler.ts:1489-1559` | the two chokes |
| `withPetsciiOracleTap` | `screen.handler.ts:1561-1569` | - |
| `PETSCII_ORACLE_TAP` symbol | `screen.handler.ts:1487` | - |
| tap call site (pagination erase-line) | `screen.handler.ts:2825-2827` | bare `socket.emit` |
| tap call site (page + More prompt) | `screen.handler.ts:2837-2839` | bare `socket.emit` |
| tap call site (`~SP` resume prompt) | `screen.handler.ts:3018-3020` | bare `emitPrompt` |
| tap call site (`doPause` prompt) | `screen.handler.ts:3123-3125` | bare `emitPrompt` |
| tap install in `displayIncludedScreen` | `screen.handler.ts:441` (+ `uninstallTap()` in the `finally`) | the choke; **`flushOutput(socket)` at `:450` STAYS** |
| `sessionWantsRawPetscii` | `screen.handler.ts:1482-1484` | `sessionWantsPetscii` |
| `isPetsciiSession` | `connection-emitter.ts:23-25` | `sessionWantsPetscii` |
| private `petsciiTransducerFor` | `connection-emitter.ts:28-31` | `petsciiTerminalModelFor` |
| `type PetsciiRenderSession` | `petscii-screen.render.ts:95` | - |
| `petsciiTransducerFor` (the render's EXPORT, and the `AnsiToPetsciiTransducer` value import it was the sole consumer of) | `petscii-screen.render.ts:153` post-OC-4 | `petsciiMachineFor`, which is the only accessor with callers |
| `session.petsciiRenderTransducer` (the field, everywhere) | `petscii-screen.render.ts:162-166`, `tests/petscii/render-ctx-disposal.test.ts:78,99` | `session.petsciiTransducer` |
| `disposePetsciiRenderCtx` | `petscii-screen.render.ts:231-234`, imported `socket-handlers.ts:40`, called `:1240`, and SEVEN test files: `tests/petscii/seq-mci.test.ts:281,317,526,539,551,593`; `seq-structural-tokens.test.ts:33,145,163,193,213,252,273,288`; `seq-mci-wiring.test.ts:42,229`; `seq-clear-divergence.test.ts:37,90`; `logoff-seq-data.test.ts:50,224`; `render-ctx-disposal.test.ts:10,18`; `tests/handlers/mci-tc-five-digits.test.ts:42,127` | `disposePetsciiSessionModel` |
| three open-coded `petscii-bytes` emits | `screen.handler.ts:1640,1652,1842` | `emitPetsciiBytes` |

**Verification (all must return nothing):**

```
grep -rn "PetsciiOracleTap\|withPetsciiOracleTap\|PETSCII_ORACLE_TAP" web/backend
grep -rn "petsciiRenderTransducer\|disposePetsciiRenderCtx" web/backend
grep -rn "sessionWantsRawPetscii\|isPetsciiSession" web/backend/src
grep -rn "PetsciiRenderSession\|petsciiTransducerFor" web/backend/src web/backend/tests
```

and exactly two hits for
`grep -rn "emit('petscii-bytes'" web/backend/src --include=*.ts`
(`utils/petscii-session-model.ts`, `doors/BBSApi.ts:308`).

Run each over `web/backend/src` AND `web/backend/tests` with
`--include='*.ts'`. Unscoped, the first grep also hits
`web/backend/debug-display-flow.log` - a TRACKED runtime log carrying stack
frames captured before OC-4, appended to by whatever dev backend is running.
It is not source, not a reference, and not part of this inventory; it is named
here so a future run does not read it as a miss.

**Success criteria.** All five greps as specified; `npx tsc --noEmit` and
`npm run typecheck:tests` clean (a missed reference cannot compile).

---

## Task OC-10 - the reachability ledger

Per `~/.claude/REACHABILITY_PROTOCOL.md` sections 9 and 10. Create
`.superpowers/sdd/2026-09-02-petscii-oracle-at-the-choke/` with `CHECKLIST.md`
(every ID below, ticked in the open with a running count) and `REACHED.tsv`
(`id, entry_point, symbols, call_counts, timestamp, commit`), appended per
subtask, not written in a batch at the end.

**Gate 3b is the whole point: each row carries a CALL-COUNT SENTINEL, not a
source pin.** The instrument itself is validated first (section 3): every
sentinel proxy is proved to report a known-live path as LIVE and a
deliberately-unwired path (the choke installed on a DIFFERENT socket) as DEAD
before any of its counts are quoted. That validation is row R0.

| ID | real entry point driven | symbol whose calls are counted | must be |
|---|---|---|---|
| R0 | instrument validation (choke on the right socket vs a different socket) | `AnsiToPetsciiTransducer.prototype.transduce` - a prototype spy, because a spy on a module export records ZERO whether the path runs or not (**I4**) | LIVE / DEAD |
| R1 | a telnet C64's own top level: `handleCommand(connection.emitter, c64Session, 'M')` where `connection.emitter` came from `buildConnectionEmitter` - the menu paint, not a hand-made emit (**I5**) | `AnsiToPetsciiTransducer.prototype.transduce` (**I4**: an intra-module export is invisible to a spy under ts-jest) | >= 1 |
| R2 | a web socket's top level: the real `registerSocketHandlers(io, socket)` - the normal-web call site, `index.ts:1651`, not the two chat-only ones at `:1369` / `:1470` (**M2**) - then `handleCommand(socket, session, 'M')` (**I5**) | `AnsiToPetsciiTransducer.prototype.transduce`, plus the socket's `PETSCII_MODEL_CHOKE` marker present exactly once | >= 1, marker true |
| R3 | a reconnect: the real `session-restore` handler on a NEW socket, then a paint | `installPetsciiModelChoke`, `resetPetsciiModel`, `transducePetsciiAtChoke` | >= 1 each, and the fed model is `toBe` the restored session's |
| R4 | a door adapter run: `executeDoor` on a C64-adapted door, real dispatch | `C64DoorFrameAdapter.downstream` -> `transducePetsciiAtChoke` | >= 1, and every argument <= 40 printable columns |
| R5 | a `.seq` after a paged `.TXT`: `displayScreen` -> `startPagination` -> `handlePaginatedScreenInput` -> `displayScreen` of the `.seq` (**Q8**) | `transducePetsciiAtChoke` (for `:2800`'s page) and `emitPetsciiBytes` | >= 1 each; oracle == `wireMirror` |
| R6 | a `.seq` after a directly displayed `.TXT` (**Q8**) | same | same |
| R7 | the input boundary: the real `socket.on('command')` handler | `flushPetsciiModel` | exactly 1 per keystroke |
| R8 | the flip: the real `handleCommand` graphics-prompt `P` answer | `resetPetsciiModel` | exactly 1, before the first `emitPetsciiBytes` |
| R9 | a door's raw PETSCII: `BBSApi.writePetscii(Buffer)` through the real socket | `AnsiToPetsciiTransducer.prototype.observe` with a NON-empty argument (the unmarked branch) | 1 |
| R10 | the render's own bytes: a `.seq` paint | `AnsiToPetsciiTransducer.prototype.observe` with an EMPTY argument (the marked branch) | 1 per payload; the model's cursor advanced ONCE |
| R11 | a door's proxy socket: the same `.seq` paint with the door's `Object.create(socket)` in the chain (`handlers/door.handler.ts:157`) (**I7**) | `.observe` empty-argument branch | 1 per payload - a socket-keyed mark scores 0 here |

**Verification.** `REACHED.tsv` has 12 rows, R0 first; `CHECKLIST.md`'s ticked
count equals the number of DONE IDs and is reported with every progress
message (`[x] OC-4 - 4 of 11, 7 open`).
**Success criteria.** No ID is DONE without its row. A row whose count is 0 is a
FAILED item, reported as such - never rounded up.

---

## Task OC-11 - freshness, manual acceptance, handoff (last, mandatory)

`sdk/` is NOT edited by this plan (the transducer is used, not changed), so
section A of `.claude/skills/door-sdk-freshness/SKILL.md` applies only through
the backend restart. Run it anyway - the running dev backend holds transpiled
`web/backend/src` in the tsx cache.

**Automated (all must pass, in this order):**

1. `cd web/backend && npx tsc --noEmit`
2. `cd web/backend && npm run typecheck:tests`
3. `cd sdk && npx tsc --noEmit -p tsconfig.json` (unchanged, proves nothing
   broke by import)
4. `cd web/backend && npx jest --config dev-scripts/jest.config.ts --rootDir . --testPathPattern="tests/petscii/|tests/petscii-frame/|tests/server/|tests/utils/petscii|tests/doors/|tests/xim/|mci|screen-inline-sentinels|screen-handler|screen-loader|petscii-wipe-off|socket-handlers|forty-col-sweep|emit-text-wrap"`
5. `cd web/backend && npm test` - the FULL suite. **Never gate on a grep**
   (`npm test | grep "^Tests:" && git push` pushes red tests); read the exit
   status. Compare the failure list against the fix-wave report's known set and
   name any addition.
6. Restart with absolute paths:
   ```
   /Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
   ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep   # must print nothing
   rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
   /Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only
   ```
7. Wait for `[READY] AmiExpress BBS is ready for connections!` in
   `logs/backend.log` before telling the user anything.

**Manual verification (the sysop's, separate from the above - never ticked by
the implementer):**

- **Telnet C64 walk.** `telnet localhost 2323` from a real C64 / CCGMS (or the
  dedicated PETSCII port). Log in; view `MENU`, a bulletin that PAGINATES, then
  a `.seq` screen; run an adapted 68K door, exit it, then view the same `.seq`
  again. Each time the `.seq` must paint in the right bank, at the right row,
  in the right pen - no half-row offset, no graphics-bank text.
- **Web `P` walk.** Answer `P` at the graphics prompt. Same sequence. Then
  **reload the browser mid-session** (the reconnect path) and view the `.seq`
  again - it must be correct on the fresh canvas.
- **Pause walk.** A `.seq` with `~SP`: pause, resume, the art continues in the
  same bank and column.
- **80-column walk (the guard).** A normal ANSI web session and a normal ANSI
  telnet session: `MENU`, `BULL`, a paginated file listing, a door. Nothing may
  look different from `origin/main`.

**Handoff.** Update `handoff.md` (< 10 KB, `wc -c handoff.md`): the ONE model,
the two chokes, the mark/observe rule for `petscii-bytes`, the three restorer
fixes, and the four manual walks with their result. Archive the long form to
`thoughts/shared/handoffs/2026-09-02_petscii-oracle-at-the-choke.md`.

**Success criteria.** Steps 1-7 green; the four manual walks recorded with the
sysop's verdict; `handoff.md` current and under cap; `CHECKLIST.md` shows
11 of 11.

---

## Sequencing and dependencies

```
OC-1 (RED, stays red until OC-4) ────────────────────────────────────────┐
OC-2 (the model module; behaviour-free) ─┐                               │
                                         ├─> OC-3 (web choke) ─┐         │
                                         │                     │         │
                                         └─────────────────────┴─> OC-4 ─┼─> OC-5 ─┐
                                                          (OC-1 GREEN)   │         │
OC-6 (restorer identity; independent) ───────────────────────────────────┤         │
OC-7 (identity guard; gate after OC-3, OC-4, OC-5, OC-6) ────────────────┤         ├─> OC-11
OC-8 (68K door path; needs OC-4) ────────────────────────────────────────┤         │
OC-9 (deletions; the tail of OC-4, verified on its own) ─────────────────┤         │
OC-10 (ledger; appended per task, closed before OC-11) ──────────────────┴─────────┘
```

OC-2 must land before OC-3 (the choke calls its helpers) and OC-3 before OC-4
(the render cannot drop its own transducer until both chokes feed the session
one). OC-4 is ONE commit: the render flip, the payload mark, the tap deletion
and the three retargeted suites are a single change and splitting them leaves
the tree with a double-fed model. OC-6 is independent and may run in parallel
in a separate worktree - it touches `BBSApi.ts` and `door.handler.ts`, which no
other task edits.

## Risk register

| risk | task | mitigation |
|---|---|---|
| **The model is double-fed: the render feeds it while encoding, then the choke observes the same bytes** | OC-2, OC-4 | `emitPetsciiBytes` marks the payload on the socket for the duration of one synchronous emit; the choke consumes the mark and does `observe([])` (the latch clear the tap already does at `screen.handler.ts:1542-1544`). Pinned by OC-2 tests 4-5 and ledger row R10 (cursor advanced ONCE) |
| **A stale mark swallows a door's identical payload** | OC-2 | the mark is cleared in a `finally`, so a wrapper that DROPS the event cannot leave it set; OC-2 test 5 |
| **A permanent wrapper on `socket.emit` breaks the door teardown pins** (this is exactly what `98cee332c` did) | OC-3, OC-7 | installed at REGISTRATION, before any door and before the pins' `originalEmit` capture; those tests never call `registerSocketHandlers`, proved by re-running them with zero edits |
| **An ANSI session pays for a PETSCII parse, or its bytes change** | OC-7 | the gate is one property read; OC-7 test 4's sentinel asserts ZERO `petsciiTerminalModelFor` calls on an 80-column walk, test 1 asserts the emitted arguments are BYTE-EXACT, event-for-event, in order, with the downstream's return value passed back - not string identity, which JavaScript does not have (`toBe` on a primitive is value equality, so a `.slice()` copy passes it; see D-OC7-1) |
| **A reconnected session models a canvas that no longer exists** | OC-3 | `disposePetsciiSessionModel` at the restore, before `getModemEmulator(socket).install()` (`auth-socket-handlers.ts:178-180`) - dispose, not reset, so the parked `petsciiCtx` segments (`screen.handler.ts:1767-1782`) go with the machine they were encoded against; OC-3 test 4 |
| **A second choke is installed on top of the modem wrapper and every `ansi-output` is transduced twice** | OC-3 | the marker is on the SOCKET (`_modemEmulatorInstalled` / `_ansiFilterInstalled` / `__ansiTapInstalled` are the three precedents), not on the emit function the modem replaces (`modem-emulator.util.ts:276`); OC-3 test 3 drives install -> modem install -> install and asserts ONE `transduce` |
| **A door's `Object.create(socket)` proxy hides the self-fed mark** | OC-2, OC-4 | the mark is keyed on the SESSION, which both the producer and the choke hold; OC-2 test 6 and ledger R11 emit through the proxy `createDoorSocketWrapper` builds (`door.handler.ts:157`) |
| **A module-export spy reports a live path as dead** | OC-3, OC-7, OC-10 | every sentinel counts `AnsiToPetsciiTransducer.prototype.transduce` / `.observe`, never `petsciiTerminalModelFor`; R0 validates the instrument on a known-live and a known-dead path before any count is quoted |
| **The DEL-probe window poisons the model with the ANSI connect screen** (`terminalType='c64'` is stamped at `index.ts:1187`, gate `:1178-1185`, BEFORE the flip) | OC-5 | reset at all five flip sites; OC-5 test 1 drives exactly that window |
| **The modem emulator reorders the model against the wire** | OC-3 | it queues `ansi-output` ONLY (`modem-emulator.util.ts:276-288`); every other event goes straight through `directEmit`, and the CLIENT receives the same order, so model order == wire order. Stated in the choke's doc comment, no code |
| **A `.seq` fixture written through Edit/Write loses its high-bit bytes** | OC-1, OC-4, OC-8 | byte arrays in code (`seqBytes`), never `Edit`/`Write`; asserted by `Buffer.compare` |
| **The full suite hides a regression a pattern run misses** (the fix-wave's own lesson) | OC-4, OC-11 | `npm test` in full at OC-4 and again at OC-11, compared against the fix-wave's known-flaky list by name |
| **Restoring a bound copy tears off a wrapper installed during the call** | OC-6 | restore the VALUE found, own-property aware, in a `finally`, and only when ours is still live - the adapter's rule (`c64-door-adapter.ts:333-344`), not a fourth invention; OC-6 test 6 |
| **A shared-tree commit carries another session's staged files** | all | `git diff --cached --stat` before every commit; commit by path |

## Coverage table - every controller decision, pinned

| # | decision | pinned by |
|---|---|---|
| 1 | ONE session-lifetime model, fed at the choke | OC-2 tests 2-3; ledger R1, R2 |
| 2 | the render returns that model, T2 deleted | OC-4 success greps; OC-9; `tests/petscii/render-ctx-disposal.test.ts` retargeted |
| 3 | telnet's model is the emitter's | OC-2 (connection-emitter suite green unedited); ledger R1 |
| 4 | web wrapper at registration, gated, reconnect-safe (socket-keyed marker; the reconnect DISPOSES the model so the parked `petsciiCtx` segments go with it) | OC-3 tests 1-4 (test 3 is the modem-re-install case, test 4 asserts both `petsciiTransducer` and `screenSegments` cleared); ledger R2, R3; OC-7 tests 2, 4 |
| 5 | reset at the flip sites | OC-5 tests 1-3; ledger R8 |
| 6 | flush at input arrival | OC-3 test 5; ledger R7 |
| 7 | the four taps deleted, their tests retargeted | OC-9 greps; the three retargeted suites in OC-4 |
| 8 / Q1 | server model, no client reporting | no client->server geometry is added; `applyClientReportedGeometry` (`socket-handlers.ts:232-235`) untouched |
| 8 / Q2 | moot | OC-3's doc comment records why (the wrapper predates every door) |
| 8 / Q3 | restorers restore what they found, pattern class grepped | OC-6, all six tests + the two greps in the ledger |
| 8 / Q4 | model keyed on the session, fresh on reassignment | OC-2 test 3 |
| 8 / Q5 | flush at input arrival | OC-3 test 5 |
| 8 / Q6 | the wrapper is on the LIVE socket after reconnect - `io.sockets.sockets.get(session.socketId)`, NOT `session.socket`, which the restore never reassigns (`socket-handlers.ts:171` is its only assignment) | OC-3 test 4c; ledger R3 |
| 8 / Q7 | client doors out of scope | Non-goals, first bullet |
| 8 / Q8 | a `.seq` after paged and after direct `.TXT` | OC-1 tests 1-2; ledger R5, R6 |
| - | a 68K door's XIM bytes reach the model as 40-column adapter frames | OC-8 tests 1-4; ledger R4 |
| - | 80-column identity | OC-7, all four tests + six unedited suites |

No open questions remain. Where a fact in the tree forced a choice, the choice
and its reason are recorded inline: the mark-on-socket rule (OC-2, because the
render must read the cursor while it encodes, and because
`c64-detected-handler.ts:36` builds a second emitter for the same session), the
single web flush site (OC-3, because no client emits `door:input`), no telnet
dispose call (OC-4, because the session record is deleted at
`index.ts:1322`), and keeping `flushOutput` at `screen.handler.ts:450` (OC-4,
because it is wire ordering rather than model plumbing).

---

*Iteration passes: 8. Pass 1 drafted the task spine from the controller's
ruling. Pass 2 opened every cited file and corrected the anchors against the
tree at `f7c2b8ce2` (`door.handler.ts:151-153` not `:151`,
`door-min-columns-dispatch.test.ts:543-558/569-589` not the research's
`:524-539/:550-570`, `socket-handlers.ts:176-183` confirmed, the `command`
handler at `:570`). Pass 3 found the double-feed hazard - the render feeds the
machine while encoding, so a choke that also observes `petscii-bytes` would
count those bytes twice - and added the mark/observe rule, the
`emitPetsciiBytes` producer and OC-2 tests 4-5; it also confirmed
`tests/server/connection-emitter-petscii.test.ts:89` pins the current
`observe(raw)` behaviour, which the mark preserves for unmarked payloads. Pass
4 traced the reconnect path (`registerSocketHandlers` runs on every socket.io
connection, `index.ts:1651`; `registerAuthHandlers` is called from
`socket-handlers.ts:259`, so a restored session always lands on a registered
socket) and made the reconnect call idempotent plus a model reset, then ruled
`door:input` and `key-down` out by grep. Pass 5 bounded Q3's pattern class with
two greps (nine bind sites, seven assignment sites, exactly three broken) and
found the second defect at those sites - the restore sits inside a `try` whose
`catch` swallows, so a throwing handler leaks the wrapper for ever. Pass 6
verified the modem emulator queues `ansi-output` only
(`modem-emulator.util.ts:276-288`), so `petscii-bytes` is never delayed past
its mark, and confirmed the adapter re-emits at `c64-door-adapter.ts:201`
through the emit captured at `:260` - which is the choke - making OC-8 a
statement plus pins rather than new code. Pass 7 re-opened every anchor written
in passes 1-6 and corrected four (`c64-door-adapter.ts:272` for
`adapter.original`, `:337` for the refuse-guard ahead of `:339`'s restore,
`screen.handler.ts:1542-1544` for the tap's latch clear,
`socket-handlers.ts:369-371` for the `door:input` early return), and moved the
web installer out of `socket-handlers.ts` into the model module with a
session-RESOLVER argument after checking that `server/session-manager.ts:1`
imports `../index` - a util importing `getSession` would have put a cycle under
a module every handler already loads, and a lazy `require` back into
`socket-handlers.ts` from `auth-socket-handlers.ts` would have been the same
cycle deferred rather than removed. Pass 8 answered a NEEDS REVISION review,
re-verifying every claim at HEAD `26a887e96`: the choke's idempotency marker
moved from the emit function to the SOCKET (the modem emulator replaces
`socket.emit` unconditionally at `modem-emulator.util.ts:276`, so a
function-keyed guard would have let the reconnect install a second choke and
transduce every string twice - the three existing wrappers all key on the
socket); OC-3 test 3 was rewritten to drive install -> modem install -> install
instead of two back-to-back installs, which was green for a wrong reason; the
self-fed mark moved from the socket to the SESSION after
`Object.create(socket)` at `door.handler.ts:157` was checked - a mark written
through a door's proxy shadows and never reaches the choke; `grep -rn
disposePetsciiRenderCtx tests/` found SEVEN test files, six of them missing
from the retarget list; `installPetsciiModelChoke`'s resolver got a default so
the one-argument calls in four tasks type-check; `session.socket` was found to
be assigned in exactly one place (`socket-handlers.ts:171`) and NOT reassigned
by the restore, so Q6 now names the live-socket lookup the chat pushes already
use (`chat.handler.ts:91`); the reconnect switched from reset to dispose
because a paused `.seq` parks `petsciiCtx` with the machine
(`screen.handler.ts:1779`); OC-5's DEL-probe rationale was found INVERTED
against `command.handler.ts:1048-1059` and `index.ts:1178-1185` and re-grounded
on the two windows that are actually reachable; every sentinel moved from a
module export to `AnsiToPetsciiTransducer.prototype` because ts-jest binds
intra-module calls locally; R1 and R2 became real top-level entry points;
OC-6's snippet was fixed to bind the `interceptor` it compares against; and a
THIRD copy of the PETSCII predicate was found at `index.ts:1195-1198`, spread
over four lines, which is why the success grep is now multiline.*
