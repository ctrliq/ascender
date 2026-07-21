/*
 * Jest mock for src/themeRegistry.js.
 *
 * The real module uses webpack's `require.context` (including an inline-loader
 * form `!!../config/themeMetaLoader.js!./themes/`) to discover theme CSS files
 * at build time. Neither feature exists under Jest, so this mock reproduces the
 * same public API by reading the theme files from disk directly.
 */
const fs = require('fs');
const path = require('path');

const themesDir = path.resolve(__dirname, '../src/themes');

function loadThemes() {
  const files = fs
    .readdirSync(themesDir)
    .filter((file) => file.endsWith('.css') && !file.startsWith('_'));

  const loaded = files.map((file) => {
    const id = file.replace(/\.css$/, '');
    const source = fs.readFileSync(path.join(themesDir, file), 'utf8');
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
  return themes;
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

module.exports = {
  getThemes,
  getStoredThemeId,
  getSavedThemeId,
  applyTheme,
  clearSessionTheme,
  getActiveThemeId,
};
