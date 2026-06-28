import React from 'react';

import { Routes, Route } from 'react-router';

import InventoryGroupAdd from '../InventoryGroupAdd/InventoryGroupAdd';

import InventoryGroup from '../InventoryGroup/InventoryGroup';
import InventoryGroupsList from './InventoryGroupsList';

function InventoryGroups({ setBreadcrumb, inventory }) {
  return (
    <Routes>
      <Route
        path="add"
        element={
          <InventoryGroupAdd
            setBreadcrumb={setBreadcrumb}
            inventory={inventory}
          />
        }
      />
      {/* /* so the nested <InventoryGroup> route tree can match */}
      <Route
        path=":groupId/*"
        element={
          <InventoryGroup inventory={inventory} setBreadcrumb={setBreadcrumb} />
        }
      />
      <Route
        index
        element={<InventoryGroupsList inventory={inventory} />}
      />
    </Routes>
  );
}

export { InventoryGroups as _InventoryGroups };
export default InventoryGroups;
