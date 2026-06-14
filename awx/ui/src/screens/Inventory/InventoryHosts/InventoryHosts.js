import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';

import InventoryHost from '../InventoryHost';
import InventoryHostAdd from '../InventoryHostAdd';
import InventoryHostList from './InventoryHostList';

function InventoryHosts({ setBreadcrumb, inventory }) {
  return (
    <Routes>
      <Route
        path="/inventories/inventory/:id/hosts/add"
        element={<InventoryHostAdd inventory={inventory} />}
      />
      {/* /* so the nested <InventoryHost> route tree can match */}
      <Route
        path="/inventories/inventory/:id/hosts/:hostId/*"
        element={
          <InventoryHost setBreadcrumb={setBreadcrumb} inventory={inventory} />
        }
      />
      <Route
        path="/inventories/inventory/:id/hosts"
        element={<InventoryHostList />}
      />
    </Routes>
  );
}

export default InventoryHosts;
