import React, { useEffect, useCallback } from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { InstanceGroupsAPI } from 'api';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';

import InstanceGroupDetails from './InstanceGroupDetails';
import InstanceGroupEdit from './InstanceGroupEdit';
import Instances from './Instances/Instances';

function InstanceGroup({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id } = useParams();
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchInstanceGroups,
    result: { instanceGroup },
  } = useRequest(
    useCallback(async () => {
      const { data } = await InstanceGroupsAPI.readDetail(id);

      return {
        instanceGroup: data,
      };
    }, [id]),
    { instanceGroup: null }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups, pathname]);

  useEffect(() => {
    if (instanceGroup) {
      setBreadcrumb(instanceGroup);
    }
  }, [instanceGroup, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Instance Groups`}
        </>
      ),
      link: '/instance_groups',
      id: 99,
      persistentFilterKey: 'instanceGroups',
    },
    {
      name: t`Details`,
      link: `/instance_groups/${id}/details`,
      id: 0,
    },
    {
      name: t`Instances`,
      link: `/instance_groups/${id}/instances`,
      id: 1,
    },
    {
      name: t`Jobs`,
      link: `/instance_groups/${id}/jobs`,
      id: 2,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response?.status === 404 && (
              <span>
                {t`Instance group not found.`}

                <Link to="/instance_groups">
                  {t`View all instance groups`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let cardHeader = <RoutedTabs tabsArray={tabsArray} />;

  if (['edit', 'instances/'].some((name) => pathname.includes(name))) {
    cardHeader = null;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {isLoading && <ContentLoading />}
        {!isLoading && instanceGroup && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={<InstanceGroupEdit instanceGroup={instanceGroup} />}
            />
            <Route
              path="details"
              element={<InstanceGroupDetails instanceGroup={instanceGroup} />}
            />
            {/* so the nested <Instances> route tree can match the rest */}
            <Route
              path="instances/*"
              element={
                <Instances
                  instanceGroup={instanceGroup}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
            <Route
              path="jobs"
              element={
                <JobList
                  showTypeColumn
                  defaultParams={{ instance_group: instanceGroup.id }}
                />
              }
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to="/instance_groups">
                    {t`View all instance groups`}
                  </Link>
                </ContentError>
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default InstanceGroup;
