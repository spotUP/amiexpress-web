
# SanctuaryBBS Import Guide - Complete 1:1 Port Instructions

**CRITICAL:** This is a 1:1 port of AmiExpress BBS. Every screen, door, and behavior MUST match the original exactly.

**Reference Sources:**
- `/AmiExpress-Sources/express.e` - Original BBS implementation (32,248 lines)
- `SanctuaryBBS/` directory - Source BBS to import from
- `web/backend/src/doors/amigaDoorManager.ts` - Door management system
- `/Screens/` - Screen file repository

---

## Phase 1: Pre-Import Analysis

### Step 1: Analyze SanctuaryBBS Structure

**BEFORE doing ANYTHING, you MUST:**

1. **Survey the SanctuaryBBS directory structure:**
   ```bash
   # List all screens
   find SanctuaryBBS/Screens -type f -name "*.TXT" -o -name "*.ANS" -o -name "*.RIP"
   
   # List all doors
   find SanctuaryBBS/Commands/BBSCmd -name "*.info"
   find SanctuaryBBS/Doors -type d -maxdepth 1
   
   # List all conferences
   ls -la SanctuaryBBS/Conf*/
   ```

2. **Document what you find:**
   - How many screen files exist?
   - What screen types are present (BBSTITLE, MENU, BULL, etc.)?
   - How many door commands are defined?
   - What door types are present (XIM, AIM, REXX, etc.)?
   - Are there conference-specific screens?
   - Are there security-level screen variants (e.g., MENU100.TXT, MENU200.TXT)?

3. **Create import inventory:**
   - Create `Docs/SANCTUARYBBS_INVENTORY.md` documenting:
     - Total screens count
     - Screen file types and variants
     - Total doors count
     - Door types and dependencies
     - Conference configurations
     - Any custom modifications vs standard AmiExpress

### Step 2: Verify Reference Against express.e

**For EACH screen type, you MUST verify against express.e:**

```bash
# Search for screen display calls
grep -n "displayScreen(SCREEN_" AmiExpress-Sources/express.e

# Find screen type definitions
grep -n "SCREEN_" AmiExpress-Sources/express.e | grep "CONST"
```

**Screen display flow from express.e (lines 28555-28648):**

1. **SCREEN_BBSTITLE** (line ~5579) - On connect, no pause
2. **SCREEN_LOGON** (line ~5576) - After login, with pause
3. **SCREEN_BULL** (line ~5548) - System bulletins, with pause if shown
4. **SCREEN_NODE_BULL** (line ~5551) - Node-specific bulletins, with pause if shown
5. **confScan()** - Scanning for new messages
6. **SCREEN_CONF_BULL** (line ~5557) - Conference bulletins, with pause if shown
7. **SCREEN_MENU** (line ~5560) - Main menu, with pause if needed

**Critical Screen Requirements (from express.e:5539-6656):**

- **findSecurityScreen()** - Searches for security-level variants (lines 6246-6308)
  - Priority: RIP → Screen Type extension → .TXT
  - Security screens: `SCREEN100.TXT`, `SCREEN200.TXT`, etc.
  - Default screens: `SCREEN.TXT`
  
- **No built-in pause prompts** - Handled by `doPause()` function
- **Display uses processMci()** - MCI code processing (lines 5258-5802)
- **Line count tracking** - For auto-pause at `userLineLen` lines

### Step 3: Verify Door System Against express.e

**Door execution from express.e (lines 4231-4544):**

```e
PROC runDoor(cmd,type,command,tooltype,params,resident,doorTrap,privcmd,pri=0,stacksize=20000)
```

**Door Types (express.e lines 4681-4697):**
- **XIM** - External Interface Module (most common)
- **AIM** - AREXX Interface Module (REXX scripts via Utils/REXXDOOR)
- **SIM** - Simple Interface Module
- **TIM** - Terminal Interface Module (via Utils/PARADOOR)
- **IIM** - Internal Interface Module
- **MCI** - MCI code display only
- **AEM** - AREXX Exec Module (via Utils/REXXEXEC)
- **SUP** - Superior Interface Module

**Door metadata from .info files (express.e lines 4700-4799):**
- `LOCATION=` - Door executable path (with AmigaDOS assigns)
- `ACCESS=` - Minimum security level required
- `TYPE=` - Door type (XIM, AIM, etc.)
- `STACK=` - Stack size for door process
- `PRIORITY=` - Process priority (SAME or numeric)
- `MULTINODE=` - YES/NO for multi-node support
- `NAME=` - Optional display name
- `RESIDENT=` - YES/NO for resident doors
- `EXPERT_MODE=` - YES/NO to enable expert mode during door
- `TRAPON=` - YES/NO to enable door output trapping
- `SILENT=` - YES/NO for silent execution
- `BANNER=` - Screen to show before launching
- `MIMICVER=` - Version string to report
- `PASSWORD=` - Optional password prompt
- `INTERNAL=` - Internal command to run instead
- `PASS_PARAMETERS=` - How to pass parameters

---

## Phase 2: Screen Import Process

### Screen Import Checklist

**For EACH screen file in SanctuaryBBS/Screens/:**

#### 1. Validate Screen Format

```typescript
// Check for:
// - Proper line endings (\r\n)
// - Valid ANSI codes (no bold [1;XXm)
// - Within 80x24 dimensions
// - Classic Amiga ASCII art only (no PC box-drawing)
// - MCI codes start with ~ character (if present)
```

**Validation Rules (from CLAUDE.md):**
- ❌ NO bold text styles (`\x1b[1;XXm`)
- ✅ USE normal text codes (`\x1b[0;XXm` or `[XXm`)
- ❌ NO PC DOS box-drawing characters (`█`, `╔`, `═`, `╗`)
- ✅ USE Amiga ASCII art (`_`, `/`, `\`, `|`, `-`)
- ✅ Line endings must be `\r\n`
- ✅ Remove built-in pause prompts (handled by doPause())

#### 2. Categorize Screen Type

Map each screen to its type constant from express.e:

```typescript
enum ScreenType {
  SCREEN_AWAIT = 0,           // Await connection screen
  SCREEN_BULL = 1,            // System bulletin
  SCREEN_NODE_BULL = 2,       // Node-specific bulletin
  SCREEN_LOGOFF = 3,          // Logoff screen
  SCREEN_CONF_BULL = 4,       // Conference bulletin
  SCREEN_MENU = 5,            // Main menu
  SCREEN_LOGON = 6,           // Logon screen
  SCREEN_BBSTITLE = 7,        // BBS title (on connect)
  SCREEN_JOIN = 8,            // Join conference
  SCREEN_JOINED = 9,          // Conference joined
  SCREEN_JOINCONF = 10,       // Join conference
  SCREEN_CONF_JOINMSGBASE = 11, // Join message base
  SCREEN_JOINMSGBASE = 12,    // Join message base
  SCREEN_DOWNLOAD = 13,       // Download message
  SCREEN_FILEHELP = 14,       // File help
  SCREEN_UPLOAD = 15,         // Upload message
  SCREEN_NOUPLOADS = 16,      // No uploads allowed
  SCREEN_NEWUSERPW = 17,      // New user password
  SCREEN_NONEWUSERS = 18,     // No new users
  SCREEN_NONEWATBAUD = 19,    // No new users at baud
  SCREEN_NOT_TIME = 20,       // Not valid time
  SCREEN_NOCALLERSATBAUD = 21, // No callers at baud
  SCREEN_GUESTLOGON = 22,     // Guest logon
  SCREEN_LOCKOUT0 = 23,       // Lockout level 0
  SCREEN_LOCKOUT1 = 24,       // Lockout level 1
  SCREEN_PRIVATE = 25,        // Private system password
  SCREEN_ONENODE = 26,        // Already on another node
  SCREEN_LOGON24 = 27,        // Time limit exceeded
  SCREEN_LANGUAGES = 28,      // Language selection
  SCREEN_INTERNETNAMES = 29,  // Internet name required
  SCREEN_REALNAMES = 30,      // Real name required
  SCREEN_MAILSCAN = 31,       // Mail scan screen
}
```

#### 3. Import Screen File

**Destination paths:**

```typescript
// System-wide screens → Screens/
// Example: BBSTITLE.TXT → Screens/BBSTITLE.TXT

// Node-specific screens → Node[X]/Screens/
// Example: Node0/BULL.TXT → Node0/Screens/BULL.TXT

// Conference screens → Conf[X]/Screens/
// Example: Conf1/MENU.TXT → Conf1/Screens/MENU.TXT
```

**Security-level variants:**

```typescript
// express.e lines 6246-6308: findSecurityScreen()
// Priority order:
// 1. [ScreenName][SecLevel].RIP (if RIP mode)
// 2. [ScreenName][SecLevel].[ScreenType] (e.g., MENU100.ANS)
// 3. [ScreenName][SecLevel].TXT (e.g., MENU100.TXT)
// 4. [ScreenName].RIP (default, RIP mode)
// 5. [ScreenName].[ScreenType] (default)
// 6. [ScreenName].TXT (default)

// Security levels are multiples of 5: 0, 5, 10, 15, ..., 250, 255
```

#### 4. Process MCI Codes

**If screen has MCI codes (starts with ~):**

```typescript
// MCI codes from express.e (lines 5258-5802):
// ~N - User name
// ~P - Password (ignored for security)
// ~# - Phone number
// ~UL - User location
// ~TC - Times called
// ~TT - Times today
// ~LC - Last call date/time
// ~M - Messages posted
// ~A - Access level
// ~S - Slot number
// ~CA - Conference access
// ~BR - Baud rate
// ~HW - Hardware/computer type
// ~TL - Time limit
// ~TR - Time remaining
// ~UB - Bytes uploaded
// ~DB - Bytes downloaded
// ~SU - Size uploaded (formatted)
// ~SD - Size downloaded (formatted)
// ~FU - Files uploaded
// ~FD - Files downloaded
// ~BD - Bytes daily limit
// ~LG / ~ON - Node number
// ~IN - Internet name
// ~RN - Real name
// ~OD - Logon date
// ~OT - Logon time
// ~SC - System caller count
// ~VE - Express version
// ~VD - Express version date
// ~ND - Node number
// ~CF - Conference number
// ~CN - Conference name
// ~MB - Message base number
// ~MN - Message base name
// ~AK - Display access keys
// ~CT - Current time
// ~DT - Current date
// ~FF - Flagged files list
// ~FC - Flagged files count
// ~FL - Flagged files full list
// ~SP - Pause
// ~CR - Wait for key
// ~f - Clear screen (form feed)
// ~w[N] - Wait N ticks
// ~x[N] - Set X position
// ~y[N] - Set Y position
// ~SS_[filename] - Display another screen
// ~SX_[filename] - Sequential screen display
// ~SR_[N][filename] - Random screen display
// ~CC_[command] - Run command
// ~CR_[prompt] - Prompted keypress
// ~SM_[menuname] - Set menu name
// ~q - Reset color
// ~h - Backspace
// ~CL - Conference list
// ~CD - Conference list (double column)
// ~ML - Message base list
// ~MD - Message base list (double column)
// ~c[0-7] - Set foreground color
// ~b[0-7] / ~z[0-7] - Set background color
// ~n[1-9] - Blank lines
// ~SMO[1-5] - Slow motion
// ~SMC - Slow motion cancel
// ~NS - Non-stop display
// ~D[char] - Set MCI terminator character
```

#### 5. Strip/Convert Invalid Elements

```typescript
// Remove or convert:
// 1. Bold codes → Normal codes
//    [1;31m → [31m
//    
// 2. PC box-drawing → Amiga ASCII
//    ╔══╗ → +--+
//    ║  ║ → |  |
//    ╚══╝ → +--+
//    
// 3. Built-in pause prompts → Remove
//    "Press any key..." → (removed, doPause() handles this)
//    
// 4. Invalid line endings → \r\n
//    \n only → \r\n
```

#### 6. Validate Dimensions

```typescript
// Maximum dimensions: 80 columns x 24 rows
// Validate each screen:
function validateScreen(content: string): boolean {
  const lines = content.split('\r\n');
  
  // Check line count
  if (lines.length > 24) {
    console.warn(`Screen exceeds 24 lines: ${lines.length}`);
    return false;
  }
  
  // Check line width (accounting for ANSI codes)
  for (const line of lines) {
    const visibleWidth = stripAnsi(line).length;
    if (visibleWidth > 80) {
      console.warn(`Line exceeds 80 columns: ${visibleWidth}`);
      return false;
    }
  }
  
  return true;
}
```

---

## Phase 2: Door Import Process

### Door Import Checklist

**For EACH door in SanctuaryBBS/:**

#### 1. Analyze Door Structure

```bash
# Check door command definition
cat SanctuaryBBS/Commands/BBSCmd/[DOORNAME].info

# Check door files
ls -la SanctuaryBBS/Doors/[DoorName]/

# Check door type
grep "TYPE=" SanctuaryBBS/Commands/BBSCmd/[DOORNAME].info
```

#### 2. Verify Door Type Support

**Reference express.e lines 4681-4697 for door type handling:**

```typescript
// Door type implementations:

// XIM (External Interface Module) - Most common
// - Direct executable
// - Uses AEDoorPort[node] message port
// - Message protocol defined in express.e lines 3372-4228
// Example: LOCATION=Doors:AquaScan/AquaScan.000

// AIM (AREXX Interface Module)
// - REXX script executed via Utils/REXXDOOR
// - Converted to XIM type during execution
// Example: LOCATION=Doors:MyDoor/MyDoor.rexx

// TIM (Terminal Interface Module)
// - Executed via Utils/PARADOOR
// - Legacy door type
// Example: LOCATION=Doors:OldDoor/OldDoor

// REXX/AEM (AREXX Exec Module)
// - Pure AREXX script via Utils/REXXEXEC
// - No door interface, just script execution
// Example: LOCATION=Doors:Script/Script.rexx

// MCI (MCI Code Display)
// - No executable, just MCI text display
// - MCI_TEXT= field in .info file
// Example: TYPE=MCI, MCI_TEXT=~c2Welcome!~q

// IIM/SIM/SUP (Legacy types)
// - Rarely used, simple execution models
```

#### 3. Map Door Dependencies

```typescript
// Check for door dependencies:

// 1. Amiga libraries (.library files)
//    - Look for Libs/ directory in door archive
//    - Install to BBS/Libs/ (amigaDoorManager handles this)
//    - Examples: xprz<br>.library, rexxsyslib.library

// 2. Shared utilities (Utils/)
//    - REXXDOOR, REXXEXEC, PARADOOR (already in Utils/)
//    - Custom utilities specific to door

// 3. Configuration files
//    - .cfg, .config, .dat files in door directory
//    - Preserve during installation

// 4. Data files
//    - High scores, user data, etc.
//    - Usually in door subdirectory

// 5. Documentation
//    - README, .guide files
//    - Optional but preserve if present
```

#### 4. Import Door Files

**Use AmigaDoorManager for proper installation:**

```typescript
import { getAmigaDoorManager } from './doors/amigaDoorManager';

async function importDoor(archivePath: string) {
  const manager = getAmigaDoorManager();
  
  // 1. Analyze archive structure
  const analysis = await manager.analyzeDoorArchive(archivePath);
  if (!analysis) {
    console.error('Failed to analyze door archive');
    return;
  }
  
  console.log('Door Analysis:');
  console.log(`  Format: ${analysis.format}`);
  console.log(`  Files: ${analysis.files.length}`);
  console.log(`  .info files: ${analysis.infoFiles.length}`);
  console.log(`  Executables: ${analysis.executables.length}`);
  console.log(`  BBS Commands: ${analysis.bbsCommands?.join(', ')}`);
  console.log(`  Door Name: ${analysis.metadata?.doorName}`);
  
  // 2. Install door
  const result = await manager.installDoor(archivePath);
  
  if (result.success) {
    console.log(`✓ ${result.message}`);
    if (result.door) {
      console.log(`  Command: ${result.door.command}`);
      console.log(`  Location: ${result.door.location}`);
      console.log(`  Type: ${result.door.type}`);
      console.log(`  Access: ${result.door.access}`);
      console.log(`  Installed: ${result.door.installed}`);
    }
  } else {
    console.error(`✗ ${result.message}`);
  }
  
  return result;
}
```

**Correct Installation Paths (as per AmigaDoorManager):**

```
BBS/
├── Commands/
│   ├── BBSCmd/
│   │   ├── AQUASCAN.info      ← Command definition
│   │   ├── TETRIS.info
│   │   └── ...
│   └── SYSCmd/                 ← Sysop-only commands
└── Doors/
    ├── AquaScan/              ← Door program files
    │   ├── AquaScan.000       ← Executable
    │   ├── AquaScanConfig     ← Config file
    │   └── ...
    ├── Tetris/
    │   └── ...
    └── ...
```

#### 5. Verify Door Installation

**After installation, verify:**

```typescript
async function verifyDoorInstallation(commandName: string) {
  const manager = getAmigaDoorManager();
  
  // 1. Scan for installed doors
  const doors = await manager.scanInstalledDoors();
  const door = doors.find(d => d.command === commandName);
  
  if (!door) {
    console.error(`Door command '${commandName}' not found after installation`);
    return false;
  }
  
  // 2. Verify .info file
  const infoPath = path.join(manager.bbsRoot, 'Commands', 'BBSCmd', `${commandName}.info`);
  if (!fs.existsSync(infoPath)) {
    console.error(`Missing .info file: ${infoPath}`);
    return false;
  }
  
  // 3. Verify executable (if not MCI type)
  if (door.type !== 'MCI' && !door.installed) {
    console.error(`Door executable not found: ${door.resolvedPath}`);
    return false;
  }
  
  // 4. Verify metadata
  console.log('Door Verification:');
  console.log(`  Command: ${door.command}`);
  console.log(`  Type: ${door.type}`);
  console.log(`  Access: ${door.access}`);
  console.log(`  Location: ${door.location}`);
  console.log(`  Resolved: ${door.resolvedPath}`);
  console.log(`  Installed: ${door.installed ? 'YES' : 'NO'}`);
  
  return true;
}
```

---

## Phase 3: Emulation Requirements

### Door Emulation System

**From express.e lines 4231-4544, implement door execution:**

```typescript
// Door execution flow:
// 1. Check security level (ACCESS= from .info)
// 2. Prompt for password if PASSWORD= set
// 3. Display banner if BANNER= set
// 4. Set environment variables
// 5. Create door message port
// 6. Launch door process
// 7. Handle door messages
// 8. Cleanup after door exits

interface DoorExecution {
  // Pre-execution
  checkAccess(user: User, door: DoorInfo): boolean;
  promptPassword(password: string): Promise<boolean>;
  displayBanner(bannerScreen: string): Promise<void>;
  
  // Execution
  createDoorPort(node: number): MessagePort;
  launchDoorProcess(door: DoorInfo, params: string): Process;
  
  // Message handling (express.e lines 3372-4228)
  handleDoorMessage(msg: DoorMessage): void;
  
  // Post-execution
  cleanupDoor(door: DoorInfo): void;
  runExitCommand(command: string): Promise<void>;
}
```

### Door Message Protocol (XIM Type)

**From express.e lines 3378-4228, implement message handlers:**

```typescript
enum DoorMessageType {
  JH_REGISTER = 0,      // Register door with BBS
  JH_WRITE = 1,         // Write text to user
  JH_CO = 2,            // Console output
  JH_SO = 3,            // Serial output only
  JH_SM = 4,            // Serial/Screen message
  JH_PM = 5,            // Prompt for input
  JH_HK = 6,            // Get hotkey
  JH_SG = 7,            // Show security screen
  JH_SF = 8,            // Show file
  JH_EF = 9,            // Edit file (message editor)
  JH_MCI = 10,          // Process MCI string
  JH_BBSNAME = 11,      // Get BBS name
  JH_SYSOP = 12,        // Get sysop name
  JH_FLAGFILE = 13,     // Flag file for download
  // ... (100+ message types)
  
  // Data transfer messages
  DT_NAME = 100,        // Get/Set user name
  DT_PASSWORD = 101,    // Get/Set password
  DT_LOCATION = 102,    // Get/Set location
  // ... (50+ data transfer types)
  
  // BBS state messages
  BB_CONFNAME = 200,    // Get/Set conference name
  BB_LOCAL = 201,       // Get BBS root path
  BB_CHATFLAG = 202,    // Get sysop available flag
  // ... (30+ BBS state types)
}

// Message structure:
interface DoorMessage {
  command: DoorMessageType;
  data: number;         // Multipurpose data field
  string: string;       // String data (max 200 chars)
  nodeID: number;       // Node identifier
  lineNum: number;      // Line number (for multi-line)
  signal: number;       // Signal bit for extended operations
  filler1: any;         // Extended data pointer
  filler2: any;         // Extended data pointer
  filler3: any;         // Extended data pointer
  // ... more fields as needed
}
```

### Screen Emulation

**Display engine requirements:**

```typescript
interface ScreenDisplay {
  // From express.e lines 6539-6849
  displayScreen(screenType: ScreenType): Promise<boolean>;
  
  // From express.e lines 6746-6849
  displayFile(filename: string, allowMCI: boolean, resetNonStop: boolean): Promise<boolean>;
  
  // From express.e lines 5769-5802
  processMci(mciData: string, outData?: string): string;
  
  // From express.e lines 5141-5152
  doPause(): Promise<number>;
  
  // From express.e lines 5181-5201
  checkForPause(): Promise<number>;
  
  // From express.e lines 2013-2018
  checkScreenClear(): boolean;
}
```

**Screen clear logic (express.e lines 2013-2018):**

```typescript
function checkScreenClear(): boolean {
  // Only clear if user has USER_SCRNCLR flag set
  if (session.user?.userFlags & USER_SCRNCLR) {
    socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and home cursor
    return true;
  }
  return false;
}
```

**Pause logic (express.e lines 5141-5152):**

```typescript
async function doPause(): Promise<number> {
  if (reqState !== REQ_STATE_NONE) return 0;
  
  socket.emit('ansi-output', '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
  
  let ch: number;
  do {
    ch = await readChar(INPUT_TIMEOUT);
  } while (ch !== 13 && ch !== 32 && ch >= 0 && reqState === REQ_STATE_NONE);
  
  lineCount = 0;
  socket.emit('ansi-output', '\r\n');
  
  if (reqState !== REQ_STATE_NONE) ch = RESULT_NO_CARRIER;
  return ch < 0 ? ch : 0;
}
```

---

## Phase 4: Import Automation Script

### Create Import Tool

```typescript
// tools/import-sanctuarybbs.ts

import * as fs from 'fs';
import * as path from 'path';
import { getAmigaDoorManager } from '../src/doors/amigaDoorManager';

interface ImportConfig {
  sanctuaryPath: string;    // Path to SanctuaryBBS/
  bbsRoot: string;          // Path to our BBS/ root
  dryRun: boolean;          // Test run without actual changes
  verbose: boolean;         // Detailed logging
  skipExisting: boolean;    // Skip files that already exist
}

class SanctuaryBBSImporter {
  private config: ImportConfig;
  private stats = {
    screensImported: 0,
    screensSkipped: 0,
    screensFailed: 0,
    doorsImported: 0,
    doorsSkipped: 0,
    doorsFailed: 0,
  };

  constructor(config: ImportConfig) {
    this.config = config;
  }

  // Import all screens
  async importScreens(): Promise<void> {
    console.log('\n=== IMPORTING SCREENS ===\n');
    
    const screensPath = path.join(this.config.sanctuaryPath, 'Screens');
    if (!fs.existsSync(screensPath)) {
      console.error(`Screens directory not found: ${screensPath}`);
      return;
    }
    
    const screens = this.findScreenFiles(screensPath);
    console.log(`Found ${screens.length} screen files\n`);
    
    for (const screen of screens) {
      await this.importScreen(screen);
    }
    
    this.printScreenStats();
  }

  // Find all screen files recursively
  private findScreenFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.findScreenFiles(fullPath));
      } else if (this.isScreenFile(entry.name)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  // Check if file is a screen file
  private isScreenFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ext === '.txt' || ext === '.ans' || ext === '.rip';
  }

  // Import single screen
  private async importScreen(sourcePath: string): Promise<void> {
    try {
      const relativePath = path.relative(this.config.sanctuaryPath, sourcePath);
      console.log(`Importing screen: ${relativePath}`);
      
      // Read source screen
      let content = fs.readFileSync(sourcePath, 'latin1'); // Preserve ANSI codes
      
      // Validate and process
      const issues = this.validateScreen(content);
      if (issues.length > 0) {
        console.warn('  Screen validation issues:');
        issues.forEach(issue => console.warn(`    - ${issue}`));
      }
      
      // Strip bold codes
      content = this.stripBoldCodes(content);
      
      // Convert PC box-drawing to Amiga ASCII
      content = this.convertBoxDrawing(content);
      
      // Ensure proper line endings
      content = this.normalizeLineEndings(content);
      
      // Determine destination path
      const destPath = this.getScreenDestination(relativePath);
      
      // Check if already exists
      if (this.config.skipExisting && fs.existsSync(destPath)) {
        console.log(`  ↷ Skipped (already exists): ${destPath}`);
        this.stats.screensSkipped++;
        return;
      }
      
      // Write to destination (if not dry run)
      if (!this.config.dryRun) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, content, 'latin1');
        console.log(`  ✓ Imported → ${destPath}`);
      } else {
        console.log(`  ✓ Would import → ${destPath}`);
      }
      
      this.stats.screensImported++;
      
    } catch (error) {
      console.error(`  ✗ Failed: ${(error as Error).message}`);
      this.stats.screensFailed++;
    }
  }

  // Validate screen file
  private validateScreen(content: string): string[] {
    const issues: string[] = [];
    
    // Check for bold codes
    if (content.match(/\x1b\[1;/)) {
      issues.push('Contains bold ANSI codes (will be stripped)');
    }
    
    // Check for PC box-drawing
    const pcChars = ['█', '╔', '═', '╗', '║', '╚', '╝', '╠', '╣', '╦', '╩', '╬'];
    if (pcChars.some(char => content.includes(char))) {
      issues.push('Contains PC box-drawing characters (will be converted)');
    }
    
    // Check dimensions
    const lines = content.split(/\r?\n/);
    if (lines.length > 24) {
      issues.push(`Exceeds 24 lines (${lines.length} lines)`);
    }
    
    for (let i = 0; i < lines.length; i++) {
      const visibleWidth = this.stripAnsiCodes(lines[i]).length;
      if (visibleWidth > 80) {
        issues.push(`Line ${i + 1} exceeds 80 columns (${visibleWidth} chars)`);
      }
    }
    
    return issues;
  }

  // Strip bold ANSI codes
  private stripBoldCodes(content: string): string {
    // Replace [1;XXm with [XXm
    return content.replace(/\x1b\[1;(\d+)m/g, '\x1b[$1m');
  }

  // Convert PC box-drawing to Amiga ASCII
  private convertBoxDrawing(content: string): string {
    const conversions: Record<string, string> = {
      '█': '#',
      '╔': '+',
      '═': '-',
      '╗': '+',
      '║': '|',
      '╚': '+',
      '╝': '+',
      '╠': '+',
      '╣': '+',
      '╦': '+',
      '╩': '+',
      '╬': '+',
    };
    
    let result = content;
    for (const [pcChar, amigaChar] of Object.entries(conversions)) {
      result = result.split(pcChar).join(amigaChar);
    }
    
    return result;
  }

  // Normalize line endings to \r\n
  private normalizeLineEndings(content: string): string {
    // Convert all to \n first, then to \r\n
    return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  }

  // Strip ANSI codes for length calculation
  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // Determine screen destination path
  private getScreenDestination(relativePath: string): string {
    // Map SanctuaryBBS structure to our structure
    
    // Node-specific: SanctuaryBBS/Node0/Screens/ → Node0/Screens/
    if (relativePath.match(/^Node\d+[/\\]Screens[/\\]/i)) {
      return path.join(this.config.bbsRoot, '..', relativePath);
    }
    
    // Conference-specific: SanctuaryBBS/Conf[X]/Screens/ → Conf[X]/Screens/
    if (relativePath.match(/^Conf\d+[/\\]Screens[/\\]/i)) {
      return path.join(this.config.bbsRoot, '..', relativePath);
    }
    
    // System-wide: SanctuaryBBS/Screens/ → Screens/
    return path.join(this.config.bbsRoot, '..', 'Screens', path.basename(relativePath));
  }

  // Import all doors
  async importDoors(): Promise<void> {
    console.log('\n=== IMPORTING DOORS ===\n');
    
    // Find all door archives
    const doorsPath = path.join(this.config.sanctuaryPath, 'Doors');
    const archivesPath = path.join(doorsPath, 'archives');
    
    // Check both locations
    const archives: string[] = [];
    
    if (fs.existsSync(archivesPath)) {
      const archiveFiles = fs.readdirSync(archivesPath)
        .filter(f => f.match(/\.(lha|lzh|zip|lzx)$/i))
        .map(f => path.join(archivesPath, f));
      archives.push(...archiveFiles);
    }
    
    if (fs.existsSync(doorsPath)) {
      const doorFiles = fs.readdirSync(doorsPath)
        .filter(f => f.match(/\.(lha|lzh|zip|lzx)$/i))
        .map(f => path.join(doorsPath, f));
      archives.push(...doorFiles);
    }
    
    console.log(`Found ${archives.length} door archives\n`);
    
    for (const archive of archives) {
      await this.importDoor(archive);
    }
    
    this.printDoorStats();
  }

  // Import single door
  private async importDoor(archivePath: string): Promise<void> {
    try {
      const filename = path.basename(archivePath);
      console.log(`Importing door: ${filename}`);
      
      if (this.config.dryRun) {
        console.log('  ⊗ Dry run mode - would install');
        this.stats.doorsImported++;
        return;
      }
      
      const manager = getAmigaDoorManager(this.config.bbsRoot);
      const result = await manager.installDoor(archivePath);
      
      if (result.success) {
        console.log(`  ✓ ${result.message}`);
        this.stats.doorsImported++;
      } else {
        console.log(`  ✗ ${result.message}`);
        this.stats.doorsFailed++;
      }
      
    } catch (error) {
      console.error(`  ✗ Failed: ${(error as Error).message}`);
      this.stats.doorsFailed++;
    }
  }

  // Print import statistics
  private printScreenStats(): void {
    console.log('\n=== SCREEN IMPORT STATISTICS ===\n');
    console.log(`  Imported: ${this.stats.screensImported}`);
    console.log(`  Skipped:  ${this.stats.screensSkipped}`);
    console.log(`  Failed:   ${this.stats.screensFailed}`);
    console.log(`  Total:    ${this.stats.screensImported + this.stats.screensSkipped + this.stats.screensFailed}\n`);
  }

  private printDoorStats(): void {
    console.log('\n=== DOOR IMPORT STATISTICS ===\n');
    console.log(`  Imported: ${this.stats.doorsImported}`);
    console.log(`  Skipped:  ${this.stats.doorsSkipped}`);
    console.log(`  Failed:   ${this.stats.doorsFailed}`);
    console.log(`  Total:    ${this.stats.doorsImported + this.stats.doorsSkipped + this.stats.doorsFailed}\n`);
  }

  // Run full import
  async run(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     SanctuaryBBS → AmiExpress-Web Import Tool          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Source: ${this.config.sanctuaryPath}`);
    console.log(`Target: ${this.config.bbsRoot}`);
    console.log(`Mode:   ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('');
    
    await this.importScreens();
    await this.importDoors();
    
    console.log('\n=== IMPORT COMPLETE ===\n');
    console.log('Screens:', this.stats.screensImported, 'imported,', this.stats.screensFailed, 'failed');
    console.log('Doors:  ', this.stats.doorsImported, 'imported,', this.stats.doorsFailed, 'failed');
    console.log('');
  }
}

// CLI entry point
const config: ImportConfig = {
  sanctuaryPath: process.argv[2] || './SanctuaryBBS',
  bbsRoot: process.argv[3] || './BBS',
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  skipExisting: process.argv.includes('--skip-existing'),
};

const importer = new SanctuaryBBSImporter(config);
importer.run().catch(console.error);
```

**Usage:**

```bash
1_PORT_ANALYSIS.md` - Port requirements

---

## Appendix A: express.e Quick Reference

### State Machine (lines 28555-28652)

```e
SUBSTATE_DISPLAY_BULL          // Show system bulletins
SUBSTATE_DISPLAY_CONF_BULL     // Show conference bulletins  
SUBSTATE_DISPLAY_MENU          // Display menu (if not expert mode)
SUBSTATE_READ_SHORTCUTS        // Read single character (expert mode)
SUBSTATE_READ_COMMAND          // Read full command line
SUBSTATE_PROCESS_COMMAND       // Process command
```

### Key Functions Reference

| Function | Line | Purpose |
|----------|------|---------|
| `displayScreen()` | 6539 | Display screen by type |
| `displayFile()` | 6746 | Display file with MCI processing |
| `findSecurityScreen()` | 6246 | Find security-level screen variant |
| `processMci()` | 5769 | Process MCI codes in string |
| `processMciCmd()` | 5258 | Process individual MCI command |
| `doPause()` | 5141 | Display pause prompt |
| `checkForPause()` | 5181 | Auto-pause at line limit |
| `runDoor()` | 4231 | Execute door program |
| `runCommand()` | 4614 | Execute command (any type) |
| `processCommand()` | 28229 | Process command with priority |
| `processXimMsg()` | 3372 | Handle XIM door messages |

### AmigaDOS Assigns

| Assign | Physical Path | Purpose |
|--------|---------------|---------|
| `BBS:` | `/BBS` | BBS root directory |
| `Doors:` | `/BBS/Doors` | Door programs |
| `Screens:` | `/BBS/Screens` | Display screens |
| `NODE0:` | `/BBS/Node0` | Node 0 data |
| `NODE1:` | `/BBS/Node1` | Node 1 data |
| `Utils:` | `/BBS/Utils` | Utility programs |
| `Libs:` | `/BBS/Libs` | Amiga libraries |
| `Protocols:` | `/BBS/Protocols` | Transfer protocols |
| `Storage:` | `/BBS/Storage` | Icon storage |

---

## Appendix B: Common Import Issues

### Issue 1: Bold ANSI Codes

**Problem:** Screens contain `\x1b[1;31m` (bold red)

**Solution:**
```typescript
content = content.replace(/\x1b\[1;(\d+)m/g, '\x1b[$1m');
```

**Why:** Classic Amiga terminals didn't support bold text (CLAUDE.md lines 959-989)

### Issue 2: PC Box-Drawing Characters

**Problem:** Screens contain `╔══╗` instead of `+--+`

**Solution:**
```typescript
const conversions = {
  '╔': '+', '═': '-', '╗': '+',
  '║': '|', '╚': '+', '╝': '+'
};
```

**Why:** Amiga used ASCII art, not DOS extended characters (CLAUDE.md lines 971-978)

### Issue 3: Missing Door Executables

**Problem:** `.info` file exists but executable missing

**Solution:**
```typescript
// Document in import report
console.log(`Door ${door.command}: .info found, executable MISSING`);
console.log(`  Location: ${door.location}`);
console.log(`  Resolved: ${door.resolvedPath}`);
console.log(`  Action: Needs TypeScript reimplementation`);
```

**Why:** Amiga binaries can't run in Node.js/browser environment

### Issue 4: Wrong Directory Structure

**Problem:** Door installed to `backend/doors/` instead of `BBS/Doors/`

**Solution:**
```typescript
// Check door type first:
if (analysis.isTypeScriptDoor) {
  // Install to backend/doors/[name]/
  installTypeScriptDoor(archivePath, analysis);
} else {
  // Install to BBS/Doors/[name]/
  installAmigaDoor(archivePath, analysis);
}
```

**Why:** Different door types have different installation paths

### Issue 5: Door Not Available After Install

**Problem:** Door installed but doesn't execute

**Solution:**
```typescript
// MUST reload command cache after installation
import { loadCommands } from '../handlers/command-execution.handler';

// After installing door:
loadCommands(bbsRoot, conferenceNum, nodeNum);
console.log('Command cache reloaded - doors now available');
```

**Why:** Command cache loaded at startup, must refresh (amigaDoorManager.ts lines 943-948)

---

## Appendix C: SanctuaryBBS vs AmiExpress Differences

**Expected Differences to Document:**

1. **Custom Screens**
   - SanctuaryBBS may have custom ANSI art
   - Preserve as-is if follows format rules
   - Document any unique screens

2. **Modified Doors**
   - SanctuaryBBS may have customized door configs
   - Preserve .info modifications
   - Document differences from standard doors

3. **Conference Setup**
   - Different conference names/counts
   - Different conference access patterns
   - Import as-is, document structure

4. **Security Levels**
   - Custom security screen variants
   - Modified access levels
   - Document and preserve

**What MUST NOT Differ:**

1. ❌ Screen format (80x24, ANSI only, no bold)
2. ❌ MCI code syntax and processing
3. ❌ Door .info file format
4. ❌ AmigaDOS assign names
5. ❌ BBS directory structure
6. ❌ Command execution priority
7. ❌ State machine flow

---

## Appendix D: TypeScript Door Development

**For doors that need reimplementation:**

```typescript
// backend/doors/[door-name]/index.ts

import { DoorInterface, DoorContext } from '../../src/doors/DoorInterface';

export class MyDoor implements DoorInterface {
  async execute(context: DoorContext): Promise<void> {
    const { socket, session, params } = context;
    
    // Door logic here
    socket.emit('ansi-output', 'Welcome to My Door!\r\n');
    
    // Use door utilities
    const input = await context.readLine('Enter your name: ');
    socket.emit('ansi-output', `Hello ${input}!\r\n`);
    
    // Access user data
    const user = session.user;
    socket.emit('ansi-output', `Your security level: ${user.secLevel}\r\n`);
    
    // Exit
    await context.pause();
  }
}
```

**Package.json:**

```json
{
  "name": "my-door",
  "version": "1.0.0",
  "description": "My custom BBS door",
  "main": "index.ts",
  "displayName": "My Door",
  "accessLevel": 0,
  "doorType": "typescript"
}
```

---

## Summary

This guide provides complete instructions for importing all screens and doors from SanctuaryBBS to the AmiExpress-Web port. The import MUST maintain 100% compatibility with the original AmiExpress BBS system as documented in [`express.e`](../AmiExpress-Sources/express.e:1).

**Key Principles:**

1. **Verify EVERYTHING against express.e** - The source code is truth
2. **Preserve exact behavior** - This is a 1:1 port, not an interpretation  
3. **Test thoroughly** - Every screen, every door, every feature
4. **Document all changes** - Create comprehensive import report
5. **Never guess** - If unsure, check express.e

**Remember:** This import is successful ONLY when a SanctuaryBBS user could use our web port and see NO differences in screens, menus, or door behavior. Anything less is a failed import.

---

**Created:** 2025-10-28  
**Status:** Import guide for AI implementation  
**Version:** 1.0
# Dry run (test only)
npm run import:sanctuarybbs -- --dry-run

# Live import (overwrites existing)
npm run import:sanctuarybbs

# Live import (skip existing files)
npm run import:sanctuarybbs -- --skip-existing

# Custom paths
npm run import:sanctuarybbs /path/to/SanctuaryBBS /path/to/BBS
```

---

## Phase 5: Post-Import Verification

### Verification Checklist

**After import, verify EVERYTHING:**

#### 1. Screen Verification

```bash
# Count imported screens
find Screens/ -type f | wc -l
find Node*/Screens/ -type f | wc -l
find Conf*/Screens/ -type f | wc -l

# Check for bold codes (should be NONE)
grep -r "\\x1b\\[1;" Screens/ Node*/Screens/ Conf*/Screens/

# Check for PC box-drawing (should be NONE)
grep -r "[█╔═╗║╚╝]" Screens/ Node*/Screens/ Conf*/Screens/

# Verify line endings
file Screens/*.TXT | grep -v "CRLF"
```

#### 2. Door Verification

```bash
# List installed doors
ls -la BBS/Commands/BBSCmd/*.info
ls -la BBS/Doors/

# Verify door executables exist
node -e "
const { getAmigaDoorManager } = require('./src/doors/amigaDoorManager');
const manager = getAmigaDoorManager();
manager.scanInstalledDoors().then(doors => {
  console.log('Installed Doors:');
  doors.forEach(door => {
    console.log(\`  \${door.command}: \${door.installed ? '✓' : '✗'} \${door.location}\`);
  });
});
"
```

#### 3. Functional Testing

**Test EACH imported component:**

```typescript
// Test screen display
async function testScreen(screenType: ScreenType) {
  const displayed = await displayScreen(screenType);
  console.log(`Screen ${screenType}: ${displayed ? 'PASS' : 'FAIL'}`);
}

// Test door execution
async function testDoor(command: string) {
  const manager = getAmigaDoorManager();
  const doors = await manager.scanInstalledDoors();
  const door = doors.find(d => d.command === command);
  
  if (!door) {
    console.error(`Door ${command}: NOT FOUND`);
    return;
  }
  
  if (!door.installed) {
    console.error(`Door ${command}: EXECUTABLE MISSING`);
    return;
  }
  
  // Try to execute (if emulation supports it)
  console.log(`Door ${command}: READY (${door.type})`);
}
```

---

## Phase 6: Critical Implementation Notes

### Door Emulation in Web Environment

**MAJOR CHALLENGE:** Original doors are Amiga executables that cannot run in browser/Node.js

**Solutions:**

1. **For TypeScript/JavaScript doors:**
   - Package as npm modules in `backend/doors/[door-name]/`
   - Implement DoorInterface protocol
   - Full emulation possible

2. **For Amiga binary doors (.000, .020 files):**
   - **Option A:** Create TypeScript reimplementations
   - **Option B:** Use emulation layer (complex, performance issues)
   - **Option C:** Document as "not yet implemented" and focus on TypeScript doors first

3. **For REXX/AIM doors:**
   - Implement AREXX interpreter in TypeScript
   - Already have framework in `backend/src/arexx/`
   - Convert .rexx scripts to TypeScript equivalents

### Screen Display in Web Terminal

**Requirements:**

1. **xterm.js terminal** - Already implemented in frontend
2. **ANSI code support** - Full support in xterm.js
3. **MCI code processing** - Implement server-side (like express.e)
4. **Pause handling** - Socket.IO event-driven
5. **Line counting** - Track per-user in session

**Implementation in backend/src/index.ts:**

```typescript
// Screen display (reference express.e lines 6746-6849)
async function displayFile(
  socket: Socket,
  session: BBSSession,
  filename: string,
  allowMCI: boolean = true,
  resetNonStop: boolean = true,
  resetLineCount: boolean = true
): Promise<boolean> {
  try {
    // Read screen file
    const content = fs.readFileSync(filename, 'latin1');
    
    // Reset line counter
    if (resetLineCount) {
      session.lineCount = 0;
    }
    
    // Reset non-stop flag
    if (resetNonStop && session.state !== BBSState.LOGGING_OFF) {
      session.nonStopDisplay = false;
    }
    
    // Check if MCI processing allowed
    const lines = content.split('\r\n');
    const hasMCI = lines.length > 0 && lines[0].startsWith('~');
    
    if (!hasMCI) allowMCI = false;
    
    // Process and send each line
    for (const line of lines) {
      if (allowMCI) {
        // Process MCI codes
        const processed = processMci(line, session);
        socket.emit('ansi-output', processed);
      } else {
        socket.emit('ansi-output', line + '\r\n');
      }
      
      // Check for pause
      if (!session.nonStopDisplay) {
        session.lineCount++;
        if (session.lineCount >= session.user.lineLength) {
          await doPause(socket, session);
        }
      }
      
      // Check carrier
      if (session.state === BBSState.LOGGING_OFF) break;
    }
    
    return true;
  } catch (error) {
    console.error('Error displaying screen:', error);
    return false;
  }
}
```

---

## Phase 7: Testing Protocol

### Before Declaring Import Complete

**You MUST verify:**

1. ✅ All screens display correctly in web terminal
2. ✅ All ANSI codes render properly
3. ✅ All MCI codes process correctly
4. ✅ Screen dimensions fit in 80x24 terminal
5. ✅ Pause prompts work correctly
6. ✅ Security-level screen variants work
7. ✅ Conference-specific screens load
8. ✅ Node-specific screens load
9. ✅ All imported doors have valid .info files
10. ✅ All door executables exist (or are documented as missing)
11. ✅ Door command cache loads doors correctly
12. ✅ Door execution priority works (BBS commands before internal)
13. ✅ AmigaDOS assign resolution works
14. ✅ No original AmiExpress commands were overwritten

### Create Test Suite

```typescript
// tests/sanctuarybbs-import.test.ts

describe('SanctuaryBBS Import Verification', () => {
  test('All screens have valid ANSI codes', () => {
    const screens = findAllScreens();
    for (const screen of screens) {
      const content = fs.readFileSync(screen, 'latin1');
      expect(content).not.toMatch(/\x1b\[1;/); // No bold
      expect(content).not.toMatch(/[█╔═╗]/); // No PC chars
    }
  });
  
  test('All screens fit in 80x24', () => {
    const screens = findAllScreens();
    for (const screen of screens) {
      const content = fs.readFileSync(screen, 'latin1');
      const lines = content.split('\r\n');
      expect(lines.length).toBeLessThanOrEqual(24);
      
      for (const line of lines) {
        const visible = stripAnsi(line).length;
        expect(visible).toBeLessThanOrEqual(80);
      }
    }
  });
  
  test('All doors have .info files', async () => {
    const manager = getAmigaDoorManager();
    const doors = await manager.scanInstalledDoors();
    
    for (const door of doors) {
      const infoPath = path.join(manager.bbsRoot, 'Commands', 'BBSCmd', `${door.command}.info`);
      expect(fs.existsSync(infoPath)).toBe(true);
    }
  });
  
  test('Door command priority works', async () => {
    // Verify BBS commands take priority over internal commands
    // As per express.e lines 28244-28256
  });
});
```

---

## Critical Reference Points in express.e

### Screen Display System

- **displayScreen()** - Lines 6539-6655
- **displayFile()** - Lines 6746-6849
- **findSecurityScreen()** - Lines 6246-6308
- **processMci()** - Lines 5769-5802
- **processMciCmd()** - Lines 5258-5766
- **doPause()** - Lines 5141-5152
- **checkForPause()** - Lines 5181-5201
- **checkScreenClear()** - Lines 2013-2018

### Door Execution System

- **runCommand()** - Lines 4614-4805
- **runDoor()** - Lines 4231-4544
- **runBbsCommand()** - Lines 4807-4811
- **runSysCommand()** - Lines 4813-4817
- **processCommand()** - Lines 28229-28256
- **processXimMsg()** - Lines 3372-4228
- **doorMsgLoadAccount()** - Lines 4546-4568
- **doorMsgSaveAccount()** - Lines 4570-4597

### Command Priority System

**From express.e lines 28244-28256:**

```e
-> try running it as a bbscommand first
IF (subtype<SUBTYPE_INTCMD)
  IF allowsyscmd
    IF (res:=runSysCommand(cmdcode,cmdparams,TRUE,subtype))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
    IF res=RESULT_NOT_ALLOWED THEN RETURN res
  ENDIF
  IF (res:=runBbsCommand(cmdcode,cmdparams,TRUE,subtype))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
  IF res=RESULT_NOT_ALLOWED THEN RETURN res
ENDIF
ENDPROC processInternalCommand(cmdcode,cmdparams)
```

**Command execution priority:**
1. **SysCommand** (SYSCMD) - System-level commands
2. **BbsCommand** (BBSCMD) - Conference/Node/BBS custom commands (DOORS!)
3. **InternalCommand** - Built-in commands

---

## Final Checklist

Before considering the import complete:

- [ ] All SanctuaryBBS screens documented in inventory
- [ ] All screens validated against express.e screen types
- [ ] All screens processed for bold codes, PC chars, line endings
- [ ] All screens tested in web terminal
- [ ] All security-level variants preserved
- [ ] All conference-specific screens preserved
- [ ] All node-specific screens preserved
- [ ] All SanctuaryBBS doors documented in inventory
- [ ] All door .info files analyzed
- [ ] All door types identified and documented
- [ ] All door dependencies mapped
- [ ] All doors installed to proper BBS structure
- [ ] All door executables verified (or missing documented)
- [ ] Door command cache reloads after installation
- [ ] Door execution priority tested
- [ ] AmigaDOS assign resolution tested
- [ ] No original AmiExpress commands overwritten
- [ ] Full test suite passes
- [ ] Created SANCTUARYBBS_IMPORT_REPORT.md documenting results

---

## Emergency Rollback

If import causes issues:

```bash
# Restore from backup (make backup FIRST!)
git checkout -- Screens/ Node*/Screens/ Conf*/Screens/
git checkout -- BBS/Commands/BBSCmd/*.info
git checkout -- BBS/Doors/

# Reload command cache
cd web/backend
npm run dev  # Restart backend to reload
```

---

## Success Criteria

**The import is ONLY successful when:**

1. ✅ ALL screens display correctly in web terminal without artifacts
2. ✅ ALL ANSI codes render exactly as on original Amiga
3. ✅ ALL MCI codes process correctly
4. ✅ ALL doors have valid .info files in Commands/BBSCmd/
5. ✅ ALL door executables exist in Doors/[DoorName]/ (or are documented as needing TypeScript reimplementation)
6. ✅ Door command system loads and prioritizes doors correctly
7. ✅ NO original AmiExpress commands were modified
8. ✅ Complete test suite passes
9. ✅ Import report documents all changes
10. ✅ Backup created and tested before import

**NEVER settle for "good enough" - this is a 1:1 port, it must be EXACT.**

---

## Reference Documentation

**Read THESE before starting:**

1. `CLAUDE.md` - Project guidelines and rules
2. `AmiExpress-Sources/express.e` - Original implementation
3. `web/backend/src/doors/amigaDoorManager.ts` - Door management
4. `dev/docs-backup/AMIGA_DOOR_MANAGER_IMPLEMENTATION.md` - Door system docs
5. `dev/docs-backup/1-TO-