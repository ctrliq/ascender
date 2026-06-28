import React, { useCallback, useEffect } from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
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
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams();
  const {
    error,
    isLoading,
    result: host,
    request: fetchHost,
  } = useRequest(
    useCallback(async () => {
      const { data } = await HostsAPI.readDetail(id);
      setBreadcrumb(data);
      return data;
    }, [id, setBreadcrumb])
  );

  useEffect(() => {
    fetchHost();
  }, [fetchHost, location.pathname]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Hosts`}
        </>
      ),
      link: `/hosts`,
      id: 99,
      persistentFilterKey: 'hosts',
    },
    {
      name: t`Details`,
      link: `/hosts/${id}/details`,
      id: 0,
    },
    {
      name: t`Facts`,
      link: `/hosts/${id}/facts`,
      id: 1,
    },
    {
      name: t`Groups`,
      link: `/hosts/${id}/groups`,
      id: 2,
    },
    {
      name: t`Jobs`,
      link: `/hosts/${id}/jobs`,
      id: 3,
    },
  ];

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {error?.response?.status === 404 && (
              <span>
                {t`Host not found.`}{' '}
                <Link to="/hosts">{t`View all Hosts.`}</Link>
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
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {host && (
            <Route path="details" element={<HostDetail host={host} />} />
          )}
          {host && <Route path="edit" element={<HostEdit host={host} />} />}
          {host && (
            <Route path="facts" element={<HostFacts host={host} />} />
          )}
          {/* /* so the nested <HostGroups> route tree can match the rest */}
          {host && (
            <Route path="groups/*" element={<HostGroups host={host} />} />
          )}
          {host && (
            <Route
              path="jobs"
              element={<JobList defaultParams={{ job__hosts: host.id }} />}
            />
          )}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`/hosts/${id}/details`}>
                  {t`View Host Details`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Host;
export { Host as _Host };
