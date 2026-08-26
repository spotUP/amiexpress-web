---
date: 2026-08-26
topic: LiveChat outstanding issues
tags: [livechat, video, voice, ui]
status: draft
---

# LiveChat todo

Collected during the 2026-08-26 voice/video session. Items marked DONE were
fixed in that session and are listed only so the history is readable.

## Open

### Qwan locked out of chat: "requires higher access" - CAUSE MEASURED
Reported 2026-08-26. Confirmed from the live logs and the live database, not
inferred.

**The evidence:**

```
 In PROCESS_COMMAND state, executing command: CHAT
[SYSOP DEBUG] COMMAND: Access denied for command: CHAT
{ "userSecLevel": 0, "requiredAccess": 20 }
```

Five times. Meanwhile the live database says:

```
username  seclevel  confaccess  newuser  calls
Qwan      30        XXX         1        1
```

**The session had secLevel 0 while the account has 30.** So this is not a
permissions setting to change - the level never reached the session.

Not a column-mapping fault: `mapUserFromDb`
(`web/backend/src/database/user-repository.ts:199`) maps `seclevel` ->
`secLevel` for BOTH `getUserById` and `getUserByUsername`, and every place
that builds `session.user` (`chat-only-login.handler.ts:38`,
`index.ts:773-777`, `login-post.service.ts:135`) carries it. A session
holding a correctly-mapped user cannot read 0.

`command-execution.handler.ts:409` is
`session.user?.secLevel || 0` - which yields 0 when **`session.user` is
undefined**. So the CHAT command ran on a session with NO logged-in user.

**Leading hypothesis** (fits every line of evidence, not yet reproduced):
the browser reconnected, got a FRESH anonymous session (Node21 in the log),
and something from the still-running door client was routed into the BBS
command handler:

```
[socket-handlers] ✗ NOT in door or no handler - routing to BBS command handler
[handleCommand] ENTRY: data="" subState=process_command
```

Note `data=""` - an EMPTY input produced a CHAT command. Nobody typed that.
On a session with no user, the access check denies and the user is told they
need higher access, when the truth is that they are not logged in.

**To confirm**: reproduce by reconnecting a /chat session (or deploying while
one is open, which is what the restart-notice work is about) and watch
whether a CHAT command is executed against a userless session.

**Two separate faults are visible here even so:**
1. Whatever replays CHAT with empty input on a session that has no user.
2. The message itself. "Command requires higher access." for a session with
   no user at all is wrong and unactionable - it should say the session is
   not logged in. That is what sent the user chasing an access level.

### Change the default video render mode from halfblock to coloured ASCII
The user's judgement after using all of them: halfblock is the least nice of
the modes, and coloured ASCII should be what people get without choosing.

Three places seed the default, and they must agree or the header will
disagree with what is actually being rendered:

- `web/backend/src/handlers/audio-video.handler.ts:259` -
  `mode = 'halfblock'` (the destructuring default, used when a client sends
  no mode at all)
- `Doors/livechat/server.ts:1275` - `currentRenderMode`, which seeds the
  header text
- `Doors/livechat/features/voice-channel-ux.ts:478` - `renderMode`

Note the mode names are not spelled the same on both sides: the backend
switch takes `'ascii' | 'hsv' | 'braille' | 'superres' | 'halfblock' |
'shape'`, and the door tracks `'ascii' | 'color' | 'halfblock' | 'braille'`.
Check which string the door's "coloured ASCII" actually sends before changing
a default to it - the door's `'color'` and the backend's `'hsv'`/`colored`
flag need to line up, or the default will silently fall through to the
backend's own fallback.

### Emoji picker: some cannot be sent, and Enter inserts a second one
Two reports from 2026-08-26, probably one bug each, in the same feature.

**(a) Some emojis never reach the chat.** The user's guess is that it depends
on the characters the emoji starts with. Most likely cause: these are ASCII
emojis, and the input box renders with blessed tags enabled - blessed eats
`{...}` as a tag, so any emoji containing a brace disappears or corrupts the
line. `/` as a first character is the other candidate: a line starting with
`/` is parsed as a COMMAND, so an emoji inserted into an empty input could be
swallowed by the command parser instead of sent.
Check which emojis fail and what their first characters are before fixing -
brace-eating and command-parsing need different fixes.

**(b) Enter after picking inserts a SECOND emoji and sends nothing.** The
picker registers its selection callback inside `show()`
(`Doors/livechat/ui/emoji-picker.ts:84` - `this.picker.onSelect(...)`), and
`show()` is called from three places (`server.ts:305`, `server.ts:2571`, and
the `/emoji` command). If those registrations accumulate on the same list
widget, one selection fires several callbacks - which is exactly "I get
another one". The same class of fault as the type-ahead listener bug: patching
or re-adding a blessed list handler without removing the previous one.
That the message is then NOT sent points the same way: the Enter is being
consumed by the still-listening picker rather than reaching the input box.

Both insert with
`inputBox.setValue(currentText + (emoji.display || emoji.code) + ' ')`, which
bypasses the widget's own cursor bookkeeping - worth checking whether the
input's internal state agrees with the value it was handed.

### A text effect applied mid-sentence breaks the log rendering
Reported 2026-08-26 on the live site. Selecting part of a line and applying
an effect (rainbow / pulse / sparkle / shake / wave / gradient) renders the
chat log broken. Wrapping a whole line reportedly works, so the fault is in
handling an effect that has static text on BOTH sides of it.

Where to look, in the order the text travels:

1. `Doors/livechat/ui/format-picker.ts:29-35` - each effect wraps the
   SELECTION in `~name~...~/name~`, so a mid-sentence apply produces
   `static ~pulse~mid~/pulse~ static` on one line.
2. `Doors/livechat/server.ts:1649-1697` - the picker's callback calls
   `inputBox.replaceSelection(wrappedText)`. Check the selection offsets are
   still right AFTER the wrap (the text got longer by the tag lengths).
3. `sdk/engines/ui/blessed/utils/animations/parser.ts:28` -
   `ANIMATION_TAG_REGEX` handles leading/trailing static segments in
   principle; `hasAnimationTags` and `stripAnimationTags` both reset or
   avoid `lastIndex`, so the classic module-level `/g` reuse bug does NOT
   look present here. Confirm rather than assume.
4. `Doors/livechat/server.ts:1938-1945` - `rebuildChatContent()` substitutes
   `animationManager.getRendered(idx)` for the WHOLE line. If a rendered
   frame ever loses or repeats the static segments around the effect, this
   is where a half-line would turn into a broken line.

Measure first: feed one mid-sentence line through `parseAnimationTags` and
`renderSegments` in isolation and print the segments. If the segments are
right, the fault is downstream in the log substitution, not the parser -
those two need different fixes.

Possibly the same root as the duplicate-nick report below; do not assume so.

### A user reported seeing the nick twice
Reported 2026-08-26 on the live site (which does NOT yet have the
2026-08-26 door-ownership fix - see below). One user saw the reporter's
nickname rendered twice.

Three candidates, cheapest first:

1. **The double-paint class.** The door renders each message from the
   structured `chat:message` event AND the backend can also broadcast the
   same message as raw ANSI. `broadcastAnsiToRoom` guards against this with
   `doorOwnsTerminal(memberSession)`
   (`web/backend/src/handlers/chat/group-chat.handler.ts`). This is exactly
   the shape of the 2026-08-25 report where the same message appeared twice
   in two colours.
2. **Formatting.** `formatMessage` / `highlightMentions` in `server.ts` -
   a nick that also matches a mention could be emitted by both.
3. **The animated-line substitution** at `server.ts:1938-1945`, if a
   rendered frame carries the `[time] <nick>` prefix that the static line
   already has.

Ask the reporter which it was: the nick twice on ONE line (formatting or
animation), or the whole message twice (the double-paint class). Those point
at different code and the screenshot settles it in one step.

### Voice audio still stutters - CONFIRMED after the jitter buffer (2026-08-26)
Reported live while the user was in a real two-person call: "very sturrey
audio". This is AFTER the jitter buffer (`sdk/media/pcm.ts` `scheduleStart`,
80ms lead, 400ms cap) shipped, so that fix did NOT solve it and the earlier
report no longer counts as predating a fix.

Next suspect, per the previous session's own note: `ScriptProcessorNode` runs
on the MAIN thread, alongside video encode and the blessed redraw. Any main
thread stall drops audio frames, which is exactly what a robot stutter sounds
like. The fix is an `AudioWorklet` (loadable from a Blob URL, so it still
works with no separate asset to serve).

Before writing any of it, MEASURE: log inter-arrival time of `audio:data` at
the receiver and the underrun count at the ring buffer, so it is clear
whether frames arrive late (network/pacing) or arrive on time and are played
late (main-thread starvation). Those two have different fixes and the
symptom sounds the same.

### Stale users in the sidebar (cause found) - STILL HAPPENING 2026-08-26
Reported again: coffe and DiNO still shown online when they are not.

The live log shows the mechanism directly - `room:joined` carries the full
membership every time anyone joins:

```
Sending room:joined to !cyke : {"memberCount":6,"members":[
  {"username":"coffe"},{"username":"DiNO"},{"username":"Qwan"},
  {"username":"spot"},{"username":"Varin0x"},{"username":"!cyke"}]}
```

That is everyone who has EVER joined the room, and the door marks every one
of them `status: 'online'`.

Reported with a screenshot: three users listed online when only one was.
`handlers/room-socket-handlers.ts` fills `onlineUsers` from `d.members` on
`room:joined` and marks every one `status: 'online'` - but membership is
everyone who has EVER joined the room, not who is connected now. `ou.delete`
only fires for somebody who leaves while you are watching. Either the server
sends presence, or the door cross-references `presenceService` before
rendering.

### Text selection marks the whole terminal
Selecting chat log text to copy also selects everything else on screen, so
the paste is unusable.

### Login button sits one row too high
`ui/login-modal.ts`, shown by `chat-only-login.ts`, on /chat.

### /msg does not send, though the context menu does
`/msg @dino test` appears to do nothing, while right-clicking a user and
choosing to send a message works. Two paths to the same feature, one of
them broken - compare what the context menu does with what the `/msg`
command handler does (`Doors/livechat/commands/msg-dm.ts` and the
`selectMicDeviceId`-style result plumbing in
`handlers/input-submit-handler.ts`, which is where a command's `data` is
turned into an action).

### Mute/Ignore/Block labels never say "un-"
Muting works - `toggleMute` flips the state and choosing the same level
again lifts it - but the menu still reads "Mute User", so there is no way
to tell whether somebody is muted, and the only way back looks like the
way in.

The cause is that the item list is a fixed array built without consulting
the mute state (`Doors/livechat/features/context-menus.ts`, `scm()`):

    its.push('View Profile', ..., 'Mute User', 'Ignore', 'Block');

`extras.muteList` is available in the same scope and `core/mute-list.ts`
can already report a user's level. Small fix: label each entry from the
current level.

### Right-click "Add Note" and "View History" are stubs
Both print "(not implemented yet)" and do nothing -
`Doors/livechat/features/context-menus.ts` around the `Add Note` and
`View History` cases. They are offered in the menu as though they work, so
either implement them or stop listing them. A note needs somewhere to live
(per-user, per-sysop) and history needs the chat history question below
answered first.

### Right-click "whois" does nothing
Same menu, different entry. Check whether the handler is wired at all or
whether it is another case of the menu knowing a click happened but not
what was under it - the row-to-message mapping in `ui/chat-row-map.ts` was
added for exactly that class of bug on the chat log.

### Panel hover only highlights on the border, not inside it
Hovering anywhere inside a panel used to highlight it, and edges used to
colour to show they can be resized. Now only the border itself responds.
`sdk/engines/ui/blessed/widgets/dockable-panel.ts` has the machinery -
`mouseenter`/`mouseleave` set `isPanelHovered`, and
`applyBorderHoverStyle()` paints per-edge colours from
`currentHoverEdge`/`currentResizeEdge`. Worth checking whether the
mouse-motion throttle added on 2026-08-26 (see
`web/backend/src/doors/input-motion-throttle.ts`) is coarse enough to be
losing enter/leave transitions, and whether `mouseenter` fires for the
panel body now that children cover it.

### Sidebar loses its border after being dragged
`_originalBorderColor` is captured once at construction in DockablePanel
and restored on mouseleave, defaulting to 'blue' when it cannot find one.
Check what the panel's style looks like after a drag.

### Chat history is not preserved
Confirmed as never having worked, so this is a gap rather than a
regression. There is no database under `Doors/livechat` on the live volume
at all; decide where history should live before implementing.

### How to create new channels
No obvious path in the UI. `/join` creates a room server-side, but there is
no channel-creation affordance in the sidebar.

### Focus outline is inconsistent between panels
The message input draws a white outline on hover/focus; the left panel
(sidebar) does not. Both should follow the same rule, whatever it is -
either every focusable panel shows the focus colour or none does.

Theme constants live in `Doors/livechat/ui/theme.ts`
(`PANEL_BORDER` = gray, `PANEL_BORDER_FOCUS` = white). Check where each
panel resolves its border style: blessed takes the colour from
`style.border` > `border.style` > `style.fg`, and a colour set on the
`border` OBJECT is ignored - which has already bitten this codebase once.

### Video: remaining optimisation
Done so far: one byte per cell, run-length + delta encoding, keyframes every
30 frames, resolution capped by a cell budget, no self-echo. Frames went
from ~21 KB to 11-206 bytes.

Still open:
- **WebRTC for the browser fullscreen chat.** The BBS terminal view must
  stay ASCII - a terminal cannot show anything else - but the browser view
  has no reason to be ASCII at all. Real video there, ASCII in the BBS.
- **GPU encode.** The pixel-to-cell quantisation is embarrassingly parallel
  and `getImageData` reads back at full resolution. A WebGL2 shader could
  quantise on the GPU and return one texel per cell, shrinking the readback
  by the pixels-per-cell factor. Worth measuring only AFTER the bandwidth
  work, since bytes - not encode time - were the limit.
- **Keyframe on join.** A viewer who joins mid-stream currently waits up to
  the keyframe interval (~3s) for a picture. The sender could send one
  immediately when somebody joins the channel.

### Debug tracing to remove before committing
Frame tracing added while diagnosing the binary path, throttled to the first
few and every hundredth:
- `web/backend/src/handlers/audio-video.handler.ts` - `[Video][cells]`
- `Doors/livechat/features/voice-channel-ux.ts` - `cells: frame` /
  `cells: dropped`

The frame-encode error reporting in `Doors/livechat/client.ts` should STAY:
an exception in the encode loop used to kill video silently for the rest of
the session.

## Done 2026-08-26

- Voice channels never worked: a door cannot reach a server handler by
  emitting on its socket (that direction is server->client). `voice:*` now
  routed through `door.handler.ts` like `room:join`.
- Roster, participant count, speaking indicator, microphone level meter.
- Peer audio had never been audible: MediaRecorder fragments cannot be
  decoded standalone. Replaced with raw PCM (16 kHz Int16), which also made
  the WebMediaPlayer exhaustion crash structurally impossible.
- Amplification loop: inbound `video:frame` / `audio:data` were re-emitted
  with the forwarding `emit`, bouncing every packet back to the server.
- Colour hysteresis: camera noise was ~70% of the payload.
- Frames now pad to fill their tile, so old video cannot linger around a
  smaller picture.
