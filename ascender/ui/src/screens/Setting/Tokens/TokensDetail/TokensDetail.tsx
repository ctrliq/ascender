import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { SettingDetail } from '../../shared';

/** How long an OAuth 2 token lasts, and who may ask for one. */
function TokensDetail() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request,
    result: authentication,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('authentication');
      return data;
    }, []),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  /*
   * The three expirations arrive inside one object the api labels OAuth 2
   * Timeout Settings, which a detail would draw as a block of json. They are
   * three numbers, so they are read as three numbers: the names are this
   * screen's own, the same ones its form asks by.
   */
  const timeouts = (authentication?.OAUTH2_PROVIDER ?? {}) as Record<
    string,
    number
  >;
  const expirations = [
    {
      id: 'ACCESS_TOKEN_EXPIRE_SECONDS',
      label: t`Access Token Expiration`,
    },
    {
      id: 'REFRESH_TOKEN_EXPIRE_SECONDS',
      label: t`Refresh Token Expiration`,
    },
    {
      id: 'AUTHORIZATION_CODE_EXPIRE_SECONDS',
      label: t`Authorization Code Expiration`,
    },
  ];
  const external = options?.ALLOW_OAUTH2_FOR_EXTERNAL_USERS;

  return (
    <CardBody>
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && authentication && (
        <DetailList>
          {expirations.map(({ id, label }) => (
            <SettingDetail
              key={id}
              id={id}
              helpText={options?.OAUTH2_PROVIDER?.help_text}
              label={label}
              type="integer"
              isDuration
              value={timeouts[id]}
            />
          ))}
          <SettingDetail
            id="ALLOW_OAUTH2_FOR_EXTERNAL_USERS"
            helpText={external?.help_text}
            label={external?.label}
            type={external?.type}
            unit={external?.unit}
            value={authentication?.ALLOW_OAUTH2_FOR_EXTERNAL_USERS}
          />
        </DetailList>
      )}
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="tokens-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to="/authentication/tokens/edit"
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default TokensDetail;
