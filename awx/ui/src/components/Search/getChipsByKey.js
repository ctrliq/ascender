function filterDefaultParams(paramsArr, config) {
  const defaultParamsKeys = Object.keys(config.defaultParams || {});
  return paramsArr.filter((key) => defaultParamsKeys.indexOf(key) === -1);
}

function getLabelFromValue(columns, value, colKey) {
  let label = value;
  const currentSearchColumn = columns.find(({ key }) => key === colKey);
  if (currentSearchColumn?.options?.length) {
    [, label] = currentSearchColumn.options.find(
      ([optVal]) => optVal === value
    );
  } else if (currentSearchColumn?.booleanLabels) {
    label = currentSearchColumn.booleanLabels[value];
  }
  return (label || colKey).toString();
}

export default function getChipsByKey(queryParams, columns, qsConfig) {
  const queryParamsByKey = {};
  columns.forEach(({ name, key }) => {
    queryParamsByKey[key] = { key, label: `${name} (${key})`, chips: [] };
  });
  const nonDefaultParams = filterDefaultParams(
    Object.keys(queryParams || {}),
    qsConfig
  );

  nonDefaultParams.forEach((key) => {
    const columnKey = key;
    let label = columnKey;
    if (columns.some(({ key: keyToCheck }) => columnKey === keyToCheck)) {
      label = `${
        columns.find(({ key: keyToCheck }) => columnKey === keyToCheck).name
      } (${key})`;
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

    queryParamsByKey[columnKey] = { key, label, chips: [] };

    if (Array.isArray(queryParams[key])) {
      queryParams[key].forEach((val) =>
        queryParamsByKey[columnKey].chips.push({
          key: `${key}:${val}`,
          node: getLabelFromValue(columns, val, columnKey),
        })
      );
    } else {
      queryParamsByKey[columnKey].chips.push({
        key: `${key}:${queryParams[key]}`,
        node: getLabelFromValue(columns, queryParams[key], columnKey),
      });
    }
  });
  return queryParamsByKey;
}
