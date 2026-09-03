/**
 * Hex colours in a STYLE object, not just in a tag.
 *
 * A themed door asked for a magenta header and got a white one. blessed
 * emitted `ESC[0;44;37m` - the blue background it was given, and 37, plain
 * white, instead of the colour.
 *
 * Screen._colorToCode ended with `: 7`, so anything not in its sixteen-name
 * table became white with no warning. Element._colorToNumber, which does
 * the same job for the other renderer, has always handled hex through
 * _hexToColor256. The comments in BOTH maps warn about exactly this class
 * of divergence - "a name valid in one renderer silently falls back to
 * plain white in the other" - and this is that fault with hex instead of a
 * spelling.
 *
 * Tags were fixed separately; this is the other half. A door can now name a
 * colour in either place and get the same answer.
 */
import { Screen, Box } from '../../engines/ui/blessed';

function renderToBytes(build: (screen: any) => void): string {
  const chunks: string[] = [];
  const screen: any = new Screen({
    output: (s: string) => { chunks.push(s); },
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
  build(screen);
  screen.render();
  return chunks.join('');
}

/** The escape blessed wrote immediately before some text. */
function attrBefore(all: string, label: string): string {
  const at = all.indexOf(label);
  if (at < 0) return '';
  const slice = all.slice(Math.max(0, at - 30), at);
  const m = slice.match(/\x1b\[([0-9;]+)m(?!.*\x1b\[)/);
  return m ? m[1] : '';
}

describe('a hex colour in a style object', () => {
  it('is used, not quietly turned into white', () => {
    const all = renderToBytes((screen) => {
      new Box({
        parent: screen, top: 0, left: 0, width: 20, height: 1,
        content: 'HDR', style: { fg: '#FF3D9A', bg: 'blue' },
      } as any);
    });

    const attr = attrBefore(all, 'HDR');
    expect(attr).toContain('38;5;');       // a real colour was chosen
    expect(attr.endsWith('37')).toBe(false); // and it is not the white fallback
  });

  it('works for backgrounds as well', () => {
    const all = renderToBytes((screen) => {
      new Box({
        parent: screen, top: 0, left: 0, width: 20, height: 1,
        content: 'BGD', style: { fg: 'white', bg: '#1D2740' },
      } as any);
    });
    expect(attrBefore(all, 'BGD')).toContain('48;5;');
  });

  it('leaves the named colours exactly where they were', () => {
    // Every door on the board draws with these. The fallback change must
    // not move a single one of them.
    const all = renderToBytes((screen) => {
      new Box({
        parent: screen, top: 0, left: 0, width: 20, height: 1,
        content: 'NMD', style: { fg: 'cyan', bg: 'blue' },
      } as any);
    });
    const attr = attrBefore(all, 'NMD');
    expect(attr).toContain('44');   // blue bg
    expect(attr).toContain('36');   // cyan fg
  });

  it('still falls back to white for something that is not a colour', () => {
    // The fallback is the right answer for a typo; it was only ever wrong
    // for values the colour table understands.
    const all = renderToBytes((screen) => {
      new Box({
        parent: screen, top: 0, left: 0, width: 20, height: 1,
        content: 'BAD', style: { fg: 'nonsense', bg: 'black' },
      } as any);
    });
    expect(attrBefore(all, 'BAD')).toContain('37');
  });
});
