import type { SettingConfig } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import ResourceTabs from 'components/ResourceTabs';
import { sortNestedDetails } from '../../shared/settingUtils';
import { SettingDetail } from '../../shared';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function TroubleshootingDetail() {
  const { t, i18n } = useLingui();
  const { me } = useConfig();
  const { pathname } = useLocation();
  // The address says which group is open, so a link into one lands on it and
  // the back button walks the tabs as it walks every other tab bar.
  const group = groupFromPath(GROUPS, pathname);
  const { GET: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request,
    result: debug,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('debug');

      const { ...debugData } = data;

      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(debugData).forEach((key) => {
        mergedData[key] = { ...options[key], value: debugData[key] };
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
      {/* A bar holding one tab names nothing the title does not, so it
          stays away until there is a second group to choose between. The
          group keeps its address either way. */}
      {GROUPS.length > 1 && (
        <ResourceTabs
          aria-label={t`Troubleshooting tabs`}
          ouiaId="troubleshooting-tabs"
          tabs={GROUPS.map(({ id, label }) => ({
            label: i18n._(label),
            path: `/troubleshooting/${id}`,
          }))}
        />
      )}
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && debug && (
          <DetailList>
            {/* In the tab's own order rather than the sorted one the request
                returns, so each group reads as the edit form asks for it. */}
            {group.keys
              .map(
                (key) => [key, debug.find(([id]) => id === key)?.[1]] as const
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
                  value={detail?.value}
                />
              ))}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="troubleshooting-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`/troubleshooting/edit/${group.id}`}
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default TroubleshootingDetail;
