import {
  applyTheme,
  getSavedThemeId,
  getStoredThemeId,
  getThemes,
} from './themeRegistry';

vi.mock('util/webWorker', () => ({ default: vi.fn() }));

describe('theme ids', () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  test('the shipped themes are named by their file', () => {
    // themes/awx.css is themes/classic.css now, and the id is the file name.
    const ids = getThemes().map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['classic', 'default', 'dark', 'light'])
    );
    expect(ids).not.toContain('awx');
  });

  test('classic applies', () => {
    expect(applyTheme('classic').id).toBe('classic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');
  });

  test('an id nothing ships falls back to default', () => {
    expect(applyTheme('nothing-like-this').id).toBe('default');
  });

  /*
   * awx.css was renamed classic.css, and an account preference or an
   * installation default saved before that still says awx. It asked for that
   * theme, which is Classic now, rather than for Default.
   */
  test('the old awx id is the classic theme', () => {
    expect(applyTheme('awx').id).toBe('classic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');
  });

  test('a stored awx is read as classic', () => {
    localStorage.setItem('theme', 'awx');
    expect(getStoredThemeId()).toBe('classic');
    expect(getSavedThemeId()).toBe('classic');
  });

  test('an installation default of awx is read as classic', () => {
    localStorage.setItem('default_theme', 'awx');
    expect(getStoredThemeId()).toBe('classic');
  });
});
