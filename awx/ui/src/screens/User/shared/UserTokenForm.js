import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Formik, useField, useFormikContext } from 'formik';
import { Form, FormGroup } from '@patternfly/react-core';
import AnsibleSelect from 'components/AnsibleSelect';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import ApplicationLookup from 'components/Lookup/ApplicationLookup';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import helptext from './User.helptext';

function UserTokenFormFields() {
  const { i18n } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [applicationField, applicationMeta] = useField('application');

  const [scopeField, scopeMeta, scopeHelpers] = useField({
    name: 'scope',
    validate: required(i18n._(msg`Please enter a value.`)),
  });

  const handleApplicationUpdate = useCallback(
    (value) => {
      setFieldValue('application', value);
      setFieldTouched('application', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormGroup
        fieldId="application-lookup"
        name="application"
        validated={
          !applicationMeta.touched || !applicationMeta.error
            ? 'default'
            : 'error'
        }
        helperTextInvalid={applicationMeta.error}
      >
        <ApplicationLookup
          value={applicationField.value}
          onChange={handleApplicationUpdate}
          label={
            <span>
              {i18n._(msg`Application`)}
              <Popover content={helptext.application} />
            </span>
          }
          touched={applicationMeta.touched}
        />
      </FormGroup>
      <FormField
        id="token-description"
        name="description"
        type="text"
        label={i18n._(msg`Description`)}
      />

      <FormGroup
        name="scope"
        fieldId="token-scope"
        helperTextInvalid={scopeMeta.error}
        isRequired
        validated={!scopeMeta.touched || !scopeMeta.error ? 'default' : 'error'}
        label={i18n._(msg`Scope`)}
        labelIcon={<Popover content={helptext.scope} />}
      >
        <AnsibleSelect
          {...scopeField}
          id="token-scope"
          data={[
            { key: 'default', label: '', value: '' },
            { key: 'read', value: 'read', label: i18n._(msg`Read`) },
            { key: 'write', value: 'write', label: i18n._(msg`Write`) },
          ]}
          onChange={(event, value) => {
            scopeHelpers.setValue(value);
          }}
        />
      </FormGroup>
    </>
  );
}

function UserTokenForm({
  handleCancel,
  handleSubmit,
  submitError,
  token = {},
}) {
  return (
    <Formik
      initialValues={{
        description: token.description || '',
        application: token.application || null,
        scope: token.scope || '',
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <UserTokenFormFields />
            {submitError && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={handleCancel}
              onSubmit={() => {
                formik.handleSubmit();
              }}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}
export default UserTokenForm;
