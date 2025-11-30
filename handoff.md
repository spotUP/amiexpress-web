# Handoff (condensed)

## Latest prompts
- Recent asks: "commit and push to github", "stage everything", worry about `Screens/quicknew.txt` being ~100 MB and a stray `Screens/quicknew.tx` to remove (not present on disk).
- Ongoing guidance: avoid hacks, match real Amiga behavior; vamos traces are acceptable for reference.

## Updates 2025-11-30
- Guard now measures time since last progress: `DoorLifecycleManager` tracks the last trap/time and only trips when no traps occur for `loopGuardLimit` iterations **and** beyond `AEDOOR_PROGRESS_TIMEOUT_MS` (default 5000 ms). This prevents active doors from hitting the guard while still catching tight CPU-only loops.
- QuickNew verified with guard **enabled** (loopGuardLimit default 500000) and stdout redirected:
  - Command: `cd web/backend && AEDOOR_DISABLE_GUARD=0 AEDOOR_STDOUT=screens:quicknew.txt AEDOOR_ROM=kickstart npx tsx src/scripts/run-amiga-door.ts ../../Doors/QuickNew/QuickNew 1 doors:quicknew/quicknew.config1`
  - Completed cleanly (PC returned into stack bounds) after ~18M iterations. Output now at `Screens/quicknew.txt` (6 KB, ANSI).
  - Files touched: `Doors/QuickNew/QuickNew.Config1`, `Screens/quicknew.txt`, and `BBS:Conf2/Dir1` … `Conf11/Dir1`, `Conf11/Dir2`.
- Vamos reference: with `-V BBS:/Users/spot/Code/amiexpress-web` and other assigns, QuickNew prints the expected bulletin lines; earlier timeouts were due to max-cycle caps.
- No `Screens/quicknew.tx` exists (`find Screens -maxdepth 1 -name 'quicknew.tx*'` returned only `quicknew.txt`).

## Testing this session
- `cd web/backend && npx tsc --noEmit`
- QuickNew guard-on run above (writes 6 KB to `Screens/quicknew.txt`)

## Next steps
- Decide if `Screens/quicknew.txt` should stay tracked; it is now small enough to commit. No stray `quicknew.tx` to delete.
- If further guard tuning is needed, adjust `AEDOOR_PROGRESS_TIMEOUT_MS` or log guard trigger data (now includes iterations/time since last progress).
