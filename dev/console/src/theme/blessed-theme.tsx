// Blessed Theme for Ink-based TUI
// Ports the SDK's blessed-lite.ts theme to React Ink components
// Matches the TypeScript doors' UI exactly

// ANSI Escape Sequences (from blessed-lite.ts)
export const ANSI = {
  // Cursor control
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  home: '\x1b[H',
  clear: '\x1b[2J',
  clearLine: '\x1b[2K',
  goto: (x: number, y: number) => `\x1b[${y};${x}H`,

  // Styles
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',

  // Foreground colors
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',
  },

  // Background colors
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
    gray: '\x1b[100m',
    brightRed: '\x1b[101m',
    brightGreen: '\x1b[102m',
    brightYellow: '\x1b[103m',
    brightBlue: '\x1b[104m',
    brightMagenta: '\x1b[105m',
    brightCyan: '\x1b[106m',
    brightWhite: '\x1b[107m',
  },
};

// Box drawing characters (exact match from blessed-lite.ts)
export const BOX = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeUp: '┴',
    teeDown: '┬',
    teeLeft: '┤',
    teeRight: '├',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    cross: '╬',
    teeUp: '╩',
    teeDown: '╦',
    teeLeft: '╣',
    teeRight: '╠',
  },
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    teeUp: '┴',
    teeDown: '┬',
    teeLeft: '┤',
    teeRight: '├',
  },
};

// Spinner frames (from blessed doors)
export const SPINNER_FRAMES = ['|', '/', '-', '\\'];
export const SPINNER_DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Theme colors matching the doors' UI
export const THEME = {
  // Primary accent - used for borders, highlights, active items
  primary: {
    fg: 'cyan',
    bg: 'black',
    bold: true,
  },
  // Secondary - used for dim text, disabled items
  secondary: {
    fg: 'gray',
    bg: 'black',
    bold: false,
  },
  // Danger - errors, deletions
  danger: {
    fg: 'red',
    bg: 'black',
    bold: true,
  },
  // Success - confirmations, completed
  success: {
    fg: 'green',
    bg: 'black',
    bold: false,
  },
  // Warning - warnings, pending
  warning: {
    fg: 'yellow',
    bg: 'black',
    bold: false,
  },
  // Info - informational
  info: {
    fg: 'blue',
    bg: 'black',
    bold: false,
  },
  // Selection - inverted colors for selected items
  selection: {
    fg: 'black',
    bg: 'cyan',
    bold: true,
  },
  // Hover - when mouse hovers
  hover: {
    fg: 'cyan',
    bg: 'black',
    bold: true,
  },
  // Title bars
  title: {
    fg: 'cyan',
    bg: 'black',
    bold: true,
  },
  // Header
  header: {
    fg: 'cyan',
    bg: 'black',
    bold: true,
  },
  // Border default
  border: {
    fg: 'cyan',
    bg: 'black',
    bold: false,
  },
  // Input fields
  input: {
    fg: 'white',
    bg: 'black',
    bold: false,
  },
  // Input focus
  inputFocus: {
    fg: 'cyan',
    bg: 'black',
    bold: true,
  },
};

// Border styles mapped to Ink's borderStyle prop
export const BORDER_STYLE = {
  single: 'single' as const,
  double: 'double' as const,
  rounded: 'round' as const,
};

// Generate box border using blessed characters
export function drawBox(
  width: number,
  height: number,
  style: 'single' | 'double' | 'rounded' = 'single',
  fgColor: string = 'cyan',
  label?: string
): string {
  const box = BOX[style];
  const color = ANSI.fg[fgColor as keyof typeof ANSI.fg] || ANSI.fg.cyan;
  const reset = ANSI.reset;

  let output = color;
  // Top border
  output += box.topLeft + box.horizontal.repeat(Math.max(0, width - 2)) + box.topRight + '\n';
  // Sides
  for (let y = 1; y < height - 1; y++) {
    output += box.vertical;
    output += ' '.repeat(width - 2);
    output += box.vertical + '\n';
  }
  // Bottom border
  output += box.bottomLeft + box.horizontal.repeat(Math.max(0, width - 2)) + box.bottomRight;
  output += reset;

  // Add label if provided
  if (label) {
    const labelText = ` ${label} `;
    const labelX = Math.max(2, Math.floor((width - labelText.length) / 2));
    // This would need ANSI goto to overlay - skip for simplicity
  }

  return output;
}

// Ink component that renders a blessed-style box
import React from 'react';
import { Box, Text } from 'ink';

interface BlessedBoxProps {
  children?: React.ReactNode;
  style?: 'single' | 'double' | 'rounded';
  borderColor?: keyof typeof ANSI.fg;
  label?: string;
  padding?: number;
  width?: number | string;
  height?: number | string;
}

export function BlessedBox({
  children,
  style = 'single',
  borderColor = 'cyan',
  label,
  padding = 1,
  ...props
}: BlessedBoxProps) {
  const inkBorderStyle = BORDER_STYLE[style];

  return (
    <Box
      borderStyle={inkBorderStyle}
      borderColor={borderColor}
      padding={padding}
      {...props}
    >
      {label && (
        <Text bold color={borderColor}>{` ${label} `}</Text>
      )}
      {children}
    </Box>
  );
}

// Blessed-style text with theme colors
interface BlessedTextProps {
  children: React.ReactNode;
  variant?: keyof typeof THEME;
  bold?: boolean;
  dim?: boolean;
}

export function BlessedText({ children, variant = 'primary', bold = false, dim = false }: BlessedTextProps) {
  const theme = THEME[variant];
  return (
    <Text
      color={theme.fg}
      bold={bold || theme.bold}
      dimColor={dim || theme.fg === 'gray'}
    >
      {children}
    </Text>
  );
}

// Blessed-style spinner
interface BlessedSpinnerProps {
  variant?: 'dots' | 'line';
  color?: keyof typeof ANSI.fg;
}

export function BlessedSpinner({ variant = 'dots', color = 'cyan' }: BlessedSpinnerProps) {
  // Use ink-spinner internally, but with our theme color
  const Spinner = require('ink-spinner').default;
  return <Spinner type={variant} color={color} />;
}

// Blessed progress bar
interface BlessedProgressBarProps {
  percent: number;
  width?: number;
  filledChar?: string;
  emptyChar?: string;
  color?: keyof typeof ANSI.fg;
  showPercent?: boolean;
}

export function BlessedProgressBar({
  percent,
  width = 30,
  filledChar = '█',
  emptyChar = '░',
  color = 'green',
  showPercent = true,
}: BlessedProgressBarProps) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return (
    <Box>
      <Text>{'['}</Text>
      <Text color={color}>{filledChar.repeat(filled)}</Text>
      <Text dimColor>{emptyChar.repeat(empty)}</Text>
      <Text>{']'}</Text>
      {showPercent && <Text> {percent}%</Text>}
    </Box>
  );
}

export default {
  ANSI,
  BOX,
  THEME,
  SPINNER_FRAMES,
  SPINNER_DOTS,
  BORDER_STYLE,
  drawBox,
  BlessedBox,
  BlessedText,
  BlessedSpinner,
  BlessedProgressBar,
};