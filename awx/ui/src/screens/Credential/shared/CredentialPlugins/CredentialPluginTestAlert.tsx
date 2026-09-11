import type { Untyped } from 'types/api';
import React, { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';

import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
} from '@patternfly/react-core';

export interface CredentialPluginTestAlertProps {
  credentialName: Untyped;
  successResponse?: Untyped;
  errorResponse?: Untyped;
  [key: string]: unknown;
}

function CredentialPluginTestAlert({
  credentialName,
  successResponse = null,
  errorResponse = null,
}: CredentialPluginTestAlertProps) {
  const { t } = useLingui();
  const [testMessage, setTestMessage] = useState<Untyped>('');
  const [testVariant, setTestVariant] = useState<Untyped>(false);
  useEffect(() => {
    if (errorResponse) {
      if (errorResponse?.response?.data?.inputs) {
        if (errorResponse.response.data.inputs.startsWith('HTTP')) {
          const [errorCode, errorStr] =
            errorResponse.response.data.inputs.split('\n');
          try {
            const errorJSON = JSON.parse(errorStr);
            setTestMessage(
              `${errorCode}${
                errorJSON?.errors[0] ? `: ${errorJSON.errors[0]}` : ''
              }`
            );
          } catch {
            setTestMessage(errorResponse.response.data.inputs);
          }
        } else {
          setTestMessage(errorResponse.response.data.inputs);
        }
      } else {
        setTestMessage(
          t`Something went wrong with the request to test this credential and metadata.`
        );
      }
      setTestVariant('danger');
    } else if (successResponse) {
      setTestMessage(t`Test passed`);
      setTestVariant('success');
    }
  }, [successResponse, errorResponse, t]);

  return (
    <AlertGroup isToast>
      {testMessage && testVariant && (
        <Alert
          actionClose={
            <AlertActionCloseButton
              onClose={() => {
                setTestMessage(null);
                setTestVariant(null);
              }}
            />
          }
          title={
            <>
              <b id="credential-plugin-test-name">{credentialName}</b>
              <p id="credential-plugin-test-message">{testMessage}</p>
            </>
          }
          variant={testVariant}
          ouiaId="credential-plugin-test-alert"
        />
      )}
    </AlertGroup>
  );
}

export default CredentialPluginTestAlert;
