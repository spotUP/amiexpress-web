---
date: 2026-08-26
topic: Everything reported and not yet fixed - LiveChat stubs, UI faults, and the older backlog
tags: [livechat, doors, context-menus, voice, video, arkanoid, grandmaster, mobile, deploy]
status: final
---

# Handoff: implement the stubs, and clear the reported backlog

The previous session fixed voice and video end to end. This document lists
**everything the user has reported that is still open**, gathered from the
whole conversation and from the two todo documents - not from memory.

Companion documents, both still current:

- `thoughts/shared/plans/2026-08-26-livechat-todo.md` - the LiveChat list
- `thoughts/shared/plans/2026-08-25-touch-and-tetrinet-todo.md` - the older
  backlog, with a status table at "Status, end of 2026-08-25"

Governing principle for the menu work: **an entry that does nothing is worse
than no entry.** Anything not implemented in this pass should be removed
from its menu rather than left printing "(not implemented yet)".

---

## A. LiveChat stubs and dead menu entries

All in `Doors/livechat/features/context-menus.ts` unless noted - items are
built in `scm()` and handled in the switch below it.

### User menu

| Entry | State |
|---|---|
| Add Note | prints `Add note for X (not implemented yet)` |
| View History | prints `Viewing message history for X (not implemented yet)` |
| Whois | reported as doing nothing; handler needs reading |
| View Profile, Send Message, Mention | work |
| Mute / Ignore / Block | work, and now label themselves "Un-" correctly |

### Message menu

| Entry | State |
|---|---|
| Copy Text | prints "Copy to clipboard (not available in terminal)" |
| Mark Unread | prints "Marked as unread", `// TODO: Mark channel as having unread messages` |
| React, Pin Message, Delete, Edit | print a confirmation - **no backend handlers exist** |

The door half of react/pin/delete is done: `ui/chat-row-map.ts` maps a click
row to a message index, written because the menu previously "knew a click
had happened and nothing about what was under it". What is missing is
server-side handlers - check `web/backend/src/handlers/chat/` first.

### Channel menu

`// TODO: persist a local pinned-channels list in prefs` - Pin Channel does
nothing durable.

### Commands

- **`/msg @dino test` is silent** while the context menu's Send Message
  works. Compare `commands/msg-dm.ts` with the menu path. Command results
  reach the world via `handlers/input-submit-handler.ts`, which turns a
  result's `data` into an action - `selectMicDeviceId` there is a worked
  example.
- **`/customemoji`** prints "Custom emojis feature coming soon!"
  (`commands/emoji.ts`). Described earlier as a three-layer feature.

---

## B. LiveChat bugs with known causes

### Stale users in the sidebar (cause found)

Reported with a screenshot: `spot`, `coffe`, `DiNO` all shown online when
only `spot` was. On `room:joined` the door fills `onlineUsers` from
`d.members` and marks every one `status: 'online'`
(`handlers/room-socket-handlers.ts` around line 27):

```js
for (const m of d.members) {
  ou.set(memberId, { username: m.username, status: 'online', ... });
}
```

**Membership is not presence.** `d.members` is everyone who has ever joined
the room, so they show online for ever; `ou.delete` only fires for somebody
who leaves while you are watching. Either the server should send presence,
or the door should cross-reference `presenceService` before rendering.

### Panel hover only highlights on the border

Hovering inside a panel used to highlight it, and edges used to colour to
show they can be resized. Machinery is in
`sdk/engines/ui/blessed/widgets/dockable-panel.ts`: `mouseenter`/`mouseleave`
set `isPanelHovered`, `applyBorderHoverStyle()` paints per-edge colours from
`currentHoverEdge`/`currentResizeEdge`.
**Suspect first**: the mouse-motion throttle added this session
(`web/backend/src/doors/input-motion-throttle.ts`, 40ms) may be losing
enter/leave transitions. Lower it or exempt transitions before touching the
widget.

### Sidebar loses its border after being dragged

DockablePanel captures `_originalBorderColor` once at construction and
restores it on mouseleave, defaulting to `'blue'`.

### Focus outline is inconsistent

The message input draws a white outline on focus; the sidebar does not.
Note blessed resolves border colour as `style.border` > `border.style` >
`style.fg`, and **ignores a colour on the `border` object** - that has
already cost time here.

### Login button position

On `http://localhost:3001/chat` the login button needs to move one row down.
It is a blessed modal: `Doors/livechat/ui/login-modal.ts`, driven by
`chat-only-login.ts`.

### Chat history is not preserved

Confirmed by the user as never having worked - a gap, not a regression.
There is no database under `Doors/livechat` on the live volume. Decide where
history lives before implementing; it also unblocks View History and Mark
Unread.

### No way to create a channel from the UI

`/join` creates one server-side, but the sidebar offers no affordance.

### Text selection in the chat log

Selecting text to copy marks the whole terminal, not just the chat log, so
pasted output is unusable.

### Other TODOs in the source

- `core/renderer.ts` - two TODOs about `formatTopBar` awaiting a screen
  module refactor
- `features/voice-chat.ts` - route notifications and errors into the
  livechat notification system

---

## C. Voice and video, unverified

Both fixes are live and **neither has been confirmed by the user**. Check
these before building on them.

1. **Audio clicks / "stuttery robot".** A jitter buffer was added
   (`sdk/media/pcm.ts` `scheduleStart`, 80ms lead, 400ms cap) AFTER the
   report, so the report predates the fix. If it persists, the next suspect
   is `ScriptProcessorNode` running on the main thread alongside video
   encoding - the fix is an `AudioWorklet`, loadable from a Blob URL.
2. **Mouse-motion throttle** - see panel hover above.

Also open:

- **WebRTC for the browser view.** Item 4 of the user's own 1-4 list; 1-3
  are done. The BBS terminal must stay ASCII, but `/chat` in a browser has
  no reason to be - that is where real video and proper skin tones live.
- **GPU encode.** The pixel-to-cell quantisation is embarrassingly parallel
  and `getImageData` reads back at full resolution. Worth measuring only
  after the bandwidth work, since bytes were the limit, not encode time.
- **Keyframe on join** - a viewer joining mid-stream waits up to 3s for a
  picture.
- **CPU cost of the raised cell cap is unmeasured.** It went from 1,800 to
  8,000 on bandwidth evidence alone, with no CPU measurement on the VPS.

---

## D. Older backlog, still open

From `2026-08-25-touch-and-tetrinet-todo.md` - its status table lists what
was fixed; these were not:

- **Item 2: SDK-wide touch gestures for menus.** Partly done - pad-style
  doors get menu gestures through `bbs:input-mode`. The generic layer for
  every door and the BBS itself is not built.
- **Item 12: which mode the 8BitDo pad should be in.** Needs the pad in
  hand; an XInput-style mode may remove hat decoding entirely.
- **Item 19: sync Arkanoid visuals to the music.** Reported again this
  session as "I see nothing synced to music".
- **Item 21: TetriNET specials** - confirm the keys work with opponents
  present. The panel hint still reads "TAB: Next 1-5: Select", describing a
  select-then-fire model the code no longer uses.
- **Item 22: a real LiveChat <-> Discord bridge.** What exists is one-way
  webhooks; a bridge needs a bot with a gateway connection.
- **Item 7 leftovers**: ~4% unfilled width on a dpr-3 phone, the game pad
  being portrait-only, and two backend suites red in CI for missing
  better-sqlite3 bindings (`execute-lha-extract`, `arkanoid-score-webhook`)
  - environmental, not regressions.

Also reported and not addressed:

- **Arkanoid laser is picked up but nothing fires it.** The power-up exists
  (`Doors/arkanoid/client.ts`, `laser` in `PowerUpType` and the state) with
  no firing path.
- **BBS login output painted over a running door** on reconnect. Same class
  as the ANSI overpaint fixed earlier.
- **Selectable themes for all blessed doors** - the user asked for this
  after the grey/white border change; deferred.
- **Emoji picker** shows `::heart::`-style text rather than the ASCII emoji
  itself; the user wants ASCII used directly with no conversion.
- **`_coordsCacheValid`** is written in six SDK places and read nowhere -
  dead code.

---

## D2. Deploying kicks everybody out

**Every deploy recreates the container, which drops every connected
session.** On 2026-08-26 eight deploys went out in 46 minutes - three of
them documentation-only - and the user was repeatedly thrown out of /chat
while trying to test the fixes being deployed.

Half-fixed: `thoughts/`, markdown and `docs/` are now in `paths-ignore` on
the deploy workflow, so writing notes cannot disconnect anybody, and
`workflow_dispatch` is there for when a docs change does need to ship.

**Still open, and the real fix**: a code deploy still disconnects everyone.
A drain-first or rolling restart - bring the new container up, let sessions
finish or migrate, then retire the old one - is what would actually solve
it. Until then, batch pushes and avoid deploying while somebody is testing.

### Wanted: deploys that do not drop everybody (user request)

The user asked for what their devilbox project does - the server stays up
and users are merely notified. The constraints here are different, and were
checked rather than assumed:

- Caddy is a single `reverse_proxy localhost:3001` and reloads gracefully
  without dropping established connections, so the proxy is the easy part.
- **One SQLite database on a shared volume.** Two containers at once means
  two processes writing `amiexpress.db`; WAL helps readers, not concurrent
  writers across processes.
- **Fixed ports.** Telnet binds 64128; a second instance cannot, so the old
  container must release its ports.
- **Sessions live in process memory** - node assignment, door state,
  subState. Nothing exists to migrate them into.

Devilbox is stateless HTTP, where blue/green is trivial. A BBS with
long-lived terminal sessions is not the same problem.

Achievable in order of effort:

1. **Notify then restart.** Broadcast a countdown to every connected
   session, let people finish their keystroke, then restart. Downtime stays
   seconds but nobody vanishes mid-sentence. Nothing blocks this.
2. **Auto-reconnect in /chat.** socket.io already reconnects on its own;
   what is missing is re-entering the door on the far side. Nothing blocks
   this either.
3. **Session restore across a restart.** Reconnect lands you where you
   were. Needs session state persisted outside the process first.
4. **True blue/green, zero disconnects.** Needs the database and port
   problems solved before it is worth attempting.

Recommended: do 1 and 2, and treat 3 and 4 as a separate piece of work with
its own design.

Related: all GitHub Actions and server timestamps are **UTC**, two hours
behind the user's CEST wall clock. Local Mac, UTC and the Hetzner server
were verified in agreement to the second, so timing evidence taken from
container mtimes and workflow logs is sound - just remember to convert
before quoting a time back to the user.

## E. Learnings that will save time

**A door cannot call a server handler by emitting on its socket.** That
direction is server to client. Anything a door needs the server to do must
be intercepted in `web/backend/src/handlers/door.handler.ts`, as `room:join`
and now `voice:*` are. This silently broke voice channels for their entire
existence - the backend logged zero joins, ever.

**`packages/terminal` compiles the SDK sources under its own stricter
tsconfig, and it gates the Docker build.** `sdk`, `Doors/livechat` and
`web/backend` can all be green while the deploy fails. Typecheck it before
pushing anything under `sdk/`.

**The entrypoint deliberately deletes door `.ts` sources** after syncing,
because production runs `dist/`. Any image-vs-volume check must exclude
them.

**Deploy verification must wait for `.sync-complete`, not `/health`** -
health answers while the entrypoint is still copying.

**Never trust the client to throttle.** Mouse motion was forwarded and
logged per event with no server-side limit; moving a pointer over `/chat`
blocked the event loop and took the live site down while the container still
reported itself up.

**Measure the right thing.** The video work was driven by real numbers, but
the cell cap was later raised on bandwidth evidence with no CPU measurement.

---

## F. Next steps, in order

1. Verify the two unverified live fixes (audio jitter, motion throttle).
2. Fix stale users - the cause is known and the fix is small.
3. Decide where chat history lives; it unblocks View History and Mark
   Unread.
4. Do the context menus in one pass: implement or remove. React/pin/delete
   need backend handlers.
5. Fix `/msg` by making it share the context menu's path.
6. Channel creation in the sidebar.
7. Panel hover, sidebar border, focus outline, login button row.
8. The older backlog in section D, by whatever the user ranks highest.

---

## G. State of the tree

Everything described here is committed AND pushed - `origin/main` is at
`0d4e7410d` and nothing is outstanding locally. The live site runs it;
verify with `docker exec amiexpress-bbs cat /app/.git-sha`.

The working tree carries unrelated noise that predates this work and should
NOT be committed: runtime logs (`Doors/ByteKiller/logs/`,
`web/backend/debug-display-flow.log`), node CallersLog/DoorLog churn, and a
large set of untracked door data files under `Doors/ACCV105/` and similar.
Add files by name, never `git add -A`.

Commits from this session, newest first:

| Commit | What |
|---|---|
| `0d4e7410d` | docs changes no longer trigger a deploy |
| `a3634f823` | mute menu labels invert from state |
| `b7e14bec9` | mouse-motion throttle - the live outage fix |
| `6f46d14c8` | deploy verification ignores stripped door sources |
| `760addd31` | wait for `.sync-complete`; box-filter video shrinking |
| `fee2809a0` | door sync by tar |
| `360acd9ff` | `packages/terminal` build fix |
| `4ba4f7f78` | video cells + delta codec |
| `a4bb80281` | PCM voice audio, `/mic` |
| `460eff393` | voice channel routing, roster, meter |

## G2. Other notes

- A peer Claude session works in this same checkout. `git fetch` and check
  both directions before pushing.
- Live: `https://bbs.uprough.net`, host `root@89.167.21.154`, key
  `~/.ssh/hetzner_deploy`, port 22. Pushing to `main` auto-deploys; verify
  with `docker exec amiexpress-bbs cat /app/.git-sha`.
- Dev: `./dev/scripts/start-servers.sh --bbs-only`. Zombie-verify after
  every stop - eleven backend processes were found running at once, only one
  bound to the port.
