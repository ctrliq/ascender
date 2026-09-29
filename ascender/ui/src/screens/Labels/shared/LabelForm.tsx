import type { Label, Organization } from 'types/api';
import React, { useCallback } from 'react';
import { Form } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { FormRoot, useField } from 'components/Form';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { FormColumnLayout } from 'components/FormLayout';
import { OrganizationLookup } from 'components/Lookup';
import { required } from 'util/validators';

export interface LabelFormValues {
  name?: string;
  /** The whole organization the lookup holds, not just its id. */
  organization?: Organization | null;
}

export interface LabelFormProps {
  label?: Label;
  onSubmit: (values: LabelFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
}

/**
 * The organization a label belongs to. The api requires one, so the field is
 * required here rather than left to fail on submit.
 */
function OrganizationField({ autoPopulate }: { autoPopulate: boolean }) {
  const { t } = useLingui();
  const [field, meta, helpers] = useField({
    name: 'organization',
    validate: required(t`Select a value for this field`),
  });
  const handleChange = useCallback(
    (value: Organization | null) => helpers.setValue(value),
    [helpers]
  );

  return (
    <OrganizationLookup
      helperTextInvalid={meta.error}
      isValid={!meta.touched || !meta.error}
      onBlur={() => helpers.setTouched(true)}
      onChange={handleChange}
      value={field.value}
      required
      autoPopulate={autoPopulate}
    />
  );
}

function LabelForm({ label, onSubmit, onCancel, submitError }: LabelFormProps) {
  const { t } = useLingui();

  return (
    <FormRoot
      initialValues={{
        name: label?.name ?? '',
        organization: label?.summary_fields?.organization ?? null,
      }}
      onSubmit={(values) => onSubmit(values as LabelFormValues)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            {/* Name takes one column like every other form's name field, so
                the organization lookup sits beside it at the same width. */}
            <FormField
              id="label-name"
              name="name"
              type="text"
              label={t`Name`}
              validate={required(null)}
              isRequired
            />
            {/* A new label is given the only organization the user has, where
                there is only one; editing keeps whatever it already had. */}
            <OrganizationField autoPopulate={!label} />
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={onCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </FormRoot>
  );
}

export default LabelForm;
