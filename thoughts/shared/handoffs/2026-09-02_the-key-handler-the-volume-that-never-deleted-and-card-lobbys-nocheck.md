---
date: 2026-09-02
topic: "One xterm key handler, browser fullscreen, a Doors volume that finally deletes, and the @ts-nocheck that hid six crashes in CARD LOBBY"
tags: [terminal, xterm, fullscreen, deploy, docker-entrypoint, card-lobby, refactor, typescript, handoff]
status: final
session: amiexpress-web-c2
---

# Handoff: three items off the list, and what the third one was really hiding

Short session, working from the previous handoff's Next list. Everything
below is on `origin/main` and verified running in the live container.

| commit | what | live check |
|---|---|---|
| `21c03dc76` | BBSTerminal's two custom key handlers merged into one; Alt+Enter also fullscreens the browser | `.git-sha` + `select-all` present in the served bundle |
| `9101fdfe8` | image door `dist/` is mirrored, so the Doors volume deletes | 8 pengo orphans pruned, both `highscores.json` survived |
| `e8917ee69` | CARD LOBBY type checks, 1923 lines, takes the size switch | four new managers in the shipped `dist/`, `showBrowser` gone |

## 1. xterm keeps ONE custom key handler

`attachCustomKeyEventHandler` assigns; it does not append. BBSTerminal made
two calls, so the FIRST handler had been dead since it was written - Shift+
Arrow escape sequences, copy and select-all with mouse reporting off, and the
Ctrl+Shift+M block. Three features that read as live in the source and had
never once run.

They are one handler now. The decision behind it is `classifyKey()` in
`packages/terminal/src/utils/key-overrides.ts`: pure, ordered, and tested,
because the component that owns the keyboard cannot be mounted (canvas,
socket, real xterm). The order matters and is written down there: the mouse
toggle block, Alt+Enter, the game-mode block, copy/select-all, Shift+Arrow,
then pass.

**Alt+Enter now also toggles browser fullscreen** (`utils/fullscreen.ts`,
WebKit spellings included, rejected promise swallowed). It has to happen on
the KEY: `requestFullscreen` is only granted inside a user gesture, so
reacting to the door's `terminal-mode` socket event instead would be refused
by the browser. **In game mode the handler toggles the window and sends no
bytes** - the window keydown listener already emits the key with its
modifiers, so sending as well would toggle the door twice per press and land
it back at the size it started.

A source count is the right check for the duplicate-registration defect, and
`singleKeyHandler.test.ts` makes it: the defect IS a second call in the
source. Proof it bites: `git show HEAD:...BBSTerminal.tsx | grep -c
attachCustomKeyEventHandler(` was 2. Frontend suite 206 -> 225.

## 2. The Doors volume deletes now - narrowly, on purpose

The sync is `tar cf - | tar xf -` and extraction only WRITES, so a file
dropped from the image lived on the volume for ever. For compiled door output
that is not a stale file but a live one: the door loads what is in `dist/`, so
a renamed module keeps running beside its replacement.

`prune_image_door_dists()` in `docker-entrypoint.sh` mirrors it. The scope is
the whole design:

- only doors the IMAGE ships - a door DOORREPO installed at runtime exists on
  the volume alone, and mirroring would delete the door;
- only `dist/`;
- only compiled output inside it, **whitelisted by extension**;
- never against an empty image `dist/` - that is a broken build.

**The whitelist exists because a dry run against the live volume found
`frogger/dist/highscores.json` and `super-qix/dist/highscores.json`** - the
players' scores, written by the door, present in no image. `dist/` is not
purely image-owned on this board. Without that dry run the first version
would have deleted them. Ten tests drive the real shell function, extracted
from the entrypoint rather than re-implemented, and two of them are the live
volume's actual cases.

**Method worth repeating: dry-run a delete path against the real volume
before shipping it.** Enumerate what it WOULD remove, read that list, and only
then push.

## 3. CARD LOBBY: the extraction was the smaller half

The stated blocker was size - 2808 lines against the repo's 2000-line
ceiling, so the pre-commit hook refused any change and the ten-line size
switch had been waiting a day. But line 1 was `// @ts-nocheck`, so none of
those 2808 lines had ever been checked.

Behind the suppression: **six calls to methods that do not exist**, each a
TypeError the moment a player reaches it.

| call | reached by |
|---|---|
| `this.drawUnoCard()` | gamepad X at an UNO table |
| `this.callUno()` | gamepad Y at an UNO table |
| `this.refreshLobby()` | gamepad START, and the R key |
| `gameStateManager.getUnoEngine()` | gamepad A at an UNO table |
| `this.loadProfile(...)` | the end of every UNO game |
| `dialogManager.showConfirmDialog(...)` | deleting a table |

Two more the compiler found once it could look: `runDealAnimation` had lost
its `emitSfx` argument in an earlier move, so the deal animation had been
running silent, and every cross-node UNO event was emitted on `this.rpc`, a
property the door does not have - announced to nobody.

`showBrowser()` was 192 lines reachable only from itself. It went, and with it
the `'browser'` view mode and seven dead key-handler branches.
`adapters/CardLobbyBrowserAdapter.ts` is KEPT - the browser-mode docs point at
it.

Four cohesive pieces moved to `managers/`, each reaching the door through a
host interface that lists exactly what it may touch: `TableFlow` (create /
join / observe / leave / delete), `GamepadBindings`, `UnoEventBus` (the
cross-node queue and its poll), `GameViews`. index.ts is 1923 lines,
`tsc --noEmit` clean with no suppression, switch starting `fixed` like every
other door.

`web/backend/tests/doors/card-lobby-typechecks.test.ts` fails if the
suppression returns, if the file crosses the ceiling again, or if a method
calls a name the class does not define - that last check reports exactly
`drawUnoCard`, `callUno`, `refreshLobby`, `loadProfile` when run against the
old file.

## Learnings

- **`@ts-nocheck` is a bug report, not a style choice.** One line at the top
  of a door hid six crash paths for months. Before refactoring any file for
  size, check whether it is checked at all - the line count may be the
  symptom.
- **Dry-run every delete against the real data before shipping the code that
  does it.** The high scores were saved by a read-only enumeration, not by
  review.
- **A shared index cuts both ways.** Another session's `git commit` swallowed
  seven of my staged files into their docs commit. Split non-destructively
  with `reset --soft` + two commits; `git diff <old> HEAD` empty proves
  nothing changed but the hash. `git diff --cached --stat` before EVERY
  commit, mine included.
- **A source count is legitimate when the defect is in the source.** "Exactly
  one `attachCustomKeyEventHandler`" cannot be proven by driving the
  component, and does not need to be.
- **A worktree cut from main needs each door's `node_modules` symlinked**, or
  a suite that imports that door fails to RUN and reports 0 failed tests -
  `grandmaster-database-path.test.ts` did exactly that here.

## Next

1. **Drive CARD LOBBY by hand.** The four gamepad paths, the end of an UNO
   game, and deleting a table have never worked; only the compiler says they
   do now.
2. `Dockerfile:262-300` ships THIS board's `Screens`, `Conf1`-`Conf14`,
   `Node0`-`Node40` as `/app/default-data`. Needs its own spec.
3. Six admin pages still on their own tables (remediation 5.3 stays open on
   purpose - the cheap memoisation broke re-sort).
4. Audio stutter: one cause fixed, diagnostics live, never confirmed.
5. The scratchpad worktree `land-wt3` is still on disk with node_modules
   symlinks; remove it when nobody needs the landed tree.
