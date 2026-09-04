import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME, BOX, BORDER_STYLE, SPINNER_FRAMES, BlessedBox, BlessedText, BlessedSpinner } from '../theme/blessed-theme.js';

const SPINNER = SPINNER_FRAMES;

interface Props {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => void;
}

// Check if we're in a TTY environment (for raw mode input)
const isTTY = typeof globalThis !== 'undefined' && (globalThis as any).__CONSOLE_TTY__ === true;

export function LoginPrompt({ error, loading, onLogin }: Props) {
  const [field, setField] = useState<'username' | 'password'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cursorOn, setCursorOn] = useState(true);
  const cursorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [backendReady, setBackendReady] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0);
  const [dots, setDots] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Blink cursor every 500ms when active
  useEffect(() => {
    if (backendReady) {
      cursorRef.current = setInterval(() => {
        setCursorOn(c => !c);
      }, 500);
    }
    return () => {
      if (cursorRef.current) clearInterval(cursorRef.current);
    };
  }, [backendReady]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const url = (process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001') + '/health';
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (!cancelled && res.ok) {
          setBackendReady(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // not ready yet
      }
    };
    check();
    pollRef.current = setInterval(check, 2000);
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Animate the spinner + dots while waiting
  useEffect(() => {
    if (backendReady) return;
    const id = setInterval(() => {
      setSpinIdx(i => (i + 1) % SPINNER_FRAMES.length);
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 250);
    return () => clearInterval(id);
  }, [backendReady]);

  // Only use useInput when we have a TTY (raw mode supported)
  if (isTTY) {
    useInput((input, key) => {
      if (loading || !backendReady) return;

      if (key.return) {
        if (field === 'username') {
          setField('password');
        } else if (username && password) {
          onLogin(username, password);
        }
        return;
      }
      if (key.tab) {
        setField(f => f === 'username' ? 'password' : 'username');
        return;
      }
      if (key.backspace || key.delete) {
        if (field === 'username') setUsername(u => u.slice(0, -1));
        else setPassword(p => p.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        if (field === 'username') setUsername(u => u + input);
        else setPassword(p => p + input);
      }
    });
  }

  if (!backendReady) {
    return (
      <BlessedBox style="double" borderColor="yellow" padding={2} width={52} flexDirection="column" alignItems="center" justifyContent="center">
        <BlessedText variant="primary" bold>AmiExpress-Web Console</BlessedText>
        <BlessedText variant="secondary">Ultra Vibed by Spot/Up Rough</BlessedText>
        <Box marginTop={1} />
        <Box flexDirection="row" gap={1}>
          <BlessedSpinner variant="line" color="yellow" />
          <BlessedText variant="warning">Waiting for backend{dots}</BlessedText>
        </Box>
        <Box marginTop={1} />
        <BlessedText variant="secondary">The BBS server is starting up. Login will</BlessedText>
        <BlessedText variant="secondary">appear automatically when it is ready.</BlessedText>
      </BlessedBox>
    );
  }

  // Fixed-width input field: always reserve the same space so the layout
  // doesn't shift when typing. The cursor blinks within that fixed space.
  const FIELD_WIDTH = 30;
  const renderFixedInput = (value: string, showCursor: boolean) => {
    const padded = value.padEnd(30, ' ');
    const displayValue = padded.slice(0, 30);
    const cursor = showCursor ? '_' : ' ';
    return <Text>{displayValue}{cursor}</Text>;
  };

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center">
      <BlessedBox style="double" borderColor="cyan" padding={2} width={52} flexDirection="column">
        <BlessedText variant="primary" bold>AmiExpress-Web Console</BlessedText>
        <BlessedText variant="secondary">Ultra Vibed by Spot/Up Rough</BlessedText>
        <Box marginTop={1} />

        <Box flexDirection="column" gap={1}>
          <Box>
            <BlessedText variant={field === 'username' ? 'primary' : 'secondary'}>Username: </BlessedText>
            <Text color={field === 'username' ? THEME.inputFocus.fg : THEME.input.fg}>
              {username.padEnd(30, ' ').slice(0, 30)}{field === 'username' && cursorOn ? '_' : ' '}
            </Text>
          </Box>
          <Box>
            <BlessedText variant={field === 'password' ? 'primary' : 'secondary'}>Password: </BlessedText>
            <Text color={field === 'password' ? THEME.inputFocus.fg : THEME.input.fg}>
              {'*'.repeat(password.length).padEnd(30, ' ').slice(0, 30)}{field === 'password' && cursorOn ? '_' : ' '}
            </Text>
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <BlessedText variant="danger">{error}</BlessedText>
          </Box>
        )}
        {loading && (
          <Box marginTop={1}>
            <BlessedSpinner variant="dots" color="yellow" />
            <BlessedText variant="warning"> Authenticating...</BlessedText>
          </Box>
        )}

        <Box marginTop={1}>
          <BlessedText variant="secondary">[tab] switch field  [enter] next/login</BlessedText>
        </Box>
      </BlessedBox>
    </Box>
  );
}