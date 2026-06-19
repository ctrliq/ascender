
import React from 'react';
import { useField } from 'formik';
import { FormGroup, TextInput, TextArea } from '@patternfly/react-core';
import Popover from '../Popover';

function FormField({
  id,
  helperText = '',
  name,
  label,
  tooltip = null,
  tooltipMaxWidth = '',
  validate = () => {},
  isRequired = false,
  type = 'text',
  ...rest
}) {
  const [field, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return (
    <>
      {(type === 'textarea' && (
        <FormGroup
          fieldId={id}
          data-cy={`${id}-form-group`}
          helperText={helperText}
          helperTextInvalid={meta.error}
          isRequired={isRequired}
          validated={isValid ? 'default' : 'error'}
          label={label}
          labelIcon={<Popover content={tooltip} maxWidth={tooltipMaxWidth} />}
        >
          <TextArea
            id={id}
            isRequired={isRequired}
            validated={isValid ? 'default' : 'error'}
            resizeOrientation="vertical"
            {...rest}
            {...field}
            onChange={(value, event) => {
              field.onChange(event);
            }}
          />
        </FormGroup>
      )) || (
        <FormGroup
          fieldId={id}
          data-cy={`${id}-form-group`}
          helperText={helperText}
          helperTextInvalid={meta.error}
          isRequired={isRequired}
          validated={isValid ? 'default' : 'error'}
          label={label}
          labelIcon={<Popover content={tooltip} maxWidth={tooltipMaxWidth} />}
        >
          <TextInput
            id={id}
            isRequired={isRequired}
            validated={isValid ? 'default' : 'error'}
            {...rest}
            {...field}
            type={type}
            onChange={(value, event) => {
              field.onChange(event);
            }}
          />
        </FormGroup>
      )}
    </>
  );
}

export default FormField;
