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
 * sign-on provider. localStorage mirrors it so the app can paint in the right
 * theme before /api/v2/me/ has answered, and so the login screen can put it
 * back. The mirror outlives logout on purpose: it is what lets a return from
 * a single sign-on provider, or a plain reload, paint straight in the right
 * theme. It says nothing an account did not, it is corrected here as soon as
 * /api/v2/me/ answers, and a browser shared between accounts sees at most
 * the previous account's theme for that one round trip.
 */
export function applyAccountTheme(me?: AccountThemeUser) {
  const accountTheme = (me?.preferred_theme as string) || '';
  if (accountTheme) {
    applyTheme(accountTheme, true);
  } else {
    localStorage.removeItem('theme');
    applyTheme('default');
  }
}

/**
 * Record a theme on the account, best-effort: the theme has already been
 * applied and cached in this browser, and the caller has nowhere to report a
 * failed save, so the user keeps what they picked either way.
 */
export async function saveThemeToAccount(userId: number, themeId: string) {
  try {
    await UsersAPI.update(userId, { preferred_theme: themeId });
  } catch {
    // Best-effort, see above.
  }
}
