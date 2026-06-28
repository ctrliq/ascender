import React from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import DaysToKeepStep from './DaysToKeepStep';
import StepName from '../../../../../components/LaunchPrompt/steps/StepName';

const STEP_ID = 'daysToKeep';

export default function useDaysToKeepStep() {
  const { t } = useLingui();
  const [, nodeResourceMeta] = useField('nodeResource');
  const [, daysToKeepMeta] = useField('daysToKeep');

  return {
    step: getStep(t`Days to keep`, nodeResourceMeta, daysToKeepMeta),
    initialValues: { daysToKeep: 30 },
    isReady: true,
    contentError: null,
    hasError: !!daysToKeepMeta.error,
    setTouched: (setFieldTouched) => {
      setFieldTouched('daysToKeep', true, false);
    },
    validate: () => {},
  };
}
function getStep(label, nodeResourceMeta, daysToKeepMeta) {
  if (
    ['cleanup_activitystream', 'cleanup_jobs'].includes(
      nodeResourceMeta?.value?.job_type
    )
  ) {
    return {
      id: STEP_ID,
      name: (
        <StepName hasErrors={!!daysToKeepMeta.error} id="days-to-keep-step">
          {label}
        </StepName>
      ),
      component: <DaysToKeepStep />,
      enableNext: !daysToKeepMeta.error,
    };
  }
  return null;
}
