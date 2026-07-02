import React, { useCallback } from 'react';
import { func, shape } from 'prop-types';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { FormColumnLayout } from 'components/FormLayout';
import { required } from 'util/validators';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import ProjectLookup from 'components/Lookup/ProjectLookup';
import ExecutionEnvironmentFileSelect from './ExecutionEnvironmentFileSelect';

function ExecutionEnvironmentBuilderFormFields() {
  const { t } = useLingui();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const [projectField, projectMeta, projectHelpers] = useField({
    name: 'project',
    validate: required(null),
  });
  const [eeFileField, eeFileMeta, eeFileHelpers] = useField({
    name: 'execution_environment_file',
    validate: required(null),
  });

  const { setFieldValue, setFieldTouched } = useFormikContext();

  const onCredentialChange = useCallback(
    (value) => {
      setFieldValue('credential', value);
    },
    [setFieldValue]
  );

  const onProjectChange = useCallback(
    (value) => {
      setFieldValue('project', value);
      setFieldValue('execution_environment_file', '', false);
      setFieldTouched('execution_environment_file', false);
    },
    [setFieldValue, setFieldTouched]
  );

  const onEEFileChange = useCallback(
    (value) => {
      setFieldValue('execution_environment_file', value);
      setFieldTouched('execution_environment_file', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="eeb-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="eeb-image"
        label={t`Image`}
        name="image"
        type="text"
        placeholder={t`e.g., my-custom-ee`}
        helperText={t`The name for the built execution environment image`}
      />
      <FormField
        id="eeb-tag"
        label={t`Tag`}
        name="tag"
        type="text"
        placeholder={t`latest`}
        helperText={t`The tag for the built execution environment image`}
      />
      <ProjectLookup
        value={projectField.value}
        onBlur={() => projectHelpers.setTouched()}
        isValid={Boolean(
          !projectMeta.touched || (!projectMeta.error && projectField.value)
        )}
        helperTextInvalid={projectMeta.error}
        onChange={onProjectChange}
        required
      />
      <FormGroup
        fieldId="eeb-execution-environment-file"
        isRequired
        label={t`Execution environment file`}
      >
        <ExecutionEnvironmentFileSelect
          projectId={projectField.value?.id}
          isValid={!eeFileMeta.touched || !eeFileMeta.error}
          selected={eeFileField.value}
          onBlur={() => eeFileHelpers.setTouched()}
          onChange={onEEFileChange}
        />
        {eeFileMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {eeFileMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <CredentialLookup
        label={t`Registry credential`}
        credentialTypeKind="registry"
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched()}
        onChange={onCredentialChange}
        value={credentialField.value}
      />
    </>
  );
}

function ExecutionEnvironmentBuilderForm({
  executionEnvironmentBuilder = {},
  onSubmit,
  onCancel,
  submitError = null,
  ...rest
}) {
  const initialValues = {
    name: executionEnvironmentBuilder.name || '',
    image: executionEnvironmentBuilder.image || '',
    tag: executionEnvironmentBuilder.tag || 'latest',
    project: executionEnvironmentBuilder.summary_fields?.project || null,
    execution_environment_file:
      executionEnvironmentBuilder.execution_environment_file || '',
    credential: executionEnvironmentBuilder.summary_fields?.credential || null,
  };

  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      onSubmit={(values) => onSubmit(values)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ExecutionEnvironmentBuilderFormFields {...rest} />
            {submitError && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={onCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}

ExecutionEnvironmentBuilderForm.propTypes = {
  executionEnvironmentBuilder: shape({}),
  onCancel: func.isRequired,
  onSubmit: func.isRequired,
  submitError: shape({}),
};

export default ExecutionEnvironmentBuilderForm;
