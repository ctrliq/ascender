import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import CredentialsStep from './CredentialsStep';
import StepName from './StepName';
import credentialsValidator from './credentialsValidator';

const STEP_ID = 'credentials';

export default function useCredentialsStep(
  launchConfig,
  resource,
  resourceDefaultCredentials = [],
  allowCredentialsWithPasswords = false
) {
  const { t } = useLingui();
  const [field, meta, helpers] = useField('credentials');
  const formError =
    !resource || resource?.type === 'workflow_job_template'
      ? false
      : meta.error;
  return {
    step: !launchConfig.ask_credential_on_launch ? null : {
      id: STEP_ID,
      key: 4,
      name: (
        <StepName hasErrors={formError} id="credentials-step">
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
    hasError: launchConfig.ask_credential_on_launch && formError,
    setTouched: (setFieldTouched) => {
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

function getInitialValues(launchConfig, resourceDefaultCredentials) {
  if (!launchConfig.ask_credential_on_launch) {
    return {};
  }

  return {
    credentials: resourceDefaultCredentials,
  };
}
