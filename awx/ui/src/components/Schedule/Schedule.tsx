import type { SurveyConfig, LaunchConfig } from 'components/LaunchPrompt/types';
import type {
  ApiEntity,
  BreadcrumbResource,
  DetailedError,
  LaunchCredential,
} from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { SchedulesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import RoutedTabs from '../RoutedTabs';
import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';
import ScheduleDetail from './ScheduleDetail';
import ScheduleEdit from './ScheduleEdit';

export interface ScheduleProps {
  setBreadcrumb: (
    resource?: BreadcrumbResource,
    schedule?: BreadcrumbResource
  ) => void;
  /** The thing the schedule belongs to, which it is edited under. */
  resource: ApiEntity;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  hasDaysToKeepField?: boolean;
  resourceDefaultCredentials?: LaunchCredential[];
  [key: string]: unknown;
}

function Schedule({
  setBreadcrumb,
  resource,
  launchConfig,
  surveyConfig,
  hasDaysToKeepField,
  resourceDefaultCredentials,
}: ScheduleProps) {
  const { t } = useLingui();
  const { scheduleId } = useParams() as { scheduleId: string };

  const { pathname } = useLocation();

  const pathRoot = pathname.substring(0, pathname.indexOf('schedules'));

  const {
    isLoading,
    error,
    request: loadData,
    result: schedule,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SchedulesAPI.readDetail(scheduleId as string);

      return data;
    }, [scheduleId]),
    null
  );

  useEffect(() => {
    loadData();
  }, [loadData, pathname]);

  useEffect(() => {
    if (schedule) {
      setBreadcrumb(resource, schedule);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, resource]);
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Schedules`}
        </>
      ),
      link: `${pathRoot}schedules`,
      id: 99,
    },
    {
      name: t`Details`,
      link: `${pathRoot}schedules/${schedule && schedule.id}/details`,
      id: 0,
    },
  ];

  if (!isLoading && error) {
    return (
      <ContentError isNotFound error={error}>
        {(error as DetailedError).response?.status === 404 && (
          <span>
            {t`Schedule not found.`}{' '}
            <Link to={`${pathRoot}schedules`}>{t`View Schedules`}</Link>
          </span>
        )}
      </ContentError>
    );
  }

  if (isLoading || !schedule?.summary_fields?.unified_job_template?.id) {
    return <ContentLoading />;
  }

  if (schedule?.summary_fields.unified_job_template.id !== resource.id) {
    return (
      <ContentError>
        {schedule && (
          <Link to={`${pathRoot}schedules`}>{t`View Schedules`}</Link>
        )}
      </ContentError>
    );
  }

  if (error) {
    return <ContentError error={error} />;
  }

  let showCardHeader = true;

  if (!pathname.includes('schedules/') || pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  return (
    <>
      {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
      <Routes>
        <Route index element={<Navigate to="details" replace />} />
        {schedule && (
          <Route
            path="edit"
            element={
              <ScheduleEdit
                hasDaysToKeepField={hasDaysToKeepField}
                schedule={schedule}
                resource={resource}
                launchConfig={launchConfig}
                surveyConfig={surveyConfig}
                resourceDefaultCredentials={resourceDefaultCredentials}
              />
            }
          />
        )}
        {schedule && (
          <Route
            path="details"
            element={
              <ScheduleDetail
                hasDaysToKeepField={hasDaysToKeepField}
                schedule={schedule}
                surveyConfig={surveyConfig}
              />
            }
          />
        )}
        <Route
          path="*"
          element={
            <ContentError>
              {resource && (
                <Link to={`${pathRoot}details`}>{t`View Details`}</Link>
              )}
            </ContentError>
          }
        />
      </Routes>
    </>
  );
}

export { Schedule as _Schedule };
export default Schedule;
