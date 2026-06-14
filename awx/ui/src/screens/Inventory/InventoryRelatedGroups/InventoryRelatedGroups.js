import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import InventoryRelatedGroupAdd from '../InventoryRelatedGroupAdd';

function InventoryRelatedGroups() {
  return (
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/add"
        element={<InventoryRelatedGroupAdd />}
      />
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups"
        element={<InventoryRelatedGroupList />}
      />
    </Routes>
  );
}
export default InventoryRelatedGroups;
