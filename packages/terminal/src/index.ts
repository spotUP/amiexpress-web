/**
 * @amiexpress/terminal
 *
 * Shared terminal components and utilities for AmiExpress BBS and SDK
 */

// Export terminal components
export {
  BBSTerminal,
  type BBSTerminalRef,
  type TerminalCell,
  type TerminalMouseEventType,
  type TerminalMouseModifiers,
} from './components/BBSTerminal';

// Export terminal utilities and configuration
export {
  ANSI,
  buildTerminalBuffer,
  XTERM_CONFIG,
} from './utils/terminal-utils';
export { keyOverride, type KeyLike } from './utils/key-overrides';

// Export true-PETSCII (C64 screen-editor emulation) components and utilities
export { PetsciiMachine, type PetsciiMachineState } from './petscii/petscii-machine';
export { PetsciiCanvas, type PetsciiCanvasProps } from './petscii/PetsciiCanvas';
export { keyEventToPetscii } from './petscii/keymap';
export { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from './petscii/c64-palette';

// Re-export xterm types for convenience
export type { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm';
