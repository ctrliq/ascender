import type { QSConfig } from 'util/qs';

/**
 * One host filter's values, keyed by the query parameter they belong to. A key
 * repeated in the filter arrives as an array, which is what lets one field
 * carry several values.
 */
export type HostSearchParams = Record<string, string | string[]>;

/**
 * Convert host filter string to params object
 * @param {string} string host filter string
 * @return {object} A string or array of strings keyed by query param key
 */
export function toSearchParams(string = ''): HostSearchParams {
  if (string === '') {
    return {};
  }

  const readableParamsStr = string.replace(/^\?/, '').replace(/&/g, ' and ');
  const orArr = readableParamsStr.split(/ or /);

  if (orArr.length > 1) {
    orArr.forEach((str, index) => {
      orArr[index] = `or__${str}`;
    });
  }

  const unescapeString = (v: string | undefined) =>
    //  This is necessary when editing a string that was initially
    //  escaped to allow white space
    v ? v.replace(/"/g, '') : '';

  return orArr
    .join(' and ')
    .split(/ and | or /)
    .map((s) => s.split('='))
    .reduce((searchParams: HostSearchParams, [k, v]) => {
      const key = decodeURIComponent(k as string);
      const value = decodeURIComponent(unescapeString(v));
      if (searchParams[key] === undefined) {
        searchParams[key] = value;
      } else if (Array.isArray(searchParams[key])) {
        searchParams[key] = [...(searchParams[key] as string[]), value];
      } else {
        searchParams[key] = [searchParams[key] as string, value];
      }
      return searchParams;
    }, {});
}

/**
 * Convert params object to an encoded namespaced url query string
 * Used to put into url bar when modal opens
 * @param {object} config Config object for namespacing params
 * @param {object} searchParams A string or array of strings keyed by query param key
 * @return {string} URL query string
 */
export function toQueryString(
  config: QSConfig,
  searchParams: HostSearchParams = {}
) {
  if (Object.keys(searchParams).length === 0) return '';
  return Object.keys(searchParams)
    .flatMap((key) => {
      const value = searchParams[key];
      if (Array.isArray(value)) {
        return value.map(
          (val) =>
            `${config.namespace}.${encodeURIComponent(
              key
            )}=${encodeURIComponent(val)}`
        );
      }
      return `${config.namespace}.${encodeURIComponent(
        key
      )}=${encodeURIComponent(value as string)}`;
    })
    .join('&');
}

/**
 * Escape a string with double quote in case there was a white space
 * @param {string} key The key of the value to be parsed
 * @param {string} value A string to be parsed
 * @return {string}  string
 */
const escapeString = (key: string, value: string) => {
  if (verifySpace(value) || key.includes('regex')) {
    return `"${value}"`;
  }
  return value;
};

/**
 * Verify whether a string has white spaces
 * @param {string} value A string to be parsed
 * @return {bool} true if a string has white spaces
 */
const verifySpace = (value: string) => value.trim().indexOf(' ') >= 0;

/**
 * Convert params object to host filter string
 * @param {object} searchParams A string or array of strings keyed by query param key
 * @return {string} Host filter string
 */
export function toHostFilter(searchParams: HostSearchParams = {}) {
  const flattenSearchParams = Object.keys(searchParams)
    .sort()
    .flatMap((key) => {
      const value = searchParams[key];
      if (Array.isArray(value)) {
        return value.map((val) => `${key}=${escapeString(key, val)}`);
      }
      return `${key}=${escapeString(key, value as string)}`;
    });

  const filteredSearchParams = flattenSearchParams.filter(
    (el) => el.indexOf('or__') === -1
  );

  const conditionalSearchParams = flattenSearchParams.filter(
    (el) => !filteredSearchParams.includes(el)
  );

  const conditionalQuery = conditionalSearchParams
    .map((el) => el.replace('or__', 'or '))
    .join(' ')
    .trim();

  if (filteredSearchParams.length === 0 && conditionalQuery) {
    // when there are just or operators the first one should be removed from the query
    // `name=foo or name__contains=bar or name__iexact=foo` instead of
    // `or name=foo or name__contains=bar or name__iexact=foo` that is the reason of the slice(3)
    return conditionalQuery.slice(3);
  }

  if (conditionalQuery) {
    return filteredSearchParams.join(' and ').concat(' ', conditionalQuery);
  }

  return filteredSearchParams.join(' and ').trim();
}

/**
 * Helper function to remove namespace from params object
 * @param {object} config Config object with namespace param
 * @param {object} obj A string or array of strings keyed by query param key
 * @return {object} Params object without namespaced keys
 */
export function removeNamespacedKeys(
  config: QSConfig,
  obj: HostSearchParams = {}
) {
  const clonedObj = { ...obj };
  const newObj: HostSearchParams = {};
  Object.keys(clonedObj).forEach((nsKey) => {
    let key = nsKey;
    if (nsKey.startsWith(config.namespace)) {
      key = nsKey.substr(config.namespace.length + 1);
    }
    newObj[key] = clonedObj[nsKey] as string | string[];
  });
  return newObj;
}

/**
 * Helper function to remove default params from params object
 * @param {object} config Config object with default params
 * @param {object} obj A string or array of strings keyed by query param key
 * @return {string} Params object without default params
 */
export function removeDefaultParams(
  config: QSConfig,
  obj: HostSearchParams = {}
) {
  const clonedObj: HostSearchParams = { ...obj };
  const defaultKeys = Object.keys(config.defaultParams);
  defaultKeys.forEach((keyToOmit) => {
    delete clonedObj[keyToOmit];
  });
  return clonedObj;
}

/**
 * Helper function to update host_filter value
 * @param {string} value A string with host_filter value from querystring
 * @param {object} obj An object returned by toSearchParams - in which the
 * host_filter value was partially removed.
 * @return {object} An object with the value of host_filter modified
 */
export function modifyHostFilter(value: string, obj: HostSearchParams) {
  if (!value.includes('host_filter=')) return obj;
  const clonedObj: HostSearchParams = { ...obj };
  const host_filter: HostSearchParams = {};
  value.split(' ').forEach((item: string) => {
    if (item.includes('host_filter')) {
      host_filter.host_filter = item.slice('host_filter='.length);
    }
  });

  Object.keys(clonedObj).forEach((key) => {
    if (key.indexOf('host_filter') !== -1) {
      delete clonedObj[key];
    }
  });

  return {
    ...clonedObj,
    ...host_filter,
  };
}
