import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { FormSelect, FormSelectOption } from '@patternfly/react-core';

/** One entry of the select, as every caller builds it. */
export interface AnsibleSelectOption {
  key: string | number;
  value: string | number;
  label: string;
  isDisabled?: boolean;
}

export interface AnsibleSelectProps {
  id: string;
  data?: AnsibleSelectOption[];
  isValid?: boolean;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  value: string | number;
  className?: string;
  isDisabled?: boolean;
  /**
   * Declared method style for the same reason as onBlur above: the handler is
   * often formik's, which names its own event.
   */
  onChange(event: React.FormEvent<HTMLSelectElement>, value: string): void;
  name?: string;
}

function AnsibleSelect({
  id,
  data = [],
  isValid = true,
  onBlur = () => {},
  value,
  className = '',
  isDisabled = false,
  onChange,
  name,
}: AnsibleSelectProps) {
  const { t } = useLingui();
  const onSelectChange = (
    val: string,
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    // Only the formik-driven selects give a name, and it is what their
    // handlers read the field off the event by.
    if (name) {
      (event.target as HTMLInputElement).name = name;
    }
    onChange(event, val);
  };

  return (
    <FormSelect
      id={id}
      ouiaId={id}
      value={value}
      onChange={(event, val) => onSelectChange(val, event)}
      onBlur={onBlur}
      aria-label={t`Select Input`}
      validated={isValid ? 'default' : 'error'}
      className={className}
      isDisabled={isDisabled}
    >
      {data.map((option) => (
        <FormSelectOption
          key={option.key}
          value={option.value}
          label={option.label}
          isDisabled={option.isDisabled}
        >
          {option.label}
        </FormSelectOption>
      ))}
    </FormSelect>
  );
}

export { AnsibleSelect as _AnsibleSelect };
export default AnsibleSelect;
