import React, { useEffect, useCallback } from 'react';
import { Link, Redirect, useRouteMatch } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
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
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: options } = useSettings();

  const baseURL = '/settings/azure';
  const {
    path,
    params: { category },
  } = useRouteMatch(`${baseURL}/:category/details`);

  const {
    isLoading,
    error,
    request,
    result: azureDetails,
  } = useRequest(
    useCallback(async () => {
      const [{ data: azureDefault }, { data: azureTenant }] =
        await Promise.all([
          SettingsAPI.readCategory('azuread-oauth2'),
          SettingsAPI.readCategory('azuread-oauth2-tenant'),
        ]);
      return {
        default: azureDefault,
        tenant: azureTenant,
      };
    }, []),
    {
      default: null,
      tenant: null,
    }
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
      name: t`Azure AD Default`,
      link: `${baseURL}/default/details`,
      id: 0,
    },
    {
      name: t`Azure AD Tenant`,
      link: `${baseURL}/tenant/details`,
      id: 1,
    },
  ];

  if (!Object.keys(azureDetails).includes(category)) {
    return <Redirect from={path} to={`${baseURL}/default/details`} exact />;
  }

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && error && <ContentError error={error} />}
        {!isLoading && !Object.values(azureDetails)?.includes(null) && (
          <DetailList>
            {Object.keys(azureDetails[category]).map((key) => {
              const record = options?.[key];
              return (
                <SettingDetail
                  key={key}
                  id={key}
                  helpText={record?.help_text}
                  label={record?.label}
                  type={record?.type}
                  unit={record?.unit}
                  value={azureDetails[category][key]}
                />
              );
            })}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="azure-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`${baseURL}/${category}/edit`}
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default AzureADDetail;
