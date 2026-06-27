import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Link,
  Routes,
  Route,
  Navigate,
  useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import InstanceDetail from './InstanceDetail';
import InstancePeerList from './InstancePeers';
import InstanceListenerAddressList from './InstanceListenerAddressList';

function Instance({ setBreadcrumb }) {
  const { t } = useLingui();
  const { me } = useConfig();
  const canReadSettings = me.is_superuser || me.is_system_auditor;

  const { id } = useParams();
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Instances`}
        </>
      ),
      link: `/instances`,
      id: 99,
      persistentFilterKey: 'instances',
    },
    { name: t`Details`, link: `/instances/${id}/details`, id: 0 },
  ];

  const {
    result: isK8s,
    error,
    isLoading,
    request,
  } = useRequest(
    useCallback(async () => {
      if (!canReadSettings) {
        return false;
      }
      const { data } = await SettingsAPI.readCategory('system');
      return data?.IS_K8S ?? false;
    }, [canReadSettings]),
    { isK8s: false, isLoading: true }
  );

  useEffect(() => {
    request();
  }, [request]);

  if (isK8s) {
    tabsArray.push({
      name: t`Listener Addresses`,
      link: `/instances/${id}/listener_addresses`,
      id: 1,
    });
    tabsArray.push({
      name: t`Peers`,
      link: `/instances/${id}/peers`,
      id: 2,
    });
  }
  if (isLoading) {
    return <ContentLoading />;
  }

  if (error) {
    return <ContentError />;
  }
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <RoutedTabs tabsArray={tabsArray} />
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          <Route
            path="details"
            element={
              <InstanceDetail isK8s={isK8s} setBreadcrumb={setBreadcrumb} />
            }
          />
          {isK8s && (
            <Route
              path="listener_addresses"
              element={
                <InstanceListenerAddressList setBreadcrumb={setBreadcrumb} />
              }
            />
          )}
          {isK8s && (
            <Route
              path="peers"
              element={<InstancePeerList setBreadcrumb={setBreadcrumb} />}
            />
          )}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                {id && (
                  <Link to={`/instances/${id}/details`}>
                    {t`View Instance Details`}
                  </Link>
                )}
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Instance;
