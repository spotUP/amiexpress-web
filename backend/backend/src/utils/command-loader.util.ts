/**
 * Command Loader Utility - .cmd file loader and parser
 *
 * This module implements the AmiExpress command lookup system
 * Based on express.e:4614-4817 runCommand() (1:1 port)
 *
 * In the original AmiExpress, .cmd files were Amiga .info files with ToolTypes
 * For the web version, we use JSON files with the same metadata structure
 *
 * Command Search Order (express.e:4631-4664):
 * BBS Commands:
 *   1. BBS/Conf{X}/Cmds/{command}.cmd (conference-specific)
 *   2. Node{N}/Cmds/{command}.cmd (node-specific)
 *   3. BBS/Cmds/{command}.cmd (global BBS)
 *
 * System Commands:
 *   1. BBS/Conf{X}/SysCmds/{command}.cmd (conference sys)
 *   2. Node{N}/SysCmds/{command}.cmd (node sys)
 *   3. BBS/SysCmds/{command}.cmd (global sys)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Command types (express.e:4677-4696)
 */
export enum DoorType {
  SIM = 'SIM',   // Simple door - runs external program
  XIM = 'XIM',   // External door with XPR protocol support
  AIM = 'AIM',   // AmiExpress Internal Module
  TIM = 'TIM',   // Text Interface Module
  IIM = 'IIM',   // Internal Interface Module
  MCI = 'MCI',   // MCI code processor
  AEM = 'AEM',   // AmiExpress External Module
  SUP = 'SUP'    // Supplemental door type
}

/**
 * Command metadata structure (matches express.e ToolTypes)
 */
export interface CommandMetadata {
  // Basic identification
  name?: string;              // Display name for the door
  type: DoorType;             // Door type (SIM, XIM, etc.)

  // Security & Access
  access: number;             // Required security level (0-255)
  password?: string;          // Optional password protection

  // Execution
  location?: string;          // Path to external program
  internal?: string;          // Internal command to execute instead
  passParameters?: number;    // How to pass params (0-5)

  // Display
  banner?: string;            // Screen file to show before execution
  expertMode?: boolean;       // Force expert mode (EXPERT_MODE tooltype)
  silent?: boolean;           // Silent execution (SILENT tooltype)

  // Advanced options
  priority?: number | 'same'; // Task priority
  stack?: number;             // Stack size
  resident?: boolean;         // Keep resident in memory
  trapOn?: boolean;           // Enable trap handling
  quickMode?: boolean;        // Skip if quick logoff
  mimicVer?: string;          // Version to mimic
  scriptCheck?: boolean;      // Auto-set script flag
  logInputs?: boolean;        // Log user inputs
}

/**
 * Command type enum (express.e CMDTYPE_xxx)
 */
export enum CommandType {
  BBSCMD = 'BBS',      // BBS command (user command)
  SYSCMD = 'SYS',      // System command (internal/privileged)
  CUSTOM = 'CUSTOM'    // Custom command type
}

/**
 * Tool type enum for path construction (express.e TOOLTYPE_xxx)
 */
enum ToolType {
  // BBS Commands
  CONFCMD = 'CONFCMD',           // Conference BBS commands
  NODECMD = 'NODECMD',           // Node BBS commands
  BBSCMD = 'BBSCMD',             // Global BBS commands

  // System Commands
  CONFSYSCMD = 'CONFSYSCMD',     // Conference system commands
  NODESYSCMD = 'NODESYSCMD',     // Node system commands
  SYSCMD = 'SYSCMD',             // Global system commands

  // Custom
  CONFCMD2 = 'CONFCMD2'          // Custom conference commands
}

/**
 * Subtype levels for search priority (express.e SUBTYPE_xxx)
 */
enum SubType {
  CONFCMD = 0,     // Conference level
  NODECMD = 1,     // Node level
  CMD = 2,         // Global level
  INTCMD = 3,      // Internal command
  ANYCMD = 4       // Any command type
}

/**
 * Load command metadata from .cmd file
 * Based on express.e:4614-4676 (1:1 port)
 *
 * @param cmdType - Command type (BBS or SYS)
 * @param cmdName - Command name to look up
 * @param confNum - Current conference number
 * @param nodeNum - Current node number
 * @param subtype - Starting subtype level (-1 = search all)
 * @returns Command metadata if found, null otherwise
 */
export async function loadCommand(
  cmdType: CommandType,
  cmdName: string,
  confNum: number = 1,
  nodeNum: number = 0,
  subtype: number = -1
): Promise<{ metadata: CommandMetadata; tooltype: ToolType; subtype: SubType } | null> {

  let searchPaths: Array<{ tooltype: ToolType; subtype: SubType; path: string }> = [];

  // Build search paths based on command type (express.e:4619-4675)
  if (cmdType === CommandType.BBSCMD) {
    // BBS command search order (express.e:4631-4643)
    searchPaths = [
      {
        tooltype: ToolType.CONFCMD,
        subtype: SubType.CONFCMD,
        path: path.join(__dirname, `../../../BBS/Conf${String(confNum).padStart(2, '0')}/Cmds/${cmdName}.cmd`)
      },
      {
        tooltype: ToolType.NODECMD,
        subtype: SubType.NODECMD,
        path: path.join(__dirname, `../../../Node${nodeNum}/Cmds/${cmdName}.cmd`)
      },
      {
        tooltype: ToolType.BBSCMD,
        subtype: SubType.CMD,
        path: path.join(__dirname, `../../../BBS/Cmds/${cmdName}.cmd`)
      }
    ];
  } else if (cmdType === CommandType.SYSCMD) {
    // System command search order (express.e:4652-4664)
    searchPaths = [
      {
        tooltype: ToolType.CONFSYSCMD,
        subtype: SubType.CONFCMD,
        path: path.join(__dirname, `../../../BBS/Conf${String(confNum).padStart(2, '0')}/SysCmds/${cmdName}.cmd`)
      },
      {
        tooltype: ToolType.NODESYSCMD,
        subtype: SubType.NODECMD,
        path: path.join(__dirname, `../../../Node${nodeNum}/SysCmds/${cmdName}.cmd`)
      },
      {
        tooltype: ToolType.SYSCMD,
        subtype: SubType.CMD,
        path: path.join(__dirname, `../../../BBS/SysCmds/${cmdName}.cmd`)
      }
    ];
  } else if (cmdType === CommandType.CUSTOM) {
    // Custom command (express.e:4668-4675)
    searchPaths = [
      {
        tooltype: ToolType.CONFCMD2,
        subtype: SubType.CONFCMD,
        path: path.join(__dirname, `../../../BBS/Conf${String(confNum).padStart(2, '0')}/Cmds2/${cmdName}.cmd`)
      }
    ];
  }

  // Search for command file in order (express.e:4631-4675)
  for (const searchPath of searchPaths) {
    // Skip if subtype is lower priority than requested (express.e:4632, 4637, 4642)
    if (subtype >= 0 && searchPath.subtype > subtype) {
      continue;
    }

    // Check if file exists (configFileExists equivalent - express.e:422)
    try {
      await fs.access(searchPath.path);

      // Read and parse command file
      const fileContent = await fs.readFile(searchPath.path, 'utf-8');
      const metadata = JSON.parse(fileContent) as CommandMetadata;

      // Set default type if not specified (express.e:4677)
      if (!metadata.type) {
        metadata.type = DoorType.SIM;
      }

      // Set default access level if not specified (express.e:4703)
      if (metadata.access === undefined) {
        metadata.access = 0; // 0 = everyone has access
      }

      return {
        metadata,
        tooltype: searchPath.tooltype,
        subtype: searchPath.subtype
      };
    } catch (error) {
      // File doesn't exist or can't be read, try next path
      continue;
    }
  }

  // No command file found (express.e:4644, 4665, 4676)
  return null;
}

/**
 * Check if command file exists (configFileExists equivalent)
 * Based on express.e:422
 *
 * @param filePath - Path to check
 * @returns true if file exists and is readable
 */
export async function commandFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
