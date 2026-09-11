import type { SettingConfig } from 'types/api';
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

/** A setting that holds json, parsed, and anything else left as it came. */
export function formatJson(jsonString: unknown) {
  if (!jsonString) {
    return null;
  }
  return isJsonString(jsonString)
    ? (JSON.parse(jsonString as string) as unknown)
    : jsonString;
}
