/**
 * Internode Chat Handlers Module
 *
 * This module contains all internode chat functionality - user-to-user chat system.
 * Ported from the monolithic index.ts (lines 1137-1500).
 *
 * Event Handlers:
 * - 'chat:request': User requests chat with another user
 * - 'chat:accept': User accepts chat request
 * - 'chat:decline': User declines chat request
 * - 'chat:message': Send message in internode chat
 * - 'chat:end': End internode chat session
 *
 * This is a 1:1 port of the internode chat system from the original AmiExpress BBS.
 *
 * @module handlers/internodeChatHandlers
 */

import { Socket, Server } from 'socket.io';
import { BBSSession, BBSState, LoggedOnSubState } from '../bbs/session';
import { RedisSessionStore } from '../server/sessionStore';
import { db } from '../database';

/**
 * Setup internode chat event handlers for a socket connection
 *
 * @param socket - The socket.io socket instance
 * @param io - The socket.io server instance
 * @param sessions - Redis session store for managing BBS sessions
 */
export function setupInternodeChatHandlers(socket: Socket, io: Server, sessions: RedisSessionStore) {

  /**
   * Handle chat request from user to another user
   * Ported from monolithic index.ts lines 1137-1244
   *
   * This handler:
   * 1. Validates current user is logged in
   * 2. Checks if initiator is available for chat
   * 3. Checks if user is already in a chat
   * 4. Finds target user
   * 5. Checks if target is same as initiator
   * 6. Checks if target is online
   * 7. Checks if target is available for chat
   * 8. Checks if target is already in a chat
   * 9. Creates chat session in database
   * 10. Sends invite to target user
   * 11. Notifies initiator
   * 12. Sets timeout for request (30 seconds)
   */
  socket.on('chat:request', async (data: { targetUsername: string }) => {
    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('chat:error', 'Session expired');
        return;
      }

      console.log(`[CHAT] User ${session.user?.username} requesting chat with ${data.targetUsername}`);

      // 1. Validate current user is logged in
      if (!session.user) {
        socket.emit('chat:error', 'You must be logged in to use chat');
        return;
      }

      // 2. Check if initiator is available for chat
      if (!session.user.availableForChat) {
        socket.emit('chat:error', 'You are not available for chat. Use CHAT TOGGLE to enable.');
        return;
      }

      // 3. Check if user is already in a chat
      if (session.chatSessionId) {
        socket.emit('chat:error', 'You are already in a chat session. End current chat first.');
        return;
      }

      // 4. Find target user
      const targetUser = await db.getUserByUsernameForOLM(data.targetUsername);
      if (!targetUser) {
        socket.emit('chat:error', `User "${data.targetUsername}" not found`);
        return;
      }

      // 5. Check if target is same as initiator
      if (targetUser.id === session.user.id) {
        socket.emit('chat:error', 'You cannot chat with yourself');
        return;
      }

      // 6. Check if target is online
      const allKeys = await sessions.getAllKeys();
      let targetSocketId: string | null = null;
      let targetSession: BBSSession | null = null;

      for (const socketId of allKeys) {
        const sess = await sessions.get(socketId);
        if (sess && sess.user && sess.user.id === targetUser.id) {
          targetSocketId = socketId;
          targetSession = sess;
          break;
        }
      }

      if (!targetSocketId || !targetSession) {
        socket.emit('chat:error', `User "${data.targetUsername}" is not online`);
        return;
      }

      // 7. Check if target is available for chat
      if (!targetUser.availableforchat) {
        socket.emit('chat:error', `User "${data.targetUsername}" is not available for chat`);
        return;
      }

      // 8. Check if target is already in a chat
      if (targetSession.chatSessionId) {
        socket.emit('chat:error', `User "${data.targetUsername}" is already in a chat session`);
        return;
      }

      // 9. Create chat session in database
      const sessionId = await db.createChatSession(
        session.user.id,
        session.user.username,
        socket.id,
        targetUser.id,
        targetUser.username,
        targetSocketId
      );

      console.log(`[CHAT] Session ${sessionId} created: ${session.user.username} → ${targetUser.username}`);

      // 10. Send invite to target user
      io.to(targetSocketId).emit('chat:invite', {
        sessionId: sessionId,
        from: session.user.username,
        fromId: session.user.id
      });

      // 11. Notify initiator
      socket.emit('chat:request-sent', {
        sessionId: sessionId,
        to: targetUser.username
      });

      // 12. Set timeout for request (30 seconds)
      setTimeout(async () => {
        const chatSession = await db.getChatSession(sessionId);
        if (chatSession && chatSession.status === 'requesting') {
          // Request timed out - auto decline
          await db.updateChatSessionStatus(sessionId, 'declined');
          socket.emit('chat:timeout', { username: targetUser.username });
          io.to(targetSocketId).emit('chat:invite-cancelled', { from: session.user.username });
          console.log(`[CHAT] Session ${sessionId} timed out - no response from ${targetUser.username}`);
        }
      }, 30000); // 30 seconds

    } catch (error) {
      console.error('[CHAT] Error in chat:request:', error);
      socket.emit('chat:error', 'Failed to send chat request');
    }
  });

  /**
   * Handle chat accept from recipient
   * Ported from monolithic index.ts lines 1247-1331
   *
   * This handler:
   * 1. Validates user is logged in
   * 2. Gets chat session from database
   * 3. Validates user is the recipient
   * 4. Validates session is in requesting state
   * 5. Updates session status to active
   * 6. Creates Socket.io room
   * 7. Gets both user sessions
   * 8. Updates both BBSSession objects
   * 9. Emits chat:started to both users
   */
  socket.on('chat:accept', async (data: { sessionId: string }) => {
    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('chat:error', 'Session expired');
        return;
      }

      console.log(`[CHAT] User accepting session ${data.sessionId}`);

      // 1. Validate user is logged in
      if (!session.user) {
        socket.emit('chat:error', 'You must be logged in');
        return;
      }

      // 2. Get chat session from database
      const chatSession = await db.getChatSession(data.sessionId);
      if (!chatSession) {
        socket.emit('chat:error', 'Chat session not found');
        return;
      }

      // 3. Validate user is the recipient
      if (chatSession.recipient_id !== session.user.id) {
        socket.emit('chat:error', 'You are not the recipient of this chat request');
        return;
      }

      // 4. Validate session is in requesting state
      if (chatSession.status !== 'requesting') {
        socket.emit('chat:error', `Chat request is no longer available (status: ${chatSession.status})`);
        return;
      }

      // 5. Update session status to active
      await db.updateChatSessionStatus(data.sessionId, 'active');

      // 6. Create Socket.io room
      const roomName = `chat:${data.sessionId}`;
      socket.join(roomName);
      io.sockets.sockets.get(chatSession.initiator_socket)?.join(roomName);

      // 7. Get both user sessions
      const initiatorSession = await sessions.get(chatSession.initiator_socket);
      const recipientSession = await sessions.get(chatSession.recipient_socket);

      if (!initiatorSession || !recipientSession) {
        socket.emit('chat:error', 'Failed to start chat - session not found');
        return;
      }

      // 8. Update both BBSSession objects
      initiatorSession.chatSessionId = data.sessionId;
      initiatorSession.chatWithUserId = session.user.id;
      initiatorSession.chatWithUsername = session.user.username;
      initiatorSession.previousState = initiatorSession.state;
      initiatorSession.previousSubState = initiatorSession.subState;
      initiatorSession.subState = LoggedOnSubState.CHAT;

      recipientSession.chatSessionId = data.sessionId;
      recipientSession.chatWithUserId = chatSession.initiator_id;
      recipientSession.chatWithUsername = chatSession.initiator_username;
      recipientSession.previousState = recipientSession.state;
      recipientSession.previousSubState = recipientSession.subState;
      recipientSession.subState = LoggedOnSubState.CHAT;

      await sessions.set(chatSession.initiator_socket, initiatorSession);
      await sessions.set(chatSession.recipient_socket, recipientSession);

      // 9. Emit chat:started to both users
      io.to(roomName).emit('chat:started', {
        sessionId: data.sessionId,
        withUsername: chatSession.initiator_username,
        withUserId: chatSession.initiator_id
      });

      // Update for initiator specifically
      io.to(chatSession.initiator_socket).emit('chat:started', {
        sessionId: data.sessionId,
        withUsername: chatSession.recipient_username,
        withUserId: chatSession.recipient_id
      });

      console.log(`[CHAT] Session ${data.sessionId} started: ${chatSession.initiator_username} <-> ${chatSession.recipient_username}`);

    } catch (error) {
      console.error('[CHAT] Error in chat:accept:', error);
      socket.emit('chat:error', 'Failed to accept chat request');
    }
  });

  /**
   * Handle chat decline from recipient
   * Ported from monolithic index.ts lines 1334-1367
   *
   * This handler:
   * 1. Validates user is logged in
   * 2. Gets chat session
   * 3. Validates user is the recipient
   * 4. Updates status to declined
   * 5. Notifies initiator
   */
  socket.on('chat:decline', async (data: { sessionId: string }) => {
    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        return;
      }

      console.log(`[CHAT] User declining session ${data.sessionId}`);

      // 1. Validate user is logged in
      if (!session.user) {
        return;
      }

      // 2. Get chat session
      const chatSession = await db.getChatSession(data.sessionId);
      if (!chatSession) {
        return;
      }

      // 3. Validate user is the recipient
      if (chatSession.recipient_id !== session.user.id) {
        return;
      }

      // 4. Update status to declined
      await db.updateChatSessionStatus(data.sessionId, 'declined');

      // 5. Notify initiator
      io.to(chatSession.initiator_socket).emit('chat:declined', {
        username: session.user.username
      });

      console.log(`[CHAT] Session ${data.sessionId} declined by ${session.user.username}`);

    } catch (error) {
      console.error('[CHAT] Error in chat:decline:', error);
    }
  });

  /**
   * Handle chat message from user
   * Ported from monolithic index.ts lines 1370-1429
   *
   * This handler:
   * 1. Validates user is in active chat
   * 2. Gets chat session
   * 3. Validates message length
   * 4. Sanitizes message (prevent ANSI injection)
   * 5. Saves message to database
   * 6. Emits to Socket.io room (both participants receive)
   */
  socket.on('chat:message', async (data: { message: string }) => {
    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        return;
      }

      // 1. Validate user is in active chat
      if (!session.chatSessionId) {
        socket.emit('chat:error', 'You are not in a chat session');
        return;
      }

      if (!session.user) {
        return;
      }

      // 2. Get chat session
      const chatSession = await db.getChatSession(session.chatSessionId);
      if (!chatSession || chatSession.status !== 'active') {
        socket.emit('chat:error', 'Chat session is not active');
        return;
      }

      // 3. Validate message length
      if (data.message.length === 0) {
        return;
      }

      if (data.message.length > 500) {
        socket.emit('chat:error', 'Message too long (max 500 characters)');
        return;
      }

      // 4. Sanitize message (prevent ANSI injection)
      const sanitized = data.message.replace(/\x1b/g, '').trim();
      if (sanitized.length === 0) {
        return;
      }

      // 5. Save message to database
      await db.saveChatMessage(
        session.chatSessionId,
        session.user.id,
        session.user.username,
        sanitized
      );

      // 6. Emit to Socket.io room (both participants receive)
      const roomName = `chat:${session.chatSessionId}`;
      io.to(roomName).emit('chat:message-received', {
        sessionId: session.chatSessionId,
        from: session.user.username,
        fromId: session.user.id,
        message: sanitized,
        timestamp: new Date()
      });

      console.log(`[CHAT] Message in session ${session.chatSessionId} from ${session.user.username}: ${sanitized.substring(0, 50)}...`);

    } catch (error) {
      console.error('[CHAT] Error in chat:message:', error);
      socket.emit('chat:error', 'Failed to send message');
    }
  });

  /**
   * Handle chat end from either participant
   * Ported from monolithic index.ts lines 1432-1500
   *
   * This handler:
   * 1. Validates user is in chat
   * 2. Gets chat session
   * 3. Ends session in database
   * 4. Gets message count
   * 5. Calculates duration
   * 6. Emits chat:ended to both users
   * 7. Leaves Socket.io room
   * 8. Restores previous state for both users
   */
  socket.on('chat:end', async () => {
    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        return;
      }

      console.log(`[CHAT] User ${session.user?.username} ending chat`);

      // 1. Validate user is in chat
      if (!session.chatSessionId) {
        return;
      }

      // 2. Get chat session
      const chatSession = await db.getChatSession(session.chatSessionId);
      if (!chatSession) {
        return;
      }

      // 3. End session in database
      await db.endChatSession(session.chatSessionId);

      // 4. Get message count
      const messageCount = await db.getChatMessageCount(session.chatSessionId);

      // 5. Calculate duration
      const duration = Math.floor((Date.now() - new Date(chatSession.started_at).getTime()) / 1000 / 60); // minutes

      // 6. Emit chat:ended to both users
      const roomName = `chat:${session.chatSessionId}`;
      io.to(roomName).emit('chat:ended', {
        sessionId: session.chatSessionId,
        messageCount: messageCount,
        duration: duration
      });

      // 7. Leave Socket.io room
      socket.leave(roomName);
      io.sockets.sockets.get(chatSession.initiator_socket)?.leave(roomName);
      io.sockets.sockets.get(chatSession.recipient_socket)?.leave(roomName);

      // 8. Restore previous state for both users
      const initiatorSession = await sessions.get(chatSession.initiator_socket);
      const recipientSession = await sessions.get(chatSession.recipient_socket);

      if (initiatorSession) {
        initiatorSession.state = initiatorSession.previousState || BBSState.LOGGEDON;
        initiatorSession.subState = initiatorSession.previousSubState || LoggedOnSubState.DISPLAY_MENU;
        initiatorSession.chatSessionId = undefined;
        initiatorSession.chatWithUserId = undefined;
        initiatorSession.chatWithUsername = undefined;
        initiatorSession.previousState = undefined;
        initiatorSession.previousSubState = undefined;
        await sessions.set(chatSession.initiator_socket, initiatorSession);
      }

      if (recipientSession) {
        recipientSession.state = recipientSession.previousState || BBSState.LOGGEDON;
        recipientSession.subState = recipientSession.previousSubState || LoggedOnSubState.DISPLAY_MENU;
        recipientSession.chatSessionId = undefined;
        recipientSession.chatWithUserId = undefined;
        recipientSession.chatWithUsername = undefined;
        recipientSession.previousState = undefined;
        recipientSession.previousSubState = undefined;
        await sessions.set(chatSession.recipient_socket, recipientSession);
      }

      console.log(`[CHAT] Session ${session.chatSessionId} ended: ${messageCount} messages, ${duration} minutes`);

    } catch (error) {
      console.error('[CHAT] Error in chat:end:', error);
    }
  });
}