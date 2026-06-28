import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';

import {
	ActionGroup,
	Button,
	Form,
	FormGroup,
	Tooltip,
	FormHelperText,
	HelperText,
	HelperTextItem,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	TextInputGroup,
	TextInputGroupMain,
	TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';
import { required } from 'util/validators';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import TypeInputsSubForm from './TypeInputsSubForm';
import ExternalTestModal from './ExternalTestModal';

const StyledSelect = styled(Select)`
  ul {
    max-width: 495px;
  }
`;

const StyledSelectOption = styled(SelectOption)`
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

function CredentialFormFields({ initialTypeId, credentialTypes }) {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const { setFieldValue, initialValues, setFieldTouched } = useFormikContext();
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [credTypeField, credTypeMeta, credTypeHelpers] = useField({
    name: 'credential_type',
    validate: required(t`Select a value for this field`),
  });

  const [credentialTypeId, setCredentialTypeId] = useState(initialTypeId);

  const [orgField, orgMeta, orgHelpers] = useField('organization');

  const credentialTypeOptions = Object.keys(credentialTypes)
    .map((key) => ({
      value: credentialTypes[key].id,
      key: credentialTypes[key].id,
      label: credentialTypes[key].name,
    }))
    .sort((a, b) => (a.label.toLowerCase() > b.label.toLowerCase() ? 1 : -1));

  const resetSubFormFields = useCallback(
    (newCredentialTypeId) => {
      const fields = credentialTypes[newCredentialTypeId].inputs.fields || [];
      fields.forEach(
        ({ ask_at_runtime, type, id, choices, default: defaultValue }) => {
          if (parseInt(newCredentialTypeId, 10) === initialTypeId) {
            setFieldValue(`inputs.${id}`, initialValues.inputs[id]);
            if (ask_at_runtime) {
              setFieldValue(
                `passwordPrompts.${id}`,
                initialValues.passwordPrompts[id]
              );
            }
          } else {
            switch (type) {
              case 'string':
                setFieldValue(`inputs.${id}`, defaultValue || '');
                break;
              case 'boolean':
                setFieldValue(`inputs.${id}`, defaultValue || false);
                break;
              default:
                break;
            }

            if (choices) {
              setFieldValue(`inputs.${id}`, defaultValue);
            }

            if (ask_at_runtime) {
              setFieldValue(`passwordPrompts.${id}`, false);
            }
          }
          setFieldTouched(`inputs.${id}`, false);
        }
      );
    },
    [
      credentialTypes,
      initialTypeId,
      initialValues.inputs,
      initialValues.passwordPrompts,
      setFieldTouched,
      setFieldValue,
    ]
  );

  useEffect(() => {
    if (credentialTypeId) {
      resetSubFormFields(credentialTypeId);
    }
  }, [resetSubFormFields, credentialTypeId]);

  const handleOrganizationUpdate = useCallback(
    (value) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const isCredentialTypeDisabled = pathname.includes('edit');

  const selectedLabel =
    credentialTypeOptions.find((opt) => opt.value === credTypeField.value)
      ?.label || '';

  const filteredOptions = credentialTypeOptions.filter((opt) =>
    opt.label.toLowerCase().includes(filterValue.toLowerCase())
  );

  const credentialTypeSelect = (
    <StyledSelect
      isOpen={isSelectOpen}
      onOpenChange={(open) => {
        setIsSelectOpen(open);
        if (!open) setFilterValue('');
      }}
      onSelect={(_event, value) => {
        setCredentialTypeId(value);
        credTypeHelpers.setValue(value);
        setIsSelectOpen(false);
        setFilterValue('');
      }}
      aria-label={t`Credential Type`}
      ouiaId="CredentialForm-credential_type"
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          isFullWidth
          onClick={() => {
            if (!isCredentialTypeDisabled) setIsSelectOpen(!isSelectOpen);
          }}
          isExpanded={isSelectOpen}
          isDisabled={isCredentialTypeDisabled}
          style={isCredentialTypeDisabled ? { cursor: 'not-allowed' } : undefined}
        >
          <TextInputGroup isPlain isDisabled={isCredentialTypeDisabled}>
            <TextInputGroupMain
              value={filterValue !== '' ? filterValue : selectedLabel}
              onClick={() => {
                if (!isCredentialTypeDisabled) setIsSelectOpen(true);
              }}
              onChange={(_event, val) => {
                setFilterValue(val);
                setIsSelectOpen(true);
              }}
              onFocus={() => {
                if (selectedLabel && filterValue === '') {
                  setFilterValue(selectedLabel);
                }
              }}
              autoComplete="off"
              placeholder={t`Select a credential Type`}
              aria-label={t`Select Credential Type`}
            />
            {(filterValue || selectedLabel) && !isCredentialTypeDisabled && (
              <TextInputGroupUtilities>
                <Button icon={<TimesIcon />}
                  variant="plain"
                  onClick={() => {
                    setCredentialTypeId(undefined);
                    credTypeHelpers.setValue('');
                    setFilterValue('');
                  }}
                  aria-label={t`Clear`}
                 />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {filteredOptions.map((credType) => (
          <StyledSelectOption
            key={credType.value}
            value={credType.value}
            data-cy={`${credType.key}-credential-type-select-option`}
          >
            {credType.label}
          </StyledSelectOption>
        ))}
        {filteredOptions.length === 0 && (
          <SelectOption isDisabled>
            {t`No results found`}
          </SelectOption>
        )}
      </SelectList>
    </StyledSelect>
  );

  return (
    <>
      <FormField
        id="credential-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="credential-description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={orgMeta.error}
        isValid={!orgMeta.touched || !orgMeta.error}
        onBlur={() => orgHelpers.setTouched()}
        onChange={handleOrganizationUpdate}
        value={orgField.value}
        touched={orgMeta.touched}
        error={orgMeta.error}
        isDisabled={initialValues.isOrgLookupDisabled}
      />
      <FormGroup
        fieldId="credential-Type"
        isRequired
        label={t`Credential Type`}
      >
        {isCredentialTypeDisabled ? (
          <Tooltip
            content={t`You cannot change the credential type of a credential, as it may break the functionality of the resources using it.`}
          >
            {credentialTypeSelect}
          </Tooltip>
        ) : (
          credentialTypeSelect
        )}
        {credTypeMeta.touched && credTypeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {credTypeMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      {credentialTypeId !== undefined &&
        credentialTypeId !== '' &&
        credentialTypes[credentialTypeId]?.inputs?.fields && (
          <TypeInputsSubForm
            credentialType={credentialTypes[credentialTypeId]}
          />
        )}
    </>
  );
}

function CredentialForm({
  credential = {},
  credentialTypes,
  inputSources = {},
  onSubmit,
  onCancel,
  submitError = null,
  isOrgLookupDisabled,
  ...rest
}) {
  const initialTypeId = credential?.credential_type;
  const { t } = useLingui();

  const [showExternalTestModal, setShowExternalTestModal] = useState(false);
  const initialValues = {
    name: credential.name || '',
    description: credential.description || '',
    organization: credential?.summary_fields?.organization || null,
    credential_type: credentialTypes[initialTypeId]?.id || '',
    inputs: { ...credential?.inputs },
    passwordPrompts: {},
    isOrgLookupDisabled: isOrgLookupDisabled || false,
  };

  Object.values(credentialTypes).forEach((credentialType) => {
    if (!credential.id || credential.credential_type === credentialType.id) {
      const fields = credentialType.inputs.fields || [];
      fields.forEach(
        ({ ask_at_runtime, type, id, choices, default: defaultValue }) => {
          if (credential?.inputs && id in credential.inputs) {
            if (ask_at_runtime) {
              initialValues.passwordPrompts[id] =
                credential.inputs[id] === 'ASK' || false;
              initialValues.inputs[id] =
                credential.inputs[id] === 'ASK' ? '' : credential.inputs[id];
            } else {
              initialValues.inputs[id] = credential.inputs[id];
            }
          } else {
            switch (type) {
              case 'string':
                initialValues.inputs[id] = defaultValue || '';
                break;
              case 'boolean':
                initialValues.inputs[id] = defaultValue || false;
                break;
              default:
                break;
            }

            if (choices) {
              initialValues.inputs[id] = defaultValue;
            }

            if (ask_at_runtime) {
              initialValues.passwordPrompts[id] = false;
            }
          }
        }
      );
    }
  });

  Object.values(inputSources).forEach((inputSource) => {
    initialValues.inputs[inputSource.input_field_name] = {
      credential: inputSource.summary_fields.source_credential,
      inputs: inputSource.metadata,
    };
  });

  return (
    <Formik
      initialValues={initialValues}
      onSubmit={(values) => {
        const { credential_type, ...actualValues } = values;
        // credential_type could be the raw id or the displayed name value.
        // If it's the name, replace it with the id before making the request.
        actualValues.credential_type =
          Object.keys(credentialTypes).find(
            (key) => credentialTypes[key].name === credential_type
          ) || credential_type;
        onSubmit(actualValues);
      }}
    >
      {(formik) => (
        <>
          <Form autoComplete="off" onSubmit={formik.handleSubmit}>
            <FormColumnLayout>
              <CredentialFormFields
                initialTypeId={initialTypeId}
                credentialTypes={credentialTypes}
                {...rest}
              />
              <FormSubmitError error={submitError} />
              <FormFullWidthLayout>
                <ActionGroup>
                  <Button
                    ouiaId="credential-form-save-button"
                    id="credential-form-save-button"
                    aria-label={t`Save`}
                    variant="primary"
                    type="button"
                    onClick={formik.handleSubmit}
                  >
                    {t`Save`}
                  </Button>
                  {formik?.values?.credential_type &&
                    credentialTypes[formik.values.credential_type]?.kind ===
                      'external' && (
                      <Button
                        ouiaId="credential-form-test-button"
                        id="credential-form-test-button"
                        aria-label={t`Test`}
                        variant="secondary"
                        type="button"
                        onClick={() => setShowExternalTestModal(true)}
                        isDisabled={!formik.isValid}
                      >
                        {t`Test`}
                      </Button>
                    )}
                  <Button
                    ouiaId="credential-form-cancel-button"
                    id="credential-form-cancel-button"
                    aria-label={t`Cancel`}
                    variant="secondary"
                    type="button"
                    onClick={onCancel}
                  >
                    {t`Cancel`}
                  </Button>
                </ActionGroup>
              </FormFullWidthLayout>
            </FormColumnLayout>
          </Form>
          {showExternalTestModal && (
            <ExternalTestModal
              credential={credential}
              credentialType={credentialTypes[formik.values.credential_type]}
              credentialFormValues={formik.values}
              onClose={() => setShowExternalTestModal(false)}
            />
          )}
        </>
      )}
    </Formik>
  );
}

export default CredentialForm;
