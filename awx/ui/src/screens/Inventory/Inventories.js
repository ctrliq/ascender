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
function InventoryTypeRouter({ setBreadcrumb }) {
  const { inventoryType } = useParams();
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
    '/inventories/inventory/add': t`Create new inventory`,
    '/inventories/smart_inventory/add': t`Create new smart inventory`,
    '/inventories/constructed_inventory/add': t`Create new constructed inventory`,
    '/inventories/federated_inventory/add': t`Create new federated inventory`,
  });

  const [breadcrumbConfig, setScreenHeader] = useState(
    initScreenHeader.current
  );

  const [inventory, setInventory] = useState();
  const [nestedObject, setNestedGroup] = useState();
  const [schedule, setSchedule] = useState();

  const setBreadcrumbConfig = useCallback(
    (passedInventory, passedNestedObject, passedSchedule) => {
      if (passedInventory && passedInventory.name !== inventory?.name) {
        setInventory(passedInventory);
      }
      if (
        passedNestedObject &&
        passedNestedObject.name !== nestedObject?.name
      ) {
        setNestedGroup(passedNestedObject);
      }
      if (passedSchedule && passedSchedule.name !== schedule?.name) {
        setSchedule(passedSchedule);
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
        [`${inventoryPath}/access`]: t`Access`,
        [`${inventoryPath}/jobs`]: t`Jobs`,
        [`${inventoryPath}/details`]: t`Details`,
        [`${inventoryPath}/job_templates`]: t`Job Templates`,
        [`${inventoryPath}/edit`]: t`Edit details`,

        [inventoryHostsPath]: t`Hosts`,
        [`${inventoryHostsPath}/add`]: t`Create new host`,
        [`${inventoryHostsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/edit`]: t`Edit details`,
        [`${inventoryHostsPath}/${nestedObject?.id}/details`]: t`Host details`,
        [`${inventoryHostsPath}/${nestedObject?.id}/jobs`]: t`Jobs`,
        [`${inventoryHostsPath}/${nestedObject?.id}/facts`]: t`Facts`,
        [`${inventoryHostsPath}/${nestedObject?.id}/groups`]: t`Groups`,

        [inventoryGroupsPath]: t`Groups`,
        [`${inventoryGroupsPath}/add`]: t`Create new group`,
        [`${inventoryGroupsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/edit`]: t`Edit details`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/details`]: t`Group details`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts`]: t`Hosts`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts/add`]: t`Create new host`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups`]: t`Related Groups`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups/add`]:
          t`Create new group`,

        [`${inventorySourcesPath}`]: t`Sources`,
        [`${inventorySourcesPath}/add`]: t`Create new source`,
        [`${inventorySourcesPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/details`]: t`Details`,
        [`${inventorySourcesPath}/${nestedObject?.id}/edit`]: t`Edit details`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules`]: t`Schedules`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}`]: `${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/add`]: t`Create New Schedule`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}/details`]:
          t`Schedule details`,
        [`${inventorySourcesPath}/${nestedObject?.id}/notifications`]: t`Notifications`,
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
        <Route
          path="smart_inventory/add"
          element={<SmartInventoryAdd />}
        />
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
