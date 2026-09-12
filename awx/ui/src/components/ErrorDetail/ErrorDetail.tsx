import type { DetailedError } from 'types/api';
import React, { useState } from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react/macro';

import {
  Card as PFCard,
  CardBody as PFCardBody,
  ExpandableSection as PFExpandable,
} from '@patternfly/react-core';
import getErrorMessage from './getErrorMessage';

const Card = styled(PFCard)`
  background-color: var(--pf-v6-global--BackgroundColor--200);
  overflow-wrap: break-word;
`;

const CardBody = styled(PFCardBody)`
  max-height: 200px;
  overflow: scroll;
`;

const Expandable = styled(PFExpandable)`
  text-align: left;
  max-width: 75vw;

  & .pf-v6-c-expandable__toggle {
    padding-left: 10px;
    margin-left: 5px;
    margin-top: 10px;
    margin-bottom: 10px;
  }
`;

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
        <CardBody>
          {response?.config?.method?.toUpperCase()} {response?.config?.url}{' '}
          <strong>{response?.status}</strong>
        </CardBody>
        <CardBody style={{ maxWidth: '70vw' }}>
          {Array.isArray(message) ? (
            <ul>
              {message.map((m) =>
                typeof m === 'string' ? <li key={m}>{m}</li> : null
              )}
            </ul>
          ) : (
            message
          )}
        </CardBody>
      </>
    );
  };

  const renderStack = () => (
    <>
      <CardBody>
        <strong>
          {(error as Error).name}: {(error as Error).message}
        </strong>
      </CardBody>
      <CardBody
        style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}
      >
        {(error as Error).stack}
      </CardBody>
    </>
  );

  return (
    <Expandable
      toggleText={t`Details`}
      onToggle={handleToggle}
      isExpanded={isExpanded}
    >
      <Card>
        {Object.prototype.hasOwnProperty.call(error, 'response')
          ? renderNetworkError()
          : renderStack()}
      </Card>
    </Expandable>
  );
}

export default ErrorDetail;
