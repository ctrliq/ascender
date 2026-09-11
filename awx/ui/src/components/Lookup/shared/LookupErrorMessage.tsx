import React from 'react';
import { useLingui } from '@lingui/react/macro';

export interface LookupErrorMessageProps {
  error: Error | null;
  [key: string]: unknown;
}

function LookupErrorMessage({ error }: LookupErrorMessageProps) {
  const { t } = useLingui();
  if (!error) {
    return null;
  }

  return (
    <div className="pf-v6-c-form__helper-text pf-m-error" aria-live="polite">
      {error.message || t`An error occurred`}
    </div>
  );
}

export default LookupErrorMessage;
