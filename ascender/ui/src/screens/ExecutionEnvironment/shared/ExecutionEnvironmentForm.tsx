import type { CurrentUser } from 'contexts/Config';
import { FormRoot, useField, useFormContext } from 'components/Form';
import type {
  ExecutionEnvironment,
  OptionsResponse,
  SummaryFieldRef,
} from 'types/api';
import React, { useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import FormActionGroup from 'components/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import AnsibleSelect from 'components/AnsibleSelect';
import { FormColumnLayout } from 'components/FormLayout';
import { OrganizationLookup } from 'components/Lookup';
import { required } from 'util/validators';
import Tooltip from 'components/Tooltip';
import useExecutionEnvironmentHelpTextStrings from './ExecutionEnvironment.helptext';

export interface ExecutionEnvironmentFormFieldsProps {
  me: CurrentUser;
  /** The endpoint's own OPTIONS, which name the pull policies on offer. */
  options: OptionsResponse;
  /** Absent on the add screen, which starts the form empty. */
  executionEnvironment?: Partial<ExecutionEnvironment>;
  isOrgLookupDisabled: boolean;
}

function ExecutionEnvironmentFormFields({
  me,
  options,
  executionEnvironment,
  isOrgLookupDisabled,
}: ExecutionEnvironmentFormFieldsProps) {
  const { t } = useLingui();
  const helpText = useExecutionEnvironmentHelpTextStrings();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');

  const isGloballyAvailable = useRef(!organizationField.value);

  const { setFieldValue, setFieldTouched } =
    useFormContext<Record<string, unknown>>();

  const onCredentialChange = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('credential', value);
    },
    [setFieldValue]
  );

  const handleOrganizationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const [containerOptionsField, containerOptionsMeta, containerOptionsHelpers] =
    useField('pull');

  const containerPullChoices = (
    options?.actions?.POST?.pull?.choices ?? []
  ).map(([value, label]) => ({
    value: value ?? '',
    // The api names its blank choice with Django's dashes. It stays a choice,
    // since a blank pull policy is valid and is how one is cleared, but reads
    // as the prompt the other selects show while empty.
    label: value ? label : t`Choose a pull policy`,
    key: value ?? '',
  }));

  const renderOrganizationLookup = () => (
    <OrganizationLookup
      helperTextInvalid={organizationMeta.error}
      isValid={!organizationMeta.touched || !organizationMeta.error}
      onBlur={() => organizationHelpers.setTouched(true)}
      onChange={handleOrganizationUpdate}
      value={organizationField.value}
      required={!me.is_superuser}
      helperText={
        me?.is_superuser &&
        ((!isOrgLookupDisabled && isGloballyAvailable) ||
          organizationField.value === null)
          ? t`Leave this field blank to make the execution environment globally available.`
          : null
      }
      autoPopulate={!me?.is_superuser ? !executionEnvironment?.id : undefined}
      isDisabled={
        (!!isOrgLookupDisabled && isGloballyAvailable.current) ||
        executionEnvironment?.managed
      }
      validate={
        !me?.is_superuser
          ? required(t`Select a value for this field`)
          : undefined
      }
    />
  );

  return (
    <>
      <FormField
        id="execution-environment-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
        isDisabled={executionEnvironment?.managed || false}
      />
      <FormField
        id="execution-environment-image"
        label={t`Image`}
        name="image"
        type="text"
        validate={required(null)}
        isRequired
        isDisabled={executionEnvironment?.managed || false}
        tooltip={helpText.image}
      />
      <FormGroup
        fieldId="execution-environment-container-options"
        label={t`Pull`}
      >
        <AnsibleSelect
          {...containerOptionsField}
          id="container-pull-options"
          data={containerPullChoices}
          onChange={(event, value) => {
            containerOptionsHelpers.setValue(value);
          }}
        />
        {containerOptionsMeta.touched && containerOptionsMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {containerOptionsMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormField
        id="execution-environment-description"
        label={t`Description`}
        name="description"
        type="text"
        isDisabled={executionEnvironment?.managed || false}
      />
      {isOrgLookupDisabled && isGloballyAvailable.current ? (
        <Tooltip
          content={t`Globally available execution environment can not be reassigned to a specific Organization`}
        >
          {renderOrganizationLookup()}
        </Tooltip>
      ) : (
        renderOrganizationLookup()
      )}

      <CredentialLookup
        label={t`Registry Credential`}
        credentialTypeKind="registry"
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched(true)}
        onChange={onCredentialChange}
        value={credentialField.value}
        tooltip={helpText.registryCredential}
        isDisabled={executionEnvironment?.managed || false}
      />
    </>
  );
}

/** The execution environment as its own form holds it, before it is saved. */
export interface ExecutionEnvironmentFormValues {
  name: string;
  image: string;
  pull: string;
  description: string;
  credential: SummaryFieldRef | null;
  organization: SummaryFieldRef | null;
}

export interface ExecutionEnvironmentFormProps {
  /**
   * What the form draws with, read by the screen above: read here, it arrived
   * after the card was on screen and the form replaced itself with a second
   * loading animation while it was on its way.
   */
  options: OptionsResponse;
  /** Absent on the add screen, which starts the form empty. */
  executionEnvironment?: Partial<ExecutionEnvironment>;
  onSubmit: (values: ExecutionEnvironmentFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
  me: CurrentUser;
  /** True on the edit screen: an environment does not change organization. */
  isOrgLookupDisabled?: boolean;
}

function ExecutionEnvironmentForm({
  executionEnvironment = {},
  onSubmit,
  onCancel,
  submitError = null,
  me,
  options,
  isOrgLookupDisabled = false,
}: ExecutionEnvironmentFormProps) {
  const initialValues = {
    name: executionEnvironment.name || '',
    image: executionEnvironment.image || '',
    pull: executionEnvironment?.pull || '',
    description: executionEnvironment.description || '',
    credential: executionEnvironment.summary_fields?.credential || null,
    organization: executionEnvironment.summary_fields?.organization || null,
  };
  return (
    <FormRoot
      enableReinitialize
      initialValues={initialValues}
      onSubmit={(values) => onSubmit(values)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ExecutionEnvironmentFormFields
              me={me}
              options={options}
              executionEnvironment={executionEnvironment}
              isOrgLookupDisabled={isOrgLookupDisabled}
            />
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={onCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </FormRoot>
  );
}

export default ExecutionEnvironmentForm;
