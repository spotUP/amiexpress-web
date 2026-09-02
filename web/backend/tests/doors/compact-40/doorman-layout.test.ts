/**
 * DOORMAN at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6,
 * and the sysop's 2026-09-02 screenshot report.
 *
 * RED, captured from the real door through a 40x25 BBS stub before this
 * change (the byte stream rendered into a 40x25 grid, max CUP column 70):
 *
 *   03|.- INSTALLED DOORS --------..----------.
 *   05|| > [TS] Grand... * 240 KB || Name:    s
 *   06||   [TS] Pengo    * 128 KB || Command: R
 *
 * The door built its Screen with `new Screen({...})` and no geometry, so it
 * painted 80 columns wide whatever the caller's canvas was: the 35%/65%
 * pair landed at x=0 and x=28 of an 80-column layout on a 40-column screen,
 * which is the folded name column and the size cells on the wrong rows.
 *
 * The fix is the root: the Screen comes from createScreen(bbs), and
 * DoormanLayout asks the SDK's compact profile what to do with the width it
 * gets. This suite builds the REAL DoormanLayout against a real 40x25
 * Screen and asserts the resolved coordinates - not a source pin.
 */
const { Screen } = require('../../../../../sdk/engines/ui/blessed');
const { createScreen } = require('../../../../../sdk/utils/blessed-helpers');
const { DoormanLayout } = require('../../../../../Doors/door-manager/app');

type Coords = { xi: number; xl: number; yi: number; yl: number };

function coords(el: any): Coords {
  const c = el._getCoords(true) || el._getCoords();
  return { xi: c.xi, xl: c.xl, yi: c.yi, yl: c.yl };
}

describe('DOORMAN layout on a 40x25 screen', () => {
  let screen: any;
  let layout: any;

  afterEach(() => {
    try { layout?.stopMasthead?.(); } catch { /* leaving anyway */ }
    try { screen?.destroy(); } catch { /* leaving anyway */ }
  });

  it('every panel stays inside 40 columns', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    for (const panel of [layout.header, layout.footer, layout.listPanel, layout.infoPanel]) {
      const c = coords(panel);
      expect(c.xi).toBeGreaterThanOrEqual(0);
      expect(c.xl).toBeLessThanOrEqual(40);
    }
  });

  it('the list and the info pane are stacked, not squeezed side by side', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    const list = coords(layout.listPanel);
    const info = coords(layout.infoPanel);
    // Both full width...
    expect(list.xl - list.xi).toBe(40);
    expect(info.xl - info.xi).toBe(40);
    // ...and one strictly below the other, so no row carries both.
    expect(info.yi).toBeGreaterThanOrEqual(list.yl);
  });

  it('the header and footer are one row, not three', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    expect(layout.compact.collapseChrome).toBe(true);
    const header = coords(layout.header);
    const footer = coords(layout.footer);
    expect(header.yl - header.yi).toBe(1);
    expect(footer.yl - footer.yi).toBe(1);
  });

  it('the list text column is sized from the screen, not from 35% of 80', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    expect(layout.narrow).toBe(true);
    expect(layout.width).toBe(34);
    // A row built to that width fits: badge(4) + name + flag + size.
    const nameW = Math.max(6, layout.width - 14);
    expect(`[TS] ${'x'.repeat(nameW)} * 240 KB`.length).toBeLessThanOrEqual(40);
  });

  // The root of the sysop's report: the door used to build its Screen with
  // `new Screen({...})` and no geometry, so a 40-column caller got an
  // 80-column canvas. This is the composition createApp now performs.
  it('createScreen(bbs) on a PETSCII caller gives DOORMAN a narrow layout', () => {
    const bbs = {
      write: () => undefined,
      connectionType: 'web',
      getTerminalSize: () => ({ width: 40, height: 25 }),
    };
    screen = createScreen(bbs, { smartCSR: true, fullUnicode: true, title: 'DOORMAN v2' });
    expect(screen.width).toBe(40);
    layout = new DoormanLayout(screen, 1);
    expect(layout.narrow).toBe(true);
    screen.render();
    const info = coords(layout.infoPanel);
    expect(info.xl).toBeLessThanOrEqual(40);
  });

  it('80 columns: the layout is the one the board has always drawn', () => {
    screen = new Screen({ width: 80, height: 24, responsive: false } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    expect(layout.narrow).toBe(false);
    expect(layout.width).toBe(20);
    const header = coords(layout.header);
    expect(header.yl - header.yi).toBe(3);
    const list = coords(layout.listPanel);
    const info = coords(layout.infoPanel);
    // Side by side, exactly as before: the list on the left 35%, the info
    // pane starting where it ends.
    expect(list.xi).toBe(0);
    expect(list.xl).toBe(28);
    expect(info.xi).toBe(28);
    expect(info.xl).toBe(80);
    expect(list.yi).toBe(3);
    expect(info.yi).toBe(3);
  });
});
