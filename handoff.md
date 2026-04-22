# Handoff

## Recent Work
- Grandmaster bug fixes (3400f242e):
  - Hold key fixed (sonicDrop optional chaining crash in keyToAction)
  - Game over dialog no longer destroys playfield border
  - Pause menu: ESC/Q=quit, P=resume, fixed listener leak
  - High score column alignment and personal best overflow fixed
  - Settings now persist per BBS user (data/settings-{user}.json)
  - Settings list scrollable, TetriNET connect dialog border fix
- 68K doors: Clear screen before launch (6601ad85d)

## Key Decisions
- ALWAYS fix at SDK level when possible, not in individual doors
- Effects rendered inline in board content loop (no overlay boxes)

## Remaining Grandmaster Issues
- TetriNET menu focus may still be lost (needs testing)
- Unify animations/sounds to TetriNET mode (low priority)
- app.ts at 2345 lines - needs refactoring to stay under 2000
