import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import {
  Button,
  FileUpload,
  FormGroup as PFFormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  InputGroup,
  Switch,
  TextArea,
  TextInput,
  Tooltip,
  ButtonVariant, InputGroupItem,
} from '@patternfly/react-core';
import FileUploadIcon from '@patternfly/react-icons/dist/js/icons/file-upload-icon';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import AnsibleSelect from 'components/AnsibleSelect';
import { ExecutionEnvironmentLookup } from 'components/Lookup';
import CodeEditor from 'components/CodeEditor';
import { PasswordInput } from 'components/FormField';
import { FormFullWidthLayout } from 'components/FormLayout';
import Popover from 'components/Popover';
import { combine, minMaxValue, required, url, number } from 'util/validators';
import AlertModal from 'components/AlertModal';
import RevertButton from './RevertButton';

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  && {
    color: var(--pf-v6-global--danger-color--100);
  }
`;

const FormGroup = styled(PFFormGroup)`
  .pf-v6-c-form__group-label {
    display: inline-flex;
    align-items: center;
    width: 100%;
  }
  .pf-v6-c-form__group-label-help {
    display: inline-flex;
    align-items: center;
    flex: 1 1 auto;
  }
`;

const Selected = styled.div`
  display: flex;
  justify-content: space-between;
  background-color: var(--pf-v6-global--BackgroundColor--100);
  border-bottom-color: var(--pf-v6-global--BorderColor--200);
`;

const SettingGroup = ({
  children,
  defaultValue,
  fieldId,
  helperTextInvalid,
  isDisabled,
  isRequired,
  label,
  onRevertCallback,
  popoverContent,
  validated,
  t,
}) => (
      <FormGroup
    fieldId={fieldId}
    id={`${fieldId}-field`}
    isRequired={isRequired}
    label={label}
    labelHelp={
 <>
        <Popover
          content={popoverContent}
          ariaLabel={`${t`More information for`} ${label}`}
        />
        <RevertButton
          id={fieldId}
          defaultValue={defaultValue}
          isDisabled={isDisabled}
          onRevertCallback={onRevertCallback}
        />
      </>
    }
  >
    {children}
    {validated === 'error' && helperTextInvalid && (
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant="error">
            {helperTextInvalid}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    )}
  </FormGroup>
);
const BooleanField = ({
  ariaLabel = '',
  name,
  config,
  disabled = false,
  needsConfirmationModal,
  modalTitle,
}) => {
  const { t } = useLingui();
  const [field, meta, helpers] = useField(name);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return config ? (
    <SettingGroup
      defaultValue={config.default ?? false}
      fieldId={name}
      helperTextInvalid={meta.error}
      isDisabled={disabled}
      label={config.label}
      popoverContent={config.help_text}
      t={t}
    >
      {isModalOpen && (
        <AlertModal
          isOpen
          title={modalTitle}
          variant="danger"
          aria-label={modalTitle}
          onClose={() => {
            setIsModalOpen(false);
          }}
          actions={[
            <Button
              ouiaId="confirm-misc-settings-modal"
              key="confirm"
              variant="danger"
              aria-label={t`Confirm`}
              onClick={() => {
                helpers.setValue(true);
                setIsModalOpen(false);
              }}
            >
              {t`Confirm`}
            </Button>,
            <Button
              ouiaId="cancel-misc-settings-modal"
              key="cancel"
              variant="link"
              aria-label={t`Cancel`}
              onClick={() => {
                helpers.setValue(false);
                setIsModalOpen(false);
              }}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          {t`Are you sure you want to disable local authentication?  Doing so could impact users' ability to log in and the system administrator's ability to reverse this change.`}
        </AlertModal>
      )}
      <Switch
        id={name}
        ouiaId={name}
        isChecked={field.value}
        isDisabled={disabled}
        label={t`On`}

        onChange={(_event, isOn) => {
          if (needsConfirmationModal && isOn) {
            setIsModalOpen(true);
          }
          helpers.setValue(!field.value);
        }}
        aria-label={ariaLabel || config.label}
      />
    </SettingGroup>
  ) : null;
};
const ChoiceField = ({ name, config, isRequired = false }) => {
  const { t } = useLingui();
  const validate = isRequired ? required(null) : null;
  const [field, meta] = useField({ name, validate });
  const isValid = !meta.error || !meta.touched;

  return config ? (
    <SettingGroup
      defaultValue={config.default ?? ''}
      fieldId={name}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      label={config.label}
      popoverContent={config.help_text}
      validated={isValid ? 'default' : 'error'}
      t={t}
    >
      <AnsibleSelect
        id={name}
        {...field}
        data={[
          ...config.choices.map(([value, label], index) => ({
            label,
            value: value ?? '',
            key: value ?? index,
          })),
        ]}
      />
    </SettingGroup>
  ) : null;
};
const EncryptedField = ({ name, config, isRequired = false }) => {
  const { t } = useLingui();
  const validate = isRequired ? required(null) : null;
  const [, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return config ? (
    <SettingGroup
      defaultValue={config.default ?? ''}
      fieldId={name}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      label={config.label}
      popoverContent={config.help_text}
      validated={isValid ? 'default' : 'error'}
      t={t}
    >
      <InputGroup>
        <InputGroupItem><PasswordInput
          id={name}
          name={name}
          label={config.label}
          validate={validate}
          isRequired={isRequired}
        /></InputGroupItem>
      </InputGroup>
    </SettingGroup>
  ) : null;
};
const ExecutionEnvField = ({ name, config, isRequired = false }) => {
  const { t } = useLingui();
  const [field, meta, helpers] = useField({ name });
  return config ? (
    <SettingGroup
      defaultValue={config.default ?? ''}
      fieldId={name}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      label={config.label}
      popoverContent={config.help_text}
      isDisabled={field.value === null}
      onRevertCallback={() => helpers.setValue(config.default)}
      t={t}
    >
      <ExecutionEnvironmentLookup
        value={field.value}
        onChange={(value) => {
          helpers.setValue(value, false);
        }}
        overrideLabel
        fieldName={name}
      />
    </SettingGroup>
  ) : null;
};
const InputAlertField = ({ name, config }) => {
  const { t } = useLingui();
  const [field, meta] = useField({ name });
  const isValid = !(meta.touched && meta.error);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDisable, setIsDisable] = useState(true);

  const handleSetIsOpen = () => {
    setIsModalOpen(true);
  };

  const handleEnableTextInput = () => {
    setIsDisable(false);
  };

  return config ? (
    <>
      <SettingGroup
        defaultValue={config.default ?? ''}
        fieldId={name}
        helperTextInvalid={meta.error}
        label={config.label}
        popoverContent={config.help_text}
        validated={isValid ? 'default' : 'error'}
        isDisabled={isDisable}
        t={t}
      >
        <Selected>
          {isDisable && (
            <Tooltip
              content={t`Edit Login redirect override URL`}
              position="top"
            >
              <Button
                onClick={() => {
                  handleSetIsOpen();
                }}
                ouiaId="confirm-edit-login-redirect"
                variant={ButtonVariant.control}
              >
                <ExclamationCircleIcon />
              </Button>
            </Tooltip>
          )}
          <TextInput
            id={name}
            placeholder={config.placeholder}
            validated={isValid ? 'default' : 'error'}
            value={field.value}
            onBlur={field.onBlur}
            onChange={(event) => {
              field.onChange(event);
            }}
            isDisabled={isDisable}
          />
        </Selected>
      </SettingGroup>
      {isModalOpen && isDisable && (
        <AlertModal
          isOpen
          title={t`Edit login redirect override URL`}
          variant="danger"
          aria-label={t`Edit login redirect override URL`}
          onClose={() => {
            setIsModalOpen(false);
          }}
          actions={[
            <Button
              key="confirm"
              variant="danger"
              aria-label={t`confirm edit login redirect`}
              onClick={() => {
                handleEnableTextInput();
                setIsModalOpen(false);
              }}
            >
              {t`Confirm`}
            </Button>,
            <Button
              key="cancel"
              variant="link"
              aria-label={t`cancel edit login redirect`}
              onClick={() => {
                setIsModalOpen(false);
              }}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          {t`Are you sure you want to edit login redirect override URL?  Doing so could impact users' ability to log in to the system once local authentication is also disabled.`}
        </AlertModal>
      )}
    </>
  ) : null;
};

const InputField = ({
  name,
  config = null,
  type = 'text',
  isRequired = false,
}) => {
  const { t } = useLingui();
  const min_value = config?.min_value ?? Number.MIN_SAFE_INTEGER;
  const max_value = config?.max_value ?? Number.MAX_SAFE_INTEGER;
  const validators = [
    ...(isRequired ? [required(null)] : []),
    ...(type === 'url' ? [url()] : []),
    ...(type === 'number' ? [number(), minMaxValue(min_value, max_value)] : []),
  ];
  const [field, meta] = useField({ name, validate: combine(validators) });
  const isValid = !(meta.touched && meta.error);

  return config ? (
    <SettingGroup
      defaultValue={config.default ?? ''}
      fieldId={name}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      label={config.label}
      popoverContent={config.help_text}
      validated={isValid ? 'default' : 'error'}
      t={t}
    >
      <TextInput
        type={type}
        id={name}
        isRequired={isRequired}
        placeholder={config.placeholder}
        validated={isValid ? 'default' : 'error'}
        value={field.value}
        onBlur={field.onBlur}
        onChange={(event) => {
          field.onChange(event);
        }}
      />
    </SettingGroup>
  ) : null;
};
const TextAreaField = ({ name, config, isRequired = false }) => {
  const { t } = useLingui();
  const validate = isRequired ? required(null) : null;
  const [field, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return config ? (
    <SettingGroup
      defaultValue={config.default || ''}
      fieldId={name}
      helperTextInvalid={meta.error}
      isRequired={isRequired}
      label={config.label}
      popoverContent={config.help_text}
      validated={isValid ? 'default' : 'error'}
      t={t}
    >
      <TextArea
        id={name}
        isRequired={isRequired}
        placeholder={config.placeholder}
        validated={isValid ? 'default' : 'error'}
        value={field.value}
        onBlur={field.onBlur}
        onChange={(event) => {
          field.onChange(event);
        }}
        resizeOrientation="vertical"
      />
    </SettingGroup>
  ) : null;
};
const ObjectField = ({ name, config, revertValue, isRequired = false }) => {
  const { t } = useLingui();
  const validate = isRequired ? required(null) : null;
  const [field, meta, helpers] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  const defaultRevertValue = config?.default
    ? JSON.stringify(config.default, null, 2)
    : null;

  return config ? (
    <FormFullWidthLayout>
      <SettingGroup
        defaultValue={revertValue ?? defaultRevertValue}
        fieldId={name}
        helperTextInvalid={meta.error}
        isRequired={isRequired}
        label={config.label}
        popoverContent={config.help_text}
        validated={isValid ? 'default' : 'error'}
        t={t}
      >
        <CodeEditor
          {...field}
          value={
            field.value === null
              ? JSON.stringify(field.value, null, 2)
              : field.value
          }
          rows={field.value !== null ? 'auto' : 1}
          id={name}
          mode="javascript"
          onChange={(value) => {
            helpers.setValue(value);
          }}
          placeholder={JSON.stringify(config?.placeholder, null, 2)}
        />
      </SettingGroup>
    </FormFullWidthLayout>
  ) : null;
};
const FileUploadIconWrapper = styled.div`
  margin: var(--pf-v6-global--spacer--md);
`;
const FileUploadField = ({
  name,
  config,
  type = 'text',
  isRequired = false,
}) => {
  const { t } = useLingui();
  const validate = isRequired ? required(null) : null;
  const [filename, setFilename] = useState('');
  const [fileIsUploading, setFileIsUploading] = useState(false);
  const [field, meta] = useField({ name, validate });
  const isValid = !(meta.touched && meta.error);

  return config ? (
    <FormFullWidthLayout>
      <SettingGroup
        defaultValue={config.default ?? ''}
        fieldId={name}
        helperTextInvalid={meta.error}
        isRequired={isRequired}
        label={config.label}
        popoverContent={config.help_text}
        validated={isValid ? 'default' : 'error'}
        onRevertCallback={() => setFilename('')}
        t={t}
      >
        <FileUpload
          id={name}
          type={type}
          value={field.value}
          filename={filename}
          onFileInputChange={(_event, file) => {
            setFilename(file.name);
          }}
          onDataChange={(_event, data) => {
            field.onChange({ target: { name, value: data } });
          }}
          onTextChange={(_event, text) => {
            field.onChange({ target: { name, value: text } });
          }}
          onClearClick={() => {
            setFilename('');
            field.onChange({ target: { name, value: '' } });
          }}
          onReadStarted={() => setFileIsUploading(true)}
          onReadFinished={() => setFileIsUploading(false)}
          isLoading={fileIsUploading}
          allowEditingUploadedText
          validated={isValid ? 'default' : 'error'}
          hideDefaultPreview={type === 'dataURL'}
          browseButtonText={t`Browse…`}
          clearButtonText={t`Clear`}
        >
          {type === 'dataURL' && (
            <FileUploadIconWrapper>
              {field.value ? (
                <img
                  src={field.value}
                  alt={filename}
                  height="200px"
                  width="200px"
                />
              ) : (
                <FileUploadIcon />
              )}
            </FileUploadIconWrapper>
          )}
        </FileUpload>
      </SettingGroup>
    </FormFullWidthLayout>
  ) : null;
};
export {
  BooleanField,
  ChoiceField,
  EncryptedField,
  ExecutionEnvField,
  FileUploadField,
  InputField,
  ObjectField,
  TextAreaField,
  InputAlertField,
};
