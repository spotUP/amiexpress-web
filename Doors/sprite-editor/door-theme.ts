/**
 * The sprite editor's chrome colours, from the caller's theme.
 *
 * Chrome only. The SPRITE's own palette is content - a sprite drawn in red
 * is red because the artist chose red, and a theme has no business
 * repainting it. What moves here is the editor around it: panels, labels,
 * status text, dialogs.
 *
 * A live binding, so applyTheme() at startup reaches every module.
 */
import {
  themeStyles,
  themeById,
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

export let T: ThemeTokens = themeById('classic').tokens;
export let S: ThemeStyles = themeStyles(themeById('classic'));
/**
 * The theme itself, for the SDK chrome.
 *
 * The rail and the glitches are properties of the THEME, not of its colour
 * tokens - attachDoorChrome asks it for both - so the studio has to keep
 * hold of the whole thing and not only the palette it paints with.
 */
export let THEME: Theme = themeById('classic');

export function applyTheme(bbs: unknown): void {
  const getTheme = (bbs as { getTheme?: () => Theme } | undefined)?.getTheme;
  if (typeof getTheme !== 'function') return;
  try {
    const theme = getTheme.call(bbs);
    if (!theme?.tokens) return;
    T = theme.tokens;
    S = themeStyles(theme);
    THEME = theme;
  } catch {
    // A theme that will not resolve is not worth failing a door over.
  }
}
