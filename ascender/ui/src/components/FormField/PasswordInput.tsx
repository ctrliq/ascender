import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useField } from 'components/Form';
import type { FieldValidator } from 'components/Form';
import {
  Button,
  ButtonVariant,
  InputGroup,
  InputGroupItem,
  TextInput,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import type { TextInputProps } from '@patternfly/react-core';
import Tooltip from '../Tooltip';

export interface PasswordInputProps {
  autocomplete?: string;
  id: string;
  name: string;
  validate?: FieldValidator;
  isFieldGroupValid?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  [key: string]: unknown;
}

function PasswordInput({
  autocomplete = 'new-password',
  id,
  name,
  validate = () => {},
  isFieldGroupValid,
  isRequired = false,
  isDisabled = false,
}: PasswordInputProps) {
  const { t } = useLingui();
  const [inputType, setInputType] = useState('password');
  const [field, meta] = useField({ name, validate });

  const isValid = !(meta.touched && meta.error);

  const handlePasswordToggle = () => {
    setInputType(inputType === 'text' ? 'password' : 'text');
  };

  // The input and its reveal toggle are one input group of their own, input
  // first and toggle after it, the way PatternFly lays a password field out.
  // Handing callers two loose siblings left the toggle on the left, butted
  // against the input with none of the gap an input group puts between items.
  return (
    <InputGroup>
      <InputGroupItem isFill>
        <TextInput
          autoComplete={autocomplete}
          id={id}
          placeholder={field.value === '$encrypted$' ? t`ENCRYPTED` : undefined}
          {...field}
          value={field.value === '$encrypted$' ? '' : field.value}
          isDisabled={isDisabled}
          isRequired={isRequired}
          validated={isValid || isFieldGroupValid ? 'default' : 'error'}
          type={inputType as TextInputProps['type']}
          onChange={(event) => {
            field.onChange(event);
          }}
        />
      </InputGroupItem>
      <InputGroupItem>
        <Tooltip content={inputType === 'password' ? t`Show` : t`Hide`}>
          <Button
            ouiaId={`${id}-toggle`}
            variant={ButtonVariant.control}
            aria-label={t`Toggle Password`}
            onClick={handlePasswordToggle}
            isDisabled={isDisabled}
          >
            {inputType === 'password' && <EyeSlashIcon />}
            {inputType === 'text' && <EyeIcon />}
          </Button>
        </Tooltip>
      </InputGroupItem>
    </InputGroup>
  );
}

export default PasswordInput;
