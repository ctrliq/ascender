import type {
  InstanceGroup,
  LaunchCredential,
  LaunchableResource,
} from 'types/api';
import React, { useState } from 'react';
import { ExpandableSection } from '@patternfly/react-core';
import Wizard from 'components/Wizard';
import { useLingui } from '@lingui/react/macro';
import { useDismissableError } from 'hooks/useRequest';
import type { LabelInput } from 'util/labels';
import { FormRoot, useFormContext } from 'components/Form';
import ContentLoading from '../ContentLoading';
import ContentError from '../ContentError';
import useLaunchSteps from './useLaunchSteps';
import buildLaunchParams from './buildLaunchParams';
import type { LaunchPromptValues, LaunchConfig, SurveyConfig } from './types';
import AlertModal from '../AlertModal';

export interface PromptModalFormProps {
  launchConfig: LaunchConfig;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
  resource: LaunchableResource;
  labels: LabelInput[];
  surveyConfig: SurveyConfig;
  instanceGroups: InstanceGroup[];
  resourceDefaultCredentials: LaunchCredential[];
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
  const { setFieldTouched, values } = useFormContext<LaunchPromptValues>();
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
    onSubmit(await buildLaunchParams(values, launchConfig, resource));
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
        validateStep(nextStep.id as string);
      }}
      onNext={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      onGoToStep={async (nextStep, prevStep) => {
        if (nextStep.id === 'preview') {
          visitAllSteps(setFieldTouched);
        } else {
          visitStep(prevStep.prevId as string, setFieldTouched);
          validateStep(nextStep.id as string);
        }
      }}
      title={t`Launch | ${resource.name}`}
      description={
        (resource.description?.length ?? 0) > 512 ? (
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
  resource?: LaunchableResource;
  /** The labels the resource already carries, which seed the labels field. */
  labels?: LabelInput[];
  surveyConfig?: SurveyConfig | null;
  resourceDefaultCredentials?: LaunchCredential[];
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
    <FormRoot initialValues={{}} onSubmit={(values) => onLaunch(values)}>
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
    </FormRoot>
  );
}

export { LaunchPrompt as _LaunchPrompt };
export default LaunchPrompt;
