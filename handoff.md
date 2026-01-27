# Handoff - 2026-01-27

## Completed: BBSLink Integration

### TELNET_CONNECT (XIM 706) - COMPLETE
Implemented in `web/backend/src/amiga-emulation/XIMProtocol.ts`:
- TCP connection to remote telnet servers
- Telnet IAC protocol filtering
- Auto-login support via TELNET_USERNAME/PASSWORD commands
- ESC key disconnects session
- Blocking call (emulator pauses until session ends)

### BsdSocketLibrary fd_set Fix - COMPLETE
Fixed `web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts`:
- Changed bit indexing from `31 - (fd % 32)` to `fd % 32`
- WaitSelect now correctly detects ready sockets

### BBSLink TypeScript Door - WORKING
The TypeScript BBSLink door at `Doors/bbslink/` is now the primary implementation:
- Command: `BBSLINK` (renamed from LINKMENU)
- Game-specific commands also work: LORD, LUNA, TW2002, etc.
- Config: `Doors/bbslink/bbslink.cfg` with SYSCODE, AUTHCODE, SCHEMECODE

### 68K Door Removal - COMPLETE
- Removed old 68K bbslink and bbslinkwall binaries from `Doors/bbslink/`
- Renamed command from LINKMENU to BBSLINK
- Updated `Commands/BBSCmd/bbslink.info` with new command name
- Updated door metadata in `index.ts`

### BBSLink Credentials (in Doors/bbslink/bbslink.cfg)
- SYSCODE=uprough
- AUTHCODE=Z9cqbH1LX2vI
- SCHEMECODE=RXy8MhGaPw9k

## Key Files
- `web/backend/src/amiga-emulation/XIMProtocol.ts` - TELNET_CONNECT handler
- `web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts` - Socket implementation
- `Doors/bbslink/index.ts` - TypeScript BBSLink door
- `Doors/bbslink/bbslink.cfg` - Credentials config
- `Commands/BBSCmd/bbslink.info` - Command registration
