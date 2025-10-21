#!/usr/bin/env node

/**
 * AmiExpress-Web Runtime Testing Script
 * Tests all major functionality end-to-end
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

class AmiExpressTester {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.sessionId = null;
    this.userId = null;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  addTest(name, fn) {
    this.tests.push({ name, fn });
  }

  async runTests() {
    this.log('Starting AmiExpress-Web Runtime Tests', 'info');

    for (const test of this.tests) {
      try {
        this.log(`Running test: ${test.name}`, 'info');
        await test.fn();
        this.passed++;
        this.log(`Test PASSED: ${test.name}`, 'success');
      } catch (error) {
        this.failed++;
        this.log(`Test FAILED: ${test.name} - ${error.message}`, 'error');
      }
    }

    this.log(`\nTest Results: ${this.passed} passed, ${this.failed} failed`, 'info');

    if (this.socket) {
      this.socket.disconnect();
    }

    process.exit(this.failed > 0 ? 1 : 0);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.log('Connecting to Socket.IO server...');
      this.socket = io('http://localhost:3001');

      this.socket.on('connect', () => {
        this.connected = true;
        this.sessionId = this.socket.id;
        this.log('Socket.IO connected successfully', 'success');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        this.log(`Socket.IO connection failed: ${err.message}`, 'error');
        reject(err);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        this.log('Socket.IO disconnected');
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  async waitForEvent(event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const handler = (data) => {
        this.socket.off(event, handler);
        resolve(data);
      };

      this.socket.on(event, handler);

      setTimeout(() => {
        this.socket.off(event, handler);
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);
    });
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      this.log(`Sending command: ${command}`);

      const responseHandler = (data) => {
        this.socket.off('ansi-output', responseHandler);
        resolve(data);
      };

      this.socket.on('ansi-output', responseHandler);
      this.socket.emit('command', command);

      setTimeout(() => {
        this.socket.off('ansi-output', responseHandler);
        reject(new Error(`Timeout waiting for command response: ${command}`));
      }, 10000);
    });
  }
}

// Create tester instance
const tester = new AmiExpressTester();

// Test 1: Basic connectivity
tester.addTest('Basic Socket.IO Connectivity', async () => {
  await tester.connect();
  if (!tester.connected) {
    throw new Error('Not connected to server');
  }
});

// Test 2: User registration
tester.addTest('User Registration', async () => {
  const testUsername = `testuser_${Date.now()}`;
  const testPassword = 'testpass123';

  tester.socket.emit('register', {
    username: testUsername,
    password: testPassword,
    realname: 'Test User',
    location: 'Test City',
    email: 'test@example.com'
  });

  const response = await tester.waitForEvent('ansi-output', 10000);
  if (!response || !response.includes('Welcome') && !response.includes('registered')) {
    throw new Error('Registration failed or unexpected response');
  }

  tester.log(`Registered user: ${testUsername}`);
});

// Test 3: User login
tester.addTest('User Login', async () => {
  tester.socket.emit('login', {
    username: 'sysop',
    password: 'sysop'
  });

  // Wait for login sequence
  let loginComplete = false;
  let attempts = 0;

  while (!loginComplete && attempts < 20) {
    const response = await tester.waitForEvent('ansi-output', 2000);
    if (response && (response.includes('Main Menu') || response.includes('Welcome back'))) {
      loginComplete = true;
    }
    attempts++;
  }

  if (!loginComplete) {
    throw new Error('Login sequence did not complete');
  }

  tester.log('Login sequence completed successfully');
});

// Test 4: Bulletin command (B)
tester.addTest('Bulletin Command (B)', async () => {
  const response = await tester.sendCommand('B');
  if (!response || !response.includes('Bulletin')) {
    throw new Error('Bulletin command failed');
  }
});

// Test 5: Help command (?)
tester.addTest('Help Command (?)', async () => {
  const response = await tester.sendCommand('?');
  if (!response || !response.includes('Available commands')) {
    throw new Error('Help command failed');
  }
});

// Test 6: Join conference command (J)
tester.addTest('Join Conference Command (J)', async () => {
  const response = await tester.sendCommand('J 1');
  if (!response || !response.includes('Conference')) {
    throw new Error('Join conference command failed');
  }
});

// Test 7: Read messages command (R)
tester.addTest('Read Messages Command (R)', async () => {
  const response = await tester.sendCommand('R');
  // R command might return empty if no messages, but should not error
  if (response === null) {
    throw new Error('Read messages command failed');
  }
});

// Test 8: Post message command (A)
tester.addTest('Post Message Command (A)', async () => {
  // First send A to start posting
  tester.socket.emit('command', 'A');

  // Wait for subject prompt
  const subjectPrompt = await tester.waitForEvent('ansi-output', 5000);
  if (!subjectPrompt || !subjectPrompt.includes('Subject')) {
    throw new Error('Post message subject prompt not received');
  }

  // Send subject
  tester.socket.emit('command', 'Test Message Subject');

  // Wait for body prompt
  const bodyPrompt = await tester.waitForEvent('ansi-output', 5000);
  if (!bodyPrompt || !bodyPrompt.includes('Body') && !bodyPrompt.includes('Message')) {
    throw new Error('Post message body prompt not received');
  }

  // Send body and end with /S
  tester.socket.emit('command', 'This is a test message body\n/S');

  // Wait for confirmation
  const confirmation = await tester.waitForEvent('ansi-output', 5000);
  if (!confirmation || !confirmation.includes('Posted') && !confirmation.includes('Message posted')) {
    throw new Error('Message posting confirmation not received');
  }
});

// Test 9: File areas command (F)
tester.addTest('File Areas Command (F)', async () => {
  const response = await tester.sendCommand('F');
  if (!response || !response.includes('File') && !response.includes('Area')) {
    throw new Error('File areas command failed');
  }
});

// Test 10: User statistics command (S)
tester.addTest('User Statistics Command (S)', async () => {
  const response = await tester.sendCommand('S');
  if (!response || !response.includes('Statistics') && !response.includes('Stats')) {
    throw new Error('User statistics command failed');
  }
});

// Test 11: Goodbye command (G)
tester.addTest('Goodbye Command (G)', async () => {
  const response = await tester.sendCommand('G');
  // G command should log out, response might be disconnect
  if (response === null) {
    // This is expected for logout
    tester.log('Logout command processed (expected null response)');
  }
});

// Test 12: File upload test (if files exist)
tester.addTest('File Upload Check', async () => {
  // Check if there are any files to download
  const response = await tester.sendCommand('D');
  // Just check that command doesn't crash
  if (response === null) {
    throw new Error('File download command failed');
  }
});

// Test 13: Who's online command (O)
tester.addTest('Who\'s Online Command (O)', async () => {
  const response = await tester.sendCommand('O');
  if (!response || !response.includes('Online') && !response.includes('Users')) {
    throw new Error('Who\'s online command failed');
  }
});

// Test 14: Time left command (T)
tester.addTest('Time Left Command (T)', async () => {
  const response = await tester.sendCommand('T');
  if (!response || !response.includes('Time') && !response.includes('Left')) {
    throw new Error('Time left command failed');
  }
});

// Test 15: Version command (VER)
tester.addTest('Version Command (VER)', async () => {
  const response = await tester.sendCommand('VER');
  if (!response || !response.includes('Version') && !response.includes('AmiExpress')) {
    throw new Error('Version command failed');
  }
});

// Run all tests
tester.runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});