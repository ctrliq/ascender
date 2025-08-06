import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Alert as PFAlert,
  Button,
  AlertActionCloseButton,
} from '@patternfly/react-core';
import styled from 'styled-components';

const Alert = styled(PFAlert)`
  z-index: 1;
`;
function HealthCheckAlert({ onSetHealthCheckAlert }) {
  const { i18n } = useLingui();
  return (
    <Alert
      variant="default"
      actionClose={
        <AlertActionCloseButton onClose={() => onSetHealthCheckAlert(false)} />
      }
      title={
        <>
          {i18n._(
            t`Health check request(s) submitted. Please wait and reload the page.`
          )}{' '}
          <Button
            variant="link"
            isInline
            onClick={() => window.location.reload()}
          >
            {i18n._(t`Reload`)}
          </Button>
        </>
      }
    />
  );
}

export default HealthCheckAlert;
