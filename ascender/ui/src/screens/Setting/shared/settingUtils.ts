import type { OptionsField, SettingConfig } from 'types/api';
import { plural, t } from '@lingui/core/macro';
import { isJsonString } from 'util/yaml';

/**
 * The settings of one category in the order a detail lists them: the plain
 * ones first, then the switches, then the lists and the nested objects, since
 * the last two take a whole row each.
 */
export function sortNestedDetails(
  obj: Record<string, SettingConfig> = {}
): [string, SettingConfig][] {
  const nestedTypes = ['nested object', 'list', 'boolean'];
  const notNested = Object.entries(obj).filter(
    ([, value]) => !nestedTypes.includes(value.type ?? '')
  );
  const booleanList = Object.entries(obj).filter(
    ([, value]) => value.type === 'boolean'
  );
  const nestedList = Object.entries(obj).filter(
    ([, value]) => value.type === 'list'
  );
  const nestedObject = Object.entries(obj).filter(
    ([, value]) => value.type === 'nested object'
  );
  return [...notNested, ...booleanList, ...nestedList, ...nestedObject];
}

/** The named keys of an object, which is how a screen takes its own settings. */
export function pluck<T>(
  sourceObject: Record<string, T>,
  ...keys: string[]
): Record<string, T> {
  return Object.assign(
    {},
    ...keys.map((key) => ({ [key]: sourceObject[key] }))
  ) as Record<string, T>;
}

/**
 * What Revert All sends: each of the named settings at its factory default.
 *
 * A DELETE on a category resets every setting in it, and most screens show a
 * part of one: Session, Password, Tokens and Mapping share the authentication
 * category, and each tab of Jobs, System, Logging and Appearance is a slice of
 * its own. Reverting the page's own keys to the defaults the OPTIONS response
 * gives, the way the LDAP form always has, leaves the rest as they were.
 *
 * Args:
 *   keys: The settings the page shows.
 *   options: The PUT block of the settings OPTIONS response.
 *
 * Returns:
 *   Each key the api accepts, mapped to its default. A read only key, such as
 *   the install's UUID, has no PUT entry and is left out.
 */
export function factoryDefaults(
  keys: string[],
  options: Record<string, OptionsField | undefined>
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => Boolean(options[key]))
      .map((key) => [key, options[key]?.default ?? null])
  );
}

/** A setting that holds json, parsed, and anything else left as it came. */
export function formatJson(jsonString: unknown) {
  if (!jsonString) {
    return null;
  }
  return isJsonString(jsonString)
    ? (JSON.parse(jsonString as string) as unknown)
    : jsonString;
}

/*
 * The units a stored number of seconds is read back in, largest first. A month
 * is a twelfth of a year rather than thirty days, since that is the month the
 * platform's own defaults are counted in: the refresh token's 2,628,000.
 */
const DURATION_UNITS: { seconds: number; name: (n: number) => string }[] = [
  {
    seconds: 31536000,
    name: (n) => plural(n, { one: '# year', other: '# years' }),
  },
  {
    seconds: 2628000,
    name: (n) => plural(n, { one: '# month', other: '# months' }),
  },
  {
    seconds: 86400,
    name: (n) => plural(n, { one: '# day', other: '# days' }),
  },
  {
    seconds: 3600,
    name: (n) => plural(n, { one: '# hour', other: '# hours' }),
  },
  {
    seconds: 60,
    name: (n) => plural(n, { one: '# minute', other: '# minutes' }),
  },
];

/**
 * A number of seconds in the largest unit that holds it whole, with the
 * seconds themselves alongside, so the page reads as a length of time and an
 * admin can still match it to the number the api takes.
 *
 * Args:
 *   seconds: The stored value.
 *
 * Returns:
 *   "1000 years (31536000000 seconds)", or just "90 seconds" where no larger
 *   unit divides it evenly: an approximation would not be the value.
 */
export function formatDuration(seconds: number): string {
  const raw = plural(seconds, { one: '# second', other: '# seconds' });
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return raw;
  }
  const unit = DURATION_UNITS.find((u) => seconds % u.seconds === 0);
  if (!unit) {
    return raw;
  }
  const human = unit.name(seconds / unit.seconds);
  return t`${human} (${raw})`;
}
