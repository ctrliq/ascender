import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import CredentialsStep from './CredentialsStep';
import StepName from './StepName';
import credentialsValidator from './credentialsValidator';
import type { LaunchConfig, LaunchStep } from '../types';

const STEP_ID = 'credentials';

export default function useCredentialsStep(
  launchConfig: LaunchConfig,
  resource: Record<string, unknown>,
  resourceDefaultCredentials = [],
  allowCredentialsWithPasswords = false
): LaunchStep {
  const { t } = useLingui();
  const [field, meta, helpers] = useField('credentials');
  const formError =
    !resource || resource?.type === 'workflow_job_template'
      ? false
      : meta.error;
  return {
    step: !launchConfig.ask_credential_on_launch
      ? null
      : {
          id: STEP_ID,
          key: 4,
          name: (
            <StepName hasErrors={Boolean(formError)} id="credentials-step">
              {t`Credentials`}
            </StepName>
          ),
          component: (
            <CredentialsStep
              allowCredentialsWithPasswords={allowCredentialsWithPasswords}
              defaultCredentials={resourceDefaultCredentials}
            />
          ),
          enableNext: true,
        },
    initialValues: getInitialValues(launchConfig, resourceDefaultCredentials),
    isReady: true,
    contentError: null,
    hasError: Boolean(launchConfig.ask_credential_on_launch && formError),
    setTouched: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setFieldTouched('credentials', true, false);
    },
    validate: () => {
      helpers.setError(
        credentialsValidator(
          allowCredentialsWithPasswords,
          field.value,
          t,
          resourceDefaultCredentials
        )
      );
    },
  };
}

function getInitialValues(
  launchConfig: LaunchConfig,
  resourceDefaultCredentials: unknown
) {
  if (!launchConfig.ask_credential_on_launch) {
    return {};
  }

  return {
    credentials: resourceDefaultCredentials,
  };
}
