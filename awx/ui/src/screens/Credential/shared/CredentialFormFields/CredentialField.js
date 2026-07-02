
import React, { useState } from 'react';
import { useLocation } from 'react-router';
import { useField, useFormikContext } from 'formik';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import {
  Button,
  ButtonVariant,
  FileUpload as PFFileUpload,
  FormGroup,
  InputGroup,
  TextInput,
  Tooltip, InputGroupItem,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { PficonHistoryIcon } from '@patternfly/react-icons';
import { PasswordInput } from 'components/FormField';
import AnsibleSelect from 'components/AnsibleSelect';
import { required } from 'util/validators';
import { CredentialPluginField } from '../CredentialPlugins';
import BecomeMethodField from './BecomeMethodField';

const FileUpload = styled(PFFileUpload)`
  flex-grow: 1;
`;

function CredentialInput({
  fieldOptions,
  isFieldGroupValid,
  credentialKind = '',
  isVaultIdDisabled,
  ...rest
}) {
  const { t } = useLingui();
  const [fileName, setFileName] = useState('');
  const [fileIsUploading, setFileIsUploading] = useState(false);
  const [subFormField, meta, helpers] = useField(`inputs.${fieldOptions.id}`);
  const [passwordPromptsField] = useField(`passwordPrompts.${fieldOptions.id}`);
  const isValid = !(meta.touched && meta.error);

  const RevertReplaceButton = (
    <>
      {meta.initialValue &&
        meta.initialValue !== '' &&
        !meta.initialValue.credential &&
        !passwordPromptsField.value && (
          <Tooltip
            id={`credential-${fieldOptions.id}-replace-tooltip`}
            content={
              meta.value !== meta.initialValue
                ? t`Revert`
                : t`Replace`
            }
          >
            <Button icon={<PficonHistoryIcon />}
              id={`credential-${fieldOptions.id}-replace-button`}
              variant={ButtonVariant.control}
              aria-label={
                meta.touched
                  ? t`Revert field to previously saved value`
                  : t`Replace field with new value`
              }
              onClick={() => {
                if (meta.value !== meta.initialValue) {
                  helpers.setValue(meta.initialValue);
                } else {
                  helpers.setValue('', false);
                }
              }}
             />
          </Tooltip>
        )}
    </>
  );

  if (fieldOptions.multiline) {
    const fileUploadProps = {
      id: `credential-${fieldOptions.id}`,
      type: 'text',
      value: subFormField.value,
      filename: fileName,
      filenamePlaceholder: t`Drag a file here or browse to upload`,
      browseButtonText: t`Browse…`,
      clearButtonText: t`Clear`,
      onFileInputChange: (_event, file) => {
        setFileName(file.name);
      },
      onDataChange: (_event, data) => {
        helpers.setValue(data);
      },
      onTextChange: (_event, text) => {
        helpers.setValue(text);
      },
      onClearClick: () => {
        setFileName('');
        helpers.setValue('');
      },
      onReadStarted: () => setFileIsUploading(true),
      onReadFinished: () => setFileIsUploading(false),
      isLoading: fileIsUploading,
      allowEditingUploadedText: true,
      validated: isValid ? 'default' : 'error',
    };

    if (fieldOptions.secret) {
      return (
        <InputGroup>
          {RevertReplaceButton}
          <InputGroupItem isFill><FileUpload
            {...fileUploadProps}
            {...rest}
          /></InputGroupItem>
        </InputGroup>
      );
    }

    return (
      <FileUpload
        {...fileUploadProps}
        {...rest}
        isDisabled={false}
      />
    );
  }

  if (fieldOptions.secret) {
    const passwordInput = () => (
      <>
        {RevertReplaceButton}
        <PasswordInput
          isFieldGroupValid={isFieldGroupValid}
          {...subFormField}
          id={`credential-${fieldOptions.id}`}
          {...rest}
        />
      </>
    );
    return credentialKind === 'external' ? (
      <InputGroup>{passwordInput()}</InputGroup>
    ) : (
      passwordInput()
    );
  }
  return (
    <TextInput
      {...subFormField}
      id={`credential-${fieldOptions.id}`}
      onChange={(event) => {
        subFormField.onChange(event);
      }}
      isDisabled={isVaultIdDisabled}
      validated={isValid ? 'default' : 'error'}
    />
  );
}

function CredentialField({ credentialType, fieldOptions }) {
  const { values: formikValues } = useFormikContext();
  const location = useLocation();
  const { t } = useLingui();
  const requiredFields = credentialType?.inputs?.required || [];
  const isRequired = requiredFields.includes(fieldOptions.id);
  const validateField = () => {
    if (isRequired && !formikValues?.passwordPrompts[fieldOptions.id]) {
      const validationMsg = fieldOptions.ask_at_runtime
        ? t`Provide a value for this field or select the Prompt on launch option.`
        : null;
      return required(validationMsg);
    }
    return null;
  };
  const [subFormField, meta, helpers] = useField({
    name: `inputs.${fieldOptions.id}`,
    validate: validateField(),
  });
  const isValid =
    !(meta.touched && meta.error) ||
    formikValues.passwordPrompts[fieldOptions.id];

  if (fieldOptions.choices) {
    const selectOptions = fieldOptions.choices.map((choice) => ({
      value: choice,
      key: choice,
      label: choice,
    }));
    return (
      <FormGroup
        fieldId={`credential-${fieldOptions.id}`}
        label={fieldOptions.label}
        isRequired={isRequired}
      >
        <AnsibleSelect
          {...subFormField}
          id={`credential-${fieldOptions.id}`}
          data={selectOptions}
          onChange={(_event, val) => {
            helpers.setValue(val);
          }}
        />
        {!isValid && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {meta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    );
  }
  if (credentialType.kind === 'ssh' && fieldOptions.id === 'become_method') {
    return (
      <BecomeMethodField fieldOptions={fieldOptions} isRequired={isRequired} />
    );
  }

  let disabled = false;
  if (
    credentialType.kind === 'vault' &&
    location.pathname.endsWith('edit') &&
    fieldOptions.id === 'vault_id'
  ) {
    disabled = true;
  }
  return (
    <CredentialPluginField
      fieldOptions={fieldOptions}
      isRequired={isRequired}
      validated={isValid ? 'default' : 'error'}
    >
      <CredentialInput
        isFieldGroupValid={isValid}
        fieldOptions={fieldOptions}
        isVaultIdDisabled={disabled}
      />
    </CredentialPluginField>
  );
}

export default CredentialField;
