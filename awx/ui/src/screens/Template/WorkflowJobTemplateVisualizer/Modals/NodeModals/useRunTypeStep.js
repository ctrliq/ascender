import React from 'react';
import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import StepName from 'components/LaunchPrompt/steps/StepName';
import RunStep from './RunStep';

const STEP_ID = 'runType';

export default function useRunTypeStep(askLinkType) {
  const { t } = useLingui();
  const [, meta] = useField('linkType');
  const [artifactKeyField] = useField('linkConditionArtifactKey');

  return {
    step: getStep(t`Run type`, askLinkType, meta, artifactKeyField),
    initialValues: askLinkType
      ? {
          linkType: 'success',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
        }
      : {},
    isReady: true,
    contentError: null,
    hasError: !!meta.error,
    setTouched: (setFieldTouched) => {
      setFieldTouched('linkType', true, false);
    },
    validate: () => {},
  };
}
function getStep(label, askLinkType, meta, artifactKeyField) {
  if (!askLinkType) {
    return null;
  }
  return {
    id: STEP_ID,
    name: (
      <StepName hasErrors={false} id="run-type-step">
        {label}
      </StepName>
    ),
    component: <RunStep />,
    enableNext:
      meta.value !== '' &&
      (meta.value !== 'condition' || artifactKeyField.value !== ''),
  };
}
