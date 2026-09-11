import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useFormikContext } from 'formik';
import CredentialPasswordsStep from './CredentialPasswordsStep';
import StepName from './StepName';
import type {
  LaunchConfig,
  LaunchPromptValues,
  LaunchStep,
  VisitedSteps,
} from '../types';

const STEP_ID = 'credentialPasswords';

const isValueMissing = (val: unknown) => !val || val === '';

export default function useCredentialPasswordsStep(
  launchConfig: LaunchConfig,

  showStep: unknown,
  visitedSteps: VisitedSteps
): LaunchStep {
  const { t } = useLingui();
  const { values, setFieldError } = useFormikContext<LaunchPromptValues>();
  // Seeded by getInitialValues below before the step is reachable.
  const credentialPasswords = values.credential_passwords ?? {};
  const hasError =
    Object.keys(visitedSteps).includes(STEP_ID) &&
    checkForError(launchConfig, values);

  return {
    step: showStep
      ? {
          id: STEP_ID,
          name: (
            <StepName hasErrors={hasError} id="credential-passwords-step">
              {t`Credential passwords`}
            </StepName>
          ),
          component: <CredentialPasswordsStep launchConfig={launchConfig} />,
          enableNext: true,
        }
      : null,
    initialValues: getInitialValues(launchConfig, values.credentials),
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
      Object.keys(credentialPasswords).forEach((credentialValueKey) =>
        setFieldTouched(
          `credential_passwords['${credentialValueKey}']`,
          true,
          false
        )
      );
    },
    validate: () => {
      const setPasswordFieldError = (fieldName: string) => {
        setFieldError(fieldName, t`This field may not be blank`);
      };

      if (
        !launchConfig.ask_credential_on_launch &&
        launchConfig.passwords_needed_to_start
      ) {
        launchConfig.passwords_needed_to_start.forEach((password: string) => {
          if (isValueMissing(credentialPasswords[password])) {
            setPasswordFieldError(`credential_passwords['${password}']`);
          }
        });
      } else if (values.credentials) {
        values.credentials.forEach((credential: Untyped) => {
          if (!credential.inputs) {
            const launchConfigCredential = (
              launchConfig.defaults?.credentials ?? []
            ).find((defaultCred: Untyped) => defaultCred.id === credential.id);

            if (launchConfigCredential?.passwords_needed?.length) {
              launchConfigCredential?.passwords_needed?.forEach(
                (password: string) => {
                  if (isValueMissing(credentialPasswords[password])) {
                    setPasswordFieldError(
                      `credential_passwords['${password}']`
                    );
                  }
                }
              );
            }
          } else {
            if (
              credential?.inputs?.password === 'ASK' &&
              isValueMissing(credentialPasswords.ssh_password)
            ) {
              setPasswordFieldError('credential_passwords.ssh_password');
            }

            if (
              credential?.inputs?.become_password === 'ASK' &&
              isValueMissing(credentialPasswords.become_password)
            ) {
              setPasswordFieldError('credential_passwords.become_password');
            }

            if (
              credential?.inputs?.ssh_key_unlock === 'ASK' &&
              isValueMissing(credentialPasswords.ssh_key_unlock)
            ) {
              setPasswordFieldError('credential_passwords.ssh_key_unlock');
            }

            if (
              credential?.inputs?.vault_password === 'ASK' &&
              isValueMissing(
                credentialPasswords[
                  `vault_password${
                    credential.inputs.vault_id !== ''
                      ? `.${credential.inputs.vault_id}`
                      : ''
                  }`
                ]
              )
            ) {
              setPasswordFieldError(
                `credential_passwords['vault_password${
                  credential.inputs.vault_id !== ''
                    ? `.${credential.inputs.vault_id}`
                    : ''
                }']`
              );
            }
          }
        });
      }
    },
  };
}

function getInitialValues(
  launchConfig: LaunchConfig,
  selectedCredentials: Untyped[] = []
) {
  const initialValues: { credential_passwords: Record<string, string> } = {
    credential_passwords: {},
  };

  if (!launchConfig) {
    return initialValues;
  }

  if (
    !launchConfig.ask_credential_on_launch &&
    launchConfig.passwords_needed_to_start
  ) {
    launchConfig.passwords_needed_to_start.forEach((password: string) => {
      initialValues.credential_passwords[password] = '';
    });
    return initialValues;
  }

  selectedCredentials.forEach((credential: Untyped) => {
    if (!credential.inputs) {
      const launchConfigCredential = (
        launchConfig.defaults?.credentials ?? []
      ).find((defaultCred: Untyped) => defaultCred.id === credential.id);

      if (launchConfigCredential?.passwords_needed?.length) {
        launchConfigCredential?.passwords_needed?.forEach(
          (password: string) => {
            initialValues.credential_passwords[password] = '';
          }
        );
      }
    } else {
      if (credential?.inputs?.password === 'ASK') {
        initialValues.credential_passwords.ssh_password = '';
      }

      if (credential?.inputs?.become_password === 'ASK') {
        initialValues.credential_passwords.become_password = '';
      }

      if (credential?.inputs?.ssh_key_unlock === 'ASK') {
        initialValues.credential_passwords.ssh_key_unlock = '';
      }

      if (credential?.inputs?.vault_password === 'ASK') {
        if (!credential.inputs.vault_id || credential.inputs.vault_id === '') {
          initialValues.credential_passwords.vault_password = '';
        } else {
          initialValues.credential_passwords[
            `vault_password.${credential.inputs.vault_id}`
          ] = '';
        }
      }
    }
  });

  return initialValues;
}

function checkForError(launchConfig: LaunchConfig, values: LaunchPromptValues) {
  let hasError = false;
  const credentialPasswords = values.credential_passwords ?? {};

  if (
    !launchConfig.ask_credential_on_launch &&
    launchConfig.passwords_needed_to_start
  ) {
    launchConfig.passwords_needed_to_start.forEach((password: string) => {
      if (isValueMissing(credentialPasswords[password])) {
        hasError = true;
      }
    });
  } else if (values.credentials) {
    values.credentials.forEach((credential: Untyped) => {
      if (!credential.inputs) {
        const launchConfigCredential = (
          launchConfig.defaults?.credentials ?? []
        ).find((defaultCred: Untyped) => defaultCred.id === credential.id);

        if (launchConfigCredential?.passwords_needed?.length) {
          launchConfigCredential?.passwords_needed?.forEach(
            (password: string) => {
              if (isValueMissing(credentialPasswords[password])) {
                hasError = true;
              }
            }
          );
        }
      } else {
        if (
          credential?.inputs?.password === 'ASK' &&
          isValueMissing(credentialPasswords.ssh_password)
        ) {
          hasError = true;
        }

        if (
          credential?.inputs?.become_password === 'ASK' &&
          isValueMissing(credentialPasswords.become_password)
        ) {
          hasError = true;
        }

        if (
          credential?.inputs?.ssh_key_unlock === 'ASK' &&
          isValueMissing(credentialPasswords.ssh_key_unlock)
        ) {
          hasError = true;
        }

        if (
          credential?.inputs?.vault_password === 'ASK' &&
          isValueMissing(
            credentialPasswords[
              `vault_password${
                credential.inputs.vault_id !== ''
                  ? `.${credential.inputs.vault_id}`
                  : ''
              }`
            ]
          )
        ) {
          hasError = true;
        }
      }
    });
  }

  return hasError;
}
