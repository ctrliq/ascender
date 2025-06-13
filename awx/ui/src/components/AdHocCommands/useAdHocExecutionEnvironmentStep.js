import React from 'react';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
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
          {i18n._(msg`Execution Environment`)}
        </StepName>
      ),
      component: (
        <AdHocExecutionEnvironmentStep organizationId={organizationId} />
      ),
      enableNext: true,
      nextButtonText: i18n._(msg`Next`),
    },
    hasError: false,
    validate: () => {},
    setTouched: () => {},
  };
}
