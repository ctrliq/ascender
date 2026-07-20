const cssContext = require.context('./themes/', false, /^\.\/[^_].*\.css$/);
cssContext.keys().forEach((key) => cssContext(key));

const metaContext = require.context(
  '!!../config/themeMetaLoader.js!./themes/',
  false,
  /^\.\/[^_].*\.css$/
);

let themes = null;

export function getThemes() {
  if (themes) return themes;
  themes = metaContext.keys().map((key) => {
    const id = key.replace('./', '').replace('.css', '');
    const meta = metaContext(key).default;
    return { id, name: meta.name || id, dark: meta.dark };
  });
  themes.sort((a, b) => a.name.localeCompare(b.name));
  return themes;
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

let activeThemeId = null;

export function applyTheme(themeId, persist = false) {
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

export function clearSessionTheme() {
  sessionStorage.removeItem('theme');
}

export function getActiveThemeId() {
  return activeThemeId;
}
