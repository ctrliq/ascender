import type { InstanceGroup, SummaryFieldRef } from 'types/api';
import { FormRoot, useField, useFormContext } from 'components/Form';
import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Form, FormGroup } from '@patternfly/react-core';
import { jsonToYaml } from 'util/yaml';

import FormField, {
  FormSubmitError,
  CheckboxField,
} from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { required, minMaxValue } from 'util/validators';
import {
  FormColumnLayout,
  FormFullWidthLayout,
  FormCheckboxLayout,
  SubFormLayout,
} from 'components/FormLayout';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import MeshNodeLookup from 'components/Lookup/MeshNodeLookup';
import { VariablesField } from 'components/CodeEditor';

export interface ContainerGroupFormFieldsProps {
  instanceGroup: Partial<InstanceGroup>;
  [key: string]: unknown;
}

function ContainerGroupFormFields({
  instanceGroup,
}: ContainerGroupFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormContext<Record<string, unknown>>();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');

  const [meshNodeField] = useField<SummaryFieldRef | null>('mesh_node');
  const [overrideField] = useField('override');

  // A group behind a mesh node runs its pods with that node's service
  // account, so it takes no credential of its own.
  const handleMeshNodeUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('mesh_node', value);
      setFieldTouched('mesh_node', true, false);
      if (value) {
        setFieldValue('credential', null);
      }
    },
    [setFieldValue, setFieldTouched]
  );

  const handleCredentialUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        name="name"
        id="container-group-name"
        label={t`Name`}
        type="text"
        validate={required(null)}
        isRequired
      />
      <MeshNodeLookup
        id="container-group-mesh-node"
        label={t`Mesh node`}
        tooltip={t`Hop node of the receptor mesh that runs the pods of this group in the cluster it lives in, using its own service account. The work reaches it through the mesh, so this cluster needs no access to that one. Leave blank to run the pods through the API of this cluster.`}
        onChange={handleMeshNodeUpdate}
        value={meshNodeField.value}
      />
      {!meshNodeField.value && (
        <CredentialLookup
          label={t`Credential`}
          credentialTypeKind="kubernetes"
          helperTextInvalid={credentialMeta.error}
          isValid={!credentialMeta.touched || !credentialMeta.error}
          onBlur={() => credentialHelpers.setTouched(true)}
          onChange={handleCredentialUpdate}
          value={credentialField.value}
          tooltip={t`Credential to authenticate with Kubernetes or OpenShift. Must be of type "Kubernetes/OpenShift API Bearer Token". If left blank, the underlying Pod's service account will be used.`}
          autoPopulate={!instanceGroup?.id}
        />
      )}
      <FormField
        id="instance-group-max-concurrent-jobs"
        label={t`Max Concurrent Jobs`}
        name="max_concurrent_jobs"
        type="number"
        min="0"
        validate={minMaxValue(0, 2147483647)}
        tooltip={t`Maximum number of jobs to run concurrently on this group.\n          Zero means no limit will be enforced.`}
      />
      <FormField
        id="instance-group-max-forks"
        label={t`Max Forks`}
        name="max_forks"
        type="number"
        min="0"
        validate={minMaxValue(0, 2147483647)}
        tooltip={t`Maximum number of forks to allow across all jobs running concurrently on this group.\n          Zero means no limit will be enforced.`}
      />

      <FormGroup fieldId="container-groups-option-checkbox" label={t`Options`}>
        <FormCheckboxLayout>
          <CheckboxField
            name="override"
            aria-label={t`Override Pod Spec`}
            label={t`Override Pod Spec`}
            id="container-groups-override-pod-specification"
          />
        </FormCheckboxLayout>
      </FormGroup>

      {overrideField.value && (
        <SubFormLayout>
          <FormFullWidthLayout>
            <VariablesField
              tooltip={t`Field for passing a custom Kubernetes or OpenShift Pod specification.`}
              id="custom-pod-spec"
              name="pod_spec_override"
              // The name the details page shows it under, so the field reads
              // the same on both sides of the Edit button.
              label={t`Pod Spec Override`}
            />
          </FormFullWidthLayout>
        </SubFormLayout>
      )}
    </>
  );
}

/** What the container group form holds, which is what it posts. */
export interface ContainerGroupFormValues {
  name: string;
  max_concurrent_jobs: number;
  max_forks: number;
  credential?: SummaryFieldRef | null;
  /** The hop node that runs the pods, shown by its hostname. */
  mesh_node?: SummaryFieldRef | null;
  /** The pod spec as the editor holds it, which is yaml rather than json. */
  pod_spec_override?: string | null;
  /** Whether the form is overriding the default pod spec at all. */
  override: boolean;
}

export interface ContainerGroupFormProps {
  /** The default pod spec, which the editor is seeded with. */
  initialPodSpec?: Record<string, unknown>;
  instanceGroup?: Partial<InstanceGroup>;
  onSubmit: (values: ContainerGroupFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
  [key: string]: unknown;
}

function ContainerGroupForm({
  initialPodSpec = {},
  instanceGroup = {},
  onSubmit,
  onCancel,
  submitError = null,
  ...rest
}: ContainerGroupFormProps) {
  const isCheckboxChecked = Boolean(instanceGroup?.pod_spec_override) || false;

  const initialValues = {
    name: instanceGroup?.name || '',
    max_concurrent_jobs: instanceGroup.max_concurrent_jobs || 0,
    max_forks: instanceGroup.max_forks || 0,
    credential: instanceGroup?.summary_fields?.credential,
    mesh_node: instanceGroup?.summary_fields?.mesh_node
      ? {
          ...instanceGroup.summary_fields.mesh_node,
          name: instanceGroup.summary_fields.mesh_node.hostname,
        }
      : null,
    pod_spec_override: isCheckboxChecked
      ? instanceGroup?.pod_spec_override
      : jsonToYaml(JSON.stringify(initialPodSpec)),
    override: isCheckboxChecked,
  };

  return (
    <FormRoot
      initialValues={initialValues}
      onSubmit={(values) => {
        onSubmit(values);
      }}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ContainerGroupFormFields instanceGroup={instanceGroup} {...rest} />
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

export default ContainerGroupForm;
