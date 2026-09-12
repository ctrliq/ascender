import React, { useState, useEffect } from 'react';
import { useFormikContext } from 'formik';
import { Alert } from '@patternfly/react-core';
import type { FormikErrors } from 'formik';
import { FormFullWidthLayout } from '../FormLayout';
import sortErrorMessages from './sortErrorMessages';

export interface FormSubmitErrorProps {
  /** Whatever the submit caught, which is unknown to TypeScript. */
  error?: unknown;
  [key: string]: unknown;
}

function FormSubmitError({ error }: FormSubmitErrorProps) {
  const [errorMessage, setErrorMessage] = useState<string | string[] | null>(
    null
  );
  const { values, setErrors } = useFormikContext<Record<string, unknown>>();

  useEffect(() => {
    const { formError, fieldErrors } = sortErrorMessages(
      error as Parameters<typeof sortErrorMessages>[0],
      values
    );
    if (formError) {
      setErrorMessage(formError);
    }
    if (fieldErrors) {
      setErrors(fieldErrors as FormikErrors<Record<string, unknown>>);
    }
  }, [error, setErrors, values]);

  if (!errorMessage) {
    return null;
  }

  return (
    <FormFullWidthLayout>
      <Alert
        variant="danger"
        isInline
        ouiaId="form-submit-error-alert"
        title={
          Array.isArray(errorMessage)
            ? errorMessage.map((msg: string) => <div key={msg}>{msg}</div>)
            : errorMessage
        }
      />
    </FormFullWidthLayout>
  );
}

export default FormSubmitError;
