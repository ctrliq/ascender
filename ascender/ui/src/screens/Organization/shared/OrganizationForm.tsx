import type { Organization, SummaryFieldRef } from 'types/api';
import { FormRoot, useField, useFormContext } from 'components/Form';
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Form } from '@patternfly/react-core';

import { OrganizationsAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import {
  InstanceGroupsLookup,
  ExecutionEnvironmentLookup,
} from 'components/Lookup';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import CredentialLookup from 'components/Lookup/CredentialLookup';

export interface OrganizationFormFieldsProps {
  instanceGroups: SummaryFieldRef[];
  setInstanceGroups: (value: SummaryFieldRef[]) => void;
  /** Absent while the organization is still being added. */
  organizationId: number | string | null;
}

function OrganizationFormFields({
  instanceGroups,
  setInstanceGroups,
  organizationId,
}: OrganizationFormFieldsProps) {
  const { t } = useLingui();

  const { setFieldValue } = useFormContext<Record<string, unknown>>();

  const [
    galaxyCredentialsField,
    galaxyCredentialsMeta,
    galaxyCredentialsHelpers,
  ] = useField('galaxy_credentials');

  const [
    executionEnvironmentField,
    executionEnvironmentMeta,
    executionEnvironmentHelpers,
  ] = useField('default_environment');

  const handleCredentialUpdate = useCallback(
    (value: SummaryFieldRef[]) => {
      setFieldValue('galaxy_credentials', value);
    },
    [setFieldValue]
  );

  return (
    <>
      <FormField
        id="org-name"
        name="name"
        type="text"
        label={t`Name`}
        validate={required(null)}
        isRequired
      />
      <FormField
        id="org-description"
        name="description"
        type="text"
        label={t`Description`}
      />
      <InstanceGroupsLookup
        value={instanceGroups}
        onChange={setInstanceGroups}
        tooltip={t`Select the Instance Groups for this Organization to run on.`}
      />
      <ExecutionEnvironmentLookup
        helperTextInvalid={executionEnvironmentMeta.error}
        isValid={
          !executionEnvironmentMeta.touched || !executionEnvironmentMeta.error
        }
        onBlur={() => executionEnvironmentHelpers.setTouched(true)}
        value={executionEnvironmentField.value}
        onChange={(value) => executionEnvironmentHelpers.setValue(value)}
        popoverContent={t`The execution environment that will be used for jobs inside of this organization. This will be used a fallback when an execution environment has not been explicitly assigned at the project, job template or workflow level.`}
        globallyAvailable
        organizationId={organizationId ?? undefined}
        isDefaultEnvironment
        fieldName="default_environment"
      />
      <CredentialLookup
        credentialTypeNamespace="galaxy_api_token"
        label={t`Galaxy Credentials`}
        helperTextInvalid={galaxyCredentialsMeta.error}
        isValid={!galaxyCredentialsMeta.touched || !galaxyCredentialsMeta.error}
        onBlur={() => galaxyCredentialsHelpers.setTouched(true)}
        onChange={handleCredentialUpdate}
        value={galaxyCredentialsField.value}
        multiple
        isSelectedDraggable
        fieldName="galaxy_credentials"
        modalDescription={
          <>
            <b>
              <Trans>Selected</Trans>
            </b>
            <br />
            <Trans>
              Note: The order of these credentials sets precedence for the sync
              and lookup of the content. Select more than one to enable drag.
            </Trans>
          </>
        }
      />
    </>
  );
}

/** The organization as its own form holds it, before it is saved. */
export interface OrganizationFormValues {
  name?: string | null;
  description?: string | null;
  /** A string while the number field holds it, zero where it is unset. */
  max_hosts: number | string;
  galaxy_credentials: SummaryFieldRef[];
  default_environment: SummaryFieldRef | null;
}

export interface OrganizationFormProps {
  /** Absent on the add screen, which starts the form empty. */
  organization?: Partial<Organization>;
  onCancel: () => void;
  /**
   * Takes the instance groups alongside the values, because they are
   * associated one request at a time rather than saved with the organization.
   */
  onSubmit: (
    values: OrganizationFormValues,
    instanceGroups: SummaryFieldRef[],
    initialInstanceGroups: SummaryFieldRef[]
  ) => void;
  submitError?: unknown;
  defaultGalaxyCredential?: SummaryFieldRef | null;
}

function OrganizationForm({
  organization = {},
  onCancel,
  onSubmit,
  submitError = null,
  defaultGalaxyCredential = null,
}: OrganizationFormProps) {
  const [contentError, setContentError] = useState<unknown>(null);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const [initialInstanceGroups, setInitialInstanceGroups] = useState<
    SummaryFieldRef[]
  >([]);
  const [instanceGroups, setInstanceGroups] = useState<SummaryFieldRef[]>([]);

  const handleCancel = () => {
    onCancel();
  };

  const handleSubmit = (values: OrganizationFormValues) => {
    // The number field hands back a string, and an empty one where the user
    // cleared it: the api wants a number, and zero is its own no limit.
    const max_hosts =
      typeof values.max_hosts === 'number' ? values.max_hosts : 0;
    onSubmit({ ...values, max_hosts }, instanceGroups, initialInstanceGroups);
  };

  useEffect(() => {
    (async () => {
      const { id } = organization;
      if (!id) {
        setHasContentLoading(false);
        return;
      }
      setContentError(null);
      setHasContentLoading(true);
      try {
        const {
          data: { results = [] },
        } = await OrganizationsAPI.readInstanceGroups(id);
        setInitialInstanceGroups(results);
        setInstanceGroups(results);
      } catch (error) {
        setContentError(error);
      } finally {
        setHasContentLoading(false);
      }
    })();
  }, [organization]);

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  if (hasContentLoading) {
    return <ContentLoading />;
  }

  return (
    <FormRoot
      initialValues={{
        name: organization.name ?? '',
        description: organization.description ?? '',
        max_hosts: organization.max_hosts || '0',
        galaxy_credentials: (organization.galaxy_credentials ??
          (defaultGalaxyCredential
            ? [defaultGalaxyCredential]
            : [])) as SummaryFieldRef[],
        default_environment:
          organization.summary_fields?.default_environment ?? null,
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <OrganizationFormFields
              instanceGroups={instanceGroups}
              setInstanceGroups={setInstanceGroups}
              organizationId={organization?.id ?? null}
            />
            <FormSubmitError error={submitError} />
            <FormActionGroup
              onCancel={handleCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </FormRoot>
  );
}

export { OrganizationForm as _OrganizationForm };
export default OrganizationForm;
