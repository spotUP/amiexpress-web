# Latest Work Summary
- Disassembled `Libs/AEDoor.library` with radare2 (see `Docs/AEDOOR_LIBRARY_DISASSEMBLY_NOTES.md`) to capture the jump table and DIFace layout used by the original binary.
- Reimplemented `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` so CreateComm/DeleteComm build the real DIFace structure, Send*/Get* commands dispatch actual jhMessages through Exec, and Prompt/GetStr reuse the existing pause/resume flow.
- Added configurable loop guard (`AEDOOR_LOOP_LIMIT`) inside `AmigaDoorSession` so tests can run Bulls long enough to reach AEDoor prompts, and logged `AEDoorLibrary.prompt()` calls to verify the handshake.
- Ran `/tmp/test-door-bulls.js` (payload: `door:input` stub plus `AEDOOR_LOOP_LIMIT=5_000_000` and `BBS_ROOT=/Users/spot/Code/amiexpress-web`) to check Bulls door; the session ran 5M iterations but still hasn’t traced a `Prompt` invocation in the AEDoor library logs.

## Recent User Prompts
