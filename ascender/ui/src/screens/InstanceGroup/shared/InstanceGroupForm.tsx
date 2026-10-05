import type { InstanceGroup } from 'types/api';
import React from 'react';
import { FormRoot } from 'components/Form';
import { useLingui } from '@lingui/react/macro';
import { Form } from '@patternfly/react-core';

import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { required, minMaxValue } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import { DEFAULT_QUEUE_NAMES } from './queueNames';
import type { QueueNames } from './queueNames';

interface InstanceGroupFormFieldsProps {
  /** The protected group being edited, or null for any other group. */
  protectedName: string | null;
}

function InstanceGroupFormFields({
  protectedName,
}: InstanceGroupFormFieldsProps) {
  const { t } = useLingui();
  return (
    <>
      <FormField
        name="name"
        id="instance-group-name"
        label={t`Name`}
        type="text"
        validate={required(null)}
        isRequired
        isDisabled={Boolean(protectedName)}
        helperText={
          protectedName
            ? t`The ${protectedName} instance group's name may not be changed.`
            : undefined
        }
      />
      <FormField
        id="instance-group-policy-instance-minimum"
        label={t`Policy Instance Minimum`}
        name="policy_instance_minimum"
        type="number"
        min="0"
        validate={minMaxValue(0, 2147483647)}
        tooltip={t`Minimum number of instances that will be automatically assigned to this group when new instances come online.`}
      />
      <FormField
        id="instance-group-policy-instance-percentage"
        label={t`Policy Instance Percentage`}
        name="policy_instance_percentage"
        type="number"
        min="0"
        max="100"
        tooltip={t`Minimum percentage of all instances that will be automatically assigned to this group when new instances come online.`}
        validate={minMaxValue(0, 100)}
        isDisabled={Boolean(protectedName)}
        helperText={
          protectedName
            ? t`The ${protectedName} instance group's policy instance percentage may not be changed from the initial value set by the installer.`
            : undefined
        }
      />
      <FormField
        id="instance-group-max-concurrent-jobs"
        label={t`Max Concurrent Jobs`}
        name="max_concurrent_jobs"
        type="number"
        min="0"
        validate={minMaxValue(0, 2147483647)}
        tooltip={t`Maximum number of jobs to run concurrently on this group. Zero means no limit will be enforced.`}
      />
      <FormField
        id="instance-group-max-forks"
        label={t`Max Forks`}
        name="max_forks"
        type="number"
        min="0"
        validate={minMaxValue(0, 2147483647)}
        tooltip={t`Maximum number of forks to allow across all jobs running concurrently on this group. Zero means no limit will be enforced.`}
      />
    </>
  );
}

/** What the instance group form holds, which is what it posts. */
export interface InstanceGroupFormValues {
  name: string;
  policy_instance_minimum: number;
  policy_instance_percentage: number;
  max_concurrent_jobs: number;
  max_forks: number;
}

export interface InstanceGroupFormProps {
  instanceGroup?: Partial<InstanceGroup>;
  onSubmit: (values: InstanceGroupFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
  /**
   * The names the install gives the two groups its installer creates, which
   * the instance group screen reads from the api's settings.
   */
  queueNames?: QueueNames;
  [key: string]: unknown;
}

function InstanceGroupForm({
  instanceGroup = {},
  onSubmit,
  onCancel,
  submitError = null,
  queueNames = DEFAULT_QUEUE_NAMES,
}: InstanceGroupFormProps) {
  /*
   * The groups the installer creates, under the names the api's
   * DEFAULT_EXECUTION_QUEUE_NAME and DEFAULT_CONTROL_PLANE_QUEUE_NAME settings
   * give them. The api refuses to rename either or to move its policy
   * instance percentage off the installer's value.
   */
  const protectedNames = [queueNames.execution, queueNames.controlPlane];
  // Only an existing group can be one of the installer's: a new group named
  // default is refused by the api as a duplicate, not as a protected group.
  const protectedName =
    instanceGroup.id && protectedNames.includes(instanceGroup.name ?? '')
      ? (instanceGroup.name as string)
      : null;
  const initialValues = {
    name: instanceGroup.name || '',
    policy_instance_minimum: instanceGroup.policy_instance_minimum || 0,
    policy_instance_percentage: instanceGroup.policy_instance_percentage || 0,
    max_concurrent_jobs: instanceGroup.max_concurrent_jobs || 0,
    max_forks: instanceGroup.max_forks || 0,
  };
  return (
    <FormRoot
      initialValues={initialValues}
      onSubmit={(values) => onSubmit(values)}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <InstanceGroupFormFields protectedName={protectedName} />
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

export default InstanceGroupForm;
