import type { SummaryFieldRef, User } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import type { FormikHelpers } from 'formik';
import { Formik, useField, useFormikContext } from 'formik';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
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
import { locales } from 'i18nLoader';
import {
  getThemes,
  applyTheme,
  getStoredThemeId,
  getSavedThemeId,
} from 'themeRegistry';

export interface UserFormFieldsProps {
  /** Absent on the add screen, which starts the form empty. */
  user: Partial<User>;
}

function UserFormFields({ user }: UserFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const { me = {} } = useConfig();
  const ldapUser = user.ldap_dn;
  const socialAuthUser = (user.auth?.length ?? 0) > 0;
  const externalAccount = user.external_account;

  const userTypeOptions = [
    {
      value: 'normal',
      key: 'normal',
      label: t`Normal User`,
      isDisabled: false,
    },
    {
      value: 'auditor',
      key: 'auditor',
      label: t`System Auditor`,
      isDisabled: false,
    },
    {
      value: 'administrator',
      key: 'administrator',
      label: t`System Administrator`,
      isDisabled: false,
    },
  ];

  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');

  const [userTypeField, userTypeMeta] = useField('user_type');
  const [languageField] = useField('preferred_language');
  const [themeField, , themeHelpers] = useField('preferred_theme');

  const languageOptions = [
    { value: '', key: '', label: t`Use browser default`, isDisabled: false },
    ...Object.entries(locales).map(([code, name]) => ({
      value: code,
      key: code,
      label: name,
      isDisabled: false,
    })),
  ];

  const themeOptions = getThemes().map((theme) => ({
    value: theme.id,
    key: theme.id,
    label: theme.name,
    isDisabled: false,
  }));

  const handleOrganizationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="user-first-name"
        label={t`First Name`}
        name="first_name"
        type="text"
      />
      <FormField
        id="user-last-name"
        label={t`Last Name`}
        name="last_name"
        type="text"
      />
      <FormField id="user-email" label={t`Email`} name="email" type="text" />
      <FormField
        id="user-username"
        label={t`Username`}
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
            label={t`Password`}
            name="password"
            validate={
              !user.id
                ? required(t`This field must not be blank`)
                : () => undefined
            }
            isRequired={!user.id}
          />
          <PasswordField
            id="user-confirm-password"
            label={t`Confirm Password`}
            name="confirm_password"
            validate={
              !user.id
                ? required(t`This field must not be blank`)
                : () => undefined
            }
            isRequired={!user.id}
          />
        </>
      )}

      {me.is_superuser && (
        <FormGroup fieldId="user-type" isRequired label={t`User Type`}>
          <AnsibleSelect
            isValid={!userTypeMeta.touched || !userTypeMeta.error}
            id="user-type"
            data={userTypeOptions}
            {...userTypeField}
          />
          {userTypeMeta.error && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">
                  {userTypeMeta.error}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}
      <FormGroup
        fieldId="user-preferred-language"
        label={t`Preferred Language`}
      >
        <AnsibleSelect
          id="user-preferred-language"
          data={languageOptions}
          {...languageField}
        />
      </FormGroup>
      {me.id === user.id && (
        <FormGroup fieldId="user-preferred-theme" label={t`Preferred Theme`}>
          <AnsibleSelect
            id="user-preferred-theme"
            data={themeOptions}
            {...themeField}
            onChange={(_event, value) => {
              themeHelpers.setValue(value);
              applyTheme(value);
            }}
          />
        </FormGroup>
      )}

      {!user.id && (
        <OrganizationLookup
          helperTextInvalid={organizationMeta.error}
          isValid={!organizationMeta.touched || !organizationMeta.error}
          onBlur={() => organizationHelpers.setTouched(true)}
          onChange={handleOrganizationUpdate}
          value={organizationField.value}
          required
          autoPopulate={!user?.id}
          validate={required(t`Select a value for this field`)}
        />
      )}
    </>
  );
}

/** A user as its own form holds it, before it is saved. */
export interface UserFormValues {
  first_name: string;
  last_name: string;
  organization: SummaryFieldRef | null;
  email: string;
  username: string;
  password: string;
  confirm_password: string;
  /** Which of the three the user is, which the two flags below are set from. */
  user_type: string;
  preferred_language: string;
  preferred_theme: string;
}

/** What the form posts: the values, minus the two the form only uses itself. */
export type UserFormPayload = Omit<
  UserFormValues,
  'confirm_password' | 'preferred_theme'
> & {
  is_superuser: boolean;
  is_system_auditor: boolean;
};

export interface UserFormProps {
  /** Absent on the add screen, which starts the form empty. */
  user?: Partial<User>;
  handleCancel: () => void;
  handleSubmit: (values: UserFormPayload) => void;
  submitError?: unknown;
}

function UserForm({
  user = {},
  handleCancel,
  handleSubmit,
  submitError,
}: UserFormProps) {
  const { t } = useLingui();
  const handleValidateAndSubmit = (
    values: UserFormValues,
    { setErrors }: FormikHelpers<UserFormValues>
  ) => {
    if (values.password !== values.confirm_password) {
      setErrors({
        confirm_password: t`This value does not match the password you entered previously. Please confirm that password.`,
      });
    } else {
      // Build the payload from a copy — mutating Formik's `values` object
      // (e.g. deleting password) flips the still-mounted password field from
      // controlled to uncontrolled after submit, which React warns about.
      const { confirm_password, preferred_theme, ...rest } = values;
      const submitValues: UserFormPayload = {
        ...rest,
        is_superuser: rest.user_type === 'administrator',
        is_system_auditor: rest.user_type === 'auditor',
      };
      if (!submitValues.password) {
        delete (submitValues as Partial<UserFormPayload>).password;
      }
      if (preferred_theme) {
        applyTheme(preferred_theme, true);
      }
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
      initialValues={
        {
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          organization: null,
          email: user.email || '',
          username: user.username || '',
          password: '',
          confirm_password: '',
          user_type: userType,
          preferred_language: user.preferred_language || '',
          preferred_theme: getStoredThemeId(),
        } as UserFormValues
      }
      onSubmit={handleValidateAndSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <UserFormFields user={user} />
            <FormSubmitError error={submitError} />
            <FormActionGroup
              onCancel={() => {
                applyTheme(getSavedThemeId(), true);
                handleCancel();
              }}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}

export default UserForm;
