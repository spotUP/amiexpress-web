# Latest Work Summary
- Keystrokes from the terminal were only being queued for XIM/AEDoor commands. Bulls’ intro is done via plain DOS `Input()`, so it never saw the ENTER key and immediately bailed. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` now also feeds `door:input` data into `dos.library` whenever the XIM stack isn’t in a `JH_LI/GETKEY` wait, letting DOS-based prompts work for both XIM and SIM doors. Rebuilt the backend (`cd web/backend && npx tsc -p tsconfig.json`) so `dist/` picks up the change.
- Earlier fixes still in place: `pr_CLI` is left zeroed until the door creates its own port, and ExecBase now maintains a real `PortList` so doors that scan `SysBase->PortList` can locate `AEDoorPort%d`.
- Remaining issue: even after feeding stdin, Bulls still stops after the banner because it never issues XIM commands (see `/tmp/bulls-test2.log`). Need to keep tracing the message flow to understand what structure it expects next.

## Recent User Prompts
1. “ok go on”
2. “Starting B... (Press ENTER to continue...)”
3. “proceed”
4. “proceed”
5. “proceed”
6. “dude debug the Bulletin door that is started with the B command”
7. “yes script it to the logoff if that is what we need”
8. “ok how do we test? … do it for me”
9. “ok so, use this to debug it then”
10. “SanctuaryBBS/ should have the logoff script”
