import { UsersAPI } from 'api';
import { applyAccountTheme, saveThemeToAccount } from './accountTheme';

vi.mock('./api');

const dataTheme = () => document.documentElement.getAttribute('data-theme');

describe('applyAccountTheme', () => {
  beforeEach(() => {
    localStorage.removeItem('theme');
    sessionStorage.removeItem('theme');
  });

  test("the account's theme is applied and mirrored for the next paint", () => {
    localStorage.setItem('theme', 'light');
    applyAccountTheme({ id: 1, preferred_theme: 'dark' });

    expect(dataTheme()).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  test('an account without a preference gets the default, and the mirror goes', () => {
    localStorage.setItem('theme', 'light');
    applyAccountTheme({ id: 7, preferred_theme: '' });

    expect(dataTheme()).toBe('default');
    expect(localStorage.getItem('theme')).toBeNull();
  });
});

describe('saveThemeToAccount', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('records the theme on the account', async () => {
    vi.mocked(UsersAPI.update).mockResolvedValue({} as never);
    await saveThemeToAccount(1, 'dark');
    expect(UsersAPI.update).toHaveBeenCalledWith(1, {
      preferred_theme: 'dark',
    });
  });

  test('a failed save is swallowed', async () => {
    vi.mocked(UsersAPI.update).mockRejectedValue(new Error('403'));
    await expect(saveThemeToAccount(1, 'dark')).resolves.toBeUndefined();
  });
});
