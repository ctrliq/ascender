import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Detail } from 'components/DetailList';
import CodeDetail from 'components/DetailList/CodeDetail';

function sortObj(obj: unknown): unknown {
  if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
    return obj;
  }
  const entries = obj as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  Object.keys(entries)
    .sort()
    .forEach((key) => {
      sorted[key] = sortObj(entries[key]);
    });
  return sorted;
}

/** One setting, drawn the way its declared type says it should be. */
export interface SettingDetailProps {
  helpText?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  /** The field's type, as the category's OPTIONS response declares it. */
  type?: string;
  /** Null where the api sends one, which it does for most settings. */
  unit?: string | null;
  value?: unknown;
}

export default ({
  helpText,
  id,
  label,
  type,
  unit = '',
  value,
}: SettingDetailProps) => {
  const { t } = useLingui();
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
          value={String(value ?? '')}
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
              t`Not configured`
            ) : (
              <img
                src={String(value)}
                alt={String(label ?? '')}
                height="40"
                width="40"
              />
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
          value={t`Encrypted`}
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
          value={value ? t`On` : t`Off`}
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
          value={!value ? t`Not configured` : String(value)}
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
