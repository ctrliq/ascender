import React from 'react';
import { func, shape } from 'prop-types';
import { Formik } from 'formik';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Form } from '@patternfly/react-core';
import { VariablesField } from 'components/CodeEditor';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { required } from 'util/validators';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';

import { jsonToYaml } from 'util/yaml';

function CredentialTypeFormFields() {
  const { i18n } = useLingui();
  return (
    <>
      <FormField
        id="credential-type-name"
        label={i18n._(msg`Name`)}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="credential-type-description"
        label={i18n._(msg`Description`)}
        name="description"
        type="text"
      />
      <FormFullWidthLayout>
        <VariablesField
          tooltip={i18n._(
            msg`Enter inputs using either JSON or YAML syntax. Refer to the Ansible Controller documentation for example syntax.`
          )}
          id="credential-type-inputs-configuration"
          name="inputs"
          label={i18n._(msg`Input configuration`)}
        />
      </FormFullWidthLayout>
      <FormFullWidthLayout>
        <VariablesField
          tooltip={i18n._(
            msg`Enter injectors using either JSON or YAML syntax. Refer to the Ansible Controller documentation for example syntax.`
          )}
          id="credential-type-injectors-configuration"
          name="injectors"
          label={i18n._(msg`Injector configuration`)}
        />
      </FormFullWidthLayout>
    </>
  );
}

function CredentialTypeForm({
  credentialType = {},
  onSubmit,
  onCancel,
  submitError,
  ...rest
}) {
  const initialValues = {
    name: credentialType.name || '',
    description: credentialType.description || '',
    inputs: credentialType.inputs
      ? jsonToYaml(JSON.stringify(credentialType.inputs))
      : '---',
    injectors: credentialType.injectors
      ? jsonToYaml(JSON.stringify(credentialType.injectors))
      : '---',
  };
  return (
    <Formik
      initialValues={initialValues}
      onSubmit={(values) => onSubmit(values)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <CredentialTypeFormFields {...rest} />
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

CredentialTypeForm.propTypes = {
  credentialType: shape({}),
  onCancel: func.isRequired,
  onSubmit: func.isRequired,
  submitError: shape({}),
};

CredentialTypeForm.defaultProps = {
  credentialType: {},
  submitError: null,
};

export default CredentialTypeForm;
