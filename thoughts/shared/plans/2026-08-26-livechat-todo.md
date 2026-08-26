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
