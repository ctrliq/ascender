import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { pluck } from '../../shared/settingUtils';
import { SettingDetail } from '../../shared';

function UIDetail() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: options } = useSettings();
  const { state: locationState } = useLocation();
  const hardReload = locationState?.hardReload;

  useEffect(() => {
    if (hardReload) {
      // Clear the hardReload flag from history state before reloading so that
      // the post-reload render doesn't see it again and trigger the reload
      // over and over (infinite loop).
      window.history.replaceState(null, '');
      window.location.reload();
    }
  }, [hardReload]);

  const {
    isLoading,
    error,
    request,
    result: ui,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('ui');

      const uiData = pluck(
        data,
        'PENDO_TRACKING_STATE',
        'CUSTOM_LOGIN_INFO',
        'CUSTOM_TITLE',
        'CUSTOM_LOGO',
        'CUSTOM_HEADER_LOGO',
      );

      return uiData;
    }, []),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Settings`}
        </>
      ),
      link: `/settings`,
      id: 99,
    },
    {
      name: t`Details`,
      link: `/settings/ui/details`,
      id: 0,
    },
  ];

  // Change CUSTOM_LOGO / CUSTOM_HEADER_LOGO type from string to image
  // to help SettingDetail render it as an <img>
  if (options?.CUSTOM_LOGO) {
    options.CUSTOM_LOGO.type = 'image';
  }
  if (options?.CUSTOM_HEADER_LOGO) {
    options.CUSTOM_HEADER_LOGO.type = 'image';
  }

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && error && <ContentError error={error} />}
        {!isLoading && ui && (
          <DetailList>
            {Object.keys(ui).map((key) => {
              const record = options?.[key];
              return (
                <SettingDetail
                  key={key}
                  id={key}
                  helpText={record?.help_text}
                  label={record?.label}
                  type={record?.type}
                  unit={record?.unit}
                  value={ui?.[key]}
                />
              );
            })}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              aria-label={t`Edit`}
              component={Link}
              to="/settings/ui/edit"
              ouiaId="ui-detail-edit-button"
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default UIDetail;
