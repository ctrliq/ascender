import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import { DetailList } from 'components/DetailList';
import RoutedTabs from 'components/RoutedTabs';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { SettingDetail } from '../../shared';

function AzureADDetail() {
  const { i18n } = useLingui();
  const { me } = useConfig();
  const { GET: options } = useSettings();

  const {
    isLoading,
    error,
    request,
    result: azure,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('azuread-oauth2');
      return data;
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
      link: `/settings/azure/details`,
      id: 0,
    },
  ];

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && error && <ContentError error={error} />}
        {!isLoading && azure && (
          <DetailList>
            {Object.keys(azure).map((key) => {
              const record = options?.[key];
              return (
                <SettingDetail
                  key={key}
                  id={key}
                  helpText={record?.help_text}
                  label={record?.label}
                  type={record?.type}
                  unit={record?.unit}
                  value={azure?.[key]}
                />
              );
            })}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="azure-detail-edit-button"
              aria-label={i18n._(msg`Edit`)}
              component={Link}
              to="/settings/azure/edit"
            >
              {i18n._(msg`Edit`)}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default AzureADDetail;
