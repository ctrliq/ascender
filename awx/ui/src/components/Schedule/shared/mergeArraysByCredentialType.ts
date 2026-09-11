import type { Credential } from 'types/api';

/**
 * Merges a schedule's own credentials over the ones its template supplies.
 *
 * A schedule may override at most one credential per credential type, so an
 * override replaces the default of the same type rather than adding to it.
 *
 * Args:
 *   defaultCredentials: the credentials the template already carries.
 *   overrides: the credentials the schedule sets in their place.
 *
 * Returns:
 *   One credential per type, the override winning wherever there is one.
 */
export default function mergeArraysByCredentialType(
  defaultCredentials: Credential[] = [],
  overrides: Credential[] = []
) {
  const mergedArray = [...defaultCredentials];

  overrides.forEach((override) => {
    const index = mergedArray.findIndex(
      (defaultCred) => defaultCred.credential_type === override.credential_type
    );
    if (index !== -1) {
      mergedArray.splice(index, 1);
    }
    mergedArray.push(override);
  });

  return mergedArray;
}
