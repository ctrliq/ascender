import React from 'react';
import { useLingui } from '@lingui/react/macro';
import StepName from '../LaunchPrompt/steps/StepName';
import InstanceGroupsStep from '../LaunchPrompt/steps/InstanceGroupsStep';
import type { AdHocStep } from './types';

const STEP_ID = 'instanceGroups';

/**
 * Optional step to pick where the command runs. Left empty, the api falls back
 * to the inventory and organization instance groups as it always did.
 */
export default function useAdHocInstanceGroupsStep(): AdHocStep {
  const { t } = useLingui();
  return {
    step: {
      id: STEP_ID,
      key: 5,
      stepNavItemProps: { style: { whiteSpace: 'nowrap' } },
      name: (
        <StepName hasErrors={false} id="instanceGroups-step">
          {t`Instance Groups`}
        </StepName>
      ),
      component: <InstanceGroupsStep />,
      enableNext: true,
      nextButtonText: t`Next`,
    },
    hasError: false,
    validate: () => {},
    setTouched: () => {},
  };
}
