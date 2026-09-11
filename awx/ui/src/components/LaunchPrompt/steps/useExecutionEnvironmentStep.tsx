import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import ExecutionEnvironmentStep from './ExecutionEnvironmentStep';
import StepName from './StepName';
import type { LaunchConfig, LaunchStep, LaunchPromptValues } from '../types';

const STEP_ID = 'executionEnvironment';

export default function useExecutionEnvironmentStep(
  launchConfig: LaunchConfig,
  resource: Untyped
): LaunchStep {
  const { t } = useLingui();
  return {
    step: !launchConfig.ask_execution_environment_on_launch
      ? null
      : {
          id: STEP_ID,
          name: (
            <StepName id="execution-environment-step">
              {t`Execution Environment`}
            </StepName>
          ),
          component: <ExecutionEnvironmentStep />,
          enableNext: true,
        },
    initialValues: getInitialValues(launchConfig, resource),
    isReady: true,
    contentError: null,
    hasError: false,
    setTouched: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setFieldTouched('execution_environment', true, false);
    },
    validate: () => {},
  };
}

function getInitialValues(
  launchConfig: LaunchConfig,
  resource: Untyped
): LaunchPromptValues {
  if (!launchConfig.ask_execution_environment_on_launch) {
    return {};
  }

  const initialValues: LaunchPromptValues = {
    execution_environment:
      resource?.summary_fields?.execution_environment || null,
  };
  return initialValues;
}
