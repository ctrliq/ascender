import React from 'react';
import { useLingui } from '@lingui/react/macro';
import InstanceGroupsStep from './InstanceGroupsStep';
import StepName from './StepName';

const STEP_ID = 'instanceGroups';

export default function useInstanceGroupsStep(
  launchConfig,
  resource,
  instanceGroups
) {
  const { t } = useLingui();
  return {
    step: getStep(launchConfig, resource, t),
    initialValues: getInitialValues(launchConfig, instanceGroups),
    isReady: true,
    contentError: null,
    hasError: false,
    setTouched: (setFieldTouched) => {
      setFieldTouched('instance_groups', true, false);
    },
    validate: () => {},
  };
}
function getStep(launchConfig, resource, t) {
  if (!launchConfig.ask_instance_groups_on_launch) {
    return null;
  }
  return {
    id: STEP_ID,
    name: (
      <StepName id="instance-groups-step">
        {t`Instance Groups`}
      </StepName>
    ),
    component: <InstanceGroupsStep />,
    enableNext: true,
  };
}

function getInitialValues(launchConfig, instanceGroups) {
  if (!launchConfig.ask_instance_groups_on_launch) {
    return {};
  }

  return {
    instance_groups: instanceGroups || [],
  };
}
