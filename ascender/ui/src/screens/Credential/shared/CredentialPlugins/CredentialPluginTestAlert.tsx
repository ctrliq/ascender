import React, { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';

import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  CodeBlock,
  CodeBlockCode,
  ExpandableSection,
} from '@patternfly/react-core';

/**
 * What a failed test answers with: the api's error for the inputs, which is
 * either a plain message or an HTTP status and a json body on the next line.
 */
export interface CredentialTestError {
  response?: { data?: { inputs?: string } & SentClaims };
}

/**
 * A credential that logs in as the job is tested with a token signed for the
 * template picked, and the api hands back the claims that went in it.
 */
interface SentClaims {
  details?: { sent_jwt_payload?: Record<string, unknown> };
}

function sentClaims(response: unknown) {
  return (response as { data?: SentClaims } | null)?.data?.details
    ?.sent_jwt_payload;
}

export interface CredentialPluginTestAlertProps {
  credentialName: React.ReactNode;
  successResponse?: unknown;
  errorResponse?: CredentialTestError | null;
  [key: string]: unknown;
}

function CredentialPluginTestAlert({
  credentialName,
  successResponse = null,
  errorResponse = null,
}: CredentialPluginTestAlertProps) {
  const { t } = useLingui();
  const [testMessage, setTestMessage] = useState<string | null>('');
  const [testVariant, setTestVariant] = useState<'danger' | 'success' | null>(
    null
  );
  const claims = sentClaims(errorResponse?.response ?? successResponse);
  useEffect(() => {
    if (errorResponse) {
      const inputsError = errorResponse?.response?.data?.inputs;
      if (inputsError) {
        if (inputsError.startsWith('HTTP')) {
          const [errorCode, errorStr] = inputsError.split('\n');
          try {
            const errorJSON = JSON.parse(errorStr ?? '') as {
              errors?: string[];
            };
            setTestMessage(
              `${errorCode}${
                errorJSON?.errors?.[0] ? `: ${errorJSON.errors[0]}` : ''
              }`
            );
          } catch {
            setTestMessage(inputsError);
          }
        } else {
          setTestMessage(inputsError);
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
              {claims && (
                <ExpandableSection
                  toggleText={t`Claims sent`}
                  id="credential-plugin-test-claims"
                >
                  <CodeBlock>
                    <CodeBlockCode>
                      {JSON.stringify(claims, null, 2)}
                    </CodeBlockCode>
                  </CodeBlock>
                </ExpandableSection>
              )}
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
