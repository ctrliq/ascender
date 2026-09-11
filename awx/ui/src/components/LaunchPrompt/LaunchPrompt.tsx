import type { InstanceGroup, Untyped } from 'types/api';
import React, { useState } from 'react';
import { ExpandableSection } from '@patternfly/react-core';
import Wizard from 'components/Wizard';
import { useLingui } from '@lingui/react/macro';
import { Formik, useFormikContext } from 'formik';
import { useDismissableError } from 'hooks/useRequest';
import mergeExtraVars from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import createNewLabels from 'util/labels';
import type { LabelInput } from 'util/labels';
import ContentLoading from '../ContentLoading';
import ContentError from '../ContentError';
import useLaunchSteps from './useLaunchSteps';
import type { LaunchPromptValues, LaunchConfig, SurveyConfig } from './types';
import AlertModal from '../AlertModal';

export interface PromptModalFormProps {
  launchConfig: LaunchConfig;
  onCancel: (...args: Untyped[]) => void;
  onSubmit: (...args: Untyped[]) => void;
  resource: Untyped;
  labels: LabelInput[];
  surveyConfig: SurveyConfig;
  instanceGroups: InstanceGroup[];
  resourceDefaultCredentials: Untyped;
  [key: string]: unknown;
}

function PromptModalForm({
  launchConfig,
  onCancel,
  onSubmit,
  resource,
  labels,
  surveyConfig,
  instanceGroups,
  resourceDefaultCredentials,
}: PromptModalFormProps) {
  const { t } = useLingui();
  const { setFieldTouched, values } = useFormikContext<LaunchPromptValues>();
  const [showDescription, setShowDescription] = useState(false);

  const {
    steps,
    isReady,
    validateStep,
    visitStep,
    visitAllSteps,
    contentError,
  } = useLaunchSteps(
    launchConfig,
    surveyConfig,
    resource,
    labels,
    instanceGroups,
    resourceDefaultCredentials
  );
  const handleSubmit = async () => {
    const postValues: Record<string, unknown> = {};
    const setValue = (key: string, value: unknown) => {
      if (typeof value !== 'undefined' && value !== null) {
        postValues[key] = value;
      }
    };
    const surveyValues = getSurveyValues(values);
    setValue('credential_passwords', values.credential_passwords);
    setValue('inventory_id', values.inventory?.id);
    setValue(
      'credentials',
      values.credentials?.map((c: Untyped) => c.id)
    );
    setValue('job_type', values.job_type);
    setValue('limit', values.limit);
    setValue('job_tags', values.job_tags);
    setValue('skip_tags', values.skip_tags);
    const extraVars = launchConfig.ask_variables_on_launch
      ? values.extra_vars || '---'
      : resource.extra_vars;
    setValue('extra_vars', mergeExtraVars(extraVars, surveyValues));
    setValue('scm_branch', values.scm_branch);
    setValue('verbosity', values.verbosity);
    setValue('timeout', values.timeout);
    setValue('forks', values.forks);
    setValue('job_slice_count', values.job_slice_count);
    setValue('execution_environment', values.execution_environment?.id);

    if (launchConfig.ask_instance_groups_on_launch) {
      const instanceGroupIds: number[] = [];
      values.instance_groups?.forEach((instance_group: InstanceGroup) => {
        instanceGroupIds.push(instance_group.id);
      });
      setValue('instance_groups', instanceGroupIds);
    }

    if (launchConfig.ask_labels_on_launch) {
      const { labelIds } = await createNewLabels(
        values.labels ?? [],
        resource.organization
      );

      setValue('labels', labelIds);
    }

    onSubmit(postValues);
  };
  const { error, dismissError } = useDismissableError(contentError);

  if (error) {
    return (
      <AlertModal
        isOpen={error}
        variant="error"
        title={t`Error!`}
        onClose={() => {
          dismissError();
        }}
      >
        <ContentError error={error} />
      </AlertModal>
    );
  }

  return (
    <Wizard
      isOpen
      onClose={onCancel}
      onSave={handleSubmit}
      onBack={async (nextStep) => {
        validateStep(nextStep.id);
      }}
      onNext={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId, setFieldTouched);
          validateStep(nextStep.id);
        }
      }}
      onGoToStep={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId, setFieldTouched);
          validateStep(nextStep.id);
        }
      }}
      title={t`Launch | ${resource.name}`}
      description={
        resource.description?.length > 512 ? (
          <ExpandableSection
            toggleText={
              showDescription ? t`Hide description` : t`Show description`
            }
            onToggle={(_event, isExpanded) => {
              setShowDescription(isExpanded);
            }}
            isExpanded={showDescription}
          >
            {resource.description}
          </ExpandableSection>
        ) : (
          resource.description
        )
      }
      steps={
        isReady
          ? steps
          : [
              {
                name: t`Content Loading`,
                component: <ContentLoading />,
              },
            ]
      }
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Next`}
    />
  );
}

export interface LaunchPromptProps {
  /** Null until the launch endpoint has been read, which is what gates the
   * prompt being shown at all. */
  launchConfig: LaunchConfig | null;
  onCancel: () => void;
  onLaunch: (values: LaunchPromptValues) => void;
  resource?: Untyped;
  /** The labels the resource already carries, which seed the labels field. */
  labels?: LabelInput[];
  surveyConfig: SurveyConfig | null;
  resourceDefaultCredentials?: Untyped[];
}

function LaunchPrompt({
  launchConfig,
  onCancel,
  onLaunch,
  resource = {},
  labels = [],
  surveyConfig,
  resourceDefaultCredentials = [],
}: LaunchPromptProps) {
  return (
    <Formik initialValues={{}} onSubmit={(values) => onLaunch(values)}>
      {/* Both are read before the prompt is opened, which is what gates it. */}
      <PromptModalForm
        onSubmit={(values) => onLaunch(values)}
        onCancel={onCancel}
        launchConfig={launchConfig as LaunchConfig}
        surveyConfig={surveyConfig as SurveyConfig}
        resource={resource}
        labels={labels}
        resourceDefaultCredentials={resourceDefaultCredentials}
        instanceGroups={[]}
      />
    </Formik>
  );
}

export { LaunchPrompt as _LaunchPrompt };
export default LaunchPrompt;
