import type { SummaryFieldRef, Team } from 'types/api';
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
  team: Partial<Team>;
}

function TeamFormFields({ team }: TeamFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [orgField, orgMeta, orgHelpers] = useField('organization');

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

/** The team as its own form holds it, before it is saved. */
export interface TeamFormValues {
  name: string;
  description: string;
  organization: SummaryFieldRef | null;
}

export interface TeamFormProps {
  /** Absent on the add screen, which starts the form empty. */
  team?: Partial<Team>;
  handleCancel: () => void;
  handleSubmit: (values: TeamFormValues) => void;
  submitError?: unknown;
}

function TeamForm({
  team = {},
  handleCancel,
  handleSubmit,
  submitError = null,
}: TeamFormProps) {
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
            <TeamFormFields team={team} />
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
