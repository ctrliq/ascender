import React from 'react';
import { Routes, Route } from 'routerCompat';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import InventoryRelatedGroupAdd from '../InventoryRelatedGroupAdd';

function InventoryRelatedGroups() {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventoryRelatedGroupAdd />}
      />
      <Route
        index
        element={<InventoryRelatedGroupList />}
      />
    </Routes>
  );
}
export default InventoryRelatedGroups;
