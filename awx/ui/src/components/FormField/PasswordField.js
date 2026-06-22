import React from 'react';
import { useField } from 'formik';
import { FormGroup, InputGroup } from '@patternfly/react-core';
import Popover from '../Popover';
import PasswordInput from './PasswordInput';

function PasswordField({
  id,
  name,
  label,
  validate = () => {},
  isRequired = false,
  helperText,
  ...rest
}) {
  const [, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return (
    <FormGroup
      fieldId={id}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      validated={isValid ? 'default' : 'error'}
      label={label}
      labelIcon={helperText && <Popover content={helperText} />}
    >
      <InputGroup>
        <PasswordInput
          id={id}
          name={name}
          label={label}
          validate={validate}
          isRequired={isRequired}
          helperText={helperText}
          {...rest}
        />
      </InputGroup>
    </FormGroup>
  );
}

export default PasswordField;
