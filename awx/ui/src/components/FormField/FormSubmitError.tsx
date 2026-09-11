import React, { useState, useEffect } from 'react';
import { useFormikContext } from 'formik';
import { Alert } from '@patternfly/react-core';
import { FormFullWidthLayout } from '../FormLayout';
import sortErrorMessages from './sortErrorMessages';

export interface FormSubmitErrorProps {
  error: Error | null;
  [key: string]: unknown;
}

function FormSubmitError({ error }: FormSubmitErrorProps) {
  const [errorMessage, setErrorMessage] = useState<string | string[] | null>(
    null
  );
  const { values, setErrors } = useFormikContext();

  useEffect(() => {
    const { formError, fieldErrors } = sortErrorMessages(error, values);
    if (formError) {
      setErrorMessage(formError);
    }
    if (fieldErrors) {
      setErrors(fieldErrors);
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
            ? errorMessage.map((msg: unknown) => <div key={msg}>{msg}</div>)
            : errorMessage
        }
      />
    </FormFullWidthLayout>
  );
}

export default FormSubmitError;
