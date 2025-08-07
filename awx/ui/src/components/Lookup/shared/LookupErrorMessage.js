import React from 'react';
import { useLingui } from '@lingui/react/macro';

function LookupErrorMessage({ error }) {
  const { t } = useLingui();
  if (!error) {
    return null;
  }

  return (
    <div className="pf-c-form__helper-text pf-m-error" aria-live="polite">
      {error.message || t`An error occurred`}
    </div>
  );
}

export default LookupErrorMessage;
