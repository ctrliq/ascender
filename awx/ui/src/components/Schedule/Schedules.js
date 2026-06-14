import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom-v5-compat';

import Schedule from './Schedule';
import ScheduleAdd from './ScheduleAdd';
import ScheduleList from './ScheduleList';

function Schedules({
  apiModel,
  loadScheduleOptions,
  loadSchedules,
  setBreadcrumb,
  launchConfig,
  surveyConfig,
  resource,
  resourceDefaultCredentials,
}) {
  // This component is mounted at several different base paths (templates,
  // projects, inventory sources, management jobs). Derive the base from the
  // location so the routes are base-agnostic and resolve whether the parent
  // screen is still on v5 or already on v6.
  const { pathname } = useLocation();
  const baseUrl = `${pathname.substr(
    0,
    pathname.indexOf('schedules')
  )}schedules`;

  // For some management jobs that delete data, we want to provide an additional
  // field on the scheduler for configuring the number of days to retain.

  const hasDaysToKeepField = [
    'cleanup_activitystream',
    'cleanup_jobs',
  ].includes(resource?.job_type);

  return (
    <Routes>
      <Route
        path={`${baseUrl}/add`}
        element={
          <ScheduleAdd
            hasDaysToKeepField={hasDaysToKeepField}
            apiModel={apiModel}
            resource={resource}
            launchConfig={launchConfig}
            surveyConfig={surveyConfig}
            resourceDefaultCredentials={resourceDefaultCredentials}
          />
        }
      />
      {/* /* so the nested <Schedule> route tree can match */}
      <Route
        path={`${baseUrl}/:scheduleId/*`}
        element={
          <Schedule
            hasDaysToKeepField={hasDaysToKeepField}
            setBreadcrumb={setBreadcrumb}
            resource={resource}
            launchConfig={launchConfig}
            surveyConfig={surveyConfig}
            resourceDefaultCredentials={resourceDefaultCredentials}
          />
        }
      />
      <Route
        path={baseUrl}
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
