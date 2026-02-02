import React, { useCallback } from 'react';
import { func, shape } from 'prop-types';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { Form } from '@patternfly/react-core';
import { VariablesField } from 'components/CodeEditor';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';
import { required } from 'util/validators';
import CredentialLookup from 'components/Lookup/CredentialLookup';

function ExecutionEnvironmentBuilderFormFields() {
  const { t } = useLingui();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');

  const { setFieldValue } = useFormikContext();

  const onCredentialChange = useCallback(
    (value) => {
      setFieldValue('credential', value);
    },
    [setFieldValue]
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
      <CredentialLookup
        label={t`Registry credential`}
        credentialTypeKind="registry"
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched()}
        onChange={onCredentialChange}
        value={credentialField.value}
      />
      <FormFullWidthLayout>
        <VariablesField
          id="eeb-definition"
          label={t`Definition`}
          name="definition"
          type="textarea"
          helperText={t`Ansible builder execution environment definition`}
        />
      </FormFullWidthLayout>
    </>
  );
}

function ExecutionEnvironmentBuilderForm({
  executionEnvironmentBuilder = {},
  onSubmit,
  onCancel,
  submitError,
  ...rest
}) {
  const defaultDefinition = `---
version: 3

images:
  base_image:
    name: 'registry.access.redhat.com/ubi9/python-311:latest'

options:
  package_manager_path: /usr/bin/dnf

dependencies:
  ansible_core:
    package_pip: ansible-core>=2.16.14,<2.17
  ansible_runner:
    package_pip: ansible-runner
  galaxy:  |
    ---
    collections:
      - name: ansible.posix
      - name: community.general
  system:  |
    sshpass [platform:rpm]
  python: |
    requests>=2.25.1
    jinja2>=3.0.0
    jmespath>=1.0
    PyYAML>=6.0

additional_build_steps:
  prepend_base:
`;

  const initialValues = {
    name: executionEnvironmentBuilder.name || '',
    image: executionEnvironmentBuilder.image || '',
    tag: executionEnvironmentBuilder.tag || 'latest',
    definition: executionEnvironmentBuilder.definition || defaultDefinition,
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

ExecutionEnvironmentBuilderForm.defaultProps = {
  executionEnvironmentBuilder: {},
  submitError: null,
};

export default ExecutionEnvironmentBuilderForm;
