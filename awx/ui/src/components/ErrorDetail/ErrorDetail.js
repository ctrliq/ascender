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

function ErrorDetail({ error = null }) {
  const { t } = useLingui();
  const { response } = error;
  const [isExpanded, setIsExpanded] = useState(false);

  if (!error) {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const renderNetworkError = () => {
    const message = getErrorMessage(response);

    return (
      <>
        <CardBody>
          {response?.config?.method.toUpperCase()} {response?.config?.url}{' '}
          <strong>{response?.status}</strong>
        </CardBody>
        <CardBody css="max-width: 70vw">
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
          {error.name}: {error.message}
        </strong>
      </CardBody>
      <CardBody style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}>
        {error.stack}
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
