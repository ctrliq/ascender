import type {
  BreadcrumbResource,
  Inventory as InventoryModel,
  Schedule,
  SetBreadcrumb,
} from 'types/api';
import React, { useState, useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Routes, Route, useParams } from 'react-router';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { InventoryList } from './InventoryList';
import Inventory from './Inventory';
import SmartInventory from './SmartInventory';
import ConstructedInventory from './ConstructedInventory';
import FederatedInventory from './FederatedInventory';
import InventoryAdd from './InventoryAdd';
import SmartInventoryAdd from './SmartInventoryAdd';
import ConstructedInventoryAdd from './ConstructedInventoryAdd';
import FederatedInventoryAdd from './FederatedInventoryAdd';
import { getInventoryPath } from './shared/utils';

// A single :inventoryType/:id route (instead of one literal route per kind) so
// inventoryType is a real route param that the nested group/host screens read
// via useParams; this picks the right detail screen for the kind.
export interface InventoryTypeRouterProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function InventoryTypeRouter({ setBreadcrumb }: InventoryTypeRouterProps) {
  const { inventoryType } = useParams() as { inventoryType: string };
  if (inventoryType === 'smart_inventory') {
    return <SmartInventory setBreadcrumb={setBreadcrumb} />;
  }
  if (inventoryType === 'constructed_inventory') {
    return <ConstructedInventory setBreadcrumb={setBreadcrumb} />;
  }
  if (inventoryType === 'federated_inventory') {
    return <FederatedInventory setBreadcrumb={setBreadcrumb} />;
  }
  return (
    <Config>
      {({ me }) => <Inventory setBreadcrumb={setBreadcrumb} me={me || {}} />}
    </Config>
  );
}

function Inventories() {
  const { t } = useLingui();
  const initScreenHeader = useRef({
    '/inventories': t`Inventories`,
    '/inventories/inventory/add': t`Create New Inventory`,
    '/inventories/smart_inventory/add': t`Create New Smart Inventory`,
    '/inventories/constructed_inventory/add': t`Create New Constructed Inventory`,
    '/inventories/federated_inventory/add': t`Create New Federated Inventory`,
  });

  const [breadcrumbConfig, setScreenHeader] = useState(
    initScreenHeader.current
  );

  const [inventory, setInventory] = useState<InventoryModel | undefined>();
  const [nestedObject, setNestedGroup] = useState<BreadcrumbResource>();
  const [schedule, setSchedule] = useState<Schedule | undefined>();

  const setBreadcrumbConfig = useCallback(
    (
      passedInventory?: BreadcrumbResource,
      passedNestedObject?: BreadcrumbResource,
      passedSchedule?: BreadcrumbResource
    ) => {
      if (passedInventory && passedInventory.name !== inventory?.name) {
        setInventory(passedInventory as InventoryModel);
      }
      if (
        passedNestedObject &&
        passedNestedObject.name !== nestedObject?.name
      ) {
        setNestedGroup(passedNestedObject);
      }
      if (passedSchedule && passedSchedule.name !== schedule?.name) {
        setSchedule(passedSchedule as Schedule);
      }
      if (!inventory) {
        return;
      }

      const inventoryPath = getInventoryPath(inventory);
      const inventoryHostsPath = `${inventoryPath}/hosts`;
      const inventoryGroupsPath = `${inventoryPath}/groups`;
      const inventorySourcesPath = `${inventoryPath}/sources`;

      setScreenHeader({
        ...initScreenHeader.current,
        [inventoryPath]: `${inventory.name}`,
        [`${inventoryPath}/access`]: `${inventory.name}`,
        [`${inventoryPath}/runs`]: `${inventory.name}`,
        [`${inventoryPath}/details`]: `${inventory.name}`,
        [`${inventoryPath}/job_templates`]: `${inventory.name}`,
        [`${inventoryPath}/edit`]: t`Edit ${inventory.name}`,

        [inventoryHostsPath]: `${inventory.name}`,
        [`${inventoryHostsPath}/add`]: t`Create New Host`,
        [`${inventoryHostsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/edit`]: t`Edit ${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/details`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/runs`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/facts`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/groups`]: `${nestedObject?.name}`,

        [inventoryGroupsPath]: `${inventory.name}`,
        [`${inventoryGroupsPath}/add`]: t`Create New Group`,
        [`${inventoryGroupsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/edit`]: t`Edit ${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/details`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts/add`]: t`Create New Host`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups/add`]: t`Create New Group`,

        [`${inventorySourcesPath}`]: `${inventory.name}`,
        [`${inventorySourcesPath}/add`]: t`Create New Source`,
        [`${inventorySourcesPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/details`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/edit`]: t`Edit ${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}`]: `${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/add`]: t`Create New Schedule`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}/details`]: `${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}/edit`]: t`Edit ${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/notifications`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/runs`]: `${nestedObject?.name}`,
      });
    },
    [inventory, nestedObject, schedule, t]
  );

  return (
    <>
      <ScreenHeader
        streamType="inventory"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="inventory/add" element={<InventoryAdd />} />
        <Route path="smart_inventory/add" element={<SmartInventoryAdd />} />
        <Route
          path="constructed_inventory/add"
          element={<ConstructedInventoryAdd />}
        />
        <Route
          path="federated_inventory/add"
          element={<FederatedInventoryAdd />}
        />
        {/* /* so each detail screen's own nested <Routes> can match */}
        <Route
          path=":inventoryType/:id/*"
          element={<InventoryTypeRouter setBreadcrumb={setBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="inventories">
              <InventoryList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export { Inventories as _Inventories };
export default Inventories;
