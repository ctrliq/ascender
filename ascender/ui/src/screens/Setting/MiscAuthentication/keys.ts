/**
 * What the session tab sets, once the tokens, the mapping and the password
 * rules moved to tabs of their own: how a session begins, how long it lasts,
 * and what may be reached without one.
 */
export const SESSION_KEYS = [
  'SESSION_COOKIE_AGE',
  'SESSIONS_PER_USER',
  'DISABLE_LOCAL_AUTH',
  'AUTH_BASIC_ENABLED',
  'LOGIN_REDIRECT_OVERRIDE',
  'ALLOW_METRICS_FOR_ANONYMOUS_USERS',
];

export default SESSION_KEYS;
