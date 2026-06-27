import React from 'react';
import { useField } from 'formik';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
} from '@patternfly/react-core';
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
      isRequired={isRequired}
      label={label}
      labelHelp={helperText && <Popover content={helperText} />}
    >
      <InputGroup>
        <InputGroupItem isFill><PasswordInput
          id={id}
          name={name}
          label={label}
          validate={validate}
          isRequired={isRequired}
          helperText={helperText}
          {...rest}
        /></InputGroupItem>
      </InputGroup>
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{meta.error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export default PasswordField;
