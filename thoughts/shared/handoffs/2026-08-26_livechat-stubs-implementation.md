---
date: 2026-08-26
topic: LiveChat - implementing the surveyed stubs and unfinished features
tags: [livechat, doors, context-menus, voice, video, deploy]
status: final
---

# Handoff: implement the LiveChat stubs

The previous session fixed voice and video end to end and, along the way,
surveyed what in LiveChat is offered to the user but does not work. This
document is for the session that implements them.

Read `thoughts/shared/plans/2026-08-26-livechat-todo.md` alongside this; it
carries the same list with the reasoning, and it is the file to update as
items land.

## Task

Implement the features LiveChat advertises and does not deliver. The list
below is from reading the source, not from memory - each item names the file
and what is actually there now.

The governing principle for the whole task: **a menu entry that does nothing
is worse than no entry**. Anything not implemented in this pass should be
removed from its menu rather than left printing "(not implemented yet)".

## What is actually stubbed

### User context menu (`Doors/livechat/features/context-menus.ts`)

Built in `scm()`, handled in the switch below it.

| Entry | State |
|---|---|
| Add Note | prints `Add note for X (not implemented yet)` |
| View History | prints `Viewing message history for X (not implemented yet)` |
| Whois | reported as doing nothing - handler needs reading |
| View Profile, Send Message, Mention | work |
| Mute / Ignore / Block | work, and now label themselves correctly |

`Add Note` needs somewhere to store a note (per-user, probably per-sysop).
`View History` depends on the chat-history question below.

### Chat message menu (same file)

| Entry | State |
|---|---|
| Copy Text | prints "Copy to clipboard (not available in terminal)" |
| Mark Unread | prints "Marked as unread", `// TODO: Mark channel as having unread messages` |
| React, Pin Message, Delete, Edit | print a confirmation; the SERVER SIDE IS MISSING |

The door half of reactions/pin/delete exists: `ui/chat-row-map.ts` maps a
click row to a message index, which was written precisely because the menu
"knew a click had happened and nothing about what was under it". What is
absent is backend handlers for those actions. Check
`web/backend/src/handlers/chat/` before writing anything.

### Channel menu (same file)

`// TODO: persist a local pinned-channels list in prefs` - Pin Channel does
nothing durable.

### Commands

- `/msg @dino test` reported silent, while the context menu's Send Message
  works. Two paths to one feature; compare `commands/msg-dm.ts` with what
  the menu does. Command results reach the world through
  `handlers/input-submit-handler.ts`, which turns a result's `data` into an
  action - `selectMicDeviceId` there is a worked example of that plumbing.
- `/customemoji` prints "Custom emojis feature coming soon!"
  (`commands/emoji.ts`).

### Other

- **No way to create a channel** from the UI at all.
- **Chat history is not preserved.** Confirmed by the user as never having
  worked - a gap, not a regression. There is no database under
  `Doors/livechat` on the live volume. Decide where history should live
  before implementing; this also unblocks View History and Mark Unread.
- `core/renderer.ts` has two TODOs about `formatTopBar` awaiting a screen
  module refactor.
- `features/voice-chat.ts` has TODOs to route notifications and errors into
  the livechat notification system.

## Known UI faults, not stubs

- Panel hover highlights only on the border, not inside it, and the
  resize-edge colours are gone. Machinery is in
  `sdk/engines/ui/blessed/widgets/dockable-panel.ts`:
  `mouseenter`/`mouseleave` set `isPanelHovered`, `applyBorderHoverStyle()`
  paints from `currentHoverEdge`/`currentResizeEdge`.
  **Suspect first**: the mouse-motion throttle added this session
  (`web/backend/src/doors/input-motion-throttle.ts`, 40ms) may be coarse
  enough to lose enter/leave transitions. Lower it or exempt transitions
  before rewriting anything in the widget.
- The sidebar loses its border after being dragged. DockablePanel captures
  `_originalBorderColor` once at construction and restores it on
  mouseleave, defaulting to `'blue'`.
- The focus outline differs between the message input and the sidebar.

## Critical references

- `Doors/livechat/features/context-menus.ts` - every menu and its handler
- `Doors/livechat/core/mute-list.ts` - `muteMenuLabels` / `muteLevelForLabel`,
  the pattern to copy for any other stateful menu entry
- `Doors/livechat/ui/chat-row-map.ts` - row to message mapping
- `Doors/livechat/handlers/input-submit-handler.ts` - command result to action
- `web/backend/src/doors/client-door-bridge.ts` - browser input to door
- `thoughts/shared/plans/2026-08-26-livechat-todo.md` - the living list

## Learnings from this session

**A door cannot call a server handler by emitting on its socket.** That
direction is server to client. Anything a door needs the server to do must
be intercepted in `web/backend/src/handlers/door.handler.ts`, as `room:join`
and now `voice:*` are. This silently broke voice channels for their whole
existence: the backend logged zero joins, ever.

**`packages/terminal` compiles the SDK sources under its own stricter
tsconfig, and it gates the Docker build.** `sdk`, `Doors/livechat` and
`web/backend` can all typecheck green while the deploy fails. Typecheck it
before pushing anything under `sdk/`.

**Verification must wait for the entrypoint, not for `/health`.** Health
answers while the entrypoint is still copying files. The entrypoint now
writes `.sync-complete` and the workflow waits for it.

**The entrypoint deliberately deletes door `.ts` sources** after syncing,
because production runs `dist/`. Any check comparing image against volume
must exclude them, or it can never pass.

**Never trust the client to throttle.** Mouse motion was forwarded and
logged per event with no server-side limit; moving a pointer over `/chat`
blocked the event loop and took the live site down while the container
still reported itself up.

**Measure before optimising, and measure the right thing.** The video work
was driven by numbers (21 KB/frame at 2.3 fps), but the cell cap was later
raised to 8,000 on bandwidth evidence alone, with no CPU measurement on the
VPS. That is still unverified under load.

## Recent changes (all pushed)

Voice: door-to-server routing, roster, participant count, speaking
indicator, microphone meter. Audio: PCM transport replacing undecodable
MediaRecorder fragments, jitter buffer, `/mic` device selection. Video:
cell + delta codec (21 KB to under 2 KB a frame), keyframes, viewer-chosen
render mode, ANSI dithering, box-filtered downscaling. Deploy: tar sync,
`.sync-complete` marker, corrected verification. Plus the mouse-motion
throttle and the mute menu labels.

## Next steps, in order

1. **Verify the two live fixes**, both untested by the user: the audio
   jitter buffer (clicks) and the mouse-motion throttle (which may have
   made panel hover worse). Do this before building on top of them.
2. **Decide where chat history lives.** It unblocks View History, Mark
   Unread and the history question generally.
3. **Do the context menus in one pass**, not entry by entry: implement or
   remove. Reactions, pin and delete need backend handlers.
4. **Fix `/msg`** by making it share the context menu's path rather than
   duplicating it.
5. **Channel creation** in the sidebar.
6. Panel hover and the sidebar border.
7. `/customemoji`.

## Other notes

- A peer Claude session works in this same checkout. `git fetch` and check
  both directions before pushing.
- Live: `https://bbs.uprough.net`, host `root@89.167.21.154`, key
  `~/.ssh/hetzner_deploy`, port 22. Pushing to `main` auto-deploys; verify
  with `docker exec amiexpress-bbs cat /app/.git-sha`.
- Dev: `./dev/scripts/start-servers.sh --bbs-only`. Zombie-verify after
  every stop - eleven backend processes were found running at one point,
  only one bound to the port.
