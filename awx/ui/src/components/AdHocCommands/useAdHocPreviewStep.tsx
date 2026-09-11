import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useFormikContext } from 'formik';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocPreviewStep from './AdHocPreviewStep';
import type { AdHocValues } from './types';
import type { AdHocStep } from './types';

const STEP_ID = 'preview';
export default function useAdHocPreviewStep(hasErrors: boolean): AdHocStep {
  const { t } = useLingui();
  const { values } = useFormikContext<AdHocValues>();

  return {
    step: {
      id: STEP_ID,
      key: 4,
      name: (
        <StepName hasErrors={false} id="preview-step">
          {t`Preview`}
        </StepName>
      ),
      component: <AdHocPreviewStep hasErrors={hasErrors} values={values} />,
      enableNext: !hasErrors,
      nextButtonText: t`Launch`,
    },
    // hasError, not hasErrors: that is the key useAdHocLaunchSteps reads
    // across the steps, and this one alone called it hasErrors.
    hasError: false,
    validate: () => {},
    setTouched: () => {},
  };
}
