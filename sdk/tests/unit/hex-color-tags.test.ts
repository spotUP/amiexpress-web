/**
 * Hex colour tags.
 *
 * Reported with a screenshot: a themed door printed `{#E4ECFA-fg}` as
 * literal text across the whole screen instead of colouring it. The tag
 * SCANNER was `/\{(\/?)([\w-]*)(?::([\w-]+))?\}/g` and `#` is not in
 * `[\w-]`, so a hex tag never matched and passed straight through as
 * characters.
 *
 * Everything underneath it already worked: `parseColor` delegates to
 * neo-blessed's `convert()`, which resolves `#rrggbb` to the nearest
 * indexed colour. Only the scanner and the unknown-tag fallthrough needed
 * to know hex existed.
 *
 * This matters beyond the themes - a door with a palette of its own could
 * never say so in a tag, only in a style object, which is why themed inline
 * text was the first thing to hit it.
 */
import { parseTags } from '../../engines/ui/blessed/core/colors';

const ESC = '\x1b';

describe('a hex colour in a tag', () => {
  it('is turned into an escape sequence, not printed', () => {
    const out = parseTags('{#FF3D9A-fg}NEON{/#FF3D9A-fg}');
    expect(out).not.toContain('{#FF3D9A-fg}');
    expect(out).toContain('NEON');
    expect(out).toContain(ESC);
  });

  it('works for backgrounds too', () => {
    const out = parseTags('{#1D2740-bg}row{/#1D2740-bg}');
    expect(out).not.toContain('{#1D2740-bg}');
    expect(out).toContain('row');
  });

  it('accepts lower case and three-digit hex', () => {
    for (const tag of ['{#ff3d9a-fg}', '{#f39-fg}']) {
      const out = parseTags(`${tag}x{/}`);
      expect({ tag, leaked: out.includes(tag) }).toEqual({ tag, leaked: false });
    }
  });

  it('leaves the named tags exactly as they were', () => {
    // The whole board draws with these. Widening the scanner must not
    // change a single one of them.
    for (const name of ['cyan', 'yellow', 'white', 'gray', 'green', 'blue']) {
      const out = parseTags(`{${name}-fg}text{/${name}-fg}`);
      expect({ name, coloured: out.includes(ESC) && out.includes('text') })
        .toEqual({ name, coloured: true });
      expect({ name, leaked: out.includes(`{${name}-fg}`) })
        .toEqual({ name, leaked: false });
    }
  });

  it('still prints a tag that is not a colour at all', () => {
    // `{not-a-tag}` has always come through as text and things rely on it.
    expect(parseTags('{not-a-colour}')).toBe('{not-a-colour}');
  });

  it('does not treat a bare # as a colour', () => {
    expect(parseTags('{#-fg}')).toBe('{#-fg}');
    expect(parseTags('{#zzzzzz-fg}')).toBe('{#zzzzzz-fg}');
  });
});
