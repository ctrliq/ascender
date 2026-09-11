import type { Untyped } from 'types/api';
import React from 'react';
import { useField } from 'formik';
import { Checkbox } from '@patternfly/react-core';
import Popover from '../Popover';

export interface CheckboxFieldProps {
  id: Untyped;
  name: Untyped;
  label: React.ReactNode;
  tooltip?: string;
  validate?: (...args: Untyped[]) => void;
  isDisabled?: boolean;
  [key: string]: unknown;
}

function CheckboxField({
  id,
  name,
  label,
  tooltip = '',
  validate = () => {},
  isDisabled,
  ...rest
}: CheckboxFieldProps) {
  const [field] = useField({ name, validate });
  return (
    <Checkbox
      isDisabled={isDisabled}
      aria-label={String(label)}
      ouiaId={id}
      label={
        <span>
          {label}
          &nbsp;
          {tooltip && <Popover ouiaId="checkbox-tooltip" content={tooltip} />}
        </span>
      }
      id={id}
      {...rest}
      isChecked={field.value}
      {...field}
      onChange={(event) => {
        field.onChange(event);
      }}
    />
  );
}
export default CheckboxField;
