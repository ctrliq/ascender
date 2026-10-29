import type { BreadcrumbResource } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ContainerGroupAdd from './ContainerGroupAdd';
import ContainerGroup from './ContainerGroup';
import InstanceGroupList from './InstanceGroupList';

/**
 * The container groups, which are instance groups that hand their work to a
 * cluster rather than to instances of their own.
 *
 * They share an endpoint with the instance groups and nothing else: their own
 * address, their own tab beside the instances, and a list that asks for the
 * one kind rather than a table of both with a column saying which is which.
 */
function ContainerGroups() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState<
    Record<string, string | null>
  >({
    '/container_groups': t`Container Groups`,
    '/container_groups/add': t`Create New Container Group`,
  });

  const buildBreadcrumbConfig = useCallback(
    (containerGroup?: BreadcrumbResource) => {
      if (!containerGroup) {
        return;
      }
      setBreadcrumbConfig({
        '/container_groups': t`Container Groups`,
        '/container_groups/add': t`Create New Container Group`,
        [`/container_groups/${containerGroup.id}`]: `${containerGroup.name}`,
        [`/container_groups/${containerGroup.id}/details`]: `${containerGroup.name}`,
        [`/container_groups/${containerGroup.id}/runs`]: `${containerGroup.name}`,
        [`/container_groups/${containerGroup.id}/edit`]: t`Edit ${containerGroup.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="instance_group"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<ContainerGroupAdd />} />
        {/* /* so the nested <ContainerGroup> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<ContainerGroup setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="containerGroups">
              <InstanceGroupList isContainerGroup />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default ContainerGroups;
