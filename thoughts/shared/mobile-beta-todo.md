---
date: 2026-09-06
topic: Mobile beta findings - swipe controls and viewport
tags: [mobile, touch, grandmaster, arkanoid, viewport]
status: in-progress
---

# Mobile beta: what real phones found

From a beta with friends on iPhones and Androids, 2026-09-06. These are
reports from real devices, not hypotheses - each one names what was observed.

## 1. Arkanoid swipe is far too fast (strongest reaction)

The paddle moves much further than the finger does, so the game is not
playable. It has to be **1:1 with the finger**: a finger that travels N
screen-widths of distance moves the paddle N playfield-widths, with no
acceleration curve and no multiplier on top.

Getting this right is a measurement, not a taste: the mapping is
`paddleX = clamp(startPaddleX + (touchX - startTouchX) * (playfieldWidth /
screenWidth))`. Anything that scales by velocity will feel wrong however it is
tuned, because the finger IS the control surface.

Applies to every door where a swipe steers something continuously; check the
other arcade doors for the same multiplier before calling it done.

## 2. GRANDMASTER swipe works in single player only

Swipe controls do nothing in the multiplayer modes. Single player takes them.
Likely the versus/netplay screens never wire the touch handler the solo screen
installs - worth checking TETRIS ATTACK's versus screen too, which was written
later and may have the same gap.

## 3. Top of the screen cut off on ONE Android, fine on others

Same game, different phones: one Android user lost the top of the screen while
others did not. The users were on different browsers, so this is very likely a
viewport/safe-area difference rather than a layout bug -
`100vh` versus `100dvh`, or a browser chrome bar that overlays rather than
insets. Reproduce with the browser's device emulation before changing layout
maths.

## What has been done

**1. Arkanoid 1:1 - DONE.** The gain was 2.2: the paddle moved more than twice
as far as the thumb, which is why nobody could aim it. It is 1 now. The reach
problem that gearing was added for does not come back, because the mapping is
still RELATIVE - lift, re-plant, and the stroke continues - so a full traverse
is two sweeps rather than one long stretch.

**2. The Android cut-off - DONE, needs confirming on the phone.** It was not a
CSS unit. `visibleHeight()` already sized the terminal to the visual viewport,
which is why iOS was fixed in August. What nothing accounted for is where that
visible band BEGINS: a browser that INSETS its chrome leaves offsetTop at 0,
and one that OVERLAYS it pushes the visible area down instead, so content drawn
from the top of the layout viewport sits underneath the bar. That is precisely
why one Android user lost the top and others did not - they were on different
browsers. `visibleTop()` reads it and the handheld fit subtracts it; it is zero
on every browser that insets, so the phones that already worked cannot move.

**3. GRANDMASTER multiplayer swipe - EXPLAINED, and the cause was not the mode.**

The door was never the problem. Driven headlessly with a REAL InputHandler and
a real browser key edge, the versus screen moves the piece (x 3 -> 2): it
registers every action, pumps the handler each frame, and battle royale sets
the same 'game' screen state single player does. Game mode is re-enabled after
the lobby too.

What differs is the CLIENT, and not by mode: the control scheme defaulted to
the BUTTON PAD, and it is stored per browser. So whether a tester got swipes at
all depended on which browser they opened and whether anyone had ever chosen
gestures in it - which is also why "one android user had issues while it worked
for others, different browsers". The mode was a coincidence of when each tester
happened to try it.

Gestures are the default now. The buttons remain one tap away and the choice is
still remembered.

Worth noting for whoever picks this up: the existing versus tests pass an
`inputStub`, so nothing in the suite ever drove a real key edge into a
multiplayer screen. That is why this could only be answered by driving it.
