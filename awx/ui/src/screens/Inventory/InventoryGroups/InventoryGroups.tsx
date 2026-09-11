import type { AnyInventory, SetBreadcrumb } from 'types/api';
import React from 'react';

import { Routes, Route } from 'react-router';

import InventoryGroupAdd from '../InventoryGroupAdd/InventoryGroupAdd';

import InventoryGroup from '../InventoryGroup/InventoryGroup';
import InventoryGroupsList from './InventoryGroupsList';

export interface InventoryGroupsProps {
  setBreadcrumb: SetBreadcrumb;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryGroups({ setBreadcrumb, inventory }: InventoryGroupsProps) {
  return (
    <Routes>
      <Route path="add" element={<InventoryGroupAdd />} />
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
