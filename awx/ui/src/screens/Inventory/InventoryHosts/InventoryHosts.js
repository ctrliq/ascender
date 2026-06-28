import React from 'react';
import { Routes, Route } from 'react-router';

import InventoryHost from '../InventoryHost';
import InventoryHostAdd from '../InventoryHostAdd';
import InventoryHostList from './InventoryHostList';

function InventoryHosts({ setBreadcrumb, inventory }) {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventoryHostAdd inventory={inventory} />}
      />
      {/* /* so the nested <InventoryHost> route tree can match */}
      <Route
        path=":hostId/*"
        element={
          <InventoryHost setBreadcrumb={setBreadcrumb} inventory={inventory} />
        }
      />
      <Route
        index
        element={<InventoryHostList />}
      />
    </Routes>
  );
}

export default InventoryHosts;
