import React from 'react';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useFormikContext } from 'formik';
import StepName from '../LaunchPrompt/steps/StepName';
import AdHocDetailsStep from './AdHocDetailsStep';

const STEP_ID = 'details';
export default function useAdHocDetailsStep(visited, moduleOptions) {
  const { i18n } = useLingui();
  const { values, touched, setFieldError } = useFormikContext();

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
          {i18n._(msg`Details`)}
        </StepName>
      ),
      component: <AdHocDetailsStep moduleOptions={moduleOptions} />,
      enableNext: true,
      nextButtonText: i18n._(msg`Next`),
    },
    hasError: hasError(),
    validate: () => {
      if (Object.keys(touched).includes('module_name' || 'module_args')) {
        if (!values.module_name) {
          setFieldError('module_name', i18n._(msg`This field must not be blank.`));
        }
        if (
          values.module_name === ('command' || 'shell') &&
          !values.module_args
        ) {
          setFieldError('module_args', i18n._(msg`This field must not be blank`));
        }
      }
    },
    setTouched: (setFieldTouched) => {
      setFieldTouched('module_name', true, false);
      setFieldTouched('module_args', true, false);
    },
  };
}
