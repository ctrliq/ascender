import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

function LookupErrorMessage({ error }) {
  const { i18n } = useLingui();
  if (!error) {
    return null;
  }

  return (
    <div className="pf-c-form__helper-text pf-m-error" aria-live="polite">
      {error.message || i18n._(msg`An error occurred`)}
    </div>
  );
}

export default LookupErrorMessage;
