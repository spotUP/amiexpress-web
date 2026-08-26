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

## G. Other notes

- A peer Claude session works in this same checkout. `git fetch` and check
  both directions before pushing.
- Live: `https://bbs.uprough.net`, host `root@89.167.21.154`, key
  `~/.ssh/hetzner_deploy`, port 22. Pushing to `main` auto-deploys; verify
  with `docker exec amiexpress-bbs cat /app/.git-sha`.
- Dev: `./dev/scripts/start-servers.sh --bbs-only`. Zombie-verify after
  every stop - eleven backend processes were found running at once, only one
  bound to the port.
