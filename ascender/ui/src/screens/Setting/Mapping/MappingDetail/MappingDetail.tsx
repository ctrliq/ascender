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
import { MAPPING_KEYS } from '../keys';

/** What a provider's answer becomes here: a user, an organization, a team. */
function MappingDetail() {
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
          {MAPPING_KEYS.map((key) => {
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
            ouiaId="mapping-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to="/authentication/mapping/edit"
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default MappingDetail;
