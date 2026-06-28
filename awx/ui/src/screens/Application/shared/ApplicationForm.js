import React, { useCallback } from 'react';
import { useLocation } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Formik, useField, useFormikContext } from 'formik';
import { Form, FormGroup, FormHelperText,
HelperText,
HelperTextItem,
} from '@patternfly/react-core';

import { required } from 'util/validators';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';
import getApplicationHelpTextStrings from './Application.helptext';

function ApplicationFormFields({
  application,
  authorizationOptions,
  clientTypeOptions,
}) {
  const { t } = useLingui();
  const applicationHelpTextStrings = getApplicationHelpTextStrings(t);
  const { pathname } = useLocation();
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');
  const [
    authorizationTypeField,
    authorizationTypeMeta,
    authorizationTypeHelpers,
  ] = useField({
    name: 'authorization_grant_type',
    validate: required(null),
  });

  const [clientTypeField, clientTypeMeta, clientTypeHelpers] = useField({
    name: 'client_type',
    validate: required(null),
  });

  const handleOrganizationUpdate = useCallback(
    (value) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched()}
        onChange={handleOrganizationUpdate}
        value={organizationField.value}
        required
        autoPopulate={!application?.id}
        validate={required(null)}
      />
      <FormGroup
        fieldId="authType"
        isRequired
        label={t`Authorization grant type`}
        labelHelp={
        <Popover
        content={applicationHelpTextStrings.authorizationGrantType}
        />
        }
      >
        <AnsibleSelect
          {...authorizationTypeField}
          isValid={
            !authorizationTypeMeta.touched || !authorizationTypeMeta.error
          }
          isDisabled={pathname.endsWith('edit')}
          id="authType"
          data={[{ label: '', key: 1, value: '' }, ...authorizationOptions]}
          onChange={(event, value) => {
            authorizationTypeHelpers.setValue(value);
          }}
        />
        {authorizationTypeMeta.touched && authorizationTypeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {authorizationTypeMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormField
        id="redirect_uris"
        label={t`Redirect URIs`}
        name="redirect_uris"
        type="text"
        isRequired={Boolean(
          authorizationTypeField.value === 'authorization-code'
        )}
        validate={
          authorizationTypeField.value === 'authorization-code'
            ? required(null)
            : null
        }
        tooltip={applicationHelpTextStrings.redirectURIS}
      />
      <FormGroup
        fieldId="clientType"
        isRequired
        label={t`Client type`}
        labelHelp={<Popover content={applicationHelpTextStrings.clientType} />}
      >
        <AnsibleSelect
          {...clientTypeField}
          isValid={!clientTypeMeta.touched || !clientTypeMeta.error}
          id="clientType"
          data={[{ label: '', key: 1, value: '' }, ...clientTypeOptions]}
          onChange={(event, value) => {
            clientTypeHelpers.setValue(value);
          }}
        />
        {clientTypeMeta.touched && clientTypeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {clientTypeMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </>
  );
}
function ApplicationForm({
  onCancel,
  onSubmit,
  submitError,
  application,
  authorizationOptions,
  clientTypeOptions,
}) {
  const initialValues = {
    name: application?.name || '',
    description: application?.description || '',
    organization: application?.summary_fields?.organization || null,
    authorization_grant_type: application?.authorization_grant_type || '',
    redirect_uris: application?.redirect_uris || '',
    client_type: application?.client_type || '',
  };

  return (
    <Formik
      initialValues={initialValues}
      onSubmit={(values) => onSubmit(values)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ApplicationFormFields
              formik={formik}
              application={application}
              authorizationOptions={authorizationOptions}
              clientTypeOptions={clientTypeOptions}
            />
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

export default ApplicationForm;
