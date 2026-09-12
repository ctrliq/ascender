import type {
  InventorySource,
  OptionsResponse,
  SummaryFieldRef,
} from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Formik, useField, useFormikContext } from 'formik';
import {
  Form,
  FormGroup,
  Title,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { InventorySourcesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { required } from 'util/validators';
import AnsibleSelect from 'components/AnsibleSelect';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout, SubFormLayout } from 'components/FormLayout';

import {
  ExecutionEnvironmentLookup,
  InstanceGroupsLookup,
} from 'components/Lookup';
import {
  AzureSubForm,
  EC2SubForm,
  GCESubForm,
  OpenStackSubForm,
  SCMSubForm,
  SatelliteSubForm,
  ControllerSubForm,
  TerraformSubForm,
  VMwareSubForm,
} from './InventorySourceSubForms';
import {
  VMWARE_DEFAULT_PLUGIN,
  getVmwarePlugin,
  mergeVmwarePlugin,
} from './utils';

const buildSourceChoiceOptions = (options: OptionsResponse) => {
  const sourceChoices = (options.actions.GET?.source?.choices ?? []).map(
    ([choice, label]) => ({ label, key: choice ?? '', value: choice ?? '' })
  );
  return sourceChoices.filter(({ key }) => key !== 'file');
};

const getSourceDefaults = (sourceType: string) => {
  const baseDefaults = {
    credential: null,
    overwrite: false,
    overwrite_vars: false,
    source: sourceType,
    source_path: '',
    source_project: null,
    source_script: null,
    source_vars: '---\n',
    scm_branch: null,
    update_cache_timeout: 0,
    update_on_launch: false,
    verbosity: 1,
    enabled_var: '',
    enabled_value: '',
    host_filter: '',
    vmware_plugin: VMWARE_DEFAULT_PLUGIN,
  };

  const sourceSpecificDefaults = {
    vmware: {
      source_vars: '---\nhostnames:\n  - config.name',
    },
    // Add more source-specific defaults here as needed
    // ec2: {
    //   source_vars: '---\nhostnames:\n  - instance-id',
    // },
  };

  return {
    ...baseDefaults,
    ...sourceSpecificDefaults[
      sourceType as keyof typeof sourceSpecificDefaults
    ],
  };
};

export interface InventorySourceFormFieldsProps {
  source?: Partial<InventorySource>;
  sourceOptions: OptionsResponse;
  organizationId?: number | string | null;
  [key: string]: unknown;
}

const InventorySourceFormFields = ({
  source,
  sourceOptions,
  organizationId,
}: InventorySourceFormFieldsProps) => {
  const { t } = useLingui();
  const { values, initialValues, resetForm, setFieldTouched, setFieldValue } =
    useFormikContext<InventorySourceFormValues>();
  const [sourceField, sourceMeta] = useField({
    name: 'source',
    validate: required(t`Set a value for this field`),
  });
  const [
    executionEnvironmentField,
    executionEnvironmentMeta,
    executionEnvironmentHelpers,
  ] = useField('execution_environment');
  const [instanceGroupsField, , instanceGroupsHelpers] =
    useField('instanceGroups');

  const resetSubFormFields = (sourceType: string) => {
    if (sourceType === initialValues.source) {
      resetForm({
        values: {
          ...initialValues,
          name: values.name,
          description: values.description,
          source: sourceType,
        },
      });
    } else {
      const defaults = getSourceDefaults(sourceType);
      Object.keys(defaults).forEach((label) => {
        setFieldValue(label, defaults[label as keyof typeof defaults]);
        setFieldTouched(label, false);
      });
    }
  };

  const handleExecutionEnvironmentUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('execution_environment', value);
      setFieldTouched('execution_environment', true, false);
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
      <ExecutionEnvironmentLookup
        helperTextInvalid={executionEnvironmentMeta.error}
        isValid={
          !executionEnvironmentMeta.touched || !executionEnvironmentMeta.error
        }
        onBlur={() => executionEnvironmentHelpers.setTouched(true)}
        value={executionEnvironmentField.value}
        onChange={handleExecutionEnvironmentUpdate}
        globallyAvailable
        organizationId={organizationId ?? undefined}
      />
      <InstanceGroupsLookup
        value={instanceGroupsField.value}
        onChange={(value) => instanceGroupsHelpers.setValue(value)}
        tooltip={t`Select the Instance Groups this inventory source sync should run on. If unset, the sync runs on the instance groups of the inventory or its organization.`}
        fieldName="instanceGroups"
      />
      <FormGroup fieldId="source" isRequired label={t`Source`}>
        <AnsibleSelect
          {...sourceField}
          id="source"
          data={[
            {
              value: '',
              key: '',
              label: t`Choose a source`,
              isDisabled: true,
            },
            ...buildSourceChoiceOptions(sourceOptions),
          ]}
          onChange={(event, value) => {
            resetSubFormFields(value);
          }}
        />
        {sourceMeta.touched && sourceMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {sourceMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      {!['', 'custom'].includes(sourceField.value) && (
        <SubFormLayout>
          <Title size="md" headingLevel="h4">
            {t`Source details`}
          </Title>
          <FormColumnLayout>
            {
              {
                azure_rm: (
                  <AzureSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'azure_rm'
                    }
                  />
                ),
                ec2: <EC2SubForm />,
                gce: (
                  <GCESubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'gce'
                    }
                  />
                ),
                openstack: (
                  <OpenStackSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'openstack'
                    }
                  />
                ),
                satellite6: (
                  <SatelliteSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'satellite6'
                    }
                  />
                ),
                scm: (
                  <SCMSubForm
                    autoPopulateProject={
                      !source?.id || source?.source !== 'scm'
                    }
                  />
                ),
                ascender: (
                  <ControllerSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'ascender'
                    }
                  />
                ),
                terraform: (
                  <TerraformSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'terraform'
                    }
                  />
                ),
                vmware: (
                  <VMwareSubForm
                    autoPopulateCredential={
                      !source?.id || source?.source !== 'vmware'
                    }
                  />
                ),
              }[
                sourceField.value as
                  | 'azure_rm'
                  | 'ec2'
                  | 'gce'
                  | 'openstack'
                  | 'satellite6'
                  | 'scm'
                  | 'ascender'
                  | 'terraform'
                  | 'vmware'
              ]
            }
          </FormColumnLayout>
        </SubFormLayout>
      )}
    </>
  );
};

/**
 * What the inventory source form holds.
 *
 * Every source type adds its own fields under source_vars, and the vmware
 * plugin is the form's own: it is merged into source_vars on save, which is
 * why it is not sent as a field of its own.
 */
export interface InventorySourceFormValues {
  credential?: SummaryFieldRef | null;
  instanceGroups: SummaryFieldRef[];
  description: string;
  name: string;
  overwrite: boolean;
  overwrite_vars: boolean;
  source: string;
  source_path: string;
  source_project?: SummaryFieldRef | null;
  source_script?: SummaryFieldRef | null;
  source_vars: string;
  scm_branch: string;
  update_cache_timeout: number;
  update_on_launch: boolean;
  verbosity: number;
  enabled_var: string;
  enabled_value: string;
  host_filter: string;
  execution_environment?: SummaryFieldRef | null;
  vmware_plugin?: unknown;
  [key: string]: unknown;
}

export interface InventorySourceFormProps {
  onCancel: () => void;
  onSubmit: (values: InventorySourceFormValues) => void;
  source?: Partial<InventorySource>;
  instanceGroups?: SummaryFieldRef[];
  submitError?: unknown;
  organizationId?: number | string | null;
}

const InventorySourceForm = ({
  onCancel,
  onSubmit,
  source,
  instanceGroups = [],
  submitError = null,
  organizationId,
}: InventorySourceFormProps) => {
  const initialValues = {
    credential: source?.summary_fields?.credential || null,
    instanceGroups: instanceGroups || [],
    description: source?.description || '',
    name: source?.name || '',
    overwrite: source?.overwrite || false,
    overwrite_vars: source?.overwrite_vars || false,
    source: source?.source || '',
    source_path: source?.source_path || '',
    source_project: source?.summary_fields?.source_project || null,
    source_script: source?.summary_fields?.source_script || null,
    source_vars: source?.source_vars || '---\n',
    scm_branch: source?.scm_branch || '',
    update_cache_timeout: source?.update_cache_timeout || 0,
    update_on_launch: source?.update_on_launch || false,
    verbosity: source?.verbosity || 1,
    enabled_var: source?.enabled_var || '',
    enabled_value: source?.enabled_value || '',
    host_filter: source?.host_filter || '',
    execution_environment:
      source?.summary_fields?.execution_environment || null,
    vmware_plugin:
      source?.source === 'vmware'
        ? getVmwarePlugin(source?.source_vars)
        : VMWARE_DEFAULT_PLUGIN,
  };

  const {
    isLoading: isSourceOptionsLoading,
    error: sourceOptionsError,
    request: fetchSourceOptions,
    result: sourceOptions,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventorySourcesAPI.readOptions();
      return data;
    }, []),
    null
  );

  useEffect(() => {
    fetchSourceOptions();
  }, [fetchSourceOptions]);

  if (sourceOptionsError) {
    return <ContentError error={sourceOptionsError} />;
  }

  if (!sourceOptions || isSourceOptionsLoading) {
    return <ContentLoading />;
  }

  return (
    <Formik<InventorySourceFormValues>
      initialValues={initialValues}
      onSubmit={(values) => {
        const { vmware_plugin, ...submitValues } = values;
        if (submitValues.source === 'vmware') {
          submitValues.source_vars = mergeVmwarePlugin(
            submitValues.source_vars,
            vmware_plugin
          );
        }
        onSubmit(submitValues);
      }}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <InventorySourceFormFields
              formik={formik}
              source={source}
              sourceOptions={sourceOptions}
              organizationId={organizationId ?? undefined}
            />
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={onCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
};

export default InventorySourceForm;
