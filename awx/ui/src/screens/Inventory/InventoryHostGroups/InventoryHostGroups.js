import React from 'react';

import { Routes, Route } from 'react-router-dom-v5-compat';

import InventoryHostGroupsList from './InventoryHostGroupsList';

function InventoryHostGroups() {
  return (
    <Routes>
      <Route
        index
        element={<InventoryHostGroupsList />}
      />
    </Routes>
  );
}

export { InventoryHostGroups as _InventoryHostGroups };
export default InventoryHostGroups;
