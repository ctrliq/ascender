import React from 'react';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Detail } from 'components/DetailList';
import CodeDetail from 'components/DetailList/CodeDetail';

function sortObj(obj) {
  if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
    return obj;
  }
  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = sortObj(obj[key]);
    });
  return sorted;
}

export default ({ helpText, id, label, type, unit = '', value }) => {
  const { i18n } = useLingui();
  const dataType = value === '$encrypted$' ? 'encrypted' : type;
  let detail = null;

  switch (dataType) {
    case 'nested object':
      detail = (
        <CodeDetail
          dataCy={id}
          helpText={helpText}
          label={label}
          mode="javascript"
          rows={4}
          value={JSON.stringify(sortObj(value), undefined, 2)}
        />
      );
      break;
    case 'list':
      detail = (
        <CodeDetail
          dataCy={id}
          helpText={helpText}
          label={label}
          mode="javascript"
          rows={4}
          value={JSON.stringify(value, undefined, 2)}
        />
      );
      break;
    case 'certificate':
      detail = (
        <CodeDetail
          dataCy={id}
          helpText={helpText}
          label={label}
          mode="javascript"
          rows={4}
          value={value}
        />
      );
      break;
    case 'image':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          helpText={helpText}
          isNotConfigured={!value}
          label={label}
          value={
            !value ? (
              i18n._(t`Not configured`)
            ) : (
              <img src={value} alt={label} height="40" width="40" />
            )
          }
        />
      );
      break;
    case 'encrypted':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          helpText={helpText}
          isEncrypted
          label={label}
          value={i18n._(t`Encrypted`)}
        />
      );
      break;
    case 'boolean':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          helpText={helpText}
          label={label}
          value={value ? i18n._(t`On`) : i18n._(t`Off`)}
        />
      );
      break;
    case 'choice':
    case 'field':
    case 'string':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          helpText={helpText}
          isNotConfigured={!value}
          label={label}
          value={!value ? i18n._(t`Not configured`) : value}
        />
      );
      break;
    case 'integer':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          helpText={helpText}
          label={label}
          value={unit ? `${value} ${unit}` : `${value}`}
        />
      );
      break;
    default:
      detail = null;
  }
  return detail;
};
