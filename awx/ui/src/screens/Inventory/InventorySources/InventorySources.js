import React from 'react';
import { Routes, Route } from 'react-router';
import { Config } from 'contexts/Config';
import InventorySource from '../InventorySource';
import InventorySourceAdd from '../InventorySourceAdd';
import InventorySourceList from './InventorySourceList';

function InventorySources({ inventory, setBreadcrumb }) {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventorySourceAdd inventory={inventory} />}
      />
      {/* /* so the nested <InventorySource> route tree can match */}
      <Route
        path=":sourceId/*"
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
        index
        element={<InventorySourceList />}
      />
    </Routes>
  );
}

export default InventorySources;
