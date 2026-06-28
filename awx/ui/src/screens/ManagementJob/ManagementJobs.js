import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ManagementJob from './ManagementJob';
import ManagementJobList from './ManagementJobList';

function ManagementJobs() {
  const basePath = '/management_jobs';
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    [basePath]: t`Management jobs`,
  });

  const buildBreadcrumbConfig = useCallback(
    ({ id, name }, nested) => {
      if (!id) return;

      setBreadcrumbConfig({
        [basePath]: t`Management job`,
        [`${basePath}/${id}`]: name,
        [`${basePath}/${id}/notifications`]: t`Notifications`,
        [`${basePath}/${id}/schedules`]: t`Schedules`,
        [`${basePath}/${id}/schedules/add`]: t`Create New Schedule`,
        [`${basePath}/${id}/schedules/${nested?.id}`]: `${nested?.name}`,
        [`${basePath}/${id}/schedules/${nested?.id}/details`]: t`Details`,
        [`${basePath}/${id}/schedules/${nested?.id}/edit`]: t`Edit Details`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="none" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        {/* /* so the nested <ManagementJob> route tree can match */}
        <Route
          path=":id/*"
          element={<ManagementJob setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="managementJobs">
              <ManagementJobList setBreadcrumb={buildBreadcrumbConfig} />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default ManagementJobs;
