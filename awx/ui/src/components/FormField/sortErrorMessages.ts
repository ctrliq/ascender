/**
 * Splits an API validation error into the form's own message and each field's.
 *
 * Args:
 *   error: whatever the request threw, with the response attached.
 *   formValues: the form's current values, which say which keys are fields.
 *
 * Returns:
 *   The message for the form as a whole, and one per field that has one.
 */
export default function sortErrorMessages(
  error?: { message?: string; response?: { data?: unknown } },
  formValues: Record<string, unknown> = {}
) {
  if (!error) {
    return {};
  }

  if (
    error?.response?.data &&
    typeof error.response.data === 'object' &&
    Object.keys(error.response.data).length > 0
  ) {
    const parsed = parseFieldErrors(
      error.response.data as Record<string, unknown>,
      formValues
    );
    return {
      formError: parsed.formErrors.join('; '),
      fieldErrors: Object.keys(parsed.fieldErrors).length
        ? parsed.fieldErrors
        : null,
    };
  }
  /* eslint-disable-next-line no-console */
  console.error(error);
  return {
    formError: error.message,
    fieldErrors: null,
  };
}

// Recursively traverse field errors object and build up field/form errors
function parseFieldErrors(
  obj: Record<string, unknown>,
  formValues: Record<string, unknown>
) {
  let fieldErrors: Record<string, unknown> = {};
  let formErrors: string[] = [];
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (typeof value === 'string') {
      if (typeof formValues[key] === 'undefined') {
        formErrors.push(value);
      } else {
        fieldErrors[key] = value;
      }
    } else if (Array.isArray(value)) {
      if (typeof formValues[key] === 'undefined') {
        formErrors = formErrors.concat(value);
      } else {
        fieldErrors[key] = value.join('; ');
      }
    } else if (value && typeof value === 'object') {
      const parsed = parseFieldErrors(
        value as Record<string, unknown>,
        (formValues[key] as Record<string, unknown>) || {}
      );
      if (Object.keys(parsed.fieldErrors).length) {
        fieldErrors = {
          ...fieldErrors,
          [key]: parsed.fieldErrors,
        };
      }
      formErrors = formErrors.concat(parsed.formErrors);
    }
    if (typeof formValues[key] === 'boolean') {
      formErrors = formErrors.concat(value as string | string[]);
    }
  });

  return { fieldErrors, formErrors };
}
