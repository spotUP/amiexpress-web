/**
 * Connection Screen Display
 * Port from backend/backend/src/index.ts lines 836-910
 * 
 * Displays the connection screen with:
 * - Welcome message with BBS name and location
 * - Version and registration info
 * - Node status for all 8 nodes
 * - Connection timestamp
 */

import { Socket } from 'socket.io';
import { BBSSession, BBSState } from './session';
import { db } from '../database';
import { nodeManager } from '../nodes';

/**
 * Display connection screen (express.e:29507-29524 processLogon)
 */
export async function displayConnectionScreen(socket: Socket, session: BBSSession, nodeId: number): Promise<void> {
  const bbsName = 'AmiExpress Web BBS'; // TODO: Get from config
  const bbsLocation = 'Sweden'; // TODO: Get from config
  const version = '5.6.1';
  const registration = 'Open Source';
  const baudRate = 19200; // Simulated baud rate for authenticity

  // Get current date/time in AmiExpress format
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const day = String(now.getDate()).padStart(2, '0');
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const year = now.getFullYear();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  const fullDateTime = `${weekday} ${day}-${month}-${year} ${time}`;

  // Build connection screen (matches express.e:29490-29527 exactly)
  let output = '';

  // FRONTEND command output (express.e:29527 runSysCommand('FRONTEND',''))
  // This simulates the /X Native Telnet messages
  output += '/X Native Telnet:  Searching for free node...\r\n';
  output += `/X Native Telnet:  Successful connection to node ${nodeId}\r\n`;
  output += '\r\n';

  // Connect string (express.e:29490-29491 aePuts(connectString))
  output += `CONNECT ${baudRate}\r\n`;

  // IEMSI handshake (express.e:29496-29497)
  output += '**EMSI_IRQ8E08\r\n';
  output += '\r\n';

  // Welcome message (express.e:29507-29510)
  if (bbsLocation) {
    output += `\x1b[0mWelcome to ${bbsName}, located in ${bbsLocation}\r\n`;
  } else {
    output += `\x1b[0mWelcome to ${bbsName}.\r\n`;
  }

  output += '\r\n';
  
  // Version and registration info (express.e:29512-29516)
  output += `Running AmiExpress ${version} Copyright ©2018-2025 Darren Coles\r\n`;
  output += `Registration ${registration}. You are connected to Node ${nodeId} at ${baudRate} baud\r\n`;
  output += `Connection occured at ${fullDateTime}.\r\n`;
  output += '\r\n';

  // Get all node statuses and display (matches real BBS output)
  const allNodes = nodeManager.getAllNodeStatuses();
  for (let i = 0; i < 8; i++) { // Display 8 nodes like original AmiExpress
    const nodeNum = i; // Nodes are 0-indexed in display
    const nodeInfo = allNodes.find(n => n.id === i + 1); // But 1-indexed in manager
    let status = 'Waiting';

    if (nodeInfo && nodeInfo.status === 'busy') {
      // Check if this is the current user's node
      if (nodeInfo.id === nodeId) {
        status = 'You';
      } else if (nodeInfo.currentUser) {
        // Get actual username from database
        try {
          const user = await db.getUserById(nodeInfo.currentUser);
          status = user ? user.username : 'Somebody';
        } catch (error) {
          console.error('Error fetching username for node status:', error);
          status = 'Somebody';
        }
      } else {
        status = 'Somebody';
      }
    } else if (nodeInfo && nodeInfo.status === 'down') {
      status = 'Shutdown';
    } else if (nodeInfo && nodeInfo.status === 'maintenance') {
      status = 'Maintenance';
    }

    output += `Node ${nodeNum}:  ${status}\r\n`;
  }

  socket.emit('ansi-output', output);
}