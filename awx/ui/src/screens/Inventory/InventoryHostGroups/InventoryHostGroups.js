import React from 'react';

import { Routes, Route } from 'routerCompat';

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
