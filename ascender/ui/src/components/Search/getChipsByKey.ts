import type { SearchColumn } from 'types/api';
import type { QSConfig, QSParams, QSValue } from 'util/qs';

/** One filter chip: the value it removes, and the text shown on it. */
export interface SearchChip {
  key: string;
  node: string;
}

/** Every chip for one search column, grouped under that column's label. */
export interface SearchChipGroup {
  key: string;
  label: string;
  chips: SearchChip[];
}

/**
 * Drops the parameters that are part of the list's defaults rather than a
 * filter the user set, page and page_size among them, so they get no chip.
 *
 * Args:
 *   paramsArr: the query string's keys.
 *   config: the list's query string configuration.
 *
 * Returns:
 *   Only the keys that came from a filter.
 */
function filterDefaultParams(paramsArr: string[], config: QSConfig) {
  const defaultParamsKeys = Object.keys(config.defaultParams || {});
  return paramsArr.filter((key) => defaultParamsKeys.indexOf(key) === -1);
}

/**
 * Renders one filter value as the chip's text.
 *
 * A column with an option list shows the option's label rather than the value
 * that goes in the query string, and a boolean column shows whichever of its
 * two labels applies. Anything else shows the value itself.
 *
 * Args:
 *   columns: the list's search columns.
 *   value: the value the filter was set to.
 *   colKey: the query string key the value belongs to.
 *
 * Returns:
 *   The text for the chip, falling back to the key when there is no value.
 */
function getLabelFromValue(
  columns: SearchColumn[],
  value: QSValue,
  colKey: string
) {
  let label: QSValue = value;
  const currentSearchColumn = columns.find(({ key }) => key === colKey);
  if (currentSearchColumn?.options?.length) {
    const match = currentSearchColumn.options.find(
      ([optVal]) => optVal === value
    );
    if (match) {
      [, label] = match;
    }
  } else if (currentSearchColumn?.booleanLabels) {
    label =
      currentSearchColumn.booleanLabels[value as unknown as 'true' | 'false'];
  }
  return (label || colKey).toString();
}

/**
 * Groups the query string's filters into one chip group per search column.
 *
 * Args:
 *   queryParams: the list's current query string, already parsed.
 *   columns: the list's search columns.
 *   qsConfig: the list's query string configuration.
 *
 * Returns:
 *   One chip group per column, keyed by the column's query string key.
 */
export default function getChipsByKey(
  queryParams: QSParams,
  columns: SearchColumn[],
  qsConfig: QSConfig
) {
  const queryParamsByKey: Record<string, SearchChipGroup> = {};
  columns.forEach(({ name, key }) => {
    queryParamsByKey[key] = { key, label: `${name} (${key})`, chips: [] };
  });
  const nonDefaultParams = filterDefaultParams(
    Object.keys(queryParams || {}),
    qsConfig
  );

  nonDefaultParams.forEach((key: string) => {
    const columnKey = key;
    let label = columnKey;
    const column = columns.find(
      ({ key: keyToCheck }) => columnKey === keyToCheck
    );
    if (column) {
      label = `${column.name} (${key})`;
    } else {
      // date filters are submitted as <column>__gte / <column>__lt etc.;
      // label them with the base column's name
      const baseKey = columnKey.replace(/__(gte?|lte?)$/, '');
      const baseColumn = columns.find(
        ({ key: keyToCheck }) => baseKey === keyToCheck
      );
      if (baseColumn) {
        label = `${baseColumn.name} (${key})`;
      }
    }

    const group: SearchChipGroup = { key, label, chips: [] };
    queryParamsByKey[columnKey] = group;

    const value = queryParams[key];
    if (Array.isArray(value)) {
      value.forEach((val) =>
        group.chips.push({
          key: `${key}:${val}`,
          node: getLabelFromValue(columns, val, columnKey),
        })
      );
    } else {
      group.chips.push({
        key: `${key}:${value}`,
        node: getLabelFromValue(columns, value as QSValue, columnKey),
      });
    }
  });
  return queryParamsByKey;
}
