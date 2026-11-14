import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';

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
import { useQueueNames } from './shared/queueNames';

export interface InstanceGroupProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function InstanceGroup({ setBreadcrumb }: InstanceGroupProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();
  // Read once for the screen rather than with the group, which is read again
  // on every tab: the names are the install's and do not change between tabs.
  const queueNames = useQueueNames();

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
      name: t`Runs`,
      link: `/instance_groups/${id}/runs`,
      id: 2,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError).response?.status === 404 && (
              <span>
                {t`Instance group not found.`}{' '}
                <Link to="/instance_groups">{t`View all instance groups`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  /*
   * A container group reached at an instance group address: a link built from
   * the type alone, a role or an old bookmark, cannot tell the two apart, and
   * the instance groups list no longer holds container groups. Send it to the
   * container group screen, keeping the tab where that screen has one.
   */
  if (instanceGroup?.is_container_group) {
    const tab = pathname.split('/')[3] ?? '';
    const keptTab = ['details', 'edit', 'runs', 'jobs'].includes(tab)
      ? `/${tab}`
      : '';
    return <Navigate replace to={`/container_groups/${id}${keptTab}`} />;
  }

  let cardHeader: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;

  if (['edit', 'instances/'].some((name) => pathname.includes(name))) {
    cardHeader = null;
  }

  /*
   * One loading animation, in the place the content will be. Drawn inside the
   * card it made the page arrive in pieces: a card and its tabs first, an
   * animation inside them, then the content. Asked with the instanceGroup rather
   * than on its own, so a later read does not throw away a page already drawn.
   */
  if (isLoading && !instanceGroup) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {instanceGroup && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={
                <InstanceGroupEdit
                  instanceGroup={instanceGroup}
                  queueNames={queueNames}
                />
              }
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
                  controlPlaneName={queueNames.controlPlane}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
            {/* The tab's address before the rail called these runs. */}
            <Route path="jobs" element={<Navigate to="../runs" replace />} />
            <Route
              path="runs"
              element={
                <JobList
                  showTypeColumn
                  defaultParams={{ instance_group: instanceGroup.id }}
                  // Nothing is launched from a group, so the generic Run
                  // menu has no place here.
                  runControl={false}
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
