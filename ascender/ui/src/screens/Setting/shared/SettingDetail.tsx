import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Detail } from 'components/DetailList';
import CodeDetail from 'components/DetailList/CodeDetail';
import { formatDuration } from './settingUtils';
import './SettingDetail.css';

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

/**
 * Whether a setting holds nothing, whatever its type sends for nothing.
 *
 * The api sends null for a map or a list nobody has set, an empty string for a
 * certificate nobody has pasted, and an empty object for a nested setting left
 * at its empty default. Every one of those drew differently: a code box with a
 * red null in it, an empty code box, or a pair of braces. An empty object is
 * counted as nothing because the platform reads it the way it reads null: the
 * pipelines take `setting or {}`. An empty list is not, since for several
 * lists it is an answer of its own: no user fields at all, or no modules
 * allowed, where null means the default.
 */
export function isUnset(value: unknown, type?: string): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  if (type === 'nested object') {
    return (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    );
  }
  return false;
}

/**
 * An address, with its break points at the slashes. The browser's own were at
 * the hyphens, so a callback url split as "https://old-" over
 * "deployment.example.com/...". Each part between slashes wraps to the next
 * line whole, and only a part wider than the column breaks inside itself.
 */
function wrappableUrl(url: string): React.ReactNode {
  return url.split(/(?<=\/)(?!\/)/).map((part, index) => (
    // The parts are positional and never reorder, so the index is their key.
    // eslint-disable-next-line react/no-array-index-key
    <span key={index} className="ascender-setting-detail__url-part">
      {part}
    </span>
  ));
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
  /** The [value, label] pairs a choice setting offers, as OPTIONS sends them. */
  choices?: [string, string][];
  /**
   * For an integer that counts seconds: read it back as a length of time,
   * with the seconds alongside, rather than as a bare count of them.
   */
  isDuration?: boolean;
  /**
   * For an integer with a value that lifts its limit, such as the -1 the
   * session count takes: that value reads as Unlimited rather than as itself.
   */
  unlimitedValue?: number;
  value?: unknown;
}

export default ({
  helpText,
  id,
  label,
  type,
  unit = '',
  value,
  choices,
  isDuration = false,
  unlimitedValue,
}: SettingDetailProps) => {
  const { t } = useLingui();
  const dataType = value === '$encrypted$' ? 'encrypted' : type;
  let detail = null;

  /* Nothing set reads the same on every row, in the words the plain settings
     already used, whichever type the setting is. A code box is kept for a
     value there is something to read in. */
  const codeTypes = ['nested object', 'list', 'certificate'];
  if (dataType && codeTypes.includes(dataType) && isUnset(value, dataType)) {
    return (
      <Detail
        alwaysVisible
        dataCy={id}
        helpText={helpText}
        isNotConfigured
        label={label}
        value={t`Not configured`}
      />
    );
  }

  switch (dataType) {
    case 'nested object':
      detail = (
        <CodeDetail
          dataCy={id}
          helpText={helpText}
          label={label}
          mode="javascript"
          rows={4}
          startFitted
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
          startFitted
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
          startFitted
          value={String(value)}
        />
      );
      break;
    case 'image':
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          isNotConfigured={!value}
          helpText={helpText}
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
          isEncrypted
          helpText={helpText}
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
    case 'string': {
      /* A choice setting says what it means in its own labels, and the blank
         one is a real answer: "Follow the browser" rather than nothing set. So
         a value that matches a choice is never reported as unconfigured, and
         it reads as the label rather than the stored value. */
      const chosen = choices?.find(([v]) => v === (value ?? ''));
      const configured = chosen ? true : Boolean(value);
      let shown: React.ReactNode;
      if (chosen) {
        shown = chosen[1];
      } else if (value) {
        const text = String(value);
        shown = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
          ? wrappableUrl(text)
          : text;
      } else {
        shown = t`Not configured`;
      }
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          isNotConfigured={!configured}
          helpText={helpText}
          label={label}
          value={shown}
        />
      );
      break;
    }
    case 'integer': {
      /* A number the API has not been given comes back null, which read as the
         word null in the cell. Nothing set says so in the words every other
         unset setting uses, and a zero is a real answer rather than nothing. */
      const configured = value !== null && value !== undefined && value !== '';
      let shown: string;
      if (!configured) {
        shown = t`Not configured`;
      } else if (unlimitedValue !== undefined && value === unlimitedValue) {
        shown = t`Unlimited`;
      } else if (isDuration && typeof value === 'number') {
        shown = formatDuration(value);
      } else {
        shown = [String(value), unit].filter(Boolean).join(' ');
      }
      detail = (
        <Detail
          alwaysVisible
          dataCy={id}
          isNotConfigured={!configured}
          helpText={helpText}
          label={label}
          value={shown}
        />
      );
      break;
    }
    default:
      detail = null;
  }
  return detail;
};
