import type { Untyped } from 'types/api';
import { isJsonString } from 'util/yaml';

export function sortNestedDetails(obj: Record<string, Untyped> = {}) {
  const nestedTypes = ['nested object', 'list', 'boolean'];
  const notNested = Object.entries(obj).filter(
    ([, value]) => !nestedTypes.includes(value.type)
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

export function pluck(sourceObject: Untyped, ...keys: string[]) {
  return Object.assign(
    {},
    ...keys.map((key) => ({ [key]: sourceObject[key] }))
  );
}

export function formatJson(jsonString: Untyped) {
  if (!jsonString) {
    return null;
  }
  return isJsonString(jsonString) ? JSON.parse(jsonString) : jsonString;
}
