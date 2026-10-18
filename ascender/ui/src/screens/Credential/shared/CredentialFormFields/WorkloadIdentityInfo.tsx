import type { CredentialType } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Alert, ClipboardCopy } from '@patternfly/react-core';
import { RootAPI } from 'api';
import { useFormContext } from 'components/Form';
import useRequest from 'hooks/useRequest';
import { FormFullWidthLayout } from 'components/FormLayout';
import { isWorkloadIdentityLookup } from '../workloadIdentity';

export interface WorkloadIdentityInfoProps {
  credentialType: CredentialType;
}

/**
 * What the external system has to be told for a workload identity credential
 * to work: the issuer to trust, read from the server so it is the exact string
 * the tokens carry, or why there is none yet.
 */
function WorkloadIdentityInfo({ credentialType }: WorkloadIdentityInfoProps) {
  const { t } = useLingui();
  // The command names the mount this credential logs in through
  const { values } = useFormContext<{ inputs?: Record<string, unknown> }>();
  const authPath = (values?.inputs?.default_auth_path as string) || 'jwt';
  const {
    result: issuer,
    error,
    request: fetchIssuer,
  } = useRequest(
    useCallback(async () => {
      const { data } = await RootAPI.readWorkloadIdentityConfiguration();
      return data.issuer;
    }, []),
    null
  );

  useEffect(() => {
    fetchIssuer();
  }, [fetchIssuer]);

  if (error) {
    // The documents answer 404 while the feature is off or has no issuer;
    // anything else is a failure to read them, not advice to turn it on
    const notAvailable =
      (error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <FormFullWidthLayout>
        <Alert
          isInline
          variant="warning"
          title={
            notAvailable
              ? t`Workload identity is not available`
              : t`Could not read the workload identity configuration`
          }
          ouiaId="workload-identity-unavailable"
        >
          {notAvailable
            ? t`A system administrator can turn it on in Settings, Miscellaneous System, where the Base URL of the service has to be set too.`
            : t`The issuer to trust could not be read from the server. Try again later.`}
        </Alert>
      </FormFullWidthLayout>
    );
  }

  if (!issuer) {
    return null;
  }

  return (
    <FormFullWidthLayout>
      <Alert
        isInline
        variant="info"
        title={t`Each job gets a short lived token signed for it, with no secret stored here`}
        ouiaId="workload-identity-info"
      >
        <p>{t`The system that accepts it has to trust this issuer, which is also its OIDC discovery URL:`}</p>
        <ClipboardCopy
          isReadOnly
          hoverTip={t`Copy`}
          clickTip={t`Copied`}
          id="workload-identity-issuer"
        >
          {issuer}
        </ClipboardCopy>
        {isWorkloadIdentityLookup(credentialType) ? (
          <>
            <p>{t`For HashiCorp Vault, enable the JWT auth method and point it at the issuer:`}</p>
            <ClipboardCopy
              isReadOnly
              isCode
              hoverTip={t`Copy`}
              clickTip={t`Copied`}
              id="workload-identity-vault-config"
            >
              {`vault write auth/${authPath}/config oidc_discovery_url="${issuer}" bound_issuer="${issuer}"`}
            </ClipboardCopy>
          </>
        ) : (
          <p>{t`The job finds the token in the file named by the ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE environment variable.`}</p>
        )}
      </Alert>
    </FormFullWidthLayout>
  );
}

export default WorkloadIdentityInfo;
