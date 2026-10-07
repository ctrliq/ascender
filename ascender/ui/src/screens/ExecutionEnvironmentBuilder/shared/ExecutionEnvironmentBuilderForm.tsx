import type { CurrentUser } from 'contexts/Config';
import { FormRoot, useField, useFormContext } from 'components/Form';
import type { ExecutionEnvironmentBuilder, SummaryFieldRef } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import ContentError from 'components/ContentError';
import FormActionGroup from 'components/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import { OrganizationLookup, ProjectLookup } from 'components/Lookup';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import ExecutionEnvironmentFileSelect from './ExecutionEnvironmentFileSelect';
import useExecutionEnvironmentBuilderHelpTextStrings from './ExecutionEnvironmentBuilder.helptext';

export interface ExecutionEnvironmentBuilderFormFieldsProps {
  me: CurrentUser;
  /** Absent on the add screen, which starts the form empty. */
  executionEnvironmentBuilder?: Partial<ExecutionEnvironmentBuilder>;
  onError: (error: unknown) => void;
}

function ExecutionEnvironmentBuilderFormFields({
  me,
  executionEnvironmentBuilder,
  onError,
}: ExecutionEnvironmentBuilderFormFieldsProps) {
  const { t } = useLingui();
  const helpText = useExecutionEnvironmentBuilderHelpTextStrings();
  const { setFieldValue, setFieldTouched } =
    useFormContext<Record<string, unknown>>();

  const [organizationField, organizationMeta, organizationHelpers] = useField({
    name: 'organization',
    validate: required(t`Select a value for this field`),
  });
  const [projectField, projectMeta, projectHelpers] = useField({
    name: 'project',
    validate: required(t`Select a value for this field`),
  });
  const [fileField, fileMeta, fileHelpers] = useField({
    name: 'execution_environment_file',
    validate: required(null),
  });
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');

  const handleOrganizationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const handleProjectUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('project', value);
      // the file is a path in the project, so a new project starts it over
      setFieldValue('execution_environment_file', '', false);
      setFieldTouched('project', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const handleFileUpdate = useCallback(
    (value: string) => {
      setFieldValue('execution_environment_file', value);
      setFieldTouched('execution_environment_file', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const handleCredentialUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('credential', value);
    },
    [setFieldValue]
  );

  return (
    <>
      <FormField
        id="execution-environment-builder-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="execution-environment-builder-description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched(true)}
        onChange={handleOrganizationUpdate}
        value={organizationField.value}
        tooltip={helpText.organization}
        autoPopulate={!me?.is_superuser && !executionEnvironmentBuilder?.id}
        required
      />
      <FormField
        id="execution-environment-builder-image"
        label={t`Image`}
        name="image"
        type="text"
        validate={required(null)}
        isRequired
        tooltip={helpText.image}
      />
      <FormField
        id="execution-environment-builder-tag"
        label={t`Tag`}
        name="tag"
        type="text"
        validate={required(null)}
        isRequired
        tooltip={helpText.tag}
      />
      <ProjectLookup
        value={projectField.value}
        onBlur={() => projectHelpers.setTouched(true)}
        tooltip={helpText.project}
        isValid={!projectMeta.touched || !projectMeta.error}
        helperTextInvalid={projectMeta.error}
        onChange={handleProjectUpdate}
        required
        autoPopulate={!executionEnvironmentBuilder?.id}
      />
      <FormGroup
        fieldId="execution-environment-builder-file"
        isRequired
        label={t`Execution Environment File`}
        labelHelp={<Popover content={helpText.executionEnvironmentFile} />}
      >
        <ExecutionEnvironmentFileSelect
          onChange={handleFileUpdate}
          projectId={projectField.value?.id}
          isValid={!fileMeta.touched || !fileMeta.error}
          selected={fileField.value}
          onBlur={() => fileHelpers.setTouched(true)}
          onError={onError}
        />
        {fileMeta.touched && fileMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{fileMeta.error}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <CredentialLookup
        label={t`Registry credential`}
        credentialTypeKind="registry"
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched(true)}
        onChange={handleCredentialUpdate}
        value={credentialField.value}
        tooltip={helpText.registryCredential}
      />
    </>
  );
}

/** The builder as its own form holds it, before it is saved. */
export interface ExecutionEnvironmentBuilderFormValues {
  name: string;
  description: string;
  image: string;
  tag: string;
  execution_environment_file: string;
  organization: SummaryFieldRef | null;
  project: SummaryFieldRef | null;
  credential: SummaryFieldRef | null;
}

export interface ExecutionEnvironmentBuilderFormProps {
  /** Absent on the add screen, which starts the form empty. */
  executionEnvironmentBuilder?: Partial<ExecutionEnvironmentBuilder>;
  onSubmit: (values: ExecutionEnvironmentBuilderFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
  me: CurrentUser;
}

/** What the API takes for a builder, from what the form holds. */
export function toBuilderPayload(
  values: ExecutionEnvironmentBuilderFormValues
) {
  return {
    ...values,
    organization: values.organization?.id ?? null,
    project: values.project?.id ?? null,
    credential: values.credential?.id ?? null,
  };
}

function ExecutionEnvironmentBuilderForm({
  executionEnvironmentBuilder = {},
  onSubmit,
  onCancel,
  submitError = null,
  me,
}: ExecutionEnvironmentBuilderFormProps) {
  const [contentError, setContentError] = useState<unknown>(null);

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  const { summary_fields: summaryFields } = executionEnvironmentBuilder;
  const initialValues: ExecutionEnvironmentBuilderFormValues = {
    name: executionEnvironmentBuilder.name || '',
    description: executionEnvironmentBuilder.description || '',
    image: executionEnvironmentBuilder.image || '',
    tag: executionEnvironmentBuilder.tag || 'latest',
    execution_environment_file:
      executionEnvironmentBuilder.execution_environment_file || '',
    organization: summaryFields?.organization || null,
    project: summaryFields?.project || null,
    credential: summaryFields?.credential || null,
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
            <ExecutionEnvironmentBuilderFormFields
              me={me}
              executionEnvironmentBuilder={executionEnvironmentBuilder}
              onError={setContentError}
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

export default ExecutionEnvironmentBuilderForm;
