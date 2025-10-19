/**
 * BBS Helper Functions
 * Ported from backend/backend/src/index.ts
 * 
 * Contains utility functions for:
 * - Caller activity logging
 * - User statistics
 * - Mail statistics
 * - Parameter parsing
 * - Activity mapping
 */

import { BBSSession, LoggedOnSubState } from './session';
import { db } from '../database';

/**
 * Log caller activity (express.e:9493 callersLog)
 * Logs to database like express.e logs to BBS:Node{X}/CallersLog file
 */
export async function callersLog(
  userId: string | null,
  username: string,
  action: string,
  details?: string,
  nodeId: number = 1
): Promise<void> {
  try {
    await db.logCallerActivity(userId, username, action, details, nodeId);
  } catch (error) {
    console.error('Error logging caller activity:', error);
    // Fail silently like express.e would
  }
}

/**
 * Get recent caller activity from database
 */
export async function getRecentCallerActivity(limit: number = 20, nodeId?: number): Promise<any[]> {
  try {
    return await db.getRecentCallerActivity(limit, nodeId);
  } catch (error) {
    console.error('Error getting caller activity:', error);
    return [];
  }
}

/**
 * Get or initialize user stats
 */
export async function getUserStats(userId: string): Promise<any> {
  try {
    return await db.getUserStats(userId);
  } catch (error) {
    console.error('Error getting user stats:', error);
    return {
      bytes_uploaded: 0,
      bytes_downloaded: 0,
      files_uploaded: 0,
      files_downloaded: 0
    };
  }
}

/**
 * Helper to get mail statistics (express.e:5035 getMailStatFile)
 */
export async function getMailStats(confId: number, msgBaseId: number): Promise<{
  lowestKey: number;
  highMsgNum: number;
  lowestNotDel: number;
}> {
  try {
    // TODO: Implement mail_stats table query
    // For now, return default stats
    return {
      lowestKey: 1,
      highMsgNum: 1,
      lowestNotDel: 0
    };
  } catch (error) {
    console.error('Error getting mail stats:', error);
    return {
      lowestKey: 1,
      highMsgNum: 1,
      lowestNotDel: 0
    };
  }
}

/**
 * Helper to check if should scan for mail (express.e checkMailConfScan)
 */
export function shouldScanForMail(session: BBSSession, confId: number, msgBaseId: number): boolean {
  // TODO: Implement scan flags checking
  // For now, default to true (always scan)
  return true;
}

/**
 * parseParams() - Parameter parsing utility (1:1 with AmiExpress parseParams)
 */
export function parseParams(paramString: string): string[] {
  if (!paramString.trim()) return [];

  return paramString.split(' ')
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0);
}

/**
 * Map substate to human-readable activity for WHO command
 */
export function getActivityFromSubState(subState?: LoggedOnSubState): string {
  if (!subState) return 'IDLE';

  // Match express.e ENV_* states
  switch (subState) {
    case LoggedOnSubState.DISPLAY_MENU:
    case LoggedOnSubState.READ_COMMAND:
    case LoggedOnSubState.READ_SHORTCUTS:
      return 'MAIN MENU';
    case LoggedOnSubState.READ_MESSAGES:
      return 'READING MAIL';
    case LoggedOnSubState.POST_MESSAGE:
    case LoggedOnSubState.POST_MESSAGE_SUBJECT:
    case LoggedOnSubState.POST_MESSAGE_TO:
    case LoggedOnSubState.POST_MESSAGE_BODY:
      return 'POSTING MESSAGE';
    case LoggedOnSubState.FILES_MAIN:
    case LoggedOnSubState.FILES_VIEW_AREA:
      return 'BROWSING FILES';
    case LoggedOnSubState.FILES_DOWNLOAD:
      return 'DOWNLOADING';
    case LoggedOnSubState.FILES_UPLOAD:
      return 'UPLOADING';
    case LoggedOnSubState.FILES_MAINTENANCE:
    case LoggedOnSubState.FILES_MAINT_SELECT:
      return 'FILE MAINT';
    case LoggedOnSubState.DOOR_RUNNING:
      return 'IN DOOR';
    case LoggedOnSubState.CHAT_PAGE_SYSOP:
    case LoggedOnSubState.CHAT_SESSION:
      return 'CHATTING';
    case LoggedOnSubState.ACCOUNT_MENU:
    case LoggedOnSubState.ACCOUNT_EDIT_SETTINGS:
      return 'ACCOUNT EDITING';
    case LoggedOnSubState.CONFERENCE_SELECT:
    case LoggedOnSubState.CONFERENCE_JOIN:
      return 'JOINING CONF';
    default:
      return 'IDLE';
  }
}

/**
 * Process queued online messages (express.e:29108)
 */
export function processOlmMessageQueue(socket: any, session: BBSSession, showMessages: boolean): void {
  // In express.e, this displays queued online messages (OLM)
  // These are instant messages from other users that arrived while busy

  if (!session.tempData?.olmQueue) {
    session.tempData = session.tempData || {};
    session.tempData.olmQueue = [];
  }

  if (session.tempData.olmQueue.length > 0) {
    if (showMessages) {
      socket.emit('ansi-output', '\r\nDisplaying Message Queue\r\n');
      session.tempData.olmQueue.forEach((msg: string) => {
        socket.emit('ansi-output', msg + '\r\n');
      });
    }
    session.tempData.olmQueue = [];
  }
}

/**
 * Load flagged files for user (express.e:2757)
 */
export async function loadFlagged(socket: any, session: BBSSession): Promise<void> {
  try {
    // Initialize flaggedFiles list if not exists
    if (!session.tempData) {
      session.tempData = {};
    }
    if (!session.tempData.flaggedFiles) {
      session.tempData.flaggedFiles = [];
    }

    // Load user's flagged files from database
    // TODO: Implement flagged files table and query method
    session.tempData.flaggedFiles = [];

    // Like express.e:2795 - display notification if files exist
    if (session.tempData.flaggedFiles.length > 0) {
      socket.emit('ansi-output', '\r\n** Flagged File(s) Exist **\r\n');
      socket.emit('ansi-output', '\x07'); // sendBELL()
    }
  } catch (error) {
    console.error('Error loading flagged files:', error);
  }
}

/**
 * Load command history for user (express.e:2669)
 */
export async function loadHistory(session: BBSSession): Promise<void> {
  try {
    // Initialize history storage
    if (!session.tempData) {
      session.tempData = {};
    }

    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;

    // TODO: Implement command_history table and query method
  } catch (error) {
    console.error('Error loading command history:', error);
    session.tempData = session.tempData || {};
    session.tempData.historyBuf = [];
    session.tempData.historyNum = 0;
    session.tempData.historyCycle = 0;
  }
}