import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Alert as PFAlert,
  Button,
  AlertActionCloseButton,
} from '@patternfly/react-core';
import styled from 'styled-components';

const Alert = styled(PFAlert)`
  z-index: 1;
`;
export interface HealthCheckAlertProps {
  onSetHealthCheckAlert: (...args: Untyped[]) => void;
  [key: string]: unknown;
}

function HealthCheckAlert({ onSetHealthCheckAlert }: HealthCheckAlertProps) {
  const { t } = useLingui();
  return (
    <Alert
      // PatternFly 5's "default" became "custom" in 6; "info" would make it
      // blue where this alert has always been neutral.
      variant="custom"
      actionClose={
        <AlertActionCloseButton onClose={() => onSetHealthCheckAlert(false)} />
      }
      title={
        <>
          {t`Health check request(s) submitted. Please wait and reload the page.`}{' '}
          <Button
            variant="link"
            isInline
            onClick={() => window.location.reload()}
          >
            {t`Reload`}
          </Button>
        </>
      }
    />
  );
}

export default HealthCheckAlert;
