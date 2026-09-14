import type { OptionsField } from 'types/api';

/** One field a list can be searched on, as getSearchableKeys answers. */
export interface SearchableKey {
  key: string;
  type?: string;
}

/**
 * The fields a list can be searched on, out of its OPTIONS response.
 *
 * Args:
 *   keys: the `actions.GET` block, one entry per field the list returns.
 *
 * Returns:
 *   The filterable fields, with the type each one holds.
 */
export default function getSearchableKeys(
  keys: Record<string, OptionsField> = {}
): SearchableKey[] {
  return Object.keys(keys)
    .filter((key) => keys[key]?.filterable)
    .map((key) => ({
      key,
      type: keys[key]?.type,
    }));
}
