import type { OAuth2Token, SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Formik, useField, useFormikContext } from 'formik';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import AnsibleSelect from 'components/AnsibleSelect';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import ApplicationLookup from 'components/Lookup/ApplicationLookup';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import userHelpTextStrings from './User.helptext';

function UserTokenFormFields() {
  const { t } = useLingui();
  const helptext = userHelpTextStrings();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [applicationField, applicationMeta] = useField('application');

  const [scopeField, scopeMeta, scopeHelpers] = useField({
    name: 'scope',
    validate: required(t`Please enter a value.`),
  });

  const handleApplicationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('application', value);
      setFieldTouched('application', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormGroup fieldId="application-lookup" name="application">
        <ApplicationLookup
          value={applicationField.value}
          onChange={handleApplicationUpdate}
          label={
            <span>
              {t`Application`}
              <Popover content={helptext.application} />
            </span>
          }
          touched={applicationMeta.touched}
        />
        {applicationMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {applicationMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormField
        id="token-description"
        name="description"
        type="text"
        label={t`Description`}
      />

      <FormGroup
        name="scope"
        fieldId="token-scope"
        isRequired
        label={t`Scope`}
        labelHelp={<Popover content={helptext.scope} />}
      >
        <AnsibleSelect
          {...scopeField}
          id="token-scope"
          data={[
            { key: 'default', label: '', value: '' },
            { key: 'read', value: 'read', label: t`Read` },
            { key: 'write', value: 'write', label: t`Write` },
          ]}
          onChange={(event, value) => {
            scopeHelpers.setValue(value);
          }}
        />
        {scopeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{scopeMeta.error}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </>
  );
}

/** A token as its own form holds it, before it is created. */
export interface UserTokenFormValues {
  description: string;
  application: SummaryFieldRef | null;
  scope: string;
}

export interface UserTokenFormProps {
  handleCancel: () => void;
  handleSubmit: (values: UserTokenFormValues) => void;
  submitError?: unknown;
  token?: Partial<OAuth2Token>;
}

function UserTokenForm({
  handleCancel,
  handleSubmit,
  submitError,
  token = {},
}: UserTokenFormProps) {
  return (
    <Formik
      initialValues={
        {
          description: token.description || '',
          // The lookup holds the whole application, where the token names
          // only its id.
          application: token.summary_fields?.application || null,
          scope: token.scope || '',
        } as UserTokenFormValues
      }
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <UserTokenFormFields />
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
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
