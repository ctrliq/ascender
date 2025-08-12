import React from 'react';
import { useLingui } from '@lingui/react/macro';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocExecutionEnvironmentStep from './AdHocExecutionEnvironmentStep';

const STEP_ID = 'executionEnvironment';
export default function useAdHocExecutionEnvironmentStep(organizationId) {
  const { t } = useLingui();
  return {
    step: {
      id: STEP_ID,
      key: 2,
      stepNavItemProps: { style: { whiteSpace: 'nowrap' } },
      name: (
        <StepName hasErrors={false} id="executionEnvironment-step">
          {t`Execution Environment`}
        </StepName>
      ),
      component: (
        <AdHocExecutionEnvironmentStep organizationId={organizationId} />
      ),
      enableNext: true,
      nextButtonText: t`Next`,
    },
    hasError: false,
    validate: () => {},
    setTouched: () => {},
  };
}
