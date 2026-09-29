//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import type { SettingConfig } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import ResourceTabs from 'components/ResourceTabs';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingDetail } from '../../shared';
import { pluck, sortNestedDetails } from '../../shared/settingUtils';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function MiscSystemDetail() {
  const { t, i18n } = useLingui();
  const { me } = useConfig();
  const { GET: options = {} } = useSettings();
  const { pathname } = useLocation();
  // The address says which group is open, so a link into one lands on it and
  // the back button walks the tabs as it walks every other tab bar.
  const activeGroup = groupFromPath(GROUPS, pathname).id;

  const {
    isLoading,
    error,
    request,
    result: system,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('system');
      if (data.DEFAULT_EXECUTION_ENVIRONMENT) {
        const {
          data: { name },
        } = await ExecutionEnvironmentsAPI.readDetail(
          data.DEFAULT_EXECUTION_ENVIRONMENT as number
        );
        data.DEFAULT_EXECUTION_ENVIRONMENT = name;
      }
      const systemData = pluck(
        data,
        'ACTIVITY_STREAM_ENABLED',
        'ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC',
        'MANAGE_ORGANIZATION_AUTH',
        'ORG_ADMINS_CAN_SEE_ALL_USERS',
        'ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS',
        'INSTALL_UUID',
        'REMOTE_HOST_HEADERS',
        'ASCENDER_URL_BASE',
        'DEFAULT_EXECUTION_ENVIRONMENT',
        'PROXY_IP_ALLOWED_LIST',
        'CSRF_TRUSTED_ORIGINS'
      );

      // Each setting is copied before the value is put on it: options is the
      // OPTIONS block every settings screen shares, and writing onto it left
      // one screen's values on the next screen's fields.
      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(systemData).forEach((key) => {
        mergedData[key] = {
          ...options[key],
          value: systemData[key],
        };
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
        aria-label={t`System tabs`}
        ouiaId="system-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/system/${id}`,
        }))}
      />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && system && (
          <DetailList>
            {/* In the tab's own order rather than the sorted one the request
                returns, so each group reads as the edit form asks for it. */}
            {(GROUPS.find(({ id }) => id === activeGroup)?.keys ?? [])
              .map(
                (key) =>
                  [key, system.find(([id]) => id === key)?.[1]] as [
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
                  value={detail?.value}
                />
              ))}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="system-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`/system/edit/${activeGroup}`}
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default MiscSystemDetail;
