# AmiExpress Module Dependencies and Relationships

## Overview

This document outlines the dependencies and relationships between all modules in the AmiExpress system, including the new modular architecture introduced in 2025.

## Core Architecture

### Original Monolithic Structure (Pre-2025)
```
express.e (32,248 lines, 614 procedures)
├── All functionality in single file
├── Global variables and state
├── Tight coupling between components
└── Difficult maintenance and extension
```

### New Modular Structure (2025)
```
express.e (main entry point)
├── message_system.e (message handling)
├── user_management.e (authentication/accounts)
├── file_transfer.e (upload/download protocols)
├── network_communication.e (serial/telnet/modem)
├── session_management.e (commands/state)
├── ui_display.e (screens/statistics)
└── shared_data.e (constants/data structures)
```

## Module Interdependencies

### Shared Data Module (shared_data.e)
**Purpose:** Common constants, enums, and data structures
**Dependencies:** None (foundation module)
**Dependents:** All other modules
**Key Exports:**
- ACS_* access control constants
- STATE_* application states
- OBJECT definitions (user, confBase, zModem, etc.)
- ENUM definitions (LOG_*, RESULT_*, etc.)

### Message System Module (message_system.e)
**Purpose:** Message handling and conference operations
**Dependencies:**
- shared_data.e (data structures, constants)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (message structures)
- stringlist.e (string collections)
**Key Functions:**
- loadMessageHeader/saveMessageHeader
- loadMsg/saveMsg
- processMessages/processMci
- conferenceAccounting/conferenceMaintenance

### User Management Module (user_management.e)
**Purpose:** User authentication and account management
**Dependencies:**
- shared_data.e (user structures, access constants)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (user data structures)
- stringlist.e (string operations)
- pwdhash.e (password hashing)
**Key Functions:**
- loadAccount/saveAccount
- checkUserPassword/checkUserOnLine
- processLogon/processLoggedOnUser
- updateAllUsers/updateCallerNum

### File Transfer Module (file_transfer.e)
**Purpose:** File operations and transfer protocols
**Dependencies:**
- shared_data.e (transfer structures, constants)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (file data structures)
- stringlist.e (string operations)
- ftpd.e (FTP protocol)
- httpd.e (HTTP protocol)
- zmodem.e (ZModem protocol)
- xymodem.e (X/YModem protocols)
- hydra.e (Hydra protocol)
**Key Functions:**
- downloadAFile/uploadaFile
- ftpDownload/ftpUpload
- httpDownload/httpUpload
- checkFileConfScan/checkForFile

### Network Communication Module (network_communication.e)
**Purpose:** Serial, telnet, and modem communication
**Dependencies:**
- shared_data.e (communication constants)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (communication structures)
**Key Functions:**
- openSerial/closeSerial
- checkTelnetConnection/telnetConnect
- modemOffHook/checkCarrier
- waitSerialRead/waitSocketLib

### Session Management Module (session_management.e)
**Purpose:** Command processing and session state management
**Dependencies:**
- shared_data.e (session constants, states)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (session structures)
- stringlist.e (string operations)
**Key Functions:**
- processCommand/processInputMessage
- handleMenuPick/handleIemsi
- checkInput/checkTimeUsed
- updateMenus/updateTitle

### UI Display Module (ui_display.e)
**Purpose:** Screen display and statistics management
**Dependencies:**
- shared_data.e (display constants)
- axcommon.e (common functions)
- axconsts.e (system constants)
- axobjects.e (display structures)
- stringlist.e (string operations)
**Key Functions:**
- openExpressScreen/closeExpressScreen
- initStatCon/initZmodemStatCon
- translateText/loadTranslators
- saveHistory/loadHistory

## External Library Dependencies

### System Libraries (All modules)
```
MODULE 'intuition/screens','intuition/intuition','intuition/gadgetclass'
MODULE 'exec/ports','exec/nodes','exec/memory','exec/alerts','exec/semaphores'
MODULE 'devices/console','devices/serial','graphics/view'
MODULE 'gadtools','libraries/gadtools','dos/dos','dos/var','dos/dosextens'
MODULE 'dos/datetime','dos/dostags','graphics/text','libraries/diskfont'
MODULE 'diskfont','devices/timer','exec/io','exec/tasks'
MODULE 'icon','workbench/workbench','commodities','exec/libraries'
MODULE 'libraries/commodities','asl','workbench/startup','rexx/storage'
MODULE 'rexxsyslib','libraries/asl','devices/serial'
```

### Network Libraries
```
MODULE 'socket','net/socket','net/netdb','net/in','fifo','owndevunit','asyncio','libraries/asyncio'
```

### Protocol Libraries
```
MODULE 'xproto','xpr_lib'
```

### Security Libraries
```
MODULE 'amissl'
```

## Build Dependencies

### Compilation Order
1. **Foundation modules** (compile first):
   - axcommon.e → axcommon.m
   - axconsts.e → axconsts.m
   - axenums.e → axenums.m
   - axobjects.e → axobjects.m
   - stringlist.e → stringlist.m

2. **Utility modules**:
   - MiscFuncs.e → MiscFuncs.m
   - errors.e → errors.m
   - tooltypes.e → tooltypes.m
   - pwdhash.e → pwdhash.m
   - bcd.e → bcd.m
   - sha256.e → sha256.m

3. **Protocol modules**:
   - zmodem.e → zmodem.m
   - xymodem.e → xymodem.m
   - hydra.e → hydra.m
   - ftpd.e → ftpd.m
   - httpd.e → httpd.m
   - mailssl.e → mailssl.m

4. **Data processing modules**:
   - qwk.e → qwk.m
   - ftn.e → ftn.m
   - jsonParser.e → jsonParser.m
   - jsonCreate.e → jsonCreate.m

5. **New modular components** (2025):
   - shared_data.e → shared_data.m
   - message_system.e → message_system.m
   - user_management.e → user_management.m
   - file_transfer.e → file_transfer.m
   - network_communication.e → network_communication.m
   - session_management.e → session_management.m
   - ui_display.e → ui_display.m

6. **Main applications**:
   - express.e → express → express5
   - ACP.e → ACP

## Runtime Dependencies

### Memory Management
- **Manual allocation:** 559 NEW statements across codebase
- **No garbage collection:** Manual cleanup required
- **Reference counting:** Used for shared objects
- **Fixed-size buffers:** For performance optimization

### Threading Model
- **Multi-threaded:** Up to 32 concurrent nodes
- **Shared memory:** Protected by semaphores
- **Message ports:** Inter-node communication
- **ACP coordination:** Centralized administration

### Error Handling
- **TRY/CATCH blocks:** 52 exception handlers
- **HANDLE procedures:** 20 exception-safe functions
- **Error enumeration:** Comprehensive error codes
- **Logging levels:** NONE, ERROR, WARN, DEBUG

## Data Flow Architecture

### User Session Flow
```
User Connection
    ↓
Network Communication (network_communication.e)
    ↓
Authentication (user_management.e)
    ↓
Session Management (session_management.e)
    ↓
Command Processing → Message/File Operations
    ↓
UI Display (ui_display.e)
    ↓
Logout/Disconnect
```

### Message Processing Flow
```
Message Input
    ↓
Session Management (session_management.e)
    ↓
Message System (message_system.e)
    ↓
Storage/Retrieval (load/save operations)
    ↓
Conference Management
    ↓
User Display
```

### File Transfer Flow
```
Transfer Request
    ↓
File Transfer Module (file_transfer.e)
    ↓
Protocol Selection (FTP/HTTP/ZModem/etc.)
    ↓
Network Communication (network_communication.e)
    ↓
Progress Tracking & UI Updates
    ↓
Completion & Statistics
```

## Configuration Dependencies

### ToolTypes System
- **Configuration storage:** ToolTypes format
- **Parsing:** tooltypes.e module
- **Node-specific:** Individual node configurations
- **Global settings:** System-wide parameters

### Access Control System
- **Permission levels:** 87+ ACS_* constants
- **Conference access:** Per-user permissions
- **Security validation:** Multiple check functions
- **Time/ratio limits:** Configurable restrictions

## Future Extension Points

### Modular Architecture Benefits
1. **Independent development:** Each module can be modified separately
2. **Testing isolation:** Individual module testing possible
3. **Feature addition:** New modules can be added without affecting existing code
4. **Code reuse:** Common functionality centralized in shared_data.e

### Potential New Modules
- **Database integration:** Replace binary files with SQL database
- **Web interface:** REST API and web frontend
- **Plugin system:** Extensible door game support
- **Logging system:** Centralized logging and monitoring
- **Security enhancements:** Modern authentication methods

This dependency documentation provides a complete understanding of the AmiExpress modular architecture, enabling developers to understand relationships, make informed modifications, and plan future enhancements effectively.