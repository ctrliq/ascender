/**
 * A single query parameter value, as it survives a round trip through the url.
 * Repeated keys arrive as an array, which is why filters can hold several
 * values for one field.
 */
export type QSValue = string | number | boolean | null;
export type QSParamValue = QSValue | QSValue[];
export type QSParams = Record<string, QSParamValue>;

/**
 * How one list's query string is namespaced, defaulted and parsed. Every list
 * screen builds one of these with getQSConfig and passes it around.
 */
export interface QSConfig {
  namespace: string;
  defaultParams: QSParams;
  integerFields: string[];
  dateFields: string[];
}

/**
 * Returns queryset config with defaults, if needed
 * @param {string} namespace for appending to url querystring
 * @param {object} default params that are not handled with search (page, page_size and order_by)
 * @param {array} params that are number fields
 * @return {object} query param object
 */
export function getQSConfig(
  namespace: string,
  defaultParams: QSParams = { page: 1, page_size: 5, order_by: 'name' },
  integerFields: string[] = ['page', 'page_size'],
  dateFields: string[] = ['modified', 'created']
): QSConfig {
  if (!namespace) {
    throw new Error('a QS namespace is required');
  }
  // if order_by isn't passed, default to name
  if (!defaultParams.order_by) {
    defaultParams.order_by = 'name';
  }
  return {
    namespace,
    defaultParams,
    integerFields,
    dateFields,
  };
}

/**
 * Convert url query string to query param object
 * @param {object} qs config object (used for getting defaults, current query params etc.)
 * @param {string} url query string
 * @return {object} query param object
 */
export function parseQueryString(
  config: QSConfig,
  queryString: string | null | undefined
): QSParams {
  if (!queryString) {
    return config.defaultParams || {};
  }
  const params = stringToObject(config, queryString);
  return addDefaultsToObject(config, params);
}

function stringToObject(config: QSConfig, qs: string): QSParams {
  const params: QSParams = {};
  qs.replace(/^\?/, '')
    .split('&')
    .map((s) => s.split('='))
    .forEach(([nsKey, rawValue]) => {
      if (!nsKey || !namespaceMatches(config.namespace, nsKey)) {
        return;
      }
      const key = config.namespace
        ? decodeURIComponent(nsKey.substr(config.namespace.length + 1))
        : decodeURIComponent(nsKey);
      const value = parseValue(config, key, rawValue ?? '');
      params[key] = mergeParam(params[key], value);
    });
  return params;
}
export { stringToObject as _stringToObject };

/**
 * helper function to check the namespace of a param is what you expect
 * @param {string} namespace to append to params
 * @param {object} params object to append namespace to
 * @return {object} params object with namespaced keys
 */
const namespaceMatches = (namespace: string, fieldname: string): boolean => {
  if (!namespace) return !fieldname.includes('.');

  return fieldname.startsWith(`${namespace}.`);
};

function parseValue(
  config: QSConfig,
  key: string,
  rawValue: string
): QSValue {
  if (config.integerFields && config.integerFields.some((v) => v === key)) {
    return parseInt(rawValue, 10);
  }
  // dateFields stay strings on purpose: filter values are submitted as
  // ISO dates (e.g. created__gte=2026-06-01), which is exactly what the
  // API expects - parsing into Date objects would only force formatting
  // them back
  return decodeURIComponent(rawValue);
}

function addDefaultsToObject(config: QSConfig, params: QSParams): QSParams {
  return {
    ...config.defaultParams,
    ...params,
  };
}
export { addDefaultsToObject as _addDefaultsToObject };

/**
 * Convert query param object to url query string
 * Used to encode params for interacting with the api
 * @param {object} query param object
 * @return {string} url query string
 */
export const encodeQueryString = (
  params: QSParams | null | undefined
): string => {
  if (!params) return '';

  return Object.keys(params)
    .sort()
    .filter((key) => params[key] !== null)
    .map((key): [string, QSParamValue] => [key, params[key] ?? null])
    .map(([key, value]) => encodeValue(key, value))
    .join('&');
};

function encodeValue(key: string, value: QSParamValue): string {
  if (Array.isArray(value)) {
    return value
      .map((val) => `${encodeURIComponent(key)}=${encodeURIComponent(val ?? '')}`)
      .join('&');
  }
  return `${encodeURIComponent(key)}=${encodeURIComponent(
    (value as QSValue) ?? ''
  )}`;
}

/**
 * Removes params from the search string and returns the updated list of params
 * @param {object} qs config object (used for getting defaults, current query params etc.)
 * @param {object} object with params from existing search
 * @param {object} object with new params to remove
 * @return {object} query param object
 */
export function removeParams(
  config: QSConfig,
  oldParams: QSParams,
  paramsToRemove: QSParams
): QSParams {
  const updated = {
    ...config.defaultParams,
  };
  Object.keys(oldParams).forEach((key) => {
    const valToRemove = paramsToRemove[key];
    const isInt = config.integerFields?.includes(key);
    const updatedValue = removeParam(
      oldParams[key],
      isInt ? parseInt(String(valToRemove), 10) : valToRemove
    );
    if (
      updatedValue == null &&
      Object.prototype.hasOwnProperty.call(updated, key)
    ) {
      return;
    }
    updated[key] = updatedValue;
  });
  return updated;
}

function removeParam(
  oldVal: QSParamValue | undefined,
  deleteVal: QSParamValue | undefined
): QSParamValue | null {
  if (oldVal === deleteVal) {
    return null;
  }
  if (Array.isArray(deleteVal)) {
    return deleteVal.reduce<QSParamValue | null>(
      (acc, val) => removeParam(acc ?? undefined, val),
      oldVal ?? null
    );
  }
  if (Array.isArray(oldVal)) {
    const index = oldVal.indexOf(deleteVal as QSValue);
    if (index > -1) {
      oldVal.splice(index, 1);
    }
    if (oldVal.length === 1) {
      return oldVal[0] ?? null;
    }
  }
  return oldVal ?? null;
}

/**
 * Merge old and new params together, joining values into arrays where necessary
 * @param {object} namespaced params object of old params
 * @param {object} namespaced params object of new params
 * @return {object} merged namespaced params object
 */
export function mergeParams(
  oldParams: QSParams,
  newParams: QSParams
): QSParams {
  const merged: QSParams = {};
  Object.keys(oldParams).forEach((key) => {
    merged[key] = mergeParam(oldParams[key], newParams[key]);
  });
  Object.keys(newParams).forEach((key) => {
    if (!merged[key]) {
      merged[key] = newParams[key] ?? null;
    }
  });
  return merged;
}

function mergeParam(
  oldVal: QSParamValue | undefined,
  newVal: QSParamValue | undefined
): QSParamValue {
  if (!newVal && newVal !== '') {
    return oldVal ?? null;
  }
  if (!oldVal && oldVal !== '') {
    return newVal ?? null;
  }
  let merged: QSValue[];
  if (Array.isArray(oldVal)) {
    merged = oldVal.concat(newVal as QSValue);
  } else {
    merged = [oldVal as QSValue].concat(newVal as QSValue);
  }
  return dedupeArray(merged);
}

function dedupeArray(arr: QSValue[]): QSParamValue {
  const deduped = [...new Set(arr)];
  if (deduped.length === 1) {
    return deduped[0] ?? null;
  }
  return deduped;
}

/**
 * Update namespaced param(s), returning a new query string. Leaves params
 * from other namespaces unaltered
 * @param {object} qs config object for namespacing params, filtering defaults
 * @param {string} the url query string to update
 * @param {object} namespaced params to add or update. use null to indicate
 *        a param that should be deleted from the query string
 * @return {string} url query string
 */
export function updateQueryString(
  config: QSConfig | null | undefined,
  queryString: string | null | undefined,
  newParams: QSParams
): string {
  const allParams = parseFullQueryString(queryString ?? '');
  const { namespace = null, defaultParams = {} } = config || {};
  Object.keys(newParams).forEach((key) => {
    const val = newParams[key];
    const fullKey = namespace ? `${namespace}.${key}` : key;
    if (val === null || val === defaultParams[key]) {
      delete allParams[fullKey];
    } else {
      allParams[fullKey] = newParams[key] ?? null;
    }
  });
  return encodeQueryString(allParams);
}

function parseFullQueryString(queryString: string = ''): QSParams {
  const allParams: QSParams = {};
  queryString
    .replace(/^\?/, '')
    .split('&')
    .map((s) => s.split('='))
    .forEach(([rawKey, rawValue]) => {
      if (!rawKey) {
        return;
      }
      const key = decodeURIComponent(rawKey);
      // A bare key with no '=' splits into one part, so the value is absent.
      const value = decodeURIComponent(rawValue ?? '');
      allParams[key] = mergeParam(allParams[key], value);
    });
  return allParams;
}
