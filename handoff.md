# Handoff

## Recent Work
- 68K doors: Clear screen + reset scroll region before door launch (6601ad85d)
  - Fixes RTW node 01 shifting down every refresh, dRE!WAll layout issues
  - Sequence: ESC[r + ESC[2J + ESC[H in door.handler.ts before 68K door start
- SDK: Fixed stale border artifacts in slow connection mode
- Grandmaster: effects, music, J piece, ghost piece, column overlap fixes

## Key Decisions
- ALWAYS fix at SDK level when possible, not in individual doors
- Effects rendered inline in board content loop (no overlay boxes)

## Active State
- Clear screen fix committed (6601ad85d), needs testing with RTW and dRE!WAll
- RTW redraw may still have a 2-row offset (skip count mismatch with initial draw)
- dRE!WAll uses absolute positioning so clear screen should fully fix it
