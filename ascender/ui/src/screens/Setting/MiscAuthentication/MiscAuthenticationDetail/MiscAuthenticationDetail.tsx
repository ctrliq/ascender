import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { SettingDetail } from '../../shared';
import { SESSION_KEYS } from '../keys';

/** How a session begins, how long it lasts, and what needs none. */
function MiscAuthenticationDetail() {
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
          {/* This tab's own settings, in the order its form asks for them:
              the rest of the category belongs to the three tabs beside it. */}
          {SESSION_KEYS.map((key) => {
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
                /* The idle timeout is a length of time, which a count of
                   seconds in the millions did not read as. The session
                   count's help says -1 disables it, which is to say no limit
                   rather than no sessions. */
                isDuration={key === 'SESSION_COOKIE_AGE'}
                unlimitedValue={key === 'SESSIONS_PER_USER' ? -1 : undefined}
              />
            );
          })}
        </DetailList>
      )}
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="authentication-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to="/authentication/session/edit"
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default MiscAuthenticationDetail;
