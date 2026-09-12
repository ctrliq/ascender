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

export function getStoredThemeId() {
  const session = sessionStorage.getItem('theme');
  if (session) return session;

  const stored = localStorage.getItem('theme');
  if (stored) return stored;

  const darkMode = localStorage.getItem('darkMode');
  if (darkMode !== null) {
    const id = darkMode === 'true' ? 'default' : 'light';
    localStorage.setItem('theme', id);
    localStorage.removeItem('darkMode');
    return id;
  }

  return 'default';
}

export function getSavedThemeId() {
  return localStorage.getItem('theme') || 'default';
}

let activeThemeId: string | null = null;

export function applyTheme(themeId?: string | null, persist = false) {
  const allThemes = getThemes();
  // There is always a themes/default.css, so the last fallback always hits.
  const theme = (allThemes.find((t) => t.id === themeId) ||
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
