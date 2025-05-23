import React from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import DaysToKeepStep from './DaysToKeepStep';
import StepName from '../../../../../components/LaunchPrompt/steps/StepName';

const STEP_ID = 'daysToKeep';

export default function useDaysToKeepStep() {
  const { i18n } = useLingui();
  const [, nodeResourceMeta] = useField('nodeResource');
  const [, daysToKeepMeta] = useField('daysToKeep');

  return {
    step: getStep(i18n, nodeResourceMeta, daysToKeepMeta),
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
function getStep(i18n, nodeResourceMeta, daysToKeepMeta) {
  if (
    ['cleanup_activitystream', 'cleanup_jobs'].includes(
      nodeResourceMeta?.value?.job_type
    )
  ) {
    return {
      id: STEP_ID,
      name: (
        <StepName hasErrors={!!daysToKeepMeta.error} id="days-to-keep-step">
          {i18n._(msg`Days to keep`)}
        </StepName>
      ),
      component: <DaysToKeepStep />,
      enableNext: !daysToKeepMeta.error,
    };
  }
  return null;
}
