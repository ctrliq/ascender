import { getCustomTheme, setCustomTheme, CUSTOM_THEME_ID } from './customTheme';
import type { Theme } from './customTheme';

export { setCustomTheme, CUSTOM_THEME_ID };

// Pulled in for their side effect, which is that the stylesheets end up in the
// build. import.meta.glob is what replaced require.context here, and it is
// understood by the test runner as well, so this module no longer needs to be
// stood in for when the suite runs.
import.meta.glob('./themes/[!_]*.css', { eager: true });

// The same files again as text, to read the metadata out of them. This is what
// config/themeMetaLoader.js, a webpack loader, used to do at build time: take
// the name from a /* Name: ... */ comment and decide whether a theme is dark by
// looking for the PatternFly dark selector.
const themeSources = import.meta.glob('./themes/[!_]*.css', {
  eager: true,
  query: '?raw',
  import: 'default',
});

let themes: Theme[] | null = null;

export function getThemes() {
  if (!themes) {
    themes = Object.entries(themeSources).map(([path, source]) => {
      const id = (path.split('/').pop() as string).replace(/\.css$/, '');
      const nameMatch = (source as string).match(/\/\*\s*Name:\s*(.+?)\s*\*\//);
      const dark = /html\.pf-v6-theme-dark\[data-theme/.test(source as string);
      return {
        id,
        name: nameMatch ? (nameMatch[1] as string).trim() : id,
        dark,
      };
    });
    themes.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Appended rather than sorted in: an administrator's own theme is easier to
  // find at the end of the list than filed alphabetically among the shipped ones.
  const custom = getCustomTheme();
  return custom ? [...themes, custom] : themes;
}

/**
 * Theme ids that were renamed, by the id they used to have.
 *
 * The id is the stylesheet's file name, and themes/awx.css is
 * themes/classic.css now. An account preference, a browser's stored choice
 * and an installation's DEFAULT_UI_THEME can all still hold the old id, and
 * each of them asked for that theme rather than for Default.
 */
const RENAMED_THEMES: Record<string, string> = {
  awx: 'classic',
};

/**
 * The current id of a theme, wherever the id was stored.
 *
 * Args:
 *     themeId: A theme id as it was stored, possibly one since renamed.
 *
 * Returns:
 *     The id the theme has now; an id that was never renamed, and an empty
 *     one, come back as they were given.
 */
export function resolveThemeId<T extends string | null | undefined>(
  themeId: T
): T | string {
  return (themeId && RENAMED_THEMES[themeId]) || themeId;
}

export function getStoredThemeId() {
  const session = sessionStorage.getItem('theme');
  if (session) return resolveThemeId(session);

  const stored = localStorage.getItem('theme');
  if (stored) return resolveThemeId(stored);

  const darkMode = localStorage.getItem('darkMode');
  if (darkMode !== null) {
    const id = darkMode === 'true' ? 'default' : 'light';
    localStorage.setItem('theme', id);
    localStorage.removeItem('darkMode');
    return id;
  }

  /* What the installation asks for, mirrored by the Config context once the
     settings have answered. It is only a fallback: anything the account or this
     browser already chose is returned above. */
  const installDefault = localStorage.getItem('default_theme');
  if (installDefault) return resolveThemeId(installDefault);

  return 'default';
}

export function getSavedThemeId() {
  return resolveThemeId(localStorage.getItem('theme')) || 'default';
}

let activeThemeId: string | null = null;

export function applyTheme(themeId?: string | null, persist = false) {
  const allThemes = getThemes();
  const wanted = resolveThemeId(themeId);
  // There is always a themes/default.css, so the last fallback always hits.
  const theme = (allThemes.find((t) => t.id === wanted) ||
    allThemes.find((t) => t.id === 'default') ||
    allThemes[0]) as Theme;

  if (theme.dark) {
    document.documentElement.classList.add('pf-v6-theme-dark');
  } else {
    document.documentElement.classList.remove('pf-v6-theme-dark');
  }

  document.documentElement.setAttribute('data-theme', theme.id);
  sessionStorage.setItem('theme', theme.id);
  if (persist) {
    localStorage.setItem('theme', theme.id);
  }
  activeThemeId = theme.id;
  window.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme.id }));
  return theme;
}

export function clearSessionTheme() {
  sessionStorage.removeItem('theme');
}

export function getActiveThemeId() {
  return activeThemeId;
}
