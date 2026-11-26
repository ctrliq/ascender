import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingDetail } from '../../shared';

function SAMLDetail() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: allOptions = {} } = useSettings();
  // The certificate is declared as a plain string, which would render it as
  // one long line; the detail draws it as a certificate instead. Overridden on
  // a copy, since the options block is shared with every other settings screen.
  const options: typeof allOptions = {
    ...allOptions,
    SOCIAL_AUTH_SAML_SP_PUBLIC_CERT: {
      ...allOptions.SOCIAL_AUTH_SAML_SP_PUBLIC_CERT,
      type: 'certificate',
    },
  };

  const {
    isLoading,
    error,
    request,
    result: saml,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('saml');
      return data;
    }, []),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  return (
    <CardBody>
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && saml && (
        <DetailList>
          {Object.keys(saml).map((key) => {
            const record = options?.[key];
            return (
              <SettingDetail
                key={key}
                id={key}
                helpText={record?.help_text}
                label={record?.label}
                type={record?.type}
                unit={record?.unit}
                value={saml?.[key]}
              />
            );
          })}
        </DetailList>
      )}
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="saml-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to="/authentication/saml/edit"
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default SAMLDetail;
