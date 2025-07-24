import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import {
  Button,
  ButtonVariant,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';

function PasswordInput(props) {
  const { i18n } = useLingui();
  const {
    autocomplete,
    id,
    name,
    validate,
    isFieldGroupValid,
    isRequired,
    isDisabled,
  } = props;
  const [inputType, setInputType] = useState('password');
  const [field, meta] = useField({ name, validate });

  const isValid = !(meta.touched && meta.error);

  const handlePasswordToggle = () => {
    setInputType(inputType === 'text' ? 'password' : 'text');
  };

  return (
    <>
      <Tooltip
        content={
          inputType === 'password' ? i18n._(msg`Show`) : i18n._(msg`Hide`)
        }
      >
        <Button
          ouiaId={`${id}-toggle`}
          variant={ButtonVariant.control}
          aria-label={i18n._(msg`Toggle Password`)}
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
        placeholder={field.value === '$encrypted$' ? 'ENCRYPTED' : undefined}
        {...field}
        value={field.value === '$encrypted$' ? '' : field.value}
        isDisabled={isDisabled}
        isRequired={isRequired}
        validated={isValid || isFieldGroupValid ? 'default' : 'error'}
        type={inputType}
        onChange={(_, event) => {
          field.onChange(event);
        }}
      />
    </>
  );
}

PasswordInput.propTypes = {
  autocomplete: PropTypes.string,
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  validate: PropTypes.func,
  isRequired: PropTypes.bool,
  isDisabled: PropTypes.bool,
};

PasswordInput.defaultProps = {
  autocomplete: 'new-password',
  validate: () => {},
  isRequired: false,
  isDisabled: false,
};

export default PasswordInput;
