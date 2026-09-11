import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useFormikContext } from 'formik';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocDetailsStep from './AdHocDetailsStep';
import type { AdHocValues } from './types';
import type { VisitedSteps } from '../LaunchPrompt/types';

const STEP_ID = 'details';
export default function useAdHocDetailsStep(
  visited: VisitedSteps,
  moduleOptions: [string, string][]
) {
  const { t } = useLingui();
  const { values, touched, setFieldError } = useFormikContext<AdHocValues>();

  const hasError = () => {
    if (!Object.keys(visited).includes(STEP_ID)) {
      return false;
    }
    if (!values.module_name && touched.module_name) {
      return true;
    }

    if (values.module_name === 'shell' || values.module_name === 'command') {
      if (values.module_args) {
        return false;
        // eslint-disable-next-line no-else-return
      } else {
        return true;
      }
    }
    return false;
  };
  return {
    step: {
      id: STEP_ID,
      key: 1,
      name: (
        <StepName hasErrors={hasError()} id="details-step">
          {t`Details`}
        </StepName>
      ),
      component: <AdHocDetailsStep moduleOptions={moduleOptions} />,
      enableNext: true,
      nextButtonText: t`Next`,
    },
    hasError: hasError(),
    validate: () => {
      // `includes('a' || 'b')` is `includes('a')`: module_args on its own was
      // never enough to run these checks.
      const touchedFields = Object.keys(touched);
      if (
        touchedFields.includes('module_name') ||
        touchedFields.includes('module_args')
      ) {
        if (!values.module_name) {
          setFieldError('module_name', t`This field must not be blank.`);
        }
        // `=== ('a' || 'b')` is `=== 'a'`: a shell module with no arguments
        // was accepted, though the step marks the field required for both.
        if (
          (values.module_name === 'command' ||
            values.module_name === 'shell') &&
          !values.module_args
        ) {
          setFieldError('module_args', t`This field must not be blank`);
        }
      }
    },
    setTouched: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setFieldTouched('module_name', true, false);
      setFieldTouched('module_args', true, false);
    },
  };
}
