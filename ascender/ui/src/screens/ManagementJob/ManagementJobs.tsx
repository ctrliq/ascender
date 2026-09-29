import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ManagementJob from './ManagementJob';
import ManagementJobList from './ManagementJobList';

function ManagementJobs() {
  const basePath = '/cleanup_jobs';
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    [basePath]: t`Cleanup Jobs`,
  });

  const buildBreadcrumbConfig = useCallback(
    ({ id, name }: BreadcrumbResource = {}, nested?: BreadcrumbResource) => {
      if (!id) return;

      // Every tab is titled with the job's own name, as a project's or a
      // template's are: the tab bar already says which tab is open, and a
      // title reading "Details" left the page without a name at all.
      setBreadcrumbConfig({
        [basePath]: t`Cleanup Jobs`,
        [`${basePath}/${id}`]: `${name}`,
        [`${basePath}/${id}/details`]: `${name}`,
        [`${basePath}/${id}/notifications`]: `${name}`,
        [`${basePath}/${id}/runs`]: `${name}`,
        [`${basePath}/${id}/schedules`]: `${name}`,
        [`${basePath}/${id}/schedules/add`]: t`Create New Schedule`,
        [`${basePath}/${id}/schedules/${nested?.id}`]: `${nested?.name}`,
        [`${basePath}/${id}/schedules/${nested?.id}/details`]: `${nested?.name}`,
        [`${basePath}/${id}/schedules/${nested?.id}/edit`]: t`Edit ${nested?.name}`,
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
              {/* ManagementJobList takes no props: it reads nothing from
                  the breadcrumb, and has not since the initial import. */}
              <ManagementJobList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default ManagementJobs;
