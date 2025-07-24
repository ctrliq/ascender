import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useFormikContext } from 'formik';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocPreviewStep from './AdHocPreviewStep';

const STEP_ID = 'preview';
export default function useAdHocPreviewStep(hasErrors) {
  const { i18n } = useLingui();
  const { values } = useFormikContext();

  return {
    step: {
      id: STEP_ID,
      key: 4,
      name: (
        <StepName hasErrors={false} id="preview-step">
          {i18n._(msg`Preview`)}
        </StepName>
      ),
      component: <AdHocPreviewStep hasErrors={hasErrors} values={values} />,
      enableNext: !hasErrors,
      nextButtonText: i18n._(msg`Launch`),
    },
    hasErrors: false,
    validate: () => {},
    setTouched: () => {},
  };
}
