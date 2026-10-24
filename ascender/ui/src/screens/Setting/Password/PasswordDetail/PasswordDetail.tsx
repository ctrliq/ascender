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
import { PASSWORD_KEYS } from '../keys';

/** What a password for a local account has to hold, as the api reports it. */
function PasswordDetail() {
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

  return (
    <CardBody>
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && authentication && (
        <DetailList>
          {/* In the tab's own order, which is the order the form asks for
              them: the length first and then what has to be in it. */}
          {PASSWORD_KEYS.map((key) => {
            const record = options?.[key];
            return (
              <SettingDetail
                key={key}
                id={key}
                helpText={record?.help_text}
                label={record?.label}
                type={record?.type}
                unit={record?.unit}
                value={authentication?.[key]}
              />
            );
          })}
        </DetailList>
      )}
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="password-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to="/authentication/password/edit"
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default PasswordDetail;
