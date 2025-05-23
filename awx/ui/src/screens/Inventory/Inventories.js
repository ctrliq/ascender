import React, { useState, useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react';

import { msg } from '@lingui/macro';
import { Route, Switch } from 'react-router-dom';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { InventoryList } from './InventoryList';
import Inventory from './Inventory';
import SmartInventory from './SmartInventory';
import ConstructedInventory from './ConstructedInventory';
import InventoryAdd from './InventoryAdd';
import SmartInventoryAdd from './SmartInventoryAdd';
import ConstructedInventoryAdd from './ConstructedInventoryAdd';
import { getInventoryPath } from './shared/utils';

function Inventories() {
  const { i18n } = useLingui();
  const initScreenHeader = useRef({
    '/inventories': i18n._(msg`Inventories`),
    '/inventories/inventory/add': i18n._(msg`Create new inventory`),
    '/inventories/smart_inventory/add': i18n._(msg`Create new smart inventory`),
    '/inventories/constructed_inventory/add': i18n._(msg`Create new constructed inventory`),
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
        [`${inventoryPath}/access`]: i18n._(msg`Access`),
        [`${inventoryPath}/jobs`]: i18n._(msg`Jobs`),
        [`${inventoryPath}/details`]: i18n._(msg`Details`),
        [`${inventoryPath}/job_templates`]: i18n._(msg`Job Templates`),
        [`${inventoryPath}/edit`]: i18n._(msg`Edit details`),

        [inventoryHostsPath]: i18n._(msg`Hosts`),
        [`${inventoryHostsPath}/add`]: i18n._(msg`Create new host`),
        [`${inventoryHostsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/edit`]: i18n._(msg`Edit details`),
        [`${inventoryHostsPath}/${nestedObject?.id}/details`]: i18n._(msg`Host details`),
        [`${inventoryHostsPath}/${nestedObject?.id}/jobs`]: i18n._(msg`Jobs`),
        [`${inventoryHostsPath}/${nestedObject?.id}/facts`]: i18n._(msg`Facts`),
        [`${inventoryHostsPath}/${nestedObject?.id}/groups`]: i18n._(msg`Groups`),

        [inventoryGroupsPath]: i18n._(msg`Groups`),
        [`${inventoryGroupsPath}/add`]: i18n._(msg`Create new group`),
        [`${inventoryGroupsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/edit`]: i18n._(msg`Edit details`),
        [`${inventoryGroupsPath}/${nestedObject?.id}/details`]: i18n._(msg`Group details`),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts`]: i18n._(msg`Hosts`),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts/add`]: i18n._(msg`Create new host`),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups`]: i18n._(msg`Related Groups`),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups/add`]: i18n._(msg`Create new group`),

        [`${inventorySourcesPath}`]: i18n._(msg`Sources`),
        [`${inventorySourcesPath}/add`]: i18n._(msg`Create new source`),
        [`${inventorySourcesPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/details`]: i18n._(msg`Details`),
        [`${inventorySourcesPath}/${nestedObject?.id}/edit`]: i18n._(msg`Edit details`),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules`]: i18n._(msg`Schedules`),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}`]: `${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/add`]: i18n._(msg`Create New Schedule`),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}/details`]: i18n._(msg`Schedule details`),
        [`${inventorySourcesPath}/${nestedObject?.id}/notifications`]: i18n._(msg`Notifications`),
      });
    },
    [inventory, nestedObject, schedule, i18n]
  );

  return (
    <>
      <ScreenHeader
        streamType="inventory"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/inventories/inventory/add">
          <InventoryAdd />
        </Route>
        <Route path="/inventories/smart_inventory/add">
          <SmartInventoryAdd />
        </Route>
        <Route path="/inventories/constructed_inventory/add">
          <ConstructedInventoryAdd />
        </Route>
        <Route path="/inventories/inventory/:id">
          <Config>
            {({ me }) => (
              <Inventory setBreadcrumb={setBreadcrumbConfig} me={me || {}} />
            )}
          </Config>
        </Route>
        <Route path="/inventories/smart_inventory/:id">
          <SmartInventory setBreadcrumb={setBreadcrumbConfig} />
        </Route>
        <Route path="/inventories/constructed_inventory/:id">
          <ConstructedInventory setBreadcrumb={setBreadcrumbConfig} />
        </Route>
        <Route path="/inventories">
          <PersistentFilters pageKey="inventories">
            <InventoryList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Inventories as _Inventories };
export default Inventories;
