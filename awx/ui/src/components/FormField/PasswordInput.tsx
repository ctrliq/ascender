import type { Untyped } from 'types/api';
import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import {
  Button,
  ButtonVariant,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import type { TextInputProps } from '@patternfly/react-core';

export interface PasswordInputProps {
  autocomplete?: string;
  id: Untyped;
  name: string;
  validate?: (value: Untyped) => string | undefined;
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

  return (
    <>
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
    </>
  );
}

export default PasswordInput;
