import { UsersAPI } from 'api';
import { applyAccountTheme, saveThemeToAccount } from './accountTheme';

vi.mock('./api');

describe('applyAccountTheme', () => {
  beforeEach(() => {
    localStorage.removeItem('theme');
    sessionStorage.removeItem('theme');
    vi.mocked(UsersAPI.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("the account's theme wins and is cached for the next paint", () => {
    localStorage.setItem('theme', 'light');
    applyAccountTheme({ id: 1, preferred_theme: 'dark' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(UsersAPI.update).not.toHaveBeenCalled();
  });

  test("an account without a preference adopts the browser's saved theme", async () => {
    localStorage.setItem('theme', 'light');
    const me = { id: 7, preferred_theme: '' };
    applyAccountTheme(me);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(me.preferred_theme).toBe('light');
    expect(UsersAPI.update).toHaveBeenCalledWith(7, {
      preferred_theme: 'light',
    });
  });

  test('an account without a preference on a fresh browser gets the default', () => {
    applyAccountTheme({ id: 7, preferred_theme: '' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('default');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(UsersAPI.update).not.toHaveBeenCalled();
  });

  test('a failed save is swallowed', async () => {
    vi.mocked(UsersAPI.update).mockRejectedValue(new Error('403'));
    await expect(saveThemeToAccount(1, 'dark')).resolves.toBeUndefined();
  });
});
