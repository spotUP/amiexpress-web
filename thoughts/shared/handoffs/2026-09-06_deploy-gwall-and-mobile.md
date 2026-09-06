---
date: 2026-09-06
topic: Why every deploy failed, and the mobile control fixes
tags: [deploy, gwall, mobile, touch, zoom, grandmaster]
status: final
---

# Every deploy failed for the same reason, and it was not the code

From 13:04 today, every Deploy to Hetzner run failed. None of them failed for
the reason it was pushed: the container built, started and answered /health,
and then the door-sync verification aborted the run with

    ERROR: doors on the volume differ from the image:
    ./GWall/dist/index.js

**Two rules that contradict each other.** The entrypoint DELETES
`Doors/GWall/dist` on every start, deliberately - GWall was ported to
TypeScript, the port did not work out, the board runs the AmigaOS binary that
`Commands/BBSCmd/GWALL.info` names, and the port's remains would otherwise sit
beside it for ever because the volume sync only ever adds. The deploy verifier
then requires every file in the image to be present on the volume. So the
entrypoint removed the file by design and the verifier called its absence
drift, on a volume that was correct.

I copied the file onto the volume by hand first. That is the fix that looks
right and lasts exactly until the next boot deletes it again - worth knowing,
because it will look like it worked.

The root of it: the image shipped a build of an abandoned port. Git tracked
`Doors/GWall/dist/index.js`; it is gone now. The entrypoint's cleanup stays,
because volumes deployed before today still have their copy.

**If you see "doors on the volume differ from the image" again**, check
whether the entrypoint's leftover list (docker-entrypoint.sh, the GWALL block)
names something the image still ships. That pairing is always a deploy
failure, and always on a volume that is correct.

# Mobile

- **Arkanoid swipe is 1:1 now.** The gain was 2.2 - the paddle moved more than
  twice as far as the thumb. Still relative, so lift-and-replant continues a
  stroke and a full traverse is two sweeps rather than one long reach.
- **Gestures are the default control scheme.** They were opt-in and the choice
  is stored per BROWSER, which is why testers on different browsers silently
  got different controls and the ones on the pad reported that swiping "did not
  work". The buttons are still one tap away.
- **A pinch zooms the terminal, not the page.** The browser's pinch scales
  everything, and the on-screen keyboard is `position: fixed` - anchored to the
  layout viewport - so a pinch slid the keys off the screen. The terminal's own
  zoom is a font size and touches nothing else; the two-finger gesture drives
  that now.
- **visibleTop()** accounts for a browser that OVERLAYS its chrome rather than
  insetting it (offsetTop > 0), which is why one Android tester lost the top of
  the screen and others did not. Zero on browsers that inset, so the phones
  that worked cannot move.

# For session 01FDPyGTRZ

You have `4cd9b5ede` locally - the isCodesOnly + health-service restore. Main's
`typecheck:tests` is red without it (4 errors in tests/screens/*). I got as far
as three-way merging `bbs-health-check.service.ts` back myself before finding
your commit, and dropped mine rather than push a competing copy of the same
file. It is yours; please push it.

I did take DOORMAN's 80-column pin, which nobody had claimed: only the SGR half
moved, the glyph grid is byte-identical, so the theme changed border colours
and the layout is untouched.
