/**
 * What the mapping tab sets: what a provider's answer becomes here.
 *
 * In the order the detail lists them, which is the plain settings first and
 * then the maps, since each map draws a box four rows tall. Authentication
 * Backends is read only, so it shows on the detail and has no field.
 */
export const MAPPING_KEYS = [
  'SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL',
  'AUTHENTICATION_BACKENDS',
  'SOCIAL_AUTH_ORGANIZATION_MAP',
  'SOCIAL_AUTH_TEAM_MAP',
  'SOCIAL_AUTH_USER_FIELDS',
];

export default MAPPING_KEYS;
