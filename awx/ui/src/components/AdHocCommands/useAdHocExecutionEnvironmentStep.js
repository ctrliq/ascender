import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocExecutionEnvironmentStep from './AdHocExecutionEnvironmentStep';

const STEP_ID = 'executionEnvironment';
export default function useAdHocExecutionEnvironmentStep(organizationId) {
  const { i18n } = useLingui();
  return {
    step: {
      id: STEP_ID,
      key: 2,
      stepNavItemProps: { style: { whiteSpace: 'nowrap' } },
      name: (
        <StepName hasErrors={false} id="executionEnvironment-step">
          {i18n._(t`Execution Environment`)}
        </StepName>
      ),
      component: (
        <AdHocExecutionEnvironmentStep organizationId={organizationId} />
      ),
      enableNext: true,
      nextButtonText: i18n._(t`Next`),
    },
    hasError: false,
    validate: () => {},
    setTouched: () => {},
  };
}
