import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import InventoryGroupHostAdd from '../InventoryGroupHostAdd';
import InventoryGroupHostList from './InventoryGroupHostList';

function InventoryGroupHosts({ inventoryGroup }) {
  return (
    <Routes>
      <Route
        path="/inventories/inventory/:id/groups/:groupId/nested_hosts/add"
        element={<InventoryGroupHostAdd inventoryGroup={inventoryGroup} />}
      />
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_hosts"
        element={<InventoryGroupHostList />}
      />
    </Routes>
  );
}

export default InventoryGroupHosts;
