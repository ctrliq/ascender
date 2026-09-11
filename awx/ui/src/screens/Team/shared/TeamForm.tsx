import type { Team, Untyped } from 'types/api';
import React, { useCallback } from 'react';

import { Formik, useField, useFormikContext } from 'formik';
import { Form } from '@patternfly/react-core';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import { useLingui } from '@lingui/react/macro';

export interface TeamFormFieldsProps {
  team: Team;
  [key: string]: unknown;
}

function TeamFormFields({ team }: TeamFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext<Untyped>();
  const [orgField, orgMeta, orgHelpers] = useField('organization');

  const handleOrganizationUpdate = useCallback(
    (value: Untyped) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="team-name"
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="team-description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={orgMeta.error}
        isValid={!orgMeta.touched || !orgMeta.error}
        onBlur={() => orgHelpers.setTouched(true)}
        onChange={handleOrganizationUpdate}
        value={orgField.value}
        required
        autoPopulate={!team?.id}
        validate={required(t`Select a value for this field`)}
      />
    </>
  );
}

function TeamForm({
  team = {},
  handleCancel,
  handleSubmit,
  submitError = null,
  ...rest
}: Untyped) {
  return (
    <Formik
      initialValues={{
        description: team.description || '',
        name: team.name || '',
        organization: team.summary_fields?.organization || null,
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <TeamFormFields team={team} {...rest} />
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

export default TeamForm;
