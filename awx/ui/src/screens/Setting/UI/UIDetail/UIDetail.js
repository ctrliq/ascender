import React, { useEffect, useCallback } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
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
  const { i18n } = useLingui();
  const { me } = useConfig();
  const { GET: options } = useSettings();
  const history = useHistory();
  const { hardReload } = useLocation();

  if (hardReload) {
    history.go();
  }

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
        'ASCENDER_DISABLE_GRADIENT',
        'CUSTOM_LOGO',
        'CUSTOM_LOGO_MENU'
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
          {i18n._(msg`Back to Settings`)}
        </>
      ),
      link: `/settings`,
      id: 99,
    },
    {
      name: i18n._(msg`Details`),
      link: `/settings/ui/details`,
      id: 0,
    },
  ];

  // Change CUSTOM_LOGO type from string to image
  // to help SettingDetail render it as an <img>
  if (options?.CUSTOM_LOGO) {
    options.CUSTOM_LOGO.type = 'image';
  }

  if (options?.CUSTOM_LOGO_MENU) {
    options.CUSTOM_LOGO_MENU.type = 'image';
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
              aria-label={i18n._(msg`Edit`)}
              component={Link}
              to="/settings/ui/edit"
              ouiaId="ui-detail-edit-button"
            >
              {i18n._(msg`Edit`)}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default UIDetail;
