import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { Inventory } from 'types';
import AdvancedInventoryHostList from './AdvancedInventoryHostList';
import AdvancedInventoryHost from '../AdvancedInventoryHost';

function AdvancedInventoryHosts({ inventory, setBreadcrumb }) {
  return (
    <Routes>
      {/* /* so the nested <AdvancedInventoryHost> route tree can match */}
      <Route
        path="/inventories/:inventoryType/:id/hosts/:hostId/*"
        element={
          <AdvancedInventoryHost
            setBreadcrumb={setBreadcrumb}
            inventory={inventory}
          />
        }
      />
      <Route
        path="/inventories/:inventoryType/:id/hosts"
        element={<AdvancedInventoryHostList inventory={inventory} />}
      />
    </Routes>
  );
}

AdvancedInventoryHosts.propTypes = {
  inventory: Inventory.isRequired,
};

export default AdvancedInventoryHosts;
