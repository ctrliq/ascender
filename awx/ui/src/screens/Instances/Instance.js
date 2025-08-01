import React, { useCallback, useEffect } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Switch, Route, Redirect, Link, useRouteMatch } from 'react-router-dom';
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
  const { i18n } = useLingui();
  const { me } = useConfig();
  const canReadSettings = me.is_superuser || me.is_system_auditor;

  const match = useRouteMatch();
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Instances`)}
        </>
      ),
      link: `/instances`,
      id: 99,
      persistentFilterKey: 'instances',
    },
    { name: i18n._(msg`Details`), link: `${match.url}/details`, id: 0 },
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
      name: i18n._(msg`Listener Addresses`),
      link: `${match.url}/listener_addresses`,
      id: 1,
    });
    tabsArray.push({
      name: i18n._(msg`Peers`),
      link: `${match.url}/peers`,
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
    <PageSection>
      <Card>
        <RoutedTabs tabsArray={tabsArray} />
        <Switch>
          <Redirect from="/instances/:id" to="/instances/:id/details" exact />
          <Route path="/instances/:id/details" key="details">
            <InstanceDetail isK8s={isK8s} setBreadcrumb={setBreadcrumb} />
          </Route>
          {isK8s && (
            <Route
              path="/instances/:id/listener_addresses"
              key="listener_addresses"
            >
              <InstanceListenerAddressList setBreadcrumb={setBreadcrumb} />
            </Route>
          )}
          {isK8s && (
            <Route path="/instances/:id/peers" key="peers">
              <InstancePeerList setBreadcrumb={setBreadcrumb} />
            </Route>
          )}
          <Route path="*" key="not-found">
            <ContentError isNotFound>
              {match.params.id && (
                <Link to={`/instances/${match.params.id}/details`}>
                  {i18n._(msg`View Instance Details`)}
                </Link>
              )}
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default Instance;
