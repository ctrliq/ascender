import type { Untyped } from 'types/api';
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

export interface PasswordFieldProps {
  id: Untyped;
  name: string;
  label: React.ReactNode;
  validate?: (...args: Untyped[]) => void;
  isRequired?: boolean;
  helperText?: Untyped;
  [key: string]: unknown;
}

function PasswordField({
  id,
  name,
  label,
  validate = () => {},
  isRequired = false,
  helperText,
  ...rest
}: PasswordFieldProps) {
  const [, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return (
    <FormGroup
      fieldId={id}
      isRequired={isRequired}
      label={label}
      labelHelp={helperText ? <Popover content={helperText} /> : undefined}
    >
      <InputGroup>
        <InputGroupItem isFill>
          <PasswordInput
            id={id}
            name={name}
            label={label}
            validate={validate}
            isRequired={isRequired}
            helperText={helperText}
            {...rest}
          />
        </InputGroupItem>
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
