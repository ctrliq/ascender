/**
 * What the password tab sets: the rules a password for a local account has to
 * meet. They arrive in the authentication category with the session settings,
 * which is why the two screens name what each takes rather than taking the
 * category whole.
 */
export const PASSWORD_KEYS = [
  'LOCAL_PASSWORD_MIN_LENGTH',
  'LOCAL_PASSWORD_MIN_DIGITS',
  'LOCAL_PASSWORD_MIN_UPPER',
  'LOCAL_PASSWORD_MIN_SPECIAL',
];

export default PASSWORD_KEYS;
