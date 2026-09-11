import React from 'react';
import { useLingui } from '@lingui/react/macro';

export interface LookupErrorMessageProps {
  /** Whatever the lookup's request caught, which is unknown to TypeScript. */
  error?: unknown;
  [key: string]: unknown;
}

function LookupErrorMessage({ error }: LookupErrorMessageProps) {
  const { t } = useLingui();
  if (!error) {
    return null;
  }

  return (
    <div className="pf-v6-c-form__helper-text pf-m-error" aria-live="polite">
      {(error as Error).message || t`An error occurred`}
    </div>
  );
}

export default LookupErrorMessage;
