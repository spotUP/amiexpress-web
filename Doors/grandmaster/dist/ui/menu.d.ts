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
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
export type MenuSelection = 'master' | 'death' | 'sprint' | 'marathon' | 'cpu_battle' | 'versus' | 'tetrinet' | 'training' | 'ultra' | 'dig' | 'zone' | 'spectate' | 'settings' | 'stats' | 'manual' | 'quit';
/**
 * The labels the menu renders, index-aligned with MENU_SELECTIONS.
 *
 * Lifted to module scope so `menuRowsFor(width)` can return a filtered
 * pair (items, selections) without re-parsing the show() closure. Blessed
 * tags inside the strings are passed through createList unchanged.
 */
export declare const MENU_ITEMS: string[];
/**
 * The 80-column selection order. The compact menu (40 cols) is a subset of
 * this list - the entries that are visible at that width, in their
 * original index, so a key handler that looks the row up by name still
 * works when the list shape changes.
 */
export declare const MENU_SELECTIONS: MenuSelection[];
/**
 * What the menu shows at a given width.
 *
 * I/O-free, no blessed, no screen. The compact branch is gated on the
 * SDK's compact-width check (the door-three-screens skill) and the wide
 * branch is the full 17-row set. The two arrays are index-aligned by
 * construction - each pair comes from filtering MENU_SELECTIONS and
 * picking the matching label from MENU_ITEMS.
 */
export declare function menuRowsFor(width: number): {
    items: string[];
    selections: MenuSelection[];
};
/**
 * Main menu screen
 */
export declare class MenuScreen {
    private screen;
    private state;
    private sounds;
    constructor(screen: Screen, state: AppState, sounds: SoundEngine);
    /**
     * Show menu and wait for selection
     */
    show(): Promise<MenuSelection>;
    /**
     * Get title ASCII art
     */
    private getTitleArt;
    /**
     * Get mode description for selected index
     */
    private getModeDescription;
    /**
     * Get player info display
     */
    private getPlayerInfo;
}
//# sourceMappingURL=menu.d.ts.map