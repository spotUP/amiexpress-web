/**
 * Conference Handlers Module
 *
 * Handles conference-related operations like joining conferences and message bases
 * Port from backend/backend/src/index.ts lines 1138-1270
 */

import { Socket } from 'socket.io';
import { BBSSession, BBSState, LoggedOnSubState } from '../bbs/session';
import { conferences, messageBases } from '../server/dataStore';
import { displayScreen, doPause } from '../bbs/screens';
import { loadMsgPointers, saveMsgPointers } from '../bbs/mailscan';
import { getMailStats, shouldScanForMail, callersLog } from '../bbs/helpers';
import { db } from '../database';

/**
 * Join conference function - 1:1 port of express.e:4975-5200 joinConf()
 * Parameters match express.e: joinConf(conf, msgBaseNum, confScan, auto, forceMailScan)
 */
export async function joinConference(
  socket: Socket,
  session: BBSSession,
  confId: number,
  msgBaseId: number,
  isConfScan: boolean = false,
  isAuto: boolean = false,
  forceMailScan: string = 'NOFORCE'
): Promise<boolean> {
  // Validate conference access (express.e:4982-4992)
  let conference = conferences.find(c => c.id === confId);
  if (!conference) {
    confId = 1; // Fallback to conference 1
    conference = conferences.find(c => c.id === confId);
  }

  // TODO: Check conference access with checkConfAccess(session, confId)
  // For now, assume all conferences are accessible

  const messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
  if (!messageBase) {
    msgBaseId = 1; // Fallback to first message base
  }

  // Set current conference/msgbase (express.e:4998-5000)
  if (!isConfScan) {
    session.currentConf = confId;
    session.currentMsgBase = msgBaseId;
  }

  session.currentConfName = conference?.name || 'General';
  session.relConfNum = confId;

  // Load message scan pointers (express.e:5033 loadMsgPointers)
  await loadMsgPointers(session, confId, msgBaseId);

  // Get mail statistics from database (express.e:5035-5048)
  const mailStats = await getMailStats(confId, msgBaseId);

  // Validate scan pointers against mail stats (express.e:5041-5048)
  if ((session.lastMsgReadConf || 0) < mailStats.lowestNotDel) {
    session.lastMsgReadConf = mailStats.lowestNotDel;
  }
  if ((session.lastNewReadConf || 0) < mailStats.lowestNotDel) {
    session.lastNewReadConf = mailStats.lowestNotDel;
  }
  if ((session.lastMsgReadConf || 0) > mailStats.highMsgNum) {
    session.lastMsgReadConf = 0;
  }
  if ((session.lastNewReadConf || 0) > mailStats.highMsgNum) {
    session.lastNewReadConf = 0;
  }

  // If not a scan operation, display conference join messages (express.e:5056-5132)
  if (!isConfScan) {
    // Display CONF_BULL screen (express.e:5056-5059)
    if (displayScreen(socket, session, 'CONF_BULL')) {
      doPause(socket, session);
    }

    // Show join message (express.e:5068-5106)
    socket.emit('ansi-output', '\r\n');
    if (isAuto) {
      socket.emit('ansi-output', `\x1b[32mConference ${confId}: ${session.currentConfName} [${messageBase?.name}] Auto-ReJoined\x1b[0m\r\n`);
    } else {
      socket.emit('ansi-output', `\x1b[32mJoining Conference:\x1b[33m\x1b[0m ${session.currentConfName} [${messageBase?.name}]\r\n`);
    }

    // Log conference join (express.e:5104-5106)
    if (session.user) {
      await callersLog(session.user.id, session.user.username, `${session.currentConfName} [${messageBase?.name}] (${confId}) Conference Joined`, '');
    }

    // Display message statistics (express.e:5109-5127)
    if (mailStats.lowestKey > 1) {
      socket.emit('ansi-output', `\x1b[32mMessages range from \x1b[33m( \x1b[0m${mailStats.lowestKey} \x1b[32m- \x1b[0m${mailStats.highMsgNum - 1} \x1b[33m)\x1b[0m\r\n`);
    } else {
      socket.emit('ansi-output', `\r\n\x1b[32mTotal messages           \x1b[33m:\x1b[0m ${mailStats.highMsgNum - 1}\r\n`);
    }

    const lastScanned = (session.lastNewReadConf || 0) - 1;
    socket.emit('ansi-output', `\r\n\x1b[32mLast message auto scanned\x1b[33m:\x1b[0m ${lastScanned < 0 ? 1 : lastScanned}\r\n`);
    socket.emit('ansi-output', `\x1b[32mLast message read        \x1b[33m:\x1b[0m ${session.lastMsgReadConf || 0}\r\n`);
  }

  // Perform message scan if requested (express.e:5136-5145)
  if (!isAuto && forceMailScan !== 'SKIP') {
    if (forceMailScan === 'ALL' || shouldScanForMail(session, confId, msgBaseId)) {
      // TODO: Implement actual message scanning
      // For now, just update the scan pointer to mark all as scanned
      session.lastNewReadConf = mailStats.highMsgNum;
      await saveMsgPointers(session, confId, msgBaseId);
    }
  }

  // Save confRJoin and msgBaseRJoin for auto-rejoin (express.e:5153-5156)
  if (!isAuto && !isConfScan && session.user) {
    session.user.confRJoin = confId;
    session.user.msgBaseRJoin = msgBaseId;
    // TODO: Update in database
    // await db.updateUser(session.user.id, { confRJoin: confId, msgBaseRJoin: msgBaseId });
  }

  return true;
}
