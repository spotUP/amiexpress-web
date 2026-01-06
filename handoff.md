# Handoff
## Current State (2026-01-06)
- J now registers and queries BBS (JH_REGISTER, RAWARROW, SV_NEWMSG, JH_SYSOP, DT_* etc), but still crashes after BB_CONFNUM reply.
- Backend no longer injects INIT/STAT for native AEDoor.library; door messages now come from native AEDoor.
- DEBUG_68K run shows crash right after dos.library Lock("ENV:JC_PWFAIL.2") fails; PC jumps out of code region and A6 changes to 0xd0000.
- A5 changes to 0x100038 at PC=0xaffac (dos.library stub area) just before the bad PC jump.

## Recent Work
- Added native library flags + `isLibraryNative()` to `web/backend/src/amiga-emulation/api/ExecLibrary.ts`.
- Skipped INIT/STAT injection (and fallback) when AEDoor.library is native in `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`.
- Ran J via telnet with `DEBUG_68K=1` to capture A4/A5/A6 transitions and LockTrace context.

## Notes
- Reference: `Documentation/4-Door-Developers/archive/AEDoor_LIBRARY_NOTES.md` says AEDoor.library sends INIT then STAT via PutMsg at init.
- DEBUG_68K log snippet:
  - BB_CONFNUM reply sent, then `Lock("ENV:JC_PWFAIL.2")` fails.
  - Immediately after, A5 changes at PC=0xaffac, then PC jumps to 0x1d9aaa and A6 changes to 0xd0000.
  - Crash loop shows PC in 0xc0xxxx–0xc7xxxx (data region), stack contains 0x2002ec.

## Next Steps
- Inspect dos.library call handling around PC=0xaffac (likely an LVO stub) to see why A5 changes to 0x100038.
- Verify if any dos.library handlers or trap plumbing can clobber A5/A6 (or use wrong register indices).
- Consider adding targeted watchpoints/logging around stack and A5 changes near Lock failure.

## Last Prompts
- “ok i ran j, it exited”
- “i don't know what to do, i want you to debug this as autonomous as you can just solve it, get j running”
