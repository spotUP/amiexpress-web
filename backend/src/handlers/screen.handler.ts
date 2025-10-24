/**
 * Screen Handler - Display BBS screen files with MCI code parsing
 *
 * Handles loading and displaying screen files (.TXT) from the BBS directory structure.
 * Based on express.e displayScreen() functions.
 */

import * as fs from 'fs';
import * as path from 'path';

// Import types (will be provided by index.ts)
interface BBSSession {
  currentConf?: number;
  currentConfName?: string;
  timeRemaining: number;
  user?: { username: string };
}

interface Conference {
  id: number;
  name: string;
}

// This will be injected from index.ts
let conferences: Conference[] = [];

export function setConferences(confs: Conference[]) {
  conferences = confs;
}

/**
 * Parse MCI codes in screen content
 * Replaces AmiExpress MCI variables like %B, %CF, %U, etc.
 *
 * @param content - Screen file content with MCI codes
 * @param session - Current BBS session
 * @param bbsName - BBS name for %B variable
 * @param sysopName - Sysop name for %S variable
 * @param location - BBS location for %L variable
 * @returns Parsed content with MCI codes replaced
 */
export function parseMciCodes(
  content: string,
  session: BBSSession,
  bbsName: string = 'AmiExpress-Web',
  sysopName: string = 'Sysop',
  location: string = 'The Internet'
): string {
  let parsed = content;

  // %B - BBS Name
  parsed = parsed.replace(/%B/g, bbsName);

  // %S - Sysop Name
  parsed = parsed.replace(/%S/g, sysopName);

  // %L - Location
  parsed = parsed.replace(/%L/g, location);

  // %CF - Current Conference Name
  parsed = parsed.replace(/%CF/g, session.currentConfName || 'Unknown');

  // %R - Baud Rate (for connection screens) / Time Remaining (for logged-in screens)
  // Use "38400" as default baud rate for web connections
  parsed = parsed.replace(/%R/g, session.user ? Math.floor(session.timeRemaining / 60).toString() : '38400');

  // %D and %T - Date/Time in Sanctuary BBS format: "Fri 17-Oct-2025 08:33:58"
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // %D - Full date/time: "Fri 17-Oct-2025 08:33:58"
  const fullDateTime = `${dayName} ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  parsed = parsed.replace(/%D/g, fullDateTime);

  // %T - Time only: "08:33:58"
  const timeStr = `${hours}:${minutes}:${seconds}`;
  parsed = parsed.replace(/%T/g, timeStr);

  // %U - Username
  parsed = parsed.replace(/%U/g, session.user?.username || 'Guest');

  // %NODELIST - Display all nodes with their status (like Sanctuary BBS)
  // IMPORTANT: Process multi-character MCI codes BEFORE single-character ones to avoid collisions
  if (parsed.includes('%NODELIST')) {
    let nodeList = '';
    const totalNodes = 8; // Total number of nodes in the system
    const currentNode = 1; // Current node (we're always on node 1 in web version)

    for (let i = 0; i < totalNodes; i++) {
      let status = 'Waiting';
      if (i === currentNode) {
        status = 'You';
      } else if (i === 0) {
        status = 'Sysop';  // Node 0 reserved for sysop
      } else if (i === 7) {
        status = 'Shutdown';  // Node 7 shutdown like Sanctuary
      }

      nodeList += `Node ${i}:  ${status}\r\n`;
    }

    parsed = parsed.replace(/%NODELIST/g, nodeList);
  }

  // %N - Node Number (always 1 in web version)
  // Process AFTER %NODELIST to avoid turning %NODELIST into 1ODELIST
  parsed = parsed.replace(/%N/g, '1');

  // %C - Number of conferences
  parsed = parsed.replace(/%C/g, conferences.length.toString());

  return parsed;
}

/**
 * Load screen file from disk
 * Searches in priority order: Conference → Node → Global BBS screens
 * Like express.e displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns Screen file content or null if not found
 */
export function loadScreenFile(screenName: string, conferenceId?: number, nodeId: number = 0): string | null {
  // BBS directory structure matches original Amiga AmiExpress
  // From backend/src/handlers, go up to backend/, then into BBS/
  const baseDir = path.join(__dirname, '../../BBS');
  const paths = [];

  // Try conference-specific screen first (if provided)
  if (conferenceId) {
    // Find the relative conference number (1-based position in conferences array)
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const confPath = path.join(baseDir, `Conf${String(relConfNum).padStart(2, '0')}`, 'Screens', `${screenName}.TXT`);
      paths.push(confPath);
    }
  }

  // Then try node-specific screen
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.TXT`);
  paths.push(nodePath);

  // Then try default BBS screens
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.TXT`);
  paths.push(bbsPath);

  // Try each path in order
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        console.log(`✓ Loaded screen ${screenName} from: ${filePath}`);
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch (error) {
      console.error(`Error loading screen ${screenName} from ${filePath}:`, error);
    }
  }

  console.warn(`Screen file not found: ${screenName} (tried: ${paths.join(', ')})`);
  return null;
}

/**
 * Add ESC character prefix to bare ANSI sequences
 * Screen files contain [XXm without ESC (0x1B) prefix
 * This matches original Amiga behavior where ESC was stored as actual byte
 *
 * @param content - Screen content with bare ANSI codes
 * @returns Content with proper ESC prefixes
 */
export function addAnsiEscapes(content: string): string {
  // Match ANSI sequences: [digits;digitsm or [digitm or [H or [2J etc
  // But NOT [%X] which are variable placeholders
  // And NOT isolated brackets like [AmiExpress-Web] - only valid ANSI sequences
  // Valid: [0m, [1;32m, [2J, [H, etc. - must start with digit or be special (H,J,K)
  return content.replace(/\[([0-9;]+[A-Za-z]|[HJK]|2J)/g, '\x1b[$1');
}

/**
 * Display a screen file to the user
 * Like express.e displayScreen(screenName) - express.e:28566, 28571, 28586
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session
 * @param screenName - Name of screen to display
 * @returns true if screen was displayed successfully, false otherwise
 */
export function displayScreen(socket: any, session: BBSSession, screenName: string): boolean {
  const content = loadScreenFile(screenName, session.currentConf);

  if (content) {
    // Parse MCI codes
    let parsed = parseMciCodes(content, session);

    // Add ESC prefix to bare ANSI sequences (Amiga screen files don't have ESC prefix)
    parsed = addAnsiEscapes(parsed);

    // Convert Unix line endings (\n) to BBS line endings (\r\n) for proper terminal display
    // First normalize any existing \r\n to \n, then convert all \n to \r\n
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // Send to client
    socket.emit('ansi-output', parsed);
    return true;
  } else {
    // Fallback if screen not found
    console.warn(`Using fallback for screen: ${screenName}`);
    socket.emit('ansi-output', `\x1b[36m-= ${screenName} =-\x1b[0m\r\n`);
    return false;
  }
}

/**
 * Check if a .keys file exists for the given screen
 * Like express.e:6567-6573 - checks for screenfile + '.keys'
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns true if .keys file exists, false otherwise
 */
export function hasKeysFile(screenName: string, conferenceId?: number, nodeId: number = 0): boolean {
  const baseDir = path.join(__dirname, '../../BBS');
  const paths = [];

  // Try conference-specific .keys file first (if provided)
  if (conferenceId) {
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const confPath = path.join(baseDir, `Conf${String(relConfNum).padStart(2, '0')}`, 'Screens', `${screenName}.keys`);
      paths.push(confPath);
    }
  }

  // Then try node-specific .keys file
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.keys`);
  paths.push(nodePath);

  // Then try default BBS .keys file
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.keys`);
  paths.push(bbsPath);

  // Check each path in order
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      console.log(`✓ Found .keys file: ${filePath}`);
      return true;
    }
  }

  console.log(`No .keys file found for screen: ${screenName}`);
  return false;
}

/**
 * Display "Press any key..." pause prompt
 * Like express.e doPause() - express.e:28566, 28571
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session (for future enhancements)
 */
export function doPause(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  // Note: Actual key wait is handled by client sending keypress event
  // This just displays the prompt
}
