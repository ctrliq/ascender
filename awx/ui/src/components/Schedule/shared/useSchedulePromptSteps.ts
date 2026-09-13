import type {
  Label,
  LaunchCredential,
  NodeTemplate,
  Schedule,
  SummaryFieldRef,
} from 'types/api';
import { useState, useEffect } from 'react';
import { useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import useInventoryStep from '../../LaunchPrompt/steps/useInventoryStep';
import useCredentialsStep from '../../LaunchPrompt/steps/useCredentialsStep';
import useExecutionEnvironmentStep from '../../LaunchPrompt/steps/useExecutionEnvironmentStep';
import useInstanceGroupsStep from '../../LaunchPrompt/steps/useInstanceGroupsStep';
import useOtherPromptsStep from '../../LaunchPrompt/steps/useOtherPromptsStep';
import useSurveyStep from '../../LaunchPrompt/steps/useSurveyStep';
import usePreviewStep from '../../LaunchPrompt/steps/usePreviewStep';
import type { ScheduleFormValues } from './types';
import type { LaunchConfig, SurveyConfig } from '../../LaunchPrompt/types';

export default function useSchedulePromptSteps(
  surveyConfig: SurveyConfig,
  launchConfig: LaunchConfig,
  schedule: Schedule,
  resource: NodeTemplate,
  scheduleCredentials: LaunchCredential[],
  resourceDefaultCredentials: LaunchCredential[] | null | undefined,
  labels: Label[],
  instanceGroups: SummaryFieldRef[]
) {
  const { t } = useLingui();
  // A schedule being edited supplies the values; a new one takes them from the
  // template it is being created on.
  const sourceOfValues: NodeTemplate =
    Object.keys(schedule).length > 0 ? (schedule as NodeTemplate) : resource;
  const { resetForm, values } = useFormikContext<ScheduleFormValues>();
  const [visited, setVisited] = useState<Record<string, boolean>>({});

  const steps = [
    useInventoryStep(launchConfig, sourceOfValues, visited),
    useCredentialsStep(
      launchConfig,
      sourceOfValues,
      resourceDefaultCredentials
    ),
    useExecutionEnvironmentStep(launchConfig, resource),
    useInstanceGroupsStep(launchConfig, resource, instanceGroups),
    useOtherPromptsStep(launchConfig, sourceOfValues, labels),
    useSurveyStep(launchConfig, surveyConfig, sourceOfValues, visited),
  ];

  const hasErrors = steps.some((step) => step.hasError);

  steps.push(
    usePreviewStep(
      launchConfig,
      resource,
      surveyConfig,
      hasErrors,
      true,
      t`Save`
    )
  );

  const pfSteps = steps.map((s) => s.step).filter((s) => s != null);
  const isReady = !steps.some((s) => !s.isReady);

  useEffect(() => {
    if (launchConfig && surveyConfig && isReady) {
      let initialValues: Record<string, unknown> = {};
      initialValues = steps.reduce(
        (acc: Record<string, unknown>, cur) => ({
          ...acc,
          ...cur.initialValues,
        }),
        {}
      );

      if (launchConfig.ask_credential_on_launch) {
        const defaultCredsWithoutOverrides: LaunchCredential[] = [];

        const credentialHasOverride = (
          templateDefaultCred: LaunchCredential
        ) => {
          let hasOverride = false;
          scheduleCredentials.forEach((scheduleCredential) => {
            if (
              templateDefaultCred.credential_type ===
              scheduleCredential.credential_type
            ) {
              if (
                (!templateDefaultCred.inputs?.vault_id &&
                  !scheduleCredential.inputs?.vault_id) ||
                (templateDefaultCred.inputs?.vault_id &&
                  scheduleCredential.inputs?.vault_id &&
                  templateDefaultCred.inputs.vault_id ===
                    scheduleCredential.inputs.vault_id)
              ) {
                hasOverride = true;
              }
            }
          });

          return hasOverride;
        };

        if (resourceDefaultCredentials) {
          resourceDefaultCredentials.forEach((defaultCred) => {
            if (!credentialHasOverride(defaultCred)) {
              defaultCredsWithoutOverrides.push(defaultCred);
            }
          });
        }

        initialValues.credentials = scheduleCredentials.concat(
          defaultCredsWithoutOverrides
        );
      }

      resetForm({
        values: {
          ...initialValues,
          ...values,
        },
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchConfig, surveyConfig, isReady]);

  const stepWithError = steps.find((s) => s.contentError);
  const contentError = stepWithError ? stepWithError.contentError : null;

  return {
    isReady,
    validateStep: (stepId: string) => {
      steps.find((s) => s?.step?.id === stepId)?.validate();
    },
    steps: pfSteps,
    visitStep: (
      prevStepId: string,
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setVisited({
        ...visited,
        [prevStepId]: true,
      });
      steps
        .find((s) => s?.step?.id === prevStepId)
        ?.setTouched(setFieldTouched);
    },
    visitAllSteps: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setVisited({
        inventory: true,
        credentials: true,
        executionEnvironment: true,
        instanceGroups: true,
        other: true,
        survey: true,
        preview: true,
      });
      steps.forEach((s) => s.setTouched(setFieldTouched));
    },
    contentError,
  };
}
