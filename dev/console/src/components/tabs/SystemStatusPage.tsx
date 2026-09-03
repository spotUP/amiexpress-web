import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getSystemConfig } from '../../api/client.js';

export function SystemStatusPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSystemConfig();
      setConfig(data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useInput((input, key) => {
    if (!config) return;
    const entries = Object.entries(config);
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(entries.length - 1, i + 1));
    if (input === 'r') load();
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text> Loading system status...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">Error: {error}</Text>
        <Text dimColor>[r] Retry</Text>
      </Box>
    );
  }

  if (!config) return null;

  const entries = Object.entries(config);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">SYSTEM STATUS</Text>
        <Text dimColor>  ({entries.length} entries)</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Key</Text>
          <Text bold color="cyan">{' '.repeat(28)}Value</Text>
        </Box>
        {entries.map(([key, value], i) => (
          <Box key={key}>
            <Text
              color={i === selectedIdx ? 'cyan' : 'white'}
              bold={i === selectedIdx}
            >
              {i === selectedIdx ? '> ' : '  '}
              {key.padEnd(30)}
            </Text>
            <Text color={i === selectedIdx ? 'cyan' : 'dimColor'}>
              {String(value ?? '—')}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[↑↓] Scroll  [r] Refresh</Text>
      </Box>
    </Box>
  );
}
