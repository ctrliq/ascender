import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { Config } from 'contexts/Config';
import InventorySource from '../InventorySource';
import InventorySourceAdd from '../InventorySourceAdd';
import InventorySourceList from './InventorySourceList';

function InventorySources({ inventory, setBreadcrumb }) {
  return (
    <Routes>
      <Route
        path="/inventories/inventory/:id/sources/add"
        element={<InventorySourceAdd inventory={inventory} />}
      />
      {/* /* so the nested <InventorySource> route tree can match */}
      <Route
        path="/inventories/inventory/:id/sources/:sourceId/*"
        element={
          <Config>
            {({ me }) => (
              <InventorySource
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
                me={me || {}}
              />
            )}
          </Config>
        }
      />
      <Route
        path="/inventories/:inventoryType/:id/sources"
        element={<InventorySourceList />}
      />
    </Routes>
  );
}

export default InventorySources;
