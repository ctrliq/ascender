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

import ContainerGroupDetails from './ContainerGroupDetails';
import ContainerGroupEdit from './ContainerGroupEdit';

export interface ContainerGroupProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function ContainerGroup({ setBreadcrumb }: ContainerGroupProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
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
          {t`Back to Container Groups`}
        </>
      ),
      // Container groups have a list of their own; the instance groups list
      // filters them out, so going back there would not find this one.
      link: '/container_groups',
      id: 99,
      persistentFilterKey: 'containerGroups',
    },
    {
      name: t`Details`,
      link: `/container_groups/${id}/details`,
      id: 0,
    },
    {
      name: t`Runs`,
      link: `/container_groups/${id}/runs`,
      id: 1,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError).response?.status === 404 && (
              <span>
                {t`Container group not found.`}{' '}
                <Link to="/container_groups">
                  {t`View all container groups`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  /*
   * An instance group reached at a container group address, by a hand-typed
   * or stale link. Drawn here it would read as a container group, and its
   * edit form would save it as one. Send it to the instance group screen,
   * keeping the tab both screens have, as that screen does the other way.
   */
  if (instanceGroup && !instanceGroup.is_container_group) {
    const tab = pathname.split('/')[3] ?? '';
    const keptTab = ['details', 'edit', 'runs', 'jobs'].includes(tab)
      ? `/${tab}`
      : '';
    return <Navigate replace to={`/instance_groups/${id}${keptTab}`} />;
  }

  let cardHeader: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
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
              element={<ContainerGroupEdit instanceGroup={instanceGroup} />}
            />
            <Route
              path="details"
              element={<ContainerGroupDetails instanceGroup={instanceGroup} />}
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
                  <Link to="/container_groups">
                    {t`View all container groups`}
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

export default ContainerGroup;
