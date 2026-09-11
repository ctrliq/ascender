import type { Untyped } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { FormSelect, FormSelectOption } from '@patternfly/react-core';

export interface AnsibleSelectProps {
  id: Untyped;
  data?: Untyped[];
  isValid?: boolean;
  onBlur?: (event?: Untyped) => void;
  value: Untyped;
  className?: string;
  isDisabled?: boolean;
  onChange: (...args: Untyped[]) => void;
  name?: string;
  [key: string]: unknown;
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
  const onSelectChange = (val: unknown, event: React.SyntheticEvent) => {
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
