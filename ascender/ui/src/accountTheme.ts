import { UsersAPI } from 'api';
import { applyTheme } from './themeRegistry';

/** The part of /api/v2/me/ the theme needs: who, and what they asked for. */
export interface AccountThemeUser {
  id?: unknown;
  preferred_theme?: unknown;
  [key: string]: unknown;
}

/**
 * Apply the theme the signed-in account asks for.
 *
 * The preference is kept on the user's profile so that it follows them to
 * whichever browser or machine they sign in from, including through a single
 * sign-on provider. localStorage holds a copy so the app can paint in the
 * right theme before this request has answered, and so the login screen can
 * put it back; Session clears that copy on logout so the next person to sign
 * in here does not inherit it.
 *
 * An account with no preference recorded, on a browser that saved one back
 * when the choice lived only in the browser, adopts the browser's choice. That
 * save is best-effort: the theme is applied either way, and the user can
 * change it from the toolbar.
 */
export function applyAccountTheme(me?: AccountThemeUser) {
  const accountTheme = (me?.preferred_theme as string) || '';
  if (accountTheme) {
    applyTheme(accountTheme, true);
    return;
  }
  const browserTheme = localStorage.getItem('theme');
  applyTheme(browserTheme || 'default');
  const id = me?.id as number | undefined;
  if (me && browserTheme && id) {
    me.preferred_theme = browserTheme;
    saveThemeToAccount(id, browserTheme);
  }
}

/**
 * Record a theme on the account, best-effort: the theme has already been
 * applied and cached in this browser, and neither caller has anywhere to
 * report a failed save, so the user keeps what they picked either way.
 */
export async function saveThemeToAccount(userId: number, themeId: string) {
  try {
    await UsersAPI.update(userId, { preferred_theme: themeId });
  } catch {
    // Best-effort, see above.
  }
}
