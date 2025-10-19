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
  const bbsLocation = ''; // TODO: Get from config
  const version = '1.0.0-web';
  const registration = 'Open Source';
  const baudRate = 'FULL SPEED'; // Web connection

  // Get current date/time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const fullDateTime = `${dateStr} ${timeStr}`;

  // Build connection screen (matches express.e:29507-29524)
  let output = '\r\n';

  // Welcome message
  if (bbsLocation) {
    output += `\x1b[0mWelcome to ${bbsName}, located in ${bbsLocation}\r\n`;
  } else {
    output += `\x1b[0mWelcome to ${bbsName}.\r\n`;
  }

  output += '\r\n';
  output += `Running AmiExpress ${version} Copyright ©2018-2025 Darren Coles\r\n`;
  output += `Registration ${registration}. You are connected to Node ${nodeId} at ${baudRate}\r\n`;
  output += `Connection occured at ${fullDateTime}.\r\n`;
  output += '\r\n';

  // Get all node statuses and display
  const allNodes = nodeManager.getAllNodeStatuses();
  for (let i = 0; i < 8; i++) { // Display 8 nodes like original AmiExpress
    const nodeInfo = allNodes.find(n => n.id === i + 1); // Nodes are 1-indexed
    let status = 'Waiting';

    if (nodeInfo && nodeInfo.status === 'busy') {
      if (nodeInfo.currentUser) {
        // Get actual username from database
        try {
          const user = await db.getUserById(nodeInfo.currentUser);
          status = user ? user.username : nodeInfo.currentUser;
        } catch (error) {
          console.error('Error fetching username for node status:', error);
          status = nodeInfo.currentUser;
        }
      } else {
        status = 'Somebody';
      }
    }

    output += `Node ${i}:  ${status}\r\n`;
  }

  output += '\r\n';

  socket.emit('ansi-output', output);
}