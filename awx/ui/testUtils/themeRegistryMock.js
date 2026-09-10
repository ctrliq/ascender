/*
 * Stand-in for src/themeRegistry.js under the test runner.
 *
 * The real module uses webpack's `require.context` (including an inline-loader
 * form `!!../config/themeMetaLoader.js!./themes/`) to discover theme CSS files
 * at build time. Neither feature exists outside webpack, so this mock reproduces
 * the same public API by reading the theme files from disk directly.
 */
// The custom theme lives in its own module precisely because it needs no
// bundler, so the mock uses the real implementation rather than a copy.
import {
  getCustomTheme,
  setCustomTheme,
  CUSTOM_THEME_ID,
} from '../src/customTheme';

// import.meta.glob is Vite's answer to require.context, so the discovery this
// mock stands in for is the same shape as the real thing rather than a
// filesystem walk. Reading the files directly is not an option here: under the
// test runner import.meta.url is an http URL, not a file one.
const themeSources = import.meta.glob('../src/themes/*.css', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function loadThemes() {
  const loaded = Object.entries(themeSources)
    .map(([filePath, source]) => [filePath.split('/').pop(), source])
    .filter(([file]) => !file.startsWith('_'))
    .map(([file, source]) => {
      const id = file.replace(/\.css$/, '');
      const nameMatch = source.match(/\/\*\s*Name:\s*(.+?)\s*\*\//);
      const name = nameMatch ? nameMatch[1].trim() : id;
      const dark = /html\.pf-v6-theme-dark\[data-theme/.test(source);
      return { id, name, dark };
    });

  loaded.sort((a, b) => a.name.localeCompare(b.name));
  return loaded;
}

let themes = null;

function getThemes() {
  if (!themes) themes = loadThemes();
  const custom = getCustomTheme();
  return custom ? [...themes, custom] : themes;
}

function getStoredThemeId() {
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

function getSavedThemeId() {
  return localStorage.getItem('theme') || 'default';
}

let activeThemeId = null;

function applyTheme(themeId, persist = false) {
  const allThemes = getThemes();
  const theme =
    allThemes.find((t) => t.id === themeId) ||
    allThemes.find((t) => t.id === 'default') ||
    allThemes[0];

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

function clearSessionTheme() {
  sessionStorage.removeItem('theme');
}

function getActiveThemeId() {
  return activeThemeId;
}

export {
  getThemes,
  setCustomTheme,
  CUSTOM_THEME_ID,
  getStoredThemeId,
  getSavedThemeId,
  applyTheme,
  clearSessionTheme,
  getActiveThemeId,
};
