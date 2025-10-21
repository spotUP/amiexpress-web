
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

// Font loading and caching utilities
const FONT_CACHE_KEY = 'unscii-font-cache';
const FONT_URL = '/Fonts/unscii-16-full.ttf.gz';

const loadUnsciiFont = async (): Promise<void> => {
  // Check if font is already cached
  const cached = localStorage.getItem(FONT_CACHE_KEY);
  if (cached) {
    try {
      // Verify cached font is still valid
      const fontFace = new FontFace('unscii', `url(data:font/ttf;base64,${cached})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      console.log('✅ Unscii font loaded from cache');
      return;
    } catch (error) {
      console.warn('⚠️ Cached font invalid, reloading...');
      localStorage.removeItem(FONT_CACHE_KEY);
    }
  }

  try {
    // Fetch and cache the font
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Cache in localStorage
    localStorage.setItem(FONT_CACHE_KEY, base64);

    // Load the font
    const fontFace = new FontFace('unscii', `url(data:font/ttf;base64,${base64})`);
    await fontFace.load();
    document.fonts.add(fontFace);

    console.log('✅ Unscii font downloaded and cached');
  } catch (error) {
    console.error('❌ Failed to load Unscii font:', error);
    // Font will fall back to mosoul or monospace
  }
};

// Minigame state management
interface MinigameState {
  active: boolean;
  type: 'redbox' | 'bluebox' | 'tonegen' | 'hack' | 'program' | null;
  data: any;
}

function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const socket = useRef<Socket | null>(null);
  const minigameState = useRef<MinigameState>({ active: false, type: null, data: null });
  const minigameContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Load Unscii font first
    loadUnsciiFont();

    // Initialize xterm.js terminal with canvas renderer for authentic BBS display
    const term = new Terminal({
      fontFamily: 'unscii, mosoul, "Courier New", monospace',
      fontSize: 16,
      lineHeight: 1.2,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ff0000',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#808080',
        brightRed: '#ff8080',
        brightGreen: '#80ff80',
        brightYellow: '#ffff80',
        brightBlue: '#8080ff',
        brightMagenta: '#ff80ff',
        brightCyan: '#80ffff',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      cols: 80,
      rows: 24,
      scrollback: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      allowProposedApi: true
    });

    // Open terminal in the DOM
    term.open(terminalRef.current);
    terminal.current = term;

    // Create minigame overlay container
    const gameContainer = document.createElement('div');
    gameContainer.id = 'minigame-overlay';
    gameContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000;
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
    `;
    document.body.appendChild(gameContainer);
    minigameContainer.current = gameContainer;

    // Force font size and disable smoothing after terminal is opened
    setTimeout(() => {
      term.options.fontSize = 16;
      // Try to disable font smoothing programmatically
      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.fontSmooth = 'never';
        style.webkitFontSmoothing = 'none';
        style.MozOsxFontSmoothing = 'none';
        // No padding - screens are designed for full 80-column display
      }
      term.refresh(0, term.rows - 1);
      // Autofocus terminal so user can interact immediately without clicking
      term.focus();
    }, 100);

    // Connect to backend (environment-aware configuration)
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const backendUrl = isDevelopment ? 'http://localhost:3001' : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

    console.log('🔌 Connecting to backend:', backendUrl, 'Environment:', isDevelopment ? 'development' : 'production');
    console.log('🔍 User Agent:', navigator.userAgent);
    console.log('🔍 Protocol:', window.location.protocol);
    console.log('🔍 Hostname:', window.location.hostname);

    // Use WebSocket in production (Render.com supports persistent connections)
    const allowedTransports = ['websocket'];

    const ws = io(backendUrl, {
      transports: allowedTransports,
      timeout: 60000, // Increased timeout for Render.com cold starts (60 seconds)
      forceNew: true,
      upgrade: true, // Always allow upgrades for WebSocket connections
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: isDevelopment ? 5 : 10, // More attempts for production cold starts
      reconnectionDelay: 2000, // Longer delay between attempts
      reconnectionDelayMax: 10000 // Max delay of 10 seconds
    });
    socket.current = ws;

    // Connection handling
    ws.on('connect', () => {
      const transport = ws.io.engine.transport.name;
      console.log(`✅ Connected to BBS backend via ${transport}`);
      console.log(`🔍 Transport details:`, {
        name: transport,
        writable: ws.io.engine.transport.writable
      });
      if (transport === 'polling') {
        console.log('ℹ️ Using HTTP polling - real-time features limited but functional');
      }

      // If we were waiting for connection to login, retry login now
      if (loginState.current === 'password' && username.current && password.current) {
        console.log('🔄 Connection established - retrying login automatically');
        ws.emit('login', { username: username.current, password: password.current });
        loginState.current = 'loggedin';
      }
    });

    ws.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      console.error('🔍 Error details:', error);
      if (isDevelopment) {
        console.log('💡 Make sure backend is running: cd backend && npm run dev');
      } else {
        console.log('💡 Production mode: Render.com may be cold-starting (up to 50 seconds)');
        console.log('🔍 Will retry connection automatically...');
      }
    });

    ws.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from BBS backend:', reason);
      console.log('🔍 Disconnect details:', {
        reason: reason,
        wasConnected: ws.connected,
        transport: ws.io?.engine?.transport?.name
      });

      // Clear token on disconnect if it was a logout
      if (reason === 'io client disconnect') {
        localStorage.removeItem('bbs_auth_token');
        console.log('🔐 Auth token cleared on logout');
      }
    });

    // Add transport upgrade/downgrade logging
    ws.on('ping', () => console.log('🏓 Ping sent'));
    ws.on('pong', () => console.log('🏓 Pong received'));
    ws.on('reconnect', (attempt) => console.log(`🔄 Reconnected after ${attempt} attempts`));
    ws.on('reconnect_attempt', (attempt) => console.log(`🔄 Reconnection attempt ${attempt}`));
    ws.on('reconnect_error', (error) => console.error('🔄 Reconnection error:', error));
    ws.on('reconnect_failed', () => console.error('🔄 Reconnection failed'));

    // Handle terminal output from server
    ws.on('ansi-output', (data: string) => {
      term.write(data);
    });

    // Handle minigame activation
    ws.on('start-minigame', (gameData: { type: string, data: any }) => {
      console.log('🎮 Starting minigame:', gameData.type);
      startMinigame(gameData.type as any, gameData.data);
    });

    // Handle minigame result from frontend
    ws.on('minigame-result', (result: any) => {
      console.log('🎮 Minigame result received:', result);
      // This will be handled by the backend door system
    });

    // Handle login success
    ws.on('login-success', (data: any) => {
      console.log('Login successful:', data);

      // Store JWT token in localStorage for persistent login
      if (data && data.token) {
        localStorage.setItem('bbs_auth_token', data.token);
        console.log('🔐 Auth token stored in localStorage');
      }

      // CRITICAL: Set login state to 'loggedin' to prevent signup events
      loginState.current = 'loggedin';
      console.log('✓ Login state set to: loggedin');

      // Focus terminal after login so user can interact immediately
      term.focus();
    });

    // Handle login failure
    ws.on('login-failed', (reason: string) => {
      console.log('Login failed:', reason);

      // Clear token on failed login
      localStorage.removeItem('bbs_auth_token');

      // If password failed, prompt for password again
      if (reason === 'Invalid password') {
        loginState.current = 'password';
        password.current = '';
      }
    });

    // Handle username validation results
    ws.on('username-valid', (data: { username: string }) => {
      console.log('Username valid, requesting password');
      loginState.current = 'password';
      username.current = data.username;
      password.current = '';
    });

    ws.on('username-invalid', () => {
      console.log('Username invalid, retry');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    ws.on('username-not-found', (data: { username: string }) => {
      console.log('Username not found:', data.username);
      loginState.current = 'username-choice';
      username.current = data.username;
    });

    // Handle signup prompts
    ws.on('signup-prompt', (data: { field: string }) => {
      console.log('📝 Signup prompt for field:', data.field);
      if (!signupData.current) {
        signupData.current = { field: '', value: '' };
      }
      signupData.current.field = data.field;
      signupData.current.value = '';

      // Handle password masking
      if (data.field === 'password') {
        loginState.current = 'signup-password';
      } else {
        loginState.current = 'signup';
      }
    });

    // Handle file upload request from server
    ws.on('show-file-upload', (options: { accept: string; maxSize: number; uploadUrl: string; fieldName: string }) => {
      console.log('📂 File upload requested:', options);
      handleFileUpload(options, ws, term);
    });

    // Handle login prompt request from backend
    ws.on('request-login', () => {
      console.log('🔐 Backend requested login prompt');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
    });

    // Handle terminal input
    term.onData((data: string) => {
      if (minigameState.current.active) {
        // Minigame is active - handle minigame input
        handleMinigameInput(data);
        return;
      }

      if (loginState.current === 'username' || loginState.current === 'password' || loginState.current === 'username-choice' || loginState.current === 'signup' || loginState.current === 'signup-password') {
        // Handle login/signup input (has its own echo logic)
        handleLoginInput(data, ws, term);
      } else {
        // 'connected' or 'loggedin' state - send all input to backend
        // LOCAL ECHO: Display character immediately for instant feedback
        // Only echo printable characters and backspace, not control sequences
        if (data.length === 1) {
          if (data >= ' ' && data <= '~') {
            // Printable character - echo immediately
            term.write(data);
          } else if (data === '\x7f' || data === '\b') {
            // Backspace - erase immediately
            term.write('\b \b');
          } else if (data === '\r') {
            // Enter - echo newline
            term.write('\r\n');
          }
        }

        // Send input to server (async, no waiting for echo)
        ws.emit('command', data);
      }
    });

    // Handle special keys (F1 for chat, etc.)
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Handle F1 key for chat
      if (event.key === 'F1' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        ws.emit('command', '\x1b[OP'); // F1 key sequence
        return false;
      }
      return true;
    });

    // Check for existing auth token and attempt auto-login
    const checkAutoLogin = () => {
      const token = localStorage.getItem('bbs_auth_token');

      if (token) {
        console.log('🔐 Found stored auth token, attempting auto-login...');
        term.write('\r\n\x1b[36mRestoring session...\x1b[0m\r\n');

        // Attempt login with token
        ws.emit('login', { token });

        // Set login state to prevent manual login prompt
        loginState.current = 'loggedin';

        // If auto-login fails, reconnect to get fresh session
        const failHandler = (reason: string) => {
          console.log('🔐 Auto-login failed:', reason);
          localStorage.removeItem('bbs_auth_token');
          term.write('\r\n\x1b[33mSession expired. Reconnecting...\x1b[0m\r\n');

          // Disconnect and reconnect to get fresh connection screen + graphics prompt
          ws.off('login-failed', failHandler);

          // Wait a moment then reload page for clean session
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        };

        ws.once('login-failed', failHandler);

        // On success, remove the fail handler
        ws.once('login-success', () => {
          ws.off('login-failed', failHandler);
        });
      } else {
        // No token - wait for backend to display connection screen and login prompt
        // Backend will control the entire flow (connection screen → graphics selection → login)
        loginState.current = 'connected';
        term.focus();
      }
    };

    // Wait for connection, then check auto-login
    if (ws.connected) {
      setTimeout(checkAutoLogin, 500);
    } else {
      ws.once('connect', () => {
        setTimeout(checkAutoLogin, 500);
      });
    }

    // Cleanup
    return () => {
      term.dispose();
      ws.disconnect();
      if (minigameContainer.current) {
        document.body.removeChild(minigameContainer.current);
      }
    };
  }, []);

  // Minigame functions
  const startMinigame = (type: 'redbox' | 'bluebox' | 'tonegen' | 'hack' | 'program', data: any) => {
    minigameState.current = { active: true, type, data };

    if (minigameContainer.current) {
      minigameContainer.current.style.display = 'flex';

      switch (type) {
        case 'redbox':
          renderRedBoxGame(data);
          break;
        case 'bluebox':
          renderBlueBoxGame(data);
          break;
        case 'tonegen':
          renderToneGenGame(data);
          break;
        case 'hack':
          renderHackGame(data);
          break;
        case 'program':
          renderProgramGame(data);
          break;
      }
    }
  };

  const endMinigame = (result: any) => {
    minigameState.current = { active: false, type: null, data: null };

    if (minigameContainer.current) {
      minigameContainer.current.style.display = 'none';
      minigameContainer.current.innerHTML = '';
    }

    // Send result back to backend
    if (socket.current) {
      socket.current.emit('minigame-result', result);
    }

    // Refocus terminal
    if (terminal.current) {
      terminal.current.focus();
    }
  };

  const handleMinigameInput = (_data: string) => {
    // Minigame input is handled directly by the minigame components
    // No backend communication needed during active minigames
  };

  // Minigame renderers
  const renderRedBoxGame = (_data: any) => {
    if (!minigameContainer.current) return;

    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      background: #000;
      color: #0f0;
      font-family: monospace;
      padding: 20px;
      border: 2px solid #0f0;
      border-radius: 10px;
      text-align: center;
      max-width: 600px;
      width: 100%;
    `;

    gameDiv.innerHTML = `
      <h2 style="color: #ff0; margin-bottom: 20px;">🔴 RED BOXING CHALLENGE</h2>
      <p style="margin-bottom: 20px;">Match the coin tones to fool the payphone!</p>
      <div id="tone-display" style="font-size: 48px; margin: 20px 0; min-height: 60px;">🎵</div>
      <div id="buttons" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;"></div>
      <div id="score" style="margin-top: 20px; font-size: 18px;">Score: 0</div>
      <div id="timer" style="margin-top: 10px; color: #ff0;">Time: 30s</div>
    `;

    minigameContainer.current.appendChild(gameDiv);

    // Game logic for Red Boxing
    let score = 0;
    let timeLeft = 30;
    let currentTone = '';
    const tones = ['1700+2200', '1700+2200', '1700+2200', '1700+2200', '1700+2200']; // Quarter tones

    const toneDisplay = gameDiv.querySelector('#tone-display') as HTMLElement;
    const buttonsDiv = gameDiv.querySelector('#buttons') as HTMLElement;
    const scoreDiv = gameDiv.querySelector('#score') as HTMLElement;
    const timerDiv = gameDiv.querySelector('#timer') as HTMLElement;

    // Create buttons
    const createButtons = () => {
      buttonsDiv.innerHTML = '';
      const options = ['1700+2200', '1700+1100', '900+1100', '700+900'];
      options.forEach(tone => {
        const btn = document.createElement('button');
        btn.textContent = tone;
        btn.style.cssText = `
          background: #333;
          color: #0f0;
          border: 1px solid #0f0;
          padding: 10px 15px;
          margin: 5px;
          cursor: pointer;
          font-family: monospace;
          font-size: 14px;
        `;
        btn.onclick = () => checkAnswer(tone);
        buttonsDiv.appendChild(btn);
      });
    };

    const generateTone = () => {
      currentTone = tones[Math.floor(Math.random() * tones.length)];
      toneDisplay.textContent = '🎵 ' + currentTone + ' Hz 🎵';
      createButtons();
    };

    const checkAnswer = (selected: string) => {
      if (selected === currentTone) {
        score += 10;
        scoreDiv.textContent = `Score: ${score}`;
        toneDisplay.textContent = '✅ CORRECT! ✅';
        setTimeout(generateTone, 1000);
      } else {
        toneDisplay.textContent = '❌ WRONG! ❌';
        setTimeout(generateTone, 1000);
      }
    };

    const timer = setInterval(() => {
      timeLeft--;
      timerDiv.textContent = `Time: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(timer);
        endMinigame({ type: 'redbox', score, success: score >= 50 });
      }
    }, 1000);

    generateTone();
  };

  const renderBlueBoxGame = (_data: any) => {
    if (!minigameContainer.current) return;

    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      background: #000;
      color: #00f;
      font-family: monospace;
      padding: 20px;
      border: 2px solid #00f;
      border-radius: 10px;
      text-align: center;
      max-width: 600px;
      width: 100%;
    `;

    gameDiv.innerHTML = `
      <h2 style="color: #0ff; margin-bottom: 20px;">🔵 BLUE BOXING CHALLENGE</h2>
      <p style="margin-bottom: 20px;">Match the trunk seizing frequencies!</p>
      <div id="freq-display" style="font-size: 48px; margin: 20px 0; min-height: 60px;">📻</div>
      <div id="buttons" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;"></div>
      <div id="score" style="margin-top: 20px; font-size: 18px;">Score: 0</div>
      <div id="timer" style="margin-top: 10px; color: #0ff;">Time: 30s</div>
    `;

    minigameContainer.current.appendChild(gameDiv);

    // Game logic for Blue Boxing
    let score = 0;
    let timeLeft = 30;
    let currentFreq = '';

    const freqDisplay = gameDiv.querySelector('#freq-display') as HTMLElement;
    const buttonsDiv = gameDiv.querySelector('#buttons') as HTMLElement;
    const scoreDiv = gameDiv.querySelector('#score') as HTMLElement;
    const timerDiv = gameDiv.querySelector('#timer') as HTMLElement;

    const frequencies = ['2600', '2600', '2600', '2600', '2600']; // 2600Hz for trunk seizing

    const createButtons = () => {
      buttonsDiv.innerHTML = '';
      const options = ['2600', '1700', '1200', '900'];
      options.forEach(freq => {
        const btn = document.createElement('button');
        btn.textContent = freq + ' Hz';
        btn.style.cssText = `
          background: #333;
          color: #00f;
          border: 1px solid #00f;
          padding: 10px 15px;
          margin: 5px;
          cursor: pointer;
          font-family: monospace;
          font-size: 14px;
        `;
        btn.onclick = () => checkAnswer(freq);
        buttonsDiv.appendChild(btn);
      });
    };

    const generateFrequency = () => {
      currentFreq = frequencies[Math.floor(Math.random() * frequencies.length)];
      freqDisplay.textContent = '📻 ' + currentFreq + ' Hz 📻';
      createButtons();
    };

    const checkAnswer = (selected: string) => {
      if (selected === currentFreq) {
        score += 15;
        scoreDiv.textContent = `Score: ${score}`;
        freqDisplay.textContent = '✅ TRUNK SEIZED! ✅';
        setTimeout(generateFrequency, 1000);
      } else {
        freqDisplay.textContent = '❌ LINE BUSY! ❌';
        setTimeout(generateFrequency, 1000);
      }
    };

    const timer = setInterval(() => {
      timeLeft--;
      timerDiv.textContent = `Time: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(timer);
        endMinigame({ type: 'bluebox', score, success: score >= 60 });
      }
    }, 1000);

    generateFrequency();
  };

  const renderToneGenGame = (_data: any) => {
    if (!minigameContainer.current) return;

    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      background: #000;
      color: #f0f;
      font-family: monospace;
      padding: 20px;
      border: 2px solid #f0f;
      border-radius: 10px;
      text-align: center;
      max-width: 700px;
      width: 100%;
    `;

    gameDiv.innerHTML = `
      <h2 style="color: #ff0; margin-bottom: 20px;">🎹 TONE GENERATION PRACTICE</h2>
      <p style="margin-bottom: 20px;">Generate the correct MF tones for phreaking!</p>
      <div id="target-display" style="font-size: 24px; margin: 20px 0; min-height: 40px; color: #0f0;"></div>
      <div id="piano" style="display: flex; justify-content: center; margin: 20px 0; flex-wrap: wrap;"></div>
      <div id="sequence" style="margin: 20px 0; font-size: 18px;"></div>
      <div id="score" style="margin-top: 20px; font-size: 18px;">Score: 0</div>
      <div id="timer" style="margin-top: 10px; color: #ff0;">Time: 45s</div>
    `;

    minigameContainer.current.appendChild(gameDiv);

    // Game logic for Tone Generation
    let score = 0;
    let timeLeft = 45;
    let currentSequence: string[] = [];
    let targetSequence: string[] = [];
    let sequenceIndex = 0;

    const targetDisplay = gameDiv.querySelector('#target-display') as HTMLElement;
    const pianoDiv = gameDiv.querySelector('#piano') as HTMLElement;
    const sequenceDiv = gameDiv.querySelector('#sequence') as HTMLElement;
    const scoreDiv = gameDiv.querySelector('#score') as HTMLElement;
    const timerDiv = gameDiv.querySelector('#timer') as HTMLElement;

    // MF tone mappings (used for reference)
    // const mfTones: { [key: string]: string } = {
    //   '1': '700+1100',
    //   '2': '700+1300',
    //   '3': '900+1100',
    //   '4': '900+1300',
    //   '5': '1100+1300',
    //   '6': '1100+1500',
    //   '7': '1300+1100',
    //   '8': '1300+1300',
    //   '9': '1300+1500',
    //   '0': '1300+700',
    //   'KP': '1100+1700', // Key Pulse
    //   'ST': '1500+1700'  // Start
    // };

    // Create piano keyboard
    const createPiano = () => {
      pianoDiv.innerHTML = '';
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'KP', 'ST'];

      keys.forEach(key => {
        const btn = document.createElement('button');
        btn.textContent = key;
        btn.style.cssText = `
          background: #333;
          color: #f0f;
          border: 1px solid #f0f;
          padding: 15px 10px;
          margin: 2px;
          cursor: pointer;
          font-family: monospace;
          font-size: 16px;
          min-width: 50px;
        `;
        btn.onclick = () => playTone(key);
        pianoDiv.appendChild(btn);
      });
    };

    const generateSequence = () => {
      const length = Math.floor(Math.random() * 3) + 2; // 2-4 digits
      targetSequence = [];
      for (let i = 0; i < length; i++) {
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
        targetSequence.push(keys[Math.floor(Math.random() * keys.length)]);
      }

      targetDisplay.textContent = `Target: ${targetSequence.join(' ')}`;
      currentSequence = [];
      sequenceIndex = 0;
      updateSequenceDisplay();
    };

    const updateSequenceDisplay = () => {
      sequenceDiv.textContent = `Your sequence: ${currentSequence.join(' ')}`;
    };

    const playTone = (key: string) => {
      currentSequence.push(key);
      updateSequenceDisplay();

      if (currentSequence[sequenceIndex] === targetSequence[sequenceIndex]) {
        sequenceIndex++;
        if (sequenceIndex >= targetSequence.length) {
          // Sequence complete and correct
          score += targetSequence.length * 5;
          scoreDiv.textContent = `Score: ${score}`;
          targetDisplay.textContent = '✅ PERFECT SEQUENCE! ✅';
          setTimeout(generateSequence, 1500);
        }
      } else {
        // Wrong tone
        targetDisplay.textContent = '❌ WRONG TONE! ❌';
        setTimeout(() => {
          currentSequence = [];
          sequenceIndex = 0;
          updateSequenceDisplay();
        }, 1000);
      }
    };

    const timer = setInterval(() => {
      timeLeft--;
      timerDiv.textContent = `Time: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(timer);
        endMinigame({ type: 'tonegen', score, success: score >= 100 });
      }
    }, 1000);

    createPiano();
    generateSequence();
  };

  const renderHackGame = (_data: any) => {
    if (!minigameContainer.current) return;

    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      background: #000;
      color: #f00;
      font-family: monospace;
      padding: 20px;
      border: 2px solid #f00;
      border-radius: 10px;
      text-align: center;
      max-width: 600px;
      width: 100%;
    `;

    gameDiv.innerHTML = `
      <h2 style="color: #ff0; margin-bottom: 20px;">💻 HACKING CHALLENGE</h2>
      <p style="margin-bottom: 20px;">Crack the password before time runs out!</p>
      <div id="password-display" style="font-size: 24px; margin: 20px 0; min-height: 40px; font-family: 'Courier New', monospace;"></div>
      <div id="attempts" style="margin: 10px 0; color: #ff0;">Attempts left: 5</div>
      <input id="password-input" type="text" style="width: 200px; padding: 10px; font-family: monospace; font-size: 16px; background: #111; color: #0f0; border: 1px solid #0f0;" placeholder="Enter password">
      <button id="submit-btn" style="margin-left: 10px; padding: 10px 20px; background: #333; color: #f00; border: 1px solid #f00; cursor: pointer;">CRACK</button>
      <div id="hints" style="margin-top: 20px; font-size: 14px; color: #888;"></div>
      <div id="timer" style="margin-top: 10px; color: #ff0;">Time: 60s</div>
    `;

    minigameContainer.current.appendChild(gameDiv);

    // Game logic for Hacking Challenge
    let attemptsLeft = 5;
    let timeLeft = 60;
    const password = 'HACK1985'; // Simple password for demo
    const hints = [
      'Hint: Contains numbers',
      'Hint: 8 characters long',
      'Hint: Starts with H',
      'Hint: Ends with 5',
      'Hint: Contains "ACK"'
    ];
    let hintIndex = 0;

    const passwordDisplay = gameDiv.querySelector('#password-display') as HTMLElement;
    const attemptsDiv = gameDiv.querySelector('#attempts') as HTMLElement;
    const input = gameDiv.querySelector('#password-input') as HTMLInputElement;
    const submitBtn = gameDiv.querySelector('#submit-btn') as HTMLButtonElement;
    const hintsDiv = gameDiv.querySelector('#hints') as HTMLElement;
    const timerDiv = gameDiv.querySelector('#timer') as HTMLElement;

    const updateDisplay = () => {
      passwordDisplay.textContent = '🔒 ' + '*'.repeat(password.length) + ' 🔒';
    };

    const showHint = () => {
      if (hintIndex < hints.length) {
        hintsDiv.textContent = hints[hintIndex];
        hintIndex++;
      }
    };

    const checkPassword = () => {
      const guess = input.value.toUpperCase();
      input.value = '';

      if (guess === password) {
        endMinigame({ type: 'hack', success: true, attempts: 5 - attemptsLeft, timeLeft });
        return;
      }

      attemptsLeft--;
      attemptsDiv.textContent = `Attempts left: ${attemptsLeft}`;

      if (attemptsLeft <= 0) {
        endMinigame({ type: 'hack', success: false, attempts: 5, timeLeft: 0 });
        return;
      }

      showHint();
    };

    submitBtn.onclick = checkPassword;
    input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        checkPassword();
      }
    };

    const timer = setInterval(() => {
      timeLeft--;
      timerDiv.textContent = `Time: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(timer);
        endMinigame({ type: 'hack', success: false, attempts: 5 - attemptsLeft, timeLeft: 0 });
      }
    }, 1000);

    updateDisplay();
    showHint();
    input.focus();
  };

  const renderProgramGame = (_data: any) => {
    if (!minigameContainer.current) return;

    const gameDiv = document.createElement('div');
    gameDiv.style.cssText = `
      background: #000;
      color: #0ff;
      font-family: monospace;
      padding: 20px;
      border: 2px solid #0ff;
      border-radius: 10px;
      text-align: center;
      max-width: 700px;
      width: 100%;
    `;

    gameDiv.innerHTML = `
      <h2 style="color: #ff0; margin-bottom: 20px;">💾 PROGRAMMING CHALLENGE</h2>
      <p style="margin-bottom: 20px;">Write code to solve the problem!</p>
      <div id="problem" style="text-align: left; background: #111; padding: 15px; margin: 20px 0; border: 1px solid #0ff; font-size: 14px;"></div>
      <textarea id="code-input" style="width: 100%; height: 150px; background: #111; color: #0ff; border: 1px solid #0ff; font-family: monospace; font-size: 14px; padding: 10px;" placeholder="Write your code here..."></textarea>
      <button id="run-btn" style="margin-top: 10px; padding: 10px 20px; background: #333; color: #0ff; border: 1px solid #0ff; cursor: pointer;">RUN CODE</button>
      <div id="output" style="margin-top: 20px; text-align: left; background: #111; padding: 15px; border: 1px solid #0ff; min-height: 100px; font-size: 14px;"></div>
      <div id="score" style="margin-top: 20px; font-size: 18px;">Score: 0</div>
      <div id="timer" style="margin-top: 10px; color: #ff0;">Time: 120s</div>
    `;

    minigameContainer.current.appendChild(gameDiv);

    // Game logic for Programming Challenge
    let score = 0;
    let timeLeft = 120;
    const problems = [
      {
        description: 'Write a BASIC program that prints "HELLO HACKER" 5 times:',
        solution: (code: string) => {
          const upperCode = code.toUpperCase();
          return upperCode.includes('FOR') && upperCode.includes('PRINT') && upperCode.includes('HELLO HACKER');
        },
        points: 50
      },
      {
        description: 'Write a C function that adds two numbers:',
        solution: (code: string) => {
          return code.includes('int') && code.includes('+') && code.includes('return');
        },
        points: 75
      }
    ];

    let currentProblem = 0;

    const problemDiv = gameDiv.querySelector('#problem') as HTMLElement;
    const codeInput = gameDiv.querySelector('#code-input') as HTMLTextAreaElement;
    const runBtn = gameDiv.querySelector('#run-btn') as HTMLButtonElement;
    const outputDiv = gameDiv.querySelector('#output') as HTMLElement;
    const scoreDiv = gameDiv.querySelector('#score') as HTMLElement;
    const timerDiv = gameDiv.querySelector('#timer') as HTMLElement;

    const loadProblem = () => {
      if (currentProblem < problems.length) {
        problemDiv.textContent = problems[currentProblem].description;
        codeInput.value = '';
        outputDiv.textContent = 'Output will appear here...';
      } else {
        endMinigame({ type: 'program', score, success: score >= 100 });
      }
    };

    const runCode = () => {
      const code = codeInput.value;
      const problem = problems[currentProblem];

      if (problem.solution(code)) {
        score += problem.points;
        scoreDiv.textContent = `Score: ${score}`;
        outputDiv.textContent = '✅ CODE ACCEPTED! ✅\n\nWell done! Your code works correctly.';
        currentProblem++;
        setTimeout(loadProblem, 2000);
      } else {
        outputDiv.textContent = '❌ CODE REJECTED! ❌\n\nCheck your syntax and try again.';
      }
    };

    runBtn.onclick = runCode;

    const timer = setInterval(() => {
      timeLeft--;
      timerDiv.textContent = `Time: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(timer);
        endMinigame({ type: 'program', score, success: score >= 50 });
      }
    }, 1000);

    loadProblem();
  };

  return (
    <div className="App">
      <div ref={terminalRef} style={{
        width: '100%',
        height: '100vh',
        fontSize: '16px'
      }} />
    </div>
  );
}

// Global refs for login state (accessible from handleLoginInput)
// Start in 'connected' state - backend will control when to show login prompt
const loginState = { current: 'connected' as 'username' | 'password' | 'loggedin' | 'connected' | 'username-choice' | 'signup' | 'signup-password' };
const username = { current: '' };
const password = { current: '' };
const signupData = { current: { field: '', value: '' } };

// Handle file upload
function handleFileUpload(options: { accept: string; maxSize: number; uploadUrl: string; fieldName: string }, ws: Socket, term: Terminal) {
  // Create hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      console.log('📂 No file selected');
      document.body.removeChild(input);
      return;
    }

    console.log('📂 File selected:', file.name, `(${file.size} bytes)`);

    // Check file size
    if (file.size > options.maxSize) {
      term.write(`\r\n\x1b[31m✗ Error: File too large (max ${Math.round(options.maxSize / 1024 / 1024)}MB)\x1b[0m\r\n`);
      document.body.removeChild(input);
      return;
    }

    // Show upload progress
    term.write(`\r\n\x1b[36mUploading ${file.name}...\x1b[0m\r\n`);

    try {
      // Prepare form data
      const formData = new FormData();
      formData.append(options.fieldName, file);

      // Determine backend URL based on environment
      const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const backendUrl = isDevelopment
        ? 'http://localhost:3001'
        : (import.meta.env.VITE_API_URL || 'https://amiexpress-backend.onrender.com');

      const uploadUrl = `${backendUrl}${options.uploadUrl}`;
      console.log('📤 Uploading to:', uploadUrl);

      // Upload file
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📦 Upload successful:', result);

      // Notify server of successful upload
      ws.emit('file-uploaded', {
        filename: result.filename,
        originalname: result.originalname,
        size: result.size
      });

      term.write(`\x1b[32m✓ Upload complete\x1b[0m\r\n`);

    } catch (error) {
      console.error('📂 Upload error:', error);
      term.write(`\r\n\x1b[31m✗ Upload failed: ${(error as Error).message}\x1b[0m\r\n`);
    }

    // Cleanup
    document.body.removeChild(input);
  };

  // Trigger file picker
  input.click();
}

// Handle login input (username/password collection)
function handleLoginInput(data: string, ws: Socket, term: Terminal) {
  console.log('🔐 Login input received:', JSON.stringify(data), 'state:', loginState.current);

  // Handle username choice (R for retry, C for new user)
  if (loginState.current === 'username-choice') {
    const choice = data.toUpperCase();
    if (choice === 'R') {
      term.write('R\r\n\r\nUsername: ');
      loginState.current = 'username';
      username.current = '';
      password.current = '';
      return;
    } else if (choice === 'C') {
      term.write('C\r\n\r\n');
      // Start new user signup flow (express.e:30128)
      ws.emit('start-new-user-signup', { username: username.current });
      loginState.current = 'signup';
      return;
    }
    // Ignore other characters and wait for R or C
    return;
  }

  if (data === '\r' || data === '\n') {
    console.log('🔐 ENTER pressed in login state:', loginState.current);
    // Enter pressed - process current input
    if (loginState.current === 'username') {
      if (username.current.trim().length === 0) {
        term.write('\r\nUsername cannot be empty. Username: ');
        return;
      }
      // Validate username with backend before asking for password
      console.log('🔐 Validating username:', username.current);
      term.write('\r\n');
      ws.emit('validate-username', { username: username.current });
      // Wait for backend response (username-valid, username-not-found, or username-invalid)
    } else if (loginState.current === 'password') {
      const pwd = password.current;
      if (pwd.trim().length === 0) {
        term.write('\r\nPassword cannot be empty. Password: ');
        return;
      }
      // Check if socket is connected before attempting login
      if (!ws.connected) {
        console.log('🔐 Socket not connected yet, waiting for connection...');
        term.write('\r\n\x1b[33mConnecting to BBS server...\x1b[0m\r\n');

        // Wait for connection or show error after timeout
        const connectionTimeout = setTimeout(() => {
          if (!ws.connected) {
            console.error('🔐 Connection timeout - socket still not connected');
            term.write('\r\n\x1b[31mConnection timeout. Please refresh the page.\x1b[0m\r\n');
            term.write('Username: ');
            loginState.current = 'username';
            username.current = '';
            password.current = '';
          }
        }, 30000); // 30 second timeout

        // Listen for connection success
        const onConnect = () => {
          clearTimeout(connectionTimeout);
          console.log('🔐 Socket connected! Retrying login...');
          term.write('\r\n\x1b[32mConnected! Logging in...\x1b[0m\r\n');
          ws.emit('login', { username: username.current, password: pwd });
          loginState.current = 'loggedin';
          ws.off('connect', onConnect);
        };

        ws.on('connect', onConnect);
        return;
      }

      // Attempt login
      console.log('🔐 Attempting login with username:', username.current, 'password length:', pwd.length);
      console.log('🔐 Socket connected:', ws.connected, 'readyState:', ws.io?.engine?.readyState);
      ws.emit('login', { username: username.current, password: pwd });
      loginState.current = 'loggedin';
    } else if (loginState.current === 'signup' || loginState.current === 'signup-password') {
      // Handle signup field submission
      const value = signupData.current.value.trim();
      const field = signupData.current.field;

      console.log(`📝 Submitting signup field ${field}:`, value);
      term.write('\r\n');
      ws.emit('signup-field', { field, value });
    }
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if (loginState.current === 'username' && username.current.length > 0) {
      username.current = username.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    } else if (loginState.current === 'password' && password.current.length > 0) {
      password.current = password.current.slice(0, -1);
      term.write('\b \b'); // Erase character
    } else if (loginState.current === 'signup' && signupData.current.value.length > 0) {
      signupData.current.value = signupData.current.value.slice(0, -1);
      term.write('\b \b'); // Erase character
    } else if (loginState.current === 'signup-password' && signupData.current.value.length > 0) {
      signupData.current.value = signupData.current.value.slice(0, -1);
      term.write('\b \b'); // Erase character
    }
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Regular character
    if (loginState.current === 'username') {
      username.current += data;
      term.write(data);
    } else if (loginState.current === 'password') {
      password.current += data;
      term.write('*'); // Show asterisk for password
    } else if (loginState.current === 'signup') {
      signupData.current.value += data;
      term.write(data); // Echo character
    } else if (loginState.current === 'signup-password') {
      signupData.current.value += data;
      term.write('*'); // Show asterisk for password
    }
  }
}

export default App;