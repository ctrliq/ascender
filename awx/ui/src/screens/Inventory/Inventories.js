import React, { useState, useCallback, useRef } from 'react';
import { useLingui } from '@lingui/react';

import { t } from '@lingui/react/macro';
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
    '/inventories': i18n._(t`Inventories`),
    '/inventories/inventory/add': i18n._(t`Create new inventory`),
    '/inventories/smart_inventory/add': i18n._(t`Create new smart inventory`),
    '/inventories/constructed_inventory/add': i18n._(
      t`Create new constructed inventory`
    ),
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
        [`${inventoryPath}/access`]: i18n._(t`Access`),
        [`${inventoryPath}/jobs`]: i18n._(t`Jobs`),
        [`${inventoryPath}/details`]: i18n._(t`Details`),
        [`${inventoryPath}/job_templates`]: i18n._(t`Job Templates`),
        [`${inventoryPath}/edit`]: i18n._(t`Edit details`),

        [inventoryHostsPath]: i18n._(t`Hosts`),
        [`${inventoryHostsPath}/add`]: i18n._(t`Create new host`),
        [`${inventoryHostsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryHostsPath}/${nestedObject?.id}/edit`]: i18n._(
          t`Edit details`
        ),
        [`${inventoryHostsPath}/${nestedObject?.id}/details`]: i18n._(
          t`Host details`
        ),
        [`${inventoryHostsPath}/${nestedObject?.id}/jobs`]: i18n._(t`Jobs`),
        [`${inventoryHostsPath}/${nestedObject?.id}/facts`]: i18n._(t`Facts`),
        [`${inventoryHostsPath}/${nestedObject?.id}/groups`]: i18n._(
          t`Groups`
        ),

        [inventoryGroupsPath]: i18n._(t`Groups`),
        [`${inventoryGroupsPath}/add`]: i18n._(t`Create new group`),
        [`${inventoryGroupsPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventoryGroupsPath}/${nestedObject?.id}/edit`]: i18n._(
          t`Edit details`
        ),
        [`${inventoryGroupsPath}/${nestedObject?.id}/details`]: i18n._(
          t`Group details`
        ),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts`]: i18n._(
          t`Hosts`
        ),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_hosts/add`]: i18n._(
          t`Create new host`
        ),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups`]: i18n._(
          t`Related Groups`
        ),
        [`${inventoryGroupsPath}/${nestedObject?.id}/nested_groups/add`]:
          i18n._(t`Create new group`),

        [`${inventorySourcesPath}`]: i18n._(t`Sources`),
        [`${inventorySourcesPath}/add`]: i18n._(t`Create new source`),
        [`${inventorySourcesPath}/${nestedObject?.id}`]: `${nestedObject?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/details`]: i18n._(
          t`Details`
        ),
        [`${inventorySourcesPath}/${nestedObject?.id}/edit`]: i18n._(
          t`Edit details`
        ),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules`]: i18n._(
          t`Schedules`
        ),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}`]: `${schedule?.name}`,
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/add`]: i18n._(
          t`Create New Schedule`
        ),
        [`${inventorySourcesPath}/${nestedObject?.id}/schedules/${schedule?.id}/details`]:
          i18n._(t`Schedule details`),
        [`${inventorySourcesPath}/${nestedObject?.id}/notifications`]: i18n._(
          t`Notifications`
        ),
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
