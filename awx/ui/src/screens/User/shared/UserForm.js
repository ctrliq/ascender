import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Formik, useField, useFormikContext } from 'formik';
import { Form, FormGroup } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import AnsibleSelect from 'components/AnsibleSelect';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, {
  PasswordField,
  FormSubmitError,
} from 'components/FormField';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';

function UserFormFields({ user }) {
  const { i18n } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const { me = {} } = useConfig();
  const ldapUser = user.ldap_dn;
  const socialAuthUser = user.auth?.length > 0;
  const externalAccount = user.external_account;

  const userTypeOptions = [
    {
      value: 'normal',
      key: 'normal',
      label: i18n._(t`Normal User`),
      isDisabled: false,
    },
    {
      value: 'auditor',
      key: 'auditor',
      label: i18n._(t`System Auditor`),
      isDisabled: false,
    },
    {
      value: 'administrator',
      key: 'administrator',
      label: i18n._(t`System Administrator`),
      isDisabled: false,
    },
  ];

  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');

  const [userTypeField, userTypeMeta] = useField('user_type');

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
        id="user-first-name"
        label={i18n._(t`First Name`)}
        name="first_name"
        type="text"
      />
      <FormField
        id="user-last-name"
        label={i18n._(t`Last Name`)}
        name="last_name"
        type="text"
      />
      <FormField
        id="user-email"
        label={i18n._(t`Email`)}
        name="email"
        type="text"
      />
      <FormField
        id="user-username"
        label={i18n._(t`Username`)}
        name="username"
        type="text"
        validate={
          !ldapUser && !externalAccount ? required(null) : () => undefined
        }
        isRequired={!ldapUser && !externalAccount}
      />
      {!ldapUser && !(socialAuthUser && externalAccount) && (
        <>
          <PasswordField
            id="user-password"
            label={i18n._(t`Password`)}
            name="password"
            validate={
              !user.id
                ? required(i18n._(t`This field must not be blank`))
                : () => undefined
            }
            isRequired={!user.id}
          />
          <PasswordField
            id="user-confirm-password"
            label={i18n._(t`Confirm Password`)}
            name="confirm_password"
            validate={
              !user.id
                ? required(i18n._(t`This field must not be blank`))
                : () => undefined
            }
            isRequired={!user.id}
          />
        </>
      )}

      {me.is_superuser && (
        <FormGroup
          fieldId="user-type"
          helperTextInvalid={userTypeMeta.error}
          isRequired
          validated={
            !userTypeMeta.touched || !userTypeMeta.error ? 'default' : 'error'
          }
          label={i18n._(t`User Type`)}
        >
          <AnsibleSelect
            isValid={!userTypeMeta.touched || !userTypeMeta.error}
            id="user-type"
            data={userTypeOptions}
            {...userTypeField}
          />
        </FormGroup>
      )}

      {!user.id && (
        <OrganizationLookup
          helperTextInvalid={organizationMeta.error}
          isValid={!organizationMeta.touched || !organizationMeta.error}
          onBlur={() => organizationHelpers.setTouched()}
          onChange={handleOrganizationUpdate}
          value={organizationField.value}
          required
          autoPopulate={!user?.id}
          validate={required(i18n._(t`Select a value for this field`))}
        />
      )}
    </>
  );
}

function UserForm({ user, handleCancel, handleSubmit, submitError }) {
  const { i18n } = useLingui();
  const handleValidateAndSubmit = (values, { setErrors }) => {
    if (values.password !== values.confirm_password) {
      setErrors({
        confirm_password: i18n._(
          t`This value does not match the password you entered previously. Please confirm that password.`
        ),
      });
    } else {
      values.is_superuser = values.user_type === 'administrator';
      values.is_system_auditor = values.user_type === 'auditor';
      if (!values.password || values.password === '') {
        delete values.password;
      }
      const { confirm_password, ...submitValues } = values;
      handleSubmit(submitValues);
    }
  };

  let userType;
  if (user.is_superuser) {
    userType = 'administrator';
  } else if (user.is_system_auditor) {
    userType = 'auditor';
  } else {
    userType = 'normal';
  }

  return (
    <Formik
      initialValues={{
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        organization: null,
        email: user.email || '',
        username: user.username || '',
        password: '',
        confirm_password: '',
        user_type: userType,
      }}
      onSubmit={handleValidateAndSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <UserFormFields user={user} />
            <FormSubmitError error={submitError} />
            <FormActionGroup
              onCancel={handleCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}

UserForm.propTypes = {
  handleCancel: PropTypes.func.isRequired,
  handleSubmit: PropTypes.func.isRequired,
  user: PropTypes.shape({}),
};

UserForm.defaultProps = {
  user: {},
};

export default UserForm;
