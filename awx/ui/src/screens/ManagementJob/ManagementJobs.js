import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Route, Switch } from 'react-router-dom';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ManagementJob from './ManagementJob';
import ManagementJobList from './ManagementJobList';

function ManagementJobs() {
  const basePath = '/management_jobs';
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    [basePath]: i18n._(msg`Management jobs`),
  });

  const buildBreadcrumbConfig = useCallback(({ id, name }, nested) => {
    if (!id) return;

    setBreadcrumbConfig({
      [basePath]: i18n._(msg`Management job`),
      [`${basePath}/${id}`]: name,
      [`${basePath}/${id}/notifications`]: i18n._(msg`Notifications`),
      [`${basePath}/${id}/schedules`]: i18n._(msg`Schedules`),
      [`${basePath}/${id}/schedules/add`]: i18n._(msg`Create New Schedule`),
      [`${basePath}/${id}/schedules/${nested?.id}`]: `${nested?.name}`,
      [`${basePath}/${id}/schedules/${nested?.id}/details`]: i18n._(msg`Details`),
      [`${basePath}/${id}/schedules/${nested?.id}/edit`]: i18n._(msg`Edit Details`),
    });
  }, [i18n]);

  return (
    <>
      <ScreenHeader streamType="none" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path={`${basePath}/:id`}>
          <ManagementJob setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path={basePath}>
          <PersistentFilters pageKey="managementJobs">
            <ManagementJobList setBreadcrumb={buildBreadcrumbConfig} />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default ManagementJobs;
