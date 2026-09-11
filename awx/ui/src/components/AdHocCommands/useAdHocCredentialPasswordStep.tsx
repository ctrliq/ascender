import React from 'react';
import { useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import StepName from '../LaunchPrompt/steps/StepName';
import CredentialPasswordsStep from '../LaunchPrompt/steps/CredentialPasswordsStep';
import type { AdHocValues } from './types';

const STEP_ID = 'credentialPasswords';

const isValueMissing = (val: unknown) => !val || val === '';

export default function useCredentialPasswordsStep(
  showStep: unknown,
  visitedSteps: unknown
) {
  const { t } = useLingui();
  const { values, setFieldError } = useFormikContext<AdHocValues>();
  const hasError =
    showStep &&
    Object.keys(visitedSteps).includes(STEP_ID) &&
    checkForError(values);
  return {
    step: showStep
      ? {
          id: STEP_ID,
          name: (
            <StepName hasErrors={hasError} id="credential-passwords-step">
              {t`Credential passwords`}
            </StepName>
          ),
          component: <CredentialPasswordsStep launchConfig={{}} />,
          enableNext: true,
        }
      : null,
    isReady: true,
    contentError: null,
    hasError,
    setTouched: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      Object.keys(values.credential_passwords).forEach((credentialValueKey) =>
        setFieldTouched(
          `credential_passwords['${credentialValueKey}']`,
          true,
          false
        )
      );
    },
    validate: () => {
      const setPasswordFieldError = (fieldName: unknown) => {
        setFieldError(fieldName, t`This field may not be blank`);
      };

      Object.entries(values.credentials[0].inputs).forEach(([key, value]) => {
        if (
          value === 'ASK' &&
          isValueMissing(
            key === 'password'
              ? values.credential_passwords.ssh_password
              : values.credential_passwords[key]
          )
        ) {
          setPasswordFieldError(
            key === 'password'
              ? `credential_passwords.ssh_password`
              : `credential_passwords.${key}`
          );
        }
      });
    },
  };
}

function checkForError(values: Record<string, unknown>) {
  let hasError = false;
  Object.entries(values.credentials[0]?.inputs).forEach(([key, value]) => {
    if (
      value === 'ASK' &&
      isValueMissing(
        key === 'password'
          ? values.credential_passwords.ssh_password
          : values.credential_passwords[key]
      )
    ) {
      hasError = true;
    }
  });
  return hasError;
}
