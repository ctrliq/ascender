import type { LaunchableResource } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import PreviewStep from './PreviewStep';
import StepName from './StepName';
import type { LaunchConfig, LaunchStep, SurveyConfig } from '../types';

const STEP_ID = 'preview';

export default function usePreviewStep(
  launchConfig: LaunchConfig,
  resource: LaunchableResource | null,
  surveyConfig: SurveyConfig,
  hasErrors: boolean,
  showStep: boolean,
  /** Defaults to "Launch"; the schedule wizard says "Save" instead. */
  nextButtonText?: React.ReactNode
): LaunchStep {
  const { t } = useLingui();
  return {
    step: showStep
      ? {
          id: STEP_ID,
          name: (
            <StepName hasErrors={false} id="preview-step">
              {t`Preview`}
            </StepName>
          ),
          component: (
            <PreviewStep
              launchConfig={launchConfig}
              resource={resource}
              surveyConfig={surveyConfig}
              formErrors={hasErrors}
            />
          ),
          enableNext: !hasErrors,
          nextButtonText: nextButtonText || t`Launch`,
        }
      : null,
    initialValues: {},
    isReady: true,
    // contentError, not error: that is the key useLaunchSteps reads across the
    // steps, and this one alone called it error, so it was never looked at.
    contentError: null,
    setTouched: () => {},
    validate: () => {},
  };
}
