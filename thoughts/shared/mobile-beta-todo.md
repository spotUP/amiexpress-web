---
date: 2026-09-06
topic: Mobile beta findings - swipe controls and viewport
tags: [mobile, touch, grandmaster, arkanoid, viewport]
status: open
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

## Order to do these in

1. Arkanoid 1:1 swipe - it makes a shipped game unplayable, and the fix is
   small and measurable.
2. The Android viewport cut-off - it hides content, and it is one CSS unit.
3. GRANDMASTER multiplayer swipe - it is a missing wiring, not a broken one.
