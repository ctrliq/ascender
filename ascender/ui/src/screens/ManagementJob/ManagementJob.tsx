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

import { SystemJobTemplatesAPI, OrganizationsAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import NotificationList from 'components/NotificationList';
import RoutedTabs from 'components/RoutedTabs';
import JobList from 'components/JobList';
import { Schedules } from 'components/Schedule';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import type { RoutedTab } from 'components/RoutedTabs/RoutedTabs';
import type { QSParams } from 'util/qs';
import ManagementJobLaunchButton from './ManagementJobLaunchButton';
import ManagementJobDetail from './ManagementJobDetail';

export interface ManagementJobProps {
  setBreadcrumb: SetBreadcrumb;
}

function ManagementJob({ setBreadcrumb }: ManagementJobProps) {
  const { t } = useLingui();
  const basePath = '/cleanup_jobs';

  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();
  const detailUrl = `${basePath}/${id}`;
  const { me } = useConfig();

  const { isLoading, error, request, result } = useRequest(
    useCallback(
      () =>
        Promise.all([
          SystemJobTemplatesAPI.readDetail(id as string),
          OrganizationsAPI.read({
            page_size: 1,
            role_level: 'notification_admin_role',
          }),
        ]).then(([{ data: systemJobTemplate }, notificationRoles]) => ({
          systemJobTemplate,
          notificationRoles,
        })),
      [id]
    )
  );

  useEffect(() => {
    request();
  }, [request, pathname]);

  useEffect(() => {
    if (!result) return;
    // The template, not the whole result: the breadcrumb reads an id and a
    // name off what it is given, and the pair of effects below this one used
    // to hand it the request's two halves instead, so it always returned
    // early and the job was never named in the trail.
    setBreadcrumb(result.systemJobTemplate);
  }, [result, setBreadcrumb]);

  // Read off the result rather than kept in state an effect sets: the render
  // that first has the result would otherwise still think the tab hidden, and
  // show its address as not found for a moment.
  const isNotificationAdmin = Boolean(
    result?.notificationRoles?.data?.results?.length
  );

  const createSchedule = useCallback(
    (data: unknown) =>
      SystemJobTemplatesAPI.createSchedule(
        result?.systemJobTemplate.id as number,
        data
      ),
    [result]
  );
  const loadSchedules = useCallback(
    (params: QSParams) =>
      SystemJobTemplatesAPI.readSchedules(
        result?.systemJobTemplate.id as number,
        params
      ),
    [result]
  );
  const loadScheduleOptions = useCallback(
    () =>
      SystemJobTemplatesAPI.readScheduleOptions(
        result?.systemJobTemplate.id as number
      ),
    [result]
  );

  /* A superuser is asked separately: the role lookup reads organizations, so
     on an install with none it comes back empty even for a superuser. */
  const shouldShowNotifications =
    result?.systemJobTemplate?.id &&
    (me?.is_superuser || isNotificationAdmin || me?.is_system_auditor);
  /* The api lets only a superuser change what a cleanup job notifies, since
     it is a superuser's object: a notification admin may see the list but
     would be refused a toggle. */
  const canToggleNotifications = Boolean(me?.is_superuser);
  const shouldShowSchedules = !!result?.systemJobTemplate?.id;

  const tabsArray: RoutedTab[] = [
    {
      id: 99,
      link: basePath,
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Cleanup Jobs`}
        </>
      ),
      persistentFilterKey: 'managementJobs',
    },
  ];

  /* Opens on what the job is, as every other resource does, rather than on
     the first of its lists. */
  if (result?.systemJobTemplate?.id) {
    tabsArray.push({
      id: 3,
      name: t`Details`,
      link: `${detailUrl}/details`,
    });
  }

  if (shouldShowNotifications) {
    tabsArray.push({
      id: 1,
      name: t`Notifications`,
      link: `${detailUrl}/notifications`,
    });
  }

  if (shouldShowSchedules) {
    tabsArray.push({
      id: 0,
      name: t`Schedules`,
      link: `${detailUrl}/schedules`,
    });
  }

  if (result?.systemJobTemplate?.id) {
    tabsArray.push({
      id: 2,
      name: t`Runs`,
      link: `${detailUrl}/runs`,
    });
  }

  let Tabs: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.includes('edit') || pathname.includes('schedules/')) {
    Tabs = null;
  }

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {(error as DetailedError)?.response?.status === 404 && (
              <span>
                {t`Cleanup Job not found.`}{' '}
                <Link to={basePath}>{t`View all Cleanup Jobs.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {Tabs}
        <Routes>
          <Route
            index
            element={<Navigate to={`${detailUrl}/details`} replace />}
          />
          {result?.systemJobTemplate?.id ? (
            <Route
              path="details"
              element={
                <ManagementJobDetail
                  systemJobTemplate={result.systemJobTemplate}
                />
              }
            />
          ) : null}
          {result?.systemJobTemplate?.id ? (
            <Route
              path="runs"
              element={
                <JobList
                  defaultParams={{
                    unified_job_template: result.systemJobTemplate.id,
                  }}
                  runControl={
                    <ManagementJobLaunchButton
                      systemJobTemplate={result.systemJobTemplate}
                      ouiaId="management-job-runs-launch-button"
                    />
                  }
                />
              }
            />
          ) : null}
          {shouldShowNotifications ? (
            <Route
              path="notifications"
              element={
                <NotificationList
                  id={Number(result?.systemJobTemplate?.id)}
                  canToggleNotifications={canToggleNotifications}
                  apiModel={SystemJobTemplatesAPI}
                />
              }
            />
          ) : null}
          {/* /* so the nested <Schedules> route tree can match */}
          {shouldShowSchedules ? (
            <Route
              path="schedules/*"
              element={
                <Schedules
                  apiModel={SystemJobTemplatesAPI}
                  resource={result.systemJobTemplate}
                  createSchedule={createSchedule}
                  loadSchedules={loadSchedules}
                  loadScheduleOptions={loadScheduleOptions}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
          ) : null}
          {/*
           * Any other address under the job, a mistyped tab or one this user
           * cannot see, says so rather than leaving the card empty. Only once
           * the job has loaded, since the tabs above wait for it too.
           */}
          {result ? (
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${detailUrl}/details`}>
                    {t`View Cleanup Job Details`}
                  </Link>
                </ContentError>
              }
            />
          ) : null}
        </Routes>
      </Card>
    </PageSection>
  );
}

export default ManagementJob;
