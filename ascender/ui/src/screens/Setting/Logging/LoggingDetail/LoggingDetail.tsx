import type { SettingConfig } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import ResourceTabs from 'components/ResourceTabs';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingDetail } from '../../shared';
import { sortNestedDetails, pluck } from '../../shared/settingUtils';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function LoggingDetail() {
  // The address says which group is open, so a link into one lands on it, the
  // edit form sends a reader back to the tab they edited, and the back button
  // walks the tabs as it walks every other tab bar.
  const { pathname } = useLocation();
  const activeGroup = groupFromPath(GROUPS, pathname).id;
  const { me } = useConfig();
  const { GET: options = {} } = useSettings();
  const { t, i18n } = useLingui();
  const {
    isLoading,
    error,
    request,
    result: logging,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('logging');

      const loggingData = pluck(
        data,
        'LOG_AGGREGATOR_ENABLED',
        'LOG_AGGREGATOR_HOST',
        'LOG_AGGREGATOR_INDIVIDUAL_FACTS',
        'LOG_AGGREGATOR_LEVEL',
        'LOG_AGGREGATOR_LOGGERS',
        'LOG_AGGREGATOR_PASSWORD',
        'LOG_AGGREGATOR_PORT',
        'LOG_AGGREGATOR_PROTOCOL',
        'LOG_AGGREGATOR_TCP_TIMEOUT',
        'LOG_AGGREGATOR_TYPE',
        'LOG_AGGREGATOR_USERNAME',
        'LOG_AGGREGATOR_VERIFY_CERT',
        'API_400_ERROR_LOG_FORMAT'
      );

      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(loggingData).forEach((key) => {
        mergedData[key] = { ...options[key], value: loggingData[key] };
      });

      return sortNestedDetails(mergedData);
    }, [options]),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  return (
    <>
      <ResourceTabs
        aria-label={t`Logging tabs`}
        ouiaId="logging-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/logging/${id}`,
        }))}
      />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && logging && (
          <DetailList>
            {/* In the tab's own order rather than the sorted one the request
                returns, so a reader meets the username before the password and
                the rest in the order the edit form asks for them. */}
            {(GROUPS.find(({ id }) => id === activeGroup)?.keys ?? [])
              .map(
                (key) =>
                  [key, logging.find(([id]) => id === key)?.[1]] as [
                    string,
                    SettingConfig | undefined,
                  ]
              )
              .filter(([, detail]) => Boolean(detail))
              .map(([key, detail]) => (
                <SettingDetail
                  key={key}
                  id={key}
                  helpText={detail?.help_text}
                  label={detail?.label}
                  type={detail?.type}
                  unit={detail?.unit}
                  // A choice reads as its label, HTTPS/HTTP rather than https.
                  choices={detail?.choices as [string, string][] | undefined}
                  value={detail?.value}
                />
              ))}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="logging-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`/logging/edit/${activeGroup}`}
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default LoggingDetail;
