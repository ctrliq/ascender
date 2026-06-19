import React from 'react';
import { useField } from 'formik';
import { Checkbox } from '@patternfly/react-core';
import Popover from '../Popover';

function CheckboxField({
  id,
  name,
  label,
  tooltip = '',
  validate = () => {},
  isDisabled,
  ...rest
}) {
  const [field] = useField({ name, validate });
  return (
    <Checkbox
      isDisabled={isDisabled}
      aria-label={label}
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
      onChange={(value, event) => {
        field.onChange(event);
      }}
    />
  );
}
export default CheckboxField;
