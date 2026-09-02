---
date: 2026-09-03
topic: PETSCII oracle at the choke - one terminal model per session, fed on the transport boundary
tags: [petscii, c64, terminal-model, sockets, reachability, 40-columns, doors]
status: implemented
---

# The terminal model lives at the choke

## Task

`thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md` (pass 8),
eleven tasks OC-1..OC-11, on branch `feat/installed-door-link` in the shared
tree. Research:
`thoughts/shared/research/2026-09-02_petscii-oracle-transport-boundary.md`.
Ledger: `.superpowers/sdd/2026-09-02-oracle-at-the-choke/progress.md`
(gitignored working copy) with `CHECKLIST.md` and `REACHED.tsv` beside it.

**The defect.** A `.seq` screen is encoded against a PETSCII terminal model - a
cursor, a charset bank, a pen. Before this wave that model was owned by the
RENDER: `petscii-screen.render.ts` built a transducer per render and threw it
away, while a second, independent tap watched the socket. Two models, neither
of which saw everything the C64 saw, so art painted at the wrong row, in the
wrong bank, in the wrong pen after a paged `.TXT`, after a door, after a pause.

**The fix.** ONE `AnsiToPetsciiTransducer` per session, fed at the TRANSPORT
BOUNDARY - the single place every byte the caller receives must pass:

- telnet/SSH: `server/connection-emitter.ts:99` (`transducePetsciiAtChoke`).
- web: a socket-keyed wrapper installed by `registerSocketHandlers`
  (`server/socket-handlers.ts:197`), under the modem emulator, gated on
  `sessionWantsPetscii(session)` and on `session.socketId === socket.id`.

The render now READS that model instead of owning one, both taps are deleted,
the model is reset at the flip sites and DISPOSED on reconnect, and every ANSI
session's bytes are byte-identical to `origin/main`.

## Critical References

| what | where |
|---|---|
| the model, its accessors, the choke helpers | `web/backend/src/utils/petscii-session-model.ts` (`emitPetsciiBytes` :73-104, `transducePetsciiAtChoke` :243, `observePetsciiBytesAtChoke` :245) |
| telnet choke | `web/backend/src/server/connection-emitter.ts:99` |
| web choke, install + gates | `web/backend/src/server/socket-handlers.ts:197` (install), `:602` (`flushPetsciiModel` on input), `:1267` (dispose on disconnect) |
| debug OutputTap wrapper (dev/test only, `NODE_ENV !== 'production'`) | `web/backend/src/server/socket-handlers.ts:143` |
| reconnect dispose, under the modem install | `web/backend/src/server/auth-socket-handlers.ts:188` |
| the render reads the session model | `web/backend/src/handlers/petscii-screen.render.ts`, `handlers/screen.handler.ts:1548`, `:1565`, `:1757` |
| reset at the flip sites | `handlers/command.handler.ts:1419`, `:1469`; `handlers/command-handler/pre-login.ts:66`, `:161`; `server/telnet-server.ts:754` |
| the DEL probe (telnet data handler) | `web/backend/src/index.ts:1187` stamps `terminalType='c64'`, gated `:1178-1185` |
| restorer identity pattern (the survivor) | `web/backend/src/server/c64-door-adapter.ts:272`, `:337`, `:339` |
| the three fixed restorers | `src/doors/BBSApi.ts`, `src/handlers/door.handler.ts` |
| door proxy socket the mark must survive | `src/handlers/door.handler.ts:157` (`createDoorSocketWrapper`) |
| 80-column identity guard | `web/backend/tests/server/eighty-col-choke-identity.test.ts` |
| reachability ledger | `thoughts/shared/research/2026-09-03_petscii-oracle-reached.tsv` + `..._reached.md` |

## Recent Changes

The OC wave, oldest first - this is the cherry-pick order for landing on
`origin/main` (the two unrelated chores that sit between them in the log,
`79b93320b` and `a02edb206`, are other sessions' and are NOT part of this set):

| # | commit | what |
|---|---|---|
| OC-1 | `30d904d72` | RED: name the oracle's drift between screens |
| OC-2 | `68caab151` | one terminal model per session, owned by a leaf util |
| OC-3 | `30d8e2a92` | a web C64 session carries the same terminal model telnet gets |
| OC-6a | `a8331121f` | restore the emit that was found, in a `finally` |
| OC-6b | `fcb7f494f` | let the emit-restorer suite exit without `--forceExit` |
| OC-4 | `211810e7d` | the `.seq` render reads the session's model, the taps die |
| OC-5 | `34ff748e6` | home the terminal model where a session becomes PETSCII |
| OC-3 carry | `292a971ee` | say that the reconnect's choke install is a guaranteed no-op |
| OC-3 carry | `8d1150f52` | a dead socket stops feeding the session's terminal model |
| OC-3 carry | `ea71fa3f9` | stop allocating an empty array on every keystroke |
| OC-7 | `c60d8b98d` | pin the 80-column path byte-identical through the model choke |
| OC-9 | `83dfc43a0` | drop the render accessor nothing asks for any more |
| OC-8 | `0f845842c` | pin a 68K door's XIM bytes reaching the model as 40-column frames |
| OC-8 fix | `afaa48185` | the door-frame suite is ASCII source; widest fed frame is exactly 40 |
| OC-10 | `9d03c0163` | close the reachability ledger - every row counts a call |
| OC-11 | `e79a78507` | the review notes land in the files they describe |
| OC-11 | this commit | plan, research, reached ledger, handoff |

## Learnings

**Feed the model where the BYTES pass, not where the screen is built.** Any
place above the transport is a place some producer bypasses - a door's raw
`writePetscii`, a pause prompt, an ANSI include, a 68K door's adapted frames.
The choke is the only place with no bypass, which is why the oracle can be
asserted equal to a fresh transducer fed the whole wire (`wireMirror`).

**A model the render owns is a model the render's siblings never see.** The
two deleted taps were each individually correct and collectively wrong.

**Mark the payload the producer already encoded.** `emitPetsciiBytes` marks the
payload on the SESSION for one synchronous emit, and the choke consumes the
mark and calls `observe([])` instead of applying the bytes twice. The mark is
session-keyed, not socket-keyed, because a door emits through
`Object.create(socket)` - ledger row R11 is exactly that case, and a
socket-keyed mark scores 0 there.

**Spy on the PROTOTYPE, never on a module export.** ts-jest binds intra-module
calls locally, so a spy on `petsciiTerminalModelFor` records ZERO whether the
path runs or not - it passes on a broken build. Every one of the twelve ledger
rows counts `AnsiToPetsciiTransducer.prototype.transduce` / `.observe` /
`.flush` / `.reset`, and row R0 validates the instrument on a known-live and a
known-dead socket before any other count is quoted.

**`toBe` is not identity for a string.** The 80-column guard was specified as
"argument IDENTITY (`toBe`)"; JavaScript has no such thing for a primitive, and
a probe that replaced every emitted string with `a.slice()` left the suite
GREEN. The guard now reads byte-exact, event-for-event, in order, with the
downstream's return value (deviation D-OC7-1).

**A restorer must put back what it FOUND**, own-property aware, in a `finally`,
and only while its own wrapper is still live. Restoring a `.bind()` copy pins a
permanent own property onto a socket.io socket whose `emit` lives on the
prototype, and tears off any layer installed during the call.

**The private index is ONE shell invocation.** `GIT_INDEX_FILE` is an
environment variable; `export` + `read-tree` + `add` + `commit` + `reset` must
be a single Bash call or the later commands write the SHARED index. Two more
rules go with it: `read-tree` must take `$(git rev-parse HEAD)` read in that
same call - HEAD moved under this wave four times, and a remembered SHA would
have committed a tree that reverts another session's work - and after the
commit, `git reset -q HEAD -- <paths>` on the shared index, or the shared index
reads as a revert of the commit just made. `git diff --cached --stat` before
every commit, `git show --stat HEAD` after, and a listing with a file you did
not touch is a FAILED commit: recommit, never amend.

**The Conf.DB incident (D18, disclosed).** While cleaning up an OC-8 probe
worktree, `git checkout -- Conf.DB` was run with `-C` pointing at the SHARED
tree instead of the worktree. The shared tree's uncommitted root-level
`Conf.DB` modification - present since before the session - was discarded and
is not recoverable: no stash, no backup, no snapshot. The file now matches HEAD
(`4f1ec86f0`, 2,490,174 bytes); the per-conference `Conf<N>/Conf.DB` files were
untouched. The destructive-op checklist was not followed and should have been.
The standing rule for this tree is now absolute: never run `git checkout`,
`git restore`, `git reset --hard` or `git clean` against any path in the shared
tree, and never `git stash` here at all (CRLF phantom files block `stash pop`
forever).

**Probe DEAD counts in a throwaway worktree, one line at a time.** Every dead
count in `REACHED.tsv` was measured with one line of `src` mutated in a
detached worktree of the same commit, reverted INSIDE that worktree, with
`git status --porcelain` confirmed clean afterwards. The shared tree's `src`
was never edited for a probe.

## Verification (OC-11, automated - the sysop's walks are separate)

Run on the shared tree at `e79a78507`, in the plan's order:

| step | result |
|---|---|
| `web/backend && npx tsc --noEmit` | EXIT=0 |
| `web/backend && npm run typecheck:tests` | EXIT=0 |
| `sdk && npx tsc --noEmit -p tsconfig.json` | EXIT=0 (unchanged by this wave; proves nothing broke by import) |
| the PETSCII/door/MCI pattern run | 196 of 197 suites, 2394 of 2395 tests passed; the one failure is `card-lobby-typechecks` (foreign, below) |
| `web/backend && npm test` (FULL, exit status read, never grepped) | **EXIT=1**: 524 passed / 2 failed of 526 (2 skipped), 7913 tests passed / 2 failed. Both failures are the fix-wave report's KNOWN-FOREIGN set and nothing was added: `tests/doors/card-lobby-typechecks.test.ts` (`Doors/card-lobby/index.ts` is 2001 lines against a `toBeLessThan(2000)` ceiling - the card-lobby owner's) and `tests/services/bbs-config-round-trip.test.ts` ("saves anyway when the icon cannot be rewritten" expects `infoFileWritten === false`, gets `true` - the bbsConfig/admin owner's). Neither imports anything this wave touched. |
| restart the dev backend (`.claude/skills/door-sdk-freshness` section A steps 6-7) | **NOT RUN - deliberate.** A backend is up that this session did not start (`tsx src/index.ts`, pid 64574, started 00:53 today, with a `watch-doors.ts` from 16:52 the previous day). `thoughts/BOARD.md` rule 3 requires announcing a restart before `kill-servers.sh`, and a restart drops every connected session including the sysop's test tab. The sysop restarts it before the walks below. |

Freshness scope: this wave changed `web/backend` only - not `sdk/`, not a
door's `.ts`, not `packages/terminal` or `web/frontend`. So sections B, C and E
of the freshness skill do not apply, and section A applies only through its
restart step: the running backend holds the OLD `web/backend/src` in the tsx
cache, so **the manual walks below are invalid until it is restarted**:

```
/Users/spot/Code/amiexpress-web/dev/scripts/kill-servers.sh
ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep   # must print nothing
rm -rf "$(getconf DARWIN_USER_TEMP_DIR)"tsx-*
/Users/spot/Code/amiexpress-web/dev/scripts/start-servers.sh --bbs-only
```

Wait for `[READY] AmiExpress BBS is ready for connections!` in
`logs/backend.log` before walking.

## Artifacts

- Plan: `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`
- Research: `thoughts/shared/research/2026-09-02_petscii-oracle-transport-boundary.md`
- Reachability ledger: `thoughts/shared/research/2026-09-03_petscii-oracle-reached.tsv`
  (12 rows, R0 first) and the prose companion `..._reached.md`
- Progress ledger + checklist (gitignored):
  `.superpowers/sdd/2026-09-02-oracle-at-the-choke/{progress.md,CHECKLIST.md,REACHED.tsv}`
- Not pushed. Land by cherry-picking the table above onto a fresh worktree of
  `origin/main` - never merge `feat/installed-door-link` wholesale.

## Next Steps

1. **The sysop's manual walk** (below) - four walks, none of them ticked by an
   implementer.
2. Land the wave: cherry-pick the OC commits in the order of the table onto a
   worktree cut from fresh `origin/main`, then push. `git cherry origin/main
   HEAD` shows what is not upstream.
3. **Flagged by the OC-5 review, out of scope, still open:** the flip reset does
   not FLUSH the `AnsiBuffer`, so a chunk armed before the flip and draining
   after re-poisons the freshly homed model. The reset covers the model, not the
   buffer.
4. **Also flagged, pre-existing:** `existingSession.socket` is never rebound on
   reconnect (`auth-socket-handlers.ts`).
5. **Pre-existing test failure, another session's file:**
   `tests/doors/card-lobby-typechecks.test.ts` - "stays under the repo line
   ceiling" fails because `Doors/card-lobby/index.ts` is exactly 2000 lines and
   the assertion is `toBeLessThan(2000)`. Nothing in this wave touches
   `Doors/`; it belongs to the card-lobby owner.
6. `Documentation/2-Sysops/CONFIGURATION.md` is untouched by this wave - the
   plan's OC-11 does not ask for it, and nothing here changes a sysop-visible
   setting.

## THE SYSOP'S MANUAL WALK

Exactly as the plan's OC-11 lists it. **Never ticked by the implementer** - each
step needs the sysop's own eyes and verdict.

### 1. Telnet C64 walk

`telnet localhost 2323` from a real C64 / CCGMS (or the dedicated PETSCII port).

| step | expected observation |
|---|---|
| log in | the title and prompts paint in PETSCII, upper-case/graphics bank, on a BLACK screen - no blue, no half-row offset |
| view `MENU` | the menu paints where the previous screen left the cursor; no graphics-bank text and no text-bank graphics |
| view a bulletin that PAGINATES | the pause prompt appears, the page after it starts on the correct row - not one row low, not overwriting the prompt |
| view a `.seq` screen | the art paints in the right bank, at the right row, in the right pen |
| run an adapted 68K door | frames arrive at 40 columns, `[C64]` shown, no line wrapping the door did not ask for |
| exit the door | the post-door prompt lands on its own row, not one below |
| view the SAME `.seq` again | identical to the first paint - the door's output moved the model, and the render encoded against where the cursor really is |

### 2. Web `P` walk

| step | expected observation |
|---|---|
| answer `P` at the graphics prompt | the canvas switches to PETSCII and the first screen paints from HOME - no leftover from the ANSI connect screen, no poisoned cursor |
| `MENU`, a PAGINATED bulletin, a `.seq` | same expectations as the telnet walk, on the canvas |
| run an adapted 68K door, exit it, view the same `.seq` | identical to its first paint |
| **reload the browser mid-session** (the reconnect path) | the session restores, and the next `.seq` is CORRECT on the fresh canvas - the old model was disposed with the canvas it was encoded against, not carried over |

### 3. Pause walk

| step | expected observation |
|---|---|
| view a `.seq` containing `~SP` | the art stops at the pause and the prompt is drawn |
| resume | the art continues in the SAME bank and the SAME column it paused in - no bank flip, no column reset |

### 4. 80-column walk (the guard)

A normal ANSI **web** session and a normal ANSI **telnet** session.

| step | expected observation |
|---|---|
| `MENU` | pixel-for-pixel what `origin/main` draws |
| `BULL` | unchanged |
| a paginated file listing | unchanged, including where the pause prompt sits |
| a door | unchanged |

**Nothing may look different from `origin/main`.** Anything that does is a red
on the identity guard and stops the landing.
