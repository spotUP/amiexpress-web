/**
 * Main Menu Screen
 *
 * Displays game mode selection and options. At 40 columns (a C64 PETSCII
 * caller), the door offers only the modes that fit the canvas; the rest
 * are hidden, not folded - the SKILL ("One door, three screens") makes
 * folded a bug because the resulting single-line label loses the row in
 * the list. Every width rule is in `menuRowsFor(width)` so the test pins
 * the boundary without a terminal.
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';

export type MenuSelection =
  | 'master'
  | 'death'
  | 'sprint'
  | 'marathon'
  | 'cpu_battle'
  | 'versus'
  | 'tetrinet'
  | 'training'
  | 'ultra'
  | 'dig'
  | 'zone'
  | 'spectate'
  | 'settings'
  | 'stats'
  | 'manual'
  | 'quit';

/**
 * The labels the menu renders, index-aligned with MENU_SELECTIONS.
 *
 * Lifted to module scope so `menuRowsFor(width)` can return a filtered
 * pair (items, selections) without re-parsing the show() closure. Blessed
 * tags inside the strings are passed through createList unchanged.
 */
export const MENU_ITEMS: string[] = [
  'MASTER MODE',
  'DEATH MODE',
  'SPRINT 40L',
  'MARATHON',
  'CPU BATTLE',
  'VERSUS',
  '{yellow-fg}TETRINET{/yellow-fg}',
  'TRAINING',
  '{cyan-fg}ULTRA 2MIN{/cyan-fg}',
  '{red-fg}DIG MODE{/red-fg}',
  '{cyan-fg}ZONE MODE{/cyan-fg}',
  '{magenta-fg}WATCH A GAME{/magenta-fg}',
  '',
  'Settings',
  'High Scores',
  '{cyan-fg}Manual (F1){/cyan-fg}',
  '{red-fg}Quit (Q/ESC){/red-fg}',
];

/**
 * The 80-column selection order. The compact menu (40 cols) is a subset of
 * this list - the entries that are visible at that width, in their
 * original index, so a key handler that looks the row up by name still
 * works when the list shape changes.
 */
export const MENU_SELECTIONS: MenuSelection[] = [
  'master',
  'death',
  'sprint',
  'marathon',
  'cpu_battle',
  'versus',
  'tetrinet',
  'training',
  'ultra',
  'dig',
  'zone',
  'spectate',
  'master',  // Separator line, default to master
  'settings',
  'stats',
  'manual',
  'quit',
];

/**
 * The 40-column subset. A C64 caller sees only MASTER MODE, manual and
 * quit. The other 12 modes are 80-column compositions that the door
 * could not lay out at 40 without folding or stacking.
 */
const COMPACT_SELECTIONS: readonly MenuSelection[] = ['master', 'manual', 'quit'];

/**
 * What the menu shows at a given width.
 *
 * I/O-free, no blessed, no screen. The compact branch is gated on the
 * SDK's compact-width check (the door-three-screens skill) and the wide
 * branch is the full 17-row set. The two arrays are index-aligned by
 * construction - each pair comes from filtering MENU_SELECTIONS and
 * picking the matching label from MENU_ITEMS.
 */
export function menuRowsFor(width: number): { items: string[]; selections: MenuSelection[] } {
  if (width >= 80) {
    return { items: MENU_ITEMS.slice(), selections: MENU_SELECTIONS.slice() };
  }
  // The compact menu shows the three rows the C64 caller can act on. The
  // 80-column list is a filter of MENU_SELECTIONS, not a separate list, so
  // a key handler that looks the row up by name (q/ESC -> 'quit', F1 ->
  // 'manual') still works when the list shape changes. The empty separator
  // row at index 12 in the wide list is skipped - a blank row on a 40-col
  // canvas is an empty cursor and confuses input handling.
  const selections: MenuSelection[] = [];
  const items: string[] = [];
  const seen = new Set<MenuSelection>();
  for (let i = 0; i < MENU_SELECTIONS.length; i++) {
    const sel = MENU_SELECTIONS[i];
    const label = MENU_ITEMS[i];
    if (!COMPACT_SELECTIONS.includes(sel)) continue;
    if (seen.has(sel)) continue;
    if (label.length === 0) continue;
    seen.add(sel);
    selections.push(sel);
    items.push(label);
  }
  return { items, selections };
}

/**
 * Main menu screen
 */
export class MenuScreen {
  constructor(
    private screen: Screen,
    private state: AppState,
    private sounds: SoundEngine
  ) {}

  /**
   * Show menu and wait for selection
   */
  async show(): Promise<MenuSelection> {
    // Enable mouse control for menu navigation
    this.screen.program.enableMouse();

    // Clear terminal buffer to prevent ghosting from previous screens (e.g., tetrinet lobby)
    // This is the same fix used in app.ts startup for modem speed compatibility
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();
    this.screen.render();

    // Wait for screen clear to propagate (critical for modem speeds)
    await new Promise(resolve => setTimeout(resolve, 200));

    return new Promise((resolve) => {
      // Dropped when the menu goes away, so a screen that outlives it does
      // not keep re-centring widgets that no longer exist.
      let cleanupResize: (() => void) | null = null;

      // The menu is an 80x24 composition. In a wide terminal it used to sit
      // in the top-left corner with the rest of the window black - "the
      // menus in gmaster isnt responise" (2026-09-02) - so the whole block
      // is centred in whatever room there is, and follows a resize.
      // At 40 columns the door is in PETSCII/C64 mode: it shows only the
      // compact three-row menu (master, manual, quit) and hides the
      // description and player panels - those are 80-column compositions
      // that fold to garbage at 40.
      const compact = this.screen.width < 80;
      const menuRows = menuRowsFor(this.screen.width);
      const WIDE_COLS = 80;
      const COMPACT_COLS = this.screen.width;
      const panelWidth = compact ? Math.max(20, this.screen.width - 2) : 76;
      const menuCols = compact ? COMPACT_COLS : WIDE_COLS;
      const offsetX = () => Math.max(0, Math.floor((this.screen.width - menuCols) / 2));
      const offsetY = () => Math.max(0, Math.floor((this.screen.height - 24) / 2));

      // Play menu music
      this.sounds.playMusic('menu', true);

      // Clear screen completely
      this.screen.children.forEach(child => child.destroy());

      // Full-screen background to clear any previous content
      const background = createBox({
        // A ground, not a frame: createBox draws a line border when no
        // border key is given (Panel's default), which outlines the whole
        // terminal.
        border: undefined,
        parent: this.screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        style: {
          bg: 'black',
        },
      });

      // Title box - centered. At 80 columns this carries a 4-row ASCII
      // wordmark; at 40 the full block art does not translate, so we show
      // a single-row bold title.
      const title = createBox({
        parent: this.screen,
        top: 1 + offsetY(),
        left: compact ? 0 + offsetX() : 2 + offsetX(),
        width: compact ? this.screen.width : 76,
        height: compact ? 1 : 4,
        border: { type: 'none' },
        content: compact ? '{bold}{yellow-fg}GRANDMASTER{/yellow-fg}{/bold}' : this.getTitleArt(),
        align: 'center',
        style: {
          fg: 'yellow',
          bg: 'black',
        },
      });

      // At 80 columns: three side-by-side panels (menu + description + player).
      // At 40 columns: one panel filling the screen; description and player
      // are hidden (their content would fold).
      const leftMargin = compact ? 0 + offsetX() : 2 + offsetX();
      const panelTop = compact ? 3 + offsetY() : 5 + offsetY();
      const panelHeight = compact ? 18 : 18;

      // Mode selection list - left panel
      const menuPanel = createBox({
        parent: this.screen,
        top: panelTop,
        left: leftMargin,
        width: compact ? panelWidth : 26,
        height: panelHeight,
        border: compact ? { type: 'none' } : { type: 'line' },
        label: compact ? ' MODE ' : ' SELECT MODE ',
        style: {
          border: { fg: 'cyan' },
        },
      });

      const menu = createList({
        parent: menuPanel,
        top: 0,
        left: 1,
        width: compact ? panelWidth - 2 : 22,
        height: panelHeight - 2,  // Leave room for panel border
        scrollable: true,
        scrollbar: compact
          ? undefined
          : {
              ch: ' ',
              style: { bg: 'cyan' },
            },
        style: {
          border: { fg: 'cyan' },
          selected: { bg: 'cyan', fg: 'black' },
          item: { fg: 'white' },
        },
        keys: true,
        vi: true,
        mouse: true,
        items: menuRows.items,
      });

      // Description and player panels are 80-column only; at 40 the menu
      // fills the canvas.
      let descBox: any = null;
      let info: any = null;
      if (!compact) {
        // Mode description box - middle panel
        descBox = createBox({
          parent: this.screen,
          top: panelTop,
          left: leftMargin + 26,
          width: 30,
          height: panelHeight,
          border: { type: 'line' },
          label: ' DESCRIPTION ',
          style: { border: { fg: 'gray' } },
          content: this.getModeDescription(0),
          fixed: true,
        });
      }

      // Update description when selection changes
      menu.on('select item', (_item: any, index: number) => {
        // Play navigation sound when scrolling through menu
        this.sounds.playSfx('menu_select');
        if (descBox) {
          descBox.setContent(this.getModeDescription(index));
          this.screen.render();
        }
      });

      if (!compact) {
        // Info box - right panel
        info = createBox({
          parent: this.screen,
          top: panelTop,
          left: leftMargin + 26 + 30,
          width: 20,
          height: panelHeight,
          border: { type: 'line' },
          label: ' PLAYER ',
          style: { border: { fg: 'gray' } },
          content: this.getPlayerInfo(),
        });
      }

      // Instructions
      const instructions = createBox({
        parent: this.screen,
        top: panelTop + panelHeight,
        left: offsetX(),
        width: menuCols,
        height: 1,
        align: 'center',
        style: { fg: 'gray', bg: 'black' },
        content: 'Arrows: Navigate | Enter: Select | ESC/Q: Quit',
      });

      // Follow the terminal. Alt+Enter changes the room while the menu is
      // up, and a composition centred once is centred for one size only.
      const recentre = () => {
        const x = offsetX();
        const y = offsetY();
        const compactNow = this.screen.width < 80;
        const wNow = compactNow ? this.screen.width : 76;
        title.left = compactNow ? x : 2 + x;
        title.top = 1 + y;
        menuPanel.left = compactNow ? x : 2 + x;
        menuPanel.top = compactNow ? 3 + y : 5 + y;
        menuPanel.width = compactNow ? wNow : 26;
        if (descBox) {
          descBox.left = 2 + x + 26; descBox.top = 5 + y;
        }
        if (info) {
          info.left = 2 + x + 26 + 30; info.top = 5 + y;
        }
        instructions.left = x; instructions.top = 5 + y + panelHeight;
        this.screen.render();
      };
      this.screen.on('resize', recentre);
      cleanupResize = () => this.screen.removeListener('resize', recentre);

      // Ensure title is rendered on top (z-index fix)
      title.setFront();
      this.screen.render();

      // Handle selection
      menu.on('select', (_item: any, index: number) => {
        const selection = menuRows.selections[index];
        this.sounds.playSfx('menu_ok');

        // Clean up
        cleanupResize?.();
        cleanupResize = null;
        background.destroy();
        title.destroy();
        menuPanel.destroy();  // Also destroys menu as a child
        if (descBox) descBox.destroy();
        if (info) info.destroy();
        instructions.destroy();
        this.screen.render();

        resolve(selection);
      });

      // Handle quit / manual keys. Look the row up by name against the
      // current menu shape, so the key works in both 80- and 40-col
      // layouts (a hardcoded index breaks when the compact list is 3 rows,
      // not 17).
      const findRow = (wanted: MenuSelection): number =>
        menuRows.selections.indexOf(wanted);
      const quitRow = findRow('quit');
      const manualRow = findRow('manual');

      if (quitRow >= 0) {
        menu.key(['q', 'Q'], () => {
          menu.emit('select', null, quitRow);
        });
        menu.key(['escape'], () => {
          menu.emit('select', null, quitRow);
        });
      }
      if (manualRow >= 0) {
        menu.key(['f1'], () => {
          menu.emit('select', null, manualRow);
        });
      }

      // Focus and render
      menu.focus();
      this.screen.render();
    });
  }

  /**
   * Get title ASCII art
   */
  private getTitleArt(): string {
    const p = '    '; // 4-char pad to center 68-char art in 76-char box
    return `{bold}{yellow-fg}${p} _____ _____ _____ _____ ____  _____ _____ _____ _____ _____ _____
${p}|   __|  _  |  _  |   | |    \\|     |  _  |   __|_   _|   __| __  |
${p}|  |  |     |     |\\    |  |  | | | |     |__   | | | |   __|    -|
${p}|_____|__|__|__|__|_|___|____/|_|_|_|__|__|_____| |_| |_____|__|__|{/yellow-fg}{/bold}`;
  }

  /**
   * Get mode description for selected index
   */
  private getModeDescription(index: number): string {
    const descriptions = [
      // MASTER MODE
      '{bold}{cyan-fg}MASTER MODE{/cyan-fg}{/bold}\n\n' +
      'Classic TGM3-style\n' +
      'grading system.\n\n' +
      'Reach GM grade by\n' +
      'mastering speed,\n' +
      'efficiency & skill.',

      // DEATH MODE
      '{bold}{red-fg}DEATH MODE{/red-fg}{/bold}\n\n' +
      '20G gravity from\n' +
      'the very start!\n\n' +
      'Shirase-style\n' +
      'extreme challenge.',

      // SPRINT 40L
      '{bold}{green-fg}SPRINT 40L{/green-fg}{/bold}\n\n' +
      'Clear 40 lines as\n' +
      'fast as possible.\n\n' +
      'Pure speed test.',

      // MARATHON
      '{bold}{yellow-fg}MARATHON{/yellow-fg}{/bold}\n\n' +
      'Endless survival.\n' +
      'How long can you\n' +
      'last?\n\n' +
      'No level cap.',

      // CPU BATTLE
      '{bold}{magenta-fg}CPU BATTLE{/magenta-fg}{/bold}\n\n' +
      'Battle against AI\n' +
      'opponents.\n\n' +
      'Test your skills\n' +
      'vs the computer.',

      // VERSUS
      '{bold}{blue-fg}VERSUS{/blue-fg}{/bold}\n\n' +
      'Online multiplayer!\n\n' +
      'Battle other BBS\n' +
      'users in real-time.',

      // TETRINET
      '{bold}{yellow-fg}TETRINET{/yellow-fg}{/bold}\n\n' +
      'Classic TetriNET!\n\n' +
      '16 special blocks,\n' +
      'up to 6 players,\n' +
      'sudden death mode.',

      // TRAINING
      '{bold}{white-fg}TRAINING{/white-fg}{/bold}\n\n' +
      'Practice mode.\n\n' +
      'Learn techniques,\n' +
      'no pressure.',

      // ULTRA MODE
      '{bold}{cyan-fg}ULTRA 2MIN{/cyan-fg}{/bold}\n\n' +
      'Score as many\n' +
      'points as possible\n' +
      'in 2 minutes!\n\n' +
      '{cyan-fg}Race the clock!{/cyan-fg}',

      // DIG MODE
      '{bold}{red-fg}DIG MODE{/red-fg}{/bold}\n\n' +
      'Board starts with\n' +
      '10 garbage rows.\n\n' +
      'Clear them all!\n' +
      'Faster = better\n' +
      'time score.',

      // ZONE MODE
      '{bold}{cyan-fg}ZONE MODE{/cyan-fg}{/bold}\n\n' +
      'Clear lines to\n' +
      'fill the ZONE\n' +
      'meter. Activate\n' +
      'with Rotate180\n' +
      'for a bonus!\n\n' +
      '{gray-fg}Min 20% to fire{/gray-fg}',

      // WATCH A GAME
      '{bold}{magenta-fg}WATCH A GAME{/magenta-fg}{/bold}\n\n' +
      'Spectate a match\n' +
      'already running on\n' +
      'this BBS.\n\n' +
      '{gray-fg}Versus, CPU battle\nand TetriNET{/gray-fg}',

      // Empty separator
      '',

      // Settings
      '{gray-fg}Configure game\noptions, controls,\nand preferences.{/gray-fg}',

      // High Scores
      '{gray-fg}View your play\nhistory, records,\nand achievements.{/gray-fg}',

      // Manual
      '{cyan-fg}Player manual with\ncontrols, mechanics,\nand strategy tips.{/cyan-fg}',

      // Quit
      '{gray-fg}Exit GRANDMASTER\nand return to BBS.{/gray-fg}',
    ];

    return descriptions[index] || '';
  }

  /**
   * Get player info display
   */
  private getPlayerInfo(): string {
    const stats = this.state.stats;
    return `{cyan-fg}${this.state.playerName}{/cyan-fg}\n\n` +
      `Grade: {yellow-fg}${stats.bestGrade}{/yellow-fg}\n` +
      `Level: ${stats.bestLevel}\n` +
      `Games: ${stats.gamesPlayed}\n` +
      `Lines: ${stats.totalLines}`;
  }
}
