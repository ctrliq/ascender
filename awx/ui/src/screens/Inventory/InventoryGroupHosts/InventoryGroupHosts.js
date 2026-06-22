import React from 'react';
import { Routes, Route } from 'routerCompat';
import InventoryGroupHostAdd from '../InventoryGroupHostAdd';
import InventoryGroupHostList from './InventoryGroupHostList';

function InventoryGroupHosts({ inventoryGroup }) {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventoryGroupHostAdd inventoryGroup={inventoryGroup} />}
      />
      <Route
        index
        element={<InventoryGroupHostList />}
      />
    </Routes>
  );
}

export default InventoryGroupHosts;
