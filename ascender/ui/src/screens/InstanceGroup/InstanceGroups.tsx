import type { BreadcrumbResource } from 'types/api';
import React, { useCallback, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Routes, Route, useLocation } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import InstanceGroupAdd from './InstanceGroupAdd';
import InstanceGroupList from './InstanceGroupList';
import InstanceGroup from './InstanceGroup';

function InstanceGroups() {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/instance_groups': t`Instance Groups`,
    '/instance_groups/add': t`Create New Instance Group`,
  });

  const buildBreadcrumbConfig = useCallback(
    (
      instanceGroups?: BreadcrumbResource,
      instance?: BreadcrumbResource & { hostname?: string | null }
    ) => {
      if (!instanceGroups) {
        return;
      }
      setBreadcrumbConfig({
        '/instance_groups': t`Instance Groups`,
        '/instance_groups/add': t`Create New Instance Group`,

        [`/instance_groups/${instanceGroups.id}/details`]: `${instanceGroups.name}`,
        [`/instance_groups/${instanceGroups.id}/instances`]: `${instanceGroups.name}`,
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}`]: `${instance?.hostname}`,
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}/details`]: `${instance?.hostname}`,
        [`/instance_groups/${instanceGroups.id}/runs`]: `${instanceGroups.name}`,
        [`/instance_groups/${instanceGroups.id}/edit`]: t`Edit ${instanceGroups.name}`,
        [`/instance_groups/${instanceGroups.id}`]: `${instanceGroups.name}`,
      });
    },
    [t]
  );

  const streamType = pathname.includes('instances')
    ? 'instance'
    : 'instance_group';

  return (
    <>
      <ScreenHeader
        streamType={streamType}
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<InstanceGroupAdd />} />
        {/* /* so the nested <InstanceGroup> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<InstanceGroup setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="instanceGroups">
              <InstanceGroupList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default InstanceGroups;
