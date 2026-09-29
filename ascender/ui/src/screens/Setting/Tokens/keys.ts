/**
 * What the tokens tab sets.
 *
 * The three expirations arrive inside one nested object, which is why the
 * screens name the object and its three children separately: the api takes
 * them as a whole, the reader wants them as three numbers.
 */
export const TOKEN_KEYS = [
  'OAUTH2_PROVIDER',
  'ALLOW_OAUTH2_FOR_EXTERNAL_USERS',
];

/** The three numbers inside OAUTH2_PROVIDER, in the order the form asks. */
export const OAUTH2_EXPIRATIONS = [
  'ACCESS_TOKEN_EXPIRE_SECONDS',
  'REFRESH_TOKEN_EXPIRE_SECONDS',
  'AUTHORIZATION_CODE_EXPIRE_SECONDS',
] as const;

export default TOKEN_KEYS;
