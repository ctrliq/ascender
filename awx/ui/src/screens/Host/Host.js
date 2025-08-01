import React, { useCallback, useEffect } from 'react';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import {
  Switch,
  Route,
  Redirect,
  Link,
  useRouteMatch,
  useLocation,
} from 'react-router-dom';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';
import { HostsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import HostFacts from './HostFacts';
import HostDetail from './HostDetail';
import HostEdit from './HostEdit';
import HostGroups from './HostGroups';

function Host({ setBreadcrumb }) {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch('/hosts/:id');
  const {
    error,
    isLoading,
    result: host,
    request: fetchHost,
  } = useRequest(
    useCallback(async () => {
      const { data } = await HostsAPI.readDetail(match.params.id);
      setBreadcrumb(data);
      return data;
    }, [match.params.id, setBreadcrumb])
  );

  useEffect(() => {
    fetchHost();
  }, [fetchHost, location.pathname]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Hosts`)}
        </>
      ),
      link: `/hosts`,
      id: 99,
      persistentFilterKey: 'hosts',
    },
    {
      name: i18n._(msg`Details`),
      link: `${match.url}/details`,
      id: 0,
    },
    {
      name: i18n._(msg`Facts`),
      link: `${match.url}/facts`,
      id: 1,
    },
    {
      name: i18n._(msg`Groups`),
      link: `${match.url}/groups`,
      id: 2,
    },
    {
      name: i18n._(msg`Jobs`),
      link: `${match.url}/jobs`,
      id: 3,
    },
  ];

  if (isLoading) {
    return (
      <PageSection>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection>
        <Card>
          <ContentError error={error}>
            {error?.response?.status === 404 && (
              <span>
                {i18n._(msg`Host not found.`)}{' '}
                <Link to="/hosts">{i18n._(msg`View all Hosts.`)}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let showCardHeader = true;

  if (location.pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  return (
    <PageSection>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Switch>
          <Redirect from="/hosts/:id" to="/hosts/:id/details" exact />
          {host && [
            <Route path="/hosts/:id/details" key="details">
              <HostDetail host={host} />
            </Route>,
            <Route path="/hosts/:id/edit" key="edit">
              <HostEdit host={host} />
            </Route>,
            <Route key="facts" path="/hosts/:id/facts">
              <HostFacts host={host} />
            </Route>,
            <Route path="/hosts/:id/groups" key="groups">
              <HostGroups host={host} />
            </Route>,
            <Route path="/hosts/:id/jobs" key="jobs">
              <JobList defaultParams={{ job__hosts: host.id }} />
            </Route>,
          ]}
          <Route key="not-found" path="*">
            <ContentError isNotFound>
              <Link to={`${match.url}/details`}>
                {i18n._(msg`View Host Details`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default Host;
export { Host as _Host };
