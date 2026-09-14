import type { AnyInventory, SetBreadcrumb } from 'types/api';
import React from 'react';

import { Routes, Route, Navigate, useParams } from 'react-router';

import InventoryGroupAdd from '../InventoryGroupAdd/InventoryGroupAdd';

import InventoryGroup from '../InventoryGroup/InventoryGroup';
import InventoryGroupsList from './InventoryGroupsList';
import { isReadOnlyInventoryType } from '../shared/utils';

export interface InventoryGroupsProps {
  setBreadcrumb: SetBreadcrumb;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryGroups({ setBreadcrumb, inventory }: InventoryGroupsProps) {
  const { id, inventoryType } = useParams() as {
    id: string;
    inventoryType: string;
  };
  // Constructed and federated inventories are read-only here, so a hand-typed
  // add url lands on the list rather than on a form the api would refuse.
  const readOnly = isReadOnlyInventoryType(inventoryType);
  return (
    <Routes>
      <Route
        path="add"
        element={
          readOnly ? (
            <Navigate
              to={`/inventories/${inventoryType}/${id}/groups`}
              replace
            />
          ) : (
            <InventoryGroupAdd />
          )
        }
      />
      {/* /* so the nested <InventoryGroup> route tree can match */}
      <Route
        path=":groupId/*"
        element={
          <InventoryGroup inventory={inventory} setBreadcrumb={setBreadcrumb} />
        }
      />
      <Route index element={<InventoryGroupsList />} />
    </Routes>
  );
}

export { InventoryGroups as _InventoryGroups };
export default InventoryGroups;
