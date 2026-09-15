import type { DetailedError } from 'types/api';
import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';

import {
  Card as PFCard,
  CardBody as PFCardBody,
  ExpandableSection as PFExpandable,
} from '@patternfly/react-core';
import getErrorMessage from './getErrorMessage';
import './ErrorDetail.css';

function ErrorDetail({ error = null }: { error?: unknown }) {
  const { t } = useLingui();
  const [isExpanded, setIsExpanded] = useState(false);

  // The guard has to come before the dereference. It used to sit after
  // `const { response } = error`, so rendering this with its own default of
  // null threw instead of returning nothing.
  if (!error) {
    return null;
  }
  // A caught value is unknown in TypeScript, which is what every caller passes
  // here, so the shape is asserted once rather than at each of them.
  const { response } = error as DetailedError;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const renderNetworkError = () => {
    const message = getErrorMessage(response);

    return (
      <>
        <PFCardBody className="ascender-error-detail__card-body">
          {response?.config?.method?.toUpperCase()} {response?.config?.url}{' '}
          <strong>{response?.status}</strong>
        </PFCardBody>
        <PFCardBody
          className="ascender-error-detail__card-body"
          style={{ maxWidth: '70vw' }}
        >
          {Array.isArray(message) ? (
            <ul>
              {message.map((m) =>
                typeof m === 'string' ? <li key={m}>{m}</li> : null
              )}
            </ul>
          ) : (
            message
          )}
        </PFCardBody>
      </>
    );
  };

  const renderStack = () => (
    <>
      <PFCardBody className="ascender-error-detail__card-body">
        <strong>
          {(error as Error).name}: {(error as Error).message}
        </strong>
      </PFCardBody>
      <PFCardBody
        className="ascender-error-detail__card-body"
        style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}
      >
        {(error as Error).stack}
      </PFCardBody>
    </>
  );

  return (
    <PFExpandable
      className="ascender-error-detail__expandable"
      toggleText={t`Details`}
      onToggle={handleToggle}
      isExpanded={isExpanded}
    >
      <PFCard className="ascender-error-detail__card">
        {Object.prototype.hasOwnProperty.call(error, 'response')
          ? renderNetworkError()
          : renderStack()}
      </PFCard>
    </PFExpandable>
  );
}

export default ErrorDetail;
