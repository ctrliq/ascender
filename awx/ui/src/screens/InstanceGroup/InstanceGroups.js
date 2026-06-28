import React, { useCallback, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Routes, Route, useLocation } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import InstanceGroupAdd from './InstanceGroupAdd';
import InstanceGroupList from './InstanceGroupList';
import InstanceGroup from './InstanceGroup';
import ContainerGroupAdd from './ContainerGroupAdd';
import ContainerGroup from './ContainerGroup';

function InstanceGroups() {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/instance_groups': t`Instance Groups`,
    '/instance_groups/add': t`Create new instance group`,
    '/instance_groups/container_group/add': t`Create new container group`,
  });

  const buildBreadcrumbConfig = useCallback(
    (instanceGroups, instance) => {
      if (!instanceGroups) {
        return;
      }
      setBreadcrumbConfig({
        '/instance_groups': t`Instance Groups`,
        '/instance_groups/add': t`Create new instance group`,
        '/instance_groups/container_group/add': t`Create new container group`,

        [`/instance_groups/${instanceGroups.id}/details`]: t`Details`,
        [`/instance_groups/${instanceGroups.id}/instances`]: t`Instances`,
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}`]: `${instance?.hostname}`,
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}/details`]:
          t`Instance details`,
        [`/instance_groups/${instanceGroups.id}/jobs`]: t`Jobs`,
        [`/instance_groups/${instanceGroups.id}/edit`]: t`Edit details`,
        [`/instance_groups/${instanceGroups.id}`]: `${instanceGroups.name}`,

        [`/instance_groups/container_group/${instanceGroups.id}/details`]:
          t`Details`,
        [`/instance_groups/container_group/${instanceGroups.id}/jobs`]: t`Jobs`,
        [`/instance_groups/container_group/${instanceGroups.id}/edit`]: t`Edit details`,
        [`/instance_groups/container_group/${instanceGroups.id}`]: `${instanceGroups.name}`,
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
        <Route
          path="container_group/add"
          element={<ContainerGroupAdd />}
        />
        {/* /* so the nested <ContainerGroup> route tree can match the rest */}
        <Route
          path="container_group/:id/*"
          element={<ContainerGroup setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          path="add"
          element={<InstanceGroupAdd />}
        />
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
