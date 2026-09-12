import type {
  ApiEntity,
  ApiResponse,
  LaunchCredential,
  OptionsResponse,
  Paginated,
  Schedule as ScheduleModel,
  SchedulesApiModel,
  SetBreadcrumb,
} from 'types/api';
import type { SurveyConfig, LaunchConfig } from 'components/LaunchPrompt/types';
import type { QSParams } from 'util/qs';
import React from 'react';
import { Routes, Route } from 'react-router';

import Schedule from './Schedule';
import ScheduleAdd from './ScheduleAdd';
import ScheduleList from './ScheduleList';

export interface SchedulesProps {
  apiModel: SchedulesApiModel;
  loadScheduleOptions: () => Promise<ApiResponse<OptionsResponse>>;
  loadSchedules: (
    params: QSParams
  ) => Promise<ApiResponse<Paginated<ScheduleModel>>>;
  setBreadcrumb: SetBreadcrumb;
  /** Absent for a resource that cannot be prompted, a management job say. */
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  /**
   * The thing the schedules belong to, which a new one is created on. The all
   * schedules screen shows the list alone, and never reaches the routes below
   * that create or edit one.
   */
  resource?: ApiEntity;
  resourceDefaultCredentials?: LaunchCredential[];
  [key: string]: unknown;
}

function Schedules({
  apiModel,
  loadScheduleOptions,
  loadSchedules,
  setBreadcrumb,
  launchConfig,
  surveyConfig,
  resource,
  resourceDefaultCredentials,
}: SchedulesProps) {
  // This component is mounted under a ".../schedules/*" route on several
  // screens (templates, projects, inventory sources, management jobs), so its
  // routes are relative to that parent and resolve under any of them.

  // For some management jobs that delete data, we want to provide an additional
  // field on the scheduler for configuring the number of days to retain.

  const hasDaysToKeepField = [
    'cleanup_activitystream',
    'cleanup_jobs',
  ].includes((resource as { job_type?: string })?.job_type ?? '');

  return (
    <Routes>
      <Route
        path="add"
        element={
          <ScheduleAdd
            hasDaysToKeepField={hasDaysToKeepField}
            apiModel={apiModel}
            resource={resource as ApiEntity}
            launchConfig={launchConfig}
            surveyConfig={surveyConfig}
            resourceDefaultCredentials={resourceDefaultCredentials}
          />
        }
      />
      {/* so the nested <Schedule> route tree can match */}
      <Route
        path=":scheduleId/*"
        element={
          <Schedule
            hasDaysToKeepField={hasDaysToKeepField}
            setBreadcrumb={setBreadcrumb}
            resource={resource as ApiEntity}
            launchConfig={launchConfig}
            surveyConfig={surveyConfig}
            resourceDefaultCredentials={resourceDefaultCredentials}
          />
        }
      />
      <Route
        index
        element={
          <ScheduleList
            resource={resource}
            loadSchedules={loadSchedules}
            launchConfig={launchConfig}
            surveyConfig={surveyConfig}
            loadScheduleOptions={loadScheduleOptions}
          />
        }
      />
    </Routes>
  );
}

export { Schedules as _Schedules };
export default Schedules;
