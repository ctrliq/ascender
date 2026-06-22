import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { FormSelect, FormSelectOption } from '@patternfly/react-core';

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
}) {
  const { t } = useLingui();
  const onSelectChange = (val, event) => {
    event.target.name = name;
    onChange(event, val);
  };

  return (
    <FormSelect
      id={id}
      ouiaId={id}
      value={value}
      onChange={onSelectChange}
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
