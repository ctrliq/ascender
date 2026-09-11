import type { Untyped } from 'types/api';
import { useEffect, useState } from 'react';
import { useFormikContext } from 'formik';
import useCredentialPasswordsStep from './useAdHocCredentialPasswordStep';
import useAdHocDetailsStep from './useAdHocDetailsStep';
import useAdHocExecutionEnvironmentStep from './useAdHocExecutionEnvironmentStep';
import useAdHocCredentialStep from './useAdHocCredentialStep';
import useAdHocPreviewStep from './useAdHocPreviewStep';
import type { AdHocValues } from './types';

function showCredentialPasswordsStep(credential: Untyped) {
  if (!credential?.inputs) {
    return false;
  }
  const { inputs } = credential;
  if (
    inputs?.password === 'ASK' ||
    inputs?.become_password === 'ASK' ||
    inputs?.ssh_key_unlock === 'ASK'
  ) {
    return true;
  }

  return false;
}

export default function useAdHocLaunchSteps(
  moduleOptions: unknown,
  organizationId: number | string | null,
  credentialTypeId: number | string | null
) {
  const { values, resetForm, touched } = useFormikContext<AdHocValues>();

  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const steps = [
    useAdHocDetailsStep(visited, moduleOptions as [string, string][]),
    useAdHocExecutionEnvironmentStep(organizationId),
    useAdHocCredentialStep(visited, credentialTypeId),
    useCredentialPasswordsStep(
      showCredentialPasswordsStep(values.credentials[0]),
      visited
    ),
  ];

  useEffect(() => {
    const newFormValues: AdHocValues = { ...values };

    const inputs = values.credentials[0]?.inputs as
      Record<string, unknown> | undefined;
    if (!inputs) {
      return;
    }
    // `(a || b || c) === 'ASK'` compares only the first truthy of the three:
    // a credential whose password is stored but whose become_password prompts
    // does not reset the object here, so the previous credential's entries
    // survive into the launch. Left as it is rather than changed blind, since
    // this decides which passwords get posted.
    if (
      (inputs.password || inputs.become_password || inputs.ssh_key_unlock) ===
      'ASK'
    )
      newFormValues.credential_passwords = {};
    const passwords = newFormValues.credential_passwords as Record<
      string,
      string
    >;
    Object.keys(inputs).forEach((inputKey) => {
      if (inputKey === 'become_password' || inputKey === 'ssh_key_unlock') {
        passwords[inputKey] = '';
      }
      if (inputKey === 'password') {
        passwords.ssh_password = '';
      }
    });
    resetForm({
      values: newFormValues,
      touched,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.credentials.length]);

  const hasErrors = steps.some((step) => step.hasError);

  steps.push(useAdHocPreviewStep(hasErrors));
  return {
    steps: steps.map((s) => s.step).filter((s) => s != null),
    validateStep: (stepId: string) =>
      steps.find((s) => s?.step?.id === stepId)?.validate(),
    visitStep: (
      prevStepId: string,
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setVisited({
        ...visited,
        [prevStepId]: true,
      });
      steps
        .find((s) => s?.step?.id === prevStepId)
        ?.setTouched(setFieldTouched);
    },
    visitAllSteps: (
      setFieldTouched: (
        field: string,
        touched?: boolean,
        shouldValidate?: boolean
      ) => void
    ) => {
      setVisited({
        details: true,
        executionEnvironment: true,
        credentials: true,
        credentialPasswords: true,
        preview: true,
      });
      steps.forEach((s) => s.setTouched(setFieldTouched));
    },
  };
}
