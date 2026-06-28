import React from 'react';
import { Routes, Route } from 'react-router';

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
  // This component is mounted under a ".../schedules/*" route on several
  // screens (templates, projects, inventory sources, management jobs), so its
  // routes are relative to that parent and resolve under any of them.

  // For some management jobs that delete data, we want to provide an additional
  // field on the scheduler for configuring the number of days to retain.

  const hasDaysToKeepField = [
    'cleanup_activitystream',
    'cleanup_jobs',
  ].includes(resource?.job_type);

  return (
    <Routes>
      <Route
        path="add"
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
      {/* so the nested <Schedule> route tree can match */}
      <Route
        path=":scheduleId/*"
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
