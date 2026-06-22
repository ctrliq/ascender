
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import {
  Button,
  ButtonVariant,
  FormGroup,
  InputGroup,
  Tooltip,
} from '@patternfly/react-core';
import { KeyIcon } from '@patternfly/react-icons';
import styles from '@patternfly/react-styles/css/components/Form/form';
import { css } from '@patternfly/react-styles';
import FieldWithPrompt from 'components/FieldWithPrompt';
import Popover from 'components/Popover';
import { CredentialPluginPrompt } from './CredentialPluginPrompt';
import CredentialPluginSelected from './CredentialPluginSelected';

function CredentialPluginInput(props) {
  const { children, isDisabled, isRequired, validated, fieldOptions } = props;
  const [showPluginWizard, setShowPluginWizard] = useState(false);
  const [inputField, meta, helpers] = useField(`inputs.${fieldOptions.id}`);
  const [passwordPromptField] = useField(`passwordPrompts.${fieldOptions.id}`);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLingui();

  const disableFieldAndButtons =
    !!passwordPromptField.value ||
    !!(
      meta.initialValue &&
      meta.initialValue !== '' &&
      meta.value === meta.initialValue
    );

  const handlePluginWizardClose = () => {
    setShowPluginWizard(false);
    navigate(location.pathname);
  };

  return (
    <>
      {inputField?.value?.credential ? (
        <CredentialPluginSelected
          credential={inputField?.value?.credential}
          onClearPlugin={() => helpers.setValue('')}
          onEditPlugin={() => setShowPluginWizard(true)}
          fieldId={fieldOptions.id}
        />
      ) : (
        <InputGroup>
          {React.cloneElement(children, {
            ...inputField,
            isRequired,
            validated: validated ? 'default' : 'error',
            isDisabled: disableFieldAndButtons,
            onChange: (_, event) => {
              inputField.onChange(event);
            },
          })}
          <Tooltip
            content={t`Populate field from an external secret management system`}
          >
            <Button
              ouiaId={`credential-field-${fieldOptions.id}-external-button`}
              id={`credential-${fieldOptions.id}-external-button`}
              variant={ButtonVariant.control}
              aria-label={t`Populate field from an external secret management system`}
              onClick={() => setShowPluginWizard(true)}
              isDisabled={isDisabled || disableFieldAndButtons}
            >
              <KeyIcon />
            </Button>
          </Tooltip>
        </InputGroup>
      )}
      {showPluginWizard && (
        <CredentialPluginPrompt
          initialValues={
            typeof inputField.value === 'object' ? inputField.value : {}
          }
          onClose={() => handlePluginWizardClose()}
          onSubmit={(val) => {
            val.touched = true;
            helpers.setValue(val);
            setShowPluginWizard(false);
          }}
        />
      )}
    </>
  );
}

function CredentialPluginField({
  isDisabled = false,
  isRequired = false,
  ...restProps
}) {
  const props = { isDisabled, isRequired, ...restProps };
  const { fieldOptions, validated } = props;

  const [, meta, helpers] = useField(`inputs.${fieldOptions.id}`);
  const [passwordPromptField] = useField(`passwordPrompts.${fieldOptions.id}`);

  let invalidHelperTextToDisplay;

  if (meta.error && meta.touched) {
    invalidHelperTextToDisplay = (
      <div
        className={css(styles.formHelperText, styles.modifiers.error)}
        id={`${fieldOptions.id}-helper`}
        aria-live="polite"
      >
        {meta.error}
      </div>
    );
  }

  if (fieldOptions.id === 'vault_password' && passwordPromptField.value) {
    invalidHelperTextToDisplay = null;
  }

  useEffect(() => {
    if (passwordPromptField.value) {
      helpers.setValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordPromptField.value]);

  return (
    <>
      {fieldOptions.ask_at_runtime ? (
        <FieldWithPrompt
          isRequired={isRequired}
          fieldId={`credential-${fieldOptions.id}`}
          label={fieldOptions.label}
          promptId={`credential-prompt-${fieldOptions.id}`}
          promptName={`passwordPrompts.${fieldOptions.id}`}
          tooltip={fieldOptions.help_text}
        >
          <CredentialPluginInput {...props} />
          {invalidHelperTextToDisplay}
        </FieldWithPrompt>
      ) : (
        <FormGroup
          fieldId={`credential-${fieldOptions.id}`}
          helperTextInvalid={meta.error}
          isRequired={isRequired}
          validated={validated ? 'default' : 'error'}
          label={fieldOptions.label}
          labelIcon={
            fieldOptions.help_text && (
              <Popover content={fieldOptions.help_text} />
            )
          }
        >
          <CredentialPluginInput {...props} />
          {invalidHelperTextToDisplay}
        </FormGroup>
      )}
    </>
  );
}

export default CredentialPluginField;
